"""Entrena el modelo de cultivos con datos reales (HU0024) y lo exporta a ONNX para el navegador.

Sigue la receta del README: lugares aptos para goteo por gravedad, cultivos del catálogo, `cosechas` como peso, los 7
rasgos con dato real y separación por `celdaClima`. Deja:

- en --salida (packages/modelos de crop-app): cultivos.onnx y cultivos.json, lo que la aplicación carga;
- en resultados/cultivos.json: la evaluación completa, por validación cruzada geográfica de 5 particiones.

    python -I entrenamiento/cultivos.py --salida ../crop-app/packages/modelos

La evaluación se hace siempre sobre zonas que el modelo no vio. El modelo que se exporta se vuelve a entrenar con todos
los datos: esa versión no tiene prueba propia, y sus cifras son las de la validación cruzada.
"""

import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import onnxruntime
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score
from sklearn.model_selection import GroupKFold

SEMILLA = 20261106
RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "data" / "ena2024_sitio_cultivo.csv"
RESULTADOS = RAIZ / "resultados" / "cultivos.json"

RASGOS = [
    "altitudM",
    "temperaturaMediaAnualC",
    "minimaDelMesMasFrioC",
    "et0MediaMmDia",
    "lluviaAnualMm",
    "phDelSuelo",
    "texturaGruesa",
]
# Los mismos del piloto: el tamaño se eligió por lo que pesa al bajarlo al navegador.
HIPERPARAMETROS = {"n_estimators": 30, "max_depth": 10, "min_samples_leaf": 10}
PARTICIONES = 5
BANDA_DE_ALTITUD_M = 500


def leer():
    with DATOS.open(encoding="utf-8-sig", newline="") as archivo:
        filas = [f for f in csv.DictReader(archivo) if f["aptoGoteo"] == "1" and f["enCatalogoActual"] == "1"]
    return {
        "x": np.array([[float(f[r]) for r in RASGOS] for f in filas], dtype=np.float64),
        "y": np.array([f["cultivo"] for f in filas]),
        "peso": np.array([float(f["cosechas"]) for f in filas]),
        "zona": np.array([f["celdaClima"] for f in filas]),
        "sitio": np.array([f["sitio"] for f in filas]),
        "region": np.array([f["region"] for f in filas]),
        "altitud": np.array([float(f["altitudM"]) for f in filas]),
    }


def orden_de_la_linea_base(llaves_de_entrenamiento, y, peso, clases):
    """Para cada llave, las clases de más a menos cosechadas en el entrenamiento; las que faltan, por el total."""
    por_llave = defaultdict(Counter)
    total = Counter()
    for llave, cultivo, p in zip(llaves_de_entrenamiento, y, peso):
        por_llave[llave][cultivo] += p
        total[cultivo] += p

    def ordenar(llave):
        return sorted(clases, key=lambda c: (-por_llave[llave][c], -total[c], c))

    return {llave: ordenar(llave) for llave in por_llave}, ordenar(None)


def predecir_linea_base(tabla, respaldo, llaves):
    return [tabla.get(llave, respaldo) for llave in llaves]


def medidas(rankings, datos, indices):
    """Las medidas de HU0024 sobre las filas de `indices`, con el orden de cultivos que dio cada estrategia."""
    y, peso, sitio = datos["y"][indices], datos["peso"][indices], datos["sitio"][indices]
    primero = np.array([r[0] for r in rankings])
    en_tres = np.array([c in r[:3] for c, r in zip(y, rankings)])
    cosechado = defaultdict(set)
    for s, c in zip(sitio, y):
        cosechado[s].add(c)
    primero_del_sitio = {}
    for s, r in zip(sitio, rankings):
        primero_del_sitio[s] = r[0]
    return {
        "exactitudTop3": float(np.average(en_tres, weights=peso)),
        "exactitudTop3SinPeso": float(np.mean(en_tres)),
        "f1Macro": float(f1_score(y, primero, average="macro", sample_weight=peso, zero_division=0)),
        "f1MacroSinPeso": float(f1_score(y, primero, average="macro", zero_division=0)),
        # La medida del piloto: el primer cultivo sugerido sí se cosecha en ese lugar.
        "primeroSeCosechaEnElLugar": float(np.mean([primero_del_sitio[s] in cosechado[s] for s in primero_del_sitio])),
        "filas": int(len(indices)),
        "lugares": int(len(primero_del_sitio)),
    }


