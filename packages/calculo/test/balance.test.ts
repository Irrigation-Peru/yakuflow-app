import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { balanceHidrico, FRACCION_MINIMA_DE_AREA } from '../src/agronomia/balance'
import type { SemanaDeCampana } from '../src/agronomia/demanda'

// HU0013: la necesidad del cultivo, semana a semana, contra lo que da la fuente; se marca la semana de mayor demanda
// y se dice si el agua alcanza, alcanza a medias o no alcanza. HU0014: cuando no alcanza, se proponen turnos, un
// reservorio o menos área, y con el ajuste elegido se vuelve a calcular.

// Semanas armadas a mano: con 1 ha y eficiencia 1, cada mm de demanda neta son 10 m³.
const semanas = (mm: number[], dias = 7): SemanaDeCampana[] =>
  mm.map((demandaNetaMm, i) => ({
    semana: i + 1,
    dias,
    etcMm: demandaNetaMm,
    lluviaEfectivaMm: 0,
    demandaNetaMm,
    demandaNetaM3Ha: demandaNetaMm * 10,
  }))

// 1 l/s durante 10 h al día: 36 m³ al día, 252 m³ a la semana.
const manantial = { tipo: 'manantial' as const, caudalLps: 1, horasDisponiblesDia: 10 }
const canal = { ...manantial, tipo: 'canal' as const }
const base = { areaHa: 1, eficiencia: 1 }

