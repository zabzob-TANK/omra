import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { findActiveAccountByAuthUserId } from '@/lib/account-access'

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
  const isBillingPath =
    request.nextUrl.pathname === '/facturation' ||
    request.nextUrl.pathname.startsWith('/facturation/')
  const isLoginPath = request.nextUrl.pathname === '/login'

  if (!isAdminPath && !isBillingPath && !isLoginPath) {
    return response
  }

  if (error || !data.user) {
    if (isLoginPath) {
      return response
    }

    isRedirectResponse = true
    response = NextResponse.redirect(new URL('/login', request.url))
    await supabase.auth.signOut()
    return response
  }

  let account = null

  try {
    account = await findActiveAccountByAuthUserId(data.user.id)
  } catch {
    // Protected routes fail closed when account resolution is unavailable.
  }

  if (!account) {
    isRedirectResponse = true
    response = NextResponse.redirect(new URL('/login?error=acces', request.url))
    await supabase.auth.signOut()
    return response
  }

  if (isLoginPath) {
    return response
  }

  if (isAdminPath && account.slot_number !== 1) {
    return NextResponse.redirect(new URL('/facturation', request.url))
  }

  return response
}
