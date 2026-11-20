// Lo que el paso 1 necesita saber del relieve en 3D sin descargar Three.js: las vistas y si el equipo lo soporta. La
// escena misma (componentes/Relieve3D.tsx) se descarga recién cuando el estudiante la abre.

/** El relieve se dibuja 1.4 veces más alto de lo que es, para que se lea la pendiente sin deformar el lugar. */
export const EXAGERACION_VERTICAL = 1.4

export type Vista = 'isometrica' | 'perfil' | 'fuente' | 'cenital'

export const VISTAS: readonly { vista: Vista; nombre: string }[] = [
  { vista: 'isometrica', nombre: 'Isométrica' },
  { vista: 'perfil', nombre: 'De perfil' },
  { vista: 'fuente', nombre: 'Desde la fuente' },
  { vista: 'cenital', nombre: 'Cenital' },
]

/** ¿El equipo puede dibujar en 3D? Se pregunta antes de descargar la escena. */
export function hayWebGL() {
  try {
    const lienzo = document.createElement('canvas')
    return Boolean(lienzo.getContext('webgl2') ?? lienzo.getContext('webgl'))
  } catch {
    return false
  }
}
