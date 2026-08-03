'use client'

/**
 * Fenêtre d'ajout d'image à un paiement bancaire.
 *
 * Français, de gauche à droite, comme dans le fichier de référence
 * (`.cheque-modal.scan`). Le texte d'avertissement du fichier est conservé mot
 * pour mot : aucune lecture automatique n'est développée dans cette version.
 *
 * Couvre : R-35, R-36 (une seule image active, la confirmation seule
 * enregistre) et R-41 (l'ajout est tracé, côté service).
 */

import { useEffect, useState } from 'react'

import { T } from '../textes'
import { imageExemplePaiement, NOM_FICHIER_EXEMPLE } from '../../media/exemple-paiement'

export interface CiblePaiement {
  cle: string
  titre: string
  libelleReference: string
  libelleImport: string
  numero: string
  banque: string
  montant: string
  payeur: string
  date: string
  virement: boolean
}

interface Proprietes {
  cible: CiblePaiement
  onFermer: () => void
  onEnregistrer: (fichier: { contenu: Blob; nomOrigine: string }) => void
}

export function ModalePaiementImage({ cible, onFermer, onEnregistrer }: Proprietes) {
  const I = T.paiementImage
  // L'aperçu n'existe que le temps de la fenêtre : rien n'est enregistré tant
  // que la confirmation n'a pas eu lieu. L'URL objet est créée avec le
  // brouillon et révoquée avec lui.
  const [brouillon, setBrouillon] = useState<{
    contenu: Blob
    nomOrigine: string
    apercu: string
  } | null>(null)

  const retenir = (contenu: Blob, nomOrigine: string) => {
    setBrouillon((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent.apercu)
      return { contenu, nomOrigine, apercu: URL.createObjectURL(contenu) }
    })
  }

  useEffect(
    () => () => {
      if (brouillon) URL.revokeObjectURL(brouillon.apercu)
    },
    [brouillon],
  )

  // R-89
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') onFermer()
    }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [onFermer])

  return (
    <div
      className="cheque-fenetre-fond"
      onClick={(evenement) => {
        if (evenement.target === evenement.currentTarget) onFermer()
      }}
    >
      <div className="cheque-fenetre scan" dir="ltr" lang="fr">
        <div className="cheque-fenetre-entete">
          <div>
            <h3>{cible.titre}</h3>
            <p>{I.sousTitre}</p>
          </div>
          <button className="cheque-fenetre-fermer" onClick={onFermer}>
            ✕
          </button>
        </div>

        <div className="cheque-fenetre-corps">
          <div className="cheque-note">
            <b>{I.note}</b>
            {I.noteSuite}
          </div>

          <div className="cheque-cible">
            <div>
              <span>{cible.libelleReference}</span>
              <b className="mono-ltr">{cible.numero}</b>
            </div>
            <div>
              <span>{I.banque}</span>
              <b className="cheque-rtl">{cible.banque}</b>
            </div>
            <div>
              <span>{I.montant}</span>
              <b className="cheque-montant">{cible.montant}</b>
            </div>
          </div>

          <div className="cheque-scene">
            {brouillon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brouillon.apercu} alt={cible.libelleImport} />
            ) : (
              <div className="cheque-scene-vide">
                <strong>{cible.libelleImport}</strong>
                <span>{I.apresConfirmation}</span>
              </div>
            )}
          </div>

          <div className="cheque-actions-image">
            <label className="cheque-fichier">
              {I.importer}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(evenement) => {
                  const fichier = evenement.target.files?.[0]
                  if (fichier) retenir(fichier, fichier.name)
                }}
              />
            </label>
            <button
              className="cheque-action"
              onClick={() =>
                retenir(
                  imageExemplePaiement({
                    reference: cible.numero,
                    banque: cible.banque,
                    montant: cible.montant,
                    payeur: cible.payeur,
                    date: cible.date,
                    virement: cible.virement,
                  }),
                  NOM_FICHIER_EXEMPLE,
                )
              }
            >
              Utiliser un exemple
            </button>
            <button
              className="cheque-action principale"
              disabled={!brouillon}
              style={{ marginLeft: 'auto' }}
              onClick={() => {
                if (brouillon) onEnregistrer(brouillon)
              }}
            >
              {I.enregistrer}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
