import { nf, pf, pct, type Cargo, type Municipio, type MunData } from "@/lib/eleicoes";

export type GrupoIndicador = "participacao" | "votos" | "disputa" | "territorio" | "candidato";
export type Indicador = { label: string; value: string; detail: string; textual?: boolean };
export type SecaoIndicadores = { id: GrupoIndicador; title: string; cards: Indicador[] };

export function criarIndicadores(cargo: Cargo, municipios: Municipio[], dados: MunData, candidatoId: string): SecaoIndicadores[] {
  const r = cargo.resumo;
  const candidatos = [...cargo.candidatos].sort((a, b) => b.votos - a.votos);
  const primeiro = candidatos[0];
  const segundo = candidatos[1];
  const candidato = cargo.candidatos.find((c) => c.id === candidatoId) ?? primeiro;
  const indice = candidato ? cargo.candidatos.findIndex((c) => c.id === candidato.id) : -1;
  const linhas = municipios.flatMap((municipio) => {
    const resultado = dados[municipio.tse];
    if (!resultado) return [];
    const ranking = Object.entries(resultado.v).map(([i, votos]) => ({ indice: Number(i), votos })).sort((a, b) => b.votos - a.votos);
    const top = ranking[0];
    const vice = ranking[1];
    const total = resultado.tv ?? resultado.vv + resultado.vb + resultado.vn;
    const votos = resultado.v[String(indice)] ?? 0;
    return [{ municipio, resultado, ranking, top, total, votos, percentual: pct(votos, resultado.vv), margem: (top?.votos ?? 0) - (vice?.votos ?? 0), empate: Boolean(top && vice && top.votos > 0 && top.votos === vice.votos) }];
  });
  const card = (label: string, value: string | number, detail: string, textual = false): Indicador => ({ label, value: typeof value === "number" ? nf(value) : value, detail, textual });
  const extremos = (label: string, valor: (linha: typeof linhas[number]) => number, formato: (valor: number) => string, elegivel = (linha: typeof linhas[number]) => linha.resultado.el > 0): Indicador[] => {
    const ordenadas = linhas.filter(elegivel).sort((a, b) => valor(b) - valor(a));
    const maior = ordenadas[0];
    const menor = ordenadas.at(-1);
    return maior && menor ? [card(`Maior ${label}`, formato(valor(maior)), maior.municipio.nome), card(`Menor ${label}`, formato(valor(menor)), menor.municipio.nome)] : [];
  };
  const nominal = cargo.candidatos.reduce((s, c) => s + c.votos, 0);
  const legenda = cargo.partidos.reduce((s, p) => s + p.legenda, 0);
  const top3 = candidatos.slice(0, 3).reduce((s, c) => s + c.votos, 0);
  const top10 = candidatos.slice(0, 10).reduce((s, c) => s + c.votos, 0);
  const proporcionais = cargo.vagas > 2;
  const oficiais = candidatos.filter((c) => c.eleito && !c.proj);
  const projetados = candidatos.filter((c) => c.sitTipo === "eleito" && c.proj);
  const lideres = new Set(linhas.filter((l) => l.top && l.top.votos > 0 && !l.empate).map((l) => l.top?.indice));
  const partidos = [...cargo.partidos].sort((a, b) => b.votosTot - a.votosTot);
  const partido = partidos[0];
  const margens = linhas.filter((l) => l.top && l.top.votos > 0);
  const liderancas = linhas.filter((l) => l.top?.indice === indice && l.votos > 0 && !l.empate);
  const presenca = linhas.filter((l) => l.votos > 0);
  const top5Local = [...presenca].sort((a, b) => b.votos - a.votos).slice(0, 5).reduce((s, l) => s + l.votos, 0);
  const regioes = new Map<string, number>();
  presenca.forEach((l) => regioes.set(l.municipio.ri, (regioes.get(l.municipio.ri) ?? 0) + l.votos));
  const regiao = [...regioes].sort((a, b) => b[1] - a[1])[0];
  return [
    { id: "participacao", title: "Eleitorado e participação", cards: [
      card("Eleitores aptos", r.eleitores, `Eleitorado de ${cargo.nome}`),
      card("Compareceram", r.comp, `${pf(pct(r.comp, r.eleitores))} dos eleitores`),
      card("Não compareceram", r.abst, `${pf(pct(r.abst, r.eleitores))} dos eleitores`),
      card("Taxa de comparecimento", pf(pct(r.comp, r.eleitores)), "Comparecimento ÷ eleitorado"),
      card("Taxa de abstenção", pf(pct(r.abst, r.eleitores)), "Abstenção ÷ eleitorado"),
      card("Seções eleitorais", r.secTot, "Seções informadas no resultado"),
      card("Eleitores por seção", nf(Math.round(r.eleitores / (r.secTot || 1))), "Média do eleitorado"),
      card("Comparecimento por seção", nf(Math.round(r.comp / (r.secTot || 1))), "Média de eleitores presentes"),
      ...extremos("comparecimento", (l) => pct(l.resultado.co, l.resultado.el), pf),
      ...extremos("abstenção", (l) => pct(l.resultado.ab, l.resultado.el), pf),
    ] },
    { id: "votos", title: "Composição dos votos", cards: [
      card("Total de votos", r.total, cargo.slug === "senador" ? "Senado: dois votos por eleitor" : "Válidos, brancos e nulos"),
      card("Votos válidos", r.validos, `${pf(pct(r.validos, r.total))} do total de votos`),
      card("Votos em branco", r.brancos, `${pf(pct(r.brancos, r.total))} do total de votos`),
      card("Votos nulos", r.nulos, `${pf(pct(r.nulos, r.total))} do total de votos`),
      card("Brancos + nulos", r.brancos + r.nulos, `${pf(pct(r.brancos + r.nulos, r.total))} do total de votos`),
      card("Taxa de votos válidos", pf(pct(r.validos, r.total)), "Válidos ÷ total de votos"),
      card("Taxa de brancos", pf(pct(r.brancos, r.total)), "Brancos ÷ total de votos"),
      card("Taxa de nulos", pf(pct(r.nulos, r.total)), "Nulos ÷ total de votos"),
      card("Votos nominais listados", nominal, "Soma dos votos dos candidatos"),
      ...(proporcionais ? [card("Votos de legenda", legenda, "Soma da legenda dos partidos"), card("Legenda entre os válidos", pf(pct(legenda, r.validos)), "Legenda ÷ votos válidos"), card("Quociente eleitoral", cargo.qe, `Referência para ${nf(cargo.vagas)} vagas`)] : []),
      ...extremos("taxa de brancos", (l) => pct(l.resultado.vb, l.total), pf, (l) => l.total > 0),
      ...extremos("taxa de nulos", (l) => pct(l.resultado.vn, l.total), pf, (l) => l.total > 0),
    ] },
    { id: "disputa", title: "Candidatos e partidos", cards: [
      card("Candidatos listados", candidatos.length, cargo.nome),
      card("Candidatos com votos", candidatos.filter((c) => c.votos > 0).length, "Ao menos um voto no estado"),
      card("Candidatos sem votos", candidatos.filter((c) => c.votos === 0).length, "Zero votos no resultado"),
      card("Partidos listados", cargo.partidos.length, "Partidos presentes neste cargo"),
      card("Vagas em disputa", cargo.vagas, cargo.slug === "presidente" ? "Disputa nacional; votos exibidos da BA" : "Vagas referentes à Bahia"),
      card("Eleitos oficiais", oficiais.length, "Somente situação oficial, sem projeções"),
      ...(projetados.length ? [card("Eleitos por projeção", projetados.length, "Estimativa; não é confirmação do TSE")] : []),
      ...(proporcionais ? [card("Candidatos por vaga", (candidatos.length / cargo.vagas).toLocaleString("pt-BR", { maximumFractionDigits: 1 }), "Candidatos listados ÷ vagas")] : []),
      ...(primeiro ? [card("Mais votado na Bahia", primeiro.nome, `${nf(primeiro.votos)} votos · ${pf(primeiro.pct)}`, true), card("Votos do 1º colocado", primeiro.votos, primeiro.nome)] : []),
      ...(segundo ? [card("Votos do 2º colocado", segundo.votos, segundo.nome), card("Distância entre 1º e 2º", (primeiro?.votos ?? 0) - segundo.votos, "Diferença em votos; não define eleição")] : []),
      card("Concentração no top 3", pf(pct(top3, r.validos)), `${nf(top3)} votos dos três mais votados`),
      ...(candidatos.length > 10 ? [card("Concentração no top 10", pf(pct(top10, r.validos)), `${nf(top10)} votos dos dez mais votados`)] : []),
      ...(partido ? [card("Partido mais votado", partido.sg, `${nf(partido.votosTot)} votos nominais + legenda`, true)] : []),
    ] },
    { id: "territorio", title: "Retrato dos municípios", cards: [
      card("Municípios", municipios.length, "Municípios da Bahia no cadastro"),
      card("Municípios com resultado", linhas.length, "Resultado disponível para este cargo"),
      card("Territórios de identidade", new Set(municipios.map((m) => m.ti).filter(Boolean)).size, "Territórios presentes no cadastro"),
      card("Regiões imediatas", new Set(municipios.map((m) => m.rim).filter(Boolean)).size, "Divisão regional do IBGE"),
      card("Regiões intermediárias", new Set(municipios.map((m) => m.ri).filter(Boolean)).size, "Divisão regional do IBGE"),
      card("Candidatos líderes locais", lideres.size, "1º lugar isolado em ao menos uma cidade"),
      card("Empates na liderança", linhas.filter((l) => l.empate).length, "Empate em votos entre os primeiros"),
      card("Disputas até 100 votos", margens.filter((l) => l.margem <= 100).length, "Distância entre os dois primeiros"),
      card("Disputas até 1 ponto", margens.filter((l) => pct(l.margem, l.resultado.vv) <= 1).length, "Até 1 ponto percentual entre 1º e 2º"),
      ...extremos("eleitorado", (l) => l.resultado.el, nf),
      ...extremos("volume de válidos", (l) => l.resultado.vv, nf),
      ...extremos("vantagem local", (l) => l.margem, nf, (l) => Boolean(l.top && l.top.votos > 0)),
    ] },
    { id: "candidato", title: "Raio-x do candidato", cards: candidato ? [
      card("Votos na Bahia", candidato.votos, candidato.nome),
      card("Percentual dos válidos", pf(candidato.pct), `Dentro de ${cargo.nome}`),
      card("Posição em votos", `${candidatos.findIndex((c) => c.id === candidato.id) + 1}º`, `Entre ${nf(candidatos.length)} candidatos`),
      card("Situação", candidato.sit || candidato.situacao || "Não informada", candidato.proj ? "Projeção; não confirmada pelo TSE" : "Situação registrada no resultado", true),
      card("Municípios com votos", presenca.length, `${pf(pct(presenca.length, linhas.length))} dos municípios com resultado`),
      card("Municípios sem votos", linhas.length - presenca.length, "Municípios com resultado e zero voto"),
      card("Lideranças municipais", liderancas.length, "1º lugar isolado em votos nominais"),
      card("Entre os 3 mais votados", linhas.filter((l) => l.votos > 0 && l.ranking.filter((i) => i.votos > l.votos).length < 3).length, "Posição por votos, incluindo empates"),
      card("Acima de 50%", linhas.filter((l) => l.percentual > 50).length, "Mais da metade dos válidos locais"),
      card("Acima de 25%", linhas.filter((l) => l.percentual > 25).length, "Mais de um quarto dos válidos locais"),
      card("Top 5 cidades nos votos", pf(pct(top5Local, candidato.votos)), `${nf(top5Local)} votos concentrados em cinco cidades`),
      card("Média por município", nf(Math.round(linhas.reduce((s, l) => s + l.votos, 0) / (linhas.length || 1))), "Média de votos nos municípios com resultado"),
      ...extremos("votação do candidato", (l) => l.votos, nf, (l) => l.votos > 0),
      ...extremos("força percentual", (l) => l.percentual, pf, (l) => l.votos > 0 && l.resultado.vv > 0),
      ...(regiao ? [card("Região com mais votos", regiao[0], `${nf(regiao[1])} votos · região intermediária`, true)] : []),
    ] : [] },
  ];
}