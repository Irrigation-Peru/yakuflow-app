import type { Cultivo, RangoConOptimo, RequisitosDelCultivo, TexturaGruesa } from './cultivo'

// Catálogo provisional: valores tomados de las tablas 11, 12 y 22 del FAO 56 para cultivos que se siembran
// en la sierra central. Queda pendiente que el especialista valide los rangos y el calendario por etapas
// para Pasco; mientras tanto, de cada tabla se eligió la fila del clima más parecido, que se anota en la fuente.
//
// La duración del ciclo no sale de la tabla 11 sino de la sierra peruana: es la mediana de los meses entre la siembra y
// el inicio de la cosecha en la Encuesta Nacional Agropecuaria 2024 del INEI (P209 y P206), interpolada porque la
// encuesta registra meses enteros y pasada a días a 30,44 por mes. El FAO 56 pide usar la duración observada en el lugar
// siempre que se pueda; sus filas, del Mediterráneo o de África oriental, daban a la haba 100 días y en la sierra tarda
// 215. Las cuatro etapas conservan la proporción de la fila de la tabla 11 que se anota. El cálculo está en crop-ml,
// scripts/p10_duraciones.py, y sus cifras en resultados/duraciones.json.
//
// Los requisitos del lugar salen de tres fuentes:
// - ECOCROP de la FAO (base descontinuada en 2015, copia completa en github.com/openclim/ecocrop): temperatura
//   media (TMIN, TOPMN, TOPMX, TMAX), temperatura letal en crecimiento (KTMP), pH y textura. Sus rangos son de
//   variedades de todo el mundo, no de las andinas.
// - Vacher (2004), sobre el valle de Ambana en los Andes bolivianos: la altitud máxima de cada cultivo, que la
//   fija la helada. ECOCROP pone la papa en 2800 m como máximo, lo que en los Andes no vale; donde Vacher no da
//   el dato, se usa el de ECOCROP (ALTMX) y se anota.
// - FAO 56, tabla 23: la salinidad que el cultivo tolera.

const rango = (minimo: number, optimoMinimo: number, optimoMaximo: number, maximo: number): RangoConOptimo => ({
  minimo,
  optimoMinimo,
  optimoMaximo,
  maximo,
})
const TODAS: readonly TexturaGruesa[] = ['ligera', 'media', 'pesada']
const ALTITUD_ANDINA = 'altitud de Vacher (2004)'

const requisitos = (r: Omit<RequisitosDelCultivo, 'fuente'>, especie: string, altitud = ALTITUD_ANDINA): RequisitosDelCultivo => ({
  ...r,
  fuente: `ECOCROP (${especie}); ${altitud}; FAO 56, tabla 23. Provisionales, por validar con el especialista`,
})

const HABA = requisitos(
  {
    altitudMaximaM: 3800,
    temperaturaMediaC: rango(5, 18, 28, 32),
    ph: rango(4.5, 6, 7, 8.6),
    texturas: { optimas: ['media'], posibles: TODAS },
    // La tabla 23 da 1.5 a 1.6 dS/m: se toma el menor.
    salinidad: { umbralDsM: 1.5, perdidaPctPorDsM: 9.6 },
    metodos: ['goteo', 'aspersion'],
  },
  'Vicia faba',
)

