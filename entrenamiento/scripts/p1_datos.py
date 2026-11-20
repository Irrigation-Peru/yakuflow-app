"""Paso 1 del piloto: reune sitios reales (ENA 2024 y CENAGRO 2012) con relieve, clima y suelo."""
import csv, io, json, math, os, re, sys, time, urllib.request, zipfile, collections, statistics
from PIL import Image

sys.stdout.reconfigure(encoding='utf8')
Image.MAX_IMAGE_PIXELS = None
S = sys.argv[1]
DL = S + '/dl'
OUT = S + '/piloto'
UA = {'User-Agent': 'Mozilla/5.0 (research client)'}


def get(url, tries=4, timeout=90):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:
            print('  reintento', str(e)[:80], flush=True)
            time.sleep(3 * (i + 1))
    raise RuntimeError('fallo ' + url[:100])


def cache(nombre, fn):
    p = OUT + '/' + nombre
    if os.path.exists(p):
        return json.load(open(p, encoding='utf8'))
    v = fn()
    json.dump(v, open(p, 'w', encoding='utf8'))
    return v


# Mapeo de cultivos de la ENA a las clases del catalogo
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
    return None


ez = zipfile.ZipFile(DL + '/ENA_2024.zip')
names = [n for n in ez.namelist() if n.lower().endswith('.csv')]


def ena(key):
    n = [x for x in names if x.endswith(key)][0]
    return csv.DictReader(io.StringIO(ez.read(n).decode('utf8', 'replace')))


seg = {}
for r in ena('CARATULA.csv'):
    if r['REGION'] == '2' and r['LATITUD'].strip():
        seg[r['NSEGM']] = {'id': 'E' + r['NSEGM'], 'dep': r['CCDD'], 'lat': float(r['LATITUD']), 'lon': float(r['LONGITUD'])}
print('segmentos de sierra con coordenada', len(seg), flush=True)

# Cultivos cosechados por segmento, con rendimiento
reg = []
todos_seg = collections.Counter()
for r in ena('03_CAP200AB.csv'):
    if r['REGION'] != '2' or r['NSEGM'] not in seg:
        continue
    todos_seg[r['NSEGM']] += 1
    c = clase(r['P204_NOM'] or '')
    if not c:
        continue
    y = None
    try:
        ha = float(r['P217_SUP_ha'])
        kg = (float(r['P219_CANT_1'] or 0) + float('0.' + (r['P219_CANT_2'] or '0'))) * float(r['P219_EQUIV_KG'] or 0)
        if ha > 0 and kg > 0:
            y = kg / ha
    except ValueError:
        pass
    reg.append((r['NSEGM'], c, y, r['P212'].strip()))
print('registros de cosecha en clases del catalogo', len(reg), flush=True)
med = {c: statistics.median([y for _, k, y, _ in reg if k == c and y]) for c in {k for _, k, _, _ in reg}}
print('mediana kg/ha', {k: round(v) for k, v in med.items()}, flush=True)
for s in seg.values():
    s['cultivos'] = {}
for sg, c, y, ag in reg:
    d = seg[sg]['cultivos'].setdefault(c, {'n': 0, 'bueno': 0, 'riego': 0})
    d['n'] += 1
    d['bueno'] += 1 if (y and y >= med[c]) else 0
    d['riego'] += 0 if ag == '1' else 1


# Altitud de los segmentos
def elevaciones():
    ks = list(seg)
    pp = OUT + '/elevacion_parcial.json'
    res = json.load(open(pp, encoding='utf8')) if os.path.exists(pp) else {}
    falta = [k for k in ks if k not in res]
    for i in range(0, len(falta), 100):
        b = falta[i:i + 100]
        u = 'https://api.opentopodata.org/v1/srtm90m?locations=' + '|'.join(f"{seg[k]['lat']:.4f},{seg[k]['lon']:.4f}" for k in b)
        for intento in range(6):
            try:
                with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as r:
                    v = [x['elevation'] for x in json.loads(r.read())['results']]
                break
            except Exception as e:
                print('  espera por limite', str(e)[:50], flush=True)
                time.sleep(20)
        else:
            raise RuntimeError('elevacion sin respuesta')
        res.update(dict(zip(b, v)))
        json.dump(res, open(pp, 'w', encoding='utf8'))
        if i % 1000 == 0:
            print('  elevacion', len(res), flush=True)
        time.sleep(1.3)
    return res


elev = cache('elevacion_ena.json', elevaciones)
for k, s in seg.items():
    s['alt'] = elev[k]
sitios = [s for s in seg.values() if 2000 <= s['alt'] <= 4600 and s['cultivos']]
print('segmentos ENA 2000-4600 m con cultivos del catalogo', len(sitios), flush=True)

# CENAGRO 2012: sierra central, por ubicacion
GC = {'2612': 'Papa', '2615': 'Papa', '2611': 'Papa', '2614': 'Papa', '2613': 'Papa', '2108': 'Maíz, grano', '2109': 'Maíz, grano', '2107': 'Maíz, grano', '2104': 'Cebada', '2102': 'Avena', '2701': 'Avena', '2344': 'Zanahoria'}
z = zipfile.ZipFile(DL + '/cen12/2012.zip')
N = z.namelist()


def cen(dep, key):
    n = [x for x in N if f'/{dep}/' in x and x.endswith(key)][0]
    return csv.DictReader(io.StringIO(z.read(n).decode('utf-8-sig', 'replace')))


