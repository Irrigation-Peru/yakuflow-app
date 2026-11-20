import { describe, expect, it } from 'vitest'
import { leerConfiguracion, PARAMETROS_POR_OMISION } from '../src/configuracion.ts'

// Lo que cambia de un despliegue a otro sale del entorno; lo obligatorio falta con un mensaje claro y lo demás tiene un
// valor por omisión que es el de desarrollo.

const MINIMO = {
  DOMINIO_CORREO: 'UNDAC.edu.pe',
  CODIGOS_CURSO: 'AGR-1, AGR-2 ,',
  JWT_SECRETO: 'x'.repeat(32),
  ORIGEN_WEB: 'https://app.ejemplo.pe/',
  CONTACTO_OSM: 'equipo@ejemplo.pe',
}

describe('la configuración del despliegue', () => {
  it('con lo mínimo, el resto toma los valores por omisión', () => {
    const c = leerConfiguracion(MINIMO)
    expect(c.dominioCorreo).toBe('undac.edu.pe')
    expect(c.codigosCurso).toEqual(['AGR-1', 'AGR-2'])
    expect(c.origenWeb).toBe('https://app.ejemplo.pe')
    expect(c.produccion).toBe(false)
    expect(c.cookieEntreSitios).toBe(false)
    expect(c.documentacionPublica).toBe(true)
    expect(c).toMatchObject(PARAMETROS_POR_OMISION)
  })

  it('la documentación se cierra en producción salvo que se pida', () => {
    expect(leerConfiguracion({ ...MINIMO, NODE_ENV: 'production' }).documentacionPublica).toBe(false)
    expect(leerConfiguracion({ ...MINIMO, NODE_ENV: 'production', DOCUMENTACION_PUBLICA: 'si' }).documentacionPublica).toBe(true)
    expect(leerConfiguracion({ ...MINIMO, DOCUMENTACION_PUBLICA: 'no' }).documentacionPublica).toBe(false)
  })

  it('cada parámetro del despliegue se puede cambiar por el entorno', () => {
    const c = leerConfiguracion({
      ...MINIMO,
      NODE_ENV: 'production',
      COOKIE_ENTRE_SITIOS: 'si',
      SALTOS_DE_PROXY: '2',
      CONEXIONES_BD: '5',
      VIGENCIA_CACHE_DIAS: '30',
      LIMITE_REGISTROS_POR_IP: '400',
      LIMITE_INTENTOS_DE_SESION: '5',
      LIMITE_TESELAS_POR_MINUTO: '6000',
    })
    expect(c.produccion).toBe(true)
    expect(c.cookieEntreSitios).toBe(true)
    expect(c.saltosDeProxy).toBe(2)
    expect(c.conexionesBd).toBe(5)
    expect(c.vigenciaCacheMs).toBe(30 * 24 * 60 * 60_000)
    expect(c.limites).toEqual({ registrosPorIp: 400, intentosDeSesion: 5, teselasPorMinuto: 6000 })
  })

  it('lo obligatorio o mal escrito no deja arrancar', () => {
    const { JWT_SECRETO: _, ...sinSecreto } = MINIMO
    expect(() => leerConfiguracion(sinSecreto)).toThrow()
    expect(() => leerConfiguracion({ ...MINIMO, JWT_SECRETO: 'corto' })).toThrow('32')
    expect(() => leerConfiguracion({ ...MINIMO, ORIGEN_WEB: 'app.ejemplo.pe' })).toThrow()
    expect(() => leerConfiguracion({ ...MINIMO, CONEXIONES_BD: '0' })).toThrow()
    expect(() => leerConfiguracion({ ...MINIMO, LIMITE_TESELAS_POR_MINUTO: 'muchas' })).toThrow()
    expect(() => leerConfiguracion({ ...MINIMO, COOKIE_ENTRE_SITIOS: 'true' })).toThrow()
  })
})
