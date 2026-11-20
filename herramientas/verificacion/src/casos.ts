import {
  aguaFacilmenteAprovechable,
  aguaUtilTotal,
  calcularRed,
  coeficienteDeCultivo,
  tramoDelMetodo,
  type Cultivo,
} from '@riego/calculo'
import { cargarEpanet, resolverEnEpanet } from './epanet'
import { redDeVerificacion } from './redes'

// Los casos de verificación del módulo de cálculo contra tres fuentes independientes (HU0004):
// 1. el método de diseño normalizado, con los valores guardados en su hoja de cálculo;
// 2. problemas resueltos de bibliografía: los ejemplos 28 y 36 del Estudio FAO Riego y Drenaje N.º 56;
// 3. EPANET 2.2, sobre redes al azar con semilla fija.

/** Error relativo máximo admitido: una centésima de por ciento. */
export const ERROR_ADMITIDO = 1e-4

export interface Comparacion {
  fuente: 'Método de diseño normalizado' | 'FAO 56' | 'EPANET 2.2'
  caso: string
  magnitud: string
  esperado: number
  obtenido: number
  /** Cifras decimales con que la fuente publica el valor; el módulo se redondea igual antes de comparar. */
  decimales?: number
  /**
   * Escala mínima del error: |obtenido − esperado| / máx(|esperado|, escala). Evita dividir entre casi cero
   * donde el valor esperado es nulo, como la presión justo después de una cámara rompe-presión.
   */
  escala?: number
  error: number
}

function comparar(c: Omit<Comparacion, 'error'>): Comparacion {
  const obtenido = c.decimales === undefined ? c.obtenido : Number(c.obtenido.toFixed(c.decimales))
  const error = Math.abs(obtenido - c.esperado) / Math.max(Math.abs(c.esperado), c.escala ?? 0)
  return { ...c, obtenido, error }
}

function casosDelMetodo(): Comparacion[] {
  // Caso guardado del método de referencia: tramo RESERVORIO → CRP-1.
  const r = tramoDelMetodo({
    caudalLps: 2,
    c: 140,
    diametroPulg: 2,
    cotaInicio: 3000,
    cotaFin: 2990,
    progresivaInicioM: 0,
    progresivaFinM: 20,
    presionAnteriorM: 2.5,
  })
  const caso = 'Método de referencia, RESERVORIO → CRP-1'
  const fuente = 'Método de diseño normalizado'
  return [
    comparar({ fuente, caso, magnitud: 'Velocidad (m/s)', esperado: 0.9867603132201427, obtenido: r.velocidadMs }),
    comparar({ fuente, caso, magnitud: 'Pérdida de carga (m)', esperado: 0.5068456652968484, obtenido: r.perdidaCargaM }),
    comparar({ fuente, caso, magnitud: 'Presión residual (m)', esperado: 11.993154334703151, obtenido: r.presionResidualM }),
    comparar({
      fuente,
      caso,
      magnitud: 'Cota piezométrica final (m)',
      esperado: 3001.9931543347034,
      obtenido: r.cotaPiezometricaFinal,
    }),
  ]
}

function casosDeFao56(): Comparacion[] {
  const fuente = 'FAO 56'
  const frijol: Cultivo = {
    nombre: 'Frijol seco',
    etapas: { inicial: 25, desarrollo: 25, media: 30, final: 20 },
    kc: { inicial: 0.15, media: 1.19, final: 0.35 },
    profundidadRadicularM: { minima: 0.6, maxima: 0.9 },
    fraccionAgotamiento: 0.45,
  }
  const ejemplo28 = (
    [
      [20, 0.15],
      [40, 0.77],
      [70, 1.19],
      [95, 0.56],
    ] as const
  ).map(([dia, kc]) =>
    comparar({
      fuente,
      caso: 'Ejemplo 28, frijol seco',
      magnitud: `Kc del día ${dia}`,
      esperado: kc,
      obtenido: coeficienteDeCultivo(frijol, dia),
      decimales: 2,
    }),
  )

  const suelos = {
    'arena franca': [0.15, 0.06],
    limo: [0.32, 0.15],
    'arcilla limosa': [0.35, 0.23],
  } as const
  const cultivos = { cebolla: [0.4, 0.3], tomate: [0.8, 0.4], maíz: [1.2, 0.55] } as const
  const libro: Record<string, readonly [number, number][]> = {
    cebolla: [
      [36, 11],
      [68, 20],
      [48, 14],
    ],
    tomate: [
      [72, 29],
      [136, 54],
      [96, 38],
    ],
    maíz: [
      [108, 59],
      [204, 112],
      [144, 79],
    ],
  }
  const ejemplo36 = Object.entries(cultivos).flatMap(([cultivo, [zr, p]]) =>
    Object.entries(suelos).flatMap(([suelo, [cc, pmp]], i) => {
      const [at, afa] = libro[cultivo]![i]!
      const total = aguaUtilTotal({ capacidadDeCampo: cc, puntoDeMarchitez: pmp, profundidadRadicularM: zr })
      const caso = `Ejemplo 36, ${cultivo} en ${suelo}`
      return [
        comparar({ fuente, caso, magnitud: 'Agua útil total (mm)', esperado: at, obtenido: total, decimales: 0 }),
        comparar({
          fuente,
          caso,
          magnitud: 'Agua fácilmente aprovechable (mm)',
          esperado: afa,
          obtenido: aguaFacilmenteAprovechable(total, p),
          decimales: 0,
        }),
      ]
    }),
  )
  return [...ejemplo28, ...ejemplo36]
}

