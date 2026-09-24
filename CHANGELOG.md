# Changelog

## [2.2.1] — 2026-09-24

### Adicionado
- **Nomes, bairros, endereços e mapa dos locais de votação do RN (2022 e 2024)** publicados em `data/locais/`,
  a partir do cadastro oficial do TSE (`eleitorado_local_votacao`) importado pelo navegador:
  1.505 locais em 2022 e 1.528 em 2024, cobrindo 97% dos locais das urnas.
  A aba **Votos por bairro** passa a agrupar por bairro (ex.: 29 bairros em Mossoró) e a mostrar o mapa.

### Melhorado
- **Importação dos locais** agora guarda também a seção → local. Isso corrige as seções que mudaram de escola
  (ex.: em Mossoró 2024, seções da E.E. Eliseu Viana, em reforma, que votaram na E.E. Lavoisier Maia):
  o boletim registra o local antigo e o cadastro o novo. Os ~3% restantes aparecem após uma nova importação.
- Botão "Carregar de novo" disponível mesmo com os locais já publicados (para atualizar o cadastro).
- Aviso sobre seções agregadas passa a ser informativo (não de alerta).

## [2.2.0] — 2026-09-24

### Alterado — só dados reais em todo o sistema
- **Removidos todos os dados fictícios:** a "Cidade fictícia" de exemplo (2020 e 2024), a amostra gravada da apuração
  e o modo "Teste do TSE" (simulado com nomes inventados). O proxy `/api/tse` agora só lê o resultado oficial.
- **Apuração ao vivo:** mostra o resultado **oficial** do TSE. Enquanto o de 2026 não sai (a partir das 17h de 4/10/2026),
  a página abre no resultado oficial de 2024 — já em Rio Grande do Norte › Mossoró — com um botão para voltar a 2026.
  A lista de eleições mostra só as eleições ordinárias (sem consultas populares e eleições suplementares).
- **Votos por bairro e Comparar:** usam os **boletins de urna oficiais** de cada seção, publicados pelo TSE em
  `resultados.tse.jus.br`, para **os 167 municípios do RN em 2022 e 2024** (presidente, governador, senador, deputados,
  prefeito e vereador; votos de legenda, brancos, nulos, eleitores aptos e comparecimento de cada urna).
  Conferido com o resultado oficial: em Mossoró 2024 os 5 candidatos a prefeito e os 212 a vereador batem voto a voto;
  em Natal 2024 os dois turnos batem; e nos 167 municípios o total de votos para prefeito é igual ao comparecimento oficial.
- O gerador lê tanto a versão em texto do boletim de urna quanto o boletim binário original (ASN.1) — em 2022 o TSE
  deixou só o binário para 87 municípios do RN. Nos dois formatos a mesma urna dá exatamente os mesmos votos.
- Situação oficial dos candidatos de 2024 (eleito, suplente…) vem do resultado oficial do TSE por município.
- Escolha de dados em dois campos: **Cidade** e **Ano** (antes era um campo só).

### Adicionado
- `scripts/build-historico.mjs` (reescrito): gera os dados a partir dos boletins de urna do TSE, sem precisar de `npm install`.
  Ex.: `node scripts/build-historico.mjs --uf RN --todos --anos 2022,2024`.
- **Ajuda › Locais de votação:** carrega pelo navegador o cadastro oficial de locais do TSE
  (`eleitorado_local_votacao_AAAA.zip`), com nome, bairro, endereço e coordenadas de cada local.
  Esse arquivo só é liberado pelo TSE para conexões no Brasil, por isso é o navegador do usuário que o baixa.
  Depois de carregado, aparecem os nomes dos locais, o agrupamento por bairro e o mapa; o botão
  "Baixar arquivo para publicar" gera o arquivo para deixar os bairros visíveis a todos (`data/locais/`).
- Enquanto os locais não são carregados, cada local aparece como "Local de votação nº …" e a página avisa como completar.

### Removido
- `data/demo/` (dados de exemplo), modo simulado e a função experimental `api/tse-locais.js`
  (o TSE também bloqueia servidores em nuvem, mesmo no Brasil).

### Técnico
- Funções da Vercel passam a rodar em São Paulo (`gru1`).

## [2.1.0] — 2026-09-24

