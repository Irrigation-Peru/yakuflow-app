import { readFileSync } from 'node:fs'
import type { CatalogoDePrecios } from '@riego/calculo'
import { z } from 'zod'
import type { Bd } from './bd.ts'

// Los precios del presupuesto (HU0027). Vale el último catálogo cargado en la base, así se reemplaza sin tocar el código;
// mientras no se cargue ninguno, el provisional del repositorio, que se dice provisional en pantalla y en el informe.

export const esquemaDelCatalogo = z.object({
  version: z.string().min(1).max(60),
  provisional: z.boolean(),
  fuente: z.string().min(1).max(500),
  moneda: z.string().length(3),
  tuberias: z.array(z.object({ diametroInternoMm: z.number().positive(), clase: z.string().min(1), precioPorM: z.number().nonnegative() })).min(1),
  emisores: z.array(z.object({ codigo: z.string().min(1), precioUnidad: z.number().nonnegative() })).min(1),
  lateralesDeGoteo: z
    .array(z.object({ codigo: z.string().min(1), diametroInternoMm: z.number().positive(), precioPorM: z.number().nonnegative() }))
    .optional(),
  accesorios: z.object({
    camaraRompePresion: z.number().nonnegative(),
    valvulaReguladora: z.number().nonnegative(),
    cabezal: z.number().nonnegative(),
  }),
})

const leerProvisional = (): CatalogoDePrecios =>
  esquemaDelCatalogo.parse(JSON.parse(readFileSync(new URL('../catalogo/precios-provisionales.json', import.meta.url), 'utf8')))

export async function catalogoVigente(bd: Bd): Promise<CatalogoDePrecios> {
  const fila = await bd.catalogoPrecios.findFirst({ orderBy: { cargadoEn: 'desc' } })
  return fila ? esquemaDelCatalogo.parse(fila.contenido) : leerProvisional()
}

export async function cargarCatalogo(bd: Bd, contenido: unknown) {
  const catalogo = esquemaDelCatalogo.parse(contenido)
  const { version, provisional, fuente } = catalogo
  return bd.catalogoPrecios.upsert({
    where: { version },
    create: { version, provisional, fuente, contenido: catalogo },
    update: { provisional, fuente, contenido: catalogo, cargadoEn: new Date() },
  })
}
