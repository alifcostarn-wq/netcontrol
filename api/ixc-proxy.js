export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ixc-url, x-ixc-token, x-ixc-endpoint');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ixcUrl   = req.headers['x-ixc-url'];
  const ixcToken = req.headers['x-ixc-token'];
  const endpoint = req.headers['x-ixc-endpoint'];
  const params   = req.body?.params || {};

  if (!ixcUrl || !ixcToken || !endpoint) {
    return res.status(400).json({ error: 'Missing x-ixc-url, x-ixc-token or x-ixc-endpoint headers' });
  }

  try {
    const base = ixcUrl.replace(/\/$/, '').replace(/\/adm\.php$/, '');
    const url = new URL(`${base}/adm.php/webservice/v1/${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ixcToken}:`).toString('base64'),
        'Content-Type': 'application/json',
        'ixcsoft': 'listar',
      },
      body: JSON.stringify({
        qtype: '', query: '', oper: '=',
        page: '1', rp: req.body?.rp || '100',
        sortname: 'id', sortorder: 'desc',
      }),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `IXC returned HTTP ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
