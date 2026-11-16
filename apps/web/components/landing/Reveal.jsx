'use client'
import { useEffect, useRef, useState } from 'react'

// Memunculkan elemen dengan animasi saat masuk layar (IntersectionObserver). Tanpa JS/observer atau dengan gerak berkurang: langsung tampil.
export default function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return undefined }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect() }
    }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag ref={ref} className={`fc-reveal ${shown ? 'fc-in' : ''} ${className}`} style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}>
      {children}
    </Tag>
  )
}
