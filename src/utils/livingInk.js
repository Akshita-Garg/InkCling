// Local, bounded canvas animation shared by Electron and the download page.
// The diffusion map is computed once per image. Frames only update its alpha.
const SIZE = 256
const SOURCE = { x: .40, y: .66 }
// Measured dark pigment centre in the approved transparent artwork. Align the
// painted stain itself to the nib, not just the animation's starting point.
const PAINTED_SOURCE = { x: .4601, y: .7029 }
const ART_SCALE = .88
const textures = new Map()

function noise(x, y) {
  const hash = (a, b) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
    return n - Math.floor(n)
  }
  const ix = Math.floor(x), iy = Math.floor(y)
  const sx = x - ix, sy = y - iy
  const tx = sx * sx * (3 - 2 * sx), ty = sy * sy * (3 - 2 * sy)
  return (hash(ix, iy) * (1 - tx) + hash(ix + 1, iy) * tx) * (1 - ty)
    + (hash(ix, iy + 1) * (1 - tx) + hash(ix + 1, iy + 1) * tx) * ty
}

function diffusion(pixels) {
  const count = SIZE * SIZE
  const travel = new Float64Array(count).fill(Infinity)
  const resistance = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const x = i % SIZE, y = Math.floor(i / SIZE)
    // Ink advances readily through the existing stain's branches, more slowly
    // across transparent gaps, with different permeability in each direction.
    resistance[i] = .6 + 1.4 * noise(x / 18, y / 18)
      + .7 * noise(x / 5, y / 5) + (pixels[i * 4 + 3] < 16 ? 3 : 0)
  }
  const heap = []
  const push = (index, distance) => {
    const item = [index, distance]
    let k = heap.length
    heap.push(item)
    while (k > 0) {
      const parent = (k - 1) >> 1
      if (heap[parent][1] <= distance) break
      heap[k] = heap[parent]; k = parent
    }
    heap[k] = item
  }
  const pop = () => {
    const first = heap[0], last = heap.pop()
    if (heap.length) {
      let k = 0
      while (k * 2 + 1 < heap.length) {
        let child = k * 2 + 1
        if (child + 1 < heap.length && heap[child + 1][1] < heap[child][1]) child++
        if (heap[child][1] >= last[1]) break
        heap[k] = heap[child]; k = child
      }
      heap[k] = last
    }
    return first
  }
  const source = Math.round(SOURCE.y * SIZE) * SIZE + Math.round(SOURCE.x * SIZE)
  travel[source] = 0; push(source, 0)
  while (heap.length) {
    const [index, distance] = pop()
    if (distance > travel[index]) continue
    const x = index % SIZE, y = Math.floor(index / SIZE)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || x + dx >= SIZE || y + dy < 0 || y + dy >= SIZE) continue
      const next = index + dy * SIZE + dx
      const step = dx && dy ? Math.SQRT2 : 1
      const cost = distance + step * (resistance[index] + resistance[next]) * .5
      if (cost < travel[next]) { travel[next] = cost; push(next, cost) }
    }
  }
  let maximum = 0
  for (let i = 0; i < count; i++) if (pixels[i * 4 + 3] > 8) maximum = Math.max(maximum, travel[i])
  for (let i = 0; i < count; i++) travel[i] /= maximum || 1
  return travel
}

function loadTexture(url) {
  if (!textures.has(url)) textures.set(url, (async () => {
    const image = new Image()
    image.src = url
    await image.decode()
    const aligned = document.createElement('canvas')
    aligned.width = aligned.height = image.naturalWidth
    aligned.getContext('2d').drawImage(image,
      (SOURCE.x - PAINTED_SOURCE.x * ART_SCALE) * aligned.width,
      (SOURCE.y - PAINTED_SOURCE.y * ART_SCALE) * aligned.height,
      aligned.width * ART_SCALE, aligned.height * ART_SCALE)
    const scratch = document.createElement('canvas')
    scratch.width = scratch.height = SIZE
    const context = scratch.getContext('2d', { willReadFrequently: true })
    context.drawImage(aligned, 0, 0, SIZE, SIZE)
    const pixels = context.getImageData(0, 0, SIZE, SIZE).data
    return { image: aligned, arrival: diffusion(pixels) }
  })())
  return textures.get(url)
}

