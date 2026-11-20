import { describe, expect, it } from 'vitest'
import { caudalDeEmisor } from '../src/hidraulica/emisor'
import { calcularRed } from '../src/hidraulica/red'
import { aspersionSinPresionConCrp as red } from './datos/aspersion-sin-presion-con-crp'

// Red de aspersión con tubos demasiado chicos y dos cámaras rompe-presión: el agua no llega a la mitad de los
// aspersores. Es el diseño equivocado que el estudiante tiene que poder ver funcionando en el paso 6.

describe('red con válvulas donde el agua no llega a todos los emisores', () => {
  const r = calcularRed(red)

  it('converge', () => {
    expect(r.convergio).toBe(true)
  })

  it('cada emisor entrega lo que le corresponde por su presión, y nada si no tiene presión', () => {
    for (const e of red.emisores) {
      const nodo = r.nodos[e.nodo]!
      const esperado = caudalDeEmisor(e.k, e.x, nodo.presionM)
      expect(Math.abs(nodo.caudalEmisorLph! - esperado)).toBeLessThanOrEqual(1e-9 * Math.max(1, esperado))
    }
  })

  it('cada CRP corta la presión si le llega con presión, y si no la deja pasar', () => {
    for (const [id, elemento] of Object.entries(red.elementos ?? {})) {
      if (elemento.tipo !== 'crp') continue
      const nodo = r.nodos[id]!
      expect(nodo.presionM).toBe(Math.min(nodo.presionLlegadaM, 0))
    }
  })
})
