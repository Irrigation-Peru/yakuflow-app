import * as THREE from 'three'

// Lo que hace que el 3D se parezca al lugar: el cielo, el color del suelo según la altitud y la pendiente, el grano, la
// parcela sembrada y algunos árboles. Es solo apariencia: las cotas y las posiciones son las del relieve del paso 1, y
// aquí no se toca ninguna. El color por altitud es una aproximación visual de los pisos del Perú (desierto en la costa,
// valle verde, pajonal, puna y roca), no un mapa de cobertura; lo que parece al azar sale de una semilla fija.

export const COLOR_DEL_CIELO = '#dcecf8'

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

/** Un ruido fijo por punto de la cuadrícula, de -1 a 1. */
export function ruidoEn(f: number, c: number) {
  const h = Math.sin(f * 127.1 + c * 311.7) * 43758.5453
  return (h - Math.floor(h)) * 2 - 1
}

/** Un ruido suave, por manchas de `escala` puntos de la cuadrícula, de -1 a 1: pasto más verde aquí, más seco allá. */
export function ruidoSuave(f: number, c: number, escala: number) {
  const x = c / escala
  const y = f / escala
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const suave = (t: number) => t * t * (3 - 2 * t)
  const tx = suave(x - x0)
  const ty = suave(y - y0)
  const arriba = ruidoEn(y0, x0) * (1 - tx) + ruidoEn(y0, x0 + 1) * tx
  const abajo = ruidoEn(y0 + 1, x0) * (1 - tx) + ruidoEn(y0 + 1, x0 + 1) * tx
  return arriba * (1 - ty) + abajo * ty
}

const VERDOR = new THREE.Color('#5f8a3e')
const SEQUEDAD = new THREE.Color('#c2ad73')

const PISOS = {
  desierto: new THREE.Color('#d6c29a'),
  valle: new THREE.Color('#7c9a52'),
  ladera: new THREE.Color('#9f9a62'),
  puna: new THREE.Color('#b8a467'),
  roca: new THREE.Color('#8c857a'),
  barranco: new THREE.Color('#8a7360'),
}

/** ¿Costa desértica? En el Perú, lo bajo de la vertiente occidental. */
export const esCostaDesertica = (cotaMsnm: number, lon: number) => cotaMsnm < 2000 && lon < -77

/** El color del suelo en un punto: por el piso de altitud y, si es muy empinado, hacia el barranco. */
export function colorDelTerreno(cotaMsnm: number, pendiente: number, lon: number, ruido: number, manchas = 0) {
  const mezcla = (a: THREE.Color, b: THREE.Color, desde: number, hasta: number) =>
    a.clone().lerp(b, Math.min(1, Math.max(0, (cotaMsnm - desde) / (hasta - desde))))
  let color: THREE.Color
  if (esCostaDesertica(cotaMsnm, lon)) color = PISOS.desierto.clone()
  else if (cotaMsnm < 2800) color = mezcla(PISOS.valle, PISOS.ladera, 2200, 2800)
  else if (cotaMsnm < 3800) color = mezcla(PISOS.ladera, PISOS.puna, 3300, 3800)
  else color = mezcla(PISOS.puna, PISOS.roca, 4400, 4800)
  // Las manchas: fuera del desierto, unas zonas más verdes y otras más secas.
  if (!esCostaDesertica(cotaMsnm, lon)) color.lerp(manchas > 0 ? VERDOR : SEQUEDAD, Math.abs(manchas) * 0.45)
  color.lerp(PISOS.barranco, Math.min(0.75, Math.max(0, (pendiente - 0.35) / 0.5)))
  return color.offsetHSL(0, 0, ruido * 0.05)
}

/** El grano del suelo, para que de cerca no se vea liso. Se repite sobre el terreno. */
export function texturaDeGrano() {
  const lado = 256
  const lienzo = document.createElement('canvas')
  lienzo.width = lado
  lienzo.height = lado
  const ctx = lienzo.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, lado, lado)
    const r = azar(881)
    for (let i = 0; i < 9000; i++) {
      const gris = 205 + Math.floor(r() * 50)
      ctx.fillStyle = `rgb(${gris}, ${gris}, ${gris})`
      ctx.fillRect(r() * lado, r() * lado, 1 + r() * 2, 1 + r() * 2)
    }
  }
  const textura = new THREE.CanvasTexture(lienzo)
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping
  textura.colorSpace = THREE.SRGBColorSpace
  return textura
}

