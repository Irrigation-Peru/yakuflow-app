import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { Router } from 'express'
import helmet from 'helmet'
import { z } from 'zod'
import { datosDeLaCampania, datosDeLaDecision, datosDeLaRed, proyectoExportado, datosDelBalance, datosDelDiseno, datosDelSuelo, datosDeRecomendaciones } from './rutas/campana.ts'
import { datosDelConsentimiento } from './rutas/consentimiento.ts'
import { datosDeCuenta, datosDeSesion } from './rutas/cuenta.ts'
import { respuesta } from './rutas/evaluaciones.ts'
import { lote } from './rutas/eventos.ts'
import { datosDeFuente, datosDelProyecto, datosDeParcela } from './rutas/proyectos.ts'

// La documentación de la API para desarrollo: el contrato en OpenAPI 3.1 y Swagger UI para probarlo desde el
// navegador, en /api/docs. En producción no se monta (app.ts). Los cuerpos salen de los mismos esquemas zod con que
// valida cada ruta, así que no se desfasan; lo que devuelve cada una se cuenta con palabras. Las pruebas comprueban
// que cada operación documentada exista y que ninguna ruta quede sin documentar.

const requerir = createRequire(import.meta.url)

type Metodo = 'get' | 'post' | 'put' | 'delete'

// Las rutas se agrupan por contexto, con los nombres de la arquitectura lógica: los cuatro de la capa de negocio y el
// registro de actividad, y los módulos del recorrido (M1 a M4) que ya tienen rutas.
const ETIQUETAS = {
  salud: 'Salud',
  cuentas: 'Cuentas y permisos',
  evaluacion: 'Evaluación',
  registro: 'Registro de actividad',
  proyectos: 'Proyectos',
  estudios: 'Estudios básicos',
  cultivo: 'Selección del cultivo',
  balance: 'Balance hídrico',
  diseno: 'Diseño agronómico',
  red: 'Generación de la red',
  simulacion: 'Simulación del funcionamiento',
  catalogo: 'Catálogo de precios',
} as const

const DESCRIPCION_DE_LAS_ETIQUETAS: Readonly<Record<keyof typeof ETIQUETAS, string>> = {
  salud: 'Para saber si la API está arriba. No es un contexto del dominio.',
  cuentas:
    'HU0006: la cuenta con el correo de la universidad y el código del curso, la sesión en una cookie y el consentimiento informado (Ley N.º 29733), que se lee antes de crear la cuenta y se acepta con sesión.',
  evaluacion: 'Las pruebas de entrada, forma A (HU0006, criterio 3), y de salida, forma B, que se abre al terminar el recorrido (HU0030). Ni la clave ni el puntaje salen de la API.',
  registro: 'HU0007: el registro de actividad, de solo agregar. No hay ruta para modificarlo ni para borrarlo.',
  proyectos: 'Los proyectos del estudiante: crearlos, listarlos, traer uno con su lugar y exportarlos o importarlos en un archivo (HU0029).',
  estudios:
    'M1, paso 1 (HU0005, HU0009, HU0010): la parcela, la fuente, el relieve, y el clima y el suelo con su origen. También las teselas de OpenStreetMap, por la caché del servidor (D13).',
  cultivo: 'M2, paso 2 (HU0011, HU0012): las sugerencias del modelo de cultivos, y el cultivo elegido con su fecha de siembra.',
  balance: 'M3, paso 3 (HU0013, HU0014): si la fuente cubre la semana de más demanda y, si no, con qué ajuste. El servidor rehace el balance con el módulo antes de guardar.',
  diseno: 'M4, paso 4 (HU0015, HU0016): el método de riego, la lámina, la frecuencia, el tiempo y los turnos. El servidor rehace el diseño con el módulo antes de guardar.',
  red: 'M5, paso 5 (HU0017, HU0018, HU0019): la red generada con lo que el estudiante le cambió. El servidor la rehace con el módulo antes de guardarla, y cada guardado es una versión nueva.',
  simulacion: 'M6, paso 6 (HU0020 a HU0023): el servidor vuelve a poner a funcionar la red guardada y solo abre el paso 7 si funciona.',
  catalogo: 'HU0027: los precios con que se arma el presupuesto. Vale el último cargado, y se dice si son provisionales.',
}

