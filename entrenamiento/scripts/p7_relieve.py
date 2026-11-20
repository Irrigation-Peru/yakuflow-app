"""Mide el desnivel disponible alrededor de cada sitio: el punto mas alto a 900 m en 8 direcciones.

900 m es la conduccion maxima con que trabaja el paper; 15 y 30 m son DESNIVEL_MINIMO_GOTEO_M y DESNIVEL_MINIMO_ASPERSION_M.
"""
import json, math, os, sys, time, urllib.request
sys.stdout.reconfigure(encoding='utf8')
S = sys.argv[1]
OUT = S + '/piloto'
UA = {'User-Agent': 'Mozilla/5.0 (research client)'}
R = 900.0
sit = json.load(open(OUT + '/sitios_nac.json', encoding='utf8'))['sitios']
pp = OUT + '/relieve.json'
res = json.load(open(pp, encoding='utf8')) if os.path.exists(pp) else {}
pts = []
for s in sit:
    if s['id'] in res:
        continue
    for k in range(8):
        a = k * math.pi / 4
        pts.append((s['id'], s['lat'] + R * math.cos(a) / 111320, s['lon'] + R * math.sin(a) / (111320 * math.cos(math.radians(s['lat'])))))
print('puntos', len(pts), flush=True)
ac = {}
for i in range(0, len(pts), 100):
    b = pts[i:i + 100]
    u = 'https://api.opentopodata.org/v1/srtm90m?locations=' + '|'.join(f'{la:.5f},{lo:.5f}' for _, la, lo in b)
    for intento in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as r:
                v = [x['elevation'] for x in json.loads(r.read())['results']]
            break
        except Exception as e:
            print('  espera', str(e)[:60], flush=True)
            time.sleep(30)
    else:
        raise RuntimeError('sin respuesta')
    for (sid, _, _), e in zip(b, v):
        ac.setdefault(sid, []).append(e)
    for sid in [k for k, x in ac.items() if len(x) == 8]:
        res[sid] = ac.pop(sid)
    if (i // 100) % 25 == 0:
        json.dump(res, open(pp, 'w', encoding='utf8'))
        print('  sitios', len(res), flush=True)
    time.sleep(1.2)
json.dump(res, open(pp, 'w', encoding='utf8'))
print('LISTO', len(res), flush=True)
