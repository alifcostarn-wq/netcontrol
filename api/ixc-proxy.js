export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ixc-url, x-ixc-token, x-ixc-user, x-ixc-endpoint');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ixcUrl      = req.headers['x-ixc-url'];
  const ixcToken    = req.headers['x-ixc-token'];
  const ixcUser     = req.headers['x-ixc-user'] || '';
  const endpoint    = req.headers['x-ixc-endpoint'];
  const params      = req.body?.params || {};

  if (!ixcUrl || !ixcToken || !endpoint) {
    return res.status(400).json({ error: 'Missing required headers' });
  }

  try {
    const base = ixcUrl.replace(/\/$/, '').replace(/\/adm\.php$/, '');
    const url  = new URL(`${base}/adm.php/webservice/v1/${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

    // Try both auth formats: user:token and token: (no user)
    const authString = ixcUser ? `${ixcUser}:${ixcToken}` : `${ixcToken}:`;
    const encoded    = Buffer.from(authString).toString('base64');

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encoded}`,
        'Content-Type': 'application/json',
        'ixcsoft': 'listar',
      },
      body: JSON.stringify({
        qtype: '', query: '', oper: '=',
        page: '1', rp: req.body?.rp || '100',
        sortname: 'id', sortorder: 'desc',
      }),
    });

    const text = await response.text();

    // Detect HTML response (login page redirect)
    if (text.trim().startsWith('<')) {
      return res.status(401).json({ 
        error: 'IXC retornou página HTML — token inválido ou usuário incorreto',
        hint: 'Verifique o token e o usuário de login do IXC'
      });
    }

    const data = JSON.parse(text);
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
