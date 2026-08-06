'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavGuard } from '@/components/admin/nav-guard'
import { createClient } from '@/lib/supabase/client'

export function LogoutButton() {
  const router = useRouter()
  const { requestLeave } = useNavGuard()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    const supabase = createClient()
    try {
      await supabase.auth.signOut()
    } catch {
      // Jeton déjà invalide : la déconnexion est de toute façon déjà
      // acquise, voir lib/supabase/proxy.ts pour le même garde-fou.
    }
    router.replace('/login')
    router.refresh()
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => requestLeave(() => void signOut())}
    >
      <LogOut />
      <span>{pending ? 'Déconnexion…' : 'Déconnexion'}</span>
    </Button>
  )
}
