import 'server-only'

/**
 * Saison active et programme d'omra (hôtels, vols, chambres, rabatteurs,
 * grille tarifaire) — lus depuis les tables d'Administration existantes,
 * jamais créés ni modifiés par ce module (`ReferentielsPort`, ports.ts).
 *
 * Sert les deux directions de l'adaptateur :
 *  - lecture (`referentiels.ts`) : le domaine utilise le NOM comme
 *    identifiant (`create-receipt.ts` copie `saisie.hotel` verbatim, sans
 *    résolution d'UUID — aucune table de référence séparée n'existe côté
 *    prototype) ;
 *  - écriture (`write.ts`) : résout un nom choisi par le domaine vers le
 *    véritable UUID `omra_program_hotels.id` etc. qu'attendent les RPC.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type ProgrammeActif = {
  seasonId: string
  seasonName: string
  programId: string
  maxDiscountDh: number
  hotels: { id: string; name: string }[]
  flights: { id: string; label: string }[]
  rooms: { id: string; bedCount: number }[]
  rabatteurs: { id: string; name: string }[]
  prices: {
    hotelId: string
    flightId: string
    roomId: string
    amountDh: number
    maxDiscountOverrideDh: number | null
  }[]
}

export async function chargerProgrammeActif(): Promise<ProgrammeActif> {
  const admin = createAdminClient()

  const { data: season, error: seasonError } = await admin
    .from('omra_seasons')
    .select('id, name')
    .eq('status', 'active')
    .maybeSingle()
  if (seasonError) throw new Error(`Saison active illisible : ${seasonError.message}`)
  if (!season) throw new Error('Aucune saison active n’est configurée dans Omra.')

  const { data: program, error: programError } = await admin
    .from('omra_programs')
    .select('id, max_discount_dh')
    .eq('season_id', season.id)
    .single()
  if (programError || !program) {
    throw new Error('Le programme de la saison active est introuvable.')
  }

  const [hotelsResult, flightsResult, roomsResult, rabatteursResult, pricesResult] = await Promise.all([
    admin.from('omra_program_hotels').select('id, name').eq('program_id', program.id),
    admin.from('omra_program_flights').select('id, label').eq('program_id', program.id),
    admin.from('omra_program_rooms').select('id, bed_count').eq('program_id', program.id),
    admin.from('omra_program_rabatteurs').select('id, name').eq('program_id', program.id),
    admin
      .from('omra_program_prices')
      .select('hotel_id, flight_id, room_id, amount_dh, max_discount_override_dh')
      .eq('program_id', program.id),
  ])

  for (const resultat of [hotelsResult, flightsResult, roomsResult, rabatteursResult, pricesResult]) {
    if (resultat.error) throw new Error(`Programme actif illisible : ${resultat.error.message}`)
  }

  return {
    seasonId: season.id,
    seasonName: season.name,
    programId: program.id,
    maxDiscountDh: program.max_discount_dh,
    hotels: (hotelsResult.data ?? []).map((h) => ({ id: h.id, name: h.name })),
    flights: (flightsResult.data ?? []).map((f) => ({ id: f.id, label: f.label })),
    rooms: (roomsResult.data ?? []).map((r) => ({ id: r.id, bedCount: r.bed_count })),
    rabatteurs: (rabatteursResult.data ?? []).map((r) => ({ id: r.id, name: r.name })),
    prices: (pricesResult.data ?? []).map((p) => ({
      hotelId: p.hotel_id,
      flightId: p.flight_id,
      roomId: p.room_id,
      amountDh: p.amount_dh,
      maxDiscountOverrideDh: p.max_discount_override_dh,
    })),
  }
}
