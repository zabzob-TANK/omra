import { analysePassport } from "@/lib/passport/gemini";
import { parseTd3 } from "@/lib/passport/mrz";
import { frameFromEyes } from "@/lib/passport/photoFrame";

/**
 * Analyse d'un passeport : une image en entrée, tout ce qu'il faut pour
 * l'afficher en sortie.
 *
 * L'appel à Gemini se fait ici, côté serveur, pour que la clé d'API ne parte
 * jamais dans le navigateur.
 *
 * Les données de Gemini ne sont pas prises pour argent comptant : la MRZ qu'il
 * transcrit est repassée dans le calcul des chiffres de contrôle. Ce qui en
 * ressort avec le statut « verified » est exact au sens arithmétique, pas
 * seulement plausible — et c'est ce qui sert d'arbitre quand sa lecture du
 * texte visible diverge de la MRZ.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("image");
    if (f instanceof File) file = f;
  } catch {
    return Response.json({ error: "Requête illisible : envoyez un formulaire multipart." }, { status: 400 });
  }

  if (!file) return Response.json({ error: "Aucune image reçue." }, { status: 400 });
  if (!file.type.startsWith("image/"))
    return Response.json({ error: `Type de fichier non pris en charge : ${file.type}.` }, { status: 415 });
  if (file.size > MAX_BYTES)
    return Response.json({ error: "Image trop lourde : 20 Mo maximum." }, { status: 413 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  let vision;
  try {
    vision = await analysePassport(base64, file.type, { signal: request.signal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Distinguer « mal configuré » de « le service a échoué » : ce ne sont pas
    // les mêmes actions côté appelant.
    const missingKey = message.includes("GEMINI_API_KEY");
    return Response.json(
      { error: missingKey ? "Clé Gemini non configurée sur le serveur." : "L'analyse a échoué.", detail: message },
      { status: missingKey ? 500 : 502 },
    );
  }

  const mrz = vision.rawMrz ? parseTd3(vision.rawMrz) : null;

  // Les yeux arrivent en 0–1000 ; le cadre se calcule dans ce même repère et
  // reste donc valable quelle que soit la taille réelle de l'image.
  const frame =
    vision.eyeLeft && vision.eyeRight
      ? frameFromEyes(vision.eyeLeft, vision.eyeRight)
      : null;

  // Un document qui n'est pas marocain doit sauter aux yeux de l'appelant :
  // tout le reste du pipeline (format du numéro, gabarit de page, position du
  // portrait) suppose un passeport marocain et ne vaut plus rien sur un autre.
  const foreignDocument = mrz?.foreignDocument ?? null;

  return Response.json({
    foreignDocument,
    corners: vision.corners,
    cornersConfidence: vision.cornersConfidence,
    eyes: vision.eyeLeft && vision.eyeRight ? { left: vision.eyeLeft, right: vision.eyeRight } : null,
    photoFrame: frame,
    mrz,
    vision,
    crossCheck: crossCheck(vision, mrz),
  });
}

/**
 * Là où la MRZ et le texte visible se recoupent, un désaccord est un signal :
 * soit l'image est mauvaise, soit un des deux a été mal lu. On le remonte au
 * lieu de choisir en silence.
 */
function crossCheck(
  vision: Awaited<ReturnType<typeof analysePassport>>,
  mrz: ReturnType<typeof parseTd3> | null,
) {
  if (!mrz) return { checked: false as const, disagreements: [] };

  const strip = (s: string | null) =>
    (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  const pairs: [string, string, string][] = [
    ["surname", strip(vision.surnameLatin), strip(mrz.surname.value)],
    ["givenNames", strip(vision.givenNamesLatin), strip(mrz.givenNames.value)],
    ["passportNumber", strip(vision.passportNumber), strip(mrz.passportNumber.value)],
    ["sex", strip(vision.sex), strip(mrz.sex.value)],
    ["dateOfBirth", strip(vision.dateOfBirth), strip(mrz.dateOfBirth.value)],
    ["dateOfExpiry", strip(vision.dateOfExpiry), strip(mrz.dateOfExpiry.value)],
  ];

  const disagreements = pairs
    .filter(([, a, b]) => a && b && a !== b)
    .map(([field, visual, fromMrz]) => ({ field, visual, mrz: fromMrz }));

  return { checked: true as const, disagreements };
}
