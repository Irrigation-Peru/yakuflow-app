import { expect, test, type Page } from '@playwright/test'

// El recorrido del Sprint 2 en un navegador real, sobre el relieve, el clima y el suelo sintéticos de la API de prueba:
// el suelo y el clima del lugar con su origen, el relieve en 3D, los cultivos que sugiere el modelo, la curva del agua
// con sus salidas y el diseño agronómico con el corte del suelo (HU0009 a HU0016). La cuenta y el lugar se arman por la
// API, que ya prueba el recorrido del Sprint 1.

const CENTRO = { lat: -10.68, lon: -76.26 }
const LADO = 0.0005

async function prepararElLugar(pagina: Page, caudalLps: number) {
  await pagina.goto('/')
  return pagina.evaluate(
    async ({ centro, lado, caudalLps }) => {
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
      await llamar('/cuenta', 'POST', { correo: `campana${Date.now()}@undac.edu.pe`, contrasena: 'una clave larga', nombres: 'Estudiante de prueba', codigoCurso: 'AGR-PRUEBA' })
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
      // Unos 445 m al norte: el relieve sintético sube 6 % hacia allá, así que la fuente queda unos 27 m más arriba.
      await llamar(`/proyectos/${proyecto.id}/fuente`, 'PUT', {
        lat: lat + 0.004,
        lon,
        tipo: 'manantial',
        caudalLps,
        horasDisponiblesDia: 12,
        conductividadDsM: 0.4,
        origenDato: 'campo',
      })
    },
    { centro: CENTRO, lado: LADO, caudalLps },
  )
}

const dato = (pagina: Page, nombre: string) => pagina.locator('.dato', { hasText: nombre }).locator('dd')

