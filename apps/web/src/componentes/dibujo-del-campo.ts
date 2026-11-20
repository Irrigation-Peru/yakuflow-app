// Lo que hace que el corte del suelo se parezca a un campo: el cielo, el suelo con su color y su grano, las plantas
// del cultivo encima y sus raíces abajo. Es solo dibujo: las medidas (hasta dónde moja, hasta dónde llega la raíz) las
// pone el cálculo, y aquí no se toca ninguna. Lo que parece al azar sale de una semilla fija, para que el dibujo no
// cambie cada vez que se vuelve a pintar.

type Ctx = CanvasRenderingContext2D
type Caja = { izquierda: number; derecha: number; arriba: number; abajo: number }

export type FormaDePlanta = 'maiz' | 'gramínea' | 'mata'

/** El cultivo, por su nombre del catálogo, a una de tres formas reconocibles. */
export function formaDePlanta(cultivo: string | undefined): FormaDePlanta {
  const nombre = (cultivo ?? '').toLowerCase()
  if (nombre.includes('maíz') || nombre.includes('maiz')) return 'maiz'
  if (/cebada|trigo|avena|arroz|centeno|pasto|rye|alfalfa/.test(nombre)) return 'gramínea'
  return 'mata'
}

/** Un generador de números al azar con semilla (mulberry32): mismo dibujo en cada repintado. */
function azar(semilla: number) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function dibujarCielo(ctx: Ctx, caja: Caja) {
  const cielo = ctx.createLinearGradient(0, caja.arriba, 0, caja.abajo)
  cielo.addColorStop(0, '#eef6fc')
  cielo.addColorStop(1, '#ffffff')
  ctx.fillStyle = cielo
  ctx.fillRect(caja.izquierda, caja.arriba, caja.derecha - caja.izquierda, caja.abajo - caja.arriba)
}

/** El suelo: más oscuro arriba, donde hay materia orgánica, y con grano. */
export function dibujarSuelo(ctx: Ctx, caja: Caja) {
  const suelo = ctx.createLinearGradient(0, caja.arriba, 0, caja.abajo)
  suelo.addColorStop(0, '#b08d68')
  suelo.addColorStop(0.18, '#c4a47f')
  suelo.addColorStop(1, '#e3d3bb')
  ctx.fillStyle = suelo
  ctx.fillRect(caja.izquierda, caja.arriba, caja.derecha - caja.izquierda, caja.abajo - caja.arriba)
  const r = azar(29733)
  const area = (caja.derecha - caja.izquierda) * (caja.abajo - caja.arriba)
  for (let i = 0; i < area / 55; i++) {
    const px = caja.izquierda + r() * (caja.derecha - caja.izquierda)
    const py = caja.arriba + r() * (caja.abajo - caja.arriba)
    const claro = r() > 0.5
    ctx.fillStyle = claro ? 'rgba(255, 248, 235, 0.55)' : 'rgba(92, 64, 40, 0.28)'
    const lado = r() < 0.12 ? 2.2 : 1.2
    ctx.fillRect(px, py, lado, lado)
  }
  // Algunas piedritas.
  for (let i = 0; i < area / 4000; i++) {
    const px = caja.izquierda + r() * (caja.derecha - caja.izquierda)
    const py = caja.arriba + 8 + r() * (caja.abajo - caja.arriba - 8)
    ctx.fillStyle = 'rgba(120, 100, 82, 0.45)'
    ctx.beginPath()
    ctx.ellipse(px, py, 2 + r() * 3, 1.5 + r() * 2, r() * Math.PI, 0, 2 * Math.PI)
    ctx.fill()
  }
}

