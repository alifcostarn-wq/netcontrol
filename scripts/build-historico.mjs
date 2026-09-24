#!/usr/bin/env node
// Gera os dados reais de votação por seção a partir dos boletins de urna (BU) oficiais
// publicados pelo TSE em resultados.tse.jus.br (área "arquivo-urna").
//
// Uso:
//   node scripts/build-historico.mjs --uf RN --mun-nome "MOSSORO" --anos 2022,2024
//   node scripts/build-historico.mjs --uf RN --mun 17590 --anos 2024
//   node scripts/build-historico.mjs --uf RN --todos --anos 2024
//
// Grava um arquivo por município e ano em data/historico/ e atualiza data/historico/index.json.
// Não precisa de "npm install": usa só o Node (versão 18 ou mais nova).
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://resultados.tse.jus.br/oficial';
// Códigos dos pleitos (arquivo-urna) e das eleições (resultados) de cada ano
const ANOS = {
  2022: { ciclo: 'ele2022', nome: 'Eleições Gerais 2022', turnos: [{ t: 1, pl: '406', ele: ['544', '546'] }, { t: 2, pl: '407', ele: ['545', '547'] }], resultados: false },
  2024: { ciclo: 'ele2024', nome: 'Eleições Municipais 2024', turnos: [{ t: 1, pl: '452', ele: ['619'] }, { t: 2, pl: '453', ele: ['620'] }], resultados: true },
};
const CARGOS = { PRESIDENTE: 1, GOVERNADOR: 3, SENADOR: 5, 'DEPUTADO FEDERAL': 6, 'DEPUTADO ESTADUAL': 7, 'DEPUTADO DISTRITAL': 8, PREFEITO: 11, VEREADOR: 13 };
const NOME_CARGO = { 1: 'Presidente', 3: 'Governador', 5: 'Senador', 6: 'Deputado Federal', 7: 'Deputado Estadual', 8: 'Deputado Distrital', 11: 'Prefeito', 13: 'Vereador' };

/* ------------------------------------------------------------------ argumentos */
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2), v = process.argv[i + 1];
  if (v == null || v.startsWith('--')) args[k] = true; else { args[k] = v; i++; }
}
const UF = String(args.uf || '').toLowerCase();
const anos = String(args.anos || '2024').split(',').map(s => s.trim()).filter(Boolean);
const SAIDA = path.resolve(args.saida || 'data/historico');
const CONC = Math.max(1, Math.min(16, +(args.concorrencia || 8)));
if (!/^[a-z]{2}$/.test(UF) || (!args.todos && !args.mun && !args['mun-nome'])) {
  console.error('Uso: node scripts/build-historico.mjs --uf RN (--mun 17590 | --mun-nome "MOSSORO" | --todos) [--anos 2022,2024]');
  process.exit(1);
}
for (const a of anos) if (!ANOS[a]) { console.error(`Ano ${a} não suportado. Anos disponíveis: ${Object.keys(ANOS).join(', ')}`); process.exit(1); }

