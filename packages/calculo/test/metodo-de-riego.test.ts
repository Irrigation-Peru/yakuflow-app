import { describe, expect, it } from 'vitest'
import { CATALOGO_FAO56 } from '../src/agronomia/catalogo-fao56'
import { CATALOGO_EMISORES, emisorDelCatalogo } from '../src/agronomia/emisores'
import { metodoDeRiego } from '../src/agronomia/metodo-de-riego'
import { DESNIVEL_MINIMO_ASPERSION_M, DESNIVEL_MINIMO_GOTEO_M } from '../src/constantes'

// HU0015: el método de riego se recomienda con el cultivo, el suelo y el desnivel; si el otro método no es viable,
// se dice por qué.

const cultivo = (nombre: string) => CATALOGO_FAO56.find((c) => c.nombre === nombre)!

describe('catálogo provisional de emisores', () => {
  it('cada emisor tiene su ley q = k · P^x coherente con su caudal y presión nominales', () => {
    for (const e of CATALOGO_EMISORES) {
      expect(e.coeficienteK * e.presionNominalM ** e.exponenteX, e.codigo).toBeCloseTo(e.caudalNominalLph, 9)
      expect(e.separacionM).toBeGreaterThan(0)
      expect(e.separacionLateralesM).toBeGreaterThan(0)
    }
    expect(new Set(CATALOGO_EMISORES.map((e) => e.codigo)).size).toBe(CATALOGO_EMISORES.length)
    expect(CATALOGO_EMISORES.some((e) => e.metodo === 'goteo')).toBe(true)
    expect(CATALOGO_EMISORES.some((e) => e.metodo === 'aspersion')).toBe(true)
  })

  it('busca por código y rechaza uno que no existe', () => {
    const primero = CATALOGO_EMISORES[0]!
    expect(emisorDelCatalogo(primero.codigo)).toBe(primero)
    expect(() => emisorDelCatalogo('no-existe')).toThrow(/catálogo/)
  })
})

describe('método de riego recomendado', () => {
  it('con presión para los dos, recomienda goteo: aplica con más eficiencia', () => {
    const r = metodoDeRiego({ cultivo: cultivo('Papa'), cargaDisponibleM: 40, infiltracionBasicaMmH: 15 })
    expect(r.recomendado).toBe('goteo')
    expect(r.metodos.goteo).toEqual({ viable: true })
    expect(r.metodos.aspersion).toEqual({ viable: true })
  })

  it('entre el mínimo del goteo y el de la aspersión, solo el goteo', () => {
    expect(DESNIVEL_MINIMO_GOTEO_M).toBe(15)
    expect(DESNIVEL_MINIMO_ASPERSION_M).toBe(30)
    const r = metodoDeRiego({ cultivo: cultivo('Papa'), cargaDisponibleM: 20, infiltracionBasicaMmH: 15 })
    expect(r.recomendado).toBe('goteo')
    expect(r.metodos.aspersion).toEqual({ viable: false, motivos: ['presion'], cargaNecesariaM: 30 })
  })

  it('los cereales se riegan por aspersión: el goteo no es viable por el cultivo', () => {
    const r = metodoDeRiego({ cultivo: cultivo('Cebada'), cargaDisponibleM: 40, infiltracionBasicaMmH: 15 })
    expect(r.recomendado).toBe('aspersion')
    expect(r.metodos.goteo).toEqual({ viable: false, motivos: ['cultivo'] })
  })

  it('la aspersión no es viable si ningún aspersor del catálogo aplica por debajo de la infiltración', () => {
    const menorIntensidad = Math.min(
      ...CATALOGO_EMISORES.filter((e) => e.metodo === 'aspersion').map((e) => e.caudalNominalLph / (e.separacionM * e.separacionLateralesM)),
    )
    const r = metodoDeRiego({ cultivo: cultivo('Cebada'), cargaDisponibleM: 40, infiltracionBasicaMmH: menorIntensidad - 0.1 })
    expect(r.metodos.aspersion).toMatchObject({ viable: false, motivos: ['infiltracion'] })
    expect(r.recomendado).toBeNull()
  })

  it('sin presión para ninguno, no recomienda nada y da los dos motivos', () => {
    const r = metodoDeRiego({ cultivo: cultivo('Papa'), cargaDisponibleM: 10, infiltracionBasicaMmH: 15 })
    expect(r.recomendado).toBeNull()
    expect(r.metodos.goteo).toEqual({ viable: false, motivos: ['presion'], cargaNecesariaM: 15 })
  })

  it('el emisor que propone es el primero del catálogo para el método recomendado', () => {
    const r = metodoDeRiego({ cultivo: cultivo('Papa'), cargaDisponibleM: 40, infiltracionBasicaMmH: 15 })
    expect(r.emisor).toBe(CATALOGO_EMISORES.find((e) => e.metodo === 'goteo'))
  })
})
