/**
 * Cadre du portrait, déduit de la position des deux yeux.
 *
 * C'est la règle qu'on applique à la main quand on recadre : centrer entre les
 * yeux, un peu au-dessus du milieu. Écrite une fois, elle donne exactement le
 * même cadrage sur tous les documents — ce qu'une boîte à coordonnées fixes ne
 * peut pas faire, parce que les visages ne sont pas tous à la même hauteur ni
 * à la même taille dans la photo du passeport.
 *
 * L'écart entre les yeux sert d'unité de mesure : il est proportionnel à la
 * taille du visage, donc le cadre s'adapte tout seul.
 */

export interface Point {
  x: number;
  y: number;
}

export interface FrameOptions {
  /** Largeur du cadre, en écarts inter-oculaires. */
  widthPerEyeSpan?: number;
  /** Rapport largeur / hauteur voulu. 35×45 mm ≈ 0,778 ; carré = 1. */
  aspect?: number;
  /** Hauteur de la ligne des yeux, en fraction depuis le HAUT du cadre. */
  eyeLine?: number;
  /** Corriger l'inclinaison du visage à partir de l'angle des yeux. */
  levelFace?: boolean;
  /** Au-delà de cet angle, on suppose une détection fausse et on ne redresse pas. */
  maxTiltDeg?: number;
}

/**
 * Valeurs de départ, à recaler une fois sur un lot de vrais documents —
 * exactement comme la boîte à coordonnées fixes l'a été.
 */
export const DEFAULT_FRAME: Required<FrameOptions> = {
  widthPerEyeSpan: 3.2,
  aspect: 0.778,
  eyeLine: 0.45,
  levelFace: true,
  maxTiltDeg: 20,
};

/** Rectangle éventuellement incliné, décrit par son centre. */
export interface OrientedRect {
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** Radians. 0 quand le visage est droit. */
  angle: number;
}

export interface FrameResult {
  rect: OrientedRect;
  /** Écart entre les yeux, en pixels. Sert d'indicateur de résolution. */
  eyeSpan: number;
  tiltDeg: number;
  /** Vrai si l'inclinaison dépassait la limite et a été ignorée. */
  tiltIgnored: boolean;
}

export function frameFromEyes(
  eyeLeft: Point,
  eyeRight: Point,
  opts: FrameOptions = {},
): FrameResult | null {
  const o = { ...DEFAULT_FRAME, ...opts };

  const dx = eyeRight.x - eyeLeft.x;
  const dy = eyeRight.y - eyeLeft.y;
  const eyeSpan = Math.hypot(dx, dy);
  if (!Number.isFinite(eyeSpan) || eyeSpan < 1) return null;

  const tilt = Math.atan2(dy, dx);
  const tiltDeg = (tilt * 180) / Math.PI;
  // Un angle aberrant trahit une détection fausse plutôt qu'une tête penchée :
  // dans le doute on garde le cadre droit, on ne l'aggrave pas.
  const tiltIgnored = Math.abs(tiltDeg) > o.maxTiltDeg;
  const angle = o.levelFace && !tiltIgnored ? tilt : 0;

  const width = eyeSpan * o.widthPerEyeSpan;
  const height = width / o.aspect;

  // Le centre du cadre est décalé vers le bas depuis la ligne des yeux,
  // le long de l'axe vertical DU VISAGE, pas de l'image.
  const mid = { x: (eyeLeft.x + eyeRight.x) / 2, y: (eyeLeft.y + eyeRight.y) / 2 };
  const down = height * (0.5 - o.eyeLine);
  const cx = mid.x - Math.sin(angle) * down;
  const cy = mid.y + Math.cos(angle) * down;

  return { rect: { cx, cy, width, height, angle }, eyeSpan, tiltDeg, tiltIgnored };
}

/** Les 4 sommets, dans l'ordre haut-gauche → sens horaire. */
export function rectCorners(r: OrientedRect): [Point, Point, Point, Point] {
  const c = Math.cos(r.angle), s = Math.sin(r.angle);
  const hw = r.width / 2, hh = r.height / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({
    x: r.cx + x * c - y * s,
    y: r.cy + x * s + y * c,
  })) as [Point, Point, Point, Point];
}

/**
 * Cadre replié dans les limites d'une image. Utile quand le portrait touche le
 * bord de la page : mieux vaut décaler le cadre que produire une bande vide.
 */
export function clampRect(r: OrientedRect, width: number, height: number): OrientedRect {
  const w = Math.min(r.width, width), h = Math.min(r.height, height);
  return {
    ...r,
    width: w,
    height: h,
    cx: Math.min(width - w / 2, Math.max(w / 2, r.cx)),
    cy: Math.min(height - h / 2, Math.max(h / 2, r.cy)),
  };
}
