import { describe, expect, it } from "vitest";
import { RELATORIOS } from "@/lib/relatorios/definicoes";
import { montarBase } from "@/lib/relatorios/base";
import type { Meta, MunData, Municipio } from "@/lib/eleicoes";
import type { ValorMun } from "@/lib/relatorios/blocos";
import meta from "../../public/data/meta.json";
import municipios from "../../public/data/municipios.json";
import p1 from "../../public/data/mun-presidente.json";
import p2 from "../../public/data/mun-presidente-2t.json";
import gov from "../../public/data/mun-governador.json";
import sen from "../../public/data/mun-senador.json";
import dfed from "../../public/data/mun-deputado-federal.json";
import dest from "../../public/data/mun-deputado-estadual.json";

const base = montarBase(meta as unknown as Meta, municipios as Municipio[], {
  presidente: p1 as MunData, "presidente-2t": p2 as MunData,
  governador: gov as MunData, senador: sen as MunData,
  "deputado-federal": dfed as MunData, "deputado-estadual": dest as MunData,
});
function cidades(st: Record<string, string>) {
  const rel = RELATORIOS.find((r) => r.id === "dossie2");
  if (!rel) throw new Error("Dossiê 2 ausente");
  const tabela = rel.gerar(base, st).find((b) => b.tipo === "tabela");
  if (!tabela || tabela.tipo !== "tabela") throw new Error("Tabela ausente");
  return tabela.linhas.map((r) => (r[0] as ValorMun).tse).sort();
}

describe("Territórios no Dossiê 2", () => {
  it("inclui somente os territórios marcados e remove o desmarcado", () => {
    expect(cidades({ escopos: "ti:Velho Chico|ti:Itaparica" })).toEqual(municipios.filter((m) => ["Velho Chico", "Itaparica"].includes(m.ti)).map((m) => m.tse).sort());
    expect(cidades({ escopos: "ti:Itaparica" })).toEqual(municipios.filter((m) => m.ti === "Itaparica").map((m) => m.tse).sort());
  });
  it("mantém municípios adicionais sem duplicar cidades do território", () => {
    const dentro = municipios.find((m) => m.ti === "Velho Chico");
    const fora = municipios.find((m) => m.ti === "Itaparica");
    if (!dentro || !fora) throw new Error("Municípios ausentes");
    expect(cidades({ escopos: "ti:Velho Chico", muns: `${dentro.tse},${fora.tse}` })).toEqual([...municipios.filter((m) => m.ti === "Velho Chico").map((m) => m.tse), fora.tse].sort());
  });
  it("preserva links antigos de território e Bahia sem escolhas", () => {
    expect(cidades({ escopo: "ti:Bacia do Jacuípe" })).toEqual(municipios.filter((m) => m.ti === "Bacia do Jacuípe").map((m) => m.tse).sort());
    expect(cidades({})).toHaveLength(417);
  });
});