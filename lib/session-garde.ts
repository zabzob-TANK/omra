/**
 * Garde-barrière de durée de session.
 *
 * Supabase renouvelle tout seul le jeton d'une session tant que le navigateur
 * revient, ce qui la rend potentiellement éternelle : en rouvrant simplement
 * le lien, on se retrouve connecté sans avoir rien tapé. Ce module impose
 * trois limites par-dessus, décidées par le commanditaire le 2026-09-22 :
 *
 *  - une durée d'INACTIVITÉ : sans action pendant N minutes, il faut se
 *    reconnecter ;
 *  - une durée MAXIMALE absolue : même en travaillant sans arrêt, la session
 *    s'arrête au bout de M minutes ;
 *  - la FERMETURE DU NAVIGATEUR met fin à la session (cookies sans date
 *    d'expiration, donc effacés à la fermeture).
 *
 * Les valeurs sont strictes par défaut en production, larges en
 * développement : le site des vrais clients doit protéger, le site de test ne
 * doit pas obliger à retaper un mot de passe à chaque essai. Chaque
 * déploiement peut les régler par variables d'environnement, exactement comme
 * `FACTURATION_SOURCE` choisit la source de données.
 *
 * Le même mécanisme tourne PARTOUT, seules les durées changent. Un garde-fou
 * qu'on ne fait jamais fonctionner en test est un garde-fou qu'on découvre
 * cassé le jour où il compte.
 *
 * L'état tient dans un cookie SIGNÉ : le navigateur ne peut pas se prolonger
 * lui-même en modifiant la date. Le serveur seul connaît la clé.
 *
 * Contrainte d'exécution : ce module est appelé depuis `proxy.ts`, qui tourne
 * sur le runtime Edge. Pas de `node:crypto` ici, uniquement la cryptographie
 * du Web (`crypto.subtle`), disponible des deux côtés.
 */

export const COOKIE_GARDE = 'omra-garde'
/**
 * Cookie LISIBLE par le navigateur (pas `httpOnly`) : il ne contient que
 * l'instant de fin prévu, pour qu'un écran puisse prévenir l'utilisateur
 * avant la coupure. Le falsifier ne prolonge rien, la décision reste prise
 * sur le serveur à partir du cookie signé.
 */
export const COOKIE_FIN = 'omra-garde-fin'

export type Limites = {
  inactiviteMs: number
  maximumMs: number
  finAuNavigateur: boolean
}

export type EtatGarde = {
  /** Instant de la première authentification de cette session. */
  debut: number
  /** Instant de la dernière activité réelle observée. */
  vu: number
}

export type Verdict = 'valide' | 'inactivite' | 'maximum' | 'illisible'

const MINUTE = 60_000
const LARGE_MINUTES = 720 // 12 h : valeur de confort, hors production

function entierPositif(valeur: string | undefined, defaut: number): number {
  const n = Number(valeur)
  return Number.isFinite(n) && n > 0 ? n : defaut
}

/**
 * Durées applicables. En production, strictes par défaut : un déploiement
 * neuf, par exemple celui d'une nouvelle agence, est protégé sans que
 * personne ait à y penser. Hors production, larges : le développement local
 * ne doit pas redemander un mot de passe toutes les demi-heures.
 */
export function limites(): Limites {
  const production = process.env.NODE_ENV === 'production'
  const defautInactivite = production ? 30 : LARGE_MINUTES
  const defautMaximum = production ? 180 : LARGE_MINUTES

  return {
    inactiviteMs:
      entierPositif(process.env.OMRA_SESSION_INACTIVITE_MINUTES, defautInactivite) * MINUTE,
    maximumMs:
      entierPositif(process.env.OMRA_SESSION_MAXIMUM_MINUTES, defautMaximum) * MINUTE,
    finAuNavigateur:
      (process.env.OMRA_SESSION_FIN_AU_NAVIGATEUR ?? (production ? '1' : '0')) === '1',
  }
}

