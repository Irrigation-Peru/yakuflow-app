import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { cloneElement, isValidElement, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api, ErrorDeApi } from '../api/cliente.ts'
import { useConsentimiento } from '../api/consultas.ts'
import { TextoDelConsentimiento } from '../componentes/TextoDelConsentimiento.tsx'
import { cuentaDeDemostracion, type CuentaDeDemostracion } from '../demo.ts'
import { IconoMarca } from '../componentes/Iconos.tsx'

// Paso 0 (HU0006): crear la cuenta con el correo de la universidad y el código del curso, aceptando el
// consentimiento antes de dejar cualquier dato; o volver a entrar con una cuenta que ya existe.

const cuentaNueva = z
  .object({
    correo: z.email('Escribe tu correo de la universidad'),
    codigoCurso: z.string().trim().min(1, 'Pídele el código del curso a tu docente'),
    nombres: z.string().trim().min(1, 'Escribe tus nombres'),
    contrasena: z.string().min(10, 'Usa al menos 10 caracteres'),
    repetir: z.string(),
    acepto: z.boolean().refine((v) => v, 'Para participar tienes que aceptar el consentimiento'),
  })
  .refine((d) => d.contrasena === d.repetir, { path: ['repetir'], message: 'Las contraseñas no coinciden' })

// Solo en desarrollo: fuera de él la condición es falsa al compilar y el build no lleva ni el correo ni la contraseña.
const DEMO = import.meta.env.DEV ? cuentaDeDemostracion(import.meta.env.VITE_DEMO_CORREO, import.meta.env.VITE_DEMO_CONTRASENA) : null

const sesion = z.object({
  correo: z.email('Escribe tu correo de la universidad'),
  contrasena: z.string().min(1, 'Escribe tu contraseña'),
})

export function Entrar() {
  const [modo, setModo] = useState<'nueva' | 'sesion'>('nueva')
  return (
    <div className="marco">
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
          <p className="encabezado-titulo">Proyecto de campaña de cultivo</p>
        </div>
      </header>
      <main className="contenido angosto">
        {DEMO && <EntrarConLaDemo cuenta={DEMO} />}
        {/* Pestañas con el patrón de WAI-ARIA: solo la elegida entra al recorrido con Tab; las flechas cambian de una a otra. */}
        <div
          className="pestanas"
          role="tablist"
          aria-label="Cómo entrar"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
            const otro = modo === 'nueva' ? 'sesion' : 'nueva'
            setModo(otro)
            document.getElementById(`pestana-${otro}`)?.focus()
          }}
        >
          {(
            [
              ['nueva', 'Crear mi cuenta'],
              ['sesion', 'Ya tengo cuenta'],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              id={`pestana-${valor}`}
              role="tab"
              aria-selected={modo === valor}
              aria-controls="panel-de-entrada"
              tabIndex={modo === valor ? 0 : -1}
              onClick={() => setModo(valor)}
            >
              {texto}
            </button>
          ))}
        </div>
        <div id="panel-de-entrada" role="tabpanel" aria-labelledby={`pestana-${modo}`}>
          {modo === 'nueva' ? <CuentaNueva /> : <IniciarSesion />}
        </div>
      </main>
    </div>
  )
}

