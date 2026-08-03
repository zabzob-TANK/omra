'use server'

import { redirect } from 'next/navigation'
import { findActiveAccountByAuthUserId } from '@/lib/account-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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
  const { data: slot, error: slotError } = await admin
    .from('account_slots')
    .select('slot_number, login, auth_user_id')
    .eq('login', identifier)
    .eq('active', true)
    .single()

  if (
    slotError ||
    !slot ||
    !slot.auth_user_id ||
    slot.login !== identifier
  ) {
    redirect('/login?error=identifiants')
  }

  const { data: authUser, error: authUserError } =
    await admin.auth.admin.getUserById(slot.auth_user_id)

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

  let account = null

  try {
    account = await findActiveAccountByAuthUserId(data.user.id)
  } catch {
    // Access fails closed when the active slot cannot be resolved server-side.
  }

  if (!account || account.auth_user_id !== slot.auth_user_id) {
    await supabase.auth.signOut()
    redirect('/login?error=acces')
  }

  redirect(account.slot_number === 1 ? '/admin' : '/facturation')
}
