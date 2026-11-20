import type { LugarDelProyecto } from './api/tipos.ts'
import { cifra } from './formato.ts'

// Lo que el paso 1 dice junto al botón al guardar la fuente. Los resultados cambian más arriba, en el panel y en
// el mapa, fuera de la vista de quien acaba de pulsar el botón: aquí se resumen.

export function confirmacionDeLaFuente({ desnivel, conduccion }: Pick<LugarDelProyecto, 'desnivel' | 'conduccion'>) {
  if (!desnivel) return 'Guardamos la fuente. Ahora dibuja la parcela para medir el desnivel hasta ella.'
  if (desnivel.disponibleM <= 0) return 'Guardamos la fuente, pero el agua no llega por gravedad a toda la parcela: lee el aviso de arriba.'
  const n = conduccion?.camaras.length ?? 0
  const camaras = n === 0 ? 'no necesita cámaras' : `necesita ${n} ${n === 1 ? 'cámara' : 'cámaras'}`
  return `Guardamos la fuente. Tienes ${cifra(desnivel.disponibleM, 1)} m de desnivel, y la conducción ${camaras} rompe-presión.`
}
