#!/usr/bin/env node
// Publica um pacote gerado em Ajuda › "Importar votos de outro ano" (votos-UF-ANO.json):
// grava um arquivo por município em data/historico/ e atualiza data/historico/index.json.
// Uso: node scripts/publicar-pacote.mjs votos-rn-2020.json
import fs from 'node:fs';
import path from 'node:path';

const arq = process.argv[2];
if (!arq) { console.error('Uso: node scripts/publicar-pacote.mjs votos-rn-2020.json'); process.exit(1); }
const pac = JSON.parse(fs.readFileSync(arq, 'utf8'));
if (pac.tipo !== 'pacote' || !Array.isArray(pac.docs)) { console.error('Arquivo não é um pacote do Radar de Votos.'); process.exit(1); }
const SAIDA = path.resolve('data/historico');
const indicePath = path.join(SAIDA, 'index.json');
const indice = JSON.parse(fs.readFileSync(indicePath, 'utf8'));
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let n = 0;
for (const d of pac.docs) {
  if (d.versao !== 1 || !d.municipio?.cd || !Array.isArray(d.eleicoes)) continue;
  const uf = String(d.uf).toUpperCase(), cd = String(d.municipio.cd), ano = +d.ano;
  if (!/^[A-Z]{2}$/.test(uf) || !/^\d{5}$/.test(cd) || !(ano > 1990 && ano < 2100)) continue;
  const nome = `${uf.toLowerCase()}-${cd}-${slug(d.municipio.nm)}-${ano}.json`;
  fs.writeFileSync(path.join(SAIDA, nome), JSON.stringify(d));
  indice.datasets = indice.datasets.filter(x => !(x.ano === ano && x.uf === uf && x.cd === cd));
  indice.datasets.push({ ano, uf, cd, nm: d.municipio.nm, arquivo: nome, secoes: d.secoes.length,
    cargos: [...new Map(d.eleicoes.map(e => [e.cargo, { cd: e.cargo, ds: e.ds }])).values()], gerado_em: d.gerado_em });
  n++;
}
indice.datasets.sort((a, b) => a.uf.localeCompare(b.uf) || a.nm.localeCompare(b.nm) || a.ano - b.ano);
indice.gerado_em = new Date().toISOString();
fs.writeFileSync(indicePath, JSON.stringify(indice, null, 1));
console.log(`${n} municípios de ${pac.uf} ${pac.ano} publicados em data/historico/.`);
