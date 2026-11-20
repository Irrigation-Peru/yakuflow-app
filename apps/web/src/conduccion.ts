import { DESNIVEL_MAXIMO_SIN_CRP_M } from '@riego/calculo'
import type { LugarDelProyecto } from './api/tipos.ts'
import { cifra, conDecimales } from './formato.ts'

// Lo que el paso 1 dice de la conducción de la fuente a la parcela. Las cámaras las ubica el módulo de cálculo
// en el servidor; aquí solo se cuentan y se nombran.

type Conduccion = NonNullable<LugarDelProyecto['conduccion']>
type Desnivel = NonNullable<LugarDelProyecto['desnivel']>

export function lecturaDeLaConduccion({ perfil, camaras, camarasDentroDeLaParcela, sobreElNivel }: Conduccion, desnivel: Desnivel) {
  // Con la fuente debajo de la parcela no hay conducción por gravedad: eso ya lo dice el desnivel.
  if (desnivel.disponibleM <= 0) return null
  const n = camaras.length
  const resumen =
    n === 0
      ? `La tubería de la fuente a la parcela no necesita cámaras rompe-presión: aun con las válvulas cerradas, en ningún tramo la presión pasa de ${DESNIVEL_MAXIMO_SIN_CRP_M} m.`
      : `La tubería de la fuente a la parcela necesita ${n} ${n === 1 ? 'cámara' : 'cámaras'} rompe-presión. Sin ${n === 1 ? 'ella' : 'ellas'}, al cerrar las válvulas la presión pasaría de ${DESNIVEL_MAXIMO_SIN_CRP_M} m en algún tramo y el tubo podría reventar.`
  const avisos: string[] = []
  if (sobreElNivel)
    avisos.push(
      `A ${conDecimales(sobreElNivel.distanciaM, 0)} m de la fuente, el terreno sube ${cifra(sobreElNivel.alturaM, 1)} m por encima del nivel del agua: en línea recta, el agua no pasa por ahí. Habrá que enterrar más la tubería o rodear ese punto.`,
    )
  if (camarasDentroDeLaParcela > 0)
    avisos.push(
      camarasDentroDeLaParcela === 1
        ? 'La parcela tiene tanto desnivel que hará falta una cámara rompe-presión dentro de ella. La verás en el paso 5, al generar la red.'
        : `La parcela tiene tanto desnivel que harán falta ${camarasDentroDeLaParcela} cámaras rompe-presión dentro de ella: así a la parte alta le llega presión y la baja no pasa de ${DESNIVEL_MAXIMO_SIN_CRP_M} m. Las verás en el paso 5, al generar la red.`,
    )
  return {
    resumen,
    camaras: camaras.map((c, i) => `CRP ${i + 1}: a ${conDecimales(c.distanciaM, 0)} m de la fuente, a ${conDecimales(c.cota, 0)} m de altitud`),
    llegada: `El agua llega a la parcela con su nivel a ${conDecimales((camaras.at(-1) ?? perfil[0]!).cota, 0)} m, la línea discontinua del perfil: cuanto más abajo de ella queda un punto, más presión tiene.`,
    avisos,
  }
}

/** El nivel libre del agua a lo largo de la conducción: el de la fuente hasta la primera cámara, y así. */
export function tramosDelNivel({ perfil, camaras }: Conduccion) {
  const cortes = [{ distanciaM: 0, cota: perfil[0]!.cota }, ...camaras]
  return cortes.map((c, i) => ({ desdeM: c.distanciaM, hastaM: cortes[i + 1]?.distanciaM ?? perfil.at(-1)!.distanciaM, cota: c.cota }))
}
