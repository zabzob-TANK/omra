'use server'

import { revalidatePath } from 'next/cache'
import { requireAdministrator } from '@/lib/admin-guard'
import type {
  PriceRow,
  ProgrammeActionResult,
  ProgrammeItem,
  RoomItem,
  Season,
} from '@/lib/omra-programme'
import { loadOmraSeasons } from '@/lib/omra-programme-server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string) {
  return UUID_PATTERN.test(value)
}

function isInteger(value: number) {
  return Number.isSafeInteger(value)
}

function validateSeason(season: Season) {
  if (!season.name.trim()) throw new Error('Le nom de la saison est obligatoire.')
  if (!isInteger(season.maxDiscountDh) || season.maxDiscountDh < 0) {
    throw new Error('La réduction globale doit être un entier positif ou nul.')
  }

  const unique = (items: ProgrammeItem[]) =>
    new Set(items.map((item) => item.label.trim().toLocaleLowerCase('fr'))).size ===
    items.length

  if (!unique(season.hotels) || !unique(season.flights) || !unique(season.rabatteurs)) {
    throw new Error('Les listes du programme contiennent un doublon.')
  }

  if (
    !unique(season.rooms) ||
    season.rooms.some((room) => !isInteger(room.bedCount) || room.bedCount <= 0)
  ) {
    throw new Error('Les chambres doivent être des nombres entiers positifs uniques.')
  }

  const hotelIds = new Set(season.hotels.map((item) => item.id))
  const flightIds = new Set(season.flights.map((item) => item.id))
  const roomIds = new Set(season.rooms.map((item) => item.id))
  const combinations = new Set<string>()

  for (const price of season.prices) {
    if (
      !hotelIds.has(price.hotelId) ||
      !flightIds.has(price.flightId) ||
      !roomIds.has(price.roomId)
    ) {
      throw new Error('Une combinaison tarifaire référence un élément supprimé.')
    }
    if (!isInteger(price.amountDh) || price.amountDh <= 0) {
      throw new Error('Les tarifs doivent être des entiers strictement positifs.')
    }
    if (
      price.maxDiscountOverrideDh !== null &&
      (!isInteger(price.maxDiscountOverrideDh) || price.maxDiscountOverrideDh < 0)
    ) {
      throw new Error('La réduction spécifique doit être un entier positif ou nul.')
    }
    const combination = `${price.hotelId}:${price.flightId}:${price.roomId}`
    if (combinations.has(combination)) {
      throw new Error('Une combinaison Hôtel + Vol + Chambre est en double.')
    }
    combinations.add(combination)
  }
}

async function syncNamedItems(
  admin: ReturnType<typeof createAdminClient>,
  table: 'omra_program_hotels' | 'omra_program_flights' | 'omra_program_rabatteurs',
  programId: string,
  items: ProgrammeItem[],
  column: 'name' | 'label',
) {
  const idMap = new Map<string, string>()

  for (const [sortOrder, item] of items.entries()) {
    if (isUuid(item.id)) {
      const { error } = await admin
        .from(table)
        .update({ [column]: item.label.trim(), sort_order: sortOrder })
        .eq('id', item.id)
        .eq('program_id', programId)
      if (error) throw new Error('Impossible de sauvegarder une liste du programme.')
      idMap.set(item.id, item.id)
    } else {
      const { data, error } = await admin
        .from(table)
        .insert({ program_id: programId, [column]: item.label.trim(), sort_order: sortOrder })
        .select('id')
        .single()
      if (error || !data) throw new Error('Impossible de créer un élément du programme.')
      idMap.set(item.id, data.id)
    }
  }

  return idMap
}

async function syncRooms(
  admin: ReturnType<typeof createAdminClient>,
  programId: string,
  rooms: RoomItem[],
) {
  const idMap = new Map<string, string>()

  for (const [sortOrder, room] of rooms.entries()) {
    if (isUuid(room.id)) {
      const { error } = await admin
        .from('omra_program_rooms')
        .update({ bed_count: room.bedCount, sort_order: sortOrder })
        .eq('id', room.id)
        .eq('program_id', programId)
      if (error) throw new Error('Impossible de sauvegarder les chambres.')
      idMap.set(room.id, room.id)
    } else {
      const { data, error } = await admin
        .from('omra_program_rooms')
        .insert({ program_id: programId, bed_count: room.bedCount, sort_order: sortOrder })
        .select('id')
        .single()
      if (error || !data) throw new Error('Impossible de créer une chambre.')
      idMap.set(room.id, data.id)
    }
  }

  return idMap
}

async function deleteMissingRows(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  programId: string,
  keptIds: string[],
) {
  let query = admin.from(table).delete().eq('program_id', programId)
  if (keptIds.length > 0) query = query.not('id', 'in', `(${keptIds.join(',')})`)
  const { error } = await query
  if (error) throw new Error('Impossible de supprimer les anciennes données du programme.')
}

