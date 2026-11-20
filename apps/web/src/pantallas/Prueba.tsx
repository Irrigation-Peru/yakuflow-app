import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { api, ErrorDeApi } from '../api/cliente.ts'
import type { ItemDePrueba } from '../api/tipos.ts'
import { BotonConConfirmacion } from '../componentes/BotonConConfirmacion.tsx'
import { useRegistrar } from '../registro/contexto.ts'

// Las pruebas de entrada (HU0006, criterio 3) y de salida (HU0030). Un ítem a la vez; cada respuesta se guarda al
// marcarla, con el tiempo que el estudiante pasó en el ítem. No se avanza sin marcar una alternativa, y no se muestra si
// acertó: la prueba mide, no enseña.

const DE_LA_PRUEBA = {
  entrada: { titulo: 'Prueba de entrada', paso: 0, abierta: 'pruebaDeEntradaAbierta', terminada: 'pruebaDeEntradaTerminada' },
  salida: { titulo: 'Prueba de salida', paso: 8, abierta: 'pruebaDeSalidaAbierta', terminada: 'pruebaDeSalidaTerminada' },
} as const

export function Prueba({ tipo }: { tipo: 'entrada' | 'salida' }) {
  const { titulo, paso, abierta, terminada } = DE_LA_PRUEBA[tipo]
  const consultas = useQueryClient()
  const registrar = useRegistrar()
  const prueba = useQuery({
    queryKey: ['prueba', tipo],
    queryFn: () => api<{ items: ItemDePrueba[] }>(`/evaluaciones/${tipo}`, { metodo: 'POST' }),
    staleTime: Infinity,
  })
  const items = prueba.data?.items ?? []
  const [indice, setIndice] = useState(0)
  const formulario = useForm<Record<string, string>>()
  const marcadas = useWatch({ control: formulario.control })

  // Tiempo en cada ítem, sumando las veces que el estudiante vuelve a él.
  const tiempos = useRef(new Map<string, number>())
  const desde = useRef(0)
  const actual = items[indice]
  const segundosEn = (id: string) => Math.round(((tiempos.current.get(id) ?? 0) + Date.now() - desde.current) / 1000)

  useEffect(() => {
    if (!prueba.data) return
    formulario.reset(Object.fromEntries(prueba.data.items.filter((i) => i.marcada).map((i) => [i.id, i.marcada!])))
    desde.current = Date.now()
    registrar({ paso, accion: abierta })
    // Solo al llegar los ítems.
  }, [prueba.data]) // oxlint-disable-line react-hooks/exhaustive-deps

  function irA(nuevo: number) {
    if (actual) tiempos.current.set(actual.id, (tiempos.current.get(actual.id) ?? 0) + Date.now() - desde.current)
    desde.current = Date.now()
    setIndice(nuevo)
  }

  const guardar = useMutation({
    mutationFn: ({ id, alternativa }: { id: string; alternativa: string }) =>
      api(`/evaluaciones/${tipo}/respuestas/${id}`, { metodo: 'PUT', cuerpo: { alternativa, segundos: segundosEn(id) } }),
  })

  const terminar = useMutation({
    mutationFn: () => api(`/evaluaciones/${tipo}/fin`, { metodo: 'POST' }),
    onSuccess: async () => {
      registrar({ paso, accion: terminada })
      await consultas.invalidateQueries({ queryKey: ['estado'] })
    },
  })

  if (prueba.isPending) return <p className="cargando" role="status">Preparando la prueba…</p>
  // Sin ítems o sin conexión, la pantalla lo dice y deja volver a intentar: nunca queda en blanco.
  if (prueba.error || !actual) {
    return (
      <div className="angosto prueba">
        <p className="error" role="alert">
          {prueba.error ? prueba.error.message : 'La prueba todavía no tiene preguntas cargadas. Avísale a tu docente.'}
        </p>
        <div className="acciones izquierda">
          <button onClick={() => void prueba.refetch()}>Volver a intentar</button>
        </div>
      </div>
    )
  }

  const respondidas = items.filter((i) => marcadas[i.id]).length
  const marcada = Boolean(marcadas[actual.id])
  const ultimo = indice === items.length - 1
  const error = guardar.error ?? terminar.error

  return (
    <div className="angosto prueba">
      <h2>{titulo}</h2>
      <div className="progreso" role="progressbar" aria-label="Ítems respondidos" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={respondidas}>
        <div style={{ width: `${(100 * respondidas) / items.length}%` }} />
      </div>
      <p className="rotulo entre">
        <span>
          Ítem {indice + 1} de {items.length}
        </span>
        <span>No se muestra si acertaste</span>
      </p>

      <fieldset className="item" key={actual.id}>
        <legend>{actual.enunciado}</legend>
        {actual.alternativas.map((alternativa) => (
          <label key={alternativa.letra} className="alternativa">
            <input
              type="radio"
              value={alternativa.letra}
              {...formulario.register(actual.id, {
                onChange: (e) => guardar.mutate({ id: actual.id, alternativa: e.target.value as string }),
              })}
            />
            {alternativa.texto}
          </label>
        ))}
      </fieldset>

      {error && (
        <p className="error" role="alert">
          {error instanceof ErrorDeApi ? error.message : 'No se pudo guardar; intenta de nuevo'}
        </p>
      )}
      {/* Oculta y no quitada: al marcar, los botones no se mueven bajo el cursor. */}
      <p className="nota" style={marcada ? { visibility: 'hidden' } : undefined}>
        Marca una alternativa para seguir.
      </p>
      <div className="acciones">
        <button disabled={indice === 0} onClick={() => irA(indice - 1)}>
          Anterior
        </button>
        {ultimo ? (
          <BotonConConfirmacion
            className="primario"
            disabled={respondidas < items.length || terminar.isPending}
            titulo="¿Terminar la prueba?"
            detalle={<p>Respondiste los {items.length} ítems. Después de terminar ya no podrás cambiar tus respuestas.</p>}
            confirmar="Terminar la prueba"
            alConfirmar={() => terminar.mutate()}
          >
            {respondidas < items.length ? `Faltan ${items.length - respondidas}` : 'Terminar la prueba'}
          </BotonConConfirmacion>
        ) : (
          <button className="primario" disabled={!marcada} onClick={() => irA(indice + 1)}>
            Siguiente
          </button>
        )}
      </div>
    </div>
  )
}
