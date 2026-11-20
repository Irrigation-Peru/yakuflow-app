import { CATALOGO_EMISORES, emisorDelCatalogo, emisorRecomendado, FRACCION_MINIMA_DE_AREA, type MetodoDeRiego } from '@riego/calculo'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/cliente.ts'
import { useAlGuardarElPaso, useDatosDelLugar, useProyectoDelPaso } from '../api/consultas.ts'
import type { AvanceDeLaCampana } from '../api/tipos.ts'
import type { EleccionDelRiego } from '../calculo/campana.ts'
import { calcular } from '../calculo/puente.ts'
import { AguaPorRiego } from '../componentes/AguaPorRiego.tsx'
import { CalendarioDeTurnos } from '../componentes/CalendarioDeTurnos.tsx'
import { CorteDelSuelo } from '../componentes/CorteDelSuelo.tsx'
import { Figura } from '../componentes/Figura.tsx'
import { Dato } from '../componentes/Dato.tsx'
import { cifra, conDecimales } from '../formato.ts'
import { lugarDelCultivo, sueloVigente } from '../lugar-del-cultivo.ts'
import { aspersoresQueNoEscurren, EL_METODO, lecturaDelCorte, lecturaDelProblema, NOMBRE_DEL_METODO, porQueElMetodo, porQueLosTurnos, sinMetodoQueSirva } from '../metodo.ts'
import type { PropsDelPaso } from '../pasos.ts'
import { useRegistrar } from '../registro/contexto.ts'
import { Campo } from './Entrar.tsx'
import { EstadoDeError } from '../componentes/EstadoDeError.tsx'

// Paso 4, definir cómo regar (HU0015 y HU0016). La app recomienda el método por el cultivo, el suelo y la carga
// disponible, y dice por qué el otro no. Con el emisor y las separaciones salen la lámina, la frecuencia, el tiempo y
// los turnos; el corte del suelo muestra adónde llega el agua y se actualiza al cambiar el emisor o el tiempo. El
// estudiante puede probar el método que no es viable para ver qué pasa (C3), pero no guardarlo.

const METODOS: readonly MetodoDeRiego[] = ['goteo', 'aspersion']

const conEmisor = (metodo: MetodoDeRiego, codigo?: string, pendienteMediaPct?: number): EleccionDelRiego => {
  const emisor = codigo ? emisorDelCatalogo(codigo) : emisorRecomendado(metodo, pendienteMediaPct)
  return { metodo, emisor: emisor.codigo, separacionM: emisor.separacionM, separacionLateralesM: emisor.separacionLateralesM }
}