function CuentaNueva() {
  const consultas = useQueryClient()
  const consentimiento = useConsentimiento()
  const [error, setError] = useState<string | null>(null)
  const formulario = useForm({ resolver: zodResolver(cuentaNueva), defaultValues: { acepto: false } })
  const { errors, isSubmitting } = formulario.formState

  const crear = formulario.handleSubmit(async ({ correo, codigoCurso, nombres, contrasena }) => {
    setError(null)
    try {
      await api('/cuenta', { metodo: 'POST', cuerpo: { correo, codigoCurso, nombres, contrasena } })
      await api('/consentimiento', { metodo: 'POST', cuerpo: { version: consentimiento.data?.version } })
      await consultas.invalidateQueries({ queryKey: ['estado'] })
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo crear la cuenta')
    }
  })

  return (
    <form onSubmit={crear} noValidate>
      <h2>Tu cuenta</h2>
      <div className="campos dos">
        <Campo etiqueta="Correo de la universidad" error={errors.correo?.message}>
          <input type="email" autoComplete="email" placeholder="nombre@undac.edu.pe" {...formulario.register('correo')} />
        </Campo>
        <Campo etiqueta="Código del curso" error={errors.codigoCurso?.message}>
          <input autoComplete="off" {...formulario.register('codigoCurso')} />
        </Campo>
        <Campo etiqueta="Nombres" error={errors.nombres?.message}>
          <input autoComplete="given-name" {...formulario.register('nombres')} />
        </Campo>
        <span />
        <Campo etiqueta="Contraseña" error={errors.contrasena?.message}>
          <input type="password" autoComplete="new-password" {...formulario.register('contrasena')} />
        </Campo>
        <Campo etiqueta="Repetir la contraseña" error={errors.repetir?.message}>
          <input type="password" autoComplete="new-password" {...formulario.register('repetir')} />
        </Campo>
      </div>

      <h2>Consentimiento informado</h2>
      <TextoDelConsentimiento />
      <label className="casilla">
        <input type="checkbox" {...formulario.register('acepto')} /> He leído y acepto participar
      </label>
      {errors.acepto && <p className="error" role="alert">{errors.acepto.message}</p>}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="primario" disabled={isSubmitting || !consentimiento.data}>
          {isSubmitting ? 'Creando la cuenta…' : 'Continuar a la prueba de entrada'}
        </button>
      </div>
    </form>
  )
}

function IniciarSesion() {
  const consultas = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const formulario = useForm({ resolver: zodResolver(sesion) })
  const { errors, isSubmitting } = formulario.formState

  const entrar = formulario.handleSubmit(async (datos) => {
    setError(null)
    try {
      await api('/sesion', { metodo: 'POST', cuerpo: datos })
      await consultas.invalidateQueries({ queryKey: ['estado'] })
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo iniciar la sesión')
    }
  })

  return (
    <form onSubmit={entrar} noValidate>
      <h2>Entrar</h2>
      <div className="campos">
        <Campo etiqueta="Correo de la universidad" error={errors.correo?.message}>
          <input type="email" autoComplete="email" {...formulario.register('correo')} />
        </Campo>
        <Campo etiqueta="Contraseña" error={errors.contrasena?.message}>
          <input type="password" autoComplete="current-password" {...formulario.register('contrasena')} />
        </Campo>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="primario" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </form>
  )
}

function EntrarConLaDemo({ cuenta }: { cuenta: CuentaDeDemostracion }) {
  const consultas = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  const entrar = async () => {
    setError(null)
    setEntrando(true)
    try {
      await api('/sesion', { metodo: 'POST', cuerpo: cuenta })
      await consultas.invalidateQueries({ queryKey: ['estado'] })
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo iniciar la sesión')
      setEntrando(false)
    }
  }

  return (
    <aside className="demo" aria-label="Cuenta de demostración">
      <p>
        <strong>Solo para pruebas.</strong> Una cuenta de demostración que aparece únicamente en desarrollo.
      </p>
      <dl>
        <dt>Correo</dt>
        <dd>{cuenta.correo}</dd>
        <dt>Contraseña</dt>
        <dd>{cuenta.contrasena}</dd>
      </dl>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" onClick={() => void entrar()} disabled={entrando}>
        {entrando ? 'Entrando…' : 'Entrar con la cuenta de demostración'}
      </button>
    </aside>
  )
}

export function Campo({ etiqueta, error, children }: { etiqueta: string; error?: string; children: React.ReactNode }) {
  // El error queda ligado a su campo: el lector de pantalla lo lee al llegar al campo y lo marca como inválido (WCAG 3.3.1).
  const id = useId()
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, { 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : undefined })
    : children
  return (
    <label className="campo">
      <span className="campo-etiqueta">{etiqueta}</span>
      {control}
      {error && (
        <span className="error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </label>
  )
}
