import { describe, expect, it } from 'vitest'
import { cuentaDeDemostracion } from '../src/demo.ts'

// La cuenta de demostración sale de apps/web/.env.local. Si falta el correo o la contraseña, la pantalla de entrada no
// muestra nada: una cuenta a medias solo confundiría.

describe('cuenta de demostración', () => {
  it('con el correo y la contraseña, los devuelve', () => {
    expect(cuentaDeDemostracion(' demo@undac.edu.pe ', 'una clave cualquiera')).toEqual({ correo: 'demo@undac.edu.pe', contrasena: 'una clave cualquiera' })
  })

  it('si falta uno de los dos, no hay cuenta', () => {
    expect(cuentaDeDemostracion(undefined, 'una clave cualquiera')).toBeNull()
    expect(cuentaDeDemostracion('demo@undac.edu.pe', undefined)).toBeNull()
    expect(cuentaDeDemostracion('  ', '')).toBeNull()
  })
})
