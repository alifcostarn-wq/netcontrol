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

  // Build all auth formats to try in order:
  // 1. user:token  (if user was provided)
  // 2. token:      (token as username, empty password — formato padrão IXC)
  // 3. :token      (empty username, token as password)
  const authCandidates = [];
  if (ixcUser) authCandidates.push(`${ixcUser}:${ixcToken}`);
  authCandidates.push(`${ixcToken}:`);
  if (ixcUser) authCandidates.push(`${ixcToken}:${ixcUser}`); // some versions reversed
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
        authFormat: authString.replace(ixcToken, '***TOKEN***'),
        httpStatus: response.status,
        isHtml,
        preview: text.slice(0, 120),
      });

      if (!isHtml) {
        try {
          const data = JSON.parse(text);
          // Success — return data plus which format worked (for debugging)
          return res.status(200).json({ ...data, _authFormat: authString.replace(ixcToken, '***TOKEN***') });
        } catch {
          // Not JSON either — continue trying
          results[results.length - 1].parseError = 'Não é JSON válido';
        }
      }
    } catch (err) {
      results.push({
        authFormat: authString.replace(ixcToken, '***TOKEN***'),
        fetchError: err.message,
      });
    }
  }

  // All formats failed — return full diagnostic
  return res.status(401).json({
    error: 'Nenhum formato de autenticação funcionou. Verifique o token e a URL.',
    urlTested: url.toString(),
    diagnostics: results,
  });
}
