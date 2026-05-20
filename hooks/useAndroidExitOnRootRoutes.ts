'use client'

import { useEffect } from 'react'

const ROOT_ROUTES = new Set(['/', '/category', '/mine'])
const EXIT_CONFIRM_WINDOW_MS = 1600
let lastBackAt = 0
let hintTimer: number | null = null

function normalizePathname(pathname: string): string {
  if (!pathname) return '/'
  if (pathname === '/') return pathname
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

function showExitHint() {
  if (typeof document === 'undefined') return
  const id = 'shici-android-exit-hint'
  let hint = document.getElementById(id)
  if (!hint) {
    hint = document.createElement('div')
    hint.id = id
    hint.textContent = '再按一次返回退出'
    hint.setAttribute('role', 'status')
    hint.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:calc(1rem + env(safe-area-inset-bottom))',
      'transform:translateX(-50%)',
      'z-index:9999',
      'padding:0.55rem 0.8rem',
      'border-radius:0.5rem',
      'background:rgba(28,25,23,0.88)',
      'color:white',
      'font-size:0.8rem',
      'line-height:1',
      'box-shadow:0 8px 24px rgba(0,0,0,0.18)',
      'pointer-events:none',
    ].join(';')
    document.body.appendChild(hint)
  }

  if (hintTimer) window.clearTimeout(hintTimer)
  hintTimer = window.setTimeout(() => {
    document.getElementById(id)?.remove()
    hintTimer = null
  }, EXIT_CONFIRM_WINDOW_MS)
}

export function useAndroidExitOnRootRoutes(pathname: string) {
  useEffect(() => {
    const normalizedPath = normalizePathname(pathname)
    if (!ROOT_ROUTES.has(normalizedPath)) return

    let cancelled = false
    let removeListener: (() => Promise<void>) | null = null

    const register = async () => {
      try {
        const [{ Capacitor }, { App }] = await Promise.all([
          import('@capacitor/core'),
          import('@capacitor/app'),
        ])

        if (cancelled) return
        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return

        const listener = await App.addListener('backButton', () => {
          const now = Date.now()
          if (now - lastBackAt <= EXIT_CONFIRM_WINDOW_MS) {
            void App.exitApp()
            return
          }
          lastBackAt = now
          showExitHint()
        })

        if (cancelled) {
          await listener.remove()
          return
        }

        removeListener = () => listener.remove()
      } catch {
        // Ignore and keep default system back behavior.
      }
    }

    void register()

    return () => {
      cancelled = true
      if (removeListener) {
        void removeListener()
      }
    }
  }, [pathname])
}
