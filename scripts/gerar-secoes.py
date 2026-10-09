# Gera public/data/secoes.json: votos seção a seção e locais de votação dos municípios escolhidos.
# Fonte: TSE Dados Abertos — votacao_secao_2026_BA.zip (CSV latin-1, ';').
# Uso: baixe e descompacte o zip, depois: python3 scripts/gerar-secoes.py votacao_secao_2026_BA.csv
import csv, json, sys
from datetime import datetime, timezone

MUNS = {"35653", "37460", "37656", "39144"}  # Ibotirama, Muquém do S. Francisco, Oliveira dos Brejinhos, Sítio do Mato
CARGOS = {"1": "presidente", "3": "governador", "5": "senador", "6": "deputado-federal", "7": "deputado-estadual"}

out = {}
with open(sys.argv[1], encoding="latin-1", newline="") as f:
    r = csv.DictReader(f, delimiter=";")
    for row in r:
        tse = row["CD_MUNICIPIO"]
        if tse not in MUNS or row["NR_TURNO"] != "1":
            continue
        slug = CARGOS.get(row["CD_CARGO"])
        if not slug:
            continue
        m = out.setdefault(tse, {"nome": row["NM_MUNICIPIO"], "locais": {}, "secoes": {}, "cargos": {}})
        z, s, lv = int(row["NR_ZONA"]), int(row["NR_SECAO"]), row["NR_LOCAL_VOTACAO"]
        m["locais"].setdefault((z, lv), (row["NM_LOCAL_VOTACAO"], row["DS_LOCAL_VOTACAO_ENDERECO"]))
        m["secoes"][(z, s)] = (z, lv)
        c = m["cargos"].setdefault(slug, {})
        k = (z, s)
        num, q = row["NR_VOTAVEL"], int(row["QT_VOTOS"])
        c.setdefault(k, {})
        c[k][num] = c[k].get(num, 0) + q

res = {"geradoEm": datetime.now(timezone.utc).isoformat(), "fonte": "TSE Dados Abertos · votacao_secao_2026_BA", "muns": {}}
for tse, m in out.items():
    locs = sorted(m["locais"].items(), key=lambda x: x[1][0])
    li = {k: i for i, (k, _) in enumerate(locs)}
    secs = sorted(m["secoes"].items())
    si = {k: i for i, (k, _) in enumerate(secs)}
    cargos = {}
    for slug, porSec in m["cargos"].items():
        bv = [0] * (2 * len(secs))
        cand, leg = {}, {}
        for k, votos in porSec.items():
            i = si[k]
            for num, q in votos.items():
                if num == "95":
                    bv[2 * i] += q
                elif num == "96":
                    bv[2 * i + 1] += q
                elif len(num) == 2 and slug.startswith("deputado"):
                    leg.setdefault(num, []).extend([i, q])
                else:
                    cand.setdefault(num, []).extend([i, q])
        cargos[slug] = {"bv": bv, "c": cand, "l": leg}
    res["muns"][tse] = {
        "nome": m["nome"],
        "locais": [{"n": k[1], "z": k[0], "nome": v[0], "end": v[1]} for k, v in locs],
        "secoes": [[k[0], k[1], li[v]] for k, v in secs],
        "cargos": cargos,
    }
json.dump(res, open("public/data/secoes.json", "w"), ensure_ascii=False, separators=(",", ":"))
for tse, m in res["muns"].items():
    print(tse, m["nome"], len(m["locais"]), "locais", len(m["secoes"]), "seções", list(m["cargos"]))
