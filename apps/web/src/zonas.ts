import { cotaEnGrilla, DESNIVEL_MAXIMO_SIN_CRP_M, DESNIVEL_MINIMO_GOTEO_M, zonaParaLaFuente, type ZonaParaLaFuente } from '@riego/calculo'
import type { RelieveDelProyecto } from './api/tipos.ts'
import type { Punto } from './estado/lugar.ts'

// Cómo se llaman y cómo se ven las zonas para ubicar la fuente. Son colores de estado (bien, atención, problema),
// con la zona de sobra en violeta para que no se confunda con la adecuada aunque se vea con daltonismo. Ninguna
// zona se reconoce solo por su color: la leyenda y la lectura bajo el cursor dicen su nombre.

export const ZONA: Readonly<Record<ZonaParaLaFuente, { nombre: string; detalle: string; color: string }>> = {
  no_llega: {
    nombre: 'No llega',
    detalle: 'Debajo del punto más alto de la parcela: sin bombeo, el agua no sube hasta ahí.',
    color: '#d03b3b',
  },
  poca_presion: {
    nombre: 'Poca presión',
    detalle: `Menos de ${DESNIVEL_MINIMO_GOTEO_M} m sobre el punto más alto: no alcanza para regar a presión.`,
    color: '#e0a420',
  },
  adecuada: {
    nombre: 'Adecuada',
    detalle: `${DESNIVEL_MINIMO_GOTEO_M} m o más sobre el punto más alto, y hasta ${DESNIVEL_MAXIMO_SIN_CRP_M} m sobre el más bajo.`,
    color: '#0ca30c',
  },
  necesita_crp: {
    nombre: 'Necesita cámaras rompe-presión',
    detalle: `Más de ${DESNIVEL_MAXIMO_SIN_CRP_M} m sobre el punto más bajo: llega, pero la red tendrá que romper la presión.`,
    color: '#5b5bd6',
  },
}

/** La cota y la zona de un punto del mapa; fuera del relieve consultado, null. */
export function zonaEn({ grilla, parcela }: RelieveDelProyecto, punto: Punto) {
  const cota = cotaEnGrilla(grilla, punto)
  if (cota === null) return null
  return { cota, zona: zonaParaLaFuente(cota, { cotaMasAlta: parcela.masAlto.cota, cotaMasBaja: parcela.masBajo.cota }) }
}