def censo():
    loc = {}
    for dep in ['Pasco', 'Junin', 'Huanuco', 'Huancavelica']:
        ua = {}
        for r in cen(dep, '01_IVCENAGRO_REC01.csv'):
            try:
                a, la, lo = float(r['WALTITUD']), float(r['LAT_DECI']), float(r['LONG_DECI'])
            except ValueError:
                continue
            if 2000 <= a <= 4600:
                ua[r['NPRIN']] = (round(la, 4), round(lo, 4), a)
        for r in cen(dep, '03_IVCENAGRO_REC02.csv'):
            c = GC.get(r['P024_03'].strip().replace('.0', ''))
            if c and r['NPRIN'] in ua:
                la, lo, a = ua[r['NPRIN']]
                k = f'{la},{lo}'
                d = loc.setdefault(k, {'id': 'C' + k, 'dep': dep, 'lat': la, 'lon': lo, 'alt': a, 'cultivos': {}})
                e = d['cultivos'].setdefault(c, {'n': 0})
                e['n'] += 1
        print(' censo', dep, len(loc), flush=True)
    return list(loc.values())


cens = cache('censo_sitios.json', censo)
print('ubicaciones CENAGRO', len(cens), flush=True)
todos = sitios + cens


# Clima por celda de NASA POWER
def celda(la, lo):
    return (round(math.floor(la / 0.5) * 0.5 + 0.25, 3), round(round(lo / 0.625) * 0.625, 4))


cdir = OUT + '/power'
os.makedirs(cdir, exist_ok=True)
celdas = sorted({celda(s['lat'], s['lon']) for s in todos})
print('celdas POWER', len(celdas), flush=True)
P = 'T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN'
for i, (la, lo) in enumerate(celdas):
    p = f'{cdir}/{la}_{lo}.json'
    if os.path.exists(p):
        continue
    u = f'https://power.larc.nasa.gov/api/temporal/climatology/point?parameters={P}&community=AG&longitude={lo:.4f}&latitude={la:.4f}&format=JSON'
    open(p, 'wb').write(get(u))
    if i % 25 == 0:
        print('  power', i, flush=True)
    time.sleep(0.25)
print('clima listo', flush=True)

# Suelo: mapas SoilGrids recortados a la sierra peruana (0.01 grados)
W, E_, Sb, Nb = -80.6, -68.4, -18.6, -3.9
RES = 0.01
sdir = OUT + '/suelo'
os.makedirs(sdir, exist_ok=True)
MAPA = {}
for prop in ['phh2o', 'sand', 'clay']:
    for prof in ['0-5cm', '5-15cm', '15-30cm']:
        cov = f'{prop}_{prof}_mean'
        p = f'{sdir}/{cov}.tif'
        if not os.path.exists(p):
            u = (f'https://maps.isric.org/mapserv?map=/map/{prop}.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID={cov}'
                 f'&FORMAT=GEOTIFF_INT16&SUBSET=X({W},{E_})&SUBSET=Y({Sb},{Nb})&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326'
                 f'&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326&RESX={RES}&RESY={RES}')
            open(p, 'wb').write(get(u, timeout=240))
            print('  suelo', cov, os.path.getsize(p), flush=True)
        MAPA[cov] = Image.open(p)
        MAPA[cov].load()
im = next(iter(MAPA.values()))
print('mapa', im.size, im.mode, flush=True)
tag = im.tag_v2 if hasattr(im, 'tag_v2') else {}
ps = tag.get(33550)
tp = tag.get(33922)
print('geotransform', ps, tp, flush=True)
dx, dy = (ps[0], ps[1]) if ps else (RES, RES)
x0, y0 = (tp[3], tp[4]) if tp else (W, Nb)


def valor(cov, la, lo):
    m = MAPA[cov]
    c = int((lo - x0) / dx)
    f = int((y0 - la) / dy)
    best = None
    # busca el pixel valido mas cercano (zonas urbanas o roca salen sin dato)
    for rr in range(0, 6):
        for i in range(-rr, rr + 1):
            for j in range(-rr, rr + 1):
                if max(abs(i), abs(j)) != rr:
                    continue
                cc, ff = c + i, f + j
                if 0 <= cc < m.size[0] and 0 <= ff < m.size[1]:
                    v = m.getpixel((cc, ff))
                    if v not in (0, -32768, 32767):
                        return v
    return best


def prom(prop, la, lo):
    t = 0.0
    for prof, e in (('0-5cm', 5), ('5-15cm', 10), ('15-30cm', 15)):
        v = valor(f'{prop}_{prof}_mean', la, lo)
        if v is None:
            return None
        t += v * e
    return t / 30 / 10


fin = []
sin = 0
for s in todos:
    ph, ar, ac = prom('phh2o', s['lat'], s['lon']), prom('sand', s['lat'], s['lon']), prom('clay', s['lat'], s['lon'])
    if None in (ph, ar, ac):
        sin += 1
        continue
    la, lo = celda(s['lat'], s['lon'])
    s.update(ph=ph, arena=ar, arcilla=ac, limo=max(0.0, 100 - ar - ac), celda=f'{la}_{lo}')
    fin.append(s)
print('sitios con suelo', len(fin), 'sin dato', sin, flush=True)
json.dump(fin, open(OUT + '/sitios.json', 'w', encoding='utf8'), ensure_ascii=False)
print('ph', statistics.mean(s['ph'] for s in fin), 'arena', statistics.mean(s['arena'] for s in fin), flush=True)
print('LISTO', flush=True)
