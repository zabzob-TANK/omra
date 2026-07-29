'use client'

import { useActionState, useEffect, useState } from 'react'
import { CheckCircle2, CircleOff, Power, Save } from 'lucide-react'
import {
  saveAccountSlot,
  setAccountSlotActive,
  type AccountActionState,
} from '@/app/admin/comptes/actions'
import type { AccountSlotView } from '@/lib/account-slots'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialAccountActionState: AccountActionState = {
  status: 'idle',
  message: '',
}

export function AccountSlotCard({
  slot,
  disabled,
}: {
  slot: AccountSlotView
  disabled: boolean
}) {
  const configured = slot.configured
  const [login, setLogin] = useState(slot.login ?? '')
  const [password, setPassword] = useState('')
  const [saveState, saveAction, savePending] = useActionState(
    saveAccountSlot,
    initialAccountActionState,
  )
  const [activeState, activeAction, activePending] = useActionState(
    setAccountSlotActive,
    initialAccountActionState,
  )

  useEffect(() => {
    setLogin(slot.login ?? '')
  }, [slot.login])

  useEffect(() => {
    if (saveState.status === 'success') {
      setPassword('')
    }
  }, [saveState])

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {slot.slot_number}
          </span>
          <CardTitle className="text-base">{slot.slot_label}</CardTitle>
        </div>
        <Badge variant={slot.active ? 'default' : 'outline'}>
          {slot.active ? (
            <CheckCircle2 aria-hidden />
          ) : (
            <CircleOff aria-hidden />
          )}
          {configured ? (slot.active ? 'Actif' : 'Inactif') : 'Non configuré'}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        <form action={saveAction} className="space-y-4">
          <input type="hidden" name="slot_number" value={slot.slot_number} />

          <div className="space-y-2">
            <Label htmlFor={`login-${slot.slot_number}`}>Login</Label>
            <Input
              id={`login-${slot.slot_number}`}
              name="login"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              autoComplete="off"
              disabled={disabled}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`password-${slot.slot_number}`}>
              Mot de passe
            </Label>
            <Input
              id={`password-${slot.slot_number}`}
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              maxLength={72}
              placeholder={
                configured
                  ? 'Nouveau mot de passe (facultatif)'
                  : 'Mot de passe initial'
              }
              disabled={disabled}
              required={!configured}
            />
            {configured ? (
              <p className="text-xs text-muted-foreground">
                6 caractères minimum. Laissez vide pour conserver le mot de
                passe actuel.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                6 caractères minimum.
              </p>
            )}
          </div>

          {saveState.message ? (
            <p
              role="status"
              className={
                saveState.status === 'error'
                  ? 'text-sm text-destructive'
                  : 'text-sm text-primary'
              }
            >
              {saveState.message}
            </p>
          ) : null}

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={disabled || savePending}
          >
            <Save aria-hidden />
            {savePending ? 'Sauvegarde…' : 'Sauvegarder'}
          </Button>
        </form>

        {configured ? (
          <form action={activeAction} className="border-t border-border pt-4">
            <input type="hidden" name="slot_number" value={slot.slot_number} />
            <input type="hidden" name="active" value={String(!slot.active)} />
            {activeState.message ? (
              <p
                role="status"
                className={
                  activeState.status === 'error'
                    ? 'mb-3 text-sm text-destructive'
                    : 'mb-3 text-sm text-primary'
                }
              >
                {activeState.message}
              </p>
            ) : null}
            <Button
              type="submit"
              variant="outline"
              className="w-full gap-2"
              disabled={disabled || activePending}
            >
              <Power aria-hidden />
              {slot.active ? 'Désactiver le compte' : 'Activer le compte'}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}
