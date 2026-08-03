import { redirect } from 'next/navigation'
import { requireActiveAccount } from '@/lib/admin-guard'
import { chargerEtat } from '@/modules/facturation/data/service'
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
  journalFinancierAction,
  modifierRecuAction,
  rechargerAction,
  registreBancaireAction,
  suiviJournalierAction,
  supprimerImageOperationAction,
} from './actions'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  try {
    await requireActiveAccount()
  } catch {
    redirect('/logout?error=acces')
  }

  const etatInitial = await chargerEtat()

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
        enregistrerImpression: enregistrerImpressionAction,
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
