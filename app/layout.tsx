import type { Metadata } from 'next'
import '../src/style.css'
import '../src/studio.css'
import './tailwind.css'

export const metadata: Metadata = {
  title: 'Platform Real Estate Studio',
  description: 'Interactive real-estate site plans and plot availability.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}