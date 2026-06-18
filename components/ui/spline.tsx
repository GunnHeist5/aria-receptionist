'use client'

import { useEffect, useRef } from 'react'

interface SplineSceneProps {
  scene?: string
  className?: string
}

export function SplineScene({ className }: SplineSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Create animated gradient background with animated elements
    const canvas = document.createElement('canvas')
    canvas.width = containerRef.current.clientWidth
    canvas.height = containerRef.current.clientHeight
    const ctx = canvas.getContext('2d')

    if (!ctx) return

    let animationFrameId: number

    const animate = () => {
      // Create gradient background
      const time = Date.now() / 1000

      // Create radial gradient that animates
      const gradient = ctx.createRadialGradient(
        canvas.width / 2 + Math.sin(time * 0.5) * 50,
        canvas.height / 2 + Math.cos(time * 0.3) * 50,
        0,
        canvas.width / 2,
        canvas.height / 2,
        Math.max(canvas.width, canvas.height)
      )

      gradient.addColorStop(0, `hsl(${(time * 20) % 360}, 100%, 50%)`)
      gradient.addColorStop(0.5, `hsl(${(time * 15 + 120) % 360}, 80%, 30%)`)
      gradient.addColorStop(1, '#050505')

      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw animated particles
      for (let i = 0; i < 50; i++) {
        const x = (Math.sin(time * 0.2 + i) * 200 + canvas.width / 2) % canvas.width
        const y = (Math.cos(time * 0.15 + i * 0.5) * 200 + canvas.height / 2) % canvas.height
        const size = Math.sin(time + i) * 2 + 3
        const opacity = Math.sin(time * 0.5 + i) * 0.5 + 0.5

        ctx.fillStyle = `rgba(201, 168, 76, ${opacity * 0.6})`
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fill()
      }

      animationFrameId = requestAnimationFrame(animate)
    }

    containerRef.current.appendChild(canvas)
    animate()

    const handleResize = () => {
      if (containerRef.current) {
        canvas.width = containerRef.current.clientWidth
        canvas.height = containerRef.current.clientHeight
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className || ''}`}
      style={{
        background: '#050505',
        position: 'relative',
        overflow: 'hidden'
      }}
    />
  )
}