/**
 * La parcela sembrada, vista de cerca: surcos de tierra (el lomo más claro, el fondo más oscuro y húmedo) con las
 * plantas sobre el lomo, de tamaños y verdes distintos. Ocho hileras por tesela.
 */
export function texturaDeCultivo() {
  const lado = 256
  const lienzo = document.createElement('canvas')
  lienzo.width = lado
  lienzo.height = lado
  const ctx = lienzo.getContext('2d')
  if (ctx) {
    const hileras = 8
    const alto = lado / hileras
    for (let h = 0; h < hileras; h++) {
      const y0 = h * alto
      const surco = ctx.createLinearGradient(0, y0, 0, y0 + alto)
      surco.addColorStop(0, '#7d5f40')
      surco.addColorStop(0.3, '#b08d65')
      surco.addColorStop(0.5, '#c4a27a')
      surco.addColorStop(0.7, '#b08d65')
      surco.addColorStop(1, '#7d5f40')
      ctx.fillStyle = surco
      ctx.fillRect(0, y0, lado, alto)
    }
    const r = azar(313)
    // Grano de la tierra.
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(80, 55, 30, 0.25)' : 'rgba(240, 225, 200, 0.25)'
      ctx.fillRect(r() * lado, r() * lado, 1.5, 1.5)
    }
    // Las plantas sobre el lomo de cada surco: una sombra corta y la mata encima.
    for (let h = 0; h < hileras; h++) {
      const y = (h + 0.5) * alto
      for (let x = 2; x < lado; x += 4 + r() * 2.5) {
        const radio = 6 + r() * 4
        const py = y + (r() - 0.5) * 3
        ctx.fillStyle = 'rgba(40, 30, 15, 0.25)'
        ctx.beginPath()
        ctx.ellipse(x + 2, py + 2.5, radio, radio * 0.7, 0, 0, 2 * Math.PI)
        ctx.fill()
        ctx.fillStyle = r() < 0.3 ? '#3d7431' : r() < 0.6 ? '#4f8a3a' : '#66a047'
        ctx.beginPath()
        ctx.arc(x, py, radio, 0, 2 * Math.PI)
        ctx.fill()
        ctx.fillStyle = 'rgba(190, 225, 140, 0.45)'
        ctx.beginPath()
        ctx.arc(x - radio * 0.3, py - radio * 0.3, radio * 0.4, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
  }
  const textura = new THREE.CanvasTexture(lienzo)
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping
  textura.colorSpace = THREE.SRGBColorSpace
  return textura
}

/** El cielo de fondo: más azul arriba, casi blanco en el horizonte. */
export function texturaDelCielo() {
  const lienzo = document.createElement('canvas')
  lienzo.width = 2
  lienzo.height = 256
  const ctx = lienzo.getContext('2d')
  if (ctx) {
    const degradado = ctx.createLinearGradient(0, 0, 0, 256)
    degradado.addColorStop(0, '#8fc1e8')
    degradado.addColorStop(0.65, COLOR_DEL_CIELO)
    degradado.addColorStop(1, '#f4f8fb')
    ctx.fillStyle = degradado
    ctx.fillRect(0, 0, 2, 256)
  }
  const textura = new THREE.CanvasTexture(lienzo)
  textura.colorSpace = THREE.SRGBColorSpace
  return textura
}

/**
 * Árboles y arbustos dispersos en `sitios` (ya en la escena), con su alto en unidades de la escena. Dos mallas
 * instanciadas, tronco y copa: cientos de árboles cuestan lo que dos objetos.
 */
export function arboleda(sitios: readonly THREE.Vector3[], alto: number) {
  const grupo = new THREE.Group()
  if (sitios.length === 0) return grupo
  const r = azar(5501)
  const tronco = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(alto * 0.05, alto * 0.07, alto * 0.45, 5),
    new THREE.MeshStandardMaterial({ color: '#6b4f35', roughness: 1 }),
    sitios.length,
  )
  const copa = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(alto * 0.32, 0),
    new THREE.MeshStandardMaterial({ color: '#4f7a3a', roughness: 0.95, flatShading: true }),
    sitios.length,
  )
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const color = new THREE.Color()
  sitios.forEach((sitio, i) => {
    const k = 0.6 + r() * 0.8
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2)
    s.set(k, k, k)
    m.compose(new THREE.Vector3(sitio.x, sitio.y + alto * 0.22 * k, sitio.z), q, s)
    tronco.setMatrixAt(i, m)
    s.set(k, k * (0.9 + r() * 0.5), k)
    m.compose(new THREE.Vector3(sitio.x, sitio.y + alto * 0.62 * k, sitio.z), q, s)
    copa.setMatrixAt(i, m)
    copa.setColorAt(i, color.set(r() < 0.5 ? '#4f7a3a' : '#5d8a44').offsetHSL(0, 0, (r() - 0.5) * 0.08))
  })
  for (const malla of [tronco, copa]) {
    malla.castShadow = true
    malla.receiveShadow = true
    grupo.add(malla)
  }
  return grupo
}

