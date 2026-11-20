import { expect, test } from '@playwright/test'
import { llegarAlPaso5, prepararElLugar, probarTodo } from './preparar-la-red.ts'

// Los pasos 5 y 6 en un navegador real: la red generada, cambiar un tramo con su predicción antes, regar por sectores,
// cerrar las válvulas y romper un tubo al quitar una cámara (HU0017 a HU0023). La cuenta y el lugar se arman por la API.

test('generar la red, cambiar un tramo y ponerla a funcionar', async ({ page: pagina }) => {
  test.setTimeout(180_000)
  await prepararElLugar(pagina, 2, 0.004)
  await llegarAlPaso5(pagina)

  // La planta y el perfil, a la vez y con el mismo tramo elegido.
  await expect(pagina.getByRole('img', { name: /Perfil de la red/ })).toBeVisible()
  await pagina.getByLabel('Tramo elegido').selectOption('conduccion')
  await expect(pagina.getByRole('heading', { name: 'Conducción' })).toBeVisible()

  // Cambiar un tramo pide antes qué espera; después se ve qué pasó, en el mismo tramo y en el resumen.
  const costo = await pagina.locator('.dato', { hasText: 'Costo referencial' }).locator('dd').textContent()
  await pagina.getByLabel('Diámetro interno · mm').selectOption('32')
  await expect(pagina.getByText('No se califica', { exact: false })).toBeVisible()
  await pagina.getByLabel('La presión baja').check()
  await pagina.getByRole('button', { name: 'Ver qué pasa' }).click()
  await expect(pagina.getByText(/Dijiste «la presión baja»/i)).toBeVisible()
  await expect(pagina.locator('.dato', { hasText: 'Costo referencial' }).locator('dd')).not.toHaveText(costo!)
  await expect(pagina.getByText('Con precios provisionales', { exact: false })).toBeVisible()

  // Deshacer vuelve exactamente a lo generado.
  await pagina.getByRole('button', { name: 'Deshacer el último cambio' }).click()
  await expect(pagina.locator('.dato', { hasText: 'Costo referencial' }).locator('dd')).toHaveText(costo!)

  await pagina.getByRole('button', { name: 'Guardar la red' }).click()
  await pagina.getByRole('button', { name: 'Siguiente paso: poner a funcionar' }).click()

  // Paso 6: confirmar exige haber regado todos los sectores y cerrado las válvulas.
  await expect(pagina.getByRole('heading', { name: /Poner a funcionar el sistema/ })).toBeVisible()
  const confirmar = pagina.getByRole('button', { name: 'Mi diseño funciona' })
  await expect(confirmar).toBeDisabled()
  await pagina.getByRole('button', { name: /^Abrir sector/ }).first().click()
  await expect(pagina.getByText('El agua va llegando…')).toBeVisible()
  await expect(pagina.getByRole('columnheader', { name: 'Entrega · l/h' })).toBeVisible({ timeout: 10_000 })
  await probarTodo(pagina)
  await expect(pagina.getByText('Toda la tubería aguanta la presión con las válvulas cerradas.')).toBeVisible()
  await confirmar.click()
  await expect(pagina.getByRole('region', { name: 'Cierre del paso 6' })).toContainText('Paso 6 completo.')

  // El 3D es el mismo estado, o la vista 2D si este navegador no puede.
  await pagina.getByRole('button', { name: 'Ver en 3D' }).click()
  await expect(pagina.locator('.relieve-3d canvas').or(pagina.getByText('Este equipo no puede mostrar el 3D', { exact: false }))).toBeVisible()
})

test('abrir todos los sectores los riega uno tras otro, como los turnos', async ({ page: pagina }) => {
  test.setTimeout(180_000)
  await prepararElLugar(pagina, 2, 0.004)
  await llegarAlPaso5(pagina)
  await pagina.getByRole('button', { name: 'Guardar la red' }).click()
  await pagina.getByRole('button', { name: 'Siguiente paso: poner a funcionar' }).click()
  await expect(pagina.getByRole('heading', { name: /Poner a funcionar el sistema/ })).toBeVisible()

  const sectores = pagina.getByRole('button', { name: /^Abrir sector/ })
  await expect(sectores.first()).toBeVisible({ timeout: 30_000 })
  const cuantos = await sectores.count()
  expect(cuantos).toBeGreaterThan(1)

  // Un solo clic: el agua avanza en cada sector, uno tras otro, y cada uno queda probado. Al final queda abierto el último.
  await pagina.getByRole('button', { name: 'Abrir todos los sectores' }).click()
  await expect(pagina.getByText('El agua va llegando…')).toBeVisible()
  for (const sector of await sectores.all()) await expect(sector).toHaveClass(/probado/, { timeout: 30_000 })
  await expect(sectores.last()).toHaveAttribute('aria-pressed', 'true')
  await expect(pagina.getByText(/Uniformidad del sector: \d+\.\d %/)).toBeVisible()

  await pagina.getByRole('button', { name: 'Cerrar las válvulas' }).click()
  await expect(pagina.getByRole('button', { name: 'Mi diseño funciona' })).toBeEnabled()
})

test('sin la cámara, al cerrar las válvulas el tubo revienta; con ella, aguanta', async ({ page: pagina }) => {
  test.setTimeout(180_000)
  // Aquí se prueba el cierre, no el agua avanzando: se ve de una vez.
  await pagina.emulateMedia({ reducedMotion: 'reduce' })
  await prepararElLugar(pagina, 2, 0.012)
  await llegarAlPaso5(pagina)

  // Quitar la cámara de la conducción: regando parece que no pasa nada grave; lo grave se ve al cerrar.
  const quitar = pagina.getByRole('button', { name: 'Quitar la cámara del inicio' })
  for (const tramo of ['conduccion2', 'conduccion3', 'conduccion4']) {
    await pagina.getByLabel('Tramo elegido').selectOption(tramo)
    if (await quitar.isVisible()) break
  }
  await quitar.click()
  await pagina.getByLabel('La presión sube').check()
  await pagina.getByRole('button', { name: 'Ver qué pasa' }).click()
  await pagina.getByRole('button', { name: 'Guardar la red' }).click()
  await pagina.getByRole('button', { name: 'Siguiente paso: poner a funcionar' }).click()

  await probarTodo(pagina)
  await expect(pagina.getByRole('rowheader', { name: /se rompe/ }).first()).toBeVisible()
  await expect(pagina.getByText(/tramos no aguantan: en el campo reventarían/)).toBeVisible()
  await expect(pagina.getByRole('button', { name: 'Mi diseño funciona' })).toBeDisabled()

  // La alerta señala el tramo y propone la corrección; corregir obliga a volver a probar.
  await pagina.getByRole('button', { name: /Poner una cámara en/ }).first().click()
  await expect(pagina.getByRole('button', { name: /Poner una cámara en/ })).toHaveCount(0)
  await probarTodo(pagina)
  await expect(pagina.getByText('Toda la tubería aguanta la presión con las válvulas cerradas.')).toBeVisible()
  await pagina.getByRole('button', { name: 'Mi diseño funciona' }).click()
  await expect(pagina.getByRole('region', { name: 'Cierre del paso 6' })).toContainText('Paso 6 completo.')
})
