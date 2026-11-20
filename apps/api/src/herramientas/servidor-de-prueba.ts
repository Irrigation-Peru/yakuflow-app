import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { crearApp } from '../app.ts'
import { PARAMETROS_POR_OMISION } from '../configuracion.ts'
import { cargarBanco } from '../instrumento/banco.ts'
import type { ProveedorDeClima } from '../servicios/clima.ts'
import { elevacionDeEscenario, type Escenario } from '../servicios/elevacion.ts'
import type { ProveedorDeFuentesDeReferencia } from '../servicios/fuentes-de-referencia.ts'
import type { ProveedorDeSuelo } from '../servicios/suelo.ts'
import { bdEnMemoria } from './bd-en-memoria.ts'

// La API para las pruebas de punta a punta (apps/web/e2e): base en memoria con el banco de ejemplo, un relieve
// sintético en lugar del DEM y teselas en blanco. No sale a internet, así que la prueba da siempre lo mismo.
// `pnpm --filter @riego/api servidor-de-prueba`

const PUERTO = Number(process.env.PORT ?? 3100)

// Un plano inclinado alrededor de Cerro de Pasco: sube 6 m cada 100 m hacia el norte y 2 m cada 100 m hacia el
// este, desde 3400 m. Se declara como sintético para que nadie lo confunda con un dato del lugar.
const CENTRO = { lat: -10.68, lon: -76.26 }
const PASO = 0.001
const LADO = 101
const METROS_POR_GRADO = 111_195
const relieve: Escenario = {
  nombre: 'Relieve sintético de las pruebas',
  fuente: { nombre: 'Relieve sintético (no es un dato del lugar)', resolucionM: 30, respaldo: false },
  latSur: CENTRO.lat - (PASO * (LADO - 1)) / 2,
  lonOeste: CENTRO.lon - (PASO * (LADO - 1)) / 2,
  pasoGrados: PASO,
  filas: LADO,
  columnas: LADO,
  cotas: Array.from({ length: LADO * LADO }, (_, i) => {
    const norte = (Math.floor(i / LADO) - (LADO - 1) / 2) * PASO * METROS_POR_GRADO
    const este = ((i % LADO) - (LADO - 1) / 2) * PASO * METROS_POR_GRADO * Math.cos((CENTRO.lat * Math.PI) / 180)
    return 3400 + 0.06 * norte + 0.02 * este
  }),
}

// Un clima de puna, parecido al de Pasco a 3400 m: lluvias de diciembre a marzo, noches frías de junio a agosto. Se
// declara como sintético, igual que el relieve.
const SINTETICO = { nombre: 'Clima sintético de las pruebas (no es un dato del lugar)', resolucion: 'sin resolución', respaldo: false }
const LLUVIA_MM = [130, 140, 120, 60, 20, 8, 6, 12, 35, 60, 75, 110]
const MINIMA_C = [5, 5, 5, 4, 2, 0, -1, 0, 2, 3, 4, 5]
const clima: ProveedorDeClima = {
  normales: async () => ({
    meses: LLUVIA_MM.map((lluviaMm, i) => ({
      temperaturaMaximaC: 17,
      temperaturaMinimaC: MINIMA_C[i]!,
      humedadRelativaMediaPct: lluviaMm > 50 ? 75 : 60,
      vientoA2mMs: 2,
      radiacionSolarMJm2Dia: lluviaMm > 50 ? 17 : 20,
      lluviaMm,
    })),
    lluvia: SINTETICO,
    atmosfera: SINTETICO,
  }),
}
const suelo: ProveedorDeSuelo = {
  suelo: async () => ({
    arenaPct: 40,
    limoPct: 40,
    arcillaPct: 20,
    ph: 6,
    fuente: { nombre: 'Suelo sintético de las pruebas (no es un dato del lugar)', resolucion: 'sin resolución', respaldo: false },
  }),
}

// Una bocatoma y una laguna al norte de la parcela de las pruebas, declaradas como sintéticas.
const fuentesDeReferencia: ProveedorDeFuentesDeReferencia = {
  cerca: async () => ({
    puntos: [
      { tipo: 'bocatoma', nombre: 'Bocatoma de prueba', fuenteNatural: 'Quebrada de prueba', altitudMsnm: 3480, anioInventario: '2020', lat: CENTRO.lat + 0.012, lon: CENTRO.lon - 0.012 },
      { tipo: 'laguna', nombre: null, fuenteNatural: null, altitudMsnm: null, anioInventario: null, lat: CENTRO.lat + 0.015, lon: CENTRO.lon + 0.012 },
    ],
    fuente: { nombre: 'Fuentes sintéticas de las pruebas (no son datos del lugar)', resolucion: 'puntual', respaldo: false },
  }),
}

// Un PNG gris de 1 × 1.
const TESELA = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP4DwABAQEAG7buVgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

const { bd } = await bdEnMemoria()
const banco = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'instrumento', 'banco-de-ejemplo.json'), 'utf8'))
await cargarBanco(bd, banco, { borrador: true })

const app = crearApp({
  bd,
  config: {
    dominioCorreo: 'undac.edu.pe',
    codigosCurso: ['AGR-PRUEBA'],
    secretoJwt: new TextEncoder().encode('secreto de las pruebas de punta a punta, no se usa en otro lado'),
    origenWeb: 'http://localhost:5174',
    contactoOsm: 'pruebas',
    produccion: false,
    cookieEntreSitios: false,
    documentacionPublica: true,
    costoBcrypt: 4,
    ...PARAMETROS_POR_OMISION,
  },
  elevacion: elevacionDeEscenario(relieve),
  clima,
  suelo,
  fuentesDeReferencia,
  obtenerTesela: (async () => new Response(TESELA, { headers: { 'Content-Type': 'image/png' } })) as typeof fetch,
})
app.listen(PUERTO, () => console.log(`API de prueba en http://localhost:${PUERTO}`))
