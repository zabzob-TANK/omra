/**
 * Comparaison en direct, contre la vraie saison active de production :
 * le chemin RAPIDE (RPC à plat — `list_billing_season_payments`,
 * `list_billing_season_modifications`, `list_billing_receipts` allégé) doit
 * produire EXACTEMENT les mêmes montants, lignes, totaux et compteurs que le
 * chemin de RÉFÉRENCE (reconstruction complète, un `get_billing_receipt_details`
 * par reçu — le chemin N+1 d'origine, coûteux mais indiscutablement correct),
 * une fois passés dans le MÊME code de domaine courant.
 *
 * Décision de conception (2026-08-09, à la demande du commanditaire) : ce
 * fichier reste dans le dépôt comme commande rejouable, pas comme script
 * jetable — il doit pouvoir revérifier n'importe quelle étape future du
 * chantier de performance (registre léger, rafraîchissement ciblé...) de la
 * même façon que les trois premiers écrans (Paiements, Journal financier,
 * Suivi journalier). C'est pourquoi il compare deux CHEMINS DE DONNÉES
 * (rapide vs référence) plutôt que deux VERSIONS DE CODE figées dans
 * l'historique Git : un ancien instantané de code se périme, un chemin de
 * référence toujours reconstructible ne se périme jamais.
 *
 * Ne tourne jamais dans la suite normale : ignoré tant que
 * `OMRA_LIVE_COMPARISON` n'est pas positionné. Lancer avec :
 *
 *   pnpm run verifier:saison-live
 * (ou directement : OMRA_LIVE_COMPARISON=1 pnpm exec vitest run modules/facturation/comparaison-saison-live.test.ts)
 *
 * Authentification : réutilise le profil Chrome persistant déjà connecté à
 * `/facturation` (`OMRA_PLAYWRIGHT_PROFILE_DIR`, par défaut le profil de
 * vérification de ce poste) plutôt qu'un mot de passe — plus robuste face à
 * la rotation des identifiants, et jamais besoin de lire ni saisir un secret
 * ici. Ne fonctionne donc que sur le poste où ce profil existe et reste
 * connecté ; se reconnecter manuellement une fois sur `/facturation` en
 * production si le jeton a expiré.
 *
 * Lit aussi `.env.local` (`NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY`,
 * `SUPABASE_SECRET_KEY` — ce dernier uniquement pour lire la saison active,
 * exactement comme le fait `chargerProgrammeActif()` côté serveur). Ne
 * jamais afficher ces valeurs.
 */

import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { collecterOperationsBancaires, versementsSaisonDepuisRecu } from './domain/rules/cheque-register'
import { collecterMouvements } from './domain/rules/finance-day'
import { resumeJournee, type SourceJournees } from './domain/rules/daily'
import { totalPaye } from './domain/rules/receipt'
import { cleJourDepuisDateFr } from './domain/dates'
import { isoVersDateFr, isoVersHeure } from './data/supabase/dates'
import { dhVersCentimes } from './data/supabase/dh'
import {
  mapReceiptDetailToRecu,
  mapReceiptRowToRecuSaison,
  mapSeasonPaymentRowToVersementSaison,
  mapModificationRowToEvenementSaison,
  mapReusableOperationToOperationPartagee,
} from './data/supabase/mappers'
import type { MouvementCaisse, OperationPartagee, Recu, RecuSaison } from './domain/types'

const TAILLE_PAGE = 200
const ENV_LOCAL = 'E:\\zemzem site\\omra\\.env.local'
const PROD_URL = 'https://omra-chi.vercel.app'
const AUTH_COOKIE = 'sb-hnwjbgoobkapdvndkwbh-auth-token'
const PROFILE_DIR =
  process.env.OMRA_PLAYWRIGHT_PROFILE_DIR || 'E:\\zemzem site\\scratch-verif-prod\\profile-facturation'
const CHROME_PATH =
  process.env.OMRA_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

