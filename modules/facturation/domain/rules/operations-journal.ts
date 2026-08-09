/**
 * Journal des opérations (سجل العمليات) — semaine affichée et libellés.
 *
 * Écran réservé à l'administrateur de facturation (poste 1), décrit en
 * intégralité par le commanditaire le 2026-08-09 : vue unique par semaine
 * (lundi–dimanche), deux flèches seulement, conservation indéfinie, filtres
 * employé et type d'action à l'intérieur de la semaine affichée.
 */

import { cleJourDepuisDateFr, decalerCleJour, type CleJour } from '../dates'
import type { LigneJournalOperations, SemaineJournal } from '../types'
import { LIBELLES_SECTIONS } from './edit-sections'
import { sectionDepuisActionType } from './modification-history'

/** Lundi de la semaine (lundi–dimanche) contenant la clé de journée donnée. */
function lundiDeSemaine(cle: CleJour): CleJour {
  const jour = new Date(`${cle}T12:00:00`).getDay() // 0 = dimanche … 6 = samedi
  const decalage = jour === 0 ? -6 : 1 - jour
  return decalerCleJour(cle, decalage)
}

/** Bornes lundi–dimanche (incluses) de la semaine contenant la clé donnée. */
export function limitesSemaine(cle: CleJour): SemaineJournal {
  const debut = lundiDeSemaine(cle)
  return { debut, fin: decalerCleJour(debut, 6) }
}

/**
 * Décale une semaine d'un nombre de semaines (7 jours), en gardant le lundi
 * comme ancre — jamais de sélecteur de date libre, seulement ce décalage
 * pas à pas (demande explicite du commanditaire).
 */
export function semaineDecalee(semaine: SemaineJournal, pas: number): SemaineJournal {
  const debut = decalerCleJour(semaine.debut, pas * 7)
  return { debut, fin: decalerCleJour(debut, 6) }
}

/**
 * Libellés des types d'action qui ne sont pas des modifications de reçu —
 * repris tels quels du reste de l'écran (jamais de vocabulaire neuf) :
 * `T.registre.nouveauRecu`/`ajouterDfp`, `T.annulation.titre`,
 * `T.finance.imprimer`, `T.depassement.titre`, `T.anomalie.titre`.
 * Les sept types de modification ne sont pas ici : leur libellé est celui de
 * la section touchée (`LIBELLES_SECTIONS`, via `sectionDepuisActionType`),
 * exactement comme dans le Journal financier et la fiche d'un reçu.
 */
const LIBELLES_ACTIONS_JOURNAL: Readonly<Record<string, string>> = {
  'billing_receipt.created': 'إنشاء وصل',
  'billing_receipt.first_payment_added': 'إضافة دفعة',
  'billing_receipt.payment_added': 'إضافة دفعة',
  'billing_receipt.cancelled': 'إلغاء الوصل',
  'billing_receipt.receipt_printed': 'طباعة الوصل',
  'payment_operation.over_allocation_confirmed': 'تجاوز المبلغ المتبقي للعملية',
  'facturation_finance_anomaly.anomaly_acknowledged': 'تأكيد مراجعة التنبيه',
  'facturation_finance_print.finance_journal_printed': 'طباعة السجل المالي',
  // Connexions (2026-08-09, 202608090014) : دخول/خروج repris tels quels de
  // service.ts::tracer() (déjà utilisés là, jamais réinventés). Échec de
  // connexion : vocabulaire neuf, rien d'existant ne le couvrait.
  'facturation_session.login_succeeded': 'دخول',
  'facturation_session.login_failed': 'محاولة دخول فاشلة',
  'facturation_session.logout': 'خروج',
}

/**
 * Libellé arabe de la nature d'une action du journal. Un type de la table
 * ci-dessus, sinon le libellé de section d'une modification de reçu — jamais
 * de troisième vocabulaire.
 */
export function libelleActionJournal(typeAction: string): string {
  const libelle = LIBELLES_ACTIONS_JOURNAL[typeAction]
  if (libelle) return libelle
  return LIBELLES_SECTIONS[sectionDepuisActionType(typeAction)]
}

/**
 * Une session employé — connexion et sa déconnexion appariées. Demande du
 * commanditaire (2026-08-09) : voir la connexion jusqu'à la déconnexion
 * d'une même personne, pas deux lignes séparées à rapprocher soi-même.
 */
