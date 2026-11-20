import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CATALOGO_FAO56, demandaDeLaCampana, disenoDelRiego, emisorDelCatalogo, planDeRiegoPorEtapa, type ClimaMensual, type DiaDeCampana, type Etapa } from '../src/index'

const dia = (n: number, etapa: Etapa, demandaNetaMm: number): DiaDeCampana => ({
  dia: n,
  fecha: `2027-01-${String(n).padStart(2, '0')}`,
  etapa,
  kc: 1,
  etcMm: demandaNetaMm,
  lluviaEfectivaMm: 0,
  necesidadPlenaMm: demandaNetaMm,
  demandaNetaMm,
  riego: 'pleno',
})

describe('el plan de riego por etapa (HU0028)', () => {
  it('cada etapa ajusta la frecuencia, no la lámina', () => {
    const [inicial, media] = planDeRiegoPorEtapa({
      dias: [dia(1, 'inicial', 2), dia(2, 'inicial', 2), dia(3, 'media', 5), dia(4, 'media', 5)],
      laminaNetaMm: 10,
    })
    expect(inicial).toMatchObject({ etapa: 'inicial', desde: '2027-01-01', hasta: '2027-01-02', dias: 2, intervaloDias: 5, riegos: 1, aguaNetaMm: 4 })
    expect(media).toMatchObject({ etapa: 'media', intervaloDias: 2, riegos: 1, aguaNetaMm: 10 })
  })

  it('si el cultivo no consume, no hay riego', () => {
    expect(planDeRiegoPorEtapa({ dias: [dia(1, 'inicial', 0), dia(2, 'inicial', 0)], laminaNetaMm: 10 })[0]).toMatchObject({ intervaloDias: null, riegos: 0 })
  })

  it('si la lluvia de un año normal cubre la etapa, el riego queda para las rachas secas, al ritmo de lo que consume', () => {
    // Consume 3 mm/día y llueve lo mismo: un año normal no pide riegos, pero si no llueve hay que regar cada 3 días.
    // Antes se dividía la lámina entre la demanda que deja la lluvia media y salían intervalos de meses.
    const conLluvia = (n: number) => ({ ...dia(n, 'desarrollo', 0), etcMm: 3, lluviaEfectivaMm: 3 })
    const [etapa] = planDeRiegoPorEtapa({ dias: [conLluvia(1), conLluvia(2), conLluvia(3)], laminaNetaMm: 10 })
    expect(etapa).toMatchObject({ intervaloDias: 3, riegos: 0, soloSiNoLlueve: true, consumoMedioMmDia: 3, lluviaEfectivaMediaMmDia: 3 })
  })

  it('con poco consumo se mantiene la frecuencia del diseño y el riego dura menos; nunca se riega menos seguido', () => {
    // El diseño riega cada 3 días 10 mm en 2 h. Una etapa que consume 1 mm/día se riega igual cada 3 días, con 3 mm en 0.6 h:
    // antes se estiraba el intervalo a 10 días, y en una plántula salían meses.
    const [poco] = planDeRiegoPorEtapa({ dias: [dia(1, 'inicial', 1), dia(2, 'inicial', 1)], laminaNetaMm: 10, intervaloDeDisenoDias: 3, tiempoDeRiegoDelDisenoH: 2 })
    expect(poco).toMatchObject({ intervaloDias: 3, laminaNetaMm: 3 })
    expect(poco!.tiempoDeRiegoH).toBeCloseTo(0.6, 12)
  })

  it('si la raíz aún es corta y no guarda el agua del intervalo, se riega más seguido', () => {
    // 20 mm por metro de raíz y 0.2 m de raíz: 4 mm por riego. Con 2 mm/día, cada 2 días aunque el diseño diga 3.
    const raiz = { aguaFacilMmPorM: 20, profundidadMaximaM: 1, diaDeRaizMaxima: 100 }
    const [etapa] = planDeRiegoPorEtapa({ dias: [dia(1, 'inicial', 2), dia(2, 'inicial', 2)], laminaNetaMm: 10, intervaloDeDisenoDias: 3, raiz })
    expect(etapa!.intervaloDias).toBe(2)
    expect(etapa!.laminaNetaMm).toBeCloseTo(4, 1)
  })

  it('una lámina que no es positiva no da un plan', () => {
    expect(() => planDeRiegoPorEtapa({ dias: [dia(1, 'inicial', 1)], laminaNetaMm: 0 })).toThrow()
  })

  it('los riegos del plan siempre cubren lo que el cultivo pide, sin sobrar más de un riego', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 12, noNaN: true }), { minLength: 1, maxLength: 28 }), fc.double({ min: 1, max: 60, noNaN: true }), (demandas, laminaNetaMm) => {
        const [etapa] = planDeRiegoPorEtapa({ dias: demandas.map((d, i) => dia(i + 1, 'media', d)), laminaNetaMm })
        const pedido = demandas.reduce((a, b) => a + b, 0)
        expect(etapa!.riegos * etapa!.laminaNetaMm).toBeGreaterThanOrEqual(pedido - 1e-9)
        if (etapa!.riegos > 0) expect((etapa!.riegos - 1) * etapa!.laminaNetaMm).toBeLessThan(pedido + 1e-9)
      }),
    )
  })

  it('con un diseño de verdad, ninguna etapa se riega menos seguido que lo que el diseño fijó para el pico (CE8)', () => {
    const clima: ClimaMensual[] = Array.from({ length: 12 }, (_, i) => ({ et0MmDia: 3 + (i % 3), lluviaMm: i % 4 === 0 ? 80 : 5 }))
    const cultivo = CATALOGO_FAO56.find((c) => c.nombre === 'Papa')!
    const demanda = demandaDeLaCampana({ cultivo, fechaSiembra: '2027-10-01', clima })
    const diseno = disenoDelRiego({
      cultivo,
      metodo: 'goteo',
      emisor: emisorDelCatalogo('gotero-2'),
      separacionM: 0.3,
      separacionLateralesM: 0.9,
      demanda,
      suelo: { clase: 'franco', capacidadDeCampo: 0.3, puntoDeMarchitez: 0.15, infiltracionBasicaMmH: 13 },
      areaHa: 1,
      horasDeRiegoPorDia: 12,
      fuente: { caudalLps: 5 },
    })
    const plan = planDeRiegoPorEtapa({ dias: demanda.dias, laminaNetaMm: diseno.laminaNetaMm, intervaloDeDisenoDias: diseno.intervaloDias })
    expect(plan.map((e) => e.dias).reduce((a, b) => a + b, 0)).toBe(demanda.dias.length)
    for (const etapa of plan) if (etapa.intervaloDias !== null) expect(etapa.intervaloDias).toBeLessThanOrEqual(diseno.intervaloDias)
  })
})
