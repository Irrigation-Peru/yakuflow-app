import type { EvaluacionDeCondicion, NivelDeAptitud, RangoConOptimo, RasgoDelLugar } from '@riego/calculo'
import { cifra, conDecimales, cultivoEnFrase } from './formato.ts'

// Cómo se lee cada condición del lugar frente a lo que el cultivo necesita (HU0011 y HU0012): en la tabla, el valor
// de la parcela y lo que pide el cultivo; en las listas, una frase completa con el cultivo por su nombre. Los números
// salen del módulo de cálculo; aquí solo se escriben.

export interface LecturaDeCondicion {
  condicion: EvaluacionDeCondicion['condicion']
  nombre: string
  /** El nombre en dos o tres palabras, para las listas de lo que favorece y lo que juega en contra. */
  corto: string
  valor: string
  pide: string
  nivel: NivelDeAptitud
}

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)

const entre = ({ optimoMinimo, optimoMaximo }: RangoConOptimo, unidad: string, decimales: number) =>
  `entre ${cifra(optimoMinimo, decimales)} y ${cifra(optimoMaximo, decimales)}${unidad}`
const aguanta = ({ minimo, maximo }: RangoConOptimo, unidad: string, decimales: number) =>
  `de ${cifra(minimo, decimales)} a ${cifra(maximo, decimales)}${unidad}`

const SUELO = { ligera: 'ligero (arenoso)', media: 'medio (franco)', pesada: 'pesado (arcilloso)' } as const
const TEXTURA = { ligera: 'ligera', media: 'media', pesada: 'pesada' } as const
const POR_EL_METODO = { goteo: 'goteo', aspersion: 'aspersión' } as const

const CORTO: Readonly<Record<EvaluacionDeCondicion['condicion'], string>> = {
  altitud: 'la altitud',
  temperatura: 'la temperatura',
  helada: 'las heladas',
  ph: 'el pH',
  textura: 'la textura',
  salinidad: 'las sales',
  agua: 'el agua de la fuente',
}

/** La fila de la tabla: el nombre de la condición, lo que hay en la parcela y lo que necesita el cultivo. */
export function lecturaDeCondicion(c: EvaluacionDeCondicion): LecturaDeCondicion {
  const base = { condicion: c.condicion, nivel: c.nivel, corto: CORTO[c.condicion] }
  switch (c.condicion) {
    case 'altitud':
      return { ...base, nombre: 'Altitud', valor: `${cifra(c.valorM, 0)} m`, pide: `se cultiva habitualmente hasta ${cifra(c.maximoM, 0)} m` }
    case 'temperatura':
      return {
        ...base,
        nombre: 'Temperatura media',
        valor: `${conDecimales(c.valorC, 1)} °C`,
        pide: `mejor ${entre(c.rango, ' °C', 0)}; aguanta ${aguanta(c.rango, ' °C', 0)}`,
      }
    case 'helada':
      return { ...base, nombre: 'Frío de las noches', valor: `${conDecimales(c.minimaC, 1)} °C`, pide: `se daña por debajo de ${cifra(c.letalC, 0)} °C` }
    case 'ph':
      return { ...base, nombre: 'pH del suelo', valor: conDecimales(c.valor, 1), pide: `mejor ${entre(c.rango, '', 1)}; aguanta ${aguanta(c.rango, '', 1)}` }
    case 'textura':
      return {
        ...base,
        nombre: 'Textura del suelo',
        valor: c.clase,
        pide: `mejor en suelo ${c.optimas.map((t) => SUELO[t]).join(' o ')}`,
      }
    case 'salinidad':
      return {
        ...base,
        nombre: 'Sales en el suelo',
        valor: `${conDecimales(c.salinidadDelSueloDsM, 2)} dS/m`,
        pide: `rinde completo hasta ${cifra(c.umbralDsM, 1)} dS/m${
          c.perdidaPct === null ? '; más arriba no se sabe cuánto pierde' : c.perdidaPct > 0 ? `; aquí perdería el ${cifra(c.perdidaPct, 0)} %` : ''
        }`,
      }
    case 'agua':
      return {
        ...base,
        nombre: 'Agua de la fuente',
        valor: `${conDecimales(c.ofertaMmDia, 1)} mm/día`,
        pide: `${conDecimales(c.necesidadMmDia, 1)} mm al día en su semana de más demanda, contando lo que se pierde al regar`,
      }
  }
}