export function mountLivingInk(scene, url) {
  const canvas = scene.querySelector('canvas')
  const wash = scene.querySelector('.ic-ink-wash')
  const context = canvas.getContext('2d')
  const mask = document.createElement('canvas')
  mask.width = mask.height = SIZE
  const maskContext = mask.getContext('2d')
  const frame = maskContext.createImageData(SIZE, SIZE)
  for (let i = 0; i < SIZE * SIZE; i++) frame.data.set([255, 255, 255, 0], i * 4)
  const media = matchMedia('(prefers-reduced-motion: reduce)')
  let texture, disposed = false, timer = 0, lastProgress = -1, lastTime = 0
  // 512px is ample for a 230px sidebar; cap the larger hero at 768px.
  canvas.width = canvas.height = Math.min(768, Math.max(384, Math.round(scene.clientWidth * Math.min(devicePixelRatio || 1, 2))))

  function render(progress) {
    if (!texture || disposed) return
    progress = Math.max(0, Math.min(1, progress))
    if (Math.abs(progress - lastProgress) < .0005) return
    lastProgress = progress
    const threshold = .009 + progress * 1.05
    for (let i = 0; i < texture.arrival.length; i++) {
      const t = Math.max(0, Math.min(1, (threshold - texture.arrival[i]) / .045))
      frame.data[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255)
    }
    maskContext.putImageData(frame, 0, 0)
    const size = canvas.width
    context.clearRect(0, 0, size, size)
    context.globalCompositeOperation = 'source-over'
    context.drawImage(mask, 0, 0, size, size)
    context.globalCompositeOperation = 'source-in'
    context.drawImage(texture.image, 0, 0, size, size)
    context.globalCompositeOperation = 'source-over'
    // The small wet source remains visible through the recording loop.
    context.fillStyle = '#476E90'
    context.beginPath()
    context.ellipse(SOURCE.x * size, SOURCE.y * size, size * .008, size * .0048, -.15, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = 'rgba(182,211,235,.48)'
    context.beginPath()
    context.ellipse((SOURCE.x - .002) * size, (SOURCE.y - .0015) * size, size * .003, size * .001, -.15, 0, Math.PI * 2)
    context.fill()
    scene.dataset.inkProgress = progress.toFixed(4)
  }

  const progress = () => media.matches ? 1 : parseFloat(getComputedStyle(wash).getPropertyValue('--ic-ink-progress')) || 0
  function tick(time) {
    timer = 0
    if (disposed || document.hidden) return
    if (time - lastTime >= 1000 / 30) { render(progress()); lastTime = time }
    const settling = wash.getAnimations().some(animation => animation.id === 'ink-settle' && animation.playState === 'running')
    if (!media.matches && scene.dataset.paused !== 'true' && (scene.dataset.recording === 'true' || settling)) timer = requestAnimationFrame(tick)
    else render(progress())
  }
  function wake() {
    if (disposed) return
    if (!document.hidden) render(progress())
    if (!timer && !document.hidden) timer = requestAnimationFrame(tick)
  }
  const observer = new MutationObserver(wake)
  observer.observe(scene, { attributes: true, attributeFilter: ['data-recording', 'data-paused'] })
  const visibility = () => {
    scene.dataset.inkHidden = String(document.hidden)
    if (document.hidden) { cancelAnimationFrame(timer); timer = 0 } else wake()
  }
  document.addEventListener('visibilitychange', visibility)
  media.addEventListener('change', wake)
  // Also wakes a stopped loop when an inspection tool seeks a paused CSS animation.
  wash.addEventListener('animationstart', wake)
  loadTexture(url).then(value => {
    if (disposed) return
    texture = value
    scene.dataset.inkReady = 'true'
    wake()
  }).catch(error => {
    if (!disposed) { scene.dataset.inkReady = 'error'; console.error('Ink artwork could not load', error) }
  })
  return () => {
    disposed = true
    cancelAnimationFrame(timer)
    observer.disconnect()
    document.removeEventListener('visibilitychange', visibility)
    media.removeEventListener('change', wake)
    wash.removeEventListener('animationstart', wake)
  }
}
