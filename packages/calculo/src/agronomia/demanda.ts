import { coeficienteDeCultivo, duracionDelCiclo, etapaDelDia, primerDiaSinRiego, type Cultivo, type Etapa } from './cultivo'
import { lluviaEfectivaMensual } from './lluvia'

/** Clima de un mes: ET0 media diaria y lluvia total. Llega del SENAMHI; el estudiante no lo escribe. */
export interface ClimaMensual {
  et0MmDia: number
  lluviaMm: number
}

export interface DiaDeCampana {
  /** Día del ciclo, desde 1. */
  dia: number
  /** Fecha en formato AAAA-MM-DD. */
  fecha: string
  etapa: Etapa
  kc: number
  etcMm: number
  lluviaEfectivaMm: number
  /** Lo que el cultivo consume menos la lluvia efectiva, nunca menos de cero: la necesidad sin restricción. */
  necesidadPlenaMm: number
  /**
   * Lo que el riego repone ese día. Es la necesidad plena, salvo en la maduración de los cultivos que la tienen: ahí
   * se riega a lo más lo de la semana crítica, y nada desde el corte del riego.
   */
  demandaNetaMm: number
  riego: 'pleno' | 'limitado' | 'suspendido'
}

export interface SemanaDeCampana {
  /** Semana del ciclo, desde 1. */
  semana: number
  /** Días de la semana dentro del ciclo: siete, salvo quizá la última. */
  dias: number
  etcMm: number
  lluviaEfectivaMm: number
  demandaNetaMm: number
  /** La demanda neta por hectárea: 1 mm sobre 1 ha son 10 m³. */
  demandaNetaM3Ha: number
  /** Lo que el cultivo consume menos la lluvia, sin el límite de la maduración. Sin el dato, es la demanda neta. */
  necesidadPlenaMm?: number
  /** Si la semana cuenta para elegir la semana crítica: no cuentan las de la maduración. Sin el dato, cuenta. */
  cuentaParaElDiseno?: boolean
}

const M3_HA_POR_MM = 10

function leerFecha(fecha: string) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  const [anio, mes, dia] = partes ? [Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])] : [NaN, NaN, NaN]
  const tiempo = Date.UTC(anio, mes, dia)
  const leida = new Date(tiempo)
  if (Number.isNaN(tiempo) || leida.getUTCMonth() !== mes || leida.getUTCDate() !== dia) {
    throw new Error(`La fecha de siembra ${fecha} no es una fecha válida (AAAA-MM-DD)`)
  }
  return tiempo
}

const MS_POR_DIA = 86_400_000

/**
 * Demanda de agua de la campaña, día por día y semana por semana, desde la fecha de siembra.
 * ETc = Kc del día · ET0 del mes (FAO 56); la lluvia efectiva del mes se reparte en partes iguales entre
 * sus días. La semana crítica es la de mayor demanda neta diaria: es la base del diseño, no el promedio. En los
 * cultivos con maduración (papa, granos secos), la etapa final no la elige y se riega a lo más con ella.
 */
