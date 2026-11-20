"""Paso 3 del piloto: compara el modelo con etiquetas reales contra sus tres rivales.

Criterio fijado antes de ver resultados: el modelo aporta solo si supera a los tres rivales y el intervalo del 95 %
de la diferencia pareada excluye el cero. La prueba se hace por zonas enteras (celdas de clima) que no vio al entrenar.
"""
import csv, json, sys
import numpy as np
from sklearn.ensemble import RandomForestClassifier

sys.stdout.reconfigure(encoding='utf8')
S, REPO = sys.argv[1], sys.argv[2]
SEM = 20261106
HP = {'n_estimators': 30, 'max_depth': 10, 'min_samples_leaf': 10}
d = json.load(open(S + '/piloto/sitios-rasgos.json', encoding='utf8'))
ena = [s for s in d['sitios'] if s['id'].startswith('E')]
cen = [s for s in d['sitios'] if s['id'].startswith('C')]
CLASES = ['Arveja, verde', 'Avena', 'Cebada', 'Haba, grano seco', 'Haba, verde', 'Maíz, grano', 'Papa', 'Zanahoria']
CENTRAL = {'19', '12', '10', '09'}
X = np.array([s['rasgos'] for s in ena], float)
XC = np.array([s['rasgos'] for s in cen], float)
print('ENA sitios', len(ena), 'celdas', len({s['celda'] for s in ena}), '| CENAGRO', len(cen), 'celdas', len({s['celda'] for s in cen}))
print('rasgos', d['rasgos'])
print('variacion por rasgo', dict(zip(d['rasgos'], np.round(X.std(axis=0), 3))))
tot = {c: sum(s['cultivos'].get(c, {}).get('n', 0) for s in ena) for c in CLASES}
print('registros por clase', tot)

# Rival: modelo sintetico actual, reentrenado igual que en produccion
with open(REPO + '/packages/modelos/entrenamiento/datos/sitios-cultivos.csv', encoding='utf8', newline='') as f:
    fil = list(csv.reader(f))
n = fil[0].index('cultivo')
Xs = np.array([[float(v) for v in r[:n]] for r in fil[1:]])
ys = np.array([r[n] for r in fil[1:]])
sint = RandomForestClassifier(**HP, random_state=SEM, n_jobs=-1).fit(Xs, ys)


def orden_proba(m, x, permit):
    p = m.predict_proba(x)
    cl = list(m.classes_)
    idx = [cl.index(c) for c in permit if c in cl]
    nom = [cl[i] for i in idx]
    q = p[:, idx]
    return [[nom[j] for j in np.argsort(-fila, kind='stable')] for fila in q]


def medidas(ordenes, sitios, llave='n'):
    """Por sitio: primera sugerencia realmente presente; y registros cuyo cultivo cae entre las tres mostradas."""
    h1, r3, r1, pes = [], [], [], []
    for o, s in zip(ordenes, sitios):
        c = {k: v.get(llave, 0) for k, v in s['cultivos'].items() if v.get(llave, 0) > 0}
        t = sum(c.values())
        if t == 0:
            h1.append(np.nan); r3.append(np.nan); r1.append(np.nan); pes.append(0)
            continue
        h1.append(1.0 if o[0] in c else 0.0)
        r3.append(sum(v for k, v in c.items() if k in o[:3]) / t)
        r1.append(c.get(o[0], 0) / t)
        pes.append(t)
    return np.array(h1), np.array(r3), np.array(r1), np.array(pes, float)


def folds(sitios, k=5):
    cel = sorted({s['celda'] for s in sitios})
    rng = np.random.default_rng(SEM)
    rng.shuffle(cel)
    return {c: i % k for i, c in enumerate(cel)}


FO = folds(ena)
fo = np.array([FO[s['celda']] for s in ena])


def filas_entreno(idx, llave='n'):
    xs, ys, ws = [], [], []
    for i in idx:
        for c, v in ena[i]['cultivos'].items():
            w = v.get(llave, 0)
            if w > 0:
                xs.append(X[i]); ys.append(c); ws.append(w)
    return np.array(xs), np.array(ys), np.array(ws, float)


