import 'server-only'

/**
 * Stockage des justificatifs — bucket privé `facturation-justificatifs`
 * (migration `202608010014`).
 *
 * Le chemin final exigé par la base (`<operation_id>/<uuid>.<extension>`,
 * contrainte `payment_supporting_images_operation_path_check`) suppose de
 * connaître l'opération concernée — que `StockageFichiersPort.deposer()` ne
 * reçoit jamais : le fichier de référence dépose d'abord l'image, puis
 * l'associe séparément à un versement ou une opération (`service.ts`,
 * `ajouterImageOperation()`). Les octets sont donc mis en attente ici, sous
 * un jeton temporaire, et le dépôt réel dans Supabase Storage plus
 * l'association via `attach_payment_operation_evidence_image` n'ont lieu
 * qu'au moment où `write.ts` connaît enfin l'opération concernée
 * (`finaliserDepotVersOperation`).
 *
 * Aucune politique RLS n'existe sur `storage.objects` pour ce bucket privé
 * (commentaire de la migration 202608010014) : l'upload binaire passe donc
 * par `createAdminClient()` (`service_role`), uniquement depuis ce fichier
 * serveur — jamais transmis au navigateur.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ReferenceFichier } from '../../domain/types'
import { FormatImageNonAccepteError } from '../ports'
import type { StockageFichiersPort } from '../ports'
import { isoVersHorodatage } from './dates'

const BUCKET = 'facturation-justificatifs'
const PREFIXE_EN_ATTENTE = 'en-attente/'

const EXTENSION_PAR_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

type DepotEnAttente = {
  contenu: Blob | ArrayBuffer
  typeMime: string
}

const depotsEnAttente = new Map<string, DepotEnAttente>()

export const stockageSupabase: StockageFichiersPort = {
  async deposer(fichier) {
    if (!EXTENSION_PAR_TYPE[fichier.typeMime]) {
      throw new FormatImageNonAccepteError(
        `Type d'image non autorisé pour un justificatif : ${fichier.typeMime}`,
      )
    }
    const jeton = crypto.randomUUID()
    depotsEnAttente.set(jeton, { contenu: fichier.contenu, typeMime: fichier.typeMime })
    return {
      chemin: `${PREFIXE_EN_ATTENTE}${jeton}`,
      nomOrigine: fichier.nomOrigine,
      origine: fichier.origine,
      deposeLe: isoVersHorodatage(new Date().toISOString()),
    }
  },

  async url(reference) {
    if (reference.chemin.startsWith(PREFIXE_EN_ATTENTE)) {
      throw new Error('Référence de fichier non finalisée : aucune image en attente ne peut être affichée.')
    }
    const separateur = reference.chemin.indexOf('/')
    if (separateur < 0) {
      throw new Error(`Référence de fichier mal formée : ${JSON.stringify(reference.chemin)}`)
    }
    const bucket = reference.chemin.slice(0, separateur)
    const chemin = reference.chemin.slice(separateur + 1)

    const supabase = await createClient()
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(chemin, 600)
    if (error || !data) {
      throw new Error(`URL signée indisponible pour ${reference.chemin} : ${error?.message ?? 'inconnue'}`)
    }
    return data.signedUrl
  },

  // La suppression physique n'a pas lieu ici : `delete_payment_operation_evidence_image`
  // effectue une suppression logique (ligne conservée, `deleted_at` renseigné)
  // et renvoie bucket/chemin pour un nettoyage physique différé par une route
  // serveur dédiée (commentaire de la migration 202608010014). `write.ts`
  // appelle cette RPC avant d'atteindre ce point ; il n'y a rien de plus à
  // faire ici tant que cette route de nettoyage n'existe pas.
  async supprimer() {},
}

/**
 * Finalise un dépôt en attente vers une opération de paiement réelle : upload
 * des octets dans le bucket privé, sous le chemin exigé par la contrainte de
 * la base, sans appeler la RPC d'association (réservée à `write.ts`, qui seul
 * sait si l'appelant a le droit d'écrire à cet endroit).
 */
export async function deposerVersOperation(
  reference: ReferenceFichier,
  operationId: string,
): Promise<{ storageBucket: string; storagePath: string; mimeType: string }> {
  if (!reference.chemin.startsWith(PREFIXE_EN_ATTENTE)) {
    throw new Error('Cette référence ne correspond pas à un dépôt en attente de finalisation.')
  }
  const jeton = reference.chemin.slice(PREFIXE_EN_ATTENTE.length)
  const depot = depotsEnAttente.get(jeton)
  if (!depot) {
    throw new Error('Dépôt de fichier introuvable ou déjà finalisé.')
  }
  depotsEnAttente.delete(jeton)

  const extension = EXTENSION_PAR_TYPE[depot.typeMime]
  const storagePath = `${operationId}/${crypto.randomUUID()}.${extension}`

  const admin = createAdminClient()
  const { error } = await admin.storage.from(BUCKET).upload(storagePath, depot.contenu, {
    contentType: depot.typeMime,
    upsert: false,
  })
  if (error) {
    throw new Error(`Dépôt de l'image dans le stockage impossible : ${error.message}`)
  }

  return { storageBucket: BUCKET, storagePath, mimeType: depot.typeMime }
}
