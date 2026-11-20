import { ZONAS_PARA_LA_FUENTE } from '@riego/calculo'
import type { FuenteDeElevacion, RelieveDelProyecto } from '../api/tipos.ts'
import { conDecimales } from '../formato.ts'
import { ZONA } from '../zonas.ts'

// La leyenda de las zonas para ubicar la fuente, debajo del mapa.

export function LeyendaDeZonas({
  relieve,
  elevacionDelLugar,
  cargando,
  error,
}: {
  relieve?: RelieveDelProyecto
  /** La fuente de elevación de la parcela: si el relieve alrededor viene de otra, se dice. */
  elevacionDelLugar: FuenteDeElevacion | null
  cargando: boolean
  error: Error | null
}) {
  if (cargando) return <p className="aviso">Leyendo el relieve alrededor de la parcela… la primera vez puede tardar unos segundos.</p>
  if (error) return <p className="error" role="alert">No se pudo leer el relieve alrededor: {error.message}</p>
  if (!relieve) return null
  const { masAlto, masBajo } = relieve.parcela
  return (
    <section className="leyenda" aria-label="Zonas para ubicar la fuente">
      <p className="leyenda-titulo">
        Dónde puede estar la fuente, según su altura. La parcela va de {conDecimales(masBajo.cota, 0)} a{' '}
        {conDecimales(masAlto.cota, 0)} m.
      </p>
      <ul>
        {ZONAS_PARA_LA_FUENTE.map((z) => (
          <li key={z}>
            <span className="muestra" style={{ background: ZONA[z].color }} />
            <span>
              <strong>{ZONA[z].nombre}.</strong> {ZONA[z].detalle}
            </span>
          </li>
        ))}
      </ul>
      <p className="nota">
        La fuente está donde está el agua: el mapa te ayuda a encontrarla y a ver si sirve.
        {relieve.elevacion.nombre !== elevacionDelLugar?.nombre && ` El relieve alrededor viene de ${relieve.elevacion.nombre}.`}
      </p>
    </section>
  )
}
