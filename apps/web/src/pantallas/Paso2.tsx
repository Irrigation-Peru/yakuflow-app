import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api/cliente.ts'
import { useAlGuardarElPaso, useDatosDelLugar, useProyectoDelPaso } from '../api/consultas.ts'
import type { AvanceDeLaCampana } from '../api/tipos.ts'
import { cultivosDelCatalogo, type CampanaDelCultivo } from '../calculo/campana.ts'
import type { SugerenciasDelModelo } from '../calculo/modelo-de-cultivos.ts'
import { calcular } from '../calculo/puente.ts'
import { Prediccion } from '../componentes/Prediccion.tsx'
import { CONDICION_DE_RASGO, CONDICION_DEL_RASGO, fraseDeCondicion, lecturaDeCondicion, listaDeCondiciones, NIVEL, nombreDeEtapa } from '../condiciones.ts'
import { cifra, conDecimales, cultivoEnFrase, diaDelCalendario, nombreDelMes } from '../formato.ts'
import { lugarDelCultivo } from '../lugar-del-cultivo.ts'
import type { PropsDelPaso } from '../pasos.ts'
import { cambioDeLaDemanda, PREDICCION_DE_LA_DEMANDA, textoDeLaRespuesta } from '../predicciones.ts'
import { useRegistrar } from '../registro/contexto.ts'
import { cuerpoDeLasRecomendaciones } from '../sugerencias.ts'
import { Campo } from './Entrar.tsx'
import { Desplazable } from '../componentes/Desplazable.tsx'
import { EstadoDeError } from '../componentes/EstadoDeError.tsx'

// Paso 2, elegir qué sembrar (HU0011 y HU0012). El modelo de cultivos sugiere tres, cada uno con su probabilidad y
// la condición del lugar que más pesó; el estudiante elige uno de ellos u otro del catálogo, y la fecha de siembra.
// La app no bloquea: dice qué no le conviene al cultivo elegido. Antes de mostrar el efecto de cambiar de cultivo,
// pregunta qué espera el estudiante de la demanda de agua (C1).

type Origen = 'sugerencia' | 'otro'

// Lo que pasó con la demanda al cambiar de cultivo, dicho después de verlo.
const RESULTADO_DEL_CAMBIO = { mas: 'pide más agua', igual: 'pide casi la misma agua', menos: 'pide menos agua' } as const

interface Cambio {
  desde: string
  hacia: string
  origen: Origen
  demandaAntesMmDia: number
}

