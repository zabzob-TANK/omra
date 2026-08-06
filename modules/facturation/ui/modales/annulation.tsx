'use client'

/**
 * Fenêtre « Annuler le reçu ».
 *
 * R-43 à R-47 — Motif, mode de remboursement et mot de passe obligatoires.
 * Le reçu n’est jamais supprimé et son numéro n’est jamais réutilisé.
 */

import { useState } from 'react'

import type { ErreurValidation, Resultat } from '../../domain/rules/errors'
import { montantRemboursableCentimes, type SaisieAnnulation } from '../../domain/rules/cancellation'
import { totalPaye } from '../../domain/rules/receipt'
import type { Recu } from '../../domain/types'
import { Champ, enErreur, ListeErreurs, Saisie, Selection, Zone } from '../champs'
import { Dialogue } from '../dialogue'
import { Montant } from '../bidi'
import { IndicateurChargement } from '../spinner'
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

  // R-46, §5.10-§5.11 — `remboursable` est toujours celui que retiendrait
  // `preparerAnnulation` : identique à `paye` sauf trop-perçu, où il reste
  // plafonné au convenu.
  const paye = totalPaye(recu)
  const remboursable = montantRemboursableCentimes(recu)

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
            {envoi ? <IndicateurChargement /> : null}
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
          <Montant centimes={paye} />
        </strong>
      </div>

      {/*
        R-46, §5.10-§5.11 — en cas de trop-perçu, le montant payé ci-dessus et
        ce que la caisse rendra réellement diffèrent : le serveur (et
        `preparerAnnulation`) plafonnent au convenu, jamais au total payé.
        Un second encadré rend cet écart visible avant la confirmation, pour
        qu'un employé ne sorte jamais plus de la caisse que ce que le système
        enregistrera.
      */}
      {remboursable < paye ? (
        <>
          <div className="annul-montant annul-montant-plafonne">
            <span>{T.annulation.montantRemboursable}</span>
            <strong>
              <Montant centimes={remboursable} />
            </strong>
          </div>
          <p className="omra-hint" style={{ color: 'var(--warn)', marginTop: -6, marginBottom: 13 }}>
            {T.annulation.avertissementTropPercu}
          </p>
        </>
      ) : null}

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
