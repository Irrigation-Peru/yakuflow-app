"""Arma la data real para compartir: una fila por sitio y cultivo, con rasgos, relieve y marcas de riego por gravedad."""
import collections, csv, io, json, os, statistics, sys, zipfile
sys.stdout.reconfigure(encoding='utf8')
S, DEST = sys.argv[1], sys.argv[2]
OUT = S + '/piloto'
os.makedirs(DEST, exist_ok=True)
d = json.load(open(OUT + '/sitios-rasgos-nac.json', encoding='utf8'))
meta = json.load(open(OUT + '/sitios_nac.json', encoding='utf8'))
base = {s['id']: s for s in meta['sitios']}
rel = json.load(open(OUT + '/relieve.json', encoding='utf8'))
CLASES, CAT = meta['clases'], meta['catalogo']
NOM = {'1': 'Costa', '2': 'Sierra', '3': 'Selva'}
GOTEO, ASPERSION = 15, 30


def clase(nom):
    n = nom.strip().upper().replace('Í', 'I')
    if n.startswith('PAPA'):
        return 'Papa'
    if n in ('MAIZ AMILACEO', 'MAIZ AMARILLO DURO', 'MAIZ CHOCLO', 'MAIZ MORADO', 'MAIZ'):
        return 'Maíz, grano'
    if n.startswith('CEBADA'):
        return 'Cebada'
    if n.startswith('AVENA'):
        return 'Avena'
    return {'HABA GRANO SECO': 'Haba, grano seco', 'HABA GRANO VERDE': 'Haba, verde', 'ARVEJA GRANO VERDE': 'Arveja, verde', 'ZANAHORIA': 'Zanahoria'}.get(n, n)


ez = zipfile.ZipFile(S + '/dl/ENA_2024.zip')
nm = [n for n in ez.namelist() if n.endswith('03_CAP200AB.csv')][0]
ag = collections.defaultdict(lambda: {'cosechas': 0, 'bajoRiego': 0, 'ha': 0.0, 'kgHa': []})
for r in csv.DictReader(io.StringIO(ez.read(nm).decode('utf8', 'replace'))):
    c = clase(r['P204_NOM'] or '')
    k = ('E' + r['NSEGM'], c)
    a = ag[k]
    a['cosechas'] += 1
    a['bajoRiego'] += 0 if r['P212'].strip() == '1' else 1
    try:
        ha = float(r['P217_SUP_ha'])
        kg = (float(r['P219_CANT_1'] or 0) + float('0.' + (r['P219_CANT_2'] or '0'))) * float(r['P219_EQUIV_KG'] or 0)
        a['ha'] += ha
        if ha > 0 and kg > 0:
            a['kgHa'].append(kg / ha)
    except ValueError:
        pass

R = d['rasgos']
filas, res = [], collections.Counter()
for s in d['sitios']:
    b = base[s['id']]
    anillo = rel.get(s['id'])
    if not anillo or any(x is None for x in anillo):
        res['sin_relieve'] += 1
        continue
    des = max(anillo) - s['alt']
    g, a = des >= GOTEO, des >= ASPERSION
    res[('sitios', s['region'])] += 1
    res[('goteo', s['region'])] += g
    res[('aspersion', s['region'])] += a
    for c in s['cultivos']:
        x = ag[(s['id'], c)]
        filas.append([s['id'], s['dep'], NOM[s['region']], round(b['lat'], 5), round(b['lon'], 5), round(des, 1), int(g), int(a), c, int(c in CAT), x['cosechas'], x['bajoRiego'], round(x['ha'], 3), round(statistics.median(x['kgHa']), 1) if x['kgHa'] else '', round(b['arena'], 2), round(b['arcilla'], 2), round(b['limo'], 2), *[round(v, 4) for v in s['rasgos']], '|'.join(s['ranking'][:3]), round(s['indices'][0], 4), s['celda']])
cab = ['sitio', 'departamento', 'region', 'latitud', 'longitud', 'desnivelDisponibleM', 'aptoGoteo', 'aptoAspersion', 'cultivo', 'enCatalogoActual', 'cosechas', 'cosechasBajoRiego', 'superficieHa', 'medianaKgHa', 'arenaPct', 'arcillaPct', 'limoPct', *R, 'top3Regla', 'indiceMejorRegla', 'celdaClima']
with open(DEST + '/ena2024_sitio_cultivo.csv', 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(cab)
    w.writerows(filas)
print('filas', len(filas), dict(res))
for k in NOM:
    print(NOM[k], res[('sitios', k)], 'goteo', res[('goteo', k)], 'aspersion', res[('aspersion', k)])
