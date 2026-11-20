// Vuelve a calcular las columnas de la regla (top3Regla, indiceMejorRegla) de ena2024_sitio_cultivo.csv con la regla de
// aptitud vigente del módulo de cálculo, con el mismo clima, suelo y fuente supuesta que p2_nac.mts.
// Uso: npx tsx regla_corregida.mts <scratchpad con piloto/> <repo crop-app> <salida.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const [S, REPO, SALIDA] = process.argv.slice(2)
const m = await import(pathToFileURL(`${REPO}/packages/calculo/src/index.ts`).href)
const { CATALOGO_FAO56, claseTextural, climaDeLosDoceMeses, mejorFechaDeSiembra, VALOR_SIN_DATO } = m
const MESES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DIAS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const FUENTE = { caudalLps: 2, horasDisponiblesDia: 12, conductividadDsM: VALOR_SIN_DATO.conductividadDelAguaDsM }
const sitios = JSON.parse(readFileSync(`${S}/piloto/sitios_nac.json`, 'utf8')).sitios
const power = new Map<string, any>()
const salida: Record<string, { top3: string[]; indiceMejor: number }> = {}
for (const s of sitios) {
  if (!power.has(s.celda)) power.set(s.celda, JSON.parse(readFileSync(`${S}/piloto/power/${s.celda}.json`, 'utf8')))
  const p = power.get(s.celda); const par = p.properties.parameter
  const c = -0.0065 * (s.alt - p.geometry.coordinates[2])
  const normales = MESES.map((k, i) => ({ temperaturaMaximaC: par.T2M_MAX[k] + c, temperaturaMinimaC: par.T2M_MIN[k] + c, humedadRelativaMediaPct: par.RH2M[k], vientoA2mMs: par.WS2M[k], radiacionSolarMJm2Dia: par.ALLSKY_SFC_SW_DWN[k], lluviaMm: par.PRECTOTCORR[k] * DIAS[i]! }))
  const lugar = { altitudM: s.alt, normales, clima: climaDeLosDoceMeses({ latitudGrados: s.lat, altitudM: s.alt, meses: normales }), suelo: { clase: claseTextural({ arenaPct: s.arena, arcillaPct: s.arcilla, limoPct: s.limo }), ph: s.ph }, fuente: FUENTE, areaHa: 1 }
  const orden = CATALOGO_FAO56.map((cultivo: any) => ({ cultivo: cultivo.nombre, indice: mejorFechaDeSiembra({ cultivo, lugar }).indice })).sort((a: any, b: any) => b.indice - a.indice)
  salida[s.id] = { top3: orden.slice(0, 3).map((o: any) => o.cultivo), indiceMejor: orden[0].indice }
}
writeFileSync(SALIDA, JSON.stringify(salida))
console.log('sitios', Object.keys(salida).length, 'sin cultivo apto', Object.values(salida).filter((x) => !(x.indiceMejor > 0)).length)
