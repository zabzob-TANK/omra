import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isTestAdmin } from '@/lib/auth'
import {
  createAdminClient,
  hasServiceRoleKey,
} from '@/lib/supabase/admin'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  let isRedirectResponse = false

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          if (!isRedirectResponse) {
            response = NextResponse.next({ request })
          }
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data, error } = await supabase.auth.getUser()
  const isAdminPath =
    request.nextUrl.pathname === '/admin' ||
    request.nextUrl.pathname.startsWith('/admin/')

  if (!isAdminPath) {
    return response
  }

  if (error || !data.user) {
    isRedirectResponse = true
    response = NextResponse.redirect(new URL('/login', request.url))
    await supabase.auth.signOut()
    return response
  }

  if (isTestAdmin(data.user)) {
    return response
  }

  let isActiveSlotAdministrator = false

  if (hasServiceRoleKey()) {
    const admin = createAdminClient()
    const { data: slot, error: slotError } = await admin
      .from('account_slots')
      .select('slot_number')
      .eq('slot_number', 1)
      .eq('auth_user_id', data.user.id)
      .eq('active', true)
      .maybeSingle()

    isActiveSlotAdministrator = !slotError && Boolean(slot)
  }

  if (isActiveSlotAdministrator) {
    return response
  }

  isRedirectResponse = true
  response = NextResponse.redirect(new URL('/login?error=acces', request.url))
  await supabase.auth.signOut()

  return response
}
