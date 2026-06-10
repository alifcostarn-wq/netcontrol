export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ixc-url, x-ixc-token, x-ixc-user, x-ixc-endpoint, x-ixc-auth-type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ixcUrl      = req.headers['x-ixc-url'];
  const ixcToken    = req.headers['x-ixc-token'];
  const ixcUser     = req.headers['x-ixc-user'] || '';
  const ixcSecret   = req.headers['x-ixc-secret'] || '';
  const endpoint    = req.headers['x-ixc-endpoint'];
  const params      = req.body?.params || {};

  if (!ixcUrl || !ixcToken || !endpoint) {
    return res.status(400).json({ error: 'Missing required headers' });
  }

  const base = ixcUrl.replace(/\/$/, '').replace(/\/adm\.php$/, '');

  const body = JSON.stringify({
    qtype: '', query: '', oper: '=',
    page: '1', rp: req.body?.rp || '100',
    sortname: 'id', sortorder: 'desc',
  });

  // ── Strategy 1: OAuth2 Client Credentials (MoviOn / IXC novo) ────────────────
  // Try to get a Bearer token first if we have client_id + client_secret
  let bearerToken = null;
  if (ixcUser && ixcSecret) {
    try {
      const oauthUrl = `${base}/adm.php/oauth/token`;
      const oauthRes = await fetch(oauthUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'client_credentials',
          client_id:     ixcUser,
          client_secret: ixcSecret,
        }),
      });
      const oauthData = await oauthRes.json().catch(() => ({}));
      if (oauthData.access_token) {
        bearerToken = oauthData.access_token;
      }
    } catch (_) {}
  }

  // ── Strategy 2: Bearer with provided token directly ──────────────────────────
  if (!bearerToken) bearerToken = ixcToken;

  const urlCandidates = [
    `${base}/adm.php/webservice/v1/${endpoint}`,
    `${base}/webservice/v1/${endpoint}`,
    `${base}/adm.php/api/v1/${endpoint}`,
    `${base}/api/v1/${endpoint}`,
  ];

  // Auth variations to try for each URL
  const makeHeaders = (auth) => ({
    ...auth,
    'Content-Type': 'application/json',
    'ixcsoft': 'listar',
    'Accept': 'application/json',
  });

  const authVariants = [
    // Bearer token (MoviOn OAuth style)
    makeHeaders({ 'Authorization': `Bearer ${bearerToken}` }),
    // Basic with user:token
    ...(ixcUser ? [makeHeaders({ 'Authorization': `Basic ${Buffer.from(`${ixcUser}:${ixcToken}`).toString('base64')}` })] : []),
    // Basic token: (classic IXC)
    makeHeaders({ 'Authorization': `Basic ${Buffer.from(`${ixcToken}:`).toString('base64')}` }),
    // Token in header directly
    makeHeaders({ 'token': ixcToken }),
    makeHeaders({ 'Authorization': ixcToken }),
  ];

  const allResults = [];

  for (const rawUrl of urlCandidates) {
    const url = new URL(rawUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

    for (const headers of authVariants) {
      try {
        const response = await fetch(url.toString(), { method: 'POST', headers, body });
        const text     = await response.text();
        const isHtml   = text.trim().startsWith('<');

        allResults.push({
          url: url.pathname,
          authType: headers['Authorization']?.split(' ')[0] || 'custom',
          httpStatus: response.status,
          isHtml,
          preview: text.slice(0, 150),
        });

        if (!isHtml && response.status < 400) {
          try {
            const data = JSON.parse(text);
            return res.status(200).json({
              ...data,
              _workingUrl: url.toString(),
              _authType: headers['Authorization']?.split(' ')[0] || 'custom',
            });
          } catch { /* not JSON */ }
        }
      } catch (err) {
        allResults.push({ url: rawUrl, fetchError: err.message });
      }
    }
  }

  const summary = [...new Set(allResults.map(r => `${r.url} → HTTP ${r.httpStatus ?? '?'} ${r.isHtml ? 'HTML' : r.fetchError ? 'ERR' : 'JSON?'}`))]
    .slice(0, 10);

  return res.status(401).json({
    error: 'Falha na autenticação. Veja o resumo abaixo.',
    dica: 'Se você usa MoviOn/IXC novo, vá em OAuth Server no IXC e crie um Client ID + Client Secret.',
    summary,
    allResults: allResults.slice(0, 8),
  });
}
