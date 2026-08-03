import { describe, expect, it, vi } from 'vitest'

import { MAX_VERSEMENTS } from '../../domain/constants'
import { unRecu, unVersement } from '../../domain/rules/fixtures'
import {
  classesAtelier,
  impressionBloquee,
  libelleCopie,
  MESSAGE_IMPRESSION_BLOQUEE,
  MOTIF_REMPLISSAGE,
  preparerRecuImprimable,
  sequenceImpression,
  variablesDecalage,
} from './donnees'

describe('R-78 — informations des deux parties du reçu', () => {
  const recu = unRecu({
    numero: 262,
    prenom: 'سعيدة',
    nom: 'شقير',
    telephone: '0611-00.75.00',
    hotel: 'منار الشروق',
    chambre: '4',
    convenuCentimes: 2600000,
    reductionCentimes: 100000,
    note: 'ملاحظة',
    versements: [unVersement({ montantCentimes: 1000000, enregistrePar: 'سمير بنعلي' })],
  })

  it('reprend les identifiants et montants du reçu', () => {
    const donnees = preparerRecuImprimable(recu)
    expect(donnees.numero).toBe('262')
    expect(donnees.nomComplet).toBe('سعيدة شقير')
    expect(donnees.nom).toBe('شقير')
    expect(donnees.prenom).toBe('سعيدة')
    expect(donnees.telephone).toBe('0611-00.75.00')
    expect(donnees.programme).toBe('منار الشروق')
    expect(donnees.chambre).toBe('4')
  })

  it('affiche convenu, payé, réduction et restant', () => {
    const donnees = preparerRecuImprimable(recu)
    expect(donnees.montantConvenu).toContain('26 000')
    expect(donnees.montantPaye).toContain('10 000')
    expect(donnees.reduction).toContain('1 000')
    expect(donnees.restant).toContain('16 000')
  })

  it('désigne comme receveur l’employé du premier versement', () => {
    expect(preparerRecuImprimable(recu).receveur).toBe('سمير بنعلي')
  })

  it('retombe sur l’employé du reçu sans versement', () => {
    const sansVersement = unRecu({ versements: [], employe: 'عادل المريني' })
    expect(preparerRecuImprimable(sansVersement).receveur).toBe('عادل المريني')
  })

  it('remplace une note vide par une espace, comme la référence', () => {
    const sansNote = unRecu({ note: '' })
    expect(preparerRecuImprimable(sansNote).note).toBe(' ')
  })
})

