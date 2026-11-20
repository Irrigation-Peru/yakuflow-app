import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api } from '../api/cliente.ts'
import type { EstadoDelRecorrido, LugarDelProyecto } from '../api/tipos.ts'
import type { NavegacionDelRecorrido } from '../pasos.ts'
import type { Cola } from '../registro/cola.ts'
import { BarraDeEtapas } from './BarraDeEtapas.tsx'
import { Encabezado } from './Encabezado.tsx'

/**
 * La estructura de la aplicación: el encabezado, la barra de etapas del recorrido y el trabajo de cada paso, a todo el
 * ancho para que las vistas en 2D y 3D tengan espacio. Los pasos ya alcanzados se abren desde la barra de etapas, y los
 * que quedaron por revisar llevan una marca: la app no borra nada.
 */
export function Marco({
  estado,
  paso,
  cola,
  proyecto,
  alIrAProyectos,
  navegacion,
  children,
}: {
  estado: EstadoDelRecorrido
  paso: number | null
  cola: Cola
  /** El proyecto abierto, para el encabezado. */
  proyecto?: LugarDelProyecto
  alIrAProyectos?: () => void
  navegacion?: NavegacionDelRecorrido
  children: ReactNode
}) {
  const consultas = useQueryClient()

  async function salir() {
    await cola.vaciar()
    await api('/sesion', { metodo: 'DELETE' })
    // Lo del estudiante que sale no queda en memoria. No se usa clear(): sacaría del caché la consulta del estado
    // mientras la pantalla la sigue mirando, y nada volvería a pedirla. Al reiniciarla, la app la pide de nuevo,
    // la API responde 401 y se ve la pantalla de entrada.
    consultas.removeQueries({ predicate: (consulta) => consulta.queryKey[0] !== 'estado' })
    await consultas.resetQueries({ queryKey: ['estado'] })
  }

  async function retirarConsentimiento() {
    await cola.vaciar()
    await api('/consentimiento/retiro', { metodo: 'POST' })
    await consultas.invalidateQueries({ queryKey: ['estado'] })
  }

  const conProyecto = paso !== null && navegacion !== undefined
  return (
    <div className={`marco${conProyecto ? ' con-menu' : ''}`}>
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <Encabezado
        estado={estado}
        proyecto={paso !== null ? proyecto : undefined}
        titulo={paso === null ? 'Mis proyectos' : undefined}
        alIrAProyectos={alIrAProyectos}
        alSalir={() => void salir()}
        alRetirarConsentimiento={() => void retirarConsentimiento()}
      />
      {paso !== null && <BarraDeEtapas paso={paso} navegacion={navegacion} />}
      <div className="cuerpo">
        <main className="contenido" id="contenido" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
