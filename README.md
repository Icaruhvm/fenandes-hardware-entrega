# Fernandes Hardware — registros da bancada

Trabalho de Fundamentos de Engenharia de Software, Universidade Vila Velha.
Grupo: Bryan Alves, Ícaro Martins, Mateus Scardua, Victor de Paula e Leonardo Penkaitis.
Parceiro: Fernandes Hardware.

Hoje a foto da entrada e da saída do equipamento acaba no Discord, longe da ordem de serviço. Este site junta as duas coisas na bancada: a OS, o cliente e as fotos, no computador e no celular da loja.

Esta pasta é a versão para apresentar. A versão do dia a dia da loja está no outro repositório, `fenandes-hardware-trabalho`.

## Como abrir

Precisa do Python 3. Na instalação, marca a opção de colocar o Python no PATH.

1. Dois cliques em `iniciar.bat`.
2. Abre http://localhost:8080
3. No celular, na mesma rede Wi-Fi, usa o endereço que aparecer na janela preta.
4. Para encerrar, fecha essa janela.

Se a porta 8080 já estiver ocupada, fecha a outra janela preta antes.

## Na apresentação

A chave **Testes** já vem ligada. A lista abre com atendimentos de exemplo, só para mostrar o fluxo. Não são ordens da loja. Desligou a chave, o site espera o Bling de verdade e a lista fica vazia até a conta ser autorizada.

Ao lado tem a chave de tema. No visual claro está escrito **tema escuro**. Com a tela escura, o texto vira **tema branco**.

Em **Ver Detalhes** aparecem as fotos de entrada, de quando o aparelho chegou, e as de saída, de quando ele foi embora. Ordem concluída não deixa editar nem apagar. O histórico fica como estava.

Em **+ Adicionar Novo Registro** dá para tirar ou carregar foto de entrada e de saída. CPF, CNPJ e telefone só aceitam número. O documento é conferido antes de salvar.

A busca é pelo número da OS ou pelos dígitos do CPF. O nome do cliente não entra na busca.

## Quando a loja for usar de verdade

A senha da conta do Bling não entra no código. Quem autoriza é o dono, no navegador deste computador.

1. Em [developer.bling.com.br](https://developer.bling.com.br), cria um aplicativo privado.
2. Anota o Client ID e o Client Secret.
3. No link de redirecionamento, coloca exatamente `http://127.0.0.1:8080/api/bling/callback`.
4. Marca Ordens de Serviço, Produtos e Contatos.
5. Copia `configuracoes/.env.example` para `configuracoes/.env` e cola o Client ID e o Client Secret lá.
6. Fecha e abre de novo o `iniciar.bat`.
7. No site, neste computador, toca em **Conectar ao Bling** e aceita.

O selo fica **Bling API: Conectado** e a lista passa a mostrar as ordens da conta. O celular usa essa mesma conexão, abrindo o endereço deste PC.

O `.env` e o token ficam só nesta máquina. Não vão para o GitHub.

Se o Bling recusar o retorno, o link cadastrado tem que ser igual ao do passo 3. Se abrir a página "Falta configurar o Bling", o `.env` está vazio ou a janela preta não foi reiniciada.

## Onde mexer

- `index.html` — as telas
- `js/bling-api.js` — Bling, fotos e modo de testes
- `servidor.py` e `iniciar.bat` — sobem o site na rede da loja
- `configuracoes/.env.example` — modelo das credenciais
- `vendor/` — React, Babel e Tailwind. A gente não mexe aí.