export interface SessionEmploye {
  id: string
  employe: string
  employeSlot: number
  /** Absente : déconnexion vue sans connexion dans la semaine affichée (connecté avant). */
  connexionDate?: string
  connexionHeure?: string
  /** Absente : pas encore déconnecté dans la semaine affichée. */
  deconnexionDate?: string
  deconnexionHeure?: string
  /** Seulement quand les deux bornes sont connues. */
  dureeMinutes?: number
}

function cleHorodatage(ligne: Pick<LigneJournalOperations, 'date' | 'heure'>): string {
  return `${cleJourDepuisDateFr(ligne.date)}T${ligne.heure}`
}

function dureeEnMinutes(
  connexion: Pick<LigneJournalOperations, 'date' | 'heure'>,
  deconnexion: Pick<LigneJournalOperations, 'date' | 'heure'>,
): number {
  const debut = new Date(`${cleHorodatage(connexion)}:00`).getTime()
  const fin = new Date(`${cleHorodatage(deconnexion)}:00`).getTime()
  return Math.max(0, Math.round((fin - debut) / 60000))
}

/**
 * Apparie les connexions et déconnexions d'une même personne, dans l'ordre
 * chronologique. Une connexion sans déconnexion trouvée reste ouverte (pas
 * encore déconnecté, ou déconnexion hors de la semaine affichée) ; une
 * déconnexion sans connexion trouvée reste seule (connecté avant le début de
 * la semaine affichée) — jamais une donnée inventée pour combler l'absente.
 */
export function apparierSessions(
  connexions: readonly LigneJournalOperations[],
  deconnexions: readonly LigneJournalOperations[],
): SessionEmploye[] {
  const parEmploye = new Map<
    number,
    { employe: string; evenements: { type: 'connexion' | 'deconnexion'; ligne: LigneJournalOperations }[] }
  >()

  for (const ligne of connexions) {
    if (ligne.employeSlot === null) continue
    const groupe = parEmploye.get(ligne.employeSlot) ?? { employe: ligne.employe, evenements: [] }
    groupe.evenements.push({ type: 'connexion', ligne })
    parEmploye.set(ligne.employeSlot, groupe)
  }
  for (const ligne of deconnexions) {
    if (ligne.employeSlot === null) continue
    const groupe = parEmploye.get(ligne.employeSlot) ?? { employe: ligne.employe, evenements: [] }
    groupe.evenements.push({ type: 'deconnexion', ligne })
    parEmploye.set(ligne.employeSlot, groupe)
  }

  const sessions: SessionEmploye[] = []

  for (const [slot, groupe] of parEmploye) {
    const chronologie = [...groupe.evenements].sort((a, b) =>
      cleHorodatage(a.ligne) < cleHorodatage(b.ligne) ? -1 : 1,
    )

    let ouverte: LigneJournalOperations | null = null
    for (const evenement of chronologie) {
      if (evenement.type === 'connexion') {
        if (ouverte) {
          sessions.push({
            id: ouverte.id,
            employe: groupe.employe,
            employeSlot: slot,
            connexionDate: ouverte.date,
            connexionHeure: ouverte.heure,
          })
        }
        ouverte = evenement.ligne
      } else if (ouverte) {
        sessions.push({
          id: ouverte.id,
          employe: groupe.employe,
          employeSlot: slot,
          connexionDate: ouverte.date,
          connexionHeure: ouverte.heure,
          deconnexionDate: evenement.ligne.date,
          deconnexionHeure: evenement.ligne.heure,
          dureeMinutes: dureeEnMinutes(ouverte, evenement.ligne),
        })
        ouverte = null
      } else {
        sessions.push({
          id: evenement.ligne.id,
          employe: groupe.employe,
          employeSlot: slot,
          deconnexionDate: evenement.ligne.date,
          deconnexionHeure: evenement.ligne.heure,
        })
      }
    }
    if (ouverte) {
      sessions.push({
        id: ouverte.id,
        employe: groupe.employe,
        employeSlot: slot,
        connexionDate: ouverte.date,
        connexionHeure: ouverte.heure,
      })
    }
  }

  return sessions.sort((a, b) => {
    const cleA = cleHorodatage({
      date: a.connexionDate ?? a.deconnexionDate ?? '',
      heure: a.connexionHeure ?? a.deconnexionHeure ?? '',
    })
    const cleB = cleHorodatage({
      date: b.connexionDate ?? b.deconnexionDate ?? '',
      heure: b.connexionHeure ?? b.deconnexionHeure ?? '',
    })
    return cleA < cleB ? 1 : -1
  })
}
