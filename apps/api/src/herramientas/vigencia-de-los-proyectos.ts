import '../entorno.ts'
import { crearBd } from '../bd.ts'
import type { ProveedoresDelLugar } from '../datos-del-lugar.ts'
import { vigenciaDelProyecto } from '../rutas/campana.ts'

// Qué proyectos guardados ya no cumplen las reglas de cálculo de hoy, y qué paso rehacer en cada uno. Solo lee: usa la
// misma revisión que GET /api/proyectos/:id/vigencia, con el clima y el suelo ya guardados; si un proyecto necesitara
// consultar un servicio externo, se informa y no se consulta.
//   `pnpm --filter @riego/api exec tsx src/herramientas/vigencia-de-los-proyectos.ts`

const url = process.env.DATABASE_URL
if (!url) throw new Error('Falta DATABASE_URL')
const bd = crearBd(url, 1)
const sinConsultar = () => {
  throw new Error('haría falta consultar un servicio externo')
}
const proveedores = { clima: sinConsultar, suelo: sinConsultar } as unknown as ProveedoresDelLugar

const proyectos = await bd.proyecto.findMany({ where: { pasoAlcanzado: { gt: 3 }, estado: { not: 'eliminado' } }, include: { parcela: true, fuenteAgua: true }, orderBy: { creadoEn: 'asc' } })
let conAvisos = 0
for (const proyecto of proyectos) {
  try {
    const avisos = await vigenciaDelProyecto(bd, proveedores, proyecto)
    if (avisos.length === 0) continue
    conAvisos++
    const pasos = [...new Set(avisos.map((a) => a.paso))].join(', ')
    console.log(`${proyecto.nombre} (paso alcanzado ${proyecto.pasoAlcanzado}): rehacer desde el paso ${Math.min(...avisos.map((a) => a.paso))} · ${avisos.map((a) => a.codigo).join(', ')} [pasos ${pasos}]`)
  } catch (error) {
    console.log(`${proyecto.nombre}: no se pudo revisar (${error instanceof Error ? error.message : String(error)})`)
  }
}
console.log(`\n${proyectos.length} proyectos con el paso 3 hecho; ${conAvisos} ya no cumplen las reglas de hoy.`)
await bd.$disconnect()
