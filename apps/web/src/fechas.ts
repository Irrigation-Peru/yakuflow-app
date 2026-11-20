// Las fechas de siembra se proponen sin año: la más apta, que sale del módulo de cálculo sobre un año de referencia, y
// el mes que sugiere el modelo de cultivos. Al estudiante se le propone la próxima vez que llega ese día, contado desde
// hoy en su equipo.

const dosCifras = (n: number) => String(n).padStart(2, '0')

/** El próximo día 1 de un mes, de 1 (enero) a 12, hoy incluido. */
export const proximoPrimeroDelMes = (mes: number, hoy = new Date()) => proximaFecha(`2000-${dosCifras(mes)}-01`, hoy)

/** La próxima vez que llega el día y el mes de una fecha AAAA-MM-DD, hoy incluido. */
export function proximaFecha(fechaDeReferencia: string, hoy = new Date()) {
  const [, mes, dia] = fechaDeReferencia.split('-')
  const anio = hoy.getFullYear()
  const deHoy = `${anio}-${dosCifras(hoy.getMonth() + 1)}-${dosCifras(hoy.getDate())}`
  const esteAnio = `${anio}-${mes}-${dia}`
  return esteAnio >= deHoy ? esteAnio : `${anio + 1}-${mes}-${dia}`
}