interface Operacion {
  metodo: Metodo
  /** Con los parámetros entre llaves, como en OpenAPI: /api/proyectos/{id}. */
  ruta: string
  etiqueta: keyof typeof ETIQUETAS
  resumen: string
  descripcion?: string
  /** Pide la cookie de sesión. Por omisión, sí. */
  sesion?: boolean
  cuerpo?: z.ZodType
  respuestas: Readonly<Record<number, string>>
  /** Lo que devuelve con éxito, si no es JSON. */
  tipo?: string
}

const PARAMETROS: Readonly<Record<string, { descripcion: string; schema: object }>> = {
  id: { descripcion: 'El proyecto, que tiene que ser del estudiante.', schema: { type: 'string', format: 'uuid' } },
  itemId: { descripcion: 'El ítem de la prueba.', schema: { type: 'string', format: 'uuid' } },
  z: { descripcion: 'Nivel de acercamiento, hasta 19.', schema: { type: 'integer', minimum: 0, maximum: 19 } },
  x: { descripcion: 'Columna de la tesela.', schema: { type: 'integer', minimum: 0 } },
  y: { descripcion: 'Fila de la tesela.', schema: { type: 'integer', minimum: 0 } },
}

const LO_QUE_DEVUELVE_UN_PASO =
  'El proyecto con lo que el estudiante ya decidió: la campaña, la decisión del balance y el diseño agronómico, el paso alcanzado y los resultados que quedaron por revisar.'

