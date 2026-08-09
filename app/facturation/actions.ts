'use server'

/**
 * Passerelle entre l'interface du prototype (`ApplicationFacturation`,
 * `ActionsFacturation`) et `service.ts`, jamais modifié. Chaque action
 * revérifie l'accès omra (`requireActiveAccount`) puis délègue — l'identité
 * et l'autorisation réelles restent décidées par `resolve_facturation_actor()`
 * côté SQL, jamais ici.
 */

import { requireActiveAccount } from '@/lib/admin-guard'
import type { FiltresRegistre } from '@/modules/facturation/domain/rules/cheque-register'
import type { SaisieAnnulation } from '@/modules/facturation/domain/rules/cancellation'
import type { SaisieNouveauRecu } from '@/modules/facturation/domain/rules/create-receipt'
import type { ResultatModification, SaisieModification } from '@/modules/facturation/domain/rules/edit-sections'
import type { Resultat } from '@/modules/facturation/domain/rules/errors'
import type { PeriodeFinance } from '@/modules/facturation/domain/rules/finance-day'
import type { SaisieVersement } from '@/modules/facturation/domain/rules/payment'
import type { Modification, PageJournalOperations, Recu, Utilisateur } from '@/modules/facturation/domain/types'
import {
  acquitterAnomalies,
  ajouterImageDernierVersement,
  ajouterImageOperation,
  ajouterImagesPasseport,
  ajouterVersement,
  annulerRecu,
  chargerEtat,
  connecter,
  creerRecu,
  deconnecter,
  enregistrerImpressionFinance,
  enregistrerImpressionRecu,
  historiqueRecu,
  journalFinancier,
  journalOperations,
  modifierRecu,
  previsualiserModification,
  registreBancaire,
  suiviJournalier,
  supprimerImageOperation,
  type EtatFacturation,
  type JournalFinancier,
  type RegistreBancaire,
  type SuiviJournalier,
} from '@/modules/facturation/data/service'
import type { FiltresJournalOperations } from '@/modules/facturation/data/ports'

async function extraireFichier(
  donnees: FormData,
  champ: string,
): Promise<{ contenu: ArrayBuffer; nomOrigine: string; typeMime: string } | null> {
  const fichier = donnees.get(champ)
  if (!(fichier instanceof File) || fichier.size <= 0) return null
  return {
    contenu: await fichier.arrayBuffer(),
    nomOrigine: fichier.name,
    typeMime: fichier.type,
  }
}

/**
 * Porte propre à la Facturation (séparation étanche Facturation/
 * Administration) : authentifie directement sur `account_slots`, sans passer
 * par `/login` (la porte Administration, `admin_accounts`). Aucune
 * revérification `requireActiveAccount()` ici — il n'y a justement pas
 * encore de session avant cet appel.
 */
export async function connecterAction(
  identifiant: string,
  motDePasse: string,
): Promise<Utilisateur | null> {
  return connecter(identifiant, motDePasse)
}

export async function deconnecterAction(): Promise<void> {
  await requireActiveAccount()
  await deconnecter()
}

export async function rechargerAction(): Promise<EtatFacturation> {
  await requireActiveAccount()
  return chargerEtat()
}

export async function creerRecuAction(
  saisie: SaisieNouveauRecu,
  confirme: boolean,
): Promise<Resultat<{ recuId: string; numero: number }>> {
  await requireActiveAccount()
  return creerRecu(saisie, confirme)
}

export async function ajouterVersementAction(
  saisie: SaisieVersement,
  confirme: boolean,
): Promise<Resultat<{ recuId: string }>> {
  await requireActiveAccount()
  return ajouterVersement(saisie, confirme)
}

export async function annulerRecuAction(recuId: string, saisie: SaisieAnnulation): Promise<Resultat<null>> {
  await requireActiveAccount()
  return annulerRecu(recuId, saisie)
}

/**
 * Précision du commanditaire (2026-08-09) : lecture fraîche pour le
 * récapitulatif avant/après (`ModaleRecapitulatif`) — n'écrit jamais.
 */
export async function previsualiserModificationAction(
  recuId: string,
  saisie: SaisieModification,
  confirme = false,
): Promise<Resultat<{ avant: Recu; resultat: ResultatModification }>> {
  await requireActiveAccount()
  return previsualiserModification(recuId, saisie, confirme)
}

export async function modifierRecuAction(
  recuId: string,
  saisie: SaisieModification,
  confirme = false,
): Promise<Resultat<null>> {
  await requireActiveAccount()
  return modifierRecu(recuId, saisie, confirme)
}

export async function enregistrerImpressionAction(recuId: string): Promise<Resultat<null>> {
  await requireActiveAccount()
  return enregistrerImpressionRecu(recuId)
}

export async function historiqueRecuAction(recuId: string): Promise<Modification[]> {
  await requireActiveAccount()
  return historiqueRecu(recuId)
}

export async function journalFinancierAction(periode: PeriodeFinance): Promise<JournalFinancier> {
  await requireActiveAccount()
  return journalFinancier(periode)
}

/**
 * Journal des opérations (سجل العمليات) — comme les autres actions de ce
 * fichier, ne revérifie que la session omra active ; le refus des postes 2 à
 * 6 est décidé par `require_facturation_admin()` côté RPC, jamais dupliqué
 * ici.
 */
export async function journalOperationsAction(
  filtres: FiltresJournalOperations,
): Promise<PageJournalOperations> {
  await requireActiveAccount()
  return journalOperations(filtres)
}

export async function enregistrerImpressionFinanceAction(
  jour: string,
): Promise<Resultat<{ numeroImpression: number }>> {
  await requireActiveAccount()
  return enregistrerImpressionFinance(jour)
}

export async function acquitterAnomaliesAction(jour: string): Promise<Resultat<null>> {
  await requireActiveAccount()
  return acquitterAnomalies(jour)
}

export async function suiviJournalierAction(options: {
  mois?: string
  selection?: readonly string[]
  afficherVides?: boolean
}): Promise<SuiviJournalier> {
  await requireActiveAccount()
  return suiviJournalier(options)
}

export async function registreBancaireAction(
  filtres: Partial<FiltresRegistre>,
  cleSelectionnee: string | null,
): Promise<RegistreBancaire> {
  await requireActiveAccount()
  return registreBancaire(filtres, cleSelectionnee)
}

export async function ajouterImageOperationAction(donnees: FormData): Promise<Resultat<null>> {
  await requireActiveAccount()
  const cle = String(donnees.get('cle') ?? '')
  const fichier = await extraireFichier(donnees, 'fichier')
  return ajouterImageOperation(cle, fichier)
}

export async function supprimerImageOperationAction(cle: string): Promise<Resultat<null>> {
  await requireActiveAccount()
  return supprimerImageOperation(cle)
}

export async function ajouterImageDernierVersementAction(donnees: FormData): Promise<Resultat<null>> {
  await requireActiveAccount()
  const recuId = String(donnees.get('recuId') ?? '')
  const fichier = await extraireFichier(donnees, 'fichier')
  return ajouterImageDernierVersement(recuId, fichier)
}

export async function ajouterImagesPasseportAction(donnees: FormData): Promise<Resultat<null>> {
  await requireActiveAccount()
  const recuId = String(donnees.get('recuId') ?? '')
  const originale = await extraireFichier(donnees, 'originale')
  const portrait = await extraireFichier(donnees, 'portrait')
  const fichiers = originale && portrait ? { originale, portrait } : null
  return ajouterImagesPasseport(recuId, fichiers)
}
