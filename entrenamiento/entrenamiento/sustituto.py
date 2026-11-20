"""Entrena el modelo sustituto (HU0025) con las redes que genera el módulo de cálculo y lo exporta a ONNX.

Dada una red y una modificación, estima cómo cambian el costo, la uniformidad y el margen de presión, y si la red sigue
funcionando. La propuesta nunca se muestra con esta estimación: el módulo la recalcula en la aplicación.

    python -I entrenamiento/sustituto.py --datos data/redes_generadas.csv --salida ../crop-app/packages/modelos

La validación separa por red: una red nunca cae en entrenamiento y en prueba a la vez.
"""

import argparse
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import onnxruntime
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score, roc_auc_score
from sklearn.model_selection import GroupKFold

SEMILLA = 20261107
RAIZ = Path(__file__).resolve().parent.parent
RESULTADOS = RAIZ / "resultados" / "sustituto.json"
SALIDAS = ["costoPct", "uniformidad", "margenM", "funciona"]
# El tamaño se limita por lo que pesa al bajarlo al navegador.
HIPERPARAMETROS = {"n_estimators": 30, "max_depth": 11, "min_samples_leaf": 5}
PARTICIONES = 5


def leer(ruta):
    with ruta.open(encoding="utf-8", newline="") as archivo:
        filas = list(csv.reader(archivo))
    cabecera, cuerpo = filas[0], filas[1:]
    datos = np.array(cuerpo, dtype=np.float64)
    # Las salidas van al final y por posición: uniformidad y margenM también son rasgos del diseño de partida, y
    # buscarlas por nombre daría esa columna y no la del resultado de la modificación.
    assert cabecera[-len(SALIDAS) :] == SALIDAS, cabecera[-len(SALIDAS) :]
    fin = len(cabecera) - len(SALIDAS)
    return cabecera[1:fin], datos[:, 1:fin], datos[:, fin:], datos[:, 0].astype(int)


def main():
    argumentos = argparse.ArgumentParser()
    argumentos.add_argument("--datos", type=Path, required=True)
    argumentos.add_argument("--salida", type=Path, required=True)
    a = argumentos.parse_args()

    rasgos, x, y, redes = leer(a.datos)
    # Lo que el modelo estima por partición, para medir sobre todas las redes no vistas.
    estimado = np.zeros_like(y)
    linea_base = np.zeros_like(y)
    for entrenar, probar in GroupKFold(n_splits=PARTICIONES).split(x, y, groups=redes):
        assert not set(redes[entrenar]) & set(redes[probar]), "una red cayó en entrenamiento y en prueba"
        bosque = RandomForestRegressor(**HIPERPARAMETROS, random_state=SEMILLA, n_jobs=-1)
        bosque.fit(x[entrenar], y[entrenar])
        estimado[probar] = bosque.predict(x[probar])
        linea_base[probar] = y[entrenar].mean(axis=0)

    errores = {
        s: {
            "errorMedioAbsoluto": float(mean_absolute_error(y[:, j], estimado[:, j])),
            "errorDeEstimarSiempreLaMedia": float(mean_absolute_error(y[:, j], linea_base[:, j])),
            "r2": float(r2_score(y[:, j], estimado[:, j])),
        }
        for j, s in enumerate(SALIDAS)
    }
    # Dentro de cada red, lo que importa es el orden: si la que estima más barata es la que de verdad es más barata.
    aciertos = {}
    for j, s in enumerate(SALIDAS[:3]):
        signo = -1 if s == "costoPct" else 1
        correlaciones = []
        for r in np.unique(redes):
            m = redes == r
            if np.std(estimado[m, j]) > 0 and np.std(y[m, j]) > 0:
                correlaciones.append(np.corrcoef(signo * estimado[m, j], signo * y[m, j])[0, 1])
        aciertos[s] = float(np.mean(correlaciones))

    bosque = RandomForestRegressor(**HIPERPARAMETROS, random_state=SEMILLA, n_jobs=-1)
    bosque.fit(x, y)
    onnx = convert_sklearn(
        bosque,
        initial_types=[("rasgos", FloatTensorType([None, len(rasgos)]))],
        final_types=[("variable", FloatTensorType([None, len(SALIDAS)]))],
        target_opset={"": 17, "ai.onnx.ml": 3},
    )
    bytes_del_modelo = onnx.SerializeToString()
    sesion = onnxruntime.InferenceSession(bytes_del_modelo, providers=["CPUExecutionProvider"])
    x32 = x.astype(np.float32)
    salida_onnx = sesion.run(None, {"rasgos": x32})[0]
    diferencia = float(np.max(np.abs(salida_onnx - bosque.predict(x32.astype(np.float64)))))

    huella = hashlib.sha256(a.datos.read_bytes()).hexdigest()
    metricas = {
        "validacion": f"Cruzada por red, {PARTICIONES} particiones, sobre redes no vistas",
        "errores": errores,
        "areaBajoLaCurvaDeFunciona": float(roc_auc_score(y[:, 3], estimado[:, 3])) if len(set(y[:, 3])) > 1 else None,
        "correlacionDentroDeCadaRed": aciertos,
        "partFuncionan": float(y[:, 3].mean()),
        "hiperparametros": HIPERPARAMETROS,
        "diferenciaMaximaConOnnx": diferencia,
    }
    metadatos = {
        "nombre": "sustituto",
        "version": f"redes-{huella[:8]}",
        "rasgos": rasgos,
        "salidas": SALIDAS,
        "metricas": metricas,
        "conjunto": (
            f"{len(np.unique(redes))} redes de ejemplo generadas por el módulo de cálculo, con {len(y)} modificaciones medidas. "
            "El costo sale de precios provisionales: con el catálogo real hay que volver a generar y entrenar."
        ),
        "entrenadoEn": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "archivo": "sustituto.onnx",
    }
    (a.salida / "sustituto.onnx").write_bytes(bytes_del_modelo)
    (a.salida / "sustituto.json").write_text(json.dumps(metadatos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    RESULTADOS.write_text(
        json.dumps({**metricas, "version": metadatos["version"], "semilla": SEMILLA, "datos": {"sha256": huella, "filas": len(y), "redes": int(len(np.unique(redes)))}, "pesoDelOnnxKb": round(len(bytes_del_modelo) / 1024)}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{len(y)} filas de {len(np.unique(redes))} redes. ONNX {len(bytes_del_modelo) / 1024:.0f} KB, diferencia {diferencia:.2e}")
    print(json.dumps({k: metricas[k] for k in ("errores", "areaBajoLaCurvaDeFunciona", "correlacionDentroDeCadaRed", "partFuncionan")}, indent=1))


if __name__ == "__main__":
    main()
