import type { EvaluacionDeCondicion } from '@riego/calculo'
import { describe, expect, it } from 'vitest'
import { fraseDeCondicion, lecturaDeCondicion, listaDeCondiciones } from '../src/condiciones.ts'

// Cómo se cuenta cada condición del lugar frente a lo que el cultivo necesita: en una frase completa, con el cultivo
// por su nombre, y no como «6.4; óptimo de 6.5 a 7.5; prospera de 6.0 a 8.0».

const condicion = (c: Record<string, unknown>) => c as unknown as EvaluacionDeCondicion
const rango = { minimo: 6, optimoMinimo: 6.5, optimoMaximo: 7.5, maximo: 8 }

describe('la condición en una frase', () => {
  it('el pH dice lo que tiene el suelo y lo que le va mejor al cultivo', () => {
    const texto = fraseDeCondicion(condicion({ condicion: 'ph', nivel: 'marginal', valor: 6.4, rango }), 'Cebada')
    expect(texto).toBe('Tu suelo tiene pH 6.4. A la cebada le va mejor entre 6.5 y 7.5, y aguanta de 6 a 8.')
  })

  it('la helada, con el aviso cuando el frío queda cerca de lo que el cultivo resiste', () => {
    const lejos = fraseDeCondicion(condicion({ condicion: 'helada', nivel: 'optima', minimaC: 5.5, letalC: 0 }), 'Arveja, verde')
    expect(lejos).toBe('En el mes más frío de la campaña, las noches bajan en promedio a 5.5 °C, y la arveja verde se daña por debajo de 0 °C.')
    const cerca = fraseDeCondicion(condicion({ condicion: 'helada', nivel: 'marginal', minimaC: 1.5, letalC: 0 }), 'Arveja, verde')
    expect(cerca).toContain('alguna noche puede helar')
    // Bajo la temperatura letal ya no se descarta: se avisa del riesgo alto y de qué hacer.
    const bajo = fraseDeCondicion(condicion({ condicion: 'helada', nivel: 'marginal', minimaC: -2, letalC: 0 }), 'Papa')
    expect(bajo).toContain('el riesgo es alto')
    expect(bajo).toContain('variedad resistente a la helada')
  })

  it('la altitud por encima de la habitual se lee como riesgo, no como imposible', () => {
    const alto = fraseDeCondicion(condicion({ condicion: 'altitud', nivel: 'marginal', valorM: 4300, maximoM: 4200 }), 'Papa')
    expect(alto).toContain('por encima de los 4,200 m')
    expect(alto).toContain('variedad adaptada a la altura')
  })

  it('el agua compara lo que da la fuente con lo que pide el cultivo, contando lo que se pierde al regar', () => {
    const texto = fraseDeCondicion(condicion({ condicion: 'agua', nivel: 'marginal', ofertaMmDia: 1.2, necesidadMmDia: 1.5, metodo: 'goteo' }), 'Maíz, grano')
    expect(texto).toBe(
      'Tu fuente puede darle a la parcela 1.2 mm al día. En su semana de más demanda, el maíz en grano necesita 1.5 mm al día, contando lo que se pierde al regar por goteo.',
    )
  })

  it('las sales dicen cuánto de la cosecha se perdería', () => {
    const texto = fraseDeCondicion(
      condicion({ condicion: 'salinidad', nivel: 'marginal', conductividadDelAguaDsM: 2, salinidadDelSueloDsM: 3, umbralDsM: 1.7, perdidaPct: 12 }),
      'Papa',
    )
    expect(texto).toBe('Con el agua de tu fuente, el suelo llegaría a 3 dS/m de sales. La papa rinde completo hasta 1.7 dS/m; aquí perdería el 12 % de la cosecha.')
  })
})

describe('la tabla de condiciones', () => {
  it('lo que necesita el cultivo, sin «óptimo» ni «prospera»', () => {
    const l = lecturaDeCondicion(condicion({ condicion: 'temperatura', nivel: 'optima', valorC: 15.8, rango: { minimo: 7, optimoMinimo: 15, optimoMaximo: 25, maximo: 30 } }))
    expect(l.pide).toBe('mejor entre 15 y 25 °C; aguanta de 7 a 30 °C')
    expect(l.valor).toBe('15.8 °C')
  })
})

describe('lo que favorece y lo que juega en contra', () => {
  it('en singular y en plural', () => {
    expect(listaDeCondiciones(['la altitud'], 'favor')).toBe('Le favorece la altitud.')
    expect(listaDeCondiciones(['la altitud', 'el pH'], 'favor')).toBe('Le favorecen la altitud y el pH.')
    expect(listaDeCondiciones(['el agua de la fuente'], 'contra')).toBe('Le juega en contra el agua de la fuente.')
    expect(listaDeCondiciones([], 'contra')).toBe('Nada le juega en contra.')
    expect(listaDeCondiciones([], 'favor')).toBe('Ninguna condición está en su punto ideal.')
  })
})
