import { useCallback, useEffect, useState } from 'react'

// El tema claro u oscuro. public/tema.js lo pone antes de pintar; aquí se cambia con el botón del encabezado y se
// recuerda en este equipo. Mientras el estudiante no elija, se sigue el tema de su sistema, también si lo cambia con
// la app abierta.

export type Tema = 'claro' | 'oscuro'

const CLAVE = 'riego.tema'
const CONSULTA = '(prefers-color-scheme: dark)'

function elegido(): Tema | null {
  try {
    const valor = localStorage.getItem(CLAVE)
    return valor === 'claro' || valor === 'oscuro' ? valor : null
  } catch {
    return null
  }
}

const delSistema = (): Tema => (typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA).matches ? 'oscuro' : 'claro')

export function useTema() {
  const [tema, setTema] = useState<Tema>(() => elegido() ?? delSistema())

  useEffect(() => {
    document.documentElement.dataset.tema = tema
  }, [tema])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const consulta = window.matchMedia(CONSULTA)
    const alCambiar = () => {
      if (!elegido()) setTema(consulta.matches ? 'oscuro' : 'claro')
    }
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [])

  const alternar = useCallback(() => {
    setTema((antes) => {
      const nuevo: Tema = antes === 'oscuro' ? 'claro' : 'oscuro'
      try {
        localStorage.setItem(CLAVE, nuevo)
      } catch {
        // Sin almacenamiento local el cambio dura hasta cerrar la pestaña.
      }
      return nuevo
    })
  }, [])

  return { tema, alternar }
}
