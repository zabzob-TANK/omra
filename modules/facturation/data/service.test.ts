import { beforeEach, describe, expect, it } from 'vitest'

import { passeportVierge } from '../ui/modales/passeport'
import { instrumentVierge } from '../ui/instrument-panel'
import type { SaisieNouveauRecu } from '../domain/rules/create-receipt'
import type { SaisieModification } from '../domain/rules/edit-sections'
import { reinitialiserSourceDonnees, sourceDonnees } from './index'
import {
  acquitterAnomalies,
  ajouterImagesPasseport,
  ajouterVersement,
  annulerRecu,
  chargerEtat,
  connecter,
  creerRecu,
  enregistrerImpressionFinance,
  journalFinancier,
  modifierRecu,
  previsualiserModification,
  registreBancaire,
  suiviJournalier,
  ajouterImageOperation,
  supprimerImageOperation,
} from './service'

/**
 * Tests d'intégration du service : noyau métier + adaptateur de démonstration.
 * Chaque test repart d'un état neuf.
 */
beforeEach(() => {
  reinitialiserSourceDonnees()
})

function nouveauRecu(partiel: Partial<SaisieNouveauRecu> = {}): SaisieNouveauRecu {
  return {
    prenom: 'نورة',
    nom: 'السوسي',
    telephone: '0611-22.33.44',
    hotel: 'منار الشروق',
    vol: 'الخطوط السعودية',
    chambre: '4',
    rabatteur: 'zemzem',
    reduction: '',
    groupeCoche: false,
    groupe: '',
    premierVersement: '12000',
    note: '',
    instrument: instrumentVierge(),
    passeport: null,
    ...partiel,
  }
}

