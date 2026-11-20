import { describe, expect, it } from 'vitest'
import type { LugarDelProyecto } from '../src/api/tipos.ts'
import { confirmacionDeLaFuente } from '../src/fuente.ts'

// Lo que el paso 1 dice junto al botón al guardar la fuente: los resultados cambian más arriba, fuera de la vista.

type Conduccion = NonNullable<LugarDelProyecto['conduccion']>

const camara = { lat: -10.66, lon: -76.25, distanciaM: 1000, cota: 3100 }
const conduccion = (camaras: Conduccion['camaras']): Conduccion => ({
  perfil: [
    { distanciaM: 0, cota: 3150 },
    { distanciaM: 2950, cota: 3002.5 },
  ],
  camaras,
  nivelFinalM: 3050,
  camarasDentroDeLaParcela: 0,
  sobreElNivel: null,
})

describe('confirmación al guardar la fuente', () => {
  it('dice el desnivel y cuántas cámaras lleva la conducción', () => {
    const desnivel = { disponibleM: 20, maximoM: 63 }
    expect(confirmacionDeLaFuente({ desnivel, conduccion: conduccion([camara]) })).toBe(
      'Guardamos la fuente. Tienes 20 m de desnivel, y la conducción necesita 1 cámara rompe-presión.',
    )
    expect(confirmacionDeLaFuente({ desnivel, conduccion: conduccion([camara, { ...camara, cota: 3050 }]) })).toBe(
      'Guardamos la fuente. Tienes 20 m de desnivel, y la conducción necesita 2 cámaras rompe-presión.',
    )
    expect(confirmacionDeLaFuente({ desnivel, conduccion: conduccion([]) })).toBe(
      'Guardamos la fuente. Tienes 20 m de desnivel, y la conducción no necesita cámaras rompe-presión.',
    )
  })

  it('sin parcela, pide dibujarla para medir el desnivel', () => {
    expect(confirmacionDeLaFuente({ desnivel: null, conduccion: null })).toBe(
      'Guardamos la fuente. Ahora dibuja la parcela para medir el desnivel hasta ella.',
    )
  })

  it('con la fuente por debajo de la parte alta de la parcela, remite a la alerta', () => {
    expect(confirmacionDeLaFuente({ desnivel: { disponibleM: -10, maximoM: 30 }, conduccion: conduccion([]) })).toBe(
      'Guardamos la fuente, pero el agua no llega por gravedad a toda la parcela: lee el aviso de arriba.',
    )
  })
})
