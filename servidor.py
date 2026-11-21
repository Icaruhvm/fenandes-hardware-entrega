# Fernandes Hardware — site da bancada e proxy do Bling.
# Sem pacotes extras: o iniciar.bat sobe este arquivo com o Python do Windows.
# O token fica cifrado neste usuário (DPAPI), em configuracoes/bling_tokens.dpapi.
# O navegador nunca recebe o access token.

import json
import os
import secrets
import socket
import sys
import threading
import time
from base64 import b64encode
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

RAIZ = Path(__file__).resolve().parent
PASTA_CONFIG = RAIZ / "configuracoes"
ARQUIVO_TOKENS = PASTA_CONFIG / "bling_tokens.dpapi"
BLING_API = "https://api.bling.com.br/Api/v3"
BLING_AUTH = "https://www.bling.com.br/Api/v3/oauth/authorize"
PORTA = int(os.environ.get("FH_PORT", "8080"))
LIMITE_CORPO = 2_000_000
ESTADO_SEGUNDOS = 600

_estados = {}
_trava_estado = threading.Lock()
_trava_token = threading.Lock()

TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}


def ler_env(caminho):
    dados = {}
    if not caminho.is_file():
        return dados
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        texto = linha.strip()
        if not texto or texto.startswith("#") or "=" not in texto:
            continue
        chave, valor = texto.split("=", 1)
        dados[chave.strip()] = valor.strip().strip('"').strip("'")
    return dados


def configuracao():
    arquivo = ler_env(PASTA_CONFIG / ".env")

    def pegar(nome, padrao=""):
        return (os.environ.get(nome) or arquivo.get(nome) or padrao).strip()

    return {
        "client_id": pegar("BLING_CLIENT_ID"),
        "client_secret": pegar("BLING_CLIENT_SECRET"),
        "redirect_uri": pegar(
            "BLING_REDIRECT_URI",
            "http://127.0.0.1:%s/api/bling/callback" % PORTA,
        ),
    }


def agora_utc():
    return datetime.now(timezone.utc)


def iso_daqui(segundos):
    return (agora_utc() + timedelta(seconds=segundos)).isoformat()


def token_fresco(tokens):
    bruto = tokens.get("expires_at") if tokens else None
    if not bruto:
        return False
    try:
        expira = datetime.fromisoformat(bruto)
    except ValueError:
        return False
    if expira.tzinfo is None:
        expira = expira.replace(tzinfo=timezone.utc)
    return expira - agora_utc() > timedelta(seconds=90)


def _apis_dpapi():
    import ctypes
    from ctypes import wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [
            ("cbData", wintypes.DWORD),
            ("pbData", ctypes.POINTER(ctypes.c_byte)),
        ]

    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    crypt32.CryptProtectData.argtypes = [
        ctypes.POINTER(DATA_BLOB), wintypes.LPCWSTR, ctypes.c_void_p,
        ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(DATA_BLOB),
    ]
    crypt32.CryptProtectData.restype = wintypes.BOOL
    crypt32.CryptUnprotectData.argtypes = [
        ctypes.POINTER(DATA_BLOB), ctypes.c_void_p, ctypes.c_void_p,
        ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(DATA_BLOB),
    ]
    crypt32.CryptUnprotectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    return ctypes, DATA_BLOB, crypt32, kernel32


