// Alertas del diseño (HU0023). Cada una dice tres cosas: qué tramo o nodo mirar, por qué pasa, y qué cambio
// lo corrige. Las tres juntas, porque una alerta que solo dice «presión insuficiente» deja al estudiante
// donde estaba: es la causa C2, la retroalimentación que llega tarde y sin explicación.
//
// Cuando la corrección es un cambio concreto sobre un tramo, la alerta lo trae en `cambio` para que el
// estudiante pueda aplicarlo y ver el efecto (HU0019), que es el lazo que la aplicación existe para cerrar.

import { VELOCIDAD_MAXIMA, VELOCIDAD_MINIMA } from '../constantes'
import type { Red, ResultadoRed } from './tipos'
import { lugarParaCamara, type PresionDelTramo, type RiegoDelSector } from './operacion'
import { clasePorPresion, diametroVecino } from './tuberias'

export type CodigoDeAlerta =
  | 'no-convergio'
  | 'desnivel-sin-crp'
  | 'tramo-largo'
  | 'clase-excedida'
  | 'velocidad-alta'
  | 'velocidad-baja'
  | 'presion-insuficiente'
  | 'uniformidad-baja'

/**
 * Qué tan grave es lo que la alerta señala:
 * - `impide`: el diseño no se puede poner a funcionar así.
 * - `corrige`: funciona, pero rompe una regla del método y hay que arreglarlo.
 * - `avisa`: funciona y cumple, pero conviene saberlo.
 */
export type Gravedad = 'impide' | 'corrige' | 'avisa'

/**
 * Lo que cada tipo de alerta es, en palabras del campo: un título corto y por qué importa. El panel muestra el título y
 * el dato de cada caso; el porqué queda a un clic, para quien quiera entender sin que el resto lea de más.
 */
export const QUE_ES_LA_ALERTA: Readonly<Record<CodigoDeAlerta, { titulo: string; porQue: string }>> = {
  'no-convergio': {
    titulo: 'El cálculo no cierra',
    porQue: 'Pasa cuando un tubo es tan delgado que la pérdida se dispara, o cuando una válvula no llega a trabajar.',
  },
  'tramo-largo': {
    titulo: 'Tramo demasiado largo',
    porQue: 'El método no deja más de 500 m de tubo seguido: es difícil de revisar y acumula presión.',
  },
  'desnivel-sin-crp': {
    titulo: 'Mucha caída sin cámara',
    porQue: 'Con las válvulas cerradas, toda la columna de agua empuja contra el tubo. Pasados los 50 m, puede reventar.',
  },
  'clase-excedida': {
    titulo: 'El tubo no aguanta la presión',
    porQue: 'Cada clase de tubo aguanta una presión. Si la pasa, el tubo revienta.',
  },
  'velocidad-alta': {
    titulo: 'El agua va muy rápido',
    porQue: 'A más de 3 m/s el tubo vibra y se desgasta, y el agua pierde mucha presión en el camino.',
  },
  'velocidad-baja': {
    titulo: 'El agua va muy lento',
    porQue: 'Tan lenta, la arena que trae el agua se asienta y con el tiempo tapa el tubo.',
  },
  'presion-insuficiente': {
    titulo: 'Les falta presión a los emisores',
    porQue: 'Sin su presión, el emisor echa mucho menos agua que la calculada y esa parte del cultivo pasa sed.',
  },
  'uniformidad-baja': {
    titulo: 'El riego sale disparejo',
    porQue: 'Unas plantas reciben bastante más agua que otras: unas se encharcan y otras pasan sed.',
  },
}

export interface CambioPropuesto {
  tramo: string
  diametroInternoMm?: number
  clase?: string
}

export interface Alerta {
  codigo: CodigoDeAlerta
  gravedad: Gravedad
  tramo?: string
  nodo?: string
  sector?: string
  causa: string
  correccion: string
  /** El cambio que corrige la alerta, cuando es uno concreto que el estudiante puede aplicar. */
  cambio?: CambioPropuesto
  /** El nodo donde una cámara rompe-presión corrige la alerta, cuando se puede poner una. */
  camaraEn?: string
}

const ORDEN: Record<Gravedad, number> = { impide: 0, corrige: 1, avisa: 2 }

const unaCifra = (n: number) => n.toFixed(1)

/** Variación de presión que el método admite dentro de un sector antes de que la uniformidad caiga. */
export const UNIFORMIDAD_MINIMA = 0.9

export interface EntradaDeAlertas {
  red: Red
  /** Un turno por sector, de `regarPorSectores`. */
  turnos: readonly RiegoDelSector[]
  /** La presión máxima de cada tramo, de `presionesMaximas`. */
  presiones: readonly PresionDelTramo[]
  /** Presión a la que el emisor entrega su caudal nominal, m.c.a. */
  presionNominalEmisorM: number
}

