import { QUE_ES_LA_ALERTA, type Alerta, type CambioPropuesto, type CodigoDeAlerta, type Gravedad } from '@riego/calculo'

// Las alertas del diseño (HU0023), pensadas para que se entiendan de un vistazo. Las del mismo tipo van juntas en una
// tarjeta: un título en palabras del campo, qué hacer en una frase, los casos con su dato (cada uno resalta su tramo
// en las vistas) y, a un clic, por qué importa. Cuando la corrección es un cambio concreto, un botón la aplica a uno o
// a todos los casos: ahí se cierra el lazo con HU0019, cambiar y ver.
//
// Es la respuesta a C2, la retroalimentación que llega tarde: el estudiante no espera la corrección del docente para
// saber que el tramo no aguanta. Y no se le entierra en texto: con cien tubos rápidos ve una tarjeta, no cien.

const ETIQUETA: Readonly<Record<Gravedad, string>> = {
  impide: 'Impide avanzar',
  corrige: 'Por corregir',
  avisa: 'Para saber',
}

/** Lo que se hace con todo el grupo, cuando cada caso pide un cambio distinto del mismo tipo. */
const ACCION_DEL_GRUPO: Partial<Record<CodigoDeAlerta, string>> = {
  'velocidad-alta': 'Engrosa los tubos marcados.',
  'velocidad-baja': 'Puedes usar tubos más delgados en los marcados.',
  'clase-excedida': 'Sube la clase de los tubos marcados.',
  'desnivel-sin-crp': 'Pon una cámara rompe-presión antes de la bajada.',
}

const CASOS_A_LA_VISTA = 3

function agrupar(alertas: readonly Alerta[]) {
  const grupos = new Map<string, { gravedad: Gravedad; codigo: CodigoDeAlerta; alertas: Alerta[] }>()
  for (const a of alertas) {
    const clave = `${a.gravedad}:${a.codigo}`
    const grupo = grupos.get(clave) ?? { gravedad: a.gravedad, codigo: a.codigo, alertas: [] }
    grupo.alertas.push(a)
    grupos.set(clave, grupo)
  }
  const orden: Gravedad[] = ['impide', 'corrige', 'avisa']
  return [...grupos.values()].sort((a, b) => orden.indexOf(a.gravedad) - orden.indexOf(b.gravedad))
}

const textoDelCambio = (cambio: CambioPropuesto) =>
  cambio.clase ? `Subir ${cambio.tramo} a ${cambio.clase}` : `Pasar ${cambio.tramo} a ${cambio.diametroInternoMm} mm`

export function PanelDeAlertas({
  alertas,
  alAplicar,
  alAplicarTodas,
  alPonerCamara,
  alSeleccionar,
}: {
  alertas: readonly Alerta[]
  /** Aplica el cambio que una alerta propone; sin esto, las alertas solo se leen. */
  alAplicar?: (cambio: CambioPropuesto) => void
  /** Aplica de una vez los cambios de todas las alertas de un grupo. */
  alAplicarTodas?: (cambios: readonly CambioPropuesto[]) => void
  /** Pone la cámara rompe-presión que la alerta propone. */
  alPonerCamara?: (nodo: string) => void
  /** Resalta en las vistas el tramo de la alerta (criterio 1). */
  alSeleccionar?: (tramo: string) => void
}) {
  if (alertas.length === 0) {
    return (
      <section className="alertas" aria-live="polite">
        <h3>Alertas</h3>
        <p className="todo-bien">Sin alertas: la red cumple en todos los turnos y con las válvulas cerradas.</p>
      </section>
    )
  }

  const grupos = agrupar(alertas)
  const cuenta = (g: Gravedad) => alertas.filter((a) => a.gravedad === g).length
  const resumen = (['impide', 'corrige', 'avisa'] as const)
    .filter((g) => cuenta(g) > 0)
    .map((g) => `${cuenta(g)} ${ETIQUETA[g].toLowerCase()}`)
    .join(' · ')

  return (
    <section className="alertas" aria-live="polite">
      <h3>
        Alertas <span className="cuenta">{alertas.length}</span>
      </h3>
      <p className="resumen-de-alertas">{resumen}</p>
      {grupos.map(({ gravedad, codigo, alertas: delGrupo }) => {
        const { titulo, porQue } = QUE_ES_LA_ALERTA[codigo]
        const cambios = delGrupo.flatMap((a) => (a.cambio ? [a.cambio] : []))
        const correcciones = new Set(delGrupo.map((a) => a.correccion))
        const accion = correcciones.size === 1 ? delGrupo[0]!.correccion : (ACCION_DEL_GRUPO[codigo] ?? delGrupo[0]!.correccion)
        // Una cámara corta toda la columna: se ofrece la primera, no una por cada tubo de la misma bajada.
        const camara = delGrupo.find((a) => a.camaraEn)?.camaraEn
        const caso = (alerta: Alerta, i: number) => (
          <li key={`${alerta.tramo ?? alerta.nodo ?? alerta.sector ?? ''}-${i}`}>
            {alerta.tramo && alSeleccionar ? (
              <button type="button" className="enlace" onClick={() => alSeleccionar(alerta.tramo!)}>
                {alerta.causa}
              </button>
            ) : (
              <span>{alerta.causa}</span>
            )}
            {alerta.cambio && alAplicar && delGrupo.length > 1 && (
              <button type="button" className="chico" onClick={() => alAplicar(alerta.cambio!)}>
                Aplicar
              </button>
            )}
          </li>
        )
        return (
          <article key={`${gravedad}-${codigo}`} className={`tarjeta-de-alerta ${gravedad}`}>
            <header>
              <span className="etiqueta">{ETIQUETA[gravedad]}</span>
              <h4>
                {titulo}
                {delGrupo.length > 1 && <span className="cuenta">{delGrupo.length}</span>}
              </h4>
            </header>
            <p className="accion">{accion}</p>
            <ul className="casos">{delGrupo.slice(0, CASOS_A_LA_VISTA).map(caso)}</ul>
            {delGrupo.length > CASOS_A_LA_VISTA && (
              <details>
                <summary>Ver los otros {delGrupo.length - CASOS_A_LA_VISTA}</summary>
                <ul className="casos">{delGrupo.slice(CASOS_A_LA_VISTA).map((a, i) => caso(a, i + CASOS_A_LA_VISTA))}</ul>
              </details>
            )}
            <div className="botones-de-alerta">
              {cambios.length === 1 && alAplicar && (
                <button type="button" onClick={() => alAplicar(cambios[0]!)}>
                  {textoDelCambio(cambios[0]!)}
                </button>
              )}
              {cambios.length > 1 && (alAplicarTodas || alAplicar) && (
                <button type="button" onClick={() => (alAplicarTodas ? alAplicarTodas(cambios) : cambios.forEach((c) => alAplicar!(c)))}>
                  Corregir {cambios.length === delGrupo.length ? `los ${cambios.length}` : `${cambios.length} de ${delGrupo.length}`}
                </button>
              )}
              {camara && alPonerCamara && (
                <button type="button" onClick={() => alPonerCamara(camara)}>
                  Poner una cámara en {camara}
                </button>
              )}
            </div>
            <details className="por-que">
              <summary>¿Por qué importa?</summary>
              <p>{porQue}</p>
            </details>
          </article>
        )
      })}
    </section>
  )
}