/** ¿Cae el punto (x, z) dentro del polígono? Para no plantar árboles en la parcela. */
export function dentroDelPoligono(x: number, z: number, poligono: readonly THREE.Vector3[]) {
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i]!
    const b = poligono[j]!
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) dentro = !dentro
  }
  return dentro
}

/**
 * Las uniones (campanas) de una tubería a lo largo de `puntos`, una cada `cada` unidades de la escena: anillos un poco
 * más gruesos que el tubo, como los de los tubos de PVC de 6 m. Una sola malla instanciada para todas.
 */
export function uniones(puntos: readonly THREE.Vector3[], cada: number, radio: number, color: THREE.ColorRepresentation) {
  const sitios: { donde: THREE.Vector3; hacia: THREE.Vector3 }[] = []
  let falta = cada / 2
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1]!
    const b = puntos[i]!
    const largo = a.distanceTo(b)
    const hacia = b.clone().sub(a).normalize()
    let recorrido = 0
    while (recorrido + falta <= largo) {
      recorrido += falta
      sitios.push({ donde: a.clone().addScaledVector(hacia, recorrido), hacia })
      falta = cada
    }
    falta -= largo - recorrido
  }
  const malla = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(radio * 1.35, radio * 1.35, radio * 1.3, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4 }),
    Math.max(1, sitios.length),
  )
  malla.count = sitios.length
  const arriba = new THREE.Vector3(0, 1, 0)
  const m = new THREE.Matrix4()
  sitios.forEach(({ donde, hacia }, i) => {
    m.compose(donde, new THREE.Quaternion().setFromUnitVectors(arriba, hacia), new THREE.Vector3(1, 1, 1))
    malla.setMatrixAt(i, m)
  })
  malla.castShadow = true
  return malla
}

/**
 * La corriente dentro del tubo: destellos claros sobre negro, para el brillo propio (emissiveMap) del material. Corren
 * a lo largo del tubo moviendo el desplazamiento de la textura; cada tubo lleva su copia con su propia repetición.
 */
export function texturaDeCorriente() {
  const lienzo = document.createElement('canvas')
  lienzo.width = 64
  lienzo.height = 4
  const ctx = lienzo.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, 64, 4)
    const destello = ctx.createLinearGradient(0, 0, 22, 0)
    destello.addColorStop(0, 'rgba(255, 255, 255, 0)')
    destello.addColorStop(0.7, 'rgba(255, 255, 255, 1)')
    destello.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = destello
    ctx.fillRect(0, 0, 22, 4)
  }
  const textura = new THREE.CanvasTexture(lienzo)
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping
  textura.colorSpace = THREE.SRGBColorSpace
  return textura
}

/** Los pisos del terreno con su color, para la leyenda del 3D. */
export const PISOS_PARA_LA_LEYENDA: readonly { nombre: string; color: string; lectura: string }[] = [
  { nombre: 'Arena', color: '#d6c29a', lectura: 'costa desértica, bajo los 2000 m' },
  { nombre: 'Verde', color: '#7c9a52', lectura: 'valle, bajo los 2800 m' },
  { nombre: 'Oliva', color: '#9f9a62', lectura: 'ladera con pajonal, de 2800 a 3800 m' },
  { nombre: 'Paja', color: '#b8a467', lectura: 'puna, sobre los 3800 m' },
  { nombre: 'Gris', color: '#8c857a', lectura: 'roca, sobre los 4400 m' },
  { nombre: 'Café', color: '#8a7360', lectura: 'ladera muy empinada' },
]

export { azar }
