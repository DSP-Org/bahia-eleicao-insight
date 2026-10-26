#!/usr/bin/env node
// Acrescenta o 2º turno de Presidente (eleição 6258) aos dados de public/data sem tocar no 1º turno.
//   node scripts/gerar-2turno.mjs
// Grava public/data/mun-presidente-2t.json e substitui/insere o cargo "presidente-2t" em meta.json.
// Confere 417 municípios 100% apurados e soma municipal = total oficial; se falhar, nada é gravado.
import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DADOS = path.join(RAIZ, "public", "data");
const TSE = "https://resultados.tse.jus.br/oficial/ele2026/6258/dados";
const TAG = "c0001-e006258";
const SLUG = "presidente-2t";
const H = { "User-Agent": "Mozilla/5.0 Chrome/130" };
const int = (x) => Number.parseInt(x ?? 0, 10) || 0;
const num = (x) => Number.parseFloat(String(x ?? "0").replace(",", ".")) || 0;

async function baixar(url) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(30_000) });
      if (r.ok) return await r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  throw new Error(`falha: ${url}`);
}
const cands = (d) => (d?.carg ?? []).flatMap((c) => c.agr ?? []).flatMap((a) => (a.par ?? []).map((p) => ({ a, p }))).flatMap(({ a, p }) => (p.cand ?? []).map((c) => ({ a, p, c })));
const gravar = async (f, d) => { await writeFile(`${f}.tmp`, JSON.stringify(d)); await rename(`${f}.tmp`, f); };

const municipios = JSON.parse(await readFile(path.join(DADOS, "municipios.json"), "utf8"));
const meta = JSON.parse(await readFile(path.join(DADOS, "meta.json"), "utf8"));
const estado = await baixar(`${TSE}/ba/ba-${TAG}-u.json`);
const docs = [];
for (let i = 0; i < municipios.length; i += 16)
  docs.push(...(await Promise.all(municipios.slice(i, i + 16).map((m) => baixar(`${TSE}/ba/ba${m.tse}-${TAG}-u.json`)))));

const erros = [];
if (estado.s?.pst !== "100,00" || estado.tf !== "s") erros.push("arquivo estadual não finalizado");
const incompletos = docs.filter((d) => d.s?.pst !== "100,00").length;
if (incompletos) erros.push(`${incompletos} municípios sem 100% apurado`);
const soma = new Map();
for (const d of docs) for (const { c } of cands(d)) soma.set(c.sqcand, (soma.get(c.sqcand) ?? 0) + int(c.vap));
const div = cands(estado).filter(({ c }) => int(c.vap) !== soma.get(c.sqcand));
if (div.length) erros.push(`${div.length} candidatos com soma municipal diferente do total`);
if (erros.length) { console.error("FALHOU:", erros); process.exit(1); }

const carg = estado.carg[0];
// Sufixo "-2t" no id: o TSE usa o mesmo código de candidato nos dois turnos.
const candidatos = cands(estado).map(({ a, p, c }) => {
  const st = (c.st ?? "").trim();
  return {
    id: `${c.sqcand}-2t`, n: c.n, nome: c.nmu || c.nm, nomeCompleto: c.nm, partido: p.sg,
    agr: a.nm, agrCom: a.com, fed: p.nfed ?? "", votos: int(c.vap), pct: num(c.pvapn),
    situacao: st, eleito: c.e === "s", valido: c.dvt, vice: (c.vs ?? []).map((v) => `${v.nmu} (${v.sgp})`),
    agrId: a.n, sit: st || "Aguardando TSE", sitTipo: /^eleito/i.test(st) ? "eleito" : st ? "nao_eleito" : "aguardando", proj: false,
  };
}).sort((x, y) => y.votos - x.votos);
const indice = new Map(candidatos.map((c, i) => [c.id.replace(/-2t$/, ""), i]));

const mun = {};
municipios.forEach((m, i) => {
  const d = docs[i]; const v = {};
  for (const { c } of cands(d)) if (int(c.vap) > 0) v[indice.get(c.sqcand)] = int(c.vap);
  mun[m.tse] = { el: int(d.e.te), co: int(d.e.c), ab: int(d.e.a), vv: int(d.v.vv), vb: int(d.v.vb), vn: int(d.v.tvn), pst: num(d.s.pstn ?? d.s.pst), v, tv: int(d.v.tv) };
});

const cargo = {
  cd: "1", slug: SLUG, nome: "Presidente – 2º turno", vagas: int(carg.nv), qe: 0,
  resumo: {
    secTot: int(estado.s.ts), secTotz: int(estado.s.st), pst: num(estado.s.pstn ?? estado.s.pst),
    eleitores: int(estado.e.te), comp: int(estado.e.c), abst: int(estado.e.a), validos: int(estado.v.vv),
    brancos: int(estado.v.vb), nulos: int(estado.v.tvn), legenda: 0, total: int(estado.v.tv), hora: `${estado.dg} ${estado.hg}`,
  },
  candidatos,
  partidos: (carg.agr ?? []).flatMap((a) => (a.par ?? []).map((p) => ({ sg: p.sg, n: p.n, nm: p.nm, fed: p.nfed ?? "", agr: a.nm, agrCom: a.com, votosTot: int(p.tvtn), legenda: int(p.tvtl) }))),
  federacoes: Object.fromEntries((carg.fed ?? []).map((f) => [f.n, f.sg])),
  totalizacaoFinal: true, parciais: [], turno: 2,
};
const i1 = meta.cargos.findIndex((c) => c.slug === "presidente");
meta.cargos = meta.cargos.filter((c) => c.slug !== SLUG);
meta.cargos.splice(i1 + 1, 0, cargo);
await gravar(path.join(DADOS, `mun-${SLUG}.json`), mun);
await gravar(path.join(DADOS, "meta.json"), meta);
console.log("OK", candidatos.map((c) => `${c.nome} ${c.votos}`).join(" | "));
