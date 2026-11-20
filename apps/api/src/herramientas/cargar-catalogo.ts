import { readFileSync } from 'node:fs'
import { cargarCatalogo } from '../catalogo.ts'
import { crearBd } from '../bd.ts'

// Carga un catálogo de precios desde un archivo JSON: pnpm --filter @riego/api cargar-catalogo <archivo>. Pasa a ser el
// vigente sin tocar el código. Como el costo entra al modelo de optimización, con precios nuevos conviene reentrenarlo.

const [archivo] = process.argv.slice(2)
if (!archivo) {
  console.error('Falta el archivo: cargar-catalogo <archivo.json>')
  process.exit(1)
}
const url = process.env.DATABASE_URL
if (!url) {
  console.error('Falta DATABASE_URL')
  process.exit(1)
}
const bd = crearBd(url)
const fila = await cargarCatalogo(bd, JSON.parse(readFileSync(archivo, 'utf8')))
console.log(`Catálogo ${fila.version} cargado${fila.provisional ? ' (provisional)' : ''}.`)
await bd.$disconnect()
