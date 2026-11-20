"""Lugares donde cada cultivo se cosecha por encima de la altitud máxima del catálogo (memoria v2.1, 5.2.1.3).

Base: la misma del modelo de cultivos, aptoGoteo = 1 y enCatalogoActual = 1 (13 254 filas, 5 860 lugares).
Límites: altitudMaximaM de packages/calculo/src/agronomia/catalogo-fao56.ts.
Uso: python scripts/altitud_catalogo.py  (desde datos-reales-cultivos)
"""
import csv
import sys

sys.stdout.reconfigure(encoding="utf-8")
LIMITE_M = {"Papa": 4200, "Haba, grano seco": 3800, "Haba, verde": 3800, "Arveja, verde": 3700,
            "Cebada": 3800, "Avena": 4200, "Zanahoria": 2600, "Maíz, grano": 3500}
filas = [r for r in csv.DictReader(open("ena2024_sitio_cultivo.csv", encoding="utf-8-sig"))
         if r["aptoGoteo"] == "1" and r["enCatalogoActual"] == "1"]
print(f"{len(filas)} filas, {len({r['sitio'] for r in filas})} lugares")
total = fuera_total = 0
for cultivo, limite in sorted(LIMITE_M.items()):
    rs = [r for r in filas if r["cultivo"] == cultivo]
    fuera = sum(float(r["altitudM"]) > limite for r in rs)
    alto = max(float(r["altitudM"]) for r in rs)
    pasco_junin = [r for r in rs if r["departamento"] in ("19", "12")]
    fuera_pj = sum(float(r["altitudM"]) > limite for r in pasco_junin)
    print(f"{cultivo:18s} límite {limite} m · {len(rs):5d} lugares · {fuera:4d} por encima ({100 * fuera / len(rs):4.1f} %)"
          f" · más alto {alto:.0f} m · Pasco y Junín {fuera_pj}/{len(pasco_junin)}")
    total += len(rs)
    fuera_total += fuera
print(f"Total: {fuera_total} de {total} ({100 * fuera_total / total:.1f} %)")