/** Las raíces de una planta: una principal y ramas que se abren, hasta la profundidad que da el cálculo. */
export function dibujarRaices(ctx: Ctx, xCentro: number, ySuelo: number, yFondo: number, anchoMaximo: number, forma: FormaDePlanta, semilla: number) {
  const r = azar(semilla)
  const hondo = yFondo - ySuelo
  if (hondo <= 2) return
  ctx.save()
  ctx.strokeStyle = 'rgba(96, 62, 30, 0.75)'
  ctx.lineCap = 'round'
  const ramas = forma === 'gramínea' ? 9 : forma === 'maiz' ? 7 : 6
  for (let i = 0; i < ramas; i++) {
    // Las de las gramíneas y el maíz son fibrosas y bajan casi rectas; las de una mata se abren más.
    const abre = (forma === 'mata' ? 0.55 : 0.32) * anchoMaximo * (i / (ramas - 1) - 0.5) * 2
    const llega = hondo * (0.55 + 0.45 * r()) * (i === Math.floor(ramas / 2) ? 1.0 / (0.55 + 0.45) : 1)
    ctx.lineWidth = i === Math.floor(ramas / 2) ? 1.8 : 1.1
    ctx.beginPath()
    ctx.moveTo(xCentro, ySuelo)
    let px = xCentro
    let py = ySuelo
    const pasos = 7
    for (let k = 1; k <= pasos; k++) {
      const t = k / pasos
      const nx = xCentro + abre * Math.sin((t * Math.PI) / 2) + (r() - 0.5) * 5
      const ny = ySuelo + Math.min(llega, hondo) * t
      ctx.quadraticCurveTo(px + (r() - 0.5) * 6, (py + ny) / 2, nx, ny)
      // Pelos laterales cortos.
      if (k > 1 && r() < 0.6) {
        const lado = r() < 0.5 ? -1 : 1
        ctx.moveTo(nx, ny)
        ctx.lineTo(nx + lado * (4 + r() * 8), ny + 3 + r() * 6)
        ctx.moveTo(nx, ny)
      }
      px = nx
      py = ny
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** La planta sobre la superficie, de `alto` px, con la forma de su cultivo. */
export function dibujarPlanta(ctx: Ctx, xCentro: number, ySuelo: number, alto: number, forma: FormaDePlanta, semilla: number) {
  const r = azar(semilla)
  ctx.save()
  ctx.lineCap = 'round'
  const verde = '#2f8a3e'
  const verdeOscuro = '#1f6a2c'
  if (forma === 'maiz') {
    ctx.strokeStyle = verdeOscuro
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.moveTo(xCentro, ySuelo)
    ctx.lineTo(xCentro, ySuelo - alto)
    ctx.stroke()
    ctx.strokeStyle = verde
    ctx.lineWidth = 2
    for (let i = 0; i < 6; i++) {
      const ny = ySuelo - alto * (0.2 + 0.13 * i)
      const lado = i % 2 === 0 ? -1 : 1
      const largo = alto * (0.42 - 0.03 * i)
      ctx.beginPath()
      ctx.moveTo(xCentro, ny)
      ctx.quadraticCurveTo(xCentro + lado * largo * 0.6, ny - largo * 0.45, xCentro + lado * largo, ny + largo * 0.15)
      ctx.stroke()
    }
    // La panoja arriba.
    ctx.strokeStyle = '#c9a646'
    ctx.lineWidth = 1.4
    for (const lado of [-1, 0, 1]) {
      ctx.beginPath()
      ctx.moveTo(xCentro, ySuelo - alto)
      ctx.lineTo(xCentro + lado * 4, ySuelo - alto - 7)
      ctx.stroke()
    }
  } else if (forma === 'gramínea') {
    for (let i = 0; i < 9; i++) {
      const lado = (i / 8 - 0.5) * 2
      const altoTallo = alto * (0.75 + 0.25 * r())
      ctx.strokeStyle = i % 2 ? verde : verdeOscuro
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.moveTo(xCentro + lado * 2, ySuelo)
      ctx.quadraticCurveTo(xCentro + lado * 4, ySuelo - altoTallo * 0.6, xCentro + lado * 9, ySuelo - altoTallo)
      ctx.stroke()
      if (i % 2 === 0) {
        // La espiga.
        ctx.fillStyle = '#c9a646'
        ctx.beginPath()
        ctx.ellipse(xCentro + lado * 9, ySuelo - altoTallo - 3, 1.8, 4, lado * 0.4, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
  } else {
    // Una mata: tallos cortos y hojas redondeadas (papa, haba, hortalizas).
    ctx.strokeStyle = verdeOscuro
    ctx.lineWidth = 1.6
    for (const lado of [-1, -0.4, 0.3, 1]) {
      ctx.beginPath()
      ctx.moveTo(xCentro, ySuelo)
      ctx.quadraticCurveTo(xCentro + lado * 4, ySuelo - alto * 0.5, xCentro + lado * alto * 0.35, ySuelo - alto * (0.75 + 0.2 * r()))
      ctx.stroke()
    }
    for (let i = 0; i < 11; i++) {
      const angulo = Math.PI * (0.1 + 0.8 * r())
      const radio = alto * (0.3 + 0.45 * r())
      const hx = xCentro - Math.cos(angulo) * radio
      const hy = ySuelo - Math.sin(angulo) * radio
      ctx.fillStyle = i % 3 === 0 ? verdeOscuro : verde
      ctx.beginPath()
      ctx.ellipse(hx, hy, 4.5, 3, angulo, 0, 2 * Math.PI)
      ctx.fill()
    }
  }
  ctx.restore()
}