test('del lugar al diseño agronómico', async ({ page: pagina }) => {
  await prepararElLugar(pagina, 0.07)
  await pagina.reload()
  await pagina.getByRole('button', { name: 'Continuar' }).first().click()

  // Paso 2: el modelo sugiere tres cultivos, cada uno con su probabilidad y lo que más pesó.
  await expect(pagina.getByRole('heading', { name: /Elegir qué sembrar/ })).toBeVisible()
  const sugerencias = pagina.locator('.sugerencia')
  await expect(sugerencias).toHaveCount(3, { timeout: 30_000 })
  for (const tarjeta of await sugerencias.all()) await expect(tarjeta).toContainText('lo que más pesó fue')
  // Las condiciones de cada sugerencia, una por una, a un clic.
  await sugerencias.nth(0).getByText('Ver condiciones').click()
  await expect(sugerencias.nth(0).getByRole('table')).toContainText('Lo que necesita')
  await expect(pagina.getByText(/un bosque aleatorio que corre en tu navegador/)).toBeVisible()

  // Elegir uno muestra el calendario de etapas con la de mayor demanda. Se sigue con papa, del catálogo, para que el
  // resto no dependa de lo que sugiera el modelo.
  const deInicio = (await sugerencias.nth(0).getByRole('heading').textContent()) === 'Papa' ? 1 : 0
  await sugerencias.nth(deInicio).getByRole('button', { name: 'Elegir' }).click()
  await expect(pagina.getByRole('table').filter({ hasText: 'Etapa' })).toContainText('mayor demanda')
  // Cambiar de cultivo pide antes una predicción, que no se califica, y después la compara con lo que pasó.
  await pagina.getByLabel('Escoger otro cultivo del catálogo').selectOption('Papa')
  await expect(pagina.getByText('No se califica', { exact: false })).toBeVisible()
  await pagina.getByLabel('Pedirá más agua').check()
  await pagina.getByRole('button', { name: 'Ver qué pasa' }).click()
  await expect(pagina.locator('.efecto .aviso')).toContainText('Antes de verlo dijiste: «pedirá más agua»')
  await pagina.getByRole('button', { name: 'Comprobar si el agua alcanza' }).click()

  // Paso 3: la curva semana a semana, con la semana de mayor demanda marcada y el veredicto.
  await expect(pagina.getByRole('heading', { name: /Comprobar el agua/ })).toBeVisible()
  await expect(pagina.getByRole('img', { name: /la semana \d+ es la que más riego pide/ })).toBeVisible()
  const veredicto = pagina.locator('.veredicto')
  await expect(veredicto).toContainText(/Alcanza a medias|No alcanza/)
  await expect(veredicto).toContainText(/es la que más riego pide: \d+\.\d{2} l\/s\..*Tu fuente da 0\.07 l\/s/)
  // Con 0.07 l/s la papa no alcanza: se prueba una salida, con su predicción antes, y la curva se recalcula.
  await expect(pagina.getByRole('button', { name: 'Definir cómo regar' })).toBeDisabled()
  await pagina.locator('label.salida:not(.no-viable)').first().click()
  await pagina.getByRole('button', { name: 'Recalcular la curva' }).click()
  await pagina.getByLabel('Se cubren todas las semanas').check()
  await pagina.getByRole('button', { name: 'Ver qué pasa' }).click()
  await expect(veredicto).toContainText(/alcanza para todas las semanas|alcanza también si no llueve|lo pone el reservorio/)
  await expect(pagina.getByText(/Antes quedaban? \d+ semanas? sin cubrir y ahora ninguna/)).toBeVisible()
  await pagina.getByRole('button', { name: 'Definir cómo regar' }).click()

  // Paso 4: el método recomendado con su lámina, frecuencia, tiempo y turnos, y el corte del suelo.
  await expect(pagina.getByRole('heading', { name: /Definir cómo regar/ })).toBeVisible()
  await expect(pagina.getByRole('radio', { name: /Goteo.*recomendado/i })).toBeChecked()
  // Con el agua justa puede faltar un turno entero: el paso 4 ofrece el remedio según la salida elegida, y con él caben.
  await expect(dato(pagina, 'Turnos')).toHaveText(/^(\d+|no caben)$/)
  if ((await dato(pagina, 'Turnos').textContent()) === 'no caben') {
    await pagina.getByRole('button', { name: /^(Regar en \d+ turnos|Regar [\d.]+ ha|Un reservorio de)/ }).click()
  }
  await expect(dato(pagina, 'Lámina neta')).toHaveText(/^\d+\.\d mm$/)
  await expect(dato(pagina, 'Frecuencia')).toHaveText(/^cada \d+ días?$/)
  await expect(dato(pagina, 'Turnos')).toHaveText(/^\d+$/)
  await expect(pagina.getByText(/Son \d+ turnos porque|toda la parcela a la vez/)).toBeVisible()
  await expect(pagina.getByRole('img', { name: /Corte del suelo de través a tres laterales/ })).toBeVisible()
  // El tiempo del corte cambia lo que se moja, no el diseño.
  const lamina = await dato(pagina, 'Lámina neta').textContent()
  const corte = pagina.getByRole('img', { name: /Corte del suelo/ })
  const antes = await corte.getAttribute('aria-label')
  await pagina.getByRole('slider').fill('1')
  await expect(corte).not.toHaveAttribute('aria-label', antes!)
  await expect(dato(pagina, 'Lámina neta')).toHaveText(lamina!)
  // La aspersión no llega con la carga que da el desnivel: se puede mirar, pero no guardar.
  await pagina.getByRole('radio', { name: /Aspersión/ }).check()
  await expect(pagina.getByText('Estás probando un método que no es viable aquí')).toBeVisible()
  await expect(pagina.getByRole('button', { name: 'Guardar el diseño agronómico' })).toBeDisabled()
  await pagina.getByRole('radio', { name: /Goteo/ }).check()
  await pagina.getByRole('button', { name: 'Guardar el diseño agronómico' }).click()
  await expect(pagina.getByRole('region', { name: 'Cierre del paso 4' })).toContainText('Paso 4 completo.')

  // Paso 1, de vuelta: el suelo y el clima con su origen, y el relieve en 3D (o el perfil en 2D si no hay WebGL).
  await pagina.getByRole('navigation', { name: 'Pasos del recorrido' }).getByRole('button', { name: /^Conocer el lugar/ }).click()
  await expect(pagina.getByText('Suelo sintético de las pruebas (no es un dato del lugar)', { exact: false })).toBeVisible()
  await expect(pagina.getByText('Clima sintético de las pruebas (no es un dato del lugar)', { exact: false }).first()).toBeVisible()
  await pagina.getByRole('button', { name: 'Ver el terreno en 3D' }).click()
  await expect(pagina.locator('.relieve-3d canvas').or(pagina.locator('.perfil.plano'))).toBeVisible()
  await pagina.getByRole('button', { name: 'Volver al mapa' }).click()
  await expect(pagina.locator('.mapa')).toBeVisible()
})
