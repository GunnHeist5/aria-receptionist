import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  metadataBase: new URL('https://reachwellhq.com'),
  title: 'Reachwell — The AI Receptionist That Never Misses a Call',
  description: 'Reachwell is the AI phone receptionist for local service businesses. It answers every call 24/7, books the job, and texts you the details. Live in minutes for $297/mo.',
  keywords: 'AI receptionist, AI phone answering, virtual receptionist, missed call service, answering service, Reachwell',
  openGraph: {
    title: 'Reachwell — Never miss another call',
    description: 'The AI receptionist for local service businesses. Answers 24/7, books the job, texts you the details.',
    type: 'website',
    url: 'https://reachwellhq.com',
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
