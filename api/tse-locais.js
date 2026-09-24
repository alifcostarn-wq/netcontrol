// Locais de votação (bairro, endereço e coordenadas) do Portal de Dados Abertos do TSE.
// O arquivo oficial é nacional e só pode ser baixado de dentro do Brasil, por isso esta função
// roda na região de São Paulo (ver vercel.json) e devolve apenas os locais da UF pedida.
import zlib from 'node:zlib';

const URL_TSE = ano => `https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_${ano}.zip`;
const ANOS = new Set(['2018', '2020', '2022', '2024', '2026']);

// Lê o diretório central do ZIP e devolve as entradas (nome, método, tamanhos, deslocamento)
function entradasZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP inválido');
  let total = buf.readUInt16LE(eocd + 10), inicio = buf.readUInt32LE(eocd + 16);
  // ZIP64
  if (inicio === 0xffffffff && buf.readUInt32LE(eocd - 20) === 0x07064b50) {
    const z64 = Number(buf.readBigUInt64LE(eocd - 12));
    total = Number(buf.readBigUInt64LE(z64 + 32));
    inicio = Number(buf.readBigUInt64LE(z64 + 48));
  }
  const out = [];
  let p = inicio;
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    let comp = buf.readUInt32LE(p + 20), orig = buf.readUInt32LE(p + 24);
    const nLen = buf.readUInt16LE(p + 28), xLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    let local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('latin1', p + 46, p + 46 + nLen);
    // campos ZIP64 no "extra"
    let x = p + 46 + nLen;
    const fimX = x + xLen;
    while (x + 4 <= fimX) {
      const id = buf.readUInt16LE(x), sz = buf.readUInt16LE(x + 2);
      if (id === 0x0001) {
        let q = x + 4;
        if (orig === 0xffffffff) { orig = Number(buf.readBigUInt64LE(q)); q += 8; }
        if (comp === 0xffffffff) { comp = Number(buf.readBigUInt64LE(q)); q += 8; }
        if (local === 0xffffffff) { local = Number(buf.readBigUInt64LE(q)); }
      }
      x += 4 + sz;
    }
    out.push({ nome, metodo, comp, orig, local });
    p = fimX + cLen;
  }
  return out;
}

function dadosEntrada(buf, e) {
  const n = buf.readUInt16LE(e.local + 26), x = buf.readUInt16LE(e.local + 28);
  return buf.subarray(e.local + 30 + n + x, e.local + 30 + n + x + e.comp);
}

// Separa uma linha CSV do TSE (";" com campos entre aspas)
function campos(linha) {
  const out = [];
  let i = 0;
  while (i <= linha.length) {
    if (linha[i] === '"') {
      let v = '', j = i + 1;
      for (;;) {
        const q = linha.indexOf('"', j);
        if (q < 0) { v += linha.slice(j); i = linha.length + 1; break; }
        v += linha.slice(j, q);
        if (linha[q + 1] === '"') { v += '"'; j = q + 2; continue; }
        i = q + 2; break;
      }
      out.push(v);
    } else {
      const f = linha.indexOf(';', i);
      if (f < 0) { out.push(linha.slice(i)); break; }
      out.push(linha.slice(i, f)); i = f + 1;
    }
  }
  return out;
}

const coord = s => { const n = parseFloat(String(s || '').replace(',', '.')); return isFinite(n) && n !== -1 && n !== 0 ? Math.round(n * 1e6) / 1e6 : null; };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ano = String(req.query.ano || '');
  const uf = String(req.query.uf || '').toUpperCase();
  const mun = String(req.query.mun || '').replace(/\D/g, '');
  if (!ANOS.has(ano)) return res.status(400).json({ error: 'Ano inválido' });
  if (!/^[A-Z]{2}$/.test(uf)) return res.status(400).json({ error: 'UF inválida' });

  let buf;
  try {
    const r = await fetch(URL_TSE(ano), { headers: { 'User-Agent': 'Mozilla/5.0 (RadarDeVotos)', Accept: '*/*' } });
    if (!r.ok) return res.status(502).json({ error: 'TSE respondeu ' + r.status, regiao: process.env.VERCEL_REGION || null });
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    return res.status(502).json({ error: 'Falha ao acessar o TSE', regiao: process.env.VERCEL_REGION || null });
  }

  let entrada;
  try {
    entrada = entradasZip(buf).find(e => /\.csv$/i.test(e.nome) && (e.nome.toUpperCase().includes('_' + uf + '.') || !/_[A-Z]{2}\.csv$/i.test(e.nome)));
  } catch (e) { return res.status(502).json({ error: e.message }); }
  if (!entrada) return res.status(404).json({ error: 'Arquivo da UF não encontrado no ZIP' });

  const locais = new Map();
  let cab = null, idx = {}, resto = '';
  const tratar = linha => {
    if (!linha) return;
    const c = campos(linha.replace(/\r$/, ''));
    if (!cab) { cab = c; cab.forEach((h, i) => { idx[h] = i; }); return; }
    const v = k => c[idx[k]];
    if (v('SG_UF') !== uf) return;
    if (mun && v('CD_MUNICIPIO') !== mun) return;
    if (idx.NR_TURNO != null && v('NR_TURNO') && v('NR_TURNO') !== '1') return;
    const cd = v('CD_MUNICIPIO'), z = +v('NR_ZONA'), n = +v('NR_LOCAL_VOTACAO'), s = +v('NR_SECAO');
    const k = cd + '|' + z + '|' + n;
    let L = locais.get(k);
    if (!L) {
      L = { mun: cd, mun_nm: v('NM_MUNICIPIO'), z, n, nm: v('NM_LOCAL_VOTACAO'), bairro: v('NM_BAIRRO'), end: v('DS_ENDERECO'),
        lat: coord(v('NR_LATITUDE')), lon: coord(v('NR_LONGITUDE')), secoes: [] };
      locais.set(k, L);
    }
    if (!L.secoes.some(x => x[0] === s)) L.secoes.push([s, +(v('QT_ELEITOR_SECAO') || v('QT_ELEITOR') || 0) || 0]);
  };

  try {
    const inflador = entrada.metodo === 8 ? zlib.createInflateRaw() : null;
    const dados = dadosEntrada(buf, entrada);
    await new Promise((ok, erro) => {
      const fim = () => { tratar(resto); ok(); };
      if (!inflador) { const t = dados.toString('latin1').split('\n'); t.forEach(tratar); return ok(); }
      inflador.on('data', ch => {
        const t = (resto + ch.toString('latin1')).split('\n');
        resto = t.pop();
        for (const l of t) tratar(l);
      });
      inflador.on('end', fim);
      inflador.on('error', erro);
      inflador.end(dados);
    });
  } catch (e) {
    return res.status(502).json({ error: 'Falha ao ler o arquivo do TSE' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
  return res.status(200).send(JSON.stringify({
    ano: +ano, uf, fonte: URL_TSE(ano), colunas: cab, total: locais.size, locais: [...locais.values()],
  }));
}
