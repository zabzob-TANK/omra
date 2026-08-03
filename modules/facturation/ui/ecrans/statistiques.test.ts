import { describe, expect, it } from 'vitest'

import { T } from '../textes'

/**
 * R-91 — La page des statistiques du fichier de référence est réservée : elle
 * n'affiche aucun calcul. Ce test verrouille son contenu exact, pour qu'aucun
 * indicateur ne soit introduit par inadvertance.
 */
describe('R-91 — statistiques : page réservée', () => {
  it('porte le titre et la phrase du fichier', () => {
    expect(T.statistiques.titre).toBe('الإحصائيات')
    expect(T.statistiques.note).toBe(
      'تم حجز الصفحة دون إضافة حسابات أو رسوم الآن، حتى لا تتأثر الفوترة.',
    )
  })

  it('affiche une seule étiquette « مرحلة لاحقة »', () => {
    expect(T.statistiques.etiquette).toBe('مرحلة لاحقة')
  })

  it('annonce exactement les quatre rubriques du fichier, dans l’ordre', () => {
    expect(T.statistiques.cartes).toEqual([
      { titre: 'إحصائيات عامة', sousTitre: 'المسافرون، الوصولات، الحالات' },
      { titre: 'المدفوعات والصندوق', sousTitre: 'المبالغ، طرق الدفع، الباقي' },
      { titre: 'الفنادق والرحلات', sousTitre: 'التوزيع حسب البرنامج' },
      { titre: 'الموظفون', sousTitre: 'النشاط والصلاحيات — للإدارة فقط لاحقًا' },
    ])
  })

  it('n’expose aucun indicateur chiffré', () => {
    const textes = [
      T.statistiques.titre,
      T.statistiques.note,
      T.statistiques.etiquette,
      ...T.statistiques.cartes.flatMap((carte) => [carte.titre, carte.sousTitre]),
    ]
    expect(textes.some((texte) => /\d/.test(texte))).toBe(false)
  })
})
