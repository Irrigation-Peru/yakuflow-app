/**
 * Cuando un paso no se puede abrir: dice qué pasó y deja dos salidas, volver a intentar o ir a la lista de proyectos.
 * Nunca deja la pantalla sin salida (Nielsen 9).
 */
export function EstadoDeError({ error, alReintentar, alVolver }: { error: Error; alReintentar: () => void; alVolver?: () => void }) {
  return (
    <div className="estado-de-error" role="alert">
      <p>
        <strong>No se pudo abrir este paso.</strong> {error.message}
      </p>
      <p className="nota">Revisa tu conexión y vuelve a intentar. Lo que ya guardaste no se pierde.</p>
      <div className="acciones izquierda">
        <button className="primario" onClick={alReintentar}>
          Volver a intentar
        </button>
        {alVolver && <button onClick={alVolver}>Ir a Mis proyectos</button>}
      </div>
    </div>
  )
}
