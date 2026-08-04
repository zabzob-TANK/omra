/**
 * Images d'exemple et jeu de données du remplissage démonstratif du
 * passeport.
 *
 * Specimens fictifs réels (JPG), servis depuis `public/facturation/
 * exemples/` — remplacent les anciennes vignettes SVG générées côté client,
 * jamais acceptées par le stockage réel (JPG/PNG/WebP uniquement, sécurité).
 *
 * Bouton « ملء بيانات تجريبية » — visible uniquement en démonstration
 * (`ModalePasseport`, `modeDemonstration`). Ce n'est **pas** une lecture
 * automatique : le fichier de référence marque lui-même ce remplissage
 * `prototype-ai-simulation`, et rien n'analyse l'image.
 */

import { chargerImageExemple } from './charger-exemple'

/** Exemple pour le scan complet du passeport (« originale »). */
export function scanPasseportExemple(): Promise<Blob> {
  return chargerImageExemple('/facturation/exemples/passeport-specimen.jpg')
}

/** Exemple pour le portrait de la personne, tiré du scan. */
export function portraitPasseportExemple(): Promise<Blob> {
  return chargerImageExemple('/facturation/exemples/photo-identite-specimen.jpg')
}

/** Valeurs du bouton « ملء بيانات تجريبية », reprises telles quelles. */
export const PASSEPORT_DEMONSTRATION = {
  prenom: 'محمد أمين',
  nom: 'العلوي',
  numero: 'MA4827391',
  nationalite: 'مغربية',
  dateNaissance: '14/03/1986',
  lieuNaissance: 'الدار البيضاء',
  dateEmission: '09/05/2023',
  dateExpiration: '08/05/2028',
  paysEmission: 'المغرب',
  sexe: 'M',
  mrz: 'P<MARALAOUI<<MOHAMED<AMINE<<<<<<<<<<<<\nMA4827391MAR8603147M2805089<<<<<<<<<<<<<<04',
  initiales: 'MA',
} as const

/**
 * Réduit une image à la taille voulue, comme `resizeImageFile()` du fichier.
 * Le résultat reste un fichier binaire : rien n'est conservé en `data:` URL.
 */
export async function reduireImage(
  fichier: Blob,
  largeurMax: number,
  hauteurMax: number,
  qualite = 0.82,
): Promise<Blob> {
  const source = await creerImage(fichier)
  const facteur = Math.min(1, largeurMax / source.width, hauteurMax / source.height)
  const largeur = Math.max(1, Math.round(source.width * facteur))
  const hauteur = Math.max(1, Math.round(source.height * facteur))

  const toile = document.createElement('canvas')
  toile.width = largeur
  toile.height = hauteur
  toile.getContext('2d')?.drawImage(source, 0, 0, largeur, hauteur)

  return new Promise((resoudre, rejeter) => {
    toile.toBlob(
      (resultat) => (resultat ? resoudre(resultat) : rejeter(new Error('Conversion impossible'))),
      'image/jpeg',
      qualite,
    )
  })
}

function creerImage(fichier: Blob): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const url = URL.createObjectURL(fichier)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resoudre(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      rejeter(new Error('Image illisible'))
    }
    image.src = url
  })
}
