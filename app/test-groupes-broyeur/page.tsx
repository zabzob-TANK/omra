import { notFound, redirect } from 'next/navigation'
import { requireActiveAccount } from '@/lib/admin-guard'
import PosteDeTri from './poste-de-tri'

export const dynamic = 'force-dynamic'

// Banc d'essai : jamais servi hors développement, et seulement à un compte actif.
export default async function TestGroupesBroyeur() {
  if (process.env.NODE_ENV !== 'development') notFound()
  const autorise = await requireActiveAccount().then(() => true, () => false)
  // Même porte que le fichier clients : la connexion Facturation, pas celle de l'Administration.
  if (!autorise) redirect('/facturation')
  return <PosteDeTri />
}
