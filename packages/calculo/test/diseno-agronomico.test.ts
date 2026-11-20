import { describe, expect, it } from 'vitest'
import { disenoAgronomico, EFICIENCIA_APLICACION, INTERVALO_PROPUESTO_GOTEO_DIAS, metodoMasEficiente } from '../src/agronomia/diseno-agronomico'

// HU0002: la lámina, la frecuencia, el tiempo de riego y los turnos, a partir de la demanda de la semana de mayor
// demanda (criterio 3).

// Caso calculado a mano. Goteo, 2 ha, demanda neta de la semana crítica de 4 mm/día, 20 mm de agua
// fácilmente aprovechable, gotero de 2 l/h cada 0.30 m en laterales cada 1 m, 12 horas de riego al día y una fuente
// de 3 l/s.
const goteo = disenoAgronomico({
  metodo: 'goteo',
  demandaNetaPicoMmDia: 4,
  aguaFacilmenteAprovechableMm: 20,
  // El intervalo máximo, a mano: el que se propone en goteo es de tres días (la prueba siguiente).
  intervaloDias: 5,
  emisor: { caudalLph: 2, separacionM: 0.3, separacionLateralesM: 1 },
  areaHa: 2,
  horasDeRiegoPorDia: 12,
  fuente: { caudalLps: 3 },
})

// Las 2 ha regadas a la vez: 20 000 m² / 0.30 m² = 66 667 goteros · 2 l/h = 37.04 l/s.
const caudalDeTodaLaParcelaLps = ((20000 / 0.3) * 2) / 3600

describe('diseño agronómico por goteo', () => {
  it('toma la eficiencia de aplicación del método', () => {
    expect(goteo.eficiencia).toBe(EFICIENCIA_APLICACION.goteo)
  })

  it('el intervalo máximo es el agua fácilmente aprovechable entre la demanda diaria', () => {
    expect(goteo.intervaloMaximoDias).toBe(5)
    expect(goteo.intervaloDias).toBe(5)
  })

  it('sin intervalo elegido, el goteo propone regar cada tres días como mucho: es riego de alta frecuencia', () => {
    const base = { demandaNetaPicoMmDia: 4, emisor: { caudalLph: 2, separacionM: 0.3, separacionLateralesM: 1 }, areaHa: 2, horasDeRiegoPorDia: 12, fuente: { caudalLps: 3 } }
    expect(disenoAgronomico({ ...base, metodo: 'goteo', aguaFacilmenteAprovechableMm: 20 }).intervaloDias).toBe(INTERVALO_PROPUESTO_GOTEO_DIAS)
    // Si el suelo guarda menos, manda el suelo.
    expect(disenoAgronomico({ ...base, metodo: 'goteo', aguaFacilmenteAprovechableMm: 8 }).intervaloDias).toBe(2)
    // La aspersión sigue con el máximo que el suelo permite, si un turno cabe en las horas de un día.
    const aspersor = { caudalLph: 800, separacionM: 12, separacionLateralesM: 12 }
    expect(disenoAgronomico({ ...base, emisor: aspersor, metodo: 'aspersion', aguaFacilmenteAprovechableMm: 40 }).intervaloDias).toBe(10)
  })

  it('el intervalo propuesto deja que cada turno se riegue dentro de las horas de agua de un día', () => {
    // Cebada en el valle de Pasco: el suelo guarda 132 mm y permitiría regar cada 43 días, con turnos de 31.6 h. Con el
    // aspersor de 5.56 mm/h, 12 h de agua y 75 % de eficiencia, un turno repone a lo más 50 mm: cada 16 días.
    const aspersor = { caudalLph: 800, separacionM: 12, separacionLateralesM: 12 }
    const r = disenoAgronomico({ metodo: 'aspersion', demandaNetaPicoMmDia: 3.06, aguaFacilmenteAprovechableMm: 131.8, emisor: aspersor, areaHa: 1, horasDeRiegoPorDia: 12, fuente: { caudalLps: 2 } })
    expect(r.intervaloMaximoDias).toBe(43)
    expect(r.intervaloDias).toBe(16)
    expect(r.tiempoDeRiegoH).toBeLessThanOrEqual(12)
  })

  it('la lámina neta repone la demanda del intervalo y la bruta suma lo que se pierde al aplicarla', () => {
    expect(goteo.laminaNetaMm).toBeCloseTo(20, 12)
    expect(goteo.laminaBrutaMm).toBeCloseTo(20 / 0.9, 12)
  })

  it('el tiempo de riego sale de la intensidad del emisor', () => {
    // 2 l/h / (0.30 m · 1 m) = 6.667 mm/h; 22.22 mm / 6.667 mm/h = 3.333 h
    expect(goteo.intensidadMmH).toBeCloseTo(2 / 0.3, 12)
    expect(goteo.tiempoDeRiegoH).toBeCloseTo(10 / 3, 12)
  })

  it('caben a lo más los turnos enteros de cada día por los días del intervalo: ningún día pasa de sus horas de agua', () => {
    // En 12 h caben 3 turnos de 3.333 h (10 h); en 5 días, 15. Contar las 60 h juntas daba 18, y algún día habría tenido
    // 4 turnos: 13.3 h con 12 de agua.
    expect(goteo.turnosPorDia).toBe(3)
    expect(goteo.turnosMaximos).toBe(15)
    expect(goteo.turnosPorDia * goteo.tiempoDeRiegoH).toBeLessThanOrEqual(12)
  })

  it('los turnos son los menos que la fuente alimenta: ninguno lleva más caudal que el de la fuente', () => {
    // 37.04 l/s / 3 l/s = 12.3: hacen falta 13 turnos.
    expect(goteo.caudalDisponibleLps).toBe(3)
    expect(goteo.turnos).toBe(13)
    expect(goteo.areaPorTurnoHa).toBeCloseTo(2 / 13, 12)
  })

  it('el caudal de diseño es el de los emisores de un turno', () => {
    // 0.1538 ha / 0.30 m² = 5128 goteros · 2 l/h = 2.849 l/s
    expect(goteo.emisoresPorTurno).toBeCloseTo(20000 / 13 / 0.3, 9)
    expect(goteo.caudalDeDisenoLps).toBeCloseTo(caudalDeTodaLaParcelaLps / 13, 12)
    expect(goteo.caudalDeDisenoLps).toBeLessThanOrEqual(3)
  })

  it('no hay estrés con el intervalo máximo', () => {
    expect(goteo.estres).toBe(false)
  })
})

