import type { Bd } from '../src/bd.ts'

const alternativas = [
  { letra: 'a', texto: 'Primera' },
  { letra: 'b', texto: 'Segunda' },
  { letra: 'c', texto: 'Tercera' },
]

/** Dos ítems por forma: alcanza para recorrer la prueba sin depender del banco real. */
export async function cargarItemsDePrueba(bd: Bd) {
  await bd.itemInstrumento.createMany({
    data: [
      { codigo: 'A1', forma: 'A', concepcionErronea: 'CE1', nivelCognitivo: 'comprender', enunciado: '¿A1?', alternativas, clave: 'a' },
      { codigo: 'A2', forma: 'A', concepcionErronea: 'CE5', nivelCognitivo: 'analizar', enunciado: '¿A2?', alternativas, clave: 'b' },
      { codigo: 'B1', forma: 'B', concepcionErronea: 'CE1', nivelCognitivo: 'comprender', enunciado: '¿B1?', alternativas, clave: 'c' },
      { codigo: 'B2', forma: 'B', concepcionErronea: 'CE5', nivelCognitivo: 'analizar', enunciado: '¿B2?', alternativas, clave: 'a' },
    ],
  })
}
