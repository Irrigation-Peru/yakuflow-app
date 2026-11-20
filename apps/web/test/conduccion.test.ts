import { describe, expect, it } from 'vitest'
import type { LugarDelProyecto } from '../src/api/tipos.ts'
import { lecturaDeLaConduccion, tramosDelNivel } from '../src/conduccion.ts'

// Lo que el paso 1 dice de la conducción de la fuente a la parcela y de sus cámaras rompe-presión.

type Conduccion = NonNullable<LugarDelProyecto['conduccion']>

const conduccion = (cambios: Partial<Conduccion> = {}): Conduccion => ({
  perfil: [
    { distanciaM: 0, cota: 3150 },
    { distanciaM: 2950, cota: 3002.5 },
  ],
  camaras: [
    { lat: -10.66, lon: -76.25, distanciaM: 1000, cota: 3100 },
    { lat: -10.67, lon: -76.25, distanciaM: 2000, cota: 3050 },
  ],
  nivelFinalM: 3050,
  camarasDentroDeLaParcela: 0,
  sobreElNivel: null,
  ...cambios,
})

describe('lectura de la conducción', () => {
  it('cuenta las cámaras, dice dónde va cada una y a qué nivel llega el agua a la parcela', () => {
    const lectura = lecturaDeLaConduccion(conduccion(), { disponibleM: 145, maximoM: 150 })!
    expect(lectura.resumen).toBe(
      'La tubería de la fuente a la parcela necesita 2 cámaras rompe-presión. Sin ellas, al cerrar las válvulas la presión pasaría de 50 m en algún tramo y el tubo podría reventar.',
    )
    expect(lectura.camaras).toEqual(['CRP 1: a 1,000 m de la fuente, a 3,100 m de altitud', 'CRP 2: a 2,000 m de la fuente, a 3,050 m de altitud'])
    expect(lectura.llegada).toBe(
      'El agua llega a la parcela con su nivel a 3,050 m, la línea discontinua del perfil: cuanto más abajo de ella queda un punto, más presión tiene.',
    )
    expect(lectura.avisos).toEqual([])
  })

  it('con una sola cámara habla en singular', () => {
    const lectura = lecturaDeLaConduccion(conduccion({ camaras: [conduccion().camaras[0]!] }), { disponibleM: 95, maximoM: 100 })!
    expect(lectura.resumen).toMatch(/^La tubería de la fuente a la parcela necesita 1 cámara rompe-presión\./)
  })

  it('sin cámaras lo dice, y el agua llega con el nivel de la fuente', () => {
    const lectura = lecturaDeLaConduccion(conduccion({ camaras: [], nivelFinalM: 3150 }), { disponibleM: 20, maximoM: 25 })!
    expect(lectura.resumen).toBe(
      'La tubería de la fuente a la parcela no necesita cámaras rompe-presión: aun con las válvulas cerradas, en ningún tramo la presión pasa de 50 m.',
    )
    expect(lectura.camaras).toEqual([])
    expect(lectura.llegada).toMatch(/^El agua llega a la parcela con su nivel a 3,150 m,/)
  })

  it('avisa si la línea recta cruza terreno más alto y si falta una cámara dentro de la parcela', () => {
    const lectura = lecturaDeLaConduccion(conduccion({ sobreElNivel: { alturaM: 1.62, distanciaM: 40 }, camarasDentroDeLaParcela: 1 }), {
      disponibleM: 100,
      maximoM: 180,
    })!
    expect(lectura.avisos).toEqual([
      'A 40 m de la fuente, el terreno sube 1.6 m por encima del nivel del agua: en línea recta, el agua no pasa por ahí. Habrá que enterrar más la tubería o rodear ese punto.',
      'La parcela tiene tanto desnivel que hará falta una cámara rompe-presión dentro de ella. La verás en el paso 5, al generar la red.',
    ])
  })

  it('con la fuente debajo de la parcela no hay conducción que leer', () => {
    expect(lecturaDeLaConduccion(conduccion({ camaras: [] }), { disponibleM: -5, maximoM: 10 })).toBeNull()
  })
})

describe('tramos del nivel del agua', () => {
  it('va con el nivel de la fuente hasta la primera cámara, y con el de cada cámara hasta la siguiente', () => {
    expect(tramosDelNivel(conduccion())).toEqual([
      { desdeM: 0, hastaM: 1000, cota: 3150 },
      { desdeM: 1000, hastaM: 2000, cota: 3100 },
      { desdeM: 2000, hastaM: 2950, cota: 3050 },
    ])
  })
})
