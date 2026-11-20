import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DESNIVEL_MAXIMO_SIN_CRP_M } from '../src/constantes'
import { camarasRompePresion } from '../src/terreno/conduccion'

// La conducción de la fuente a la parcela: dónde van las cámaras rompe-presión para que ningún tramo aguante
// más de 50 m de presión estática, y a qué nivel llega el agua a la parcela.

/** Una línea que baja parejo de `desde` a `hasta` m en `largo` m, con un punto cada 10 m. */
const bajada = (desde: number, hasta: number, largo: number) =>
  Array.from({ length: largo / 10 + 1 }, (_, i) => ({ distanciaM: i * 10, cota: desde + ((hasta - desde) * i * 10) / largo }))

describe('cámaras rompe-presión en la conducción', () => {
  // La regla: con poco relieve, la última cámara deja el agua a 49 m sobre lo más bajo (50 m menos 1 m de margen por la
  // precisión del relieve), o a 50 m si el margen costaría una cámara más. Si así a lo alto le quedan menos de 35 m —lo
  // que pide la aspersión con su cabezal—, se ancla a lo alto con esos 35 m y la parte baja se riega por pisos, con
  // cámaras dentro de la parcela (paso 5).

  it('en una bajada pareja van donde el terreno llega a cada nivel, y la última deja el agua a 50 m sobre lo más bajo', () => {
    // Con el metro de margen harían falta cuatro, una a un metro de la fuente: no vale la pena, se queda en 4150.
    const conduccion = camarasRompePresion(bajada(4300, 4100, 2000), { cotaMasAlta: 4110, cotaMasBaja: 4100 })
    expect(conduccion.nivelFinalM).toBe(4150)
    expect(conduccion.camaras.map((c) => c.cota)).toEqual([4250, 4200, 4150])
    conduccion.camaras.forEach((c, i) => expect(c.distanciaM).toBeCloseTo(500 * (i + 1), 9))
    expect(conduccion.camarasDentroDeLaParcela).toBe(0)
    expect(conduccion.sobreElNivel).toBeNull()
  })

  it('con una ladera de 48 m de relieve, a lo alto le llegan 35 m y no 2 (parcela de 80 m en Cerro de Pasco)', () => {
    // Anclada a lo bajo, a lo alto le quedaba 1 m. Anclada a lo alto, la parte baja lleva un piso con su cámara.
    const conduccion = camarasRompePresion(bajada(4197, 4108, 150), { cotaMasAlta: 4132, cotaMasBaja: 4084 })
    expect(conduccion.nivelFinalM - 4132).toBe(35)
    expect(conduccion.camaras.map((c) => c.cota)).toEqual([4167])
    expect(conduccion.camarasDentroDeLaParcela).toBe(1)
  })

  it('sin más de 49 m entre la fuente y lo más bajo, no hace falta ninguna', () => {
    const conduccion = camarasRompePresion(bajada(4140, 4100, 400), { cotaMasAlta: 4110, cotaMasBaja: 4100 })
    expect(conduccion.camaras).toEqual([])
    expect(conduccion.nivelFinalM).toBe(4140)
  })

  it('con 100 m justos alcanza una: el margen no se toma si cuesta una cámara más', () => {
    const conduccion = camarasRompePresion(bajada(4200, 4100, 1000), { cotaMasAlta: 4100, cotaMasBaja: 4100 })
    expect(conduccion.camaras.map((c) => c.cota)).toEqual([4150])
  })

  it('cuando el margen no cuesta una cámara, se toma: la última queda a 49 m sobre lo más bajo', () => {
    const conduccion = camarasRompePresion(bajada(4180, 4100, 800), { cotaMasAlta: 4105, cotaMasBaja: 4100 })
    expect(conduccion.camaras.map((c) => c.cota)).toEqual([4149])
  })

  it('si a lo alto le quedarían menos de 35 m, la última cámara se ancla a lo alto y lo bajo lleva cámaras dentro', () => {
    // La parcela va de 4180 a 4100 m: 80 m. Anclada a lo bajo, la última cámara quedaba en 4150, 30 m por debajo
    // de lo alto, que se quedaba sin agua. Ahora deja el agua a 35 m sobre lo alto y abajo van dos pisos.
    const conduccion = camarasRompePresion(bajada(4300, 4170, 1300), { cotaMasAlta: 4180, cotaMasBaja: 4100 })
    expect(conduccion.nivelFinalM).toBe(4215)
    expect(conduccion.camaras.map((c) => c.cota)).toEqual([4265, 4215])
    expect(conduccion.camarasDentroDeLaParcela).toBe(2)
  })

  it('en una ladera con 103 m de relieve y la fuente 41 m sobre lo alto, a lo alto le llegan 35 m (caso de Cerro de Pasco)', () => {
    // Con la cámara anclada a lo bajo la carga en lo alto daba −53 m y el paso 4 descartaba el goteo y la aspersión.
    const conduccion = camarasRompePresion(bajada(4190, 4100, 300), { cotaMasAlta: 4149, cotaMasBaja: 4046 })
    expect(conduccion.nivelFinalM - 4149).toBe(35)
    expect(conduccion.camaras.map((c) => c.cota)).toEqual([4184])
    expect(conduccion.camarasDentroDeLaParcela).toBe(3)
  })

  it('si la línea recta pasa por terreno más alto que el nivel del agua, dice cuánto y dónde es lo peor', () => {
    const loma = [
      { distanciaM: 0, cota: 4300 },
      { distanciaM: 100, cota: 4305 },
      { distanciaM: 300, cota: 4320 },
      { distanciaM: 1000, cota: 4120 },
    ]
    expect(camarasRompePresion(loma, { cotaMasAlta: 4120, cotaMasBaja: 4110 }).sobreElNivel).toEqual({ alturaM: 20, distanciaM: 300 })
  })

  it('con la fuente debajo de la parcela no pone cámaras: el agua no llega', () => {
    const conduccion = camarasRompePresion(bajada(4100, 4120, 500), { cotaMasAlta: 4130, cotaMasBaja: 4110 })
    expect(conduccion.camaras).toEqual([])
    expect(conduccion.nivelFinalM).toBe(4100)
  })

  it(`en cualquier bajada, ningún punto aguanta más de ${DESNIVEL_MAXIMO_SIN_CRP_M} m y lo alto recibe la carga de la regla`, () => {
    const arbitraria = fc.record({
      fuente: fc.double({ min: 3000, max: 4500, noNaN: true }),
      caidas: fc.array(fc.double({ min: 0, max: 40, noNaN: true }), { minLength: 2, maxLength: 60 }),
      relieve: fc.double({ min: 0, max: 160, noNaN: true }),
    })
    fc.assert(
      fc.property(arbitraria, ({ fuente, caidas, relieve }) => {
        let cota = fuente
        const perfil = [{ distanciaM: 0, cota }, ...caidas.map((caida, i) => ({ distanciaM: 25 * (i + 1), cota: (cota -= caida) }))]
        const fin = perfil.at(-1)!.cota
        const extremos = { cotaMasAlta: fin + relieve / 2, cotaMasBaja: fin - relieve / 2 }
        const { camaras, nivelFinalM, camarasDentroDeLaParcela } = camarasRompePresion(perfil, extremos)
        // Lo que queda más de 50 m por debajo del nivel con que el agua entra a la parcela ya está dentro de ella: lo
        // protegen las cámaras de dentro, que pone la red (paso 5).
        for (const p of perfil.filter((q) => q.cota >= nivelFinalM - DESNIVEL_MAXIMO_SIN_CRP_M - 1e-9)) {
          const nivel = [...camaras].reverse().find((c) => c.distanciaM <= p.distanciaM + 1e-9)?.cota ?? fuente
          expect(nivel - p.cota).toBeLessThanOrEqual(DESNIVEL_MAXIMO_SIN_CRP_M + 1e-6)
        }
        const conPocoRelieve = relieve <= 49 - 35
        const arriba = nivelFinalM - extremos.cotaMasAlta
        if (conPocoRelieve) {
          // Con poco relieve: a lo alto, lo que deja anclar a 49 o 50 m de lo bajo; sin cámaras dentro, y las de la
          // conducción, las mínimas.
          expect(arriba).toBeGreaterThanOrEqual(Math.min(fuente - extremos.cotaMasAlta, 49 - relieve) - 1e-6)
          expect(arriba).toBeLessThanOrEqual(Math.min(fuente - extremos.cotaMasAlta, 50 - relieve) + 1e-6)
          expect(camarasDentroDeLaParcela).toBe(0)
          const minimas = Math.max(0, Math.ceil((fuente - extremos.cotaMasBaja - DESNIVEL_MAXIMO_SIN_CRP_M) / DESNIVEL_MAXIMO_SIN_CRP_M - 1e-9))
          expect(camaras.length).toBe(minimas)
        } else {
          expect(arriba).toBeCloseTo(Math.min(fuente - extremos.cotaMasAlta, 35), 6)
        }
      }),
    )
  })
})
