import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export type AccountRole = 'administrator' | 'employee'

export type ActiveAccount = {
  slot_number: number
  slot_label: string
  login: string
  auth_user_id: string
  role: AccountRole
}

export async function findActiveAccountByAuthUserId(
  authUserId: string,
): Promise<ActiveAccount | null> {
  if (!authUserId) {
    return null
  }

  const admin = createAdminClient()
  const { data: slot, error } = await admin
    .from('account_slots')
    .select('slot_number, slot_label, login, auth_user_id')
    .eq('auth_user_id', authUserId)
    .eq('active', true)
    .single()

  if (
    error ||
    !slot ||
    !Number.isInteger(slot.slot_number) ||
    slot.slot_number < 1 ||
    slot.slot_number > 6 ||
    typeof slot.slot_label !== 'string' ||
    typeof slot.login !== 'string' ||
    slot.auth_user_id !== authUserId
  ) {
    return null
  }

  return {
    slot_number: slot.slot_number,
    slot_label: slot.slot_label,
    login: slot.login,
    auth_user_id: slot.auth_user_id,
    role: slot.slot_number === 1 ? 'administrator' : 'employee',
  }
}
