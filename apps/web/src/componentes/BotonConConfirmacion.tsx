import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Un botón cuya acción no se deshace fácil: antes de ejecutarla pregunta en un diálogo nativo (<dialog>), que atrapa
 * el foco, se cierra con Escape y deja el foco en «Cancelar», la salida segura (Nielsen 5: prevenir el error).
 * El diálogo va al final del documento: así se ve aunque el botón esté dentro de un menú que se pliega.
 */
export function BotonConConfirmacion({
  children,
  titulo,
  detalle,
  confirmar,
  alConfirmar,
  className,
  disabled,
}: {
  children: ReactNode
  titulo: string
  detalle: ReactNode
  /** El texto del botón que ejecuta: dice exactamente lo que pasa. */
  confirmar: string
  alConfirmar: () => void
  className?: string
  disabled?: boolean
}) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const id = useId()
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => dialogo.current?.showModal()}>
        {children}
      </button>
      {createPortal(
        <dialog ref={dialogo} className="confirmacion" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
          <h2 id={`${id}-t`}>{titulo}</h2>
          <div id={`${id}-d`}>{detalle}</div>
          <div className="acciones">
            <button type="button" autoFocus onClick={() => dialogo.current?.close()}>
              Cancelar
            </button>
            <button
              type="button"
              className="primario"
              onClick={() => {
                dialogo.current?.close()
                alConfirmar()
              }}
            >
              {confirmar}
            </button>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  )
}
