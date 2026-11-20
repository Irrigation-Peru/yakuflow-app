import { TituloDeVista } from '../componentes/Figura.tsx'
import { avanceDelAgua, type CambioDeRed, type Red, type RiegoDelSector } from '@riego/calculo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/cliente.ts'
import { useAlGuardarElPaso } from '../api/consultas.ts'
import type { AvanceDeLaCampana } from '../api/tipos.ts'
import type { AlternativaDelEstudiante } from '../calculo/modelo-sustituto.ts'
import { calcular } from '../calculo/puente.ts'
import { useLaRed } from '../calculo/usar-la-red.ts'
import { RedEnPlanta } from '../componentes/RedEnPlanta.tsx'
import { TablaDePresupuesto } from '../componentes/TablaDePresupuesto.tsx'
import { cargarRed } from '../estado/red.ts'
import { conDecimales, cifra } from '../formato.ts'
import type { PropsDelPaso } from '../pasos.ts'
import { cambiosAgrupados } from '../red-en-pantalla.ts'
import { useRegistrar } from '../registro/contexto.ts'
import { Desplazable } from '../componentes/Desplazable.tsx'
import { EstadoDeError } from '../componentes/EstadoDeError.tsx'

// Paso 7, mejorar el diseño con ML (HU0026). Se abre solo si el diseño propio ya funcionó. El modelo sustituto ordena las
// modificaciones y el módulo de cálculo verifica cada una: aquí solo llega lo que funciona. No hay un diseño óptimo único
// (CE7): cada alternativa gana en algo y el estudiante decide, también quedarse con el suyo (C1).

const NOMBRE_DEL_CRITERIO = { costo: 'Más barata', uniformidad: 'Más pareja', margen: 'Con más margen' } as const
const PESOS = [
  { valor: 'costo', texto: 'El costo' },
  { valor: 'uniformidad', texto: 'La uniformidad' },
  { valor: 'margen', texto: 'El margen de presión' },
  { valor: 'otro', texto: 'Algo que el modelo no mide, como el mantenimiento o lo que hay en el mercado' },
] as const
const DURACION_DEL_AGUA_MS = 2500
const TRAMOS_A_MOSTRAR = 4

type Modo = 'regando' | 'cerrado'

const conSigno = (valor: number, decimales: number) => `${valor > 0 ? '+' : ''}${conDecimales(valor, decimales)}`

function useAguaEnLaRed(red: Red | undefined, turno: RiegoDelSector | undefined, avance: number | null) {
  const agua = useMemo(() => (red && turno ? avanceDelAgua(red, turno.resultado.tramos) : null), [red, turno])
  const porTramo = useMemo(() => new Map(agua?.tramos.map((t) => [t.tramo, t])), [agua])
  if (avance === null || !agua) return undefined
  return (id: string) => {
    const t = porTramo.get(id)
    if (!t) return 0
    const frente = avance * agua.totalM
    if (frente <= t.desdeM) return 0
    return t.hastaM === t.desdeM ? 1 : Math.min(1, (frente - t.desdeM) / (t.hastaM - t.desdeM))
  }
}

