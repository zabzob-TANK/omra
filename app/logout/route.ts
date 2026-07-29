import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const loginUrl = new URL('/login', request.url)
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    loginUrl.searchParams.set('error', error)
  }

  return NextResponse.redirect(loginUrl)
}
