export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ixc-url, x-ixc-token, x-ixc-user, x-ixc-endpoint, x-ixc-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ixcUrl    = req.headers['x-ixc-url'];
  const ixcToken  = req.headers['x-ixc-token'];
  const ixcUser   = req.headers['x-ixc-user'] || '';
  const ixcSecret = req.headers['x-ixc-secret'] || '';
  const endpoint  = req.headers['x-ixc-endpoint'];
  const params    = req.body?.params || {};

  if (!ixcUrl || !ixcToken || !endpoint) {
    return res.status(400).json({ error: 'Missing required headers' });
  }

  const base = ixcUrl.replace(/\/$/, '').replace(/\/adm\.php$/, '');

  const apiBody = JSON.stringify({
    qtype: '', query: '', oper: '=',
    page: '1', rp: req.body?.rp || '100',
    sortname: 'id', sortorder: 'desc',
  });

  // URL candidates — /webservice/v1/ first (confirmed working via 401 diagnostic)
  const urlCandidates = [
    `${base}/webservice/v1/${endpoint}`,           // ✅ confirmed: returns 401 (API active)
    `${base}/adm.php/webservice/v1/${endpoint}`,   // fallback classic IXC
    `${base}/api/v1/${endpoint}`,
  ];

  // Auth candidates ordered by most likely to work
  const buildAuths = () => {
    const auths = [];
    if (ixcUser && ixcToken) auths.push({ label: 'Basic user:token',   value: `Basic ${Buffer.from(`${ixcUser}:${ixcToken}`).toString('base64')}` });
    auths.push({                           label: 'Basic token:',       value: `Basic ${Buffer.from(`${ixcToken}:`).toString('base64')}` });
    if (ixcUser && ixcSecret) auths.push({ label: 'Basic user:secret', value: `Basic ${Buffer.from(`${ixcUser}:${ixcSecret}`).toString('base64')}` });
    auths.push({                           label: 'Bearer token',       value: `Bearer ${ixcToken}` });
    return auths;
  };

  const results = [];

  for (const rawUrl of urlCandidates) {
    const url = new URL(rawUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

    for (const { label, value } of buildAuths()) {
      try {
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Authorization': value,
            'Content-Type': 'application/json',
            'ixcsoft': 'listar',
          },
          body: apiBody,
        });

        const text   = await response.text();
        const isHtml = text.trim().startsWith('<');

        results.push({ url: url.pathname, auth: label, status: response.status, isHtml, preview: text.slice(0, 200) });

        // Success
        if (!isHtml && response.status >= 200 && response.status < 400) {
          try {
            const data = JSON.parse(text);
            return res.status(200).json({ ...data, _workingUrl: url.toString(), _auth: label });
          } catch { /* not JSON */ }
        }
      } catch (e) {
        results.push({ url: rawUrl, auth: label, error: e.message });
      }
    }
  }

  // Find best clue from results
  const got401 = results.find(r => r.status === 401 && !r.isHtml);
  const hint = got401
    ? `Endpoint correto (${got401.url}) mas credenciais inválidas. Gere um novo token em: IXC → Usuários → Gerar token API`
    : 'Nenhum endpoint respondeu como API. Verifique se a URL está correta.';

  return res.status(401).json({ error: 'Autenticação falhou.', hint, results });
}
