import { useLayoutEffect, useRef } from 'react'
import { mountLivingInk } from '../utils/livingInk'
import { setInkRecording } from '../utils/inkMotion'
import inkUrl from '../assets/ink/soft-ink-pink.png'
import nibUrl from '../assets/wash/ink-pen.svg'

export function LivingInk({ recording }) {
  const scene = useRef(null)
  useLayoutEffect(() => mountLivingInk(scene.current, inkUrl), [])
  useLayoutEffect(() => setInkRecording(scene.current, recording), [recording])
  return (
    <div className="ic-ink-scene" ref={scene} aria-hidden="true">
      <div className="ic-ink-art">
        <span className="ic-ink-wash"><canvas className="ic-ink-canvas" /></span>
        <img className="ic-living-nib" src={nibUrl} alt="" draggable="false" />
      </div>
    </div>
  )
}
