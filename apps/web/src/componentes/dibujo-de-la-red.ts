// Lo que hace que la red en planta se parezca al campo: el terreno de alrededor, la parcela con su suelo y las hileras
// del cultivo, y los elementos dibujados como lo que son (la poza de la fuente, la caseta del cabezal, la caja de la
// cámara, la válvula). Es solo dibujo: las posiciones vienen de la red y no se toca ninguna medida. Lo que parece al
// azar sale de una semilla fija, para que el dibujo no cambie en cada repintado.

type Ctx = CanvasRenderingContext2D

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

/** El terreno de alrededor: pasto ralo de puna o de valle, con algo de grano. */
export function dibujarTerreno(ctx: Ctx, ancho: number, alto: number) {
  ctx.fillStyle = '#e9eddc'
  ctx.fillRect(0, 0, ancho, alto)
  const r = azar(7151)
  for (let i = 0; i < (ancho * alto) / 90; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(120, 140, 80, 0.22)' : 'rgba(170, 150, 110, 0.20)'
    ctx.fillRect(r() * ancho, r() * alto, 1.6, 1.6)
  }
}

/** La parcela: tierra preparada dentro del contorno. */
export function dibujarParcela(ctx: Ctx, camino: () => void) {
  ctx.save()
  camino()
  ctx.fillStyle = '#e3cfa8'
  ctx.fill()
  ctx.clip()
  const caja = ctx.canvas
  const r = azar(4421)
  const ancho = caja.width
  const alto = caja.height
  for (let i = 0; i < (ancho * alto) / 260; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(140, 105, 65, 0.22)' : 'rgba(255, 250, 240, 0.45)'
    ctx.fillRect(r() * ancho, r() * alto, 1.4, 1.4)
  }
  ctx.restore()
}

/** Las plantas a lo largo de una hilera, de a en `paso` px, apenas corridas para que no parezcan una regla. */
export function dibujarHilera(ctx: Ctx, ax: number, ay: number, bx: number, by: number, paso: number, semilla: number) {
  const largo = Math.hypot(bx - ax, by - ay)
  if (largo < 1) return
  const r = azar(semilla)
  const n = Math.max(1, Math.floor(largo / paso))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const px = ax + t * (bx - ax) + (r() - 0.5) * 1.2
    const py = ay + t * (by - ay) + (r() - 0.5) * 1.2
    ctx.fillStyle = r() < 0.3 ? 'rgba(52, 120, 60, 0.55)' : 'rgba(96, 156, 82, 0.5)'
    ctx.beginPath()
    ctx.arc(px, py, 1.3 + r() * 0.9, 0, 2 * Math.PI)
    ctx.fill()
  }
}

function rotulo(ctx: Ctx, texto: string, px: number, py: number) {
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.lineWidth = 3.5
  ctx.strokeText(texto, px, py)
  ctx.fillStyle = '#1f2937'
  ctx.fillText(texto, px, py)
}

/** La fuente: una poza de agua con su orilla. */
export function dibujarFuente(ctx: Ctx, px: number, py: number) {
  ctx.save()
  ctx.fillStyle = '#7fa36b'
  ctx.beginPath()
  ctx.ellipse(px, py, 14, 10, -0.2, 0, 2 * Math.PI)
  ctx.fill()
  const agua = ctx.createRadialGradient(px - 3, py - 2, 1, px, py, 12)
  agua.addColorStop(0, '#7cc0ec')
  agua.addColorStop(1, '#1f6fb2')
  ctx.fillStyle = agua
  ctx.beginPath()
  ctx.ellipse(px, py, 11, 7.5, -0.2, 0, 2 * Math.PI)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.lineWidth = 1
  for (const dy of [-2, 2]) {
    ctx.beginPath()
    ctx.moveTo(px - 5, py + dy)
    ctx.quadraticCurveTo(px - 2.5, py + dy - 2, px, py + dy)
    ctx.quadraticCurveTo(px + 2.5, py + dy + 2, px + 5, py + dy)
    ctx.stroke()
  }
  ctx.restore()
  rotulo(ctx, 'Fuente', px, py - 12)
}