/**
 * Clé de signature. `OMRA_SESSION_SECRET` est le bon choix ; à défaut on
 * retombe sur la clé serveur Supabase, déjà présente partout et jamais
 * envoyée au navigateur. Sans aucune des deux, la signature serait faible :
 * on le signale plutôt que de faire semblant de protéger.
 */
function secret(): string {
  const valeur = process.env.OMRA_SESSION_SECRET || process.env.SUPABASE_SECRET_KEY
  if (!valeur) {
    throw new Error(
      'Aucun secret disponible pour signer la garde de session : ' +
        'configurez OMRA_SESSION_SECRET ou SUPABASE_SECRET_KEY.',
    )
  }
  return valeur
}

function versBase64Url(octets: Uint8Array): string {
  let binaire = ''
  for (const o of octets) binaire += String.fromCharCode(o)
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function depuisBase64Url(texte: string): Uint8Array {
  const complet = texte.replace(/-/g, '+').replace(/_/g, '/')
  const binaire = atob(complet + '='.repeat((4 - (complet.length % 4)) % 4))
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i)
  return octets
}

async function signature(charge: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const brute = await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(charge))
  return versBase64Url(new Uint8Array(brute))
}

/** Comparaison à durée constante : ne jamais laisser deviner une signature octet par octet. */
function memeSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let different = 0
  for (let i = 0; i < a.length; i += 1) different |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return different === 0
}

export async function ecrireGarde(etat: EtatGarde): Promise<string> {
  const charge = versBase64Url(new TextEncoder().encode(JSON.stringify(etat)))
  return `${charge}.${await signature(charge)}`
}

/** Retourne l'état si le cookie est présent, bien formé ET correctement signé ; sinon `null`. */
export async function lireGarde(valeur: string | undefined): Promise<EtatGarde | null> {
  if (!valeur) return null
  const separateur = valeur.lastIndexOf('.')
  if (separateur <= 0) return null
  const charge = valeur.slice(0, separateur)
  const fournie = valeur.slice(separateur + 1)
  let attendue: string
  try {
    attendue = await signature(charge)
  } catch {
    return null
  }
  if (!memeSignature(fournie, attendue)) return null
  try {
    const brut = JSON.parse(new TextDecoder().decode(depuisBase64Url(charge))) as Partial<EtatGarde>
    if (typeof brut.debut !== 'number' || typeof brut.vu !== 'number') return null
    if (!Number.isFinite(brut.debut) || !Number.isFinite(brut.vu)) return null
    return { debut: brut.debut, vu: brut.vu }
  } catch {
    return null
  }
}

export function verdict(etat: EtatGarde, bornes: Limites, maintenant: number): Verdict {
  // Une horloge qui recule, ou un cookie venu du futur : on refuse plutôt que
  // d'accorder une session sans fin.
  if (etat.debut > maintenant + MINUTE || etat.vu > maintenant + MINUTE) return 'illisible'
  if (maintenant - etat.debut >= bornes.maximumMs) return 'maximum'
  if (maintenant - etat.vu >= bornes.inactiviteMs) return 'inactivite'
  return 'valide'
}

/** Instant auquel la session s'arrêtera si plus rien ne se passe. */
export function finPrevue(etat: EtatGarde, bornes: Limites): number {
  return Math.min(etat.vu + bornes.inactiviteMs, etat.debut + bornes.maximumMs)
}

/**
 * Une requête de pré-chargement n'est pas une activité de l'utilisateur :
 * Next.js va chercher les pages survolées ou visibles, ce qui prolongerait la
 * session d'une personne partie prendre un café devant un écran ouvert.
 */
export function estPrechargement(entetes: Headers): boolean {
  return (
    entetes.get('next-router-prefetch') === '1' ||
    entetes.get('purpose') === 'prefetch' ||
    entetes.get('x-purpose') === 'preview'
  )
}
