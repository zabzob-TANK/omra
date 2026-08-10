/**
 * Libellés de l'interface, relevés **tels quels** dans `Zemzem Asfar.dc.html`.
 *
 * Rien n'est traduit, reformulé ni ajouté ici : chaque chaîne est celle du
 * fichier de référence. Ce catalogue existe pour que la conformité soit
 * vérifiable d'un coup d'œil, et pour qu'aucun texte ne soit inventé dans les
 * composants.
 *
 * Langue et orientation par écran, telles qu'elles figurent dans le fichier :
 *
 * | Écran / fenêtre        | Langue   | Direction |
 * |------------------------|----------|-----------|
 * | Connexion              | arabe    | RTL       |
 * | Registre des reçus     | arabe    | RTL       |
 * | Reçu (aperçu papier)   | arabe    | RTL       |
 * | Statistiques           | arabe    | RTL       |
 * | Fenêtres du lot L2     | arabe    | RTL       |
 * | Journal financier      | arabe    | RTL       | (lot L4)
 * | Suivi journalier       | français | LTR       | (lot L5)
 * | Chèques et virements   | français | LTR       | (lot L5)
 *
 * Les écrans français du fichier — suivi journalier, registre des chèques et
 * les fenêtres qui en dépendent — sont en français de gauche à droite, avec les
 * seules valeurs arabes (banques, noms, employés) isolées en lecture inverse,
 * comme le fait le fichier avec sa classe `cheque-rtl`.
 */

