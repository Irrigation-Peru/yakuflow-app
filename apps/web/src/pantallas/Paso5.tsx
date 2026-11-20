import { EsquemaDeLaRed } from '../componentes/EsquemaDeLaRed.tsx'
import { GuiaDelPaso } from '../componentes/GuiaDelPaso.tsx'
import { TituloDeVista } from '../componentes/Figura.tsx'
import { DIAMETROS_INTERNOS_MM, nodoAdmiteCamara, presupuestoDeLaRed, recorridoHasta, tramosAfectados, type CambioDeRed, type RiegoDelSector } from '@riego/calculo'
import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../api/cliente.ts'
import { useAlGuardarElPaso } from '../api/consultas.ts'
import type { RedGuardada } from '../api/tipos.ts'
import { useLaRed } from '../calculo/usar-la-red.ts'
import { Dato } from '../componentes/Dato.tsx'
import { PanelDeAlertas } from '../componentes/PanelDeAlertas.tsx'
import { PerfilDeLaRed } from '../componentes/PerfilDeLaRed.tsx'
import { Prediccion } from '../componentes/Prediccion.tsx'
import { LeyendaDeLaPlanta, RedEnPlanta } from '../componentes/RedEnPlanta.tsx'
import { AvisoDePreciosProvisionales, TablaDePresupuesto } from '../componentes/TablaDePresupuesto.tsx'
import { DESHACER_LA_RED, redCambiada } from '../estado/red.ts'
import { cifra, conDecimales } from '../formato.ts'
import type { PropsDelPaso } from '../pasos.ts'
import { cambioDeLaPresion, PREDICCION_DE_LA_PRESION, textoDeLaRespuesta } from '../predicciones.ts'
import { claseDe, destinoDelPerfil, mismosCambios, nombreDelTramo, OPCIONES_DE_CLASE, sectorDelTramo } from '../red-en-pantalla.ts'
import { useRegistrar } from '../registro/contexto.ts'
import { Campo } from './Entrar.tsx'
import { EstadoDeError } from '../componentes/EstadoDeError.tsx'

// Paso 5, generar el diseño de la red (HU0017 a HU0019). El estudiante no dibuja: la red sale de lo que decidió en los
// pasos 1 a 4. Él la lee en planta y en perfil, y puede cambiar un tramo; antes de ver el efecto, dice qué espera (C1).

interface CambioPendiente {
  cambio: CambioDeRed
  tramo: string
  descripcion: string
}

interface UltimoEfecto {
  tramo: string
  antesM: number
  respuesta: string
  antes: readonly RiegoDelSector[]
}

