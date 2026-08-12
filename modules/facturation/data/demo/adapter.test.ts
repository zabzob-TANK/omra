import { describe, expect, it } from 'vitest'

import { SAISON_DEMO } from '../../domain/constants'
import { creerSourceDemonstration } from './adapter'

const REFERENCE = new Date(2026, 7, 1, 12, 0, 0)

function source() {
  return creerSourceDemonstration({ reference: REFERENCE })
}

describe('adaptateur de démonstration — référentiels', () => {
  it('sert une saison active portant la réduction maximale', async () => {
    const saison = await source().referentiels.saisonActive()
    expect(saison.active).toBe(true)
    expect(saison.reductionMaxCentimes).toBe(SAISON_DEMO.reductionMaxCentimes)
  })

  it('sert les hôtels, vols, chambres et rabatteurs de la référence', async () => {
    const s = source()
    expect(await s.referentiels.hotels()).toHaveLength(3)
    expect(await s.referentiels.vols()).toHaveLength(2)
    expect(await s.referentiels.chambres()).toHaveLength(6)
    expect(await s.referentiels.rabatteurs()).toHaveLength(5)
  })

  it('R-05 — ne renvoie que les combinaisons tarifaires réellement définies', async () => {
    const tarifs = await source().referentiels.tarifs('saison-demo')
    const combinaisons = new Set(tarifs.map((t) => `${t.hotelId}|${t.volId}`))
    // O-08 : 4 combinaisons sur 6 sont renseignées dans le fichier de référence.
    expect(combinaisons.size).toBe(4)
    expect(combinaisons.has('رايا مبارك|القطرية')).toBe(false)
  })

  it('exprime les tarifs en centimes', async () => {
    const tarifs = await source().referentiels.tarifs('saison-demo')
    const cible = tarifs.find(
      (t) => t.hotelId === 'منار الشروق' && t.volId === 'الخطوط السعودية' && t.chambreId === '2',
    )
    expect(cible?.montantCentimes).toBe(3480000)
  })
})

describe('adaptateur de démonstration — reçus', () => {
  it('masque les reçus annulés par défaut', async () => {
    const s = source()
    const actifs = await s.recus.lister()
    const tous = await s.recus.lister({ inclureAnnules: true })
    expect(tous.length).toBeGreaterThan(actifs.length)
    expect(actifs.every((r) => r.statut !== 'ملغى')).toBe(true)
  })

  it('recherche par nom et par numéro', async () => {
    const s = source()
    expect(await s.recus.lister({ nom: 'مرزوق' })).toHaveLength(1)
    expect(await s.recus.lister({ numero: '253' })).toHaveLength(1)
  })

  it('deux voyageuses homonymes restent deux dossiers distincts', async () => {
    const s = source()
    // L'un des deux dossiers est annulé : il reste consultable (R-45).
    const homonymes = await s.recus.lister({ nom: 'زينب بوعزة', inclureAnnules: true })
    expect(homonymes).toHaveLength(2)
    // Même nom, mais ni le même reçu, ni le même client, ni le même téléphone.
    expect(new Set(homonymes.map((r) => r.id)).size).toBe(2)
    expect(new Set(homonymes.map((r) => r.clientId)).size).toBe(2)
    expect(new Set(homonymes.map((r) => r.telephone)).size).toBe(2)
  })

  it('R-11 — délivre des numéros successifs et jamais réutilisés', async () => {
    const s = source()
    const premier = await s.recus.reserverNumero()
    const second = await s.recus.reserverNumero()
    expect(second).toBe(premier + 1)
  })

  it('R-45 — l’annulation conserve le reçu et ses versements', async () => {
    const s = source()
    const avant = await s.recus.parNumero(262)
    const apres = await s.recus.annuler(avant!.id, {
      motif: 'test',
      annulePar: 'المدير',
      annuleLe: '01/08/2026 12:00',
      modeRemboursement: 'cash',
      montantRembourseCentimes: 1000000,
    })
    expect(apres.statut).toBe('ملغى')
    expect(apres.versements).toHaveLength(avant!.versements.length)
    expect(await s.recus.parNumero(262)).not.toBeNull()
  })

  it('R-84 — incrémente le compteur d’impressions', async () => {
    const s = source()
    const recu = await s.recus.parNumero(262)
    expect(await s.recus.incrementerImpressions(recu!.id, true)).toBe(1)
    expect(await s.recus.incrementerImpressions(recu!.id, true)).toBe(2)
  })

  it('renvoie des copies : muter le résultat n’altère pas le dépôt', async () => {
    const s = source()
    const recu = await s.recus.parNumero(262)
    recu!.convenuCentimes = 1
    expect((await s.recus.parNumero(262))!.convenuCentimes).not.toBe(1)
  })
})

