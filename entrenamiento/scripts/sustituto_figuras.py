"""Figuras del modelo sustituto desplegado en crop-app: su desempeño por criterio y el contraste con dos líneas base.

- Fig. 3: desempeño predictivo por criterio, de los metadatos del modelo publicado (sustituto.json): R² y correlación
  de orden dentro de cada red, en validación cruzada de cinco pliegues por red; y el área bajo la curva de «funciona».
- Fig. 4: contraste por red contra el azar y la regla experta con el mismo presupuesto (contrastar.ts), con IC t 95 %.
"""
import json, sys
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy import stats
sys.stdout.reconfigure(encoding="utf-8")

# Uso: python -I scripts/sustituto_figuras.py ../crop-app/packages/modelos resultados/sustituto-contraste.jsonl resultados
APP, CONTRASTE, SALIDA = (Path(a) for a in sys.argv[1:4])
SALIDA.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({"font.family": "serif", "font.serif": ["Times New Roman", "DejaVu Serif"], "font.size": 11,
                     "axes.labelsize": 11, "xtick.labelsize": 10, "ytick.labelsize": 10, "legend.fontsize": 9, "figure.dpi": 300})
GRIS, AZUL, VERDE, NARANJA, GRIS_CLARO = "#4b5563", "#2a78d6", "#1f8a4c", "#e07a1f", "#9ca3af"
coma = lambda v, d=2: f"{v:.{d}f}".replace(".", ",")
signo = lambda v: f"{v:+.1f}".replace(".", ",").replace("-", "\u2212")


def fig3():
    m = json.loads((APP / "sustituto.json").read_text(encoding="utf-8"))["metricas"]
    claves = ["costoPct", "uniformidad", "margenM"]
    nombres = ["Costo", "Uniformidad", "Margen de presión"]
    r2 = [m["errores"][k]["r2"] for k in claves]
    rho = [m["correlacionDentroDeCadaRed"][k] for k in claves]
    fig, ax = plt.subplots(figsize=(6.4, 2.3))
    x = np.arange(3); w = 0.36
    ax.bar(x - w / 2, r2, w, color=GRIS, label="R² en redes no vistas")
    ax.bar(x + w / 2, rho, w, color=AZUL, label="Correlación de orden dentro de cada red")
    for i in range(3):
        ax.text(i - w / 2, r2[i] + 0.02, coma(r2[i]), ha="center", fontsize=9)
        ax.text(i + w / 2, rho[i] + 0.02, coma(rho[i]), ha="center", fontsize=9)
    ax.set_xticks(x, nombres); ax.set_ylim(0, 1.08)
    ax.set_yticks([0, .25, .5, .75, 1], ["0,00", "0,25", "0,50", "0,75", "1,00"]); ax.set_ylabel("Valor")
    ax.legend(frameon=False, loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=2); ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout(); d = SALIDA / "fig-sustituto-desempeno.png"; fig.savefig(d, bbox_inches="tight"); plt.close(fig)
    return d, f"R² {[round(v,3) for v in r2]} rho {[round(v,3) for v in rho]} AUC {m['areaBajoLaCurvaDeFunciona']:.3f}"


def fig4():
    filas = [json.loads(l) for l in CONTRASTE.read_text(encoding="utf-8").splitlines() if l.startswith("{")]
    t = lambda f, e: f[e]["mejoran"] / f[e]["evaluadas"] if f[e]["evaluadas"] else 0.0
    claves = ["modelo", "alAzar", "reglaExperta"]
    nombres = ["Modelo\nsustituto", "Al azar", "Regla\nexperta"]
    serie = {k: np.array([t(f, k) for f in filas]) for k in claves}
    n = len(filas); tc = stats.t.ppf(0.975, n - 1)
    medias = [serie[k].mean() for k in claves]
    ic = [tc * serie[k].std(ddof=1) / np.sqrt(n) for k in claves]
    fig, (izq, der) = plt.subplots(1, 2, figsize=(7.2, 2.3), gridspec_kw={"width_ratios": [1.05, 1]})
    izq.bar(nombres, [100 * v for v in medias], yerr=[100 * e for e in ic], capsize=4, color=[AZUL, GRIS, VERDE])
    for i, (v, e) in enumerate(zip(medias, ic)):
        izq.text(i, 100 * (v + e) + 2, coma(100 * v, 1) + " %", ha="center", fontsize=9)
    izq.set_ylabel("Funcionan y mejoran\nsobre recalculadas"); izq.set_ylim(0, 100)
    izq.set_yticks([0, 25, 50, 75, 100], ["0 %", "25 %", "50 %", "75 %", "100 %"]); izq.tick_params(axis="x", labelsize=9)
    izq.spines[["top", "right"]].set_visible(False)
    for i, (k, et) in enumerate([("alAzar", "frente al\nazar"), ("reglaExperta", "frente a la\nregla experta")]):
        d = serie["modelo"] - serie[k]; mm = d.mean(); e = tc * d.std(ddof=1) / np.sqrt(n)
        der.errorbar(100 * mm, i, xerr=100 * e, fmt="o", color=NARANJA, capsize=4, markersize=5)
        der.text(100 * mm, i + 0.22, signo(100 * mm) + " pp", ha="center", fontsize=9)
    der.axvline(0, color=GRIS, linewidth=0.8, linestyle="--")
    der.set_yticks([0, 1], ["frente al\nazar", "frente a la\nregla experta"]); der.set_ylim(-0.5, 1.6); der.set_xlim(-5, 55)
    der.set_xlabel("Diferencia pareada, puntos porcentuales"); der.spines[["top", "right", "left"]].set_visible(False)
    fig.tight_layout(); dd = SALIDA / "fig-sustituto-contraste.png"; fig.savefig(dd, bbox_inches="tight"); plt.close(fig)
    return dd, f"{n} redes · " + " · ".join(f"{k} {100*v:.1f} %" for k, v in zip(claves, medias))


for f in (fig3, fig4):
    d, r = f(); print(f"{d.name:<34} {r}")
