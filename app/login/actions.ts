'use server'

import { redirect } from 'next/navigation'
import { findActiveAdminAccountByAuthUserId } from '@/lib/admin-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Porte exclusive de l'Administration (séparation étanche Facturation/
 * Administration) : n'authentifie que sur `admin_accounts`, jamais sur
 * `account_slots` (les 6 emplacements Facturation, qui ont leur propre porte
 * sur `/facturation`). Une seule destination possible : `/admin`.
 */
export async function login(formData: FormData) {
  const identifierValue = formData.get('identifier')
  const password = formData.get('password')

  if (
    typeof identifierValue !== 'string' ||
    typeof password !== 'string' ||
    !identifierValue.trim() ||
    !password
  ) {
    redirect('/login?error=champs')
  }

  const identifier = identifierValue.trim().toLowerCase()
  const admin = createAdminClient()
  const { data: adminAccount, error: adminAccountError } = await admin
    .from('admin_accounts')
    .select('login, auth_user_id')
    .eq('login', identifier)
    .eq('active', true)
    .single()

  if (adminAccountError || !adminAccount?.auth_user_id) {
    redirect('/login?error=identifiants')
  }

  const { data: authUser, error: authUserError } =
    await admin.auth.admin.getUserById(adminAccount.auth_user_id)

  if (authUserError || !authUser.user?.email) {
    redirect('/login?error=identifiants')
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: authUser.user.email,
    password,
  })

  if (error) {
    redirect('/login?error=identifiants')
  }

  // Revérification autoritative post-connexion — jamais la seule recherche
  // initiale par `login`.
  const compteAdmin = await findActiveAdminAccountByAuthUserId(data.user.id)

  if (!compteAdmin || compteAdmin.auth_user_id !== adminAccount.auth_user_id) {
    try {
      await supabase.auth.signOut()
    } catch {
      // Jeton déjà invalide : rien de plus à nettoyer côté serveur Supabase,
      // voir lib/supabase/proxy.ts pour le même garde-fou.
    }
    redirect('/login?error=acces')
  }

  redirect('/admin')
}
