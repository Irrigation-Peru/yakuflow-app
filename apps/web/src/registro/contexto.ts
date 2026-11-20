import { createContext, useContext } from 'react'
import type { Accion, Cola } from './cola.ts'

export const ContextoDeRegistro = createContext<Cola | null>(null)

/** Registra una acción del estudiante en el registro de actividad (HU0007). */
export function useRegistrar() {
  const cola = useContext(ContextoDeRegistro)
  return (accion: Accion) => cola?.registrar(accion)
}
