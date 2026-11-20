import { describe, expect, it } from 'vitest'
import {
  alertasDelDiseno,
  calcularRed,
  cambiarTramo,
  emisorDelCatalogo,
  generarRed,
  presionesEstaticas,
  presionesMaximas,
  regarPorSectores,
  UNIFORMIDAD_MINIMA,
  type EntradaDisenoDeRed,
  type PuntoLocal,
} from '../src/index.ts'

const cota = (x: number) => 3000 - 0.1 * x
const parcela: PuntoLocal[] = [
  { x: 0, y: 0, z: cota(0) },
  { x: 100, y: 0, z: cota(100) },
  { x: 100, y: 100, z: cota(100) },
  { x: 0, y: 100, z: cota(0) },
]
const gotero = emisorDelCatalogo('gotero-2')

const entrada: EntradaDisenoDeRed = {
  contorno: parcela,
  fuente: { x: -50, y: 50, z: 3040, presionInicialM: 1 },
  cotaEn: (x) => cota(x),
  emisor: {
    caudalNominalLph: gotero.caudalNominalLph,
    presionNominalM: gotero.presionNominalM,
    coeficienteK: gotero.coeficienteK,
    exponenteX: gotero.exponenteX,
  },
  separacionM: gotero.separacionM,
  separacionLateralesM: gotero.separacionLateralesM,
  turnos: 4,
  perdidaCabezalM: 8,
}

const diseno = () => generarRed(entrada)

describe('cambiarTramo', () => {
  it('devuelve una red nueva y no toca la que recibe', () => {
    const { red } = diseno()
    const antes = red.tramos.find((t) => t.id === 'conduccion')!.diametroInternoMm
    const cambiada = cambiarTramo(red, 'conduccion', { diametroInternoMm: 110 })
    expect(cambiada.tramos.find((t) => t.id === 'conduccion')!.diametroInternoMm).toBe(110)
    expect(red.tramos.find((t) => t.id === 'conduccion')!.diametroInternoMm).toBe(antes)
    expect(cambiada).not.toBe(red)
  })

  it('un tramo más delgado baja la presión aguas abajo, y uno más gordo la sube', () => {
    const { red, sectores } = diseno()
    const opciones = { sectoresAbiertos: [sectores[sectores.length - 1]!] }
    const presionDe = (r: typeof red) => calcularRed(r, opciones).nodos['C']!.presionM
    const normal = presionDe(red)
    expect(presionDe(cambiarTramo(red, 'conduccion', { diametroInternoMm: 25.4 }))).toBeLessThan(normal)
    expect(presionDe(cambiarTramo(red, 'conduccion', { diametroInternoMm: 110 }))).toBeGreaterThanOrEqual(normal)
  })

  it('cambia la clase por su código del catálogo', () => {
    const { red } = diseno()
    expect(cambiarTramo(red, 'conduccion', { clase: 'C-15' }).tramos.find((t) => t.id === 'conduccion')!.presionMaximaM).toBe(150)
  })

  it('rechaza lo que no está en el catálogo', () => {
    const { red } = diseno()
    expect(() => cambiarTramo(red, 'no-existe', { clase: 'C-10' })).toThrow(/no tiene un tramo/)
    expect(() => cambiarTramo(red, 'conduccion', { diametroInternoMm: 42 })).toThrow(/no está en el catálogo/)
    expect(() => cambiarTramo(red, 'conduccion', { clase: 'C-99' })).toThrow(/no está en el catálogo/)
  })
})

describe('regarPorSectores', () => {
  it('riega un turno por sector y solo los emisores de ese sector entregan agua', () => {
    const { red, sectores } = diseno()
    const turnos = regarPorSectores(red, sectores)
    expect(turnos.map((t) => t.sector)).toEqual([...sectores])
    for (const turno of turnos) {
      expect(turno.caudalesLph.every((q) => q > 0)).toBe(true)
      const deOtros = red.emisores
        .filter((e) => e.sector !== turno.sector)
        .map((e) => turno.resultado.nodos[e.nodo]?.caudalEmisorLph ?? 0)
      expect(deOtros.every((q) => q === 0)).toBe(true)
    }
  })

  it('la uniformidad va entre 0 y 1 y el diseño generado cumple el criterio', () => {
    const { red, sectores } = diseno()
    for (const turno of regarPorSectores(red, sectores)) {
      expect(turno.uniformidad).toBeGreaterThan(0)
      expect(turno.uniformidad).toBeLessThanOrEqual(1)
      expect(turno.uniformidad).toBeGreaterThanOrEqual(UNIFORMIDAD_MINIMA)
    }
  })
})

describe('presionesEstaticas', () => {
  it('es el desnivel desde el nivel de la fuente, sin descontar el cabezal: sin caudal no hay pérdida', () => {
    const { red } = diseno()
    const estaticas = presionesEstaticas(red)
    const masBajo = [...red.nodos].sort((a, b) => a.z - b.z)[0]!
    // Nivel del agua en la fuente (3040 + 1) menos la cota del nodo. El cabezal pierde 8 m solo con caudal.
    expect(estaticas[masBajo.id]).toBeCloseTo(3041 - masBajo.z, 6)
  })

  it('la cámara rompe-presión corta la columna y la reductora la recorta a su consigna', () => {
    const { red } = diseno()
    const estaticas = presionesEstaticas(red)
    // Cada lateral arranca tras una válvula reductora de 11 m: aguas abajo nada pasa de ahí.
    const deLosLaterales = Object.entries(estaticas).filter(([id]) => id.startsWith('L'))
    expect(deLosLaterales.length).toBeGreaterThan(0)
    expect(deLosLaterales.every(([, p]) => p <= gotero.presionNominalM * 1.1 + 1e-9)).toBe(true)
  })
})

