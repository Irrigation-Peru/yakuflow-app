"""Reproduce la Tabla 4 del artículo desde ena2024_sitio_cultivo.csv, con el «Uso recomendado» del LEEME.

Escenario del artículo: lugares aptos para riego por gravedad (aptoGoteo = 1), solo los 8 cultivos del catálogo
(enCatalogoActual = 1), 7 rasgos (sin oferta de agua ni conductividad, que la encuesta no registra), etiqueta
`cultivo` con `cosechas` como peso, y validación cruzada de 5 pliegues agrupada por celda de clima, con la misma
asignación de pliegues y las mismas líneas base que p6g.py.

Medidas, como en p6g.py:
- primera cosechada: el primer cultivo sugerido se cosecha en el lugar;
- cosechas entre las tres: parte de los registros de cosecha del lugar cuyo cultivo está entre los tres sugeridos,
  promediada con el total de registros del lugar como peso.
Los intervalos son bootstrap por celda de clima (1 500 remuestreos), sobre la diferencia pareada.

    python -I p9_tabla_paper.py <ena2024_sitio_cultivo.csv> <sitios-cultivos.csv del repo> <salida.txt> [<salida.json>]
"""

import csv
import json
import sys
from collections import defaultdict

import numpy as np
from sklearn.ensemble import RandomForestClassifier

sys.stdout.reconfigure(encoding="utf-8")

ENA, SINTETICO, SALIDA = sys.argv[1], sys.argv[2], sys.argv[3]
SALIDA_JSON = sys.argv[4] if len(sys.argv) > 4 else None
SEM = 20261106
HP = {"n_estimators": 30, "max_depth": 10, "min_samples_leaf": 10}
RASGOS = ["altitudM", "temperaturaMediaAnualC", "minimaDelMesMasFrioC", "et0MediaMmDia", "lluviaAnualMm",
          "phDelSuelo", "texturaGruesa"]
RASGOS_SINTETICO = ["altitudM", "temperaturaMediaAnualC", "minimaDelMesMasFrioC", "et0MediaMmDia", "lluviaAnualMm",
                    "ofertaDeAguaMmDia", "conductividadDelAguaDsM", "phDelSuelo", "texturaGruesa"]

lineas = []


def decir(texto=""):
    print(texto)
    lineas.append(texto)


# ── Lugares ───────────────────────────────────────────────────────────────────────────────────────────────────────
filas = [f for f in csv.DictReader(open(ENA, encoding="utf-8-sig"))
         if f["aptoGoteo"] == "1" and f["enCatalogoActual"] == "1"]
lugares = {}
for f in filas:
    s = lugares.setdefault(f["sitio"], {
        "x": [float(f[r]) for r in RASGOS],
        "x9": [float(f[r]) for r in RASGOS_SINTETICO],
        "celda": f["celdaClima"],
        "region": f["region"],
        "regla": f["top3Regla"].split("|"),
        "sinApto": float(f["indiceMejorRegla"]) <= 0,
        "cultivos": {},
    })
    s["cultivos"][f["cultivo"]] = s["cultivos"].get(f["cultivo"], 0) + int(f["cosechas"])
ids = sorted(lugares)
sit = [lugares[i] for i in ids]
X = np.array([s["x"] for s in sit])
X9 = np.array([s["x9"] for s in sit])
CAT = sorted({c for s in sit for c in s["cultivos"]})
ce = np.array([s["celda"] for s in sit])
decir(f"Lugares {len(sit)} · filas lugar-cultivo {len(filas)} · celdas de clima {len(set(ce))} · cultivos {len(CAT)}")
decir(f"Rasgos: {', '.join(RASGOS)}")

