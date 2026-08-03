import { redirect } from 'next/navigation'
import { requireAdministrator } from '@/lib/admin-guard'

/**
 * Séparation étanche Facturation/Administration : une seule vérification,
 * Administration. Un visiteur anonyme ou une session Facturation est envoyé
 * vers /facturation (usage quotidien) — l'Administration reste accessible
 * directement via /login. `redirect()` lève une exception interne que
 * Next.js seul doit intercepter — jamais le catch ci-dessous.
 */
export default async function Home() {
  let estAdministration = false
  try {
    await requireAdministrator()
    estAdministration = true
  } catch {
    // Pas une session Administration valide — on continue.
  }

  redirect(estAdministration ? '/admin' : '/facturation')
}
