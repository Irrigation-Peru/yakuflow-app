// Paso 2 del piloto: rasgos y orden de aptitud de cada sitio real, con el mismo modulo de calculo de la aplicacion.
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const [S, REPO] = process.argv.slice(2)
const m = await import(pathToFileURL(`${REPO}/packages/calculo/src/index.ts`).href)
const { CATALOGO_FAO56, claseTextural, climaDeLosDoceMeses, mejorFechaDeSiembra, rasgosDelLugar, RASGOS_DEL_LUGAR, VALOR_SIN_DATO } = m

const MESES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DIAS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const GRADIENTE = 0.0065
const sitios = JSON.parse(readFileSync(`${S}/piloto/sitios_nac.json`, 'utf8')).sitios
const power = new Map<string, any>()

// La ENA y el censo no traen el agua del lugar: se usa el mismo supuesto en todos los sitios, para el modelo y la regla.
const FUENTE = { caudalLps: 2, horasDisponiblesDia: 12, conductividadDsM: VALOR_SIN_DATO.conductividadDelAguaDsM }

console.log('catalogo', CATALOGO_FAO56.map((c: any) => c.nombre))
const salida: any[] = []
let fallos = 0
for (const s of sitios) {
  if (!power.has(s.celda)) power.set(s.celda, JSON.parse(readFileSync(`${S}/piloto/power/${s.celda}.json`, 'utf8')))
  const p = power.get(s.celda)
  const par = p.properties.parameter
  const correccion = -GRADIENTE * (s.alt - p.geometry.coordinates[2])
  const normales = MESES.map((k, i) => ({
    temperaturaMaximaC: par.T2M_MAX[k] + correccion,
    temperaturaMinimaC: par.T2M_MIN[k] + correccion,
    humedadRelativaMediaPct: par.RH2M[k],
    vientoA2mMs: par.WS2M[k],
    radiacionSolarMJm2Dia: par.ALLSKY_SFC_SW_DWN[k],
    lluviaMm: par.PRECTOTCORR[k] * DIAS[i]!,
  }))
  try {
    const lugar = {
      altitudM: s.alt,
      normales,
      clima: climaDeLosDoceMeses({ latitudGrados: s.lat, altitudM: s.alt, meses: normales }),
      suelo: { clase: claseTextural({ arenaPct: s.arena, arcillaPct: s.arcilla, limoPct: s.limo }), ph: s.ph },
      fuente: FUENTE,
      areaHa: 1,
    }
    const indices = CATALOGO_FAO56.map((cultivo: any) => ({ cultivo: cultivo.nombre, indice: mejorFechaDeSiembra({ cultivo, lugar }).indice }))
    const orden = [...indices].sort((a: any, b: any) => b.indice - a.indice)
    salida.push({ id: s.id, dep: s.dep, region: s.region, total: s.total, celda: s.celda, alt: s.alt, cultivos: s.cultivos, rasgos: rasgosDelLugar(lugar), ranking: orden.map((o: any) => o.cultivo), indices: orden.map((o: any) => o.indice) })
  } catch (e) {
    fallos += 1
    if (fallos < 4) console.log('fallo', s.id, String(e).slice(0, 120))
  }
}
writeFileSync(`${S}/piloto/sitios-rasgos-nac.json`, JSON.stringify({ rasgos: RASGOS_DEL_LUGAR, sitios: salida }))
console.log('sitios', salida.length, 'fallos', fallos)
const prim = new Map<string, number>()
for (const f of salida) prim.set(f.ranking[0], (prim.get(f.ranking[0]) ?? 0) + 1)
console.log('primer lugar de la regla', [...prim])
console.log('sin ningun cultivo apto', salida.filter((f) => !(f.indices[0] > 0)).length)
