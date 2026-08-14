/**
 * Villes et provinces marocaines : nom latin → nom arabe.
 *
 * Pourquoi une table plutôt que la réponse du modèle.
 *
 * Identifier la ville dans une adresse est un travail que Gemini fait bien.
 * L'écrire en arabe TOUJOURS DE LA MÊME FAÇON, non : rien ne l'empêche de
 * produire « القنيطرة » un jour et « قنيطرة » le lendemain, ni « الدار البيضاء »
 * puis « كازابلانكا ». Deux orthographes pour une même ville, et la table des
 * inscriptions se retrouve avec deux entrées à regrouper à la main.
 *
 * Le nombre de villes marocaines étant fini, la table tranche une fois pour
 * toutes. Le modèle reconnaît, la table écrit — chacun ce qu'il sait faire.
 *
 * Ce que la table ne couvre pas retombe sur la réponse du modèle, signalée
 * comme telle : mieux vaut une orthographe incertaine qu'un champ vide, à
 * condition de savoir laquelle est laquelle.
 */

/** Grandes villes, chefs-lieux et provinces. */
const CITIES: Record<string, string> = {
  CASABLANCA: "الدار البيضاء",
  RABAT: "الرباط",
  MARRAKECH: "مراكش",
  FES: "فاس",
  TANGER: "طنجة",
  MEKNES: "مكناس",
  SALE: "سلا",
  AGADIR: "أكادير",
  OUJDA: "وجدة",
  KENITRA: "القنيطرة",
  TETOUAN: "تطوان",
  TEMARA: "تمارة",
  SAFI: "آسفي",
  MOHAMMEDIA: "المحمدية",
  KHOURIBGA: "خريبكة",
  "EL JADIDA": "الجديدة",
  "BENI MELLAL": "بني ملال",
  TAZA: "تازة",
  NADOR: "الناظور",
  SETTAT: "سطات",
  BERRECHID: "برشيد",
  LARACHE: "العرائش",
  KHENIFRA: "خنيفرة",
  "KELAA DES SRAGHNA": "قلعة السراغنة",
  "AL HOCEIMA": "الحسيمة",
  TAROUDANT: "تارودانت",
  OUARZAZATE: "ورزازات",
  ESSAOUIRA: "الصويرة",
  BENSLIMANE: "بنسليمان",
  "FQUIH BEN SALAH": "الفقيه بن صالح",
  "SIDI KACEM": "سيدي قاسم",
  "SIDI SLIMANE": "سيدي سليمان",
  "BEN GUERIR": "ابن جرير",
  ERRACHIDIA: "الرشيدية",
  TIFLET: "تيفلت",
  LAAYOUNE: "العيون",
  DAKHLA: "الداخلة",
  GUELMIM: "كلميم",
  "TAN TAN": "طانطان",
  CHEFCHAOUEN: "شفشاون",
  AZROU: "أزرو",
  IFRANE: "إفران",
  ZAGORA: "زاكورة",
  TINGHIR: "تنغير",
  MIDELT: "ميدلت",
  SKHIRAT: "الصخيرات",
  BOUSKOURA: "بوسكورة",
  NOUACEUR: "النواصر",
  MDIQ: "المضيق",
  FNIDEQ: "الفنيدق",
  OUAZZANE: "وزان",
  GUERCIF: "جرسيف",
  TAOURIRT: "تاوريرت",
  BERKANE: "بركان",
  "SIDI BENNOUR": "سيدي بنور",
  YOUSSOUFIA: "اليوسفية",
  AZEMMOUR: "أزمور",
  TAOUNATE: "تاونات",
  REHAMNA: "الرحامنة",
  CHICHAOUA: "شيشاوة",
  "EL HAJEB": "الحاجب",
  BOULEMANE: "بولمان",
  FIGUIG: "فجيج",
  TATA: "طاطا",
  "SIDI IFNI": "سيدي إفني",
  TIZNIT: "تيزنيت",
  INEZGANE: "إنزكان",
  "AIT MELLOUL": "أيت ملول",
  BOUJDOUR: "بوجدور",
  "ES SEMARA": "السمارة",
  ESSMARA: "السمارة",
  ASSA: "أسا",
  "OUED ED DAHAB": "وادي الذهب",
  TALMEST: "تالمست",
  JAAFRA: "الجعافرة",
  SEFROU: "صفرو",
  "MOULAY YACOUB": "مولاي يعقوب",
  "SIDI BOUZID": "سيدي بوزيد",
  "OULED TEIMA": "أولاد تايمة",
  "BENI ANSAR": "بني انصار",
  DRIOUCH: "الدريوش",
  JERADA: "جرادة",
  "AIN HARROUDA": "عين حرودة",
  "HAD SOUALEM": "حد السوالم",
  DEROUA: "الدروة",
  "BOUZNIKA": "بوزنيقة",
  "SIDI YAHYA EL GHARB": "سيدي يحيى الغرب",
  "SOUK EL ARBAA": "سوق الأربعاء",
  MECHRA: "مشرع بلقصيري",

  // Arrondissements et préfectures de Casablanca : ils apparaissent souvent
  // comme autorité de délivrance à la place de la ville elle-même.
  "SIDI BELYOUT": "سيدي بليوط",
  "HAY MOHAMMADI": "الحي المحمدي",
  ANFA: "أنفا",
  "MOULAY RACHID": "مولاي رشيد",
  "BEN MSICK": "بن مسيك",
  MAARIF: "المعاريف",
  "AIN CHOCK": "عين الشق",
  "AIN SEBAA": "عين السبع",
  "AL FIDA": "الفداء",
  "HAY HASSANI": "الحي الحسني",
  "SIDI BERNOUSSI": "سيدي البرنوصي",
  "MERS SULTAN": "مرس السلطان",
};

