import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generado/prisma/client.ts'

export type Bd = PrismaClient

export function crearBd(url: string, conexiones = 10): Bd {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: conexiones }) })
}
