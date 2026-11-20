import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  analisisDeLaRed,
  aplicarCambios,
  CATALOGO_EMISORES,
  cambiosDeLaModificacion,
  generarRed,
  modificacionesPosibles,
  PERDIDA_CABEZAL_TIPICA_M,
  SUMERGENCIA_DE_LA_SALIDA_M,
  type CatalogoDePrecios,
  type DisenoAValorar,
  type Generador,
} from '@riego/calculo'

// Escenarios de ejemplo para el modelo sustituto: parcelas, laderas, fuentes y emisores al azar, con semilla. Cada uno
// queda como un diseño que funciona, porque el paso 7 solo se abre para esos. Algunos llevan un cambio encima, para que
// el modelo no vea solo redes recién generadas.

export const PRECIOS: CatalogoDePrecios = JSON.parse(readFileSync(join(import.meta.dirname, '../../../apps/api/catalogo/precios-provisionales.json'), 'utf8'))

/** Familias de componentes cuyo precio varía el análisis de sensibilidad del contraste. */
export const FAMILIAS_DE_PRECIOS = ['tuberias', 'emisores', 'accesorios'] as const
export type FamiliaDePrecios = (typeof FAMILIAS_DE_PRECIOS)[number]

/**
 * El catálogo con los precios de una familia multiplicados por `factor`: las tuberías; los emisores junto con los
 * laterales de goteo, que los llevan integrados; o los accesorios (cabezal, cámaras y válvulas). El resto no cambia.
 */
export function preciosVariados(familia: FamiliaDePrecios, factor: number, base: CatalogoDePrecios = PRECIOS): CatalogoDePrecios {
  const f = (de: FamiliaDePrecios) => (de === familia ? factor : 1)
  return {
    ...base,
    tuberias: base.tuberias.map((t) => ({ ...t, precioPorM: t.precioPorM * f('tuberias') })),
    emisores: base.emisores.map((e) => ({ ...e, precioUnidad: e.precioUnidad * f('emisores') })),
    lateralesDeGoteo: base.lateralesDeGoteo?.map((m) => ({ ...m, precioPorM: m.precioPorM * f('emisores') })),
    accesorios: {
      camaraRompePresion: base.accesorios.camaraRompePresion * f('accesorios'),
      valvulaReguladora: base.accesorios.valvulaReguladora * f('accesorios'),
      cabezal: base.accesorios.cabezal * f('accesorios'),
    },
  }
}

const CAIDA_ENTRE_CAMARAS_M = 45

export function escenario(azar: Generador): DisenoAValorar | null {
  const lado = azar.real(50, 180)
  const ancho = azar.real(50, 180)
  const pendienteX = azar.real(-0.1, 0.1)
  const pendienteY = azar.real(-0.1, 0.1)
  const cota = (x: number, y: number) => 3000 + pendienteX * x + pendienteY * y
  const contorno = [
    { x: 0, y: 0 },
    { x: lado, y: 0 },
    { x: lado, y: ancho },
    { x: 0, y: ancho },
  ].map((p) => ({ ...p, z: cota(p.x, p.y) }))

  const emisor = azar.elegir(CATALOGO_EMISORES)
  const distancia = azar.real(60, 700)
  const angulo = azar.real(0, 2 * Math.PI)
  const fuenteXY = { x: lado / 2 + distancia * Math.cos(angulo), y: ancho / 2 + distancia * Math.sin(angulo) }
  const piso = emisor.metodo === 'goteo' ? 15 : 30
  const desnivel = azar.real(piso, 110)
  const fuente = { ...fuenteXY, z: cota(lado / 2, ancho / 2) + desnivel, presionInicialM: SUMERGENCIA_DE_LA_SALIDA_M }

  // Las cámaras de la conducción, como las pondría el paso 1: una cada tanto de caída.
  const camaras = []
  for (let n = 1; n * CAIDA_ENTRE_CAMARAS_M < desnivel - 5; n++) {
    const t = (n * CAIDA_ENTRE_CAMARAS_M) / desnivel
    camaras.push({ x: fuente.x + t * (lado / 2 - fuente.x), y: fuente.y + t * (ancho / 2 - fuente.y), z: fuente.z - n * CAIDA_ENTRE_CAMARAS_M })
  }

  const { red, sectores } = generarRed({
    contorno,
    fuente,
    camarasDeLaConduccion: camaras,
    cotaEn: cota,
    emisor: { caudalNominalLph: emisor.caudalNominalLph, presionNominalM: emisor.presionNominalM, coeficienteK: emisor.coeficienteK, exponenteX: emisor.exponenteX },
    separacionM: emisor.separacionM,
    separacionLateralesM: emisor.separacionLateralesM,
    turnos: azar.entero(1, 8),
    perdidaCabezalM: PERDIDA_CABEZAL_TIPICA_M[emisor.metodo],
  })

  let diseno: DisenoAValorar = { red, sectores, presionNominalEmisorM: emisor.presionNominalM, emisor: { codigo: emisor.codigo, coeficienteK: emisor.coeficienteK }, precios: PRECIOS }
  if (!analisisDeLaRed(diseno).funciona) return null
  if (azar.siguiente() < 0.3) {
    const cambiada = aplicarCambios(red, cambiosDeLaModificacion(red, azar.elegir(modificacionesPosibles(red))))
    if (analisisDeLaRed({ ...diseno, red: cambiada }).funciona) diseno = { ...diseno, red: cambiada }
  }
  return diseno
}
