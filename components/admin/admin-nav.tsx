'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/admin/logo'
import { ThemeToggle } from '@/components/admin/theme-toggle'
import { useNavGuard } from '@/components/admin/nav-guard'

export function AdminNav() {
  const router = useRouter()
  const { requestLeave } = useNavGuard()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <button
          type="button"
          onClick={() => requestLeave(() => router.push('/admin'))}
          className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Retour à l'accueil de l'administration"
        >
          <Logo size={40} showText />
        </button>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => requestLeave(() => router.push('/'))}
          >
            <LogOut />
            <span>Déconnexion</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
