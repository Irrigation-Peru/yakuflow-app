import { describe, expect, it } from 'vitest'
import { coeficienteDeCultivo, duracionDelCiclo, etapaDelDia, type Cultivo } from '../src/agronomia/cultivo'
import { CATALOGO_FAO56 } from '../src/agronomia/catalogo-fao56'
import { demandaDeLaCampana, type ClimaMensual } from '../src/agronomia/demanda'
import { lluviaEfectivaMensual } from '../src/agronomia/lluvia'

// HU0002: la demanda de agua sale del cultivo y del clima, no del enunciado. Criterio 1, el coeficiente de cultivo
// de cada etapa según el FAO 56; criterio 2, la lluvia efectiva descontada de la demanda; criterio 3, la semana de
// mayor demanda como base del diseño.

// Ejemplo 28 del Estudio FAO Riego y Drenaje N.º 56: frijol seco en el sur de Idaho.
const frijol: Cultivo = {
  nombre: 'Frijol seco (FAO 56, ejemplo 28)',
  etapas: { inicial: 25, desarrollo: 25, media: 30, final: 20 },
  kc: { inicial: 0.15, media: 1.19, final: 0.35 },
  profundidadRadicularM: { minima: 0.6, maxima: 0.9 },
  fraccionAgotamiento: 0.45,
}

describe('coeficiente de cultivo por día (FAO 56, ecuación 66)', () => {
  it('reproduce el ejemplo 28 del FAO 56', () => {
    // El libro redondea a dos decimales: 0.15, 0.77, 1.19 y 0.56. Sin redondear, el día 40 da 0.774.
    expect(coeficienteDeCultivo(frijol, 20)).toBe(0.15)
    expect(coeficienteDeCultivo(frijol, 40)).toBeCloseTo(0.774, 14)
    expect(coeficienteDeCultivo(frijol, 70)).toBe(1.19)
    expect(coeficienteDeCultivo(frijol, 95)).toBeCloseTo(0.56, 14)
  })

  it('es continuo en el cambio de etapa', () => {
    expect(coeficienteDeCultivo(frijol, 25)).toBe(0.15)
    expect(coeficienteDeCultivo(frijol, 50)).toBeCloseTo(1.19, 14)
    expect(coeficienteDeCultivo(frijol, 100)).toBeCloseTo(0.35, 14)
  })

  it('nombra la etapa de cada día', () => {
    expect([1, 26, 51, 81].map((d) => etapaDelDia(frijol, d))).toEqual(['inicial', 'desarrollo', 'media', 'final'])
    expect(duracionDelCiclo(frijol)).toBe(100)
  })

  it('no define el coeficiente fuera del ciclo', () => {
    expect(() => coeficienteDeCultivo(frijol, 0)).toThrow(/ciclo/)
    expect(() => coeficienteDeCultivo(frijol, 101)).toThrow(/ciclo/)
  })
})

describe('catálogo provisional del FAO 56', () => {
  it('cada cultivo tiene sus cuatro etapas, sus coeficientes y su fuente', () => {
    expect(CATALOGO_FAO56.length).toBeGreaterThan(0)
    for (const c of CATALOGO_FAO56) {
      expect(duracionDelCiclo(c)).toBeGreaterThan(0)
      expect(c.kc.media).toBeGreaterThan(c.kc.inicial)
      expect(c.profundidadRadicularM.maxima).toBeGreaterThanOrEqual(c.profundidadRadicularM.minima)
      expect(c.fuente).toMatch(/FAO 56/)
    }
  })

  it('la papa lleva los valores de las tablas 12 (con su nota 4, ciclo largo con el follaje muerto) y 22', () => {
    const papa = CATALOGO_FAO56.find((c) => c.nombre === 'Papa')!
    expect(papa.kc).toEqual({ inicial: 0.5, media: 1.15, final: 0.4 })
    expect(papa.maduracion).toEqual({ corteDelRiegoDias: 15 })
    expect(papa.profundidadRadicularM).toEqual({ minima: 0.4, maxima: 0.6 })
    expect(papa.fraccionAgotamiento).toBe(0.35)
  })

  it('el maíz dura lo que en la sierra según la ENA 2024, en la proporción de la fila de altura de África oriental de la tabla 11, y lleva las tablas 12 y 22', () => {
    const maiz = CATALOGO_FAO56.find((c) => c.nombre === 'Maíz, grano')!
    // 7,11 meses de la siembra a la cosecha: 216 días, repartidos como los 30, 50, 60 y 40 de la fila de 180.
    expect(maiz.etapas).toEqual({ inicial: 36, desarrollo: 60, media: 72, final: 48 })
    expect(maiz.kc).toEqual({ inicial: 0.3, media: 1.2, final: 0.35 })
    expect(maiz.profundidadRadicularM).toEqual({ minima: 1.0, maxima: 1.7 })
    expect(maiz.fraccionAgotamiento).toBe(0.55)
  })

  // HU0011 y HU0012: para sugerir un cultivo y decir qué condición no cumple, cada uno lleva sus requisitos.
  it('cada cultivo lleva sus requisitos, con rangos ordenados y su fuente', () => {
    for (const c of CATALOGO_FAO56) {
      const r = c.requisitos!
      expect(r, c.nombre).toBeDefined()
      for (const rango of [r.temperaturaMediaC, r.ph]) {
        expect(rango.minimo).toBeLessThanOrEqual(rango.optimoMinimo)
        expect(rango.optimoMinimo).toBeLessThanOrEqual(rango.optimoMaximo)
        expect(rango.optimoMaximo).toBeLessThanOrEqual(rango.maximo)
      }
      for (const t of r.texturas.optimas) expect(r.texturas.posibles).toContain(t)
      expect(r.metodos.length).toBeGreaterThan(0)
      expect(r.fuente).toMatch(/ECOCROP/)
    }
  })

  it('la papa: altitud de los Andes, salinidad del FAO 56 y temperaturas de ECOCROP', () => {
    const r = CATALOGO_FAO56.find((c) => c.nombre === 'Papa')!.requisitos!
    expect(r.altitudMaximaM).toBe(4200)
    expect(r.salinidad).toEqual({ umbralDsM: 1.7, perdidaPctPorDsM: 12 })
    expect(r.temperaturaMediaC).toEqual({ minimo: 7, optimoMinimo: 15, optimoMaximo: 25, maximo: 30 })
    expect(r.temperaturaLetalC).toBe(0)
  })
})

