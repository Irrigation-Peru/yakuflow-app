import { useConsentimiento } from '../api/consultas.ts'

export function TextoDelConsentimiento() {
  const consentimiento = useConsentimiento()
  if (consentimiento.isPending) return <div className="consentimiento">Cargando el texto…</div>
  if (consentimiento.error) return <div className="consentimiento error">{consentimiento.error.message}</div>
  return (
    <div className="consentimiento" tabIndex={0} aria-label="Texto del consentimiento informado">
      {consentimiento.data.texto.split('\n\n').map((parrafo) => (
        <p key={parrafo}>{parrafo}</p>
      ))}
    </div>
  )
}