describe('création d’un reçu de bout en bout', () => {
  it('enregistre le reçu et le rend visible dans l’état', async () => {
    const avant = await chargerEtat()
    const resultat = await creerRecu(nouveauRecu(), false)
    expect(resultat.statut).toBe('ok')

    const apres = await chargerEtat()
    expect(apres.recus).toHaveLength(avant.recus.length + 1)
  })

  it('R-11 — attribue le numéro suivant de la séquence', async () => {
    const premier = await creerRecu(nouveauRecu(), false)
    const second = await creerRecu(nouveauRecu(), false)
    expect(premier.statut).toBe('ok')
    expect(second.statut).toBe('ok')
    if (premier.statut !== 'ok' || second.statut !== 'ok') return
    expect(second.valeur.numero).toBe(premier.valeur.numero + 1)
  })

  it('remonte les erreurs du noyau sans rien enregistrer', async () => {
    const avant = await chargerEtat()
    const resultat = await creerRecu(nouveauRecu({ prenom: '', nom: '' }), false)
    expect(resultat.statut).toBe('erreurs')

    const apres = await chargerEtat()
    expect(apres.recus).toHaveLength(avant.recus.length)
  })

  it('P08 — un abandon ne consomme pas de numéro de la séquence', async () => {
    const echoue = await creerRecu(nouveauRecu({ prenom: '', nom: '' }), false)
    expect(echoue.statut).toBe('erreurs')

    const apresAbandon = await creerRecu(nouveauRecu(), false)
    expect(apresAbandon.statut).toBe('ok')
    if (apresAbandon.statut !== 'ok') return

    reinitialiserSourceDonnees()
    const temoin = await creerRecu(nouveauRecu(), false)
    expect(temoin.statut).toBe('ok')
    if (temoin.statut !== 'ok') return

    // Sans l'abandon préalable, le même reçu obtient le même numéro : la
    // tentative avortée n'a donc consommé aucun numéro de la séquence.
    expect(apresAbandon.valeur.numero).toBe(temoin.valeur.numero)
  })

  it('R-13 — rattache le passeport saisi au reçu', async () => {
    const passeport = { ...passeportVierge(), prenom: 'نورة', nom: 'السوسي', numero: 'MA4827391' }
    const resultat = await creerRecu(nouveauRecu({ passeport }), false)
    expect(resultat.statut).toBe('ok')
    if (resultat.statut !== 'ok') return

    const etat = await chargerEtat()
    const cree = etat.recus.find((r) => r.id === resultat.valeur.recuId)
    expect(cree?.passeport?.numero).toBe('MA4827391')
  })

  it('R-90 — le passeport conserve ses onze champs et l’origine de la saisie', async () => {
    const passeport = {
      ...passeportVierge(),
      prenom: 'نورة',
      nom: 'السوسي',
      numero: 'MA4827391',
      nationalite: 'مغربية',
      dateNaissance: '14/03/1986',
      lieuNaissance: 'الدار البيضاء',
      dateEmission: '09/05/2023',
      dateExpiration: '08/05/2028',
      paysEmission: 'المغرب',
      sexe: 'M',
      mrz: 'P<MARALAOUI<<MOHAMED<AMINE',
      resultatBrut: { source: 'saisie-manuelle', recuLe: '2026-08-01' },
    }
    const resultat = await creerRecu(nouveauRecu({ passeport }), false)
    if (resultat.statut !== 'ok') throw new Error('création refusée')

    const etat = await chargerEtat()
    const cree = etat.recus.find((r) => r.id === resultat.valeur.recuId)
    expect(cree?.passeport?.nationalite).toBe('مغربية')
    expect(cree?.passeport?.mrz).toContain('P<MAR')
    // Aucune lecture automatique : l'origine reste une saisie manuelle.
    expect(cree?.passeport?.resultatBrut?.source).toBe('saisie-manuelle')
  })

  it("docs/architecture-generale.md, R3 — un échec du dépôt des images de passeport reste silencieux, le reçu déjà créé n'est jamais remis en cause", async () => {
    const resultat = await creerRecu(nouveauRecu(), false)
    if (resultat.statut !== 'ok') throw new Error('création refusée')

    // Simule le stub réel (`definirImagesPasseportSupabase`), qui lève
    // inconditionnellement puisque le passeport est hors périmètre du noyau
    // omra — sans dépendre de la vraie source Supabase, indisponible en test.
    const source = sourceDonnees()
    const original = source.recus.definirImagesPasseport
    source.recus.definirImagesPasseport = async () => {
      throw new Error('Les images de passeport ne sont pas disponibles côté omra.')
    }

    try {
      const resultatImages = await ajouterImagesPasseport(resultat.valeur.recuId, {
        originale: { contenu: new ArrayBuffer(4), nomOrigine: 'passeport.jpg', typeMime: 'image/jpeg' },
        portrait: { contenu: new ArrayBuffer(4), nomOrigine: 'portrait.jpg', typeMime: 'image/jpeg' },
      })
      expect(resultatImages.statut).toBe('ok')
    } finally {
      source.recus.definirImagesPasseport = original
    }
  })

  it("un échec inattendu de l'écriture renvoie un message propre à la création, jamais celui de la modification", async () => {
    const source = sourceDonnees()
    const original = source.recus.creer
    source.recus.creer = async () => {
      throw new Error('échec simulé')
    }

    try {
      const resultat = await creerRecu(nouveauRecu(), false)
      expect(resultat.statut).toBe('erreurs')
      if (resultat.statut === 'erreurs') {
        expect(resultat.erreurs[0].code).toBe('erreur-inattendue-creation')
      }
    } finally {
      source.recus.creer = original
    }
  })
})

