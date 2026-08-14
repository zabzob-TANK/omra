import { analysePassport } from "@/lib/passport/gemini";
import { parseTd3 } from "@/lib/passport/mrz";
import { frameFromEyes } from "@/lib/passport/photoFrame";
import { cityToArabic } from "@/lib/passport/cities";
import { reconcile } from "@/lib/passport/reconcile";

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

  // Le point entre les deux yeux, exposé tel quel : c'est le repère sur lequel
  // se cale le cadre du portrait, et celui qu'on déplace si le cadrage est à
  // reprendre à la main.
  const eyeCenter =
    vision.eyeLeft && vision.eyeRight
      ? {
          x: (vision.eyeLeft.x + vision.eyeRight.x) / 2,
          y: (vision.eyeLeft.y + vision.eyeRight.y) / 2,
        }
      : null;

  // Un document qui n'est pas marocain doit sauter aux yeux de l'appelant :
  // tout le reste du pipeline (format du numéro, gabarit de page, position du
  // portrait) suppose un passeport marocain et ne vaut plus rien sur un autre.
  const foreignDocument = mrz?.foreignDocument ?? null;

  // Les villes en arabe sont indicatives. La table sert surtout à écrire deux
  // fois la même ville de la même façon ; ce qu'elle ne connaît pas garde la
  // réponse du modèle, avec sa provenance, pour qu'on sache quoi relire.
  const places = {
    birth: cityToArabic(vision.placeOfBirth, vision.placeOfBirthArabic),
    residence: cityToArabic(vision.address, vision.addressArabic),
    authority: cityToArabic(vision.issuingAuthority, vision.issuingAuthorityArabic),
  };

  return Response.json({
    foreignDocument,
    places,
    corners: vision.corners,
    cornersConfidence: vision.cornersConfidence,
    eyes: vision.eyeLeft && vision.eyeRight
      ? { left: vision.eyeLeft, right: vision.eyeRight, center: eyeCenter }
      : null,
    photoFrame: frame,
    mrz,
    vision,
    reconciliation: reconcile(vision, mrz),
  });
}
