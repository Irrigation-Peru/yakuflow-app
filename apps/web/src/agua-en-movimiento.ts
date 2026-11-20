import { useState } from 'react'

// Si el agua se ve correr por la red. Empieza corriendo, salvo que el equipo pida reducir el movimiento (WCAG 2.3.3):
// entonces empieza quieta y el estudiante la puede poner a correr. Siempre se puede pausar (WCAG 2.2.2).

const prefiereQuieto = () => typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

export function useAguaEnMovimiento() {
  return useState(() => !prefiereQuieto())
}
