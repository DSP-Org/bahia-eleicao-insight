import { describe, expect, it } from "vitest";
import { criarIndicadores } from "@/lib/indicadores";
import meta from "../../public/data/meta.json";
import municipios from "../../public/data/municipios.json";
import governador from "../../public/data/mun-governador.json";
import senador from "../../public/data/mun-senador.json";
import estadual from "../../public/data/mun-deputado-estadual.json";
import { type Cargo, type MunData } from "@/lib/eleicoes";

describe("Indicadores eleitorais", () => {
  const getCards = (slug: string, dados: MunData, id = "") => {
    const cargo = meta.cargos.find((c) => c.slug === slug);
    if (!cargo) throw new Error("Cargo ausente");
    return criarIndicadores(cargo as Cargo, municipios, dados, id).flatMap((s) => s.cards);
  };
  it("produz dezenas de indicadores com totais oficiais e cobertura municipal", () => {
    const cards = getCards("governador", governador);
    expect(cards.length).toBeGreaterThan(65);
    expect(cards.find((c) => c.label === "Eleitores aptos")?.value).toBe("11.304.314");
    expect(cards.find((c) => c.label === "Municípios com resultado")?.value).toBe("417");
    expect(cards.every((c) => !/NaN|Infinity|undefined/.test(c.value))).toBe(true);
  });
  it("mantém votos do Senado distintos de eleitores", () => {
    const cards = getCards("senador", senador);
    expect(cards.find((c) => c.label === "Total de votos")?.value).toBe("18.092.358");
    expect(cards.find((c) => c.label === "Taxa de votos válidos")?.value).toBe("79,69%");
    expect(cards.find((c) => c.label === "Taxa de comparecimento")?.value).toBe("80,02%");
  });
  it("separa eleitos por projeção e atualiza candidato escolhido", () => {
    const cards = getCards("deputado-estadual", estadual);
    expect(cards.find((c) => c.label === "Eleitos oficiais")?.value).toBe("0");
    expect(cards.find((c) => c.label === "Eleitos por projeção")?.value).toBe("63");
    const cargo = meta.cargos.find((c) => c.slug === "governador");
    const candidato = cargo?.candidatos[1];
    if (!candidato) throw new Error("Candidato ausente");
    const selecionado = getCards("governador", governador, candidato.id);
    expect(selecionado.find((c) => c.label === "Votos na Bahia")?.value).toBe(candidato.votos.toLocaleString("pt-BR"));
  });
});