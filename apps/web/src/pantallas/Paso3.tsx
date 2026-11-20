import { TituloDeVista } from '../componentes/Figura.tsx'
import type { AjusteDelBalance } from '@riego/calculo'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/cliente.ts'
import { useAlGuardarElPaso, useDatosDelLugar, useProyectoDelPaso } from '../api/consultas.ts'
import type { AvanceDeLaCampana } from '../api/tipos.ts'
import { comparacionDelAjuste, nombreDelAjuste, opcionesDelBalance, resultadoDelAjuste, veredictoDelBalance, type SalidaDelBalance } from '../balance.ts'
import { calcular } from '../calculo/puente.ts'
import { CurvaSemanal } from '../componentes/CurvaSemanal.tsx'
import { Desplazable } from '../componentes/Desplazable.tsx'
import type { AguaDeLaCampana } from '../calculo/campana.ts'
import { cifra, conDecimales } from '../formato.ts'
import { Prediccion } from '../componentes/Prediccion.tsx'
import { lugarDelCultivo } from '../lugar-del-cultivo.ts'
import { POR_EL_METODO } from '../metodo.ts'
import type { PropsDelPaso } from '../pasos.ts'
import { PREDICCION_DEL_AJUSTE, preguntaDelAjuste, textoDeLaRespuesta } from '../predicciones.ts'
import { useRegistrar } from '../registro/contexto.ts'
import { EstadoDeError } from '../componentes/EstadoDeError.tsx'

// Paso 3, comprobar el agua (HU0013 y HU0014). La curva de lo que pide el cultivo cada semana contra lo que da la
// fuente, con la semana de mayor demanda marcada (CE8). Si no alcanza, tres salidas: turnos, reservorio o menos área;
// antes de aplicar una, la app pregunta qué espera el estudiante. Si ninguna sirve, se vuelve al paso 2. Con un
// manantial, el estudiante elige cuántos turnos riega, aunque el agua ya alcance: los turnos del paso 4 son enteros y,
// con el agua al filo, pueden pedir un poco más de horas.

type Seleccion = SalidaDelBalance | 'cultivo'

