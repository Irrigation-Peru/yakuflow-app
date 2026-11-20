import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { llegarAlPaso5, prepararElLugar, probarTodo } from './preparar-la-red.ts'

// Los pasos 7 y 8 en un navegador real, con el modelo sustituto de verdad en el hilo del cálculo: comparar alternativas,
// decidir, descargar el informe, exportar e importar el proyecto y responder la prueba de salida (HU0026 a HU0030).

async function llegarAlPaso7(pagina: Page, antesDeEntrar?: () => Promise<unknown>) {
  await pagina.emulateMedia({ reducedMotion: 'reduce' })
  await prepararElLugar(pagina, 2, 0.004)
  await llegarAlPaso5(pagina)
  await pagina.getByRole('button', { name: 'Guardar la red' }).click()
  await pagina.getByRole('button', { name: 'Siguiente paso: poner a funcionar' }).click()
  await expect(pagina.getByRole('heading', { name: /Poner a funcionar el sistema/ })).toBeVisible()
  await probarTodo(pagina)
  await pagina.getByRole('button', { name: 'Mi diseño funciona' }).click()
  await antesDeEntrar?.()
  await pagina.getByRole('button', { name: 'Siguiente paso: mejorar con ML' }).click()
  await expect(pagina.getByRole('heading', { name: /Mejorar el diseño con ML/ })).toBeVisible()
}

test('del paso 7 a la prueba de salida, con todo lo que se descarga', async ({ page: pagina }) => {
  test.setTimeout(300_000)
  const errores: string[] = []
  pagina.on('pageerror', (e) => errores.push(e.message))
  await llegarAlPaso7(pagina)

  // Las alternativas: cada una verificada, comparada y funcionando junto al diseño propio.
  const tarjetas = pagina.locator('.tarjeta-alternativa')
  await expect(tarjetas.first()).toBeVisible({ timeout: 90_000 })
  await expect(pagina.getByRole('row', { name: /Costo referencial/ })).toBeVisible()
  await expect(pagina.getByRole('row', { name: /Uniformidad/ })).toBeVisible()
  await expect(pagina.getByRole('row', { name: /Margen de presión/ })).toBeVisible()
  await expect(pagina.getByRole('heading', { name: 'Qué cambió, tramo por tramo' })).toBeVisible()
  await expect(pagina.locator('.lado-a-lado figure')).toHaveCount(2)
  await pagina.getByRole('button', { name: /^Abrir sector/ }).first().click()
  await pagina.getByRole('button', { name: 'Cerrar las válvulas' }).click()
  await expect(pagina.getByRole('button', { name: 'Cerrar las válvulas' })).toHaveAttribute('aria-pressed', 'true')

  // Decidir pide decir qué pesó; la alternativa queda como una versión nueva de la red.
  const quedarme = pagina.getByRole('button', { name: 'Quedarme con esta alternativa' })
  await expect(quedarme).toBeDisabled()
  await pagina.getByLabel('La uniformidad').check()
  await quedarme.click()
  await expect(pagina.getByText('Paso 7 completo.')).toBeVisible({ timeout: 30_000 })
  await pagina.getByRole('button', { name: 'Siguiente paso: descargar el informe' }).click()

  // El informe, armado por la app, y el proyecto en un archivo.
  await expect(pagina.getByRole('heading', { name: /Descargar el informe/ })).toBeVisible()
  await expect(pagina.getByRole('heading', { name: 'Presupuesto referencial' })).toBeVisible({ timeout: 60_000 })
  await expect(pagina.getByRole('heading', { name: 'Plan de riego por etapa' })).toBeVisible()
  await expect(pagina.getByText('Total referencial')).toBeVisible()
  await expect(pagina.getByText('Con precios provisionales', { exact: false })).toBeVisible()

  const [pdf] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Descargar el informe en PDF' }).click()])
  expect(pdf.suggestedFilename()).toMatch(/^informe-.*\.pdf$/)
  const bytes = await readFile(await pdf.path())
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')

  const [exportado] = await Promise.all([pagina.waitForEvent('download'), pagina.getByRole('button', { name: 'Exportar el proyecto a un archivo' }).click()])
  const rutaDelArchivo = await exportado.path()
  const archivo = JSON.parse(await readFile(rutaDelArchivo, 'utf8'))
  expect(archivo).toMatchObject({ formato: 'riego-proyecto', pasoAlcanzado: 8 })
  expect(archivo.redes.at(-1).origen).toBe('ml')

  // La prueba de salida se abre al terminar, y no muestra si acertó.
  await pagina.getByRole('button', { name: 'Dar la prueba de salida' }).click()
  await expect(pagina.getByRole('heading', { name: 'Prueba de salida' })).toBeVisible()
  await expect(pagina.getByText('No se muestra si acertaste')).toBeVisible()
  for (;;) {
    await pagina.locator('fieldset.item input[type=radio]').first().check()
    const terminar = pagina.getByRole('button', { name: 'Terminar la prueba' })
    if (await terminar.isVisible()) {
      await terminar.click()
      // Terminar no se deshace: la app lo confirma en un diálogo.
      await pagina.getByRole('dialog').getByRole('button', { name: 'Terminar la prueba' }).click()
      break
    }
    await pagina.getByRole('button', { name: 'Siguiente' }).click()
  }
  await expect(pagina.getByText('Tu prueba de salida ya quedó registrada.')).toBeVisible({ timeout: 15_000 })

  // Se vuelve a cargar el proyecto: como uno nuevo, en el mismo paso y con la misma versión de la red.
  await pagina.getByLabel(/^Menú de /).click()
  await pagina.getByRole('button', { name: 'Mis proyectos' }).click()
  await pagina.getByLabel('Archivo del proyecto').setInputFiles(rutaDelArchivo)
  await expect(pagina.getByRole('heading', { name: /Descargar el informe/ })).toBeVisible({ timeout: 60_000 })
  await expect(pagina.locator('.dato', { hasText: 'Red' }).locator('dd')).toContainText('del modelo', { timeout: 60_000 })
  expect(errores).toEqual([])
})

