'use client'

/**
 * Fenêtre « مسح جواز السفر ».
 *
 * R-90 — Reproduit la fenêtre du fichier de référence : un bandeau
 * d'avertissement, une colonne de gauche portant l'image choisie, le bouton
 * d'import et le remplissage de démonstration, puis les onze champs sur deux
 * colonnes et la zone MRZ en pleine largeur.
 *
 * **Aucune lecture automatique, aucun OCR.** Le fichier ne fait qu'annoncer un
 * service futur ; son bouton « ملء بيانات تجريبية » écrit des valeurs fixes et
 * marque lui-même le résultat `prototype-ai-simulation`. Rien n'analyse l'image.
 *
 * Les deux images restent des brouillons locaux : elles ne sont déposées dans
 * le stockage de fichiers qu'à l'enregistrement du reçu, jamais avant.
 */

import { useEffect, useState } from 'react'

import { formaterDate } from '../../domain/format'
import type { Passeport } from '../../domain/types'
import {
  PASSEPORT_DEMONSTRATION,
  portraitPasseport,
  reduireImage,
} from '../../media/exemple-passeport'
import { Champ, Saisie } from '../champs'
import { T } from '../textes'
import './passeport.css'

export function passeportVierge(): Passeport {
  return {
    prenom: '',
    nom: '',
    numero: '',
    nationalite: '',
    dateNaissance: '',
    lieuNaissance: '',
    dateEmission: '',
    dateExpiration: '',
    paysEmission: '',
    sexe: '',
    mrz: '',
    imageOriginale: null,
    imagePortrait: null,
    scanId: '',
    resultatBrut: null,
  }
}

/** Images tenues en brouillon jusqu'à l'enregistrement du reçu. */
export interface ImagesPasseport {
  originale: Blob
  portrait: Blob
  /** Aperçu local, révoqué avec le brouillon. */
  apercu: string
}

interface Proprietes {
  initial: Passeport | null
  /** Aperçu déjà retenu par le formulaire, pour rouvrir la fenêtre à l'identique. */
  apercuInitial?: string
  onFermer: () => void
  onValider: (passeport: Passeport, images: ImagesPasseport | null) => void
}

