import { GuiaDelPaso } from '../componentes/GuiaDelPaso.tsx'
import { TituloDeVista } from '../componentes/Figura.tsx'
import { avanceDelAgua, caudalesPorEmisor, centroideDePoligono, recorridoHasta, type CambioDeRed, type CambioPropuesto } from '@riego/calculo'
import { useMutation } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/cliente.ts'
import { useAlGuardarElPaso } from '../api/consultas.ts'
import type { AvanceDeLaCampana, RedGuardada } from '../api/tipos.ts'
import { useLaRed } from '../calculo/usar-la-red.ts'
import { PanelDeAlertas } from '../componentes/PanelDeAlertas.tsx'
import { PerfilDeLaRed } from '../componentes/PerfilDeLaRed.tsx'
import { LeyendaDeLaPlanta, RedEnPlanta } from '../componentes/RedEnPlanta.tsx'
import { redCambiada } from '../estado/red.ts'
import { conDecimales } from '../formato.ts'
import type { PropsDelPaso } from '../pasos.ts'
import { destinoDelPerfil, nombreDelTramo, sectorDelTramo, segmentosEn3D } from '../red-en-pantalla.ts'
import { useRegistrar } from '../registro/contexto.ts'
import { VISTAS, type Vista } from '../vista-3d.ts'
import { Desplazable } from '../componentes/Desplazable.tsx'
import { EstadoDeError } from '../componentes/EstadoDeError.tsx'

// Paso 6, poner a funcionar el sistema (HU0020 a HU0023). El estudiante abre un sector y ve avanzar el agua; al terminar,
// lo que entrega cada emisor y la uniformidad. Después cierra todas las válvulas: la presión sube a todo el desnivel, y
// el tubo que no aguanta se marca como roto (C1, C2, C5; CE5). Cada alerta señala el tramo, la causa y una corrección.

const Relieve3D = lazy(() => import('../componentes/Relieve3D.tsx').then((m) => ({ default: m.Relieve3D })))

const DURACION_DEL_AGUA_MS = 2500
/** Al abrirlos todos, cada sector se queda un momento regado antes de pasar al siguiente. */
const PAUSA_ENTRE_SECTORES_MS = 600
const FILAS_DE_PRESION = 8

const sinMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

type Modo = 'regando' | 'cerrado'

