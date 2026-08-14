/**
 * Lecture de la MRZ d'un passeport (OACI 9303, format TD3 : 2 lignes de 44).
 *
 * Rien ici n'est probabiliste. Les cinq chiffres de contrôle rendent la lecture
 * vérifiable : soit les données sont exactes, soit on sait qu'elles ne le sont
 * pas. C'est le seul endroit du pipeline qui offre cette garantie, et c'est ce
 * qui permet de valider le recadrage sans le regarder.
 */

export const TD3_LINE_LENGTH = 44;

/** Poids cycliques 7-3-1 de la norme OACI 9303. */
export function checkDigit(data: string): number {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const c = data[i].toUpperCase();
    let v = 0;
    if (c >= "0" && c <= "9") v = c.charCodeAt(0) - 48;
    else if (c >= "A" && c <= "Z") v = c.charCodeAt(0) - 55; // A=10 … Z=35
    // '<' et tout caractère inconnu valent 0
    sum += v * weights[i % 3];
  }
  return sum % 10;
}

/* ------------------------------------------------------------------ *
 * Correction guidée par les chiffres de contrôle
 * ------------------------------------------------------------------ */

/** Confusions classiques d'un OCR sur de l'OCR-B, dans les deux sens. */
const CONFUSIONS: Record<string, string[]> = {
  "0": ["O", "D", "Q"], O: ["0"], D: ["0"], Q: ["0"],
  "1": ["I", "L"], I: ["1"], L: ["1"],
  "2": ["Z"], Z: ["2"],
  "5": ["S"], S: ["5"],
  "6": ["G"], G: ["6"],
  "8": ["B"], B: ["8"],
  "7": ["T"], T: ["7"],
};

/** Lettre lue à la place d'un chiffre : dans un champ numérique, c'est certain. */
const TO_DIGIT: Record<string, string> = {
  O: "0", D: "0", Q: "0", I: "1", L: "1", Z: "2", S: "5", G: "6", B: "8", T: "7",
};

/** L'inverse : chiffre lu à la place d'une lettre. */
const TO_LETTER: Record<string, string> = {
  "0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "7": "T", "8": "B",
};

export type FieldKind = "numeric" | "alnum";

/**
 * Format attendu d'un champ, caractère par caractère :
 * `L` lettre, `D` chiffre, `A` indifférent.
 *
 * C'est l'information la plus utile qu'on puisse donner à la correction. Un
 * chiffre de contrôle dit seulement « c'est faux » ; un masque dit *où* et
 * *comment*. Une lettre là où un chiffre est attendu n'est plus une hypothèse
 * à tester, c'est une erreur certaine à corriger.
 */
export type Mask = string;

/**
 * Numéro de passeport, par État émetteur.
 * MAR : deux lettres suivies de sept chiffres, sans exception.
 */
export const PASSPORT_NUMBER_MASKS: Record<string, Mask> = {
  MAR: "LLDDDDDDD",
};

/**
 * État émetteur attendu par défaut.
 *
 * L'application ne traite que des passeports marocains. Le préciser n'est pas
 * un raccourci : le code pays n'est couvert par AUCUN chiffre de contrôle — la
 * norme l'exclut du calcul global — donc une lecture fautive passerait
 * inaperçue et ferait perdre le masque de format juste au moment où l'image
 * est mauvaise et où il servirait le plus.
 *
 * Un code lu différemment est donc traité comme une erreur de lecture, corrigé,
 * et signalé — jamais interprété comme un document étranger en silence.
 */
export const DEFAULT_ISSUING_STATE = "MAR";

/** Ramène chaque caractère dans la classe imposée par le masque. */
export function applyMask(field: string, mask: Mask): string {
  return field
    .split("")
    .map((c, i) => {
      const m = mask[i];
      if (m === "D" && /[A-Z]/.test(c)) return TO_DIGIT[c] ?? c;
      if (m === "L" && /[0-9]/.test(c)) return TO_LETTER[c] ?? c;
      return c;
    })
    .join("");
}

/** Le champ respecte-t-il son format ? Un contrôle que les chiffres ne font pas. */
export function matchesMask(field: string, mask: Mask): boolean {
  if (field.length !== mask.length) return false;
  for (let i = 0; i < mask.length; i++) {
    const c = field[i], m = mask[i];
    if (m === "D" && !/[0-9]/.test(c)) return false;
    if (m === "L" && !/[A-Z]/.test(c)) return false;
  }
  return true;
}

