import { describe, expect, it } from 'vitest'
import * as calculo from '../src/index'

describe('contrato público del módulo', () => {
  it('expone los cálculos que usan la interfaz, la verificación y los modelos', () => {
    for (const nombre of [
      'calcularRed',
      'tramoDelMetodo',
      'uniformidadDistribucion',
      'demandaDeLaCampana',
      'aguaUtilTotal',
      'areaMaximaRegable',
      'disenoAgronomico',
      'areaDePoligono',
      'desnivelDisponible',
      'generadorConSemilla',
    ]) {
      expect(typeof (calculo as Record<string, unknown>)[nombre], nombre).toBe('function')
    }
  })
})