test('si el modelo no carga, el paso 7 no se cierra: el diseño propio sigue al paso 8', async ({ page: pagina }) => {
  test.setTimeout(240_000)
  await llegarAlPaso7(pagina, () => pagina.route(/sustituto[^/]*\.onnx/, (ruta) => ruta.abort()))
  await expect(pagina.getByText('Esta vez el modelo no pudo proponer alternativas.')).toBeVisible({ timeout: 90_000 })
  await expect(pagina.getByRole('button', { name: 'Volver a intentar' })).toBeVisible()
  await pagina.getByLabel('El costo').check()
  await pagina.getByRole('button', { name: 'Quedarme con mi diseño' }).click()
  await expect(pagina.getByText('Paso 7 completo.')).toBeVisible({ timeout: 30_000 })
  await pagina.getByRole('button', { name: 'Siguiente paso: descargar el informe' }).click()
  await expect(pagina.getByRole('button', { name: 'Dar la prueba de salida' })).toBeVisible({ timeout: 60_000 })
})

test('quedarse con el diseño propio también abre el paso 8', async ({ page: pagina }) => {
  test.setTimeout(240_000)
  await llegarAlPaso7(pagina)
  await pagina.getByLabel('El costo').check({ timeout: 90_000 })
  await pagina.getByRole('button', { name: 'Quedarme con mi diseño' }).click()
  await expect(pagina.getByText('Paso 7 completo.')).toBeVisible({ timeout: 30_000 })
  await pagina.getByRole('button', { name: 'Siguiente paso: descargar el informe' }).click()
  await expect(pagina.getByRole('button', { name: 'Dar la prueba de salida' })).toBeVisible({ timeout: 60_000 })
})