describe('decisiones del estudiante y casos límite', () => {
  const base = {
    metodo: 'goteo' as const,
    demandaNetaPicoMmDia: 4,
    aguaFacilmenteAprovechableMm: 20,
    emisor: { caudalLph: 2, separacionM: 0.3, separacionLateralesM: 1 },
    areaHa: 2,
    horasDeRiegoPorDia: 12,
    fuente: { caudalLps: 3 },
    // Los casos de abajo están hechos a mano con el intervalo máximo, 5 días.
    intervaloDias: 5,
  }

  it('un intervalo más corto baja la lámina y el tiempo de riego', () => {
    const diario = disenoAgronomico({ ...base, intervaloDias: 1 })
    expect(diario.laminaNetaMm).toBeCloseTo(4, 12)
    expect(diario.tiempoDeRiegoH).toBeCloseTo(4 / 0.9 / (2 / 0.3), 12)
  })

  it('un intervalo mayor que el máximo deja al cultivo en estrés', () => {
    expect(disenoAgronomico({ ...base, intervaloDias: 6 }).estres).toBe(true)
  })

  it('si el agua fácilmente aprovechable no alcanza para un día, se riega a diario', () => {
    const r = disenoAgronomico({ ...base, aguaFacilmenteAprovechableMm: 3 })
    expect(r.intervaloMaximoDias).toBe(1)
  })

  it('si el tiempo de riego no cabe en las horas disponibles, no hay turnos ni caudal de diseño', () => {
    // Riego diario: 4 mm / 0.9 / 6.667 mm/h = 0.667 h, que no cabe en media hora
    const r = disenoAgronomico({ ...base, horasDeRiegoPorDia: 0.5, intervaloDias: 1 })
    expect(r.turnosMaximos).toBe(0)
    expect(r.turnos).toBe(0)
    expect(r.caudalDeDisenoLps).toBeUndefined()
  })

  it('con una fuente que alcanza para toda la parcela, se riega en un solo turno', () => {
    const r = disenoAgronomico({ ...base, fuente: { caudalLps: 40 } })
    expect(r.turnos).toBe(1)
    expect(r.caudalDeDisenoLps).toBeCloseTo(caudalDeTodaLaParcelaLps, 12)
  })

  it('si la fuente no alcanza a regar todos los turnos en el intervalo, no hay turnos ni caudal de diseño', () => {
    // Con 1 l/s harían falta 38 turnos y en los 5 días caben 15.
    const r = disenoAgronomico({ ...base, fuente: { caudalLps: 1 } })
    expect(r.turnosNecesarios).toBe(38)
    expect(r.turnosMaximos).toBe(15)
    expect(r.turnos).toBe(0)
    expect(r.caudalDeDisenoLps).toBeUndefined()
    // 38 turnos en 5 días son 8 algún día: 26.7 h de riego, y hay 12.
    expect(r.horasDeRiegoNecesariasPorDia).toBeCloseTo((8 * 10) / 3, 12)
  })

  it('las horas de riego del día más cargado: 13 turnos en 5 días son 3 algún día, 10 h, y caben en las 12', () => {
    expect(goteo.horasDeRiegoNecesariasPorDia).toBeCloseTo((3 * 10) / 3, 12)
    expect(goteo.horasDeRiegoNecesariasPorDia).toBeLessThanOrEqual(12)
  })

  it('con el agua al filo, alcanza en papel pero los turnos enteros piden más horas de las que hay', () => {
    // 2 l/s por 12.5 h dan 90 m³ al día y la parcela pide 88.9: alcanza. Pero 37.04 / 2 = 18.5 pide 19 turnos de
    // 3.333 h; en 12.5 h caben 3 por día, 15 en los 5 días.
    const r = disenoAgronomico({ ...base, horasDeRiegoPorDia: 12.5, fuente: { caudalLps: 2 } })
    expect(2 * 3.6 * 12.5).toBeGreaterThan((2 * 4 * 10) / 0.9)
    expect(r.turnosNecesarios).toBe(19)
    expect(r.turnosMaximos).toBe(15)
    expect(r.turnos).toBe(0)
    expect(r.horasDeRiegoNecesariasPorDia).toBeCloseTo((4 * 10) / 3, 12)
  })

  it('el reservorio entrega lo que guarda mientras riega un turno: la red puede llevar más que la fuente', () => {
    // 36 m³ en 3.333 h son 3 l/s más; con 1 l/s de la fuente, 4 l/s: 37.04 / 4 = 9.3, hacen falta 10 turnos.
    const r = disenoAgronomico({ ...base, fuente: { caudalLps: 1, reservorioM3: 36 } })
    expect(r.caudalDisponibleLps).toBeCloseTo(4, 12)
    expect(r.turnos).toBe(10)
    expect(r.caudalDeDisenoLps).toBeCloseTo(caudalDeTodaLaParcelaLps / 10, 12)
  })
})