export const CATALOGO_FAO56: readonly Cultivo[] = [
  {
    nombre: 'Papa',
    // 6,36 meses en la ENA (17 648 registros de la sierra).
    etapas: { inicial: 40, desarrollo: 47, media: 66, final: 40 },
    // Kc final 0.40 y no 0.75: la nota 4 de la tabla 12 lo da para la papa de ciclo largo con el follaje muerto, que es
    // como se cosecha en la sierra. Se deja de regar dos semanas antes, para que la piel del tubérculo madure.
    kc: { inicial: 0.5, media: 1.15, final: 0.4 },
    profundidadRadicularM: { minima: 0.4, maxima: 0.6 },
    fraccionAgotamiento: 0.35,
    maduracion: { corteDelRiegoDias: 15 },
    fuente: 'ENA 2024: duración en la sierra; FAO 56: tabla 11 (proporción de Europa, siembra en abril), tabla 12 (nota 4: ciclo largo con el follaje muerto) y tabla 22',
    requisitos: requisitos(
      {
        altitudMaximaM: 4200,
        temperaturaMediaC: rango(7, 15, 25, 30),
        temperaturaLetalC: 0,
        ph: rango(4.2, 5, 6.2, 8.5),
        texturas: { optimas: ['media'], posibles: TODAS },
        salinidad: { umbralDsM: 1.7, perdidaPctPorDsM: 12 },
        metodos: ['goteo', 'aspersion'],
      },
      'Solanum tuberosum',
    ),
  },
  {
    nombre: 'Haba, grano seco',
    // 7,06 meses en la ENA (3447 registros). El INIA da 220 días a la madurez de cosecha de su variedad 417.
    etapas: { inicial: 43, desarrollo: 65, media: 75, final: 32 },
    kc: { inicial: 0.5, media: 1.15, final: 0.3 },
    profundidadRadicularM: { minima: 0.5, maxima: 0.7 },
    fraccionAgotamiento: 0.45,
    maduracion: { corteDelRiegoDias: 10 },
    fuente: 'ENA 2024: duración en la sierra; FAO 56: tabla 11 (proporción del mediterráneo, siembra en marzo o abril), tablas 12 y 22',
    requisitos: HABA,
  },
  {
    nombre: 'Haba, verde',
    // 5,51 meses en la ENA (1032 registros).
    etapas: { inicial: 34, desarrollo: 50, media: 59, final: 25 },
    kc: { inicial: 0.5, media: 1.15, final: 1.1 },
    profundidadRadicularM: { minima: 0.5, maxima: 0.7 },
    fraccionAgotamiento: 0.45,
    fuente: 'ENA 2024: duración en la sierra; FAO 56: tabla 11 (proporción del mediterráneo, siembra en marzo o abril), tablas 12 y 22',
    requisitos: HABA,
  },
  {
    nombre: 'Arveja, verde',
    // 4,30 meses en la ENA (860 registros).
    etapas: { inicial: 26, desarrollo: 39, media: 46, final: 20 },
    kc: { inicial: 0.5, media: 1.15, final: 1.1 },
    profundidadRadicularM: { minima: 0.6, maxima: 1.0 },
    fraccionAgotamiento: 0.35,
    fuente: 'ENA 2024: duración en la sierra; FAO 56: tabla 11 (proporción del mediterráneo, siembra en marzo o abril), tablas 12 y 22',
    requisitos: requisitos(
      {
        altitudMaximaM: 3700,
        temperaturaMediaC: rango(4, 10, 24, 30),
        temperaturaLetalC: 0,
        ph: rango(4.5, 5.5, 7, 8.3),
        texturas: { optimas: TODAS, posibles: TODAS },
        salinidad: { umbralDsM: 1.5, perdidaPctPorDsM: 14 },
        metodos: ['goteo', 'aspersion'],
      },
      'Pisum sativum',
    ),
  },
  {
    nombre: 'Cebada',
    // 6,21 meses en la ENA (4414 registros).
    etapas: { inicial: 19, desarrollo: 38, media: 82, final: 50 },
    kc: { inicial: 0.3, media: 1.15, final: 0.25 },
    profundidadRadicularM: { minima: 1.0, maxima: 1.5 },
    fraccionAgotamiento: 0.55,
    maduracion: { corteDelRiegoDias: 20 },
    fuente: 'ENA 2024: duración en la sierra; FAO 56: tabla 11 (proporción de África oriental, siembra en julio), tablas 12 y 22',
    requisitos: requisitos(
      {
        altitudMaximaM: 3800,
        temperaturaMediaC: rango(2, 15, 20, 40),
        temperaturaLetalC: 0,
        ph: rango(6, 6.5, 7.5, 8),
        texturas: { optimas: ['media'], posibles: TODAS },
        salinidad: { umbralDsM: 8, perdidaPctPorDsM: 5 },
        // Se siembra al voleo, demasiado densa para llevar un gotero por planta.
        metodos: ['aspersion'],
      },
      'Hordeum vulgare',
    ),
  },
  {
    nombre: 'Avena',
    // 5,54 meses en la ENA (8007 registros).
    etapas: { inicial: 17, desarrollo: 34, media: 73, final: 45 },
    kc: { inicial: 0.3, media: 1.15, final: 0.25 },
    profundidadRadicularM: { minima: 1.0, maxima: 1.5 },
    fraccionAgotamiento: 0.55,
    maduracion: { corteDelRiegoDias: 20 },
    fuente: 'ENA 2024: duración en la sierra; FAO 56: tabla 11 (proporción de África oriental, siembra en julio), tablas 12 y 22',
    requisitos: requisitos(
      {
        altitudMaximaM: 4200,
        temperaturaMediaC: rango(5, 16, 20, 30),
        temperaturaLetalC: -1,
        ph: rango(4.5, 5, 6, 7.5),
        texturas: { optimas: TODAS, posibles: TODAS },
        // La tabla 23 no trae la avena: se toma el límite de la clase «baja» de ECOCROP.
        salinidad: { umbralDsM: 4 },
        metodos: ['aspersion'],
      },
      'Avena sativa',
    ),
  },
  {
    nombre: 'Zanahoria',
    // 4,50 meses en la ENA (202 registros).
    etapas: { inicial: 27, desarrollo: 37, media: 55, final: 18 },
    kc: { inicial: 0.7, media: 1.05, final: 0.95 },
    profundidadRadicularM: { minima: 0.5, maxima: 1.0 },
    fraccionAgotamiento: 0.35,
    fuente: 'ENA 2024: duración en la sierra; FAO 56: tabla 11 (proporción del mediterráneo, siembra en febrero o marzo), tablas 12 y 22',
    requisitos: requisitos(
      {
        altitudMaximaM: 2600,
        temperaturaMediaC: rango(3, 15, 24, 30),
        temperaturaLetalC: 0,
        ph: rango(4.2, 5.8, 6.8, 8.7),
        texturas: { optimas: ['media'], posibles: TODAS },
        salinidad: { umbralDsM: 1, perdidaPctPorDsM: 14 },
        metodos: ['goteo', 'aspersion'],
      },
      'Daucus carota',
      'altitud de ECOCROP (ALTMX), que Vacher (2004) no da',
    ),
  },
  {
    nombre: 'Maíz, grano',
    // 7,11 meses en la ENA (14 227 registros).
    etapas: { inicial: 36, desarrollo: 60, media: 72, final: 48 },
    kc: { inicial: 0.3, media: 1.2, final: 0.35 },
    profundidadRadicularM: { minima: 1.0, maxima: 1.7 },
    fraccionAgotamiento: 0.55,
    maduracion: { corteDelRiegoDias: 20 },
    fuente: 'ENA 2024: duración en la sierra; FAO 56: tabla 11 (proporción de África oriental en altura, siembra en abril), tabla 12 (cosecha en seco) y tabla 22',
    requisitos: requisitos(
      {
        altitudMaximaM: 3500,
        temperaturaMediaC: rango(10, 18, 33, 47),
        ph: rango(4.5, 5, 7, 8.5),
        texturas: { optimas: ['media'], posibles: TODAS },
        salinidad: { umbralDsM: 1.7, perdidaPctPorDsM: 12 },
        metodos: ['goteo', 'aspersion'],
      },
      'Zea mays ssp. mays',
    ),
  },
]
