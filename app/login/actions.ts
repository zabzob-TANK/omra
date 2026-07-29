'use server'

import { redirect } from 'next/navigation'
import { isTestAdmin } from '@/lib/auth'
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
  const fallbackAdminEmail = process.env.OMRA_TEST_ADMIN_EMAIL
    ?.trim()
    .toLowerCase()
  let email: string
  let expectedAuthUserId: string | null = null

  if (fallbackAdminEmail && identifier === fallbackAdminEmail) {
    email = fallbackAdminEmail
  } else {
    const admin = createAdminClient()
    const { data: slot, error: slotError } = await admin
      .from('account_slots')
      .select('login, auth_user_id, active')
      .eq('slot_number', 1)
      .single()

    if (
      slotError ||
      !slot ||
      slot.login?.trim().toLowerCase() !== identifier ||
      !slot.auth_user_id ||
      !slot.active
    ) {
      redirect('/login?error=identifiants')
    }

    const { data: authUser, error: authUserError } =
      await admin.auth.admin.getUserById(slot.auth_user_id)

    if (authUserError || !authUser.user?.email) {
      redirect('/login?error=identifiants')
    }

    email = authUser.user.email
    expectedAuthUserId = slot.auth_user_id
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    redirect('/login?error=identifiants')
  }

  const isFallbackAdmin = isTestAdmin(data.user)
  const isSlotAdministrator =
    expectedAuthUserId !== null && data.user.id === expectedAuthUserId

  if (!isFallbackAdmin && !isSlotAdministrator) {
    await supabase.auth.signOut()
    redirect('/login?error=acces')
  }

  redirect('/admin')
}