### Melhorado — layout mais simples e fácil de entender
- **Cada aba começa com um título e uma frase explicando para que serve.**
- **Nomes das abas mais claros:** "Apuração ao vivo", "Votos por bairro", "Comparar" e "Ajuda" (no celular: "Ao vivo", "Bairros", "Comparar", "Ajuda", que agora cabem todas na tela).
- **Linguagem do dia a dia no lugar de termos técnicos:** "Abrangência" virou "Estado", "Município" virou "Cidade",
  "seções totalizadas" virou "urnas apuradas", "Abstenção" virou "Não foram votar", "Eleito por QP" virou "Eleito".
  Nomes de estados, cidades, bairros e locais aparecem com maiúsculas e minúsculas ("Alto da Conceição").

**Apuração ao vivo**
- Filtros organizados em duas linhas; a escolha "Oficial / Teste do TSE" virou um botão de duas opções.
- Enquanto o TSE não publica o resultado, aparece um aviso com o botão **"Ver o teste do TSE"** e a tela não mostra listas vazias.
- Linha de status única: horário dos números do TSE, contagem regressiva, "Pausar" e "Atualizar agora".
- Cartões de resumo reduzidos a 4 (Foram votar, Não foram votar, Votos válidos, Brancos e nulos), cada um explicando se conta ou não para o resultado.
- Lista de candidatos mais limpa: porcentagem em destaque, votos embaixo, número do candidato em texto,
  etiqueta só quando ajuda (Eleito, Vai ao 2º turno, Suplente, Votos anulados).
- "Partidos" mostra a % dos votos válidos; "Mapa das cidades" com opções "Quem está na frente" ou "Um candidato".

**Votos por bairro**
- A lista lateral de candidatos virou um campo "Candidato" junto dos outros filtros (favoritos aparecem primeiro).
- Cargo e turno num só campo ("Prefeito — 1º turno").
- Resumo escrito em frases: votos, colocação, em quantos bairros venceu, onde foi melhor e pior.
- Na visão geral, os 3 mais votados aparecem como cartões clicáveis.
- Tabela com coluna "Resultado" em texto ("Venceu por 272 votos" / "Perdeu para X por 45"); seta indicando as linhas que abrem detalhes.
- Botão "← Voltar" e "Você está vendo: …" ao entrar num bairro ou local.
- "Mostrar a tabela por" (Bairro, Local de votação, Seção) fica junto da tabela.

**Comparar**
- Cada lado (A e B) com 3 campos: cidade e ano, cargo e candidato.
- Resumo em frase ("X teve 22 votos a mais…") e tabela com menos colunas.

**Ajuda** (antiga aba "Dados")
- Novo passo a passo "Como usar" e explicação de votos válidos, seção e local de votação.
- Intervalo de atualização e conexão com o TSE foram para "Preferências"; instruções técnicas ficam recolhidas.

### Removido
- Agrupamento por "Zona" nas abas Votos por bairro e Comparar (pouco usado; bairro, local e seção continuam).
- Quadradinhos com os dígitos do número do candidato (o número agora aparece como "nº 13").

### Sem mudança
- Leitura dos dados do TSE, proxy `/api/tse`, cálculos, favoritos e exportação para Excel/CSV continuam iguais.

## [2.0.0] — 2026-09-24

### Alterado
- **Conteúdo do site substituído**: o NetControl (ISP Manager) deu lugar ao **Radar de Votos**.
  - `index.html` agora é o Radar de Votos: apuração 2026 ao vivo (TSE oficial e simulado),
    análise de votos por bairro / local / zona / seção, comparação entre candidatos ou anos,
    mapas (Leaflet + malhas do IBGE) e exportação em CSV e Excel.
  - Cabeçalho HTML reorganizado (`<head>` com título, descrição, fontes e estilos; `lang="pt-BR"`).

### Adicionado
- `api/tse.js`: proxy serverless da Vercel usado pela página em `/api/tse` para ler os arquivos
  públicos do TSE quando o navegador bloqueia a leitura direta. Aceita só os ambientes
  `oficial` e `simulado` e só caminhos `.json`; cache compartilhado de 15 s (404 em cache por 60 s).
- `data/demo/`: dados de demonstração (cidade fictícia 2020 e 2024) e amostra gravada do simulado do TSE.
- `data/historico/index.json`: índice (vazio) dos conjuntos de dados reais por município.

### Removido
- `api/ixc-proxy.js`: proxy da API do IXC, usado só pelo NetControl.
