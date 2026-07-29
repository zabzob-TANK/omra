import { redirect } from 'next/navigation'
import { isTestAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  redirect(data?.claims?.sub && isTestAdmin(data.claims) ? '/admin' : '/login')
}