/** Lo que impide poner la red a funcionar: no converge o rompe una guarda del método. */
function alertasDelCalculo(red: Red, resultado: ResultadoRed, sector: string): Alerta[] {
  const alertas: Alerta[] = []
  if (!resultado.convergio) {
    alertas.push({
      codigo: 'no-convergio',
      gravedad: 'impide',
      sector,
      causa: `${sector}: no llegó a una solución en ${resultado.iteraciones} pasos.`,
      correccion: 'Engrosa el tubo más cargado del sector.',
    })
  }
  for (const rechazo of resultado.rechazos) {
    if (rechazo.tipo === 'tramo-largo') {
      alertas.push({
        codigo: 'tramo-largo',
        gravedad: 'corrige',
        tramo: rechazo.tramo,
        sector,
        causa: `${rechazo.tramo}: ${unaCifra(rechazo.longitudM)} m (máx. 500 m).`,
        correccion: 'Pártelo en dos.',
      })
    } else {
      const arriba = red.tramos.find((t) => t.hasta === rechazo.nodo)?.desde
      const camaraEn = arriba === undefined ? undefined : lugarParaCamara(red, arriba)
      alertas.push({
        ...(camaraEn === undefined ? {} : { camaraEn }),
        codigo: 'desnivel-sin-crp',
        gravedad: 'corrige',
        nodo: rechazo.nodo,
        sector,
        causa: `${rechazo.nodo}: ${unaCifra(rechazo.desnivelM)} m de caída sin cámara (máx. 50 m).`,
        correccion: `Pon una cámara rompe-presión antes de ${rechazo.nodo}.`,
      })
    }
  }
  return alertas
}

/** La tubería que no aguanta la presión que llega a verse en algún estado de operación. */
function alertasDeClase(red: Red, presiones: readonly PresionDelTramo[]): Alerta[] {
  return presiones
    .filter((p) => !p.cumpleClase)
    .map((p) => {
      const clase = clasePorPresion(p.presionMaximaM)
      const desde = red.tramos.find((t) => t.id === p.tramo)?.desde
      const camaraEn = desde === undefined ? undefined : lugarParaCamara(red, desde)
      const donde = p.estado === 'cerrada' ? 'con todas las válvulas cerradas' : `al regar ${p.estado}`
      return {
        codigo: 'clase-excedida' as const,
        gravedad: 'corrige' as const,
        tramo: p.tramo,
        causa: `${p.tramo}: ${unaCifra(p.presionMaximaM)} m ${donde}; su clase aguanta ${unaCifra(p.claseM ?? 0)} m.`,
        correccion: `Usa clase ${clase.codigo} (aguanta ${clase.presionMaximaM} m)${camaraEn === undefined ? '' : ' o pon una cámara antes'}.`,
        cambio: { tramo: p.tramo, clase: clase.codigo },
        ...(camaraEn === undefined ? {} : { camaraEn }),
      }
    })
}

/**
 * El límite inferior de velocidad se aplica donde pasa todo el caudal del turno. En un lateral el agua se va quedando en
 * los emisores y la velocidad cae hasta cero al final: eso es cómo funciona el lateral, no algo que corregir.
 */
const llevaTodoElCaudal = (caudalLps: number, turno: RiegoDelSector) => caudalLps >= 0.99 * turno.caudalFuenteLps

/** La velocidad fuera del rango del método: encima vibra y desgasta, debajo deja que el sólido sedimente. */
function alertasDeVelocidad(red: Red, turno: RiegoDelSector): Alerta[] {
  const alertas: Alerta[] = []
  for (const tramo of red.tramos) {
    const t = turno.resultado.tramos[tramo.id]
    if (!t || t.caudalLps === 0) continue
    if (t.estadoVelocidad === 'vibracion') {
      const masGordo = diametroVecino(tramo.diametroInternoMm, 'arriba')
      alertas.push({
        codigo: 'velocidad-alta',
        gravedad: 'corrige',
        tramo: tramo.id,
        sector: turno.sector,
        causa: `${tramo.id}: ${unaCifra(t.velocidadMs)} m/s al regar ${turno.sector} (máx. ${VELOCIDAD_MAXIMA} m/s).`,
        correccion:
          masGordo === undefined
            ? 'Ya es el tubo más grueso: agrega un turno para que pase menos agua.'
            : `Usa tubo de ${masGordo} mm.`,
        ...(masGordo === undefined ? {} : { cambio: { tramo: tramo.id, diametroInternoMm: masGordo } }),
      })
    } else if (t.estadoVelocidad === 'sedimentacion' && llevaTodoElCaudal(t.caudalLps, turno)) {
      const masDelgado = diametroVecino(tramo.diametroInternoMm, 'abajo')
      alertas.push({
        codigo: 'velocidad-baja',
        gravedad: 'avisa',
        tramo: tramo.id,
        sector: turno.sector,
        causa: `${tramo.id}: ${t.velocidadMs.toFixed(2)} m/s al regar ${turno.sector} (mín. ${VELOCIDAD_MINIMA} m/s).`,
        correccion:
          masDelgado === undefined
            ? 'Ya es el tubo más delgado: no hay nada que cambiar.'
            : `Usa tubo de ${masDelgado} mm; además ahorras.`,
        ...(masDelgado === undefined ? {} : { cambio: { tramo: tramo.id, diametroInternoMm: masDelgado } }),
      })
    }
  }
  return alertas
}

