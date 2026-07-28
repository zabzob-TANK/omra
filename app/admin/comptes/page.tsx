'use client'

import { useState } from 'react'
import { Eye, EyeOff, Save, Users, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type Account = { login: string; password: string }

const INITIAL: Account[] = [
  { login: 'employe1', password: 'motdepasse1' },
  { login: 'employe2', password: 'motdepasse2' },
  { login: '', password: '' },
  { login: '', password: '' },
  { login: '', password: '' },
]

export default function ComptesPage() {
  const [accounts, setAccounts] = useState<Account[]>(INITIAL)
  const [visible, setVisible] = useState<boolean[]>(INITIAL.map(() => false))
  const [saved, setSaved] = useState(false)

  function update(index: number, field: keyof Account, value: string) {
    setAccounts((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    )
    setSaved(false)
  }

  function toggleVisible(index: number) {
    setVisible((prev) => prev.map((v, i) => (i === index ? !v : v)))
  }

  function onSave() {
    // Prototype visuel : aucune authentification ni base de données connectée.
    setSaved(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Users className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Comptes employés
          </h1>
          <p className="text-sm text-muted-foreground">
            Cinq comptes prédéfinis. Un compte laissé vide ne permet pas la
            connexion.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Identifiants</CardTitle>
          <CardDescription>
            Renseignez ou modifiez le login et le mot de passe de chaque compte.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-2">
          {accounts.map((account, i) => (
            <div
              key={i}
              className="grid gap-4 rounded-lg border border-border bg-secondary/30 p-4 sm:grid-cols-[auto_1fr_1fr]"
            >
              <div className="flex items-center">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {i + 1}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`login-${i}`}>Login</Label>
                <Input
                  id={`login-${i}`}
                  value={account.login}
                  onChange={(e) => update(i, 'login', e.target.value)}
                  placeholder="Login de l'employé"
                  autoComplete="off"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`password-${i}`}>Mot de passe</Label>
                <div className="relative">
                  <Input
                    id={`password-${i}`}
                    type={visible[i] ? 'text' : 'password'}
                    value={account.password}
                    onChange={(e) => update(i, 'password', e.target.value)}
                    placeholder="Mot de passe"
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleVisible(i)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={
                      visible[i]
                        ? 'Masquer le mot de passe'
                        : 'Afficher le mot de passe'
                    }
                  >
                    {visible[i] ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-end gap-3 pt-1">
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-primary">
                <Check className="size-4" />
                Comptes enregistrés
              </span>
            )}
            <Button size="lg" onClick={onSave}>
              <Save />
              <span>Enregistrer les comptes</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
