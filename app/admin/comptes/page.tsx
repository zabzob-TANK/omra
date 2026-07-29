import { ShieldCheck, Users } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function ComptesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Users className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Comptes employés
          </h1>
          <p className="text-sm text-muted-foreground">
            Les comptes seront administrés de manière sécurisée avec Supabase Auth.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Gestion sécurisée des accès</CardTitle>
          <CardDescription>
            Aucun mot de passe n’est stocké ou affiché dans l’application.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-6" aria-hidden />
          </span>
          <p className="max-w-lg text-sm text-muted-foreground">
            La création des employés et l’attribution des rôles seront ajoutées
            dans une prochaine étape, côté serveur uniquement.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