export const T = {
  marque: {
    nom: 'زمزم أسفار',
    sousTitre: 'تدبير العمرة',
  },

  connexion: {
    utilisateur: 'اسم المستخدم',
    motDePasse: 'كلمة المرور',
    entrer: 'دخول',
    aideEssai: 'للتجربة:',
    erreur: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  },

  saisonActive: (nom: string) => `الموسم النشط — ${nom}`,

  navigation: {
    recu: 'الوصل',
    finance: 'المالية',
    statistiques: 'الإحصائيات',
    journal: 'السجل',
    sortie: 'خروج',
    modeNuit: 'الوضع الليلي',
    modeJour: 'الوضع النهاري',
  },

  registre: {
    nouveauRecu: 'وصل جديد',
    ajouterDfp: 'إضافة دفعة',
    rechercheNom: 'الاسم / الهاتف',
    rechercheNumero: 'رقم الوصل',
    rechercher: 'بحث…',
    videTitre: 'لا يوجد أي وصل مطابق',
    videAide: 'غيّر الاسم أو رقم الوصل في خانة البحث',
    afficherAnnules: 'إظهار الملغاة',
    sousTitre: (actifs: number, annules: number) => `${actifs} وصل نشط · ${annules} ملغى`,
    /** Ordre exact des colonnes du fichier de référence. */
    colonnes: {
      numero: 'رقم',
      nom: 'الاسم / النسب',
      convenu: 'المبلغ المتفق',
      paye: 'مجموع الدفعات',
      restant: 'الباقي',
      date: 'تاريخ التسجيل',
      nbVersements: 'عدد الدفعات',
      derniereDfp: 'آخر دفعة',
      methode: 'الطريقة',
      statut: 'الحالة',
      hotel: 'الفندق',
      chambre: 'الغرفة',
      vol: 'الرحلة',
      rabatteur: 'الوسيط',
      note: 'ملاحظة',
      employe: 'الموظف',
      reduction: 'التخفيض',
      telephone: 'رقم الهاتف',
      groupe: 'المجموعة',
      actions: 'الإجراءات',
    },
    infobulleLigne: 'انقر مرتين لعرض الملف الكامل',
    /**
     * Décision du 2026-08-08 : le trop-perçu ne dépend plus du statut
     * (« مسدد » désormais, comme tout restant ≤ 0) — ce badge, indépendant,
     * porte seul sa visibilité. Jamais utilisé pour les autres anomalies
     * (`reste-a-payer`, `justificatif-cheque-manquant`), qui ne sont pas
     * dans le périmètre de cette décision.
     */
    anomalieTropPercu: 'مبلغ زائد',
    actionAnnuler: 'إلغاء / حذف الوصل',
    actionModifier: 'تعديل',
    actionDfp: 'إضافة دفعة',
    actionVoir: 'عرض الوصل',
    actionImprimer: 'طباعة',
    /** Pied du tableau : nombre affiché sur nombre de reçus actifs. */
    compte: (affiches: number, actifs: number) => `عرض ${affiches} من ${actifs}`,
    masquerAnnules: 'إخفاء الملغاة',
    montrerAnnules: (n: number) => `عرض الوصولات الملغاة (${n})`,
  },

  recu: {
    retour: 'رجوع',
  },

  finance: {
    sousNav: { paiements: 'Paiements', suiviJournalier: 'Suivi journalier' },
    imprimer: 'طباعة',
    aujourdhui: 'اليوم',
    hier: 'أمس',
    tout: 'الكل',
    videTableau: 'لا توجد دفعات في هذه الفترة.',
    /**
     * Bandeau supérieur de l'impression. Le fichier de référence y écrit
     * littéralement « 1 sur N », en français et de gauche à droite.
     */
    pagesImprimees: (total: number) => `1 sur ${total}`,
    anomalieTexte: (n: number) => `${n} عملية مالية غير مراجعة بعد الطباعة`,
    chequesSansImage: 'شيكات بدون صورة',
    modifications: 'التعديلات',
    annulation: (n: number) => `إلغاء (${n})`,
    caisse: (n: number) => `الصندوق (${n})`,
    caisseNette: 'الصندوق',
    nouveaux: 'جديد',
    paiements: 'دفعات',
    totalGeneral: 'المبلغ الإجمالي',
    cheque: (n: number) => `شيك (${n})`,
    virement: (n: number) => `تحويل (${n})`,
    dernierRecu: 'آخر وصل',
    operation: 'عملية',
    pageSur: (total: number) => `1 sur ${total}`,
    colonnes: {
      heure: 'الوقت',
      date: 'التاريخ',
      numeroRecu: 'رقم الوصل',
      versement: 'الدفعة',
      client: 'الاسم الكامل',
      especes: 'نقد',
      banque: 'شيك / تحويل',
      methode: 'الطريقة',
      valeurReelle: 'القيمة الحقيقية',
      infosCheque: 'بيانات الشيك',
      employe: 'الموظف',
      rabatteur: 'الوسيط',
      hotel: 'الفندق',
      chambre: 'الغرفة',
      vol: 'الرحلة',
      convenu: 'المبلغ المتفق',
      restant: 'الباقي',
      statut: 'الحالة',
    },
  },

  /** Écran « Suivi journalier » — français, de gauche à droite. */
  suiviJournalier: {
    titre: 'Suivi journalier',
    sousTitre: 'Une ligne compacte par journée, y compris les journées sans activité.',
    moisPrecedent: 'Mois précédent',
    moisSuivant: 'Mois suivant',
    moisActuel: 'Mois actuel',
    encaissements: 'Encaissements',
    especes: 'Espèces',
    cheques: 'Chèques',
    virements: 'Virements',
    nouveauxClients: 'Nouveaux clients',
    annulations: 'Annulations',
    totalBancaire: 'Chèques + virements',
    operationsBancaires: (n: number) => `${n} opérations bancaires`,
    selectionnerToutes: 'Sélectionner toutes les journées affichées',
    inclureJournee: 'Inclure cette journée dans le calcul',
    effacerSelection: 'Effacer la sélection',
    moisComplet: 'Calcul du mois complet',
    selection: (n: number) => `${n} jour${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''}`,
    videsAffichees: '✓ Journées sans activité affichées',
    videsMasquees: 'Journées sans activité masquées',
    joursAffiches: (affiches: number, masques: number) =>
      `${affiches} jours affichés${masques ? ` · ${masques} masqués` : ''}`,
    noteWeekEnd: 'Samedi et dimanche signalés par une teinte légère.',
    colonnes: {
      jour: 'Jour',
      date: 'Date',
      especes: 'Espèces',
      total: 'Total',
      cheques: 'Chèques',
      virements: 'Virements',
      nouveaux: 'Nouveaux',
      annulations: 'Annulations',
      controle: 'Contrôle',
    },
  },

  /** Écran « Paiements — chèques et virements » — français, de gauche à droite. */
  paiements: {
    titre: 'Paiements — chèques et virements',
    montantGlobal: 'Montant global affiché',
    nombreAffiche: 'Nombre de paiements affichés',
    dateEnregistrement: 'Date d’enregistrement à l’agence',
    jourPrecedent: 'Jour précédent',
    jourSuivant: 'Jour suivant',
    aujourdhui: 'Aujourd’hui',
    toutesLesDates: 'Toutes les dates',
    recherche: 'Recherche',
    rechercheAide: 'N° / référence, banque, payeur, client ou reçu…',
    mode: 'Mode',
    type: 'Type',
    image: 'Image',
    optionsMode: [
      { valeur: 'all', libelle: 'Tous' },
      { valeur: 'cheque', libelle: 'Chèques' },
      { valeur: 'transfer', libelle: 'Virements' },
    ],
    optionsType: [
      { valeur: 'all', libelle: 'Tous' },
      { valeur: 'unique', libelle: 'Uniques' },
      { valeur: 'shared', libelle: 'Partagés' },
    ],
    optionsImage: [
      { valeur: 'all', libelle: 'Toutes' },
      { valeur: 'with', libelle: 'Avec image' },
      { valeur: 'without', libelle: 'Sans image' },
    ],
    ouvrirPaiement: 'Double-cliquez pour ouvrir le paiement',
    voirImage: 'Voir l’image',
    vide: 'Aucun paiement ne correspond aux filtres sélectionnés.',
    triInterne: 'Tri interne : date et heure d’enregistrement · heure non affichée',
    colonnes: {
      image: 'Image',
      dateEnregistrement: 'Date d’enregistrement',
      montant: 'Montant',
      mode: 'Mode',
      numero: 'N° / Référence',
      banque: 'Banque',
      datePaiement: 'Date du paiement',
      type: 'Type',
      payeur: 'Payeur',
      clients: 'Client(s)',
      recus: 'Reçu(s)',
      attribue: 'Attribué',
      restant: 'Restant',
      employe: 'Employé',
    },
  },

  /** Fenêtres du registre des paiements — français, de gauche à droite. */
  paiementDetail: {
    sousTitre: (date: string) =>
      `Enregistré à l’agence le ${date} · l’heure reste utilisée uniquement pour le classement`,
    sansImage: 'Aucune image associée',
    /**
     * Distinct de `sansImage` : une référence existe en base (déposée le...,
     * par...) mais le fichier est introuvable dans le stockage — jamais
     * confondu avec « aucune image n'a jamais été déposée ». Seul un
     * administrateur peut la supprimer pour libérer la place d'un nouvel
     * envoi (le bouton Supprimer reste visible dans ce cas).
     */
    imageIntrouvable: 'Image introuvable — le fichier n’a pas pu être chargé depuis le stockage',
    ajouterImage: '+ Ajouter une image',
    imageAjoutee: (date: string, auteur: string) => `Image ajoutée le ${date} par ${auteur}`,
    supprimerImage: 'Supprimer l’image',
    modePaiement: 'Mode de paiement',
    montantReel: 'Montant réel',
    banque: 'Banque',
    type: 'Type',
    payeur: 'Payeur',
    montantAttribue: 'Montant attribué',
    montantRestant: 'Montant restant',
    employe: 'Employé',
    clientsLies: 'Clients liés',
    recusLies: 'Reçus liés',
    repartition: 'Répartition entre les reçus',
    colonnes: {
      recu: 'Reçu',
      client: 'Client',
      montant: 'Montant attribué',
      situation: 'Situation du reçu',
    },
  },

  /**
   * Carte « image de l'instrument » des formulaires de création et de
   * versement. Arabe, comme les fenêtres du lot L2 dans le fichier.
   */
  imageInstrument: {
    titreCheque: 'صورة الشيك',
    titreVirement: 'صورة / إثبات التحويل',
    uneSeuleParOperation: 'صورة واحدة فقط لكل عملية',
    uneSeule: 'صورة واحدة فقط',
    disponible: 'الصورة متوفرة',
    absente: 'لا توجد صورة',
    absenteSurPrincipale: 'لا توجد صورة على العملية الرئيسية',
    ajouter: 'إضافة صورة',
    texteDisponibleOperationExistante:
      'الصورة محفوظة على العملية الرئيسية ولا يمكن تغييرها من هذا الوصل.',
    texteDisponible: 'سترتبط بعملية الدفع عند حفظ الوصل.',
    texteAbsentCheque: 'يمكن إضافتها الآن أو لاحقًا من سجل المدفوعات.',
    texteAbsentVirement: 'إضافة إثبات التحويل اختيارية ويمكن القيام بها الآن أو لاحقًا.',
    texteVerrouilleRecu:
      'هذه العملية مسجلة مسبقًا. تضاف الصورة لاحقًا من سجل المدفوعات، وليس من وصل هذا العميل.',
    texteVerrouilleVersement: 'هذه العملية مسجلة مسبقًا. تضاف الصورة لاحقًا من سجل المدفوعات.',
  },

  paiementImage: {
    sousTitre: 'Préparation fonctionnelle du futur module d’ajout d’image',
    note: 'Démonstration uniquement :',
    noteSuite:
      ' aucune IA, aucun OCR et aucune recherche automatique de correspondance ne sont développés dans cette version. Cette fenêtre sert seulement à tester l’ajout d’une image unique à l’opération ciblée.',
    banque: 'Banque',
    montant: 'Montant',
    apresConfirmation: 'L’image sera enregistrée seulement après confirmation.',
    importer: 'Importer une image',
    enregistrer: 'Enregistrer l’image',
  },

  anomalie: {
    titre: 'تأكيد مراجعة التنبيه',
    trouve: 'تم العثور على',
    operations: 'عملية مالية غير مُراجعة بعد طباعة يوم',
    consigne:
      'لن يختفي التنبيه إلا بعد تأكيد المراجعة. ستُحفظ هوية المدير وتاريخ ووقت التأكيد في السجل.',
    confirmer: 'تأكيد المراجعة',
    annuler: 'إلغاء',
  },

  statuts: {
    solde: 'مسدد',
    incomplet: 'غير مكتمل',
    annule: 'ملغى',
  },

  methodes: {
    especes: 'نقد',
    cheque: 'شيك',
    virement: 'تحويل',
  },

  statistiques: {
    titre: 'الإحصائيات',
    cartes: [
      { titre: 'إحصائيات عامة', sousTitre: 'المسافرون، الوصولات، الحالات' },
      { titre: 'المدفوعات والصندوق', sousTitre: 'المبالغ، طرق الدفع، الباقي' },
      { titre: 'الفنادق والرحلات', sousTitre: 'التوزيع حسب البرنامج' },
      { titre: 'الموظفون', sousTitre: 'النشاط والصلاحيات — للإدارة فقط لاحقًا' },
    ],
    etiquette: 'مرحلة لاحقة',
    note: 'تم حجز الصفحة دون إضافة حسابات أو رسوم الآن، حتى لا تتأثر الفوترة.',
  },

  nouveau: {
    titre: 'وصل جديد',
    numero: 'رقم',
    erreurs: 'يجب إكمال ما يلي:',
    sectionVoyageur: 'المسافر',
    /** Titre de la section programme du formulaire de création. */
    sectionProgramme: 'البرنامج',
    passeportLie: '✓ تم ربط جواز السفر',
    scannerPasseport: 'مسح جواز السفر',
    numeroPasseport: 'رقم الجواز:',
    prenom: 'الاسم *',
    nom: 'النسب *',
    telephone: 'رقم الهاتف *',
    hotel: 'الفندق *',
    vol: 'الرحلة *',
    chambre: 'الغرفة *',
    rabatteur: 'الوسيط *',
    reduction: 'التخفيض (درهم)',
    sansPrix: 'لا يوجد ثمن محدّد لهذا الاختيار في هذا الموسم.',
    groupeCoche: 'مجموعة / عائلة',
    groupeCode: 'رمز المجموعة',
    montant: 'المبلغ المدفوع *',
    methode: 'طريقة الدفع *',
    note: 'ملاحظة',
    /** Gabarit du champ téléphone, repris du fichier de référence. */
    gabaritTelephone: '0661.__.__.__',
    /** Encadré vert de la première dépense : payé puis reste. */
    totalPaye: 'المدفوع',
    totalReste: 'الباقي',
    /** Marque des montants encore inconnus, comme « — DH » du fichier. */
    montantInconnu: '—',
    /** Gabarit du champ « numéro du reçu » de la fenêtre d'ajout de dépense. */
    gabaritNumeroRecu: 'رقم الوصل',
    /** Gabarit seul : le champ reste vide tant que rien n'est saisi. */
    gabaritDate: '02/07/2025',
    annuler: 'إلغاء',
    enregistrer: 'حفظ الوصل',
    choisir: 'اختر…',
  },

  instrument: {
    dansLaMemeFenetre: 'داخل نفس النافذة',
    /** Titre du bloc bancaire, adapté à la nature comme dans la référence. */
    donneesBloc: 'بيانات الشيك',
    donneesBlocVirement: 'بيانات التحويل البنكي',
    /** Libellé du numéro, adapté lui aussi à la nature. */
    referenceCheque: 'رقم الشيك *',
    referenceVirement: 'مرجع التحويل *',
    operationUnique: 'عملية فردية',
    operationPartagee: 'عملية مشتركة',
    creerOperation: 'إنشاء عملية جديدة',
    choisirOperation: 'اختيار عملية موجودة',
    operationsDisponibles: 'العمليات المشتركة المتاحة *',
    choisirOperationVide: 'اختر العملية…',
    aucuneOperation: 'لا توجد عملية مشتركة متاحة بهذه الطريقة. أنشئ عملية جديدة أولاً.',
    reference: 'رقم الشيك أو مرجع التحويل *',
    dateOperation: 'تاريخ العملية *',
    banque: 'البنك *',
    payeur: 'الشخص الذي قام بالدفع *',
    montantOperation: 'المبلغ الحقيقي للعملية *',
    partDeCeVoyageur: 'المبلغ المدفوع هنا هو حصة هذا المسافر',
    montantDistribue: 'المبلغ الموزع',
    restantDisponible: 'المتبقي المتاح',
    /**
     * Libellé de la 4ᵉ ligne du récapitulatif d'opération partagée : la part
     * (`partCentimes`) que ce reçu précis prélève sur l'opération.
     *
     * Remplace ici l'ancienne clé `uneSeuleImage`, qui portait par erreur le
     * texte de la règle « une seule image par opération » — sans rapport avec
     * un montant — et qui doublonnait `T.imageInstrument.uneSeuleParOperation`
     * (la formulation correcte de cette règle, utilisée près de la carte
     * d'image). Supprimée : elle n'était référencée nulle part ailleurs.
     */
    parCeVersement: 'حصة هذا الوصل من العملية',
    imageDepuisRegistre:
      'هذه العملية مسجلة مسبقًا. تضاف الصورة لاحقًا من سجل المدفوعات، وليس من وصل هذا العميل.',
  },

  versement: {
    titre: 'إضافة دفعة',
    numeroRecu: 'رقم الوصل *',
    aideNumero: 'اكتب رقم الوصل مباشرة',
    montant: 'المبلغ *',
    /**
     * Total en temps réel : ce qui a déjà été payé plus le montant en train
     * d'être saisi (pas encore enregistré) — pas seulement les versements
     * déjà validés.
     */
    payeApres: 'المبلغ المدفوع',
    restantApres: 'الباقي',
    recap: 'ملخص الدفعات الست',
    recapAide: 'للقراءة والمعاينة فقط',
    detailsInstrument: 'تفاصيل الشيك / التحويل',
    enregistrer: 'حفظ الدفعة',
    annuler: 'إلغاء',
    introuvable: 'هذا الرقم غير موجود.',
    annule: 'هذا الوصل ملغى — لا يمكن إضافة دفعة.',
    solde: 'هذا الوصل مسدد بالكامل — لا يمكن إضافة دفعة.',
    colonnes: {
      rang: '#',
      date: 'التاريخ',
      montant: 'المبلغ',
      methode: 'الطريقة',
      details: 'المرجع',
    },
  },

  annulation: {
    titre: 'إلغاء الوصل',
    avertissement:
      'الوصل لا يُحذف أبدًا. اختر فقط هل الاسترجاع يخرج من الصندوق أم يُدار خارجه.',
    montantPaye: 'المبلغ المدفوع',
    /**
     * R-46, §5.10-§5.11 — montant réellement remboursable si l'annulation est
     * confirmée : jamais plus que le convenu, même si le montant payé est
     * supérieur (trop-perçu). N'apparaît que lorsque les deux valeurs diffèrent.
     */
    montantRemboursable: 'المبلغ القابل للاسترجاع من الصندوق',
    avertissementTropPercu: 'المبلغ الزائد عن السعر المتفق عليه يبقى في الصندوق ولا يُسترجع.',
    modeRemboursement: 'طريقة الاسترجاع *',
    choisir: 'اختر',
    depuisCaisse: 'من الصندوق',
    horsCaisse: 'خارج الصندوق',
    motif: 'سبب الإلغاء *',
    motDePasse: 'كلمة المرور *',
    retour: 'تراجع',
    confirmer: 'تأكيد الإلغاء',
  },

  modification: {
    titre: 'تعديل بيانات الوصل',
    consigne:
      'اختر قسمًا واحدًا فقط. بعد حفظه يمكنك فتح التعديل مرة أخرى لاختيار قسم آخر.',
    fixes: 'الوسيط ومبالغ الدفعات غير قابلة للتعديل. الدفعات الثانية وما بعدها تبقى كما سُجلت.',
    sectionChoisie: 'القسم المختار',
    retour: '←',
    motif: 'سبب التعديل *',
    /** Bandeau des valeurs que la modification ne touche jamais (R-54, R-55). */
    numeroFixe: 'رقم الوصل — ثابت',
    dateFixe: 'تاريخ التسجيل — ثابت',
    rabatteurFixe: 'الوسيط — غير قابل للتعديل',
    gabaritMotif: 'مثال: تصحيح خطأ في الإدخال',
    aucunPrix: 'لا يوجد ثمن محدد لهذه التركيبة.',
    operationCollective: 'عملية جماعية — شخص واحد يدفع عن عدة أشخاص',
    enregistrer: 'حفظ التعديل',
    erreur: 'تعذر حفظ التعديل:',
    sections: {
      identity: { titre: 'الهوية', sousTitre: 'الاسم والنسب معًا' },
      contact: { titre: 'الهاتف', sousTitre: 'رقم الهاتف فقط' },
      program: { titre: 'البرنامج والسعر', sousTitre: 'الفندق، الرحلة، الغرفة والتخفيض' },
      group: { titre: 'المجموعة / العائلة', sousTitre: 'إضافة، تغيير أو حذف المجموعة' },
      note: { titre: 'الملاحظة', sousTitre: 'تعديل الملاحظة فقط' },
      firstPayment: {
        titre: 'طريقة الدفعة',
        sousTitre: 'الطريقة وبيانات الشيك أو التحويل، دون تغيير المبلغ',
      },
    },
    /** Décision du commanditaire (2026-08-09) : n'importe quel versement, plus seulement le premier. */
    premiereDfpFixe: 'مبلغ الدفعة — لا يتغير',
    /** §5.9 — correction du montant, réservée à l'administrateur. */
    montantAdministrateur: 'تصحيح مبلغ الدفعة (المدير فقط)',
    nouveauPrix: 'الثمن الجديد',
    nouveauConvenu: 'المبلغ المتفق عليه الجديد',
    montantInchange: 'المبلغ المدفوع يبقى كما هو',
    portePartagee:
      'بيانات العملية المشتركة تعدّل من سجل المدفوعات والتحويلات، وليس من الوصل.',
    /**
     * Trouvé le 2026-08-09 en testant le récapitulatif pour de vrai : cette
     * section était sélectionnable alors que l'écriture la refuse toujours
     * (modèle de dossier réel non encore aligné sur le tag libre du
     * prototype, fusion.md §5.4). Désactivée pour ne plus induire en erreur.
     */
    groupeIndisponible: 'تعديل المجموعة غير متاح حاليًا في هذه النسخة.',
    noteFirstPayment:
      'هذا التعديل يخص طريقة وبيانات هذه الدفعة فقط. مبلغها والدفعات الأخرى لا تتغير.',
    /** §5.9 — pour l'administrateur, le montant est corrigeable depuis cette même section. */
    noteFirstPaymentAdministrateur:
      'بصفتك مديرًا، يمكنك تصحيح مبلغ هذه الدفعة أعلاه إضافة إلى طريقتها وبياناتها. الدفعات الأخرى لا تتغير.',
    /**
     * Décision du commanditaire (2026-08-09) : la correction ne vise plus
     * automatiquement la première dfp — l'utilisateur désigne explicitement
     * le versement à corriger parmi ceux du reçu.
     */
    choisirVersement: 'اختر الدفعة المطلوب تصحيحها:',
    versementNumero: (rang: number) => `الدفعة رقم ${rang}`,
    corriger: 'تصحيح',
    changerVersement: 'تغيير الدفعة المختارة',
  },

  /**
   * Précision du commanditaire (2026-08-09) : avant d'enregistrer une
   * modification, la fiche complète du reçu s'affiche deux fois côte à
   * côte — état actuel et état après — plutôt qu'une simple liste des
   * champs touchés. Vaut pour toutes les modifications sans exception.
   */
  recapitulatif: {
    titre: 'مراجعة قبل الحفظ',
    consigne: 'قارن الحالتين، ثم أكّد الحفظ أو ارجع لتعديل الإدخال.',
    etatActuel: 'الحالة الحالية',
    etatApres: 'بعد التعديل',
    retour: 'رجوع للتعديل',
    confirmer: 'تأكيد الحفظ',
    prenom: 'الاسم',
    nom: 'النسب',
    montant: 'المبلغ',
    aucun: '—',
  },

  /** Bande « passeport lié » du formulaire de création. */
  /** Aperçu du prix dans le formulaire de création — texte exact du fichier. */
  prixIndefini: 'لا يوجد ثمن محدّد لهذا الاختيار في هذا الموسم.',

  passeportLie: {
    chip: '✓ تم ربط جواز السفر',
    numero: 'رقم الجواز:',
    detacher: 'فصل',
  },

  passeport: {
    titre: 'مسح جواز السفر',
    sousTitre: 'محاكاة وظيفية للربط المستقبلي مع خدمة الذكاء الاصطناعي',
    prenom: 'الاسم',
    nom: 'النسب',
    numero: 'رقم الجواز',
    nationalite: 'الجنسية',
    naissance: 'تاريخ الميلاد',
    lieuNaissance: 'مكان الميلاد',
    emission: 'تاريخ الإصدار',
    expiration: 'تاريخ الانتهاء',
    paysEmission: 'بلد الإصدار',
    sexe: 'الجنس',
    mrz: 'منطقة MRZ / النتيجة الخام',
    note: 'في النسخة النهائية، سيرسل زر المسح الصورة إلى خدمة خارجية، ثم تعود جميع بيانات الجواز. هنا يمكنك تحميل صورة وتجربة نفس مسار التحقق والحفظ.',
    sansImage: 'لم يتم اختيار صورة بعد',
    choisirImage: 'اختيار صورة الجواز',
    remplirDemo: 'ملء بيانات تجريبية',
    noteImage: 'الصورة المختارة تمثل النسخة الأصلية. تُنشأ منها صورة مصغرة للملف.',
    imageIllisible: 'تعذر قراءة صورة الجواز.',
    transfere: 'تم نقل الاسم والنسب والصورة إلى الوصل. ستُحفظ بقية البيانات عند الحفظ.',
    alternativeImage: 'صورة الجواز',
    alternativePortrait: 'صورة المسافر',
    utiliser: 'استعمال البيانات في الوصل',
    annuler: 'رجوع',
    manqueNom: 'الاسم والنسب ضروريان لاستعمال نتيجة المسح.',
    sauvegardeInfo: 'سيتم حفظ الصورة الأصلية وجميع البيانات عند حفظ الوصل.',
  },

  detail: {
    titre: 'الملف الكامل للمسافر',
    numeroRecu: 'رقم الوصل',
    nonModifie: 'غير معدل',
    modifieNFois: (n: number) => `تم التعديل ${n} مرة`,
    prixOrigine: 'الثمن الأصلي',
    convenu: 'المتفق عليه',
    paye: 'مجموع الدفعات',
    restant: 'الباقي',
    identiteContact: 'الهوية والاتصال',
    passeport: 'الجواز',
    /** Le fichier affiche l'un ou l'autre de ces deux états, jamais un tiret. */
    passeportEnregistre: 'مسجل ومحفوظ',
    passeportAbsent: 'غير مضاف بعد',
    telephone: 'الهاتف',
    note: 'الملاحظة',
    programme: 'البرنامج',
    saison: 'الموسم',
    infosEnregistrement: 'معلومات التسجيل',
    impression: 'الطباعة',
    /** Compteur illisible — jamais confondu avec « jamais imprimé » (0). */
    impressionInconnue: 'تعذرت القراءة',
    derniereModification: 'آخر تعديل',
    modifiePar: 'عدل بواسطة',
    dfpEnregistrees: 'الدفعات المسجلة',
    journalModifications: 'سجل التعديلات',
    /** Chargement à la demande (2026-08-09) : jamais un panneau vide en silence. */
    journalEnChargement: 'جارٍ تحميل السجل...',
    journalErreur: 'تعذر تحميل تفاصيل السجل. أعد المحاولة.',
    motifPrefixe: 'السبب:',
    infosAnnulation: 'معلومات الإلغاء',
    motif: 'السبب',
    annulePar: 'ألغاه',
    dateAnnulation: 'تاريخ الإلغاء',
    voirRecu: 'عرض الوصل / الطباعة',
    fermer: 'إغلاق',
    reduction: 'التخفيض',
    /** Compteur affiché sous le total des versements et en pastille du tableau. */
    nbVersements: (n: number) => `${n} دفعة`,
    ouvrirHistorique: 'اضغط للفتح',
    /** Étiquettes de la vignette « voir / ajouter » de la colonne document. */
    imageVoir: 'Voir',
    imageAjouter: '+',
    hotel: 'الفندق',
    chambre: 'الغرفة',
    vol: 'الرحلة',
    rabatteur: 'الوسيط',
    employe: 'الموظف',
    groupe: 'المجموعة',
    colonnes: {
      rang: '#',
      date: 'التاريخ',
      montant: 'المبلغ',
      methode: 'الطريقة',
      document: 'الوثيقة',
      reference: 'المرجع',
      dateInstrument: 'تاريخه',
      banque: 'البنك',
      payeur: 'الدافع',
      montantOperation: 'قيمة العملية',
      employe: 'الموظف',
    },
  },

  journal: {
    titre: 'سجل العمليات',
    // Branché le 2026-08-09 sur facturation_action_history (auparavant non
    // connecté — voir l'historique git pour l'ancien message honnête à ce
    // sujet). Réservé à l'administrateur (poste 1).
    semainePrecedente: 'الأسبوع السابق',
    semaineSuivante: 'الأسبوع التالي',
    employe: 'الموظف',
    typeOperation: 'نوع العملية',
    tousLesEmployes: 'كل الموظفين',
    tousLesTypes: 'كل الأنواع',
    vide: 'لا توجد عمليات خلال هذا الأسبوع.',
    erreur: 'تعذر تحميل السجل. حاول مجددًا.',
    pagePrecedente: 'السابق',
    pageSuivante: 'التالي',
    // Onglet Sessions (2026-08-09) : voir la connexion jusqu'à la
    // déconnexion d'une même personne, demande du commanditaire.
    ongletOperations: 'العمليات',
    ongletSessions: 'الجلسات',
    connexion: 'الدخول',
    deconnexion: 'الخروج',
    duree: 'المدة',
    pasEncoreDeconnecte: 'لم يسجل خروج بعد',
    connecteAvantLaSemaine: 'متصل من قبل بداية الأسبوع',
    videSessions: 'لا توجد جلسات خلال هذا الأسبوع.',
    // Règle posée le 2026-08-10 : un champ sans correspondance ne s'affiche
    // jamais comme un texte ou un nombre nu — toujours avec ce préfixe,
    // jamais confondu avec T.detail.motifPrefixe (« السبب: ») : un identifiant
    // tenté n'est pas un motif saisi par un utilisateur authentifié.
    identifiantTentePrefixe: 'المعرف المُدخل:',
  },

  depassement: {
    titre: 'تجاوز المبلغ المتبقي للعملية',
    consigne: 'التسجيل ممكن، لكنه يحتاج تأكيدًا صريحًا.',
    partAvant: 'الحصة المراد تسجيلها هي',
    partApres: '، بينما المتبقي في العملية المشتركة هو',
    conservation:
      'سيتم الاحتفاظ بهذه المخالفة في بيانات العملية. لا توجد أي مراقبة تلقائية للعمليات المكررة.',
    confirmer: 'تأكيد وحفظ',
    retour: 'إلغاء',
  },

  /**
   * Fenêtre de confirmation d'identité affichée juste avant l'enregistrement
   * d'un versement (uniquement cet écran, pas Nouveau reçu ni la correction
   * du 1er versement) : nom en grand, montant en dessous, oui/non.
   */
  confirmationVersement: {
    titre: 'تأكيد قبل التسجيل',
    consigne: 'تحقق من الاسم والمبلغ قبل المتابعة',
    oui: 'نعم',
    non: 'لا',
  },
} as const
