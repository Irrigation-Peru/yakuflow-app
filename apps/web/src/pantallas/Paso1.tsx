import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useDispatch, useSelector } from 'react-redux'
import { ActionCreators } from 'redux-undo'
import { z } from 'zod'
import { api, ErrorDeApi } from '../api/cliente.ts'
import { claveDelProyecto, useDatosDelLugar, useProyecto } from '../api/consultas.ts'
import type { DatosDeLaFuente, FuentesDeReferencia, LugarDelProyecto, PuntoDeReferencia, RelieveDelProyecto } from '../api/tipos.ts'
import { calcular } from '../calculo/puente.ts'
import { CoordenadasATeclado } from '../componentes/CoordenadasATeclado.tsx'
import { Dato } from '../componentes/Dato.tsx'
import { TituloDeVista } from '../componentes/Figura.tsx'
import { LeyendaDeZonas } from '../componentes/LeyendaDeZonas.tsx'
import { Mapa } from '../componentes/Mapa.tsx'
import { Perfil } from '../componentes/Perfil.tsx'
import { SueloYClima } from '../componentes/SueloYClima.tsx'
import { lecturaDeLaConduccion, tramosDelNivel } from '../conduccion.ts'
import { lecturaDelDesnivel } from '../desnivel.ts'
import type { Despacho, Estado } from '../estado/almacen.ts'
import { cargarLugar, contornoCerrado, fuenteUbicada, modoElegido, verticeAgregado, type Punto } from '../estado/lugar.ts'
import { cifra, conDecimales, hectareasDesdeM2 } from '../formato.ts'
import { confirmacionDeLaFuente } from '../fuente.ts'
import type { PropsDelPaso } from '../pasos.ts'
import { useRegistrar } from '../registro/contexto.ts'
import { EXAGERACION_VERTICAL, hayWebGL, VISTAS, type Vista } from '../vista-3d.ts'
import { zonaEn } from '../zonas.ts'
import { Campo } from './Entrar.tsx'
import { EstadoDeError } from '../componentes/EstadoDeError.tsx'

// Paso 1, conocer el lugar (HU0005, HU0009 y HU0010). El estudiante dibuja la parcela y ubica la fuente; el área, la
// pendiente, las cotas, el desnivel, el suelo y el clima no se escriben: salen del mapa y de las fuentes oficiales. Lo
// único que escribe es lo que midió en campo.

// Three.js pesa: se descarga recién cuando el estudiante abre el terreno en 3D.
const Relieve3D = lazy(() => import('../componentes/Relieve3D.tsx').then((m) => ({ default: m.Relieve3D })))

const datosDeLaFuente = z.object({
  tipo: z.enum(['canal', 'manantial', 'reservorio']),
  caudalLps: z.number({ error: 'Escribe el caudal que mediste' }).positive('El caudal tiene que ser mayor que cero').max(1000),
  horasDisponiblesDia: z.number({ error: 'Escribe cuántas horas al día tienes el agua' }).positive().max(24, 'Un día tiene 24 horas'),
  conductividadDsM: z.number().min(0).max(30).nullable(),
  origenDato: z.enum(['campo', 'declarado']),
})
type FormularioDeLaFuente = z.infer<typeof datosDeLaFuente>

