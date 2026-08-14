import type { Td3Result, FieldStatus } from "./mrz.ts";
import type { PassportVision } from "./gemini.ts";

/**
 * Rapprochement entre les deux lectures du même document.
 *
 * Gemini lit la zone visuelle ; la MRZ est relue et vérifiée par calcul. Là où
 * les deux se recoupent, un désaccord veut dire que l'une des deux s'est
 * trompée — et rien ne permet de savoir laquelle sans regarder.
 *
 * Ce module ne tranche donc pas. Il expose les deux valeurs et la force de la
 * preuve qui accompagne chacune, pour que la décision reste à l'écran. La MRZ
 * est un témoin, pas un arbitre.
 */

export type Severity = "none" | "notice" | "warning";

export interface FieldReconciliation {
  field: string;
  /** Libellé prêt à afficher. */
  label: string;
  /** Ce que Gemini a lu dans la zone visuelle. */
  visual: string | null;
  /** Ce que la MRZ donne, si le champ y figure. */
  mrz: string | null;
  /** Fiabilité de la valeur MRZ. */
  mrzStatus: FieldStatus | null;
  /** true si les deux concordent, false si elles divergent, null si incomparable. */
  agree: boolean | null;
  severity: Severity;
  /**
   * Valeur pré-remplie dans le formulaire. C'est la lecture visuelle, comme
   * demandé : la MRZ sert à comparer, pas à imposer.
   */
  value: string | null;
  /** Explication courte, à afficher au survol du signe. */
  hint: string | null;
}

export interface Reconciliation {
  fields: FieldReconciliation[];
  /** Nombre de champs en désaccord. Zéro = les deux lectures concordent. */
  conflicts: number;
  /** Désaccords sur un champ dont la MRZ est prouvée : les plus sérieux. */
  provenConflicts: number;
}

/** Forme comparable : sans accents, sans ponctuation, sans espaces. */
function key(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

interface Pair {
  field: string;
  label: string;
  visual: string | null;
  mrz: string | null;
  mrzStatus: FieldStatus | null;
}

function pairs(vision: PassportVision, mrz: Td3Result | null): Pair[] {
  const m = <T,>(get: (r: Td3Result) => T): T | null => (mrz ? get(mrz) : null);
  return [
    { field: "surnameLatin", label: "Nom de famille (latin)", visual: vision.surnameLatin,
      mrz: m((r) => r.surname.value), mrzStatus: m((r) => r.surname.status) },
    { field: "givenNamesLatin", label: "Prénoms (latin)", visual: vision.givenNamesLatin,
      mrz: m((r) => r.givenNames.value), mrzStatus: m((r) => r.givenNames.status) },
    { field: "passportNumber", label: "N° de passeport", visual: vision.passportNumber,
      mrz: m((r) => r.passportNumber.value), mrzStatus: m((r) => r.passportNumber.status) },
    { field: "personalNumber", label: "N° Carte Nationale", visual: vision.personalNumber,
      mrz: m((r) => r.personalNumber.value), mrzStatus: m((r) => r.personalNumber.status) },
    { field: "nationality", label: "Nationalité", visual: vision.nationality,
      mrz: m((r) => r.nationality), mrzStatus: null },
    { field: "sex", label: "Sexe", visual: vision.sex,
      mrz: m((r) => r.sex.value), mrzStatus: m((r) => r.sex.status) },
    { field: "dateOfBirth", label: "Date de naissance", visual: vision.dateOfBirth,
      mrz: m((r) => r.dateOfBirth.value), mrzStatus: m((r) => r.dateOfBirth.status) },
    { field: "dateOfExpiry", label: "Date d'expiration", visual: vision.dateOfExpiry,
      mrz: m((r) => r.dateOfExpiry.value), mrzStatus: m((r) => r.dateOfExpiry.status) },

    // Absents de la MRZ : rien à comparer, mais ils font partie du formulaire.
    { field: "surnameArabic", label: "Nom de famille (arabe)", visual: vision.surnameArabic, mrz: null, mrzStatus: null },
    { field: "givenNamesArabic", label: "Prénoms (arabe)", visual: vision.givenNamesArabic, mrz: null, mrzStatus: null },
    { field: "dateOfIssue", label: "Date de délivrance", visual: vision.dateOfIssue, mrz: null, mrzStatus: null },
    { field: "placeOfBirth", label: "Lieu de naissance", visual: vision.placeOfBirth, mrz: null, mrzStatus: null },
    { field: "address", label: "Domicile", visual: vision.address, mrz: null, mrzStatus: null },
    { field: "issuingAuthority", label: "Autorité", visual: vision.issuingAuthority, mrz: null, mrzStatus: null },
  ];
}

export function reconcile(vision: PassportVision, mrz: Td3Result | null): Reconciliation {
  const fields = pairs(vision, mrz).map((p): FieldReconciliation => {
    const kv = key(p.visual), km = key(p.mrz);

    // Incomparable : le champ n'existe pas dans la MRZ, ou l'une des deux
    // lectures est vide. Une absence n'est pas un désaccord.
    if (!p.mrz || !kv || !km) {
      const onlyMrz = !kv && !!km;
      return {
        ...p, agree: null,
        severity: onlyMrz ? "notice" : "none",
        // Si seule la MRZ a lu quelque chose, autant s'en servir plutôt que
        // de laisser le champ vide.
        value: p.visual ?? (onlyMrz ? p.mrz : null),
        hint: onlyMrz ? "Non lu sur la page ; valeur issue de la MRZ." : null,
      };
    }

    if (kv === km) {
      return { ...p, agree: true, severity: "none", value: p.visual, hint: "Concorde avec la MRZ." };
    }

    // Désaccord. Une MRZ vérifiée par son chiffre de contrôle a une preuve
    // arithmétique de son côté : le signalement doit être plus fort.
    const proven = p.mrzStatus === "verified";
    return {
      ...p,
      agree: false,
      severity: proven ? "warning" : "notice",
      value: p.visual,
      hint: proven
        ? "Diffère de la MRZ, dont le chiffre de contrôle est valide. Vérifier sur l'image."
        : "Diffère de la MRZ, elle-même non confirmée. Les deux sont à vérifier.",
    };
  });

  const conflicting = fields.filter((f) => f.agree === false);
  return {
    fields,
    conflicts: conflicting.length,
    provenConflicts: conflicting.filter((f) => f.severity === "warning").length,
  };
}