/**
 * Un champ dont le chiffre de contrôle ne tombe pas juste est presque toujours
 * une confusion de caractère, pas une vraie erreur de lecture.
 *
 * Deux régimes, parce qu'ils n'ont pas la même certitude :
 *
 * - Champ **numérique** (les dates) : une lettre y est forcément une erreur.
 *   On la remplace sans hésiter, sans rien explorer.
 * - Champ **alphanumérique** (numéros) : la confusion peut aller dans les deux
 *   sens. On explore, mais **par nombre croissant de substitutions**, pour que
 *   la correction retenue soit toujours la plus petite qui valide le contrôle.
 *
 * La recherche est bornée par le nombre de candidats, pas par le nombre de
 * positions : sur un numéro de passeport presque tous les caractères sont
 * ambigus, et compter les positions faisait abandonner avant d'avoir cherché.
 *
 * `accept` est le garde-fou décisif. Un chiffre de contrôle décimal ne rejette
 * que neuf erreurs sur dix ; parmi des centaines de candidats il s'en trouve
 * toujours un qui tombe juste par hasard. L'appelant y branche le contrôle
 * global de la ligne, qui porte sur tous les champs à la fois : une correction
 * fortuite le casse presque toujours. Sans ce second juge, la fonction
 * fabriquait des numéros crédibles et faux.
 */
export function repairField(
  field: string,
  expected: number,
  kind: FieldKind = "alnum",
  accept: (candidate: string) => boolean = () => true,
  mask?: Mask,
  maxCandidates = 20000,
): { value: string; repaired: boolean } | null {
  const valid = (c: string) => checkDigit(c) === expected && accept(c);
  if (valid(field) && (!mask || matchesMask(field, mask))) {
    return { value: field, repaired: false };
  }

  // Un masque rend la correction déterministe : plus rien à chercher.
  if (mask) {
    const forced = applyMask(field, mask);
    return valid(forced) ? { value: forced, repaired: forced !== field } : null;
  }

  if (kind === "numeric") {
    const forced = field.split("").map((c) => TO_DIGIT[c] ?? c).join("");
    return valid(forced) ? { value: forced, repaired: true } : null;
  }

  // Positions ambiguës et leurs variantes possibles.
  const pos: number[] = [];
  const alts: string[][] = [];
  for (let i = 0; i < field.length; i++) {
    const a = CONFUSIONS[field[i]];
    if (a && a.length) { pos.push(i); alts.push(a); }
  }
  if (!pos.length) return null;

  let budget = maxCandidates;
  const chars = field.split("");

  // Essaie toutes les substitutions portant sur exactement `k` positions.
  const tryDepth = (k: number, start: number, left: number): string | null => {
    if (left === 0) {
      const candidate = chars.join("");
      if (--budget < 0) return null;
      return valid(candidate) ? candidate : null;
    }
    for (let p = start; p <= pos.length - left; p++) {
      const i = pos[p], original = chars[i];
      for (const alt of alts[p]) {
        chars[i] = alt;
        const hit = tryDepth(k, p + 1, left - 1);
        if (hit) { chars[i] = original; return hit; }
        if (budget < 0) { chars[i] = original; return null; }
      }
      chars[i] = original;
    }
    return null;
  };

  // Une seule substitution, délibérément.
  //
  // Un chiffre de contrôle décimal ne distingue pas tout : sur un numéro de
  // passeport, deux confusions simultanées produisent des candidats qui
  // satisfont À LA FOIS le contrôle du champ et le contrôle global. Vérifié :
  // "AB12345G7" passe les deux alors que la valeur exacte est "AB1234567".
  // Au-delà d'une erreur aucun des deux juges ne tranche — on préfère donc
  // signaler le champ que présenter une valeur plausible et fausse.
  for (let k = 1; k <= 1; k++) {
    const hit = tryDepth(k, 0, k);
    if (hit) return { value: hit, repaired: true };
    if (budget < 0) break;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Analyse
 * ------------------------------------------------------------------ */

/**
 * Ce que vaut une valeur, et ce qu'on a le droit d'en faire.
 *
 * - `verified`  — lue telle quelle et confirmée par son chiffre de contrôle.
 *                 Exacte au sens arithmétique. Utilisable sans relecture.
 * - `repaired`  — une confusion de caractère a été corrigée. Deux régimes très
 *                 différents : avec un masque de format connu (le numéro de
 *                 passeport marocain), la correction est déterministe et sûre ;
 *                 sans masque, elle reste une hypothèse — deux erreurs
 *                 simultanées peuvent produire une valeur fausse qui satisfait
 *                 quand même les deux contrôles. Dans le doute, faire
 *                 confirmer à l'écran.
 * - `unverified` — aucun chiffre de contrôle ne couvre ce champ (les noms, par
 *                 exemple). Vraisemblable, jamais garantie.
 * - `invalid`   — les contrôles échouent et rien de plausible ne les satisfait.
 *                 À ressaisir ou à rescanner.
 */
export type FieldStatus = "verified" | "repaired" | "unverified" | "invalid";

export interface MrzField<T = string> {
  value: T;
  status: FieldStatus;
}

export interface Td3Result {
  ok: boolean;
  /** Les deux lignes normalisées, telles qu'utilisées pour le calcul. */
  lines: [string, string];
  documentType: string;
  issuingState: string;
  surname: MrzField;
  givenNames: MrzField;
  passportNumber: MrzField;
  nationality: string;
  dateOfBirth: MrzField;
  sex: MrzField;
  dateOfExpiry: MrzField;
  personalNumber: MrzField;
  /** Contrôle global de la ligne 2 : la garantie la plus forte. */
  compositeValid: boolean;
  /** Combien des cinq chiffres de contrôle tombent juste. */
  checksPassed: number;
  checksTotal: number;
  warnings: string[];
}

/** Ne garde que les caractères valides en MRZ et complète à 44. */
function normalizeLine(line: string): string {
  const clean = line
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[«»‹›≪≺<]/g, "<")
    .replace(/[^A-Z0-9<]/g, "<");
  return clean.length >= TD3_LINE_LENGTH
    ? clean.slice(0, TD3_LINE_LENGTH)
    : clean.padEnd(TD3_LINE_LENGTH, "<");
}

/** `MARTIN<<JEAN<PIERRE<<<` → nom et prénoms séparés. */
function parseNames(field: string): { surname: string; givenNames: string } {
  const [rawSurname, rawGiven = ""] = field.split("<<");
  const tidy = (s: string) =>
    s.replace(/</g, " ").replace(/\s+/g, " ").trim();
  return { surname: tidy(rawSurname), givenNames: tidy(rawGiven) };
}

/**
 * `YYMMDD` → `JJ/MM/AAAA`.
 * La MRZ ne porte pas le siècle : une date de naissance postérieure à
 * aujourd'hui appartient au siècle précédent, une date d'expiration lointaine
 * au siècle courant.
 */
function parseDate(yymmdd: string, kind: "birth" | "expiry", now = new Date()): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = +yymmdd.slice(0, 2);
  const mm = +yymmdd.slice(2, 4);
  const dd = +yymmdd.slice(4, 6);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const currentYY = now.getFullYear() % 100;
  const year =
    kind === "birth"
      ? yy > currentYY ? 1900 + yy : 2000 + yy
      : yy < 70 ? 2000 + yy : 1900 + yy;

  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null; // 31/02 et compagnie
  return `${String(dd).padStart(2, "0")}/${String(mm).padStart(2, "0")}/${year}`;
}