export function Paso6({ proyectoId, alPerderlo, alIrAlPaso }: PropsDelPaso) {
  const registrar = useRegistrar()
  const alGuardar = useAlGuardarElPaso(proyectoId)
  const { proyecto, datos, relieve, planteamiento, cambios, laRed, despachar } = useLaRed(6, proyectoId, alPerderlo)
  const [modo, setModo] = useState<Modo>('regando')
  const [sectorElegido, setSectorElegido] = useState<string | undefined>(undefined)
  const [elegido, setElegido] = useState<string | undefined>(undefined)
  const [avance, setAvance] = useState<number | null>(null)
  const [regados, setRegados] = useState<ReadonlySet<string>>(new Set())
  const [cerradoProbado, setCerradoProbado] = useState(false)
  const [en3d, setEn3d] = useState(false)
  const [sin3d, setSin3d] = useState(false)
  const [vista3d, setVista3d] = useState<Vista>('isometrica')
  const cuadro = useRef(0)
  useEffect(() => () => cancelAnimationFrame(cuadro.current), [])

  const guardarCambio = useMutation({
    mutationFn: (nuevos: readonly CambioDeRed[]) => api<RedGuardada>(`/proyectos/${proyectoId}/red`, { metodo: 'PUT', cuerpo: { cambios: nuevos } }),
    onSuccess: alGuardar,
  })
  const confirmar = useMutation({
    mutationFn: () => api<AvanceDeLaCampana>(`/proyectos/${proyectoId}/red/funcionamiento`, { metodo: 'PUT', cuerpo: {} }),
    onSuccess: (avanceDelPaso) => {
      alGuardar(avanceDelPaso)
      registrar({ paso: 6, accion: 'disenoFunciono', detalle: { version: avanceDelPaso.red?.version }, proyectoId })
    },
  })

  const d = laRed.data
  const sector = sectorElegido ?? d?.sectores[0]
  const turno = d?.analisis.turnos.find((t) => t.sector === sector)
  const cerrada = modo === 'cerrado' ? d?.cerrada : undefined
  const presiones = useMemo(
    () => cerrada ?? Object.fromEntries(Object.values(turno?.resultado.nodos ?? {}).map((n) => [n.id, n.presionM])),
    [cerrada, turno],
  )
  const rotos = useMemo(() => {
    if (!d) return new Set<string>()
    if (modo === 'cerrado') return new Set(d.analisis.presiones.filter((p) => !p.cumpleClase).map((p) => p.tramo))
    return new Set(Object.values(turno?.resultado.tramos ?? {}).filter((t) => !t.cumpleClase).map((t) => t.id))
  }, [d, modo, turno])
  const agua = useMemo(() => (d && turno ? avanceDelAgua(d.red, turno.resultado.tramos) : null), [d, turno])
  const fracciones = useMemo(() => new Map(agua?.tramos.map((t) => [t.tramo, t])), [agua])
  const tramoElegido = d?.red.tramos.find((t) => t.id === elegido)
  const recorrido = useMemo(() => (d && turno ? recorridoHasta(d.red, destinoDelPerfil(d.red, turno, tramoElegido), presiones) : []), [d, turno, tramoElegido, presiones])
  const emisores = useMemo(() => (d && turno ? caudalesPorEmisor(d.red, turno, d.coeficienteK).sort((a, b) => a.caudalPorEmisorLph - b.caudalPorEmisorLph) : []), [d, turno])
  const centroide = useMemo(() => (planteamiento ? centroideDePoligono(planteamiento.contorno) : null), [planteamiento])
  const segmentos = useMemo(
    () => (d && centroide ? segmentosEn3D(d.red, centroide, cerrada ?? Object.fromEntries(Object.entries(presiones).filter(([, v]) => v > 0)), d.presionNominalEmisorM, rotos, !cerrada) : []),
    [d, centroide, cerrada, presiones, rotos],
  )

  if (proyecto.isPending || datos.isPending || relieve.isPending) return <p className="cargando" role="status">Abriendo el paso…</p>
  if (proyecto.error) return <EstadoDeError error={proyecto.error} alReintentar={() => void proyecto.refetch()} alVolver={alPerderlo} />
  if (datos.error) return <EstadoDeError error={datos.error} alReintentar={() => void datos.refetch()} alVolver={alPerderlo} />
  if (relieve.error) return <EstadoDeError error={relieve.error} alReintentar={() => void relieve.refetch()} alVolver={alPerderlo} />
  const p = proyecto.data!
  if (!planteamiento || !p.red || p.resultadosDesactualizados.includes(5)) {
    return (
      <div className="paso">
        <p className="alerta">Para ponerla a funcionar, primero genera y guarda la red. Vuelve al paso 5.</p>
        <div className="acciones izquierda">
          <button onClick={() => alIrAlPaso(5)}>Volver al paso 5</button>
        </div>
      </div>
    )
  }
  if (laRed.error) return <EstadoDeError error={laRed.error} alReintentar={() => void laRed.refetch()} alVolver={alPerderlo} />
  if (!d || !turno) return <p className="cargando" role="status">Preparando la red…</p>

  // Elegir un lateral lleva a su sector: el perfil de un lateral sin agua no diría nada.
  function seleccionar(id: string) {
    setElegido(id)
    const delTramo = sectorDelTramo(id, d!.laterales)
    if (delTramo) setSectorElegido(delTramo)
  }

  // Abrir la válvula: el agua avanza por la red, y al llegar se ve lo que entrega cada emisor. `luego` sigue cuando el
  // agua ya llegó: así se encadenan los sectores al abrirlos todos.
  function abrirValvula(s: string, luego?: () => void) {
    cancelAnimationFrame(cuadro.current)
    setModo('regando')
    setSectorElegido(s)
    registrar({ paso: 6, accion: 'valvulaAbierta', detalle: { sector: s }, proyectoId })
    const terminar = () => {
      setAvance(null)
      setRegados((anteriores) => new Set([...anteriores, s]))
      const delTurno = d!.analisis.turnos.find((t) => t.sector === s)
      registrar({ paso: 6, accion: 'riegoTerminado', detalle: { sector: s, uniformidad: delTurno?.uniformidad }, proyectoId })
      luego?.()
    }
    if (sinMovimiento()) {
      terminar()
      return
    }
    let inicio: number | undefined
    const avanzar = (ahora: number) => {
      inicio ??= ahora
      const t = (ahora - inicio) / DURACION_DEL_AGUA_MS
      if (t >= 1) {
        terminar()
        return
      }
      setAvance(t)
      cuadro.current = requestAnimationFrame(avanzar)
    }
    setAvance(0)
    cuadro.current = requestAnimationFrame(avanzar)
  }

  /** Espera en el mismo cuadro de la animación: abrir otro sector, cerrar las válvulas o corregir también la cortan. */
  function esperar(ms: number, luego: () => void) {
    let inicio: number | undefined
    const contar = (ahora: number) => {
      inicio ??= ahora
      if (ahora - inicio >= ms) luego()
      else cuadro.current = requestAnimationFrame(contar)
    }
    cuadro.current = requestAnimationFrame(contar)
  }

  // Abrir todos los sectores: uno tras otro, en el orden de los turnos, como se riega en el campo. A la vez no, porque la
  // parcela se partió en turnos justamente porque la fuente no alcanza para regarla entera.
  function abrirTodos() {
    const sectores = d!.sectores
    registrar({ paso: 6, accion: 'todosLosSectoresAbiertos', detalle: { sectores: sectores.length }, proyectoId })
    const abrir = (i: number): void => {
      const siguiente = () => abrir(i + 1)
      abrirValvula(sectores[i]!, i + 1 < sectores.length ? () => (sinMovimiento() ? siguiente() : esperar(PAUSA_ENTRE_SECTORES_MS, siguiente)) : undefined)
    }
    abrir(0)
  }

  /** Corta el agua que va avanzando, y con ella la secuencia de abrir todos los sectores. */
  function detenerElAgua() {
    cancelAnimationFrame(cuadro.current)
    setAvance(null)
  }

  function cerrarValvulas() {
    detenerElAgua()
    setModo('cerrado')
    setCerradoProbado(true)
    registrar({
      paso: 6,
      accion: 'valvulasCerradas',
      detalle: { rotos: d!.analisis.presiones.filter((x) => !x.cumpleClase).map((x) => x.tramo), presionMaximaM: Math.max(...d!.analisis.presiones.map((x) => x.presionMaximaM)) },
      proyectoId,
    })
  }

  // Corregir cambia el diseño: se guarda, y hay que volver a probarlo. El agua que iba avanzando era la del diseño de
  // antes: se corta, para que no marque como probado un sector que el diseño nuevo todavía no regó.
  function corregir(cambio: CambioDeRed, origen: string) {
    const nuevos = [...cambios, cambio]
    detenerElAgua()
    despachar(redCambiada(cambio))
    guardarCambio.mutate(nuevos)
    setRegados(new Set())
    setCerradoProbado(false)
    registrar({ paso: 6, accion: 'correccionAplicada', detalle: { ...cambio, origen }, proyectoId })
  }
  const aplicarPropuesta = ({ tramo, ...cambio }: CambioPropuesto) => corregir({ tipo: 'tramo', tramo, ...cambio }, 'alerta')
  /** Todas las correcciones de un grupo de alertas de una vez: una sola versión nueva, no una por tubo. */
  function aplicarPropuestas(propuestas: readonly CambioPropuesto[]) {
    const lista: CambioDeRed[] = propuestas.map(({ tramo, ...cambio }) => ({ tipo: 'tramo', tramo, ...cambio }))
    detenerElAgua()
    for (const cambio of lista) despachar(redCambiada(cambio))
    guardarCambio.mutate([...cambios, ...lista])
    setRegados(new Set())
    setCerradoProbado(false)
    registrar({ paso: 6, accion: 'correccionesAplicadas', detalle: { cuantas: lista.length, origen: 'alerta' }, proyectoId })
  }

  const aguaEnElTramo =
    avance === null || !agua
      ? undefined
      : (id: string) => {
          const t = fracciones.get(id)
          if (!t) return 0
          const frente = avance * agua.totalM
          if (frente <= t.desdeM) return 0
          return t.hastaM === t.desdeM ? 1 : Math.min(1, (frente - t.desdeM) / (t.hastaM - t.desdeM))
        }

  const porPresion = [...d.analisis.presiones].sort((a, b) => Number(a.cumpleClase) - Number(b.cumpleClase) || b.presionMaximaM - a.presionMaximaM).slice(0, FILAS_DE_PRESION)
  const todoProbado = d.sectores.every((s) => regados.has(s)) && cerradoProbado
  const yaFunciono = p.red.funciono && !p.resultadosDesactualizados.includes(6)
  const hayPeligro = d.analisis.alertas.some((a) => a.gravedad !== 'avisa')
  const faltaPresion = d.analisis.alertas.some((a) => a.codigo === 'presion-insuficiente')
  const guardando = guardarCambio.isPending || laRed.isPlaceholderData
  const probados = d.sectores.filter((s) => regados.has(s)).length

  return (
    <div className="paso">
      <div className="titulo-del-paso">
        <h2>
          <span className="rotulo">Paso 6</span> Poner a funcionar el sistema
        </h2>
        <span className="rotulo">
          {p.nombre} · {planteamiento.cultivo.toLowerCase()}
        </span>
      </div>

      <div className="paso-con-panel">
        <section className="lienzo vistas-de-la-red">
          <TituloDeVista
            titulo={en3d && !sin3d ? 'La red sobre el terreno, en 3D' : 'La red en planta, funcionando'}
            queMuestra={
              modo === 'cerrado'
                ? 'Todas las válvulas cerradas: sin agua corriendo, cada tramo aguanta todo el desnivel que tiene encima. En rojo, lo que reventaría.'
                : `Regando el sector ${sector?.slice(1) ?? ''}: el agua avanza desde la fuente y cada tramo se pinta con su presión. Abre cada sector y luego cierra las válvulas.`
            }
          />
          <div className="vistas-con-controles">
          <div className="controles-de-la-vista">
          <div className="modos-de-la-red" role="group" aria-label="Cómo se ve la red">
            <button aria-pressed={en3d} disabled={sin3d} onClick={() => setEn3d(!en3d)}>
              {en3d ? 'Ver en 2D' : 'Ver en 3D'}
            </button>
          </div>
          {en3d && !sin3d && (
            <div className="modos-de-la-red" role="group" aria-label="Vista del terreno">
              {VISTAS.map((v) => (
                <button key={v.vista} aria-pressed={v.vista === vista3d} onClick={() => setVista3d(v.vista)}>
                  {v.nombre}
                </button>
              ))}
            </div>
          )}
          <div className="modos-de-la-red" role="group" aria-label="Qué hace el sistema">
            {d.sectores.map((s) => (
              <button key={s} aria-pressed={modo === 'regando' && s === sector} className={regados.has(s) ? 'probado' : undefined} onClick={() => abrirValvula(s)}>
                Abrir sector {s.slice(1)}
              </button>
            ))}
            {d.sectores.length > 1 && (
              <button className={probados === d.sectores.length ? 'probado' : undefined} onClick={abrirTodos}>
                Abrir todos los sectores
              </button>
            )}
            <button aria-pressed={modo === 'cerrado'} className={cerradoProbado ? 'probado' : undefined} onClick={cerrarValvulas}>
              Cerrar las válvulas
            </button>
          </div>
          <p className="que-es-un-sector">
            Un sector es la parte de la parcela que se riega a la vez: un turno. Tu parcela se riega en {d.sectores.length} turnos, uno tras otro. Abre la válvula de cada uno para ver cómo llega el agua; después ciérralas todas, que es cuando la
            presión sube más.
            {d.sectores.length > 1 && ' «Abrir todos los sectores» los abre uno tras otro, en el orden de los turnos: la fuente no alcanza para regarlos a la vez.'}
          </p>
          {sin3d && <p className="aviso">Este equipo no puede mostrar el 3D: sigue en planta y en perfil, que dicen lo mismo.</p>}
          </div>
          <div className="vistas">
          {en3d && !sin3d && (
            <>
              <Suspense fallback={<p className="cargando" role="status">Abriendo el 3D…</p>}>
                <Relieve3D
                  relieve={relieve.data!}
                  contorno={p.parcela!.contorno}
                  centroide={p.parcela!.centroide}
                  fuente={{ lat: p.fuente!.lat, lon: p.fuente!.lon, cotaMsnm: p.fuente!.cotaMsnm }}
                  conduccion={null}
                  desnivelM={p.desnivel?.disponibleM ?? null}
                  vista={vista3d}
                  alFallar={() => setSin3d(true)}
                  red={segmentos}
                  presionNominalM={d.presionNominalEmisorM}
                  tramoSeleccionado={elegido}
                />
              </Suspense>
            </>
          )}
          {!(en3d && !sin3d) && (
            <RedEnPlanta
              red={d.red}
              resultado={turno.resultado}
              contorno={d.contornoLocal}
              presionNominalEmisorM={d.presionNominalEmisorM}
              tramoSeleccionado={elegido}
              alSeleccionarTramo={seleccionar}
              presionesCerradas={cerrada}
              rotos={rotos}
              aguaEnElTramo={aguaEnElTramo}
              conLeyenda={false}
            />
          )}
          <div className="vista-con-titulo">
            <TituloDeVista titulo="Perfil de presiones" queMuestra="El terreno de la fuente al extremo del sector y, encima, la línea de presión: la distancia entre las dos es la presión en cada punto. Toca un tramo para elegirlo." />
            <PerfilDeLaRed puntos={recorrido} tramoSeleccionado={elegido} alSeleccionarTramo={seleccionar} rotos={rotos} />
          </div>
          {!(en3d && !sin3d) && <LeyendaDeLaPlanta presionNominalM={d.presionNominalEmisorM} conRotos={rotos.size > 0} conCorriente={modo === 'regando'} />}
          </div>
          </div>
        </section>

        <aside className="panel">
          <GuiaDelPaso
            tareas={[
              { texto: 'Abre cada sector y mira cómo llega el agua', hecho: probados === d.sectores.length, detalle: `(${probados} de ${d.sectores.length})` },
              { texto: 'Cierra las válvulas', hecho: cerradoProbado, detalle: '· así se ve la presión más alta, la que puede reventar un tubo' },
              { texto: 'Corrige lo que no funciona', hecho: !hayPeligro, detalle: hayPeligro ? '· mira las alertas' : '· no hay nada que corregir' },
              { texto: 'Confirma que tu diseño funciona', hecho: yaFunciono },
            ]}
            avance={{ hechos: probados + (cerradoProbado ? 1 : 0), total: d.sectores.length + 1, nombre: 'pruebas hechas' }}
          />
          {modo === 'regando' ? (
            <>
              <h3 className="rotulo">Caudal por emisor · sector {sector?.slice(1)}</h3>
              {avance !== null ? (
                <p className="nota">El agua va llegando…</p>
              ) : regados.has(sector ?? '') ? (
                <>
                  <p className="nota">Cada fila es un tramo de lateral, con lo que entrega cada emisor; arriba, los que menos reciben.</p>
                  <Desplazable nombre="Lo que entrega cada emisor del sector" alto>
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Emisores en</th>
                          <th scope="col">Presión · m</th>
                          <th scope="col">Entrega · l/h</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emisores.map((e) => (
                          <tr key={e.nodo}>
                            <th scope="row">
                              {e.nodo} <span className="nota">({e.emisores})</span>
                            </th>
                            <td className="cifra">{conDecimales(e.presionM, 1)}</td>
                            <td className="cifra">{conDecimales(e.caudalPorEmisorLph, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Desplazable>
                  <p>
                    <strong>Uniformidad del sector: {conDecimales(turno.uniformidad * 100, 1)} %</strong>
                    <br />
                    <span className="nota">El cuarto del sector que menos recibe se lleva ese porcentaje de lo que el cultivo necesita.</span>
                  </p>
                </>
              ) : (
                <p className="nota">Abre la válvula del sector para ver avanzar el agua y lo que entrega cada emisor.</p>
              )}
            </>
          ) : (
            <>
              <h3 className="rotulo">Con las válvulas cerradas</h3>
              <p className="nota">Sin agua corriendo no hay pérdida: la presión sube hasta todo el desnivel que el sistema tiene encima. Solo una cámara rompe-presión la corta.</p>
              <Desplazable nombre="Presión máxima con las válvulas cerradas"><table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Tramo</th>
                    <th scope="col">Máxima · m</th>
                    <th scope="col">Aguanta · m</th>
                  </tr>
                </thead>
                <tbody>
                  {porPresion.map((x) => (
                    <tr key={x.tramo} className={`elegible ${x.cumpleClase ? '' : 'roto'}`} onClick={() => seleccionar(x.tramo)}>
                      <th scope="row">
                        {x.tramo}
                        {!x.cumpleClase && ' · se rompe'}
                      </th>
                      <td className="cifra">{conDecimales(x.presionMaximaM, 1)}</td>
                      <td className="cifra">{x.claseM === undefined ? '—' : conDecimales(x.claseM, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></Desplazable>
              <p className={rotos.size > 0 ? 'alerta' : 'aviso'}>
                {rotos.size > 0 ? `${rotos.size} tramos no aguantan: en el campo reventarían aunque regando parecieran estar bien.` : 'Toda la tubería aguanta la presión con las válvulas cerradas.'}
              </p>
            </>
          )}
          {tramoElegido && <p className="nota">Tramo elegido: {nombreDelTramo(tramoElegido.id)} ({tramoElegido.id}).</p>}

          <PanelDeAlertas alertas={d.analisis.alertas} alAplicar={aplicarPropuesta} alAplicarTodas={aplicarPropuestas} alPonerCamara={(nodo) => corregir({ tipo: 'poner-camara', nodo }, 'alerta')} alSeleccionar={seleccionar} />
          {guardarCambio.error && <p className="error" role="alert">{guardarCambio.error.message}</p>}
          {confirmar.error && <p className="error" role="alert">{confirmar.error.message}</p>}

          {yaFunciono ? (
            <section className="cierre" aria-label="Cierre del paso 6">
              <p>
                <strong>Paso 6 completo.</strong> Tu diseño funciona en todos los turnos y con las válvulas cerradas.
              </p>
              <div className="acciones">
                <button className="primario" onClick={() => alIrAlPaso(7)}>
                  Siguiente paso: mejorar con ML
                </button>
              </div>
            </section>
          ) : (
            <>
              {!todoProbado && <p className="nota">Para seguir, riega todos los sectores y cierra las válvulas. Si corriges algo, hay que volver a probar.</p>}
              {todoProbado && hayPeligro && <p className="nota">Todavía hay alertas por corregir: mientras tanto, el diseño no funciona.</p>}
              <div className="acciones">
                <button className="primario" disabled={!todoProbado || hayPeligro || guardando || confirmar.isPending} onClick={() => confirmar.mutate()}>
                  {confirmar.isPending ? 'Comprobando…' : 'Mi diseño funciona'}
                </button>
              </div>
              <div className="acciones izquierda">
                <button onClick={() => alIrAlPaso(5)}>Volver al paso 5 para cambiar un tramo</button>
                {/* Si el desnivel no da para el emisor, engrosar no basta: la salida está antes, en el método o en la fuente. */}
                {faltaPresion && (
                  <>
                    <button onClick={() => alIrAlPaso(4)}>Volver al paso 4 por otro emisor</button>
                    <button onClick={() => alIrAlPaso(1)}>Volver al paso 1 por una fuente más alta</button>
                  </>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
