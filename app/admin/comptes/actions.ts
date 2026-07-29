'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import {
  AdminAuthorizationError,
  requireAdministrator,
} from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export type AccountActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

const publicMessages = {
  unauthorized: 'Accès non autorisé.',
  invalidSlot: 'Emplacement invalide.',
  invalidLogin: 'Le login doit contenir entre 3 et 50 caractères autorisés.',
  passwordTooShort: 'Le mot de passe doit contenir au moins 6 caractères.',
  passwordTooLong: 'Le mot de passe ne peut pas dépasser 72 caractères.',
  unavailable: 'La configuration des comptes est indisponible.',
  duplicateLogin: 'Ce login est déjà utilisé.',
  createFailed: 'Impossible de créer le compte Supabase Auth.',
  saveFailed: 'Impossible de sauvegarder le compte.',
  passwordFailed: 'Impossible de remplacer le mot de passe.',
  loginFailed: 'Impossible de sauvegarder le login.',
  notConfigured: 'Ce compte n’est pas encore configuré.',
  accessFailed: 'Impossible de modifier l’accès du compte.',
  stateFailed: 'Impossible de sauvegarder l’état du compte.',
  technical: 'Une erreur technique est survenue.',
} as const

type PublicMessage = (typeof publicMessages)[keyof typeof publicMessages]

class PublicActionError extends Error {
  readonly publicMessage: PublicMessage

  constructor(publicMessage: PublicMessage) {
    super('Public account action error')
    this.name = 'PublicActionError'
    this.publicMessage = publicMessage
  }
}

function actionErrorMessage(error: unknown): PublicMessage {
  if (error instanceof AdminAuthorizationError) {
    return publicMessages.unauthorized
  }

  if (error instanceof PublicActionError) {
    return error.publicMessage
  }

  return publicMessages.technical
}

function readSlotNumber(formData: FormData) {
  const slotNumber = Number(formData.get('slot_number'))

  if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 6) {
    throw new PublicActionError(publicMessages.invalidSlot)
  }

  return slotNumber
}

function readLogin(formData: FormData) {
  const value = formData.get('login')
  const login = typeof value === 'string' ? value.trim().toLowerCase() : ''

  if (!/^[a-z0-9._-]{3,50}$/.test(login)) {
    throw new PublicActionError(publicMessages.invalidLogin)
  }

  return login
}

function readPassword(formData: FormData) {
  const value = formData.get('password')
  return typeof value === 'string' ? value : ''
}

function validatePassword(password: string) {
  if (password.length < 6) {
    throw new PublicActionError(publicMessages.passwordTooShort)
  }

  if (password.length > 72) {
    throw new PublicActionError(publicMessages.passwordTooLong)
  }
}

function internalEmail(slotNumber: number) {
  return `slot-${slotNumber}-${randomUUID()}@internal.omra.ma`
}

export async function saveAccountSlot(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    await requireAdministrator()

    const slotNumber = readSlotNumber(formData)
    const login = readLogin(formData)
    const password = readPassword(formData)
    const admin = createAdminClient()

    const { data: slot, error: slotError } = await admin
      .from('account_slots')
      .select('slot_number, login, auth_user_id, active')
      .eq('slot_number', slotNumber)
      .single()

    if (slotError || !slot) {
      throw new PublicActionError(publicMessages.unavailable)
    }

    const { data: duplicate } = await admin
      .from('account_slots')
      .select('slot_number')
      .eq('login', login)
      .neq('slot_number', slotNumber)
      .maybeSingle()

    if (duplicate) {
      throw new PublicActionError(publicMessages.duplicateLogin)
    }

    if (!slot.auth_user_id) {
      validatePassword(password)

      const { data: created, error: createError } =
        await admin.auth.admin.createUser({
          email: internalEmail(slotNumber),
          password,
          email_confirm: true,
          app_metadata: {
            account_type: 'billing_staff',
            slot_number: slotNumber,
          },
        })

      if (createError || !created.user) {
        throw new PublicActionError(publicMessages.createFailed)
      }

      const { error: updateSlotError } = await admin
        .from('account_slots')
        .update({
          login,
          auth_user_id: created.user.id,
          active: true,
        })
        .eq('slot_number', slotNumber)

      if (updateSlotError) {
        await admin.auth.admin.deleteUser(created.user.id)
        throw new PublicActionError(publicMessages.saveFailed)
      }
    } else {
      if (password) {
        validatePassword(password)
        const { error: passwordError } =
          await admin.auth.admin.updateUserById(slot.auth_user_id, {
            password,
          })

        if (passwordError) {
          throw new PublicActionError(publicMessages.passwordFailed)
        }
      }

      const { error: updateError } = await admin
        .from('account_slots')
        .update({ login })
        .eq('slot_number', slotNumber)

      if (updateError) {
        throw new PublicActionError(publicMessages.loginFailed)
      }
    }

    revalidatePath('/admin/comptes')
    return { status: 'success', message: 'Compte sauvegardé.' }
  } catch (error) {
    return {
      status: 'error',
      message: actionErrorMessage(error),
    }
  }
}

export async function setAccountSlotActive(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    await requireAdministrator()

    const slotNumber = readSlotNumber(formData)
    const active = formData.get('active') === 'true'
    const admin = createAdminClient()

    const { data: slot, error: slotError } = await admin
      .from('account_slots')
      .select('auth_user_id')
      .eq('slot_number', slotNumber)
      .single()

    if (slotError || !slot?.auth_user_id) {
      throw new PublicActionError(publicMessages.notConfigured)
    }

    const { error: authError } = await admin.auth.admin.updateUserById(
      slot.auth_user_id,
      { ban_duration: active ? 'none' : '876000h' },
    )

    if (authError) {
      throw new PublicActionError(publicMessages.accessFailed)
    }

    const { error: updateError } = await admin
      .from('account_slots')
      .update({ active })
      .eq('slot_number', slotNumber)

    if (updateError) {
      await admin.auth.admin.updateUserById(slot.auth_user_id, {
        ban_duration: active ? '876000h' : 'none',
      })
      throw new PublicActionError(publicMessages.stateFailed)
    }

    revalidatePath('/admin/comptes')
    return {
      status: 'success',
      message: active ? 'Compte activé.' : 'Compte désactivé.',
    }
  } catch (error) {
    return {
      status: 'error',
      message: actionErrorMessage(error),
    }
  }
}
