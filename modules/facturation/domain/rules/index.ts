/**
 * Noyau métier — règles pures, sans interface ni persistance.
 *
 * Chaque règle porte l'identifiant du registre `docs/facturation/inventaire.md`
 * et est couverte par un test qui le cite.
 */

export * from './errors'
export * from './receipt'
export * from './tarif'
export * from './instrument'
export * from './shared-payment'
export * from './create-receipt'
export * from './payment'
export * from './cancellation'
export * from './edit-sections'
export * from './finance-day'
export * from './daily'
export * from './cheque-register'
