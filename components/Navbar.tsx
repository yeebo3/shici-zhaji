'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Grid3X3, User, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useStudy'

export default function Navbar() {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()

  const links = [
    { href: '/', label: '首页', icon: BookOpen },
    { href: '/category', label: '分类', icon: Grid3X3 },
    { href: '/mine', label: '我的', icon: User },
  ]

  return (
    <header className="sticky top-0 z-50 bg-parchment/80 dark:bg-night/80 backdrop-blur-md border-b border-stone/10 dark:border-stone/5">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-serif text-lg font-semibold tracking-widest">诗词札记</span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors
                  ${active
                    ? 'text-ink dark:text-night-text bg-ink/5 dark:bg-white/5'
                    : 'text-ink/50 dark:text-night-text/50 hover:text-ink/80 dark:hover:text-night-text/80'
                  }`}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            )
          })}
          <button
            onClick={toggleTheme}
            className="ml-1 p-2 rounded-md text-ink/50 dark:text-night-text/50 hover:text-ink/80 dark:hover:text-night-text/80 transition-colors"
            aria-label="切换主题"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </nav>
      </div>
    </header>
  )
}
