'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

function isInternalPath(target: string): boolean {
  return target.startsWith('/') && !target.startsWith('//')
}

export function useAndroidBackToPath(target: string | null) {
  const router = useRouter()

  useEffect(() => {
    if (!target || !isInternalPath(target)) return

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
          router.replace(target)
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
  }, [target, router])
}
