/**
 * Nom affiché pour l'auteur d'une action.
 *
 * Décision du commanditaire (2026-10-12) : plus de « Employé 1 », « Employé
 * 2 »… — chaque personne s'affiche sous son login (« simo », « iman »), et
 * l'administrateur (slot 1) sous « admin », quel que soit son login réel.
 * Toujours appliqué à l'instantané pris au moment de l'action : une action
 * reste attribuée au login de son époque, même si le slot change de main.
 *
 * Même règle, côté base, dans `public.facturation_actor_display_name()`
 * (migration 202610120001) — modifier les deux ensemble.
 */
export function nomAffichageActeur(
  numeroSlot: number | null | undefined,
  login: string | null | undefined,
  libelleSlot: string,
): string {
  if (numeroSlot === 1) return 'admin'
  const loginNettoye = login?.trim()
  return loginNettoye || libelleSlot
}