export interface ParseOptions {
  /** Code pays attendu. Mettre `null` pour se fier à ce qui est lu. */
  expectedState?: string | null;
}

export function parseTd3(
  raw: string,
  now = new Date(),
  opts: ParseOptions = {},
): Td3Result {
  const expectedState =
    opts.expectedState === undefined ? DEFAULT_ISSUING_STATE : opts.expectedState;
  const warnings: string[] = [];
  const candidates = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 20);

  const l1 = normalizeLine(candidates[0] ?? "");
  const l2 = normalizeLine(candidates[1] ?? "");
  if (candidates.length < 2) warnings.push("Moins de deux lignes exploitables.");

  const names = parseNames(l1.slice(5));
  const nameStatus: FieldStatus = candidates.length >= 2 ? "unverified" : "invalid";

  // --- ligne 2, découpée selon la norme ---
  const rawNumber = l2.slice(0, 9);
  const numberCheck = l2[9];
  const nationality = l2.slice(10, 13);
  const rawBirth = l2.slice(13, 19);
  const birthCheck = l2[19];
  const sexChar = l2[20];
  const rawExpiry = l2.slice(21, 27);
  const expiryCheck = l2[27];
  const rawPersonal = l2.slice(28, 42);
  const personalCheck = l2[42];
  const compositeCheck = l2[43];

  // Le masque suit l'État ATTENDU, pas celui qui a été lu : c'est tout l'objet
  // du réglage, puisque le code pays n'a pas de chiffre de contrôle.
  const readState = nationality.replace(/</g, "");
  const effectiveState = expectedState ?? readState;
  const numberMask = PASSPORT_NUMBER_MASKS[effectiveState];

  if (expectedState) {
    if (readState && readState !== expectedState) {
      warnings.push(
        `Nationalité lue « ${readState} », corrigée en ${expectedState} : ce champ n'a pas de chiffre de contrôle.`,
      );
    }
    const readIssuer = l1.slice(2, 5).replace(/</g, "");
    if (readIssuer && readIssuer !== expectedState) {
      warnings.push(`État émetteur lu « ${readIssuer} » sur la première ligne, corrigé en ${expectedState}.`);
    }
  }

  const isDigit = (c: string) => /^[0-9]$/.test(c);
  let passed = 0;
  const total = 5;

  const personalOptional = rawPersonal.replace(/</g, "") === "" && !isDigit(personalCheck);

  /**
   * Le contrôle global de la ligne 2 porte sur les quatre champs à la fois.
   * On s'en sert comme juge des corrections : une réparation qui répare un
   * champ mais casse l'ensemble est presque sûrement fortuite.
   */
  const compositeOf = (n: string, b2: string, e: string, p: string) =>
    n + numberCheck + b2 + birthCheck + e + expiryCheck + p.padEnd(14, "<") + personalCheck;
  const compositeKnown = isDigit(compositeCheck);
  const compositeOk = (n: string, b2: string, e: string, p: string) =>
    !compositeKnown || checkDigit(compositeOf(n, b2, e, p)) === +compositeCheck;

  // Valeurs de travail : chaque champ réparé remplace la version lue, pour que
  // le juge évalue toujours la combinaison la plus à jour.
  const cur = { num: rawNumber, birth: rawBirth, expiry: rawExpiry, personal: rawPersonal };

  function resolve(
    slot: keyof typeof cur,
    check: string,
    label: string,
    kind: FieldKind,
    mask?: Mask,
  ): { value: string; status: FieldStatus } {
    const field = cur[slot];
    if (!isDigit(check)) return { value: field, status: "unverified" };

    const judge = (candidate: string) => {
      const t = { ...cur, [slot]: candidate };
      return compositeOk(t.num, t.birth, t.expiry, t.personal);
    };

    // D'abord avec le juge global, puis sans lui : si le chiffre de contrôle
    // global est lui-même mal lu, aucune correction ne peut le satisfaire, et
    // il ne faut pas pour autant refuser une réparation par ailleurs solide.
    const strict = repairField(field, +check, kind, judge, mask);
    const loose = strict ?? repairField(field, +check, kind, () => true, mask);

    if (!loose) {
      warnings.push(`${label} : chiffre de contrôle invalide.`);
      return { value: field, status: "invalid" };
    }
    passed++;
    cur[slot] = loose.value;
    if (loose.repaired) {
      warnings.push(
        strict
          ? `${label} : corrigé via les chiffres de contrôle.`
          : `${label} : correction non confirmée par le contrôle global — à vérifier.`,
      );
      return { value: loose.value, status: strict ? "repaired" : "invalid" };
    }
    return { value: loose.value, status: "verified" };
  }

  const num = resolve("num", numberCheck, "Numéro de passeport", "alnum", numberMask);
  const birth = resolve("birth", birthCheck, "Date de naissance", "numeric");
  const expiry = resolve("expiry", expiryCheck, "Date d'expiration", "numeric");

  // Le numéro personnel est facultatif : un champ vide avec contrôle '<' est normal.
  let personal: { value: string; status: FieldStatus };
  if (personalOptional) {
    personal = { value: "", status: "unverified" };
    passed++;
  } else {
    personal = resolve("personal", personalCheck, "Numéro personnel", "alnum");
  }

  let compositeValid = false;
  if (compositeKnown) {
    compositeValid = compositeOk(cur.num, cur.birth, cur.expiry, cur.personal);
    if (compositeValid) passed++;
    else warnings.push("Contrôle global de la ligne 2 invalide.");
  } else {
    warnings.push("Contrôle global absent.");
  }

  if (numberMask && num.status !== "invalid" && !matchesMask(num.value, numberMask)) {
    warnings.push("Numéro de passeport : format inattendu pour ce pays.");
    num.status = "invalid";
  }

  const birthDate = parseDate(birth.value, "birth", now);
  const expiryDate = parseDate(expiry.value, "expiry", now);
  if (birth.status !== "invalid" && !birthDate) warnings.push("Date de naissance illisible.");
  if (expiry.status !== "invalid" && !expiryDate) warnings.push("Date d'expiration illisible.");

  const sexValid = /^[MFX<]$/.test(sexChar);
  if (!sexValid) warnings.push("Sexe illisible.");

  return {
    ok: compositeValid && num.status !== "invalid" &&
        birth.status !== "invalid" && expiry.status !== "invalid",
    lines: [l1, l2],
    documentType: l1.slice(0, 2).replace(/</g, "") || "P",
    issuingState: effectiveState,
    surname: { value: names.surname, status: nameStatus },
    givenNames: { value: names.givenNames, status: nameStatus },
    passportNumber: { value: num.value.replace(/</g, ""), status: num.status },
    nationality: effectiveState,
    dateOfBirth: { value: birthDate ?? birth.value, status: birthDate ? birth.status : "invalid" },
    sex: { value: sexChar === "<" ? "" : sexChar, status: sexValid ? "verified" : "invalid" },
    dateOfExpiry: { value: expiryDate ?? expiry.value, status: expiryDate ? expiry.status : "invalid" },
    personalNumber: { value: personal.value.replace(/</g, ""), status: personal.status },
    compositeValid,
    checksPassed: passed,
    checksTotal: total,
    warnings,
  };
}