export function Paso5({ proyectoId, alPerderlo, alIrAlPaso }: PropsDelPaso) {
  const registrar = useRegistrar()
  const alGuardar = useAlGuardarElPaso(proyectoId)
  const { proyecto, datos, relieve, precios, planteamiento, cambios, puedeDeshacer, laRed, desactualizada, despachar } = useLaRed(5, proyectoId, alPerderlo)
  const [elegido, setElegido] = useState<string | undefined>(undefined)
  const [sectorElegido, setSectorElegido] = useState<string | undefined>(undefined)
  const [pendiente, setPendiente] = useState<CambioPendiente | null>(null)
  const [efecto, setEfecto] = useState<UltimoEfecto | null>(null)
  // Los sectores que el estudiante ya miró: la guía le dice cuántos le faltan.
  const [vistos, setVistos] = useState<ReadonlySet<string>>(new Set())

  const guardar = useMutation({
    mutationFn: () => api<RedGuardada>(`/proyectos/${proyectoId}/red`, { metodo: 'PUT', cuerpo: { cambios } }),
    onSuccess: (avance) => {
      alGuardar(avance)
      registrar({ paso: 5, accion: 'redGuardada', detalle: { version: avance.red?.version, cambios: cambios.length, funciona: avance.funciona }, proyectoId })
    },
  })

  const d = laRed.data
  const sector = sectorElegido ?? d?.sectores[0]
  const turno = d?.analisis.turnos.find((t) => t.sector === sector)
  const presiones = useMemo(() => Object.fromEntries(Object.values(turno?.resultado.nodos ?? {}).map((n) => [n.id, n.presionM])), [turno])
  const tramo = d?.red.tramos.find((t) => t.id === elegido)
  const recorrido = useMemo(() => {
    if (!d || !turno) return []
    return recorridoHasta(d.red, destinoDelPerfil(d.red, turno, tramo), presiones)
  }, [d, tramo, turno, presiones])
  const afectados = useMemo(() => new Set(efecto && d && !laRed.isPlaceholderData ? tramosAfectados(efecto.antes, d.analisis.turnos) : []), [efecto, d, laRed.isPlaceholderData])
  const presionDelTramo = (id: string | undefined) => (id && turno ? turno.resultado.tramos[id]?.presionSalidaM : undefined)

  if (proyecto.isPending || datos.isPending || relieve.isPending) return <p className="cargando" role="status">Abriendo el paso…</p>
  if (proyecto.error) return <EstadoDeError error={proyecto.error} alReintentar={() => void proyecto.refetch()} alVolver={alPerderlo} />
  if (datos.error) return <EstadoDeError error={datos.error} alReintentar={() => void datos.refetch()} alVolver={alPerderlo} />
  if (relieve.error) return <EstadoDeError error={relieve.error} alReintentar={() => void relieve.refetch()} alVolver={alPerderlo} />
  const p = proyecto.data!
  if (!planteamiento) {
    return (
      <div className="paso">
        <p className="alerta">Para generar la red hace falta el diseño agronómico. Vuelve al paso 4.</p>
        <div className="acciones izquierda">
          <button onClick={() => alIrAlPaso(4)}>Volver al paso 4</button>
        </div>
      </div>
    )
  }
  if (laRed.error) {
    return (
      <div className="paso">
        <p className="alerta">{laRed.error.message}</p>
        <div className="acciones izquierda">
          <button onClick={() => alIrAlPaso(4)}>Volver al paso 4</button>
        </div>
      </div>
    )
  }
  if (!d || !turno) return <p className="cargando" role="status">Generando la red…</p>

  function seleccionar(id: string) {
    setElegido(id)
    setPendiente(null)
    const delTramo = sectorDelTramo(id, d!.laterales)
    if (delTramo) setSectorElegido(delTramo)
    registrar({ paso: 5, accion: 'tramoSeleccionado', detalle: { tramo: id }, proyectoId })
  }

  function aplicarCambio({ cambio, tramo: id }: CambioPendiente, respuesta: string) {
    setEfecto({ tramo: id, antesM: presionDelTramo(id) ?? 0, respuesta, antes: d!.analisis.turnos })
    despachar(redCambiada(cambio))
    registrar({ paso: 5, accion: 'redCambiada', detalle: { ...cambio, respuesta }, proyectoId })
    setPendiente(null)
  }

  const peorUniformidad = Math.min(...d.analisis.turnos.map((t) => t.uniformidad))
  const bloquean = d.analisis.alertas.filter((a) => a.gravedad !== 'avisa').length
  const presionAhora = presionDelTramo(efecto?.tramo)
  // Si el módulo genera hoy otra red con los mismos datos y cambios (porque mejoraron sus reglas), la guardada quedó
  // vieja aunque el estudiante no haya tocado nada: se nota en el costo, y se ofrece guardarla de nuevo.
  const redDeOtraVersion =
    !laRed.isPlaceholderData && p.red?.costoTotal != null && d.presupuesto !== null && Math.abs(p.red.costoTotal - d.presupuesto.total) > 1
  const sinGuardar = !p.red || desactualizada || !mismosCambios(p.red.cambios, cambios) || redDeOtraVersion
  const cerrado = !sinGuardar && p.pasoAlcanzado >= 6
  const vistosYActual = new Set([...vistos, ...(sector ? [sector] : [])])
  // Cuánto del costo se va en la conducción, de la fuente al cabezal. El diámetro ya es el menor que deja llegar el agua
  // con presión: si pesa mucho, lo que lo baja es una toma más cerca, no un tubo más delgado.
  const conduccion = (() => {
    if (!d.presupuesto || !precios.data) return null
    const tramos = d.red.tramos.filter((t) => t.id.startsWith('conduccion'))
    if (tramos.length === 0) return null
    const soloLaConduccion = presupuestoDeLaRed({ red: { ...d.red, tramos, emisores: [], elementos: {} }, emisor: { codigo: '', coeficienteK: 0 }, precios: precios.data })
    const porId = new Map(d.red.nodos.map((n) => [n.id, n]))
    const largoM = tramos.reduce((suma, t) => {
      const a = porId.get(t.desde)
      const b = porId.get(t.hasta)
      return a && b ? suma + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : suma
    }, 0)
    return { costo: soloLaConduccion.total, parte: soloLaConduccion.total / d.presupuesto.total, largoM, diametros: [...new Set(tramos.map((t) => t.diametroInternoMm))] }
  })()

  return (
    <div className="paso">
      <div className="titulo-del-paso">
        <h2>
          <span className="rotulo">Paso 5</span> Generar el diseño de la red
        </h2>
        <span className="rotulo">
          {p.nombre} · {planteamiento.cultivo.toLowerCase()}
        </span>
      </div>
      {desactualizada && <p className="aviso">Cambió algo de un paso anterior, así que la red se generó de nuevo. Tu versión anterior sigue guardada.</p>}
      {!desactualizada && redDeOtraVersion && (
        <p className="aviso">
          La aplicación mejoró cómo diseña la red, y con tus mismos datos hoy sale otra ({d.presupuesto!.moneda} {cifra(d.presupuesto!.total, 0)} en vez de{' '}
          {cifra(p.red!.costoTotal!, 0)}). Guárdala para que sea la de tu proyecto; después vuelve a ponerla a funcionar en el paso 6.
        </p>
      )}

      <div className="paso-con-panel">
        <section className="lienzo vistas-de-la-red">
          <TituloDeVista
            titulo="La red en planta"
            queMuestra="Vista desde arriba de la red que generó la app con tus datos, regando el sector elegido. Cada tramo se pinta según la presión con la que llega el agua a su extremo. Toca un tramo para leerlo o cambiarlo."
          />
          <div className="vistas-con-controles">
          <div className="controles-de-la-vista">
          <div className="modos-de-la-red" role="group" aria-label="Turno que se está viendo">
            {d.sectores.map((s) => (
              <button
                key={s}
                aria-pressed={s === sector}
                className={vistosYActual.has(s) ? 'probado' : undefined}
                onClick={() => {
                  setSectorElegido(s)
                  setVistos((antes) => new Set([...antes, s]))
                }}
              >
                Sector {s.slice(1)}
                {vistosYActual.has(s) && s !== sector && ' ✓'}
              </button>
            ))}
          </div>
          <p className="que-es-un-sector">Un sector es la parte de la parcela que se riega a la vez: un turno. Tu parcela se riega en {d.sectores.length} turnos, uno tras otro. Elige uno para ver cómo le llega el agua.</p>
          </div>
          <div className="vistas">
          <RedEnPlanta
            red={d.red}
            resultado={turno.resultado}
            contorno={d.contornoLocal}
            presionNominalEmisorM={d.presionNominalEmisorM}
            tramoSeleccionado={elegido}
            alSeleccionarTramo={seleccionar}
            afectados={afectados}
            conLeyenda={false}
          />
          <div className="vista-con-titulo">
            <TituloDeVista titulo="Perfil de presiones" queMuestra="El terreno de la fuente al extremo del sector y, encima, la línea de presión: la distancia entre las dos es la presión en cada punto. Toca un tramo para elegirlo." />
            <PerfilDeLaRed puntos={recorrido} tramoSeleccionado={elegido} alSeleccionarTramo={seleccionar} />
          </div>
          <LeyendaDeLaPlanta presionNominalM={d.presionNominalEmisorM} conAfectados={afectados.size > 0} conCorriente />
          </div>
          </div>
          <TituloDeVista
            titulo="Las partes de tu red"
            queMuestra="El camino del agua, de la fuente a cada planta, con lo que mide cada parte en tu red. Pasa el cursor o haz clic en una parte para saber para qué sirve."
          />
          <EsquemaDeLaRed red={d.red} emisores={d.resumen.emisores} sectores={d.sectores.length} presionNominalM={d.presionNominalEmisorM} alElegir={seleccionar} />
        </section>

        <aside className="panel">
          <GuiaDelPaso
            tareas={[
              { texto: 'Mira cómo llega el agua a cada sector', hecho: vistosYActual.size >= d.sectores.length, detalle: `(${vistosYActual.size} de ${d.sectores.length})` },
              {
                texto: 'Revisa las alertas',
                hecho: bloquean === 0,
                detalle: bloquean > 0 ? `· ${bloquean} por corregir` : '· ninguna te detiene',
              },
              { texto: 'Cambia un tramo y mira qué pasa', hecho: cambios.length > 0, opcional: true, detalle: '· tócalo en la planta' },
              { texto: 'Guarda la red', hecho: !sinGuardar },
            ]}
          />
          <h3 className="rotulo">Resumen de la red</h3>
          <dl className="datos">
            <Dato nombre="Emisores" valor={cifra(d.resumen.emisores, 0)} />
            <Dato nombre="Tubería" ayuda="medida a lo largo de la pendiente" valor={`${cifra(d.resumen.longitudTuberiaM, 0)} m`} />
            <Dato nombre="Caudal de un turno" ayuda="el del sector que más pide" valor={`${conDecimales(d.resumen.caudalDisenoLps, 2)} l/s`} />
            <Dato nombre="Sectores" valor={String(d.sectores.length)} />
            <Dato nombre="Cámaras rompe-presión" valor={String(d.resumen.camarasRompePresion)} />
            <Dato nombre="Uniformidad" ayuda="la del sector más desparejo" valor={`${conDecimales(peorUniformidad * 100, 1)} %`} />
            {d.presupuesto && <Dato nombre="Costo referencial" valor={`${d.presupuesto.moneda} ${cifra(d.presupuesto.total, 0)}`} />}
          </dl>
          {conduccion && conduccion.parte >= 0.4 && d.presupuesto && (
            <p className="aviso">
              La conducción, {cifra(conduccion.largoM, 0)} m de la fuente al cabezal, se lleva el {conDecimales(conduccion.parte * 100, 0)} % del
              costo ({d.presupuesto.moneda} {cifra(conduccion.costo, 0)}). Su tubo de {conduccion.diametros.join(' y ')} mm ya es el más delgado con el que el agua
              llega con presión a los goteros: uno menor la deja sin fuerza. Lo que baja el costo es una toma de agua más cerca de la parcela
              (vuelve al paso 1) o una fuente más alta.
            </p>
          )}
          {d.presupuesto && (
            <>
              <AvisoDePreciosProvisionales presupuesto={d.presupuesto} />
              <details className="detalle-del-presupuesto">
                <summary>Ver el presupuesto por material</summary>
                <TablaDePresupuesto presupuesto={d.presupuesto} conAviso={false} />
              </details>
            </>
          )}

          {/* La misma elección que tocar el dibujo, para quien no usa el ratón: la tubería común y lo que riega este turno. */}
          <Campo etiqueta="Tramo elegido">
            <select value={elegido ?? ''} onChange={(e) => seleccionar(e.target.value)}>
              <option value="" disabled>
                Elige un tramo
              </option>
              {d.red.tramos
                .filter((t) => t.id === elegido || (sectorDelTramo(t.id, d.laterales) ?? sector) === sector)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {nombreDelTramo(t.id)} · {t.id}
                  </option>
                ))}
            </select>
          </Campo>

          {tramo ? (
            <section className="editor-del-tramo" aria-label="Cambiar el tramo">
              <h3>{nombreDelTramo(tramo.id)}</h3>
              <p className="nota">
                {tramo.id} · llega con {conDecimales(presionDelTramo(tramo.id) ?? 0, 1)} m de presión
                {turno.resultado.tramos[tramo.id] && turno.resultado.tramos[tramo.id]!.caudalLps > 0 && ` · pasa a ${conDecimales(turno.resultado.tramos[tramo.id]!.velocidadMs, 2)} m/s`}
              </p>
              {pendiente ? (
                <Prediccion
                  pregunta="presionDelTramoAlCambiar"
                  enunciado={`${pendiente.descripcion}. ¿Qué esperas que pase con la presión de este tramo?`}
                  opciones={PREDICCION_DE_LA_PRESION}
                  paso={5}
                  proyectoId={proyectoId}
                  detalle={{ ...pendiente.cambio }}
                  alResponder={(respuesta) => aplicarCambio(pendiente, respuesta)}
                  alCancelar={() => setPendiente(null)}
                />
              ) : (
                <>
                  <div className="campos dos">
                    <Campo etiqueta="Diámetro interno · mm">
                      <select
                        value={tramo.diametroInternoMm}
                        onChange={(e) => {
                          const mm = Number(e.target.value)
                          setPendiente({ cambio: { tipo: 'tramo', tramo: tramo.id, diametroInternoMm: mm }, tramo: tramo.id, descripcion: `Pasas de ${tramo.diametroInternoMm} a ${mm} mm` })
                        }}
                      >
                        {DIAMETROS_INTERNOS_MM.map((mm) => (
                          <option key={mm} value={mm}>
                            {mm}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Campo etiqueta="Clase">
                      <select
                        value={claseDe(tramo)}
                        onChange={(e) => setPendiente({ cambio: { tipo: 'tramo', tramo: tramo.id, clase: e.target.value }, tramo: tramo.id, descripcion: `Pasas de clase ${claseDe(tramo)} a ${e.target.value}` })}
                      >
                        {OPCIONES_DE_CLASE.map((c) => (
                          <option key={c.codigo} value={c.codigo}>
                            {c.codigo} · aguanta {c.aguanta} m
                          </option>
                        ))}
                      </select>
                    </Campo>
                  </div>
                  <div className="acciones izquierda">
                    {nodoAdmiteCamara(d.red, tramo.desde) && (
                      <button onClick={() => setPendiente({ cambio: { tipo: 'poner-camara', nodo: tramo.desde }, tramo: tramo.id, descripcion: 'Pones una cámara rompe-presión al inicio de este tramo' })}>
                        Poner una cámara al inicio
                      </button>
                    )}
                    {d.red.elementos?.[tramo.desde]?.tipo === 'crp' && (
                      <button onClick={() => setPendiente({ cambio: { tipo: 'quitar-camara', nodo: tramo.desde }, tramo: tramo.id, descripcion: 'Quitas la cámara rompe-presión del inicio de este tramo' })}>
                        Quitar la cámara del inicio
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
          ) : (
            <p className="nota">Toca un tramo en la planta o en el perfil para ver su presión y cambiarlo.</p>
          )}

          {efecto && presionAhora !== undefined && !laRed.isPlaceholderData && (
            <p className="aviso">
              Dijiste «{textoDeLaRespuesta(PREDICCION_DE_LA_PRESION, efecto.respuesta)}». En {nombreDelTramo(efecto.tramo).toLowerCase()} pasó de {conDecimales(efecto.antesM, 1)} a {conDecimales(presionAhora, 1)} m:{' '}
              {textoDeLaRespuesta(PREDICCION_DE_LA_PRESION, cambioDeLaPresion(efecto.antesM, presionAhora))}. Se resaltan los {afectados.size} tramos a los que les cambió la presión.
            </p>
          )}
          {puedeDeshacer && (
            <div className="acciones izquierda">
              <button
                onClick={() => {
                  despachar({ type: DESHACER_LA_RED })
                  setEfecto(null)
                  registrar({ paso: 5, accion: 'cambioDeshecho', proyectoId })
                }}
              >
                Deshacer el último cambio
              </button>
            </div>
          )}

          <PanelDeAlertas alertas={d.analisis.alertas} alSeleccionar={seleccionar} />

          {guardar.error && <p className="error" role="alert">{guardar.error.message}</p>}
          <div className="acciones">
            <button className="primario" disabled={guardar.isPending || laRed.isPlaceholderData || !sinGuardar} onClick={() => guardar.mutate()}>
              {guardar.isPending ? 'Guardando…' : sinGuardar ? 'Guardar la red' : 'Red guardada'}
            </button>
          </div>

          {cerrado && (
            <section className="cierre" aria-label="Cierre del paso 5">
              <p>
                <strong>Paso 5 completo.</strong> {bloquean > 0 ? `Quedan ${bloquean} alertas por resolver: al ponerla a funcionar vas a ver qué significan.` : 'Tu red está lista para ponerla a funcionar.'}
              </p>
              <div className="acciones">
                <button className="primario" onClick={() => alIrAlPaso(6)}>
                  Siguiente paso: poner a funcionar
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
