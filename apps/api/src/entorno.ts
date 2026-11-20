// En desarrollo, las variables vienen de apps/api/.env; en producción, del panel del proveedor. Se importa
// primero en cada punto de entrada (el servidor y las herramientas de línea de comandos).
try {
  process.loadEnvFile()
} catch {
  // Sin .env: las variables ya están en el entorno.
}