describe('balance hídrico semanal', () => {
  it('compara la necesidad bruta de cada semana con lo que da la fuente', () => {
    const b = balanceHidrico({ ...base, eficiencia: 0.8, semanas: semanas([8, 20]), fuente: manantial })
    expect(b.semanas[0]).toMatchObject({ semana: 1, ofertaM3: 252, cubre: true })
    expect(b.semanas[0]!.necesidadM3).toBeCloseTo(100, 12)
    expect(b.semanas[1]!.necesidadM3).toBeCloseTo(250, 12)
    // En l/s durante las horas de agua: 250 m³ / (3.6 · 10 h · 7 días).
    expect(b.semanas[1]!.necesidadLps).toBeCloseTo(250 / 252, 12)
    expect(b.caudalLps).toBe(1)
  })

  it('la semana crítica es la de mayor necesidad diaria, aunque la última sea corta', () => {
    const corta = [...semanas([10, 20]), { ...semanas([18])[0]!, semana: 3, dias: 5 }]
    const b = balanceHidrico({ ...base, semanas: corta, fuente: manantial })
    expect(b.semanaCritica).toBe(3)
    expect(b.necesidadPicoLps).toBeCloseTo(180 / (3.6 * 10 * 5), 12)
  })

  it('si la fuente cubre todas las semanas, alcanza', () => {
    const b = balanceHidrico({ ...base, semanas: semanas([10, 20, 25]), fuente: manantial })
    expect(b.alcanza).toBe('si')
    expect(b.semanasSinCubrir).toEqual([])
  })

  describe('cuando no alcanza (HU0014)', () => {
    // Necesidad: 100, 200, 300, 300 y 100 m³; la fuente da 252 a la semana.
    // Saldo: +152, +52, −48, −48, +152. Acumulado: 152, 204, 156, 108, 260.
    const b = balanceHidrico({ ...base, semanas: semanas([10, 20, 30, 30, 10]), fuente: manantial })

    it('alcanza a medias y dice qué semanas faltan', () => {
      expect(b.alcanza).toBe('parcial')
      expect(b.semanasSinCubrir).toEqual([3, 4])
    })

    it('reservorio: lo que sobra al principio cubre lo que falta después; el volumen es la mayor caída del acumulado', () => {
      expect(b.ajustes.reservorio).toEqual({ viable: true, volumenM3: 96 })
    })

    it('menos área: la que la fuente cubre en la semana crítica', () => {
      expect(b.ajustes.menosArea.viable).toBe(true)
      expect(b.ajustes.menosArea.areaHa).toBeCloseTo(252 / 300, 12)
    })

    it('turnos: con un manantial se riega por sectores más horas al día', () => {
      // 300 m³ en 7 días son 42.9 m³ al día; cada turno de 10 h da 36: hacen falta 2 turnos, 20 h.
      expect(b.ajustes.turnos).toEqual({ viable: true, turnos: 2, horasDeRiegoPorDia: 20, areaPorTurnoHa: 0.5, turnosMaximos: 2 })
    })

    it('turnos: en un día caben tantos como turnos de la fuente entran en 24 h, para que el estudiante pueda pedir más', () => {
      const conHoraYMedia = balanceHidrico({ ...base, semanas: semanas([10, 20, 30, 30, 10]), fuente: { ...manantial, horasDisponiblesDia: 1.5 } })
      expect(conHoraYMedia.ajustes.turnos.viable && conHoraYMedia.ajustes.turnos.turnosMaximos).toBe(16)
    })

    it('con un canal no hay turnos: el agua llega solo en sus horas', () => {
      const conCanal = balanceHidrico({ ...base, semanas: semanas([10, 20, 30, 30, 10]), fuente: canal })
      expect(conCanal.ajustes.turnos).toEqual({ viable: false, motivo: 'fuente_por_horas' })
    })

    it('con agua todo el día tampoco: ya no hay más horas', () => {
      const todoElDia = balanceHidrico({
        ...base,
        semanas: semanas([10, 20, 30, 70, 10]),
        fuente: { ...manantial, horasDisponiblesDia: 24 },
      })
      expect(todoElDia.ajustes.turnos).toEqual({ viable: false, motivo: 'sin_horas_libres' })
    })
  })

  it('el reservorio no sirve si falta agua desde la primera semana: empieza vacío', () => {
    const b = balanceHidrico({ ...base, semanas: semanas([30, 10]), fuente: canal })
    expect(b.ajustes.reservorio).toEqual({ viable: false, motivo: 'deficit_sin_reserva_previa' })
  })

  it('menos área deja de ser salida si hay que regar menos de la mitad de la parcela', () => {
    expect(FRACCION_MINIMA_DE_AREA).toBe(0.5)
    // La semana crítica pide 600 m³ y la fuente da 252: solo 0.42 ha.
    const b = balanceHidrico({ ...base, semanas: semanas([60, 60]), fuente: canal })
    expect(b.ajustes.menosArea.viable).toBe(false)
    expect(b.ajustes.menosArea.areaHa).toBeCloseTo(0.42, 12)
    expect(b.alcanza).toBe('no')
  })

  describe('con el ajuste aplicado se vuelve a calcular', () => {
    const datos = { ...base, semanas: semanas([10, 20, 30, 30, 10]), fuente: manantial }

    it('con el reservorio, lo almacenado nunca baja de cero', () => {
      const b = balanceHidrico({ ...datos, ajuste: { tipo: 'reservorio', volumenM3: 96 } })
      expect(b.semanas.map((s) => s.almacenadoM3)).toEqual([96, 96, 48, 0, 96])
      expect(b.alcanza).toBe('si')
    })

    it('con un reservorio más chico, falta', () => {
      const b = balanceHidrico({ ...datos, ajuste: { tipo: 'reservorio', volumenM3: 50 } })
      expect(b.alcanza).not.toBe('si')
      expect(b.semanasSinCubrir).toEqual([4])
    })

    it('con menos área', () => {
      const b = balanceHidrico({ ...datos, ajuste: { tipo: 'menos_area', areaHa: 0.84 } })
      expect(b.areaHa).toBe(0.84)
      expect(b.alcanza).toBe('si')
    })

    it('con turnos', () => {
      const b = balanceHidrico({ ...datos, ajuste: { tipo: 'turnos', turnos: 2 } })
      expect(b.horasDeRiegoPorDia).toBe(20)
      expect(b.semanas[2]!.ofertaM3).toBe(504)
      expect(b.alcanza).toBe('si')
    })
  })

  // Lo que el módulo propone tiene que funcionar al aplicarlo tal cual, también con números que no son redondos: el
  // reservorio justo y el área máxima quedan al filo, y el redondeo no puede dejar una semana sin cubrir.
  it('cada ajuste viable que propone, aplicado tal cual, cubre todas las semanas', () => {
    const demanda = fc.array(fc.double({ min: 0, max: 60, noNaN: true }), { minLength: 1, maxLength: 30 })
    const fuente = fc.record({
      tipo: fc.constantFrom('manantial' as const, 'canal' as const),
      caudalLps: fc.double({ min: 0.05, max: 20, noNaN: true }),
      horasDisponiblesDia: fc.double({ min: 1, max: 24, noNaN: true }),
    })
    const plantea = fc.record({
      areaHa: fc.double({ min: 0.1, max: 10, noNaN: true }),
      eficiencia: fc.double({ min: 0.5, max: 1, noNaN: true }),
    })
    fc.assert(
      fc.property(demanda, fuente, plantea, (mm, f, p) => {
        const datos = { ...p, semanas: semanas(mm), fuente: f }
        const { ajustes } = balanceHidrico(datos)
        if (ajustes.reservorio.viable) {
          expect(balanceHidrico({ ...datos, ajuste: { tipo: 'reservorio', volumenM3: ajustes.reservorio.volumenM3 } }).alcanza).toBe('si')
        }
        if (ajustes.menosArea.viable) {
          expect(balanceHidrico({ ...datos, ajuste: { tipo: 'menos_area', areaHa: ajustes.menosArea.areaHa } }).alcanza).toBe('si')
        }
        if (ajustes.turnos.viable) {
          expect(balanceHidrico({ ...datos, ajuste: { tipo: 'turnos', turnos: ajustes.turnos.turnos } }).alcanza).toBe('si')
        }
      }),
      { numRuns: 2000 },
    )
  })
})
