import type { Alerta } from '@riego/calculo'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PanelDeAlertas } from '../src/componentes/PanelDeAlertas.tsx'

const alerta = (cambios: Partial<Alerta> = {}): Alerta => ({
  codigo: 'velocidad-alta',
  gravedad: 'corrige',
  tramo: 'm12',
  sector: 'S1',
  causa: 'm12: 4.2 m/s al regar S1 (máx. 3 m/s).',
  correccion: 'Usa tubo de 63.5 mm.',
  cambio: { tramo: 'm12', diametroInternoMm: 63.5 },
  ...cambios,
})

// El proyecto no usa los globales de vitest, asi que la limpieza de testing-library no se registra
// sola: sin esto los renders se acumulan y una prueba ve el DOM de la anterior.
afterEach(cleanup)

describe('PanelDeAlertas', () => {
  it('dice en una línea que no hay alertas cuando el diseño cumple', () => {
    render(<PanelDeAlertas alertas={[]} />)
    expect(screen.getByText(/Sin alertas/)).toBeDefined()
  })

  it('muestra un título llano, el dato, qué hacer y, a un clic, por qué importa', () => {
    render(<PanelDeAlertas alertas={[alerta()]} />)
    expect(screen.getByRole('heading', { level: 4 }).textContent).toBe('El agua va muy rápido')
    expect(screen.getByText(/4.2 m\/s/)).toBeDefined()
    expect(screen.getByText('Usa tubo de 63.5 mm.')).toBeDefined()
    expect(screen.getByText('¿Por qué importa?')).toBeDefined()
    expect(screen.getByText(/el tubo vibra/)).toBeDefined()
  })

  it('junta las del mismo tipo en una tarjeta y pone primero la que impide avanzar', () => {
    render(
      <PanelDeAlertas
        alertas={[
          alerta(),
          alerta({ tramo: 'm13', causa: 'm13: 3.4 m/s al regar S1 (máx. 3 m/s).', cambio: { tramo: 'm13', diametroInternoMm: 50.8 } }),
          alerta({ gravedad: 'avisa', codigo: 'velocidad-baja', tramo: 'l9-3', causa: 'l9-3: 0.2 m/s', cambio: undefined }),
          alerta({ gravedad: 'impide', codigo: 'presion-insuficiente', tramo: undefined, nodo: 'L4-5', causa: 'S2: 3 emisores…', cambio: undefined }),
        ]}
      />,
    )
    const titulos = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)
    expect(titulos).toEqual(['Les falta presión a los emisores', 'El agua va muy rápido2', 'El agua va muy lento'])
    expect(screen.getByText('1 impide avanzar · 2 por corregir · 1 para saber')).toBeDefined()
  })

  it('con varios casos, un botón los corrige todos de una vez', async () => {
    const todas = vi.fn()
    render(
      <PanelDeAlertas
        alertas={[alerta(), alerta({ tramo: 'm13', cambio: { tramo: 'm13', diametroInternoMm: 50.8 } })]}
        alAplicar={vi.fn()}
        alAplicarTodas={todas}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Corregir los 2' }))
    expect(todas).toHaveBeenCalledWith([
      { tramo: 'm12', diametroInternoMm: 63.5 },
      { tramo: 'm13', diametroInternoMm: 50.8 },
    ])
  })

  it('con un solo caso, el botón dice el cambio y lo aplica', async () => {
    const aplicar = vi.fn()
    render(<PanelDeAlertas alertas={[alerta()]} alAplicar={aplicar} />)
    await userEvent.click(screen.getByRole('button', { name: /Pasar m12 a 63.5 mm/ }))
    expect(aplicar).toHaveBeenCalledWith({ tramo: 'm12', diametroInternoMm: 63.5 })
  })

  it('una cámara corta toda la columna: se ofrece una sola aunque varios tubos de la bajada alerten', () => {
    const camara = (nodo: string) => alerta({ codigo: 'desnivel-sin-crp', tramo: undefined, nodo, causa: `${nodo}: 51 m`, cambio: undefined, camaraEn: 'J7' })
    render(<PanelDeAlertas alertas={[camara('L8-1'), camara('L9-1'), camara('L10-1')]} alPonerCamara={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /Poner una cámara en J7/ })).toHaveLength(1)
  })

  it('sin forma de aplicar, las alertas solo se leen', () => {
    render(<PanelDeAlertas alertas={[alerta()]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('una alerta sin cambio concreto no ofrece botón', () => {
    render(<PanelDeAlertas alertas={[alerta({ cambio: undefined })]} alAplicar={vi.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