def _blob_entrada(dados, data_blob, ctypes):
    buffer = ctypes.create_string_buffer(dados)
    blob = data_blob(len(dados), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    return blob, buffer


def proteger(dados):
    import ctypes

    ctypes_mod, data_blob, crypt32, kernel32 = _apis_dpapi()
    entrada, buffer = _blob_entrada(dados, data_blob, ctypes_mod)
    saida = data_blob()
    if not crypt32.CryptProtectData(
        ctypes_mod.byref(entrada),
        "Fernandes Hardware - Bling",
        None, None, None, 0,
        ctypes_mod.byref(saida),
    ):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes_mod.string_at(saida.pbData, saida.cbData)
    finally:
        kernel32.LocalFree(saida.pbData)
        del buffer


def desproteger(dados):
    import ctypes

    ctypes_mod, data_blob, crypt32, kernel32 = _apis_dpapi()
    entrada, buffer = _blob_entrada(dados, data_blob, ctypes_mod)
    saida = data_blob()
    if not crypt32.CryptUnprotectData(
        ctypes_mod.byref(entrada), None, None, None, None, 0, ctypes_mod.byref(saida)
    ):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes_mod.string_at(saida.pbData, saida.cbData)
    finally:
        kernel32.LocalFree(saida.pbData)
        del buffer


def salvar_tokens(tokens):
    PASTA_CONFIG.mkdir(parents=True, exist_ok=True)
    conteudo = json.dumps(tokens, ensure_ascii=False).encode("utf-8")
    cifrado = proteger(conteudo)
    temporario = ARQUIVO_TOKENS.with_suffix(".tmp")
    try:
        temporario.write_bytes(cifrado)
        temporario.replace(ARQUIVO_TOKENS)
    finally:
        if temporario.exists() and temporario != ARQUIVO_TOKENS:
            try:
                temporario.unlink()
            except OSError:
                pass


def carregar_tokens():
    if not ARQUIVO_TOKENS.is_file():
        return None
    try:
        puro = desproteger(ARQUIVO_TOKENS.read_bytes())
        dados = json.loads(puro.decode("utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(dados, dict):
        return None
    return dados


def pedir_token(corpo):
    cfg = configuracao()
    if not cfg["client_id"] or not cfg["client_secret"]:
        raise RuntimeError("credenciais ausentes")
    basico = b64encode(
        (cfg["client_id"] + ":" + cfg["client_secret"]).encode("utf-8")
    ).decode("ascii")
    req = Request(
        BLING_API + "/oauth/token",
        data=urlencode(corpo).encode("utf-8"),
        method="POST",
    )
    req.add_header("Authorization", "Basic " + basico)
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Accept", "1.0")
    req.add_header("enable-jwt", "1")
    try:
        with urlopen(req, timeout=20) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ValueError):
        raise RuntimeError("falha ao falar com o Bling")
    access = dados.get("access_token")
    refresh = dados.get("refresh_token")
    try:
        expira = int(dados.get("expires_in"))
    except (TypeError, ValueError):
        expira = 0
    if not access or not refresh or expira <= 0:
        raise RuntimeError("resposta do Bling sem token")
    tokens = {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": dados.get("token_type") or "Bearer",
        "expires_in": expira,
        "expires_at": iso_daqui(expira),
        "scope": dados.get("scope") or "",
        "atualizado_em": agora_utc().isoformat(),
    }
    salvar_tokens(tokens)
    return tokens


def access_token(forcar=False):
    with _trava_token:
        tokens = carregar_tokens()
        if not tokens or not tokens.get("access_token"):
            return None
        if not forcar and token_fresco(tokens):
            return tokens["access_token"]
        refresh = tokens.get("refresh_token")
        if not refresh:
            return None
        try:
            novo = pedir_token({
                "grant_type": "refresh_token",
                "refresh_token": refresh,
            })
        except RuntimeError:
            return None
        return novo.get("access_token")


def novo_estado():
    estado = secrets.token_urlsafe(32)
    limite = time.monotonic()
    with _trava_estado:
        vencidos = [chave for chave, criado in _estados.items() if limite - criado > ESTADO_SEGUNDOS]
        for chave in vencidos:
            del _estados[chave]
        _estados[estado] = limite
    return estado


def validar_estado(estado):
    if not estado:
        return False
    with _trava_estado:
        criado = _estados.pop(estado, None)
    if criado is None:
        return False
    return time.monotonic() - criado <= ESTADO_SEGUNDOS


def url_autorizacao(estado):
    cfg = configuracao()
    return BLING_AUTH + "?" + urlencode({
        "response_type": "code",
        "client_id": cfg["client_id"],
        "state": estado,
    })


def alvo_bling(caminho):
    parsed = urlparse(caminho)
    if parsed.path != "/bling" and not parsed.path.startswith("/bling/"):
        return None
    resto = parsed.path[len("/bling"):] or "/"
    if not resto.startswith("/"):
        resto = "/" + resto
    if resto.startswith("//") or "\\" in resto:
        return None
    consulta = ("?" + parsed.query) if parsed.query else ""
    return BLING_API + resto + consulta


def chamar_bling(method, url, token, corpo, content_type):
    req = Request(url, data=corpo if corpo else None, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/json")
    if corpo and content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urlopen(req, timeout=20) as resp:
            tipo = resp.headers.get("Content-Type", "application/json")
            return resp.status, tipo, resp.read()
    except HTTPError as exc:
        tipo = exc.headers.get("Content-Type", "application/json") if exc.headers else "application/json"
        try:
            corpo_erro = exc.read()
        except Exception:
            corpo_erro = b""
        return exc.code, tipo, corpo_erro
    except (URLError, TimeoutError, OSError):
        msg = json.dumps(
            {"error": {"message": "O Bling não respondeu. Tente de novo em instantes."}},
            ensure_ascii=False,
        ).encode("utf-8")
        return 502, "application/json; charset=utf-8", msg


def arquivo_publico(caminho):
    parsed = urlparse(caminho)
    rel = parsed.path.lstrip("/") or "index.html"
    candidato = Path(rel)
    if candidato.is_absolute():
        return None
    partes = candidato.parts
    if any(parte in ("..", ".git", "configuracoes") or parte.startswith(".") for parte in partes):
        return None
    alvo = (RAIZ / candidato).resolve()
    try:
        alvo.relative_to(RAIZ)
    except ValueError:
        return None
    if not alvo.is_file():
        return None
    return alvo


def ip_da_rede():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return ""


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        caminho = urlparse(self.path).path
        if caminho == "/api/bling/callback":
            sys.stderr.write("%s - OAuth callback\n" % self.address_string())
            return
        sys.stderr.write("%s - %s %s\n" % (self.address_string(), self.command, caminho))

    def cookies(self):
        saida = {}
        for parte in (self.headers.get("Cookie") or "").split(";"):
            if "=" not in parte:
                continue
            chave, valor = parte.split("=", 1)
            saida[chave.strip()] = valor.strip()
        return saida

    def enviar(self, status, corpo, tipo, extra=None):
        if isinstance(corpo, str):
            corpo = corpo.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for chave, valor in extra or []:
            self.send_header(chave, valor)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corpo)

    def json(self, status, dados):
        self.enviar(status, json.dumps(dados, ensure_ascii=False), "application/json; charset=utf-8")

    def html(self, status, titulo, texto):
        def escapar(valor):
            return (
                str(valor)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
            )

        pagina = """<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title></head>
<body style="margin:0;font-family:Segoe UI,sans-serif;background:#F8FAFC;color:#1E293B">
<main style="max-width:36rem;margin:3rem auto;padding:1.5rem">
<h1 style="font-size:1.25rem">%s</h1>
<p style="line-height:1.5">%s</p>
<p><a href="/" style="color:#2563EB">Voltar para a bancada</a></p>
</main></body></html>""" % (escapar(titulo), escapar(titulo), escapar(texto))
        self.enviar(status, pagina, "text/html; charset=utf-8")

    def redirecionar(self, url, cookie=None):
        extra = [("Location", url)]
        if cookie:
            extra.append(("Set-Cookie", cookie))
        self.enviar(302, b"", "text/plain; charset=utf-8", extra)

    def ler_corpo(self):
        try:
            tamanho = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            tamanho = 0
        if tamanho < 0 or tamanho > LIMITE_CORPO:
            return None
        if tamanho == 0:
            return b""
        return self.rfile.read(tamanho)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        caminho = urlparse(self.path).path
        if caminho == "/bling" or caminho.startswith("/bling/"):
            self.proxy()
            return
        if caminho == "/api/bling/autorizar":
            self.autorizar()
            return
        if caminho == "/api/bling/callback":
            self.callback()
            return
        if caminho == "/api/bling/status":
            self.status_bling()
            return
        self.estatico()

    def do_POST(self):
        self.mutacao()

    do_PUT = do_PATCH = do_DELETE = do_POST

    def mutacao(self):
        caminho = urlparse(self.path).path
        if caminho == "/bling" or caminho.startswith("/bling/"):
            self.proxy()
            return
        self.json(404, {"error": {"message": "Caminho não encontrado."}})

    def autorizar(self):
        cfg = configuracao()
        if not cfg["client_id"] or not cfg["client_secret"]:
            self.html(
                200,
                "Falta configurar o Bling",
                "Crie o arquivo configuracoes/.env nesta pasta com BLING_CLIENT_ID e BLING_CLIENT_SECRET. "
                "No aplicativo do Bling, cadastre o retorno "
                + cfg["redirect_uri"]
                + ". O modelo está em configuracoes/.env.example. Reinicie o iniciar.bat depois de salvar o arquivo.",
            )
            return
        estado = novo_estado()
        cookie = "fh_oauth_state=%s; HttpOnly; SameSite=Lax; Path=/; Max-Age=%s" % (estado, ESTADO_SEGUNDOS)
        self.redirecionar(url_autorizacao(estado), cookie)

    def callback(self):
        qs = parse_qs(urlparse(self.path).query)
        code = (qs.get("code") or [""])[0]
        state = (qs.get("state") or [""])[0]
        erro = (qs.get("error") or [""])[0]
        cookie = self.cookies().get("fh_oauth_state", "")
        limpar = "fh_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"

        def falha(mensagem):
            destino = "/?bling=erro&" + urlencode({"msg": mensagem})
            self.redirecionar(destino, limpar)

        if erro:
            falha("A autorização foi recusada no Bling.")
            return
        if not code or not state or not cookie:
            falha("O retorno do Bling chegou incompleto. Tente conectar de novo.")
            return
        if not secrets.compare_digest(cookie, state) or not validar_estado(state):
            falha("A sessão de autorização expirou. Tente conectar de novo.")
            return
        try:
            pedir_token({"grant_type": "authorization_code", "code": code})
        except RuntimeError:
            falha("Não foi possível concluir a autorização com o Bling.")
            return
        self.redirecionar("/?bling=ok", limpar)

    def status_bling(self):
        tokens = carregar_tokens()
        conectado = bool(tokens and tokens.get("access_token"))
        self.json(200, {
            "conectado": conectado and bool(access_token()) if conectado else False,
            "expira_em": (tokens or {}).get("expires_at") or None,
        })

    def proxy(self):
        url = alvo_bling(self.path)
        if not url:
            self.json(404, {"error": {"message": "Caminho do Bling inválido."}})
            return
        corpo = b""
        if self.command not in ("GET", "HEAD"):
            corpo = self.ler_corpo()
            if corpo is None:
                self.json(413, {"error": {"message": "Envio grande demais."}})
                return
        token = access_token()
        if not token:
            self.json(401, {"error": {"message": "Bling não autorizado neste computador. Use Conectar ao Bling."}})
            return
        tipo = self.headers.get("Content-Type")
        status, content_type, resposta = chamar_bling(self.command, url, token, corpo, tipo)
        if status == 401:
            token = access_token(forcar=True)
            if token:
                status, content_type, resposta = chamar_bling(self.command, url, token, corpo, tipo)
            else:
                self.json(401, {"error": {"message": "A sessão do Bling expirou. Conecte de novo."}})
                return
        self.enviar(status, resposta or b"", content_type or "application/json")

    def estatico(self):
        alvo = arquivo_publico(self.path)
        if not alvo:
            self.json(404, {"error": {"message": "Arquivo não encontrado."}})
            return
        tipo = TIPOS.get(alvo.suffix.lower(), "application/octet-stream")
        dados = alvo.read_bytes()
        cache = "no-cache" if alvo.suffix.lower() in (".html", ".js") and "vendor" not in alvo.parts else "public, max-age=86400"
        self.enviar(200, dados, tipo, [("Cache-Control", cache)])


def main():
    cfg = configuracao()
    ip = ip_da_rede()
    print("")
    print("Fernandes Hardware — Registros de Manutenção")
    print("Neste PC: http://127.0.0.1:%s" % PORTA)
    if ip and not ip.startswith("127."):
        print("No celular da bancada: http://%s:%s" % (ip, PORTA))
    print("Retorno para cadastrar no Bling: %s" % cfg["redirect_uri"])
    if not cfg["client_id"] or not cfg["client_secret"]:
        print("Bling ainda sem credenciais. O site abre, e o selo fica desconectado.")
        print("Preencha configuracoes\\.env e reinicie esta janela.")
    elif not carregar_tokens():
        print("Credenciais encontradas. No navegador, use Conectar ao Bling.")
    else:
        print("Token local encontrado. Se ainda valer, o selo fica verde.")
    print("Feche esta janela para encerrar.")
    print("")
    try:
        servidor = ThreadingHTTPServer(("0.0.0.0", PORTA), Handler)
    except OSError as exc:
        print("Não foi possível abrir a porta %s. %s" % (PORTA, exc.strerror or exc))
        return 1
    servidor.daemon_threads = True
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("Encerrado.")
    finally:
        servidor.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
