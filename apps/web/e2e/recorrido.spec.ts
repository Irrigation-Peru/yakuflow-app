import { expect, test, type Page } from '@playwright/test'

// El recorrido del Sprint 1 en un navegador real: crear la cuenta con el consentimiento, responder la prueba
// de entrada, crear un proyecto y conocer el lugar (HU0005, HU0006, HU0007).

async function clicEnElMapa(pagina: Page, x: number, y: number) {
  const caja = (await pagina.locator('.mapa').boundingBox())!
  await pagina.mouse.click(caja.x + caja.width * x, caja.y + caja.height * y)
}

const dato = (pagina: Page, nombre: string) => pagina.locator('.dato', { hasText: nombre }).locator('dd')

test('del registro al lugar del proyecto', async ({ page: pagina }) => {
  await pagina.goto('/')

  // Paso 0: la cuenta y el consentimiento, juntos.
  await pagina.getByLabel('Correo de la universidad').fill(`e2e${Date.now()}@undac.edu.pe`)
  await pagina.getByLabel('Código del curso').fill('AGR-PRUEBA')
  await pagina.getByLabel('Nombres').fill('Estudiante de prueba')
  await pagina.getByLabel('Contraseña', { exact: true }).fill('una clave larga')
  await pagina.getByLabel('Repetir la contraseña').fill('una clave larga')
  await pagina.getByRole('button', { name: 'Continuar a la prueba de entrada' }).click()
  await expect(pagina.getByText('Para participar tienes que aceptar el consentimiento')).toBeVisible()
  await pagina.getByLabel('He leído y acepto participar').check()
  await pagina.getByRole('button', { name: 'Continuar a la prueba de entrada' }).click()

  // Paso 0: la prueba de entrada, sin ver si se acierta.
  await expect(pagina.getByRole('heading', { name: 'Prueba de entrada' })).toBeVisible()
  await expect(pagina.getByText('No se muestra si acertaste')).toBeVisible()
  const total = Number((await pagina.getByText(/Ítem 1 de \d+/).textContent())!.match(/de (\d+)/)![1])
  // Sin marcar una alternativa no se avanza; al volver a un ítem ya marcado, sí.
  await expect(pagina.getByText('Marca una alternativa para seguir')).toBeVisible()
  for (let i = 1; i <= total; i++) {
    await expect(pagina.getByText(`Ítem ${i} de ${total}`)).toBeVisible()
    if (i < total) await expect(pagina.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    await pagina.locator('.alternativa').first().click()
    if (i < total) await pagina.getByRole('button', { name: 'Siguiente' }).click()
    if (i === 2) {
      await pagina.getByRole('button', { name: 'Anterior' }).click()
      await expect(pagina.getByText('Marca una alternativa para seguir')).toBeHidden()
      await pagina.getByRole('button', { name: 'Siguiente' }).click()
    }
  }
  await pagina.getByRole('button', { name: 'Terminar la prueba' }).click()
  // Terminar no se deshace: la app lo confirma en un diálogo.
  await pagina.getByRole('dialog').getByRole('button', { name: 'Terminar la prueba' }).click()

  // Mis proyectos.
  await pagina.getByRole('button', { name: 'Nuevo proyecto' }).click()
  await pagina.getByLabel('Nombre del proyecto').fill('Ladera de prueba')
  await pagina.getByRole('button', { name: 'Crear y empezar' }).click()

  // Paso 1: la parcela. El área, la pendiente y las cotas salen del mapa.
  await expect(pagina.getByRole('heading', { name: /Conocer el lugar/ })).toBeVisible()
  await pagina.getByRole('button', { name: 'Dibujar la parcela' }).click()
  await clicEnElMapa(pagina, 0.45, 0.45)
  await clicEnElMapa(pagina, 0.6, 0.45)
  await clicEnElMapa(pagina, 0.6, 0.6)
  await expect(dato(pagina, 'Área de la parcela')).toContainText('≈')
  await clicEnElMapa(pagina, 0.45, 0.6)
  await clicEnElMapa(pagina, 0.45, 0.45)
  await expect(dato(pagina, 'Área de la parcela')).toHaveText(/^\d+\.\d{2} ha$/)
  // El relieve sintético sube 6 % al norte y 2 % al este: √(6² + 2²) ≈ 6.3 %.
  await expect(dato(pagina, 'Pendiente media')).toHaveText('6.3 %')
  await expect(pagina.getByText('Relieve sintético (no es un dato del lugar)')).toBeVisible()
  await expect(pagina.getByRole('img', { name: /Perfil del terreno/ })).toBeVisible()

  // Paso 1: la fuente, más arriba, y lo que el estudiante midió. Mientras la ubica, el mapa pinta por zonas
  // hasta dónde llega el agua por gravedad y marca el punto más alto de la parcela.
  await pagina.getByRole('button', { name: 'Ubicar la fuente' }).click()
  await expect(pagina.getByRole('region', { name: 'Zonas para ubicar la fuente' })).toContainText('Adecuada')
  await expect(pagina.getByText(/^punto más alto · [\d,]+ m$/)).toBeVisible()
  // Las bocatomas, tomas y lagunas cercanas, como referencia y con su origen.
  await expect(pagina.getByText(/Puntos de referencia:.*Fuentes sintéticas de las pruebas/)).toBeVisible()
  // Unos 575 m al norte de la parcela: más de 15 m sobre su punto más alto y más de 50 m sobre el más bajo.
  const caja = (await pagina.locator('.mapa').boundingBox())!
  await pagina.mouse.move(caja.x + caja.width * 0.52, caja.y + caja.height * 0.35)
  await expect(pagina.locator('.lectura-del-cursor')).toContainText('Necesita cámaras rompe-presión')
  await expect(pagina.locator('.lectura-del-cursor')).toContainText(/m sobre el punto más alto/)
  await clicEnElMapa(pagina, 0.52, 0.15)
  await pagina.getByLabel('Caudal en la época seca (estiaje) · l/s').fill('4')
  await pagina.getByLabel('Horas de agua al día').fill('12')
  await pagina.getByRole('button', { name: 'Guardar la fuente' }).click()
  await expect(dato(pagina, 'Desnivel disponible')).toHaveText(/^\d+\.\d m$/)
  await expect(dato(pagina, 'Agua que entrega al día')).toHaveText('172.8 m³')

  // Con más de 50 m entre la fuente y el punto más bajo, la conducción lleva cámaras rompe-presión: en el panel,
  // en su perfil y sobre la línea del mapa.
  const conduccion = pagina.getByRole('region', { name: 'Conducción de la fuente a la parcela' })
  await expect(conduccion).toContainText(/La tubería de la fuente a la parcela necesita \d+ cámaras rompe-presión/)
  await expect(conduccion.getByText(/^CRP 1: a [\d,]+ m de la fuente, a [\d,]+ m de altitud$/)).toBeVisible()
  await expect(pagina.getByRole('img', { name: /Perfil de la conducción .* cámaras rompe-presión/ })).toBeVisible()
  await expect(pagina.locator('.mapa').getByText('CRP 1', { exact: true })).toBeVisible()

  // Junto al botón se confirma lo guardado, y el paso 1 se cierra con el siguiente paso a la vista.
  // El encabezado tiene su propio estado, el de la sincronización: se lee el del paso.
  await expect(pagina.getByRole('main').getByRole('status')).toHaveText(/^Guardamos la fuente\. Tienes [\d.,]+ m de desnivel, y la conducción necesita \d+ cámaras rompe-presión\.$/)
  const cierre = pagina.getByRole('region', { name: 'Cierre del paso 1' })
  await expect(cierre).toContainText('Paso 1 completo.')
  await expect(cierre.getByRole('button', { name: 'Siguiente paso: elegir qué sembrar' })).toBeEnabled()
  // Si cambia lo medido, la confirmación se va hasta que se vuelva a guardar.
  await pagina.getByLabel('Horas de agua al día').fill('10')
  await expect(pagina.getByRole('main').getByRole('status')).toHaveText('')
  await pagina.getByLabel('Horas de agua al día').fill('12')

  // El registro de actividad se vacía solo: nada queda pendiente en el equipo.
  await expect
    .poll(() => pagina.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('riego.registro.')).map((k) => JSON.parse(localStorage.getItem(k)!).length)), {
      timeout: 15_000,
    })
    .toEqual([0])

  // Al volver, el proyecto se abre en el último paso alcanzado, y el paso 1 sigue donde quedó.
  await pagina.reload()
  await expect(pagina.getByRole('heading', { name: /Elegir qué sembrar/ })).toBeVisible()
  await pagina.getByRole('navigation', { name: 'Pasos del recorrido' }).getByRole('button', { name: /^Conocer el lugar/ }).click()
  await expect(dato(pagina, 'Pendiente media')).toHaveText('6.3 %')
  await expect(dato(pagina, 'Agua que entrega al día')).toHaveText('172.8 m³')
  await expect(pagina.getByRole('region', { name: 'Cierre del paso 1' })).toBeVisible()

  // Salir lleva a la pantalla de entrada sin recargar, y al recargar la sesión sigue cerrada.
  await pagina.getByLabel('Menú de Estudiante de prueba').click()
  await pagina.getByRole('button', { name: 'Salir' }).click()
  await expect(pagina.getByLabel('Correo de la universidad')).toBeVisible()
  await pagina.reload()
  await expect(pagina.getByLabel('Correo de la universidad')).toBeVisible()
})
