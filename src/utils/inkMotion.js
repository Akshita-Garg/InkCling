// Settle smoothly from the current recording frame to the full resting bloom.
export function setInkRecording(scene, recording) {
  if (!scene) return
  const ink = scene.querySelector('.ic-ink-wash')
  if (!ink) return
  const wasRecording = scene.dataset.recording === 'true'
  if (wasRecording === recording && scene.dataset.recording) return
  const previousProgress = getComputedStyle(ink).getPropertyValue('--ic-ink-progress')
  for (const animation of scene.getAnimations({ subtree: true })) {
    if (animation.id === 'ink-settle') animation.cancel()
  }
  scene.dataset.recording = String(recording)
  if (wasRecording && !recording && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const settle = ink.animate([
      { '--ic-ink-progress': previousProgress },
      { '--ic-ink-progress': '1' },
    ], { duration: 1100, easing: 'cubic-bezier(.4,0,.25,1)' })
    settle.id = 'ink-settle'
  }
}
