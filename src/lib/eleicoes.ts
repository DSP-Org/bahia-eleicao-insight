import { useQuery } from "@tanstack/react-query";

export type Resumo = {
  secTot: number; pst: number; eleitores: number; comp: number; abst: number;
  validos: number; brancos: number; nulos: number; total: number; hora: string;
};
export type SitTipo = "eleito" | "suplente" | "nao_eleito" | "segundo_turno" | "aguardando";
export type Candidato = {
  id: string; n: string; nome: string; nomeCompleto: string; partido: string;
  agr: string; agrCom: string; fed: string; votos: number; pct: number;
  situacao: string; eleito: boolean; valido: string; vice: string[];
  // Gerados por scripts/gerar-dados.mjs. `sit` é a situação a exibir: a oficial do TSE quando existe;
  // senão a projeção (Dep. Estadual, enquanto o TSE não publica a lista) ou "2º turno".
  agrId?: string; sit?: string; sitTipo?: SitTipo; proj?: boolean;
  ordem?: number | null; faltou?: number | null; margem?: number | null;
};
export type Partido = { sg: string; n: string; nm: string; fed: string; agr: string; votosTot: number; legenda: number };
export type Agremiacao = {
  id: string; nome: string; sigla: string; tipo: string; vagas: number; qp: number;
  nominal: number; legenda: number; total: number; pct: number; partidos: string[];
};
export type Parcial = { municipio: string; tse: string; pst: number; hora: string };
export type Cargo = {
  cd: string; slug: string; nome: string; vagas: number; qe: number; resumo: Resumo;
  candidatos: Candidato[]; partidos: Partido[]; federacoes: Record<string, string>;
  totalizacaoFinal?: boolean; parciais?: Parcial[]; agremiacoes?: Agremiacao[];
};
export type Meta = { cargos: Cargo[]; geradoEm?: string; validacao?: { projecaoFederal: { oficiais: number; coincidentes: number }; avisos: string[] } };
export type Municipio = { tse: string; ibge: string; nome: string; ri: string; rim: string; ti?: string };
export type MunRes = {
  el: number; co: number; ab: number; vv: number; vb: number; vn: number; pst: number; v: Record<string, number>;
  tv?: number; l?: Record<string, number>; // total de votos do cargo e votos de legenda por número do partido
};
export type MunData = Record<string, MunRes | null>;

const j = <T,>(u: string) => () => fetch(u).then((r) => { if (!r.ok) throw new Error("Falha ao carregar dados"); return r.json() as Promise<T>; });
const opts = { staleTime: Infinity, gcTime: Infinity } as const;

export const useMeta = () => useQuery({ queryKey: ["meta"], queryFn: j<Meta>("/data/meta.json"), ...opts });
export const useMunicipios = () => useQuery({ queryKey: ["municipios"], queryFn: j<Municipio[]>("/data/municipios.json"), ...opts });
export const useMunData = (slug: string) => useQuery({ queryKey: ["mun", slug], queryFn: j<MunData>(`/data/mun-${slug}.json`), ...opts, enabled: !!slug });
export const useGeo = () => useQuery({ queryKey: ["geo"], queryFn: j<GeoJSON.FeatureCollection>("/data/ba.geojson"), ...opts });

export const CARGOS = [
  { slug: "presidente", nome: "Presidente" },
  { slug: "governador", nome: "Governador" },
  { slug: "senador", nome: "Senador" },
  { slug: "deputado-federal", nome: "Deputado Federal" },
  { slug: "deputado-estadual", nome: "Deputado Estadual" },
] as const;

export const nf = (n: number) => n.toLocaleString("pt-BR");
export const pf = (n: number, d = 2) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
export const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);

const PARTY: Record<string, string> = {
  PT: "#c8102e", PL: "#1f3a93", "UNIÃO": "#2a6fdb", PP: "#3e7cb1", PSD: "#e8871e", MDB: "#2e8b57",
  PSOL: "#f2c12e", REDE: "#26a69a", PSB: "#e4572e", PDT: "#b5482c", AVANTE: "#ff7f11", REPUBLICANOS: "#2c5f8a",
  "PC do B": "#8b0000", PCdoB: "#8b0000", PV: "#3a9d23", NOVO: "#f28c28", PSDB: "#2b59c3", PODE: "#5c6bc0",
  SOLIDARIEDADE: "#ef6c00", CIDADANIA: "#d81b60", PRD: "#455a64", MOBILIZA: "#6d4c41", DC: "#7cb342",
  PCO: "#6a1b9a", PSTU: "#b71c1c", UP: "#4a148c", PMB: "#9e9d24", AGIR: "#00897b", PRTB: "#1b5e20", PCB: "#880e4f",
};
const FALLBACK = ["#6b5b95", "#88b04b", "#955251", "#009b77", "#dd4124", "#45b8ac", "#5b5ea6", "#9b2335", "#bc243c", "#c3447a"];
export function partyColor(sg: string) {
  if (PARTY[sg]) return PARTY[sg];
  let h = 0; for (const ch of sg) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}
// Distinct colors for comparing candidates of the same party
export const SERIES = ["#c8102e", "#1f3a93", "#e8871e", "#2e8b57"];

export function downloadCSV(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

export function slugify(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function winner(m: MunRes | null | undefined): number {
  if (!m) return -1;
  let best = -1, bv = -1;
  for (const [k, v] of Object.entries(m.v)) if (v > bv) { bv = v; best = Number(k); }
  return best;
}
export function heat(p: number, max: number, color: string) {
  const t = max ? Math.min(1, p / max) : 0;
  return `color-mix(in oklch, ${color} ${Math.round(8 + t * 92)}%, #f3eee3)`;
}
export function useIbgeIndex(muns?: Municipio[]) {
  const byIbge: Record<string, Municipio> = {};
  const byTse: Record<string, Municipio> = {};
  muns?.forEach((m) => { byIbge[m.ibge] = m; byTse[m.tse] = m; });
  return { byIbge, byTse };
}
