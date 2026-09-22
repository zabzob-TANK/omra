'use client'

import { useActionState, useEffect, useState } from 'react'
import {
  CheckCircle2,
  CircleOff,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Power,
  Save,
} from 'lucide-react'
import {
  reinitialiserMotDePasseEmploye,
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

/**
 * Bouton œil : montre ce que l'on est en train de taper.
 *
 * Il ne révèle jamais un mot de passe existant, qui n'est de toute façon pas
 * récupérable : la base n'en garde qu'une empreinte à sens unique. Il sert
 * seulement à vérifier sa propre frappe avant de valider.
 */
function BoutonOeil({
  visible,
  onToggle,
  disabled,
}: {
  visible: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={visible}
      aria-label={
        visible ? 'Masquer le mot de passe saisi' : 'Afficher le mot de passe saisi'
      }
      title={visible ? 'Masquer' : 'Afficher ce que je tape'}
    >
      {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
    </Button>
  )
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
  const [motDePasseVisible, setMotDePasseVisible] = useState(false)
  const [panneauReinitialisation, setPanneauReinitialisation] = useState(false)
  const [confirmationVisible, setConfirmationVisible] = useState(false)
  const [copie, setCopie] = useState(false)
  const [saveState, saveAction, savePending] = useActionState(
    saveAccountSlot,
    initialAccountActionState,
  )
  const [activeState, activeAction, activePending] = useActionState(
    setAccountSlotActive,
    initialAccountActionState,
  )
  const [resetState, resetAction, resetPending] = useActionState(
    reinitialiserMotDePasseEmploye,
    initialAccountActionState,
  )

  useEffect(() => {
    setLogin(slot.login ?? '')
  }, [slot.login])

  useEffect(() => {
    if (saveState.status === 'success') {
      setPassword('')
      setMotDePasseVisible(false)
    }
  }, [saveState])

  useEffect(() => {
    if (resetState.status === 'success') {
      // Le panneau reste ouvert pour laisser lire le mot de passe engendré,
      // mais la confirmation est effacée : elle ne doit pas rester à l'écran.
      setConfirmationVisible(false)
      setCopie(false)
    }
  }, [resetState])

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
            <div className="flex items-center gap-2">
              <Input
                id={`password-${slot.slot_number}`}
                name="password"
                type={motDePasseVisible ? 'text' : 'password'}
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
              <BoutonOeil
                visible={motDePasseVisible}
                onToggle={() => setMotDePasseVisible((v) => !v)}
                disabled={disabled}
              />
            </div>
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
          <div className="border-t border-border pt-4">
            {/* Le panneau reste ouvert tant qu'un résultat est affiché : le mot
                de passe engendré n'existe nulle part ailleurs, le refermer le
                perdrait définitivement. */}
            {!panneauReinitialisation && resetState.status === 'idle' ? (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() => setPanneauReinitialisation(true)}
                disabled={disabled}
              >
                <KeyRound aria-hidden />
                Réinitialiser le mot de passe
              </Button>
            ) : (
              <form action={resetAction} className="space-y-3">
                <input
                  type="hidden"
                  name="slot_number"
                  value={slot.slot_number}
                />
                <p className="text-xs text-muted-foreground">
                  Un nouveau mot de passe sera créé pour cet employé et affiché
                  une seule fois. L’ancien cessera aussitôt de fonctionner.
                  Confirmez avec <strong>votre</strong> mot de passe
                  d’administrateur.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    id={`confirmation-${slot.slot_number}`}
                    name="mot_de_passe_administrateur"
                    type={confirmationVisible ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Votre mot de passe d’administrateur"
                    aria-label="Votre mot de passe d’administrateur"
                    disabled={disabled}
                    required
                  />
                  <BoutonOeil
                    visible={confirmationVisible}
                    onToggle={() => setConfirmationVisible((v) => !v)}
                    disabled={disabled}
                  />
                </div>

                {resetState.message ? (
                  <p
                    role="status"
                    className={
                      resetState.status === 'error'
                        ? 'text-sm text-destructive'
                        : 'text-sm text-primary'
                    }
                  >
                    {resetState.message}
                  </p>
                ) : null}

                {resetState.motDePasseGenere ? (
                  <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Nouveau mot de passe de {slot.slot_label}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-sm">
                        {resetState.motDePasseGenere}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label="Copier le mot de passe"
                        onClick={() => {
                          navigator.clipboard
                            ?.writeText(resetState.motDePasseGenere ?? '')
                            .then(() => setCopie(true))
                            .catch(() => setCopie(false))
                        }}
                      >
                        {copie ? <CheckCircle2 aria-hidden /> : <Copy aria-hidden />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Il n’est conservé nulle part et ne réapparaîtra pas.
                    </p>
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    type="submit"
                    className="flex-1 gap-2"
                    disabled={disabled || resetPending}
                  >
                    <KeyRound aria-hidden />
                    {resetPending ? 'Création…' : 'Confirmer'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setPanneauReinitialisation(false)
                      setConfirmationVisible(false)
                    }}
                    disabled={resetPending}
                  >
                    Annuler
                  </Button>
                </div>
              </form>
            )}
          </div>
        ) : null}

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
