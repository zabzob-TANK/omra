'use client'

/**
 * Reçu imprimable.
 *
 * Reproduit le document du fichier de référence : partie remise au client en
 * haut, souche conservée par l'agence en bas, sur un papier de 150,3 mm ×
 * 238,5 mm (mesuré au papier réel, voir recu.css).
 *
 * Couvre : R-78, R-79, R-80, R-82, R-83.
 *
 * Les libellés arabes sont ceux du fichier ; la barre d'outils est en français,
 * comme dans le fichier.
 */

import { useLayoutEffect, useRef, useState } from 'react'

import type { DonneesRecuImprimable } from './donnees'
import './recu.css'

/** Taille de base du nom, en mm — point de départ avant réduction éventuelle. */
const TAILLE_NOM_BASE_MM = 5.56

/**
 * Nom du client, réduit automatiquement s'il ne tient pas sur une ligne.
 *
 * `.recu-nom-client` n'a pas de hauteur fixe : un nom qui passerait à la
 * ligne déborderait par-dessus le bloc suivant (montants) au lieu de le
 * repousser, puisque ce conteneur est positionné en absolu. Décision du
 * commanditaire (2026-08-12) : réduire la taille plutôt que tronquer le nom.
 */
function NomClient({ texte }: { texte: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [tailleMm, setTailleMm] = useState(TAILLE_NOM_BASE_MM)

  useLayoutEffect(() => {
    const element = ref.current
    const conteneur = element?.parentElement
    if (!element || !conteneur) return
    // Repart de la taille de base avant de mesurer, pour ne jamais rester
    // bloqué sur une réduction calculée pour un nom précédent plus long.
    element.style.fontSize = `${TAILLE_NOM_BASE_MM}mm`
    const debordement = element.scrollWidth / conteneur.clientWidth
    setTailleMm(debordement > 1 ? TAILLE_NOM_BASE_MM / debordement : TAILLE_NOM_BASE_MM)
  }, [texte])

  return (
    <div ref={ref} className="valeur" style={{ fontSize: `${tailleMm}mm`, whiteSpace: 'nowrap' }}>
      {texte}
    </div>
  )
}

/** Libellés du document, relevés tels quels dans le fichier de référence. */
const L = {
  date: 'بتاريخ',
  nom: 'الاسم',
  numero: 'إيصال رقم',
  typeProgramme: 'نوع البرنامج',
  typeChambre: 'نوع الغرفة',
  montantConvenu: 'المبلغ المتفق عليه  :',
  montantPaye: 'المبلغ المدفوع     :',
  banque: 'البنك',
  dateInstrument: 'تاريخه',
  numeroCheque: 'رقم الشيك',
  natureDfp: 'نقد/شيك',
  datePaiement: 'بتاريخ',
  numeroDfp: 'الدفعة رقم',
  signature: 'توقيع',
  ligneNom: 'الاسم:',
  ligneConvenu: 'المبلغ المتفق عليه:',
  ligneePaye: 'المبلغ المدفوع:',
  accord: 'الاتفاق',
  receveur: 'المستلم',
  reduction: 'تخفيض',
  restant: 'الباقي',
  note: 'ملاحظة',
  telephone: 'رقم الهاتف',
} as const

export function RecuImprimable({
  donnees,
  cheminFond,
}: {
  donnees: DonneesRecuImprimable
  /** Papier à en-tête affiché en fond d'écran. Jamais imprimé. */
  cheminFond: string
}) {
  return (
    <section className="recu-page" aria-label="Aperçu du véritable papier de reçu">
      {/* R-82 — le papier à en-tête sert de référence à l'écran uniquement.
          Le fichier `fond-facture.png` n'ayant pas été fourni avec le prototype,
          son absence laisse simplement un papier blanc : le calage reste
          utilisable grâce aux repères et aux décalages. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt="Papier à en-tête Zemzem Asfar"
        className="recu-fond"
        src={cheminFond}
        onError={(evenement) => {
          evenement.currentTarget.style.visibility = 'hidden'
        }}
      />

      <div className="recu-calque">
        <div className="recu-contenu">
          {/* -------------------------------- Partie remise au client */}
          <section className="recu-haut" aria-label="Partie remise au client">
            <div className="recu-meta">
              <div className="recu-carte-date recu-rtl">
                <div className="etiquette">{L.date}</div>
                <div className="valeur recu-ltr">{donnees.date}</div>
              </div>
              <div className="recu-nom-client recu-rtl">
                <div className="etiquette">{L.nom}</div>
                <NomClient texte={donnees.nomComplet} />
              </div>
              <div className="recu-carte-numero recu-rtl">
                <div className="etiquette">{L.numero}</div>
                <div className="valeur recu-ltr">{donnees.numero}</div>
              </div>
            </div>

            <div className="recu-accord">
              <div className="recu-programme">
                <div className="petit">{donnees.programme}</div>
                <div>{L.typeProgramme}</div>
                <div className="recu-ltr">{donnees.chambre}</div>
                <div>{L.typeChambre}</div>
              </div>
              <div className="recu-montants recu-ltr">
                <div className="recu-montant-convenu">{donnees.montantConvenu}</div>
                <div>{donnees.montantPaye}</div>
              </div>
              <div className="recu-montants-etiquettes recu-rtl">
                <div>{L.montantConvenu}</div>
                <div>{L.montantPaye}</div>
              </div>
            </div>

            <table className="recu-paiements" aria-label="Historique des paiements">
              <colgroup>
                <col style={{ width: '15.16%' }} />
                <col style={{ width: '15.88%' }} />
                <col style={{ width: '16.61%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '17.33%' }} />
                <col style={{ width: '23.05%' }} />
                <col style={{ width: '3.97%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{L.banque}</th>
                  <th>{L.dateInstrument}</th>
                  <th>{L.numeroCheque}</th>
                  <th>{L.natureDfp}</th>
                  <th>{L.datePaiement}</th>
                  <th colSpan={2}>{L.numeroDfp}</th>
                </tr>
              </thead>
              <tbody>
                {donnees.lignes.map((ligne) => (
                  <tr
                    key={ligne.rang}
                    className={ligne.vide ? 'vide' : undefined}
                    aria-hidden={ligne.vide || undefined}
                  >
                    <td>{ligne.vide ? ' ' : ligne.banque}</td>
                    <td>{ligne.vide ? ' ' : ligne.dateInstrument}</td>
                    <td>{ligne.vide ? ' ' : ligne.numeroInstrument}</td>
                    <td>{ligne.vide ? ' ' : ligne.methode}</td>
                    <td className="recu-ltr">{ligne.vide ? ' ' : ligne.datePaiement}</td>
                    <td className="montant recu-ltr">{ligne.vide ? ' ' : ligne.montant}</td>
                    <td className="rang recu-ltr">{ligne.vide ? ' ' : ligne.rang}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="recu-bas">
              <div className="recu-signature recu-rtl">
                <span>{L.signature}</span>
              </div>
              <div className="recu-lignes-reglement recu-rtl">
                <div className="trait" />
                <div className="etiquette">{L.ligneNom}</div>
                <div className="trait" />
                <div className="etiquette">{L.ligneConvenu}</div>
                <div className="trait" />
                <div className="etiquette">{L.ligneePaye}</div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------ Souche agence */}
          <section className="recu-souche recu-rtl" aria-label="Souche conservée par l’agence">
            <table className="recu-souche-principale">
              <colgroup>
                <col style={{ width: '23mm' }} />
                <col style={{ width: '11.5mm' }} />
                <col style={{ width: '39mm' }} />
                <col style={{ width: '32mm' }} />
                <col style={{ width: '33mm' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{L.date}</th>
                  <th>{L.numero}</th>
                  <th>{L.montantPaye.replace('     :', '')}</th>
                  <th>{L.accord}</th>
                  <th>{L.receveur}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="date recu-ltr">{donnees.date}</td>
                  <td className="grand recu-ltr">{donnees.numero}</td>
                  <td className="grand recu-ltr">{donnees.montantPaye}</td>
                  <td className="grand recu-ltr">{donnees.montantConvenu}</td>
                  <td className="receveur recu-ltr">{donnees.receveur}</td>
                </tr>
              </tbody>
            </table>

            <table className="recu-souche-details">
              <colgroup>
                <col style={{ width: '28mm' }} />
                <col style={{ width: '13mm' }} />
                <col style={{ width: '19mm' }} />
                <col style={{ width: '20mm' }} />
                <col style={{ width: '58.5mm' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{L.typeProgramme}</th>
                  <th>{L.typeChambre}</th>
                  <th>{L.reduction}</th>
                  <th>{L.restant}</th>
                  <th>{L.note}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="programme">{donnees.programme}</td>
                  <td className="recu-ltr">{donnees.chambre}</td>
                  <td className="recu-ltr">{donnees.reduction}</td>
                  <td className="recu-ltr">{donnees.restant}</td>
                  <td>{donnees.note}</td>
                </tr>
              </tbody>
            </table>

            <table className="recu-souche-entete">
              <colgroup>
                <col style={{ width: '22mm' }} />
                <col style={{ width: '21mm' }} />
                <col style={{ width: '22mm' }} />
                <col style={{ width: '20mm' }} />
                <col style={{ width: '24mm' }} />
                <col style={{ width: '29.5mm' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{L.banque}</th>
                  <th>{L.dateInstrument}</th>
                  <th>{L.numeroCheque}</th>
                  <th>{L.natureDfp}</th>
                  <th>{L.datePaiement}</th>
                  <th>{L.numeroDfp}</th>
                </tr>
              </thead>
            </table>

            <table className="recu-souche-lignes">
              <colgroup>
                <col style={{ width: '22mm' }} />
                <col style={{ width: '21mm' }} />
                <col style={{ width: '22mm' }} />
                <col style={{ width: '20mm' }} />
                <col style={{ width: '24mm' }} />
                <col style={{ width: '29.5mm' }} />
              </colgroup>
              <tbody>
                {donnees.lignes.map((ligne) => (
                  <tr key={`souche-${ligne.rang}`}>
                    <td>{ligne.vide ? ' ' : ligne.banque}</td>
                    <td>{ligne.vide ? ' ' : ligne.dateInstrument}</td>
                    <td>{ligne.vide ? ' ' : ligne.numeroInstrument}</td>
                    <td className="methode">{ligne.vide ? ' ' : ligne.methode}</td>
                    <td className="recu-ltr">{ligne.vide ? ' ' : ligne.datePaiement}</td>
                    <td className="montant recu-ltr">{ligne.vide ? ' ' : ligne.montant}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="recu-souche-contact">
              <colgroup>
                <col style={{ width: '58mm' }} />
                <col style={{ width: '50mm' }} />
                <col style={{ width: '30.5mm' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td className="nom-valeur" rowSpan={2}>
                    {donnees.nom}
                  </td>
                  <td className="nom-valeur">{donnees.prenom}</td>
                  <td className="cellule-etiquette">{L.nom}</td>
                </tr>
                <tr>
                  <td className="telephone-valeur">{donnees.telephone}</td>
                  <td className="cellule-etiquette">{L.telephone}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>

      {/* R-83 — repères de calage, masqués par défaut. */}
      <div aria-hidden="true" className="recu-reperes" />
    </section>
  )
}