describe('presionesMaximas', () => {
  it('la presión máxima aparece con las válvulas cerradas, que es cuando no hay pérdida que la baje', () => {
    const { red, sectores } = diseno()
    const presiones = presionesMaximas(red, sectores)
    expect(presiones.length).toBe(red.tramos.length)
    // En una red por gravedad el estado estático es el peor para casi todo tramo del portalateral.
    const delPortalateral = presiones.filter((p) => p.tramo.startsWith('m') || p.tramo === 'conduccion')
    expect(delPortalateral.filter((p) => p.estado === 'cerrada').length).toBe(delPortalateral.length)
  })

  it('y es mayor que la que el tramo ve mientras el agua corre', () => {
    const { red, sectores } = diseno()
    const cerrada = presionesMaximas(red, sectores).find((p) => p.tramo === 'conduccion')!
    const regando = calcularRed(red, { sectoresAbiertos: [sectores[0]!] }).tramos['conduccion']!
    expect(cerrada.presionMaximaM).toBeGreaterThan(Math.max(regando.presionEntradaM, regando.presionSalidaM))
  })

  it('el diseño generado declara clases que aguantan todos los estados', () => {
    const { red, sectores } = diseno()
    expect(presionesMaximas(red, sectores).every((p) => p.cumpleClase)).toBe(true)
  })
})

describe('alertasDelDiseno', () => {
  const analizar = (red: ReturnType<typeof diseno>['red'], sectores: readonly string[]) =>
    alertasDelDiseno({
      red,
      turnos: regarPorSectores(red, sectores),
      presiones: presionesMaximas(red, sectores),
      presionNominalEmisorM: gotero.presionNominalM,
    })

  it('el diseño que genera la aplicación no trae alertas que impidan ponerlo a funcionar', () => {
    const { red, sectores } = diseno()
    expect(analizar(red, sectores).filter((a) => a.gravedad === 'impide')).toEqual([])
  })

  it('cada alerta dice dónde, por qué y qué hacer', () => {
    const { red, sectores } = diseno()
    const flaco = cambiarTramo(red, 'conduccion', { diametroInternoMm: 13.6 })
    const alertas = analizar(flaco, sectores)
    expect(alertas.length).toBeGreaterThan(0)
    for (const a of alertas) {
      expect(a.causa.length).toBeGreaterThan(20)
      expect(a.correccion.length).toBeGreaterThan(20)
      expect(a.tramo ?? a.nodo ?? a.sector).toBeTruthy()
    }
  })

  it('las ordena de la que impide a la que solo avisa', () => {
    const { red, sectores } = diseno()
    const alertas = analizar(cambiarTramo(red, 'conduccion', { diametroInternoMm: 13.6 }), sectores)
    const orden = { impide: 0, corrige: 1, avisa: 2 }
    const valores = alertas.map((a) => orden[a.gravedad])
    expect(valores).toEqual([...valores].sort((a, b) => a - b))
  })

  it('un tramo demasiado delgado avisa de la velocidad y propone el diámetro que la arregla', () => {
    const { red, sectores } = diseno()
    const flaco = cambiarTramo(red, 'conduccion', { diametroInternoMm: 20 })
    const alerta = analizar(flaco, sectores).find((a) => a.codigo === 'velocidad-alta' && a.tramo === 'conduccion')
    expect(alerta).toBeDefined()
    expect(alerta!.cambio).toEqual({ tramo: 'conduccion', diametroInternoMm: 25.4 })
    expect(alerta!.causa).toMatch(/m\/s/)
  })

  it('aplicar la corrección que propone la alerta hace desaparecer la alerta', () => {
    const { red, sectores } = diseno()
    let actual = cambiarTramo(red, 'conduccion', { diametroInternoMm: 16 })
    // Se aplica la corrección propuesta hasta que no quede ninguna alerta de velocidad del tramo.
    for (let intento = 0; intento < 8; intento++) {
      const alerta = analizar(actual, sectores).find((a) => a.codigo === 'velocidad-alta' && a.cambio)
      if (!alerta) break
      actual = cambiarTramo(actual, alerta.cambio!.tramo, { diametroInternoMm: alerta.cambio!.diametroInternoMm })
    }
    expect(analizar(actual, sectores).filter((a) => a.codigo === 'velocidad-alta')).toEqual([])
  })

  it('una clase que no aguanta la presión estática se detecta y propone la clase que sí', () => {
    const { red, sectores } = diseno()
    // El tramo más bajo del portalateral es el que más columna de agua aguanta: 51 m, más de los 50 de la C-5.
    const masCargado = presionesMaximas(red, sectores).reduce((a, b) => (b.presionMaximaM > a.presionMaximaM ? b : a))
    expect(masCargado.presionMaximaM).toBeGreaterThan(50)
    const debil = cambiarTramo(red, masCargado.tramo, { clase: 'C-5' })
    const alerta = analizar(debil, sectores).find((a) => a.codigo === 'clase-excedida')
    expect(alerta).toBeDefined()
    expect(alerta!.tramo).toBe(masCargado.tramo)
    expect(alerta!.cambio!.clase).toBe('C-7.5')
    expect(alerta!.causa).toMatch(/válvulas cerradas/)
    // Y aplicarla la resuelve.
    const corregida = cambiarTramo(debil, masCargado.tramo, { clase: alerta!.cambio!.clase })
    expect(analizar(corregida, sectores).filter((a) => a.codigo === 'clase-excedida')).toEqual([])
  })
})
