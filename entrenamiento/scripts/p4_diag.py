"""Diagnostico exploratorio (no estaba en el criterio fijado antes): cuanto aprende de verdad el modelo real."""
import json, sys
import numpy as np
from sklearn.ensemble import RandomForestClassifier
sys.stdout.reconfigure(encoding='utf8')
S = sys.argv[1]
SEM = 20261106
HP = {'n_estimators': 30, 'max_depth': 10, 'min_samples_leaf': 10}
d = json.load(open(S + '/piloto/sitios-rasgos.json', encoding='utf8'))
ena = [s for s in d['sitios'] if s['id'].startswith('E')]
CL = ['Arveja, verde', 'Avena', 'Cebada', 'Haba, grano seco', 'Haba, verde', 'Maíz, grano', 'Papa', 'Zanahoria']
X = np.array([s['rasgos'] for s in ena], float)
cel = sorted({s['celda'] for s in ena})
rng = np.random.default_rng(SEM)
rng.shuffle(cel)
FO = {c: i % 5 for i, c in enumerate(cel)}
fo = np.array([FO[s['celda']] for s in ena])
alt = X[:, 0]
banda = (alt // 500).astype(int)
apt_vacio = np.array([s['indices'][0] <= 0 for s in ena])


def filas(idx):
    xs, ys, ws, bs = [], [], [], []
    for i in idx:
        for c, v in ena[i]['cultivos'].items():
            xs.append(X[i]); ys.append(c); ws.append(v['n']); bs.append(banda[i])
    return np.array(xs), np.array(ys), np.array(ws, float), np.array(bs)


P = np.zeros((len(ena), len(CL)))
PB = np.zeros((len(ena), len(CL)))
for f in range(5):
    tr, te = np.where(fo != f)[0], np.where(fo == f)[0]
    xt, yt, wt, bt = filas(tr)
    m = RandomForestClassifier(**HP, random_state=SEM + f, n_jobs=-1).fit(xt, yt, sample_weight=wt)
    idx = [list(m.classes_).index(c) for c in CL]
    P[te] = m.predict_proba(X[te])[:, idx]
    tabla = {}
    for b in np.unique(bt):
        mask = bt == b
        tabla[b] = np.array([wt[mask & (yt == c)].sum() for c in CL])
    glob = np.array([wt[yt == c].sum() for c in CL])
    for i in te:
        v = tabla.get(banda[i], glob)
        PB[i] = v / v.sum()


def med(Pm, nombre):
    h1, r3, pes = [], [], []
    for i, s in enumerate(ena):
        o = [CL[j] for j in np.argsort(-Pm[i], kind='stable')]
        c = {k: v['n'] for k, v in s['cultivos'].items()}
        t = sum(c.values())
        h1.append(o[0] in c); r3.append(sum(v for k, v in c.items() if k in o[:3]) / t); pes.append(t)
    print(f'{nombre:32s} 1ra sembrada {100 * np.mean(h1):5.1f}%   registros en 3 {100 * np.average(r3, weights=pes):5.1f}%')


med(P, 'modelo real (9 rasgos)')
med(PB, 'frecuencia por banda de 500 m')
print('\nrecuerdo por cultivo: de sus registros, cuantos quedan entre las 3 sugerencias')
for k, c in enumerate(CL):
    tot = ok = okb = 0
    for i, s in enumerate(ena):
        n = s['cultivos'].get(c, {}).get('n', 0)
        tot += n
        ok += n if c in [CL[j] for j in np.argsort(-P[i])[:3]] else 0
        okb += n if c in [CL[j] for j in np.argsort(-PB[i])[:3]] else 0
    print(f'  {c:18s} registros {tot:6d}  modelo {100 * ok / tot:5.1f}%   por banda {100 * okb / tot:5.1f}%')
tres = {}
for i in range(len(ena)):
    k = tuple(sorted(CL[j] for j in np.argsort(-P[i])[:3]))
    tres[k] = tres.get(k, 0) + 1
print('\ntrios sugeridos', sorted(tres.items(), key=lambda x: -x[1])[:6])
print('\nregla sin cultivo apto en ENA:', int(apt_vacio.sum()), f'{100 * apt_vacio.mean():.1f}%', ' altitud media', round(float(alt[apt_vacio].mean())), 'vs', round(float(alt[~apt_vacio].mean())))
reg = np.array([[c in [x for x in s['ranking'] if x in CL][:1] and c in s['cultivos'] for c in CL] for s in ena]).any(axis=1)
print('regla, 1ra sembrada, solo donde SI hay apto:', f'{100 * reg[~apt_vacio].mean():.1f}%')
