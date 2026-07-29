import { redirect } from 'next/navigation'
import { ShieldCheck, Users } from 'lucide-react'
import { AccountSlotCard } from '@/components/admin/accounts/account-slot-card'
import {
  emptyAccountSlots,
  type AccountSlotView,
} from '@/lib/account-slots'
import { requireAdministrator } from '@/lib/admin-guard'
import {
  createAdminClient,
  hasServiceRoleKey,
} from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function loadAccountSlots(): Promise<{
  slots: AccountSlotView[]
  configurationError: string | null
}> {
  try {
    await requireAdministrator()
  } catch {
    redirect('/login')
  }

  if (!hasServiceRoleKey()) {
    return {
      slots: emptyAccountSlots(),
      configurationError:
        'La clé serveur Supabase doit être configurée avant de gérer les comptes.',
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('account_slots')
    .select('slot_number, slot_label, login, auth_user_id, active')
    .order('slot_number')

  if (error || !data || data.length !== 6) {
    return {
      slots: emptyAccountSlots(),
      configurationError:
        'La migration des six comptes doit être appliquée dans Supabase.',
    }
  }

  return {
    slots: data.map((slot) => ({
      slot_number: slot.slot_number,
      slot_label: slot.slot_label,
      login: slot.login,
      active: slot.active,
      configured: Boolean(slot.auth_user_id),
    })),
    configurationError: null,
  }
}

export default async function ComptesPage() {
  const { slots, configurationError } = await loadAccountSlots()

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
            Six emplacements fixes pour les futurs utilisateurs de la facturation.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p>
          Les mots de passe sont gérés uniquement par Supabase Auth. Après une
          sauvegarde, ils ne sont jamais affichés ni récupérés par l’application.
        </p>
      </div>

      {configurationError ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {configurationError}
        </p>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        {slots.map((slot) => (
          <AccountSlotCard
            key={slot.slot_number}
            slot={slot}
            disabled={Boolean(configurationError)}
          />
        ))}
      </div>
    </div>
  )
}
