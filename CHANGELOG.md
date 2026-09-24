# Changelog

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
