"""Piloto nacional, evaluacion. Mismo criterio que el de la sierra, ahora por costa, sierra y selva.

Escenario A: el modelo solo puede sugerir los 8 cultivos del catalogo actual.
Escenario B: catalogo ampliado a los cultivos mas cosechados del pais (sin coca).
En los dos escenarios se mide contra todo lo que realmente se cosecha, para que la falta de un cultivo cuente.
"""
import csv, json, sys
import numpy as np
from sklearn.ensemble import RandomForestClassifier
sys.stdout.reconfigure(encoding='utf8')
S, REPO = sys.argv[1], sys.argv[2]
SEM = 20261106
HP = {'n_estimators': 30, 'max_depth': 10, 'min_samples_leaf': 10}
d = json.load(open(S + '/piloto/sitios-rasgos-nac.json', encoding='utf8'))
meta = json.load(open(S + '/piloto/sitios_nac.json', encoding='utf8'))
CLASES, CAT = meta['clases'], meta['catalogo']
rel = json.load(open(S + '/piloto/relieve.json', encoding='utf8'))
UMBRAL = float(sys.argv[3])
sit = [s for s in d['sitios'] if s['id'] in rel and None not in rel[s['id']] and max(rel[s['id']]) - s['alt'] >= UMBRAL]
print('FILTRO desnivel >=', UMBRAL, 'm')
X = np.array([s['rasgos'] for s in sit], float)
reg = np.array([s['region'] for s in sit])
NOM = {'1': 'Costa', '2': 'Sierra', '3': 'Selva'}
print('sitios', len(sit), {NOM[k]: int((reg == k).sum()) for k in NOM}, 'celdas', len({s['celda'] for s in sit}), 'clases', len(CLASES))
print('altitud por region', {NOM[k]: (int(np.percentile(X[reg == k, 0], 10)), int(np.percentile(X[reg == k, 0], 90))) for k in NOM})

# Cobertura real del catalogo actual
print('\nCobertura: parte de lo cosechado que el catalogo de 8 cultivos puede representar')
for k in NOM:
    tot = sum(s['total'] for s, r in zip(sit, reg) if r == k)
    cat = sum(sum(v['n'] for c, v in s['cultivos'].items() if c in CAT) for s, r in zip(sit, reg) if r == k)
    ampl = sum(sum(v['n'] for v in s['cultivos'].values()) for s, r in zip(sit, reg) if r == k)
    print(f'  {NOM[k]:7s} catalogo actual {100 * cat / tot:5.1f}%   ampliado {100 * ampl / tot:5.1f}%')

with open(REPO + '/packages/modelos/entrenamiento/datos/sitios-cultivos.csv', encoding='utf8', newline='') as f:
    fil = list(csv.reader(f))
n = fil[0].index('cultivo')
sint = RandomForestClassifier(**HP, random_state=SEM, n_jobs=-1).fit(np.array([[float(v) for v in r[:n]] for r in fil[1:]]), np.array([r[n] for r in fil[1:]]))

