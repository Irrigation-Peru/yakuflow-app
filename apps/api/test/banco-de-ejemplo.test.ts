import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { revisarBanco } from '../src/instrumento/banco.ts'

it('el banco de ejemplo tiene el formato correcto y no pasa por aprobado', () => {
  const banco = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'instrumento', 'banco-de-ejemplo.json'), 'utf8'))
  const revision = revisarBanco(banco)
  expect(revision.aprobado).toBe(false)
  expect(revision.observaciones.every((o) => o.endsWith('tiene 0 expertos conformes y necesita 2'))).toBe(true)
})
