/**
 * Vérifications de la lecture MRZ.
 *
 * Les identités ci-dessous sont inventées ; seuls les chiffres de contrôle sont
 * authentiques, calculés selon la norme. Aucune donnée réelle de pèlerin ne doit
 * entrer dans le dépôt.
 *
 * Exécution : node --experimental-strip-types --test lib/passport/mrz.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDigit, parseTd3, repairField } from "./mrz.ts";

const AT = new Date("2026-08-14T00:00:00Z");

const ALAOUI: [string, string] = [
  "P<MARALAOUI<<YOUSSEF<<<<<<<<<<<<<<<<<<<<<<<<",
  "AB12345671MAR8001151M3002201XY12345<<<<<<<66",
];
const BENNANI: [string, string] = [
  "P<MARBENNANI<<SALMA<<<<<<<<<<<<<<<<<<<<<<<<<",
  "CD98765435MAR7506305F2811051QQ98765<<<<<<<74",
];
/** Sans numéro personnel : cas courant, et le contrôle correspondant est absent. */
const IDRISSI: [string, string] = [
  "P<MARIDRISSI<<OMAR<<<<<<<<<<<<<<<<<<<<<<<<<<",
  "EF11122239MAR9203077M2612317<<<<<<<<<<<<<<00",
];

const join = ([a, b]: [string, string]) => a + "\n" + b;

test("chiffre de contrôle — vecteurs de la norme OACI 9303", () => {
  assert.equal(checkDigit("D23145890734"), 9);
  assert.equal(checkDigit("340712"), 7);
  assert.equal(checkDigit("AB2134<<<"), 5);
});

test("lecture complète d'une MRZ valide", () => {
  const r = parseTd3(join(ALAOUI), AT);
  assert.equal(r.ok, true);
  assert.equal(r.compositeValid, true);
  assert.equal(r.checksPassed, 5);
  assert.equal(r.surname.value, "ALAOUI");
  assert.equal(r.givenNames.value, "YOUSSEF");
  assert.equal(r.passportNumber.value, "AB1234567");
  assert.equal(r.passportNumber.status, "verified");
  assert.equal(r.nationality, "MAR");
  assert.equal(r.sex.value, "M");
  assert.equal(r.dateOfBirth.value, "15/01/1980");
  assert.equal(r.dateOfExpiry.value, "20/02/2030");
  assert.equal(r.personalNumber.value, "XY12345");
  assert.deepEqual(r.warnings, []);
});

test("prénoms multiples et numéro personnel absent", () => {
  const r = parseTd3(join(IDRISSI), AT);
  assert.equal(r.ok, true);
  assert.equal(r.personalNumber.value, "");
  assert.equal(r.dateOfExpiry.value, "31/12/2026");
});

test("le siècle des dates est déduit, pas supposé", () => {
  // 75 → naissance en 1975, expiration en 2028 : la même règle donnerait faux.
  const r = parseTd3(join(BENNANI), AT);
  assert.equal(r.dateOfBirth.value, "30/06/1975");
  assert.equal(r.dateOfExpiry.value, "05/11/2028");
});

test("une lettre lue à la place d'un chiffre est corrigée dans une date", () => {
  const damaged = BENNANI[1].slice(0, 13) + "75O630" + BENNANI[1].slice(19);
  const r = parseTd3(BENNANI[0] + "\n" + damaged, AT);
  assert.equal(r.dateOfBirth.value, "30/06/1975");
  assert.equal(r.dateOfBirth.status, "repaired");
  assert.equal(r.compositeValid, true, "le contrôle global doit repartir des champs corrigés");
});

test("une confusion dans le numéro de passeport est corrigée", () => {
  const damaged = "ABI2345671" + ALAOUI[1].slice(10);
  const r = parseTd3(ALAOUI[0] + "\n" + damaged, AT);
  assert.equal(r.passportNumber.value, "AB1234567");
  assert.equal(r.passportNumber.status, "repaired");
});

test("une vraie erreur n'est pas maquillée en correction", () => {
  // Un 4 lu 9 : aucune confusion OCR plausible ne rattrape le contrôle.
  const damaged = "AB1239567" + ALAOUI[1].slice(9);
  const r = parseTd3(ALAOUI[0] + "\n" + damaged, AT);
  assert.equal(r.passportNumber.status, "invalid");
  assert.equal(r.ok, false);
  assert.ok(r.warnings.some((w) => w.includes("Numéro de passeport")));
});

test("une seule substitution est corrigée, pas deux", () => {
  const one = repairField("ABI234567", checkDigit("AB1234567"), "alnum");
  assert.equal(one?.value, "AB1234567");
  assert.equal(one?.repaired, true);

  // Deux erreurs : la correction à une substitution qui tombe juste par hasard
  // n'est pas la bonne valeur. C'est la limite d'un chiffre de contrôle décimal.
  const two = repairField("ABI2345G7", checkDigit("AB1234567"), "alnum");
  assert.notEqual(two?.value, "AB1234567");
});

test("une correction reste une hypothèse, et le statut le dit", () => {
  // Cas limite mesuré, pas théorique : la valeur exacte est "AB1234567", elle
  // est lue "ABI2345G7", et la correction "AB12345G7" satisfait À LA FOIS le
  // contrôle du champ et le contrôle global. Aucun des deux juges ne peut la
  // rejeter — c'est la limite d'un chiffre de contrôle décimal.
  //
  // D'où le contrat : `repaired` n'est jamais synonyme de vérifié. Un champ
  // dans cet état doit être confirmé à l'écran avant d'être enregistré.
  const damaged = "ABI2345G7" + ALAOUI[1].slice(9);
  const r = parseTd3(ALAOUI[0] + "\n" + damaged, AT);
  assert.equal(r.passportNumber.status, "repaired");
  assert.notEqual(r.passportNumber.status, "verified");
  assert.ok(r.warnings.some((w) => w.includes("Numéro de passeport")));
});

test("une correction que le contrôle global dément est signalée, pas retenue", () => {
  // Le champ est réparable en apparence, mais aucune réparation ne satisfait
  // l'ensemble de la ligne : on refuse de présenter une valeur inventée.
  const damaged = "AB1239567" + ALAOUI[1].slice(9);
  const r = parseTd3(ALAOUI[0] + "\n" + damaged, AT);
  assert.notEqual(r.passportNumber.status, "verified");
  assert.notEqual(r.passportNumber.status, "repaired");
  assert.equal(r.ok, false);
});

test("une date impossible est signalée plutôt qu'acceptée", () => {
  const dob = "800230"; // 30 février
  const l2 = ALAOUI[1].slice(0, 13) + dob + String(checkDigit(dob)) + ALAOUI[1].slice(20);
  const r = parseTd3(ALAOUI[0] + "\n" + l2, AT);
  assert.equal(r.dateOfBirth.status, "invalid");
  assert.ok(r.warnings.some((w) => w.includes("Date de naissance illisible")));
});

test("une entrée tronquée ne fait pas tomber la lecture", () => {
  const r = parseTd3("P<MARALAOUI<<YOUSSEF", AT);
  assert.equal(r.ok, false);
  assert.ok(r.warnings.length > 0);
});

test("les caractères parasites de l'OCR sont normalisés", () => {
  const noisy = ALAOUI[0].replace(/</g, "«") + "\n" + ALAOUI[1].replace(/</g, "‹");
  const r = parseTd3(noisy, AT);
  assert.equal(r.ok, true);
  assert.equal(r.surname.value, "ALAOUI");
});
