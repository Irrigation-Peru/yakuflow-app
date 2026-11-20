import {
  aptitudDelCultivo,
  balanceHidrico,
  CATALOGO_FAO56,
  demandaDeLaCampana,
  disenoDelRiego,
  duracionDelCiclo,
  demandaDeDiseno,
  eficienciaDelBalance,
  eficienciaDeRiego,
  eficienciaDelMetodo,
  emisorDelCatalogo,
  mejorFechaDeSiembra,
  metodoDeRiego,
  metodoMasEficiente,
  metodosDelCultivo,
  type AjusteDelBalance,
  type ClaseTextural,
  type Etapa,
  type LugarDelCultivo,
  type MetodoDeRiego,
  type TipoDeFuente,
} from '@riego/calculo'
import { proximaFecha } from '../fechas.ts'

// Lo que las pantallas de los pasos 2 a 4 piden al módulo de cálculo, armado en un solo lugar. Corre en el hilo del
// cálculo; el servidor arma lo mismo con las mismas funciones del módulo antes de guardar.

export function cultivoLlamado(nombre: string) {
  const cultivo = CATALOGO_FAO56.find((c) => c.nombre === nombre)
  if (!cultivo) throw new Error(`El cultivo ${nombre} no está en el catálogo`)
  return cultivo
}

export interface EtapaDelCalendario {
  etapa: Etapa
  desde: string
  hasta: string
  dias: number
}

/**
 * El cultivo sembrado en una fecha: su aptitud para el lugar, el calendario de etapas y la demanda de su semana
 * crítica. Sin fecha, la mejor siembra del año para ese cultivo, la próxima vez que llega.
 */
export function campanaDelCultivo({ cultivo: nombre, fechaSiembra, lugar }: { cultivo: string; fechaSiembra?: string; lugar: LugarDelCultivo }) {
  const cultivo = cultivoLlamado(nombre)
  const fecha = fechaSiembra ?? proximaFecha(mejorFechaDeSiembra({ cultivo, lugar }).fechaSiembra)
  const demanda = demandaDeLaCampana({ cultivo, fechaSiembra: fecha, clima: lugar.clima })
  const calendario: EtapaDelCalendario[] = []
  for (const dia of demanda.dias) {
    const ultima = calendario.at(-1)
    if (ultima?.etapa === dia.etapa) Object.assign(ultima, { hasta: dia.fecha, dias: ultima.dias + 1 })
    else calendario.push({ etapa: dia.etapa, desde: dia.fecha, hasta: dia.fecha, dias: 1 })
  }
  return {
    cultivo: nombre,
    fechaSiembra: fecha,
    duracionDias: duracionDelCiclo(cultivo),
    aptitud: aptitudDelCultivo({ cultivo, fechaSiembra: fecha, lugar }),
    calendario,
    semanaCritica: demanda.semanaCritica,
    etapaCritica: demanda.etapaCritica,
    demandaNetaPicoMmDia: demanda.demandaNetaPicoMmDia,
    totalNetaMm: demanda.totalNetaMm,
    /** En la papa y los granos secos: hasta cuándo se riega y cuánto se deja de reponer en la maduración. */
    maduracion: demanda.maduracion,
  }
}

export type CampanaDelCultivo = ReturnType<typeof campanaDelCultivo>

/** Todos los cultivos del catálogo en el lugar, para el que quiera escribir otro (HU0012). */
export const cultivosDelCatalogo = () => CATALOGO_FAO56.map((c) => c.nombre)

export interface FuenteDelBalance {
  tipo: TipoDeFuente
  caudalLps: number
  horasDisponiblesDia: number
  /** Calidad del agua, dS/m: si es salina, la necesidad bruta incluye el lavado (FAO 29). */
  conductividadDsM?: number | null
}

/**
 * Lo que pide el cultivo semana a semana contra lo que da la fuente (HU0013), con el ajuste que se quiera probar
 * (HU0014). Se comprueba con la eficiencia del método más eficiente del cultivo, como en el servidor.
 */
