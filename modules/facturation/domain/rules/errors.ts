/**
 * Erreurs de validation.
 *
 * Le fichier de référence pousse ses messages directement dans l'état. Ici les
 * règles renvoient des **codes**, et les textes sont séparés : le domaine reste
 * pur, et les libellés restent exactement ceux du fichier.
 *
 * L'ordre dans lequel les erreurs sont produites est significatif et reproduit
 * exactement celui du fichier de référence.
 */

import { centimesEnTexteDevise } from '../money'

export type CodeErreur =
  // Disponibilité générale
  | 'saison-indisponible'
  | 'section-indisponible'
  // Identité et contact
  | 'prenom-obligatoire'
  | 'nom-obligatoire'
  | 'telephone-obligatoire'
  | 'telephone-dix-chiffres'
  // Programme
  | 'hotel-obligatoire'
  | 'vol-obligatoire'
  | 'chambre-obligatoire'
  | 'rabatteur-obligatoire'
  | 'tarif-introuvable'
  | 'tarif-introuvable-combinaison'
  | 'reduction-superieure-au-plafond'
  | 'reduction-superieure-ou-egale-au-tarif'
  | 'convenu-inferieur-au-paye'
  // Groupe
  | 'groupe-obligatoire'
  // Versements
  | 'premier-versement-obligatoire'
  | 'montant-obligatoire'
  | 'montant-doit-etre-positif'
  | 'montant-superieur-au-convenu'
  | 'montant-superieur-au-restant'
  | 'sixieme-versement-doit-solder'
  | 'numero-recu-obligatoire'
  | 'numero-recu-introuvable'
  | 'recu-annule'
  | 'recu-deja-solde'
  | 'nombre-maximal-de-versements-atteint'
  | 'premier-versement-absent'
  // Instrument bancaire
  | 'reference-instrument-obligatoire'
  | 'date-instrument-obligatoire'
  | 'date-instrument-invalide'
  | 'banque-obligatoire'
  | 'payeur-obligatoire'
  | 'montant-operation-obligatoire'
  | 'montant-operation-doit-etre-positif'
  | 'operation-partagee-obligatoire'
  | 'operation-partagee-introuvable'
  // Annulation
  | 'motif-annulation-obligatoire'
  | 'mode-remboursement-obligatoire'
  | 'mot-de-passe-obligatoire'
  | 'mot-de-passe-incorrect'
  // Modification
  | 'motif-modification-obligatoire'
  | 'section-obligatoire'
  | 'operation-partagee-non-modifiable-ici'
  | 'montant-premier-versement-reserve-administrateur'
  // Journal financier
  | 'impression-hors-periode-autorisee'
  | 'acquittement-reserve-administrateur'
  | 'jour-unique-requis-pour-impression'
  // Images des chèques et virements — messages en français, comme les écrans
  // correspondants du fichier de référence.
  | 'operation-bancaire-introuvable'
  | 'image-deja-presente'
  | 'aucune-image-importee'
  | 'suppression-image-reservee-administrateur'
  | 'format-image-non-accepte'

export interface ErreurValidation {
  /** Champ concerné, tel qu'identifié dans le formulaire. */
  champ: string
  code: CodeErreur
  /** Valeurs à insérer dans le message. */
  parametres?: Record<string, string | number>
}

/**
 * Résultat d'une règle de validation.
 *
 * `confirmation-requise` reproduit `requestSharedOverflow()` : l'enregistrement
 * reste possible mais exige une confirmation explicite (R-32).
 */
export type Resultat<T> =
  | { statut: 'ok'; valeur: T }
  | { statut: 'erreurs'; erreurs: ErreurValidation[] }
  | {
      statut: 'confirmation-requise'
      motif: 'depassement-operation-partagee'
      montantCentimes: number
      disponibleCentimes: number
    }

export function erreurs(liste: ErreurValidation[]): Resultat<never> {
  return { statut: 'erreurs', erreurs: liste }
}

export function erreur(
  champ: string,
  code: CodeErreur,
  parametres?: Record<string, string | number>,
): Resultat<never> {
  return { statut: 'erreurs', erreurs: [{ champ, code, parametres }] }
}

export function ok<T>(valeur: T): Resultat<T> {
  return { statut: 'ok', valeur }
}

/**
 * Messages repris **tels quels** du fichier de référence.
 *
 * Ils s'affichent en arabe, comme dans le fichier : les écrans concernés y sont
 * en arabe. Rien n'est traduit ni reformulé.
 */
