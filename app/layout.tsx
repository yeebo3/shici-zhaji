import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '诗词札记',
  description: '安静优雅的古诗词背诵学习工具',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  )
}
