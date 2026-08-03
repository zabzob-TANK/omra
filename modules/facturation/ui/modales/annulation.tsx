'use client'

/**
 * Fenêtre « Annuler le reçu ».
 *
 * R-43 à R-47 — Motif, mode de remboursement et mot de passe obligatoires.
 * Le reçu n’est jamais supprimé et son numéro n’est jamais réutilisé.
 */

import { useState } from 'react'

import type { ErreurValidation, Resultat } from '../../domain/rules/errors'
import type { SaisieAnnulation } from '../../domain/rules/cancellation'
import { totalPaye } from '../../domain/rules/receipt'
import type { Recu } from '../../domain/types'
import { Champ, enErreur, ListeErreurs, Saisie, Selection, Zone } from '../champs'
import { Dialogue } from '../dialogue'
import { Montant } from '../bidi'
import { T } from '../textes'

interface Proprietes {
  recu: Recu
  onFermer: () => void
  onAnnuler: (saisie: SaisieAnnulation) => Promise<Resultat<null>>
}

export function ModaleAnnulation({ recu, onFermer, onAnnuler }: Proprietes) {
  const [saisie, setSaisie] = useState<SaisieAnnulation>({
    motif: '',
    modeRemboursement: '',
    motDePasse: '',
  })
  const [erreurs, setErreurs] = useState<ErreurValidation[]>([])
  const [envoi, setEnvoi] = useState(false)

  const modifier = (patch: Partial<SaisieAnnulation>) => setSaisie({ ...saisie, ...patch })

  const soumettre = async () => {
    setEnvoi(true)
    const resultat = await onAnnuler(saisie)
    setEnvoi(false)
    if (resultat.statut === 'erreurs') {
      setErreurs(resultat.erreurs)
      // Le mot de passe est effacé après chaque tentative : il doit être
      // ressaisi, et ne jamais rester dans le champ ni dans l'état.
      setSaisie((actuelle) => ({ ...actuelle, motDePasse: '' }))
      return
    }
    onFermer()
  }

  return (
    <Dialogue
      titre={T.annulation.titre}
      onFermer={onFermer}
      classeCoque="annul-coque"
      pied={
        <>
          <button className="omra-btn" onClick={onFermer} disabled={envoi}>
            {T.annulation.retour}
          </button>
          <button className="omra-btn danger" onClick={soumettre} disabled={envoi}>
            {T.annulation.confirmer}
          </button>
        </>
      }
    >
      <ListeErreurs erreurs={erreurs} />

      <p className="annul-consigne">{T.annulation.avertissement}</p>

      {/* Le fichier ne rappelle que le montant déjà encaissé. */}
      <div className="annul-montant">
        <span>{T.annulation.montantPaye}</span>
        <strong>
          <Montant centimes={totalPaye(recu)} />
        </strong>
      </div>

      <div className="omra-fields">
        <Champ label={T.annulation.modeRemboursement} pleine>
          <Selection
            valeur={saisie.modeRemboursement}
            onChange={(v) => modifier({ modeRemboursement: v as SaisieAnnulation['modeRemboursement'] })}
            options={[
              { valeur: 'cash', libelle: T.annulation.depuisCaisse },
              { valeur: 'none', libelle: T.annulation.horsCaisse },
            ]}
            invalide={enErreur(erreurs, 'modeRemboursement')}
            vide={T.annulation.choisir}
          />
        </Champ>
        <Champ label={T.annulation.motif} pleine>
          <Zone
            valeur={saisie.motif}
            onChange={(v) => modifier({ motif: v })}
            invalide={enErreur(erreurs, 'motif')}
            lignes={3}
            arabe
          />
        </Champ>
        <Champ label={T.annulation.motDePasse} pleine>
          <Saisie
            valeur={saisie.motDePasse}
            onChange={(v) => modifier({ motDePasse: v })}
            invalide={enErreur(erreurs, 'motDePasse')}
            type="password"
          />
        </Champ>
      </div>


    </Dialogue>
  )
}
