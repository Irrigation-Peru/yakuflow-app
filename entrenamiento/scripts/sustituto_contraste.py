"""Resumen estadístico del contraste pareado del modelo sustituto contra el azar y la regla experta, con la salida de
crop-app/herramientas/redes/src/contrastar.ts: diferencias por red, IC 95 % con t, d de Cohen, Wilcoxon y redes
ganadas. Con dos archivos, compara además los dos modelos red por red.

    python -I scripts/sustituto_contraste.py resultados/sustituto-contraste.jsonl
"""
import json
import math
import sys
import statistics as st

from scipy.stats import t as student, wilcoxon

sys.stdout.reconfigure(encoding="utf-8")


def leer(ruta):
    return [json.loads(l) for l in open(ruta, encoding="utf-8") if l.startswith('{"red"')]


def tasa(f, m, campo="mejoran"):
    return 100 * f[m][campo] / f[m]["evaluadas"]


def pareada(a, b):
    d = [x - y for x, y in zip(a, b)]
    media, de = st.mean(d), st.stdev(d)
    m = 0.5 * (len(d) - 1)
    medio = student.ppf(0.975, len(d) - 1) * de / math.sqrt(len(d))
    p = wilcoxon(d).pvalue if any(d) else 1.0
    return media, media - medio, media + medio, media / de if de else float("inf"), p, sum(x > 0 for x in d), len(d)


def resumen(nombre, filas):
    print(f"\n== {nombre}: {len(filas)} redes, presupuesto medio {st.mean(f['presupuesto'] for f in filas):.1f} de {st.mean(f['posibles'] for f in filas):.1f}")
    for m in ("modelo", "reglaExperta", "alAzar"):
        print(f"  {m:13s} útiles {st.mean(tasa(f, m) for f in filas):5.1f} %  pasan {st.mean(tasa(f, m, 'pasan') for f in filas):5.1f} %  mejor ahorro {st.mean(f[m]['mejorAhorroPct'] for f in filas):4.1f} %")
    for rival in ("alAzar", "reglaExperta"):
        media, lo, hi, d, p, gana, n = pareada([tasa(f, "modelo") for f in filas], [tasa(f, rival) for f in filas])
        print(f"  modelo − {rival:12s} {media:+.1f} pp [{lo:+.1f}; {hi:+.1f}]  d = {d:.2f}  p = {p:.1e}  gana en {gana} de {n}")


archivos = sys.argv[1:]
datos = {ruta: leer(ruta) for ruta in archivos}
for ruta, filas in datos.items():
    resumen(ruta.rsplit("/", 1)[-1], filas)
if len(archivos) == 2:
    a, b = (datos[r] for r in archivos)
    assert [f["red"] for f in a] == [f["red"] for f in b]
    media, lo, hi, d, p, gana, n = pareada([tasa(f, "modelo") for f in b], [tasa(f, "modelo") for f in a])
    print(f"\n== {archivos[1].rsplit('/', 1)[-1]} − {archivos[0].rsplit('/', 1)[-1]}, útiles del modelo: {media:+.1f} pp [{lo:+.1f}; {hi:+.1f}]  d = {d:.2f}  p = {p:.1e}  mejor en {gana} de {n}")
    media, lo, hi, d, p, gana, n = pareada([f["modelo"]["mejorAhorroPct"] for f in b], [f["modelo"]["mejorAhorroPct"] for f in a])
    print(f"   mejor ahorro: {media:+.1f} pp [{lo:+.1f}; {hi:+.1f}]  p = {p:.1e}")