describe('R-79 — toujours six lignes de paiement', () => {
  it('construit six lignes avec un seul versement', () => {
    const donnees = preparerRecuImprimable(unRecu())
    expect(donnees.lignes).toHaveLength(MAX_VERSEMENTS)
  })

  it('marque comme vides les lignes sans versement', () => {
    const donnees = preparerRecuImprimable(unRecu())
    expect(donnees.lignes[0].vide).toBe(false)
    expect(donnees.lignes.slice(1).every((ligne) => ligne.vide)).toBe(true)
  })

  it('numérote les lignes de 1 à 6', () => {
    const donnees = preparerRecuImprimable(unRecu())
    expect(donnees.lignes.map((ligne) => ligne.rang)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('n’affiche que les six premiers versements si le reçu en compte davantage', () => {
    const sept = unRecu({
      versements: Array.from({ length: 7 }, (_, i) =>
        unVersement({ id: `v-${i}`, rang: i + 1, montantCentimes: 100000 }),
      ),
    })
    const donnees = preparerRecuImprimable(sept)
    expect(donnees.lignes).toHaveLength(MAX_VERSEMENTS)
    expect(donnees.lignes.every((ligne) => !ligne.vide)).toBe(true)
  })
})

describe('R-80 — motif de remplissage des champs d’instrument absents', () => {
  it('remplace banque, date et numéro absents', () => {
    const especes = unRecu({
      versements: [unVersement({ nature: 'نقد', banque: '', dateInstrument: '', referenceInstrument: '' })],
    })
    const ligne = preparerRecuImprimable(especes).lignes[0]
    expect(ligne.banque).toBe(MOTIF_REMPLISSAGE)
    expect(ligne.dateInstrument).toBe(MOTIF_REMPLISSAGE)
    expect(ligne.numeroInstrument).toBe(MOTIF_REMPLISSAGE)
  })

  it('conserve les valeurs présentes', () => {
    const cheque = unRecu({
      versements: [
        unVersement({
          nature: 'شيك',
          banque: 'البنك الشعبي',
          dateInstrument: '02/07/2025',
          referenceInstrument: '4471182',
        }),
      ],
    })
    const ligne = preparerRecuImprimable(cheque).lignes[0]
    expect(ligne.banque).toBe('البنك الشعبي')
    expect(ligne.numeroInstrument).toBe('4471182')
    expect(ligne.methode).toBe('شيك')
  })

  it('normalise la nature affichée', () => {
    const virement = unRecu({ versements: [unVersement({ nature: 'Virement' })] })
    expect(preparerRecuImprimable(virement).lignes[0].methode).toBe('تحويل بنكي')
  })
})

describe('R-81 — dépassement au-delà de six paiements', () => {
  const sept = unRecu({
    versements: Array.from({ length: 7 }, (_, i) =>
      unVersement({ id: `v-${i}`, rang: i + 1, montantCentimes: 100000 }),
    ),
  })

  it('ne signale rien à six paiements ou moins', () => {
    const donnees = preparerRecuImprimable(unRecu())
    expect(donnees.depassement).toBe(false)
    expect(donnees.messageDepassement).toBe('')
    expect(impressionBloquee(donnees)).toBe(false)
  })

  it('signale le dépassement avec le compte réel', () => {
    const donnees = preparerRecuImprimable(sept)
    expect(donnees.depassement).toBe(true)
    expect(donnees.messageDepassement).toBe(
      'Anomalie : 7 paiements enregistrés. Maximum prévu : 6.',
    )
  })

  it('bloque l’impression, comme le fichier de référence', () => {
    // Règle du fichier absente de l'inventaire initial, reproduite telle quelle.
    expect(impressionBloquee(preparerRecuImprimable(sept))).toBe(true)
    expect(MESSAGE_IMPRESSION_BLOQUEE).toContain('L’impression est bloquée')
  })
})

describe('R-85 — original et copie', () => {
  it('n’affiche aucun libellé sur l’original', () => {
    expect(libelleCopie(unRecu({ impressions: 0 }), true)).toBe('')
  })

  it('affiche « نسخة » sur un reçu jamais imprimé, rouvert', () => {
    expect(libelleCopie(unRecu({ impressions: 0 }), false)).toBe('نسخة')
  })

  it('ajoute le numéro de la prochaine impression', () => {
    expect(libelleCopie(unRecu({ impressions: 2 }), false)).toBe('نسخة — طباعة رقم 3')
  })
})

describe('R-82 — papier à en-tête affichable ou masquable', () => {
  it('affiche le fond par défaut', () => {
    expect(classesAtelier({ sansFond: false, reperes: false })).toBe('recu-atelier')
  })

  it('masque le fond en mode « impression seule »', () => {
    expect(classesAtelier({ sansFond: true, reperes: false })).toContain('sans-fond')
  })
})

describe('R-83 — repères et calage', () => {
  it('affiche les repères sur demande', () => {
    expect(classesAtelier({ sansFond: false, reperes: true })).toContain('reperes')
  })

  it('combine fond masqué et repères', () => {
    expect(classesAtelier({ sansFond: true, reperes: true })).toBe(
      'recu-atelier sans-fond reperes',
    )
  })

  it('convertit les décalages en millimètres', () => {
    expect(variablesDecalage('1.5', '-2')).toEqual({
      '--offset-x': '1.5mm',
      '--offset-y': '-2mm',
    })
  })

  it('ramène une saisie vide ou invalide à zéro', () => {
    expect(variablesDecalage('', 'abc')).toEqual({
      '--offset-x': '0mm',
      '--offset-y': '0mm',
    })
  })

  it('borne les décalages à plus ou moins dix millimètres', () => {
    expect(variablesDecalage('99', '-99')).toEqual({
      '--offset-x': '10mm',
      '--offset-y': '-10mm',
    })
  })
})

describe('P18 — le compteur d’impression est écrit avant l’ouverture de la boîte système', () => {
  it('attend la fin de l’enregistrement avant d’imprimer', async () => {
    const ordre: string[] = []
    let resoudre: () => void = () => {}
    const enregistrer = () =>
      new Promise<void>((resolve) => {
        resoudre = () => {
          ordre.push('enregistrer')
          resolve()
        }
      })
    const imprimer = () => ordre.push('imprimer')

    const promesse = sequenceImpression(enregistrer, imprimer)

    // Tant que l'enregistrement n'est pas résolu, l'impression n'a pas eu lieu.
    expect(ordre).toEqual([])

    resoudre()
    await promesse

    expect(ordre).toEqual(['enregistrer', 'imprimer'])
  })

  it('n’imprime pas si l’enregistrement échoue', async () => {
    const imprimer = vi.fn()
    const enregistrer = () => Promise.reject(new Error('échec'))

    await expect(sequenceImpression(enregistrer, imprimer)).rejects.toThrow('échec')
    expect(imprimer).not.toHaveBeenCalled()
  })
})
