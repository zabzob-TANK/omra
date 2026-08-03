import 'server-only'

import type { Chambre, Hotel, Rabatteur, Saison, Tarif, Vol } from '../../domain/types'
import type { ReferentielsPort } from '../ports'
import { dhVersCentimes } from './dh'
import { chargerProgrammeActif } from './programme'

export const referentielsSupabase: ReferentielsPort = {
  async saisonActive(): Promise<Saison> {
    const programme = await chargerProgrammeActif()
    return {
      id: programme.seasonId,
      nom: programme.seasonName,
      reductionMaxCentimes: dhVersCentimes(programme.maxDiscountDh),
      // `omra_seasons` ne porte aucune colonne de durée affichable — non
      // modélisé côté omra ; laissé vide plutôt que d'inventer une valeur.
      duree: '',
      active: true,
    }
  },

  // omra ne gère qu'une seule saison active à la fois (contrainte
  // `omra_seasons_single_active`). Comme l'adaptateur de démonstration,
  // `saisons()` n'expose que celle-ci — jamais appelée ailleurs dans
  // `service.ts` (seul `saisonActive()` l'est).
  async saisons(): Promise<Saison[]> {
    return [await referentielsSupabase.saisonActive()]
  },

  async hotels(): Promise<Hotel[]> {
    const programme = await chargerProgrammeActif()
    // R-05 — le domaine utilise le nom comme identifiant (`create-receipt.ts`
    // copie `saisie.hotel` verbatim, sans résolution d'UUID) : aucune table
    // de référence séparée n'existe côté prototype. `write.ts` résout ce nom
    // vers le véritable UUID `omra_program_hotels.id` au moment d'écrire.
    return programme.hotels.map((hotel) => ({ id: hotel.name, nom: hotel.name }))
  },

  async vols(): Promise<Vol[]> {
    const programme = await chargerProgrammeActif()
    return programme.flights.map((flight) => ({ id: flight.label, nom: flight.label }))
  },

  async chambres(): Promise<Chambre[]> {
    const programme = await chargerProgrammeActif()
    return programme.rooms.map((room) => ({ id: String(room.bedCount), code: String(room.bedCount) }))
  },

  async rabatteurs(): Promise<Rabatteur[]> {
    const programme = await chargerProgrammeActif()
    return programme.rabatteurs.map((rabatteur) => ({ id: rabatteur.name, nom: rabatteur.name }))
  },

  async tarifs(saisonId: string): Promise<Tarif[]> {
    const programme = await chargerProgrammeActif()
    if (programme.seasonId !== saisonId) {
      // omra n'expose que la saison active ; une autre saison n'a pas de
      // tarifs ici (R-05 : une combinaison absente bloque, elle ne vaut
      // jamais zéro).
      return []
    }

    const nomHotel = new Map(programme.hotels.map((h) => [h.id, h.name]))
    const labelVol = new Map(programme.flights.map((f) => [f.id, f.label]))
    const codeChambre = new Map(programme.rooms.map((r) => [r.id, String(r.bedCount)]))

    return programme.prices.map((prix) => ({
      saisonId,
      hotelId: nomHotel.get(prix.hotelId) ?? prix.hotelId,
      volId: labelVol.get(prix.flightId) ?? prix.flightId,
      chambreId: codeChambre.get(prix.roomId) ?? prix.roomId,
      montantCentimes: dhVersCentimes(prix.amountDh),
    }))
  },
}
