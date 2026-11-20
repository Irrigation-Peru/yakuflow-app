import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { api, ErrorDeApi } from './api/cliente.ts'
import { useProyecto } from './api/consultas.ts'
import type { EstadoDelRecorrido } from './api/tipos.ts'
import { Marco } from './componentes/Marco.tsx'
import { Consentimiento } from './pantallas/Consentimiento.tsx'
import { Entrar } from './pantallas/Entrar.tsx'
import { MisProyectos } from './pantallas/MisProyectos.tsx'
import { Prueba } from './pantallas/Prueba.tsx'
import { PASOS, ULTIMO_PASO_DISPONIBLE } from './pasos.ts'
import { crearCola, type EventoPendiente } from './registro/cola.ts'
import { ContextoDeRegistro } from './registro/contexto.ts'

// Qué pantalla se ve lo decide el estado del recorrido que guarda el servidor: sin sesión, entrar; sin
// consentimiento o sin la prueba de entrada, el paso 0; después, los proyectos y el paso en que va cada uno.

const ENVIO_CADA_MS = 5000

// Cada paso se descarga al abrirlo y no al entrar: el mapa (Leaflet), el relieve en 3D (Three.js) y el modelo de
// cultivos (ONNX) pesan, y con una conexión lenta la primera pantalla llega antes.
const Paso1 = lazy(() => import('./pantallas/Paso1.tsx').then((m) => ({ default: m.Paso1 })))
const Paso2 = lazy(() => import('./pantallas/Paso2.tsx').then((m) => ({ default: m.Paso2 })))
const Paso3 = lazy(() => import('./pantallas/Paso3.tsx').then((m) => ({ default: m.Paso3 })))
const Paso4 = lazy(() => import('./pantallas/Paso4.tsx').then((m) => ({ default: m.Paso4 })))
const Paso5 = lazy(() => import('./pantallas/Paso5.tsx').then((m) => ({ default: m.Paso5 })))
const Paso6 = lazy(() => import('./pantallas/Paso6.tsx').then((m) => ({ default: m.Paso6 })))
const Paso7 = lazy(() => import('./pantallas/Paso7.tsx').then((m) => ({ default: m.Paso7 })))
const Paso8 = lazy(() => import('./pantallas/Paso8.tsx').then((m) => ({ default: m.Paso8 })))
const PANTALLAS = { 1: Paso1, 2: Paso2, 3: Paso3, 4: Paso4, 5: Paso5, 6: Paso6, 7: Paso7, 8: Paso8 } as const

export function App() {
  const estado = useQuery({ queryKey: ['estado'], queryFn: () => api<EstadoDelRecorrido>('/estado') })
  if (estado.isPending) return <p className="cargando" role="status">Cargando…</p>
  if (estado.error) {
    if (estado.error instanceof ErrorDeApi && estado.error.estado === 401) return <Entrar />
    return (
      <div className="cargando">
        <p className="error" role="alert">
          {estado.error.message}
        </p>
        <button onClick={() => void estado.refetch()}>Volver a intentar</button>
      </div>
    )
  }
  return <ConSesion estado={estado.data} />
}

/** El proyecto abierto se recuerda en el equipo, por estudiante: al volver, la app sigue donde quedó. */
function useProyectoAbierto(usuarioId: string) {
  const clave = `riego.proyecto.${usuarioId}`
  const [id, setId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(clave)
    } catch {
      return null
    }
  })
  const abrir = (nuevo: string | null) => {
    setId(nuevo)
    try {
      if (nuevo) localStorage.setItem(clave, nuevo)
      else localStorage.removeItem(clave)
    } catch {
      // Sin almacenamiento local: el proyecto abierto se olvida al recargar.
    }
  }
  return [id, abrir] as const
}

/**
 * El paso que el estudiante tiene abierto, recordado por proyecto. Puede volver a cualquier paso que ya alcanzó; al
 * abrir el proyecto, parte del último.
 */
function usePasoAbierto(proyectoId: string | null, pasoAlcanzado: number | undefined) {
  const [elegidos, setElegidos] = useState<Record<string, number>>({})
  const clave = `riego.paso.${proyectoId}`
  let paso = proyectoId ? elegidos[proyectoId] : undefined
  if (paso === undefined && proyectoId) {
    try {
      paso = Number(localStorage.getItem(clave)) || undefined
    } catch {
      paso = undefined
    }
  }
  const alcanzado = Math.min(pasoAlcanzado ?? 1, ULTIMO_PASO_DISPONIBLE)
  const abierto = Math.min(paso ?? alcanzado, alcanzado)
  // El paso en que se abrió queda fijo: al guardar, el proyecto alcanza el siguiente, pero la pantalla no salta sola;
  // el estudiante mira lo que guardó y pasa con el botón del cierre.
  if (proyectoId && pasoAlcanzado !== undefined && elegidos[proyectoId] === undefined) {
    setElegidos((anteriores) => ({ ...anteriores, [proyectoId]: abierto }))
  }
  const abrir = (nuevo: number) => {
    if (!proyectoId) return
    setElegidos((anteriores) => ({ ...anteriores, [proyectoId]: nuevo }))
    try {
      localStorage.setItem(clave, String(nuevo))
    } catch {
      // Sin almacenamiento local: al recargar se abre el último paso alcanzado.
    }
  }
  return [abierto, abrir] as const
}