# ── Pliegues por celda, como p6g.py ───────────────────────────────────────────────────────────────────────────────
celdas = sorted(set(ce))
rng = np.random.default_rng(SEM)
rng.shuffle(celdas)
FO = {c: i % 5 for i, c in enumerate(celdas)}
fo = np.array([FO[c] for c in ce])
banda = (X[:, 0] // 500).astype(int)


def entreno(idx):
    xs, ys, ws, bs = [], [], [], []
    for i in idx:
        for c, n in sit[i]["cultivos"].items():
            xs.append(X[i]); ys.append(c); ws.append(n); bs.append(banda[i])
    return np.array(xs), np.array(ys), np.array(ws, float), np.array(bs)


def ordenar(m, x):
    p = m.predict_proba(x)
    cl = np.array(m.classes_)
    return [[str(c) for c in cl[np.argsort(-f, kind="stable")]] for f in p]


res = {k: [None] * len(sit) for k in ("Bosque con datos reales", "Tabla por altitud", "Cultivo más común")}
for f in range(5):
    tr, te = np.where(fo != f)[0], np.where(fo == f)[0]
    xt, yt, wt, bt = entreno(tr)
    m = RandomForestClassifier(**HP, random_state=SEM + f, n_jobs=-1).fit(xt, yt, sample_weight=wt)
    glob = {c: wt[yt == c].sum() for c in CAT}
    comun = sorted(CAT, key=lambda c: -glob[c])
    tabla = {b: sorted(CAT, key=lambda c: (-wt[(bt == b) & (yt == c)].sum(), -glob[c])) for b in np.unique(bt)}
    for i, o in zip(te, ordenar(m, X[te])):
        res["Bosque con datos reales"][i] = o
        res["Cultivo más común"][i] = comun
        res["Tabla por altitud"][i] = tabla.get(banda[i], comun)

res["Regla del catálogo"] = [s["regla"] for s in sit]
fil = list(csv.reader(open(SINTETICO, encoding="utf-8", newline="")))
n = fil[0].index("cultivo")
sint = RandomForestClassifier(**HP, random_state=SEM, n_jobs=-1).fit(
    np.array([[float(v) for v in r[:n]] for r in fil[1:]]), np.array([r[n] for r in fil[1:]]))
res["Bosque sintético previo"] = ordenar(sint, X9)


# ── Medidas ───────────────────────────────────────────────────────────────────────────────────────────────────────
def medidas(ordenes):
    h, r3, w = [], [], []
    for o, s in zip(ordenes, sit):
        c = s["cultivos"]
        t = sum(c.values())
        h.append(1.0 if o[0] in c else 0.0)
        r3.append(sum(v for k, v in c.items() if k in o[:3]) / t)
        w.append(t)
    return np.array(h), np.array(r3), np.array(w, float)


def ic(a, b, w=None):
    """Diferencia pareada a − b, media (ponderada si hay pesos) e IC 95 % bootstrap por celda."""
    u = np.unique(ce)
    por = {c: np.where(ce == c)[0] for c in u}
    r = np.random.default_rng(SEM)
    d = a - b
    pesos = np.ones(len(d)) if w is None else w
    media = float(np.average(d, weights=pesos))
    boot = []
    for _ in range(1500):
        idx = np.concatenate([por[c] for c in r.choice(u, len(u))])
        boot.append(np.average(d[idx], weights=pesos[idx]))
    return media, float(np.percentile(boot, 2.5)), float(np.percentile(boot, 97.5))


M = {k: medidas(v) for k, v in res.items()}
real = M["Bosque con datos reales"]
salida = {"lugares": len(sit), "celdas": len(set(ce)), "estrategias": {}}
decir()
decir(f"{'Estrategia':<26}{'Primera cosechada':>19}{'Cosechas entre las tres':>25}   Ventaja del bosque en la primera (IC 95 %)   Ventaja entre las tres (IC 95 %)")
for k, (h, r3, w) in M.items():
    p1, p3 = 100 * h.mean(), 100 * np.average(r3, weights=w)
    fila = {"primera": p1, "tres": p3}
    if k == "Bosque con datos reales":
        decir(f"{k:<26}{p1:>18.1f}%{p3:>24.1f}%   —")
    else:
        e, lo, hi = ic(real[0], h)
        e3, lo3, hi3 = ic(real[1], r3, w)
        fila.update({"ventajaPrimera": [100 * e, 100 * lo, 100 * hi], "ventajaTres": [100 * e3, 100 * lo3, 100 * hi3]})
        decir(f"{k:<26}{p1:>18.1f}%{p3:>24.1f}%   {100 * e:+5.1f} pp ({100 * lo:+5.1f} a {100 * hi:+5.1f})"
              f"            {100 * e3:+5.1f} pp ({100 * lo3:+5.1f} a {100 * hi3:+5.1f})")
    # Intervalo de la tasa de cada estrategia, por remuestreo de celdas, para las barras de la figura.
    u = np.unique(ce)
    por = {c: np.where(ce == c)[0] for c in u}
    rb = np.random.default_rng(SEM)
    boot = [h[np.concatenate([por[c] for c in rb.choice(u, len(u))])].mean() for _ in range(1500)]
    fila["icPrimera"] = [100 * float(np.percentile(boot, 2.5)), 100 * float(np.percentile(boot, 97.5))]
    salida["estrategias"][k] = fila

sin_apto = 100 * np.mean([s["sinApto"] for s in sit])
decir()
decir(f"La regla del catálogo declara sin cultivo apto el {sin_apto:.1f} % de los lugares.")
salida["reglaSinApto"] = sin_apto

# Por pliegue, para la variabilidad que pide la guía: media ± desviación estándar entre los cinco pliegues.
decir()
decir("Primera cosechada por pliegue (media ± desviación estándar de los 5 pliegues):")
for k, (h, _, _) in M.items():
    pl = [100 * h[fo == f].mean() for f in range(5)]
    decir(f"  {k:<26}{np.mean(pl):6.1f} ± {np.std(pl, ddof=1):4.1f}   {['%.1f' % v for v in pl]}")
    salida["estrategias"][k]["porPliegue"] = pl

# Descripción del conjunto y del comportamiento del modelo, que el artículo también cita.
total_cosechas = sum(sum(s["cultivos"].values()) for s in sit)
decir()
decir(f"Cosechas registradas en los lugares del conjunto: {total_cosechas}")
primeras = defaultdict(int)
for o in res["Bosque con datos reales"]:
    primeras[o[0]] += 1
decir("Primera sugerencia del bosque, por cultivo: " + ", ".join(
    f"{c} {100 * n / len(sit):.1f} %" for c, n in sorted(primeras.items(), key=lambda x: -x[1])))
decir("Parte de las cosechas de cada cultivo que queda entre las tres sugerencias del bosque:")
cubre = {}
for c in CAT:
    tot = sum(s["cultivos"].get(c, 0) for s in sit)
    den = sum(s["cultivos"].get(c, 0) for s, o in zip(sit, res["Bosque con datos reales"]) if c in o[:3])
    cubre[c] = 100 * den / tot if tot else float("nan")
    decir(f"  {c:<20} {cubre[c]:5.1f} %  de {tot} cosechas")
salida["cosechas"] = total_cosechas
salida["primerasDelBosque"] = {c: 100 * n / len(sit) for c, n in primeras.items()}
salida["cosechasEntreLasTresPorCultivo"] = cubre

open(SALIDA, "w", encoding="utf-8").write("\n".join(lineas) + "\n")
if SALIDA_JSON:
    open(SALIDA_JSON, "w", encoding="utf-8").write(json.dumps(salida, ensure_ascii=False, indent=2) + "\n")