const OPERACIONES: readonly Operacion[] = [
  {
    metodo: 'put',
    ruta: '/api/proyectos/{id}/red',
    etiqueta: 'red',
    resumen: 'Guarda la red con los cambios del estudiante',
    descripcion: 'La red no se recibe: el servidor la genera con los pasos 1 a 4 y le aplica la lista de cambios. Las versiones anteriores se conservan.',
    cuerpo: datosDeLaRed,
    respuestas: {
      200: `${LO_QUE_DEVUELVE_UN_PASO} Además, las alertas de la red y si funciona.`,
      400: 'Un cambio no se puede aplicar: tramo o nodo que no existe, o diámetro fuera del catálogo (`cambio_invalido`).',
      409: 'Falta el paso 4 (`paso_pendiente`) o no se puede generar la red en esa parcela (`red_no_generable`).',
    },
  },
  {
    metodo: 'put',
    ruta: '/api/proyectos/{id}/red/funcionamiento',
    etiqueta: 'simulacion',
    resumen: 'Confirma que el diseño funcionó y abre el paso 7',
    respuestas: {
      200: LO_QUE_DEVUELVE_UN_PASO,
      409: 'Falta guardar la red (`paso_pendiente`) o todavía tiene alertas por corregir (`diseno_no_funciona`).',
    },
  },
  {
    metodo: 'put',
    ruta: '/api/proyectos/{id}/optimizacion',
    etiqueta: 'simulacion',
    resumen: 'Se queda con su diseño o con una alternativa del modelo, que el servidor vuelve a verificar',
    cuerpo: datosDeLaDecision,
    respuestas: {
      200: LO_QUE_DEVUELVE_UN_PASO,
      400: 'Un cambio no se puede aplicar (`cambio_invalido`).',
      409: 'El diseño propio todavía no funcionó (`diseno_no_funciona`) o la alternativa no pasó la verificación (`alternativa_no_cumple`).',
    },
  },
  {
    metodo: 'get',
    ruta: '/api/proyectos/{id}/exportacion',
    etiqueta: 'proyectos',
    resumen: 'El proyecto completo en un archivo: las decisiones, sin datos de la persona',
    respuestas: { 200: 'El archivo, que se vuelve a cargar con la importación.', 404: 'Ese proyecto no existe o no es tuyo.' },
  },
  {
    metodo: 'post',
    ruta: '/api/proyectos/importacion',
    etiqueta: 'proyectos',
    resumen: 'Carga un proyecto exportado como un proyecto nuevo y vuelve a calcular todo',
    cuerpo: proyectoExportado,
    respuestas: { 201: LO_QUE_DEVUELVE_UN_PASO, 400: 'El archivo no es un proyecto exportado (`archivo_invalido`).' },
  },
  {
    metodo: 'post',
    ruta: '/api/evaluaciones/salida',
    etiqueta: 'evaluacion',
    resumen: 'Abre la prueba de salida, forma B, al terminar el recorrido',
    respuestas: { 200: 'Los ítems, sin la clave.', 403: 'Todavía no termina el recorrido (`salida_no_habilitada`).', 409: 'La prueba ya terminó (`prueba_terminada`).' },
  },
  {
    metodo: 'put',
    ruta: '/api/evaluaciones/salida/respuestas/{itemId}',
    etiqueta: 'evaluacion',
    resumen: 'Guarda una respuesta de la prueba de salida',
    respuestas: { 204: 'Guardada.', 404: 'Ese ítem no es de la prueba.', 409: 'La prueba no está abierta.' },
  },
  {
    metodo: 'post',
    ruta: '/api/evaluaciones/salida/fin',
    etiqueta: 'evaluacion',
    resumen: 'Termina la prueba de salida, sin mostrar ni clave ni puntaje',
    respuestas: { 200: 'Terminada.', 400: 'Faltan ítems (`prueba_incompleta`).', 409: 'La prueba no está abierta.' },
  },
  {
    metodo: 'get',
    ruta: '/api/catalogo/precios',
    etiqueta: 'catalogo',
    resumen: 'Los precios vigentes del presupuesto',
    respuestas: { 200: 'El catálogo de precios, con su versión, su fuente y si es provisional.' },
  },
  { metodo: 'get', ruta: '/api/salud', etiqueta: 'salud', resumen: 'Comprueba que la API responde', sesion: false, respuestas: { 200: '`{ "estado": "ok" }`' } },
  {
    metodo: 'post',
    ruta: '/api/cuenta',
    etiqueta: 'cuentas',
    resumen: 'Crea la cuenta y abre la sesión',
    descripcion: 'Con el correo de la universidad y el código del curso. La contraseña necesita al menos 10 caracteres y no puede pasar de 72 bytes.',
    sesion: false,
    cuerpo: datosDeCuenta,
    respuestas: {
      201: 'La cuenta se creó y la sesión quedó abierta en la cookie. Devuelve en qué parte del recorrido está: consentimiento, prueba de entrada y lo que falta.',
      400: 'El correo no es de la universidad (`correo_no_institucional`) o el código del curso no existe (`curso_desconocido`).',
      409: 'Ya hay una cuenta con ese correo (`cuenta_existente`).',
      429: 'Demasiados registros desde la misma IP.',
    },
  },
  {
    metodo: 'post',
    ruta: '/api/sesion',
    etiqueta: 'cuentas',
    resumen: 'Inicia sesión',
    sesion: false,
    cuerpo: datosDeSesion,
    respuestas: {
      200: 'La sesión quedó abierta en la cookie. Devuelve en qué parte del recorrido está.',
      401: 'El correo o la contraseña no coinciden (`credenciales_invalidas`).',
      429: 'Demasiados intentos fallidos con ese correo (`demasiados_intentos`).',
    },
  },
  { metodo: 'delete', ruta: '/api/sesion', etiqueta: 'cuentas', resumen: 'Cierra la sesión', sesion: false, respuestas: { 204: 'La cookie de sesión se borró.' } },
  {
    metodo: 'get',
    ruta: '/api/estado',
    etiqueta: 'cuentas',
    resumen: 'El estudiante y en qué parte del recorrido está',
    respuestas: { 200: 'Sus nombres y su correo, si aceptó el consentimiento, cómo va su prueba de entrada y si el recorrido ya está abierto.' },
  },
  {
    metodo: 'get',
    ruta: '/api/consentimiento',
    etiqueta: 'cuentas',
    resumen: 'El texto vigente del consentimiento y su versión',
    sesion: false,
    respuestas: { 200: '`{ "version", "texto" }`' },
  },
  {
    metodo: 'post',
    ruta: '/api/consentimiento',
    etiqueta: 'cuentas',
    resumen: 'Acepta el consentimiento',
    descripcion: 'Se acepta la versión que el estudiante leyó, tal como la devolvió GET /api/consentimiento.',
    cuerpo: datosDelConsentimiento,
    respuestas: { 201: '`{ "version" }`', 409: 'El texto cambió mientras lo leía (`version_desactualizada`): tiene que leer el nuevo.' },
  },
  {
    metodo: 'post',
    ruta: '/api/consentimiento/retiro',
    etiqueta: 'cuentas',
    resumen: 'Retira el consentimiento',
    descripcion: 'Desde entonces sus datos ya no entran en el análisis, y el recorrido se cierra.',
    respuestas: { 204: 'El consentimiento quedó retirado.' },
  },
  {
    metodo: 'post',
    ruta: '/api/evaluaciones/entrada',
    etiqueta: 'evaluacion',
    resumen: 'Abre la prueba de entrada o la retoma',
    respuestas: {
      200: 'Los ítems con sus alternativas y lo que ya marcó, sin la clave.',
      403: 'Todavía no acepta el consentimiento (`falta_consentimiento`).',
      409: 'La prueba ya terminó (`prueba_terminada`).',
      503: 'El banco de ítems no está cargado (`banco_vacio`).',
    },
  },
  {
    metodo: 'put',
    ruta: '/api/evaluaciones/entrada/respuestas/{itemId}',
    etiqueta: 'evaluacion',
    resumen: 'Guarda la alternativa marcada en un ítem',
    cuerpo: respuesta,
    respuestas: {
      204: 'La respuesta quedó guardada; si ya había una, la reemplaza.',
      400: 'Esa alternativa no está en el ítem (`alternativa_invalida`).',
      404: 'El ítem no está en su prueba (`no_encontrado`).',
      409: 'La prueba no se abrió (`prueba_no_iniciada`) o ya terminó (`prueba_terminada`).',
    },
  },
  {
    metodo: 'post',
    ruta: '/api/evaluaciones/entrada/fin',
    etiqueta: 'evaluacion',
    resumen: 'Termina la prueba de entrada',
    descripcion: 'No devuelve el puntaje: la prueba mide el punto de partida, no enseña.',
    respuestas: {
      200: '`{ "terminada": true }`',
      400: 'Faltan ítems por responder (`prueba_incompleta`, con `faltan`).',
      409: 'La prueba no se abrió (`prueba_no_iniciada`) o ya terminó (`prueba_terminada`).',
    },
  },
  {
    metodo: 'post',
    ruta: '/api/eventos',
    etiqueta: 'registro',
    resumen: 'Agrega un lote de acciones al registro de actividad',
    descripcion:
      'Hasta 200 acciones por lote. Cada acción se nombra como un evento ya ocurrido, en camelCase (`parcelaCerrada`), y no puede tener una hora más de 5 minutos adelantada.',
    cuerpo: lote,
    respuestas: {
      201: '`{ "registrados" }`: cuántas acciones se agregaron.',
      403: 'Una acción de un paso del recorrido llegó antes de abrirlo (`recorrido_bloqueado`).',
      404: 'Una acción es de un proyecto que no existe o que es de otro estudiante (`no_encontrado`).',
    },
  },
  { metodo: 'get', ruta: '/api/proyectos', etiqueta: 'proyectos', resumen: 'Los proyectos del estudiante', respuestas: { 200: 'Cada uno con su nombre, el paso alcanzado y cuándo se creó.' } },
  {
    metodo: 'post',
    ruta: '/api/proyectos',
    etiqueta: 'proyectos',
    resumen: 'Crea un proyecto',
    cuerpo: datosDelProyecto,
    respuestas: { 201: '`{ "id", "nombre", "pasoAlcanzado" }`' },
  },
  {
    metodo: 'delete',
    ruta: '/api/proyectos/{id}',
    etiqueta: 'proyectos',
    resumen: 'Elimina un proyecto',
    respuestas: {
      204: 'El proyecto sale de la lista del estudiante y ya no se abre. No se borra: su registro de actividad solo se agrega y queda para el estudio.',
    },
  },
  {
    metodo: 'get',
    ruta: '/api/proyectos/{id}',
    etiqueta: 'proyectos',
    resumen: 'El proyecto con su lugar',
    respuestas: {
      200: 'La parcela, la fuente, el desnivel, la conducción con sus cámaras rompe-presión, la carga disponible, de dónde sale la elevación y, si ya la hay, la campaña.',
    },
  },
  {
    metodo: 'get',
    ruta: '/api/proyectos/{id}/relieve',
    etiqueta: 'estudios',
    resumen: 'El relieve alrededor de la parcela, para la vista 3D',
    respuestas: { 200: 'La malla de cotas con su fuente de elevación.', 409: 'Todavía no hay parcela (`parcela_pendiente`).' },
  },
  {
    metodo: 'get',
    ruta: '/api/proyectos/{id}/fuentes-de-referencia',
    etiqueta: 'estudios',
    resumen: 'Bocatomas, tomas y lagunas de la ANA cerca de la parcela',
    descripcion:
      'Puntos de referencia para ubicar la fuente, del inventario de la ANA · SNIRH, a unos 4 km de la parcela y con la caché del servidor (D13). No traen caudal: el caudal es el que el estudiante midió. Si la ANA no responde, la lista llega vacía con un `aviso`.',
    respuestas: { 200: 'Los puntos con su tipo, nombre, fuente natural y altitud, y la fuente del dato.', 409: 'Todavía no hay parcela (`parcela_pendiente`).' },
  },
  {
    metodo: 'put',
    ruta: '/api/proyectos/{id}/parcela',
    etiqueta: 'estudios',
    resumen: 'Guarda el contorno de la parcela',
    descripcion: 'Si la parcela cambia, el clima y el suelo satelital se vuelven a consultar; la muestra de campo se queda.',
    cuerpo: datosDeParcela,
    respuestas: { 200: 'El proyecto con su lugar, como en GET /api/proyectos/{id}.' },
  },
  {
    metodo: 'put',
    ruta: '/api/proyectos/{id}/fuente',
    etiqueta: 'estudios',
    resumen: 'Guarda la fuente de agua',
    descripcion: 'Dónde está, qué tipo es, su caudal, sus horas al día y la calidad del agua: lo único que el estudiante escribe, porque lo midió.',
    cuerpo: datosDeFuente,
    respuestas: { 200: 'El proyecto con su lugar, como en GET /api/proyectos/{id}.' },
  },
  {
    metodo: 'get',
    ruta: '/api/proyectos/{id}/datos-del-lugar',
    etiqueta: 'estudios',
    resumen: 'El clima y el suelo del lugar, con su origen',
    descripcion: 'HU0009. La primera vez los consulta a los servicios y los guarda; después responde de la base.',
    respuestas: { 200: 'Los doce meses de clima y el suelo satelital y de campo, cada uno con su fuente.', 409: 'Todavía no hay parcela (`parcela_pendiente`).' },
  },
  {
    metodo: 'get',
    ruta: '/api/proyectos/{id}/vigencia',
    etiqueta: 'proyectos',
    resumen: 'Si lo guardado sigue valiendo con las reglas de cálculo de hoy',
    descripcion:
      'Recalcula el balance y el diseño agronómico guardados con el módulo vigente. Cada aviso dice qué paso rehacer: el 3 si el agua ya no alcanza (con la semana crítica sin lluvia), el 4 si el diseño tiene un problema.',
    respuestas: { 200: 'La lista de avisos, vacía si todo sigue valiendo.' },
  },
  {
    metodo: 'put',
    ruta: '/api/proyectos/{id}/suelo',
    etiqueta: 'estudios',
    resumen: 'Guarda la muestra de suelo tomada en campo',
    descripcion: 'HU0009, criterio 2. Reemplaza a la textura satelital, que se conserva para compararlas.',
    cuerpo: datosDelSuelo,
    respuestas: { 200: 'Los datos del lugar, como en GET …/datos-del-lugar.', 409: 'Todavía no hay parcela (`parcela_pendiente`).' },
  },
  {
    metodo: 'put',
    ruta: '/api/proyectos/{id}/campania',
    etiqueta: 'cultivo',
    resumen: 'Guarda el cultivo y la fecha de siembra',
    descripcion: 'HU0012. Lo que ya se decidió en los pasos siguientes queda marcado para revisar.',
    cuerpo: datosDeLaCampania,
    respuestas: { 200: LO_QUE_DEVUELVE_UN_PASO, 409: 'Falta terminar el paso 1 (`paso_pendiente`).' },
  },
  {
    metodo: 'post',
    ruta: '/api/proyectos/{id}/recomendaciones',
    etiqueta: 'cultivo',
    resumen: 'Guarda las sugerencias del modelo de cultivos',
    descripcion: 'HU0011. Las tres sugerencias que el estudiante vio, con la versión del modelo: quedan como evidencia y no se reemplazan.',
    cuerpo: datosDeRecomendaciones,
    respuestas: { 201: '`{ "registradas" }`', 409: 'Falta terminar el paso 1 (`paso_pendiente`).' },
  },
  {
    metodo: 'put',
    ruta: '/api/proyectos/{id}/balance',
    etiqueta: 'balance',
    resumen: 'Guarda cómo alcanza el agua',
    descripcion:
      'HU0013 y HU0014. Sin ajuste, o con turnos, un reservorio o menos área. El servidor vuelve a hacer el balance con el módulo y solo cierra el paso 3 si la fuente cubre todas las semanas.',
    cuerpo: datosDelBalance,
    respuestas: {
      200: `${LO_QUE_DEVUELVE_UN_PASO} Además, el balance semana a semana.`,
      409: 'Falta el paso 2 (`paso_pendiente`), el agua no alcanza sin ajuste (`agua_no_alcanza`), el ajuste no sirve con esta fuente (`ajuste_no_viable`) o todavía quedan semanas sin cubrir (`ajuste_insuficiente`).',
    },
  },
  {
    metodo: 'put',
    ruta: '/api/proyectos/{id}/diseno-agronomico',
    etiqueta: 'diseno',
    resumen: 'Guarda el método de riego y el diseño agronómico',
    descripcion:
      'HU0015 y HU0016. El servidor rehace el diseño con el módulo y solo lo guarda si funciona: con un método viable, sin estrés entre riegos, con los turnos dentro de las horas de riego y sin escurrimiento.',
    cuerpo: datosDelDiseno,
    respuestas: {
      200: LO_QUE_DEVUELVE_UN_PASO,
      400: 'El emisor es del otro método (`emisor_de_otro_metodo`).',
      409: 'Falta el paso 3 (`paso_pendiente`), el método no es viable aquí, o el diseño tiene un problema: `intervalo_con_estres`, `riego_no_cabe`, `turnos_no_caben` o `escurre`.',
    },
  },
  {
    metodo: 'get',
    ruta: '/api/teselas/{z}/{x}/{y}.png',
    etiqueta: 'estudios',
    resumen: 'Una tesela del mapa base',
    descripcion: 'Solo cubre el Perú. Se pide a OpenStreetMap cuando alguien la mira y se guarda en memoria.',
    sesion: false,
    tipo: 'image/png',
    respuestas: {
      200: 'La imagen.',
      404: 'Está fuera del Perú (`tesela_fuera_de_cobertura`).',
      429: 'Demasiadas teselas desde la misma IP.',
      502: 'OpenStreetMap no respondió (`mapa_no_disponible`).',
    },
  },
]