async function savePrices(
  admin: ReturnType<typeof createAdminClient>,
  programId: string,
  prices: PriceRow[],
  hotelIds: Map<string, string>,
  flightIds: Map<string, string>,
  roomIds: Map<string, string>,
) {
  const existingPriceIds = prices.filter((price) => isUuid(price.id)).map((price) => price.id)
  await deleteMissingRows(admin, 'omra_program_prices', programId, existingPriceIds)

  for (const price of prices) {
    const payload = {
      program_id: programId,
      hotel_id: hotelIds.get(price.hotelId),
      flight_id: flightIds.get(price.flightId),
      room_id: roomIds.get(price.roomId),
      amount_dh: price.amountDh,
      max_discount_override_dh: price.maxDiscountOverrideDh,
    }

    if (!payload.hotel_id || !payload.flight_id || !payload.room_id) {
      throw new Error('Une combinaison tarifaire est invalide.')
    }

    const result = isUuid(price.id)
      ? await admin
          .from('omra_program_prices')
          .update(payload)
          .eq('id', price.id)
          .eq('program_id', programId)
      : await admin.from('omra_program_prices').insert(payload)

    if (result.error) throw new Error('Impossible de sauvegarder les tarifs.')
  }
}

function publicError(error: unknown) {
  if (error instanceof Error) {
    const allowed = [
      'Le nom de la saison est obligatoire.',
      'La réduction globale doit être un entier positif ou nul.',
      'Les listes du programme contiennent un doublon.',
      'Les chambres doivent être des nombres entiers positifs uniques.',
      'Une combinaison tarifaire référence un élément supprimé.',
      'Les tarifs doivent être des entiers strictement positifs.',
      'La réduction spécifique doit être un entier positif ou nul.',
      'Une combinaison Hôtel + Vol + Chambre est en double.',
    ]
    if (allowed.includes(error.message)) return error.message
  }
  return 'Une erreur technique est survenue.'
}

export async function loadSeasonsAction(): Promise<ProgrammeActionResult<Season[]>> {
  try {
    return { ok: true, data: await loadOmraSeasons() }
  } catch {
    return { ok: false, message: 'Impossible de charger les saisons.' }
  }
}

export async function saveSeasonAction(
  season: Season,
): Promise<ProgrammeActionResult<Season>> {
  try {
    await requireAdministrator()
    validateSeason(season)
    const admin = createAdminClient()
    let seasonId = season.id

    if (isUuid(season.id)) {
      const { error } = await admin
        .from('omra_seasons')
        .update({ name: season.name.trim(), code: season.code.trim() || null })
        .eq('id', season.id)
      if (error) throw new Error('Season update failed')
    } else {
      const { data, error } = await admin
        .from('omra_seasons')
        .insert({ name: season.name.trim(), code: season.code.trim() || null })
        .select('id')
        .single()
      if (error || !data) throw new Error('Season creation failed')
      seasonId = data.id
    }

    const { data: program, error: programError } = await admin
      .from('omra_programs')
      .update({ max_discount_dh: season.maxDiscountDh })
      .eq('season_id', seasonId)
      .select('id')
      .single()
    if (programError || !program) throw new Error('Program update failed')

    const hotelIds = await syncNamedItems(admin, 'omra_program_hotels', program.id, season.hotels, 'name')
    const flightIds = await syncNamedItems(admin, 'omra_program_flights', program.id, season.flights, 'label')
    const roomIds = await syncRooms(admin, program.id, season.rooms)
    const rabatteurIds = await syncNamedItems(admin, 'omra_program_rabatteurs', program.id, season.rabatteurs, 'name')

    await savePrices(admin, program.id, season.prices, hotelIds, flightIds, roomIds)
    await deleteMissingRows(admin, 'omra_program_hotels', program.id, [...hotelIds.values()])
    await deleteMissingRows(admin, 'omra_program_flights', program.id, [...flightIds.values()])
    await deleteMissingRows(admin, 'omra_program_rooms', program.id, [...roomIds.values()])
    await deleteMissingRows(admin, 'omra_program_rabatteurs', program.id, [...rabatteurIds.values()])

    revalidatePath('/admin/programme')
    const saved = (await loadOmraSeasons()).find((item) => item.id === seasonId)
    if (!saved) throw new Error('Saved season not found')
    return { ok: true, data: saved }
  } catch (error) {
    return { ok: false, message: publicError(error) }
  }
}

export async function activateSeasonAction(id: string): Promise<ProgrammeActionResult> {
  try {
    await requireAdministrator()
    if (!isUuid(id)) throw new Error('Invalid season')
    const admin = createAdminClient()
    const { error } = await admin.rpc('activate_omra_season', { target_season_id: id })
    if (error) throw new Error('Activation failed')
    revalidatePath('/admin/programme')
    return { ok: true, data: undefined }
  } catch {
    return { ok: false, message: 'Impossible d’activer la saison.' }
  }
}

export async function archiveSeasonAction(id: string): Promise<ProgrammeActionResult> {
  try {
    await requireAdministrator()
    if (!isUuid(id)) throw new Error('Invalid season')
    const admin = createAdminClient()
    const { error } = await admin
      .from('omra_seasons')
      .update({ status: 'archivee', archived_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error('Archive failed')
    revalidatePath('/admin/programme')
    return { ok: true, data: undefined }
  } catch {
    return { ok: false, message: 'Impossible d’archiver la saison.' }
  }
}

export async function deleteSeasonAction(id: string): Promise<ProgrammeActionResult> {
  try {
    await requireAdministrator()
    if (!isUuid(id)) throw new Error('Invalid season')
    const admin = createAdminClient()
    const { error } = await admin.from('omra_seasons').delete().eq('id', id)
    if (error) throw new Error('Delete failed')
    revalidatePath('/admin/programme')
    return { ok: true, data: undefined }
  } catch {
    return {
      ok: false,
      message: 'Seul un brouillon jamais utilisé peut être supprimé.',
    }
  }
}
