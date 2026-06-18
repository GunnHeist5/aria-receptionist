import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'ARIA Capital LLC - Autonomous Intelligence, Real Returns',
  description: 'AI-powered acquisition and automation systems that generate wealth while you sleep. Real estate, digital commerce, and intelligent systems.',
  keywords: 'AI, automation, real estate, digital commerce, autonomous systems',
  openGraph: {
    title: 'ARIA Capital LLC',
    description: 'Autonomous Intelligence, Real Returns.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  )
}