function lireEnvLocal(fichier: string): Record<string, string> {
  const contenu = readFileSync(fichier, 'utf8')
  const valeurs: Record<string, string> = {}
  for (const ligne of contenu.split(/\r?\n/)) {
    const m = ligne.match(/^([A-Z_]+)=(.*)$/)
    if (m) valeurs[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return valeurs
}

/**
 * Jeton d'accès, extrait du profil Chrome persistant déjà connecté.
 * `null` — jamais une exception — quand ce chemin n'a pas de session valide :
 * `obtenirJetonSession()` juge s'il faut basculer sur le repli.
 */
async function extraireJetonViaProfilPersistant(): Promise<string | null> {
  try {
    const contexte = await chromium.launchPersistentContext(PROFILE_DIR, {
      executablePath: CHROME_PATH,
      headless: true,
    })
    const page = contexte.pages()[0] || (await contexte.newPage())
    await page.goto(`${PROD_URL}/facturation`, { waitUntil: 'networkidle', timeout: 20_000 })
    const cookies = await contexte.cookies()
    // Filtré par domaine : ce même profil sert aussi des vérifications locales
    // (127.0.0.1) et peut porter un cookie de même nom, périmé, sur cet autre
    // domaine — piège déjà rencontré cette semaine sur un profil voisin.
    const cookieAuth = cookies.find(
      (c) => c.name === AUTH_COOKIE && c.domain === new URL(PROD_URL).hostname,
    )
    await contexte.close()
    if (!cookieAuth) return null

    let brut = decodeURIComponent(cookieAuth.value)
    if (brut.startsWith('base64-')) brut = Buffer.from(brut.slice('base64-'.length), 'base64').toString('utf8')
    const session = JSON.parse(brut)
    const jeton = Array.isArray(session) ? session[0] : session.access_token
    return typeof jeton === 'string' && jeton ? jeton : null
  } catch {
    return null
  }
}

/**
 * Repli automatique par mot de passe — demande du commanditaire (2026-08-10) :
 * une session qui expire toute seule a bloqué deux nuits de suite ; ce script
 * ne doit plus jamais s'arrêter sans dire quoi faire. Connexion directe par
 * mot de passe, jamais dépendante d'un cookie de navigateur existant — ne
 * peut donc pas expirer de la même façon. Compte de test dédié, déjà
 * documenté et déjà présent dans .env.local (CLAUDE.md §5) : jamais lu ni
 * affiché ici au-delà de cet usage.
 */
async function connexionParMotDePasse(env: Record<string, string>): Promise<string> {
  const email = env.OMRA_TEST_ADMIN_EMAIL
  const motDePasse = env.OMRA_TEST_ADMIN_PASSWORD
  if (!email || !motDePasse) {
    throw new Error(
      'Aucune session valide sur le profil Chrome persistant, et repli impossible : ' +
        'OMRA_TEST_ADMIN_EMAIL / OMRA_TEST_ADMIN_PASSWORD absents de .env.local (voir CLAUDE.md §5). ' +
        `Ce qu'il faut faire : les ajouter à .env.local, ou reconnecter manuellement le profil ` +
        `${PROFILE_DIR} sur ${PROD_URL}/facturation, puis relancer.`,
    )
  }

  const clientAuth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await clientAuth.auth.signInWithPassword({ email, password: motDePasse })
  if (error || !data.session) {
    throw new Error(
      'Aucune session valide sur le profil Chrome persistant, et la reconnexion par mot de passe a échoué : ' +
        (error?.message ?? 'session absente après connexion') +
        `. Ce qu'il faut faire : vérifier OMRA_TEST_ADMIN_EMAIL/PASSWORD dans .env.local (compte actif, ` +
        `poste toujours autorisé), ou reconnecter manuellement le profil ${PROFILE_DIR} sur ` +
        `${PROD_URL}/facturation, puis relancer.`,
    )
  }
  return data.session.access_token
}

async function obtenirJetonSession(env: Record<string, string>): Promise<string> {
  const viaProfil = await extraireJetonViaProfilPersistant()
  if (viaProfil) return viaProfil
  return connexionParMotDePasse(env)
}

function recuSaisonDepuisRecuComplet(recu: Recu): RecuSaison {
  return {
    id: recu.id,
    numero: recu.numero,
    date: recu.date,
    statut: recu.statut,
    annuleLe: recu.annuleLe,
    totalPayeCentimes: totalPaye(recu),
  }
}

describe.skipIf(!process.env.OMRA_LIVE_COMPARISON)('comparaison en direct — chemin rapide vs chemin de référence', () => {
  it(
    'Paiements, Journal financier et Suivi journalier : mêmes montants, lignes, totaux et compteurs',
    async () => {
      const env = lireEnvLocal(ENV_LOCAL)
      const accessToken = await obtenirJetonSession(env)
      const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      })

      // Lecture de la saison active exactement comme `chargerProgrammeActif()`
      // (lib/facturation, côté serveur) : `omra_seasons` n'est jamais lue
      // depuis une session utilisateur, même en production.
      const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data: saison, error: erreurSaison } = await admin
        .from('omra_seasons')
        .select('id, name, status')
        .eq('status', 'active')
        .single()
      if (erreurSaison) throw new Error('saison: ' + erreurSaison.message)
      console.log('Saison active :', saison.name, saison.id)

      // --- Lignes brutes de list_billing_receipts, paginées (base commune) ---
      const lignesRecus: any[] = []
      for (let offset = 0; ; offset += TAILLE_PAGE) {
        const { data, error } = await supabase.rpc('list_billing_receipts', {
          p_search_text: null,
          p_lifecycle_status: null,
          p_season_id: saison.id,
          p_limit: TAILLE_PAGE,
          p_offset: offset,
        })
        if (error) throw new Error('list_billing_receipts: ' + error.message)
        lignesRecus.push(...(data ?? []))
        if ((data ?? []).length < TAILLE_PAGE) break
      }
      console.log('Reçus trouvés :', lignesRecus.length)

      // --- Opérations partagées et mouvements de caisse : chemins identiques,
      // réutilisés tels quels des deux côtés (RPC inchangées par ce chantier). ---
      const { data: lignesOperations, error: erreurOperations } = await supabase.rpc(
        'list_reusable_payment_operations',
        { p_payment_mode: null, p_season_id: saison.id },
      )
      if (erreurOperations) throw new Error('list_reusable_payment_operations: ' + erreurOperations.message)
      const operations: OperationPartagee[] = (lignesOperations ?? []).map(mapReusableOperationToOperationPartagee)

      const { data: lignesMouvements, error: erreurMouvements } = await supabase.rpc(
        'list_cash_register_refund_movements',
        { p_season_id: saison.id },
      )
      if (erreurMouvements) throw new Error('list_cash_register_refund_movements: ' + erreurMouvements.message)
      const mouvementsCaisse: MouvementCaisse[] = (lignesMouvements ?? []).map((ligne: any) => {
        const date = isoVersDateFr(ligne.occurred_at)
        return {
          id: ligne.movement_id,
          type: 'refund_cash' as const,
          jour: cleJourDepuisDateFr(date),
          date,
          heure: isoVersHeure(ligne.occurred_at),
          montantCentimes: dhVersCentimes(ligne.amount_dh),
          recuNumero: ligne.receipt_number,
          client: `${ligne.traveler_first_name_snapshot} ${ligne.traveler_last_name_snapshot}`.trim(),
          employe: ligne.created_by_slot_label_snapshot,
        }
      })

      // ============================================================
      // Chemin RAPIDE : les nouvelles RPC à plat.
      // ============================================================
      const recusSaisonRapide = lignesRecus.map(mapReceiptRowToRecuSaison)

      const versementsSaisonRapide: ReturnType<typeof mapSeasonPaymentRowToVersementSaison>[] = []
      for (let offset = 0; ; offset += TAILLE_PAGE) {
        const { data, error } = await supabase.rpc('list_billing_season_payments', {
          p_season_id: saison.id,
          p_date_from: null,
          p_date_to: null,
          p_limit: TAILLE_PAGE,
          p_offset: offset,
        })
        if (error) throw new Error('list_billing_season_payments: ' + error.message)
        versementsSaisonRapide.push(...(data ?? []).map(mapSeasonPaymentRowToVersementSaison))
        if ((data ?? []).length < TAILLE_PAGE) break
      }

      const modificationsSaisonRapide: ReturnType<typeof mapModificationRowToEvenementSaison>[] = []
      for (let offset = 0; ; offset += TAILLE_PAGE) {
        const { data, error } = await supabase.rpc('list_billing_season_modifications', {
          p_season_id: saison.id,
          p_date_from: null,
          p_date_to: null,
          p_limit: TAILLE_PAGE,
          p_offset: offset,
        })
        if (error) throw new Error('list_billing_season_modifications: ' + error.message)
        modificationsSaisonRapide.push(...(data ?? []).map(mapModificationRowToEvenementSaison))
        if ((data ?? []).length < TAILLE_PAGE) break
      }

      console.log('Chemin rapide — versements :', versementsSaisonRapide.length, '/ modifications :', modificationsSaisonRapide.length)

      // ============================================================
      // Chemin de RÉFÉRENCE : reconstruction complète, un appel détaillé par
      // reçu (le chemin N+1 d'origine). Volontairement coûteux, jamais utilisé
      // en production après ce chantier — seulement ici, comme témoin.
      // ============================================================
      const recusComplets: Recu[] = []
      for (const ligne of lignesRecus) {
        const [{ data: detail, error: erreurDetail }, { data: impressionResume }] = await Promise.all([
          supabase.rpc('get_billing_receipt_details', { p_receipt_id: ligne.receipt_id }),
          supabase.rpc('get_billing_receipt_print_summary', { p_receipt_id: ligne.receipt_id }),
        ])
        if (erreurDetail) throw new Error('get_billing_receipt_details: ' + erreurDetail.message)
        const printCount = impressionResume?.[0]?.print_count ?? null
        recusComplets.push(mapReceiptDetailToRecu(detail, printCount))
      }
      console.log('Chemin de référence — reçus complets reconstruits :', recusComplets.length)

      const recusSaisonReference = recusComplets.map(recuSaisonDepuisRecuComplet)
      const versementsSaisonReference = recusComplets.flatMap((r) => versementsSaisonDepuisRecu(r, operations))
      // Note connue : `mapReceiptDetailToRecu` renvoie toujours `modifications: []`
      // (bug préexistant, indépendant de ce chantier) — le chemin de référence
      // ne peut donc PAS servir de témoin pour le compteur de modifications.
      // Ce champ est exclu de la comparaison ci-dessous et seulement journalisé.

      // ============================================================
      // 1. Paiements — collecterOperationsBancaires
      // ============================================================
      const paiementsReference = collecterOperationsBancaires(versementsSaisonReference, operations)
      const paiementsRapide = collecterOperationsBancaires(versementsSaisonRapide, operations)

      expect(paiementsRapide.length, 'Paiements — même nombre de lignes').toBe(paiementsReference.length)

      const normaliserPaiement = (o: (typeof paiementsRapide)[number]) => ({
        cle: o.cle,
        nature: o.nature,
        partagee: o.partagee,
        montantCentimes: o.montantCentimes,
        attribueCentimes: o.attribueCentimes,
        restantCentimes: o.restantCentimes,
        clients: [...o.clients].sort(),
        recus: [...o.recus].sort(),
        dateEnregistrement: o.dateEnregistrement,
      })
      const trierParCle = (a: { cle: string }, b: { cle: string }) => a.cle.localeCompare(b.cle)
      expect(
        [...paiementsRapide].sort(trierParCle).map(normaliserPaiement),
        'Paiements — mêmes lignes (clé, nature, montants, clients, reçus)',
      ).toEqual([...paiementsReference].sort(trierParCle).map(normaliserPaiement))

      // ============================================================
      // 2. Journal financier — collecterMouvements
      // ============================================================
      const mouvementsReference = collecterMouvements(versementsSaisonReference)
      const mouvementsRapide = collecterMouvements(versementsSaisonRapide)

      expect(mouvementsRapide.length, 'Journal — même nombre de mouvements').toBe(mouvementsReference.length)

      const normaliserMouvement = (m: (typeof mouvementsRapide)[number]) => ({
        id: m.id,
        recuNumero: m.recu.numero,
        montantCentimes: m.versement.montantCentimes,
        nature: m.nature,
        jour: m.jour,
        heure: m.heure,
        cleOperation: m.cleOperation,
      })
      const trierParId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)
      expect(
        [...mouvementsRapide].sort(trierParId).map(normaliserMouvement),
        'Journal — mêmes mouvements (id, reçu, montant, nature, jour)',
      ).toEqual([...mouvementsReference].sort(trierParId).map(normaliserMouvement))

      const totalReference = mouvementsReference.reduce((s, m) => s + m.versement.montantCentimes, 0)
      const totalRapide = mouvementsRapide.reduce((s, m) => s + m.versement.montantCentimes, 0)
      expect(totalRapide, 'Journal — même total en centimes').toBe(totalReference)

      // ============================================================
      // 3. Suivi journalier — resumeJournee, sur toutes les journées réelles
      // ============================================================
      const joursConnus = new Set<string>()
      for (const r of recusComplets) joursConnus.add(cleJourDepuisDateFr(r.date))
      for (const m of mouvementsReference) joursConnus.add(m.jour)
      for (const mv of mouvementsCaisse) joursConnus.add(mv.jour)

      const sourceReference: SourceJournees = {
        recusSaison: recusSaisonReference,
        versementsSaison: versementsSaisonReference,
        modificationsSaison: [],
        operations,
        mouvementsCaisse,
        impressions: [],
        anomaliesEnAttente: () => 0,
      }
      const sourceRapide: SourceJournees = {
        recusSaison: recusSaisonRapide,
        versementsSaison: versementsSaisonRapide,
        modificationsSaison: modificationsSaisonRapide,
        operations,
        mouvementsCaisse,
        impressions: [],
        anomaliesEnAttente: () => 0,
      }

      let totalModificationsRapide = 0
      for (const jour of [...joursConnus].sort()) {
        const resReference = resumeJournee(jour, sourceReference)
        const resRapide = resumeJournee(jour, sourceRapide)
        totalModificationsRapide += resRapide.modifications

        const { modifications: _mr, ...resteReference } = resReference
        const { modifications: _mf, ...resteRapide } = resRapide
        expect(resteRapide, `Suivi journalier ${jour} — mêmes agrégats hors modifications`).toEqual(
          resteReference,
        )
      }

      console.log('Journées comparées :', joursConnus.size)
      console.log(
        'Modifications — référence (toujours 0, limitation connue) :',
        0,
        '/ rapide (réel) :',
        totalModificationsRapide,
        '/ RPC dédiée :',
        modificationsSaisonRapide.length,
      )
    },
    120_000,
  )
})
