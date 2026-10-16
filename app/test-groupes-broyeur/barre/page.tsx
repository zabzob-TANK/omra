import { notFound, redirect } from 'next/navigation'
import { requireActiveAccount } from '@/lib/admin-guard'
import Barre from './barre'

export const dynamic = 'force-dynamic'

// Banc d'essai de la barre de gestion : jamais servi hors développement, et seulement à un compte actif.
export default async function TestBarre() {
  if (process.env.NODE_ENV !== 'development') notFound()
  const autorise = await requireActiveAccount().then(() => true, () => false)
  // Même porte que le fichier clients : la connexion Facturation, pas celle de l'Administration.
  if (!autorise) redirect('/facturation')
  return <Barre />
}
