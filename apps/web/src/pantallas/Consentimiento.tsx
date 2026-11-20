import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ErrorDeApi } from '../api/cliente.ts'
import { useConsentimiento } from '../api/consultas.ts'
import { TextoDelConsentimiento } from '../componentes/TextoDelConsentimiento.tsx'

// Para quien ya tiene cuenta y no tiene el consentimiento vigente: lo retiró, o el texto cambió de versión.

export function Consentimiento() {
  const consultas = useQueryClient()
  const consentimiento = useConsentimiento()
  const [acepto, setAcepto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function aceptar() {
    setEnviando(true)
    setError(null)
    try {
      await api('/consentimiento', { metodo: 'POST', cuerpo: { version: consentimiento.data?.version } })
      await consultas.invalidateQueries({ queryKey: ['estado'] })
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo guardar')
      if (e instanceof ErrorDeApi && e.codigo === 'version_desactualizada') await consentimiento.refetch()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="angosto">
      <h2>Consentimiento informado</h2>
      <p>Antes de seguir, lee el texto. Sin tu consentimiento el recorrido queda cerrado.</p>
      <TextoDelConsentimiento />
      <label className="casilla">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} /> He leído y acepto participar
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {consentimiento.error && (
        <p className="error" role="alert">
          No se pudo traer el texto del consentimiento.{' '}
          <button className="enlace" onClick={() => void consentimiento.refetch()}>
            Volver a intentar
          </button>
        </p>
      )}
      <div className="acciones">
        <button className="primario" disabled={!acepto || enviando || !consentimiento.data} onClick={aceptar}>
          Aceptar y continuar
        </button>
      </div>
    </div>
  )
}
