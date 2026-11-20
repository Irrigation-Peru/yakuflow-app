import type { MetodoDeRiego, ViabilidadDelMetodo } from '@riego/calculo'
import { describe, expect, it } from 'vitest'
import { comparacionDelAjuste, opcionesDelBalance, veredictoDelBalance } from '../src/balance.ts'
import type { AguaDeLaCampana, RiegoDeLaCampana } from '../src/calculo/campana.ts'
import { lecturaDelCorte, lecturaDelProblema, porQueElMetodo, porQueLosTurnos, sinMetodoQueSirva } from '../src/metodo.ts'

// Lo que los pasos 3 y 4 dicen con palabras junto a la curva y al corte. Los números salen del módulo de cálculo; estas
// pruebas cuidan que se lean bien: en frases completas, sin «12.0 h», que el redondeo no esconda lo que falta y que el
// texto diga lo que el dibujo muestra.

type Balance = AguaDeLaCampana['balance']
type Diseno = NonNullable<RiegoDeLaCampana['diseno']>
type Corte = Diseno['corte']

describe('veredicto del balance', () => {
  it('con fuentes de décimas de litro, el caudal va con dos decimales: «pide 0.4 y da 0.4» no deja ver que falta', () => {
    const b = { semanaCritica: 10, necesidadPicoLps: 0.43, necesidadPicoConLluviaLps: 0.43, caudalLps: 0.35, alcanza: 'parcial', semanasSinCubrir: [10, 11, 12, 13] } as unknown as Balance
    const { texto } = veredictoDelBalance(b)
    expect(texto).toBe('La semana 10 es la que más riego pide: 0.43 l/s. Tu fuente da 0.35 l/s. Faltan 0.08 l/s, y aun con la lluvia de un año normal hay 4 semanas en que el agua no alcanza.')
  })

  it('cuando alcanza, lo dice sin rodeos', () => {
    const b = { semanaCritica: 10, necesidadPicoLps: 0.22, necesidadPicoConLluviaLps: 0.22, caudalLps: 0.35, alcanza: 'si', semanasSinCubrir: [] } as unknown as Balance
    expect(veredictoDelBalance(b).texto).toBe('La semana 10 es la que más riego pide: 0.22 l/s. Tu fuente da 0.35 l/s: alcanza para todas las semanas.')
  })

  it('si las dos son la misma semana, no la repite', () => {
    const b = { semanaCritica: 14, necesidadPicoLps: 0.97, necesidadPicoConLluviaLps: 0.37, caudalLps: 4, alcanza: 'si', semanasSinCubrir: [] } as unknown as Balance
    expect(veredictoDelBalance(b, { semana: 14, lps: 0.97 }).texto).toBe(
      'Con la lluvia de un año normal, la semana 14 es la que más riego pide: 0.37 l/s. Si no llueve, esa misma semana consume 0.97 l/s, y con eso se diseña el riego. Tu fuente da 4.00 l/s: alcanza también si no llueve.',
    )
  })

  it('separa el año normal de la racha seca, cada una con su semana, y dice con cuál se diseña', () => {
    const b = { semanaCritica: 9, necesidadPicoLps: 0.92, necesidadPicoConLluviaLps: 0.19, caudalLps: 0.5, alcanza: 'parcial', semanasSinCubrir: [] } as unknown as Balance
    expect(veredictoDelBalance(b, { semana: 12, lps: 0.92 }).texto).toBe(
      'Con la lluvia de un año normal, la semana 9 es la que más riego pide: 0.19 l/s. Si no llueve, la semana 12 consume 0.92 l/s, y con eso se diseña el riego. Tu fuente da 0.50 l/s: alcanza en un año normal, pero en una racha seca faltan 0.42 l/s.',
    )
  })
})

const ajustesConTurnos = { reservorio: { viable: false, motivo: 'deficit_sin_reserva_previa' }, menosArea: { viable: false, areaHa: 0.4 } }

