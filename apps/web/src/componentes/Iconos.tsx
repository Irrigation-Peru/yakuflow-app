import type { SVGProps } from 'react'

// Íconos de la estructura de la aplicación: trazo de 1.6 px sobre una grilla de 24, sin relleno, como en el software
// de ingeniería. Van en línea y sin librería: son pocos y así no pesan nada. Siempre decorativos (aria-hidden): el
// texto o la etiqueta del control dice lo que significan.

type Props = SVGProps<SVGSVGElement> & { tamano?: number }

function Icono({ tamano = 18, children, ...resto }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {children}
    </svg>
  )
}

/** La marca: una gota sobre una línea de cota. */
export const IconoMarca = (p: Props) => (
  <Icono {...p}>
    <path d="M12 3.5c3 3.6 5 6.5 5 9.2A5 5 0 0 1 7 12.7c0-2.7 2-5.6 5-9.2Z" />
    <path d="M9.6 13.6a2.6 2.6 0 0 0 2.4 1.9" />
  </Icono>
)

export const IconoTerreno = (p: Props) => (
  <Icono {...p}>
    <path d="M3 18.5 8.5 9l4 6 2.5-3.5L21 18.5Z" />
    <path d="M3 21h18" />
  </Icono>
)

export const IconoBrote = (p: Props) => (
  <Icono {...p}>
    <path d="M12 21v-8" />
    <path d="M12 13c0-4 2.6-6.5 7-6.5 0 4.2-2.7 6.5-7 6.5Z" />
    <path d="M12 15.5c0-3.4-2.2-5.5-6-5.5 0 3.6 2.3 5.5 6 5.5Z" />
  </Icono>
)

export const IconoGota = (p: Props) => (
  <Icono {...p}>
    <path d="M12 3.5c3 3.6 5 6.5 5 9.2A5 5 0 0 1 7 12.7c0-2.7 2-5.6 5-9.2Z" />
  </Icono>
)

/** Un emisor que moja: el paso que define cómo regar. */
export const IconoEmisor = (p: Props) => (
  <Icono {...p}>
    <path d="M4 7h16" />
    <path d="M9 7v3h6V7" />
    <path d="M8.5 14.5 7.5 17M12 14v3.5M15.5 14.5l1 2.5" />
  </Icono>
)

export const IconoRed = (p: Props) => (
  <Icono {...p}>
    <circle cx="5" cy="5" r="1.8" />
    <path d="M5 6.8V19M5 9.5h14M5 14h14M5 18.5h14" />
    <path d="M19 9.5v.01M19 14v.01M19 18.5v.01" strokeWidth={2.6} />
  </Icono>
)

/** Una válvula: poner la red a funcionar. */
export const IconoValvula = (p: Props) => (
  <Icono {...p}>
    <path d="M3 15h4l5-3 5 3h4" />
    <path d="M7 12v6M17 12v6" />
    <path d="M12 12V7M9.5 7h5" />
  </Icono>
)

/** Mejorar con el modelo: un nodo que propone. */
export const IconoModelo = (p: Props) => (
  <Icono {...p}>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    <path d="m6.3 6.3 2 2M15.7 15.7l2 2M6.3 17.7l2-2M15.7 8.3l2-2" />
    <circle cx="12" cy="12" r="3" />
  </Icono>
)

export const IconoInforme = (p: Props) => (
  <Icono {...p}>
    <path d="M7 3h7l4 4v14H7Z" />
    <path d="M14 3v4h4M10 12h5M10 15.5h5M10 19h3" />
  </Icono>
)

export const IconoCarpeta = (p: Props) => (
  <Icono {...p}>
    <path d="M3.5 6.5h6l1.8 2h9.2v10H3.5Z" />
  </Icono>
)

export const IconoUbicacion = (p: Props) => (
  <Icono {...p}>
    <path d="M12 21s6-5.4 6-10.5A6 6 0 0 0 6 10.5C6 15.6 12 21 12 21Z" />
    <circle cx="12" cy="10.5" r="2.2" />
  </Icono>
)

export const IconoArea = (p: Props) => (
  <Icono {...p}>
    <path d="M4 4h16v16H4Z" strokeDasharray="2.5 2.5" />
    <path d="M8 16 16 8" />
  </Icono>
)

export const IconoAltitud = (p: Props) => (
  <Icono {...p}>
    <path d="M12 4v16M8.5 7.5 12 4l3.5 3.5" />
    <path d="M4 20h16" />
  </Icono>
)

export const IconoNube = (p: Props) => (
  <Icono {...p}>
    <path d="M7 18.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 11 3.8 3.8 0 0 0 7 18.5Z" />
  </Icono>
)

export const IconoClima = (p: Props) => (
  <Icono {...p}>
    <circle cx="9" cy="9" r="3" />
    <path d="M9 3v1.5M3 9h1.5M4.8 4.8l1 1M13.2 4.8l-1 1" />
    <path d="M10 19h8a3 3 0 0 0 .4-5.97A4.5 4.5 0 0 0 10.6 13 2.9 2.9 0 0 0 10 19Z" />
  </Icono>
)

export const IconoPlegar = (p: Props) => (
  <Icono {...p}>
    <path d="M4 4v16" />
    <path d="M15 8l-4 4 4 4M11 12h9" />
  </Icono>
)

export const IconoDesplegar = (p: Props) => (
  <Icono {...p}>
    <path d="M4 4v16" />
    <path d="M14 8l4 4-4 4M18 12H9" />
  </Icono>
)

export const IconoCheck = (p: Props) => (
  <Icono strokeWidth={2.4} {...p}>
    <path d="m5.5 12.5 4 4 9-9" />
  </Icono>
)

export const IconoDescargar = (p: Props) => (
  <Icono {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </Icono>
)

export const IconoBasura = (p: Props) => (
  <Icono {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l.8 13h9.4l.8-13M10 10.5v5.5M14 10.5v5.5" />
  </Icono>
)

export const IconoSol = (p: Props) => (
  <Icono {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icono>
)

export const IconoLuna = (p: Props) => (
  <Icono {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </Icono>
)
