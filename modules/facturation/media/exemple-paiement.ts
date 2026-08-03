/**
 * Image d'exemple : vignette factice de chèque ou de virement.
 *
 * ⚠️ Contenu de démonstration, confiné à ce fichier. Le fichier de référence
 * fabrique la même vignette SVG (`makeChequeDemo`) et l'annote lui-même
 * « Image factice pour le prototype ». Il s'en sert à deux endroits : le bouton
 * « Utiliser un exemple » de la fenêtre d'ajout, et l'amorçage de quelques
 * images dans le jeu de démonstration.
 *
 * Aucune règle n'en dépend, et rien dans `domain/` n'y fait référence : ni
 * React ni Next.js ne sont utilisés ici.
 */

function protege(valeur: string | number | null | undefined): string {
  return String(valeur ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function imageExemplePaiement(donnees: {
  reference: string
  banque: string
  montant: string
  payeur: string
  date: string
  virement: boolean
}): Blob {
  const genre = donnees.virement ? 'VIREMENT' : 'CHÈQUE'
  const libelleReference = donnees.virement ? 'Référence' : 'Numéro'
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop stop-color="#f7f4e9"/><stop offset="1" stop-color="#e8eee1"/></linearGradient></defs>' +
    '<rect width="1200" height="500" rx="24" fill="url(#g)"/>' +
    '<rect x="18" y="18" width="1164" height="464" rx="18" fill="none" stroke="#64745a" stroke-width="3"/>' +
    '<circle cx="1040" cy="112" r="62" fill="#c9a24a" opacity=".22"/>' +
    `<text x="70" y="88" font-family="Arial" font-size="34" font-weight="700" fill="#47593c">${genre} — DÉMONSTRATION</text>` +
    `<text x="70" y="145" font-family="Arial" font-size="23" fill="#6e7565">Banque : ${protege(donnees.banque)}</text>` +
    `<text x="840" y="145" font-family="Arial" font-size="23" fill="#6e7565">Date : ${protege(donnees.date)}</text>` +
    '<line x1="70" y1="184" x2="1130" y2="184" stroke="#b9b6ab" stroke-width="2"/>' +
    `<text x="70" y="250" font-family="Arial" font-size="27" fill="#20251b">Payeur : ${protege(donnees.payeur)}</text>` +
    `<text x="70" y="322" font-family="Arial" font-size="24" fill="#6e7565">${libelleReference} : ${protege(donnees.reference)}</text>` +
    '<rect x="760" y="225" width="370" height="110" rx="12" fill="#fff" stroke="#9cab8d" stroke-width="2"/>' +
    `<text x="945" y="292" text-anchor="middle" font-family="Arial" font-size="38" font-weight="700" fill="#2e3b27">${protege(donnees.montant)}</text>` +
    '<line x1="70" y1="392" x2="560" y2="392" stroke="#8f9489" stroke-width="2"/>' +
    '<text x="70" y="426" font-family="Arial" font-size="18" fill="#8c9185">Justificatif</text>' +
    '<text x="1130" y="450" text-anchor="end" font-family="Arial" font-size="17" fill="#a3801f">Image factice pour le prototype</text>' +
    '</svg>'
  return new Blob([svg], { type: 'image/svg+xml' })
}

export const NOM_FICHIER_EXEMPLE = 'document-demonstration.svg'
