import 'server-only'

import { requireActiveAccount } from '@/lib/admin-guard'
import type { FacturationReferenceData } from '@/lib/facturation/workflow-types'
import type { Season } from '@/lib/omra-programme'
import { createAdminClient } from '@/lib/supabase/admin'

export async function loadFacturationReferenceData(): Promise<FacturationReferenceData> {
  await requireActiveAccount()
  const admin = createAdminClient()

  const [seasonResult, dossiersResult, travelersResult] = await Promise.all([
    admin.from('omra_seasons').select('*').eq('status', 'active').maybeSingle(),
    admin.from('omra_dossiers').select('id,dossier_reference,label').order('dossier_reference'),
    admin.from('travelers').select('id,current_first_name,current_last_name,current_phone').order('current_last_name'),
  ])

  if (seasonResult.error || dossiersResult.error || travelersResult.error) {
    throw new Error('Facturation reference data is unavailable')
  }

  let activeSeason: Season | null = null
  const season = seasonResult.data

  if (season) {
    const { data: program, error: programError } = await admin
      .from('omra_programs')
      .select('*')
      .eq('season_id', season.id)
      .single()

    if (programError || !program) throw new Error('Active Omra program is unavailable')

    const [hotelsResult, flightsResult, roomsResult, rabatteursResult, pricesResult] = await Promise.all([
      admin.from('omra_program_hotels').select('*').eq('program_id', program.id).order('sort_order'),
      admin.from('omra_program_flights').select('*').eq('program_id', program.id).order('sort_order'),
      admin.from('omra_program_rooms').select('*').eq('program_id', program.id).order('sort_order'),
      admin.from('omra_program_rabatteurs').select('*').eq('program_id', program.id).order('sort_order'),
      admin.from('omra_program_prices').select('*').eq('program_id', program.id).order('created_at'),
    ])

    if ([hotelsResult, flightsResult, roomsResult, rabatteursResult, pricesResult].some((result) => result.error)) {
      throw new Error('Active Omra program selections are unavailable')
    }

    activeSeason = {
      id: season.id,
      programId: program.id,
      name: season.name,
      code: season.code ?? '',
      status: season.status,
      used: season.has_been_used,
      maxDiscountDh: program.max_discount_dh,
      createdAt: season.created_at,
      updatedAt: season.updated_at,
      hotels: (hotelsResult.data ?? []).map((item) => ({ id: item.id, label: item.name })),
      flights: (flightsResult.data ?? []).map((item) => ({ id: item.id, label: item.label })),
      rooms: (roomsResult.data ?? []).map((item) => ({ id: item.id, label: String(item.bed_count), bedCount: item.bed_count })),
      rabatteurs: (rabatteursResult.data ?? []).map((item) => ({ id: item.id, label: item.name })),
      prices: (pricesResult.data ?? []).map((item) => ({
        id: item.id,
        hotelId: item.hotel_id,
        flightId: item.flight_id,
        roomId: item.room_id,
        amountDh: item.amount_dh,
        maxDiscountOverrideDh: item.max_discount_override_dh,
      })),
    }
  }

  return {
    activeSeason,
    dossiers: (dossiersResult.data ?? []).map((item) => ({ id: item.id, reference: item.dossier_reference, label: item.label })),
    travelers: (travelersResult.data ?? []).map((item) => ({
      id: item.id,
      firstName: item.current_first_name,
      lastName: item.current_last_name,
      phone: item.current_phone,
    })),
  }
}
