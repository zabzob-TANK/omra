import { redirect } from 'next/navigation'
import { LockKeyhole } from 'lucide-react'
import { login } from '@/app/login/actions'
import { Logo } from '@/components/admin/logo'
import { ThemeToggle } from '@/components/admin/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isTestAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const errorMessages: Record<string, string> = {
  champs: 'Veuillez renseigner votre email et votre mot de passe.',
  identifiants: 'Email ou mot de passe incorrect.',
  acces: 'Ce compte n’est pas autorisé à accéder à l’administration.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  if (data?.claims?.sub && isTestAdmin(data.claims)) {
    redirect('/admin')
  }

  const { error } = await searchParams
  const errorMessage = error ? errorMessages[error] : null

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="absolute right-4 top-4 md:right-6 md:top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-7 flex justify-center">
          <Logo size={52} showText />
        </div>

        <Card className="shadow-xl shadow-foreground/5">
          <CardHeader className="items-center border-b text-center">
            <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <LockKeyhole className="size-5" aria-hidden />
            </span>
            <CardTitle className="text-xl">Connexion à l’administration</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <form action={login} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>

              {errorMessage ? (
                <p role="alert" className="text-sm text-destructive">
                  {errorMessage}
                </p>
              ) : null}

              <Button type="submit" size="lg" className="w-full">
                Se connecter
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
