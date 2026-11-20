import type { ReactNode } from 'react'

/**
 * Una tabla que puede ser más ancha (o más alta) que su lugar: se desplaza dentro de su caja y no estira la página en el
 * celular. Recibe el foco para que también se pueda desplazar con el teclado (WCAG 2.1.1), y su nombre dice qué contiene.
 */
export function Desplazable({ nombre, alto = false, children }: { nombre: string; alto?: boolean; children: ReactNode }) {
  return (
    <div className={alto ? 'desplazable tabla-con-altura' : 'desplazable'} tabIndex={0} role="region" aria-label={nombre}>
      {children}
    </div>
  )
}