export function aguaDeLaCampana({
  cultivo: nombre,
  fechaSiembra,
  lugar,
  fuente,
  areaHa,
  ajuste,
}: {
  cultivo: string
  fechaSiembra: string
  lugar: LugarDelCultivo
  fuente: FuenteDelBalance
  areaHa: number
  ajuste?: AjusteDelBalance
}) {
  const cultivo = cultivoLlamado(nombre)
  const demanda = demandaDeLaCampana({ cultivo, fechaSiembra, clima: lugar.clima })
  const metodo = metodoMasEficiente(metodosDelCultivo(cultivo))
  const eficiencia = eficienciaDelBalance(cultivo, fuente.conductividadDsM)
  const riego = eficienciaDeRiego({ metodo, conductividadDelAguaDsM: fuente.conductividadDsM, salinidad: cultivo.requisitos?.salinidad })
  const balance = balanceHidrico({ semanas: demanda.semanas, areaHa, eficiencia, fuente, ajuste, demandaDeDisenoMmDia: demandaDeDiseno(demanda) })
  // La etapa de cada semana es la de su día central.
  const etapas = demanda.semanas.map((s) => demanda.dias[(s.semana - 1) * 7 + Math.floor(s.dias / 2)]!.etapa)
  return {
    /** El método con cuya eficiencia se comprueba el agua: el más eficiente de los que admite el cultivo. */
    metodo,
    eficiencia,
    /** El agua que se aplica de más para lavar las sales, si la calidad del agua lo pide (FAO 29); si no, nulo. */
    lavado: riego.mandaElLavado ? { requerimiento: riego.lavado, aplicacion: riego.aplicacion } : null,
    etapaCritica: demanda.etapaCritica,
    demandaNetaPicoMmDia: demanda.demandaNetaPicoMmDia,
    semanas: balance.semanas.map((s, i) => {
      const d = demanda.semanas[i]!
      // Todo en litros por segundo de riego, en las horas de riego del día: así se apila con lo que hay que regar.
      const lps = (mm: number) => (mm * 10 * balance.areaHa) / eficiencia / (3.6 * balance.horasDeRiegoPorDia * s.dias)
      const consumoLps = lps(d.etcMm)
      const lluviaLps = Math.min(consumoLps, lps(Math.min(d.lluviaEfectivaMm, d.etcMm)))
      return {
        ...s,
        etapa: etapas[i]!,
        demandaNetaMm: d.demandaNetaMm,
        /** Lo que consume el cultivo esa semana, como si no lloviera nada, l/s de riego. */
        consumoLps,
        /** La parte que pone la lluvia de un año normal, l/s. */
        lluviaLps,
        /** En la maduración, lo que se deja de regar a propósito, l/s. */
        sinRegarLps: Math.max(0, consumoLps - lluviaLps - s.necesidadLps),
        etcMmDia: d.etcMm / s.dias,
        lluviaMmDia: Math.min(d.lluviaEfectivaMm, d.etcMm) / s.dias,
        netaMmDia: d.demandaNetaMm / s.dias,
        cuentaParaElDiseno: d.cuentaParaElDiseno !== false,
      }
    }),
    /** La semana que más consume sin contar la lluvia: con ella se diseña el riego (paso 4). */
    semanaDeMayorConsumo: demanda.semanas
      .filter((s) => s.cuentaParaElDiseno !== false)
      .reduce((mayor, s) => (s.etcMm / s.dias > mayor.etcMm / mayor.dias ? s : mayor), demanda.semanas.find((s) => s.cuentaParaElDiseno !== false) ?? demanda.semanas[0]!).semana,
    balance,
  }
}

export type AguaDeLaCampana = ReturnType<typeof aguaDeLaCampana>

export interface EleccionDelRiego {
  metodo: MetodoDeRiego
  emisor: string
  separacionM: number
  separacionLateralesM: number
  intervaloDias?: number
  tiempoDelCorteH?: number
}

/**
 * El paso 4: qué método recomienda el lugar y por qué el otro no (HU0015), y, con lo que el estudiante elige, el diseño
 * agronómico y el corte del suelo (HU0016). El agua se vuelve a comprobar con la eficiencia del método elegido.
 */
export function riegoDeLaCampana({
  cultivo: nombre,
  fechaSiembra,
  lugar,
  suelo,
  cargaDisponibleM,
  fuente,
  areaHa,
  ajuste,
  eleccion,
}: {
  cultivo: string
  fechaSiembra: string
  lugar: LugarDelCultivo
  suelo: { clase: ClaseTextural; capacidadDeCampo: number; puntoDeMarchitez: number; infiltracionBasicaMmH: number }
  cargaDisponibleM: number
  fuente: FuenteDelBalance
  areaHa: number
  ajuste?: AjusteDelBalance
  eleccion: EleccionDelRiego | null
}) {
  const cultivo = cultivoLlamado(nombre)
  const metodos = metodoDeRiego({ cultivo, cargaDisponibleM, infiltracionBasicaMmH: suelo.infiltracionBasicaMmH })
  if (!eleccion) return { metodos, balance: null, diseno: null }
  const demanda = demandaDeLaCampana({ cultivo, fechaSiembra, clima: lugar.clima })
  const balance = balanceHidrico({ semanas: demanda.semanas, areaHa, eficiencia: eficienciaDelMetodo(eleccion.metodo, cultivo, fuente.conductividadDsM), fuente, ajuste, demandaDeDisenoMmDia: demandaDeDiseno(demanda) })
  const emisor = emisorDelCatalogo(eleccion.emisor)
  const diseno =
    emisor.metodo === eleccion.metodo && demanda.demandaNetaPicoMmDia > 0
      ? disenoDelRiego({
          conductividadDelAguaDsM: fuente.conductividadDsM,
          cultivo,
          metodo: eleccion.metodo,
          emisor,
          separacionM: eleccion.separacionM,
          separacionLateralesM: eleccion.separacionLateralesM,
          intervaloDias: eleccion.intervaloDias,
          demanda,
          suelo,
          areaHa: balance.areaHa,
          horasDeRiegoPorDia: balance.horasDeRiegoPorDia,
          fuente: { caudalLps: balance.caudalLps, reservorioM3: ajuste?.tipo === 'reservorio' ? ajuste.volumenM3 : undefined },
          tiempoDelCorteH: eleccion.tiempoDelCorteH,
        })
      : null
  return { metodos, balance, diseno }
}

export type RiegoDeLaCampana = ReturnType<typeof riegoDeLaCampana>
