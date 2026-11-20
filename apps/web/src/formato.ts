// Cómo se escriben los números en pantalla: punto decimal y coma de miles, como en el Perú (es-PE) y en los
// wireframes.

const M2_POR_HA = 10_000

const numero = (decimales: number) =>
  new Intl.NumberFormat('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })

export const conDecimales = (valor: number, decimales: number) => numero(decimales).format(valor)

/** Una cifra dentro de una frase: hasta tantos decimales, sin los ceros que sobran («12 h», no «12.0 h»). */
export const cifra = (valor: number, decimales: number) =>
  new Intl.NumberFormat('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: decimales }).format(valor)

// Los nombres del catálogo traen la variedad tras una coma («Arveja, verde»). En una frase se dicen de corrido y con
// su artículo. El haba lleva «el» por la a tónica; los demás, «la» si terminan en a.
const ARTICULO_ESPECIAL: Readonly<Record<string, 'el' | 'la'>> = { haba: 'el' }

/** El cultivo como se dice en una frase: «arveja verde», «la arveja verde», «al maíz en grano», «del haba verde». */
export function cultivoEnFrase(nombre: string, articulo?: 'el' | 'a' | 'de') {
  const [especie = '', variedad] = nombre.toLowerCase().split(/,\s*/)
  const dicho = variedad ? `${especie} ${variedad.startsWith('grano') ? `en ${variedad}` : variedad}` : especie
  if (!articulo) return dicho
  const propio = ARTICULO_ESPECIAL[especie] ?? (especie.endsWith('a') ? 'la' : 'el')
  if (propio === 'la') return `${articulo === 'el' ? '' : `${articulo} `}la ${dicho}`
  return `${articulo === 'a' ? 'al' : articulo === 'de' ? 'del' : 'el'} ${dicho}`
}

export const hectareasDesdeM2 =(m2: number) => `${conDecimales(m2 / M2_POR_HA, 2)} ha`

export const fecha = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

/** El nombre de un mes, de 1 (enero) a 12, como se dice en el Perú. */
export const nombreDelMes = (mes: number) =>
  // Solo el mes, algunas versiones de ICU lo dan con mayúscula en es-PE («Octubre»); en una frase va en minúscula.
  new Intl.DateTimeFormat('es-PE', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, mes - 1, 1))).toLocaleLowerCase('es-PE')

/** Una fecha del calendario (AAAA-MM-DD), sin hora: se lee en UTC para que en Lima no caiga el día anterior. */
export const diaDelCalendario = (iso: string, conAnio = false) =>
  new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', ...(conAnio ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  )

/** «a, b y c», como se enumera en castellano. */
export const enumeracion = (partes: readonly string[]) =>
  partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`

export const iniciales = (nombres: string) =>
  nombres
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]!.toUpperCase())
    .join('')
