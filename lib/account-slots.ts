export const ACCOUNT_SLOT_LABELS = [
  'Administrateur',
  'Employé 1',
  'Employé 2',
  'Employé 3',
  'Employé 4',
  'Employé 5',
] as const

export type AccountSlotView = {
  slot_number: number
  slot_label: string
  login: string | null
  active: boolean
  configured: boolean
}

export function emptyAccountSlots(): AccountSlotView[] {
  return ACCOUNT_SLOT_LABELS.map((slotLabel, index) => ({
    slot_number: index + 1,
    slot_label: slotLabel,
    login: null,
    active: false,
    configured: false,
  }))
}
