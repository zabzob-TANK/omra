/**
 * Journal des opérations (سجل العمليات) — semaine affichée et libellés.
 *
 * Écran réservé à l'administrateur de facturation (poste 1), décrit en
 * intégralité par le commanditaire le 2026-08-09 : vue unique par semaine
 * (lundi–dimanche), deux flèches seulement, conservation indéfinie, filtres
 * employé et type d'action à l'intérieur de la semaine affichée.
 */

import { decalerCleJour, type CleJour } from '../dates'
import type { SemaineJournal } from '../types'
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