export function demandaDeLaCampana({
  cultivo,
  fechaSiembra,
  clima,
}: {
  cultivo: Cultivo
  fechaSiembra: string
  /** Doce meses, de enero a diciembre. */
  clima: readonly ClimaMensual[]
}) {
  if (clima.length !== 12) throw new Error(`Se necesita el clima de los doce meses y llegaron ${clima.length}`)
  const inicio = leerFecha(fechaSiembra)

  const duracion = duracionDelCiclo(cultivo)
  const sinRiegoDesde = primerDiaSinRiego(cultivo)
  const conMaduracion = cultivo.maduracion !== undefined
  const dias: DiaDeCampana[] = []
  for (let dia = 1; dia <= duracion; dia++) {
    const fecha = new Date(inicio + (dia - 1) * MS_POR_DIA)
    const mes = fecha.getUTCMonth()
    const diasDelMes = new Date(Date.UTC(fecha.getUTCFullYear(), mes + 1, 0)).getUTCDate()
    const kc = coeficienteDeCultivo(cultivo, dia)
    const etcMm = kc * clima[mes]!.et0MmDia
    const lluviaEfectivaMm = lluviaEfectivaMensual(clima[mes]!.lluviaMm) / diasDelMes
    const necesidadPlenaMm = Math.max(0, etcMm - lluviaEfectivaMm)
    dias.push({
      dia,
      fecha: fecha.toISOString().slice(0, 10),
      etapa: etapaDelDia(cultivo, dia),
      kc,
      etcMm,
      lluviaEfectivaMm,
      necesidadPlenaMm,
      demandaNetaMm: necesidadPlenaMm,
      riego: 'pleno',
    })
  }

  // La etapa de cada semana es la de su día central. En los cultivos con maduración, las semanas de la etapa final no
  // eligen la semana crítica: si las lluvias se acaban al final del ciclo, la necesidad sube cuando el cultivo ya
  // casi no responde al agua, y diseñar para ella sería diseñar para lo que el cultivo no aprovecha.
  const semanasDe = (campo: 'demandaNetaMm' | 'necesidadPlenaMm') => {
    const lista: SemanaDeCampana[] = []
    for (let i = 0; i < dias.length; i += 7) {
      const deLaSemana = dias.slice(i, i + 7)
      const sumar = (c: 'etcMm' | 'lluviaEfectivaMm' | 'demandaNetaMm' | 'necesidadPlenaMm') =>
        deLaSemana.reduce((suma, d) => suma + d[c], 0)
      const demandaNetaMm = sumar(campo)
      const central = deLaSemana[Math.floor(deLaSemana.length / 2)]!
      lista.push({
        semana: lista.length + 1,
        dias: deLaSemana.length,
        etcMm: sumar('etcMm'),
        lluviaEfectivaMm: sumar('lluviaEfectivaMm'),
        demandaNetaMm,
        demandaNetaM3Ha: demandaNetaMm * M3_HA_POR_MM,
        necesidadPlenaMm: sumar('necesidadPlenaMm'),
        cuentaParaElDiseno: !conMaduracion || central.etapa !== 'final',
      })
    }
    return lista
  }
  const elegirCritica = (lista: SemanaDeCampana[]) => {
    const candidatas = lista.some((s) => s.cuentaParaElDiseno) ? lista.filter((s) => s.cuentaParaElDiseno) : lista
    // La última semana puede ser corta: se comparan demandas diarias, no totales.
    return candidatas.reduce((mayor, s) => (s.demandaNetaMm / s.dias > mayor.demandaNetaMm / mayor.dias ? s : mayor))
  }

  if (conMaduracion) {
    // En la maduración se riega a lo más la demanda diaria de la semana crítica. Si esa semana ya trae días de la etapa
    // final, el tope los recorta y la semana baja, y el tope quedaba por encima de ella. Se busca el tope que no cambia
    // al aplicarlo, repitiendo hasta que se sostiene; converge rápido porque esos días son a lo más tres de siete.
    let tope = Infinity
    for (let vuelta = 0; vuelta < 100; vuelta++) {
      for (const d of dias) {
        if (d.etapa !== 'final') continue
        if (d.dia >= sinRiegoDesde) Object.assign(d, { demandaNetaMm: 0, riego: 'suspendido' })
        else if (d.necesidadPlenaMm > tope) Object.assign(d, { demandaNetaMm: tope, riego: 'limitado' })
        else Object.assign(d, { demandaNetaMm: d.necesidadPlenaMm, riego: 'pleno' })
      }
      const c = elegirCritica(semanasDe('demandaNetaMm'))
      const sostenido = c.demandaNetaMm / c.dias
      if (Math.abs(sostenido - tope) <= 1e-12) break
      tope = sostenido
    }
  }

  const semanas = semanasDe('demandaNetaMm')
  const critica = elegirCritica(semanas)
  const diaCentral = (critica.semana - 1) * 7 + Math.ceil(critica.dias / 2)
  const totalNetaMm = dias.reduce((suma, d) => suma + d.demandaNetaMm, 0)
  const totalPlenoMm = dias.reduce((suma, d) => suma + d.necesidadPlenaMm, 0)
  const maduracion = conMaduracion
    ? {
        /** Último día con riego, AAAA-MM-DD. */
        ultimoRiego: dias[sinRiegoDesde - 2]?.fecha ?? null,
        corteDelRiegoDias: cultivo.maduracion!.corteDelRiegoDias,
        /** Lo que en la maduración se deja de reponer frente a la necesidad plena, mm. */
        deficitMm: totalPlenoMm - totalNetaMm,
      }
    : null

  return {
    dias,
    semanas,
    totalNetaMm,
    totalNetaM3Ha: totalNetaMm * M3_HA_POR_MM,
    maduracion,
    semanaCritica: critica.semana,
    etapaCritica: etapaDelDia(cultivo, diaCentral),
    /** Demanda neta diaria media de la semana crítica, mm/día: la que se usa para diseñar. */
    demandaNetaPicoMmDia: critica.demandaNetaMm / critica.dias,
    /** ETc diaria media de la semana crítica, mm/día: con ella se ajusta la fracción de agotamiento. */
    etcPicoMmDia: critica.etcMm / critica.dias,
    /**
     * Consumo máximo del cultivo, mm/día: la mayor ETc diaria de las semanas que cuentan para el diseño. Con ella se
     * dimensiona el riego (paso 4), sin descontar la lluvia: la lluvia media del mes, repartida en partes iguales, no
     * llega pareja, y el sistema tiene que poder regar una semana sin lluvia en plena etapa media (Keller y Bliesner,
     * 1990, diseñan con la ET de la época de mayor consumo). La lluvia sí cuenta en el agua de la campaña (paso 3).
     */
    etcDisenoMmDia: Math.max(...semanas.filter((s) => s.cuentaParaElDiseno !== false).map((s) => s.etcMm / s.dias)),
  }
}
