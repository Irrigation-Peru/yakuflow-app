import { cotaEnGrilla, proyectarLocal, type PuntoGeografico } from '@riego/calculo'
import { useEffect, useRef } from 'react'
import { useAguaEnMovimiento } from '../agua-en-movimiento.ts'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { LugarDelProyecto, RelieveDelProyecto } from '../api/tipos.ts'
import { conDecimales } from '../formato.ts'
import { EXAGERACION_VERTICAL, type Vista } from '../vista-3d.ts'
import { LeyendaDeLaRed } from './LeyendaDeLaRed.tsx'
import { arboleda, azar, colorDelTerreno, COLOR_DEL_CIELO, dentroDelPoligono, esCostaDesertica, ruidoEn, ruidoSuave, PISOS_PARA_LA_LEYENDA, texturaDeCorriente, texturaDeCultivo, texturaDeGrano, texturaDelCielo, uniones } from './paisaje-3d.ts'

// El terreno en 3D (HU0010): el relieve alrededor de la parcela, con la fuente, la parcela y el recorrido del agua por
// la conducción, para que se vea lo que en el mapa no se ve (C5, C6). Las cotas son las del paso 1, de la misma fuente
// de elevación. Si el equipo no tiene WebGL, el paso 1 muestra el perfil en 2D.

const COLOR = {
  parcela: '#111827',
  agua: '#2a78d6',
  // El PVC de presión, gris claro; las uniones, un poco más oscuras.
  tuberia: '#d5dbe2',
  union: '#aab3bd',
  concreto: '#a8a29e',
  roto: '#b42318',
  // La tierra removida de la zanja, más oscura y húmeda que el terreno de alrededor.
  zanja: '#5b4330',
}

// En la obra, el PVC de presión va enterrado a 0,6–0,8 m: así no lo daña el sol, no se congela con las heladas y no
// lo pisan. Lo que se ve en el campo es la franja de tierra removida de la zanja; aquí, además, el lomo del tubo asoma
// en ella para poder leer su presión. Las mangueras de goteo, en cambio, van sobre el suelo, como en la parcela real.
// El eje del tubo queda a la altura de la franja de tierra: asoma solo su mitad de arriba, como un tubo a medio tapar.
const HUNDIMIENTO_DEL_TUBO = 0.3
const ALTURA_DE_LA_ZANJA = 0.3

