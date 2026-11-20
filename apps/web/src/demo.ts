// Una cuenta para mostrar la aplicación sin registrarse, solo para pruebas. El correo y la contraseña viven en
// apps/web/.env.local (VITE_DEMO_CORREO y VITE_DEMO_CONTRASENA), que git ignora, y los crea
// herramientas/cuenta-de-demostracion.mjs. La pantalla de entrada los lee solo en desarrollo: el build no los lleva.

export interface CuentaDeDemostracion {
  correo: string
  contrasena: string
}

export function cuentaDeDemostracion(correo: string | undefined, contrasena: string | undefined): CuentaDeDemostracion | null {
  const limpio = correo?.trim()
  if (!limpio || !contrasena) return null
  return { correo: limpio, contrasena }
}
