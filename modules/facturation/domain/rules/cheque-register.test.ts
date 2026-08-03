import { describe, expect, it } from 'vitest'

import type { ReferenceFichier } from '../types'
import { unRecu, uneOperation, unVersement } from './fixtures'
import {
  collecterOperationsBancaires,
  CONFIRMATION_SUPPRESSION_IMAGE,
  couleurRestant,
  dateDepuisTexte,
  filtrerOperations,
  FILTRES_REGISTRE_PAR_DEFAUT,
  heureDepuisTexte,
  libellesInstrument,
  MESSAGES_IMAGE,
  migrationsImagesPartagees,
  montantGlobalCentimes,
  peutRecevoirUneImage,
  peutSupprimerImage,
  refusOuvertureImage,
  restantNul,
} from './cheque-register'

const IMAGE: ReferenceFichier = {
  chemin: 'demo/1',
  nomOrigine: 'cheque.svg',
  origine: 'demo',
  deposeLe: '01/08/2026 10:00',
  deposePar: 'المدير',
}

/** Deux reçus se partageant un virement de 50 000, plus un chèque unique. */
function jeu() {
  const operation = uneOperation({
    id: 'SOP-1',
    nature: 'تحويل بنكي',
    reference: 'VIR-2026-0455',
    banque: 'التجاري وفا بنك',
    payeur: 'عبد الله العثماني',
    montantTotalCentimes: 5000000,
    creeeLe: '31/07/2026 14:05',
    creeePar: 'سمير بنعلي',
  })

  const partage = (recuId: string, versementId: string, numero: number) =>
    unRecu({
      id: recuId,
      numero,
      prenom: 'فاطمة',
      nom: 'بنعاشي',
      versements: [
        unVersement({
          id: versementId,
          nature: 'تحويل بنكي',
          montantCentimes: 2500000,
          date: '31/07/2026',
          heure: '14:05',
          dateHeure: '31/07/2026 14:05',
          portee: 'shared',
          operationPartageeId: operation.id,
          montantOperationCentimes: 5000000,
          referenceInstrument: operation.reference,
          banque: operation.banque,
          dateInstrument: '31/07/2026',
        }),
      ],
    })

  const unique = unRecu({
    id: 'r-cheque',
    numero: 263,
    prenom: 'خديجة',
    nom: 'فهمي',
    versements: [
      unVersement({
        id: 'v-cheque',
        nature: 'شيك',
        montantCentimes: 2000000,
        date: '30/07/2026',
        heure: '10:02',
        dateHeure: '30/07/2026 10:02',
        referenceInstrument: '4471182',
        banque: 'البنك الشعبي',
        dateInstrument: '30/07/2026',
      }),
    ],
  })

  return {
    operation,
    recus: [partage('r-a', 'v-a', 264), partage('r-b', 'v-b', 265), unique],
  }
}

describe('R-73 — regroupement par opération', () => {
  it('rassemble les versements partagés sous une seule opération', () => {
    const { operation, recus } = jeu()
    const operations = collecterOperationsBancaires(recus, [operation])
    expect(operations).toHaveLength(2)

    const partagee = operations.find((x) => x.partagee)!
    expect(partagee.cle).toBe('shared:SOP-1')
    expect(partagee.type).toBe('Partagé')
    expect(partagee.attributions).toHaveLength(2)
    expect(partagee.recus).toEqual(['264', '265'])
  })

  it('un instrument unique forme sa propre opération', () => {
    const { operation, recus } = jeu()
    const unique = collecterOperationsBancaires(recus, [operation]).find((x) => !x.partagee)!
    expect(unique.cle).toBe('payment:v-cheque')
    expect(unique.type).toBe('Unique')
    expect(unique.attributions).toHaveLength(1)
  })

  it('ignore les espèces', () => {
    const especes = unRecu({ versements: [unVersement({ nature: 'نقد' })] })
    expect(collecterOperationsBancaires([especes], [])).toHaveLength(0)
  })
})

describe('R-75 — date et heure d’enregistrement', () => {
  it('extrait la date et l’heure d’un texte libre', () => {
    expect(dateDepuisTexte('31/07/2026 14:05', '—')).toBe('31/07/2026')
    expect(dateDepuisTexte('2026-07-31', '—')).toBe('31/07/2026')
    expect(dateDepuisTexte('', '01/01/2026')).toBe('01/01/2026')
    expect(heureDepuisTexte('31/07/2026 14:05', '00:00')).toBe('14:05')
    expect(heureDepuisTexte('sans heure', '09:30')).toBe('09:30')
  })

  it('une opération partagée porte la date de création de l’opération', () => {
    const { operation, recus } = jeu()
    const partagee = collecterOperationsBancaires(recus, [operation]).find((x) => x.partagee)!
    expect(partagee.dateEnregistrement).toBe('31/07/2026')
  })

  it('trie de la plus récente à la plus ancienne, heure comprise', () => {
    const { operation, recus } = jeu()
    const operations = collecterOperationsBancaires(recus, [operation])
    expect(operations.map((x) => x.dateEnregistrement)).toEqual(['31/07/2026', '30/07/2026'])
  })
})