/** La franja de tierra removida a lo largo de una tubería enterrada: una cinta que sigue el terreno punto por punto. */
function zanja(puntos: THREE.Vector3[], ancho: number, sobre: number) {
  const vertices: number[] = []
  const indices: number[] = []
  puntos.forEach((p, i) => {
    const antes = puntos[Math.max(0, i - 1)]!
    const despues = puntos[Math.min(puntos.length - 1, i + 1)]!
    const dx = despues.x - antes.x
    const dz = despues.z - antes.z
    const largo = Math.hypot(dx, dz) || 1
    const [nx, nz] = [(-dz / largo) * (ancho / 2), (dx / largo) * (ancho / 2)]
    vertices.push(p.x + nx, p.y + sobre, p.z + nz, p.x - nx, p.y + sobre, p.z - nz)
    if (i > 0) {
      const a = (i - 1) * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const cinta = new THREE.BufferGeometry()
  cinta.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  cinta.setIndex(indices)
  cinta.computeVertexNormals()
  const malla = new THREE.Mesh(
    cinta,
    new THREE.MeshStandardMaterial({ color: COLOR.zanja, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  )
  malla.receiveShadow = true
  return malla
}

/** Un tramo de la red sobre el relieve, con el color de su presión (HU0022). */
export interface SegmentoEn3D {
  tramo: string
  a: PuntoGeografico & { cota: number }
  b: PuntoGeografico & { cota: number }
  color: string
  roto: boolean
  /** Si el agua corre por él en este momento. */
  corre?: boolean
}

interface Rotulo {
  texto: string
  punto: THREE.Vector3
}

export function Relieve3D({
  relieve,
  contorno,
  centroide,
  fuente,
  conduccion,
  desnivelM,
  vista,
  alFallar,
  red,
  presionNominalM,
  tramoSeleccionado,
}: {
  relieve: RelieveDelProyecto
  contorno: PuntoGeografico[]
  centroide: PuntoGeografico
  fuente: (PuntoGeografico & { cotaMsnm: number }) | null
  conduccion: LugarDelProyecto['conduccion']
  desnivelM: number | null
  vista: Vista
  alFallar: () => void
  /** La red funcionando: el mismo estado que la vista 2D. */
  red?: readonly SegmentoEn3D[]
  /** La presión de trabajo del emisor: con ella la leyenda dice qué significa cada color de la red. */
  presionNominalM?: number
  tramoSeleccionado?: string
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const capa = useRef<HTMLDivElement>(null)
  const escena = useRef<{
    irA: (v: Vista) => void
    mundo: THREE.Scene
    enEscena: (p: PuntoGeografico, cota: number, sobre?: number) => THREE.Vector3
    /** La cota del terreno en un punto, leída de la misma cuadrícula con que se dibuja el relieve. */
    cotaDe: (p: PuntoGeografico) => number
    realce: number
    /** Las texturas de la corriente que avanzan en cada cuadro, con su rapidez en repeticiones por segundo. */
    corrientes: Set<THREE.Texture>
  } | null>(null)
  const [aguaCorriendo, setAguaCorriendo] = useAguaEnMovimiento()
  const corriendo = useRef(aguaCorriendo)
  useEffect(() => {
    corriendo.current = aguaCorriendo
  }, [aguaCorriendo])

  useEffect(() => {
    const caja = contenedor.current
    const capaDeRotulos = capa.current
    if (!caja || !capaDeRotulos) return
    const { grilla } = relieve
    const origen = {
      lat: grilla.latSur + (grilla.pasoGrados * (grilla.filas - 1)) / 2,
      lon: grilla.lonOeste + (grilla.pasoGrados * (grilla.columnas - 1)) / 2,
    }
    const base = Math.min(...grilla.cotas)
    // x al este, y hacia arriba, z al sur: así la cámara de Three.js mira al norte por defecto.
    const enEscena = (p: PuntoGeografico, cota: number, sobre = 0) => {
      const { x, y } = proyectarLocal(origen, p)
      return new THREE.Vector3(x, (cota - base) * EXAGERACION_VERTICAL + sobre, -y)
    }
    const cotaDe = (p: PuntoGeografico) => cotaEnGrilla(grilla, p) ?? base

    let renderizador: THREE.WebGLRenderer
    try {
      renderizador = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      alFallar()
      return
    }
    renderizador.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderizador.shadowMap.enabled = true
    renderizador.shadowMap.type = THREE.PCFShadowMap
    caja.prepend(renderizador.domElement)

    const mundo = new THREE.Scene()
    const corrientes = new Set<THREE.Texture>()
    mundo.background = texturaDelCielo()
    // Luz de cielo azulado arriba y de tierra abajo, y un sol de media mañana que deja sombra en las quebradas.
    mundo.add(new THREE.HemisphereLight('#d6e9ff', '#8a7a5a', 1.25))
    const sol = new THREE.DirectionalLight('#fff1d6', 2.4)
    mundo.add(sol)
    mundo.add(sol.target)

    // El terreno: un vértice por punto de la cuadrícula (fila 0 al sur, de oeste a este), con el color de su piso de
    // altitud y su pendiente.
    const metrosPorPasoNS = grilla.pasoGrados * 111_320
    const metrosPorPasoEO = metrosPorPasoNS * Math.cos((origen.lat * Math.PI) / 180)
    const cotaEn = (f: number, c: number) =>
      grilla.cotas[Math.min(grilla.filas - 1, Math.max(0, f)) * grilla.columnas + Math.min(grilla.columnas - 1, Math.max(0, c))]!
    const posiciones: number[] = []
    const colores: number[] = []
    const uvs: number[] = []
    for (let f = 0; f < grilla.filas; f++) {
      for (let c = 0; c < grilla.columnas; c++) {
        const cota = grilla.cotas[f * grilla.columnas + c]!
        const lon = grilla.lonOeste + c * grilla.pasoGrados
        const v = enEscena({ lat: grilla.latSur + f * grilla.pasoGrados, lon }, cota)
        posiciones.push(v.x, v.y, v.z)
        const pendiente = Math.hypot(
          (cotaEn(f, c + 1) - cotaEn(f, c - 1)) / (2 * metrosPorPasoEO),
          (cotaEn(f + 1, c) - cotaEn(f - 1, c)) / (2 * metrosPorPasoNS),
        )
        const color = colorDelTerreno(cota, pendiente, lon, ruidoEn(f, c), ruidoSuave(f, c, 6) * 0.7 + ruidoSuave(f + 50, c + 50, 2.5) * 0.3)
        colores.push(color.r, color.g, color.b)
        // El grano se repite cada ~60 m.
        uvs.push(v.x / 60, v.z / 60)
      }
    }
    const indices: number[] = []
    for (let f = 0; f < grilla.filas - 1; f++) {
      for (let c = 0; c < grilla.columnas - 1; c++) {
        const a = f * grilla.columnas + c
        const norte = a + grilla.columnas
        indices.push(a, a + 1, norte, a + 1, norte + 1, norte)
      }
    }
    const terreno = new THREE.BufferGeometry()
    terreno.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3))
    terreno.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3))
    terreno.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    terreno.setIndex(indices)
    terreno.computeVertexNormals()
    const suelo = new THREE.Mesh(terreno, new THREE.MeshStandardMaterial({ vertexColors: true, map: texturaDeGrano(), roughness: 0.97, metalness: 0, side: THREE.DoubleSide }))
    suelo.receiveShadow = true
    suelo.castShadow = true
    mundo.add(suelo)
    terreno.computeBoundingBox()
    const limites = terreno.boundingBox!
    const tamano = Math.max(limites.max.x - limites.min.x, limites.max.z - limites.min.z)
    // Lo que se dibuja sobre el terreno se levanta un poco para que no quede enterrado entre dos puntos de la cuadrícula.
    const realce = tamano / 400

    // El sol y su sombra cubren todo el terreno; la bruma de lejos da la profundidad.
    const centroDelTerreno = limites.getCenter(new THREE.Vector3())
    sol.target.position.copy(centroDelTerreno)
    sol.position.copy(centroDelTerreno).add(new THREE.Vector3(-0.55, 0.8, 0.45).multiplyScalar(tamano))
    sol.castShadow = true
    sol.shadow.mapSize.set(2048, 2048)
    const sombra = sol.shadow.camera
    sombra.left = sombra.bottom = -tamano * 0.75
    sombra.right = sombra.top = tamano * 0.75
    sombra.near = tamano * 0.1
    sombra.far = tamano * 3
    sol.shadow.bias = -0.0005
    sol.shadow.normalBias = realce * 0.5
    mundo.fog = new THREE.Fog(COLOR_DEL_CIELO, tamano * 0.9, tamano * 3.2)

    // La parcela, apoyada en el terreno: una malla fina que sigue el relieve punto por punto (no un plano entre sus
    // esquinas, que flotaría o se hundiría en el cerro), sembrada en hileras y rodeada por un bordo de tierra.
    const borde: THREE.Vector3[] = []
    contorno.forEach((p, i) => {
      const q = contorno[(i + 1) % contorno.length]!
      for (let t = 0; t < 1; t += 0.05) {
        const punto = { lat: p.lat + t * (q.lat - p.lat), lon: p.lon + t * (q.lon - p.lon) }
        borde.push(enEscena(punto, cotaDe(punto), realce * 0.9))
      }
    })
    borde.push(borde[0]!.clone())
    const bordo = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(borde, true), borde.length * 2, realce * 0.7, 6, true),
      new THREE.MeshStandardMaterial({ color: '#7a5c3e', roughness: 1 }),
    )
    bordo.castShadow = true
    bordo.receiveShadow = true
    mundo.add(bordo)

    // Las hileras van a lo largo del lado más largo de la parcela, como se siembra.
    const enLaEscena = contorno.map((p) => enEscena(p, cotaDe(p)))
    let angulo = 0
    let ladoMasLargo = 0
    enLaEscena.forEach((a, i) => {
      const b = enLaEscena[(i + 1) % enLaEscena.length]!
      const largo = Math.hypot(b.x - a.x, b.z - a.z)
      if (largo > ladoMasLargo) {
        ladoMasLargo = largo
        angulo = Math.atan2(b.z - a.z, b.x - a.x)
      }
    })
    const [cos, sen] = [Math.cos(angulo), Math.sin(angulo)]
    const lats = contorno.map((p) => p.lat)
    const lons = contorno.map((p) => p.lon)
    const [latMin, latMax, lonMin, lonMax] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)]
    const PARTES = 60
    const vertices: number[] = []
    const uvParcela: number[] = []
    for (let f = 0; f <= PARTES; f++) {
      for (let c = 0; c <= PARTES; c++) {
        const punto = { lat: latMin + ((latMax - latMin) * f) / PARTES, lon: lonMin + ((lonMax - lonMin) * c) / PARTES }
        const v = enEscena(punto, cotaDe(punto), realce * 1.1)
        vertices.push(v.x, v.y, v.z)
        // Una tesela de textura cada 16 m a lo largo y a lo ancho de las hileras: 8 hileras, una cada 2 m.
        uvParcela.push((v.x * cos + v.z * sen) / 16, (-v.x * sen + v.z * cos) / 16)
      }
    }
    const indicesParcela: number[] = []
    for (let f = 0; f < PARTES; f++) {
      for (let c = 0; c < PARTES; c++) {
        const a = f * (PARTES + 1) + c
        const norte = a + PARTES + 1
        const mx = (vertices[a * 3]! + vertices[(norte + 1) * 3]!) / 2
        const mz = (vertices[a * 3 + 2]! + vertices[(norte + 1) * 3 + 2]!) / 2
        if (dentroDelPoligono(mx, mz, enLaEscena)) indicesParcela.push(a, a + 1, norte, a + 1, norte + 1, norte)
      }
    }
    const relleno = new THREE.BufferGeometry()
    relleno.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    relleno.setAttribute('uv', new THREE.Float32BufferAttribute(uvParcela, 2))
    relleno.setIndex(indicesParcela)
    relleno.computeVertexNormals()
    const cultivo = texturaDeCultivo()
    cultivo.anisotropy = renderizador.capabilities.getMaxAnisotropy()
    const sembrada = new THREE.Mesh(
      relleno,
      new THREE.MeshStandardMaterial({ map: cultivo, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    )
    sembrada.receiveShadow = true
    mundo.add(sembrada)
    const centro = enEscena(centroide, cotaDe(centroide), realce)
    const rotulos: Rotulo[] = [
      {
        texto: `parcela${desnivelM !== null ? ` · desnivel ${conDecimales(desnivelM, 0)} m` : ''}`,
        punto: centro.clone().setY(centro.y + realce * 14),
      },
    ]

    // La fuente y el recorrido del agua por la conducción, en línea recta al centro de la parcela como en el mapa, con
    // sus cámaras rompe-presión.
    let puntoDeLaFuente: THREE.Vector3 | null = null
    if (fuente) {
      puntoDeLaFuente = enEscena(fuente, fuente.cotaMsnm, realce * 2)
      // La esfera se ve desde lejos, pero no tapa el camino cuando la fuente está cerca de la parcela.
      const radio = Math.min(realce * 5, puntoDeLaFuente.clone().setY(0).distanceTo(centro.clone().setY(0)) * 0.04)
      // Una poza: el espejo de agua con su orilla de piedra.
      const orilla = new THREE.Mesh(new THREE.CylinderGeometry(radio * 1.25, radio * 1.4, radio * 0.5, 28), new THREE.MeshStandardMaterial({ color: COLOR.concreto, roughness: 1 }))
      orilla.position.copy(puntoDeLaFuente).setY(puntoDeLaFuente.y - radio * 0.1)
      orilla.castShadow = true
      const espejo = new THREE.Mesh(
        new THREE.CylinderGeometry(radio, radio, radio * 0.52, 28),
        new THREE.MeshStandardMaterial({ color: COLOR.agua, roughness: 0.15, metalness: 0.1, emissive: '#0b3b66', emissiveIntensity: 0.25 }),
      )
      espejo.position.copy(orilla.position).setY(orilla.position.y + radio * 0.02)
      mundo.add(orilla, espejo)
      rotulos.push({ texto: `fuente · ${conDecimales(fuente.cotaMsnm, 0)} m`, punto: puntoDeLaFuente.clone().setY(puntoDeLaFuente.y + radio * 1.6) })
    }
    if (fuente && conduccion && conduccion.perfil.length > 1) {
      const largo = conduccion.perfil.at(-1)!.distanciaM
      const enLaLinea = (distanciaM: number) => {
        const t = largo > 0 ? distanciaM / largo : 0
        return { lat: fuente.lat + t * (centroide.lat - fuente.lat), lon: fuente.lon + t * (centroide.lon - fuente.lon) }
      }
      const recorrido = conduccion.perfil.map((p) => {
        const punto = enLaLinea(p.distanciaM)
        return enEscena(punto, cotaEnGrilla(grilla, punto) ?? p.cota, realce * HUNDIMIENTO_DEL_TUBO)
      })
      const camino = new THREE.CurvePath<THREE.Vector3>()
      recorrido.slice(1).forEach((punto, i) => camino.add(new THREE.LineCurve3(recorrido[i]!, punto)))
      mundo.add(zanja(recorrido, realce * 3, realce * (ALTURA_DE_LA_ZANJA - HUNDIMIENTO_DEL_TUBO)))
      // La conducción: un tubo de PVC con sus uniones, enterrado en su zanja. Más grueso que en la realidad, para que se vea desde lejos; las
      // uniones van cada 6 m o, si de lejos no se distinguirían, más espaciadas.
      const radioDelTubo = realce * 0.75
      const corrienteDeLaConduccion = texturaDeCorriente()
      corrienteDeLaConduccion.repeat.set(Math.max(1, camino.getLength() / (realce * 10)), 1)
      corrienteDeLaConduccion.userData.rapidez = 1.2
      corrientes.add(corrienteDeLaConduccion)
      mundo.add(
        Object.assign(
          new THREE.Mesh(
            new THREE.TubeGeometry(camino, recorrido.length * 2, radioDelTubo, 12, false),
            new THREE.MeshStandardMaterial({
              color: COLOR.tuberia,
              roughness: 0.35,
              metalness: 0,
              // El agua bajando: destellos celestes que avanzan de la fuente a la parcela.
              emissive: '#4fb3ff',
              emissiveIntensity: 1.1,
              emissiveMap: corrienteDeLaConduccion,
            }),
          ),
          { castShadow: true, receiveShadow: true },
        ),
        uniones(recorrido, Math.max(6, realce * 9), radioDelTubo, COLOR.union),
      )
      const medio = recorrido[Math.floor(recorrido.length / 2)]!
      rotulos.push({ texto: 'por aquí bajaría el agua', punto: medio.clone().setY(medio.y + realce * 10) })
      conduccion.camaras.forEach((camara, i) => {
        // Una caja de concreto, como la cámara de verdad.
        const cubo = new THREE.Mesh(
          new THREE.BoxGeometry(realce * 5, realce * 4, realce * 5),
          new THREE.MeshStandardMaterial({ color: COLOR.concreto, roughness: 0.9 }),
        )
        cubo.castShadow = true
        cubo.position.copy(enEscena(camara, camara.cota, realce * 3))
        mundo.add(cubo)
        rotulos.push({ texto: `CRP ${i + 1}`, punto: cubo.position.clone().setY(cubo.position.y + realce * 8) })
      })
    }

    // Árboles y arbustos dispersos: solo bajo los 3700 m, fuera de la costa desértica, de las laderas muy empinadas, de la
    // parcela y de su entorno inmediato.
    {
      const r = azar(2027)
      const sitios: THREE.Vector3[] = []
      const parcela = contorno.map((p) => enEscena(p, cotaDe(p)))
      for (let i = 0; i < 1400 && sitios.length < 45; i++) {
        const f = r() * (grilla.filas - 1)
        const c = r() * (grilla.columnas - 1)
        const lugar = { lat: grilla.latSur + f * grilla.pasoGrados, lon: grilla.lonOeste + c * grilla.pasoGrados }
        const cota = cotaDe(lugar)
        if (cota > 3700 || esCostaDesertica(cota, lugar.lon)) continue
        const fi = Math.round(f)
        const ci = Math.round(c)
        const pendiente = Math.hypot((cotaEn(fi, ci + 1) - cotaEn(fi, ci - 1)) / (2 * metrosPorPasoEO), (cotaEn(fi + 1, ci) - cotaEn(fi - 1, ci)) / (2 * metrosPorPasoNS))
        if (pendiente > 0.7) continue
        const v = enEscena(lugar, cota)
        if (dentroDelPoligono(v.x, v.z, parcela) || v.clone().setY(0).distanceTo(centro.clone().setY(0)) < tamano * 0.06) continue
        // Más juntos en lo bajo y plano, más ralos arriba.
        if (r() > 0.35 - (cota - 2000) / 6000) continue
        sitios.push(v)
      }
      mundo.add(arboleda(sitios, realce * 6))
    }

    const camara = new THREE.PerspectiveCamera(45, 1, tamano / 1000, tamano * 10)
    const controles = new OrbitControls(camara, renderizador.domElement)
    controles.enableDamping = true
    // La rueda acerca hacia donde apunta el mouse: así uno llega a su parcela sin tener que arrastrar.
    controles.zoomToCursor = true
    // La cámara no baja del horizonte: debajo del terreno no hay nada que ver.
    controles.maxPolarAngle = Math.PI / 2 - 0.05

    const irA = (v: Vista) => {
      const haciaLaFuente = puntoDeLaFuente ? puntoDeLaFuente.clone().sub(centro).setY(0).normalize() : new THREE.Vector3(0, 0, -1)
      const costado = new THREE.Vector3(-haciaLaFuente.z, 0, haciaLaFuente.x)
      // Entre la fuente y la parcela: ahí está lo que importa.
      const foco = puntoDeLaFuente ? centro.clone().lerp(puntoDeLaFuente, 0.5) : centro.clone()
      controles.target.copy(foco)
      if (v === 'isometrica') camara.position.copy(foco).add(costado.clone().multiplyScalar(tamano * 0.45)).add(haciaLaFuente.clone().multiplyScalar(-tamano * 0.35)).setY(foco.y + tamano * 0.4)
      if (v === 'perfil') camara.position.copy(foco).add(costado.clone().multiplyScalar(tamano * 0.9)).setY(Math.max(limites.max.y, foco.y) + tamano * 0.06)
      if (v === 'cenital') camara.position.copy(foco).add(new THREE.Vector3(0, tamano * 0.95, 0.001))
      if (v === 'fuente' && puntoDeLaFuente) {
        // Detrás de la fuente y por encima, a la escala del camino que baja a la parcela: la fuente abajo, la parcela al
        // fondo y la conducción entre las dos.
        const camino = puntoDeLaFuente.clone().setY(0).distanceTo(centro.clone().setY(0))
        controles.target.copy(centro).lerp(puntoDeLaFuente, 0.3)
        camara.position.copy(puntoDeLaFuente).add(haciaLaFuente.clone().multiplyScalar(camino * 0.9)).setY(puntoDeLaFuente.y + camino * 0.55)
      }
      controles.update()
    }
    escena.current = { irA, mundo, enEscena, cotaDe, realce, corrientes }
    irA(vista)

    const ajustar = () => {
      const { width, height } = caja.getBoundingClientRect()
      renderizador.setSize(width, height)
      camara.aspect = width / Math.max(1, height)
      camara.updateProjectionMatrix()
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(caja)

    const etiquetas = rotulos.map(({ texto }) => {
      const div = document.createElement('div')
      div.className = 'rotulo-3d'
      div.textContent = texto
      capaDeRotulos.append(div)
      return div
    })
    // El tamaño de cada rótulo no cambia: se mide una vez y no en cada cuadro.
    const medidas = etiquetas.map((e) => ({ ancho: e.offsetWidth, alto: e.offsetHeight }))
    const proyectado = new THREE.Vector3()
    let cuadro = 0
    let antes = performance.now()
    const dibujar = () => {
      cuadro = requestAnimationFrame(dibujar)
      const ahora = performance.now()
      const segundos = Math.min(0.1, (ahora - antes) / 1000)
      antes = ahora
      if (corriendo.current) for (const t of corrientes) t.offset.x -= segundos * (t.userData.rapidez as number)
      controles.update()
      renderizador.render(mundo, camara)
      const ancho = caja.clientWidth
      const alto = caja.clientHeight
      // Cada rótulo va sobre su punto; si choca con uno ya puesto, baja hasta quedar debajo de él.
      const puestos: { izquierda: number; arriba: number; ancho: number; alto: number }[] = []
      rotulos.forEach(({ punto }, i) => {
        proyectado.copy(punto).project(camara)
        const visible = proyectado.z < 1 && Math.abs(proyectado.x) <= 1 && Math.abs(proyectado.y) <= 1
        etiquetas[i]!.style.display = visible ? 'block' : 'none'
        if (!visible) return
        const medida = medidas[i]!
        const sitio = { izquierda: ((proyectado.x + 1) / 2) * ancho - medida.ancho / 2, arriba: ((1 - proyectado.y) / 2) * alto - medida.alto, ...medida }
        for (let intento = 0; intento < puestos.length; intento++) {
          const choque = puestos.find(
            (o) => sitio.izquierda < o.izquierda + o.ancho && o.izquierda < sitio.izquierda + sitio.ancho && sitio.arriba < o.arriba + o.alto && o.arriba < sitio.arriba + sitio.alto,
          )
          if (!choque) break
          sitio.arriba = choque.arriba + choque.alto + 2
        }
        puestos.push(sitio)
        etiquetas[i]!.style.transform = `translate(${sitio.izquierda}px, ${sitio.arriba}px)`
      })
    }
    dibujar()

    return () => {
      cancelAnimationFrame(cuadro)
      observador.disconnect()
      controles.dispose()
      for (const etiqueta of etiquetas) etiqueta.remove()
      mundo.traverse((objeto) => {
        if (objeto instanceof THREE.Mesh || objeto instanceof THREE.Line) {
          objeto.geometry.dispose()
          const material = objeto.material as THREE.Material & { map?: THREE.Texture | null; emissiveMap?: THREE.Texture | null }
          material.map?.dispose()
          material.emissiveMap?.dispose()
          material.dispose()
        }
      })
      ;(mundo.background as THREE.Texture | null)?.dispose()
      renderizador.dispose()
      renderizador.domElement.remove()
      escena.current = null
    }
    // La escena se arma una vez por lugar; la vista se cambia sin rearmarla.
  }, [relieve, contorno, centroide, fuente, conduccion, desnivelM]) // oxlint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    escena.current?.irA(vista)
  }, [vista])

  // La red va en su propio grupo: cambia cada vez que el estudiante abre una válvula o corrige un tramo, y el terreno no
  // tiene por qué rearmarse. Los tramos comunes son líneas; el roto y el seleccionado, tubos, para que se vean de lejos.
  useEffect(() => {
    const e = escena.current
    if (!e || !red || red.length === 0) return
    const grupo = new THREE.Group()
    const posiciones: number[] = []
    const colores: number[] = []
    const corrientesDeLaRed: THREE.Texture[] = []
    // Cada tramo se apoya en el terreno: se parte en trozos cortos y cada punto toma la cota del relieve. Un segmento
    // recto entre sus dos nudos cruzaría el aire sobre cada quebrada (o se metería en cada loma), y la tubería se vería
    // flotando.
    const sobreElTerreno = (a: PuntoGeografico, b: PuntoGeografico, sobre: number) => {
      const largo = e.enEscena(a, 0).distanceTo(e.enEscena(b, 0))
      const trozos = Math.min(200, Math.max(1, Math.ceil(largo / (e.realce * 3))))
      const puntos: THREE.Vector3[] = []
      for (let i = 0; i <= trozos; i++) {
        const t = i / trozos
        const p = { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) }
        puntos.push(e.enEscena(p, e.cotaDe(p), sobre))
      }
      return puntos
    }
    const recorridoDe = (puntos: THREE.Vector3[]) => {
      const camino = new THREE.CurvePath<THREE.Vector3>()
      puntos.slice(1).forEach((punto, i) => camino.add(new THREE.LineCurve3(puntos[i]!, punto)))
      return camino
    }
    for (const s of red) {
      const enterrada = !s.tramo.startsWith('l') && !s.tramo.startsWith('v')
      const puntos = sobreElTerreno(s.a, s.b, e.realce * (enterrada ? HUNDIMIENTO_DEL_TUBO : 1.5))
      const color = new THREE.Color(s.color)
      // Las tuberías principales (conducción y portalateral) son tubos de PVC enterrados, con el color de su presión; los
      // laterales, las mangueras de goteo, líneas finas sobre el suelo.
      if (enterrada) {
        grupo.add(zanja(puntos, e.realce * 2.4, e.realce * (ALTURA_DE_LA_ZANJA - HUNDIMIENTO_DEL_TUBO)))
        const marcado = s.roto || s.tramo === tramoSeleccionado
        const camino = recorridoDe(puntos)
        const largo = camino.getLength()
        let corriente: THREE.Texture | null = null
        if (s.corre && !s.roto) {
          corriente = texturaDeCorriente()
          corriente.repeat.set(Math.max(1, largo / (e.realce * 5)), 1)
          corriente.userData.rapidez = 1.4
          e.corrientes.add(corriente)
          corrientesDeLaRed.push(corriente)
        }
        const tubo = new THREE.Mesh(
          new THREE.TubeGeometry(camino, puntos.length, e.realce * (marcado ? 0.85 : 0.55), 10, false),
          new THREE.MeshStandardMaterial({
            color: s.roto ? COLOR.roto : s.tramo === tramoSeleccionado ? COLOR.parcela : color,
            roughness: 0.4,
            ...(corriente ? { emissive: '#ffffff', emissiveIntensity: 0.75, emissiveMap: corriente } : {}),
          }),
        )
        tubo.castShadow = true
        grupo.add(tubo)
        continue
      }
      puntos.slice(1).forEach((b, i) => {
        const a = puntos[i]!
        posiciones.push(a.x, a.y, a.z, b.x, b.y, b.z)
        colores.push(color.r, color.g, color.b, color.r, color.g, color.b)
      })
      if (s.roto || s.tramo === tramoSeleccionado) {
        const tubo = new THREE.Mesh(
          new THREE.TubeGeometry(recorridoDe(puntos), puntos.length, e.realce * (s.roto ? 1.4 : 1), 6, false),
          new THREE.MeshStandardMaterial({ color: s.roto ? COLOR.roto : COLOR.parcela, roughness: 0.5 }),
        )
        grupo.add(tubo)
      }
    }
    const lineas = new THREE.BufferGeometry()
    lineas.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3))
    lineas.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3))
    grupo.add(new THREE.LineSegments(lineas, new THREE.LineBasicMaterial({ vertexColors: true })))
    e.mundo.add(grupo)
    return () => {
      e.mundo.remove(grupo)
      for (const t of corrientesDeLaRed) {
        e.corrientes.delete(t)
        t.dispose()
      }
      grupo.traverse((objeto) => {
        if (objeto instanceof THREE.Mesh || objeto instanceof THREE.Line) {
          objeto.geometry.dispose()
          ;(objeto.material as THREE.Material).dispose()
        }
      })
    }
    // Se rearma también cuando la escena se rearma, por eso lleva lo mismo que ella.
  }, [red, tramoSeleccionado, relieve, contorno, centroide, fuente, conduccion, desnivelM])

  const hayCorriente = (conduccion !== null && fuente !== null && !red) || (red?.some((s) => s.corre) ?? false)
  return (
    <>
      <div
        ref={contenedor}
        className="relieve-3d"
        role="img"
        aria-label={`El terreno en 3D alrededor de la parcela${fuente ? `, con la fuente a ${conDecimales(fuente.cotaMsnm, 0)} m` : ''}${
          desnivelM !== null ? ` y ${conDecimales(desnivelM, 0)} m de desnivel` : ''
        }. Arrastra para orbitar y usa la rueda para acercar.`}
      >
        <div ref={capa} className="rotulos-3d" aria-hidden="true" />
      </div>
      {hayCorriente && (
        <div className="acciones izquierda">
          <button type="button" aria-pressed={aguaCorriendo} onClick={() => setAguaCorriendo(!aguaCorriendo)}>
            {aguaCorriendo ? 'Pausar el agua' : 'Ver el agua correr'}
          </button>
        </div>
      )}
      {red && presionNominalM !== undefined ? (
        <LeyendaDeLaRed
          presionNominalM={presionNominalM}
          colorSinAgua="#d1d5db"
          conRotos={red.some((s) => s.roto)}
          colorRoto={COLOR.roto}
          conCorriente={hayCorriente && aguaCorriendo}
          extra={
            <>
              <LeyendaDeLaZanja />
              <LeyendaDelTerreno />
            </>
          }
        />
      ) : (
        <div className="leyenda-de-la-red">
          <p className="titulo-de-la-leyenda">Qué significa cada color</p>
          <ul>
            <li>
              <span className="muestra-plana" style={{ background: '#d5dbe2' }} aria-hidden="true" />
              <span>
                <strong>Tubo gris claro</strong> · la conducción de PVC, de la fuente a la parcela, con sus uniones, enterrada en
                su zanja.
                {hayCorriente && aguaCorriendo && ' Los destellos celestes que avanzan son el agua bajando.'}
              </span>
            </li>
            <li>
              <span className="muestra-plana" style={{ background: '#2a78d6', borderRadius: '50%' }} aria-hidden="true" />
              <span>
                <strong>Poza azul</strong> · la fuente. <strong>Caja de concreto</strong> · una cámara rompe-presión.
              </span>
            </li>
            <li>
              <span className="muestra-plana" style={{ background: 'repeating-linear-gradient(0deg, #5f9a45 0 3px, #b08d65 3px 6px)' }} aria-hidden="true" />
              <span>
                <strong>Surcos verdes con bordo café</strong> · tu parcela sembrada.
              </span>
            </li>
            <LeyendaDeLaZanja />
            <LeyendaDelTerreno />
          </ul>
        </div>
      )}
    </>
  )
}

