import { describe, expect, it } from 'vitest'
import {
  aptitudDelCultivo,
  balanceHidrico,
  CATALOGO_FAO56,
  climaDeLosDoceMeses,
  coeficienteDeCultivo,
  demandaDeLaCampana,
  disenoDelRiego,
  duracionDelCiclo,
  eficienciaDelBalance,
  emisorDelCatalogo,
  mejorFechaDeSiembra,
  planDeRiegoPorEtapa,
  sueloDeLaTextura,
  emisorRecomendado,
  FRACCION_MINIMA_DE_AREA,
  eficienciaDelMetodo,
  demandaDeDiseno,
  INDICE_DE_RIESGO_ALTO,
  metodosDelCultivo,
  type AjusteDelBalance,
  type Cultivo,
  type LugarDelCultivo,
} from '../src/index'
import { LUGARES_REALES, type LugarReal } from './datos/lugares-reales'

// El flujo de la campaña con los datos reales de cinco lugares de Pasco y Junín (test/datos/lugares-reales.ts), en
// vez de un clima inventado. Nacen de una observación del asesor sobre un caso de papa sembrada el 1 de enero en
// Cerro de Pasco: la aplicación decía que el cultivo pedía más agua en la semana 18, ya en la maduración, cuando la papa
// ya casi no aprovecha el agua. La necesidad subía porque en mayo se acaban las lluvias, no porque el cultivo
// consumiera más. Estas pruebas fijan lo agronómicamente coherente en todos los lugares, cultivos y fechas.

const EPS = 1e-9
const cultivo = (nombre: string) => CATALOGO_FAO56.find((c) => c.nombre === nombre)!

function lugarDe(l: LugarReal): LugarDelCultivo {
  const suelo = sueloDeLaTextura(l.suelo)
  return {
    altitudM: l.altitudM,
    normales: l.normales,
    clima: climaDeLosDoceMeses({ latitudGrados: l.centroide.lat, altitudM: l.altitudM, meses: l.normales }),
    suelo: { clase: suelo.clase, ph: l.suelo.ph },
    fuente: l.fuente,
    areaHa: l.areaHa,
  }
}

