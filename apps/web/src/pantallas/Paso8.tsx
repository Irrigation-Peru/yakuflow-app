import { TituloDeVista } from '../componentes/Figura.tsx'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api/cliente.ts'
import type { EstadoDelRecorrido } from '../api/tipos.ts'
import { calcular } from '../calculo/puente.ts'
import { useLaRed } from '../calculo/usar-la-red.ts'
import { Dato } from '../componentes/Dato.tsx'
import { RedEnPlanta } from '../componentes/RedEnPlanta.tsx'
import { TablaDePresupuesto } from '../componentes/TablaDePresupuesto.tsx'
import { cifra, conDecimales, diaDelCalendario, fecha } from '../formato.ts'
import type { ContenidoDelInforme } from '../informe/informe-en-pdf.ts'
import { PASOS, type PropsDelPaso } from '../pasos.ts'
import { useRegistrar } from '../registro/contexto.ts'
import { Prueba } from './Prueba.tsx'
import { Desplazable } from '../componentes/Desplazable.tsx'
import { EstadoDeError } from '../componentes/EstadoDeError.tsx'
import { duracionDeLaEtapa, frecuenciaDeLaEtapa, notaDelPlan, riegosDeLaEtapa } from '../plan-de-riego.ts'
import { lecturaDelProblema } from '../metodo.ts'
import { lecturaDelAviso, useVigencia } from '../vigencia.ts'

// Paso 8, descargar el informe (HU0027 a HU0030). El estudiante no redacta: la app arma el informe con lo registrado, lo
// descarga en PDF y exporta el proyecto a un archivo. Al terminar se abre la prueba de salida (C1, C7).

const NOMBRE_DE_LA_ETAPA = { inicial: 'Inicial', desarrollo: 'Desarrollo', media: 'Media', final: 'Final' } as const
const QUE_DICE_EL_BALANCE = { si: 'La fuente cubre todas las semanas', parcial: 'Cubre con un ajuste', no: 'No cubre' } as const

