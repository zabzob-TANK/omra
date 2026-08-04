/**
 * Charge une image d'exemple statique servie par l'app (`public/facturation/
 * exemples/`) — des specimens fictifs réels (JPG), jamais générés côté client.
 *
 * Remplace les anciens générateurs SVG : un placeholder SVG n'était accepté
 * que par l'adaptateur de démonstration, jamais par le stockage réel (JPG/
 * PNG/WebP uniquement, sécurité) — voir `storage.ts`.
 */
export async function chargerImageExemple(chemin: string): Promise<Blob> {
  const reponse = await fetch(chemin)
  if (!reponse.ok) {
    throw new Error(`Image d'exemple introuvable : ${chemin} (${reponse.status})`)
  }
  return reponse.blob()
}
