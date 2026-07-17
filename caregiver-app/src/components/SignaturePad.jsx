import { forwardRef, useRef, useState } from 'react'

/**
 * A simple draw-to-sign pad using the plain canvas API (touch + mouse).
 * Exposes onChange(hasSignature) so the parent knows when it's ready.
 * The canvas itself is forwarded so the parent can export it to a PNG
 * blob at submit time via getCanvasBlob().
 */
const SignaturePad = forwardRef(function SignaturePad({ onChange }, forwardedRef) {
  const localRef = useRef(null)
  const drawing = useRef(false)
  const [hasSig, setHasSig] = useState(false)

  const setRefs = (node) => {
    localRef.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }

  const getCtx = () => localRef.current.getContext('2d')

  const pos = (e) => {
    const rect = localRef.current.getBoundingClientRect()
    const p = e.touches ? e.touches[0] : e
    return { x: p.clientX - rect.left, y: p.clientY - rect.top }
  }

  const start = (e) => {
    e.preventDefault()
    drawing.current = true
    const { x, y } = pos(e)
    const ctx = getCtx()
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const { x, y } = pos(e)
    const ctx = getCtx()
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#0a2540'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.stroke()
    if (!hasSig) { setHasSig(true); onChange?.(true) }
  }
  const end = () => { drawing.current = false }

  const clear = () => {
    const c = localRef.current
    getCtx().clearRect(0, 0, c.width, c.height)
    setHasSig(false)
    onChange?.(false)
  }

  return (
    <div>
      <canvas
        ref={setRefs}
        width={340} height={130}
        style={{ width: '100%', height: 130, border: '1.5px solid var(--line)', borderRadius: 8, background: '#fff', touchAction: 'none' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.3rem' }}>
        <span className="muted" style={{ fontSize: '.78rem' }}>{hasSig ? 'Signed' : 'Sign above'}</span>
        <button type="button" className="btn btn-quiet" style={{ fontSize: '.78rem', padding: '.2rem .5rem' }} onClick={clear}>Clear</button>
      </div>
    </div>
  )
})

export default SignaturePad

export function getCanvasBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