describe('diseño agronómico por aspersión', () => {
  const aspersion = disenoAgronomico({
    metodo: 'aspersion',
    demandaNetaPicoMmDia: 4,
    aguaFacilmenteAprovechableMm: 30,
    emisor: { caudalLph: 1000, separacionM: 12, separacionLateralesM: 12 },
    areaHa: 1,
    horasDeRiegoPorDia: 10,
    fuente: { caudalLps: 3 },
    infiltracionBasicaMmH: 5,
  })

  it('usa la eficiencia de la aspersión', () => {
    expect(aspersion.eficiencia).toBe(EFICIENCIA_APLICACION.aspersion)
  })

  it('el agua escurre si la intensidad supera la infiltración del suelo', () => {
    // 1000 l/h / 144 m² = 6.94 mm/h > 5 mm/h
    expect(aspersion.intensidadMmH).toBeCloseTo(1000 / 144, 12)
    expect(aspersion.escurre).toBe(true)
  })

  it('sin infiltración medida no se afirma nada sobre el escurrimiento', () => {
    expect(goteo.escurre).toBeUndefined()
  })
})

describe('método más eficiente que admite el cultivo', () => {
  it('el goteo si el cultivo lo admite; si no, la aspersión', () => {
    expect(metodoMasEficiente(['aspersion', 'goteo'])).toBe('goteo')
    expect(metodoMasEficiente(['aspersion'])).toBe('aspersion')
    expect(() => metodoMasEficiente([])).toThrow(/método/)
  })
})
