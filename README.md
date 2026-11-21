# Fernandes Hardware — versão para o professor

Esta pasta é uma cópia para apresentação. A versão da loja continua em `fenandes-hardware-trabalho` e não foi alterada.

A chave **Testes** já começa ligada. A lista abre com registros gerados para a demonstração. Desligue a chave para voltar ao modo que só mostra o Bling.

Ao lado dela, a chave de tema mostra **tema escuro** no visual claro. Com o tema escuro ligado, o texto passa a **tema branco**.

Em **+ Adicionar Novo Registro**, com o modo de testes ligado, dá para anexar **Imagem de Entrada** e **Imagem de Saída** por **Tirar Foto** ou **Carregar da Galeria**. O mesmo botão **Adicionar Foto** aparece no detalhe, enquanto a OS não estiver concluída.

## Rodar esta cópia

Dê dois cliques em `iniciar.bat` e abra [http://localhost:8080](http://localhost:8080). Se a outra versão já estiver usando a porta 8080, feche a janela preta dela antes.

# Fernandes Hardware — Registros de Manutenção

Sistema da bancada para acompanhar a ordem de serviço do Bling no computador e no celular, dentro da rede da loja. As fotos vêm do lançamento no Bling.

Não precisa de Node nem de build. O navegador usa o que já está na pasta `vendor`.

## Rodar o sistema

1. Tenha o Python 3 instalado. Na instalação, marque **Add python.exe to PATH**. Se `python` não existir, o `iniciar.bat` tenta `py`.
2. Dê dois cliques em `iniciar.bat`.
3. No computador da bancada, abra [http://localhost:8080](http://localhost:8080).
4. No celular, use a mesma rede Wi-Fi e abra `http://IP-DESTE-PC:8080`. O número aparece na janela preta. Se não aparecer, rode `ipconfig` e use o **Endereço IPv4** do Wi-Fi.
5. Feche a janela preta para encerrar.

O `iniciar.bat` sobe o site e o caminho `/bling` no mesmo endereço. O celular fala com este computador. O token do Bling não vai para o navegador.

## Modo escuro

No canto direito do cabeçalho existe a chave **Escuro**, no formato da chave do iPhone. Ligada, a bancada fica escura. A escolha fica salva neste navegador.

## Deixar o site 100% funcional

A bancada só mostra ordem que o Bling devolver. Desconectado, a lista fica vazia. Não existe registro de exemplo.

O selo verde **Bling API: Conectado** aparece quando a conta da loja já foi autorizada neste computador. O botão **Conectar ao Bling** abre a autorização. Faça os três passos abaixo, nesta ordem.

## Conectar o Bling

### 1. Criar o aplicativo

1. Entre em [developer.bling.com.br](https://developer.bling.com.br) com a conta da loja.
2. Crie um aplicativo do tipo privado.
3. Anote o **Client ID** e o **Client Secret**.
4. Em **Link de redirecionamento**, cadastre exatamente:

```text
http://127.0.0.1:8080/api/bling/callback
```

5. Marque os escopos de **Ordens de Serviço**, **Produtos** e **Contatos**.

A senha da conta não entra no código. Quem autoriza é o dono da loja, no navegador, no passo 3.

### 2. Guardar as credenciais neste computador

1. Copie `configuracoes/.env.example` para `configuracoes/.env`.
2. Preencha:

```text
BLING_CLIENT_ID=cole_o_client_id
BLING_CLIENT_SECRET=cole_o_client_secret
BLING_REDIRECT_URI=http://127.0.0.1:8080/api/bling/callback
```

3. Feche e abra de novo o `iniciar.bat`.

O arquivo `.env` não entra no Git. Não cole o segredo em `index.html` nem em `js/bling-api.js`.

### 3. Autorizar

1. Abra o site neste computador, não no celular.
2. Toque em **Conectar ao Bling**.
3. Entre na conta da loja e aceite.
4. O navegador volta para a bancada. O selo fica **Bling API: Conectado** e a lista passa a mostrar as ordens dessa conta.

O token fica cifrado em `configuracoes/bling_tokens.dpapi`, só para o usuário do Windows que rodou o servidor. Esse arquivo também não entra no Git. Se o token vencer, o servidor renova sozinho. Se a renovação falhar, use **Conectar ao Bling** de novo.

Autorize no navegador deste computador. O celular da mesma rede usa o token que ficou aqui. Abra nele o endereço que a janela preta mostrar, no formato `http://IP-DESTE-PC:8080`.

O endereço antigo `bling.com.br/Api/v3` saiu do ar em 30/04/2026. O sistema usa `https://api.bling.com.br/Api/v3`.

### Se o selo não ficar verde

| O que aparece | O que fazer |
| --- | --- |
| Página **Falta configurar o Bling** | O `.env` está vazio ou o `iniciar.bat` não foi reiniciado depois de salvá-lo |
| O Bling recusa o retorno | O link cadastrado no aplicativo tem que ser igual a `http://127.0.0.1:8080/api/bling/callback` |
| Selo vermelho depois de aceitar | Feche a janela preta, abra o `iniciar.bat` de novo e toque outra vez em **Conectar ao Bling** |
| Selo verde e lista vazia | A conta não devolveu ordem, ou o escopo de Ordens de Serviço ficou de fora |
| Celular não abre | Mesma rede Wi-Fi e o IP impresso na janela preta. A autorização continua sendo no computador |

## O que o site pede ao Bling

| Ação no site | Método | Caminho |
| --- | --- | --- |
| Selo de conexão e lista | GET | `/ordens/servico?pagina=1&limite=100` |
| Detalhe da ordem | GET | `/ordens/servico/{id}` |
| Salvar registro novo | POST | `/ordens/servico` |
| Editar registro | PUT | `/ordens/servico/{id}` |
| Mudar só a situação | PATCH | `/ordens/servico/{id}/situacoes/{idSituacao}` |
| Achar o cliente pelo CPF | GET | `/contatos?numeroDocumento=` |
| Imagem da peça ou do serviço | GET | `/produtos/{idProduto}` |

O navegador chama `http://este-computador:8080/bling/...`. O `servidor.py` repete a chamada no Bling com o token.

Quando a primeira OS real chegar, confira em `js/bling-api.js`:

- `mapBlingOrdem`: traduz a resposta do Bling para o cartão da bancada.
- `toBlingPayload`: monta o corpo do POST e do PUT.

Os comentários `BLING:` marcam cada chamada. A busca é por número da OS ou pelos dígitos do CPF. O nome do cliente não entra na busca.

As imagens são lidas do lançamento. Entram `imagemURL` e `midia.imagens` do produto. Se a ordem trouxer `anexos`, `imagens` ou `arquivos`, essas fotos também aparecem. Peças ficam em **Imagem de Entrada**. Serviços ficam em **Imagem de Saída**. Não há segundo envio de foto nesta tela. O botão **Atualizar imagens** relê o lançamento.

O botão **Gerar backup** baixa um JSON do dia. OS com status **Concluída** não pode ser editada nem excluída.

## Onde mexer

| Arquivo | Função |
| --- | --- |
| `index.html` | Telas, busca, filtros e modo escuro |
| `js/bling-api.js` | Chamadas ao Bling, fotos e backup |
| `servidor.py` | Site, proxy `/bling` e autorização |
| `iniciar.bat` | Sobe o `servidor.py` na porta 8080 |
| `configuracoes/.env.example` | Modelo das credenciais |
| `vendor/` | React, Babel e Tailwind. Não editar |

## Grupo

Trabalho de Fundamentos de Engenharia de Software, Universidade Vila Velha. Parceiro: Fernandes Hardware. Clonem o repositório e abram pelo `iniciar.bat`. As ordens da loja aparecem depois dos três passos de **Conectar o Bling**, feitos no computador da bancada. O `.env` fica só nessa máquina.
