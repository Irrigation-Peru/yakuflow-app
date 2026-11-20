// Lo que devuelve la API, tal como lo usan las pantallas.

import type { AjusteDelBalance, Alerta, CambioDeRed, ClaseTextural, MetodoDeRiego, NormalDelMes } from '@riego/calculo'
import type { Punto } from '../estado/lugar.ts'

export interface EstadoDelRecorrido {
  usuario: { id: string; nombres: string; correo: string }
  consentimiento: boolean
  pruebaDeEntrada: 'pendiente' | 'en_curso' | 'terminada'
  falta: string[]
  recorridoHabilitado: boolean
  /** La prueba de salida se abre al terminar el recorrido. */
  salidaHabilitada: boolean
  pruebaDeSalida: 'pendiente' | 'en_curso' | 'terminada'
}

export interface Consentimiento {
  version: string
  texto: string
}

export interface ItemDePrueba {
  id: string
  enunciado: string
  alternativas: { letra: string; texto: string }[]
  marcada: string | null
}

export interface ProyectoResumen {
  id: string
  nombre: string
  pasoAlcanzado: number
  creadoEn: string
}

export interface FuenteDeElevacion {
  nombre: string
  resolucionM: number
  respaldo: boolean
}

export type TipoDeFuente = 'canal' | 'manantial' | 'reservorio'
export type OrigenDelDato = 'campo' | 'declarado'

export interface DatosDeLaFuente extends Punto {
  tipo: TipoDeFuente
  caudalLps: number
  conductividadDsM: number | null
  horasDisponiblesDia: number
  origenDato: OrigenDelDato
}

/** Lo que el estudiante decidió en los pasos 2 a 4, tal como quedó guardado. */
export interface ResumenDeLaCampana {
  campania: { cultivo: string; fechaSiembra: string; duracionDias: number; areaSembradaHa: number } | null
  decisionBalance: {
    salida: AjusteDelBalance['tipo'] | 'cambio_cultivo'
    volumenReservorioM3: number | null
    areaAjustadaHa: number | null
    parametros: { ajuste: AjusteDelBalance }
  } | null
  disenoAgronomico: {
    metodo: MetodoDeRiego
    emisor: string
    separacionM: number
    separacionLateralesM: number
    intervaloDias: number
    laminaNetaMm: number
    laminaBrutaMm: number
    tiempoDeRiegoH: number
    intensidadMmH: number
    areaMojadaPct: number | null
    eficiencia: number
  } | null
  /** La última versión guardada de la red. */
  red: {
    version: number
    origen: 'modulo' | 'ml' | 'estudiante'
    cambios: CambioDeRed[]
    funciono: boolean
    uniformidadPct: number | null
    presionMinMca: number | null
    presionMaxMca: number | null
    costoTotal: number | null
  } | null
}

/** Lo que devuelve el servidor al guardar la red: además del avance, su propio análisis. */
export interface RedGuardada extends AvanceDeLaCampana {
  alertas: Alerta[]
  funciona: boolean
}

/** Lo que devuelven las rutas de los pasos 2 a 4 al guardar. */
export interface AvanceDeLaCampana extends ResumenDeLaCampana {
  id: string
  pasoAlcanzado: number
  resultadosDesactualizados: number[]
}

export interface LugarDelProyecto extends ResumenDeLaCampana {
  id: string
  nombre: string
  pasoAlcanzado: number
  /** Pasos ya hechos cuyo resultado depende de algo que cambió después. */
  resultadosDesactualizados: number[]
  /** La carga con que el agua llega al punto más alto de la parcela, desde el nivel libre. */
  cargaDisponibleM: number | null
  parcela: {
    contorno: Punto[]
    areaHa: number
    pendienteMediaPct: number
    altitudMsnm: number
    centroide: Punto
    perfil: { distanciaM: number; cota: number }[]
  } | null
  fuente: (DatosDeLaFuente & { cotaMsnm: number; aguaDisponible: { m3PorDia: number; m3PorSemana: number } }) | null
  desnivel: { disponibleM: number; maximoM: number } | null
  /** De la fuente al centro de la parcela, con sus cámaras rompe-presión. */
  conduccion: {
    perfil: { distanciaM: number; cota: number }[]
    camaras: (Punto & { distanciaM: number; cota: number })[]
    nivelFinalM: number
    camarasDentroDeLaParcela: number
    /** Lo más que sube el terreno por encima del nivel del agua en la línea recta, y dónde. */
    sobreElNivel: { alturaM: number; distanciaM: number } | null
  } | null
  elevacion: FuenteDeElevacion | null
}

/** El relieve alrededor de la parcela, para ubicar la fuente (GET /proyectos/:id/relieve). */
export interface RelieveDelProyecto {
  grilla: { latSur: number; lonOeste: number; pasoGrados: number; filas: number; columnas: number; cotas: number[] }
  parcela: { masAlto: Punto & { cota: number }; masBajo: Punto & { cota: number } }
  elevacion: FuenteDeElevacion
}

/** Una bocatoma, una toma o una laguna del inventario de la ANA, cerca de la parcela. No trae caudal: ese lo mides. */
export interface PuntoDeReferencia extends Punto {
  tipo: 'bocatoma' | 'toma' | 'laguna'
  nombre: string | null
  fuenteNatural: string | null
  altitudMsnm: number | null
  anioInventario: string | null
}

/** GET /proyectos/:id/fuentes-de-referencia. Si la ANA no respondió, sin puntos y con el aviso. */
export interface FuentesDeReferencia {
  puntos: PuntoDeReferencia[]
  fuente: { nombre: string; resolucion: string; respaldo: boolean }
  aviso: string | null
}

export interface SueloDelLugar {
  origen: 'satelital' | 'campo'
  clase: ClaseTextural
  arenaPct: number
  limoPct: number
  arcillaPct: number
  ph: number | null
  capacidadDeCampo: number
  puntoDeMarchitez: number
  infiltracionBasicaMmH: number
  fuente: string
  resolucion: string
}

/** El clima de los doce meses y el suelo del lugar, con su origen (GET /proyectos/:id/datos-del-lugar). */
export interface DatosDelLugar {
  clima: { meses: (NormalDelMes & { mes: number; et0MmDia: number })[]; fuente: string; resolucion: string } | null
  suelo: { satelital: SueloDelLugar | null; campo: SueloDelLugar | null; vigente: 'satelital' | 'campo' | null }
  errores: { clima?: string; suelo?: string }
}
