import { requireActiveAccount } from '@/lib/admin-guard'
import { chargerEtat, etatAnonyme } from '@/modules/facturation/data/service'
import { ApplicationFacturation } from '@/modules/facturation/ui/application'
import {
  acquitterAnomaliesAction,
  ajouterImageDernierVersementAction,
  ajouterImageOperationAction,
  ajouterImagesPasseportAction,
  ajouterVersementAction,
  annulerRecuAction,
  connecterAction,
  creerRecuAction,
  deconnecterAction,
  enregistrerImpressionAction,
  enregistrerImpressionFinanceAction,
  historiqueRecuAction,
  journalFinancierAction,
  modifierRecuAction,
  previsualiserModificationAction,
  rechargerAction,
  registreBancaireAction,
  suiviJournalierAction,
  supprimerImageOperationAction,
} from './actions'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  // Séparation étanche Facturation/Administration : sans session valide, on
  // affiche l'écran de connexion propre à la Facturation (EcranConnexion,
  // rendu par ApplicationFacturation quand `utilisateur` est `null`) —
  // jamais une redirection vers /login, la porte de l'Administration.
  // `chargerEtat()` n'est pas appelable ici : ses RPC exigent déjà une
  // session (`resolve_facturation_actor()`).
  let connecte = true
  try {
    await requireActiveAccount()
  } catch {
    connecte = false
  }

  const etatInitial = connecte ? await chargerEtat() : etatAnonyme()

  return (
    <ApplicationFacturation
      etatInitial={etatInitial}
      comptesEssai={[]}
      actions={{
        connecter: connecterAction,
        deconnecter: deconnecterAction,
        recharger: rechargerAction,
        creerRecu: creerRecuAction,
        ajouterVersement: ajouterVersementAction,
        annulerRecu: annulerRecuAction,
        modifierRecu: modifierRecuAction,
        previsualiserModification: previsualiserModificationAction,
        enregistrerImpression: enregistrerImpressionAction,
        historiqueRecu: historiqueRecuAction,
        journalFinancier: journalFinancierAction,
        enregistrerImpressionFinance: enregistrerImpressionFinanceAction,
        acquitterAnomalies: acquitterAnomaliesAction,
        suiviJournalier: suiviJournalierAction,
        registreBancaire: registreBancaireAction,
        ajouterImageOperation: ajouterImageOperationAction,
        supprimerImageOperation: supprimerImageOperationAction,
        ajouterImageDernierVersement: ajouterImageDernierVersementAction,
        ajouterImagesPasseport: ajouterImagesPasseportAction,
      }}
    />
  )
}
