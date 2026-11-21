/* Fernandes Hardware — camada de serviço das Ordens de Serviço
   ----------------------------------------------------------------
   A lista mostra o que o Bling devolver pelo proxy local (servidor.py).
   As fotos do atendimento vêm do lançamento no Bling: anexos da ordem
   e imagens das peças e serviços (GET /produtos/{idProduto}).

   O navegador da bancada não guarda o token. O proxy em /bling acrescenta
   o Bearer. Com o site aberto por iniciar.bat, proxyBase é a mesma origem.
*/
(function (root) {
  function origemProxy() {
    try {
      if (typeof location !== "undefined" && location.protocol !== "file:" && location.origin) {
        return location.origin + "/bling";
      }
    } catch (err) {
      /* arquivo aberto direto: usa o servidor padrão da bancada */
    }
    return "http://127.0.0.1:8080/bling";
  }

  const CONFIG = {
    get proxyBase() {
      return origemProxy();
    },
    blingBase: "https://api.bling.com.br/Api/v3",
  };

  const TEST_FLAG = "fh.entrega.modoTeste";
  const STORAGE_TEST = "fh.entrega.registros.teste";
  const STORAGE_REAL = "fh.entrega.registros.real";
  const STORAGE_OLD = "fh.os.registros.v2";
  const LEGACY_KEY = "fh.os.registros.v1";
  const DB_STORE = "fotos";
  const OS_FALSAS = { "18302": true, "18420": true, "18455": true, "18501": true, "18610": true, "18644": true };

  function emTeste() {
    try {
      const valor = localStorage.getItem(TEST_FLAG);
      if (valor === null) return true;
      return valor === "1";
    } catch (err) {
      return true;
    }
  }

  function storageKey() {
    return emTeste() ? STORAGE_TEST : STORAGE_REAL;
  }

  function backupKey() {
    return emTeste() ? "fh.entrega.backup.teste" : "fh.entrega.backup.real";
  }

  const HARDWARE = ["Computador", "Notebook", "AIO", "Placa de Vídeo", "Outros"];
  const MANUTENCOES = ["Preventiva", "Corretiva", "Upgrade", "Diagnóstico"];
  const STATUS = ["Pendente", "Em Andamento", "Concluída"];

  function digits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function todayISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function mapSituacao(nome) {
    const n = String(nome || "").toLowerCase();
    if (n.includes("conclu") || n.includes("final") || n.includes("entreg")) return "Concluída";
    if (n.includes("andamento") || n.includes("execu")) return "Em Andamento";
    return "Pendente";
  }

  /* Ajuste os nomes das propriedades quando o JSON real da conta chegar. */
  function mapBlingOrdem(item) {
    const contato = item.contato || {};
    const numero = String(item.numero != null ? item.numero : item.id);
    return {
      id: "os-" + numero,
      blingId: item.id,
      numero: numero,
      hardware: item.equipamento || item.hardware || "Outros",
      clienteNome: contato.nome || item.clienteNome || "",
      clienteCpf: contato.numeroDocumento || contato.cpf || "",
      telefone: contato.celular || contato.telefone || "",
      dataAbertura: String(item.data || item.dataAbertura || "").slice(0, 10),
      dataEntrada: String(item.dataEntrada || item.data || "").slice(0, 10),
      dataSaida: item.dataSaida ? String(item.dataSaida).slice(0, 10) : "",
      tipoManutencao: item.tipoManutencao || "Corretiva",
      tecnico: (item.tecnico && item.tecnico.nome) || (item.vendedor && item.vendedor.nome) || "",
      descricao: item.observacoes || item.descricaoProblema || item.descricao || "",
      status: mapSituacao(item.situacao && item.situacao.nome ? item.situacao.nome : item.situacao),
      fotos: [],
    };
  }

  function toBlingPayload(os) {
    return {
      data: os.dataEntrada || os.dataAbertura || todayISO(),
      observacoes: os.descricao || "",
      contato: {
        nome: os.clienteNome || "",
        numeroDocumento: os.clienteCpf || "",
        celular: os.telefone || "",
      },
    };
  }

  function filterOrdens(rows, q, status) {
    const text = String(q || "").trim().toLowerCase();
    const needle = digits(q);
    return rows.filter((os) => {
      if (status && os.status !== status) return false;
      if (!text) return true;
      const cpf = digits(os.clienteCpf);
      const numero = String(os.numero || "").toLowerCase();
      if (numero.includes(text)) return true;
      if (needle && (numero.includes(needle) || (cpf && cpf.includes(needle)))) return true;
      return false;
    });
  }

  const memoryFotos = new Map();
  let idbOk = typeof indexedDB !== "undefined";
  let dbPromise = null;
  let dbNameOpen = "";

  function dbName() {
    return emTeste() ? "fh-entrega-fotos-teste" : "fh-entrega-fotos-real";
  }

  function svgPhoto(label, tone) {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">' +
      '<rect width="100%" height="100%" fill="' + tone + '"/>' +
      '<rect x="48" y="48" width="704" height="704" rx="28" fill="none" stroke="white" stroke-opacity="0.35" stroke-width="4"/>' +
      '<text x="50%" y="46%" text-anchor="middle" fill="white" font-family="Segoe UI,sans-serif" font-size="36" font-weight="700">' +
      label +
      "</text>" +
      '<text x="50%" y="56%" text-anchor="middle" fill="white" font-family="Segoe UI,sans-serif" font-size="22" opacity="0.85">Fernandes Hardware</text>' +
      "</svg>";
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  const SEED = [
    {
      id: "os-19012",
      numero: "19012",
      hardware: "Notebook",
      clienteNome: "Ana Beatriz Lopes",
      clienteCpf: "529.184.330-63",
      telefone: "(27) 98840-2210",
      dataAbertura: "2026-11-03",
      dataEntrada: "2026-11-03",
      dataSaida: "",
      tipoManutencao: "Corretiva",
      tecnico: "Leonardo Penkaitis",
      descricao: "Notebook Lenovo IdeaPad não inicia depois de uma queda. A tampa está trincada e o conector de carga ficou folgado.",
      status: "Em Andamento",
      fotos: [
        { id: "e19012a", categoria: "entrada", uploadedAt: "2026-11-03T09:18:00", nomeArquivo: "entrada-tampa.jpg", origem: "local", dataUrl: svgPhoto("Entrada · tampa", "#334155") },
        { id: "e19012b", categoria: "entrada", uploadedAt: "2026-11-03T09:21:00", nomeArquivo: "entrada-carga.jpg", origem: "local", dataUrl: svgPhoto("Entrada · carga", "#1e3a5f") },
      ],
    },
    {
      id: "os-19048",
      numero: "19048",
      hardware: "Placa de Vídeo",
      clienteNome: "Diego Nascimento",
      clienteCpf: "074.661.928-66",
      telefone: "(27) 99755-1042",
      dataAbertura: "2026-11-10",
      dataEntrada: "2026-11-10",
      dataSaida: "",
      tipoManutencao: "Diagnóstico",
      tecnico: "Bryan Alves",
      descricao: "RTX 4060 com tela preta sob carga. O conector de energia não apresenta oxidação visível.",
      status: "Pendente",
      fotos: [
        { id: "e19048a", categoria: "entrada", uploadedAt: "2026-11-10T14:06:00", nomeArquivo: "entrada-gpu.jpg", origem: "local", dataUrl: svgPhoto("Entrada · GPU", "#3f3f46") },
      ],
    },
    {
      id: "os-18990",
      numero: "18990",
      hardware: "Computador",
      clienteNome: "Papelaria Central LTDA",
      clienteCpf: "33.908.441/0001-45",
      telefone: "(27) 3321-4480",
      dataAbertura: "2026-10-20",
      dataEntrada: "2026-10-20",
      dataSaida: "2026-10-28",
      tipoManutencao: "Upgrade",
      tecnico: "Mateus Scardua",
      descricao: "Troca do HD por SSD de 1 TB, mais 8 GB de memória e limpeza do gabinete do caixa. Sistema conferido com o cliente.",
      status: "Concluída",
      fotos: [
        { id: "e18990a", categoria: "entrada", uploadedAt: "2026-10-20T11:02:00", nomeArquivo: "entrada-gabinete.jpg", origem: "local", dataUrl: svgPhoto("Entrada · gabinete", "#44403c") },
        { id: "s18990a", categoria: "saida", uploadedAt: "2026-10-28T16:40:00", nomeArquivo: "saida-bancada.jpg", origem: "local", dataUrl: svgPhoto("Saída · bancada ok", "#14532d") },
      ],
    },
    {
      id: "os-19073",
      numero: "19073",
      hardware: "AIO",
      clienteNome: "Camila Rocha",
      clienteCpf: "861.220.475-54",
      telefone: "(27) 98162-7730",
      dataAbertura: "2026-11-16",
      dataEntrada: "2026-11-16",
      dataSaida: "",
      tipoManutencao: "Preventiva",
      tecnico: "Ícaro Martins",
      descricao: "Computador all-in-one com superaquecimento. Limpeza do dissipador e troca da pasta térmica ainda em andamento.",
      status: "Em Andamento",
      fotos: [],
    },
  ];

  function nextNumero(rows) {
    let max = 19073;
    rows.forEach((os) => {
      const n = Number(os.numero);
      if (!Number.isNaN(n) && n > max) max = n;
    });
    return String(max + 1);
  }

  function openDb() {
    const name = dbName();
    if (dbPromise && dbNameOpen === name) return dbPromise;
    dbNameOpen = name;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
    return dbPromise;
  }

  const PhotoStore = {
    async put(id, dataUrl) {
      memoryFotos.set(id, dataUrl);
      if (!idbOk) return;
      try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, "readwrite");
          tx.objectStore(DB_STORE).put(dataUrl, id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        idbOk = false;
      }
    },
    async get(id) {
      if (memoryFotos.has(id)) return memoryFotos.get(id);
      if (!idbOk) return null;
      try {
        const db = await openDb();
        const value = await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, "readonly");
          const req = tx.objectStore(DB_STORE).get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });
        if (value) memoryFotos.set(id, value);
        return value;
      } catch (err) {
        idbOk = false;
        return null;
      }
    },
    async remove(id) {
      memoryFotos.delete(id);
      if (!idbOk) return;
      try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, "readwrite");
          tx.objectStore(DB_STORE).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        idbOk = false;
      }
    },
    async clear() {
      memoryFotos.clear();
      if (!idbOk) return;
      try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, "readwrite");
          tx.objectStore(DB_STORE).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        idbOk = false;
      }
    },
  };

  function ordemFalsa(os) {
    if (!os) return false;
    const numero = String(os.numero || "");
    const id = String(os.id || "").replace(/^os-/, "");
    return !!(OS_FALSAS[numero] || OS_FALSAS[id]);
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function saveStore(rows) {
    localStorage.setItem(storageKey(), JSON.stringify(rows));
  }

  function fotoMeta(foto) {
    const meta = {
      id: foto.id,
      categoria: foto.categoria,
      uploadedAt: foto.uploadedAt,
      nomeArquivo: foto.nomeArquivo || foto.id + ".jpg",
      origem: foto.origem || "local",
      legenda: foto.legenda || "",
    };
    if ((foto.origem === "bling" || foto.origem === "demo" || !idbOk) && foto.dataUrl) meta.dataUrl = foto.dataUrl;
    return meta;
  }

  async function storeFotos(fotos) {
    const metas = [];
    for (let i = 0; i < (fotos || []).length; i += 1) {
      const foto = fotos[i];
      if (foto.dataUrl) await PhotoStore.put(foto.id, foto.dataUrl);
      metas.push(fotoMeta(foto));
    }
    return metas;
  }

  async function persistRows(rows) {
    const stored = [];
    for (let i = 0; i < rows.length; i += 1) {
      const os = rows[i];
      stored.push(Object.assign({}, os, { fotos: await storeFotos(os.fotos) }));
    }
    saveStore(stored);
    return stored;
  }

  async function hydrate(os) {
    const fotos = [];
    const list = os.fotos || [];
    for (let i = 0; i < list.length; i += 1) {
      const foto = list[i];
      const dataUrl = foto.dataUrl || (foto.origem === "bling" ? "" : await PhotoStore.get(foto.id)) || "";
      fotos.push(Object.assign({}, foto, { dataUrl: dataUrl }));
    }
    return Object.assign({}, os, { fotos: fotos });
  }

  function overlay(remote, localRows) {
    const prev = localRows.find((o) => (remote.blingId && o.blingId === remote.blingId) || o.numero === remote.numero);
    if (!prev) return remote;
    return Object.assign({}, remote, {
      id: prev.id || remote.id,
      hardware: prev.hardware || remote.hardware,
      tipoManutencao: prev.tipoManutencao || remote.tipoManutencao,
      tecnico: prev.tecnico || remote.tecnico,
      descricao: prev.descricao || remote.descricao,
      dataEntrada: prev.dataEntrada || remote.dataEntrada,
      dataSaida: prev.dataSaida || remote.dataSaida,
      status: prev.status || remote.status,
      fotos: prev.fotos && prev.fotos.length ? prev.fotos : remote.fotos || [],
      fotosEm: prev.fotosEm || remote.fotosEm || 0,
    });
  }

  function assertOpen(row, message) {
    if (row && row.status === "Concluída") {
      throw new Error(message || "OS concluída não pode ser alterada.");
    }
  }

  let readyPromise = null;

  function apagarBanco(nome) {
    if (typeof indexedDB === "undefined") return Promise.resolve();
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(nome);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }

  function resetDbCache() {
    dbPromise = null;
    dbNameOpen = "";
    memoryFotos.clear();
  }

  const DOC_DEMO_ANTIGO = {
    "529.184.330-61": "529.184.330-63",
    "074.661.928-00": "074.661.928-66",
    "33.908.441/0001-17": "33.908.441/0001-45",
    "861.220.475-19": "861.220.475-54",
  };

  async function init() {
    if (!emTeste()) return;
    if (!localStorage.getItem(STORAGE_TEST)) {
      await persistRows(JSON.parse(JSON.stringify(SEED)));
      return;
    }
    const rows = loadStore();
    let mudou = false;
    rows.forEach((os) => {
      const novo = DOC_DEMO_ANTIGO[os.clienteCpf];
      if (novo) {
        os.clienteCpf = novo;
        mudou = true;
      }
    });
    if (mudou) saveStore(rows);
  }

  function ready() {
    if (!readyPromise) readyPromise = init();
    return readyPromise;
  }

  let healthCache = null;

  async function probeBling() {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => {
      if (ctrl) ctrl.abort();
    }, 2500);
    try {
      /* BLING: GET /ordens/servico?pagina=1&limite=1
         200 significa que o token do proxy ainda é válido. */
      const res = await fetch(CONFIG.proxyBase + "/ordens/servico?pagina=1&limite=1", {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!res.ok) return { ok: false, label: "Bling API: desconectado" };
      return { ok: true, label: "Bling API: Conectado" };
    } catch (err) {
      return { ok: false, label: "Bling API: desconectado" };
    } finally {
      clearTimeout(timer);
    }
  }

  async function requestBling(method, path, body) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => {
      if (ctrl) ctrl.abort();
    }, 8000);
    let res;
    try {
      res = await fetch(CONFIG.proxyBase + path, {
        method: method,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl ? ctrl.signal : undefined,
      });
    } finally {
      clearTimeout(timer);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const info = json && json.error ? json.error.message || json.error.description : "";
      throw new Error(info || "Bling respondeu HTTP " + res.status);
    }
    return json;
  }

  let ultimoRequest = 0;
  let filaRede = Promise.resolve();
  let ultimaLista = [];

  function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function requestEspacado(method, path, body) {
    const run = filaRede.then(async () => {
      const falta = 350 - (Date.now() - ultimoRequest);
      if (falta > 0) await esperar(falta);
      ultimoRequest = Date.now();
      return requestBling(method, path, body);
    });
    filaRede = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  function linkImagem(valor) {
    if (typeof valor !== "string") return "";
    const url = valor.trim();
    if (!/^https?:\/\//i.test(url)) return "";
    return url;
  }

  function arquivoDeImagem(url, nome) {
    const alvo = (String(nome || "") + " " + url).toLowerCase().split("?")[0];
    return !/\.(pdf|xml|docx?|xlsx?|zip|txt|csv)$/.test(alvo);
  }

  function idFotoBling(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i += 1) hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
    return "bling-" + hash.toString(36);
  }

  function novaFotoBling(url, categoria, nome, legenda) {
    return {
      id: idFotoBling(url + "|" + categoria),
      categoria: categoria,
      uploadedAt: "",
      nomeArquivo: nome || "imagem-bling",
      legenda: legenda || "",
      origem: "bling",
      dataUrl: url,
    };
  }

  function categoriaPeloNome(nome) {
    const texto = String(nome || "").toLowerCase();
    if (texto.includes("saida") || texto.includes("saída") || texto.includes("entrega")) return "saida";
    return "entrada";
  }

  function fotosDeLista(lista, categoriaPadrao, legendaPadrao) {
    const fotos = [];
    (lista || []).forEach((item) => {
      if (!item) return;
      const nome = item.nome || item.nomeArquivo || item.descricao || legendaPadrao || "";
      const url = linkImagem(item.link || item.url || item.linkMiniatura || item.imagemURL || (typeof item === "string" ? item : ""));
      if (!url || !arquivoDeImagem(url, nome)) return;
      fotos.push(novaFotoBling(url, categoriaPadrao || categoriaPeloNome(nome), nome, legendaPadrao || nome));
    });
    return fotos;
  }

  function fotosDoProduto(produto, categoria, legenda) {
    const fotos = [];
    const vistos = new Set();
    function add(url, nome) {
      const link = linkImagem(url);
      if (!link || vistos.has(link) || !arquivoDeImagem(link, nome)) return;
      vistos.add(link);
      fotos.push(novaFotoBling(link, categoria, nome || legenda, legenda));
    }
    if (!produto) return fotos;
    add(produto.imagemURL, legenda);
    const imagens = produto.midia && produto.midia.imagens;
    if (imagens) {
      (imagens.externas || []).forEach((img) => add(img && img.link, legenda));
      (imagens.internas || []).forEach((img) => add(img && (img.link || img.linkMiniatura), legenda));
    }
    return fotos;
  }

  function itensComProduto(lista, categoria, papel) {
    const itens = [];
    (lista || []).forEach((item) => {
      const produto = item && item.produto;
      if (!produto || !produto.id) return;
      itens.push({
        id: produto.id,
        nome: produto.nome || "",
        categoria: categoria,
        papel: papel,
        embutido: produto.imagemURL || (produto.midia && produto.midia.imagens) ? produto : null,
      });
    });
    return itens;
  }

  /* BLING: imagens do lançamento.
     Anexos da OS, quando a conta devolver o campo.
     Imagens das peças e serviços: GET /produtos/{idProduto}
     em midia.imagens e imagemURL. */
  async function puxarImagensBling(detalhe) {
    const fotos = [];
    const vistos = new Set();
    function add(foto) {
      if (!foto || vistos.has(foto.dataUrl)) return;
      vistos.add(foto.dataUrl);
      fotos.push(foto);
    }
    fotosDeLista(detalhe.anexos, "", "Anexo da ordem").forEach(add);
    fotosDeLista(detalhe.imagens, "", "Imagem da ordem").forEach(add);
    fotosDeLista(detalhe.arquivos, "", "Arquivo da ordem").forEach(add);
    if (detalhe.midia && detalhe.midia.imagens) {
      fotosDoProduto({ midia: detalhe.midia }, "entrada", "Imagem da ordem").forEach(add);
    }

    const jobs = itensComProduto(detalhe.pecas, "entrada", "Peça").concat(
      itensComProduto(detalhe.servicos, "saida", "Serviço")
    );
    const feitos = new Set();
    const limite = Math.min(jobs.length, 8);
    for (let i = 0; i < limite; i += 1) {
      const job = jobs[i];
      const chave = job.categoria + ":" + job.id;
      if (feitos.has(chave)) continue;
      feitos.add(chave);
      let produto = job.embutido;
      try {
        const json = await requestEspacado("GET", "/produtos/" + encodeURIComponent(job.id));
        produto = (json && json.data) || produto;
      } catch (err) {
        /* Sem escopo de produtos, a OS segue sem essa imagem. */
      }
      if (!produto) continue;
      const nome = produto.nome || job.nome || job.papel;
      fotosDoProduto(produto, job.categoria, job.papel + ": " + nome).forEach(add);
    }
    return fotos;
  }

  const BlingApi = {
    config: CONFIG,

    modoTeste() {
      return emTeste();
    },

    definirModoTeste(ligado) {
      localStorage.setItem(TEST_FLAG, ligado ? "1" : "0");
      readyPromise = null;
      healthCache = null;
      resetDbCache();
    },

    async health() {
      if (emTeste()) return { ok: true, teste: true, label: "Modo de testes" };
      if (healthCache && Date.now() - healthCache.at < 15000) return healthCache.value;
      const value = Object.assign({ teste: false }, await probeBling());
      healthCache = { at: Date.now(), value: value };
      return value;
    },

    async listOrdens({ q = "", status = "" } = {}) {
      await ready();
      let rows;
      if (emTeste()) {
        rows = loadStore();
      } else {
      const saude = await this.health();
      if (!saude.ok) {
        rows = [];
      } else {
        /* BLING: GET /ordens/servico?pagina=1&limite=100
           A lista é só o que esta resposta devolver.
           CPF não vem na lista: busque o contato em
           GET /contatos?numeroDocumento= e cruze o id. */
        const json = await requestBling("GET", "/ordens/servico?pagina=1&limite=100");
        const local = loadStore().filter((os) => !ordemFalsa(os));
        rows = (json.data || []).map(mapBlingOrdem).map((remote) => overlay(remote, local));
      }
      }
      const listed = filterOrdens(rows, q, status).sort((a, b) => String(b.dataAbertura).localeCompare(String(a.dataAbertura)));
      const hydrated = [];
      for (let i = 0; i < listed.length; i += 1) hydrated.push(await hydrate(listed[i]));
      ultimaLista = hydrated;
      return hydrated;
    },

    async carregarImagens(id, force) {
      await ready();
      const row = loadStore().find((os) => os.id === id) || ultimaLista.find((os) => os.id === id);
      if (!row) throw new Error("Ordem de serviço não encontrada.");
      if (emTeste() || !row.blingId) return hydrate(row);
      if (!force && row.fotosEm && Date.now() - row.fotosEm < 10 * 60 * 1000) return hydrate(row);
      /* BLING: GET /ordens/servico/{idOrdemServico}
         e, para cada peça ou serviço, GET /produtos/{idProduto}. */
      const json = await requestEspacado("GET", "/ordens/servico/" + encodeURIComponent(row.blingId));
      const detalhe = json.data || {};
      const mapped = overlay(mapBlingOrdem(detalhe), [row]);
      const fotos = await puxarImagensBling(detalhe);
      mapped.fotos = fotos.map(fotoMeta);
      mapped.fotosEm = Date.now();
      mapped.id = row.id;
      const rows = loadStore();
      const idx = rows.findIndex((os) => os.id === row.id);
      if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], mapped);
      else rows.unshift(mapped);
      saveStore(rows);
      const pronta = await hydrate(idx >= 0 ? rows[idx] : rows[0]);
      const pos = ultimaLista.findIndex((os) => os.id === pronta.id);
      if (pos >= 0) ultimaLista[pos] = pronta;
      else ultimaLista.push(pronta);
      return pronta;
    },

    async getOrdem(id) {
      await ready();
      if (emTeste()) {
        const row = loadStore().find((os) => os.id === id);
        if (!row) throw new Error("Ordem de serviço não encontrada.");
        return hydrate(row);
      }
      return this.carregarImagens(id, false);
    },

    async saveOrdem(payload) {
      await ready();
      const rows = loadStore();
      if (emTeste()) {
        const fotos = await storeFotos(payload.fotos || []);
        if (!payload.id) {
          const numero = nextNumero(rows);
          const created = {
            id: "os-" + numero,
            numero: numero,
            hardware: payload.hardware,
            clienteNome: payload.clienteNome,
            clienteCpf: payload.clienteCpf,
            telefone: payload.telefone || "",
            dataAbertura: payload.dataEntrada || todayISO(),
            dataEntrada: payload.dataEntrada,
            dataSaida: payload.dataSaida || "",
            tipoManutencao: payload.tipoManutencao,
            tecnico: payload.tecnico,
            descricao: payload.descricao,
            status: payload.status,
            fotos: fotos,
          };
          rows.unshift(created);
          saveStore(rows);
          return hydrate(created);
        }
        const idxTeste = rows.findIndex((os) => os.id === payload.id);
        if (idxTeste < 0) throw new Error("OS inexistente.");
        assertOpen(rows[idxTeste], "OS concluída não pode ser alterada. O histórico fica preservado.");
        const anteriores = rows[idxTeste].fotos || [];
        const idsNovos = {};
        fotos.forEach((foto) => { idsNovos[foto.id] = true; });
        for (let i = 0; i < anteriores.length; i += 1) {
          if (anteriores[i].id && !idsNovos[anteriores[i].id]) await PhotoStore.remove(anteriores[i].id);
        }
        const nextTeste = Object.assign({}, rows[idxTeste], payload, {
          fotos: fotos,
          numero: rows[idxTeste].numero,
          id: rows[idxTeste].id,
          dataAbertura: rows[idxTeste].dataAbertura,
        });
        delete nextTeste.fotosEntrada;
        delete nextTeste.fotosSaida;
        rows[idxTeste] = nextTeste;
        saveStore(rows);
        return hydrate(nextTeste);
      }
      if (!payload.id) {
        /* BLING: POST /ordens/servico
           O corpo abaixo é o mínimo. Confira o schema da aplicação
           cadastrada em developer.bling.com.br antes de publicar. */
        const json = await requestBling("POST", "/ordens/servico", toBlingPayload(payload));
        const created = Object.assign(mapBlingOrdem(json.data || {}), {
          hardware: payload.hardware,
          tipoManutencao: payload.tipoManutencao,
          tecnico: payload.tecnico,
          descricao: payload.descricao,
          status: payload.status,
          dataEntrada: payload.dataEntrada,
          dataSaida: payload.dataSaida || "",
          clienteNome: payload.clienteNome,
          clienteCpf: payload.clienteCpf,
          telefone: payload.telefone,
          fotos: [],
        });
        rows.unshift(created);
        saveStore(rows);
        return hydrate(created);
      }

      const idx = rows.findIndex((os) => os.id === payload.id);
      if (idx < 0) throw new Error("OS inexistente.");
      assertOpen(rows[idx], "OS concluída não pode ser alterada. O histórico fica preservado.");
      if (rows[idx].blingId) {
        /* BLING: PUT /ordens/servico/{idOrdemServico}
           PUT substitui o recurso. Envie o corpo completo exigido pela conta.
           Para mudar só a situação:
           PATCH /ordens/servico/{idOrdemServico}/situacoes/{idSituacao} */
        await requestBling("PUT", "/ordens/servico/" + rows[idx].blingId, toBlingPayload(payload));
      }
      const next = Object.assign({}, rows[idx], payload, {
        fotos: rows[idx].fotos,
        fotosEm: rows[idx].fotosEm,
        numero: rows[idx].numero,
        id: rows[idx].id,
        blingId: rows[idx].blingId,
        dataAbertura: rows[idx].dataAbertura,
      });
      rows[idx] = next;
      saveStore(rows);
      return hydrate(next);
    },

    async deleteOrdem(id) {
      await ready();
      const rows = loadStore();
      const row = rows.find((os) => os.id === id);
      if (!row) return;
      assertOpen(row, "Histórico de OS concluída é imutável.");
      if (row.blingId) {
        /* BLING: a API v3 nem sempre oferece DELETE de ordem de serviço.
           Se a conta permitir: DELETE /ordens/servico/{id}.
           Senão, cancele com PATCH /ordens/servico/{id}/situacoes. */
      }
      const fotos = row.fotos || [];
      for (let i = 0; i < fotos.length; i += 1) await PhotoStore.remove(fotos[i].id);
      saveStore(rows.filter((os) => os.id !== id));
    },

    async syncOrdem(numero) {
      await ready();
      const alvo = String(numero || "").trim();
      if (!alvo) throw new Error("Informe o número da OS.");
      const rows = loadStore();
      const prev = rows.find((os) => os.numero === alvo);
      if (prev) {
        const ordem = await this.carregarImagens(prev.id, true);
        return { already: true, ordem: ordem };
      }

      /* BLING: GET /ordens/servico?numero=
         A lista oficial aceita o filtro numero. */
      const json = await requestBling("GET", "/ordens/servico?pagina=1&limite=100&numero=" + encodeURIComponent(alvo));
      const found = (json.data || []).map(mapBlingOrdem).find((os) => os.numero === alvo);
      if (!found) throw new Error("Nenhuma OS com esse número no Bling.");
      rows.unshift(found);
      saveStore(rows);
      ultimaLista.unshift(found);
      return { already: false, ordem: await this.carregarImagens(found.id, true) };
    },

    async addFoto(osId, dados) {
      await ready();
      if (!emTeste()) {
        throw new Error("A imagem fica no lançamento do Bling. Anexe a foto na ordem, na peça ou no serviço, e atualize esta tela.");
      }
      const rows = loadStore();
      const row = rows.find((os) => os.id === osId);
      if (!row) throw new Error("OS não encontrada.");
      assertOpen(row, "Não é possível anexar fotos a uma OS concluída.");
      if (!dados || (dados.categoria !== "entrada" && dados.categoria !== "saida")) {
        throw new Error("A foto precisa ser de entrada ou de saída.");
      }
      const foto = {
        id: "f-" + Date.now(),
        categoria: dados.categoria,
        uploadedAt: dados.uploadedAt || new Date().toISOString(),
        nomeArquivo: dados.nomeArquivo || "foto.jpg",
        origem: "local",
        dataUrl: dados.dataUrl,
      };
      await PhotoStore.put(foto.id, foto.dataUrl);
      row.fotos = row.fotos || [];
      row.fotos.push(fotoMeta(foto));
      saveStore(rows);
      return foto;
    },

    async deleteFoto(osId, fotoId) {
      await ready();
      const rows = loadStore();
      const row = rows.find((os) => os.id === osId);
      if (!row) throw new Error("OS não encontrada.");
      const alvo = (row.fotos || []).find((foto) => foto.id === fotoId);
      if (alvo && alvo.origem === "bling") {
        throw new Error("Esta imagem pertence ao Bling e não é apagada por aqui.");
      }
      assertOpen(row, "Fotos de OS concluída não podem ser excluídas.");
      /* DELETE no banco local de imagens. A OS no Bling não muda. */
      row.fotos = (row.fotos || []).filter((foto) => foto.id !== fotoId);
      saveStore(rows);
      await PhotoStore.remove(fotoId);
    },

    async exportBackup() {
      await ready();
      const rows = loadStore();
      const ordens = [];
      for (let i = 0; i < rows.length; i += 1) ordens.push(await hydrate(rows[i]));
      const payload = {
        sistema: "Fernandes Hardware — Registros de Manutenção",
        exportedAt: new Date().toISOString(),
        ordens: ordens,
      };
      localStorage.setItem(backupKey(), todayISO());
      return payload;
    },

    backupPendente() {
      return localStorage.getItem(backupKey()) !== todayISO();
    },
  };

  root.FernandesOS = {
    CONFIG: CONFIG,
    HARDWARE: HARDWARE,
    MANUTENCOES: MANUTENCOES,
    STATUS: STATUS,
    BlingApi: BlingApi,
    filterOrdens: filterOrdens,
    mapSituacao: mapSituacao,
    mapBlingOrdem: mapBlingOrdem,
    digits: digits,
    todayISO: todayISO,
  };
})(typeof window !== "undefined" ? window : globalThis);
