import 'server-only'

import { requireAdministrator } from '@/lib/admin-guard'
import type { Season } from '@/lib/omra-programme'
import { createAdminClient } from '@/lib/supabase/admin'

export async function loadOmraSeasons(): Promise<Season[]> {
  await requireAdministrator()
  const admin = createAdminClient()

  const [
    seasonsResult,
    programsResult,
    hotelsResult,
    flightsResult,
    roomsResult,
    rabatteursResult,
    pricesResult,
  ] = await Promise.all([
    admin.from('omra_seasons').select('*').order('updated_at', { ascending: false }),
    admin.from('omra_programs').select('*'),
    admin.from('omra_program_hotels').select('*').order('sort_order'),
    admin.from('omra_program_flights').select('*').order('sort_order'),
    admin.from('omra_program_rooms').select('*').order('sort_order'),
    admin.from('omra_program_rabatteurs').select('*').order('sort_order'),
    admin.from('omra_program_prices').select('*').order('created_at'),
  ])

  const results = [
    seasonsResult,
    programsResult,
    hotelsResult,
    flightsResult,
    roomsResult,
    rabatteursResult,
    pricesResult,
  ]

  if (results.some((result) => result.error)) {
    throw new Error('Omra programme data is unavailable')
  }

  const programs = programsResult.data ?? []
  const hotels = hotelsResult.data ?? []
  const flights = flightsResult.data ?? []
  const rooms = roomsResult.data ?? []
  const rabatteurs = rabatteursResult.data ?? []
  const prices = pricesResult.data ?? []

  return (seasonsResult.data ?? []).map((season) => {
    const program = programs.find((item) => item.season_id === season.id)

    if (!program) {
      throw new Error('Omra season program is missing')
    }

    return {
      id: season.id,
      programId: program.id,
      name: season.name,
      code: season.code ?? '',
      status: season.status,
      used: season.has_been_used,
      maxDiscountDh: program.max_discount_dh,
      createdAt: season.created_at,
      updatedAt: season.updated_at,
      hotels: hotels
        .filter((item) => item.program_id === program.id)
        .map((item) => ({ id: item.id, label: item.name })),
      flights: flights
        .filter((item) => item.program_id === program.id)
        .map((item) => ({ id: item.id, label: item.label })),
      rooms: rooms
        .filter((item) => item.program_id === program.id)
        .map((item) => ({
          id: item.id,
          label: String(item.bed_count),
          bedCount: item.bed_count,
        })),
      rabatteurs: rabatteurs
        .filter((item) => item.program_id === program.id)
        .map((item) => ({ id: item.id, label: item.name })),
      prices: prices
        .filter((item) => item.program_id === program.id)
        .map((item) => ({
          id: item.id,
          hotelId: item.hotel_id,
          flightId: item.flight_id,
          roomId: item.room_id,
          amountDh: item.amount_dh,
          maxDiscountOverrideDh: item.max_discount_override_dh,
        })),
    } satisfies Season
  })
}