describe('las salidas cuando el agua no alcanza', () => {
  it('cada una en una frase, sin ceros que sobran', () => {
    const b = {
      ajustes: {
        turnos: { viable: true, turnos: 2, horasDeRiegoPorDia: 24, turnosMaximos: 2 },
        reservorio: { viable: true, volumenM3: 98 },
        menosArea: { viable: true, areaHa: 0.98 },
      },
    } as unknown as Balance
    const [turnos, reservorio, menosArea] = opcionesDelBalance(b, 12, 1.22)
    expect(turnos!.detalle).toBe('Tu fuente corre todo el día: con 2 turnos de 12 h riegas 24 h al día en lugar de 12.')
    expect(reservorio!.detalle).toBe('Guarda el agua que sobra al inicio de la campaña para usarla en las semanas de más demanda.')
    expect(menosArea!.titulo).toBe('Regar solo 0.98 ha')
    expect(menosArea!.detalle).toBe('Es lo que tu fuente alcanza a cubrir de las 1.22 ha de la parcela.')
  })

  it('los turnos se pueden subir hasta los que caben en el día, para dejar holgura al paso 4', () => {
    const b = { ajustes: { ...ajustesConTurnos, turnos: { viable: true, turnos: 2, horasDeRiegoPorDia: 12, turnosMaximos: 4 } } } as unknown as Balance
    const [turnos] = opcionesDelBalance(b, 6, 1.22, 3)
    expect(turnos!.titulo).toBe('Regar en 3 turnos')
    expect(turnos!.detalle).toBe('Tu fuente corre todo el día: con 3 turnos de 6 h riegas 18 h al día en lugar de 6.')
    expect(turnos!.ajuste).toEqual({ tipo: 'turnos', turnos: 3 })
    expect(turnos!.rangoDeTurnos).toEqual({ minimo: 2, maximo: 4 })
  })

  it('nunca menos turnos de los que cubren la campaña ni más de los que caben en el día', () => {
    const b = { ajustes: { ...ajustesConTurnos, turnos: { viable: true, turnos: 2, horasDeRiegoPorDia: 12, turnosMaximos: 4 } } } as unknown as Balance
    expect(opcionesDelBalance(b, 6, 1.22, 9)[0]!.ajuste).toEqual({ tipo: 'turnos', turnos: 4 })
    expect(opcionesDelBalance(b, 6, 1.22, 1)[0]!.ajuste).toEqual({ tipo: 'turnos', turnos: 2 })
  })
})

describe('lo que cambió con el ajuste', () => {
  it('con una sola semana, en singular', () => {
    expect(comparacionDelAjuste(1, 0)).toBe('Antes quedaba 1 semana sin cubrir y ahora ninguna')
    expect(comparacionDelAjuste(4, 2)).toBe('Antes quedaban 4 semanas sin cubrir y ahora 2')
  })
})

describe('por qué el método', () => {
  const contexto = { cultivo: 'Arveja, verde', claseDelSuelo: 'franco', infiltracionMmH: 15, cargaDisponibleM: 36 }

  it('el recomendado dice para qué cultivo y suelo, y qué carga necesita', () => {
    expect(porQueElMetodo('goteo', { viable: true, motivos: [] } as never, 'goteo', contexto)).toBe(
      'Es el que más conviene para la arveja verde en suelo franco. El goteo necesita al menos 15 m de carga, la presión que te da el desnivel, y tienes 36 m.',
    )
  })

  it('el otro, si funciona, dice cuánta agua aprovecha', () => {
    expect(porQueElMetodo('aspersion', { viable: true, motivos: [] } as never, 'goteo', contexto)).toBe(
      'También funciona: la aspersión necesita al menos 30 m de carga y tienes 36 m. Pero aprovecha menos el agua: el 75 %, contra el 90 % del goteo.',
    )
  })
})

describe('lo que muestra el corte del goteo', () => {
  const bulbo = (forma: 'bulbos' | 'franja' | 'capa', radioM: number, profundidadM: number): Corte => ({ tipo: 'bulbo', tiempoH: 7.5, forma, aguaM3: 0.015, radioM, profundidadM })

  it('cuando las franjas de los laterales se juntan, dice que moja todo el suelo parejo', () => {
    expect(lecturaDelCorte(bulbo('capa', 0.84, 1.22), 1, 0.3, 0.9)).toBe(
      'En 7.5 h de riego, el agua de los laterales se junta y moja todo el suelo parejo hasta 1.22 m de hondo. La raíz llega a 1 m, así que el agua que baja más allá se pierde.',
    )
  })

  it('cuando los bulbos de un lateral se juntan, dice que moja una franja y si entre laterales queda suelo seco', () => {
    const texto = lecturaDelCorte(bulbo('franja', 0.61, 0.61), 1, 0.3, 3)
    expect(texto).toContain('se juntan en una franja húmeda que baja 0.61 m')
    expect(texto).toContain('su parte más honda se queda sin agua')
    expect(texto).toContain('Entre lateral y lateral queda suelo seco')
  })

  it('con los bulbos sueltos, dice que entre gotero y gotero queda suelo seco', () => {
    const texto = lecturaDelCorte(bulbo('bulbos', 0.35, 0.35), 1, 2, 3)
    expect(texto).toContain('cada gotero moja un bulbo')
    expect(texto).toContain('Entre gotero y gotero queda suelo seco')
  })
})

