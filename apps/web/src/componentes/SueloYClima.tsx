import { zodResolver } from '@hookform/resolvers/zod'
import { resumenDelClima } from '@riego/calculo'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api } from '../api/cliente.ts'
import { claveDeLosDatosDelLugar, claveDelProyecto, useDatosDelLugar } from '../api/consultas.ts'
import type { DatosDelLugar, LugarDelProyecto, SueloDelLugar } from '../api/tipos.ts'
import { conDecimales } from '../formato.ts'
import { sueloVigente } from '../lugar-del-cultivo.ts'
import { Campo } from '../pantallas/Entrar.tsx'
import { useRegistrar } from '../registro/contexto.ts'
import { Dato } from './Dato.tsx'

// El suelo y el clima del lugar (HU0009), con su origen y su resolución: no se escriben, salen de las fuentes
// oficiales por las coordenadas de la parcela. Lo único que el estudiante puede cambiar es la textura, con la
// granulometría de una muestra que tomó en campo; el dato satelital se conserva para compararlos.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']

const muestraDeCampo = z
  .object({
    arenaPct: z.number({ error: 'Escribe el porcentaje de arena' }).min(0).max(100),
    arcillaPct: z.number({ error: 'Escribe el porcentaje de arcilla' }).min(0).max(100),
  })
  .refine((m) => m.arenaPct + m.arcillaPct <= 100, { message: 'Arena y arcilla no pueden pasar de 100 %', path: ['arcillaPct'] })
type MuestraDeCampo = z.infer<typeof muestraDeCampo>

/** De dónde sale el dato y cada cuánto hay uno (HU0009, criterio 2): siempre a la vista, debajo de los datos. */
function Origen({ fuente, resolucion }: { fuente: string; resolucion: string }) {
  return (
    <p className="nota origen">
      <strong>De dónde sale:</strong> {fuente}
      <br />
      <strong>Resolución:</strong> {resolucion}
    </p>
  )
}

const granulometria = (s: SueloDelLugar) =>
  `${conDecimales(s.arenaPct, 0)} · ${conDecimales(s.limoPct, 0)} · ${conDecimales(s.arcillaPct, 0)} %`

export function SueloYClima({ proyecto }: { proyecto: LugarDelProyecto }) {
  const consultas = useQueryClient()
  const registrar = useRegistrar()
  const datos = useDatosDelLugar(proyecto)
  const [corrigiendo, setCorrigiendo] = useState(false)
  const formulario = useForm<MuestraDeCampo>({ resolver: zodResolver(muestraDeCampo) })
  const guardar = useMutation({
    mutationFn: (muestra: MuestraDeCampo) => api<DatosDelLugar>(`/proyectos/${proyecto.id}/suelo`, { metodo: 'PUT', cuerpo: muestra }),
    onSuccess: (nuevos) => {
      consultas.setQueryData(claveDeLosDatosDelLugar(proyecto), nuevos)
      // Lo que ya se decidió con el otro suelo queda por revisar: el proyecto trae la marca.
      void consultas.invalidateQueries({ queryKey: claveDelProyecto(proyecto.id) })
      registrar({ paso: 1, accion: 'sueloCorregido', detalle: { clase: nuevos.suelo.campo?.clase }, proyectoId: proyecto.id })
      setCorrigiendo(false)
    },
  })

  if (!proyecto.parcela) return null
  if (datos.isPending) return <p className="aviso">Buscando el suelo y el clima del lugar…</p>
  if (datos.error) return <p className="error" role="alert">{datos.error.message}</p>

  const { clima, suelo, errores } = datos.data
  const vigente = sueloVigente(datos.data)
  const resumen = clima && resumenDelClima({ normales: clima.meses, clima: clima.meses })
  const errorDelFormulario = formulario.formState.errors

  return (
    <section aria-label="Suelo y clima del lugar">
      <h3 className="rotulo">El suelo de tu parcela</h3>
      {errores.suelo && <p className="alerta">{errores.suelo}</p>}
      {vigente && (
        <>
          <dl className="datos">
            <Dato nombre="Textura" ayuda="si es arenoso, franco o arcilloso" valor={vigente.clase} />
            <Dato nombre="Arena · limo · arcilla" valor={granulometria(vigente)} />
            <Dato nombre="pH" ayuda="qué tan ácido o alcalino es" valor={vigente.ph !== null && conDecimales(vigente.ph, 1)} />
            <Dato nombre="Infiltración básica" ayuda="qué tan rápido absorbe el agua" valor={`${conDecimales(vigente.infiltracionBasicaMmH, 1)} mm/h`} />
          </dl>
          <Origen fuente={vigente.fuente} resolucion={vigente.resolucion} />
          {suelo.vigente === 'campo' && suelo.satelital && (
            <p className="nota">
              Antes de tu muestra, el dato satelital decía {suelo.satelital.clase} ({granulometria(suelo.satelital)}). Ahora se usa lo que
              mediste.
            </p>
          )}
        </>
      )}
      {!corrigiendo ? (
        <div className="acciones izquierda">
          <button onClick={() => setCorrigiendo(true)}>Corregir con dato de campo</button>
        </div>
      ) : (
        <form
          className="muestra-de-campo"
          noValidate
          onSubmit={formulario.handleSubmit((muestra) => guardar.mutate(muestra))}
          aria-label="Granulometría de la muestra de campo"
        >
          <p className="nota">Escribe cuánta arena y cuánta arcilla tiene tu muestra. El limo es lo que falta para llegar a 100 %.</p>
          <div className="campos dos">
            <Campo etiqueta="Arena · %" error={errorDelFormulario.arenaPct?.message}>
              <input type="number" step="1" min="0" max="100" inputMode="decimal" {...formulario.register('arenaPct', { valueAsNumber: true })} />
            </Campo>
            <Campo etiqueta="Arcilla · %" error={errorDelFormulario.arcillaPct?.message}>
              <input type="number" step="1" min="0" max="100" inputMode="decimal" {...formulario.register('arcillaPct', { valueAsNumber: true })} />
            </Campo>
          </div>
          {guardar.error && <p className="error" role="alert">{guardar.error.message}</p>}
          <div className="acciones">
            <button type="button" onClick={() => setCorrigiendo(false)}>
              Cancelar
            </button>
            <button className="primario" disabled={guardar.isPending}>
              {guardar.isPending ? 'Guardando…' : 'Usar mi muestra'}
            </button>
          </div>
        </form>
      )}

      <h3 className="rotulo">El clima del lugar en un año</h3>
      {errores.clima && <p className="alerta">{errores.clima}</p>}
      {clima && resumen && (
        <>
          <dl className="datos">
            <Dato nombre="Temperatura media" valor={`${conDecimales(resumen.temperaturaMediaAnualC, 1)} °C`} />
            <Dato
              nombre={`Mínima del mes más frío (${MESES[resumen.mesMasFrio - 1]})`}
              ayuda="lo que bajan las noches, en promedio"
              valor={`${conDecimales(resumen.minimaDelMesMasFrioC, 1)} °C`}
            />
            <Dato nombre="ET₀ media" ayuda="el agua que pierde al día un pasto de referencia; de ahí sale lo que gasta tu cultivo" valor={`${conDecimales(resumen.et0MediaMmDia, 1)} mm/día`} />
            <Dato nombre="Lluvia del año" valor={`${conDecimales(resumen.lluviaAnualMm, 0)} mm`} />
          </dl>
          <Origen fuente={clima.fuente} resolucion={clima.resolucion} />
        </>
      )}
    </section>
  )
}
