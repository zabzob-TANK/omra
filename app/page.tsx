import { redirect } from 'next/navigation'
import { requireAdministrator } from '@/lib/admin-guard'

export default async function Home() {
  let isAdministrator = false

  try {
    await requireAdministrator()
    isAdministrator = true
  } catch {
    // Unauthenticated users are sent to the login page.
  }

  redirect(isAdministrator ? '/admin' : '/login')
}
