import { expect, type Page } from '@playwright/test'

// Lo que comparten las pruebas de la red y las de los pasos siguientes.

const CENTRO = { lat: -10.68, lon: -76.26 }
const LADO = 0.0005

/** `alNorte`, en grados: el relieve sintético sube 6 % hacia allá, así que aleja la fuente y le da más desnivel. */
export async function prepararElLugar(pagina: Page, caudalLps: number, alNorte: number) {
  await pagina.goto('/')
  await pagina.evaluate(
    async ({ centro, lado, caudalLps, alNorte }) => {
      const llamar = async (ruta: string, metodo = 'GET', cuerpo?: unknown) => {
        const r = await fetch(`/api${ruta}`, {
          method: metodo,
          credentials: 'include',
          headers: { 'X-Riego': '1', 'Content-Type': 'application/json' },
          body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        })
        if (!r.ok) throw new Error(`${metodo} ${ruta}: ${r.status} ${await r.text()}`)
        const texto = await r.text()
        return texto ? JSON.parse(texto) : null
      }
      await llamar('/cuenta', 'POST', { correo: `red${Date.now()}@undac.edu.pe`, contrasena: 'una clave larga', nombres: 'Estudiante de prueba', codigoCurso: 'AGR-PRUEBA' })
      const { version } = await llamar('/consentimiento')
      await llamar('/consentimiento', 'POST', { version })
      const prueba = await llamar('/evaluaciones/entrada', 'POST')
      for (const item of prueba.items) await llamar(`/evaluaciones/entrada/respuestas/${item.id}`, 'PUT', { alternativa: item.alternativas[0].letra })
      await llamar('/evaluaciones/entrada/fin', 'POST')
      const proyecto = await llamar('/proyectos', 'POST', { nombre: 'Campaña de prueba' })
      const { lat, lon } = centro
      await llamar(`/proyectos/${proyecto.id}/parcela`, 'PUT', {
        contorno: [
          { lat: lat - lado, lon: lon - lado },
          { lat: lat - lado, lon: lon + lado },
          { lat: lat + lado, lon: lon + lado },
          { lat: lat + lado, lon: lon - lado },
        ],
      })
      await llamar(`/proyectos/${proyecto.id}/fuente`, 'PUT', { lat: lat + alNorte, lon, tipo: 'manantial', caudalLps, horasDisponiblesDia: 12, conductividadDsM: 0.4, origenDato: 'campo' })
    },
    { centro: CENTRO, lado: LADO, caudalLps, alNorte },
  )
}

/** Del paso 2 al paso 5 con lo que la app recomienda en cada uno: aquí no es lo que se prueba. */
export async function llegarAlPaso5(pagina: Page) {
  await pagina.reload()
  await pagina.getByRole('button', { name: 'Continuar' }).first().click()
  await expect(pagina.locator('.sugerencia')).toHaveCount(3, { timeout: 30_000 })
  // Se sigue con papa, pero se entra por otro cultivo: elegir el mismo no pediría predicción.
  const deInicio = (await pagina.locator('.sugerencia').first().getByRole('heading').textContent()) === 'Papa' ? 1 : 0
  await pagina.locator('.sugerencia').nth(deInicio).getByRole('button', { name: 'Elegir' }).click()
  await pagina.getByLabel('Escoger otro cultivo del catálogo').selectOption('Papa')
  await pagina.getByLabel('No lo sé').check()
  await pagina.getByRole('button', { name: 'Ver qué pasa' }).click()
  await pagina.getByRole('button', { name: 'Comprobar si el agua alcanza' }).click()
  await pagina.getByRole('button', { name: 'Definir cómo regar' }).click()
  await pagina.getByRole('radio', { name: /Goteo/ }).check()
  await pagina.getByRole('button', { name: 'Guardar el diseño agronómico' }).click()
  await pagina.getByRole('button', { name: 'Siguiente paso: generar la red' }).click()
  await expect(pagina.getByRole('heading', { name: /Generar el diseño de la red/ })).toBeVisible()
  await expect(pagina.getByRole('img', { name: /Red en planta/ })).toBeVisible({ timeout: 30_000 })
}

export async function probarTodo(pagina: Page) {
  const sectores = pagina.getByRole('button', { name: /^Abrir sector/ })
  for (const sector of await sectores.all()) {
    await sector.click()
    await expect(pagina.getByText(/Uniformidad del sector: \d+\.\d %/)).toBeVisible({ timeout: 10_000 })
  }
  await pagina.getByRole('button', { name: 'Cerrar las válvulas' }).click()
}