export function Paso2({ proyectoId, alPerderlo, alIrAlPaso }: PropsDelPaso) {
  const registrar = useRegistrar()
  const alGuardar = useAlGuardarElPaso(proyectoId)
  const proyecto = useProyectoDelPaso(2, proyectoId, alPerderlo)
  const datos = useDatosDelLugar(proyecto.data)
  const lugar = proyecto.data && datos.data ? lugarDelCultivo(proyecto.data, datos.data) : null

  const sugerencias = useQuery({
    queryKey: ['sugerencias', lugar],
    queryFn: () => calcular('sugerenciasDelModelo', lugar!),
    enabled: lugar !== null,
    staleTime: Infinity,
  })

  // Lo que el modelo sugirió queda guardado, con la versión del modelo, cada vez que el estudiante lo ve.
  const guardarSugerencias = useMutation({
    mutationFn: (s: SugerenciasDelModelo) =>
      api(`/proyectos/${proyectoId}/recomendaciones`, { metodo: 'POST', cuerpo: cuerpoDeLasRecomendaciones(s) }),
  })
  const guardadas = useRef<SugerenciasDelModelo | null>(null)
  useEffect(() => {
    const s = sugerencias.data
    if (!s || guardadas.current === s) return
    guardadas.current = s
    guardarSugerencias.mutate(s)
    registrar({
      paso: 2,
      accion: 'cultivosSugeridos',
      detalle: { modelo: s.modelo.version, cultivos: s.sugerencias.map((x) => x.cultivo), mesesDeSiembra: s.sugerencias.map((x) => x.mesDeSiembra) },
      proyectoId,
    })
  }, [sugerencias.data]) // oxlint-disable-line react-hooks/exhaustive-deps

  // El cultivo y la fecha: lo que el estudiante elige en esta pantalla o, si todavía no eligió, lo guardado.
  const guardada = proyecto.data?.campania
  const [eleccion, setEleccion] = useState<{ cultivo: string; fecha: string | null } | null>(null)
  const actual = eleccion ?? (guardada ? { cultivo: guardada.cultivo, fecha: guardada.fechaSiembra } : null)
  const [cambio, setCambio] = useState<Cambio | null>(null)
  const [anterior, setAnterior] = useState<{ cultivo: string; demandaMmDia: number; prediccion: string } | null>(null)

  const campana = useQuery({
    queryKey: ['campana', actual?.cultivo, actual?.fecha, lugar],
    queryFn: () => calcular('campanaDelCultivo', { cultivo: actual!.cultivo, fechaSiembra: actual!.fecha ?? undefined, lugar: lugar! }),
    enabled: Boolean(actual && lugar),
    placeholderData: keepPreviousData,
  })
  // La mejor fecha del año para el cultivo elegido, para compararla con la que el estudiante pone.
  const mejor = useQuery({
    queryKey: ['campana', actual?.cultivo, null, lugar],
    queryFn: () => calcular('campanaDelCultivo', { cultivo: actual!.cultivo, lugar: lugar! }),
    enabled: Boolean(actual && lugar),
    placeholderData: keepPreviousData,
  })
  const vigente = campana.data && actual && campana.data.cultivo === actual.cultivo ? campana.data : null
  const mejorFecha = mejor.data && actual && mejor.data.cultivo === actual.cultivo ? mejor.data.fechaSiembra : null

  const guardar = useMutation({
    mutationFn: (c: { cultivo: string; fechaSiembra: string }) =>
      api<AvanceDeLaCampana>(`/proyectos/${proyectoId}/campania`, { metodo: 'PUT', cuerpo: c }),
    onSuccess: (avance, c) => {
      alGuardar(avance)
      registrar({ paso: 2, accion: 'campaniaGuardada', detalle: c, proyectoId })
      alIrAlPaso(3)
    },
  })

  function elegir(cultivo: string, origen: Origen) {
    if (actual?.cultivo === cultivo) return
    // Si ya hay un cultivo con su demanda a la vista, el cambio pasa primero por la pregunta.
    if (actual && vigente) {
      setCambio({ desde: actual.cultivo, hacia: cultivo, origen, demandaAntesMmDia: vigente.demandaNetaPicoMmDia })
      return
    }
    aplicar(cultivo, origen)
  }

  function aplicar(cultivo: string, origen: Origen) {
    // Un cultivo sugerido llega con el mes que sugirió el modelo; uno del catálogo, con la fecha más apta del lugar.
    const sugerido = sugerencias.data?.sugerencias.find((s) => s.cultivo === cultivo)
    setEleccion({ cultivo, fecha: sugerido?.mesDeSiembra ? sugerido.campana.fechaSiembra : null })
    const orden = sugerido?.orden ?? null
    registrar({ paso: 2, accion: 'cultivoElegido', detalle: { cultivo, origen, orden }, proyectoId })
  }

  function cambiarFecha(fecha: string) {
    if (!actual || !fecha) return
    setEleccion({ cultivo: actual.cultivo, fecha })
    setAnterior(null)
    registrar({ paso: 2, accion: 'fechaDeSiembraCambiada', detalle: { cultivo: actual.cultivo, fecha }, proyectoId })
  }

  if (proyecto.isPending || (proyecto.data?.parcela && datos.isPending)) return <p className="cargando" role="status">Abriendo el paso…</p>
  if (proyecto.error) return <EstadoDeError error={proyecto.error} alReintentar={() => void proyecto.refetch()} alVolver={alPerderlo} />
  if (datos.error) return <EstadoDeError error={datos.error} alReintentar={() => void datos.refetch()} alVolver={alPerderlo} />
  if (!lugar) {
    return (
      <div className="paso">
        <p className="alerta">Para sugerir cultivos hacen falta la parcela, la fuente, el clima y el suelo del lugar. Vuelve al paso 1.</p>
        <div className="acciones izquierda">
          <button onClick={() => alIrAlPaso(1)}>Volver al paso 1</button>
        </div>
      </div>
    )
  }

  const sugeridos = sugerencias.data?.sugerencias ?? []
  const fechaMostrada = actual?.fecha ?? vigente?.fechaSiembra ?? ''

  return (
    <div className="paso">
      <div className="titulo-del-paso">
        <h2>
          <span className="rotulo">Paso 2</span> Elegir qué sembrar
        </h2>
        <span className="rotulo">{proyecto.data.nombre}</span>
      </div>

      <div className="entre">
        <h3>El modelo sugiere tres cultivos para tu parcela</h3>
        <span className="rotulo">Según tu suelo, tu clima, la altitud y tu fuente</span>
      </div>
      {sugerencias.isPending && <p className="aviso">El modelo está revisando tu parcela… la primera vez se descarga el modelo y tarda unos segundos.</p>}
      {sugerencias.error && (
        <p className="error" role="alert">
          El modelo no pudo sugerir cultivos ({sugerencias.error.message}). Puedes elegir uno del catálogo más abajo.
        </p>
      )}
      {sugeridos.length > 0 && (
        <div className="sugerencias">
          {sugeridos.map((s) => (
            <TarjetaDeSugerencia key={s.cultivo} sugerencia={s} elegida={actual?.cultivo === s.cultivo} alElegir={() => elegir(s.cultivo, 'sugerencia')} />
          ))}
        </div>
      )}
      {sugerencias.data && (
        <div className="nota">
          <p>
            Estas sugerencias las hace un modelo de aprendizaje automático, un bosque aleatorio que corre en tu navegador. Tómalas
            como un punto de partida: la decisión es tuya.
          </p>
          <details>
            <summary>Ver cómo se entrenó el modelo</summary>
            <p>
              Versión {sugerencias.data.modelo.version}. {sugerencias.data.modelo.conjunto}
            </p>
          </details>
        </div>
      )}

      <h3 className="rotulo">¿Otro cultivo?</h3>
      <div className="campos dos">
        <Campo etiqueta="Escoger otro cultivo del catálogo">
          <select
            value={actual && !sugeridos.some((s) => s.cultivo === actual.cultivo) ? actual.cultivo : ''}
            onChange={(e) => e.target.value && elegir(e.target.value, 'otro')}
          >
            <option value="">Elige uno</option>
            {cultivosDelCatalogo().map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Fecha de siembra">
          <input type="date" value={fechaMostrada} disabled={!actual || cambio !== null} onChange={(e) => cambiarFecha(e.target.value)} />
        </Campo>
      </div>
      {actual && mejorFecha && fechaMostrada && mejorFecha !== fechaMostrada && (
        <p className="nota">
          Por el clima de este lugar, la fecha más apta para {cultivoEnFrase(actual.cultivo, 'el')}, y con menos riego, es el{' '}
          {diaDelCalendario(mejorFecha, true)}.{' '}
          <button className="enlace" onClick={() => cambiarFecha(mejorFecha)}>
            Usar esa fecha
          </button>
        </p>
      )}

      {cambio ? (
        <Prediccion
          pregunta="demandaAlCambiarDeCultivo"
          enunciado={`Vas a cambiar ${cultivoEnFrase(cambio.desde, 'el')} por ${cultivoEnFrase(cambio.hacia, 'el')}. En la semana en que más agua necesita, ¿cuánta crees que pedirá ${cultivoEnFrase(cambio.hacia, 'el')} comparada con ${cultivoEnFrase(cambio.desde, 'el')}?`}
          opciones={PREDICCION_DE_LA_DEMANDA}
          paso={2}
          proyectoId={proyectoId}
          detalle={{ desde: cambio.desde, hacia: cambio.hacia }}
          alResponder={(respuesta) => {
            setAnterior({ cultivo: cambio.desde, demandaMmDia: cambio.demandaAntesMmDia, prediccion: respuesta })
            aplicar(cambio.hacia, cambio.origen)
            setCambio(null)
          }}
          alCancelar={() => setCambio(null)}
        />
      ) : (
        vigente && <EfectoDelCultivo campana={vigente} anterior={anterior} />
      )}

      {/* Un botón deshabilitado siempre dice por qué (Nielsen 1). */}
      {!actual && <p className="nota razon">Elige uno de los cultivos sugeridos o uno del catálogo para seguir.</p>}
      {cambio !== null && <p className="nota razon">Responde la pregunta de arriba para ver qué pasa con el cambio.</p>}
      <div className="acciones">
        {guardar.error && <p className="error" role="alert">{guardar.error.message}</p>}
        <button
          className="primario"
          disabled={!vigente || cambio !== null || guardar.isPending}
          onClick={() => vigente && guardar.mutate({ cultivo: vigente.cultivo, fechaSiembra: vigente.fechaSiembra })}
        >
          {guardar.isPending ? 'Guardando…' : 'Comprobar si el agua alcanza'}
        </button>
      </div>
    </div>
  )
}

function TarjetaDeSugerencia({
  sugerencia,
  elegida,
  alElegir,
}: {
  sugerencia: SugerenciasDelModelo['sugerencias'][number]
  elegida: boolean
  alElegir: () => void
}) {
  const { condiciones } = sugerencia.campana.aptitud
  const lecturas = condiciones.map(lecturaDeCondicion)
  const influyente = condiciones.find((c) => c.condicion === CONDICION_DE_RASGO[sugerencia.rasgoMasInfluyente])
  const aFavor = lecturas.filter((l) => l.nivel === 'optima').map((l) => l.corto)
  const enContra = lecturas.filter((l) => l.nivel !== 'optima').map((l) => l.corto)

  return (
    <article className={elegida ? 'sugerencia elegida' : 'sugerencia'} aria-label={sugerencia.cultivo}>
      <div className="entre">
        <h4>{sugerencia.cultivo}</h4>
        <span className="cifra" title="Probabilidad que le da el modelo">
          {cifra(sugerencia.probabilidad * 100, 0)} %
        </span>
      </div>
      <div
        className="barra-de-probabilidad"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={sugerencia.probabilidad}
        aria-label={`Probabilidad de ${sugerencia.cultivo}`}
      >
        <div style={{ width: `${sugerencia.probabilidad * 100}%` }} />
      </div>
      {sugerencia.mesDeSiembra && (
        <p>
          En lugares como el tuyo se siembra sobre todo en <strong>{nombreDelMes(sugerencia.mesDeSiembra)}</strong>.
        </p>
      )}
      <p>
        Para sugerirlo, lo que más pesó fue <strong>{CONDICION_DEL_RASGO[sugerencia.rasgoMasInfluyente]}</strong>.
        {influyente && ` ${fraseDeCondicion(influyente, sugerencia.cultivo)}`}
      </p>
      <p>{listaDeCondiciones(aFavor, 'favor')}</p>
      <p className="nota">{listaDeCondiciones(enContra, 'contra')}</p>
      <details>
        <summary>Ver condiciones</summary>
        <TablaDeCondiciones condiciones={condiciones} cultivo={sugerencia.cultivo} />
        <p className="nota">
          Suponiendo que siembras el {diaDelCalendario(sugerencia.campana.fechaSiembra)},{' '}
          {sugerencia.mesDeSiembra ? 'el mes que sugiere el modelo.' : 'la mejor fecha para este lugar.'}
        </p>
      </details>
      <button className={elegida ? 'primario' : ''} aria-pressed={elegida} onClick={alElegir}>
        {elegida ? 'Elegido' : 'Elegir'}
      </button>
    </article>
  )
}

function TablaDeCondiciones({ condiciones, cultivo }: { condiciones: CampanaDelCultivo['aptitud']['condiciones']; cultivo: string }) {
  return (
    <Desplazable nombre="Condiciones del cultivo en tu parcela"><table className="tabla">
      <thead>
        <tr>
          <th scope="col">Condición</th>
          <th scope="col">En tu parcela</th>
          <th scope="col">Lo que necesita {cultivoEnFrase(cultivo, 'el')}</th>
        </tr>
      </thead>
      <tbody>
        {condiciones.map(lecturaDeCondicion).map((l) => (
          <tr key={l.condicion} className={`nivel-${l.nivel}`}>
            <th scope="row">
              <span aria-hidden="true">{NIVEL[l.nivel].simbolo}</span> {l.nombre}
              <span className="solo-lectores"> ({NIVEL[l.nivel].texto})</span>
            </th>
            <td className="cifra">{l.valor}</td>
            <td>{l.pide}</td>
          </tr>
        ))}
      </tbody>
    </table></Desplazable>
  )
}

function EfectoDelCultivo({
  campana,
  anterior,
}: {
  campana: CampanaDelCultivo
  anterior: { cultivo: string; demandaMmDia: number; prediccion: string } | null
}) {
  const { aptitud } = campana
  const malas = aptitud.condiciones.filter((c) => c.nivel !== 'optima')
  const cosecha = campana.calendario.at(-1)?.hasta
  const cambio = anterior && cambioDeLaDemanda(anterior.demandaMmDia, campana.demandaNetaPicoMmDia)

  return (
    <section className="efecto" aria-label={`Lo que significa sembrar ${campana.cultivo.toLowerCase()}`}>
      {anterior && cambio && (
        <p className="aviso" role="status">
          Con {cultivoEnFrase(campana.cultivo, 'el')} en lugar {cultivoEnFrase(anterior.cultivo, 'de')}, en la semana de más demanda hay que
          regar <span className="cifra">{conDecimales(campana.demandaNetaPicoMmDia, 1)} mm al día</span>, y antes eran{' '}
          <span className="cifra">{conDecimales(anterior.demandaMmDia, 1)}</span>: {RESULTADO_DEL_CAMBIO[cambio]}. Antes de verlo dijiste: «
          {textoDeLaRespuesta(PREDICCION_DE_LA_DEMANDA, anterior.prediccion)}».
        </p>
      )}
      <div className="dos-columnas">
        <div>
          <h3 className="rotulo">Lo que no le conviene {cultivoEnFrase(campana.cultivo, 'a')}</h3>
          {malas.length === 0 ? (
            <p>Nada: todas las condiciones del lugar están en su punto ideal.</p>
          ) : (
            <ul className="condiciones">
              {malas.map((c) => (
                <li key={c.condicion}>
                  <span aria-hidden="true">{NIVEL[c.nivel].simbolo}</span> <strong>{lecturaDeCondicion(c).nombre}.</strong>
                  <span className="solo-lectores"> ({NIVEL[c.nivel].texto})</span> {fraseDeCondicion(c, campana.cultivo)}
                </li>
              ))}
            </ul>
          )}
          {aptitud.nivel === 'fuera' && (
            <p className="alerta">
              Algunas condiciones están fuera de lo que este cultivo tolera. Puedes elegirlo igual, pero en campo eso podría costarte la
              campaña.
            </p>
          )}
          <details>
            <summary>Ver condiciones</summary>
            <TablaDeCondiciones condiciones={aptitud.condiciones} cultivo={campana.cultivo} />
          </details>
        </div>
        <div>
          <h3 className="rotulo">Calendario de etapas</h3>
          <Desplazable nombre="Calendario de etapas"><table className="tabla">
            <thead>
              <tr>
                <th scope="col">Etapa</th>
                <th scope="col">Desde</th>
                <th scope="col">Hasta</th>
                <th scope="col">Días</th>
              </tr>
            </thead>
            <tbody>
              {campana.calendario.map((e) => (
                <tr key={e.etapa} className={e.etapa === campana.etapaCritica ? 'destacada' : undefined}>
                  <th scope="row">
                    {nombreDeEtapa(e.etapa)}
                    {e.etapa === campana.etapaCritica && <span className="rotulo"> · mayor demanda</span>}
                  </th>
                  <td>{diaDelCalendario(e.desde, true)}</td>
                  <td>{diaDelCalendario(e.hasta, true)}</td>
                  <td className="cifra">{e.dias}</td>
                </tr>
              ))}
            </tbody>
          </table></Desplazable>
          <p className="nota">
            Si siembras el {diaDelCalendario(campana.fechaSiembra, true)}
            {cosecha && `, cosecharías hacia el ${diaDelCalendario(cosecha, true)}`}. La semana que más riego pide es la{' '}
            {campana.semanaCritica}, en la etapa {nombreDeEtapa(campana.etapaCritica).toLowerCase()}: hay que regarle{' '}
            {conDecimales(campana.demandaNetaPicoMmDia, 1)} mm al día, lo que el cultivo consume menos lo que pone la lluvia. El riego se diseña
            para esa semana, porque si alcanza ahí, alcanza toda la campaña.
            {campana.maduracion?.ultimoRiego &&
              ` En la maduración el cultivo ya casi no aprovecha el agua: se riega a lo más como en esa semana y el último riego es el ${diaDelCalendario(
                campana.maduracion.ultimoRiego,
                true,
              )}, ${campana.maduracion.corteDelRiegoDias} días antes de la cosecha.`}
          </p>
        </div>
      </div>
    </section>
  )
}