function descargar(contenido: Blob, nombre: string) {
  const url = URL.createObjectURL(contenido)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

const nombreDeArchivo = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'proyecto'

export function Paso8({ proyectoId, alPerderlo, alIrAlPaso }: PropsDelPaso) {
  const registrar = useRegistrar()
  const { proyecto, datos, relieve, precios, planteamiento, cambios, laRed } = useLaRed(8, proyectoId, alPerderlo)
  const estado = useQuery({ queryKey: ['estado'], queryFn: () => api<EstadoDelRecorrido>('/estado') })
  const [enPrueba, setEnPrueba] = useState(false)
  const delPlano = useRef<HTMLDivElement>(null)
  const informe = useQuery({
    queryKey: ['informe', proyectoId, planteamiento && { ...planteamiento, grilla: null }, cambios, precios.data?.version],
    queryFn: () => calcular('informeDelProyecto', planteamiento!, cambios, precios.data ?? null),
    enabled: planteamiento !== null && !precios.isPending && laRed.isSuccess,
    retry: false,
  })

  const p = proyecto.data
  const i = informe.data
  const vigencia = useVigencia(proyectoId, true)
  const avisosDelAgua = (vigencia.data?.avisos ?? []).filter((a) => a.paso === 3).map(lecturaDelAviso)
  const problemasDelRiego =
    i && planteamiento
      ? i.diseno.problemas.map((problema) =>
          lecturaDelProblema(problema, i.diseno, i.balance.horasDeRiegoPorDia, planteamiento.suelo.clase, planteamiento.suelo.infiltracionBasicaMmH),
        )
      : []

  const exportar = useMutation({
    mutationFn: () => api<unknown>(`/proyectos/${proyectoId}/exportacion`),
    onSuccess: (archivo) => {
      descargar(new Blob([JSON.stringify(archivo, null, 2)], { type: 'application/json' }), `${nombreDeArchivo(p!.nombre)}.riego.json`)
      registrar({ paso: 8, accion: 'proyectoExportado', proyectoId })
    },
  })

  const pdf = useMutation({
    mutationFn: async () => {
      const { informeEnPdf } = await import('../informe/informe-en-pdf.ts')
      const lienzo = delPlano.current?.querySelector('canvas')
      const d = i!.laRed
      const { balance, diseno } = i!
      const contenido: ContenidoDelInforme = {
        proyecto: p!.nombre,
        fechaDeEmision: fecha(new Date().toISOString()),
        avisos: [
          ...p!.resultadosDesactualizados.map((paso) => `el paso ${paso} (${PASOS[paso]}) quedó desactualizado: revísalo antes de entregar.`),
          ...avisosDelAgua.map((texto) => `el agua del paso 3 ya no cumple: ${texto}`),
          ...problemasDelRiego.map((texto) => `el riego del paso 4 ya no cumple: ${texto}`),
        ],
        terreno: [
          ['Área de la parcela', `${conDecimales(p!.parcela!.areaHa, 2)} ha`],
          ['Altitud media', `${cifra(p!.parcela!.altitudMsnm, 0)} m.s.n.m.`],
          ['Pendiente media', `${conDecimales(p!.parcela!.pendienteMediaPct, 1)} %`],
          [
            'Caudal de estiaje de la fuente',
            `${conDecimales(p!.fuente!.caudalLps, 2)} l/s (${p!.fuente!.origenDato === 'campo' ? 'medido en campo' : 'declarado, no medido'})`,
          ],
          [
            'Calidad del agua (conductividad)',
            p!.fuente!.conductividadDsM === null || p!.fuente!.conductividadDsM === undefined
              ? 'Sin dato: no se evaluaron las sales'
              : `${conDecimales(p!.fuente!.conductividadDsM, 2)} dS/m`,
          ],
          ['Cota de la fuente', `${cifra(p!.fuente!.cotaMsnm, 0)} m.s.n.m.`],
          ['Carga disponible', `${conDecimales(p!.cargaDisponibleM ?? 0, 1)} m`],
        ],
        cultivo: [
          ['Cultivo', p!.campania!.cultivo],
          ['Fecha de siembra', diaDelCalendario(p!.campania!.fechaSiembra, true)],
          ['Demanda neta en la semana crítica', `${conDecimales(i!.demandaNetaPicoMmDia, 2)} mm/día`],
        ],
        balance: [
          ['Resultado', QUE_DICE_EL_BALANCE[balance.alcanza]],
          ['Semana crítica', String(balance.semanaCritica)],
          ['Necesidad en la semana crítica, si no llueve', `${conDecimales(balance.necesidadPicoLps, 2)} l/s`],
          ['Necesidad en la semana crítica, con la lluvia media', `${conDecimales(balance.necesidadPicoConLluviaLps, 2)} l/s`],
          ['Caudal de la fuente en estiaje', `${conDecimales(balance.caudalLps, 2)} l/s`],
          ['Área regada', `${conDecimales(balance.areaHa, 2)} ha`],
          ['Horas de riego por día', conDecimales(balance.horasDeRiegoPorDia, 1)],
        ],
        diseno: [
          ['Método', p!.disenoAgronomico!.metodo === 'goteo' ? 'Goteo' : 'Aspersión'],
          ['Lámina neta / bruta por riego', `${conDecimales(diseno.laminaNetaMm, 1)} / ${conDecimales(diseno.laminaBrutaMm, 1)} mm`],
          ['Eficiencia para la lámina bruta', `${conDecimales(diseno.eficiencia * 100, 0)} %`],
          ['Intervalo en la semana de más consumo', `${diseno.intervaloDias} días`],
          ['Tiempo de riego', `${conDecimales(diseno.tiempoDeRiegoH, 2)} h`],
          ['Turnos', `${diseno.turnos}, repartidos en los ${diseno.intervaloDias} ${diseno.intervaloDias === 1 ? 'día' : 'días'} del intervalo`],
          [
            'Turnos en un mismo día',
            `${Math.ceil(diseno.turnos / diseno.intervaloDias)} a lo más: ${conDecimales(Math.ceil(diseno.turnos / diseno.intervaloDias) * diseno.tiempoDeRiegoH, 2)} h de riego, de las ${conDecimales(balance.horasDeRiegoPorDia, 1)} h de agua al día`,
          ],
        ],
        red: [
          ['Versión de la red', `${p!.red!.version}${p!.red!.origen === 'ml' ? ' (alternativa elegida del modelo)' : ''}`],
          ['Emisores', cifra(d.resumen.emisores, 0)],
          ['Tubería', `${cifra(d.resumen.longitudTuberiaM, 0)} m`],
          ['Cámaras rompe-presión', String(d.resumen.camarasRompePresion)],
          ['Uniformidad del sector más desparejo', `${conDecimales(Math.min(...d.analisis.turnos.map((t) => t.uniformidad)) * 100, 1)} %`],
          ['¿El diseño funcionó en el paso 6?', p!.red!.funciono ? 'Sí' : 'Todavía no'],
        ],
        imagenDeLaRed: lienzo?.toDataURL('image/png') ?? null,
        presupuesto: d.presupuesto,
        plan: i!.plan,
        intervaloDeDisenoDias: i!.diseno.intervaloDias,
      }
      informeEnPdf(contenido).save(`informe-${nombreDeArchivo(p!.nombre)}.pdf`)
      registrar({ paso: 8, accion: 'informeDescargado', detalle: { version: p!.red!.version }, proyectoId })
    },
  })

  // Si se pidió el PDF desde la lista de proyectos: en cuanto el informe está armado y el plano dibujado, se descarga
  // solo. Si el agua o el riego ya no cumplen, no se descarga y el paso dice por qué.
  const listoParaElPdf = Boolean(i) && vigencia.isSuccess
  const puedeElPdf = problemasDelRiego.length === 0 && avisosDelAgua.length === 0
  const descargarAlAbrir = useRef(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(`riego.descargar.${proyectoId}`) === '1') descargarAlAbrir.current = true
      localStorage.removeItem(`riego.descargar.${proyectoId}`)
    } catch {
      // Sin almacenamiento local no hay pedido pendiente.
    }
  }, [proyectoId])
  useEffect(() => {
    if (!listoParaElPdf || !descargarAlAbrir.current) return
    descargarAlAbrir.current = false
    if (!puedeElPdf) return
    // Un momento para que el plano termine de dibujarse: va dentro del PDF.
    const espera = setTimeout(() => pdf.mutate(), 900)
    return () => clearTimeout(espera)
  }, [listoParaElPdf, puedeElPdf]) // oxlint-disable-line react-hooks/exhaustive-deps

  if (proyecto.isPending || datos.isPending || relieve.isPending) return <p className="cargando" role="status">Abriendo el paso…</p>
  if (proyecto.error) return <EstadoDeError error={proyecto.error} alReintentar={() => void proyecto.refetch()} alVolver={alPerderlo} />
  if (datos.error) return <EstadoDeError error={datos.error} alReintentar={() => void datos.refetch()} alVolver={alPerderlo} />
  if (relieve.error) return <EstadoDeError error={relieve.error} alReintentar={() => void relieve.refetch()} alVolver={alPerderlo} />
  if (!p!.red || p!.resultadosDesactualizados.includes(5)) {
    return (
      <div className="paso">
        <p className="alerta">Algo de antes cambió y la red ya no corresponde a lo decidido: vuelve al paso 5 para generarla otra vez.</p>
        <div className="acciones izquierda">
          <button onClick={() => alIrAlPaso(5)}>Volver al paso 5</button>
        </div>
      </div>
    )
  }
  if (laRed.error) return <EstadoDeError error={laRed.error} alReintentar={() => void laRed.refetch()} alVolver={alPerderlo} />
  if (informe.error) return <EstadoDeError error={informe.error} alReintentar={() => void informe.refetch()} alVolver={alPerderlo} />
  if (!i) return <p className="cargando" role="status">Armando el informe…</p>

  const yaTerminoLaPrueba = estado.data?.pruebaDeSalida === 'terminada'
  if (enPrueba && !yaTerminoLaPrueba) return <Prueba tipo="salida" />

  const d = i.laRed
  const turno = d.analisis.turnos[0]!
  const vencidos = p!.resultadosDesactualizados
  const peorUniformidad = Math.min(...d.analisis.turnos.map((t) => t.uniformidad))

  return (
    <div className="paso">
      <div className="titulo-del-paso">
        <h2>
          <span className="rotulo">Paso 8</span> Descargar el informe
        </h2>
        <span className="rotulo">
          {p!.nombre} · {planteamiento!.cultivo.toLowerCase()}
        </span>
      </div>

      {avisosDelAgua.length > 0 && (
        <div className="alerta">
          {/* Un balance guardado con reglas anteriores puede no cumplir las de ahora: se dice y se manda a corregirlo. */}
          <p>El agua comprobada en el paso 3 ya no cumple las reglas del método:</p>
          <ul>
            {avisosDelAgua.map((texto) => (
              <li key={texto}>{texto}</li>
            ))}
          </ul>
          <div className="acciones izquierda">
            <button onClick={() => alIrAlPaso(3)}>Corregir el paso 3: {PASOS[3]}</button>
          </div>
        </div>
      )}

      {problemasDelRiego.length > 0 && (
        <div className="alerta">
          {/* Un diseño guardado con reglas anteriores puede no cumplir las de ahora: se dice y se manda a corregirlo. */}
          <p>El riego guardado en el paso 4 ya no cumple las reglas del método:</p>
          <ul>
            {problemasDelRiego.map((texto) => (
              <li key={texto}>{texto}</li>
            ))}
          </ul>
          <div className="acciones izquierda">
            <button onClick={() => alIrAlPaso(4)}>Corregir el paso 4: {PASOS[4]}</button>
          </div>
        </div>
      )}

      {vencidos.length > 0 && (
        <div className="alerta">
          <p>Hay pasos desactualizados; el informe lo dirá. Puedes volver a ellos, nada se borró:</p>
          <div className="acciones izquierda">
            {vencidos.map((paso) => (
              <button key={paso} onClick={() => alIrAlPaso(paso)}>
                Paso {paso}: {PASOS[paso]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="paso-con-panel">
        <section className="lienzo informe">
          <TituloDeVista titulo="Tu diseño en planta" queMuestra="La red final vista desde arriba, regando el primer sector, como sale en el informe." />
          <div ref={delPlano}>
            <RedEnPlanta red={d.red} resultado={turno.resultado} contorno={d.contornoLocal} presionNominalEmisorM={d.presionNominalEmisorM} />
          </div>

          <h3 className="rotulo">Presupuesto referencial</h3>
          {d.presupuesto ? <TablaDePresupuesto presupuesto={d.presupuesto} /> : <p className="nota">No hay un catálogo de precios cargado.</p>}

          <h3 className="rotulo">Plan de riego por etapa</h3>
          <p className="nota">{notaDelPlan(i.diseno.intervaloDias)}</p>
          <Desplazable nombre="Plan de riego por etapa"><table className="tabla">
            <thead>
              <tr>
                <th scope="col">Etapa</th>
                <th scope="col">Fechas</th>
                <th scope="col">Consume · mm/día</th>
                <th scope="col">Lluvia · mm/día</th>
                <th scope="col">Si no llueve, regar</th>
                <th scope="col">Lámina · mm</th>
                <th scope="col">Cada riego dura</th>
                <th scope="col">Riegos en un año normal</th>
              </tr>
            </thead>
            <tbody>
              {i.plan.map((e) => (
                <tr key={e.desde}>
                  <th scope="row">{NOMBRE_DE_LA_ETAPA[e.etapa]}</th>
                  <td>
                    {diaDelCalendario(e.desde)} al {diaDelCalendario(e.hasta)}
                  </td>
                  <td className="cifra">{conDecimales(e.consumoMedioMmDia, 1)}</td>
                  <td className="cifra">{conDecimales(e.lluviaEfectivaMediaMmDia, 1)}</td>
                  <td className="cifra">{frecuenciaDeLaEtapa(e)}</td>
                  <td className="cifra">{conDecimales(e.laminaNetaMm, 1)}</td>
                  <td className="cifra">{duracionDeLaEtapa(e)}</td>
                  <td className="cifra">{riegosDeLaEtapa(e)}</td>
                </tr>
              ))}
            </tbody>
          </table></Desplazable>
        </section>

        <aside className="panel">
          <h3 className="rotulo">Lo que lleva el informe</h3>
          <dl className="datos">
            <Dato nombre="Terreno" valor={`${conDecimales(p!.parcela!.areaHa, 2)} ha · ${cifra(p!.parcela!.altitudMsnm, 0)} m.s.n.m.`} />
            <Dato nombre="Cultivo" valor={p!.campania!.cultivo} />
            <Dato nombre="Balance" valor={QUE_DICE_EL_BALANCE[i.balance.alcanza]} />
            <Dato nombre="Riego" valor={`${p!.disenoAgronomico!.metodo === 'goteo' ? 'Goteo' : 'Aspersión'} · cada ${i.diseno.intervaloDias} d en el pico`} />
            <Dato nombre="Red" valor={`Versión ${p!.red!.version}${p!.red!.origen === 'ml' ? ', del modelo' : ''}`} />
            <Dato nombre="Uniformidad" valor={`${conDecimales(peorUniformidad * 100, 1)} %`} />
            {d.presupuesto && <Dato nombre="Costo referencial" valor={`${d.presupuesto.moneda} ${cifra(d.presupuesto.total, 0)}`} />}
          </dl>
          {pdf.error && <p className="error" role="alert">No se pudo armar el PDF: {pdf.error.message}</p>}
          {exportar.error && <p className="error" role="alert">{exportar.error.message}</p>}
          {(problemasDelRiego.length > 0 || avisosDelAgua.length > 0) && <p className="nota">El informe se descarga cuando el agua y el riego vuelvan a cumplir.</p>}
          <div className="acciones">
            <button className="primario" disabled={pdf.isPending || problemasDelRiego.length > 0 || avisosDelAgua.length > 0} onClick={() => pdf.mutate()}>
              {pdf.isPending ? 'Armando el PDF…' : 'Descargar el informe en PDF'}
            </button>
          </div>
          <div className="acciones">
            <button disabled={exportar.isPending} onClick={() => exportar.mutate()}>
              Exportar el proyecto a un archivo
            </button>
          </div>
          <p className="nota">El archivo guarda tus decisiones de todos los pasos, sin tus datos personales. Se carga después desde «Tus proyectos».</p>

          <section className="cierre" aria-label="Prueba de salida">
            {yaTerminoLaPrueba ? (
              <p>
                <strong>Recorrido terminado.</strong> Tu prueba de salida ya quedó registrada.
              </p>
            ) : estado.data?.salidaHabilitada ? (
              <>
                <p>Para cerrar el recorrido, responde la prueba de salida. No se muestra si acertaste.</p>
                <div className="acciones">
                  <button className="primario" onClick={() => setEnPrueba(true)}>
                    Dar la prueba de salida
                  </button>
                </div>
              </>
            ) : (
              <p className="nota">La prueba de salida se abre cuando decidas en el paso 7 y tu diseño esté al día.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
