import { ActionCreators } from 'redux-undo'
import { describe, expect, it } from 'vitest'
import { crearAlmacen } from '../src/estado/almacen.ts'
import { cargarLugar, contornoCerrado, fuenteUbicada, modoElegido, verticeAgregado } from '../src/estado/lugar.ts'

// El estado del paso 1: el contorno que el estudiante va dibujando y la fuente que ubica. Las acciones se
// nombran como eventos, y deshacer vuelve al estado anterior sin borrar el registro.

const a = { lat: -10.68, lon: -76.25 }
const b = { lat: -10.68, lon: -76.248 }
const c = { lat: -10.682, lon: -76.248 }

describe('dibujo de la parcela', () => {
  it('agrega vértices mientras se dibuja y cierra el contorno con tres o más', () => {
    const almacen = crearAlmacen()
    almacen.dispatch(modoElegido('parcela'))
    for (const v of [a, b, c]) almacen.dispatch(verticeAgregado(v))
    almacen.dispatch(contornoCerrado())
    const { lugar } = almacen.getState()
    expect(lugar.present.vertices).toEqual([a, b, c])
    expect(lugar.present.cerrado).toBe(true)
    expect(lugar.present.modo).toBeNull()
  })

  it('no cierra un contorno de menos de tres vértices', () => {
    const almacen = crearAlmacen()
    almacen.dispatch(modoElegido('parcela'))
    almacen.dispatch(verticeAgregado(a))
    almacen.dispatch(verticeAgregado(b))
    almacen.dispatch(contornoCerrado())
    expect(almacen.getState().lugar.present.cerrado).toBe(false)
  })

  it('no agrega vértices fuera del modo de dibujo', () => {
    const almacen = crearAlmacen()
    almacen.dispatch(verticeAgregado(a))
    expect(almacen.getState().lugar.present.vertices).toEqual([])
  })

  it('empezar a dibujar de nuevo descarta el contorno anterior', () => {
    const almacen = crearAlmacen()
    almacen.dispatch(cargarLugar({ contorno: [a, b, c], fuente: null }))
    almacen.dispatch(modoElegido('parcela'))
    expect(almacen.getState().lugar.present).toMatchObject({ vertices: [], cerrado: false })
  })

  it('deshacer quita el último vértice', () => {
    const almacen = crearAlmacen()
    almacen.dispatch(modoElegido('parcela'))
    almacen.dispatch(verticeAgregado(a))
    almacen.dispatch(verticeAgregado(b))
    almacen.dispatch(ActionCreators.undo())
    expect(almacen.getState().lugar.present.vertices).toEqual([a])
  })

  it('cargar el lugar guardado no se puede deshacer, y deshacer después vuelve a lo cargado', () => {
    const almacen = crearAlmacen()
    almacen.dispatch(modoElegido('parcela'))
    almacen.dispatch(verticeAgregado(a))
    almacen.dispatch(cargarLugar({ contorno: [a, b, c], fuente: null }))
    expect(almacen.getState().lugar.past).toEqual([])
    almacen.dispatch(modoElegido('parcela'))
    almacen.dispatch(ActionCreators.undo())
    expect(almacen.getState().lugar.present).toMatchObject({ vertices: [a, b, c], cerrado: true })
  })
})

describe('ubicación de la fuente', () => {
  it('ubica la fuente solo en el modo de ubicarla', () => {
    const almacen = crearAlmacen()
    almacen.dispatch(fuenteUbicada(a))
    expect(almacen.getState().lugar.present.fuente).toBeNull()
    almacen.dispatch(modoElegido('fuente'))
    almacen.dispatch(fuenteUbicada(a))
    expect(almacen.getState().lugar.present).toMatchObject({ fuente: a, modo: null })
  })
})
