import { describe, expect, it } from 'vitest'
import { aptitudDelCultivo, INDICE_DE_RIESGO_ALTO, type Condicion, type EvaluacionDeCondicion, type LugarDelCultivo } from '../src/agronomia/aptitud'
import { CATALOGO_FAO56 } from '../src/agronomia/catalogo-fao56'
import { climaDeLosDoceMeses, type NormalDelMes } from '../src/agronomia/clima'
import { duracionDelCiclo } from '../src/agronomia/cultivo'
import { demandaDeLaCampana } from '../src/agronomia/demanda'
import { mejorFechaDeSiembra } from '../src/agronomia/rasgos'

// HU0011 y HU0012: cada cultivo se compara con el lugar condición por condición. De cada una se dice el valor de la
// parcela, el rango que el cultivo pide y si queda en el óptimo, en el margen o fuera. La fecha de siembra decide
// qué meses caen en la campaña, y con ellos la temperatura y la helada.

const cultivo = (nombre: string) => CATALOGO_FAO56.find((c) => c.nombre === nombre)!
const papa = cultivo('Papa')

const mes = (temperaturaMaximaC: number, temperaturaMinimaC: number, lluviaMm = 0): NormalDelMes => ({
  temperaturaMaximaC,
  temperaturaMinimaC,
  humedadRelativaMediaPct: 70,
  vientoA2mMs: 2,
  radiacionSolarMJm2Dia: 18,
  lluviaMm,
})

function lugar({
  normales = Array.from({ length: 12 }, () => mes(24, 12)),
  altitudM = 3000,
  ...cambios
}: Partial<LugarDelCultivo> = {}): LugarDelCultivo {
  return {
    altitudM,
    normales,
    clima: climaDeLosDoceMeses({ latitudGrados: -10.7, altitudM, meses: normales }),
    suelo: { clase: 'franco', ph: 5.5 },
    fuente: { caudalLps: 10, horasDisponiblesDia: 24, conductividadDsM: 0.5 },
    areaHa: 1,
    ...cambios,
  }
}

const condicion = <C extends Condicion>(r: ReturnType<typeof aptitudDelCultivo>, nombre: C) =>
  r.condiciones.find((c): c is Extract<EvaluacionDeCondicion, { condicion: C }> => c.condicion === nombre)