export function Paso7({ proyectoId, alPerderlo, alIrAlPaso }: PropsDelPaso) {
  const registrar = useRegistrar()
  const consultas = useQueryClient()
  const alGuardar = useAlGuardarElPaso(proyectoId)
  const { proyecto, datos, relieve, precios, planteamiento, cambios, laRed, despachar } = useLaRed(7, proyectoId, alPerderlo)
  const p = proyecto.data
  const habilitado = Boolean(p?.red?.funciono && !p.resultadosDesactualizados.includes(5) && !p.resultadosDesactualizados.includes(6))

  const [elegidaIndice, setElegidaIndice] = useState(0)
  const [sectorElegido, setSectorElegido] = useState<string | undefined>(undefined)
  const [modo, setModo] = useState<Modo>('regando')
  const [avance, setAvance] = useState<number | null>(null)
  const [peso, setPeso] = useState<string | null>(null)
  const [elegido, setElegido] = useState<string | undefined>(undefined)
  const cuadro = useRef(0)
  useEffect(() => () => cancelAnimationFrame(cuadro.current), [])

  const alternativas = useQuery({
    queryKey: ['alternativas', proyectoId, planteamiento && { ...planteamiento, grilla: null }, cambios, precios.data?.version],
    queryFn: () => calcular('alternativasDelEstudiante', planteamiento!, cambios, precios.data!),
    enabled: habilitado && planteamiento !== null && Boolean(precios.data) && laRed.isSuccess,
    retry: false,
    staleTime: Infinity,
  })
  // Sin precios o si el modelo falla no hay alternativas, pero el paso no se cierra: el diseño propio ya funciona y el
  // estudiante puede quedarse con él y seguir al informe.
  const sinPrecios = precios.isError || (precios.isSuccess && !precios.data)
  const sinModelo = sinPrecios
    ? 'No hay un catálogo de precios cargado, y sin precios el modelo no puede comparar costos.'
    : alternativas.error
      ? `No se pudieron calcular las alternativas: ${alternativas.error.message}`
      : null
  const lista = alternativas.data?.alternativas ?? []
  const alternativa: AlternativaDelEstudiante | undefined = lista[Math.min(elegidaIndice, lista.length - 1)]

  // Lo que el modelo propuso queda registrado aunque el estudiante no lo elija: es la evidencia de cercanía a las alternativas.
  const mostradas = alternativas.data
  useEffect(() => {
    if (!mostradas) return
    registrar({
      paso: 7,
      accion: 'alternativasMostradas',
      detalle: { version: mostradas.modelo.version, estadisticas: mostradas.estadisticas, alternativas: mostradas.alternativas.map((a) => ({ criterio: a.criterio, descripcion: a.descripcion, diferencia: a.diferencia })) },
      proyectoId,
    })
  }, [mostradas]) // oxlint-disable-line react-hooks/exhaustive-deps

  const decidir = useMutation({
    mutationFn: (cuerpo: { decision: 'propia' } | { decision: 'alternativa'; criterio: string; cambios: readonly CambioDeRed[]; modelo: unknown }) =>
      api<AvanceDeLaCampana>(`/proyectos/${proyectoId}/optimizacion`, { metodo: 'PUT', cuerpo }),
    onSuccess: async (avanceDelPaso) => {
      alGuardar(avanceDelPaso)
      despachar(cargarRed({ proyectoId, cambios: avanceDelPaso.red?.cambios ?? [] }))
      await consultas.invalidateQueries({ queryKey: ['estado'] })
    },
  })

  const d = laRed.data
  const sector = sectorElegido ?? d?.sectores[0]
  const turnoPropio = d?.analisis.turnos.find((t) => t.sector === sector)
  const turnoDeLaAlternativa = alternativa?.analisis.turnos.find((t) => t.sector === sector)
  const aguaPropia = useAguaEnLaRed(d?.red, turnoPropio, avance)
  const aguaDeLaAlternativa = useAguaEnLaRed(alternativa?.red, turnoDeLaAlternativa, avance)
  const agrupados = useMemo(() => (alternativa ? cambiosAgrupados(alternativa.porTramo) : []), [alternativa])

  if (proyecto.isPending || datos.isPending || relieve.isPending) return <p className="cargando" role="status">Abriendo el paso…</p>
  if (proyecto.error) return <EstadoDeError error={proyecto.error} alReintentar={() => void proyecto.refetch()} alVolver={alPerderlo} />
  if (datos.error) return <EstadoDeError error={datos.error} alReintentar={() => void datos.refetch()} alVolver={alPerderlo} />
  if (relieve.error) return <EstadoDeError error={relieve.error} alReintentar={() => void relieve.refetch()} alVolver={alPerderlo} />
  if (!habilitado) {
    return (
      <div className="paso">
        <p className="alerta">El modelo propone alternativas a un diseño que ya funciona: primero el tuyo tiene que funcionar en el paso 6.</p>
        <div className="acciones izquierda">
          <button onClick={() => alIrAlPaso(6)}>Volver al paso 6</button>
        </div>
      </div>
    )
  }
  if (laRed.error) return <EstadoDeError error={laRed.error} alReintentar={() => void laRed.refetch()} alVolver={alPerderlo} />
  if (!d || !turnoPropio || (!alternativas.data && !sinModelo)) return <p className="cargando" role="status">El módulo de cálculo está verificando las alternativas del modelo…</p>

  function soltarElAgua(s: string) {
    cancelAnimationFrame(cuadro.current)
    setModo('regando')
    setSectorElegido(s)
    registrar({ paso: 7, accion: 'comparacionPuestaAFuncionar', detalle: { sector: s, criterio: alternativa?.criterio }, proyectoId })
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setAvance(null)
      return
    }
    let inicio: number | undefined
    const avanzar = (ahora: number) => {
      inicio ??= ahora
      const t = (ahora - inicio) / DURACION_DEL_AGUA_MS
      if (t >= 1) {
        setAvance(null)
        return
      }
      setAvance(t)
      cuadro.current = requestAnimationFrame(avanzar)
    }
    setAvance(0)
    cuadro.current = requestAnimationFrame(avanzar)
  }

  function cerrarValvulas() {
    cancelAnimationFrame(cuadro.current)
    setAvance(null)
    setModo('cerrado')
    registrar({ paso: 7, accion: 'comparacionConValvulasCerradas', detalle: { criterio: alternativa?.criterio }, proyectoId })
  }

  function elegirAlternativa(i: number) {
    setElegidaIndice(i)
    setElegido(undefined)
    registrar({ paso: 7, accion: 'alternativaVista', detalle: { criterio: lista[i]!.criterio, descripcion: lista[i]!.descripcion }, proyectoId })
  }

  function quedarmeConLaAlternativa() {
    if (!alternativa) return
    registrar({ paso: 7, accion: 'alternativaElegida', detalle: { criterio: alternativa.criterio, descripcion: alternativa.descripcion, peso }, proyectoId })
    decidir.mutate({ decision: 'alternativa', criterio: alternativa.criterio, cambios: alternativa.cambios, modelo: alternativas.data!.modelo })
  }

  function quedarmeConElMio() {
    registrar({ paso: 7, accion: 'disenoPropioConservado', detalle: { peso, sinModelo: sinModelo !== null }, proyectoId })
    decidir.mutate({ decision: 'propia' })
  }

  const partida = alternativas.data?.partida
  const estadisticas = alternativas.data?.estadisticas
  const moneda = d.presupuesto?.moneda ?? ''
  const cerradoPropio = modo === 'cerrado' ? d.cerrada : undefined
  const cerradoDeLaAlternativa = modo === 'cerrado' ? alternativa?.cerrada : undefined
  const decidido = p!.pasoAlcanzado >= 8 && !p!.resultadosDesactualizados.includes(7)
  const nombreDelDiseno = p!.red!.origen === 'ml' ? 'el que elegiste del modelo' : 'el tuyo'

  return (
    <div className="paso">
      <div className="titulo-del-paso">
        <h2>
          <span className="rotulo">Paso 7</span> Mejorar el diseño con ML
        </h2>
        <span className="rotulo">
          {p!.nombre} · {planteamiento!.cultivo.toLowerCase()}
        </span>
      </div>

      {sinModelo || !estadisticas || !partida ? (
        <section className="tarjeta">
          <p>
            <strong>Esta vez el modelo no pudo proponer alternativas.</strong>
          </p>
          <p className="nota">{sinModelo} Tu diseño ya funciona: puedes quedarte con él y seguir al informe.</p>
          {!sinPrecios && (
            <div className="acciones izquierda">
              <button onClick={() => void alternativas.refetch()}>Volver a intentar</button>
            </div>
          )}
        </section>
      ) : lista.length === 0 ? (
        <section className="tarjeta">
          <p>
            <strong>El modelo no encontró una alternativa que funcione y mejore tu diseño.</strong>
          </p>
          <p className="nota">
            Probó {estadisticas.recalculadas} de {estadisticas.posibles} modificaciones posibles y el módulo de cálculo descartó las demás. No quiere decir que tu diseño sea el único válido: un diseño se juzga también por lo que el modelo no mide.
          </p>
        </section>
      ) : (
        <>
          <p className="nota">
            No hay un diseño óptimo único: cada alternativa gana en algo y cede en otra cosa. El módulo de cálculo verificó cada una con todos los turnos y con las válvulas cerradas; {estadisticas.recalculadas - estadisticas.mejoranEnAlgo} de las {estadisticas.recalculadas} que probó se descartaron por no cumplir o no mejorar en nada.
          </p>
          {/* Patrón de radio de WAI-ARIA: Tab entra a la elegida y las flechas recorren las alternativas. */}
          <div
            className="alternativas"
            role="radiogroup"
            aria-label="Alternativas del modelo"
            onKeyDown={(e) => {
              const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
              if (delta === 0 || lista.length === 0) return
              e.preventDefault()
              const actual = Math.max(0, lista.findIndex((a) => a === alternativa))
              const siguiente = (actual + delta + lista.length) % lista.length
              elegirAlternativa(siguiente)
              e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[siguiente]?.focus()
            }}
          >
            {lista.map((a, i) => (
              <button
                key={a.descripcion}
                role="radio"
                aria-checked={a === alternativa}
                tabIndex={a === alternativa || (!alternativa && i === 0) ? 0 : -1}
                className="tarjeta-alternativa"
                onClick={() => elegirAlternativa(i)}
              >
                <span className="rotulo">{NOMBRE_DEL_CRITERIO[a.criterio]}</span>
                <span>{a.descripcion}</span>
                <span className="nota">
                  {conSigno(a.diferencia.costoPct, 1)} % de costo · {conSigno(a.diferencia.uniformidad, 1)} puntos de uniformidad · {conSigno(a.diferencia.margenM, 1)} m de margen
                </span>
              </button>
            ))}
          </div>

          <Desplazable nombre="Comparación de tu diseño con la alternativa"><table className="tabla comparacion">
            <thead>
              <tr>
                <th scope="col">Criterio</th>
                <th scope="col">Tu diseño</th>
                <th scope="col">La alternativa</th>
                <th scope="col">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Costo referencial · {moneda}</th>
                <td className="cifra">{cifra(partida.costo, 0)}</td>
                <td className="cifra">{cifra(alternativa!.valor.costo, 0)}</td>
                <td className="cifra">{conSigno(alternativa!.diferencia.costoPct, 1)} %</td>
              </tr>
              <tr>
                <th scope="row">Uniformidad del sector más desparejo · %</th>
                <td className="cifra">{conDecimales(partida.uniformidad, 1)}</td>
                <td className="cifra">{conDecimales(alternativa!.valor.uniformidad, 1)}</td>
                <td className="cifra">{conSigno(alternativa!.diferencia.uniformidad, 1)} puntos</td>
              </tr>
              <tr>
                <th scope="row">Margen de presión · m</th>
                <td className="cifra">{conDecimales(partida.margenM, 1)}</td>
                <td className="cifra">{conDecimales(alternativa!.valor.margenM, 1)}</td>
                <td className="cifra">{conSigno(alternativa!.diferencia.margenM, 1)} m</td>
              </tr>
            </tbody>
          </table></Desplazable>
          {d.presupuesto?.provisional && <p className="precios-provisionales">Los costos usan precios provisionales: el orden entre alternativas puede cambiar con los precios reales.</p>}

          <div className="vistas-con-controles">
          <div className="controles-de-la-vista">
          <div className="modos-de-la-red" role="group" aria-label="Poner a funcionar los dos diseños">
            {d.sectores.map((s) => (
              <button key={s} aria-pressed={modo === 'regando' && s === sector} onClick={() => soltarElAgua(s)}>
                Abrir sector {s.slice(1)}
              </button>
            ))}
            <button aria-pressed={modo === 'cerrado'} onClick={cerrarValvulas}>
              Cerrar las válvulas
            </button>
          </div>
          </div>
          <div className="vistas">
          <TituloDeVista
            titulo="Tu red frente a la alternativa del modelo"
            queMuestra="Las dos redes en planta, regando el mismo sector. Compara el color de los tramos, que es su presión: mientras más parejo, más uniforme riega."
          />
          <div className="lado-a-lado">
            <figure>
              <figcaption className="rotulo">Tu diseño ({conDecimales(turnoPropio.uniformidad * 100, 1)} % en este sector)</figcaption>
              <RedEnPlanta
                red={d.red}
                conLeyenda={false}
                resultado={turnoPropio.resultado}
                contorno={d.contornoLocal}
                presionNominalEmisorM={d.presionNominalEmisorM}
                tramoSeleccionado={elegido}
                alSeleccionarTramo={setElegido}
                presionesCerradas={cerradoPropio}
                aguaEnElTramo={aguaPropia}
              />
            </figure>
            {alternativa && turnoDeLaAlternativa && (
              <figure>
                <figcaption className="rotulo">La alternativa ({conDecimales(turnoDeLaAlternativa.uniformidad * 100, 1)} % en este sector)</figcaption>
                <RedEnPlanta
                  red={alternativa.red}
                  conLeyenda={false}
                  resultado={turnoDeLaAlternativa.resultado}
                  contorno={d.contornoLocal}
                  presionNominalEmisorM={d.presionNominalEmisorM}
                  tramoSeleccionado={elegido}
                  alSeleccionarTramo={setElegido}
                  presionesCerradas={cerradoDeLaAlternativa}
                  aguaEnElTramo={aguaDeLaAlternativa}
                />
              </figure>
            )}
          </div>
          </div>
          </div>

          <section aria-label="Qué cambió">
            <h3 className="rotulo">Qué cambió, tramo por tramo</h3>
            <Desplazable nombre="Qué cambió, tramo por tramo" alto>
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Tramos</th>
                    <th scope="col">Diámetro interno · mm</th>
                    <th scope="col">Clase</th>
                  </tr>
                </thead>
                <tbody>
                  {agrupados.map((g) => (
                    <tr key={g.tramos[0]} className="elegible" onClick={() => setElegido(g.tramos[0])}>
                      <th scope="row">
                        {g.tramos.slice(0, TRAMOS_A_MOSTRAR).join(', ')}
                        {g.tramos.length > TRAMOS_A_MOSTRAR && <span className="nota"> y {g.tramos.length - TRAMOS_A_MOSTRAR} más</span>}
                      </th>
                      <td className="cifra">{g.antes.diametroInternoMm === g.ahora.diametroInternoMm ? conDecimales(g.ahora.diametroInternoMm, 1) : `${conDecimales(g.antes.diametroInternoMm, 1)} → ${conDecimales(g.ahora.diametroInternoMm, 1)}`}</td>
                      <td className="cifra">{g.antes.clase === g.ahora.clase ? g.ahora.clase : `${g.antes.clase} → ${g.ahora.clase}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Desplazable>
          </section>
        </>
      )}

      <section className="cierre" aria-label="Tu decisión">
        <fieldset className="peso">
          <legend>¿Qué pesó más en tu decisión?</legend>
          {PESOS.map((o) => (
            <label key={o.valor} className="alternativa">
              <input type="radio" name="peso" value={o.valor} checked={peso === o.valor} onChange={() => setPeso(o.valor)} />
              {o.texto}
            </label>
          ))}
        </fieldset>
        {decidir.error && <p className="error" role="alert">{decidir.error.message}</p>}
        {peso === null && !decidido && <p className="nota razon">Marca qué pesó más en tu decisión para poder elegir.</p>}
        <div className="acciones">
          <button disabled={decidir.isPending || peso === null} onClick={quedarmeConElMio}>
            Quedarme con mi diseño
          </button>
          {alternativa && (
            <button className="primario" disabled={decidir.isPending || peso === null} onClick={quedarmeConLaAlternativa}>
              Quedarme con esta alternativa
            </button>
          )}
        </div>
        {decidido && (
          <>
            <p>
              <strong>Paso 7 completo.</strong> Tu proyecto sigue con {nombreDelDiseno}, versión {p!.red!.version}.
            </p>
            <div className="acciones">
              <button className="primario" onClick={() => alIrAlPaso(8)}>
                Siguiente paso: descargar el informe
              </button>
            </div>
          </>
        )}
      </section>

      {d.presupuesto && (
        <details>
          <summary>Ver el presupuesto de tu diseño</summary>
          <TablaDePresupuesto presupuesto={d.presupuesto} />
        </details>
      )}
    </div>
  )
}