export function Paso3({ proyectoId, alPerderlo, alIrAlPaso }: PropsDelPaso) {
  const registrar = useRegistrar()
  const alGuardar = useAlGuardarElPaso(proyectoId)
  const proyecto = useProyectoDelPaso(3, proyectoId, alPerderlo)
  const datos = useDatosDelLugar(proyecto.data)
  const lugar = proyecto.data && datos.data ? lugarDelCultivo(proyecto.data, datos.data) : null
  const campania = proyecto.data?.campania
  const fuente = proyecto.data?.fuente
  const areaHa = proyecto.data?.parcela?.areaHa
  const planteamiento =
    lugar && campania && fuente && areaHa !== undefined
      ? {
          cultivo: campania.cultivo,
          fechaSiembra: campania.fechaSiembra,
          lugar,
          fuente: { tipo: fuente.tipo, caudalLps: fuente.caudalLps, horasDisponiblesDia: fuente.horasDisponiblesDia, conductividadDsM: fuente.conductividadDsM },
          areaHa,
        }
      : null

  // El ajuste aplicado a la curva: el que el estudiante aplica aquí o, si todavía no aplicó ninguno, el guardado.
  const guardado = proyecto.data?.decisionBalance?.parametros.ajuste ?? null
  const [aplicado, setAplicado] = useState<AjusteDelBalance | null | undefined>(undefined)
  const ajuste = aplicado === undefined ? guardado : aplicado
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null)
  const [turnosElegidos, setTurnosElegidos] = useState<number | undefined>(undefined)
  const [preguntando, setPreguntando] = useState<AjusteDelBalance | null>(null)
  // Lo que el estudiante dijo antes de aplicar cada salida: se pregunta una vez por salida.
  const [predicciones, setPredicciones] = useState<Partial<Record<SalidaDelBalance, string>>>({})

  const sinAjuste = useQuery({
    queryKey: ['agua', planteamiento],
    queryFn: () => calcular('aguaDeLaCampana', planteamiento!),
    enabled: planteamiento !== null,
  })
  const conAjuste = useQuery({
    queryKey: ['agua', planteamiento, ajuste],
    queryFn: () => calcular('aguaDeLaCampana', { ...planteamiento!, ajuste: ajuste! }),
    enabled: planteamiento !== null && ajuste !== null,
    placeholderData: keepPreviousData,
  })

  const guardar = useMutation({
    mutationFn: (a: AjusteDelBalance | null) => api<AvanceDeLaCampana>(`/proyectos/${proyectoId}/balance`, { metodo: 'PUT', cuerpo: { ajuste: a } }),
    onSuccess: (avance, a) => {
      alGuardar(avance)
      registrar({ paso: 3, accion: 'balanceGuardado', detalle: { ajuste: a?.tipo ?? null }, proyectoId })
      alIrAlPaso(4)
    },
  })

  if (proyecto.isPending || (proyecto.data?.parcela && datos.isPending)) return <p className="cargando" role="status">Abriendo el paso…</p>
  if (proyecto.error) return <EstadoDeError error={proyecto.error} alReintentar={() => void proyecto.refetch()} alVolver={alPerderlo} />
  if (datos.error) return <EstadoDeError error={datos.error} alReintentar={() => void datos.refetch()} alVolver={alPerderlo} />
  if (!planteamiento) {
    return (
      <div className="paso">
        <p className="alerta">Para comprobar el agua hace falta el cultivo con su fecha de siembra. Vuelve al paso 2.</p>
        <div className="acciones izquierda">
          <button onClick={() => alIrAlPaso(2)}>Volver al paso 2</button>
        </div>
      </div>
    )
  }
  if (sinAjuste.isPending) return <p className="cargando" role="status">Calculando lo que pide el cultivo…</p>
  if (sinAjuste.error) return <EstadoDeError error={sinAjuste.error} alReintentar={() => void sinAjuste.refetch()} alVolver={alPerderlo} />

  const base = sinAjuste.data
  const mostrado = ajuste && conAjuste.data ? conAjuste.data : base
  const veredicto = veredictoDelBalance(mostrado.balance, { semana: mostrado.semanaDeMayorConsumo, lps: mostrado.balance.necesidadPicoLps })
  const hayQueAjustar = base.balance.alcanza !== 'si'
  const turnosDelAjuste = ajuste?.tipo === 'turnos' ? ajuste.turnos : undefined
  // Si el agua ya alcanza, un turno es como no ajustar nada: más horas empiezan en dos.
  const turnosPedidos = turnosElegidos ?? turnosDelAjuste ?? (hayQueAjustar ? undefined : 2)
  const todas = opcionesDelBalance(base.balance, planteamiento.fuente.horasDisponiblesDia, planteamiento.areaHa, turnosPedidos)
  const rangoDeTurnos = todas[0]?.rangoDeTurnos
  const masHoras = !hayQueAjustar && rangoDeTurnos !== undefined && rangoDeTurnos.maximo >= 2
  const opciones = hayQueAjustar ? todas : masHoras ? todas.filter((o) => o.tipo === 'turnos') : []
  const ningunaSirve = base.balance.alcanza === 'no'
  const listo = mostrado.balance.alcanza === 'si'
  const elegida = seleccion ?? (ajuste?.tipo as Seleccion | undefined) ?? (ningunaSirve ? 'cultivo' : null)
  const prediccionDelAplicado = ajuste ? predicciones[ajuste.tipo] : undefined

  function aplicar(a: AjusteDelBalance) {
    setAplicado(a)
    registrar({ paso: 3, accion: 'ajusteAplicado', detalle: { ajuste: a }, proyectoId })
  }

  function recalcular() {
    if (elegida === 'cultivo') {
      registrar({ paso: 3, accion: 'cultivoReconsiderado', detalle: { cultivo: planteamiento!.cultivo }, proyectoId })
      alIrAlPaso(2)
      return
    }
    const opcion = opciones.find((o) => o.tipo === elegida)
    if (!opcion?.ajuste) return
    // Si el agua ya alcanzaba, no hay semanas que predecir: solo se suman horas.
    if (predicciones[opcion.tipo] === undefined && hayQueAjustar) setPreguntando(opcion.ajuste)
    else aplicar(opcion.ajuste)
  }

  function cambiarTurnos(n: number) {
    if (!rangoDeTurnos || !Number.isInteger(n)) return
    const turnos = Math.min(rangoDeTurnos.maximo, Math.max(hayQueAjustar ? rangoDeTurnos.minimo : 2, n))
    setTurnosElegidos(turnos)
    // Con los turnos ya aplicados, la curva sigue al número sin volver a preguntar.
    if (ajuste?.tipo === 'turnos') aplicar({ tipo: 'turnos', turnos })
  }

  return (
    <div className="paso">
      <div className="titulo-del-paso">
        <h2>
          <span className="rotulo">Paso 3</span> Comprobar el agua
        </h2>
        <span className="rotulo">
          {proyecto.data.nombre} · {planteamiento.cultivo.toLowerCase()}
        </span>
      </div>

      <div className="paso-con-panel">
        <section className="lienzo">
          <TituloDeVista
            titulo="Consumo del cultivo, semana a semana"
            queMuestra="Litros por segundo que pide cada semana de la campaña, con el clima del lugar y el Kc de cada etapa (FAO 56), frente al caudal de tu fuente."
          />
          <p className="nota">
            Cada barra es todo lo que el cultivo consume esa semana. La lluvia de un año normal pone la parte celeste y el riego, la gris.
            Pero la lluvia no cae pareja: en una racha seca hay que regar la barra entera. Por eso el riego se diseña con la barra más
            alta, y tu fuente tiene que darla.
          </p>
          <CurvaSemanal
            semanas={mostrado.semanas}
            caudalLps={mostrado.balance.caudalLps}
            semanaCritica={mostrado.balance.semanaCritica}
            semanaDeMayorConsumo={mostrado.semanaDeMayorConsumo}
            techoLps={Math.max(base.balance.necesidadPicoLps, ...base.semanas.map((s) => Math.max(s.consumoLps, s.necesidadLps)))}
          />
          <ComoSeCalcula agua={mostrado} metodo={POR_EL_METODO[base.metodo]} />
          <p className="nota">
            Todo está en litros por segundo, repartido en las {cifra(mostrado.balance.horasDeRiegoPorDia, 1)} h de riego del día, para
            compararlo con el caudal de estiaje que escribiste en el paso 1: si lo mediste en época de lluvias, en los meses secos la
            fuente dará menos.{' '}
            {base.lavado &&
              `Como tu agua trae sales, además se riega de más para lavarlas de la raíz: el ${conDecimales(base.lavado.requerimiento * 100, 0)} % del agua aplicada tiene que pasar de largo (FAO 29). `}
            En el paso 4 se vuelve a comprobar con el método que elijas.
          </p>
        </section>

        <aside className="panel panel-fijo">
          <div className={`veredicto ${mostrado.balance.alcanza}`} role="status">
            {ajuste && <p className="rotulo">{nombreDelAjuste(ajuste)}</p>}
            <h3>{veredicto.titulo}</h3>
            <p>{veredicto.texto}</p>
            {ajuste && !preguntando && (
              <button className="enlace" onClick={() => setAplicado(null)}>
                Quitar el ajuste y ver la curva como era
              </button>
            )}
          </div>
          {ajuste && prediccionDelAplicado && (
            <p className="aviso">
              {comparacionDelAjuste(base.balance.semanasSinCubrir.length, mostrado.balance.semanasSinCubrir.length)}:{' '}
              {textoDeLaRespuesta(PREDICCION_DEL_AJUSTE, resultadoDelAjuste(base.balance.semanasSinCubrir.length, mostrado.balance.semanasSinCubrir.length))}.
              Antes de verlo dijiste: «{textoDeLaRespuesta(PREDICCION_DEL_AJUSTE, prediccionDelAplicado)}».
            </p>
          )}

          {(hayQueAjustar || masHoras) && !preguntando && (
            <fieldset className="salidas">
              <legend>
                <h3 className="rotulo">{hayQueAjustar ? '¿Cómo lo resuelves?' : '¿Quieres regar más horas?'}</h3>
              </legend>
              {masHoras && (
                <p className="nota">
                  El agua ya alcanza. Si en el paso 4 los turnos no caben en tus horas de riego, vuelve aquí y riega en más turnos de tu fuente.
                </p>
              )}
              {opciones.map((o) => (
                <label key={o.tipo} className={o.ajuste ? 'salida' : 'salida no-viable'}>
                  <input
                    type="radio"
                    name="salida"
                    value={o.tipo}
                    disabled={!o.ajuste}
                    checked={elegida === o.tipo}
                    onChange={() => setSeleccion(o.tipo)}
                  />
                  <span>
                    <strong>{o.titulo}</strong>
                    <span className="detalle">{o.detalle}</span>
                    {o.ajuste?.tipo === 'turnos' && o.rangoDeTurnos && o.rangoDeTurnos.maximo > o.rangoDeTurnos.minimo && (
                      <span className="cuantos-turnos">
                        <input
                          type="number"
                          aria-label="Cuántos turnos"
                          min={hayQueAjustar ? o.rangoDeTurnos.minimo : 2}
                          max={o.rangoDeTurnos.maximo}
                          step={1}
                          value={o.ajuste.turnos}
                          onChange={(e) => cambiarTurnos(e.target.valueAsNumber)}
                        />
                        <span className="detalle">
                          turnos, {hayQueAjustar ? `desde ${o.rangoDeTurnos.minimo}, lo justo, ` : ''}hasta {o.rangoDeTurnos.maximo}, que llenan el día
                        </span>
                      </span>
                    )}
                  </span>
                </label>
              ))}
              {hayQueAjustar && (
                <label className="salida">
                  <input type="radio" name="salida" value="cultivo" checked={elegida === 'cultivo'} onChange={() => setSeleccion('cultivo')} />
                  <span>
                    <strong>Volver a elegir el cultivo</strong>
                    <span className="detalle">Uno que pida menos agua, u otra fecha de siembra.</span>
                  </span>
                </label>
              )}
            </fieldset>
          )}

          {preguntando && (
            <Prediccion
              pregunta="efectoDelAjuste"
              enunciado={preguntaDelAjuste(preguntando, base.balance.semanasSinCubrir.length)}
              opciones={PREDICCION_DEL_AJUSTE}
              paso={3}
              proyectoId={proyectoId}
              detalle={{ ajuste: preguntando, semanasSinCubrir: base.balance.semanasSinCubrir.length }}
              alResponder={(respuesta) => {
                setPredicciones((anteriores) => ({ ...anteriores, [preguntando.tipo]: respuesta }))
                aplicar(preguntando)
                setPreguntando(null)
              }}
              alCancelar={() => setPreguntando(null)}
            />
          )}

          {guardar.error && <p className="error" role="alert">{guardar.error.message}</p>}
          {!preguntando && (hayQueAjustar || masHoras) && (!ajuste || elegida !== ajuste.tipo) && !elegida && (
            <p className="nota razon">Marca una de las opciones para recalcular la curva.</p>
          )}
          {!preguntando && !listo && <p className="nota razon">Para definir cómo regar, el agua tiene que alcanzar: elige una salida y recalcula.</p>}
          {!preguntando && (
            <div className="acciones">
              {(hayQueAjustar || masHoras) && (!ajuste || elegida !== ajuste.tipo) && (
                <button disabled={!elegida || (elegida !== 'cultivo' && elegida === ajuste?.tipo)} onClick={recalcular}>
                  {elegida === 'cultivo' ? 'Volver al paso 2' : 'Recalcular la curva'}
                </button>
              )}
              <button className="primario" disabled={!listo || guardar.isPending} onClick={() => guardar.mutate(ajuste)}>
                {guardar.isPending ? 'Guardando…' : 'Definir cómo regar'}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

/**
 * Cómo se llega del consumo del cultivo a los litros por segundo que se comparan con la fuente, en las dos semanas que
 * importan: la que más riego pide con la lluvia de un año normal y la que más consume si no llueve.
 */
function ComoSeCalcula({ agua, metodo }: { agua: AguaDeLaCampana; metodo: string }) {
  const b = agua.balance
  const normal = agua.semanas.find((s) => s.semana === b.semanaCritica)
  const seco = agua.semanas.find((s) => s.semana === agua.semanaDeMayorConsumo)
  if (!normal || !seco) return null
  const mm = (v: number) => `${conDecimales(v, 1)} mm/día`
  const caudal = (v: number) => `${conDecimales(v, 2)} l/s`
  const veredicto = (necesidad: number, cubre: boolean) =>
    necesidad <= b.caudalLps * (1 + 1e-9) ? '✓ alcanza' : cubre ? '✓ con lo que pone el ajuste' : '✕ no alcanza'
  const secoCubre = b.capacidadAlcanza
  const filas: [string, string, string][] = [
    ['El cultivo consume (ETc)', mm(normal.etcMmDia), mm(seco.etcMmDia)],
    ['La lluvia pone', mm(normal.lluviaMmDia), 'nada'],
    ['Queda por regar', mm(normal.netaMmDia), mm(seco.etcMmDia)],
    [`Con lo que se pierde al regar por ${metodo} (se aprovecha el ${conDecimales(agua.eficiencia * 100, 0)} %)`, mm(normal.netaMmDia / agua.eficiencia), mm(seco.etcMmDia / agua.eficiencia)],
    [`En ${cifra(b.horasDeRiegoPorDia, 1)} h de riego al día, para ${conDecimales(b.areaHa, 2)} ha`, caudal(normal.necesidadLps), caudal(b.necesidadPicoLps)],
    ['Tu fuente da', caudal(b.caudalLps), caudal(b.caudalLps)],
    ['¿Alcanza?', veredicto(normal.necesidadLps, b.semanasSinCubrir.length === 0), veredicto(b.necesidadPicoLps, secoCubre)],
  ]
  return (
    <details className="como-se-calcula" open>
      <summary>Cómo se calcula</summary>
      <Desplazable nombre="Del consumo del cultivo a lo que se le pide a la fuente">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">Año normal · semana {normal.semana}</th>
              <th scope="col">Si no llueve · semana {seco.semana}</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(([nombre, a, c]) => (
              <tr key={nombre} className={nombre === '¿Alcanza?' ? 'destacada' : undefined}>
                <th scope="row">{nombre}</th>
                <td className="cifra">{a}</td>
                <td className="cifra">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Desplazable>
    </details>
  )
}

