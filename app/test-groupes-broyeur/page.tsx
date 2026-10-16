import { notFound, redirect } from 'next/navigation'
import { requireActiveAccount } from '@/lib/admin-guard'
import PosteDeTri from './poste-de-tri'

export const dynamic = 'force-dynamic'

// Banc d'essai : servi en développement et sur le site de test, et seulement à un compte actif.
export default async function TestGroupesBroyeur() {
  // Aussi sur le site de test omra-chi (adresse de production du projet Vercel « omra »), jamais sur celui des
  // vrais clients (autorisé le 2026-10-16).
  const siteDeTest = process.env.VERCEL_PROJECT_PRODUCTION_URL === 'omra-chi.vercel.app'
  if (process.env.NODE_ENV !== 'development' && !siteDeTest) notFound()
  const autorise = await requireActiveAccount().then(() => true, () => false)
  // Même porte que le fichier clients : la connexion Facturation, pas celle de l'Administration.
  if (!autorise) redirect('/facturation')
  return <PosteDeTri />
}