describe('adaptateur de démonstration — opérations partagées et images', () => {
  it('R-34 — une opération partagée est reliée à plusieurs reçus sans être dupliquée', async () => {
    const s = source()
    const operations = await s.operationsPartagees.lister()
    // Un chèque de famille, un virement réutilisé, un chèque en dépassement.
    expect(operations).toHaveLength(3)

    const tous = await s.recus.lister({ inclureAnnules: true })
    const rattachesA = (id: string) =>
      tous.filter((r) => r.versements.some((v) => v.operationPartageeId === id))

    // Le chèque de famille règle trois reçus sans être dupliqué.
    const famille = operations.find((o) => o.reference === '7742015')!
    expect(rattachesA(famille.id)).toHaveLength(3)

    // Le virement est réutilisé deux jours de suite, sur deux reçus.
    const virement = operations.find((o) => o.reference === 'VIR-2026-0455')!
    const attributions = rattachesA(virement.id)
    expect(attributions).toHaveLength(2)
    expect(new Set(attributions.flatMap((r) => r.versements.map((v) => v.date))).size).toBe(2)
  })

  it('R-38 — l’image appartient à l’opération, pas aux versements rattachés', async () => {
    const s = source()
    const tous = await s.recus.lister({ inclureAnnules: true })
    const partages = tous.flatMap((r) => r.versements).filter((v) => v.portee === 'shared')
    expect(partages.length).toBeGreaterThan(0)
    expect(partages.every((v) => v.image === null)).toBe(true)
  })

  it('R-40 — une image supprimée laisse l’opération de nouveau disponible', async () => {
    const s = source()
    const [operation] = await s.operationsPartagees.lister()
    const reference = {
      chemin: 'demo/x',
      nomOrigine: 'cheque.jpg',
      origine: 'upload',
      deposeLe: '2026-08-01',
    }
    await s.operationsPartagees.definirImage(operation.id, reference)
    expect((await s.operationsPartagees.parId(operation.id))!.image).not.toBeNull()

    await s.operationsPartagees.definirImage(operation.id, null)
    expect((await s.operationsPartagees.parId(operation.id))!.image).toBeNull()
  })
})

