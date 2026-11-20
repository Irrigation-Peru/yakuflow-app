import { describe, expect, it } from 'vitest'
import { cifra, cultivoEnFrase } from '../src/formato.ts'

// Cómo se escriben las cifras y los cultivos dentro de una frase: como se diría en voz alta, sin «12.0 h» ni
// «arveja, verde».

describe('cifra en una frase', () => {
  it('sin ceros que sobran', () => {
    expect(cifra(12, 1)).toBe('12')
    expect(cifra(7.5, 1)).toBe('7.5')
    expect(cifra(1, 2)).toBe('1')
    expect(cifra(0.35, 2)).toBe('0.35')
  })

  it('con la coma de miles, como en el resto de la app', () => {
    expect(cifra(3003.4, 0)).toBe('3,003')
  })
})

describe('cultivo en una frase', () => {
  it('sin la coma del catálogo', () => {
    expect(cultivoEnFrase('Arveja, verde')).toBe('arveja verde')
    expect(cultivoEnFrase('Haba, grano seco')).toBe('haba en grano seco')
    expect(cultivoEnFrase('Maíz, grano')).toBe('maíz en grano')
    expect(cultivoEnFrase('Papa')).toBe('papa')
  })

  it('con su artículo, también el haba y los que no están en el catálogo', () => {
    expect(cultivoEnFrase('Arveja, verde', 'el')).toBe('la arveja verde')
    expect(cultivoEnFrase('Haba, verde', 'el')).toBe('el haba verde')
    expect(cultivoEnFrase('Maíz, grano', 'el')).toBe('el maíz en grano')
    expect(cultivoEnFrase('Quinua', 'el')).toBe('la quinua')
    expect(cultivoEnFrase('Olluco', 'el')).toBe('el olluco')
  })

  it('con «a» y «de» se contrae: al maíz, del maíz', () => {
    expect(cultivoEnFrase('Maíz, grano', 'a')).toBe('al maíz en grano')
    expect(cultivoEnFrase('Papa', 'a')).toBe('a la papa')
    expect(cultivoEnFrase('Haba, verde', 'de')).toBe('del haba verde')
  })
})
