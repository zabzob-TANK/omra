/**
 * Portrait factice et jeu de données de démonstration du passeport.
 *
 * ⚠️ Contenu de démonstration, confiné à ce fichier. Le fichier de référence
 * fabrique le même portrait SVG (`makePassportPortrait`) et propose le même
 * bouton « ملء بيانات تجريبية » avec exactement ces valeurs.
 *
 * Ce n'est **pas** une lecture automatique : le fichier marque lui-même ce
 * remplissage `prototype-ai-simulation`, et rien n'analyse l'image.
 */

/** Portrait générique, reprenant le tracé du fichier de référence. */
export function portraitPasseport(initiales: string): Blob {
  const etiquette = String(initiales || 'P').trim().slice(0, 2) || 'P'
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="320" viewBox="0 0 260 320">' +
    '<rect width="260" height="320" fill="#edf0e5"/>' +
    '<circle cx="130" cy="112" r="55" fill="#c8d0bd"/>' +
    '<path d="M42 292c12-74 52-112 88-112s76 38 88 112" fill="#9cab8d"/>' +
    `<text x="130" y="305" text-anchor="middle" font-family="Arial" font-size="22" fill="#47593c">${etiquette}</text>` +
    '</svg>'
  return new Blob([svg], { type: 'image/svg+xml' })
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
