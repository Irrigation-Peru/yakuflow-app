// Las modificaciones que se le pueden hacer a una red que ya funciona y cómo se miden (HU0025, HU0026). El modelo
// sustituto aprende sobre estas mismas descripciones y el navegador las usa para preguntarle: por eso viven en el módulo,
// igual en el entrenamiento y en la aplicación. Una modificación cambia grupos enteros de tubería, que es como se decide
// en campo, y no se aplica nunca sin pasar por el cálculo.

import { analisisDeLaRed, type AnalisisDeLaRed } from './red-del-proyecto'
import { aplicarCambios, type CambioDeRed } from './operacion'
import { claseDelTramo, presupuestoDeLaRed, type CatalogoDePrecios } from './presupuesto'
import type { Red, Tramo } from './tipos'
import { CLASES_DE_TUBERIA, DIAMETROS_INTERNOS_MM } from './tuberias'

export const GRUPOS_DE_TUBERIA = ['conduccion', 'portalateral', 'valvulas', 'laterales'] as const
export type GrupoDeTuberia = (typeof GRUPOS_DE_TUBERIA)[number]

export function grupoDelTramo(id: string): GrupoDeTuberia {
  if (id.startsWith('conduccion')) return 'conduccion'
  if (id.startsWith('m')) return 'portalateral'
  // El tramo de la válvula única a la entrada del cabezal es parte de la conducción, no de las válvulas de los laterales.
  if (id === 'vc') return 'conduccion'
  if (id.startsWith('v')) return 'valvulas'
  return 'laterales'
}

export interface AccionSobreUnGrupo {
  grupo: GrupoDeTuberia
  /** Cuántos diámetros del catálogo sube o baja todo el grupo. */
  pasosDeDiametro: number
  /** Cuántas clases sube o baja todo el grupo. */
  pasosDeClase: number
}

/** Una o dos acciones sobre grupos distintos. */
export type Modificacion = readonly AccionSobreUnGrupo[]

const PASOS_DE_DIAMETRO = [-2, -1, 1, 2]
const PASOS_DE_CLASE = [-1, 1]

const ACCIONES: readonly AccionSobreUnGrupo[] = GRUPOS_DE_TUBERIA.flatMap((grupo) => [
  ...PASOS_DE_DIAMETRO.map((pasosDeDiametro) => ({ grupo, pasosDeDiametro, pasosDeClase: 0 })),
  ...PASOS_DE_CLASE.map((pasosDeClase) => ({ grupo, pasosDeDiametro: 0, pasosDeClase })),
])

const conLimites = (i: number, largo: number) => Math.max(0, Math.min(largo - 1, i))

function cambioDelTramo(tramo: Tramo, accion: AccionSobreUnGrupo): CambioDeRed | null {
  const iDiametro = DIAMETROS_INTERNOS_MM.indexOf(tramo.diametroInternoMm)
  const diametro = iDiametro < 0 ? tramo.diametroInternoMm : DIAMETROS_INTERNOS_MM[conLimites(iDiametro + accion.pasosDeDiametro, DIAMETROS_INTERNOS_MM.length)]!
  const claseActual = claseDelTramo(tramo.presionMaximaM)
  const iClase = CLASES_DE_TUBERIA.findIndex((c) => c.codigo === claseActual)
  const clase = CLASES_DE_TUBERIA[conLimites(iClase + accion.pasosDeClase, CLASES_DE_TUBERIA.length)]!.codigo
  if (diametro === tramo.diametroInternoMm && clase === claseActual) return null
  return {
    tipo: 'tramo',
    tramo: tramo.id,
    ...(diametro === tramo.diametroInternoMm ? {} : { diametroInternoMm: diametro }),
    ...(clase === claseActual ? {} : { clase }),
  }
}

/** Los cambios tramo por tramo de una modificación. Vacío si el catálogo no da para más. */
export function cambiosDeLaModificacion(red: Red, modificacion: Modificacion): CambioDeRed[] {
  return modificacion.flatMap((accion) =>
    red.tramos.filter((t) => grupoDelTramo(t.id) === accion.grupo).flatMap((t) => cambioDelTramo(t, accion) ?? []),
  )
}

/** Todas las modificaciones de una o dos acciones que de verdad cambian algo en esta red. */
export function modificacionesPosibles(red: Red): Modificacion[] {
  const solas = ACCIONES.filter((a) => cambiosDeLaModificacion(red, [a]).length > 0)
  const pares = solas.flatMap((a, i) => solas.slice(i + 1).filter((b) => b.grupo !== a.grupo).map((b): Modificacion => [a, b]))
  return [...solas.map((a): Modificacion => [a]), ...pares]
}

export interface ValorDelDiseno {
  /** Costo referencial con el catálogo de precios. */
  costo: number
  /** Uniformidad del sector más desparejo, en puntos de 0 a 100. */
  uniformidad: number
  /** Lo que sobra de presión en el punto más ajustado, m: en el emisor más flojo o en el tubo más exigido. */
  margenM: number
  funciona: boolean
}

export interface DisenoAValorar {
  red: Red
  sectores: readonly string[]
  presionNominalEmisorM: number
  emisor: { codigo: string; coeficienteK: number }
  precios: CatalogoDePrecios
}

/** Los tres criterios con que se comparan dos diseños (HU0025, criterio 1). */
export function valorDelDiseno(d: DisenoAValorar, analisis: AnalisisDeLaRed = analisisDeLaRed(d)): ValorDelDiseno {
  const presionesDeEmisor = analisis.turnos.flatMap((t) => d.red.emisores.filter((e) => e.sector === t.sector).map((e) => t.resultado.nodos[e.nodo]?.presionM ?? 0))
  const enElEmisor = Math.min(...presionesDeEmisor) - d.presionNominalEmisorM / 2
  const enElTubo = Math.min(...analisis.presiones.map((p) => (p.claseM ?? Infinity) - p.presionMaximaM))
  return {
    costo: presupuestoDeLaRed(d).total,
    uniformidad: Math.min(...analisis.turnos.map((t) => t.uniformidad)) * 100,
    margenM: Math.min(enElEmisor, enElTubo),
    funciona: analisis.funciona,
  }
}