/** Los colores del terreno: una aproximación visual de los pisos del Perú, no un mapa de cobertura. */
function LeyendaDeLaZanja() {
  return (
    <li>
      <span className="muestra-plana" style={{ background: COLOR.zanja }} aria-hidden="true" />
      <span>
        <strong>Franja de tierra removida</strong> · la zanja de las tuberías de PVC. En la obra van enterradas a 0,6–0,8 m,
        para protegerlas del sol, las heladas y el tránsito; aquí asoma su lomo para leer la presión. Las mangueras de goteo
        sí van sobre el suelo.
      </span>
    </li>
  )
}

function LeyendaDelTerreno() {
  return (
    <li className="leyenda-del-terreno">
      <span className="muestra-plana" style={{ background: 'linear-gradient(90deg, #d6c29a, #7c9a52, #9f9a62, #b8a467, #8c857a)' }} aria-hidden="true" />
      <span>
        <strong>El terreno</strong> ·{' '}
        {PISOS_PARA_LA_LEYENDA.map((piso, i) => (
          <span key={piso.nombre}>
            {i > 0 && '; '}
            <span className="muestra-chica" style={{ background: piso.color }} aria-hidden="true" /> {piso.nombre.toLowerCase()}, {piso.lectura}
          </span>
        ))}
        . Es una aproximación por altitud, no un mapa de cultivos.
      </span>
    </li>
  )
}