cel = sorted({s['celda'] for s in sit})
rng = np.random.default_rng(SEM)
rng.shuffle(cel)
FO = {c: i % 5 for i, c in enumerate(cel)}
fo = np.array([FO[s['celda']] for s in sit])
banda = (X[:, 0] // 500).astype(int)


def entreno(idx, permit):
    xs, ys, ws, bs = [], [], [], []
    for i in idx:
        for c, v in sit[i]['cultivos'].items():
            if c in permit:
                xs.append(X[i]); ys.append(c); ws.append(v['n']); bs.append(banda[i])
    return np.array(xs), np.array(ys), np.array(ws, float), np.array(bs)


def ordenar(m, x):
    p = m.predict_proba(x)
    cl = np.array(m.classes_)
    return [list(cl[np.argsort(-f, kind='stable')]) for f in p]


def correr(permit):
    res = {k: [None] * len(sit) for k in ('modelo real', 'tabla por altitud', 'lo mas comun')}
    for f in range(5):
        tr, te = np.where(fo != f)[0], np.where(fo == f)[0]
        xt, yt, wt, bt = entreno(tr, permit)
        m = RandomForestClassifier(**HP, random_state=SEM + f, n_jobs=-1).fit(xt, yt, sample_weight=wt)
        glob = {c: wt[yt == c].sum() for c in permit}
        of = sorted(permit, key=lambda c: -glob[c])
        tab = {}
        for b in np.unique(bt):
            mk = bt == b
            q = {c: wt[mk & (yt == c)].sum() for c in permit}
            tab[b] = sorted(permit, key=lambda c: (-q[c], -glob[c]))
        for i, o in zip(te, ordenar(m, X[te])):
            res['modelo real'][i] = o
            res['lo mas comun'][i] = of
            res['tabla por altitud'][i] = tab.get(banda[i], of)
    return res


def medidas(ordenes):
    h, r3, pes = [], [], []
    for o, s in zip(ordenes, sit):
        c = {k: v['n'] for k, v in s['cultivos'].items()}
        t = sum(c.values())
        if t == 0:
            h.append(np.nan); r3.append(np.nan); pes.append(0)
            continue
        h.append(1.0 if o[0] in c else 0.0)
        r3.append(sum(v for k, v in c.items() if k in o[:3]) / t)
        pes.append(t)
    return np.array(h), np.array(r3), np.array(pes, float)


def ic(dif, ce):
    ok = ~np.isnan(dif)
    dif, ce = dif[ok], ce[ok]
    u = np.unique(ce)
    por = {c: dif[ce == c] for c in u}
    r = np.random.default_rng(SEM)
    m = [np.concatenate([por[c] for c in r.choice(u, len(u))]).mean() for _ in range(1500)]
    return float(dif.mean()), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def reporte(titulo, res):
    print(f'\n=== {titulo}')
    M = {k: medidas(v) for k, v in res.items()}
    ce = np.array([s['celda'] for s in sit])
    for nombre, mask in [('Peru', np.ones(len(sit), bool))] + [(NOM[k], reg == k) for k in NOM]:
        print(f'  -- {nombre} (sitios {int(mask.sum())})')
        for k, (h, r3, pes) in M.items():
            ok = mask & (pes > 0)
            print(f'     {k:18s} 1ra cosechada {100 * np.nanmean(h[mask]):5.1f}%   registros en 3 {100 * np.average(r3[ok], weights=pes[ok]):5.1f}%')
        a = M['modelo real']
        for rival in [k for k in M if k != 'modelo real']:
            e, lo, hi = ic((a[0] - M[rival][0])[mask], ce[mask])
            print(f'     real - {rival:18s} {100 * e:+6.1f} pp  IC95 [{100 * lo:+6.1f}, {100 * hi:+6.1f}]')


A = correr(CAT)
A['regla del catalogo'] = [[c for c in s['ranking'] if c in CAT] for s in sit]
A['sintetico actual'] = ordenar(sint, X)
reporte('Escenario A: solo los 8 cultivos actuales', A)
B = correr(CLASES)
reporte(f'Escenario B: catalogo ampliado a {len(CLASES)} cultivos', B)

pri = {k: {} for k in NOM}
for o, r in zip(B['modelo real'], reg):
    pri[r][o[0]] = pri[r].get(o[0], 0) + 1
print('\nPrimera sugerencia por region (B):')
for k in NOM:
    print(' ', NOM[k], sorted(pri[k].items(), key=lambda x: -x[1])[:7])
print('\nZonas fuera de lo que vio el modelo sintetico (2000-4600 m):', f'{100 * np.mean((X[:, 0] < 2000) | (X[:, 0] > 4600)):.1f}% de los sitios')
print('Regla sin cultivo apto por region:', {NOM[k]: f"{100 * np.mean([s['indices'][0] <= 0 for s, r in zip(sit, reg) if r == k]):.1f}%" for k in NOM})
