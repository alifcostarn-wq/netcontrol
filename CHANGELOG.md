# Changelog

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
