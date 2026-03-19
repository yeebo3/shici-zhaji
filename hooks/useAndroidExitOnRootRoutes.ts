'use client'

import { useEffect } from 'react'

const ROOT_ROUTES = new Set(['/', '/category', '/mine'])

function normalizePathname(pathname: string): string {
  if (!pathname) return '/'
  if (pathname === '/') return pathname
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
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
          void App.exitApp()
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