/* ------------------------------------------------------------------ utilidades */
const pad = (n, w) => String(n).padStart(w, '0');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const slug = s => norm(s).toLowerCase().replace(/ /g, '-');
const dorme = ms => new Promise(r => setTimeout(r, ms));
let n404 = 0, nReq = 0, lim404 = 400;
async function baixar(url, tipo = 'json', tentativas = 4) {
  for (let t = 1; ; t++) {
    try {
      nReq++;
      const r = await fetch(url, { headers: { Accept: '*/*' }, signal: AbortSignal.timeout(45000) });
      if (r.status === 404) {
        // o TSE bloqueia IPs que geram muitos 404: para antes disso
        if (++n404 > lim404) throw new Error('Muitos arquivos inexistentes; interrompido para não ser bloqueado pelo TSE.');
        return null;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (tipo === 'json') return JSON.parse(await r.text());
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (/Muitos arquivos/.test(e.message) || t >= tentativas) throw new Error(`${url}: ${e.message}`);
      await dorme(1000 * t * t);
    }
  }
}
async function pool(itens, n, fn) {
  let i = 0;
  const w = async () => { while (i < itens.length) { const k = i++; await fn(itens[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, w));
}

/* ------------------------------------------------------------------ leitura do boletim de urna (imagem em texto) */
function lerBU(buf) {
  const texto = buf.toString('latin1');
  const bu = { mun: '', zona: 0, local: 0, secao: 0, aptos: 0, comp: 0, cargos: [], partidos: new Map() };
  let cargo = null, partido = null, pendente = null;
  for (const bruta of texto.split(/\r?\n/)) {
    const l = bruta.replace(/\s+$/, '');
    if (/ASSINATURA QR CODE/.test(l)) break;
    let m;
    if ((m = l.match(/^-{3,}\s*([A-ZÀ-Ü][A-ZÀ-Ü .]*[A-ZÀ-Ü])\s*-{3,}$/))) {
      const nome = m[1].trim();
      if (CARGOS[nome]) { cargo = { nome, cd: CARGOS[nome], cands: [], leg: [], brancos: 0, nulos: 0 }; bu.cargos.push(cargo); partido = null; pendente = null; }
      continue;
    }
    if (!cargo) {
      if ((m = l.match(/^Munic[ií]pio\s+(\d+)$/))) bu.mun = m[1];
      else if ((m = l.match(/^Zona Eleitoral\s+(\d+)$/))) bu.zona = +m[1];
      else if ((m = l.match(/^Local de Vota[çc][ãa]o\s+(\d+)$/))) bu.local = +m[1];
      else if ((m = l.match(/^Se[çc][ãa]o Eleitoral\s+(\d+)$/))) bu.secao = +m[1];
      else if ((m = l.match(/^Eleitores aptos\s+(\d+)$/)) && !bu.aptos) bu.aptos = +m[1];
      else if ((m = l.match(/^Comparecimento\s+(\d+)$/)) && !bu.comp) bu.comp = +m[1];
      continue;
    }
    if ((m = l.match(/^Partido:\s*(\d+)\s*-\s*(.+)$/))) { partido = m[1]; bu.partidos.set(m[1], m[2].trim()); continue; }
    if ((m = l.match(/^\s*Votos de legenda\s+(\d+)$/))) { if (partido) cargo.leg.push({ nr: partido, q: +m[1] }); continue; }
    if ((m = l.match(/^\s*Brancos\s+(\d+)$/))) { cargo.brancos = +m[1]; continue; }
    if ((m = l.match(/^\s*Nulos\s+(\d+)$/))) { cargo.nulos = +m[1]; continue; }
    if ((m = l.match(/^\s*-+>\s+(\d{2,5})\s+(\d{1,5})$/)) && pendente) { cargo.cands.push({ nr: m[1], nm: pendente, q: +m[2] }); pendente = null; continue; }
    if ((m = l.match(/^ {2}(\S.*?)-{2,}$/))) { pendente = m[1].trim(); continue; }
    if ((m = l.match(/^ {2}(\S.*?)\s{2,}(\d{2,5})\s+(\d{1,5})$/))) { cargo.cands.push({ nr: m[2], nm: m[1].trim(), q: +m[3] }); continue; }
  }
  return bu;
}

/* ------------------------------------------------------------------ leitura do boletim de urna binário (.bu, ASN.1 DER)
   Usado quando o TSE não publica a versão em texto. Estrutura (especificação "bu.asn1" do TSE):
   envelope { ..., identificacao { municipioZona { municipio, zona }, local, secao }, ..., conteudo OCTET STRING }
   conteudo = EntidadeBoletimUrna { ..., [3] resultadosVotacaoPorEleicao SEQUENCE OF {
     idEleicao, qtdEleitoresAptos, SEQUENCE OF { tipoCargo, qtdComparecimento, SEQUENCE OF TotalVotosCargo {
       codigoCargo ([1] cargo constitucional), ordemImpressao, SEQUENCE OF TotalVotosVotavel {
         [1] tipoVoto (1 nominal, 2 branco, 3 nulo, 4 legenda), [2] quantidadeVotos, [3] { partido, numero }, assinatura } } } } } */
function derFilhos(b, ini, fim) {
  const out = [];
  let i = ini;
  while (i < fim) {
    const t = b[i++];
    let num = t & 0x1f;
    if (num === 0x1f) { num = 0; let x; do { x = b[i++]; num = num * 128 + (x & 0x7f); } while (x & 0x80); }
    let len = b[i++];
    if (len & 0x80) { const n = len & 0x7f; len = 0; for (let k = 0; k < n; k++) len = len * 256 + b[i++]; }
    out.push({ cls: t >> 6, cons: !!(t & 0x20), num, ini: i, fim: i + len });
    i += len;
  }
  return out;
}
const derInt = (b, n) => { let v = 0; for (let i = n.ini; i < n.fim; i++) v = v * 256 + b[i]; if (n.fim > n.ini && b[n.ini] & 0x80) v -= 2 ** (8 * (n.fim - n.ini)); return v; };
const derSub = (b, n) => derFilhos(b, n.ini, n.fim);
function lerBUbin(buf) {
  const bu = { mun: '', zona: 0, local: 0, secao: 0, aptos: 0, comp: 0, cargos: [], partidos: new Map() };
  const env = derSub(buf, derFilhos(buf, 0, buf.length)[0]);
  const conteudo = env.find(n => n.cls === 0 && n.num === 4 && n.fim - n.ini > 100);
  if (!conteudo) return bu;
  const b = buf.subarray(conteudo.ini, conteudo.fim);
  const topo = derSub(b, derFilhos(b, 0, b.length)[0]);
  // identificação da seção: SEQUENCE { SEQUENCE { municipio, zona }, local, secao }
  for (const n of topo) {
    if (n.cls !== 0 || n.num !== 16) continue;
    const f = derSub(b, n);
    if (f.length === 3 && f[0].cons && !f[1].cons && !f[2].cons) {
      const mz = derSub(b, f[0]);
      if (mz.length === 2) { bu.mun = pad(derInt(b, mz[0]), 5); bu.zona = derInt(b, mz[1]); bu.local = derInt(b, f[1]); bu.secao = derInt(b, f[2]); }
    }
  }
  // 2022: resultados em [3]; 2024: numa SEQUENCE comum (a maior do boletim)
  const res = topo.find(n => n.cls === 2 && n.num === 3 && n.cons) ||
    topo.filter(n => n.cons && n.cls === 0 && n.num === 16).sort((x, y) => (y.fim - y.ini) - (x.fim - x.ini))[0];
  if (!res) return bu;
  const primeiraLista = nos => nos.find(n => n.cons);
  for (const elei of derSub(b, res)) {
    const f = derSub(b, elei);
    const rvs = primeiraLista(f);
    if (!rvs) continue;
    if (!bu.aptos) bu.aptos = derInt(b, f[1]);
    for (const rv of derSub(b, rvs)) {
      const g = derSub(b, rv);
      if (!bu.comp) bu.comp = derInt(b, g[1]);
      const tcs = primeiraLista(g);
      if (!tcs) continue;
      for (const tc of derSub(b, tcs)) {
        const h = derSub(b, tc);
        if (h[0].cls !== 2 || h[0].num !== 1 || h[0].cons) continue; // só cargos constitucionais
        const cd = derInt(b, h[0]);
        if (!NOME_CARGO[cd]) continue;
        const cargo = { nome: NOME_CARGO[cd].toUpperCase(), cd, cands: [], leg: [], brancos: 0, nulos: 0 };
        const lista = h.filter(n => n.cons).pop();
        if (!lista) continue;
        for (const vv of derSub(b, lista)) {
          let tipo = 0, q = 0, id = null;
          for (const x of derSub(b, vv)) {
            if (x.cls !== 2) continue;
            if (x.num === 1 && !x.cons) tipo = derInt(b, x);
            else if (x.num === 2 && !x.cons) q = derInt(b, x);
            else if (x.num === 3 && x.cons) id = derSub(b, x).map(y => derInt(b, y));
          }
          if (tipo === 1 && id) cargo.cands.push({ nr: String(id[1]), nm: null, q });
          else if (tipo === 4 && id) cargo.leg.push({ nr: String(id[0]), q });
          else if (tipo === 2) cargo.brancos += q;
          else cargo.nulos += q;
        }
        bu.cargos.push(cargo);
      }
    }
  }
  return bu;
}
// Nomes vistos nos boletins em texto (cargos estaduais e federais valem para todo o estado)
const NOMES = new Map(), SIGLAS = new Map();

/* ------------------------------------------------------------------ montagem de um município */
function novoDoc(ano, uf, mun) {
  return {
    versao: 1, ano: +ano, uf: uf.toUpperCase(), municipio: { cd: mun.cd, nm: mun.nm },
    gerado_em: new Date().toISOString(),
    fonte: 'TSE — boletins de urna oficiais (resultados.tse.jus.br, arquivo-urna)' + (ANOS[ano].resultados ? ' e resultado oficial por município' : ''),
    locais_completos: false, avisos: [], locais: [], secoes: [], eleicoes: [],
    _locais: new Map(), _secoes: new Map(), _eleicoes: new Map(), _partidos: new Map(), _semBU: 0,
  };
}
function addSecao(doc, bu) {
  const kl = bu.zona + '|' + bu.local;
  let li = doc._locais.get(kl);
  if (li == null) { li = doc.locais.length; doc._locais.set(kl, li); doc.locais.push({ z: bu.zona, n: bu.local, nm: null, bairro: null, end: null, lat: null, lon: null }); }
  const ks = bu.zona + '|' + bu.secao;
  let si = doc._secoes.get(ks);
  if (si == null) { si = doc.secoes.length; doc._secoes.set(ks, si); doc.secoes.push([li, bu.zona, bu.secao, bu.aptos, bu.comp]); }
  return si;
}
function eleicao(doc, turno, cargo) {
  const k = turno + '|' + cargo.cd;
  let E = doc._eleicoes.get(k);
  if (!E) { E = { turno, cargo: cargo.cd, ds: NOME_CARGO[cargo.cd], cand: [], v: [], _idx: new Map() }; doc._eleicoes.set(k, E); doc.eleicoes.push(E); }
  return E;
}
function idx(E, chave, novo) {
  let i = E._idx.get(chave);
  if (i == null) { i = E.cand.length; E._idx.set(chave, i); E.cand.push(novo()); }
  return i;
}
function addBU(doc, turno, bu) {
  const si = addSecao(doc, bu);
  for (const [nr, sg] of bu.partidos) { doc._partidos.set(nr, sg); SIGLAS.set(nr, sg); }
  for (const c of bu.cargos) {
    const E = eleicao(doc, turno, c);
    const push = (i, q) => { if (q > 0) E.v.push(si, i, q); };
    for (const x of c.cands) {
      if (x.nm) NOMES.set(c.cd + '|' + x.nr, x.nm);
      const i = idx(E, 'c' + x.nr, () => ({ nr: x.nr, nm: x.nm, sg: '', sit: '', tipo: 'c' }));
      if (!E.cand[i].nm && x.nm) E.cand[i].nm = x.nm;
      push(i, x.q);
    }
    for (const x of c.leg) push(idx(E, 'l' + x.nr, () => ({ nr: x.nr, nm: 'Legenda', sg: '', tipo: 'l' })), x.q);
    push(idx(E, 'b', () => ({ nr: '95', nm: 'Brancos', tipo: 'b' })), c.brancos);
    push(idx(E, 'n', () => ({ nr: '96', nm: 'Nulos', tipo: 'n' })), c.nulos);
  }
}
async function completarCandidatos(doc, ano, uf, mun) {
  const A = ANOS[ano];
  for (const E of doc.eleicoes) {
    // partido de cada candidato pelos 2 primeiros dígitos do número
    for (const c of E.cand) {
      if (c.tipo === 'c' || c.tipo === 'l') {
        const sg = doc._partidos.get(String(c.nr).slice(0, 2)) || SIGLAS.get(String(c.nr).slice(0, 2)) || '';
        if (c.tipo === 'c' && !c.nm) c.nm = NOMES.get(E.cargo + '|' + c.nr) || `Candidato nº ${c.nr}`;
        c.sg = sg;
        if (c.tipo === 'l') c.nm = sg ? 'Legenda ' + sg : 'Legenda ' + c.nr;
      }
    }
    if (!A.resultados) continue;
    // situação oficial (eleito, suplente...) e partido pelo resultado do município
    const T = A.turnos.find(t => t.t === E.turno);
    for (const ele of T.ele) {
      const j = await baixar(`${BASE}/${A.ciclo}/${ele}/dados/${uf}/${uf}${mun.cd}-c${pad(E.cargo, 4)}-e${pad(ele, 6)}-u.json`);
      const cg = j?.carg?.[0];
      if (!cg) continue;
      const porNr = new Map();
      for (const a of cg.agr || []) for (const p of a.par || []) for (const c of p.cand || []) porNr.set(String(c.n), { c, sg: p.sg });
      for (const c of E.cand) {
        if (c.tipo !== 'c') continue;
        const r = porNr.get(String(c.nr));
        if (!r) continue;
        c.nm = r.c.nmu || c.nm;
        c.sg = r.sg || c.sg;
        c.sit = r.c.st || '';
        if (r.c.sqcand) c.sq = String(r.c.sqcand); // foto oficial: resultados.tse.jus.br/.../fotos/<uf>/<sq>.jpeg
        if (/anulad/i.test(r.c.dvt || '')) c.anulado = true;
      }
      break;
    }
  }
}
function finalizar(doc) {
  for (const E of doc.eleicoes) delete E._idx;
  doc.eleicoes.sort((a, b) => a.turno - b.turno || a.cargo - b.cargo);
  if (doc._semBU) doc.avisos.push(`${doc._semBU} seção(ões) sem boletim próprio — em geral são seções agregadas, cujos votos entram no boletim de outra seção.`);
  doc.avisos.push('Nome, bairro e endereço dos locais de votação vêm do cadastro de locais do TSE (importe em Ajuda › Locais de votação).');
  for (const k of ['_locais', '_secoes', '_eleicoes', '_partidos', '_semBU']) delete doc[k];
  return doc;
}

/* ------------------------------------------------------------------ principal */
fs.mkdirSync(SAIDA, { recursive: true });
const indicePath = path.join(SAIDA, 'index.json');
const indice = fs.existsSync(indicePath) ? JSON.parse(fs.readFileSync(indicePath, 'utf8')) : { versao: 1, datasets: [] };
indice.datasets = (indice.datasets || []).filter(d => d.origem !== 'demo');

for (const ano of anos) {
  const A = ANOS[ano];
  const docs = new Map();
  for (const T of A.turnos) {
    const cfg = await baixar(`${BASE}/${A.ciclo}/arquivo-urna/${T.pl}/config/${UF}/${UF}-p${pad(T.pl, 6)}-cs.json`);
    const mus = cfg?.abr?.[0]?.mu || [];
    if (!mus.length) { console.log(`${ano} ${T.t}º turno: sem urnas publicadas para ${UF.toUpperCase()}`); continue; }
    const alvo = mus.filter(m => args.todos || (args.mun && m.cd === String(args.mun).padStart(5, '0')) || (args['mun-nome'] && norm(m.nm) === norm(args['mun-nome'])));
    if (!alvo.length && T.t === 1) { console.error(`Município não encontrado em ${UF.toUpperCase()}.`); process.exit(1); }
    const secoes = [];
    for (const m of alvo) {
      if (!docs.has(m.cd)) docs.set(m.cd, novoDoc(ano, UF, m));
      for (const z of m.zon) for (const s of z.sec) secoes.push({ m, z: z.cd, s: s.ns });
    }
    if (!secoes.length) continue;
    console.log(`${ano} ${T.t}º turno: ${alvo.length} município(s), ${secoes.length} seções`);
    lim404 = Math.max(lim404, n404 + 400 + Math.ceil(secoes.length * 0.05));
    let feitas = 0;
    const t0 = Date.now();
    await pool(secoes, CONC, async ({ m, z, s }) => {
      const doc = docs.get(m.cd);
      const dir = `${BASE}/${A.ciclo}/arquivo-urna/${T.pl}/dados/${UF}/${m.cd}/${z}/${s}`;
      const aux = await baixar(`${dir}/p${pad(T.pl, 6)}-${UF}-m${m.cd}-z${z}-s${s}-aux.json`);
      const hs = aux?.hashes || [];
      const h = hs.find(x => /totalizad/i.test(x.st || '')) || hs[hs.length - 1];
      // prefere a versão em texto (tem os nomes); senão lê o boletim binário
      const arqs = h?.arq || (h?.nmarq || []).map(nm => ({ nm, tp: nm.split('.').pop() }));
      const img = arqs.find(a => /imgbu/.test(a.tp) || /imgbu/.test(a.nm));
      const bin = arqs.find(a => a.tp === 'bu' || /[.-]bu(\.dat)?$/.test(a.nm));
      const arq = img || bin;
      const buf = arq ? await baixar(`${dir}/${h.hash}/${arq.nm}`, 'bin') : null;
      if (!buf) { doc._semBU++; }
      else {
        const bu = arq === img ? lerBU(buf) : lerBUbin(buf);
        if (!bu.zona) bu.zona = +z;
        if (!bu.secao) bu.secao = +s;
        addBU(doc, T.t, bu);
      }
      if (++feitas % (secoes.length > 3000 ? 1000 : 200) === 0) process.stdout.write(`  ${feitas}/${secoes.length} (${Math.round(feitas / ((Date.now() - t0) / 1000))}/s)\n`);
    });
  }
  for (const [cd, doc] of docs) {
    if (!doc.eleicoes.length) continue;
    await completarCandidatos(doc, ano, UF, doc.municipio);
    finalizar(doc);
    const arquivo = `${UF}-${cd}-${slug(doc.municipio.nm)}-${ano}.json`;
    fs.writeFileSync(path.join(SAIDA, arquivo), JSON.stringify(doc));
    indice.datasets = indice.datasets.filter(d => !(d.ano === +ano && d.uf === UF.toUpperCase() && d.cd === cd));
    indice.datasets.push({ ano: +ano, uf: UF.toUpperCase(), cd, nm: doc.municipio.nm, arquivo, secoes: doc.secoes.length,
      cargos: [...new Map(doc.eleicoes.map(e => [e.cargo, { cd: e.cargo, ds: e.ds }])).values()], gerado_em: doc.gerado_em });
    console.log(`✔ ${arquivo} — ${doc.secoes.length} seções, ${doc.locais.length} locais`);
  }
}
indice.datasets.sort((a, b) => a.uf.localeCompare(b.uf) || a.nm.localeCompare(b.nm) || a.ano - b.ano);
indice.gerado_em = new Date().toISOString();
fs.writeFileSync(indicePath, JSON.stringify(indice, null, 1));
console.log(`Pronto. ${nReq} arquivos lidos do TSE.`);
