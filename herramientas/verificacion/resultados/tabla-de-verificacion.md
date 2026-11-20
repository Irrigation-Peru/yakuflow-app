# Tabla de verificación del módulo de cálculo

Generada por `herramientas/verificacion` (`pnpm verificar`). No se edita a mano.

Error admitido: **1.00e-2 %** (una centésima de por ciento). El error es
|obtenido − esperado| / máx(|esperado|, escala). La escala solo pesa donde el valor esperado es casi nulo,
como la presión al salir de una cámara rompe-presión: 0.5 m en presiones, 1e-6 l/s en tramos y 1e-3 l/h en
emisores. Cuando la fuente publica un valor redondeado, el del módulo se redondea igual antes de comparar.

## Fuentes

1. **Método de diseño normalizado**: valores guardados del método de referencia.
2. **FAO 56**: ejemplos 28 (coeficiente de cultivo por día) y 36 (agua útil y fácilmente aprovechable) del
   Estudio FAO Riego y Drenaje N.º 56 (Allen et al., 1998).
3. **EPANET 2.2** (OWA, compilado a WebAssembly por epanet-js): 100 redes al azar con semilla 1, calculadas con las
   ecuaciones de EPANET de los dos lados. De cada red se informa el nodo, el tramo y el emisor con mayor error.

## Resumen

| Fuente | Casos | Comparaciones | Error máximo | Dentro del error admitido |
|---|---|---|---|---|
| Método de diseño normalizado | 1 | 4 | 0.00e+0 % | 4 de 4 |
| FAO 56 | 10 | 22 | 0.00e+0 % | 22 de 22 |
| EPANET 2.2 | 75 | 225 | 2.41e-4 % | 225 de 225 |

## Redes no comparadas

EPANET 2.2 deja que un emisor tome agua con presión negativa y el módulo no, así que se comparan solo redes
donde todo emisor trabaja con al menos 0.5 m. Tampoco se comparan las redes donde EPANET no converge: le
pasa cuando una válvula reductora está inactiva, porque su estado alterna entre abierta y activa.

| Red | Motivo |
|---|---|
| 1 | Algún emisor trabaja con menos de 0.5 m |
| 4 | Algún emisor trabaja con menos de 0.5 m |
| 13 | EPANET no convergió en 1001 iteraciones (error relativo 2.16e-6) |
| 21 | Algún emisor trabaja con menos de 0.5 m |
| 22 | EPANET no convergió en 1001 iteraciones (error relativo 9.68e-6) |
| 23 | Algún emisor trabaja con menos de 0.5 m |
| 25 | Algún emisor trabaja con menos de 0.5 m |
| 26 | EPANET no convergió en 1001 iteraciones (error relativo 5.63e-8) |
| 30 | EPANET no convergió en 1001 iteraciones (error relativo 3.75e-8) |
| 38 | Algún emisor trabaja con menos de 0.5 m |
| 40 | Algún emisor trabaja con menos de 0.5 m |
| 41 | Algún emisor trabaja con menos de 0.5 m |
| 43 | EPANET no convergió en 1001 iteraciones (error relativo 1.39e-8) |
| 49 | Algún emisor trabaja con menos de 0.5 m |
| 52 | Algún emisor trabaja con menos de 0.5 m |
| 54 | Algún emisor trabaja con menos de 0.5 m |
| 55 | EPANET no convergió en 1001 iteraciones (error relativo 5.61e-8) |
| 59 | Algún emisor trabaja con menos de 0.5 m |
| 75 | EPANET no convergió en 1001 iteraciones (error relativo 5.63e-4) |
| 77 | Algún emisor trabaja con menos de 0.5 m |
| 81 | Algún emisor trabaja con menos de 0.5 m |
| 82 | EPANET no convergió en 1001 iteraciones (error relativo 3.54e-8) |
| 88 | Algún emisor trabaja con menos de 0.5 m |
| 89 | Algún emisor trabaja con menos de 0.5 m |
| 97 | EPANET no convergió en 1001 iteraciones (error relativo 6.20e-8) |

## Comparaciones