/** El emisor que recibe menos presión de la que necesita, y el sector que riega desparejo. */
function alertasDelRiego(red: Red, turno: RiegoDelSector, presionNominalM: number): Alerta[] {
  const alertas: Alerta[] = []
  const flojos = red.emisores
    .filter((e) => e.sector === turno.sector)
    .map((e) => ({ nodo: e.nodo, presionM: turno.resultado.nodos[e.nodo]?.presionM ?? 0 }))
    .filter((e) => e.presionM < presionNominalM / 2)
  const peor = flojos.reduce<{ nodo: string; presionM: number } | undefined>(
    (a, b) => (a === undefined || b.presionM < a.presionM ? b : a),
    undefined,
  )
  if (peor) {
    alertas.push({
      codigo: 'presion-insuficiente',
      gravedad: 'impide',
      nodo: peor.nodo,
      sector: turno.sector,
      causa: `${turno.sector}: ${flojos.length} ${flojos.length === 1 ? 'emisor' : 'emisores'} a menos de la mitad de su presión (el peor, ${unaCifra(peor.presionM)} de ${unaCifra(presionNominalM)} m).`,
      correccion: 'Engrosa el tubo que llega al sector. Si no basta, elige en el paso 4 un emisor que pida menos presión.',
    })
  }
  if (turno.uniformidad < UNIFORMIDAD_MINIMA && turno.caudalesLph.length > 0) {
    alertas.push({
      codigo: 'uniformidad-baja',
      gravedad: 'corrige',
      sector: turno.sector,
      causa: `${turno.sector}: ${unaCifra(turno.uniformidad * 100)} % de uniformidad (mín. ${UNIFORMIDAD_MINIMA * 100} %).`,
      correccion: red.emisores.some((e) => e.x > 0.2)
        ? 'En el paso 4 elige el gotero autocompensado: echa lo mismo aunque el terreno suba y baje.'
        : 'Engrosa los laterales del sector o acórtalos.',
    })
  }
  return alertas
}

/**
 * Las alertas del diseño, de la que impide poner la red a funcionar a la que solo conviene saber. Dentro de
 * la misma gravedad quedan en el orden en que se detectan, que es el del recorrido del agua.
 */
export function alertasDelDiseno({ red, turnos, presiones, presionNominalEmisorM }: EntradaDeAlertas): Alerta[] {
  const alertas: Alerta[] = [
    ...alertasDeClase(red, presiones),
    ...turnos.flatMap((turno) => [
      ...alertasDelCalculo(red, turno.resultado, turno.sector),
      ...alertasDeVelocidad(red, turno),
      ...alertasDelRiego(red, turno, presionNominalEmisorM),
    ]),
  ]
  return unaPorTramo(alertas).sort((a, b) => ORDEN[a.gravedad] - ORDEN[b.gravedad])
}

/** Lo que no depende del turno se dice una vez: un tramo lento en todos los turnos es una sola cosa que saber. */
function unaPorTramo(alertas: readonly Alerta[]) {
  const vistas = new Set<string>()
  return alertas.filter((a) => {
    if (a.codigo === 'presion-insuficiente' || a.codigo === 'uniformidad-baja' || a.codigo === 'no-convergio') return true
    const clave = `${a.codigo}:${a.tramo ?? ''}:${a.nodo ?? ''}`
    if (vistas.has(clave)) return false
    vistas.add(clave)
    return true
  })
}

/**
 * El diseño funciona cuando ninguna alerta lo impide ni pide corregirlo: es la condición para pasar al paso 7. Lo que
 * solo conviene saber no lo detiene.
 */
export const disenoFunciona = (alertas: readonly Alerta[]) => alertas.every((a) => a.gravedad === 'avisa')
