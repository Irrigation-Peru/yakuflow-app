import { useEffect, useRef } from 'react'
import type { EstadoDelRecorrido, LugarDelProyecto } from '../api/tipos.ts'
import { conDecimales, iniciales } from '../formato.ts'
import { useTema } from '../tema.ts'
import { BotonConConfirmacion } from './BotonConConfirmacion.tsx'
import { IconoAltitud, IconoArea, IconoLuna, IconoMarca, IconoSol, IconoUbicacion } from './Iconos.tsx'

// El encabezado: la marca, el proyecto abierto con su lugar y quién está trabajando. Compacto, en una sola línea: lo
// que se lee de un vistazo, sin restar alto al trabajo.

/** Grados con hemisferio, como se leen en un plano: «10.6800° S». */
const grados = (valor: number, positivo: string, negativo: string) => `${conDecimales(Math.abs(valor), 4)}° ${valor < 0 ? negativo : positivo}`

/** Pasa del tema claro al oscuro y al revés. El icono muestra el tema al que se pasa. */
function BotonDeTema() {
  const { tema, alternar } = useTema()
  const destino = tema === 'oscuro' ? 'claro' : 'oscuro'
  return (
    <button type="button" className="boton-de-tema" onClick={alternar} aria-label={`Cambiar al modo ${destino}`} title={`Modo ${destino}`}>
      {destino === 'oscuro' ? <IconoLuna tamano={16} /> : <IconoSol tamano={16} />}
    </button>
  )
}

function FichaDelProyecto({ proyecto }: { proyecto: LugarDelProyecto }) {
  const { parcela } = proyecto
  return (
    <div className="ficha-del-proyecto">
      <p className="ficha-nombre" title={proyecto.nombre}>
        {proyecto.nombre}
      </p>
      {parcela ? (
        <ul className="ficha-datos" aria-label="Lugar de la parcela">
          <li title="Centro de la parcela">
            <IconoUbicacion tamano={14} />
            <span className="dato-tecnico">
              {grados(parcela.centroide.lat, 'N', 'S')}, {grados(parcela.centroide.lon, 'E', 'O')}
            </span>
          </li>
          <li title="Área de la parcela">
            <IconoArea tamano={14} />
            <span className="dato-tecnico">{conDecimales(parcela.areaHa, 2)} ha</span>
          </li>
          <li title="Altitud media de la parcela">
            <IconoAltitud tamano={14} />
            <span className="dato-tecnico">{conDecimales(parcela.altitudMsnm, 0)} m s. n. m.</span>
          </li>
        </ul>
      ) : (
        <p className="ficha-sin-lugar">Sin parcela todavía: se dibuja en el paso 1</p>
      )}
    </div>
  )
}

export function Encabezado({
  estado,
  proyecto,
  titulo,
  alIrAProyectos,
  alSalir,
  alRetirarConsentimiento,
}: {
  estado: EstadoDelRecorrido
  /** El proyecto abierto; sin él, el encabezado muestra el título de la pantalla. */
  proyecto?: LugarDelProyecto
  titulo?: string
  alIrAProyectos?: () => void
  alSalir: () => void
  alRetirarConsentimiento: () => void
}) {
  // El menú se cierra con Escape o al hacer clic fuera, como cualquier menú (B4).
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menu.current?.open) {
        menu.current.open = false
        menu.current.querySelector('summary')?.focus()
      }
    }
    const alTocar = (e: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(e.target as Node)) menu.current.open = false
    }
    document.addEventListener('keydown', alTeclear)
    document.addEventListener('pointerdown', alTocar)
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.removeEventListener('pointerdown', alTocar)
    }
  }, [])

  return (
    <header className="encabezado">
      <div className="encabezado-marca">
        <span className="logo" aria-hidden="true">
          <IconoMarca tamano={20} />
        </span>
        <span className="marca-texto">
          <span className="marca-nombre">YAKUFLOW</span>
          <span className="marca-institucion">UNDAC · Campañas de cultivo</span>
        </span>
      </div>

      <div className="encabezado-centro">
        {proyecto ? <FichaDelProyecto proyecto={proyecto} /> : titulo && <p className="encabezado-titulo">{titulo}</p>}
      </div>

      <div className="encabezado-derecha">
        <BotonDeTema />
        <details className="usuario" ref={menu}>
          <summary aria-label={`Menú de ${estado.usuario.nombres}`}>
            <span className="usuario-nombre">{estado.usuario.nombres}</span>
            <span className="avatar">{iniciales(estado.usuario.nombres)}</span>
          </summary>
          {/* Al elegir una opción el menú se pliega: lo que sigue (un diálogo, otra pantalla) queda a la vista. */}
          <div
            className="usuario-opciones"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button') && menu.current) menu.current.open = false
            }}
          >
            <p className="usuario-quien">
              {estado.usuario.nombres}
              <span>{estado.usuario.correo}</span>
            </p>
            {alIrAProyectos && <button onClick={alIrAProyectos}>Mis proyectos</button>}
            {estado.consentimiento && (
              <BotonConConfirmacion
                titulo="¿Retirar tu consentimiento?"
                detalle={<p>Desde ahora tus datos ya no entran en el análisis del estudio y el recorrido queda cerrado hasta que vuelvas a aceptar.</p>}
                confirmar="Retirar mi consentimiento"
                alConfirmar={alRetirarConsentimiento}
              >
                Retirar mi consentimiento
              </BotonConConfirmacion>
            )}
            <button onClick={alSalir}>Salir</button>
          </div>
        </details>
      </div>
    </header>
  )
}