/** Las respuestas de error que vienen con cada clase de operación, además de las propias. */
function respuestasComunes(o: Operacion): [number, string][] {
  return [
    ...(o.cuerpo ? [[400, 'Los datos no pasan la validación (`datos_invalidos`), con el detalle por campo.'] as [number, string]] : []),
    ...(o.sesion !== false ? [[401, 'Sin sesión o con la sesión vencida (`sin_sesion`).'] as [number, string]] : []),
    ...(o.metodo !== 'get' ? [[403, 'Falta la cabecera `X-Riego: 1` (`origen_no_permitido`).'] as [number, string]] : []),
    ...(o.ruta.startsWith('/api/proyectos')
      ? [[403, 'El recorrido no está abierto: falta el consentimiento o la prueba de entrada (`recorrido_bloqueado`).'] as [number, string]]
      : []),
    ...(o.ruta.startsWith('/api/proyectos/{id}') ? [[404, 'El proyecto no existe o es de otro estudiante (`no_encontrado`).'] as [number, string]] : []),
  ]
}

/** Si hay varias causas para un mismo estado, una por línea. */
function respuestasDe(o: Operacion) {
  const porEstado = new Map<number, string[]>()
  for (const [estado, texto] of [...Object.entries(o.respuestas).map(([e, t]) => [Number(e), t] as [number, string]), ...respuestasComunes(o)]) {
    porEstado.set(estado, [...(porEstado.get(estado) ?? []), texto])
  }
  return Object.fromEntries(
    [...porEstado.entries()]
      .sort(([a], [b]) => a - b)
      .map(([estado, textos]) => {
        const description = textos.length === 1 ? textos[0]! : textos.map((t) => `- ${t}`).join('\n')
        if (estado === 204) return [estado, { description }]
        const content =
          estado >= 400
            ? { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
            : { [o.tipo ?? 'application/json']: {} }
        return [estado, { description, content }]
      }),
  )
}

/** El esquema del cuerpo tal como lo recibe la ruta: lo que se escribe antes de que zod lo transforme. */
function esquemaDe(cuerpo: z.ZodType) {
  const { $schema: _version, ...esquema } = z.toJSONSchema(cuerpo, { io: 'input', unrepresentable: 'any' })
  return esquema
}

function operacionDe(o: Operacion) {
  const lectura = o.metodo === 'get'
  const conSesion = o.sesion !== false
  const security = conSesion ? [lectura ? { sesion: [] } : { sesion: [], cabeceraRiego: [] }] : lectura ? [] : [{ cabeceraRiego: [] }]
  const parametros = [...o.ruta.matchAll(/\{(\w+)\}/g)].map(([, nombre]) => {
    const p = PARAMETROS[nombre!]
    if (!p) throw new Error(`Falta describir el parámetro ${nombre} de ${o.ruta}`)
    return { name: nombre, in: 'path', required: true, description: p.descripcion, schema: p.schema }
  })
  return {
    tags: [ETIQUETAS[o.etiqueta]],
    summary: o.resumen,
    ...(o.descripcion ? { description: o.descripcion } : {}),
    ...(parametros.length > 0 ? { parameters: parametros } : {}),
    ...(o.cuerpo ? { requestBody: { required: true, content: { 'application/json': { schema: esquemaDe(o.cuerpo) } } } } : {}),
    responses: respuestasDe(o),
    security,
  }
}

export function documentoOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const o of OPERACIONES) paths[o.ruta] = { ...paths[o.ruta], [o.metodo]: operacionDe(o) }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Riego · API',
      version: (requerir('../package.json') as { version: string }).version,
      description: [
        'La API de la aplicación para formular proyectos de campañas de cultivo. Esta página existe solo en desarrollo.',
        '',
        'Para probar las rutas con sesión, primero **POST /api/sesion** con una cuenta de prueba: la cookie queda en el navegador y esta página la manda sola. La cabecera `X-Riego: 1`, que la API exige en todo lo que no es lectura, también la agrega sola.',
        '',
        'Las rutas bajo **/api/proyectos** piden además el recorrido abierto: el consentimiento aceptado y la prueba de entrada terminada.',
        '',
        'Todos los errores vienen como `{ "codigo", "mensaje" }`: el código es estable y la interfaz se guía por él; el mensaje se puede mostrar tal cual.',
      ].join('\n'),
    },
    tags: Object.entries(ETIQUETAS).map(([clave, name]) => ({ name, description: DESCRIPCION_DE_LAS_ETIQUETAS[clave as keyof typeof ETIQUETAS] })),
    paths,
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            codigo: { type: 'string', description: 'Estable: la interfaz se guía por él.', examples: ['datos_invalidos'] },
            mensaje: { type: 'string', description: 'Legible: se puede mostrar tal cual.' },
          },
          required: ['codigo', 'mensaje'],
          additionalProperties: true,
        },
      },
      securitySchemes: {
        sesion: {
          type: 'apiKey',
          in: 'cookie',
          name: 'sesion',
          description: 'Un JWT firmado en una cookie httpOnly, que abren POST /api/cuenta y POST /api/sesion. El navegador la manda solo.',
        },
        cabeceraRiego: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Riego',
          description: 'Contra la falsificación de solicitudes: todo lo que no es lectura lleva `X-Riego: 1`. Esta página la agrega sola.',
        },
      },
    },
  }
}