describe('R-77 — attribué et restant', () => {
  it('calcule l’attribué et le restant par opération', () => {
    const { operation, recus } = jeu()
    const partagee = collecterOperationsBancaires(recus, [operation]).find((x) => x.partagee)!
    expect(partagee.montantCentimes).toBe(5000000)
    expect(partagee.attribueCentimes).toBe(5000000)
    expect(partagee.restantCentimes).toBe(0)
  })

  it('un restant nul s’affiche « — » et non « 0 »', () => {
    expect(restantNul(0)).toBe(true)
    expect(restantNul(1)).toBe(false)
    expect(restantNul(-100)).toBe(false)
  })

  it('colore le restant : rouge si négatif, bleu si nul, vert sinon', () => {
    expect(couleurRestant(-100)).toBe('var(--danger)')
    expect(couleurRestant(0)).toBe('var(--solde)')
    expect(couleurRestant(100000)).toBe('var(--accent)')
  })

  it('additionne le montant global des opérations affichées', () => {
    const { operation, recus } = jeu()
    const operations = collecterOperationsBancaires(recus, [operation])
    expect(montantGlobalCentimes(operations)).toBe(7000000)
  })
})

describe('R-74 — filtres du registre', () => {
  const { operation, recus } = jeu()
  const toutes = collecterOperationsBancaires(recus, [operation])

  it('filtre par journée d’enregistrement', () => {
    expect(
      filtrerOperations(toutes, { ...FILTRES_REGISTRE_PAR_DEFAUT, date: '2026-07-30' }),
    ).toHaveLength(1)
  })

  it('filtre par mode', () => {
    expect(filtrerOperations(toutes, { ...FILTRES_REGISTRE_PAR_DEFAUT, mode: 'cheque' })).toHaveLength(1)
    expect(
      filtrerOperations(toutes, { ...FILTRES_REGISTRE_PAR_DEFAUT, mode: 'transfer' }),
    ).toHaveLength(1)
  })

  it('filtre par type', () => {
    expect(filtrerOperations(toutes, { ...FILTRES_REGISTRE_PAR_DEFAUT, type: 'shared' })).toHaveLength(1)
    expect(filtrerOperations(toutes, { ...FILTRES_REGISTRE_PAR_DEFAUT, type: 'unique' })).toHaveLength(1)
  })

  it('recherche sur le numéro, la banque, le payeur, les clients et les reçus', () => {
    const cherche = (texte: string) =>
      filtrerOperations(toutes, { ...FILTRES_REGISTRE_PAR_DEFAUT, recherche: texte })
    expect(cherche('4471182')).toHaveLength(1)
    expect(cherche('265')).toHaveLength(1)
    expect(cherche('عبد الله')).toHaveLength(1)
    expect(cherche('Virement')).toHaveLength(1)
    expect(cherche('introuvable')).toHaveLength(0)
  })

  it('filtre par présence d’image', () => {
    const avecImage = toutes.map((x, index) => (index === 0 ? { ...x, image: IMAGE } : x))
    expect(
      filtrerOperations(avecImage, { ...FILTRES_REGISTRE_PAR_DEFAUT, image: 'with' }),
    ).toHaveLength(1)
    expect(
      filtrerOperations(avecImage, { ...FILTRES_REGISTRE_PAR_DEFAUT, image: 'without' }),
    ).toHaveLength(1)
  })
})

describe('R-35, R-36 — une seule image active', () => {
  const { operation, recus } = jeu()
  const toutes = collecterOperationsBancaires(recus, [operation])

  it('une opération sans image peut en recevoir une', () => {
    expect(peutRecevoirUneImage(toutes[0])).toBe(true)
    expect(peutRecevoirUneImage({ ...toutes[0], image: IMAGE })).toBe(false)
  })

  it('R-36 — une deuxième image est refusée, avec le message du fichier', () => {
    expect(refusOuvertureImage({ imageExistante: IMAGE })).toBe('image-deja-presente')
    expect(MESSAGES_IMAGE['image-deja-presente']).toBe(
      'Une image est déjà associée à cette opération. Une deuxième image est impossible.',
    )
  })

  it('R-37 — depuis un formulaire, une opération déjà enregistrée renvoie au registre', () => {
    expect(
      refusOuvertureImage({ imageExistante: null, operationPartageeExistante: true }),
    ).toBe('operation-deja-enregistree')
  })

  it('rien ne s’oppose à l’ajout quand l’opération est vierge', () => {
    expect(refusOuvertureImage({ imageExistante: null })).toBeNull()
  })
})

