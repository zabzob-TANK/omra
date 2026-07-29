export type SeasonStatus = 'brouillon' | 'active' | 'archivee'

export type ProgrammeItem = {
  id: string
  label: string
}

export type RoomItem = ProgrammeItem & {
  bedCount: number
}

export type PriceRow = {
  id: string
  hotelId: string
  flightId: string
  roomId: string
  amountDh: number
  maxDiscountOverrideDh: number | null
}

export type Season = {
  id: string
  programId: string
  name: string
  code: string
  status: SeasonStatus
  hotels: ProgrammeItem[]
  flights: ProgrammeItem[]
  rooms: RoomItem[]
  rabatteurs: ProgrammeItem[]
  prices: PriceRow[]
  maxDiscountDh: number
  used: boolean
  createdAt: string
  updatedAt: string
}

export type ProgrammeActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string }

export function temporaryId() {
  return `temp-${crypto.randomUUID()}`
}

export function emptySeason(): Season {
  const now = new Date().toISOString()

  return {
    id: temporaryId(),
    programId: temporaryId(),
    name: '',
    code: '',
    status: 'brouillon',
    hotels: [],
    flights: [],
    rooms: [],
    rabatteurs: [],
    prices: [],
    maxDiscountDh: 0,
    used: false,
    createdAt: now,
    updatedAt: now,
  }
}
