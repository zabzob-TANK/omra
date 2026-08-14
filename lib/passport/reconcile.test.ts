/**
 * Le rapprochement ne doit jamais trancher à la place de l'opérateur.
 * Identités inventées.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile } from "./reconcile.ts";
import { parseTd3 } from "./mrz.ts";
import type { PassportVision } from "./gemini.ts";

const AT = new Date("2026-08-14T00:00:00Z");
const MRZ =
  "P<MARALAOUI<<YOUSSEF<<<<<<<<<<<<<<<<<<<<<<<<\n" +
  "AB12345671MAR8001151M3002201XY12345<<<<<<<66";

const base: PassportVision = {
  corners: null, cornersConfidence: null, eyeLeft: null, eyeRight: null,
  rawMrz: MRZ,
  surnameArabic: "العلوي", givenNamesArabic: "يوسف",
  surnameLatin: "ALAOUI", givenNamesLatin: "YOUSSEF",
  passportNumber: "AB1234567", personalNumber: "XY12345",
  nationality: "MAR", sex: "M",
  dateOfBirth: "15/01/1980", dateOfIssue: "20/02/2020", dateOfExpiry: "20/02/2030",
  placeOfBirth: "CASABLANCA / MAROC", placeOfBirthArabic: null,
  address: null, addressArabic: null,
  issuingAuthority: null, issuingAuthorityArabic: null,
  unreadableFields: [], notes: null,
};
const get = (r: ReturnType<typeof reconcile>, f: string) =>
  r.fields.find((x) => x.field === f)!;

test("deux lectures concordantes ne signalent rien", () => {
  const r = reconcile(base, parseTd3(MRZ, AT));
  assert.equal(r.conflicts, 0);
  assert.equal(r.provenConflicts, 0);
  assert.equal(get(r, "passportNumber").agree, true);
  assert.equal(get(r, "passportNumber").severity, "none");
});

test("la ponctuation et les accents ne créent pas de faux désaccords", () => {
  const r = reconcile({ ...base, surnameLatin: "Alaoui", dateOfBirth: "15-01-1980" },
                      parseTd3(MRZ, AT));
  assert.equal(get(r, "surnameLatin").agree, true);
  assert.equal(get(r, "dateOfBirth").agree, true);
});

test("un désaccord sur un champ prouvé par checksum est signalé fortement", () => {
  const r = reconcile({ ...base, passportNumber: "AB1234999" }, parseTd3(MRZ, AT));
  const f = get(r, "passportNumber");
  assert.equal(f.agree, false);
  assert.equal(f.severity, "warning");
  assert.equal(f.visual, "AB1234999");
  assert.equal(f.mrz, "AB1234567");
  assert.equal(r.provenConflicts, 1);
});

test("les deux valeurs restent visibles et rien n'est écrasé", () => {
  const r = reconcile({ ...base, dateOfBirth: "16/01/1980" }, parseTd3(MRZ, AT));
  const f = get(r, "dateOfBirth");
  assert.equal(f.visual, "16/01/1980");
  assert.equal(f.mrz, "15/01/1980");
  // La MRZ compare, elle n'impose pas : le champ reste pré-rempli avec la
  // lecture visuelle, et c'est l'opérateur qui tranche.
  assert.equal(f.value, "16/01/1980");
});

test("un désaccord sur un champ non prouvé est signalé plus doucement", () => {
  // Les noms ne sont couverts par aucun chiffre de contrôle.
  const r = reconcile({ ...base, surnameLatin: "ALAOUY" }, parseTd3(MRZ, AT));
  const f = get(r, "surnameLatin");
  assert.equal(f.agree, false);
  assert.equal(f.severity, "notice");
  assert.equal(r.conflicts, 1);
  assert.equal(r.provenConflicts, 0);
});

test("un champ absent de la page est repris de la MRZ", () => {
  const r = reconcile({ ...base, personalNumber: null }, parseTd3(MRZ, AT));
  const f = get(r, "personalNumber");
  assert.equal(f.agree, null, "une absence n'est pas un désaccord");
  assert.equal(f.value, "XY12345");
  assert.equal(f.severity, "notice");
});

test("un champ absent des deux côtés ne signale rien", () => {
  const r = reconcile({ ...base, address: null }, parseTd3(MRZ, AT));
  const f = get(r, "address");
  assert.equal(f.agree, null);
  assert.equal(f.severity, "none");
  assert.equal(f.value, null);
});

test("les champs hors MRZ sont présents mais jamais comparés", () => {
  const r = reconcile(base, parseTd3(MRZ, AT));
  for (const f of ["surnameArabic", "givenNamesArabic", "dateOfIssue", "issuingAuthority"]) {
    assert.equal(get(r, f).agree, null, f);
    assert.equal(get(r, f).mrz, null, f);
  }
});

test("sans MRZ lisible, tout reste exploitable", () => {
  const r = reconcile(base, null);
  assert.equal(r.conflicts, 0);
  assert.equal(get(r, "passportNumber").value, "AB1234567");
  assert.equal(get(r, "passportNumber").agree, null);
});