describe('por qué son esos turnos', () => {
  const diseno = (turnos: number, turnosMaximos: number, caudalDisponibleLps: number) =>
    ({ turnos, turnosMaximos, turnosNecesarios: turnos || 80, caudalDisponibleLps, intervaloDias: 36, turnosPorDia: 3, tiempoDeRiegoH: 3.5 }) as unknown as Diseno

  it('son los menos que la fuente alimenta, y dice cuántos entrarían', () => {
    expect(porQueLosTurnos(diseno(72, 115, 0.35), 0.35)).toBe(
      'Son 72 turnos porque ninguno puede llevar más de los 0.35 l/s que da tu fuente. Se reparten en los 36 días del intervalo: a lo más 2 por día, 7 h de riego. Entrarían hasta 115: 3 por día.',
    )
  })

  it('con el reservorio, la red lleva más de lo que da la fuente', () => {
    expect(porQueLosTurnos(diseno(7, 115, 3.98), 0.35)).toContain('que dan tu fuente y el reservorio')
  })

  it('si la fuente alcanza para toda la parcela, se riega de una vez', () => {
    expect(porQueLosTurnos(diseno(1, 115, 40), 40)).toContain('toda la parcela a la vez')
  })

  it('si los turnos no caben, el problema manda volver al paso 3', () => {
    expect(porQueLosTurnos(diseno(0, 75, 0.35), 0.35)).toBeNull()
    const texto = lecturaDelProblema('turnos_no_caben', diseno(0, 75, 0.35), 24, 'franco', 15)
    expect(texto).toContain('80 turnos')
    expect(texto).toContain('solo caben 75')
    expect(texto).toContain('paso 3')
  })

  it('con el agua al filo, dice cuántas horas de riego al día piden los turnos y cuántas hay', () => {
    // CERROTEST: avena en arcilla, 1.04 l/s durante 9 turnos de 1.5 h. Los 29 turnos piden 13.57 h y hay 13.5.
    const alFilo = { turnos: 0, turnosNecesarios: 29, turnosMaximos: 28, caudalDisponibleLps: 1.04, intervaloDias: 125, horasDeRiegoNecesariasPorDia: 13.57 }
    expect(lecturaDelProblema('turnos_no_caben', alFilo as unknown as Diseno, 13.5, 'arcilla', 3)).toBe(
      'Para que ningún turno pida más de los 1.04 l/s que hay, harían falta 29 turnos, y en 125 días solo caben 28: los 29 piden 13.6 h de riego al día y tienes 13.5. Vuelve al paso 3 y riega más horas al día, o usa un reservorio o menos área.',
    )
  })

  it('las horas que faltan se redondean hacia arriba: «piden 13.5 y tienes 13.5» no dejaría ver el problema', () => {
    const casi = { turnos: 0, turnosNecesarios: 29, turnosMaximos: 28, caudalDisponibleLps: 1.04, intervaloDias: 125, horasDeRiegoNecesariasPorDia: 13.51 }
    expect(lecturaDelProblema('turnos_no_caben', casi as unknown as Diseno, 13.5, 'arcilla', 3)).toContain('piden 13.6 h de riego al día y tienes 13.5')
  })
})

describe('cuando ningún método sirve', () => {
  const contexto = { cultivo: 'Avena', claseDelSuelo: 'arcilla', infiltracionMmH: 3, cargaDisponibleM: 39 }

  it('si el goteo solo falla por el cultivo, manda al paso 2 por uno que se riegue por goteo', () => {
    const viabilidad: Record<MetodoDeRiego, ViabilidadDelMetodo> = { goteo: { viable: false, motivos: ['cultivo'] }, aspersion: { viable: false, motivos: ['infiltracion'] } }
    expect(sinMetodoQueSirva(viabilidad, contexto)).toEqual({
      paso: 2,
      texto: 'Con este suelo y esta fuente, ningún método sirve para la avena. Vuelve al paso 2 y elige un cultivo que se pueda regar por goteo.',
    })
  })

  it('si falta presión hasta para el goteo, cambiar de cultivo no basta: manda al paso 1', () => {
    const viabilidad: Record<MetodoDeRiego, ViabilidadDelMetodo> = {
      goteo: { viable: false, motivos: ['presion'], cargaNecesariaM: 15 },
      aspersion: { viable: false, motivos: ['presion'], cargaNecesariaM: 30 },
    }
    expect(sinMetodoQueSirva(viabilidad, { ...contexto, cargaDisponibleM: 8.4 })).toEqual({
      paso: 1,
      texto: 'Con 8.4 m de carga no alcanza para ningún método: el goteo necesita al menos 15 m. Vuelve al paso 1 y ubica la fuente más arriba.',
    })
  })
})