def correr(llave='n'):
    res = {k: [None] * len(ena) for k in ('real', 'sintetico', 'regla', 'frecuencia')}
    resC = {k: [None] * len(cen) for k in res}
    imp = []
    CENCL = ['Avena', 'Cebada', 'Maíz, grano', 'Papa', 'Zanahoria']
    for f in range(5):
        tr = np.where(fo != f)[0]
        te = np.where(fo == f)[0]
        xt, yt, wt = filas_entreno(tr, llave)
        m = RandomForestClassifier(**HP, random_state=SEM + f, n_jobs=-1).fit(xt, yt, sample_weight=wt)
        imp.append(m.feature_importances_)
        frec = {c: wt[yt == c].sum() for c in CLASES}
        of = sorted(CLASES, key=lambda c: -frec[c])
        for i, a, b in zip(te, orden_proba(m, X[te], CLASES), orden_proba(sint, X[te], CLASES)):
            res['real'][i] = a
            res['sintetico'][i] = b
            res['regla'][i] = [c for c in ena[i]['ranking'] if c in CLASES]
            res['frecuencia'][i] = of
        # Censo: solo ubicaciones de celdas que este pliegue no vio al entrenar
        ic = [j for j, s in enumerate(cen) if FO.get(s['celda'], hash(s['celda']) % 5) == f]
        if ic:
            for j, a, b in zip(ic, orden_proba(m, XC[ic], CENCL), orden_proba(sint, XC[ic], CENCL)):
                resC['real'][j] = a
                resC['sintetico'][j] = b
                resC['regla'][j] = [c for c in cen[j]['ranking'] if c in CENCL]
                resC['frecuencia'][j] = [c for c in of if c in CENCL]
    return res, resC, np.mean(imp, axis=0)


def ic(dif, cel, it=2000):
    """Bootstrap por celda de la diferencia media."""
    ok = ~np.isnan(dif)
    dif, cel = dif[ok], cel[ok]
    u = np.unique(cel)
    por = {c: dif[cel == c] for c in u}
    rng = np.random.default_rng(SEM)
    m = []
    for _ in range(it):
        v = np.concatenate([por[c] for c in rng.choice(u, len(u))])
        m.append(v.mean())
    return float(np.mean(dif)), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def reporte(titulo, res, sitios, llave='n'):
    print(f'\n=== {titulo} (sitios {len(sitios)})')
    cel = np.array([s['celda'] for s in sitios])
    M = {k: medidas(res[k], sitios, llave) for k in res}
    print(f"{'estrategia':12s} {'1ra sembrada':>13s} {'registros en 3':>15s} {'registros en 1ra':>17s}")
    for k, (h, r3, r1, pes) in M.items():
        ok = pes > 0
        print(f'{k:12s} {100 * np.nanmean(h):12.1f}% {100 * np.average(r3[ok], weights=pes[ok]):14.1f}% {100 * np.average(r1[ok], weights=pes[ok]):16.1f}%')
    for rival in ('sintetico', 'regla', 'frecuencia'):
        for nom, a, b in (('1ra sembrada', M['real'][0], M[rival][0]), ('en las 3', M['real'][1], M[rival][1])):
            e, lo, hi = ic(a - b, cel)
            print(f'  real - {rival:11s} {nom:13s} {100 * e:+6.1f} pp  IC95 [{100 * lo:+6.1f}, {100 * hi:+6.1f}]')
    pri = {}
    for o in res['real']:
        pri[o[0]] = pri.get(o[0], 0) + 1
    print('  primera sugerencia del modelo real:', dict(sorted(pri.items(), key=lambda x: -x[1])))


res, resC, imp = correr('n')
reporte('ENA sierra 2000-4600 m, zonas no vistas', res, ena)
idx = [i for i, s in enumerate(ena) if s['dep'] in CENTRAL]
reporte('Solo sierra central', {k: [v[i] for i in idx] for k, v in res.items()}, [ena[i] for i in idx])
idc = [j for j in range(len(cen)) if resC['real'][j] is not None]
reporte('Validacion externa CENAGRO 2012, sierra central, 5 clases', {k: [v[j] for j in idc] for k, v in resC.items()}, [cen[j] for j in idc])
print('\nimportancia', dict(sorted(zip(d['rasgos'], np.round(imp, 3)), key=lambda x: -x[1])))

res2, _, _ = correr('bueno')
reporte('Variante: solo cosechas con rendimiento >= mediana del cultivo', res2, ena, 'bueno')