/**
 * Presión mínima de los emisores para comparar contra EPANET: por debajo, EPANET 2.2 deja que un emisor tome
 * agua con presión negativa y el módulo no, así que los dos modelos dejarían de describir lo mismo.
 * Es también la escala mínima del error de presión.
 */
const PRESION_MINIMA_COMPARABLE_M = 0.5
/** Escalas mínimas del error de caudal: un milímetro cúbico por segundo en tramos y un mililitro por hora en emisores. */
const ESCALA_CAUDAL_TRAMO_LPS = 1e-6
const ESCALA_CAUDAL_EMISOR_LPH = 1e-3

export interface RedDescartada {
  semilla: number
  motivo: string
}

/** El peor caso, por error relativo con escala mínima, de una serie de pares esperado y obtenido. */
function peor(pares: Iterable<[string, number, number]>, escala: number) {
  let resultado = { id: '', esperado: 0, obtenido: 0, error: -1 }
  for (const [id, esperado, obtenido] of pares) {
    const error = Math.abs(obtenido - esperado) / Math.max(Math.abs(esperado), escala)
    if (error > resultado.error) resultado = { id, esperado, obtenido, error }
  }
  return resultado
}

async function casosDeEpanet(cantidad: number, semillaInicial: number) {
  const ws = await cargarEpanet()
  const comparaciones: Comparacion[] = []
  const descartadas: RedDescartada[] = []
  for (let semilla = semillaInicial; semilla < semillaInicial + cantidad; semilla++) {
    const red = redDeVerificacion(semilla)
    const modulo = calcularRed(red, { formulacion: 'epanet' })
    if (!modulo.convergio) {
      descartadas.push({ semilla, motivo: 'El módulo no convergió' })
      continue
    }
    if (red.emisores.some((e) => modulo.nodos[e.nodo]!.presionM < PRESION_MINIMA_COMPARABLE_M)) {
      descartadas.push({ semilla, motivo: `Algún emisor trabaja con menos de ${PRESION_MINIMA_COMPARABLE_M} m` })
      continue
    }
    const epanet = resolverEnEpanet(ws, red)
    if (!epanet.convergio) {
      descartadas.push({
        semilla,
        motivo: `EPANET no convergió en ${epanet.iteraciones} iteraciones (error relativo ${epanet.errorRelativo.toExponential(2)})`,
      })
      continue
    }

    const caso = `Red ${semilla} (${red.nodos.length} nodos, ${red.emisores.length} emisores)`
    const fuente = 'EPANET 2.2'
    const presion = peor(
      red.nodos.flatMap((n): [string, number, number][] => [
        [n.id, epanet.presion[n.id]!, modulo.nodos[n.id]!.presionM],
        [`${n.id}, al llegar`, epanet.presionLlegada[n.id]!, modulo.nodos[n.id]!.presionLlegadaM],
      ]),
      PRESION_MINIMA_COMPARABLE_M,
    )
    const tramo = peor(
      red.tramos.map((t): [string, number, number] => [t.id, epanet.caudalTramo[t.id]!, modulo.tramos[t.id]!.caudalLps]),
      ESCALA_CAUDAL_TRAMO_LPS,
    )
    const emisor = peor(
      red.emisores.map((e): [string, number, number] => [
        e.nodo,
        epanet.caudalEmisor[e.nodo]!,
        modulo.nodos[e.nodo]!.caudalEmisorLph!,
      ]),
      ESCALA_CAUDAL_EMISOR_LPH,
    )
    comparaciones.push(
      comparar({
        fuente,
        caso,
        magnitud: `Presión del nodo más desfavorable, ${presion.id} (m)`,
        esperado: presion.esperado,
        obtenido: presion.obtenido,
        escala: PRESION_MINIMA_COMPARABLE_M,
      }),
      comparar({
        fuente,
        caso,
        magnitud: `Caudal del tramo más desfavorable, ${tramo.id} (l/s)`,
        esperado: tramo.esperado,
        obtenido: tramo.obtenido,
        escala: ESCALA_CAUDAL_TRAMO_LPS,
      }),
      comparar({
        fuente,
        caso,
        magnitud: `Caudal del emisor más desfavorable, ${emisor.id} (l/h)`,
        esperado: emisor.esperado,
        obtenido: emisor.obtenido,
        escala: ESCALA_CAUDAL_EMISOR_LPH,
      }),
    )
  }
  return { comparaciones, descartadas }
}

export async function todosLosCasos({ redes = 60, semilla = 1 } = {}) {
  const epanet = await casosDeEpanet(redes, semilla)
  return {
    comparaciones: [...casosDelMetodo(), ...casosDeFao56(), ...epanet.comparaciones],
    redesDescartadas: epanet.descartadas,
    redesProbadas: redes,
  }
}