describe('adaptateur de démonstration — caisse, impressions et audit', () => {
  it('R-48 — seuls les remboursements réellement sortis en espèces sont des mouvements', async () => {
    const s = source()
    const mouvements = await s.mouvementsCaisse.lister()
    expect(mouvements.length).toBeGreaterThan(0)
    expect(mouvements.every((m) => m.type === 'refund_cash')).toBe(true)

    const tous = await s.recus.lister({ inclureAnnules: true })
    const annules = tous.filter((r) => r.statut === 'ملغى')
    // Une sortie de caisse par annulation réellement remboursée en espèces,
    // ni plus ni moins. Les autres annulations n'en produisent aucune, d'où un
    // nombre de mouvements au plus égal au nombre d'annulations.
    const rembourseesEnEspeces = annules.filter((r) => r.modeRemboursement === 'cash')
    expect(rembourseesEnEspeces).toHaveLength(mouvements.length)
    expect(mouvements.length).toBeLessThanOrEqual(annules.length)
  })

  it('R-62 — une impression conserve la liste des mouvements imprimés', async () => {
    const s = source()
    // La veille de la date de référence a été imprimée deux fois.
    const impressions = await s.impressionsFinance.listerParJour('2026-07-31')
    expect(impressions).toHaveLength(2)
    expect(impressions.map((i) => i.numeroImpression).sort()).toEqual([1, 2])
    for (const impression of impressions) {
      expect(impression.mouvementIds.length).toBe(impression.nombreLignes)
    }
  })

  it('R-63 — un versement enregistré après l’impression n’y figure pas', async () => {
    const s = source()
    const impressions = await s.impressionsFinance.listerParJour('2026-07-31')
    const photographie = new Set(impressions.flatMap((i) => i.mouvementIds))

    // Le reçu 264 est saisi à 19:25, après les deux impressions de la journée.
    const tardif = (await s.recus.parNumero(264))!
    expect(tardif.versements[0].date).toBe('31/07/2026')
    expect(photographie.has(tardif.versements[0].id)).toBe(false)
  })

  it('R-65 — les acquittements d’anomalie se cumulent sur une même journée', async () => {
    const s = source()
    await s.acquittementsAnomalie.acquitter({
      jour: '2026-07-31',
      mouvementIds: ['a'],
      acquitteLe: '01/08/2026 09:00',
      acquittePar: 'المدير',
    })
    await s.acquittementsAnomalie.acquitter({
      jour: '2026-07-31',
      mouvementIds: ['b'],
      acquitteLe: '01/08/2026 09:05',
      acquittePar: 'المدير',
    })
    const acquittement = await s.acquittementsAnomalie.parJour('2026-07-31')
    expect(acquittement!.mouvementIds).toEqual(['a', 'b'])
  })

  it('R-86 — le journal d’audit place l’entrée la plus récente en tête', async () => {
    const s = source()
    await s.audit.enregistrer({
      id: 'x',
      horodatage: '01/08/2026 12:00',
      action: 'Test',
      detail: 'entrée récente',
      utilisateur: 'المدير',
    })
    const entrees = await s.audit.lister()
    expect(entrees[0].id).toBe('x')
  })
})

describe('adaptateur de démonstration — isolation', () => {
  it('deux sources sont indépendantes', async () => {
    const a = source()
    const b = source()
    const recu = await a.recus.parNumero(262)
    await a.recus.incrementerImpressions(recu!.id, true)
    expect((await b.recus.parNumero(262))!.impressions).toBe(0)
  })

  it('R-90 — la lecture automatique de passeport est annoncée indisponible', async () => {
    const s = source()
    expect(s.lecteurPasseport.disponible()).toBe(false)
    expect(
      await s.lecteurPasseport.lire({
        chemin: 'x',
        nomOrigine: 'p.jpg',
        origine: 'upload',
        deposeLe: '2026-08-01',
      }),
    ).toBeNull()
  })

  it('le stockage de fichiers renvoie une référence, jamais un contenu binaire', async () => {
    const s = source()
    const reference = await s.fichiers.deposer({
      contenu: new ArrayBuffer(8),
      nomOrigine: 'cheque.jpg',
      typeMime: 'image/jpeg',
      origine: 'upload',
    })
    expect(reference.chemin).toMatch(/^demo\//)
    expect(reference).not.toHaveProperty('contenu')

    // La référence seule est manipulée par le domaine et l'interface ; c'est
    // l'adaptateur qui sait la résoudre en URL affichable.
    expect(await s.fichiers.url(reference)).toMatch(/^data:image\/jpeg;base64,/)
    expect(await s.fichiers.url({ ...reference, chemin: 'demo/inconnu' })).toBe('')

    await s.fichiers.supprimer(reference)
    expect(await s.fichiers.url(reference)).toBe('')
  })
})
