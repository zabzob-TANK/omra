import { redirect } from 'next/navigation'
import { requireActiveAccount } from '@/lib/admin-guard'

export default async function Home() {
  let destination: '/admin' | '/facturation' | '/login' = '/login'

  try {
    const account = await requireActiveAccount()
    destination = account.slot_number === 1 ? '/admin' : '/facturation'
  } catch {
    // Unauthenticated users are sent to the login page.
  }

  redirect(destination)
}