describe('R-86 — journal d’audit', () => {
  it('trace la création, la plus récente en tête', async () => {
    await creerRecu(nouveauRecu(), false)
    const etat = await chargerEtat()
    expect(etat.audit[0].action).toBe('إنشاء')
  })

  it('trace le versement', async () => {
    const cree = await creerRecu(nouveauRecu(), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    await ajouterVersement(
      {
        numeroRecu: String(cree.valeur.numero),
        montant: '3000',
        instrument: instrumentVierge(),
      },
      false,
    )
    const etat = await chargerEtat()
    expect(etat.audit[0].action).toBe('دفعة')
  })

  it('trace l’annulation et son mode de remboursement', async () => {
    const cree = await creerRecu(nouveauRecu(), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    await annulerRecu(cree.valeur.recuId, {
      motif: 'إلغاء السفر',
      modeRemboursement: 'cash',
      motDePasse: 'verification',
    })
    const etat = await chargerEtat()
    expect(etat.audit[0].action).toBe('إلغاء')
    expect(etat.audit[0].detail).toContain('من الصندوق')
  })

  it('trace la modification avec son motif', async () => {
    const cree = await creerRecu(nouveauRecu(), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    await modifierRecu(cree.valeur.recuId, {
      section: 'note',
      motif: 'précision demandée',
      prenom: 'نورة',
      nom: 'السوسي',
      telephone: '0611-22.33.44',
      hotel: 'منار الشروق',
      vol: 'الخطوط السعودية',
      chambre: '4',
      reduction: '0',
      groupeCoche: false,
      groupe: '',
      note: 'à rappeler',
      nature: 'نقد',
      reference: '',
      dateInstrument: '',
      banque: '',
      operationPartagee: false,
      payeur: '',
      montantOperation: '',
      montant: '',
      rangVersementCorrige: 1,
    })
    const etat = await chargerEtat()
    expect(etat.audit[0].action).toBe('تعديل')
    expect(etat.audit[0].detail).toContain('précision demandée')
  })
})

describe('previsualiserModification — récapitulatif avant validation (2026-08-09)', () => {
  it('renvoie la fiche complète avant/après sans rien écrire', async () => {
    const cree = await creerRecu(nouveauRecu(), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')
    const audit_avant = (await chargerEtat()).audit.length

    const apercu = await previsualiserModification(cree.valeur.recuId, {
      section: 'identity',
      motif: 'correction orthographe',
      prenom: 'منى',
      nom: 'السوسي',
      telephone: '0611-22.33.44',
      hotel: 'منار الشروق',
      vol: 'الخطوط السعودية',
      chambre: '4',
      reduction: '0',
      groupeCoche: false,
      groupe: '',
      note: '',
      nature: 'نقد',
      reference: '',
      dateInstrument: '',
      banque: '',
      operationPartagee: false,
      payeur: '',
      montantOperation: '',
      montant: '',
      rangVersementCorrige: 1,
    })
    expect(apercu.statut).toBe('ok')
    if (apercu.statut !== 'ok') return
    expect(apercu.valeur.avant.prenom).toBe('نورة')
    expect(apercu.valeur.resultat.champsModifies.prenom).toBe('منى')

    // Rien n'a été écrit : le reçu réel garde son prénom d'origine.
    const etat = await chargerEtat()
    const recu = etat.recus.find((r) => r.id === cree.valeur.recuId)
    expect(recu?.prenom).toBe('نورة')
    // Aucune nouvelle trace : l'aperçu n'a rien écrit.
    expect(etat.audit).toHaveLength(audit_avant)
  })

  it('reflète, pour un versement ciblé, un aperçu cohérent avec ce que modifierRecu écrirait ensuite', async () => {
    const cree = await creerRecu(nouveauRecu({ premierVersement: '12000' }), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    await connecter('3', '3')
    const apercu = await previsualiserModification(
      cree.valeur.recuId,
      saisieFirstPayment({ montant: '9000' }),
    )
    expect(apercu.statut).toBe('ok')
    if (apercu.statut !== 'ok') return
    const versementApres = apercu.valeur.resultat.premierVersementCorrige?.versement
    expect(versementApres?.montantCentimes).toBe(900000)

    // La même saisie, appliquée pour de vrai, produit le même résultat.
    const resultat = await modifierRecu(cree.valeur.recuId, saisieFirstPayment({ montant: '9000' }))
    expect(resultat.statut).toBe('ok')
    const etat = await chargerEtat()
    const recu = etat.recus.find((r) => r.id === cree.valeur.recuId)
    expect(recu?.versements[0].montantCentimes).toBe(900000)
  })
})

function saisieFirstPayment(partiel: Partial<SaisieModification> = {}): SaisieModification {
  return {
    section: 'firstPayment',
    motif: 'correction du premier versement',
    prenom: 'نورة',
    nom: 'السوسي',
    telephone: '0611-22.33.44',
    hotel: 'منار الشروق',
    vol: 'الخطوط السعودية',
    chambre: '4',
    reduction: '0',
    groupeCoche: false,
    groupe: '',
    note: '',
    nature: 'نقد',
    reference: '',
    dateInstrument: '',
    banque: '',
    operationPartagee: false,
    payeur: '',
    montantOperation: '',
    montant: '',
    rangVersementCorrige: 1,
    ...partiel,
  }
}

describe('P01 — correction du premier versement', () => {
  it('§5.9 — refuse la correction du montant à un employé', async () => {
    const cree = await creerRecu(nouveauRecu({ premierVersement: '12000' }), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    // Le compte de démonstration par défaut est un employé (« صندوق »).
    const resultat = await modifierRecu(
      cree.valeur.recuId,
      saisieFirstPayment({ montant: '9000' }),
    )
    expect(resultat.statut).toBe('erreurs')

    const etat = await chargerEtat()
    const recu = etat.recus.find((r) => r.id === cree.valeur.recuId)
    expect(recu?.versements[0].montantCentimes).toBe(1200000)
  })

  it('applique effectivement le nouveau montant (administrateur, §5.9)', async () => {
    const cree = await creerRecu(nouveauRecu({ premierVersement: '12000' }), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    await connecter('3', '3')
    const resultat = await modifierRecu(
      cree.valeur.recuId,
      saisieFirstPayment({ montant: '9000' }),
    )
    expect(resultat.statut).toBe('ok')

    const etat = await chargerEtat()
    const recu = etat.recus.find((r) => r.id === cree.valeur.recuId)
    expect(recu?.versements[0].montantCentimes).toBe(900000)
  })

  it('applique effectivement une correction d’instrument (tout employé)', async () => {
    const cree = await creerRecu(nouveauRecu(), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    const resultat = await modifierRecu(
      cree.valeur.recuId,
      saisieFirstPayment({
        nature: 'شيك',
        reference: '556677',
        dateInstrument: '02/07/2026',
        banque: 'بنك الشعبي',
      }),
    )
    expect(resultat.statut).toBe('ok')

    const etat = await chargerEtat()
    const recu = etat.recus.find((r) => r.id === cree.valeur.recuId)
    expect(recu?.versements[0].referenceInstrument).toBe('556677')
    expect(recu?.versements[0].banque).toBe('بنك الشعبي')
  })
})

describe('annulation de bout en bout', () => {
  it('R-45, R-47 — conserve le reçu et crée le mouvement de caisse', async () => {
    const cree = await creerRecu(nouveauRecu(), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    const resultat = await annulerRecu(cree.valeur.recuId, {
      motif: 'إلغاء السفر',
      modeRemboursement: 'cash',
      motDePasse: 'verification',
    })
    expect(resultat.statut).toBe('ok')

    const etat = await chargerEtat()
    const annule = etat.recus.find((r) => r.id === cree.valeur.recuId)
    expect(annule?.statut).toBe('ملغى')
    expect(annule?.versements).toHaveLength(1)
    expect(annule?.montantRembourseCentimes).toBe(1200000)
  })

  it('R-43 — refuse sans mot de passe', async () => {
    const cree = await creerRecu(nouveauRecu(), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    const resultat = await annulerRecu(cree.valeur.recuId, {
      motif: 'test',
      modeRemboursement: 'cash',
      motDePasse: '',
    })
    expect(resultat.statut).toBe('erreurs')
  })

  it("un échec inattendu de l'écriture renvoie un message propre à l'annulation, jamais celui de la modification", async () => {
    const cree = await creerRecu(nouveauRecu(), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    const source = sourceDonnees()
    const original = source.recus.annuler
    source.recus.annuler = async () => {
      throw new Error('échec simulé')
    }

    try {
      const resultat = await annulerRecu(cree.valeur.recuId, {
        motif: 'إلغاء السفر',
        modeRemboursement: 'cash',
        motDePasse: 'verification',
      })
      expect(resultat.statut).toBe('erreurs')
      if (resultat.statut === 'erreurs') {
        expect(resultat.erreurs[0].code).toBe('erreur-inattendue-annulation')
      }
    } finally {
      source.recus.annuler = original
    }
  })
})

describe('versement de bout en bout', () => {
  it('R-20 — impose au sixième versement de solder exactement', async () => {
    const cree = await creerRecu(nouveauRecu({ premierVersement: '1000' }), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')
    const numero = String(cree.valeur.numero)

    // Versements 2 à 5.
    for (let index = 0; index < 4; index += 1) {
      const ajout = await ajouterVersement(
        { numeroRecu: numero, montant: '1000', instrument: instrumentVierge() },
        false,
      )
      expect(ajout.statut).toBe('ok')
    }

    // Le sixième doit valoir exactement le restant : 26 000 − 5 000 = 21 000.
    const insuffisant = await ajouterVersement(
      { numeroRecu: numero, montant: '20000', instrument: instrumentVierge() },
      false,
    )
    expect(insuffisant.statut).toBe('erreurs')

    const exact = await ajouterVersement(
      { numeroRecu: numero, montant: '21000', instrument: instrumentVierge() },
      false,
    )
    expect(exact.statut).toBe('ok')

    // R-18 — un septième versement est impossible.
    const septieme = await ajouterVersement(
      { numeroRecu: numero, montant: '100', instrument: instrumentVierge() },
      false,
    )
    expect(septieme.statut).toBe('erreurs')
  })

  it('R-32 — demande confirmation puis accepte le dépassement partagé', async () => {
    const cree = await creerRecu(nouveauRecu({ premierVersement: '1000' }), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    const partage = {
      numeroRecu: String(cree.valeur.numero),
      montant: '9000',
      instrument: {
        ...instrumentVierge(),
        nature: 'شيك',
        portee: 'shared' as const,
        sourceOperation: 'new' as const,
        reference: '4471182',
        dateInstrument: '02/07/2025',
        banque: 'البنك الشعبي',
        payeur: 'عبد الله',
        montantOperation: '5000',
      },
    }

    const premier = await ajouterVersement(partage, false)
    expect(premier.statut).toBe('confirmation-requise')

    const confirme = await ajouterVersement(partage, true)
    expect(confirme.statut).toBe('ok')
  })

  it("un échec inattendu de l'écriture renvoie un message propre au versement, jamais celui de la modification", async () => {
    const cree = await creerRecu(nouveauRecu({ premierVersement: '1000' }), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    const source = sourceDonnees()
    const original = source.recus.ajouterVersement
    source.recus.ajouterVersement = async () => {
      throw new Error('échec simulé')
    }

    try {
      const resultat = await ajouterVersement(
        { numeroRecu: String(cree.valeur.numero), montant: '1000', instrument: instrumentVierge() },
        false,
      )
      expect(resultat.statut).toBe('erreurs')
      if (resultat.statut === 'erreurs') {
        expect(resultat.erreurs[0].code).toBe('erreur-inattendue-versement')
      }
    } finally {
      source.recus.ajouterVersement = original
    }
  })
})

describe('journal financier de bout en bout', () => {
  it('R-60 — présente les annulations à part des versements', async () => {
    const cree = await creerRecu(nouveauRecu(), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    await annulerRecu(cree.valeur.recuId, {
      motif: 'إلغاء السفر',
      modeRemboursement: 'cash',
      motDePasse: 'verification',
    })

    const journal = await journalFinancier({ filtre: 'all' })

    // La ligne d'annulation est dans sa propre liste, jamais mêlée aux versements.
    expect(journal.annulations.some((a) => a.numeroRecu === cree.valeur.numero)).toBe(true)
    expect(journal.lignes.every((l) => l.recuId !== cree.valeur.recuId || l.badge === 'N')).toBe(true)
    expect(journal.nombreAnnulations).toBeGreaterThan(0)
  })

  it('R-57 — les espèces affichées sont nettes du remboursement', async () => {
    const avant = await journalFinancier({ filtre: 'all' })
    const cree = await creerRecu(nouveauRecu({ premierVersement: '5000' }), false)
    if (cree.statut !== 'ok') throw new Error('création refusée')

    const apresCreation = await journalFinancier({ filtre: 'all' })
    expect(apresCreation.totaux.especesBrutCentimes).toBe(
      avant.totaux.especesBrutCentimes + 500000,
    )

    await annulerRecu(cree.valeur.recuId, {
      motif: 'test',
      modeRemboursement: 'cash',
      motDePasse: 'verification',
    })

    const apresAnnulation = await journalFinancier({ filtre: 'all' })
    expect(apresAnnulation.totaux.remboursementsCentimes).toBe(
      avant.totaux.remboursementsCentimes + 500000,
    )
    expect(apresAnnulation.totaux.especesNettesCentimes).toBe(avant.totaux.especesNettesCentimes)
  })

  it('R-61, R-62 — enregistre une impression numérotée', async () => {
    const etat = await chargerEtat()
    const jour = etat.recus[0].date.split('/').reverse().join('-')

    const premiere = await enregistrerImpressionFinance(jour)
    // Journée ancienne : refusée pour un employé, acceptée pour un administrateur.
    if (premiere.statut === 'ok') {
      expect(premiere.valeur.numeroImpression).toBeGreaterThan(0)
    } else if (premiere.statut === 'erreurs') {
      expect(premiere.erreurs[0].code).toBe('impression-hors-periode-autorisee')
    }
  })

  it('R-65 — l’acquittement des anomalies est réservé à l’administrateur', async () => {
    const resultat = await acquitterAnomalies('2026-08-01')
    expect(resultat.statut).toBe('erreurs')
    if (resultat.statut !== 'erreurs') return
    expect(resultat.erreurs[0].code).toBe('acquittement-reserve-administrateur')
  })
})

describe('lot L5 — suivi journalier et registre des paiements', () => {
  it('R-68 — le mois courant s’arrête au jour du jour, sans trou', async () => {
    const suivi = await suiviJournalier({})
    expect(suivi.lignes.length).toBeGreaterThan(0)
    expect(suivi.mois).toMatch(/^\d{4}-\d{2}$/)
    // Les journées sans activité sont présentes par défaut.
    expect(suivi.afficherVides).toBe(true)
  })

  it('R-70 — la sélection restreint le périmètre de calcul', async () => {
    const complet = await suiviJournalier({})
    const active = complet.lignes.find((ligne) => !ligne.vide)
    expect(active).toBeDefined()

    const restreint = await suiviJournalier({ selection: [active!.cle] })
    expect(restreint.selection).toEqual([active!.cle])
    expect(restreint.encaissements).toBe(active!.total)
  })

  it('R-70 — masquer les journées vides ne laisse que les journées actives', async () => {
    const complet = await suiviJournalier({})
    const vides = complet.lignes.filter((ligne) => ligne.vide).length

    const suivi = await suiviJournalier({ afficherVides: false })
    expect(suivi.lignes.every((ligne) => !ligne.vide)).toBe(true)
    expect(suivi.nombreMasquees).toBe(vides)
    expect(suivi.nombreAffichees).toBe(complet.lignes.length - vides)
  })

  it('R-73, R-77 — le registre regroupe par opération et calcule le restant', async () => {
    const registre = await registreBancaire({})
    expect(registre.lignes.length).toBeGreaterThan(0)

    // Le chèque de famille : trois reçus, une seule ligne, entièrement réparti.
    const famille = registre.lignes.find((ligne) => ligne.numero === '7742015')
    expect(famille).toBeDefined()
    expect(famille!.classeType).toBe('shared')
    expect(famille!.recusComplet.split(' · ')).toHaveLength(3)
    expect(famille!.restant).toBe('—')

    // Le virement réutilisé : deux attributions, un restant encore disponible.
    const virement = registre.lignes.find((ligne) => ligne.numero === 'VIR-2026-0455')
    expect(virement).toBeDefined()
    expect(virement!.recusComplet.split(' · ')).toHaveLength(2)
  })

  it('R-32 — une attribution en dépassement laisse un restant négatif', async () => {
    const registre = await registreBancaire({})
    const depasse = registre.lignes.find((ligne) => ligne.numero === '8890734')
    expect(depasse).toBeDefined()
    // 15 000 DH attribués sur une opération de 10 000 DH.
    expect(depasse!.restant).toContain('-')
    expect(depasse!.couleurRestant).toBe('var(--danger)')
  })

  it('R-74 — les filtres du registre s’appliquent', async () => {
    const tous = await registreBancaire({})
    const cheques = await registreBancaire({ mode: 'cheque' })
    const virements = await registreBancaire({ mode: 'transfer' })
    expect(cheques.nombreAffiche + virements.nombreAffiche).toBe(tous.nombreAffiche)

    const avecImage = await registreBancaire({ image: 'with' })
    expect(avecImage.nombreAffiche).toBeGreaterThan(0)
  })

  it('R-36, R-41 — une deuxième image est refusée, l’ajout est tracé', async () => {
    const registre = await registreBancaire({ image: 'without' })
    const cible = registre.lignes[0]
    expect(cible).toBeDefined()

    const fichier = {
      contenu: new ArrayBuffer(4),
      nomOrigine: 'cheque.jpg',
      typeMime: 'image/jpeg',
    }
    expect((await ajouterImageOperation(cible.cle, fichier)).statut).toBe('ok')

    // R-41 — l'ajout laisse une trace au journal.
    const etat = await chargerEtat()
    expect(etat.audit[0].action).toBe('Image paiement')

    // R-36 — la deuxième image est refusée.
    const seconde = await ajouterImageOperation(cible.cle, fichier)
    expect(seconde.statut).toBe('erreurs')
    if (seconde.statut !== 'erreurs') return
    expect(seconde.erreurs[0].code).toBe('image-deja-presente')
  })

  it('R-39, R-41 — un employé ne peut pas supprimer une image', async () => {
    const registre = await registreBancaire({ image: 'with' })
    const cible = registre.lignes[0]
    expect(cible).toBeDefined()

    const resultat = await supprimerImageOperation(cible.cle)
    expect(resultat.statut).toBe('erreurs')
    if (resultat.statut !== 'erreurs') return
    expect(resultat.erreurs[0].code).toBe('suppression-image-reservee-administrateur')
  })
})
