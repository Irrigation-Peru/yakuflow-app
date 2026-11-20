import { demandaDeLaCampana, planDeRiegoPorEtapa, type CambioDeRed, type CatalogoDePrecios } from '@riego/calculo'
import { cultivoLlamado, riegoDeLaCampana } from './campana.ts'
import { laRedDelEstudiante, type PlanteamientoDeLaRed } from './red.ts'

// Lo que el paso 8 muestra y lleva al informe, calculado con el mismo módulo que los pasos anteriores: nada se escribe a
// mano y nada se guarda aparte (HU0028, criterio 2).

export function informeDelProyecto(planteamiento: PlanteamientoDeLaRed, cambios: readonly CambioDeRed[], precios: CatalogoDePrecios | null) {
  const laRed = laRedDelEstudiante(planteamiento, cambios, precios)
  const { contorno: _contorno, puntoDeLaFuente: _fuente, camaras: _camaras, grilla: _grilla, ...campana } = planteamiento
  const { balance, diseno } = riegoDeLaCampana(campana)
  if (!balance || !diseno) throw new Error('Falta el diseño agronómico del paso 4')
  const cultivo = cultivoLlamado(planteamiento.cultivo)
  const demanda = demandaDeLaCampana({ cultivo, fechaSiembra: planteamiento.fechaSiembra, clima: planteamiento.lugar.clima })
  // La raíz crece hasta el inicio de la etapa media: en las primeras etapas se riega con la lámina que ella aprovecha.
  const raiz = {
    aguaFacilMmPorM: diseno.aguaFacilmenteAprovechableMm / diseno.profundidadRadicularM,
    profundidadMaximaM: diseno.profundidadRadicularM,
    diaDeRaizMaxima: cultivo.etapas.inicial + cultivo.etapas.desarrollo + 1,
  }
  return {
    laRed,
    balance,
    diseno,
    demandaNetaPicoMmDia: demanda.demandaNetaPicoMmDia,
    plan: planDeRiegoPorEtapa({ dias: demanda.dias, laminaNetaMm: diseno.laminaNetaMm, intervaloDeDisenoDias: diseno.intervaloDias, tiempoDeRiegoDelDisenoH: diseno.tiempoDeRiegoH, raiz }),
  }
}

export type InformeDelProyecto = ReturnType<typeof informeDelProyecto>
