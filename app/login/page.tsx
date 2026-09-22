import { redirect } from 'next/navigation'
import { LockKeyhole } from 'lucide-react'
import { login } from '@/app/login/actions'
import { Logo } from '@/components/admin/logo'
import { ThemeToggle } from '@/components/admin/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requireAdministrator } from '@/lib/admin-guard'

const errorMessages: Record<string, string> = {
  champs: 'Veuillez renseigner votre identifiant et votre mot de passe.',
  identifiants: 'Identifiant ou mot de passe incorrect.',
  acces: 'Ce compte n’est pas autorisé à accéder à l’application.',
  // Arrêts décidés par le garde-barrière de session (`lib/session-garde.ts`).
  inactivite:
    'Session fermée après une période d’inactivité. Reconnectez-vous pour continuer.',
  duree:
    'Session fermée : la durée maximale autorisée est atteinte. Reconnectez-vous pour continuer.',
  attente:
    'Trop de tentatives incorrectes. Patientez quelques secondes avant de réessayer.',
  onglet:
    'Nouvel onglet : identifiez-vous à nouveau. Un rafraîchissement ne le demande pas.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  // Porte exclusive de l'Administration (séparation étanche Facturation/
  // Administration) : une seule destination possible, /admin. `redirect()`
  // lève une exception interne que Next.js seul doit intercepter — jamais le
  // catch ci-dessous, sous peine de l'avaler silencieusement.
  let dejaConnecte = false
  try {
    await requireAdministrator()
    dejaConnecte = true
  } catch {
    // The login form remains available to unauthenticated users.
  }

  const { error } = await searchParams

  // Exception a la regle « deja connecte, donc vers /admin » : un onglet neuf
  // arrive ici AVEC une session valide, justement pour qu'on lui redemande le
  // mot de passe. Le renvoyer vers /admin le ferait rebondir aussitot ici, en
  // boucle sans fin. Il voit donc le formulaire, et sa connexion reussie
  // reposera le marqueur de son onglet.
  if (dejaConnecte && error !== 'onglet') {
    redirect('/admin')
  }
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
                  // « username » et « current-password » sont justement les
                  // indications qui invitent le navigateur a remplir tout seul.
                  // Les remplacer le dissuade dans la plupart des navigateurs
                  // actuels. Ce n'est ni garanti ni definitif : aucun site ne
                  // peut empecher l'enregistrement d'un mot de passe, seul
                  // l'utilisateur le peut, en repondant « jamais pour ce site ».
                  autoComplete="off"
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
                  autoComplete="new-password"
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