/** La condición contada en una frase completa, con el cultivo por su nombre. */
export function fraseDeCondicion(c: EvaluacionDeCondicion, cultivo: string) {
  const el = cultivoEnFrase(cultivo, 'el')
  const a = cultivoEnFrase(cultivo, 'a')
  switch (c.condicion) {
    case 'altitud':
      return c.nivel === 'optima'
        ? `Tu parcela está a ${cifra(c.valorM, 0)} m de altitud, y ${el} se cultiva habitualmente hasta los ${cifra(c.maximoM, 0)} m.`
        : `Tu parcela está a ${cifra(c.valorM, 0)} m de altitud, por encima de los ${cifra(c.maximoM, 0)} m hasta donde se cultiva habitualmente ${el}: el riesgo de helada es alto. Si lo eliges, usa una variedad adaptada a la altura.`
    case 'temperatura':
      return `En la campaña, la temperatura media es de ${conDecimales(c.valorC, 1)} °C. ${mayuscula(a)} le va mejor ${entre(c.rango, ' °C', 0)}, y aguanta ${aguanta(c.rango, ' °C', 0)}.`
    case 'helada':
      return `En el mes más frío de la campaña, las noches bajan en promedio a ${conDecimales(c.minimaC, 1)} °C, y ${el} se daña por debajo de ${cifra(c.letalC, 0)} °C.${
        c.nivel === 'optima'
          ? ''
          : c.minimaC < c.letalC
            ? ' Con el promedio por debajo, es probable que hiele varias veces en la campaña: el riesgo es alto. Si lo eliges, busca una variedad resistente a la helada o cambia la fecha de siembra.'
            : ' Con el promedio tan cerca, alguna noche puede helar.'
      }`
    case 'ph':
      return `Tu suelo tiene pH ${conDecimales(c.valor, 1)}. ${mayuscula(a)} le va mejor ${entre(c.rango, '', 1)}, y aguanta ${aguanta(c.rango, '', 1)}.`
    case 'textura':
      return `Tu suelo es ${c.clase}, de textura ${TEXTURA[c.gruesa]}. ${mayuscula(a)} le va mejor en suelo ${c.optimas.map((t) => SUELO[t]).join(' o ')}.`
    case 'salinidad': {
      const rinde = `${mayuscula(el)} rinde completo hasta ${cifra(c.umbralDsM, 1)} dS/m`
      const pierde =
        c.perdidaPct === null
          ? '; más arriba no se sabe cuánto pierde.'
          : c.perdidaPct > 0
            ? `; aquí perdería el ${cifra(c.perdidaPct, 0)} % de la cosecha.`
            : ', así que aquí no pierde nada.'
      return `Con el agua de tu fuente, el suelo llegaría a ${cifra(c.salinidadDelSueloDsM, 2)} dS/m de sales. ${rinde}${pierde}`
    }
    case 'agua':
      return `Tu fuente puede darle a la parcela ${conDecimales(c.ofertaMmDia, 1)} mm al día. En su semana de más demanda, ${el} necesita ${conDecimales(c.necesidadMmDia, 1)} mm al día, contando lo que se pierde al regar por ${POR_EL_METODO[c.metodo]}.`
  }
}

/** «Le favorecen la altitud y el pH.», «Le juega en contra el agua de la fuente.», «Nada le juega en contra.» */
export function listaDeCondiciones(cortas: readonly string[], lado: 'favor' | 'contra') {
  if (cortas.length === 0) return lado === 'favor' ? 'Ninguna condición está en su punto ideal.' : 'Nada le juega en contra.'
  const lista = cortas.length === 1 ? cortas[0] : `${cortas.slice(0, -1).join(', ')} y ${cortas.at(-1)}`
  const verbo = lado === 'favor' ? (cortas.length === 1 ? 'Le favorece' : 'Le favorecen') : cortas.length === 1 ? 'Le juega en contra' : 'Le juegan en contra'
  return `${verbo} ${lista}.`
}

export const NIVEL: Readonly<Record<NivelDeAptitud, { simbolo: string; texto: string }>> = {
  optima: { simbolo: '✓', texto: 'a favor' },
  marginal: { simbolo: '~', texto: 'a medias' },
  fuera: { simbolo: '✕', texto: 'en contra' },
}

/** Qué condición del lugar mide cada rasgo del modelo. */
export const CONDICION_DEL_RASGO: Readonly<Record<RasgoDelLugar, string>> = {
  altitudM: 'la altitud',
  temperaturaMediaAnualC: 'la temperatura',
  minimaDelMesMasFrioC: 'el frío del invierno',
  et0MediaMmDia: 'la evapotranspiración',
  lluviaAnualMm: 'la lluvia',
  ofertaDeAguaMmDia: 'el agua de la fuente',
  conductividadDelAguaDsM: 'las sales del agua',
  phDelSuelo: 'el pH del suelo',
  texturaGruesa: 'la textura del suelo',
}

/** Con qué condición de la aptitud se compara cada rasgo: la ET₀, la lluvia y la fuente se juntan en el agua. */
export const CONDICION_DE_RASGO: Readonly<Record<RasgoDelLugar, EvaluacionDeCondicion['condicion']>> = {
  altitudM: 'altitud',
  temperaturaMediaAnualC: 'temperatura',
  minimaDelMesMasFrioC: 'helada',
  et0MediaMmDia: 'agua',
  lluviaAnualMm: 'agua',
  ofertaDeAguaMmDia: 'agua',
  conductividadDelAguaDsM: 'salinidad',
  phDelSuelo: 'ph',
  texturaGruesa: 'textura',
}

/** La explicación de una sugerencia del modelo, en dos frases: lo que más pesó y lo que juega en contra. */
export function explicacionDeLaSugerencia(cultivo: string, rasgo: RasgoDelLugar, condiciones: readonly EvaluacionDeCondicion[]) {
  const enContra = condiciones.filter((c) => c.nivel !== 'optima').map((c) => CORTO[c.condicion])
  return `Para ${cultivoEnFrase(cultivo, 'el')}, lo que más pesó fue ${CONDICION_DEL_RASGO[rasgo]}. ${listaDeCondiciones(enContra, 'contra')}`
}

const ETAPAS = { inicial: 'Inicial', desarrollo: 'Desarrollo', media: 'Media', final: 'Final' } as const
export const nombreDeEtapa = (etapa: keyof typeof ETAPAS) => ETAPAS[etapa]
