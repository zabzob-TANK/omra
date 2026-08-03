'use client'

/**
 * Écran-relais « à venir ».
 *
 * reprise.md §5 — Finance, Paiements et Suivi journalier dépendent tous les
 * trois de `mouvementsCaisse`, volontairement non branché côté omra (renvoyé
 * à un lot dédié : « journal financier »). Avant cette correction, l'appel
 * échouait sans être rattrapé et faisait planter toute la page (erreur 500).
 *
 * Cet écran reprend l'habillage déjà utilisé pour الإحصائيات — un titre, une
 * phrase et une étiquette — pour que ces trois écrans restent atteignables et
 * ne plantent plus, en attendant le lot dédié. Aucun texte ici n'appartient au
 * fichier de référence : ce n'est pas un écran du prototype, contrairement à
 * الإحصائيات, donc ce texte n'a pas sa place dans `textes.ts` (catalogue
 * réservé aux chaînes reprises telles quelles du fichier de référence).
 */

import './statistiques.css'

interface Proprietes {
  titre: string
  note: string
  etiquette: string
  dir?: 'rtl' | 'ltr'
  lang?: string
}

export function EcranAVenir({ titre, note, etiquette, dir, lang }: Proprietes) {
  return (
    <main className="stats-principal" dir={dir} lang={lang}>
      <div className="stats-entete">
        <div>
          <h1>{titre}</h1>
          <p>{note}</p>
        </div>
        <span className="stats-etiquette">{etiquette}</span>
      </div>
    </main>
  )
}
