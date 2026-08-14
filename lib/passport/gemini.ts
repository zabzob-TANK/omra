import { GoogleGenAI, Type } from "@google/genai";

/**
 * Appel unique à Gemini sur l'image d'origine, non redressée.
 *
 * Trois choses en une passe : les données du document, les quatre coins de la
 * page dans l'image telle quelle, et la position des deux yeux. Les coins
 * servent au redressement ; les yeux servent à poser le cadre du portrait.
 *
 * On ne lui demande PAS le cadre du portrait directement. Placer deux points
 * sur des yeux, un modèle le fait bien ; délimiter un rectangle esthétique,
 * beaucoup moins — les bords sont arbitraires et le résultat varie d'un
 * document à l'autre. On récupère les yeux et on calcule le cadre nous-mêmes,
 * ce qui donne le même cadrage sur tous les passeports (voir photoFrame.ts).
 */

export const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";

/** Point en coordonnées normalisées 0–1000, éventuellement hors de l'image. */
export interface NormPoint {
  x: number;
  y: number;
}

export interface PassportVision {
  /** Coins de la page de données, dans l'ordre haut-gauche → sens horaire. */
  corners: [NormPoint, NormPoint, NormPoint, NormPoint] | null;
  cornersConfidence: number | null;
  /** Centres des pupilles, repérés par leur position à l'écran. */
  eyeLeft: NormPoint | null;
  eyeRight: NormPoint | null;

  rawMrz: string | null;
  surnameArabic: string | null;
  givenNamesArabic: string | null;
  surnameLatin: string | null;
  givenNamesLatin: string | null;
  passportNumber: string | null;
  personalNumber: string | null;
  nationality: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  dateOfIssue: string | null;
  dateOfExpiry: string | null;
  placeOfBirth: string | null;
  placeOfBirthArabic: string | null;
  address: string | null;
  addressArabic: string | null;
  issuingAuthority: string | null;
  issuingAuthorityArabic: string | null;

  /** Ce que le modèle n'a pas su lire, nommé explicitement. */
  unreadableFields: string[];
  notes: string | null;
}

const PROMPT = `Tu analyses la photo d'un passeport marocain. Ils le sont tous :
le code pays est MAR, et le numéro de passeport fait toujours DEUX LETTRES
suivies de SEPT CHIFFRES (exemple : XA4760146). Si un caractère est douteux,
tranche avec cette contrainte plutôt qu'au jugé — un O en cinquième position
est forcément un zéro. L'image n'est pas redressée :
le document peut être incliné, en perspective, partiellement hors du cadre, avec des
reflets ou une dominante de couleur. Travaille sur l'image telle qu'elle est.

LA PAGE DE DONNÉES est celle qui porte la MRZ (les deux lignes de caractères
espacés en bas, avec des chevrons <). S'il y a deux pages visibles, ignore l'autre.

1. LES QUATRE COINS de cette page, en coordonnées normalisées 0 à 1000.
   - Ordre imposé : haut-gauche, haut-droit, bas-droit, bas-gauche, définis par
     rapport au SENS DE LECTURE DU TEXTE imprimé, pas par rapport à l'image.
     Si le passeport est photographié de travers ou couché, suis le texte.
   - Ce sont les coins physiques du papier, pas une boîte rectangulaire autour.
   - IMPORTANT : si un coin sort du cadre de l'image, donne quand même sa
     position estimée, avec une valeur négative ou supérieure à 1000. Ne le
     ramène jamais sur le bord.
   - Si tu ne vois pas assez le document pour situer les coins, mets corners à null.

2. LES DEUX YEUX de la personne sur la photo d'identité, centre de la pupille,
   en coordonnées normalisées 0 à 1000 dans la MÊME image.
   - eyeLeft = l'œil qui apparaît à GAUCHE dans l'image.
   - eyeRight = celui qui apparaît à DROITE.
   - Si un œil est masqué ou illisible, mets-le à null.

3. LES DONNÉES du document.
   - rawMrz : les DEUX lignes de la MRZ, telles quelles, séparées par un retour
     à la ligne. Garde tous les chevrons <, ne complète rien, ne corrige rien.
     C'est vérifié par calcul de notre côté, donc une transcription fidèle vaut
     mieux qu'une transcription arrangée.
   - Les noms en arabe ET en latin, séparément.
   - Les dates au format JJ/MM/AAAA.
   - Pour les lieux, deux versions : le libellé latin complet tel qu'imprimé
     (placeOfBirth, issuingAuthority, address) et, séparément, le nom de la
     ville ou de la province en arabe (placeOfBirthArabic, issuingAuthorityArabic,
     addressArabic) — la ville seule, sans le reste de l'adresse.

RÈGLE ABSOLUE : ne devine jamais. Si un champ est flou, masqué ou absent, mets-le
à null et ajoute son nom dans unreadableFields. Un champ vide signalé est utile ;
un champ inventé qui a l'air correct ne l'est pas.`;

