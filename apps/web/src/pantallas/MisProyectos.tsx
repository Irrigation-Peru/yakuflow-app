import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '../api/cliente.ts'
import type { ProyectoResumen } from '../api/tipos.ts'
import { BotonConConfirmacion } from '../componentes/BotonConConfirmacion.tsx'
import { IconoBasura, IconoDescargar } from '../componentes/Iconos.tsx'
import { fecha } from '../formato.ts'
import { PASOS } from '../pasos.ts'
import { useRegistrar } from '../registro/contexto.ts'
import { lecturaDelAviso, useVigencia } from '../vigencia.ts'
import { Campo } from './Entrar.tsx'

const nuevo = z.object({ nombre: z.string().trim().min(1, 'Ponle un nombre al proyecto').max(120) })

export function MisProyectos({ alAbrir }: { alAbrir: (id: string) => void }) {
  const registrar = useRegistrar()
  const consultas = useQueryClient()
  const proyectos = useQuery({ queryKey: ['proyectos'], queryFn: () => api<ProyectoResumen[]>('/proyectos') })

  // Eliminar: el proyecto sale de la lista y ya no se abre. No se borra de la base: su registro de actividad queda para el
  // estudio (el registro solo se agrega).
  const eliminar = useMutation({
    mutationFn: (p: ProyectoResumen) => api<void>(`/proyectos/${p.id}`, { metodo: 'DELETE' }),
    onSuccess: (_nada, p) => {
      registrar({ paso: p.pasoAlcanzado, accion: 'proyectoEliminado', proyectoId: p.id })
      void consultas.invalidateQueries({ queryKey: ['proyectos'] })
    },
  })

  // El PDF se arma en el paso 8, con el plano dibujado: se abre el proyecto ahí y la descarga empieza sola.
  function descargarElPdf(p: ProyectoResumen) {
    try {
      localStorage.setItem(`riego.paso.${p.id}`, '8')
      localStorage.setItem(`riego.descargar.${p.id}`, '1')
    } catch {
      // Sin almacenamiento local se abre igual en el paso 8 que recuerde; la descarga se hace con el botón de ahí.
    }
    alAbrir(p.id)
  }
  const [creando, setCreando] = useState(false)
  const formulario = useForm({ resolver: zodResolver(nuevo) })

  const crear = useMutation({
    mutationFn: (datos: { nombre: string }) => api<ProyectoResumen>('/proyectos', { metodo: 'POST', cuerpo: datos }),
    onSuccess: (proyecto) => {
      registrar({ paso: 1, accion: 'proyectoCreado', proyectoId: proyecto.id })
      alAbrir(proyecto.id)
    },
  })

  // Cargar un proyecto exportado (HU0029): el servidor valida el archivo y vuelve a calcular todo.
  const archivo = useRef<HTMLInputElement>(null)
  const importar = useMutation({
    mutationFn: async (elegido: File) => {
      let contenido: unknown
      try {
        contenido = JSON.parse(await elegido.text())
      } catch {
        throw new Error('Ese archivo no es un proyecto exportado de esta aplicación')
      }
      return api<ProyectoResumen>('/proyectos/importacion', { metodo: 'POST', cuerpo: contenido })
    },
    onSuccess: (proyecto) => {
      registrar({ paso: 1, accion: 'proyectoImportado', proyectoId: proyecto.id })
      alAbrir(proyecto.id)
    },
  })

  return (
    <div>
      <div className="entre">
        <h2>Tus proyectos</h2>
        {!creando && (
          <div className="acciones">
            <button disabled={importar.isPending} onClick={() => archivo.current?.click()}>
              {importar.isPending ? 'Cargando el proyecto…' : 'Cargar un proyecto exportado'}
            </button>
            <button className="primario" onClick={() => setCreando(true)}>
              Nuevo proyecto
            </button>
          </div>
        )}
      </div>
      <input
        ref={archivo}
        type="file"
        accept=".json,application/json"
        aria-label="Archivo del proyecto"
        hidden
        onChange={(e) => {
          const elegido = e.target.files?.[0]
          e.target.value = ''
          if (elegido) importar.mutate(elegido)
        }}
      />
      {importar.error && <p className="error" role="alert">{importar.error.message}</p>}
      {eliminar.error && <p className="error" role="alert">No se pudo eliminar el proyecto: {eliminar.error.message}</p>}

      {creando && (
        <form className="tarjeta" onSubmit={formulario.handleSubmit((datos) => crear.mutate(datos))} noValidate>
          <Campo etiqueta="Nombre del proyecto" error={formulario.formState.errors.nombre?.message}>
            <input autoFocus placeholder="Por ejemplo: ladera de Cerro de Pasco, sector 2" {...formulario.register('nombre')} />
          </Campo>
          {crear.error && <p className="error" role="alert">{crear.error.message}</p>}
          <div className="acciones">
            <button type="button" onClick={() => setCreando(false)}>
              Cancelar
            </button>
            <button className="primario" disabled={crear.isPending}>
              Crear y empezar
            </button>
          </div>
        </form>
      )}

      {proyectos.isPending && <p className="cargando" role="status">Cargando…</p>}
      {proyectos.error && <p className="error" role="alert">{proyectos.error.message}</p>}
      {proyectos.data?.length === 0 && !creando && <p className="vacio">Todavía no tienes proyectos. Crea el primero para empezar el recorrido.</p>}

      <div className="tarjetas">
        {proyectos.data?.map((p) => (
          <article key={p.id} className="tarjeta">
            <div className="entre">
              <h3>{p.nombre}</h3>
              <span className="rotulo">{fecha(p.creadoEn)}</span>
            </div>
            <div
              className="progreso"
              role="progressbar"
              aria-label={`Avance de ${p.nombre}`}
              aria-valuemin={0}
              aria-valuemax={8}
              aria-valuenow={p.pasoAlcanzado}
              aria-valuetext={`Paso ${p.pasoAlcanzado} de 8`}
            >
              <div style={{ width: `${(100 * p.pasoAlcanzado) / 8}%` }} />
            </div>
            <p className="rotulo">
              Paso {p.pasoAlcanzado} de 8 · {PASOS[p.pasoAlcanzado]}
            </p>
            <AvisoDeLasReglas proyecto={p} alAbrir={alAbrir} />
            <div className="acciones izquierda acciones-del-proyecto">
              <button className="fuerte" aria-label={`Continuar con ${p.nombre}`} onClick={() => alAbrir(p.id)}>
                Continuar
              </button>
              {p.pasoAlcanzado >= 8 && (
                <button className="exito" aria-label={`Descargar el informe en PDF de ${p.nombre}`} onClick={() => descargarElPdf(p)}>
                  <IconoDescargar tamano={16} />
                  PDF
                </button>
              )}
              <BotonConConfirmacion
                className="peligro"
                titulo={`¿Eliminar «${p.nombre}»?`}
                detalle={
                  <p>
                    El proyecto sale de tu lista y ya no lo podrás abrir. Si quieres guardarlo, antes descarga su informe o expórtalo desde
                    el paso 8.
                  </p>
                }
                confirmar="Sí, eliminar el proyecto"
                alConfirmar={() => eliminar.mutate(p)}
                disabled={eliminar.isPending && eliminar.variables?.id === p.id}
              >
                <IconoBasura tamano={16} />
                <span className="solo-lectores">Eliminar {p.nombre}</span>
              </BotonConConfirmacion>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

/** Si el proyecto ya no cumple las reglas de cálculo de hoy: qué pasa y un botón al paso que hay que rehacer. */
function AvisoDeLasReglas({ proyecto, alAbrir }: { proyecto: ProyectoResumen; alAbrir: (id: string) => void }) {
  const vigencia = useVigencia(proyecto.id, proyecto.pasoAlcanzado > 3)
  const aviso = vigencia.data?.avisos[0]
  if (!aviso) return null
  // Se abre en el paso a rehacer: el mismo recuerdo del último paso abierto que usa la aplicación.
  const abrirEnElPaso = () => {
    try {
      localStorage.setItem(`riego.paso.${proyecto.id}`, String(aviso.paso))
    } catch {
      // Sin almacenamiento local se abre en el último paso alcanzado; el aviso se repite en el informe.
    }
    alAbrir(proyecto.id)
  }
  return (
    <div className="alerta">
      <p>Con las reglas de cálculo actuales, {lecturaDelAviso(aviso)}.</p>
      <div className="acciones izquierda">
        <button onClick={abrirEnElPaso}>Rehacer el paso {aviso.paso}: {PASOS[aviso.paso]}</button>
      </div>
    </div>
  )
}

