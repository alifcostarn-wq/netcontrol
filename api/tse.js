// Proxy de leitura para os arquivos públicos de divulgação de resultados do TSE.
// Usado pelo Radar de Votos quando o navegador não consegue ler direto do TSE (CORS/bloqueio).
const BASES = {
  oficial: 'https://resultados.tse.jus.br/oficial/',
  simulado: 'https://resultados-sim.tse.jus.br/simulado/simulado2026/',
};

// Só caminhos de arquivos JSON do TSE: letras minúsculas, números, "/", "_", "-" e "."
const PATH_OK = /^[a-z0-9_\-/]+(\.[a-z0-9_\-]+)*\.json$/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const amb = String(req.query.amb || '');
  const p = String(req.query.p || '');
  const base = BASES[amb];

  if (!base) return res.status(400).json({ error: 'Ambiente inválido' });
  if (!PATH_OK.test(p) || p.includes('..') || p.startsWith('/')) {
    return res.status(400).json({ error: 'Caminho inválido' });
  }

  try {
    const r = await fetch(base + p, { headers: { Accept: 'application/json' } });
    if (!r.ok) {
      // 404 com cache curto para não repetir a consulta (o TSE bloqueia IPs que geram muitos 404)
      res.setHeader('Cache-Control', r.status === 404 ? 's-maxage=60' : 'no-store');
      return res.status(r.status).json({ error: 'TSE respondeu ' + r.status });
    }
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=15');
    return res.status(200).send(body);
  } catch (e) {
    return res.status(502).json({ error: 'Falha ao acessar o TSE' });
  }
}