| Fuente | Caso | Magnitud | Fuente dice | Módulo da | Error | Cumple |
|---|---|---|---|---|---|---|
| Método de diseño normalizado | Método de referencia, RESERVORIO → CRP-1 | Velocidad (m/s) | 0.9867603132201427 | 0.9867603132201427 | 0.00e+0 % | Sí |
| Método de diseño normalizado | Método de referencia, RESERVORIO → CRP-1 | Pérdida de carga (m) | 0.5068456652968484 | 0.5068456652968484 | 0.00e+0 % | Sí |
| Método de diseño normalizado | Método de referencia, RESERVORIO → CRP-1 | Presión residual (m) | 11.993154334703151 | 11.993154334703151 | 0.00e+0 % | Sí |
| Método de diseño normalizado | Método de referencia, RESERVORIO → CRP-1 | Cota piezométrica final (m) | 3001.9931543347034 | 3001.9931543347034 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 28, frijol seco | Kc del día 20 | 0.15 | 0.15 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 28, frijol seco | Kc del día 40 | 0.77 | 0.77 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 28, frijol seco | Kc del día 70 | 1.19 | 1.19 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 28, frijol seco | Kc del día 95 | 0.56 | 0.56 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, cebolla en arena franca | Agua útil total (mm) | 36 | 36 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, cebolla en arena franca | Agua fácilmente aprovechable (mm) | 11 | 11 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, cebolla en limo | Agua útil total (mm) | 68 | 68 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, cebolla en limo | Agua fácilmente aprovechable (mm) | 20 | 20 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, cebolla en arcilla limosa | Agua útil total (mm) | 48 | 48 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, cebolla en arcilla limosa | Agua fácilmente aprovechable (mm) | 14 | 14 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, tomate en arena franca | Agua útil total (mm) | 72 | 72 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, tomate en arena franca | Agua fácilmente aprovechable (mm) | 29 | 29 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, tomate en limo | Agua útil total (mm) | 136 | 136 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, tomate en limo | Agua fácilmente aprovechable (mm) | 54 | 54 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, tomate en arcilla limosa | Agua útil total (mm) | 96 | 96 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, tomate en arcilla limosa | Agua fácilmente aprovechable (mm) | 38 | 38 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, maíz en arena franca | Agua útil total (mm) | 108 | 108 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, maíz en arena franca | Agua fácilmente aprovechable (mm) | 59 | 59 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, maíz en limo | Agua útil total (mm) | 204 | 204 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, maíz en limo | Agua fácilmente aprovechable (mm) | 112 | 112 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, maíz en arcilla limosa | Agua útil total (mm) | 144 | 144 | 0.00e+0 % | Sí |
| FAO 56 | Ejemplo 36, maíz en arcilla limosa | Agua fácilmente aprovechable (mm) | 79 | 79 | 0.00e+0 % | Sí |
| EPANET 2.2 | Red 2 (31 nodos, 24 emisores) | Presión del nodo más desfavorable, N7 (m) | -4.2136525735259055e-11 | 0 | 8.43e-9 % | Sí |
| EPANET 2.2 | Red 2 (31 nodos, 24 emisores) | Caudal del tramo más desfavorable, t17 (l/s) | 0.11875620751100227 | 0.1187562078239939 | 2.64e-7 % | Sí |
| EPANET 2.2 | Red 2 (31 nodos, 24 emisores) | Caudal del emisor más desfavorable, N1 (l/h) | 454.8520023118964 | 454.852002314361 | 5.42e-10 % | Sí |
| EPANET 2.2 | Red 3 (30 nodos, 23 emisores) | Presión del nodo más desfavorable, N6 (m) | 39.56093328472003 | 39.560933277564594 | 1.81e-8 % | Sí |
| EPANET 2.2 | Red 3 (30 nodos, 23 emisores) | Caudal del tramo más desfavorable, t18 (l/s) | 0.0014838631075749324 | 0.0014838634788708616 | 2.50e-5 % | Sí |
| EPANET 2.2 | Red 3 (30 nodos, 23 emisores) | Caudal del emisor más desfavorable, N7 (l/h) | 7.442007335478803 | 7.442007334887525 | 7.95e-9 % | Sí |
| EPANET 2.2 | Red 5 (29 nodos, 23 emisores) | Presión del nodo más desfavorable, N13 (m) | -1.7741695046424867e-11 | 0 | 3.55e-9 % | Sí |
| EPANET 2.2 | Red 5 (29 nodos, 23 emisores) | Caudal del tramo más desfavorable, t11 (l/s) | 0.13080876934731359 | 0.13080877152248063 | 1.66e-6 % | Sí |
| EPANET 2.2 | Red 5 (29 nodos, 23 emisores) | Caudal del emisor más desfavorable, N2 (l/h) | 252.36175024205713 | 252.36175024259893 | 2.15e-10 % | Sí |
| EPANET 2.2 | Red 6 (23 nodos, 18 emisores) | Presión del nodo más desfavorable, N12 (m) | 6.508032906019516 | 6.508032922682744 | 2.56e-7 % | Sí |
| EPANET 2.2 | Red 6 (23 nodos, 18 emisores) | Caudal del tramo más desfavorable, t5 (l/s) | 0.0073942745550864605 | 0.007394274170613765 | 5.20e-6 % | Sí |
| EPANET 2.2 | Red 6 (23 nodos, 18 emisores) | Caudal del emisor más desfavorable, N12 (l/h) | 9.59120537019149 | 9.591205382470404 | 1.28e-7 % | Sí |
| EPANET 2.2 | Red 7 (4 nodos, 3 emisores) | Presión del nodo más desfavorable, N2 (m) | 6.726998785856087 | 6.726998785861552 | 8.12e-11 % | Sí |
| EPANET 2.2 | Red 7 (4 nodos, 3 emisores) | Caudal del tramo más desfavorable, t3 (l/s) | 0.0006350188491288083 | 0.0006350177693317294 | 1.70e-4 % | Sí |
| EPANET 2.2 | Red 7 (4 nodos, 3 emisores) | Caudal del emisor más desfavorable, N2 (l/h) | 5.810214282075538 | 5.810214282077785 | 3.87e-11 % | Sí |
| EPANET 2.2 | Red 8 (9 nodos, 7 emisores) | Presión del nodo más desfavorable, N7 (m) | 23.82818691475947 | 23.828186915319495 | 2.35e-9 % | Sí |
| EPANET 2.2 | Red 8 (9 nodos, 7 emisores) | Caudal del tramo más desfavorable, t5 (l/s) | 0.002179769265436662 | 0.0021797692362640433 | 1.34e-6 % | Sí |
| EPANET 2.2 | Red 8 (9 nodos, 7 emisores) | Caudal del emisor más desfavorable, N7 (l/h) | 15.500129292108888 | 15.500129292401054 | 1.88e-9 % | Sí |
| EPANET 2.2 | Red 9 (11 nodos, 8 emisores) | Presión del nodo más desfavorable, N4 (m) | 26.473710844705334 | 26.47371084467347 | 1.20e-10 % | Sí |
| EPANET 2.2 | Red 9 (11 nodos, 8 emisores) | Caudal del tramo más desfavorable, t9 (l/s) | 0.21143521494277123 | 0.21143521502751236 | 4.01e-8 % | Sí |
| EPANET 2.2 | Red 9 (11 nodos, 8 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 904.6001072367712 | 904.6001072386539 | 2.08e-10 % | Sí |
| EPANET 2.2 | Red 10 (22 nodos, 19 emisores) | Presión del nodo más desfavorable, N8 (m) | 23.94076083663469 | 23.940760841636692 | 2.09e-8 % | Sí |
| EPANET 2.2 | Red 10 (22 nodos, 19 emisores) | Caudal del tramo más desfavorable, t4 (l/s) | 0.00630964950005305 | 0.006309650089757741 | 9.35e-6 % | Sí |
| EPANET 2.2 | Red 10 (22 nodos, 19 emisores) | Caudal del emisor más desfavorable, N8 (l/h) | 9.417814852680557 | 9.417814853769546 | 1.16e-8 % | Sí |
| EPANET 2.2 | Red 11 (22 nodos, 18 emisores) | Presión del nodo más desfavorable, N1 (m) | 1.3666940597372654 | 1.366694058944192 | 5.80e-8 % | Sí |
| EPANET 2.2 | Red 11 (22 nodos, 18 emisores) | Caudal del tramo más desfavorable, t13 (l/s) | 0.001989206757298043 | 0.001989207588283067 | 4.18e-5 % | Sí |
| EPANET 2.2 | Red 11 (22 nodos, 18 emisores) | Caudal del emisor más desfavorable, N1 (l/h) | 3.2855037614209794 | 3.285503760922514 | 1.52e-8 % | Sí |
| EPANET 2.2 | Red 12 (14 nodos, 12 emisores) | Presión del nodo más desfavorable, N6 (m) | 19.439493052570604 | 19.439493052869633 | 1.54e-9 % | Sí |
| EPANET 2.2 | Red 12 (14 nodos, 12 emisores) | Caudal del tramo más desfavorable, t13 (l/s) | 0.0010271590033591649 | 0.0010271568742509227 | 2.07e-4 % | Sí |
| EPANET 2.2 | Red 12 (14 nodos, 12 emisores) | Caudal del emisor más desfavorable, N11 (l/h) | 8.359011145308866 | 8.359011145405217 | 1.15e-9 % | Sí |
| EPANET 2.2 | Red 14 (20 nodos, 13 emisores) | Presión del nodo más desfavorable, N10 (m) | 15.34105978031843 | 15.341059779576643 | 4.84e-9 % | Sí |
| EPANET 2.2 | Red 14 (20 nodos, 13 emisores) | Caudal del tramo más desfavorable, t17 (l/s) | 0.0012648404266820353 | 0.0012648397731311834 | 5.17e-5 % | Sí |
| EPANET 2.2 | Red 14 (20 nodos, 13 emisores) | Caudal del emisor más desfavorable, N10 (l/h) | 12.704638454558328 | 12.704638454251228 | 2.42e-9 % | Sí |
| EPANET 2.2 | Red 15 (12 nodos, 10 emisores) | Presión del nodo más desfavorable, N1 (m) | 9.177327577580035 | 9.177327577277131 | 3.30e-9 % | Sí |
| EPANET 2.2 | Red 15 (12 nodos, 10 emisores) | Caudal del tramo más desfavorable, t9 (l/s) | 0.0004193468746649988 | 0.0004193458638051364 | 2.41e-4 % | Sí |
| EPANET 2.2 | Red 15 (12 nodos, 10 emisores) | Caudal del emisor más desfavorable, N1 (l/h) | 4.412861349337576 | 4.412861349264752 | 1.65e-9 % | Sí |
| EPANET 2.2 | Red 16 (27 nodos, 21 emisores) | Presión del nodo más desfavorable, N11 (m) | 28.367411118097053 | 28.36741111714962 | 3.34e-9 % | Sí |
| EPANET 2.2 | Red 16 (27 nodos, 21 emisores) | Caudal del tramo más desfavorable, t26 (l/s) | 0.002109431302426241 | 0.0021094320671663606 | 3.63e-5 % | Sí |
| EPANET 2.2 | Red 16 (27 nodos, 21 emisores) | Caudal del emisor más desfavorable, N11 (l/h) | 13.053794237134106 | 13.053794236917602 | 1.66e-9 % | Sí |
| EPANET 2.2 | Red 17 (29 nodos, 22 emisores) | Presión del nodo más desfavorable, N6 (m) | 9.177993200886549 | 9.177993181645459 | 2.10e-7 % | Sí |
| EPANET 2.2 | Red 17 (29 nodos, 22 emisores) | Caudal del tramo más desfavorable, t21 (l/s) | 0.0020168711596454916 | 0.0020168718322681597 | 3.33e-5 % | Sí |
| EPANET 2.2 | Red 17 (29 nodos, 22 emisores) | Caudal del emisor más desfavorable, N27 (l/h) | 16.681208478757405 | 16.681208471166446 | 4.55e-8 % | Sí |
| EPANET 2.2 | Red 18 (18 nodos, 15 emisores) | Presión del nodo más desfavorable, N10 (m) | 11.802398992313185 | 11.802398991717657 | 5.05e-9 % | Sí |
| EPANET 2.2 | Red 18 (18 nodos, 15 emisores) | Caudal del tramo más desfavorable, t14 (l/s) | 0.001595861176389346 | 0.0015958616639712329 | 3.06e-5 % | Sí |
| EPANET 2.2 | Red 18 (18 nodos, 15 emisores) | Caudal del emisor más desfavorable, N10 (l/h) | 10.785483380615323 | 10.78548338034323 | 2.52e-9 % | Sí |
| EPANET 2.2 | Red 19 (6 nodos, 4 emisores) | Presión del nodo más desfavorable, N5 (m) | 7.122549140027577 | 7.122549140028723 | 1.61e-11 % | Sí |
| EPANET 2.2 | Red 19 (6 nodos, 4 emisores) | Caudal del tramo más desfavorable, t1 (l/s) | 0.000847205062557332 | 0.0008472049825448301 | 9.44e-6 % | Sí |
| EPANET 2.2 | Red 19 (6 nodos, 4 emisores) | Caudal del emisor más desfavorable, N2 (l/h) | 4.061771736686063 | 4.0617717366883115 | 5.54e-11 % | Sí |
| EPANET 2.2 | Red 20 (31 nodos, 24 emisores) | Presión del nodo más desfavorable, N28 (m) | 3.091858404058739 | 3.0918584047441215 | 2.22e-8 % | Sí |
| EPANET 2.2 | Red 20 (31 nodos, 24 emisores) | Caudal del tramo más desfavorable, t27 (l/s) | 0.0009867708732703491 | 0.000986770694868986 | 1.81e-5 % | Sí |
| EPANET 2.2 | Red 20 (31 nodos, 24 emisores) | Caudal del emisor más desfavorable, N28 (l/h) | 4.077487056616123 | 4.077487057532185 | 2.25e-8 % | Sí |
| EPANET 2.2 | Red 24 (16 nodos, 10 emisores) | Presión del nodo más desfavorable, N6 (m) | -2.66125425696373e-11 | 0 | 5.32e-9 % | Sí |
| EPANET 2.2 | Red 24 (16 nodos, 10 emisores) | Caudal del tramo más desfavorable, t15 (l/s) | 0.10402143714378968 | 0.10402143703040506 | 1.09e-7 % | Sí |
| EPANET 2.2 | Red 24 (16 nodos, 10 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 511.4387190350316 | 511.43871903917653 | 8.10e-10 % | Sí |
| EPANET 2.2 | Red 27 (18 nodos, 15 emisores) | Presión del nodo más desfavorable, N2 (m) | 1.9178572693228184 | 1.917857269324454 | 8.53e-11 % | Sí |
| EPANET 2.2 | Red 27 (18 nodos, 15 emisores) | Caudal del tramo más desfavorable, t9 (l/s) | 0.13444479078514843 | 0.13444479055108677 | 1.74e-7 % | Sí |
| EPANET 2.2 | Red 27 (18 nodos, 15 emisores) | Caudal del emisor más desfavorable, N2 (l/h) | 244.08834199778735 | 244.08834200023398 | 1.00e-9 % | Sí |
| EPANET 2.2 | Red 28 (19 nodos, 15 emisores) | Presión del nodo más desfavorable, N4 (m) | 15.341327492566876 | 15.341327492244929 | 2.10e-9 % | Sí |
| EPANET 2.2 | Red 28 (19 nodos, 15 emisores) | Caudal del tramo más desfavorable, t2 (l/s) | 0.003282278128752626 | 0.0032822787045884254 | 1.75e-5 % | Sí |
| EPANET 2.2 | Red 28 (19 nodos, 15 emisores) | Caudal del emisor más desfavorable, N10 (l/h) | 14.942005069233165 | 14.942005069151584 | 5.46e-10 % | Sí |
| EPANET 2.2 | Red 29 (11 nodos, 8 emisores) | Presión del nodo más desfavorable, N1 (m) | 11.25180365588659 | 11.251803652948912 | 2.61e-8 % | Sí |
| EPANET 2.2 | Red 29 (11 nodos, 8 emisores) | Caudal del tramo más desfavorable, t10 (l/s) | 0.0016938575869770045 | 0.0016938582707216154 | 4.04e-5 % | Sí |
| EPANET 2.2 | Red 29 (11 nodos, 8 emisores) | Caudal del emisor más desfavorable, N3 (l/h) | 10.426139197669457 | 10.42613919661719 | 1.01e-8 % | Sí |
| EPANET 2.2 | Red 31 (28 nodos, 22 emisores) | Presión del nodo más desfavorable, N2 (m) | 3.55262117403193 | 3.552621173714972 | 8.92e-9 % | Sí |
| EPANET 2.2 | Red 31 (28 nodos, 22 emisores) | Caudal del tramo más desfavorable, t7 (l/s) | 0.0012726294181092546 | 0.0012726296841315515 | 2.09e-5 % | Sí |
| EPANET 2.2 | Red 31 (28 nodos, 22 emisores) | Caudal del emisor más desfavorable, N2 (l/h) | 6.037456448445818 | 6.037456448782729 | 5.58e-9 % | Sí |
| EPANET 2.2 | Red 32 (18 nodos, 15 emisores) | Presión del nodo más desfavorable, N1 (m) | 8.137480466335449 | 8.13748046634823 | 1.57e-10 % | Sí |
| EPANET 2.2 | Red 32 (18 nodos, 15 emisores) | Caudal del tramo más desfavorable, t12 (l/s) | 0.15235253512161112 | 0.1523525343682076 | 4.95e-7 % | Sí |
| EPANET 2.2 | Red 32 (18 nodos, 15 emisores) | Caudal del emisor más desfavorable, N5 (l/h) | 739.7582318392402 | 739.7582318420491 | 3.80e-10 % | Sí |
| EPANET 2.2 | Red 33 (24 nodos, 19 emisores) | Presión del nodo más desfavorable, N1 (m) | 10.29776618798649 | 10.297766188313949 | 3.18e-9 % | Sí |
| EPANET 2.2 | Red 33 (24 nodos, 19 emisores) | Caudal del tramo más desfavorable, t19 (l/s) | 0.0023149804519682522 | 0.00231498042117188 | 1.33e-6 % | Sí |
| EPANET 2.2 | Red 33 (24 nodos, 19 emisores) | Caudal del emisor más desfavorable, N2 (l/h) | 8.93727657012414 | 8.937276570233808 | 1.23e-9 % | Sí |
| EPANET 2.2 | Red 34 (26 nodos, 18 emisores) | Presión del nodo más desfavorable, N6 (m) | 6.2102647143122685 | 6.21026471433513 | 3.68e-10 % | Sí |
| EPANET 2.2 | Red 34 (26 nodos, 18 emisores) | Caudal del tramo más desfavorable, t15 (l/s) | 0.041028417811829664 | 0.04102841796267892 | 3.68e-7 % | Sí |
| EPANET 2.2 | Red 34 (26 nodos, 18 emisores) | Caudal del emisor más desfavorable, N16 (l/h) | 784.5040533205282 | 784.5040533213738 | 1.08e-10 % | Sí |
| EPANET 2.2 | Red 35 (4 nodos, 3 emisores) | Presión del nodo más desfavorable, N2 (m) | 15.660607000255744 | 15.660607000256597 | 5.44e-12 % | Sí |
| EPANET 2.2 | Red 35 (4 nodos, 3 emisores) | Caudal del tramo más desfavorable, t2 (l/s) | 0.004558181434140033 | 0.0045581814094511315 | 5.42e-7 % | Sí |
| EPANET 2.2 | Red 35 (4 nodos, 3 emisores) | Caudal del emisor más desfavorable, N2 (l/h) | 16.409453074023588 | 16.409453074024075 | 2.97e-12 % | Sí |
| EPANET 2.2 | Red 36 (39 nodos, 30 emisores) | Presión del nodo más desfavorable, N7 (m) | -1.164298737421632e-10 | 0 | 2.33e-8 % | Sí |
| EPANET 2.2 | Red 36 (39 nodos, 30 emisores) | Caudal del tramo más desfavorable, t30 (l/s) | 0.12423872236687807 | 0.12423872194107351 | 3.43e-7 % | Sí |
| EPANET 2.2 | Red 36 (39 nodos, 30 emisores) | Caudal del emisor más desfavorable, N16 (l/h) | 395.177072185316 | 395.17707223235436 | 1.19e-8 % | Sí |
| EPANET 2.2 | Red 37 (23 nodos, 17 emisores) | Presión del nodo más desfavorable, N8 (m) | -3.3265678212046624e-11 | 0 | 6.65e-9 % | Sí |
| EPANET 2.2 | Red 37 (23 nodos, 17 emisores) | Caudal del tramo más desfavorable, t9 (l/s) | 0.1033527384107226 | 0.10335273834007522 | 6.84e-8 % | Sí |
| EPANET 2.2 | Red 37 (23 nodos, 17 emisores) | Caudal del emisor más desfavorable, N2 (l/h) | 745.7210998688399 | 745.7210998680463 | 1.06e-10 % | Sí |
| EPANET 2.2 | Red 39 (6 nodos, 5 emisores) | Presión del nodo más desfavorable, N4 (m) | 4.4596079061928835 | 4.459607906192311 | 1.28e-11 % | Sí |
| EPANET 2.2 | Red 39 (6 nodos, 5 emisores) | Caudal del tramo más desfavorable, t1 (l/s) | 0.003338362450482791 | 0.003338362544110183 | 2.80e-6 % | Sí |
| EPANET 2.2 | Red 39 (6 nodos, 5 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 8.445556775141123 | 8.445556775140581 | 6.42e-12 % | Sí |
| EPANET 2.2 | Red 42 (26 nodos, 21 emisores) | Presión del nodo más desfavorable, N6 (m) | 1.0602870675876315 | 1.0602870676628202 | 7.09e-9 % | Sí |
| EPANET 2.2 | Red 42 (26 nodos, 21 emisores) | Caudal del tramo más desfavorable, t2 (l/s) | 0.006495888386776986 | 0.006495888716370044 | 5.07e-6 % | Sí |
| EPANET 2.2 | Red 42 (26 nodos, 21 emisores) | Caudal del emisor más desfavorable, N1 (l/h) | 4.624716006511717 | 4.62471600637297 | 3.00e-9 % | Sí |
| EPANET 2.2 | Red 44 (34 nodos, 26 emisores) | Presión del nodo más desfavorable, N4 (m) | -1.5302211977541448e-10 | 0 | 3.06e-8 % | Sí |
| EPANET 2.2 | Red 44 (34 nodos, 26 emisores) | Caudal del tramo más desfavorable, t30 (l/s) | 0.20015107963752618 | 0.20015107918282024 | 2.27e-7 % | Sí |
| EPANET 2.2 | Red 44 (34 nodos, 26 emisores) | Caudal del emisor más desfavorable, N7 (l/h) | 182.55880611685026 | 182.5588061303124 | 7.37e-9 % | Sí |
| EPANET 2.2 | Red 45 (5 nodos, 4 emisores) | Presión del nodo más desfavorable, N2 (m) | 14.19853758976397 | 14.198537589763271 | 4.92e-12 % | Sí |
| EPANET 2.2 | Red 45 (5 nodos, 4 emisores) | Caudal del tramo más desfavorable, t2 (l/s) | 0.00608868210119021 | 0.006088682289162938 | 3.09e-6 % | Sí |
| EPANET 2.2 | Red 45 (5 nodos, 4 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 5.858843842064922 | 5.858843842063945 | 1.67e-11 % | Sí |
| EPANET 2.2 | Red 46 (6 nodos, 3 emisores) | Presión del nodo más desfavorable, N1 (m) | 21.479515604465483 | 21.479515604463327 | 1.00e-11 % | Sí |
| EPANET 2.2 | Red 46 (6 nodos, 3 emisores) | Caudal del tramo más desfavorable, t2 (l/s) | 0.0030465756228018424 | 0.003046575753004156 | 4.27e-6 % | Sí |
| EPANET 2.2 | Red 46 (6 nodos, 3 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 5.1361561601448695 | 5.136156160155448 | 2.06e-10 % | Sí |
| EPANET 2.2 | Red 47 (27 nodos, 22 emisores) | Presión del nodo más desfavorable, N11, al llegar (m) | 38.979539355847415 | 38.979539357860524 | 5.16e-9 % | Sí |
| EPANET 2.2 | Red 47 (27 nodos, 22 emisores) | Caudal del tramo más desfavorable, t24 (l/s) | 0.0011802917367809795 | 0.0011802914596070187 | 2.35e-5 % | Sí |
| EPANET 2.2 | Red 47 (27 nodos, 22 emisores) | Caudal del emisor más desfavorable, N26 (l/h) | 10.199768045897903 | 10.199768046069337 | 1.68e-9 % | Sí |
| EPANET 2.2 | Red 48 (35 nodos, 22 emisores) | Presión del nodo más desfavorable, N6 (m) | -6.874906830489636e-11 | 0 | 1.37e-8 % | Sí |
| EPANET 2.2 | Red 48 (35 nodos, 22 emisores) | Caudal del tramo más desfavorable, t17 (l/s) | 0.12725998912451103 | 0.127259988805004 | 2.51e-7 % | Sí |
| EPANET 2.2 | Red 48 (35 nodos, 22 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 316.08179538244156 | 316.08179537716535 | 1.67e-9 % | Sí |
| EPANET 2.2 | Red 50 (24 nodos, 19 emisores) | Presión del nodo más desfavorable, N1 (m) | 7.314641348688597 | 7.314641345119489 | 4.88e-8 % | Sí |
| EPANET 2.2 | Red 50 (24 nodos, 19 emisores) | Caudal del tramo más desfavorable, t7 (l/s) | 0.0020991545116226694 | 0.0020991546036665614 | 4.38e-6 % | Sí |
| EPANET 2.2 | Red 50 (24 nodos, 19 emisores) | Caudal del emisor más desfavorable, N23 (l/h) | 8.094956511631132 | 8.094956510356472 | 1.57e-8 % | Sí |
| EPANET 2.2 | Red 51 (9 nodos, 7 emisores) | Presión del nodo más desfavorable, N7 (m) | 0.7440777296487359 | 0.744077729648468 | 3.60e-11 % | Sí |
| EPANET 2.2 | Red 51 (9 nodos, 7 emisores) | Caudal del tramo más desfavorable, t5 (l/s) | 0.0029158743282386005 | 0.00291587408254557 | 8.43e-6 % | Sí |
| EPANET 2.2 | Red 51 (9 nodos, 7 emisores) | Caudal del emisor más desfavorable, N7 (l/h) | 3.417665993543535 | 3.417665994007885 | 1.36e-8 % | Sí |
| EPANET 2.2 | Red 53 (6 nodos, 4 emisores) | Presión del nodo más desfavorable, N1 (m) | 2.0629593180317753 | 2.062959318031075 | 3.39e-11 % | Sí |
| EPANET 2.2 | Red 53 (6 nodos, 4 emisores) | Caudal del tramo más desfavorable, t5 (l/s) | 0.22874399040927773 | 0.22874399018546335 | 9.78e-8 % | Sí |
| EPANET 2.2 | Red 53 (6 nodos, 4 emisores) | Caudal del emisor más desfavorable, N1 (l/h) | 267.6597027278225 | 267.6597027277739 | 1.82e-11 % | Sí |
| EPANET 2.2 | Red 56 (9 nodos, 8 emisores) | Presión del nodo más desfavorable, N1 (m) | 8.602403562352231 | 8.602403562490988 | 1.61e-9 % | Sí |
| EPANET 2.2 | Red 56 (9 nodos, 8 emisores) | Caudal del tramo más desfavorable, t7 (l/s) | 0.0022735398048401847 | 0.0022735394159039283 | 1.71e-5 % | Sí |
| EPANET 2.2 | Red 56 (9 nodos, 8 emisores) | Caudal del emisor más desfavorable, N1 (l/h) | 3.656253570299324 | 3.656253570353396 | 1.48e-9 % | Sí |
| EPANET 2.2 | Red 57 (31 nodos, 28 emisores) | Presión del nodo más desfavorable, N9 (m) | 5.777621534512052 | 5.777621534482776 | 5.07e-10 % | Sí |
| EPANET 2.2 | Red 57 (31 nodos, 28 emisores) | Caudal del tramo más desfavorable, t21 (l/s) | 0.3437428658254356 | 0.3437428661227634 | 8.65e-8 % | Sí |
| EPANET 2.2 | Red 57 (31 nodos, 28 emisores) | Caudal del emisor más desfavorable, N9 (l/h) | 184.67862935821964 | 184.67862935779186 | 2.32e-10 % | Sí |
| EPANET 2.2 | Red 58 (22 nodos, 15 emisores) | Presión del nodo más desfavorable, N13 (m) | 35.044485369444466 | 35.04448536980116 | 1.02e-9 % | Sí |
| EPANET 2.2 | Red 58 (22 nodos, 15 emisores) | Caudal del tramo más desfavorable, t18 (l/s) | 0.001846258371991816 | 0.0018462587497071956 | 2.05e-5 % | Sí |
| EPANET 2.2 | Red 58 (22 nodos, 15 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 7.741662539339552 | 7.741662539304054 | 4.59e-10 % | Sí |
| EPANET 2.2 | Red 60 (15 nodos, 11 emisores) | Presión del nodo más desfavorable, N13 (m) | -9.979703463613988e-12 | 0 | 2.00e-9 % | Sí |
| EPANET 2.2 | Red 60 (15 nodos, 11 emisores) | Caudal del tramo más desfavorable, t13 (l/s) | 0.08901899896993785 | 0.0890189987827147 | 2.10e-7 % | Sí |
| EPANET 2.2 | Red 60 (15 nodos, 11 emisores) | Caudal del emisor más desfavorable, N10 (l/h) | 985.9218761594495 | 985.9218761555946 | 3.91e-10 % | Sí |
| EPANET 2.2 | Red 61 (24 nodos, 19 emisores) | Presión del nodo más desfavorable, N13 (m) | 3.5173565500011525 | 3.5173565504049242 | 1.15e-8 % | Sí |
| EPANET 2.2 | Red 61 (24 nodos, 19 emisores) | Caudal del tramo más desfavorable, t12 (l/s) | 0.0009438099084198835 | 0.0009438103118299951 | 4.27e-5 % | Sí |
| EPANET 2.2 | Red 61 (24 nodos, 19 emisores) | Caudal del emisor más desfavorable, N18 (l/h) | 10.915201578543623 | 10.915201578656177 | 1.03e-9 % | Sí |
| EPANET 2.2 | Red 62 (31 nodos, 23 emisores) | Presión del nodo más desfavorable, N4 (m) | -5.932379281148314e-11 | 0 | 1.19e-8 % | Sí |
| EPANET 2.2 | Red 62 (31 nodos, 23 emisores) | Caudal del tramo más desfavorable, t4 (l/s) | 0.5513158118318842 | 0.5513158114396465 | 7.11e-8 % | Sí |
| EPANET 2.2 | Red 62 (31 nodos, 23 emisores) | Caudal del emisor más desfavorable, N11 (l/h) | 449.4428234087541 | 449.44282341109044 | 5.20e-10 % | Sí |
| EPANET 2.2 | Red 63 (12 nodos, 8 emisores) | Presión del nodo más desfavorable, N2 (m) | 5.250667205791647 | 5.250667205843422 | 9.86e-10 % | Sí |
| EPANET 2.2 | Red 63 (12 nodos, 8 emisores) | Caudal del tramo más desfavorable, t11 (l/s) | 0.06556406024518395 | 0.06556405927480027 | 1.48e-6 % | Sí |
| EPANET 2.2 | Red 63 (12 nodos, 8 emisores) | Caudal del emisor más desfavorable, N2 (l/h) | 322.2995920884534 | 322.2995921000604 | 3.60e-9 % | Sí |
| EPANET 2.2 | Red 64 (35 nodos, 28 emisores) | Presión del nodo más desfavorable, N34 (m) | 16.063862746724514 | 16.063862746794133 | 4.33e-10 % | Sí |
| EPANET 2.2 | Red 64 (35 nodos, 28 emisores) | Caudal del tramo más desfavorable, t8 (l/s) | 0.0010594601740224587 | 0.0010594597554787065 | 3.95e-5 % | Sí |
| EPANET 2.2 | Red 64 (35 nodos, 28 emisores) | Caudal del emisor más desfavorable, N34 (l/h) | 12.561839737684831 | 12.561839737712704 | 2.22e-10 % | Sí |
| EPANET 2.2 | Red 65 (7 nodos, 4 emisores) | Presión del nodo más desfavorable, N1 (m) | 22.207588966593196 | 22.207588966710937 | 5.30e-10 % | Sí |
| EPANET 2.2 | Red 65 (7 nodos, 4 emisores) | Caudal del tramo más desfavorable, t6 (l/s) | 0.0018564568807236629 | 0.0018564571654633324 | 1.53e-5 % | Sí |
| EPANET 2.2 | Red 65 (7 nodos, 4 emisores) | Caudal del emisor más desfavorable, N6 (l/h) | 6.6832457956549955 | 6.683245795667997 | 1.95e-10 % | Sí |
| EPANET 2.2 | Red 66 (9 nodos, 6 emisores) | Presión del nodo más desfavorable, N1 (m) | -0.11012643974911626 | -0.11012643990859243 | 3.19e-8 % | Sí |
| EPANET 2.2 | Red 66 (9 nodos, 6 emisores) | Caudal del tramo más desfavorable, t1 (l/s) | 0.6061555340757611 | 0.6061555344942824 | 6.90e-8 % | Sí |
| EPANET 2.2 | Red 66 (9 nodos, 6 emisores) | Caudal del emisor más desfavorable, N5 (l/h) | 227.09238747072493 | 227.09238746864563 | 9.16e-10 % | Sí |
| EPANET 2.2 | Red 67 (40 nodos, 32 emisores) | Presión del nodo más desfavorable, N10 (m) | 14.95960599732833 | 14.959606000020857 | 1.80e-8 % | Sí |
| EPANET 2.2 | Red 67 (40 nodos, 32 emisores) | Caudal del tramo más desfavorable, t39 (l/s) | 0.003454727057318214 | 0.0034547273413677473 | 8.22e-6 % | Sí |
| EPANET 2.2 | Red 67 (40 nodos, 32 emisores) | Caudal del emisor más desfavorable, N22 (l/h) | 9.544752568790814 | 9.544752569565322 | 8.11e-9 % | Sí |
| EPANET 2.2 | Red 68 (17 nodos, 12 emisores) | Presión del nodo más desfavorable, N11 (m) | -9.42527549341321e-12 | 0 | 1.89e-9 % | Sí |
| EPANET 2.2 | Red 68 (17 nodos, 12 emisores) | Caudal del tramo más desfavorable, t6 (l/s) | 0.11809875521073748 | 0.11809875530677807 | 8.13e-8 % | Sí |
| EPANET 2.2 | Red 68 (17 nodos, 12 emisores) | Caudal del emisor más desfavorable, N15 (l/h) | 336.8678544770306 | 336.86785447768636 | 1.95e-10 % | Sí |
| EPANET 2.2 | Red 69 (33 nodos, 27 emisores) | Presión del nodo más desfavorable, N29 (m) | 8.747599015336743 | 8.747599024193 | 1.01e-7 % | Sí |
| EPANET 2.2 | Red 69 (33 nodos, 27 emisores) | Caudal del tramo más desfavorable, t11 (l/s) | 0.0009471388445825149 | 0.0009471382742086874 | 6.02e-5 % | Sí |
| EPANET 2.2 | Red 69 (33 nodos, 27 emisores) | Caudal del emisor más desfavorable, N29 (l/h) | 5.1714180478147815 | 5.171418050694391 | 5.57e-8 % | Sí |
| EPANET 2.2 | Red 70 (32 nodos, 26 emisores) | Presión del nodo más desfavorable, N3 (m) | -0.4321624356959088 | -0.43216243581858765 | 2.45e-8 % | Sí |
| EPANET 2.2 | Red 70 (32 nodos, 26 emisores) | Caudal del tramo más desfavorable, t25 (l/s) | 0.0011759702071059322 | 0.0011759705062777234 | 2.54e-5 % | Sí |
| EPANET 2.2 | Red 70 (32 nodos, 26 emisores) | Caudal del emisor más desfavorable, N13 (l/h) | 7.342022604126424 | 7.342022603300645 | 1.12e-8 % | Sí |
| EPANET 2.2 | Red 71 (32 nodos, 26 emisores) | Presión del nodo más desfavorable, N10 (m) | 16.65383569471999 | 16.653835696972326 | 1.35e-8 % | Sí |
| EPANET 2.2 | Red 71 (32 nodos, 26 emisores) | Caudal del tramo más desfavorable, t28 (l/s) | 0.001729822574223506 | 0.0017298220154874093 | 3.23e-5 % | Sí |
| EPANET 2.2 | Red 71 (32 nodos, 26 emisores) | Caudal del emisor más desfavorable, N6 (l/h) | 5.6627808468159975 | 5.662780847156788 | 6.02e-9 % | Sí |
| EPANET 2.2 | Red 72 (11 nodos, 9 emisores) | Presión del nodo más desfavorable, N3 (m) | 13.58494111251107 | 13.584941112518894 | 5.76e-11 % | Sí |
| EPANET 2.2 | Red 72 (11 nodos, 9 emisores) | Caudal del tramo más desfavorable, t4 (l/s) | 0.08680025399371512 | 0.08680025376756131 | 2.61e-7 % | Sí |
| EPANET 2.2 | Red 72 (11 nodos, 9 emisores) | Caudal del emisor más desfavorable, N3 (l/h) | 721.4402802818364 | 721.440280282044 | 2.88e-11 % | Sí |
| EPANET 2.2 | Red 73 (31 nodos, 25 emisores) | Presión del nodo más desfavorable, N20 (m) | 2.775128864914326 | 2.7751288701259895 | 1.88e-7 % | Sí |
| EPANET 2.2 | Red 73 (31 nodos, 25 emisores) | Caudal del tramo más desfavorable, t26 (l/s) | 0.0010382917152430662 | 0.0010382927062333965 | 9.54e-5 % | Sí |
| EPANET 2.2 | Red 73 (31 nodos, 25 emisores) | Caudal del emisor más desfavorable, N20 (l/h) | 1.134219574529998 | 1.134219575595026 | 9.39e-8 % | Sí |
| EPANET 2.2 | Red 74 (9 nodos, 7 emisores) | Presión del nodo más desfavorable, N2 (m) | 3.5246227610382705 | 3.5246227610385943 | 9.19e-12 % | Sí |
| EPANET 2.2 | Red 74 (9 nodos, 7 emisores) | Caudal del tramo más desfavorable, t3 (l/s) | 0.008162545147715857 | 0.008162544905235544 | 2.97e-6 % | Sí |
| EPANET 2.2 | Red 74 (9 nodos, 7 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 10.93159308804804 | 10.931593088048404 | 3.33e-12 % | Sí |
| EPANET 2.2 | Red 76 (20 nodos, 18 emisores) | Presión del nodo más desfavorable, N4 (m) | 11.826770894761939 | 11.826770895080323 | 2.69e-9 % | Sí |
| EPANET 2.2 | Red 76 (20 nodos, 18 emisores) | Caudal del tramo más desfavorable, t9 (l/s) | 0.0013776293191232248 | 0.0013776301183431375 | 5.80e-5 % | Sí |
| EPANET 2.2 | Red 76 (20 nodos, 18 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 12.062921776712184 | 12.06292177698244 | 2.24e-9 % | Sí |
| EPANET 2.2 | Red 78 (23 nodos, 15 emisores) | Presión del nodo más desfavorable, N1 (m) | 10.423707059997337 | 10.423707059095001 | 8.66e-9 % | Sí |
| EPANET 2.2 | Red 78 (23 nodos, 15 emisores) | Caudal del tramo más desfavorable, t20 (l/s) | 0.0005719278562776544 | 0.0005719278424725946 | 2.41e-6 % | Sí |
| EPANET 2.2 | Red 78 (23 nodos, 15 emisores) | Caudal del emisor más desfavorable, N20 (l/h) | 2.0589402329450284 | 2.0589402329013407 | 2.12e-9 % | Sí |
| EPANET 2.2 | Red 79 (5 nodos, 3 emisores) | Presión del nodo más desfavorable, N1 (m) | 6.0419126896146 | 6.041912689072113 | 8.98e-9 % | Sí |
| EPANET 2.2 | Red 79 (5 nodos, 3 emisores) | Caudal del tramo más desfavorable, t3 (l/s) | 0.0009493469265429522 | 0.0009493474768658876 | 5.80e-5 % | Sí |
| EPANET 2.2 | Red 79 (5 nodos, 3 emisores) | Caudal del emisor más desfavorable, N3 (l/h) | 3.4176509168212084 | 3.4176509167171956 | 3.04e-9 % | Sí |
| EPANET 2.2 | Red 80 (33 nodos, 25 emisores) | Presión del nodo más desfavorable, N3 (m) | 28.773833497309475 | 28.77383344563798 | 1.80e-7 % | Sí |
| EPANET 2.2 | Red 80 (33 nodos, 25 emisores) | Caudal del tramo más desfavorable, t4 (l/s) | 0.001732493915562412 | 0.00173249484156163 | 5.34e-5 % | Sí |
| EPANET 2.2 | Red 80 (33 nodos, 25 emisores) | Caudal del emisor más desfavorable, N12 (l/h) | 8.707899773330167 | 8.707899766241608 | 8.14e-8 % | Sí |
| EPANET 2.2 | Red 83 (30 nodos, 23 emisores) | Presión del nodo más desfavorable, N2, al llegar (m) | 14.86581892083932 | 14.865818922500567 | 1.12e-8 % | Sí |
| EPANET 2.2 | Red 83 (30 nodos, 23 emisores) | Caudal del tramo más desfavorable, t12 (l/s) | 0.0008680438161110073 | 0.0008680448852638993 | 1.23e-4 % | Sí |
| EPANET 2.2 | Red 83 (30 nodos, 23 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 1.7021900434275816 | 1.7021900434313437 | 2.21e-10 % | Sí |
| EPANET 2.2 | Red 84 (20 nodos, 14 emisores) | Presión del nodo más desfavorable, N2 (m) | 13.557320138345412 | 13.5573201394129 | 7.87e-9 % | Sí |
| EPANET 2.2 | Red 84 (20 nodos, 14 emisores) | Caudal del tramo más desfavorable, t3 (l/s) | 0.0007173638036032741 | 0.0007173645744059989 | 1.07e-4 % | Sí |
| EPANET 2.2 | Red 84 (20 nodos, 14 emisores) | Caudal del emisor más desfavorable, N2 (l/h) | 3.0947580497255838 | 3.0947580498377736 | 3.63e-9 % | Sí |
| EPANET 2.2 | Red 85 (20 nodos, 16 emisores) | Presión del nodo más desfavorable, N3 (m) | 11.56402353880368 | 11.564023539051174 | 2.14e-9 % | Sí |
| EPANET 2.2 | Red 85 (20 nodos, 16 emisores) | Caudal del tramo más desfavorable, t6 (l/s) | 0.0023075215083345328 | 0.0023075209449837843 | 2.44e-5 % | Sí |
| EPANET 2.2 | Red 85 (20 nodos, 16 emisores) | Caudal del emisor más desfavorable, N3 (l/h) | 12.437559107757394 | 12.437559107897318 | 1.13e-9 % | Sí |
| EPANET 2.2 | Red 86 (5 nodos, 3 emisores) | Presión del nodo más desfavorable, N2 (m) | 6.034879791380773 | 6.034879791382118 | 2.23e-11 % | Sí |
| EPANET 2.2 | Red 86 (5 nodos, 3 emisores) | Caudal del tramo más desfavorable, t2 (l/s) | 0.0030934690923280035 | 0.00309346903302907 | 1.92e-6 % | Sí |
| EPANET 2.2 | Red 86 (5 nodos, 3 emisores) | Caudal del emisor más desfavorable, N3 (l/h) | 17.175187769166843 | 17.175187769346767 | 1.05e-9 % | Sí |
| EPANET 2.2 | Red 87 (5 nodos, 4 emisores) | Presión del nodo más desfavorable, N4 (m) | 6.402810098717838 | 6.402810098725473 | 1.19e-10 % | Sí |
| EPANET 2.2 | Red 87 (5 nodos, 4 emisores) | Caudal del tramo más desfavorable, t4 (l/s) | 0.0013685299516919863 | 0.0013685299071337432 | 3.26e-6 % | Sí |
| EPANET 2.2 | Red 87 (5 nodos, 4 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 4.926707665678774 | 4.926707665681476 | 5.48e-11 % | Sí |
| EPANET 2.2 | Red 90 (5 nodos, 4 emisores) | Presión del nodo más desfavorable, N2 (m) | 5.727886175628154 | 5.7278861756284085 | 4.45e-12 % | Sí |
| EPANET 2.2 | Red 90 (5 nodos, 4 emisores) | Caudal del tramo más desfavorable, t2 (l/s) | 0.12954574486894202 | 0.12954574469525576 | 1.34e-7 % | Sí |
| EPANET 2.2 | Red 90 (5 nodos, 4 emisores) | Caudal del emisor más desfavorable, N2 (l/h) | 466.36468090291027 | 466.3646809029207 | 2.24e-12 % | Sí |
| EPANET 2.2 | Red 91 (28 nodos, 25 emisores) | Presión del nodo más desfavorable, N15 (m) | 9.421176764637567 | 9.421176765649992 | 1.07e-8 % | Sí |
| EPANET 2.2 | Red 91 (28 nodos, 25 emisores) | Caudal del tramo más desfavorable, t1 (l/s) | 0.0006881380894740798 | 0.0006881375034990704 | 8.52e-5 % | Sí |
| EPANET 2.2 | Red 91 (28 nodos, 25 emisores) | Caudal del emisor más desfavorable, N15 (l/h) | 10.910354200159157 | 10.910354200745733 | 5.38e-9 % | Sí |
| EPANET 2.2 | Red 92 (19 nodos, 14 emisores) | Presión del nodo más desfavorable, N6 (m) | 12.24994246758907 | 12.249942468592558 | 8.19e-9 % | Sí |
| EPANET 2.2 | Red 92 (19 nodos, 14 emisores) | Caudal del tramo más desfavorable, t15 (l/s) | 0.0018015205709994008 | 0.0018015215301592934 | 5.32e-5 % | Sí |
| EPANET 2.2 | Red 92 (19 nodos, 14 emisores) | Caudal del emisor más desfavorable, N13 (l/h) | 8.374998880299707 | 8.374998880542146 | 2.89e-9 % | Sí |
| EPANET 2.2 | Red 93 (13 nodos, 11 emisores) | Presión del nodo más desfavorable, N1 (m) | 15.97537981416953 | 15.975379805136688 | 5.65e-8 % | Sí |
| EPANET 2.2 | Red 93 (13 nodos, 11 emisores) | Caudal del tramo más desfavorable, t5 (l/s) | 0.0011242875127937088 | 0.0011242876343716937 | 1.08e-5 % | Sí |
| EPANET 2.2 | Red 93 (13 nodos, 11 emisores) | Caudal del emisor más desfavorable, N1 (l/h) | 6.833219838100159 | 6.833219835975146 | 3.11e-8 % | Sí |
| EPANET 2.2 | Red 94 (12 nodos, 9 emisores) | Presión del nodo más desfavorable, N1 (m) | 9.799558769692283 | 9.799558769933961 | 2.47e-9 % | Sí |
| EPANET 2.2 | Red 94 (12 nodos, 9 emisores) | Caudal del tramo más desfavorable, t8 (l/s) | 0.0003772598457909101 | 0.0003772594999130203 | 9.17e-5 % | Sí |
| EPANET 2.2 | Red 94 (12 nodos, 9 emisores) | Caudal del emisor más desfavorable, N3 (l/h) | 3.501051433923643 | 3.5010514339524237 | 8.22e-10 % | Sí |
| EPANET 2.2 | Red 95 (26 nodos, 18 emisores) | Presión del nodo más desfavorable, N3 (m) | 8.079010976796653 | 8.079010976944119 | 1.83e-9 % | Sí |
| EPANET 2.2 | Red 95 (26 nodos, 18 emisores) | Caudal del tramo más desfavorable, t25 (l/s) | 0.17248909646080157 | 0.17248909611632476 | 2.00e-7 % | Sí |
| EPANET 2.2 | Red 95 (26 nodos, 18 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 427.2277545239672 | 427.2277545400439 | 3.76e-9 % | Sí |
| EPANET 2.2 | Red 96 (6 nodos, 3 emisores) | Presión del nodo más desfavorable, N4 (m) | 18.650272061775606 | 18.650272061774313 | 6.93e-12 % | Sí |
| EPANET 2.2 | Red 96 (6 nodos, 3 emisores) | Caudal del tramo más desfavorable, t4 (l/s) | 0.1254533763114052 | 0.12545337639113732 | 6.36e-8 % | Sí |
| EPANET 2.2 | Red 96 (6 nodos, 3 emisores) | Caudal del emisor más desfavorable, N4 (l/h) | 451.63215500811157 | 451.63215500809434 | 3.81e-12 % | Sí |
| EPANET 2.2 | Red 98 (22 nodos, 15 emisores) | Presión del nodo más desfavorable, N7 (m) | -0.5664971209190859 | -0.5664971208706743 | 8.55e-9 % | Sí |
| EPANET 2.2 | Red 98 (22 nodos, 15 emisores) | Caudal del tramo más desfavorable, t17 (l/s) | 0.000826949280424333 | 0.0008269494968134187 | 2.62e-5 % | Sí |
| EPANET 2.2 | Red 98 (22 nodos, 15 emisores) | Caudal del emisor más desfavorable, N9 (l/h) | 5.475664943066078 | 5.475664943152939 | 1.59e-9 % | Sí |
| EPANET 2.2 | Red 99 (13 nodos, 9 emisores) | Presión del nodo más desfavorable, N5 (m) | 11.757440902804936 | 11.75744090260343 | 1.71e-9 % | Sí |
| EPANET 2.2 | Red 99 (13 nodos, 9 emisores) | Caudal del tramo más desfavorable, t10 (l/s) | 0.0010089699063557866 | 0.0010089701315000466 | 2.23e-5 % | Sí |
| EPANET 2.2 | Red 99 (13 nodos, 9 emisores) | Caudal del emisor más desfavorable, N9 (l/h) | 5.167359116191586 | 5.1673591166859785 | 9.57e-9 % | Sí |
| EPANET 2.2 | Red 100 (11 nodos, 8 emisores) | Presión del nodo más desfavorable, N1 (m) | 0.9258572911536452 | 0.9258572911585072 | 5.25e-10 % | Sí |
| EPANET 2.2 | Red 100 (11 nodos, 8 emisores) | Caudal del tramo más desfavorable, t8 (l/s) | 0.0012758909452406408 | 0.0012758908030201684 | 1.11e-5 % | Sí |
| EPANET 2.2 | Red 100 (11 nodos, 8 emisores) | Caudal del emisor más desfavorable, N9 (l/h) | 4.59320689085315 | 4.593206890872606 | 4.24e-10 % | Sí |