/** Écritures alternatives rencontrées sur les documents. */
const ALIASES: Record<string, string> = {
  CASA: "CASABLANCA",
  "DAR EL BEIDA": "CASABLANCA",
  FEZ: "FES",
  TANGIER: "TANGER",
  TANJA: "TANGER",
  MARRAKESH: "MARRAKECH",
  "BENI MELLAL KHENIFRA": "BENI MELLAL",
  "EL KELAA DES SRAGHNA": "KELAA DES SRAGHNA",
  "EL KELAA": "KELAA DES SRAGHNA",
  KELAA: "KELAA DES SRAGHNA",
  HOCEIMA: "AL HOCEIMA",
  "EL HOCEIMA": "AL HOCEIMA",
  TANTAN: "TAN TAN",
  SMARA: "ES SEMARA",
  "EL AAIUN": "LAAYOUNE",
  AIOUN: "LAAYOUNE",
  RHAMNA: "REHAMNA",
  BENGUERIR: "BEN GUERIR",
  "BEN GUERIR REHAMNA": "BEN GUERIR",
  "OULAD TEIMA": "OULED TEIMA",
  BERRCHID: "BERRECHID",
  "SIDI MAAROUF": "CASABLANCA",
  "HAY RIAD": "RABAT",
  AGDAL: "RABAT",
  YACOUB: "MOULAY YACOUB",
};

/**
 * Ramène une chaîne à une forme comparable : sans accents, sans ponctuation,
 * sans les mots de service qui entourent le nom sur un passeport.
 */
export function normaliseCity(input: string): string {
  let s = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")     // accents
    .toUpperCase()
    .replace(/[’'`]/g, " ")
    .replace(/[^A-Z0-9\s-]/g, " ")
    .replace(/-/g, " ");

  // Un passeport écrit « PREFECTURE DE RABAT », « KENITRA /MAR », « SIDI
  // BELYOUT /MAROC » : le nom utile est noyé dans des mots constants.
  s = s
    .replace(/\b(PREFECTURE|PROVINCE|WILAYA|COMMUNE|ARRONDISSEMENT|CERCLE|CAIDAT)\b/g, " ")
    .replace(/\b(DE|DU|DES|D|LA|LE|LES|OF)\b/g, " ")
    .replace(/\bMAROC\b|\bMOROCCO\b|\bMAR\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

/**
 * EL et AL sont ambigus : articles dans « PROVINCE DE EL JADIDA », mais partie
 * du nom dans « AL FIDA » ou « AL HOCEIMA ». On ne devine pas — on essaie les
 * deux formes et on garde celle que la table reconnaît.
 */
function variants(norm: string): string[] {
  const without = norm.replace(/\b(EL|AL)\b/g, " ").replace(/\s+/g, " ").trim();
  return without && without !== norm ? [norm, without] : [norm];
}

export type CitySource = "table" | "model" | "none";

export interface CityResult {
  /** Nom arabe retenu, ou null si rien n'a pu être établi. */
  arabic: string | null;
  /** Nom latin normalisé qui a servi à la correspondance. */
  matched: string | null;
  source: CitySource;
}

/**
 * Trouve la ville dans un libellé et rend son nom arabe.
 *
 * `modelArabic` est la réponse de Gemini : elle sert de recours quand la table
 * ne connaît pas le lieu, jamais de préférence quand elle le connaît.
 */
export function cityToArabic(latin: string | null, modelArabic?: string | null): CityResult {
  if (!latin || !latin.trim()) {
    return modelArabic
      ? { arabic: modelArabic, matched: null, source: "model" }
      : { arabic: null, matched: null, source: "none" };
  }

  const norm = normaliseCity(latin);
  const resolve = (key: string): string | null => {
    const target = ALIASES[key] ?? key;
    return CITIES[target] ?? null;
  };

  for (const form of variants(norm)) {
    // Correspondance exacte d'abord.
    const direct = resolve(form);
    if (direct) return { arabic: direct, matched: form, source: "table" };

    // Sinon la plus longue entrée contenue dans le libellé : une adresse
    // complète porte la ville au milieu d'un numéro, d'une rue et d'un
    // quartier. La plus longue gagne, pour que « SIDI BENNOUR » l'emporte
    // sur « SIDI ».
    const words = form.split(" ").filter(Boolean);
    let best: { key: string; arabic: string; len: number } | null = null;
    for (const key of [...Object.keys(CITIES), ...Object.keys(ALIASES)]) {
      const parts = key.split(" ");
      if (parts.length > words.length) continue;
      for (let i = 0; i + parts.length <= words.length; i++) {
        if (parts.every((p, k) => words[i + k] === p)) {
          const arabic = resolve(key);
          if (arabic && (!best || key.length > best.len)) best = { key, arabic, len: key.length };
        }
      }
    }
    if (best) return { arabic: best.arabic, matched: best.key, source: "table" };
  }

  return modelArabic
    ? { arabic: modelArabic, matched: null, source: "model" }
    : { arabic: null, matched: null, source: "none" };
}

/** Nombre d'entrées, pour information dans les diagnostics. */
export const CITY_COUNT = Object.keys(CITIES).length;