const point = {
  type: Type.OBJECT,
  properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
  required: ["x", "y"],
};

const nullableString = { type: Type.STRING, nullable: true };

const schema = {
  type: Type.OBJECT,
  properties: {
    corners: {
      type: Type.ARRAY,
      nullable: true,
      items: point,
      description: "Exactement 4 points : haut-gauche, haut-droit, bas-droit, bas-gauche.",
    },
    cornersConfidence: {
      type: Type.NUMBER,
      nullable: true,
      description: "0 à 1. Bas si le document est très coupé ou flou.",
    },
    eyeLeft: { ...point, nullable: true },
    eyeRight: { ...point, nullable: true },

    rawMrz: nullableString,
    surnameArabic: nullableString,
    givenNamesArabic: nullableString,
    surnameLatin: nullableString,
    givenNamesLatin: nullableString,
    passportNumber: nullableString,
    personalNumber: nullableString,
    nationality: nullableString,
    sex: nullableString,
    dateOfBirth: nullableString,
    dateOfIssue: nullableString,
    dateOfExpiry: nullableString,
    placeOfBirth: nullableString,
    placeOfBirthArabic: nullableString,
    address: nullableString,
    addressArabic: nullableString,
    issuingAuthority: nullableString,
    issuingAuthorityArabic: nullableString,

    unreadableFields: { type: Type.ARRAY, items: { type: Type.STRING } },
    notes: nullableString,
  },
  required: ["corners", "eyeLeft", "eyeRight", "rawMrz", "unreadableFields"],
};

export interface AnalyseOptions {
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
}

export async function analysePassport(
  base64Image: string,
  mimeType: string,
  opts: AnalyseOptions = {},
): Promise<PassportVision> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY absente de l'environnement.");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: opts.model ?? DEFAULT_MODEL,
    contents: {
      parts: [{ inlineData: { data: base64Image, mimeType } }, { text: PROMPT }],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      // Une transcription doit être reproductible : deux appels sur la même
      // image ne doivent pas donner deux orthographes différentes.
      temperature: 0,
      abortSignal: opts.signal,
    },
  });

  if (!response.text) throw new Error("Réponse vide de Gemini.");
  return normalise(JSON.parse(response.text));
}

/** Le modèle peut renvoyer un nombre de coins inattendu : on ne fait confiance qu'à 4. */
function normalise(raw: Record<string, unknown>): PassportVision {
  const pt = (v: unknown): NormPoint | null => {
    if (!v || typeof v !== "object") return null;
    const p = v as { x?: unknown; y?: unknown };
    return typeof p.x === "number" && typeof p.y === "number" ? { x: p.x, y: p.y } : null;
  };
  const str = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t && t.toLowerCase() !== "null" ? t : null;
  };

  const rawCorners = Array.isArray(raw.corners) ? raw.corners.map(pt) : [];
  const corners =
    rawCorners.length === 4 && rawCorners.every(Boolean)
      ? (rawCorners as [NormPoint, NormPoint, NormPoint, NormPoint])
      : null;

  return {
    corners,
    cornersConfidence: typeof raw.cornersConfidence === "number" ? raw.cornersConfidence : null,
    eyeLeft: pt(raw.eyeLeft),
    eyeRight: pt(raw.eyeRight),
    rawMrz: str(raw.rawMrz),
    surnameArabic: str(raw.surnameArabic),
    givenNamesArabic: str(raw.givenNamesArabic),
    surnameLatin: str(raw.surnameLatin),
    givenNamesLatin: str(raw.givenNamesLatin),
    passportNumber: str(raw.passportNumber),
    personalNumber: str(raw.personalNumber),
    nationality: str(raw.nationality),
    sex: str(raw.sex),
    dateOfBirth: str(raw.dateOfBirth),
    dateOfIssue: str(raw.dateOfIssue),
    dateOfExpiry: str(raw.dateOfExpiry),
    placeOfBirth: str(raw.placeOfBirth),
    placeOfBirthArabic: str(raw.placeOfBirthArabic),
    address: str(raw.address),
    addressArabic: str(raw.addressArabic),
    issuingAuthority: str(raw.issuingAuthority),
    issuingAuthorityArabic: str(raw.issuingAuthorityArabic),
    unreadableFields: Array.isArray(raw.unreadableFields)
      ? raw.unreadableFields.filter((f): f is string => typeof f === "string")
      : [],
    notes: str(raw.notes),
  };
}

/** 0–1000 → pixels de l'image d'origine. Les valeurs hors bornes sont conservées. */
export function toPixels(p: NormPoint, width: number, height: number): { x: number; y: number } {
  return { x: (p.x / 1000) * width, y: (p.y / 1000) * height };
}
