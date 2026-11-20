import type { LugarDelProyecto } from './api/tipos.ts'
import { cifra } from './formato.ts'

// Lo que el paso 1 dice del desnivel. El disponible va de la fuente al punto más alto de la parcela, y el
// máximo, al más bajo: solo si el punto más bajo queda debajo de la fuente tiene sentido hablar de su presión.
// Las cámaras rompe-presión, cuando hacen falta, las cuenta la lectura de la conducción.

export function lecturaDelDesnivel({ disponibleM, maximoM }: NonNullable<LugarDelProyecto['desnivel']>) {
  const nota = `Se mide de la fuente al punto más alto de la parcela, y de ahí sale la presión para regar.${
    maximoM > 0 ? ` Hasta el punto más bajo baja ${cifra(maximoM, 1)} m: ahí la presión será la más alta.` : ''
  }`
  const alertas: string[] = []
  if (maximoM <= 0)
    alertas.push('La fuente está por debajo de toda la parcela. Sin bombeo, el agua no llega por gravedad: busca otra fuente o cambia la parcela.')
  else if (disponibleM <= 0)
    alertas.push(
      'La fuente está por debajo del punto más alto de la parcela. Sin bombeo, el agua no llega a la parte alta: busca otra fuente o cambia la parcela.',
    )
  return { nota, alertas }
}
