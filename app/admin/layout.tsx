import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { requireAdministrator } from '@/lib/admin-guard'
import { NavGuardProvider } from '@/components/admin/nav-guard'
import { ConfirmProvider } from '@/components/admin/confirm-provider'
import { AdminNav } from '@/components/admin/admin-nav'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  try {
    await requireAdministrator()
  } catch {
    // Séparation étanche Facturation/Administration : ne jamais déconnecter
    // ici (/logout) — la session en cours peut être une session Facturation
    // parfaitement valide qui vient seulement de taper /admin par erreur.
    // On refuse l'accès à l'Administration, sans y toucher.
    redirect('/login')
  }

  return (
    <NavGuardProvider>
      <ConfirmProvider>
        <div className="flex min-h-screen flex-col bg-background text-foreground">
          <AdminNav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6">
            {children}
          </main>
        </div>
      </ConfirmProvider>
    </NavGuardProvider>
  )
}