const PAGINA = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Riego · API</title>
    <link rel="icon" type="image/png" href="./favicon-32x32.png" />
    <link rel="stylesheet" href="./swagger-ui.css" />
  </head>
  <body>
    <div id="swagger"></div>
    <script src="./swagger-ui-bundle.js"></script>
    <script src="./inicio.js"></script>
  </body>
</html>
`

// En un archivo aparte y no dentro de la página: la política de contenido de helmet no deja correr scripts en línea.
const INICIO = `// Swagger UI con la cabecera X-Riego en cada solicitud, como la manda la web.
window.ui = SwaggerUIBundle({
  url: './openapi.json',
  dom_id: '#swagger',
  deepLinking: true,
  requestInterceptor: (solicitud) => {
    solicitud.headers['X-Riego'] = '1'
    return solicitud
  },
})
`

/** Los archivos de Swagger UI que usa la página; el resto del paquete, como su página de ejemplo, no se sirve. */
const ARCHIVOS_DE_SWAGGER_UI = ['swagger-ui.css', 'swagger-ui-bundle.js', 'favicon-32x32.png']

export function rutasDeDocumentacion() {
  const rutas = Router()
  const documento = documentoOpenApi()
  const carpeta = dirname(requerir.resolve('swagger-ui-dist/package.json'))

  // Swagger UI se sirve desde el mismo origen que la API: al probar una ruta, la cookie de sesión va sola y no hay
  // CORS de por medio. Sin upgrade-insecure-requests, que en http://localhost pediría sus archivos por https.
  rutas.use(helmet.contentSecurityPolicy({ directives: { upgradeInsecureRequests: null } }))
  rutas.get('/', (req, res) => {
    const ruta = new URL(req.originalUrl, 'http://localhost').pathname
    // Sin la barra final, los archivos de la página se buscarían en /api/ y no en /api/docs/.
    if (!ruta.endsWith('/')) {
      res.redirect(301, `${ruta}/`)
      return
    }
    res.type('html').send(PAGINA)
  })
  rutas.get('/openapi.json', (_req, res) => {
    res.json(documento)
  })
  rutas.get('/inicio.js', (_req, res) => {
    res.type('text/javascript').send(INICIO)
  })
  for (const archivo of ARCHIVOS_DE_SWAGGER_UI) {
    // Con root: pnpm guarda el paquete bajo node_modules/.pnpm, y sendFile no sirve rutas que pasan por carpetas
    // ocultas; con root solo mira el nombre del archivo.
    rutas.get(`/${archivo}`, (_req, res) => {
      res.sendFile(archivo, { root: carpeta })
    })
  }
  return rutas
}