export function Paso4({ proyectoId, alPerderlo, alIrAlPaso }: PropsDelPaso) {
  const registrar = useRegistrar()
  const alGuardar = useAlGuardarElPaso(proyectoId)
  const proyecto = useProyectoDelPaso(4, proyectoId, alPerderlo)
  const datos = useDatosDelLugar(proyecto.data)
  const lugar = proyecto.data && datos.data ? lugarDelCultivo(proyecto.data, datos.data) : null
  const suelo = datos.data ? sueloVigente(datos.data) : null
  const p = proyecto.data
  const planteamiento =
    lugar && suelo && p?.campania && p.fuente && p.parcela && p.cargaDisponibleM !== null
      ? {
          cultivo: p.campania.cultivo,
          fechaSiembra: p.campania.fechaSiembra,
          lugar,
          suelo: {
            clase: suelo.clase,
            capacidadDeCampo: suelo.capacidadDeCampo,
            puntoDeMarchitez: suelo.puntoDeMarchitez,
            infiltracionBasicaMmH: suelo.infiltracionBasicaMmH,
          },
          cargaDisponibleM: p.cargaDisponibleM,
          fuente: { tipo: p.fuente.tipo, caudalLps: p.fuente.caudalLps, horasDisponiblesDia: p.fuente.horasDisponiblesDia, conductividadDsM: p.fuente.conductividadDsM },
          areaHa: p.parcela.areaHa,
          ajuste: p.decisionBalance?.parametros.ajuste ?? undefined,
        }
      : null

  const metodos = useQuery({
    queryKey: ['riego', planteamiento],
    queryFn: () => calcular('riegoDeLaCampana', { ...planteamiento!, eleccion: null }),
    enabled: planteamiento !== null,
  })

  // Lo que el estudiante elige aquí o, si todavía no tocó nada, lo guardado; si no hay nada guardado, el método
  // recomendado con su primer emisor.
  const guardado = p?.disenoAgronomico
  const [propia, setPropia] = useState<EleccionDelRiego | null>(null)
  const recomendado = metodos.data?.metodos.recomendado ?? 'goteo'
  const eleccion: EleccionDelRiego | null =
    propia ??
    (guardado
      ? {
          metodo: guardado.metodo,
          emisor: guardado.emisor,
          separacionM: guardado.separacionM,
          separacionLateralesM: guardado.separacionLateralesM,
          intervaloDias: guardado.intervaloDias,
        }
      : metodos.data
        ? conEmisor(recomendado, undefined, p?.parcela?.pendienteMediaPct)
        : null)
  const [tiempoDelCorteH, setTiempoDelCorteH] = useState<number | null>(null)
  const valida = eleccion !== null && eleccion.separacionM > 0 && eleccion.separacionLateralesM > 0

  const riego = useQuery({
    queryKey: ['riego', planteamiento, eleccion, tiempoDelCorteH],
    queryFn: () => calcular('riegoDeLaCampana', { ...planteamiento!, eleccion: { ...eleccion!, tiempoDelCorteH: tiempoDelCorteH ?? undefined } }),
    enabled: planteamiento !== null && valida,
    placeholderData: keepPreviousData,
  })

  const guardar = useMutation({
    mutationFn: (e: EleccionDelRiego) =>
      api<AvanceDeLaCampana>(`/proyectos/${proyectoId}/diseno-agronomico`, {
        metodo: 'PUT',
        cuerpo: { metodo: e.metodo, emisor: e.emisor, separacionM: e.separacionM, separacionLateralesM: e.separacionLateralesM, intervaloDias: e.intervaloDias },
      }),
    onSuccess: (avance, e) => {
      alGuardar(avance)
      setPropia(null)
      registrar({ paso: 4, accion: 'disenoAgronomicoGuardado', detalle: { ...e }, proyectoId })
    },
  })

  // Si los turnos no caben por un turno entero, el remedio se aplica como la salida del paso 3, sin salir de aquí.
  const aplicarRemedio = useMutation({
    mutationFn: (ajuste: NonNullable<typeof remedio>['ajuste']) =>
      api<AvanceDeLaCampana>(`/proyectos/${proyectoId}/balance`, { metodo: 'PUT', cuerpo: { ajuste } }),
    onSuccess: (avance, ajuste) => {
      alGuardar(avance)
      registrar({ paso: 4, accion: 'salidaAjustadaParaLosTurnos', detalle: { ...ajuste }, proyectoId })
    },
  })

  if (proyecto.isPending || (proyecto.data?.parcela && datos.isPending)) return <p className="cargando" role="status">Abriendo el paso…</p>
  if (proyecto.error) return <EstadoDeError error={proyecto.error} alReintentar={() => void proyecto.refetch()} alVolver={alPerderlo} />
  if (datos.error) return <EstadoDeError error={datos.error} alReintentar={() => void datos.refetch()} alVolver={alPerderlo} />
  if (!planteamiento) {
    return (
      <div className="paso">
        <p className="alerta">Para definir cómo regar hacen falta el cultivo y la comprobación del agua. Vuelve al paso 3.</p>
        <div className="acciones izquierda">
          <button onClick={() => alIrAlPaso(3)}>Volver al paso 3</button>
        </div>
      </div>
    )
  }
  if (metodos.isPending || !eleccion) return <p className="cargando" role="status">Revisando qué método conviene…</p>
  if (metodos.error) return <EstadoDeError error={metodos.error} alReintentar={() => void metodos.refetch()} alVolver={alPerderlo} />

  const viabilidad = metodos.data.metodos.metodos
  const contexto = {
    cultivo: planteamiento.cultivo,
    claseDelSuelo: planteamiento.suelo.clase,
    infiltracionMmH: planteamiento.suelo.infiltracionBasicaMmH,
    cargaDisponibleM: planteamiento.cargaDisponibleM,
  }
  const resultado = riego.data
  const diseno = resultado?.diseno ?? null
  // El remedio respeta la salida que el estudiante eligió en el paso 3: más reservorio, más turnos o menos área.
  const remedio = (() => {
    if (!diseno || !diseno.problemas.includes('turnos_no_caben') || !p?.parcela || !p.fuente) return null
    const actual = p.decisionBalance?.parametros.ajuste ?? null
    if (actual?.tipo === 'reservorio' && diseno.reservorioQueCabeM3 > 0) {
      const volumenM3 = Math.ceil(Math.max(actual.volumenM3, diseno.reservorioQueCabeM3))
      return { ajuste: { tipo: 'reservorio' as const, volumenM3 }, boton: `Un reservorio de ${cifra(volumenM3, 0)} m³`, porQue: `Con un reservorio de ${cifra(volumenM3, 0)} m³ caben los ${diseno.turnosMaximos} turnos.` }
    }
    if (actual?.tipo === 'turnos') {
      const turnos = Math.ceil(diseno.horasDeRiegoNecesariasPorDia / p.fuente.horasDisponiblesDia - 1e-9)
      if (turnos > actual.turnos && turnos * p.fuente.horasDisponiblesDia <= 24) {
        return { ajuste: { tipo: 'turnos' as const, turnos }, boton: `Regar en ${turnos} turnos`, porQue: `Con ${turnos} turnos de ${cifra(p.fuente.horasDisponiblesDia, 1)} h al día caben todos.` }
      }
    }
    if (!actual || actual.tipo === 'menos_area') {
      // Hacia abajo, a la centésima: lo que se ofrece tiene que caber.
      const areaHa = Math.floor(diseno.areaQueCabeHa * 100) / 100
      if (areaHa > 0 && areaHa >= FRACCION_MINIMA_DE_AREA * p.parcela.areaHa) {
        return { ajuste: { tipo: 'menos_area' as const, areaHa }, boton: `Regar ${conDecimales(areaHa, 2)} ha`, porQue: `Con ${conDecimales(areaHa, 2)} ha caben ${diseno.turnosMaximos} turnos.` }
      }
    }
    return null
  })()
  const balance = resultado?.balance ?? null
  const viable = viabilidad[eleccion.metodo].viable
  const ningunoSirve = metodos.data.metodos.recomendado === null ? sinMetodoQueSirva(viabilidad, contexto) : null
  const sinAgua = balance !== null && balance.alcanza !== 'si'
  const emisores = CATALOGO_EMISORES.filter((e) => e.metodo === eleccion.metodo)
  const alternativas = diseno?.problemas.includes('escurre') ? aspersoresQueNoEscurren(planteamiento.suelo.infiltracionBasicaMmH) : []
  const sePuedeGuardar = viable && valida && diseno !== null && diseno.problemas.length === 0 && !sinAgua && !riego.isPlaceholderData
  // El paso queda cerrado cuando lo que se ve es lo guardado y nada de antes lo dejó por revisar.
  const cerrado = Boolean(guardado) && propia === null && p!.pasoAlcanzado >= 5 && !p!.resultadosDesactualizados.includes(4)

  function cambiar(nueva: EleccionDelRiego, accion: string) {
    setPropia(nueva)
    setTiempoDelCorteH(null)
    registrar({ paso: 4, accion, detalle: { ...nueva }, proyectoId })
  }

  return (
    <div className="paso">
      <div className="titulo-del-paso">
        <h2>
          <span className="rotulo">Paso 4</span> Definir cómo regar
        </h2>
        <span className="rotulo">
          {p!.nombre} · {planteamiento.cultivo.toLowerCase()}
        </span>
      </div>

      <div className="paso-con-panel">
        <section className="lienzo">
          {diseno ? (
            <Figura
              className="corte"
              titulo={eleccion.metodo === 'goteo' ? 'Corte del suelo bajo los goteros' : 'Corte del suelo bajo el aspersor'}
              queMuestra={
                eleccion.metodo === 'goteo'
                  ? 'El suelo visto de través a tres laterales, a escala, al terminar un riego. Cambia el emisor, las separaciones o las horas, más abajo, y mira cómo cambia.'
                  : 'El suelo bajo el aspersor al terminar un riego. Cambia el aspersor o las horas, más abajo, y mira cómo cambia.'
              }
              lectura={lecturaDelCorte(diseno.corte, diseno.profundidadRadicularM, eleccion.separacionM, eleccion.separacionLateralesM)}
            >
              <CorteDelSuelo
                corte={diseno.corte}
                profundidadRadicularM={diseno.profundidadRadicularM}
                separacionM={eleccion.separacionM}
                separacionLateralesM={eleccion.separacionLateralesM}
                cultivo={planteamiento.cultivo}
              />
              <ul className="leyenda-de-la-curva" aria-label="Leyenda del corte">
                <li>
                  <span className="muestra" style={{ background: 'rgb(118, 133, 164)' }} /> suelo que moja el riego
                </li>
                <li>
                  <span className="muestra" style={{ background: 'rgba(96, 62, 30, 0.75)', height: '0.2rem' }} /> raíces, hasta la línea verde: la parte que no toca el azul no recibe agua
                </li>
                {eleccion.metodo === 'goteo' && (
                  <li>
                    <span className="muestra" style={{ background: '#111827', borderRadius: '50%' }} /> la manguera de goteo, vista de frente, junto a cada hilera
                  </li>
                )}
              </ul>
            </Figura>
          ) : riego.error ? (
            <p className="error" role="alert">{riego.error.message}</p>
          ) : resultado && !diseno ? (
            <p className="aviso">En esta campaña la lluvia cubre toda la demanda: no hay riego que diseñar.</p>
          ) : (
            <p className="cargando" role="status">Calculando el corte…</p>
          )}

          <div className="campos tres">
            <Campo etiqueta="Emisor">
              <select value={eleccion.emisor} onChange={(e) => cambiar({ ...conEmisor(eleccion.metodo, e.target.value), intervaloDias: eleccion.intervaloDias }, 'emisorCambiado')}>
                {emisores.map((e) => (
                  <option key={e.codigo} value={e.codigo}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta={eleccion.metodo === 'goteo' ? 'Separación entre goteros · m' : 'Separación entre aspersores · m'} error={eleccion.separacionM > 0 ? undefined : 'Tiene que ser mayor que cero'}>
              <input
                type="number"
                step={eleccion.metodo === 'goteo' ? 0.05 : 0.5}
                min="0"
                inputMode="decimal"
                value={Number.isFinite(eleccion.separacionM) ? eleccion.separacionM : ''}
                onChange={(e) => cambiar({ ...eleccion, separacionM: e.target.valueAsNumber }, 'separacionCambiada')}
              />
            </Campo>
            <Campo etiqueta="Separación entre laterales · m" error={eleccion.separacionLateralesM > 0 ? undefined : 'Tiene que ser mayor que cero'}>
              <input
                type="number"
                step={eleccion.metodo === 'goteo' ? 0.05 : 0.5}
                min="0"
                inputMode="decimal"
                value={Number.isFinite(eleccion.separacionLateralesM) ? eleccion.separacionLateralesM : ''}
                onChange={(e) => cambiar({ ...eleccion, separacionLateralesM: e.target.valueAsNumber }, 'separacionCambiada')}
              />
            </Campo>
          </div>
          {diseno && (
            <div className="campos dos">
              <Campo etiqueta="Regar cada · días">
                <select
                  value={eleccion.intervaloDias ?? ''}
                  onChange={(e) => cambiar({ ...eleccion, intervaloDias: e.target.value ? Number(e.target.value) : undefined }, 'intervaloCambiado')}
                >
                  <option value="">
                    Lo recomendado: cada {diseno.intervaloPropuestoDias} {diseno.intervaloPropuestoDias === 1 ? 'día' : 'días'} (el suelo aguanta hasta{' '}
                    {diseno.intervaloMaximoDias})
                  </option>
                  {Array.from({ length: diseno.intervaloMaximoDias + 3 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d} {d === 1 ? 'día' : 'días'}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta={`Horas de riego en el corte · ${cifra(diseno.corte.tiempoH, 1)} h`}>
                <input
                  type="range"
                  min={0.25}
                  max={Math.max(1, Math.ceil(diseno.tiempoDeRiegoH * 2))}
                  step={0.25}
                  value={diseno.corte.tiempoH}
                  onChange={(e) => setTiempoDelCorteH(e.target.valueAsNumber)}
                  onPointerUp={() => registrar({ paso: 4, accion: 'tiempoDelCorteProbado', detalle: { tiempoH: tiempoDelCorteH }, proyectoId })}
                />
              </Campo>
            </div>
          )}
          {diseno && tiempoDelCorteH !== null && (
            <p className="nota">
              El diseño riega {cifra(diseno.tiempoDeRiegoH, 1)} h. Aquí pruebas otro tiempo solo para ver el corte: el diseño no cambia.{' '}
              <button className="enlace" onClick={() => setTiempoDelCorteH(null)}>
                Volver al tiempo del diseño
              </button>
            </p>
          )}

          {diseno && balance && diseno.turnos > 0 && (
            <div className="graficos-del-riego">
              <Figura
                titulo="Calendario de turnos de un ciclo"
                queMuestra={`Qué parte de la parcela se riega cada día, en los ${diseno.intervaloDias} ${diseno.intervaloDias === 1 ? 'día' : 'días'} entre un riego y el siguiente. Cada bloque azul es un turno de ${cifra(diseno.tiempoDeRiegoH, 1)} h.`}
              >
                <CalendarioDeTurnos
                  turnos={diseno.turnos}
                  intervaloDias={diseno.intervaloDias}
                  tiempoDeRiegoH={diseno.tiempoDeRiegoH}
                  horasDeAguaPorDia={balance.horasDeRiegoPorDia}
                />
              </Figura>
              <Figura
                titulo="Cuánta agua lleva cada riego"
                queMuestra="Lo que repone un riego frente a lo que el suelo guarda para la raíz, en milímetros de lámina sobre la parcela."
                lectura={
                  diseno.laminaNetaMm <= diseno.aguaFacilDelAreaMojadaMm
                    ? `Cada riego repone el ${conDecimales((diseno.laminaNetaMm / diseno.aguaFacilDelAreaMojadaMm) * 100, 0)} % de lo que el suelo guarda: la raíz no pasa apuros entre un riego y otro. Con este suelo se podría esperar hasta ${diseno.intervaloMaximoDias} ${diseno.intervaloMaximoDias === 1 ? 'día' : 'días'}.`
                    : 'Cada riego tendría que reponer más de lo que el suelo guarda: la raíz sufriría antes del siguiente riego. Riega más seguido.'
                }
              >
                <AguaPorRiego
                  laminaNetaMm={diseno.laminaNetaMm}
                  laminaBrutaMm={diseno.laminaBrutaMm}
                  aguaFacilMm={diseno.aguaFacilDelAreaMojadaMm}
                  areaMojadaPct={diseno.areaMojadaPct}
                />
              </Figura>
            </div>
          )}
        </section>

        <aside className="panel">
          <fieldset className="salidas metodos">
            <legend className="solo-lectores">Método de riego</legend>
            {[...METODOS]
              .sort((a, b) => Number(b === recomendado) - Number(a === recomendado))
              .map((m) => (
                <label key={m} className={viabilidad[m].viable ? 'salida' : 'salida no-viable'}>
                  <input
                    type="radio"
                    name="metodo"
                    value={m}
                    checked={eleccion.metodo === m}
                    onChange={() => cambiar({ ...conEmisor(m, undefined, p?.parcela?.pendienteMediaPct) }, 'metodoElegido')}
                  />
                  <span>
                    <strong>
                      {NOMBRE_DEL_METODO[m]}
                      {m === metodos.data.metodos.recomendado && <span className="rotulo"> · recomendado</span>}
                    </strong>
                    <span className="detalle">{porQueElMetodo(m, viabilidad[m], metodos.data.metodos.recomendado, contexto)}</span>
                  </span>
                </label>
              ))}
          </fieldset>
          {ningunoSirve ? (
            <>
              <p className="alerta">
                {ningunoSirve.texto} Mientras tanto puedes ver qué pasaría en el corte, pero no guardarlo.
              </p>
              <div className="acciones izquierda">
                <button onClick={() => alIrAlPaso(ningunoSirve.paso)}>Volver al paso {ningunoSirve.paso}</button>
              </div>
            </>
          ) : (
            !viable && (
              <p className="alerta">
                Estás probando un método que no es viable aquí: puedes ver qué pasaría en el corte, pero no guardarlo.
              </p>
            )
          )}

          <h3 className="rotulo">Así quedaría tu riego</h3>
          {diseno ? (
            <>
              <div className="grupo-de-datos">
                <h4>Cuándo y por cuánto tiempo</h4>
                <dl className="datos">
                  <Dato nombre="Frecuencia" ayuda="cada cuánto se riega" valor={`cada ${diseno.intervaloDias} ${diseno.intervaloDias === 1 ? 'día' : 'días'}`} />
                  <Dato nombre="Tiempo de riego" ayuda="lo que dura cada turno" valor={`${conDecimales(diseno.tiempoDeRiegoH, 1)} h`} />
                  <Dato nombre="Turnos" ayuda="en cuántas partes se riega la parcela" valor={diseno.turnos > 0 ? String(diseno.turnos) : 'no caben'} />
                  {diseno.caudalDeDisenoLps !== undefined && (
                    <Dato nombre="Caudal de un turno" ayuda="lo que lleva la red mientras riega un turno" valor={`${conDecimales(diseno.caudalDeDisenoLps, 2)} l/s`} />
                  )}
                </dl>
              </div>
              <div className="grupo-de-datos">
                <h4>Cuánta agua</h4>
                <dl className="datos">
                  <Dato nombre="Lámina neta" ayuda="lo que la raíz necesita recibir en cada riego" valor={`${conDecimales(diseno.laminaNetaMm, 1)} mm`} />
                  <Dato nombre="Lámina bruta" ayuda="lo que hay que aplicar, contando lo que se pierde" valor={`${conDecimales(diseno.laminaBrutaMm, 1)} mm`} />
                  <Dato nombre="Agua fácil del suelo" ayuda="la que la raíz saca sin esfuerzo, en todo el suelo" valor={`${conDecimales(diseno.aguaFacilmenteAprovechableMm, 1)} mm`} />
                </dl>
              </div>
              <div className="grupo-de-datos">
                <h4>El emisor frente al suelo</h4>
                <dl className="datos">
                  <Dato nombre="Precipitación del sistema" ayuda="qué tan rápido cae el agua" valor={`${conDecimales(diseno.intensidadMmH, 1)} mm/h`} />
                  <Dato nombre="Infiltración del suelo" ayuda="qué tan rápido la absorbe; tiene que ser mayor que la precipitación" valor={`${conDecimales(planteamiento.suelo.infiltracionBasicaMmH, 1)} mm/h`} />
                  <Dato nombre="Área mojada" ayuda="la parte del suelo que se moja" valor={`${conDecimales(diseno.areaMojadaPct, 0)} %`} />
                </dl>
              </div>
            </>
          ) : (
            <p className="nota">—</p>
          )}
          {diseno && balance && (
            <p className="nota">
              Todo está calculado para la semana de más demanda, sobre {conDecimales(balance.areaHa, 2)} ha, con{' '}
              {cifra(balance.horasDeRiegoPorDia, 1)} h de riego al día y {EL_METODO[eleccion.metodo].toLowerCase()}, que aprovecha el{' '}
              {conDecimales(diseno.eficiencia * 100, 0)} % del agua. {porQueLosTurnos(diseno, balance.caudalLps)}
            </p>
          )}

          {diseno?.problemas.map((problema) => (
            <p key={problema} className="alerta">
              {lecturaDelProblema(problema, diseno, balance?.horasDeRiegoPorDia ?? 0, planteamiento.suelo.clase, planteamiento.suelo.infiltracionBasicaMmH)}
            </p>
          ))}
          {alternativas.length > 0 && (
            <div className="acciones izquierda">
              {alternativas.slice(0, 2).map((a) => (
                <button key={a.codigo} onClick={() => cambiar(conEmisor('aspersion', a.codigo), 'emisorCambiado')}>
                  Probar {a.nombre.toLowerCase()} (echa {cifra(a.intensidadMmH, 1)} mm por hora)
                </button>
              ))}
            </div>
          )}
          {diseno?.problemas.includes('escurre') && viabilidad.goteo.viable && (
            <div className="acciones izquierda">
              <button onClick={() => cambiar(conEmisor('goteo', undefined, p?.parcela?.pendienteMediaPct), 'metodoElegido')}>Volver al goteo</button>
            </div>
          )}
          {diseno?.problemas.includes('turnos_no_caben') && !sinAgua && !ningunoSirve && (
            <>
              {remedio && (
                <p className="nota">
                  Cada turno tarda {cifra(diseno.tiempoDeRiegoH, 1)} h, sea grande o chico: aunque el agua alcance justo, puede faltar tiempo
                  para un turno entero. {remedio.porQue}
                </p>
              )}
              <div className="acciones izquierda">
                {remedio && (
                  <button className="primario" disabled={aplicarRemedio.isPending} onClick={() => aplicarRemedio.mutate(remedio.ajuste)}>
                    {aplicarRemedio.isPending ? 'Aplicando…' : remedio.boton}
                  </button>
                )}
                <button onClick={() => alIrAlPaso(3)}>Volver al paso 3</button>
              </div>
              {aplicarRemedio.error && <p className="error" role="alert">{aplicarRemedio.error.message}</p>}
            </>
          )}
          {sinAgua && (
            <>
              <p className="alerta">
                {diseno
                  ? `${EL_METODO[eleccion.metodo]} aprovecha el ${conDecimales(diseno.eficiencia * 100, 0)} % del agua, y con eso tu fuente ya no alcanza para todas las semanas.`
                  : 'Con este método tu fuente ya no alcanza para todas las semanas.'}{' '}
                Vuelve al paso 3.
              </p>
              <div className="acciones izquierda">
                <button onClick={() => alIrAlPaso(3)}>Volver al paso 3</button>
              </div>
            </>
          )}

          {guardar.error && <p className="error" role="alert">{guardar.error.message}</p>}
          <div className="acciones">
            <button className="primario" disabled={!sePuedeGuardar || guardar.isPending} onClick={() => guardar.mutate(eleccion)}>
              {guardar.isPending ? 'Guardando…' : 'Guardar el diseño agronómico'}
            </button>
          </div>

          {cerrado && (
            <section className="cierre" aria-label="Cierre del paso 4">
              <p>
                <strong>Paso 4 completo.</strong> Ya sabes con qué método, cuánta agua y cada cuánto regar: con eso se genera la red.
              </p>
              <div className="acciones">
                <button className="primario" onClick={() => alIrAlPaso(5)}>
                  Siguiente paso: generar la red
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