describe('lluvia efectiva (método del Servicio de Conservación de Suelos, como en CROPWAT)', () => {
  it('descuenta una parte de la lluvia del mes', () => {
    // 100 · (125 − 0.2 · 100) / 125
    expect(lluviaEfectivaMensual(100)).toBeCloseTo(84, 12)
    expect(lluviaEfectivaMensual(0)).toBe(0)
  })

  it('sobre 250 mm al mes solo suma una décima parte', () => {
    expect(lluviaEfectivaMensual(250)).toBeCloseTo(150, 12)
    expect(lluviaEfectivaMensual(300)).toBeCloseTo(155, 12)
  })

  it('no admite lluvia negativa', () => {
    expect(() => lluviaEfectivaMensual(-1)).toThrow(/lluvia/)
  })
})

describe('demanda de agua de la campaña', () => {
  // Valores esperados calculados aparte, en Python, con las mismas ecuaciones escritas de nuevo.
  const cultivo: Cultivo = {
    nombre: 'Prueba',
    etapas: { inicial: 10, desarrollo: 10, media: 10, final: 10 },
    kc: { inicial: 0.4, media: 1.2, final: 0.6 },
    profundidadRadicularM: { minima: 0.5, maxima: 0.5 },
    fraccionAgotamiento: 0.4,
  }
  const clima: ClimaMensual[] = Array.from({ length: 12 }, () => ({ et0MmDia: 0, lluviaMm: 0 }))
  clima[2] = { et0MmDia: 3.5, lluviaMm: 120 } // marzo
  clima[3] = { et0MmDia: 4.2, lluviaMm: 40 } // abril
  clima[4] = { et0MmDia: 4.8, lluviaMm: 0 } // mayo
  const d = demandaDeLaCampana({ cultivo, fechaSiembra: '2027-03-25', clima })

  it('arma un día por cada día del ciclo, con su fecha', () => {
    expect(d.dias).toHaveLength(40)
    expect(d.dias[0]!.fecha).toBe('2027-03-25')
    expect(d.dias[7]!.fecha).toBe('2027-04-01')
    expect(d.dias[39]!.fecha).toBe('2027-05-03')
  })

  it('la demanda del cultivo sale del clima del mes y del coeficiente del día', () => {
    expect(d.dias[14]!.kc).toBeCloseTo(0.8, 14)
    expect(d.dias[14]!.etcMm).toBeCloseTo(3.36, 12)
    expect(d.dias[29]!.etcMm).toBeCloseTo(5.04, 12)
  })

  it('descuenta la lluvia efectiva repartida en los días del mes, sin bajar de cero', () => {
    // Marzo: 120 mm → 105.6 mm efectivos / 31 días
    expect(d.dias[0]!.lluviaEfectivaMm).toBeCloseTo(3.1277419354838707, 12)
    expect(d.dias[0]!.demandaNetaMm).toBe(0)
    expect(d.dias[7]!.demandaNetaMm).toBeCloseTo(0.432, 12)
  })

  it('suma la demanda por semana, en mm y en m³ por hectárea', () => {
    expect(d.semanas.map((s) => s.dias)).toEqual([7, 7, 7, 7, 7, 5])
    expect(d.semanas[3]!.demandaNetaMm).toBeCloseTo(26.544, 11)
    expect(d.semanas[3]!.demandaNetaM3Ha).toBeCloseTo(265.44, 10)
    expect(d.totalNetaMm).toBeCloseTo(91.008, 11)
    expect(d.totalNetaM3Ha).toBeCloseTo(910.08, 10)
  })

  it('marca la semana de mayor demanda y su demanda diaria, que es la base del diseño', () => {
    expect(d.semanaCritica).toBe(4)
    expect(d.demandaNetaPicoMmDia).toBeCloseTo(3.792, 12)
    expect(d.etcPicoMmDia).toBeCloseTo(5.04, 12)
    expect(d.etapaCritica).toBe('media')
  })

  it('exige el clima de los doce meses y una fecha válida', () => {
    expect(() => demandaDeLaCampana({ cultivo, fechaSiembra: '2027-03-25', clima: clima.slice(0, 11) })).toThrow(/doce/)
    expect(() => demandaDeLaCampana({ cultivo, fechaSiembra: '2027-02-30', clima })).toThrow(/fecha/)
  })
})
