#!/usr/bin/env node
// Gera os arquivos de public/data a partir dos resultados oficiais do TSE (Bahia, 2026).
//
//   node scripts/gerar-dados.mjs              usa o cache em .cache/tse e baixa só o que falta
//   node scripts/gerar-dados.mjs --atualizar  baixa tudo de novo
//   node scripts/gerar-dados.mjs --saida dir  grava em outra pasta (para comparar antes de trocar)
//
// Antes de gravar, confere: 417 municípios por cargo, soma municipal de cada candidato igual ao
// total oficial e projeção de eleitos conferida contra o resultado oficial do Dep. Federal.
// Se algo falhar, nada é gravado.
//
// Formato: mantém todos os campos que o site já usa e só acrescenta campos novos
// (situação projetada, ordem de suplência, territórios, vagas por agremiação, legenda por município).
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(RAIZ, ".cache", "tse");
const args = process.argv.slice(2);
const ATUALIZAR = args.includes("--atualizar");
const SAIDA = args.includes("--saida")
  ? path.resolve(args[args.indexOf("--saida") + 1])
  : path.join(RAIZ, "public", "data");

const TSE = "https://resultados.tse.jus.br/oficial/ele2026";
const UF = "ba";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
};
const CARGOS = [
  { cd: "1", ele: 6257, slug: "presidente", nome: "Presidente", proporcional: false },
  { cd: "3", ele: 6259, slug: "governador", nome: "Governador", proporcional: false },
  { cd: "5", ele: 6259, slug: "senador", nome: "Senador", proporcional: false },
  { cd: "6", ele: 6259, slug: "deputado-federal", nome: "Deputado Federal", proporcional: true },
  { cd: "7", ele: 6259, slug: "deputado-estadual", nome: "Deputado Estadual", proporcional: true },
];

const erros = [];
const avisos = [];
const int = (x) => Number.parseInt(x ?? 0, 10) || 0;
const num = (x) => Number.parseFloat(String(x ?? "0").replace(",", ".")) || 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const semAcento = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// ------------------------------------------------------------------ download com cache

async function baixar(url, tentativas = 5) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      ultimo = e;
      await sleep(Math.min(2 ** i * 1000, 15_000));
    }
  }
  throw new Error(`falha ao baixar ${url} depois de ${tentativas} tentativas: ${ultimo?.message}`);
}

async function lerJson(arquivo) {
  return JSON.parse(await readFile(arquivo, "utf8"));
}