export function ModalePasseport({ initial, apercuInitial, onFermer, onValider }: Proprietes) {
  const P = T.passeport
  const [brouillon, setBrouillon] = useState<Passeport>(initial ?? passeportVierge())
  const [images, setImages] = useState<ImagesPasseport | null>(null)
  const [message, setMessage] = useState('')

  const modifier = (patch: Partial<Passeport>) => setBrouillon({ ...brouillon, ...patch })

  const retenirImages = (originale: Blob, portrait: Blob) => {
    setImages((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent.apercu)
      return { originale, portrait, apercu: URL.createObjectURL(originale) }
    })
  }

  useEffect(
    () => () => {
      if (images) URL.revokeObjectURL(images.apercu)
    },
    [images],
  )

  // R-89 — la touche d'échappement revient au formulaire.
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') onFermer()
    }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [onFermer])

  /** Import manuel : l'original et le portrait sont produits aux cotes du fichier. */
  const importer = async (fichier: File) => {
    try {
      const originale = await reduireImage(fichier, 1100, 760, 0.78)
      const portrait = await reduireImage(fichier, 260, 320, 0.72)
      retenirImages(originale, portrait)
      setBrouillon((precedent) => ({
        ...precedent,
        scanId: precedent.scanId || `SCAN-${Date.now()}`,
        resultatBrut: {
          source: 'prototype-upload',
          nomFichier: fichier.name,
          typeFichier: fichier.type,
          tailleFichier: fichier.size,
          recuLe: new Date().toISOString(),
        },
      }))
      setMessage('')
    } catch {
      setMessage(P.imageIllisible)
    }
  }

  /** Remplissage de démonstration — valeurs fixes, aucune analyse d'image. */
  const remplirDemonstration = () => {
    const D = PASSEPORT_DEMONSTRATION
    retenirImages(portraitPasseport(D.initiales), portraitPasseport(D.initiales))
    setBrouillon({
      prenom: D.prenom,
      nom: D.nom,
      numero: D.numero,
      nationalite: D.nationalite,
      dateNaissance: D.dateNaissance,
      lieuNaissance: D.lieuNaissance,
      dateEmission: D.dateEmission,
      dateExpiration: D.dateExpiration,
      paysEmission: D.paysEmission,
      sexe: D.sexe,
      mrz: D.mrz,
      imageOriginale: null,
      imagePortrait: null,
      scanId: `SCAN-DEMO-${Date.now()}`,
      resultatBrut: {
        source: 'prototype-ai-simulation',
        confiance: 0.97,
        champsDetectes: 10,
        recuLe: new Date().toISOString(),
      },
    })
    setMessage('')
  }

  const valider = () => {
    // Le fichier exige le nom et le prénom avant de reporter le scan dans le reçu.
    if (!brouillon.prenom.trim() || !brouillon.nom.trim()) {
      setMessage(P.manqueNom)
      return
    }
    onValider({ ...brouillon, scanId: brouillon.scanId || `SCAN-${Date.now()}` }, images)
  }

  const apercu = images?.apercu || apercuInitial || ''

  return (
    <div
      className="passeport-fond"
      onClick={(evenement) => {
        if (evenement.target === evenement.currentTarget) onFermer()
      }}
    >
      <div className="passeport-fenetre" dir="rtl">
        <div className="passeport-entete">
          <div className="passeport-icone" aria-hidden="true">
            <svg
              fill="none"
              height="18"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
              width="18"
            >
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <circle cx="12" cy="9" r="2.4" />
              <path d="M8 16c1.2-2 2.6-3 4-3s2.8 1 4 3" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <h2>{P.titre}</h2>
            <p>{P.sousTitre}</p>
          </div>
          <button className="passeport-fermer" onClick={onFermer}>
            ✕
          </button>
        </div>

        <div className="passeport-corps">
          <div className="passeport-note">{P.note}</div>

          {message ? (
            <div className="omra-errors" role="alert">
              <strong>{message}</strong>
            </div>
          ) : null}

          <div className="passeport-colonnes">
            <div className="passeport-image">
              {apercu ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={apercu} alt={P.alternativeImage} />
              ) : (
                <div className="passeport-image-vide">{P.sansImage}</div>
              )}

              <label className="passeport-choisir">
                {P.choisirImage}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(evenement) => {
                    const fichier = evenement.target.files?.[0]
                    if (fichier) void importer(fichier)
                  }}
                />
              </label>
              <button className="passeport-demo" type="button" onClick={remplirDemonstration}>
                {P.remplirDemo}
              </button>
              <div className="passeport-aide">{P.noteImage}</div>
            </div>

            <div className="passeport-champs">
              <Champ label={P.prenom}>
                <Saisie valeur={brouillon.prenom} onChange={(v) => modifier({ prenom: v })} arabe />
              </Champ>
              <Champ label={P.nom}>
                <Saisie valeur={brouillon.nom} onChange={(v) => modifier({ nom: v })} arabe />
              </Champ>
              <Champ label={P.numero}>
                <Saisie valeur={brouillon.numero} onChange={(v) => modifier({ numero: v })} mono />
              </Champ>
              <Champ label={P.nationalite}>
                <Saisie
                  valeur={brouillon.nationalite}
                  onChange={(v) => modifier({ nationalite: v })}
                  arabe
                />
              </Champ>
              <Champ label={P.naissance}>
                <Saisie
                  valeur={brouillon.dateNaissance}
                  onChange={(v) => modifier({ dateNaissance: formaterDate(v) })}
                  mono
                  inputMode="numeric"
                />
              </Champ>
              <Champ label={P.lieuNaissance}>
                <Saisie
                  valeur={brouillon.lieuNaissance}
                  onChange={(v) => modifier({ lieuNaissance: v })}
                  arabe
                />
              </Champ>
              <Champ label={P.emission}>
                <Saisie
                  valeur={brouillon.dateEmission}
                  onChange={(v) => modifier({ dateEmission: formaterDate(v) })}
                  mono
                  inputMode="numeric"
                />
              </Champ>
              <Champ label={P.expiration}>
                <Saisie
                  valeur={brouillon.dateExpiration}
                  onChange={(v) => modifier({ dateExpiration: formaterDate(v) })}
                  mono
                  inputMode="numeric"
                />
              </Champ>
              <Champ label={P.paysEmission}>
                <Saisie
                  valeur={brouillon.paysEmission}
                  onChange={(v) => modifier({ paysEmission: v })}
                  arabe
                />
              </Champ>
              <Champ label={P.sexe}>
                <Saisie valeur={brouillon.sexe} onChange={(v) => modifier({ sexe: v })} mono />
              </Champ>
              <Champ label={P.mrz} pleine>
                <textarea
                  className="omra-input mono"
                  dir="ltr"
                  rows={3}
                  value={brouillon.mrz}
                  onChange={(evenement) => modifier({ mrz: evenement.target.value })}
                />
              </Champ>
            </div>
          </div>
        </div>

        <div className="passeport-pied">
          <button className="omra-btn" onClick={onFermer}>
            {P.annuler}
          </button>
          <button className="omra-btn primary" onClick={valider}>
            {P.utiliser}
          </button>
        </div>
      </div>
    </div>
  )
}
