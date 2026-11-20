import { z } from 'zod'
import type { Bd } from '../bd.ts'

// Banco de ítems de la prueba (HU0008). Cada ítem declara qué concepción errónea evalúa y en qué nivel cognitivo,
// lleva el juicio de cada experto que lo revisó, y pertenece a la forma A (entrada) o a la B (salida).
//
// El banco real no está en el repositorio: con la clave a la vista la prueba no mediría nada. Se guarda aparte
// y se carga con `pnpm --filter @riego/api cargar-banco <ruta>`. En el repositorio solo está el de ejemplo.

export const CONCEPCIONES_ERRONEAS = ['CE1', 'CE2', 'CE3', 'CE4', 'CE5', 'CE6', 'CE7', 'CE8'] as const
// Taxonomía de Bloom revisada (Anderson y Krathwohl, 2001).
export const NIVELES_COGNITIVOS = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear'] as const
const EXPERTOS_REQUERIDOS = 2

const esquemaDeItem = z
  .object({
    codigo: z.string().regex(/^[A-Za-z0-9-]{1,20}$/),
    forma: z.enum(['A', 'B']),
    concepcionErronea: z.enum(CONCEPCIONES_ERRONEAS),
    nivelCognitivo: z.enum(NIVELES_COGNITIVOS),
    enunciado: z.string().min(1),
    alternativas: z.array(z.object({ letra: z.string().regex(/^[a-z]$/), texto: z.string().min(1) })).min(3),
    clave: z.string(),
    // El experto va por un código (E1, E2…): sus nombres quedan en el acta del juicio, no aquí.
    juicios: z.array(z.object({ experto: z.string().min(1), conformidad: z.boolean(), observacion: z.string().optional() })),
  })
  .refine((i) => i.alternativas.some((a) => a.letra === i.clave), {
    path: ['clave'],
    message: 'La clave tiene que ser una de las alternativas',
  })

export const esquemaDeBanco = z
  .object({ version: z.string().min(1), items: z.array(esquemaDeItem).min(1) })
  .superRefine((banco, ctx) => {
    const vistos = new Set<string>()
    for (const { codigo } of banco.items) {
      if (vistos.has(codigo)) ctx.addIssue({ code: 'custom', path: ['items'], message: `El código ${codigo} está repetido` })
      vistos.add(codigo)
    }
  })

export type Banco = z.infer<typeof esquemaDeBanco>

const plural = (n: number, singular: string, varios: string) => `${n} ${n === 1 ? singular : varios}`

/**
 * Revisa un banco. Lo que rompe el formato lanza un error; lo que impide aplicarlo se devuelve como observación.
 * Queda aprobado cuando cada ítem tiene la conformidad de dos expertos distintos, las dos formas evalúan las
 * ocho concepciones erróneas y tienen los mismos ítems por concepción y nivel cognitivo.
 */
export function revisarBanco(datos: unknown) {
  const banco = esquemaDeBanco.parse(datos)
  const observaciones: string[] = []

  for (const item of banco.items) {
    const conformes = new Set(item.juicios.filter((j) => j.conformidad).map((j) => j.experto)).size
    if (conformes < EXPERTOS_REQUERIDOS) {
      observaciones.push(
        `${item.codigo}: tiene ${plural(conformes, 'experto conforme', 'expertos conformes')} y necesita ${EXPERTOS_REQUERIDOS}`,
      )
    }
  }

  for (const ce of CONCEPCIONES_ERRONEAS) {
    if (!banco.items.some((i) => i.concepcionErronea === ce)) observaciones.push(`Ninguna forma evalúa ${ce}`)
  }

  const cuenta = (forma: 'A' | 'B', ce: string, nivel: string) =>
    banco.items.filter((i) => i.forma === forma && i.concepcionErronea === ce && i.nivelCognitivo === nivel).length
  for (const ce of CONCEPCIONES_ERRONEAS) {
    for (const nivel of NIVELES_COGNITIVOS) {
      const [a, b] = [cuenta('A', ce, nivel), cuenta('B', ce, nivel)]
      if (a !== b) observaciones.push(`${ce}, ${nivel}: la forma A tiene ${plural(a, 'ítem', 'ítems')} y la B, ${b}`)
    }
  }

  return { aprobado: observaciones.length === 0, observaciones }
}

/**
 * Carga el banco en la base y reemplaza el anterior. Un banco sin aprobar solo entra como borrador, para
 * desarrollar. Si ya hay respuestas, no se toca: cambiar los ítems a mitad del estudio rompería la medición.
 */
export async function cargarBanco(bd: Bd, datos: unknown, { borrador = false } = {}) {
  const revision = revisarBanco(datos)
  const banco = esquemaDeBanco.parse(datos)
  if (!revision.aprobado && !borrador) {
    throw new Error(`El banco no está aprobado:\n- ${revision.observaciones.join('\n- ')}`)
  }
  if ((await bd.respuesta.count()) > 0) {
    throw new Error('Ya hay respuestas registradas: el banco no se cambia durante el estudio')
  }
  await bd.$transaction([
    bd.itemInstrumento.deleteMany(),
    bd.itemInstrumento.createMany({
      data: banco.items.map(({ juicios: _juicios, ...item }) => item),
    }),
  ])
  return revision
}