describe('aptitud del cultivo para el lugar y la fecha de siembra', () => {
  it('con todo en el óptimo, la papa es óptima en las siete condiciones', () => {
    const r = aptitudDelCultivo({ cultivo: papa, fechaSiembra: '2027-10-01', lugar: lugar() })
    expect(r.condiciones.map((c) => c.condicion)).toEqual(['altitud', 'temperatura', 'helada', 'ph', 'textura', 'salinidad', 'agua'])
    expect(r.condiciones.every((c) => c.nivel === 'optima')).toBe(true)
    expect(r.nivel).toBe('optima')
    expect(r.indice).toBe(1)
    expect(r.limitante).toBeNull()
  })

  it('una temperatura entre el mínimo y el óptimo resta en proporción', () => {
    // Media de 11 °C: la papa pide de 7 a 30 y rinde bien de 15 a 25 → (11 − 7) / (15 − 7) = 0.5.
    const r = aptitudDelCultivo({
      cultivo: papa,
      fechaSiembra: '2027-10-01',
      lugar: lugar({ normales: Array.from({ length: 12 }, () => mes(16, 6)) }),
    })
    expect(condicion(r, 'temperatura')).toMatchObject({ nivel: 'marginal', indice: 0.5, valorC: 11 })
    expect(r.nivel).toBe('marginal')
    expect(r.indice).toBe(0.5)
    expect(r.limitante).toBe('temperatura')
  })

  it('sobre la altitud habitual el cultivo no queda fuera: queda con riesgo alto, al final del orden', () => {
    // La ENA 2024 registra papa cosechada hasta 4 517 m: el límite de altitud advierte, no descarta.
    const r = aptitudDelCultivo({ cultivo: papa, fechaSiembra: '2027-10-01', lugar: lugar({ altitudM: 4300 }) })
    expect(condicion(r, 'altitud')).toMatchObject({ nivel: 'marginal', indice: INDICE_DE_RIESGO_ALTO, valorM: 4300, maximoM: 4200 })
    expect(r.nivel).toBe('marginal')
    expect(r.indice).toBeLessThanOrEqual(INDICE_DE_RIESGO_ALTO)
    expect(r.indice).toBeLessThan(0.5)
  })

  it('la helada: bajo la temperatura letal, riesgo alto; a menos de 4 °C sobre ella, en el margen', () => {
    const conMinima = (minima: number) =>
      aptitudDelCultivo({
        cultivo: papa,
        fechaSiembra: '2027-10-01',
        lugar: lugar({ normales: Array.from({ length: 12 }, () => mes(36 - minima, minima)) }),
      })
    expect(condicion(conMinima(-1), 'helada')).toMatchObject({ nivel: 'marginal', indice: INDICE_DE_RIESGO_ALTO, minimaC: -1, letalC: 0 })
    expect(condicion(conMinima(2), 'helada')).toMatchObject({ nivel: 'marginal', minimaC: 2 })
    expect(condicion(conMinima(4), 'helada')).toMatchObject({ nivel: 'optima' })
  })

  it('sin temperatura letal conocida, la helada no se evalúa', () => {
    const r = aptitudDelCultivo({ cultivo: cultivo('Haba, grano seco'), fechaSiembra: '2027-10-01', lugar: lugar() })
    expect(condicion(r, 'helada')).toBeUndefined()
  })

  it('la fecha de siembra decide la helada: la papa de octubre se salva, la de mayo corre un riesgo alto', () => {
    // Un valle de la sierra: noches de helada de mayo a agosto.
    const minimas = [6, 6, 6, 4, -1, -2, -3, -2, 2, 4, 5, 6]
    const normales = minimas.map((m) => mes(20, m))
    const octubre = aptitudDelCultivo({ cultivo: papa, fechaSiembra: '2027-10-01', lugar: lugar({ normales }) })
    const mayo = aptitudDelCultivo({ cultivo: papa, fechaSiembra: '2027-05-01', lugar: lugar({ normales }) })
    expect(condicion(octubre, 'helada')).toMatchObject({ nivel: 'optima', minimaC: 4 })
    expect(condicion(mayo, 'helada')).toMatchObject({ nivel: 'marginal', indice: INDICE_DE_RIESGO_ALTO, minimaC: -3 })
    expect(mejorFechaDeSiembra({ cultivo: papa, lugar: lugar({ normales }) }).indice).toBeGreaterThan(INDICE_DE_RIESGO_ALTO)
  })

  it('lo que es incompatible en cualquier lugar sigue dejando el cultivo fuera: la papa con una media sobre 30 °C, por calor', () => {
    // Un llano cálido a 200 m: 38 °C de máxima y 26 °C de mínima todo el año, sin helada ni altitud que pesen.
    const selva = lugar({ altitudM: 200, normales: Array.from({ length: 12 }, () => mes(38, 26)) })
    const r = aptitudDelCultivo({ cultivo: papa, fechaSiembra: '2027-05-01', lugar: selva })
    expect(condicion(r, 'temperatura')).toMatchObject({ nivel: 'fuera', indice: 0 })
    expect(r.nivel).toBe('fuera')
    expect(aptitudDelCultivo({ cultivo: cultivo('Maíz, grano'), fechaSiembra: '2027-05-01', lugar: selva }).nivel).not.toBe('fuera')
  })

  it('la temperatura de la campaña es la media de sus días', () => {
    // Siembra el 1 de diciembre: los 31 días de diciembre a 12 °C y el resto del ciclo, de enero en adelante, a 10 °C.
    const normales = Array.from({ length: 12 }, (_, i) => (i === 11 ? mes(18, 6) : mes(16, 4)))
    const r = aptitudDelCultivo({ cultivo: papa, fechaSiembra: '2027-12-01', lugar: lugar({ normales }) })
    const dias = duracionDelCiclo(papa)
    expect(condicion(r, 'temperatura')!.valorC).toBeCloseTo((31 * 12 + (dias - 31) * 10) / dias, 12)
  })

  it('la salinidad del agua se lleva al suelo con ECe = 1.5 · ECa y resta según la tabla 23 del FAO 56', () => {
    const conAgua = (conductividadDsM: number | null, nombre = 'Papa') =>
      aptitudDelCultivo({
        cultivo: cultivo(nombre),
        fechaSiembra: '2027-10-01',
        lugar: lugar({ fuente: { caudalLps: 10, horasDisponiblesDia: 24, conductividadDsM } }),
      })
    // 2 dS/m en el agua → 3 en el suelo; la papa pierde 12 % por cada dS/m sobre 1.7 → 15.6 %.
    const r = condicion(conAgua(2), 'salinidad')!
    expect(r).toMatchObject({ nivel: 'marginal', salinidadDelSueloDsM: 3, umbralDsM: 1.7 })
    expect(r.perdidaPct).toBeCloseTo(15.6, 12)
    expect(r.indice).toBeCloseTo(0.844, 12)
    // Con 4 dS/m pierde más de la mitad: fuera.
    expect(condicion(conAgua(4), 'salinidad')!.nivel).toBe('fuera')
    // La avena no tiene pérdida conocida: pasar el umbral la deja fuera.
    expect(condicion(conAgua(3, 'Avena'), 'salinidad')!.nivel).toBe('fuera')
    // Sin la conductividad medida, no se evalúa.
    expect(condicion(conAgua(null), 'salinidad')).toBeUndefined()
  })

  it('la textura fuera de la óptima queda en el margen', () => {
    const r = aptitudDelCultivo({ cultivo: papa, fechaSiembra: '2027-10-01', lugar: lugar({ suelo: { clase: 'arcilla', ph: 5.5 } }) })
    expect(condicion(r, 'textura')).toMatchObject({ nivel: 'marginal', indice: 0.5, clase: 'arcilla', gruesa: 'pesada' })
  })

  it('sin pH del suelo, el pH no se evalúa', () => {
    const r = aptitudDelCultivo({ cultivo: papa, fechaSiembra: '2027-10-01', lugar: lugar({ suelo: { clase: 'franco' } }) })
    expect(condicion(r, 'ph')).toBeUndefined()
  })

  it('el agua: la fuente contra la demanda bruta de la semana crítica, con el método más eficiente del cultivo', () => {
    const sitio = lugar({ fuente: { caudalLps: 0.5, horasDisponiblesDia: 12, conductividadDsM: 0.5 }, areaHa: 2 })
    const ofertaMmDia = (0.5 * 3.6 * 12) / (2 * 10)
    for (const [nombre, eficiencia] of [['Papa', 0.9], ['Cebada', 0.75]] as const) {
      const c = cultivo(nombre)
      const { demandaNetaPicoMmDia } = demandaDeLaCampana({ cultivo: c, fechaSiembra: '2027-10-01', clima: sitio.clima })
      const r = condicion(aptitudDelCultivo({ cultivo: c, fechaSiembra: '2027-10-01', lugar: sitio }), 'agua')!
      expect(r.ofertaMmDia).toBeCloseTo(ofertaMmDia, 12)
      expect(r.necesidadMmDia).toBeCloseTo(demandaNetaPicoMmDia / eficiencia, 12)
      expect(r.nivel).toBe('marginal')
      expect(r.indice).toBeCloseTo(ofertaMmDia / (demandaNetaPicoMmDia / eficiencia), 12)
    }
  })
})