describe('R-38 — l’image d’un partage appartient à l’opération', () => {
  it('l’image vient de l’opération, jamais du versement', () => {
    const { operation, recus } = jeu()
    const avecImage = { ...operation, image: IMAGE }
    const partagee = collecterOperationsBancaires(recus, [avecImage]).find((x) => x.partagee)!
    expect(partagee.image).toEqual(IMAGE)
    // Une seule image pour les deux reçus : elle n'est pas dupliquée.
    expect(partagee.attributions).toHaveLength(2)
  })
})

describe('R-39, R-40 — suppression réservée à l’administrateur', () => {
  const { operation, recus } = jeu()
  const avec = collecterOperationsBancaires(recus, [{ ...operation, image: IMAGE }]).find(
    (x) => x.partagee,
  )!

  it('un employé ne peut pas supprimer', () => {
    expect(peutSupprimerImage(avec, false)).toBe(false)
    expect(MESSAGES_IMAGE['suppression-reservee-administrateur']).toBe(
      'Seul l’administrateur peut supprimer l’image.',
    )
  })

  it('l’administrateur le peut, avec confirmation', () => {
    expect(peutSupprimerImage(avec, true)).toBe(true)
    expect(CONFIRMATION_SUPPRESSION_IMAGE).toContain('Supprimer l’image associée à cette opération ?')
  })

  it('une opération sans image n’offre pas la suppression', () => {
    expect(peutSupprimerImage({ ...avec, image: null }, true)).toBe(false)
  })

  it('R-40 — un nouvel ajout redevient possible après suppression', () => {
    expect(peutRecevoirUneImage({ ...avec, image: null })).toBe(true)
  })
})

describe('R-76 — libellés selon l’instrument', () => {
  it('distingue chèque et virement, mot pour mot', () => {
    const cheque = libellesInstrument('شيك')
    expect(cheque.titreAjout).toBe('Ajouter l’image du chèque')
    expect(cheque.libelleReference).toBe('N° du chèque')
    expect(cheque.entete('4471182')).toBe('Chèque n° 4471182')

    const virement = libellesInstrument('تحويل بنكي')
    expect(virement.titreAjout).toBe('Ajouter le justificatif du virement')
    expect(virement.libelleDate).toBe('Date du virement')
    expect(virement.entete('VIR-1')).toBe('Virement — référence VIR-1')
  })

  it('la répartition conserve la situation de chaque reçu', () => {
    const { operation, recus } = jeu()
    const annule = recus.map((r) => (r.id === 'r-b' ? { ...r, statut: 'ملغى' as const } : r))
    const partagee = collecterOperationsBancaires(annule, [operation]).find((x) => x.partagee)!
    expect(partagee.attributions.map((a) => a.annule)).toEqual([false, true])
  })
})

describe('R-42 — migration des images de versements partagés', () => {
  it('remonte vers l’opération l’image portée par un versement partagé', () => {
    const { operation, recus } = jeu()
    const avecImage = recus.map((r) =>
      r.id === 'r-a'
        ? { ...r, versements: [{ ...r.versements[0], image: IMAGE }] }
        : r,
    )
    const migrations = migrationsImagesPartagees(avecImage, [operation])
    expect(migrations).toHaveLength(1)
    expect(migrations[0]).toMatchObject({
      operationId: 'SOP-1',
      recuId: 'r-a',
      versementId: 'v-a',
      image: IMAGE,
    })
  })

  it('ne touche pas une opération qui porte déjà son image', () => {
    const { operation, recus } = jeu()
    const avecImage = recus.map((r) =>
      r.id === 'r-a' ? { ...r, versements: [{ ...r.versements[0], image: IMAGE }] } : r,
    )
    expect(migrationsImagesPartagees(avecImage, [{ ...operation, image: IMAGE }])).toHaveLength(0)
  })

  it('ne remonte qu’une seule image par opération', () => {
    const { operation, recus } = jeu()
    const avecImages = recus.map((r) =>
      r.id === 'r-a' || r.id === 'r-b'
        ? { ...r, versements: [{ ...r.versements[0], image: IMAGE }] }
        : r,
    )
    expect(migrationsImagesPartagees(avecImages, [operation])).toHaveLength(1)
  })

  it('laisse l’image d’un instrument unique là où elle est', () => {
    const { operation, recus } = jeu()
    const avecImage = recus.map((r) =>
      r.id === 'r-cheque' ? { ...r, versements: [{ ...r.versements[0], image: IMAGE }] } : r,
    )
    expect(migrationsImagesPartagees(avecImage, [operation])).toHaveLength(0)
  })
})