export const MESSAGES: Record<CodeErreur, (p?: Record<string, string | number>) => string> = {
  'saison-indisponible': () =>
    'لا توجد موسم نشط. يجب على المدير إنشاء موسم وتفعيله من لوحة الإدارة قبل استخدام الفوترة.',
  'section-indisponible': () => 'هذا القسم غير متاح حاليًا. جرّب قسمًا آخر أو راجع المدير.',
  'prenom-obligatoire': () => 'الاسم إجباري.',
  'nom-obligatoire': () => 'النسب إجباري.',
  'telephone-obligatoire': () => 'رقم الهاتف إجباري.',
  'telephone-dix-chiffres': () => 'رقم الهاتف يجب أن يتكون من 10 أرقام.',

  'hotel-obligatoire': () => 'اختر الفندق.',
  'vol-obligatoire': () => 'اختر الرحلة.',
  'chambre-obligatoire': () => 'اختر الغرفة.',
  'rabatteur-obligatoire': () => 'اختر الوسيط.',
  'tarif-introuvable': () => 'لا يوجد ثمن لهذا الاختيار. غيّر الفندق أو الرحلة أو الغرفة.',
  // Le fichier de référence emploie un message distinct dans la modification.
  'tarif-introuvable-combinaison': () => 'لا يوجد ثمن لهذه التركيبة.',
  'reduction-superieure-au-plafond': (p) =>
    `التخفيض الأقصى لهذا الموسم هو ${p?.plafond ?? ''}.`,
  'reduction-superieure-ou-egale-au-tarif': () => 'التخفيض لا يمكن أن يساوي أو يفوق الثمن.',
  'convenu-inferieur-au-paye': (p) =>
    `المبلغ المتفق عليه الجديد أقل من المبلغ المدفوع بالفعل (${p?.paye ?? ''}).`,

  'groupe-obligatoire': () => 'رمز المجموعة إجباري.',

  'premier-versement-obligatoire': () => 'الدفعة الأولى إجبارية.',
  'montant-obligatoire': () => 'المبلغ إجباري.',
  'montant-doit-etre-positif': () => 'المبلغ يجب أن يفوق 0 درهم.',
  'montant-superieur-au-convenu': (p) =>
    `المبلغ المدفوع يفوق المبلغ المتفق عليه (${p?.convenu ?? ''}). الدفع الزائد ممنوع.`,
  'montant-superieur-au-restant': (p) =>
    `المبلغ يفوق الباقي (${p?.restant ?? ''}). الدفع الزائد ممنوع.`,
  'sixieme-versement-doit-solder': (p) =>
    `الدفعة السادسة يجب أن تساوي كامل الباقي بالضبط (${p?.restant ?? ''}). لا يُقبل مبلغ أقل أو أكبر.`,
  'numero-recu-obligatoire': () => 'اكتب رقم الوصل.',
  'numero-recu-introuvable': () => 'هذا الرقم غير موجود.',
  'recu-annule': () => 'هذا الوصل ملغى.',
  'recu-deja-solde': () => 'هذا الوصل مسدد بالكامل.',
  'nombre-maximal-de-versements-atteint': (p) =>
    `بلغ هذا الوصل الحد الأقصى: ${p?.maximum ?? ''} دفعات.`,
  'premier-versement-absent': () => 'لا توجد دفعة أولى مرتبطة بهذا الوصل.',

  'reference-instrument-obligatoire': () => 'رقم الشيك أو مرجع التحويل إجباري.',
  'date-instrument-obligatoire': () => 'تاريخ العملية إجباري.',
  'date-instrument-invalide': () => 'تاريخ العملية غير صحيح. الشكل: 02/07/2025',
  'banque-obligatoire': () => 'البنك إجباري.',
  'payeur-obligatoire': () => 'اسم الشخص الذي قام بالدفع إجباري.',
  'montant-operation-obligatoire': () => 'المبلغ الإجمالي للعملية إجباري.',
  'montant-operation-doit-etre-positif': () => 'المبلغ الإجمالي للعملية يجب أن يفوق 0 درهم.',
  'operation-partagee-obligatoire': () => 'اختر عملية مشتركة موجودة.',
  'operation-partagee-introuvable': () => 'العملية المشتركة المختارة غير موجودة.',

  'motif-annulation-obligatoire': () => 'سبب الإلغاء إجباري.',
  'mode-remboursement-obligatoire': () => 'اختر طريقة الاسترجاع.',
  'mot-de-passe-obligatoire': () => 'كلمة المرور إجبارية.',
  'mot-de-passe-incorrect': () => 'كلمة المرور غير صحيحة.',

  'motif-modification-obligatoire': () => 'سبب التعديل إجباري.',
  'section-obligatoire': () => 'اختر قسمًا واحدًا.',
  'operation-partagee-non-modifiable-ici': () =>
    'بيانات العملية المشتركة تعدّل من سجل المدفوعات والتحويلات، وليس من الوصل.',
  'montant-premier-versement-reserve-administrateur': () =>
    'تعديل مبلغ الدفعة الأولى متاح للمدير فقط.',

  'impression-hors-periode-autorisee': () => 'يمكن للموظف طباعة اليوم أو أمس فقط.',
  'acquittement-reserve-administrateur': () => 'تأكيد مراجعة التنبيه متاح للمدير فقط.',
  'jour-unique-requis-pour-impression': () => 'اختر يوماً واحداً للطباعة.',
  'operation-bancaire-introuvable': () => 'Paiement introuvable.',
  'image-deja-presente': () => 'Une image existe déjà pour cette opération.',
  'aucune-image-importee': () => 'Importez une image avant de l’enregistrer.',
  'suppression-image-reservee-administrateur': () =>
    'Seul l’administrateur peut supprimer l’image.',
  'format-image-non-accepte': () =>
    'Format non accepté — utilisez une image JPG, PNG ou WebP.',
}

/** Rend le message d'une erreur, dans la langue du fichier de référence. */
export function messageErreur(erreurValidation: ErreurValidation): string {
  return MESSAGES[erreurValidation.code](erreurValidation.parametres)
}

/** Raccourci pour formater un montant destiné à un message. */
export function montantPourMessage(centimes: number): string {
  return centimesEnTexteDevise(centimes)
}