export function Paso1({ proyectoId, alPerderlo, alIrAlPaso }: PropsDelPaso) {
  const consultas = useQueryClient()
  const registrar = useRegistrar()
  const despachar = useDispatch<Despacho>()
  const lugar = useSelector((e: Estado) => e.lugar.present)
  const puedeDeshacer = useSelector((e: Estado) => e.lugar.past.length > 0)
  const clave = claveDelProyecto(proyectoId)
  const proyecto = useProyecto(proyectoId)
  const datos = proyecto.data
  // El clima y el suelo: sin ellos no se puede elegir qué sembrar, aunque la parcela y la fuente estén guardadas.
  const delLugar = useDatosDelLugar(datos)
  // El terreno en 3D en lugar del mapa; sin WebGL, el perfil en 2D.
  const [vista3d, setVista3d] = useState<Vista | null>(null)
  const [sin3d, setSin3d] = useState(false)

  // El relieve alrededor de la parcela guardada, para ubicar la fuente. Se pide apenas hay parcela, así está
  // listo cuando el estudiante pasa a la fuente.
  const contornoGuardado = datos?.parcela?.contorno
  const relieve = useQuery({
    queryKey: ['relieve', proyectoId, contornoGuardado],
    queryFn: () => api<RelieveDelProyecto>(`/proyectos/${proyectoId}/relieve`),
    enabled: Boolean(contornoGuardado),
    staleTime: Infinity,
  })
  // Las bocatomas, tomas y lagunas de la ANA alrededor de la parcela, como referencia para ubicar la fuente.
  const referencias = useQuery({
    queryKey: ['fuentes-de-referencia', proyectoId, contornoGuardado],
    queryFn: () => api<FuentesDeReferencia>(`/proyectos/${proyectoId}/fuentes-de-referencia`),
    enabled: Boolean(contornoGuardado),
    staleTime: Infinity,
  })

  // Al abrir el proyecto, el mapa parte de lo guardado.
  const cargado = useRef<string | null>(null)
  useEffect(() => {
    if (!datos || cargado.current === datos.id) return
    cargado.current = datos.id
    despachar(cargarLugar({ contorno: datos.parcela?.contorno ?? null, fuente: datos.fuente && { lat: datos.fuente.lat, lon: datos.fuente.lon } }))
    registrar({ paso: 1, accion: 'pasoAbierto', proyectoId })
  }, [datos, despachar, proyectoId, registrar])

  // Si el proyecto ya no existe (otro equipo, otra cuenta), se vuelve a la lista.
  useEffect(() => {
    if (proyecto.error instanceof ErrorDeApi && proyecto.error.estado === 404) alPerderlo()
  }, [proyecto.error, alPerderlo])

  // El área mientras se dibuja sale del módulo de cálculo, en su hilo. Vale solo para los vértices con que se pidió.
  const dibujando = !lugar.cerrado && lugar.vertices.length >= 3
  const [medida, setMedida] = useState<{ de: Punto[]; m2: number } | null>(null)
  useEffect(() => {
    if (!dibujando) return
    let vigente = true
    const de = lugar.vertices
    void calcular('areaDePoligono', de).then((m2) => vigente && setMedida({ de, m2 }))
    return () => {
      vigente = false
    }
  }, [lugar.vertices, dibujando])
  const areaEnVivoM2 = dibujando && medida?.de === lugar.vertices ? medida.m2 : null

  const guardarParcela = useMutation({
    mutationFn: (contorno: Punto[]) => api<LugarDelProyecto>(`/proyectos/${proyectoId}/parcela`, { metodo: 'PUT', cuerpo: { contorno } }),
    onSuccess: (lugarNuevo) => consultas.setQueryData(clave, lugarNuevo),
  })
  const guardarFuente = useMutation({
    mutationFn: (fuente: DatosDeLaFuente) => api<LugarDelProyecto>(`/proyectos/${proyectoId}/fuente`, { metodo: 'PUT', cuerpo: fuente }),
    onSuccess: (lugarNuevo) => consultas.setQueryData(clave, lugarNuevo),
  })

  function alHacerClic(p: Punto) {
    if (lugar.modo === 'parcela') despachar(verticeAgregado(p))
    if (lugar.modo === 'fuente') {
      despachar(fuenteUbicada(p))
      // En qué zona la puso: el registro muestra si el estudiante leyó el relieve antes de decidir.
      const lectura = relieve.data && zonaEn(relieve.data, p)
      registrar({ paso: 1, accion: 'fuenteUbicada', detalle: lectura ? { zona: lectura.zona } : undefined, proyectoId })
    }
  }

  function elegirReferencia(r: PuntoDeReferencia) {
    if (lugar.modo !== 'fuente') return
    despachar(fuenteUbicada({ lat: r.lat, lon: r.lon }))
    const lectura = relieve.data && zonaEn(relieve.data, r)
    registrar({ paso: 1, accion: 'fuenteUbicada', detalle: { referencia: r.tipo, ...(lectura ? { zona: lectura.zona } : {}) }, proyectoId })
  }

  function cerrarContorno() {
    if (lugar.vertices.length < 3) return
    despachar(contornoCerrado())
    registrar({ paso: 1, accion: 'parcelaCerrada', detalle: { vertices: lugar.vertices.length }, proyectoId })
    guardarParcela.mutate(lugar.vertices)
  }

  function deshacer() {
    despachar(ActionCreators.undo())
    registrar({ paso: 1, accion: 'cambioDeshecho', proyectoId })
  }

  function verEn3d(vista: Vista | null) {
    if (vista && vista3d === null && !hayWebGL()) setSin3d(true)
    setVista3d(vista)
    registrar({ paso: 1, accion: vista ? 'vistaDelRelieveElegida' : 'relieveCerrado', detalle: vista ? { vista } : undefined, proyectoId })
  }

  const formulario = useForm<FormularioDeLaFuente>({
    resolver: zodResolver(datosDeLaFuente),
    defaultValues: { tipo: 'manantial', origenDato: 'campo', conductividadDsM: null },
  })
  useEffect(() => {
    if (!datos?.fuente) return
    const { tipo, caudalLps, horasDisponiblesDia, conductividadDsM, origenDato } = datos.fuente
    formulario.reset({ tipo, caudalLps, horasDisponiblesDia, conductividadDsM, origenDato })
    // Solo al cargar el proyecto: después manda lo que el estudiante escribe.
  }, [datos?.id]) // oxlint-disable-line react-hooks/exhaustive-deps

  const guardar = formulario.handleSubmit((valores) => {
    if (!lugar.fuente) return
    registrar({ paso: 1, accion: 'fuenteGuardada', detalle: { origenDato: valores.origenDato }, proyectoId })
    // Lo guardado pasa a ser el punto de partida del formulario: si el estudiante cambia algo, la confirmación se va.
    guardarFuente.mutate({ ...valores, ...lugar.fuente }, { onSuccess: () => formulario.reset(valores) })
  })

  if (proyecto.isPending) return <p className="cargando" role="status">Abriendo el proyecto…</p>
  if (proyecto.error) return <EstadoDeError error={proyecto.error} alReintentar={() => void proyecto.refetch()} alVolver={alPerderlo} />

  const { parcela, fuente, desnivel, conduccion, elevacion } = datos!
  const lectura = desnivel && lecturaDelDesnivel(desnivel)
  const lecturaConduccion = conduccion && desnivel && lecturaDeLaConduccion(conduccion, desnivel)
  const errores = formulario.formState.errors
  const consultando = guardarParcela.isPending || guardarFuente.isPending
  const errorAlGuardar = guardarParcela.error ?? guardarFuente.error
  const fuenteMovida = lugar.fuente && fuente && (lugar.fuente.lat !== fuente.lat || lugar.fuente.lon !== fuente.lon)
  const recienGuardada = guardarFuente.isSuccess && !formulario.formState.isDirty && !fuenteMovida
  // El mismo criterio con que el servidor da el paso por completo; si el estudiante vuelve y deja la fuente debajo
  // de la parcela, el proyecto no retrocede, pero el cierre deja de mostrarse.
  const conAgua = datos!.pasoAlcanzado >= 2 && desnivel !== null && desnivel.disponibleM > 0
  const faltaElClima = delLugar.isSuccess && !delLugar.data.clima
  const faltaElSuelo = delLugar.isSuccess && !delLugar.data.suelo.vigente
  const pasoCompleto = conAgua && delLugar.isSuccess && !faltaElClima && !faltaElSuelo

  return (
    <div className="paso">
      <div className="titulo-del-paso">
        <h2>
          <span className="rotulo">Paso 1</span> Conocer el lugar
        </h2>
        <span className="rotulo">{datos!.nombre}</span>
      </div>

      <div className="paso1">
        <section className="lienzo">
          {vista3d !== null && parcela ? (
            <>
              <TituloDeVista
                titulo={sin3d || !relieve.data ? 'Perfil del terreno' : 'El terreno en 3D'}
                queMuestra="La parcela, la fuente y el camino del agua sobre el relieve real del lugar. Elige desde dónde mirarlo."
              />
              <div className="herramientas">
                {!sin3d &&
                  VISTAS.map(({ vista, nombre }) => (
                    <button key={vista} aria-pressed={vista3d === vista} onClick={() => verEn3d(vista)}>
                      {nombre}
                    </button>
                  ))}
                <button onClick={() => verEn3d(null)}>Volver al mapa</button>
              </div>
              <p className="indicacion">
                {sin3d
                  ? 'Este equipo no puede dibujar en 3D: aquí tienes el mismo terreno en un perfil 2D.'
                  : 'Arrastra para girar el terreno. Para acercarte, usa la rueda del mouse o junta y separa dos dedos en la pantalla.'}
              </p>
              {sin3d || !relieve.data ? (
                <figure className="perfil plano">
                  {conduccion ? (
                    <Perfil
                      puntos={conduccion.perfil}
                      nombre="Perfil de la conducción"
                      nivel={tramosDelNivel(conduccion)}
                      marcas={conduccion.camaras.map((c, i) => ({ ...c, rotulo: `CRP ${i + 1}` }))}
                    />
                  ) : (
                    <Perfil puntos={parcela.perfil} />
                  )}
                  <figcaption className="nota">
                    {conduccion ? 'De la fuente al centro de la parcela, por donde bajaría el agua.' : 'A lo largo de la parcela.'}
                  </figcaption>
                </figure>
              ) : (
                <Suspense fallback={<p className="cargando relieve-3d">Descargando el relieve en 3D…</p>}>
                  <Relieve3D
                    relieve={relieve.data}
                    contorno={parcela.contorno}
                    centroide={parcela.centroide}
                    fuente={fuente}
                    conduccion={conduccion}
                    desnivelM={desnivel?.disponibleM ?? null}
                    vista={vista3d}
                    alFallar={() => setSin3d(true)}
                  />
                </Suspense>
              )}
              <p className="nota origen">
                {elevacion ? `Alturas de ${elevacion.nombre}.` : 'Alturas del relieve.'} El relieve se ve {cifra(EXAGERACION_VERTICAL, 1)} veces más
                empinado de lo que es, para que se note la forma del terreno. Si tu equipo no puede mostrar el 3D, verás el mismo terreno en un
                perfil 2D.
              </p>
            </>
          ) : (
            <>
          <TituloDeVista
            titulo="Mapa de la parcela y la fuente"
            queMuestra={
              lugar.modo === 'fuente' && relieve.data
                ? 'Vista desde arriba. Los colores dicen hasta dónde llega el agua por gravedad desde cada punto.'
                : 'Vista desde arriba, sobre el mapa de la zona: el contorno de tu parcela y dónde está el agua.'
            }
          />
          <div className="herramientas">
            <button aria-pressed={lugar.modo === 'parcela'} onClick={() => despachar(modoElegido('parcela'))}>
              Dibujar la parcela
            </button>
            {lugar.modo === 'parcela' && (
              <button className="primario" disabled={lugar.vertices.length < 3} onClick={cerrarContorno}>
                Cerrar el contorno
              </button>
            )}
            <button aria-pressed={lugar.modo === 'fuente'} onClick={() => despachar(modoElegido('fuente'))}>
              Ubicar la fuente
            </button>
            <button disabled={!puedeDeshacer} onClick={deshacer}>
              Deshacer
            </button>
            {parcela && (
              <button disabled={!relieve.data} onClick={() => verEn3d('isometrica')}>
                Ver el terreno en 3D
              </button>
            )}
          </div>
          <p className="indicacion" aria-live="polite">
            {lugar.modo === 'parcela'
              ? 'Haz clic en el mapa en cada esquina de la parcela. Para cerrarla, haz clic en la primera esquina.'
              : lugar.modo === 'fuente'
                ? `Haz clic donde está la fuente de agua: el canal, el manantial o el reservorio.${relieve.data ? ' Los colores muestran hasta dónde llega el agua por gravedad.' : ''}`
                : !parcela
                  ? 'Empieza por dibujar la parcela.'
                  : !fuente
                    ? 'Ahora ubica la fuente de agua.'
                    : ' '}
          </p>
          <CoordenadasATeclado modo={lugar.modo} alAgregar={alHacerClic} />
          <Mapa
            key={datos!.id}
            modo={lugar.modo}
            vertices={lugar.vertices}
            cerrado={lugar.cerrado}
            fuente={lugar.fuente}
            centroide={parcela?.centroide ?? null}
            guardados={[...(parcela?.contorno ?? []), ...(fuente ? [{ lat: fuente.lat, lon: fuente.lon }] : [])]}
            relieve={relieve.data ?? null}
            camaras={fuenteMovida || !conduccion ? [] : conduccion.camaras}
            referencias={referencias.data?.puntos ?? []}
            alHacerClic={alHacerClic}
            alCerrar={cerrarContorno}
            alElegirReferencia={elegirReferencia}
          />
          {parcela && (lugar.modo === 'fuente' || !fuente) && (
            <p className="nota origen">
              {referencias.isLoading
                ? 'Buscando bocatomas, tomas y lagunas de la ANA cerca de la parcela…'
                : referencias.data?.aviso ??
                  (referencias.error
                    ? 'No pudimos traer las fuentes de referencia de la ANA. Igual puedes ubicar la fuente.'
                    : referencias.data && referencias.data.puntos.length === 0
                      ? 'La ANA no tiene bocatomas, tomas ni lagunas inventariadas a unos 4 km de la parcela.'
                      : referencias.data && (
                          <>
                            <strong>Puntos de referencia:</strong> en verde, bocatomas y tomas; en azul, lagunas, a unos 4 km de la parcela (
                            {referencias.data.fuente.nombre}). Son una ayuda: la fuente es la que tú ves en campo, y el caudal es el que mides.
                          </>
                        ))}
            </p>
          )}
          {lugar.modo === 'fuente' && (
            <LeyendaDeZonas relieve={relieve.data} elevacionDelLugar={elevacion} cargando={relieve.isLoading} error={relieve.error} />
          )}
          {elevacion && (
            <p className="nota origen">
              <strong>De dónde sale el relieve:</strong> {elevacion.nombre}, con un dato cada {conDecimales(elevacion.resolucionM, 0)} m.
              {elevacion.respaldo && ' Lo usamos porque esta zona está fuera de la cobertura del IGN.'}
            </p>
          )}
            </>
          )}
        </section>

        <aside className="panel">
          <h3 className="rotulo">Lo que sale del mapa</h3>
          {consultando && <p className="aviso">Consultando el relieve del lugar… la primera vez puede tardar unos segundos.</p>}
          {errorAlGuardar && <p className="error" role="alert">{errorAlGuardar.message}</p>}
          <dl className="datos">
            <Dato
              nombre="Área de la parcela"
              valor={areaEnVivoM2 !== null ? `≈ ${hectareasDesdeM2(areaEnVivoM2)}` : parcela && `${conDecimales(parcela.areaHa, 2)} ha`}
            />
            <Dato nombre="Pendiente media" valor={parcela && `${conDecimales(parcela.pendienteMediaPct, 1)} %`} />
            <Dato nombre="Altitud media de la parcela" valor={parcela && `${conDecimales(parcela.altitudMsnm, 0)} m`} />
            <Dato nombre="Cota de la fuente" valor={fuente && `${conDecimales(fuente.cotaMsnm, 0)} m`} />
            <Dato nombre="Desnivel disponible" valor={desnivel && `${conDecimales(desnivel.disponibleM, 1)} m`} />
          </dl>
          {lectura && <p className="nota">{lectura.nota}</p>}
          {lectura?.alertas.map((alerta) => (
            <p key={alerta} className="alerta">
              {alerta}
            </p>
          ))}
          {parcela && parcela.perfil.length > 1 && (
            <figure className="perfil">
              <TituloDeVista titulo="Perfil de la parcela" queMuestra="Altitud del terreno entre las dos esquinas más alejadas." />
              <Perfil puntos={parcela.perfil} />
              <figcaption className="nota">Así sube y baja el terreno de la parcela entre sus dos esquinas más alejadas (altitud en m s. n. m.).</figcaption>
            </figure>
          )}

          {conduccion && lecturaConduccion && (
            <section aria-label="Conducción de la fuente a la parcela">
              <h3 className="rotulo">La conducción</h3>
              <p className="conduccion-resumen">{lecturaConduccion.resumen}</p>
              {lecturaConduccion.camaras.length > 0 && (
                <ul className="camaras">
                  {lecturaConduccion.camaras.map((camara) => (
                    <li key={camara}>{camara}</li>
                  ))}
                </ul>
              )}
              <p className="nota">{lecturaConduccion.llegada}</p>
              {lecturaConduccion.avisos.map((aviso) => (
                <p key={aviso} className="alerta">
                  {aviso}
                </p>
              ))}
              <figure className="perfil">
                <TituloDeVista titulo="Perfil de la conducción" queMuestra="Altitud del camino del agua, de la fuente a la parcela, y su nivel." />
                <Perfil
                  puntos={conduccion.perfil}
                  nombre="Perfil de la conducción"
                  nivel={tramosDelNivel(conduccion)}
                  marcas={conduccion.camaras.map((c, i) => ({ ...c, rotulo: `CRP ${i + 1}` }))}
                />
                <figcaption className="nota">
                  El camino del agua, de la fuente al centro de la parcela. La línea discontinua es el nivel del agua: cada cámara
                  rompe-presión lo baja hasta su propia altura.
                </figcaption>
              </figure>
            </section>
          )}

          <h3 className="rotulo">Lo que mediste tú</h3>
          <form onSubmit={guardar} noValidate>
            <div className="campos">
              <Campo etiqueta="Tipo de fuente">
                <select {...formulario.register('tipo')}>
                  <option value="manantial">Manantial</option>
                  <option value="canal">Canal</option>
                  <option value="reservorio">Reservorio</option>
                </select>
              </Campo>
              <Campo etiqueta="Caudal en la época seca (estiaje) · l/s" error={errores.caudalLps?.message}>
                <input type="number" step="0.01" min="0" inputMode="decimal" {...formulario.register('caudalLps', { valueAsNumber: true })} />
              </Campo>
              <Campo etiqueta="Horas de agua al día" error={errores.horasDisponiblesDia?.message}>
                <input type="number" step="0.5" min="0" max="24" inputMode="decimal" {...formulario.register('horasDisponiblesDia', { valueAsNumber: true })} />
              </Campo>
              <Campo etiqueta="Conductividad eléctrica del agua · dS/m (opcional)" error={errores.conductividadDsM?.message}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  {...formulario.register('conductividadDsM', { setValueAs: (v: string) => (v === '' || v === null ? null : Number(v)) })}
                />
              </Campo>
              <fieldset className="opciones">
                <legend className="campo-etiqueta">¿De dónde sale el caudal?</legend>
                <label>
                  <input type="radio" value="campo" {...formulario.register('origenDato')} /> Lo medí en campo
                </label>
                <label>
                  <input type="radio" value="declarado" {...formulario.register('origenDato')} /> Me lo dieron
                </label>
              </fieldset>
              <p className="nota">
                Un manantial o una quebrada dan menos agua en los meses secos que en los de lluvia. El sistema se diseña con el caudal más
                bajo del año, el de estiaje, que es el que asegura el riego en toda la campaña: si lo mediste en época de lluvias, tu fuente
                dará menos de lo que escribiste.
              </p>
            </div>
            {!lugar.fuente && <p className="nota">Primero ubica la fuente en el mapa.</p>}
            {fuenteMovida && <p className="nota">Moviste la fuente: guárdala para recalcular el desnivel.</p>}
            <div className="acciones">
              {/* Principal solo mientras falta guardar: con el paso completo, el principal es seguir al paso 2. */}
              <button className={pasoCompleto && !fuenteMovida && !formulario.formState.isDirty ? undefined : 'primario'} disabled={!lugar.fuente || consultando}>
                {guardarFuente.isPending ? 'Guardando…' : 'Guardar la fuente'}
              </button>
            </div>
            <div role="status">{recienGuardada && <p className="aviso">{confirmacionDeLaFuente(datos!)}</p>}</div>
          </form>
          {fuente && (
            <dl className="datos">
              <Dato nombre="Agua que entrega al día" valor={`${conDecimales(fuente.aguaDisponible.m3PorDia, 1)} m³`} />
              <Dato nombre="Agua que entrega a la semana" valor={`${conDecimales(fuente.aguaDisponible.m3PorSemana, 0)} m³`} />
            </dl>
          )}
          <SueloYClima proyecto={datos!} />

          {conAgua && (faltaElClima || faltaElSuelo) && (
            <div className="alerta" role="status">
              <p>
                Para elegir qué sembrar falta {faltaElClima && faltaElSuelo ? 'el clima y el suelo' : faltaElClima ? 'el clima' : 'el suelo'} del
                lugar: el servicio no respondió.{' '}
                {faltaElSuelo && 'Puedes ingresar la textura de tu muestra de campo, más arriba, o volver a consultarlo.'}
              </p>
              <div className="acciones izquierda">
                <button onClick={() => void delLugar.refetch()} disabled={delLugar.isFetching}>
                  {delLugar.isFetching ? 'Consultando…' : 'Volver a consultar'}
                </button>
              </div>
            </div>
          )}

          {pasoCompleto && (
            <section className="cierre" aria-label="Cierre del paso 1">
              <p>
                <strong>Paso 1 completo.</strong> Ya tienes la parcela, la fuente, el desnivel, el suelo y el clima: con eso se
                elige qué sembrar.
              </p>
              <div className="acciones">
                <button className="primario" onClick={() => alIrAlPaso(2)}>
                  Siguiente paso: elegir qué sembrar
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
