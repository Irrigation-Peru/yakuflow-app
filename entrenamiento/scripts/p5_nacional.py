"""Piloto nacional, paso 1: todos los segmentos de la ENA 2024 (costa, sierra y selva) con relieve, clima y suelo."""
import collections, csv, io, json, math, os, statistics, sys, time, urllib.request, zipfile
from PIL import Image

sys.stdout.reconfigure(encoding='utf8')
Image.MAX_IMAGE_PIXELS = None
S = sys.argv[1]
OUT = S + '/piloto'
UA = {'User-Agent': 'Mozilla/5.0 (research client)'}
TOP = 30
EXCLUIDOS = {'COCA'}  # no se recomienda: cultivo sujeto a control legal


def get(url, tries=5, timeout=240):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:
            print('  reintento', str(e)[:70], flush=True)
            time.sleep(10 * (i + 1))
    raise RuntimeError('fallo ' + url[:90])


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
    if n == 'HABA GRANO SECO':
        return 'Haba, grano seco'
    if n == 'HABA GRANO VERDE':
        return 'Haba, verde'
    if n == 'ARVEJA GRANO VERDE':
        return 'Arveja, verde'
    if n == 'ZANAHORIA':
        return 'Zanahoria'
    return n


ez = zipfile.ZipFile(S + '/dl/ENA_2024.zip')
names = [n for n in ez.namelist() if n.lower().endswith('.csv')]


def ena(key):
    n = [x for x in names if x.endswith(key)][0]
    return csv.DictReader(io.StringIO(ez.read(n).decode('utf8', 'replace')))


seg = {}
for r in ena('CARATULA.csv'):
    if r['LATITUD'].strip():
        seg[r['NSEGM']] = {'id': 'E' + r['NSEGM'], 'dep': r['CCDD'], 'region': r['REGION'], 'lat': float(r['LATITUD']), 'lon': float(r['LONGITUD']), 'cultivos': {}, 'total': 0}
print('segmentos', len(seg), collections.Counter(s['region'] for s in seg.values()), flush=True)

reg = []
for r in ena('03_CAP200AB.csv'):
    if r['NSEGM'] in seg and r['P204_NOM'].strip():
        reg.append((r['NSEGM'], clase(r['P204_NOM'])))
cuenta = collections.Counter(c for _, c in reg if c not in EXCLUIDOS)
top = [c for c, _ in cuenta.most_common(TOP)]
CAT = ['Arveja, verde', 'Avena', 'Cebada', 'Haba, grano seco', 'Haba, verde', 'Maíz, grano', 'Papa', 'Zanahoria']
for c in CAT:
    if c not in top:
        top.append(c)
print('clases', top, flush=True)
for sg, c in reg:
    seg[sg]['total'] += 1
    if c in top:
        d = seg[sg]['cultivos'].setdefault(c, {'n': 0})
        d['n'] += 1

# Altitud: reutiliza lo ya medido y completa lo que falta con OpenTopoData (1 consulta por segundo)
pp = OUT + '/elevacion_parcial.json'
el = json.load(open(pp, encoding='utf8'))
falta = [k for k in seg if k not in el]
print('altitudes por pedir', len(falta), flush=True)
for i in range(0, len(falta), 100):
    b = falta[i:i + 100]
    u = 'https://api.opentopodata.org/v1/srtm90m?locations=' + '|'.join(f"{seg[k]['lat']:.4f},{seg[k]['lon']:.4f}" for k in b)
    v = [x['elevation'] for x in json.loads(get(u, timeout=60))['results']]
    el.update(dict(zip(b, v)))
    json.dump(el, open(pp, 'w', encoding='utf8'))
    if i % 1000 == 0:
        print('  elevacion', len(el), flush=True)
    time.sleep(1.3)
for k, s in seg.items():
    s['alt'] = el.get(k)
sitios = [s for s in seg.values() if s['total'] > 0 and s['alt'] is not None]
print('sitios con cosecha y altitud', len(sitios), collections.Counter(s['region'] for s in sitios), flush=True)


def celda(la, lo):
    return (round(math.floor(la / 0.5) * 0.5 + 0.25, 3), round(round(lo / 0.625) * 0.625, 4))


cdir = OUT + '/power'
os.makedirs(cdir, exist_ok=True)
celdas = sorted({celda(s['lat'], s['lon']) for s in sitios})
print('celdas POWER', len(celdas), flush=True)
P = 'T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN'
for i, (la, lo) in enumerate(celdas):
    p = f'{cdir}/{la}_{lo}.json'
    if not os.path.exists(p):
        u = f'https://power.larc.nasa.gov/api/temporal/climatology/point?parameters={P}&community=AG&longitude={lo:.4f}&latitude={la:.4f}&format=JSON'
        open(p, 'wb').write(get(u, timeout=90))
        time.sleep(0.25)
print('clima listo', flush=True)

W, E_, Sb, Nb = -81.6, -68.3, -18.6, 0.2
sdir = OUT + '/suelo_nac'
os.makedirs(sdir, exist_ok=True)
MAPA = {}
for prop in ['phh2o', 'sand', 'clay']:
    for prof in ['0-5cm', '5-15cm', '15-30cm']:
        cov = f'{prop}_{prof}_mean'
        p = f'{sdir}/{cov}.tif'
        if not os.path.exists(p):
            u = (f'https://maps.isric.org/mapserv?map=/map/{prop}.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID={cov}'
                 f'&FORMAT=GEOTIFF_INT16&SUBSET=X({W},{E_})&SUBSET=Y({Sb},{Nb})&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326'
                 f'&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326&RESX=0.01&RESY=0.01')
            open(p, 'wb').write(get(u))
            print('  suelo', cov, os.path.getsize(p), flush=True)
        MAPA[cov] = Image.open(p)
        MAPA[cov].load()
im = next(iter(MAPA.values()))
ps, tp = im.tag_v2[33550], im.tag_v2[33922]
dx, dy, x0, y0 = ps[0], ps[1], tp[3], tp[4]
print('mapa', im.size, dx, dy, x0, y0, flush=True)


def valor(cov, la, lo):
    m = MAPA[cov]
    c, f = int((lo - x0) / dx), int((y0 - la) / dy)
    for rr in range(0, 12):
        for i in range(-rr, rr + 1):
            for j in range(-rr, rr + 1):
                if max(abs(i), abs(j)) == rr and 0 <= c + i < m.size[0] and 0 <= f + j < m.size[1]:
                    v = m.getpixel((c + i, f + j))
                    if v not in (0, -32768, 32767):
                        return v
    return None


def prom(prop, la, lo):
    t = 0.0
    for prof, e in (('0-5cm', 5), ('5-15cm', 10), ('15-30cm', 15)):
        v = valor(f'{prop}_{prof}_mean', la, lo)
        if v is None:
            return None
        t += v * e
    return t / 30 / 10


fin = []
for s in sitios:
    ph, ar, ac = prom('phh2o', s['lat'], s['lon']), prom('sand', s['lat'], s['lon']), prom('clay', s['lat'], s['lon'])
    if None in (ph, ar, ac):
        continue
    la, lo = celda(s['lat'], s['lon'])
    s.update(ph=ph, arena=ar, arcilla=ac, limo=max(0.0, 100 - ar - ac), celda=f'{la}_{lo}')
    fin.append(s)
print('sitios finales', len(fin), collections.Counter(s['region'] for s in fin), flush=True)
json.dump({'clases': top, 'catalogo': CAT, 'sitios': fin}, open(OUT + '/sitios_nac.json', 'w', encoding='utf8'), ensure_ascii=False)
print('LISTO', flush=True)
