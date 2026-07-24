import { Canvas, useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import './KineticExhibitionHero.css'

const COUNT = 16
const GAP = 4.35
const BILLBOARD_RADIUS = 7
const BILLBOARD_HEIGHT = 2.82
const BANNER_RADIUS = 7.42
const BANNER_FRONT_RADIUS = BANNER_RADIUS + 0.035
const BANNER_BACK_RADIUS = BANNER_RADIUS - 0.035
const BANNER_HEIGHT = 0.92
const TEXTURE_HEIGHT = 512
const TEXTURE_MIN_WIDTH = 320
const TEXTURE_MAX_WIDTH = 960
const TEXTURE_MIN_TOTAL_WIDTH = 4096
const TEXTURE_MAX_TOTAL_WIDTH = 6144
const TEXTURE_GAP = 1
const BANNER_TEXT = 'KINETIC GALLERY  ·  CYLINDER DEMO  ·  '
const SCENE_BASE_ROTATION_X = -0.15
const SCENE_BASE_ROTATION_Z = -0.12
const BASE_ROTATION_SPEED = 0.015
const SCROLL_ROTATION_DECAY = 3.8
const SCROLL_ROTATION_MAX_BOOST = 0.26
const SCROLL_ROTATION_WHEEL_FACTOR = 0.0009
const SCROLL_ROTATION_SCROLL_FACTOR = 0.12
const BANNER_FONT = '700 34px Georgia, serif'
const BANNER_TEXT_GAP = 120
const MOBILE_SCENE_QUERY = '(max-width: 640px)'
// Rotate banner cylinders so the UV seam sits on the back face by default.
const BANNER_SEAM_ROTATION_Y = -Math.PI / 2

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()

    if (/^https?:\/\//.test(src)) {
      image.crossOrigin = 'anonymous'
    }

    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load hero image: ${src}`))
    image.src = src
  })
}

function getImageDrawWidth(image, height) {
  const imageAspect = image.naturalWidth / image.naturalHeight
  return Math.round(
    THREE.MathUtils.clamp(height * imageAspect, TEXTURE_MIN_WIDTH, TEXTURE_MAX_WIDTH),
  )
}

function drawCoverImage(context, image, x, width, height) {
  const imageAspect = image.naturalWidth / image.naturalHeight
  const targetAspect = width / height
  let sourceX = 0
  let sourceY = 0
  let sourceWidth = image.naturalWidth
  let sourceHeight = image.naturalHeight

  if (imageAspect > targetAspect) {
    sourceWidth = image.naturalHeight * targetAspect
    sourceX = (image.naturalWidth - sourceWidth) / 2
  } else {
    sourceHeight = image.naturalWidth / targetAspect
    sourceY = (image.naturalHeight - sourceHeight) / 2
  }

  context.save()
  context.filter = 'contrast(1.08) saturate(1.05)'
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, 0, width, height)
  context.filter = 'none'
  context.strokeStyle = 'rgba(0, 0, 0, 0.16)'
  context.lineWidth = 1
  context.strokeRect(x + 0.5, 0.5, width - 1, height - 1)
  context.restore()
}

function getWrappedTextureCoordinate(value) {
  return ((value % 1) + 1) % 1
}

async function createCollageTexture(imageItems, onProgress) {
  let completedImages = 0
  const settledImages = await Promise.allSettled(
    imageItems.map((item) =>
      loadImage(item.src).then((image) => ({ image, item })).finally(() => {
        completedImages += 1
        onProgress?.(completedImages, imageItems.length)
      }),
    ),
  )
  const loadedItems = settledImages
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)

  if (!loadedItems.length) throw new Error('No usable hero images')

  const tiles = loadedItems.map(({ image, item }) => ({
    href: item.href,
    image,
    src: item.src,
    width: getImageDrawWidth(image, TEXTURE_HEIGHT),
  }))
  const sequenceWidth = tiles.reduce((total, tile) => total + tile.width + TEXTURE_GAP, 0)
  const maxTileWidth = Math.max(...tiles.map((tile) => tile.width))
  const totalWidth = Math.ceil(
    THREE.MathUtils.clamp(
      sequenceWidth + maxTileWidth,
      TEXTURE_MIN_TOTAL_WIDTH,
      TEXTURE_MAX_TOTAL_WIDTH,
    ),
  )
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) throw new Error('Could not create hero texture')

  canvas.width = Math.ceil(totalWidth * pixelRatio)
  canvas.height = Math.ceil(TEXTURE_HEIGHT * pixelRatio)
  context.scale(pixelRatio, pixelRatio)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, totalWidth, TEXTURE_HEIGHT)

  let x = 0
  let index = 0
  const hitAreas = []

  while (x < totalWidth + maxTileWidth) {
    const tile = tiles[index % tiles.length]
    drawCoverImage(context, tile.image, x, tile.width, TEXTURE_HEIGHT)
    const start = Math.max(0, x / totalWidth)
    const end = Math.min(1, (x + tile.width) / totalWidth)

    if (start < 1 && end > start) {
      hitAreas.push({
        end,
        href: tile.href,
        src: tile.src,
        start,
      })
    }
    x += tile.width + TEXTURE_GAP
    index += 1
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.needsUpdate = true

  return {
    dimensions: {
      aspectRatio: totalWidth / TEXTURE_HEIGHT,
    },
    fallbackHref: tiles.find((tile) => tile.href)?.href,
    hitAreas,
    texture,
  }
}

function createTextBannerTexture() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  const height = 192

  if (!context) throw new Error('Could not create banner texture')

  context.font = BANNER_FONT
  const textWidth = Math.ceil(context.measureText(BANNER_TEXT).width)
  const tileWidth = textWidth + BANNER_TEXT_GAP

  canvas.width = tileWidth * pixelRatio
  canvas.height = height * pixelRatio
  context.scale(pixelRatio, pixelRatio)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, tileWidth, height)
  context.fillStyle = '#171717'
  context.font = BANNER_FONT
  context.textBaseline = 'middle'
  context.fillText(BANNER_TEXT, BANNER_TEXT_GAP / 2, height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping

  const circumference = 2 * Math.PI * BANNER_FRONT_RADIUS
  const tileAspect = tileWidth / height
  const cylinderAspect = circumference / BANNER_HEIGHT
  const tilesAround = Math.max(2, Math.round(cylinderAspect / tileAspect))

  texture.repeat.set(tilesAround, 1)
  // Place the geometry seam in the whitespace between repeated phrases.
  texture.offset.x = (BANNER_TEXT_GAP / 2) / tileWidth
  texture.anisotropy = 16
  texture.needsUpdate = true

  return texture
}

function createBannerBackTexture() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  const width = 1024
  const height = 128

  if (!context) throw new Error('Could not create banner back texture')

  canvas.width = width * pixelRatio
  canvas.height = height * pixelRatio
  context.scale(pixelRatio, pixelRatio)

  const gradient = context.createLinearGradient(0, 0, width, 0)
  gradient.addColorStop(0, '#e6b84d')
  gradient.addColorStop(0.28, '#f06f43')
  gradient.addColorStop(0.55, '#5db5d8')
  gradient.addColorStop(0.78, '#4654b8')
  gradient.addColorStop(1, '#e6b84d')

  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)

  const sheen = context.createLinearGradient(0, 0, 0, height)
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.42)')
  sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)')
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0.22)')
  context.fillStyle = sheen
  context.fillRect(0, 0, width, height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1, 1)
  texture.anisotropy = 16
  texture.needsUpdate = true

  return texture
}

function useCollageTexture(imageItems) {
  const [loadState, setLoadState] = useState({
    loaded: 0,
    status: 'idle',
    total: 0,
  })
  const [textureResult, setTextureResult] = useState(null)
  const [failed, setFailed] = useState(false)
  const textureRef = useRef(null)
  const sourceKey = imageItems
    .map((item) => `${item.src}|${item.href || ''}`)
    .join('::')

  useEffect(() => {
    let cancelled = false

    async function prepareTexture() {
      setLoadState({ loaded: 0, status: 'loading', total: imageItems.length })
      setFailed(false)
      setTextureResult(null)

      try {
        const result = await createCollageTexture(
          imageItems,
          (loaded, total) => {
            if (!cancelled) setLoadState({ loaded, status: 'loading', total })
          },
        )
        if (cancelled) {
          result.texture.dispose()
          return
        }

        textureRef.current?.dispose()
        textureRef.current = result.texture
        setTextureResult(result)
        setLoadState({
          loaded: imageItems.length,
          status: 'ready',
          total: imageItems.length,
        })
      } catch {
        if (!cancelled) {
          setFailed(true)
          setLoadState({
            loaded: imageItems.length,
            status: 'failed',
            total: imageItems.length,
          })
        }
      }
    }

    if (imageItems.length) {
      prepareTexture()
    } else {
      setFailed(false)
      setTextureResult(null)
      setLoadState({ loaded: 0, status: 'idle', total: 0 })
    }

    return () => {
      cancelled = true
    }
  }, [imageItems, sourceKey])

  useEffect(() => {
    return () => {
      textureRef.current?.dispose()
    }
  }, [])

  return { failed, loadState, textureResult }
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionPreference = () => setReducedMotion(mediaQuery.matches)

    updateMotionPreference()
    mediaQuery.addEventListener('change', updateMotionPreference)

    return () => mediaQuery.removeEventListener('change', updateMotionPreference)
  }, [])

  return reducedMotion
}

function useIsMobileScene() {
  const [isMobileScene, setIsMobileScene] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_SCENE_QUERY)
    const updateSceneSize = () => setIsMobileScene(mediaQuery.matches)

    updateSceneSize()
    mediaQuery.addEventListener('change', updateSceneSize)

    return () => mediaQuery.removeEventListener('change', updateSceneSize)
  }, [])

  return isMobileScene
}

function useScrollRotationBoost() {
  const boostRef = useRef(0)

  useEffect(() => {
    let lastScrollY = window.scrollY
    let lastTime = performance.now()

    const addBoost = (amount) => {
      boostRef.current = Math.min(SCROLL_ROTATION_MAX_BOOST, boostRef.current + amount)
    }

    const handleWheel = (event) => {
      addBoost(
        Math.min(
          SCROLL_ROTATION_MAX_BOOST,
          Math.abs(event.deltaY) * SCROLL_ROTATION_WHEEL_FACTOR,
        ),
      )
    }

    const handleScroll = () => {
      const now = performance.now()
      const elapsed = Math.max(now - lastTime, 16)
      const delta = Math.abs(window.scrollY - lastScrollY)

      addBoost(
        Math.min(
          SCROLL_ROTATION_MAX_BOOST,
          (delta / elapsed) * SCROLL_ROTATION_SCROLL_FACTOR,
        ),
      )

      lastScrollY = window.scrollY
      lastTime = now
    }

    window.addEventListener('wheel', handleWheel, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return boostRef
}

function createRepeatedTexture(baseTexture, repeat = [1, 1]) {
  const texture = baseTexture.clone()
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = true
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat[0], repeat[1])
  texture.anisotropy = 16
  texture.needsUpdate = true

  return texture
}

function setupCylinderTextureMapping(texture, dimensions, radius, height) {
  const cylinderAspectRatio = (2 * Math.PI * radius) / height

  if (dimensions.aspectRatio > cylinderAspectRatio) {
    texture.repeat.x = cylinderAspectRatio / dimensions.aspectRatio
    texture.repeat.y = 1
    texture.offset.x = (1 - texture.repeat.x) / 2
  } else {
    texture.repeat.x = 1
    texture.repeat.y = dimensions.aspectRatio / cylinderAspectRatio
  }

  texture.offset.y = (1 - texture.repeat.y) / 2
}

function getLinkedHrefForPointer(textureResult, texture, uv) {
  if (!uv) return textureResult.fallbackHref

  const textureX = getWrappedTextureCoordinate((uv.x * texture.repeat.x) + texture.offset.x)
  const hitArea = textureResult.hitAreas.find(
    (area) => area.href && textureX >= area.start && textureX < area.end,
  )

  return hitArea?.href || textureResult.fallbackHref
}

function Billboard({ dimensions, index, onActivate, textureResult }) {
  const meshRef = useRef(null)
  const texture = useMemo(() => {
    const nextTexture = createRepeatedTexture(textureResult.texture)
    setupCylinderTextureMapping(nextTexture, dimensions, BILLBOARD_RADIUS, BILLBOARD_HEIGHT)
    nextTexture.offset.x += index * 0.045

    return nextTexture
  }, [dimensions, index, textureResult])

  useEffect(() => {
    return () => texture.dispose()
  }, [texture])

  useFrame((_, delta) => {
    const direction = index % 2 === 0 ? 1 : -1
    texture.offset.x += direction * delta * (0.048 + index * 0.003)
  })

  const handleClick = (event) => {
    if (!onActivate) return

    event.stopPropagation()
    if (event.delta > 6) return

    const targetHref = getLinkedHrefForPointer(textureResult, texture, event.uv)
    if (targetHref) onActivate(targetHref)
  }

  const handlePointerOver = (event) => {
    if (!onActivate) return

    event.stopPropagation()
    document.body.style.cursor = 'pointer'
  }

  const handlePointerOut = () => {
    if (!onActivate) return

    document.body.style.cursor = ''
  }

  return (
    <mesh
      onClick={handleClick}
      onPointerOut={handlePointerOut}
      onPointerOver={handlePointerOver}
      ref={meshRef}
      position={[0, (index - (Math.ceil(COUNT / 2) - 1)) * GAP, 0]}
      rotation={[0, index * Math.PI * 0.5, 0]}
    >
      <cylinderGeometry args={[BILLBOARD_RADIUS, BILLBOARD_RADIUS, BILLBOARD_HEIGHT, 120, 1, true]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  )
}

function Banner({ index, reducedMotion }) {
  const groupRef = useRef(null)
  const frontTexture = useMemo(() => createTextBannerTexture(), [])
  const backTexture = useMemo(() => createBannerBackTexture(), [])

  useEffect(() => {
    return () => {
      frontTexture.dispose()
      backTexture.dispose()
    }
  }, [frontTexture, backTexture])

  useFrame((_, delta) => {
    if (!groupRef.current || reducedMotion) return

    const direction = index % 2 === 0 ? 1 : -1
    frontTexture.offset.x += direction * delta * 0.13
    backTexture.offset.x -= direction * delta * 0.035
  })

  return (
    <group
      ref={groupRef}
      position={[0, (index - (Math.ceil(COUNT / 2) - 1)) * GAP - GAP * 0.5, 0]}
      rotation={[0, 0, 0.085]}
    >
      <mesh renderOrder={20} rotation={[0, BANNER_SEAM_ROTATION_Y, 0]}>
        <cylinderGeometry
          args={[
            BANNER_FRONT_RADIUS,
            BANNER_FRONT_RADIUS,
            BANNER_HEIGHT,
            Math.round(BANNER_FRONT_RADIUS * 80),
            Math.round(BANNER_FRONT_RADIUS * 10),
            true,
          ]}
        />
        <meshBasicMaterial
          depthWrite
          map={frontTexture}
          side={THREE.FrontSide}
          toneMapped={false}
        />
      </mesh>
      <mesh renderOrder={19} rotation={[0, BANNER_SEAM_ROTATION_Y, 0]}>
        <cylinderGeometry
          args={[
            BANNER_BACK_RADIUS,
            BANNER_BACK_RADIUS,
            BANNER_HEIGHT,
            Math.round(BANNER_BACK_RADIUS * 80),
            Math.round(BANNER_BACK_RADIUS * 10),
            true,
          ]}
        />
        <meshBasicMaterial
          depthWrite
          map={backTexture}
          side={THREE.BackSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

function KineticScene({
  isMobileScene,
  onActivate,
  reducedMotion,
  scrollBoostRef,
  textureResult,
}) {
  const groupRef = useRef(null)
  const sceneScale = isMobileScene ? 0.64 : 1
  const sceneY = isMobileScene ? -1.85 : -3.15

  useFrame(({ pointer }, delta) => {
    if (!groupRef.current || reducedMotion) return
    const scrollBoost = scrollBoostRef.current
    const rotationSpeed = BASE_ROTATION_SPEED + scrollBoost

    scrollBoostRef.current = THREE.MathUtils.damp(
      scrollBoost,
      0,
      SCROLL_ROTATION_DECAY,
      delta,
    )

    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      SCENE_BASE_ROTATION_X + pointer.y * 0.035,
      0.04,
    )
    groupRef.current.rotation.z = THREE.MathUtils.lerp(
      groupRef.current.rotation.z,
      SCENE_BASE_ROTATION_Z + pointer.x * 0.02,
      0.04,
    )
    groupRef.current.rotation.y += delta * rotationSpeed
  })

  return (
    <group
      ref={groupRef}
      position={[0, sceneY, 0]}
      rotation={[SCENE_BASE_ROTATION_X, 0, SCENE_BASE_ROTATION_Z]}
      scale={sceneScale}
    >
      {Array.from({ length: COUNT }, (_, index) => (
        <group key={index}>
          <Billboard
            dimensions={textureResult.dimensions}
            index={index}
            onActivate={onActivate}
            textureResult={textureResult}
          />
          <Banner index={index} reducedMotion={reducedMotion} />
        </group>
      ))}
    </group>
  )
}

function KineticFallback({ items, visible }) {
  if (!items.length) return null

  return (
    <div className={`kinetic-fallback${visible ? ' is-visible' : ''}`}>
      <div className="kinetic-fallback__grid">
        {items.map((item, index) => {
          const tileStyle = {
            backgroundImage: `url("${item.src.replaceAll('"', '\\"')}")`,
          }

          if (!item.href) {
            return (
              <div
                className="kinetic-fallback__tile"
                key={`${item.src}-${index}`}
                style={tileStyle}
              />
            )
          }

          return (
            <a
              aria-label="Open related artist page"
              className="kinetic-fallback__tile"
              href={item.href}
              key={`${item.src}-${index}`}
              style={tileStyle}
            />
          )
        })}
      </div>
    </div>
  )
}

function normalizeHeroItems(items = [], fallbackHref) {
  return items
    .map((item) => {
      if (typeof item === 'string') {
        return { href: fallbackHref, src: item }
      }

      return {
        href: item.href || fallbackHref,
        src: item.src,
      }
    })
    .filter((item) => item.src)
}

export function KineticExhibitionHero({
  fallbackHref,
  href,
  images = [],
  items = [],
  onNavigate,
}) {
  const sourceItems = items.length ? items : images
  const heroItems = useMemo(
    () => normalizeHeroItems(sourceItems, fallbackHref || href),
    [fallbackHref, href, sourceItems],
  )
  const accessHref = fallbackHref || href || heroItems.find((item) => item.href)?.href
  const isMobileScene = useIsMobileScene()
  const reducedMotion = usePrefersReducedMotion()
  const scrollBoostRef = useScrollRotationBoost()
  const { failed, loadState, textureResult } = useCollageTexture(heroItems)
  const isReady = Boolean(textureResult && !failed)
  const isLoading = loadState.status === 'loading'
  const progress =
    loadState.total > 0
      ? Math.round((loadState.loaded / loadState.total) * 100)
      : 0
  const openLinkedPage = useCallback((targetHref) => {
    if (!targetHref) return
    if (onNavigate) {
      onNavigate(targetHref)
      return
    }
    window.location.assign(targetHref)
  }, [onNavigate])

  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
    }
  }, [])

  return (
    <div
      aria-hidden={accessHref ? undefined : 'true'}
      className={`kinetic-visual${accessHref ? ' is-clickable' : ''}${isReady ? ' is-ready' : ''}${
        isLoading ? ' is-loading' : ''
      }`}
    >
      {accessHref ? (
        <a className="kinetic-visual__access-link" href={accessHref}>
          Open current exhibition page
        </a>
      ) : null}
      {isLoading ? (
        <div className="kinetic-preloader">
          <span className="kinetic-preloader__title">Loading exhibition</span>
          <span className="kinetic-preloader__progress">{progress}%</span>
        </div>
      ) : null}
      <KineticFallback items={heroItems} visible={failed} />
      {isReady ? (
        <Canvas
          camera={{ fov: 7.2, near: 0.01, far: 100000, position: [0, 0, 112] }}
          className="kinetic-visual__canvas"
          dpr={[1, 1.5]}
          frameloop={reducedMotion ? 'demand' : 'always'}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        >
          <KineticScene
            isMobileScene={isMobileScene}
            onActivate={accessHref ? openLinkedPage : undefined}
            reducedMotion={reducedMotion}
            scrollBoostRef={scrollBoostRef}
            textureResult={textureResult}
          />
        </Canvas>
      ) : null}
      <div className="kinetic-visual__shade" />
    </div>
  )
}
