// Proxy de leitura para a API pública do DivulgaCandContas (TSE): candidaturas, bens, certidões e contas.
// O navegador não consegue ler direto do TSE (CORS), então o Radar de Votos consulta por aqui.
const BASE = 'https://divulgacandcontas.tse.jus.br/divulga/rest/';
// só consultas de leitura da API v1 e fotos de candidatos
const PATH_OK = /^(v1\/[A-Za-z0-9_\-/.]+|arquivo\/img\/\d+\/\d+\/[A-Za-z0-9]+)$/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const p = String(req.query.p || '');
  if (!PATH_OK.test(p) || p.includes('..')) return res.status(400).json({ error: 'Caminho inválido' });

  try {
    const r = await fetch(BASE + p, {
      headers: {
        Accept: 'application/json, image/*;q=0.9, */*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
        Referer: 'https://divulgacandcontas.tse.jus.br/divulga/',
      },
    });
    if (!r.ok) {
      res.setHeader('Cache-Control', 's-maxage=60');
      return res.status(r.status).json({ error: 'TSE respondeu ' + r.status });
    }
    const tipo = r.headers.get('content-type') || 'application/json; charset=utf-8';
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', tipo);
    res.setHeader('Cache-Control', p.startsWith('arquivo/') ? 's-maxage=86400' : 's-maxage=900, stale-while-revalidate=3600');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: 'Falha ao acessar o TSE' });
  }
}
