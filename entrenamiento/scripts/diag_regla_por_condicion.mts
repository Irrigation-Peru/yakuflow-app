// Diagnóstico del paso 2: en los lugares donde la ENA 2024 registra la cosecha de un cultivo, ¿qué dice la regla de
// aptitud de la app para ese cultivo, en su mejor fecha, y qué condición la deja fuera?
// Uso: npx tsx diag_regla_por_condicion.mts <scratchpad con piloto/> <repo crop-app> <ena2024_sitio_cultivo.csv>
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const [S, REPO, ENA] = process.argv.slice(2)
const m = await import(pathToFileURL(`${REPO}/packages/calculo/src/index.ts`).href)
const { CATALOGO_FAO56, aptitudDelCultivo, claseTextural, climaDeLosDoceMeses, mejorFechaDeSiembra, VALOR_SIN_DATO } = m
const MESES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DIAS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const FUENTE = { caudalLps: 2, horasDisponiblesDia: 12, conductividadDsM: VALOR_SIN_DATO.conductividadDelAguaDsM }
const crudo = JSON.parse(readFileSync(`${S}/piloto/${process.env.SITIOS ?? 'sitios.json'}`, 'utf8'))
const sitios = new Map<string, any>((Array.isArray(crudo) ? crudo : crudo.sitios).map((s: any) => [String(s.id), s]))
const lineas = readFileSync(ENA, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
const cab = lineas[0]!.split(',')
const parse = (l: string) => { const v: string[] = []; let a = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { v.push(a); a = '' } else a += ch } v.push(a); return Object.fromEntries(cab.map((c, i) => [c, v[i]])) }
const filas = lineas.slice(1).map(parse).filter((r) => r.aptoGoteo === '1' && r.enCatalogoActual === '1')
const power = new Map<string, any>()
const lugarDe = (s: any) => {
  if (!power.has(s.celda)) power.set(s.celda, JSON.parse(readFileSync(`${S}/piloto/power/${s.celda}.json`, 'utf8')))
  const p = power.get(s.celda); const par = p.properties.parameter
  const c = -0.0065 * (s.alt - p.geometry.coordinates[2])
  const normales = MESES.map((k, i) => ({ temperaturaMaximaC: par.T2M_MAX[k] + c, temperaturaMinimaC: par.T2M_MIN[k] + c, humedadRelativaMediaPct: par.RH2M[k], vientoA2mMs: par.WS2M[k], radiacionSolarMJm2Dia: par.ALLSKY_SFC_SW_DWN[k], lluviaMm: par.PRECTOTCORR[k] * DIAS[i]! }))
  return { altitudM: s.alt, normales, clima: climaDeLosDoceMeses({ latitudGrados: s.lat, altitudM: s.alt, meses: normales }), suelo: { clase: claseTextural({ arenaPct: s.arena, arcillaPct: s.arcilla, limoPct: s.limo }), ph: s.ph }, fuente: FUENTE, areaHa: 1 }
}
const lugares = new Map<string, any>()
const res: Record<string, { n: number; fuera: number; marginal: number; soloRiesgo: number; porCondicion: Record<string, number> }> = {}
let sinSitio = 0
const porRegion: Record<string, { n: number; fuera: number }> = {}
for (const r of filas) {
  const id = r.sitio!
  const s = sitios.get(id) ?? sitios.get(r.sitio!)
  if (!s) { sinSitio++; continue }
  if (!lugares.has(id)) lugares.set(id, lugarDe(s))
  const lugar = lugares.get(id)
  const cultivo = CATALOGO_FAO56.find((c: any) => c.nombre === r.cultivo)
  const { fechaSiembra } = mejorFechaDeSiembra({ cultivo, lugar })
  const a = aptitudDelCultivo({ cultivo, fechaSiembra, lugar })
  const e = (res[r.cultivo!] ??= { n: 0, fuera: 0, marginal: 0, soloRiesgo: 0, porCondicion: {} })
  e.n++
  const g = (porRegion[r.region!] ??= { n: 0, fuera: 0 }); g.n++; if (a.nivel === 'fuera') g.fuera++
  if (a.nivel === 'fuera') {
    e.fuera++
    if (a.condiciones.filter((x: any) => x.nivel === 'fuera').every((x: any) => x.condicion === 'altitud' || x.condicion === 'helada')) e.soloRiesgo++
    for (const c of a.condiciones.filter((x: any) => x.nivel === 'fuera')) e.porCondicion[c.condicion] = (e.porCondicion[c.condicion] ?? 0) + 1
  } else if (a.nivel === 'marginal') e.marginal++
}
console.log('sin sitio', sinSitio)
let n = 0, f = 0, sr = 0
for (const [k, e] of Object.entries(res)) {
  n += e.n; f += e.fuera; sr += e.soloRiesgo
  const cond = Object.entries(e.porCondicion).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c} ${(100 * v / e.n).toFixed(1)} %`).join(', ')
  console.log(`${k.padEnd(18)} n ${String(e.n).padStart(5)}  fuera ${(100 * e.fuera / e.n).toFixed(1).padStart(5)} %  marginal ${(100 * e.marginal / e.n).toFixed(1).padStart(5)} %  por: ${cond}  · solo por altitud o helada ${(100 * e.soloRiesgo / e.n).toFixed(1)} %`)
}
for (const [k, g] of Object.entries(porRegion)) console.log(`${k.padEnd(8)} n ${g.n}  fuera ${(100 * g.fuera / g.n).toFixed(1)} %`)
console.log(`Total fuera ${(100 * f / n).toFixed(1)} % de ${n}; quedarían fuera ${(100 * (f - sr) / n).toFixed(1)} %`)