/**
 * Al cambiar de paso, la pestaña del navegador dice en qué paso se está y el foco pasa al título del paso: quien usa
 * lector de pantalla se entera del cambio y sigue leyendo desde arriba (WCAG 2.4.2 y 2.4.3). Al abrir la app no se
 * mueve el foco: solo cuando el estudiante cambia de pantalla.
 */
function useTituloYFocoDelPaso(paso: number | null) {
  const anterior = useRef<number | null | undefined>(undefined)
  useEffect(() => {
    document.title = paso === null ? 'Mis proyectos · YAKUFLOW' : paso === 0 ? 'Entrar · YAKUFLOW' : `Paso ${paso}: ${PASOS[paso]} · YAKUFLOW`
    const primeraVez = anterior.current === undefined
    anterior.current = paso
    if (primeraVez) return
    // El paso se descarga al abrirlo: se espera a que su título aparezca, sin pasar de unos segundos.
    let intentos = 0
    const reloj = setInterval(() => {
      const titulo = document.querySelector<HTMLElement>('main h2')
      if (titulo || ++intentos > 40) {
        clearInterval(reloj)
        if (titulo) {
          titulo.tabIndex = -1
          titulo.focus()
        }
      }
    }, 100)
    return () => clearInterval(reloj)
  }, [paso])
}

function ConSesion({ estado }: { estado: EstadoDelRecorrido }) {
  // Lo pendiente de cada estudiante va en su propia cola: en un equipo compartido no se mezcla con el de otro.
  const cola = useMemo(
    () =>
      crearCola({
        almacen: localStorage,
        clave: `riego.registro.${estado.usuario.id}`,
        enviar: (eventos: EventoPendiente[]) => api('/eventos', { metodo: 'POST', cuerpo: { eventos } }),
      }),
    [estado.usuario.id],
  )
  useEffect(() => {
    const reloj = setInterval(() => void cola.vaciar(), ENVIO_CADA_MS)
    const alOcultar = () => void cola.vaciar()
    window.addEventListener('pagehide', alOcultar)
    return () => {
      clearInterval(reloj)
      window.removeEventListener('pagehide', alOcultar)
    }
  }, [cola])

  const [proyectoId, abrirProyecto] = useProyectoAbierto(estado.usuario.id)
  const recorrido = estado.recorridoHabilitado && proyectoId ? proyectoId : null
  const proyecto = useProyecto(recorrido ?? '', Boolean(recorrido))
  const [pasoAbierto, abrirPaso] = usePasoAbierto(recorrido, proyecto.data?.pasoAlcanzado)

  let paso: number | null = 0
  let contenido
  if (!estado.consentimiento) contenido = <Consentimiento />
  else if (estado.pruebaDeEntrada !== 'terminada') contenido = <Prueba tipo="entrada" />
  else if (!recorrido) {
    paso = null
    contenido = <MisProyectos alAbrir={abrirProyecto} />
  } else {
    paso = pasoAbierto
    const Pantalla = PANTALLAS[pasoAbierto as keyof typeof PANTALLAS]
    contenido = (
      <Suspense fallback={<p className="cargando" role="status">Abriendo el paso…</p>}>
        <Pantalla key={`${recorrido}-${pasoAbierto}`} proyectoId={recorrido} alPerderlo={() => abrirProyecto(null)} alIrAlPaso={abrirPaso} />
      </Suspense>
    )
  }

  useTituloYFocoDelPaso(paso)

  return (
    <ContextoDeRegistro.Provider value={cola}>
      <Marco
        estado={estado}
        paso={paso}
        cola={cola}
        proyecto={recorrido ? proyecto.data : undefined}
        alIrAProyectos={estado.recorridoHabilitado ? () => abrirProyecto(null) : undefined}
        navegacion={
          recorrido && proyecto.data
            ? { alcanzado: proyecto.data.pasoAlcanzado, desactualizados: proyecto.data.resultadosDesactualizados, alElegir: abrirPaso }
            : undefined
        }
      >
        {contenido}
      </Marco>
    </ContextoDeRegistro.Provider>
  )
}
