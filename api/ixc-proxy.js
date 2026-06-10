export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ixc-url, x-ixc-token, x-ixc-user, x-ixc-endpoint');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ixcUrl   = req.headers['x-ixc-url'];
  const ixcToken = req.headers['x-ixc-token'];
  const ixcUser  = req.headers['x-ixc-user'] || '';
  const endpoint = req.headers['x-ixc-endpoint'];
  const params   = req.body?.params || {};

  if (!ixcUrl || !ixcToken || !endpoint) {
    return res.status(400).json({ error: 'Missing required headers' });
  }

  const base = ixcUrl.replace(/\/$/, '').replace(/\/adm\.php$/, '');
  const url  = new URL(`${base}/adm.php/webservice/v1/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const body = JSON.stringify({
    qtype: '', query: '', oper: '=',
    page: '1', rp: req.body?.rp || '100',
    sortname: 'id', sortorder: 'desc',
  });

  // 1. First: probe without any auth to see what server returns
  let probePreview = '';
  try {
    const probe = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ixcsoft': 'listar' },
      body,
    });
    const probeText = await probe.text();
    probePreview = `[sem-auth] HTTP ${probe.status} → ${probeText.slice(0, 300)}`;
  } catch(e) {
    probePreview = `[sem-auth] fetch error: ${e.message}`;
  }

  // 2. Try auth formats
  const authCandidates = [];
  if (ixcUser) authCandidates.push(`${ixcUser}:${ixcToken}`);
  authCandidates.push(`${ixcToken}:`);
  if (ixcUser) authCandidates.push(`${ixcToken}:${ixcUser}`);
  authCandidates.push(`:${ixcToken}`);

  const results = [];

  for (const authString of authCandidates) {
    try {
      const encoded  = Buffer.from(authString).toString('base64');
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${encoded}`,
          'Content-Type': 'application/json',
          'ixcsoft': 'listar',
        },
        body,
      });

      const text = await response.text();
      const isHtml = text.trim().startsWith('<');

      results.push({
        authFormat: authString.replace(ixcToken, '***'),
        httpStatus: response.status,
        isHtml,
        // Show first 300 chars so we can identify what's blocking
        responsePreview: text.slice(0, 300),
      });

      if (!isHtml) {
        try {
          const data = JSON.parse(text);
          return res.status(200).json({ ...data, _authFormat: authString.replace(ixcToken, '***') });
        } catch {
          results[results.length - 1].parseError = 'Não é JSON válido';
        }
      }
    } catch (err) {
      results.push({
        authFormat: authString.replace(ixcToken, '***'),
        fetchError: err.message,
      });
    }
  }

  return res.status(401).json({
    error: 'Nenhum formato funcionou.',
    urlTested: url.toString(),
    probeResult: probePreview,
    diagnostics: results,
  });
}