export interface DiferenciaDeValor {
  /** Porcentaje sobre el costo de partida: negativo es más barato. */
  costoPct: number
  uniformidad: number
  margenM: number
}

export const diferenciaDeValor = (partida: ValorDelDiseno, otro: ValorDelDiseno): DiferenciaDeValor => ({
  costoPct: partida.costo === 0 ? 0 : ((otro.costo - partida.costo) / partida.costo) * 100,
  uniformidad: otro.uniformidad - partida.uniformidad,
  margenM: otro.margenM - partida.margenM,
})

// Por debajo de esto, un cambio no se lee como una mejora.
export const MEJORA_MINIMA: DiferenciaDeValor = { costoPct: -0.5, uniformidad: 0.1, margenM: 0.1 }

export const mejoraEnAlgo = (d: DiferenciaDeValor) => d.costoPct <= MEJORA_MINIMA.costoPct || d.uniformidad >= MEJORA_MINIMA.uniformidad || d.margenM >= MEJORA_MINIMA.margenM

/** Los nombres de los rasgos, en el orden en que los recibe el modelo. */
export const RASGOS_DE_LA_MODIFICACION: readonly string[] = [
  'costo',
  'uniformidad',
  'margenM',
  'caudalMaximoLps',
  'turnos',
  'presionNominalM',
  'exponenteEmisor',
  ...GRUPOS_DE_TUBERIA.flatMap((g) => ['longitudM', 'diametroMm', 'velocidadMaximaMs', 'perdidaM', 'holguraDeClaseM', 'presionMaximaM', 'pasosDeDiametro', 'pasosDeClase'].map((r) => `${g}_${r}`)),
]

/** Lo que el modelo necesita saber del diseño, sin la modificación: se calcula una vez por red. */
export function descripcionDelDiseno(d: DisenoAValorar, analisis: AnalisisDeLaRed, valor: ValorDelDiseno) {
  const grupos = new Map(GRUPOS_DE_TUBERIA.map((g) => [g, { longitudM: 0, volumen: 0, velocidadMaximaMs: 0, perdidaM: 0, holguraDeClaseM: Infinity, presionMaximaM: 0 }]))
  const porTramo = new Map(d.red.tramos.map((t) => [t.id, t]))
  const porId = new Map(d.red.nodos.map((n) => [n.id, n]))
  for (const t of d.red.tramos) {
    const g = grupos.get(grupoDelTramo(t.id))!
    const a = porId.get(t.desde)
    const b = porId.get(t.hasta)
    if (!a || !b) continue
    const largo = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    g.longitudM += largo
    g.volumen += largo * t.diametroInternoMm
  }
  for (const turno of analisis.turnos) {
    for (const t of Object.values(turno.resultado.tramos)) {
      const g = grupos.get(grupoDelTramo(t.id))!
      g.velocidadMaximaMs = Math.max(g.velocidadMaximaMs, t.velocidadMs)
      g.perdidaM = Math.max(g.perdidaM, t.perdidaFriccionM + t.perdidaLocalM)
    }
  }
  for (const p of analisis.presiones) {
    if (!porTramo.has(p.tramo)) continue
    const g = grupos.get(grupoDelTramo(p.tramo))!
    g.presionMaximaM = Math.max(g.presionMaximaM, p.presionMaximaM)
    g.holguraDeClaseM = Math.min(g.holguraDeClaseM, (p.claseM ?? Infinity) - p.presionMaximaM)
  }
  const emisor = d.red.emisores[0]
  return {
    generales: [valor.costo, valor.uniformidad, valor.margenM, Math.max(...analisis.turnos.map((t) => t.caudalFuenteLps)), d.sectores.length, d.presionNominalEmisorM, emisor?.x ?? 0],
    porGrupo: GRUPOS_DE_TUBERIA.map((nombre) => {
      const g = grupos.get(nombre)!
      return [g.longitudM, g.longitudM > 0 ? g.volumen / g.longitudM : 0, g.velocidadMaximaMs, g.perdidaM, Number.isFinite(g.holguraDeClaseM) ? g.holguraDeClaseM : 0, g.presionMaximaM]
    }),
  }
}

export type DescripcionDelDiseno = ReturnType<typeof descripcionDelDiseno>

/** La fila que recibe el modelo para una modificación de un diseño. */
export function rasgosDeLaModificacion(descripcion: DescripcionDelDiseno, modificacion: Modificacion): number[] {
  return [
    ...descripcion.generales,
    ...GRUPOS_DE_TUBERIA.flatMap((grupo, i) => {
      const accion = modificacion.find((a) => a.grupo === grupo)
      return [...descripcion.porGrupo[i]!, accion?.pasosDeDiametro ?? 0, accion?.pasosDeClase ?? 0]
    }),
  ]
}

/** Aplica una modificación y la mide con el módulo. Es lo que tiene la última palabra sobre cualquier propuesta. */
export function medirModificacion(d: DisenoAValorar, partida: ValorDelDiseno, modificacion: Modificacion) {
  const cambios = cambiosDeLaModificacion(d.red, modificacion)
  const red = aplicarCambios(d.red, cambios)
  const analisis = analisisDeLaRed({ ...d, red })
  const valor = valorDelDiseno({ ...d, red }, analisis)
  return { cambios, red, analisis, valor, diferencia: diferenciaDeValor(partida, valor) }
}
