/**
 * Primitives d'affichage bidirectionnel.
 *
 * L'interface est en français et se lit de gauche à droite. Ces composants
 * isolent les fragments qui doivent conserver leur propre direction.
 *
 * Règle d'usage : **aucune valeur arabe ni aucune valeur technique ne doit être
 * rendue en texte brut.** Toute valeur provenant du domaine passe par l'une de
 * ces primitives.
 */

import type { ReactNode } from 'react'

import { attributsDirection, type CategorieValeur } from '../domain/bidi'
import { centimesEnTexte, centimesEnTexteDevise } from '../domain/money'

interface ProprietesBase {
  children: ReactNode
  className?: string
  /** Rend un `<div>` plutôt qu'un `<span>` lorsque le contexte est un bloc. */
  bloc?: boolean
}

function ValeurDirigee({
  categorie,
  children,
  className,
  bloc,
}: ProprietesBase & { categorie: CategorieValeur }) {
  const { dir, style } = attributsDirection(categorie)
  const Balise = bloc ? 'div' : 'span'
  return (
    <Balise dir={dir} className={className} style={style}>
      {children}
    </Balise>
  )
}

/**
 * Valeur arabe : nom, prénom, hôtel, vol, rabatteur, motif, note.
 * Lue de droite à gauche, en `plaintext` pour tolérer un contenu latin.
 */
export function TexteArabe({ children, className, bloc }: ProprietesBase) {
  return (
    <ValeurDirigee categorie="arabe" className={className} bloc={bloc}>
      {children}
    </ValeurDirigee>
  )
}

/**
 * Montant en dirhams, isolé de gauche à droite.
 *
 * @param centimes Montant entier en centimes.
 * @param avecDevise Ajoute « DH ». Correspond à `dhs()` du prototype.
 */
export function Montant({
  centimes,
  avecDevise = true,
  className,
}: {
  centimes: number
  avecDevise?: boolean
  className?: string
}) {
  const texte = avecDevise ? centimesEnTexteDevise(centimes) : centimesEnTexte(centimes)
  const { dir, style } = attributsDirection('montant')
  return (
    <span dir={dir} className={className} style={{ ...style, whiteSpace: 'nowrap' }}>
      {texte}
    </span>
  )
}

/** Date `jj/mm/aaaa` ou horodatage, isolés de gauche à droite. */
export function DateValeur({ children, className }: Omit<ProprietesBase, 'bloc'>) {
  const { dir, style } = attributsDirection('date')
  return (
    <span dir={dir} className={className} style={{ ...style, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

/** Numéro de téléphone, isolé de gauche à droite. */
export function Telephone({ children, className }: Omit<ProprietesBase, 'bloc'>) {
  const { dir, style } = attributsDirection('telephone')
  return (
    <span dir={dir} className={className} style={{ ...style, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

/**
 * Numéro de reçu, référence bancaire ou identifiant technique.
 * Isolé de gauche à droite et rendu en chasse fixe, comme dans la référence.
 */
export function Reference({ children, className }: Omit<ProprietesBase, 'bloc'>) {
  const { dir, style } = attributsDirection('reference')
  return (
    <span
      dir={dir}
      className={className}
      style={{ ...style, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
    >
      {children}
    </span>
  )
}
