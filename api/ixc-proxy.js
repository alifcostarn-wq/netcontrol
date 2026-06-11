export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ixc-url, x-ixc-token, x-ixc-user, x-ixc-endpoint, x-ixc-secret, x-ixc-password');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ixcUrl      = req.headers['x-ixc-url'];
  const ixcToken    = req.headers['x-ixc-token'];   // client_id ou token básico
  const ixcUser     = req.headers['x-ixc-user'] || '';
  const ixcSecret   = req.headers['x-ixc-secret'] || '';
  const ixcPassword = req.headers['x-ixc-password'] || '';
  const endpoint    = req.headers['x-ixc-endpoint'];
  const params      = req.body?.params || {};

  if (!ixcUrl || !ixcToken || !endpoint) {
    return res.status(400).json({ error: 'Missing required headers' });
  }

  const base = ixcUrl.replace(/\/$/, '').replace(/\/adm\.php$/, '');

  const apiBody = JSON.stringify({
    qtype: '', query: '', oper: '=',
    page: '1', rp: req.body?.rp || '100',
    sortname: 'id', sortorder: 'desc',
  });

  // ── STEP 1: Try OAuth2 token endpoint (multiple paths + grant types) ─────────
  const oauthLog = [];
  let bearerToken = null;

  const oauthEndpoints = [
    `${base}/adm.php/oauth/token`,
    `${base}/oauth/token`,
    `${base}/adm.php/index.php/oauth/token`,
  ];

  for (const oauthUrl of oauthEndpoints) {
    if (bearerToken) break;

    // client_credentials grant
    if (ixcToken && ixcSecret) {
      try {
        const r = await fetch(oauthUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: ixcToken,
            client_secret: ixcSecret,
          }),
        });
        const text = await r.text();
        oauthLog.push({ url: oauthUrl, grant: 'client_credentials', status: r.status, response: text.slice(0, 300) });
        const data = JSON.parse(text);
        if (data.access_token) { bearerToken = data.access_token; break; }
      } catch (e) {
        oauthLog.push({ url: oauthUrl, grant: 'client_credentials', error: e.message });
      }
    }

    // password grant (user + token como senha, ou user + password)
    if (ixcUser && (ixcSecret || ixcPassword || ixcToken)) {
      const passwordToTry = ixcPassword || ixcSecret || ixcToken;
      try {
        const r = await fetch(oauthUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'password',
            client_id: ixcToken,
            client_secret: ixcSecret,
            username: ixcUser,
            password: passwordToTry,
          }),
        });
        const text = await r.text();
        oauthLog.push({ url: oauthUrl, grant: 'password', status: r.status, response: text.slice(0, 300) });
        const data = JSON.parse(text);
        if (data.access_token) { bearerToken = data.access_token; break; }
      } catch (e) {
        oauthLog.push({ url: oauthUrl, grant: 'password', error: e.message });
      }
    }
  }

  // ── STEP 2: Build auth variants to try ───────────────────────────────────────
  const authHeaders = [];

  // OAuth Bearer (if we got a token)
  if (bearerToken) {
    authHeaders.push({ label: 'OAuth Bearer', Authorization: `Bearer ${bearerToken}` });
  }

  // Bearer with raw token (in case token IS already a bearer)
  authHeaders.push({ label: 'Bearer (raw token)', Authorization: `Bearer ${ixcToken}` });

  // Basic auth variants
  if (ixcUser) authHeaders.push({ label: `Basic user:token`, Authorization: `Basic ${Buffer.from(`${ixcUser}:${ixcToken}`).toString('base64')}` });
  authHeaders.push({ label: 'Basic token:', Authorization: `Basic ${Buffer.from(`${ixcToken}:`).toString('base64')}` });
  if (ixcSecret) authHeaders.push({ label: 'Basic id:secret', Authorization: `Basic ${Buffer.from(`${ixcToken}:${ixcSecret}`).toString('base64')}` });

  // ── STEP 3: Try API endpoints ────────────────────────────────────────────────
  const urlCandidates = [
    `${base}/adm.php/webservice/v1/${endpoint}`,
    `${base}/webservice/v1/${endpoint}`,
    `${base}/adm.php/api/v1/${endpoint}`,
    `${base}/api/v1/${endpoint}`,
  ];

  const apiResults = [];

  for (const rawUrl of urlCandidates) {
    const url = new URL(rawUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

    for (const { label, ...hdrs } of authHeaders) {
      try {
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: { ...hdrs, 'Content-Type': 'application/json', 'ixcsoft': 'listar' },
          body: apiBody,
        });
        const text   = await response.text();
        const isHtml = text.trim().startsWith('<');

        apiResults.push({ url: url.pathname, auth: label, status: response.status, isHtml, preview: text.slice(0, 200) });

        if (!isHtml && response.status < 400) {
          try {
            const data = JSON.parse(text);
            return res.status(200).json({ ...data, _workingUrl: url.toString(), _auth: label });
          } catch { /* not valid JSON */ }
        }
      } catch (e) {
        apiResults.push({ url: rawUrl, auth: label, error: e.message });
      }
    }
  }

  return res.status(401).json({
    error: 'Autenticação falhou em todas as tentativas.',
    oauthAttempts: oauthLog,
    apiAttempts: apiResults.slice(0, 10),
    dica: oauthLog.length === 0
      ? 'Headers x-ixc-secret não chegaram ao proxy.'
      : 'Veja oauthAttempts para detalhes do erro OAuth.',
  });
}
