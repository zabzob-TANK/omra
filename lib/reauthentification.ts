import 'server-only'

import { createClient as creerClientSimple } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Redemande son propre mot de passe à la personne déjà connectée, avant une
 * opération sensible.
 *
 * Être connecté ne suffit pas pour tout : un écran laissé ouvert suffirait
 * sinon à réinitialiser le mot de passe d'un employé. Cette vérification
 * prouve que c'est bien l'administrateur qui est devant le clavier, à cet
 * instant.
 *
 * Deux précautions de conception :
 *
 *  - la connexion d'essai se fait avec un client SANS stockage de session.
 *    Passer par le client habituel réécrirait le cookie de la session en
 *    cours, donc repousserait ses limites de durée : vérifier un mot de passe
 *    ne doit jamais prolonger une session ;
 *  - la clé employée est la clé PUBLIQUE, celle du navigateur. La clé serveur
 *    ouvrirait la session de n'importe qui sans mot de passe : elle ne peut
 *    donc rien prouver.
 */
export async function motDePasseAdministrateurValide(
  authUserId: string,
  motDePasse: string,
): Promise<boolean> {
  if (!authUserId || !motDePasse) return false

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clePublique = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !clePublique) return false

  // L'adresse du compte est interne et n'est jamais saisie par l'utilisateur :
  // on la relit côté serveur à partir de l'identité déjà authentifiée.
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(authUserId)
  const adresse = data?.user?.email
  if (error || !adresse) return false

  const essai = creerClientSimple(url, clePublique, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  try {
    const { data: session, error: erreurConnexion } =
      await essai.auth.signInWithPassword({ email: adresse, password: motDePasse })
    if (erreurConnexion || !session.user) return false

    // `signOut()` sans portée est GLOBAL chez Supabase : il révoque tous les
    // jetons de l'utilisateur, donc la session du navigateur de celui qui vient
    // justement de confirmer son identité. Vérifié en conditions réelles :
    // l'administrateur était éjecté vers l'écran de connexion au moment même où
    // il validait. La portée locale ne touche que ce client-ci, qui ne stocke
    // rien ; le jeton d'essai reste en mémoire et meurt avec la requête.
    await essai.auth.signOut({ scope: 'local' }).catch(() => undefined)
    return session.user.id === authUserId
  } catch {
    return false
  }
}
