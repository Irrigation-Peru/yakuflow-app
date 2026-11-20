import { describe, expect, it } from 'vitest'
import { lecturaDelDesnivel } from '../src/desnivel.ts'

// Lo que el paso 1 le dice al estudiante del desnivel entre la fuente y la parcela. El disponible se mide hasta
// el punto más alto de la parcela; el máximo, hasta el más bajo.

describe('lectura del desnivel', () => {
  it('con la fuente arriba de toda la parcela, explica dónde la presión estática es mayor', () => {
    const lectura = lecturaDelDesnivel({ disponibleM: 25, maximoM: 40 })
    expect(lectura.nota).toBe(
      'Se mide de la fuente al punto más alto de la parcela, y de ahí sale la presión para regar. Hasta el punto más bajo baja 40 m: ahí la presión será la más alta.',
    )
    expect(lectura.alertas).toEqual([])
  })

  it('con más de 50 m hasta el punto más bajo no alerta: las cámaras las cuenta la conducción', () => {
    expect(lecturaDelDesnivel({ disponibleM: 89.3, maximoM: 167.1 }).alertas).toEqual([])
  })

  it('con la fuente debajo de toda la parcela, no habla de presión en el punto más bajo', () => {
    const lectura = lecturaDelDesnivel({ disponibleM: -160, maximoM: -25 })
    expect(lectura.nota).toBe('Se mide de la fuente al punto más alto de la parcela, y de ahí sale la presión para regar.')
    expect(lectura.alertas).toEqual([
      'La fuente está por debajo de toda la parcela. Sin bombeo, el agua no llega por gravedad: busca otra fuente o cambia la parcela.',
    ])
  })

  it('con la fuente entre el punto más alto y el más bajo, dice que no llega a la parte alta', () => {
    const lectura = lecturaDelDesnivel({ disponibleM: -10, maximoM: 30 })
    expect(lectura.nota).toContain('Hasta el punto más bajo baja 30 m: ahí la presión será la más alta.')
    expect(lectura.alertas).toEqual([
      'La fuente está por debajo del punto más alto de la parcela. Sin bombeo, el agua no llega a la parte alta: busca otra fuente o cambia la parcela.',
    ])
  })
})