const LUGARES = Object.entries(LUGARES_REALES).map(([clave, l]) => ({ clave, l, lugar: lugarDe(l) }))
const SIEMBRAS = Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, '0')}-01`)
const etapaDeLaSemana = (d: ReturnType<typeof demandaDeLaCampana>, semana: number) => {
  const s = d.semanas[semana - 1]!
  return d.dias[(semana - 1) * 7 + Math.floor(s.dias / 2)]!.etapa
}

describe('los datos reales se leen igual que en la aplicación', () => {
  it.each(LUGARES)('$l.nombre: la ET0 de las normales es la que la aplicación guardó', ({ l, lugar }) => {
    lugar.clima.forEach((mes, i) => expect(mes.et0MmDia).toBeCloseTo(l.et0MmDia[i]!, 3))
  })
})

describe('la papa del caso observado: Cerro de Pasco, sembrada el 1 de enero', () => {
  // El asesor lo vio con el ciclo de 145 días de la tabla 11, cuando la semana 18 ya caía en la maduración. Con los 193
  // días que dura la papa en la sierra según la ENA 2024, la maduración empieza el 3 de junio y esa semana es la 23.
  const papa = cultivo('Papa')
  const { lugar } = LUGARES.find((x) => x.clave === 'cerroDePasco')!
  const d = demandaDeLaCampana({ cultivo: papa, fechaSiembra: '2027-01-01', clima: lugar.clima })
  const pico = d.demandaNetaPicoMmDia

  it('la semana crítica no cae en la maduración', () => {
    expect(d.semanaCritica).not.toBe(23)
    expect(['desarrollo', 'media']).toContain(d.etapaCritica)
  })

  it('la semana 23 necesitaría más que la crítica solo porque se acaban las lluvias, y el cultivo consume menos que en la etapa media', () => {
    const s23 = d.semanas[22]!
    const critica = d.semanas[d.semanaCritica - 1]!
    expect(etapaDeLaSemana(d, 23)).toBe('final')
    expect(s23.necesidadPlenaMm! / s23.dias).toBeGreaterThan(pico)
    expect(s23.etcMm / s23.dias).toBeLessThan(critica.etcMm / critica.dias)
    expect(s23.lluviaEfectivaMm / s23.dias).toBeLessThan(critica.lluviaEfectivaMm / critica.dias)
  })

  it('en la maduración se riega a lo más como en la semana crítica', () => {
    const s23 = d.semanas[22]!
    expect(s23.demandaNetaMm / s23.dias).toBeLessThanOrEqual(pico + EPS)
    for (const dia of d.dias.filter((x) => x.etapa === 'final')) expect(dia.demandaNetaMm).toBeLessThanOrEqual(pico + EPS)
  })

  it('la semana crítica ya trae un día de la maduración, y ese día se riega con la demanda de la propia semana', () => {
    // La semana 22 va del 28 de mayo al 3 de junio. Si el tope se tomara de la semana sin recortar, quedaría sobre ella.
    const desde = (d.semanaCritica - 1) * 7
    const ultimo = d.dias[desde + d.semanas[d.semanaCritica - 1]!.dias - 1]!
    expect(d.semanaCritica).toBe(22)
    expect(ultimo).toMatchObject({ fecha: '2027-06-03', etapa: 'final', riego: 'limitado' })
    expect(ultimo.necesidadPlenaMm).toBeGreaterThan(pico)
    expect(ultimo.demandaNetaMm).toBeCloseTo(pico, 10)
  })

  it('el último riego es el 27 de junio, quince días antes de la cosecha del 12 de julio, y después no se riega', () => {
    expect(duracionDelCiclo(papa)).toBe(193)
    expect(d.dias.at(-1)!.fecha).toBe('2027-07-12')
    expect(d.maduracion).toMatchObject({ ultimoRiego: '2027-06-27', corteDelRiegoDias: 15 })
    const despues = d.dias.filter((x) => x.fecha > '2027-06-27')
    expect(despues).toHaveLength(15)
    expect(despues.every((x) => x.demandaNetaMm === 0 && x.riego === 'suspendido')).toBe(true)
  })

  it('el Kc baja en la maduración hasta 0.40 (FAO 56, tabla 12, nota 4)', () => {
    expect(coeficienteDeCultivo(papa, 193)).toBeCloseTo(0.4, 12)
    expect(coeficienteDeCultivo(papa, 153)).toBeCloseTo(1.15, 12)
  })

  it('el balance y el plan de riego del informe usan la misma semana crítica y el mismo corte', () => {
    const b = balanceHidrico({
      semanas: d.semanas,
      areaHa: lugar.areaHa,
      eficiencia: eficienciaDelBalance(papa),
      fuente: { tipo: 'manantial', ...lugar.fuente },
    })
    expect(b.semanaCritica).toBe(d.semanaCritica)
    const plan = planDeRiegoPorEtapa({ dias: d.dias, laminaNetaMm: 10 })
    const final = plan.find((e) => e.etapa === 'final')!
    expect(final.ultimoRiego).toBe('2027-06-27')
    expect(plan.filter((e) => e.etapa !== 'final').every((e) => e.ultimoRiego === undefined)).toBe(true)
  })
})

describe('cinco lugares reales, los ocho cultivos y los doce meses de siembra', () => {
  const casos = LUGARES.flatMap(({ l, lugar }) =>
    CATALOGO_FAO56.flatMap((c) => SIEMBRAS.map((fecha) => ({ nombre: `${l.nombre} · ${c.nombre} · ${fecha}`, c, fecha, lugar }))),
  )

  it('son 480 campañas: cinco lugares, ocho cultivos y doce fechas', () => expect(casos).toHaveLength(480))

  it('en la papa y los granos secos la semana crítica nunca cae en la maduración', () => {
    const malas = casos
      .filter(({ c }) => c.maduracion)
      .map(({ nombre, c, fecha, lugar }) => ({ nombre, d: demandaDeLaCampana({ cultivo: c, fechaSiembra: fecha, clima: lugar.clima }) }))
      .filter(({ d }) => d.demandaNetaPicoMmDia > 0 && etapaDeLaSemana(d, d.semanaCritica) === 'final')
      .map(({ nombre }) => nombre)
    expect(malas).toEqual([])
  })

  it('en la maduración nunca se riega más que en la semana crítica, y nada después del corte', () => {
    for (const { c, fecha, lugar } of casos.filter((x) => x.c.maduracion)) {
      const d = demandaDeLaCampana({ cultivo: c, fechaSiembra: fecha, clima: lugar.clima })
      const corte = duracionDelCiclo(c) - c.maduracion!.corteDelRiegoDias
      for (const dia of d.dias.filter((x) => x.etapa === 'final')) {
        expect(dia.demandaNetaMm).toBeLessThanOrEqual(d.demandaNetaPicoMmDia + EPS)
        if (dia.dia > corte) expect(dia.demandaNetaMm).toBe(0)
      }
    }
  })

  it('lo que se riega nunca pasa de lo que el cultivo necesita, y el déficit declarado es la diferencia', () => {
    for (const { c, fecha, lugar } of casos) {
      const d = demandaDeLaCampana({ cultivo: c, fechaSiembra: fecha, clima: lugar.clima })
      for (const dia of d.dias) expect(dia.demandaNetaMm).toBeLessThanOrEqual(dia.necesidadPlenaMm + EPS)
      const pleno = d.dias.reduce((s, x) => s + x.necesidadPlenaMm, 0)
      if (c.maduracion) expect(d.maduracion!.deficitMm).toBeCloseTo(pleno - d.totalNetaMm, 9)
      else {
        expect(d.maduracion).toBeNull()
        expect(d.totalNetaMm).toBeCloseTo(pleno, 9)
      }
    }
  })

  it('el Kc de ningún cultivo sube en la etapa final', () => {
    for (const c of CATALOGO_FAO56 as readonly Cultivo[]) {
      const inicio = duracionDelCiclo(c) - c.etapas.final + 1
      for (let dia = inicio; dia < duracionDelCiclo(c); dia++) {
        expect(coeficienteDeCultivo(c, dia + 1)).toBeLessThanOrEqual(coeficienteDeCultivo(c, dia) + EPS)
      }
    }
  })

  it('el balance elige la misma semana crítica que la demanda en las 480 campañas', () => {
    for (const { c, fecha, lugar } of casos) {
      const d = demandaDeLaCampana({ cultivo: c, fechaSiembra: fecha, clima: lugar.clima })
      const b = balanceHidrico({ semanas: d.semanas, areaHa: lugar.areaHa, eficiencia: eficienciaDelBalance(c), fuente: { tipo: 'manantial', ...lugar.fuente } })
      expect(b.semanaCritica).toBe(d.semanaCritica)
    }
  })
})

describe('la fecha de siembra que se propone sigue el calendario de la sierra', () => {
  it('donde la papa es apta, se propone sembrarla entre septiembre y diciembre, con las lluvias', () => {
    const papa = cultivo('Papa')
    for (const { l, lugar } of LUGARES) {
      const mejor = mejorFechaDeSiembra({ cultivo: papa, lugar })
      if (mejor.indice === 0) continue
      const mes = Number(mejor.fechaSiembra.slice(5, 7))
      expect(mes, l.nombre).toBeGreaterThanOrEqual(9)
    }
  })

  it('a igual aptitud se prefiere la siembra que pide menos riego, no la de enero por ser la primera', () => {
    for (const { lugar } of LUGARES) {
      for (const c of CATALOGO_FAO56) {
        const mejor = mejorFechaDeSiembra({ cultivo: c, lugar })
        const riegoDe = (f: string) => demandaDeLaCampana({ cultivo: c, fechaSiembra: f, clima: lugar.clima }).totalNetaMm
        for (const f of SIEMBRAS) {
          if (aptitudDelCultivo({ cultivo: c, fechaSiembra: f, lugar }).indice === mejor.indice) {
            expect(riegoDe(mejor.fechaSiembra)).toBeLessThanOrEqual(riegoDe(f) + EPS)
          }
        }
      }
    }
  })

  it('en Cerro de Pasco a 4108 m la papa y la avena corren un riesgo alto de helada, pero no quedan fuera; el maíz sí, por frío', () => {
    // La mínima media de NASA POWER está bajo cero todo el año, y aun así la ENA 2024 registra papa en 454 lugares y
    // avena en 263 por encima de 4 000 m. La helada advierte; lo que descarta es la temperatura media, que al maíz no
    // le alcanza.
    const { l, lugar } = LUGARES.find((x) => x.clave === 'cerroDePasco')!
    expect(l.normales.every((m) => m.temperaturaMinimaC < 0)).toBe(true)
    for (const nombre of ['Papa', 'Avena']) {
      const { fechaSiembra } = mejorFechaDeSiembra({ cultivo: cultivo(nombre), lugar })
      const a = aptitudDelCultivo({ cultivo: cultivo(nombre), fechaSiembra, lugar })
      expect(a.nivel).toBe('marginal')
      expect(a.condiciones.find((x) => x.condicion === 'helada')).toMatchObject({ nivel: 'marginal', indice: INDICE_DE_RIESGO_ALTO })
    }
    const { fechaSiembra } = mejorFechaDeSiembra({ cultivo: cultivo('Maíz, grano'), lugar })
    const maiz = aptitudDelCultivo({ cultivo: cultivo('Maíz, grano'), fechaSiembra, lugar })
    expect(maiz.nivel).toBe('fuera')
    expect(maiz.condiciones.find((x) => x.condicion === 'temperatura')!.nivel).toBe('fuera')
  })

  it('la zanahoria ya no queda fuera en la sierra solo por la altitud: en Pasco y Junín la ENA la registra en 17 lugares, todos sobre 2 600 m', () => {
    for (const { lugar } of LUGARES) {
      const zanahoria = cultivo('Zanahoria')
      const { fechaSiembra } = mejorFechaDeSiembra({ cultivo: zanahoria, lugar })
      const a = aptitudDelCultivo({ cultivo: zanahoria, fechaSiembra, lugar })
      expect(a.condiciones.find((x) => x.condicion === 'altitud')!.nivel).not.toBe('fuera')
    }
  })
})

describe('el diseño agronómico de la papa en cada lugar real, en su mejor fecha', () => {
  const papa = cultivo('Papa')
  const gotero = emisorDelCatalogo('gotero-2')
  it.each(LUGARES)('$l.nombre', ({ l, lugar }) => {
    const { fechaSiembra } = mejorFechaDeSiembra({ cultivo: papa, lugar })
    const d = demandaDeLaCampana({ cultivo: papa, fechaSiembra, clima: lugar.clima })
    // Donde la lluvia cubre al cultivo todas las semanas no hay semana crítica ni riego que diseñar: en el valle de Pasco,
    // la papa sembrada en octubre se cosecha en abril, sin salir de la temporada de lluvias.
    if (!(d.demandaNetaPicoMmDia > 0)) {
      expect(d.totalNetaMm).toBe(0)
      return
    }
    expect(['desarrollo', 'media']).toContain(d.etapaCritica)
    const suelo = sueloDeLaTextura(l.suelo)
    const b = balanceHidrico({ semanas: d.semanas, areaHa: l.areaHa, eficiencia: eficienciaDelBalance(papa), fuente: { tipo: 'manantial', ...l.fuente } })
    const diseno = disenoDelRiego({
      cultivo: papa,
      metodo: 'goteo',
      emisor: gotero,
      separacionM: 0.3,
      separacionLateralesM: 0.9,
      demanda: d,
      suelo,
      areaHa: b.areaHa,
      horasDeRiegoPorDia: b.horasDeRiegoPorDia,
      fuente: { caudalLps: b.caudalLps },
    })
    // Se diseña con el consumo máximo del cultivo, sin descontar la lluvia: el sistema tiene que poder regar una
    // semana sin lluvia. Así el intervalo queda en días, no en meses, y nunca agota el agua fácilmente aprovechable.
    expect(diseno.demandaDeDisenoMmDia).toBeCloseTo(d.etcDisenoMmDia, 12)
    expect(d.etcDisenoMmDia).toBeGreaterThanOrEqual(d.demandaNetaPicoMmDia)
    expect(diseno.laminaNetaMm).toBeCloseTo(d.etcDisenoMmDia * diseno.intervaloDias, 9)
    expect(diseno.laminaNetaMm).toBeLessThanOrEqual(diseno.aguaFacilmenteAprovechableMm + EPS)
    expect(diseno.intervaloDias).toBeLessThanOrEqual(15)
    const plan = planDeRiegoPorEtapa({ dias: d.dias, laminaNetaMm: diseno.laminaNetaMm, intervaloDeDisenoDias: diseno.intervaloDias })
    // Coherente con el resumen del diseño: ninguna etapa se riega menos seguido que él; nunca cada 56 o 101 días, como
    // cuando se dividía entre la demanda que deja la lluvia media.
    for (const e of plan) if (e.intervaloDias !== null) expect(e.intervaloDias).toBeLessThanOrEqual(diseno.intervaloDias)
    const final = plan.find((e) => e.etapa === 'final')!
    expect(final.ultimoRiego).toBe(d.maduracion!.ultimoRiego)
    // En la maduración nunca se riega más que en la semana crítica. Sí puede pedir más que la etapa media en promedio, si
    // esta cae en plena temporada de lluvias: en el Mantaro este, sembrando en noviembre, la media pide 0.45 mm/día y la
    // maduración, ya sin lluvias, 1.09.
    expect(final.demandaNetaMediaMmDia).toBeLessThanOrEqual(d.demandaNetaPicoMmDia + EPS)
  })
})

describe('el riego que se opera, en todos los cultivos, lugares reales, métodos y fechas de siembra', () => {
  // Observaciones del informe que no deben repetirse: un riego de 31.6 h con 12 h de agua al día; un plan que riega «cada
  // 185 d», «cada 101 d» o «cada 56 d» cuando el diseño dice «cada 3 d» o «cada 16 d».
  const disenos = LUGARES.flatMap(({ l, lugar }) => {
    const suelo = sueloDeLaTextura(l.suelo)
    return CATALOGO_FAO56.flatMap((c) =>
      metodosDelCultivo(c).flatMap((metodo) =>
        SIEMBRAS.flatMap((fecha) => {
          const d = demandaDeLaCampana({ cultivo: c, fechaSiembra: fecha, clima: lugar.clima })
          if (!(d.demandaNetaPicoMmDia > 0)) return []
          const emisor = emisorRecomendado(metodo, l.pendienteMediaPct)
          const horas = l.fuente.horasDisponiblesDia
          const diseno = disenoDelRiego({ cultivo: c, metodo, emisor, separacionM: emisor.separacionM, separacionLateralesM: emisor.separacionLateralesM, demanda: d, suelo, areaHa: 1, horasDeRiegoPorDia: horas, fuente: { caudalLps: l.fuente.caudalLps } })
          return [{ nombre: `${l.nombre} · ${c.nombre} · ${metodo} · ${fecha}`, c, d, diseno, horas }]
        }),
      ),
    )
  })

  it(`son ${'más de 800'} diseños`, () => expect(disenos.length).toBeGreaterThan(800))

  it('ningún riego dura más que las horas de agua de un día', () => {
    expect(disenos.filter(({ diseno, horas }) => diseno.tiempoDeRiegoH > horas + 1e-9).map((x) => x.nombre)).toEqual([])
  })

  it('ningún día del intervalo riega más horas de las que hay: los turnos enteros se reparten entre los días', () => {
    // 12 turnos de 1.76 h son 21 h, pero en 3 días son 4 por día: 7 h de las 12. Lo que no puede pasar es que algún día
    // tenga más turnos de los que caben en sus horas de agua.
    const pasados = disenos.filter(({ diseno, horas }) => diseno.turnos > 0 && Math.ceil(diseno.turnos / diseno.intervaloDias) * diseno.tiempoDeRiegoH > horas + 1e-9)
    expect(pasados.map((x) => x.nombre)).toEqual([])
    for (const { diseno, horas } of disenos) if (diseno.turnos > 0) expect(diseno.horasDeRiegoNecesariasPorDia).toBeLessThanOrEqual(horas + 1e-9)
  })

  it('el que el estudiante elige y no cabe en el día queda marcado como problema', () => {
    const { c, d } = disenos.find((x) => x.c.nombre === 'Cebada')!
    const suelo = sueloDeLaTextura(LUGARES_REALES.pascoValle.suelo)
    const aspersor = emisorRecomendado('aspersion')
    const largo = disenoDelRiego({ cultivo: c, metodo: 'aspersion', emisor: aspersor, separacionM: 12, separacionLateralesM: 12, demanda: d, suelo, areaHa: 1, horasDeRiegoPorDia: 12, fuente: { caudalLps: 2 }, intervaloDias: 30 })
    expect(largo.tiempoDeRiegoH).toBeGreaterThan(12)
    expect(largo.problemas).toContain('riego_excede_el_dia')
  })

  it('en cada etapa: no menos seguido que el diseño, ningún riego más largo que el del diseño, ni más agua que la que guarda la raíz', () => {
    for (const { c, d, diseno } of disenos) {
      const raiz = {
        aguaFacilMmPorM: diseno.aguaFacilmenteAprovechableMm / diseno.profundidadRadicularM,
        profundidadMaximaM: diseno.profundidadRadicularM,
        diaDeRaizMaxima: c.etapas.inicial + c.etapas.desarrollo + 1,
      }
      const plan = planDeRiegoPorEtapa({ dias: d.dias, laminaNetaMm: diseno.laminaNetaMm, intervaloDeDisenoDias: diseno.intervaloDias, tiempoDeRiegoDelDisenoH: diseno.tiempoDeRiegoH, raiz })
      for (const e of plan) {
        if (e.intervaloDias === null) continue
        expect(e.intervaloDias).toBeLessThanOrEqual(diseno.intervaloDias)
        expect(e.tiempoDeRiegoH!).toBeLessThanOrEqual(diseno.tiempoDeRiegoH + 1e-9)
        expect(e.laminaNetaMm).toBeLessThanOrEqual(diseno.laminaNetaMm + 1e-9)
      }
    }
  })
})


describe('en goteo el agua de un riego es la del suelo que moja el gotero (Keller y Bliesner, 1990)', () => {
  it('un intervalo que el suelo entero aguantaría, pero no el bulbo, se marca como estrés', () => {
    const { l, lugar } = LUGARES.find((x) => x.clave === 'pascoValle')!
    const suelo = sueloDeLaTextura(l.suelo)
    const papa = cultivo('Papa')
    const d = demandaDeLaCampana({ cultivo: papa, fechaSiembra: mejorFechaDeSiembra({ cultivo: papa, lugar }).fechaSiembra, clima: lugar.clima })
    const e = emisorRecomendado('goteo', l.pendienteMediaPct)
    const base = { cultivo: papa, metodo: 'goteo' as const, emisor: e, separacionM: e.separacionM, separacionLateralesM: e.separacionLateralesM, demanda: d, suelo, areaHa: 1, horasDeRiegoPorDia: 24, fuente: { caudalLps: 50 } }
    const propuesto = disenoDelRiego(base)
    expect(propuesto.areaMojadaPct).toBeLessThan(100)
    expect(propuesto.aguaFacilDelAreaMojadaMm).toBeCloseTo((propuesto.aguaFacilmenteAprovechableMm * propuesto.areaMojadaPct) / 100, 12)
    expect(propuesto.problemas).not.toContain('intervalo_con_estres')
    // El intervalo más largo que aguanta el suelo entero, y uno que el bulbo no aguanta.
    const intervalo = Math.floor(propuesto.aguaFacilmenteAprovechableMm / propuesto.demandaDeDisenoMmDia)
    const largo = disenoDelRiego({ ...base, intervaloDias: intervalo })
    expect(largo.laminaNetaMm).toBeLessThanOrEqual(largo.aguaFacilmenteAprovechableMm)
    if (largo.laminaNetaMm > largo.aguaFacilDelAreaMojadaMm) expect(largo.problemas).toContain('intervalo_con_estres')
    expect(largo.intervaloMaximoDias).toBeLessThanOrEqual(Math.floor(largo.aguaFacilDelAreaMojadaMm / largo.demandaDeDisenoMmDia) || 1)
  })
})

describe('lo que el paso 3 da por alcanzado se puede regar en el paso 4', () => {
  // El paso 3 comparaba la demanda con la lluvia media descontada, y el paso 4 dimensiona para el consumo pico sin
  // lluvia: con poca agua, el balance decía «alcanza» y los turnos no cabían. Ahora el balance comprueba también la
  // capacidad con la demanda de diseño.
  it('en todos los lugares reales, cultivos, métodos, fechas y caudales, si alcanza (sola o con su salida), los turnos caben', () => {
    const fallas: string[] = []
    let comprobados = 0
    let sinSalida = 0
    for (const { l, lugar } of LUGARES) {
      const suelo = sueloDeLaTextura(l.suelo)
      for (const c of CATALOGO_FAO56) {
        for (const metodo of metodosDelCultivo(c)) {
          for (const fecha of SIEMBRAS.filter((_, i) => i % 3 === 0)) {
            const d = demandaDeLaCampana({ cultivo: c, fechaSiembra: fecha, clima: lugar.clima })
            if (!(d.demandaNetaPicoMmDia > 0)) continue
            const emisor = emisorRecomendado(metodo, l.pendienteMediaPct)
            for (const caudalLps of [0.05, 0.2, 0.5, 2]) {
              const fuente = { tipo: 'manantial' as const, caudalLps, horasDisponiblesDia: l.fuente.horasDisponiblesDia }
              const eficiencia = eficienciaDelMetodo(metodo, c)
              const base = { semanas: d.semanas, areaHa: 1, eficiencia, fuente, demandaDeDisenoMmDia: demandaDeDiseno(d) }
              const sin = balanceHidrico(base)
              const ajustes = [
                ...(sin.alcanza === 'si' ? [undefined] : []),
                ...(sin.ajustes.turnos.viable ? [{ tipo: 'turnos' as const, turnos: sin.ajustes.turnos.turnos }] : []),
                ...(sin.ajustes.menosArea.viable ? [{ tipo: 'menos_area' as const, areaHa: sin.ajustes.menosArea.areaHa }] : []),
                ...(sin.ajustes.reservorio.viable ? [{ tipo: 'reservorio' as const, volumenM3: sin.ajustes.reservorio.volumenM3 }] : []),
              ]
              for (const ajuste of ajustes) {
                const b = balanceHidrico({ ...base, ajuste })
                if (b.alcanza !== 'si') continue
                const diseno = disenoDelRiego({
                  cultivo: c, metodo, emisor, separacionM: emisor.separacionM, separacionLateralesM: emisor.separacionLateralesM, demanda: d, suelo,
                  areaHa: b.areaHa, horasDeRiegoPorDia: b.horasDeRiegoPorDia,
                  fuente: { caudalLps, reservorioM3: ajuste?.tipo === 'reservorio' ? ajuste.volumenM3 : undefined },
                })
                comprobados++
                if (!diseno.problemas.includes('turnos_no_caben')) continue
                // Puede faltar un turno entero: el paso 4 ofrece un remedio según la salida elegida, como Paso4.tsx.
                let remedio: AjusteDelBalance | null = null
                if (ajuste?.tipo === 'reservorio' && diseno.reservorioQueCabeM3 > 0) {
                  remedio = { tipo: 'reservorio', volumenM3: Math.ceil(Math.max(ajuste.volumenM3, diseno.reservorioQueCabeM3)) }
                } else if (ajuste?.tipo === 'turnos') {
                  const n = Math.ceil(diseno.horasDeRiegoNecesariasPorDia / fuente.horasDisponiblesDia - 1e-9)
                  if (n > ajuste.turnos && n * fuente.horasDisponiblesDia <= 24) remedio = { tipo: 'turnos', turnos: n }
                } else {
                  const areaHa = Math.floor(diseno.areaQueCabeHa * 100) / 100
                  if (areaHa > 0 && areaHa >= FRACCION_MINIMA_DE_AREA) remedio = { tipo: 'menos_area', areaHa }
                }
                if (!remedio) {
                  sinSalida++
                  continue
                }
                const conRemedio = balanceHidrico({ ...base, ajuste: remedio })
                const rediseno = disenoDelRiego({
                  cultivo: c, metodo, emisor, separacionM: emisor.separacionM, separacionLateralesM: emisor.separacionLateralesM, demanda: d, suelo,
                  areaHa: conRemedio.areaHa, horasDeRiegoPorDia: conRemedio.horasDeRiegoPorDia,
                  fuente: { caudalLps, reservorioM3: remedio.tipo === 'reservorio' ? remedio.volumenM3 : undefined },
                })
                if (conRemedio.alcanza !== 'si' || rediseno.problemas.includes('turnos_no_caben')) {
                  fallas.push(`${l.nombre} · ${c.nombre} · ${metodo} · ${fecha} · ${caudalLps} l/s · ${ajuste?.tipo ?? 'sin ajuste'} → ${remedio.tipo}`)
                }
              }
            }
          }
        }
      }
    }
    expect(comprobados).toBeGreaterThan(300)
    // Solo cuando el área que cabe es menos de la mitad de la parcela, o harían falta más turnos de los que caben en 24 h,
    // no hay salida en el paso 4: se vuelve al paso 3. Con los turnos enteros por día son unos pocos de cada cien.
    expect(sinSalida).toBeLessThan(comprobados * 0.05)
    expect(fallas).toEqual([])
  })
})