async function gravarJson(arquivo, dados) {
  await mkdir(path.dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.tmp`;
  await writeFile(tmp, JSON.stringify(dados));
  await rename(tmp, arquivo);
}

// Usa o cache se existir e passar no teste `ok`; senão baixa e guarda.
async function comCache(nome, url, { sempre = false, ok } = {}) {
  const arquivo = path.join(CACHE, nome);
  if (!ATUALIZAR && !sempre && existsSync(arquivo)) {
    const dados = await lerJson(arquivo);
    if (!ok || ok(dados)) return dados;
  }
  const dados = await baixar(url);
  await gravarJson(arquivo, dados);
  return dados;
}

async function emLotes(itens, tamanho, fn) {
  const saida = new Array(itens.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: tamanho }, async () => {
      while (i < itens.length) {
        const k = i++;
        saida[k] = await fn(itens[k], k);
      }
    }),
  );
  return saida;
}

const apurado = (doc) => doc?.s?.pst === "100,00";
// Percentual de seções apuradas com todas as casas decimais (campo pstn do TSE).
const pst = (doc) => num(doc?.s?.pstn ?? doc?.s?.pst);

// ------------------------------------------------------------------ fontes

async function carregarMunicipios() {
  const cfg = await comCache("config-municipios.json", `${TSE}/6259/config/mun-e006259-cm.json`);
  const ba = cfg.abr.find((a) => a.cd === UF).mu;
  const ibge = await comCache(
    "ibge-municipios-ba.json",
    "https://servicodados.ibge.gov.br/api/v1/localidades/estados/29/municipios",
  );
  // A API do IBGE grava "¿" no lugar do hífen em alguns nomes (ex.: "Ilhéus ¿ Itabuna").
  const limpa = (s) => (s ?? "").replace(/¿/g, "-");
  const porCodigo = new Map(ibge.map((m) => [String(m.id), m]));
  const territorios = await lerJson(path.join(RAIZ, "scripts", "dados", "territorios-ba.json"));
  const terrPorNome = new Map(Object.entries(territorios).map(([n, t]) => [semAcento(n), t]));
  const lista = ba.map((m) => {
    const i = porCodigo.get(m.cdi);
    const ri = i?.["regiao-imediata"];
    const ti = terrPorNome.get(semAcento(i?.nome)) ?? terrPorNome.get(semAcento(m.nm)) ?? "";
    if (!ti) erros.push(`município sem Território de Identidade: ${m.nm}`);
    return {
      tse: m.cd,
      ibge: m.cdi,
      nome: m.nm,
      ri: limpa(ri?.["regiao-intermediaria"]?.nome),
      rim: limpa(ri?.nome),
      ti,
    };
  });
  lista.sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0));
  return lista;
}

async function carregarCargo(cargo, municipios) {
  const tag = `c${cargo.cd.padStart(4, "0")}-e${String(cargo.ele).padStart(6, "0")}`;
  // O arquivo estadual traz a situação dos candidatos (eleito/suplente): sempre buscar a versão atual.
  const estado = await comCache(
    `estado/${UF}-${tag}.json`,
    `${TSE}/${cargo.ele}/dados/${UF}/${UF}-${tag}-u.json`,
    { sempre: true },
  );
  const nacional =
    cargo.slug === "presidente"
      ? await comCache(`estado/br-${tag}.json`, `${TSE}/${cargo.ele}/dados/br/br-${tag}-u.json`, {
          sempre: true,
        })
      : null;
  const falhas = [];
  const docs = await emLotes(municipios, 16, async (m) => {
    try {
      return await comCache(
        `mun/${tag}/${m.tse}.json`,
        `${TSE}/${cargo.ele}/dados/${UF}/${UF}${m.tse}-${tag}-u.json`,
        { ok: apurado },
      );
    } catch (e) {
      falhas.push(`${m.nome}: ${e.message}`);
      return null;
    }
  });
  if (falhas.length)
    erros.push(
      `${cargo.nome}: ${falhas.length} municípios não baixados (${falhas.slice(0, 3).join("; ")})`,
    );
  console.log(`  ${cargo.nome}: ${docs.filter(Boolean).length}/${municipios.length} municípios`);
  return { estado, nacional, docs };
}

// ------------------------------------------------------------------ cálculos

function* candidatosDe(doc) {
  for (const carg of doc?.carg ?? [])
    for (const agr of carg.agr ?? [])
      for (const par of agr.par ?? []) for (const c of par.cand ?? []) yield { agr, par, c };
}

// Empate de votos: fica à frente o mais idoso (Código Eleitoral, art. 110).
const nascimento = (dt) => {
  const [d, m, a] = String(dt ?? "").split("/");
  return a ? `${a}${m}${d}` : "99999999";
};

// Distribui as vagas que o TSE já calculou por agremiação (campo vag) entre os candidatos dela.
function projetar(carg) {
  const qe = int(carg.qe);
  const saida = new Map();
  for (const agr of carg.agr ?? []) {
    const vagas = int(agr.vag);
    const total = (agr.par ?? []).reduce((s, p) => s + int(p.tvtn) + int(p.tvtl), 0);
    const qp = qe ? Math.floor(total / qe) : 0;
    const todos = (agr.par ?? []).flatMap((p) => p.cand ?? []);
    const validos = todos
      .filter((c) => String(c.dvt ?? "").startsWith("Válido"))
      .sort((a, b) => int(b.vap) - int(a.vap) || nascimento(a.dt).localeCompare(nascimento(b.dt)));
    const ultimo = vagas ? int(validos[vagas - 1]?.vap) : null;
    const primeiroSup = vagas && validos.length > vagas ? int(validos[vagas].vap) : null;
    validos.forEach((c, i) => {
      const v = int(c.vap);
      if (i < vagas)
        saida.set(c.sqcand, {
          tipo: "eleito",
          ordem: i + 1,
          modo: i < qp && v >= 0.1 * qe ? "QP" : "média",
          margem: primeiroSup != null ? v - primeiroSup : null,
        });
      else if (vagas)
        saida.set(c.sqcand, { tipo: "suplente", ordem: i - vagas + 1, faltou: ultimo - v });
      else saida.set(c.sqcand, { tipo: "nao_eleito" });
    });
    for (const c of todos) if (!saida.has(c.sqcand)) saida.set(c.sqcand, { tipo: "nao_eleito" });
  }
  return saida;
}

function situacao(cargo, c, proj, segundoTurno) {
  const st = (c.st ?? "").trim();
  const p = proj?.get(c.sqcand);
  if (cargo.proporcional && p) {
    if (st) {
      const tipo = /^eleito/i.test(st) ? "eleito" : st === "Suplente" ? "suplente" : "nao_eleito";
      return {
        sit: tipo === "suplente" && p.ordem ? `${p.ordem}º suplente` : st,
        sitTipo: tipo,
        proj: false,
      };
    }
    if (p.tipo === "eleito") return { sit: "Eleito (projeção)", sitTipo: "eleito", proj: true };
    if (p.tipo === "suplente")
      return { sit: `${p.ordem}º suplente (projeção)`, sitTipo: "suplente", proj: true };
    return { sit: "Não eleito (projeção)", sitTipo: "nao_eleito", proj: true };
  }
  if (st) return { sit: st, sitTipo: /^eleito/i.test(st) ? "eleito" : "nao_eleito", proj: false };
  if (segundoTurno)
    return segundoTurno.has(c.n)
      ? { sit: "2º turno", sitTipo: "segundo_turno", proj: false }
      : { sit: "Não eleito", sitTipo: "nao_eleito", proj: false };
  return { sit: "Aguardando TSE", sitTipo: "aguardando", proj: false };
}

// ------------------------------------------------------------------ principal

async function main() {
  const t0 = Date.now();
  console.log("1/4 Municípios, regiões e territórios");
  const municipios = await carregarMunicipios();

  console.log("2/4 Resultados do TSE");
  const dados = {};
  for (const cargo of CARGOS) dados[cargo.slug] = await carregarCargo(cargo, municipios);

  console.log("3/4 Conferência");
  const parciais = {};
  for (const cargo of CARGOS) {
    const { estado, docs } = dados[cargo.slug];
    if (!apurado(estado)) erros.push(`${cargo.nome}: arquivo estadual não está 100% apurado`);
    const incompletos = municipios
      .map((m, i) => ({ m, d: docs[i] }))
      .filter((x) => x.d && !apurado(x.d));
    if (incompletos.length) {
      // Arquivo municipal do próprio TSE parado com apuração parcial: publica, mas avisa na tela.
      parciais[cargo.slug] = incompletos.map((x) => ({
        municipio: x.m.nome,
        tse: x.m.tse,
        pst: pst(x.d),
        hora: `${x.d.dg} ${x.d.hg}`,
      }));
      avisos.push(
        `${cargo.nome}: arquivo municipal do TSE com apuração parcial em ${incompletos.map((x) => `${x.m.nome} (${x.d.s.pst}%)`).join(", ")}`,
      );
      continue;
    }
    const soma = new Map();
    for (const d of docs)
      for (const { c } of candidatosDe(d))
        soma.set(c.sqcand, (soma.get(c.sqcand) ?? 0) + int(c.vap));
    const divergentes = [...candidatosDe(estado)].filter(
      ({ c }) => int(c.vap) !== (soma.get(c.sqcand) ?? 0),
    );
    if (divergentes.length)
      erros.push(
        `${cargo.nome}: ${divergentes.length} candidatos com soma municipal diferente do total oficial`,
      );
    console.log(`  ${cargo.nome}: ${divergentes.length} divergências`);
  }
  const federal = dados["deputado-federal"].estado;
  const projFed = projetar(federal.carg[0]);
  const oficiais = new Set(
    [...candidatosDe(federal)]
      .filter(({ c }) => /^eleito/i.test(c.st ?? ""))
      .map(({ c }) => c.sqcand),
  );
  const projetados = new Set([...projFed].filter(([, p]) => p.tipo === "eleito").map(([id]) => id));
  const coincidentes = [...oficiais].filter((id) => projetados.has(id)).length;
  console.log(
    `  Projeção x oficial (Dep. Federal): ${coincidentes}/${oficiais.size} eleitos coincidem`,
  );
  if (oficiais.size && coincidentes !== oficiais.size)
    avisos.push("a projeção de eleitos difere do resultado oficial do Dep. Federal");

  if (erros.length) {
    console.error("\nCONFERÊNCIA FALHOU, nada foi gravado:");
    for (const e of erros) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log("4/4 Gravando");
  const cargosSaida = [];
  for (const cargo of CARGOS) {
    const { estado, nacional, docs } = dados[cargo.slug];
    const carg = estado.carg[0];
    const proj = cargo.proporcional ? projetar(carg) : null;
    let segundoTurno = null;
    if (nacional && nacional.tf !== "s") {
      const nac = [...candidatosDe(nacional)].sort((a, b) => int(b.c.vap) - int(a.c.vap));
      if (nac.length && num(nac[0].c.pvapn) <= 50)
        segundoTurno = new Set(nac.slice(0, 2).map(({ c }) => c.n));
    }

    const candidatos = [...candidatosDe(estado)]
      .map(({ agr, par, c }) => {
        const p = proj?.get(c.sqcand) ?? {};
        return {
          id: c.sqcand,
          n: c.n,
          nome: c.nmu || c.nm,
          nomeCompleto: c.nm,
          partido: par.sg,
          agr: agr.nm,
          agrCom: agr.com,
          fed: par.nfed ?? "",
          votos: int(c.vap),
          pct: num(c.pvapn),
          situacao: c.st ?? "",
          eleito: c.e === "s",
          valido: c.dvt,
          vice: (c.vs ?? []).map((v) => `${v.nmu} (${v.sgp})`),
          // campos novos
          agrId: agr.n,
          ...situacao(cargo, c, proj, segundoTurno),
          ...(cargo.proporcional
            ? { ordem: p.ordem ?? null, faltou: p.faltou ?? null, margem: p.margem ?? null }
            : {}),
        };
      })
      .sort((a, b) => b.votos - a.votos);
    const indice = new Map(candidatos.map((c, i) => [c.id, i]));

    const partidos = (carg.agr ?? []).flatMap((agr) =>
      (agr.par ?? []).map((par) => ({
        sg: par.sg,
        n: par.n,
        nm: par.nm,
        fed: par.nfed ?? "",
        agr: agr.nm,
        agrCom: agr.com,
        votosTot: int(par.tvtn),
        legenda: int(par.tvtl),
      })),
    );
    const validosEstado = int(estado.v.vv);
    const agremiacoes = cargo.proporcional
      ? (carg.agr ?? [])
          .map((agr) => {
            const nominal = (agr.par ?? []).reduce((s, p) => s + int(p.tvtn), 0);
            const legenda = (agr.par ?? []).reduce((s, p) => s + int(p.tvtl), 0);
            return {
              id: agr.n,
              nome: agr.nm,
              sigla: agr.com,
              tipo: { f: "federação", c: "coligação" }[agr.tp] ?? "partido",
              vagas: int(agr.vag),
              qp: int(carg.qe) ? Math.floor((nominal + legenda) / int(carg.qe)) : 0,
              nominal,
              legenda,
              total: nominal + legenda,
              pct: validosEstado ? ((nominal + legenda) / validosEstado) * 100 : 0,
              partidos: (agr.par ?? []).map((p) => p.sg),
            };
          })
          .sort((a, b) => b.total - a.total)
      : undefined;

    const mun = {};
    municipios.forEach((m, i) => {
      const d = docs[i];
      const v = {};
      for (const { c } of candidatosDe(d)) if (int(c.vap) > 0) v[indice.get(c.sqcand)] = int(c.vap);
      const linha = {
        el: int(d.e.te),
        co: int(d.e.c),
        ab: int(d.e.a),
        vv: int(d.v.vv),
        vb: int(d.v.vb),
        vn: int(d.v.tvn),
        pst: pst(d),
        v,
        tv: int(d.v.tv),
      };
      if (cargo.proporcional) {
        const l = {};
        for (const agr of d.carg?.[0]?.agr ?? [])
          for (const par of agr.par ?? []) if (int(par.tvtl)) l[par.n] = int(par.tvtl);
        linha.l = l;
      }
      mun[m.tse] = linha;
    });
    await gravarJson(path.join(SAIDA, `mun-${cargo.slug}.json`), mun);

    cargosSaida.push({
      cd: cargo.cd,
      slug: cargo.slug,
      nome: cargo.nome,
      vagas: int(carg.nv),
      qe: int(carg.qe),
      resumo: {
        secTot: int(estado.s.ts),
        secTotz: int(estado.s.st),
        pst: pst(estado),
        eleitores: int(estado.e.te),
        comp: int(estado.e.c),
        abst: int(estado.e.a),
        validos: int(estado.v.vv),
        brancos: int(estado.v.vb),
        nulos: int(estado.v.tvn),
        legenda: int(estado.v.vl),
        total: int(estado.v.tv),
        hora: `${estado.dg} ${estado.hg}`,
      },
      candidatos,
      partidos,
      federacoes: Object.fromEntries((carg.fed ?? []).map((f) => [f.n, f.sg])),
      // campos novos
      totalizacaoFinal: estado.tf === "s",
      parciais: parciais[cargo.slug] ?? [],
      ...(agremiacoes ? { agremiacoes } : {}),
    });
  }
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" });
  await gravarJson(path.join(SAIDA, "meta.json"), {
    cargos: cargosSaida,
    geradoEm: agora,
    validacao: { projecaoFederal: { oficiais: oficiais.size, coincidentes }, avisos },
  });
  await gravarJson(path.join(SAIDA, "municipios.json"), municipios);
  console.log(`\nOK em ${((Date.now() - t0) / 1000).toFixed(1)}s → ${SAIDA}`);
  for (const a of avisos) console.log(`  aviso: ${a}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
