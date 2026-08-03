import { redirect } from 'next/navigation'
import { LockKeyhole } from 'lucide-react'
import { login } from '@/app/login/actions'
import { Logo } from '@/components/admin/logo'
import { ThemeToggle } from '@/components/admin/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireActiveAccount } from '@/lib/admin-guard'

const errorMessages: Record<string, string> = {
  champs: 'Veuillez renseigner votre identifiant et votre mot de passe.',
  identifiants: 'Identifiant ou mot de passe incorrect.',
  acces: 'Ce compte n’est pas autorisé à accéder à l’application.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  let destination: '/admin' | '/facturation' | null = null

  try {
    const account = await requireActiveAccount()
    destination = account.slot_number === 1 ? '/admin' : '/facturation'
  } catch {
    // The login form remains available to unauthenticated users.
  }

  if (destination) {
    redirect(destination)
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
            <CardTitle className="text-xl">Connexion</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <form action={login} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="identifier">Identifiant</Label>
                <Input
                  id="identifier"
                  name="identifier"
                  type="text"
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