def resumen(por_particion):
    claves = por_particion[0].keys()
    return {
        c: {"media": float(np.mean([p[c] for p in por_particion])), "minimo": float(np.min([p[c] for p in por_particion])), "maximo": float(np.max([p[c] for p in por_particion]))}
        for c in claves
        if c not in ("filas", "lugares")
    }


def main():
    argumentos = argparse.ArgumentParser()
    argumentos.add_argument("--salida", type=Path, required=True)
    salida = argumentos.parse_args().salida

    datos = leer()
    x, y, peso, zona = datos["x"], datos["y"], datos["peso"], datos["zona"]
    clases = sorted(set(y))
    banda = (datos["altitud"] // BANDA_DE_ALTITUD_M).astype(int)

    estrategias = {"modelo": [], "lineaBaseRegion": [], "tablaPorAltitud": []}
    rankings_oof = {nombre: [None] * len(y) for nombre in estrategias}
    for entrenar, probar in GroupKFold(n_splits=PARTICIONES).split(x, y, groups=zona):
        assert not set(zona[entrenar]) & set(zona[probar]), "una zona cayó en entrenamiento y en prueba"
        bosque = RandomForestClassifier(**HIPERPARAMETROS, random_state=SEMILLA, n_jobs=-1)
        bosque.fit(x[entrenar], y[entrenar], sample_weight=peso[entrenar])
        probabilidades = bosque.predict_proba(x[probar])
        columnas = [str(c) for c in bosque.classes_]
        del_modelo = [[columnas[k] for k in np.argsort(-p, kind="stable")] for p in probabilidades]

        tabla, respaldo = orden_de_la_linea_base(datos["region"][entrenar], y[entrenar], peso[entrenar], clases)
        de_region = predecir_linea_base(tabla, respaldo, datos["region"][probar])
        tabla, respaldo = orden_de_la_linea_base(banda[entrenar], y[entrenar], peso[entrenar], clases)
        de_altitud = predecir_linea_base(tabla, respaldo, banda[probar])

        for nombre, rankings in (("modelo", del_modelo), ("lineaBaseRegion", de_region), ("tablaPorAltitud", de_altitud)):
            estrategias[nombre].append(medidas(rankings, datos, probar))
            for i, r in zip(probar, rankings):
                rankings_oof[nombre][i] = r

    evaluacion = {nombre: resumen(particiones) for nombre, particiones in estrategias.items()}
    por_region = {}
    for region in sorted(set(datos["region"])):
        indices = np.where(datos["region"] == region)[0]
        por_region[region] = {nombre: medidas([rankings_oof[nombre][i] for i in indices], datos, indices) for nombre in estrategias}

    criterio = {
        m: evaluacion["modelo"][m]["media"] > evaluacion["lineaBaseRegion"][m]["media"]
        for m in ("exactitudTop3", "f1Macro", "primeroSeCosechaEnElLugar")
    }

    # El que se exporta: entrenado con todo.
    bosque = RandomForestClassifier(**HIPERPARAMETROS, random_state=SEMILLA, n_jobs=-1)
    bosque.fit(x, y, sample_weight=peso)
    onnx = convert_sklearn(
        bosque,
        initial_types=[("rasgos", FloatTensorType([None, len(RASGOS)]))],
        options={id(bosque): {"zipmap": False}},
        target_opset={"": 17, "ai.onnx.ml": 3},
    )
    bytes_del_modelo = onnx.SerializeToString()
    sesion = onnxruntime.InferenceSession(bytes_del_modelo, providers=["CPUExecutionProvider"])
    # La comparación se hace con los mismos float32 que recibe ONNX: el umbral de un árbol puede caer entre un float64 y su redondeo.
    x32 = x.astype(np.float32)
    _, probabilidades_onnx = sesion.run(None, {"rasgos": x32})
    diferencia = float(np.max(np.abs(probabilidades_onnx - bosque.predict_proba(x32.astype(np.float64)))))

    huella = hashlib.sha256(DATOS.read_bytes()).hexdigest()[:8]
    metricas = {
        "validacion": f"Cruzada por zona de clima, {PARTICIONES} particiones, medias sobre zonas no vistas",
        "modelo": {m: evaluacion["modelo"][m]["media"] for m in ("exactitudTop3", "f1Macro", "primeroSeCosechaEnElLugar")},
        "lineaBaseRegion": {m: evaluacion["lineaBaseRegion"][m]["media"] for m in ("exactitudTop3", "f1Macro", "primeroSeCosechaEnElLugar")},
        "tablaPorAltitud": {m: evaluacion["tablaPorAltitud"][m]["media"] for m in ("exactitudTop3", "f1Macro", "primeroSeCosechaEnElLugar")},
        "superaLaLineaBase": criterio,
        "importanciaDeRasgos": {r: float(v) for r, v in zip(RASGOS, bosque.feature_importances_)},
        "hiperparametros": HIPERPARAMETROS,
        "diferenciaMaximaConOnnx": diferencia,
    }
    metadatos = {
        "nombre": "cultivos",
        "version": f"ena2024-{huella}",
        "rasgos": RASGOS,
        "clases": [str(c) for c in bosque.classes_],
        "medianas": [float(v) for v in np.median(x, axis=0)],
        "metricas": metricas,
        "conjunto": (
            f"Lo que se cosecha en {len(set(datos['sitio']))} lugares del Perú con desnivel para regar por gravedad "
            "(INEI, Encuesta Nacional Agropecuaria 2024, licencia ODbL), con clima de NASA POWER y suelo de SoilGrids 2.0. "
            "Dice lo que se suele cultivar en condiciones parecidas, no lo que más conviene: el agua de tu fuente se comprueba aparte."
        ),
        "entrenadoEn": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "archivo": "cultivos.onnx",
    }

    salida.mkdir(parents=True, exist_ok=True)
    (salida / "cultivos.onnx").write_bytes(bytes_del_modelo)
    (salida / "cultivos.json").write_text(json.dumps(metadatos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    RESULTADOS.write_text(
        json.dumps(
            {
                "version": metadatos["version"],
                "datos": {"archivo": DATOS.name, "sha256": hashlib.sha256(DATOS.read_bytes()).hexdigest(), "filas": len(y), "lugares": len(set(datos["sitio"])), "zonas": len(set(zona)), "clases": metadatos["clases"]},
                "semilla": SEMILLA,
                "hiperparametros": HIPERPARAMETROS,
                "evaluacion": evaluacion,
                "porRegion": por_region,
                "superaLaLineaBase": criterio,
                "pesoDelOnnxKb": round(len(bytes_del_modelo) / 1024),
                "diferenciaMaximaConOnnx": diferencia,
                "importanciaDeRasgos": metricas["importanciaDeRasgos"],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"{len(y)} filas, {len(set(datos['sitio']))} lugares, {len(set(zona))} zonas. ONNX {len(bytes_del_modelo) / 1024:.0f} KB, diferencia {diferencia:.2e}")
    for nombre in estrategias:
        e = evaluacion[nombre]
        print(f"{nombre:18} top3 {e['exactitudTop3']['media']:.3f}  F1 {e['f1Macro']['media']:.3f}  primero {e['primeroSeCosechaEnElLugar']['media']:.3f}")
    for region, fila in por_region.items():
        print(f"  {region:7} modelo: top3 {fila['modelo']['exactitudTop3']:.3f} F1 {fila['modelo']['f1Macro']:.3f} primero {fila['modelo']['primeroSeCosechaEnElLugar']:.3f} | base: top3 {fila['lineaBaseRegion']['exactitudTop3']:.3f} F1 {fila['lineaBaseRegion']['f1Macro']:.3f} primero {fila['lineaBaseRegion']['primeroSeCosechaEnElLugar']:.3f}")
    print("supera la línea base:", criterio)


if __name__ == "__main__":
    main()
