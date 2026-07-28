'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
    setMounted(true)
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('zemzem-theme', next ? 'dark' : 'light')
    } catch {}
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      aria-label={dark ? 'Activer le mode clair' : 'Activer le mode sombre'}
    >
      {mounted && dark ? <Sun /> : <Moon />}
      <span>{mounted && dark ? 'Mode clair' : 'Mode sombre'}</span>
    </Button>
  )
}
