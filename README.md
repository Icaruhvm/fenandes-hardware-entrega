# Fernandes Hardware — versão de testes

Trabalho de Fundamentos de Engenharia de Software, Universidade Vila Velha.
Grupo: Bryan Alves, Ícaro Martins, Mateus Scardua, Victor de Paula e Leonardo Penkaitis.
Parceiro: Fernandes Hardware.

Na loja, a ordem de serviço fica no Bling e a foto do equipamento acaba no Discord. Este site junta as duas coisas numa tela só: a OS, o cliente, o técnico e as fotos de quando o aparelho chegou e de quando ele foi embora.

O repositório está publicado para leitura. Dá para entender o que a tela faz e onde cada decisão mora no código.

## O que a tela faz

A lista mostra o número da OS, o cliente, o aparelho, o tipo de manutenção e a situação: Pendente, Em Andamento ou Concluída. A busca é pelo número da OS ou pelos dígitos do CPF/CNPJ.

Em Ver Detalhes ficam os dados do atendimento e as fotos. Entrada é a chegada do aparelho. Saída é a entrega. Ordem concluída trava edição, exclusão e foto nova. O histórico permanece como foi fechado.

No registro novo, CPF, CNPJ e telefone só aceitam número. CPF e CNPJ são conferidos pelos dígitos verificadores antes de gravar. O mesmo formulário recebe foto de entrada e foto de saída.

No topo há duas chaves. **Testes** mostra atendimentos de exemplo, criados para a apresentação, e a tela não chama o Bling. Com a chave desligada, a lista só traz ordem que o Bling devolver. A outra chave troca o visual: no claro o texto é tema escuro, no escuro o texto é tema branco. A escolha fica gravada no navegador.

Os nomes, CPF, telefones e fotos dessa apresentação são fictícios. As fotos são desenhos gerados no próprio código, com dígito verificador válido só para o formulário aceitar o documento.

## Onde olhar

- `index.html` — as telas. O JSX é compilado no navegador. O visual usa Tailwind.
- `js/bling-api.js` — lista, gravação, fotos e o modo de testes. No modo real a conversa com o Bling passa por `/bling`, na mesma origem da página. Os pontos de partida são `listOrdens`, `saveOrdem` e `carregarImagens`.
- `servidor.py` — entrega a tela e, com autorização feita, encaminha ao Bling apenas os caminhos que essa tela usa. A lógica mora na classe `Handler`.
- `configuracoes/.env.example` — o nome das variáveis. Os valores estão vazios de propósito.
- `vendor/` — React, ReactDOM, Babel e Tailwind, copiados para a tela não depender de CDN.

Peça no Bling vira foto de entrada. Serviço vira foto de saída. A imagem vem do cadastro do produto (`GET /produtos/{id}`), porque a ordem de serviço em si não guarda anexo.

## Credenciais e o que ficou de fora do Git

Este repositório não contém senha, Client Secret nem token. O `.gitignore` deixa de fora `configuracoes/.env` e o arquivo cifrado do token (`*.dpapi`).

O navegador não recebe o access token. Quem guarda esse token é o `servidor.py`, cifrado com o DPAPI do Windows, no usuário que autorizou. A rota de status devolve só se está conectado e quando o token expira.

O servidor escuta só em `127.0.0.1`. O proxy confere o `Host` e recusa pedido vindo de outro site, para uma página qualquer aberta no navegador não conseguir usar o token. O retorno do OAuth confere o `state` com um cookie HttpOnly, em comparação de tempo constante, e o código de autorização não entra no log.

Os caminhos liberados são os que a tela realmente chama: listar, abrir, criar e atualizar ordem de serviço, e ler a imagem do produto. Outro caminho da API do Bling recebe 404, sem o token ser anexado.
