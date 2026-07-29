'use server'

import { redirect } from 'next/navigation'
import { isTestAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const email = formData.get('email')
  const password = formData.get('password')

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !email.trim() ||
    !password
  ) {
    redirect('/login?error=champs')
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })

  if (error) {
    redirect('/login?error=identifiants')
  }

  if (!isTestAdmin(data.user)) {
    await supabase.auth.signOut()
    redirect('/login?error=acces')
  }

  redirect('/admin')
}
