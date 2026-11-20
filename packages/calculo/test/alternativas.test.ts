import { describe, expect, it } from 'vitest'
import {
  CLASES_DE_TUBERIA,
  DIAMETROS_INTERNOS_MM,
  analisisDeLaRed,
  cambiosDeLaModificacion,
  descripcionDelDiseno,
  diferenciaDeValor,
  generarRed,
  grupoDelTramo,
  medirModificacion,
  mejoraEnAlgo,
  modificacionesPosibles,
  PERDIDA_CABEZAL_TIPICA_M,
  rasgosDeLaModificacion,
  RASGOS_DE_LA_MODIFICACION,
  SUMERGENCIA_DE_LA_SALIDA_M,
  valorDelDiseno,
  emisorDelCatalogo,
  type CatalogoDePrecios,
  type DisenoAValorar,
} from '../src/index'

// HU0025: lo que el módulo mide de cada red y de cada modificación. El modelo sustituto se entrena con esto y sus
// propuestas se verifican con esto: si aquí se equivoca, se equivocan los dos.

// Precios de prueba en línea: el módulo no lee archivos ni conoce el catálogo de la API.
const PRECIOS: CatalogoDePrecios = {
  version: 'prueba',
  provisional: true,
  fuente: 'Valores de prueba',
  moneda: 'PEN',
  tuberias: DIAMETROS_INTERNOS_MM.flatMap((diametroInternoMm) =>
    CLASES_DE_TUBERIA.map((c) => ({ diametroInternoMm, clase: c.codigo, precioPorM: diametroInternoMm / 10 + c.presionMaximaM / 100 })),
  ),
  emisores: [{ codigo: 'gotero-2', precioUnidad: 0.5 }],
  accesorios: { camaraRompePresion: 1000, valvulaReguladora: 100, cabezal: 2000 },
}

function disenoDePrueba(): DisenoAValorar {
  const emisor = emisorDelCatalogo('gotero-2')
  const cota = (_x: number, y: number) => 3000 + 0.05 * y
  const contorno = [
    { x: 0, y: 0 },
    { x: 80, y: 0 },
    { x: 80, y: 80 },
    { x: 0, y: 80 },
  ].map((p) => ({ ...p, z: cota(p.x, p.y) }))
  const { red, sectores } = generarRed({
    contorno,
    fuente: { x: 40, y: 400, z: 3024, presionInicialM: SUMERGENCIA_DE_LA_SALIDA_M },
    camarasDeLaConduccion: [],
    cotaEn: cota,
    emisor: { caudalNominalLph: emisor.caudalNominalLph, presionNominalM: emisor.presionNominalM, coeficienteK: emisor.coeficienteK, exponenteX: emisor.exponenteX },
    separacionM: 0.3,
    separacionLateralesM: 0.9,
    turnos: 2,
    perdidaCabezalM: PERDIDA_CABEZAL_TIPICA_M.goteo,
  })
  return { red, sectores, presionNominalEmisorM: emisor.presionNominalM, emisor: { codigo: emisor.codigo, coeficienteK: emisor.coeficienteK }, precios: PRECIOS }
}

const diseno = disenoDePrueba()
const analisis = analisisDeLaRed(diseno)
const partida = valorDelDiseno(diseno, analisis)

describe('el valor de un diseño', () => {
  it('el diseño de partida funciona, con uniformidad en porcentaje y costo positivo', () => {
    expect(analisis.funciona).toBe(true)
    expect(partida.funciona).toBe(true)
    expect(partida.costo).toBeGreaterThan(0)
    expect(partida.uniformidad).toBeGreaterThan(0)
    expect(partida.uniformidad).toBeLessThanOrEqual(100)
    expect(partida.margenM).toBeGreaterThan(0)
  })

  it('un diseño frente a sí mismo no gana ni pierde, y no cuenta como mejora', () => {
    const d = diferenciaDeValor(partida, partida)
    expect(d).toEqual({ costoPct: 0, uniformidad: 0, margenM: 0 })
    expect(mejoraEnAlgo(d)).toBe(false)
  })
})

// Recorre y recalcula todas las modificaciones de una red: con el repositorio entero probándose a la vez pasa de 5 s.
describe('las modificaciones posibles', { timeout: 60_000 }, () => {
  const posibles = modificacionesPosibles(diseno.red)

  it('hay de sobra, sin repetir y con el número de rasgos que el modelo espera', () => {
    expect(posibles.length).toBeGreaterThan(10)
    expect(new Set(posibles.map((m) => JSON.stringify(m))).size).toBe(posibles.length)
    const descripcion = descripcionDelDiseno(diseno, analisis, partida)
    for (const m of posibles.slice(0, 20)) expect(rasgosDeLaModificacion(descripcion, m)).toHaveLength(RASGOS_DE_LA_MODIFICACION.length)
  })

  it('solo tocan los tramos del grupo que nombran', () => {
    for (const m of posibles.slice(0, 40)) {
      const grupos = new Set(m.map((a) => a.grupo))
      for (const c of cambiosDeLaModificacion(diseno.red, m)) {
        if (c.tipo === 'tramo') expect(grupos.has(grupoDelTramo(c.tramo))).toBe(true)
      }
    }
  })

  it('no dejan diámetros ni clases fuera del catálogo: la red se sigue pudiendo calcular', () => {
    for (const m of posibles.slice(0, 15)) expect(() => medirModificacion(diseno, partida, m)).not.toThrow()
  })

  it('engrosar la conducción cuesta más y adelgazarla cuesta menos', () => {
    const conduccion = (paso: number) => posibles.find((m) => m.length === 1 && m[0]!.grupo === 'conduccion' && m[0]!.pasosDeDiametro === paso && m[0]!.pasosDeClase === 0)
    const engrosar = conduccion(1)
    const adelgazar = conduccion(-1)
    if (engrosar) expect(medirModificacion(diseno, partida, engrosar).diferencia.costoPct).toBeGreaterThan(0)
    if (adelgazar) expect(medirModificacion(diseno, partida, adelgazar).diferencia.costoPct).toBeLessThan(0)
    expect(engrosar ?? adelgazar).toBeDefined()
  })

  it('la medida de una modificación coincide con calcular la red de cero', () => {
    const m = posibles[0]!
    const medida = medirModificacion(diseno, partida, m)
    const deCero = valorDelDiseno({ ...diseno, red: medida.red })
    expect(medida.valor).toEqual(deCero)
  })
})