/** El cabezal: una caseta con su filtro. */
export function dibujarCabezal(ctx: Ctx, px: number, py: number) {
  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
  ctx.fillRect(px - 8, py - 5, 18, 13)
  ctx.fillStyle = '#d1d5db'
  ctx.strokeStyle = '#374151'
  ctx.lineWidth = 1.2
  ctx.fillRect(px - 9, py - 7, 18, 13)
  ctx.strokeRect(px - 9, py - 7, 18, 13)
  // El techo, visto desde arriba: dos aguas.
  ctx.beginPath()
  ctx.moveTo(px - 9, py - 0.5)
  ctx.lineTo(px + 9, py - 0.5)
  ctx.stroke()
  // El filtro, un cilindro azul al lado.
  ctx.fillStyle = '#1f6fb2'
  ctx.beginPath()
  ctx.arc(px + 13, py, 3.5, 0, 2 * Math.PI)
  ctx.fill()
  ctx.restore()
  rotulo(ctx, 'Cabezal', px, py - 10)
}

/** La cámara rompe-presión: una caja de concreto con su tapa. */
export function dibujarCamara(ctx: Ctx, px: number, py: number) {
  ctx.save()
  ctx.fillStyle = '#9ca3af'
  ctx.strokeStyle = '#4b5563'
  ctx.lineWidth = 1.4
  ctx.fillRect(px - 6, py - 6, 12, 12)
  ctx.strokeRect(px - 6, py - 6, 12, 12)
  ctx.strokeStyle = '#e5e7eb'
  ctx.strokeRect(px - 3, py - 3, 6, 6)
  ctx.restore()
  rotulo(ctx, 'CRP', px, py - 9)
}

/** Una válvula reguladora: el símbolo de dos triángulos; con rótulo solo si es la del cabezal. */
export function dibujarValvula(ctx: Ctx, px: number, py: number, conRotulo: boolean) {
  const t = conRotulo ? 6 : 3
  ctx.save()
  ctx.fillStyle = '#111827'
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(px - t, py - t)
  ctx.lineTo(px, py)
  ctx.lineTo(px - t, py + t)
  ctx.closePath()
  ctx.moveTo(px + t, py - t)
  ctx.lineTo(px, py)
  ctx.lineTo(px + t, py + t)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  if (conRotulo) rotulo(ctx, 'Reguladora', px, py - 8)
}

/** La flecha del norte, arriba a la derecha. */
export function dibujarNorte(ctx: Ctx, px: number, py: number) {
  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.beginPath()
  ctx.arc(px, py, 14, 0, 2 * Math.PI)
  ctx.fill()
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.moveTo(px, py - 10)
  ctx.lineTo(px + 5, py + 5)
  ctx.lineTo(px, py + 2)
  ctx.lineTo(px - 5, py + 5)
  ctx.closePath()
  ctx.fill()
  ctx.font = '700 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('N', px, py - 10)
  ctx.restore()
}

/** La escala gráfica: una barra de un largo redondo en metros. */
export function dibujarEscala(ctx: Ctx, px: number, py: number, pixelesPorMetro: number) {
  const objetivo = 90 / pixelesPorMetro
  const potencia = 10 ** Math.floor(Math.log10(objetivo))
  const metros = [1, 2, 5, 10].map((k) => k * potencia).filter((m) => m <= objetivo).at(-1) ?? potencia
  const largo = metros * pixelesPorMetro
  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.fillRect(px - 6, py - 18, largo + 12, 26)
  ctx.fillStyle = '#111827'
  ctx.fillRect(px, py, largo / 2, 4)
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 1
  ctx.strokeRect(px, py, largo, 4)
  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`${metros} m`, px + largo / 2, py - 3)
  ctx.restore()
}
