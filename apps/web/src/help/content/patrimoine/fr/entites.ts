import type { HelpEntry } from '../../../types';

/** Zone « entites » du module « patrimoine » (fr) : entités détentrices, consolidation, fiscalité. */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.entites',
    kind: 'page',
    title: 'Entités détentrices',
    summary:
      "Une entité détentrice est la société ou la personne qui possède des biens : SCI, holding, société, personne physique. Cet écran liste vos entités, et vous permet d'en créer, modifier ou supprimer.",
    purpose:
      "Déclarer qui détient chaque bien permet de répartir les chiffres par quote-part, de consolider le patrimoine entité par entité et d'estimer l'impôt de chacune.",
    steps: [
      { title: 'Créer une entité', detail: 'Cliquez sur « Nouvelle entité » et remplissez le formulaire.' },
      {
        title: 'Rechercher ou filtrer',
        detail:
          'Tapez un nom, un RCCM, un identifiant fiscal ou un contact, ou filtrez par forme juridique et par pays.'
      },
      {
        title: 'Voir les inactives',
        detail: 'Activez « Inclure les inactives » : par défaut, les entités désactivées sont masquées.'
      },
      {
        title: 'Ouvrir une entité',
        detail: 'Cliquez sur « Voir » pour sa fiche : biens, consolidation, estimation fiscale.'
      },
      {
        title: 'Modifier ou supprimer',
        detail: 'Liens « Modifier » et « Supprimer » de la carte ; la suppression demande une confirmation.'
      }
    ],
    consequences: [
      'Deux entités de la même agence ne peuvent pas porter le même nom.',
      "Une entité ne peut pas être supprimée tant que des biens ou des actifs y sont rattachés : détachez-les d'abord.",
      'Une suppression est définitive.',
      'Chaque carte indique le nombre de biens rattachés et, pour une filiale, son entité mère.'
    ],
    faq: [
      {
        q: 'Pourquoi la suppression est-elle refusée ?',
        a: "Des biens ou des actifs sont encore rattachés à l'entité. Ouvrez sa fiche et retirez les rattachements, puis recommencez."
      },
      {
        q: "Qu'est-ce qu'une entité mère ?",
        a: "C'est l'entité qui contrôle celle-ci (holding et filiale, par exemple). Une entité ne peut pas devenir sa propre mère, ni créer de boucle."
      },
      {
        q: 'Où rattacher un bien à une entité ?',
        a: "Sur la fiche de l'entité (« Rattacher un bien »), ou depuis la fiche du bien, dans la section « Détenteurs et fiscalité »."
      },
      {
        q: 'Je ne vois pas cet écran.',
        a: "Il demande les droits sur le patrimoine personnel, que seuls l'administrateur de l'agence et le propriétaire d'un espace personnel ont par défaut."
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      roles: ["Administrateur de l'agence"],
      note: 'Voir demande « Voir le patrimoine personnel » ; créer, modifier et supprimer demandent « Modifier le patrimoine personnel ».'
    },
    related: [
      { label: "Formulaire d'une entité", helpId: 'patrimoine.entites.formulaire' },
      { label: "Fiche d'une entité", helpId: 'patrimoine.entite' },
      { label: 'Paramètres fiscaux', helpId: 'patrimoine.fiscalite' }
    ],
    keywords: ['SCI', 'holding', 'société', 'entité', 'détenteur', 'propriétaire', 'rccm', 'filiale']
  },
  {
    id: 'patrimoine.entites.formulaire',
    kind: 'section',
    title: "Formulaire d'une entité détentrice",
    summary:
      'Ce formulaire sert à créer une entité ou à modifier ses informations : nom, forme juridique, pays, identifiants, contact, entité mère et statut fiscal.',
    howToRead: {
      notes: [
        "Nom : obligatoire, unique dans l'agence.",
        'Forme juridique : SCI, Holding, Société, Personne physique ou Autre.',
        "Pays : Côte d'Ivoire ou Mali ; il sert au calcul de l'impôt.",
        'RCCM et NCC / NIF : numéros officiels, facultatifs.',
        'Contact associé : un contact de votre carnet ; Entité mère : une autre entité active.',
        'Statut fiscal (surcharge) : « Personne physique » ou « Personne morale ». Laissé vide, il se déduit de la forme juridique : Personne physique pour une personne physique, Personne morale pour toutes les autres.'
      ]
    },
    steps: [
      { title: 'Remplir le nom et la forme juridique' },
      { title: 'Choisir le pays' },
      { title: "Ajouter si besoin les numéros, le contact, l'entité mère et les notes" },
      { title: 'Valider', detail: '« Créer » pour une nouvelle entité, « Enregistrer » pour une modification.' }
    ],
    consequences: [
      "Le statut fiscal et le pays changent le calcul de l'estimation fiscale.",
      'Un nom déjà utilisé ou une entité mère qui créerait une boucle sont refusés avec un message.'
    ],
    faq: [
      {
        q: 'Quand renseigner le statut fiscal ?',
        a: 'Seulement si la règle déduite de la forme juridique ne convient pas, par exemple une société traitée comme une personne physique.'
      }
    ],
    related: [{ label: 'Entités détentrices', helpId: 'patrimoine.entites' }],
    keywords: ['nouvelle entité', 'modifier', 'forme juridique', 'statut fiscal', 'rccm', 'ncc', 'nif']
  },
  {
    id: 'patrimoine.entite',
    kind: 'page',
    title: "Fiche d'une entité détentrice",
    summary:
      "La fiche réunit l'identité de l'entité, sa hiérarchie, les biens qu'elle détient avec leur quote-part, la consolidation de ces biens et l'estimation de son impôt pour une année.",
    purpose:
      "C'est ici que l'on rattache des biens à l'entité et que l'on lit ce qu'elle possède, doit et rapporte, bien par bien et au total.",
    steps: [
      { title: 'Modifier', detail: "Le bouton « Modifier » rouvre le formulaire de l'entité." },
      { title: 'Rattacher un bien', detail: 'Dans « Biens rattachés », cliquez sur « Rattacher un bien ».' },
      {
        title: 'Lire la consolidation',
        detail: 'La section « Consolidation » donne les totaux pondérés par les quotes-parts.'
      },
      { title: "Estimer l'impôt", detail: "Dans « Estimation fiscale », choisissez l'année en haut à droite." }
    ],
    consequences: [
      "Rattacher, modifier ou retirer un bien met à jour la consolidation et l'estimation fiscale.",
      "Retirer un bien ne supprime pas le bien : seul le lien avec l'entité disparaît."
    ],
    faq: [
      {
        q: 'Comment naviguer vers la mère ou une filiale ?',
        a: "Dans « Hiérarchie », cliquez sur le nom de l'entité mère ou d'une filiale."
      },
      {
        q: "Pourquoi l'estimation fiscale affiche-t-elle « Paramètres à valider » ?",
        a: "Certains paramètres fiscaux utilisés sont encore à faire valider par un conseil fiscal : l'estimation reste indicative."
      },
      {
        q: 'Retirer un bien de la fiche le supprime-t-il ?',
        a: "Non : seul le lien entre le bien et l'entité disparaît, le bien reste dans votre agence."
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Voir demande « Voir le patrimoine personnel » ; modifier demande « Modifier le patrimoine personnel ».'
    },
    related: [
      { label: 'Entités détentrices', helpId: 'patrimoine.entites' },
      { label: 'Biens rattachés', helpId: 'patrimoine.entite.biens' },
      { label: 'Consolidation', helpId: 'patrimoine.entite.consolidation' },
      { label: 'Estimation fiscale', helpId: 'patrimoine.entite.fiscalite' }
    ],
    keywords: ['fiche entité', 'SCI', 'consolidation', 'quote-part', 'estimation fiscale']
  },
  {
    id: 'patrimoine.entite.identite',
    kind: 'section',
    title: "Identité de l'entité",
    summary:
      "Cette carte rappelle le statut fiscal effectif, le RCCM, le NCC / NIF, le contact et les notes de l'entité.",
    howToRead: {
      notes: [
        'Statut fiscal effectif : « Personne physique » ou « Personne morale ». Il vient du statut choisi dans le formulaire, sinon de la forme juridique.',
        "Les lignes vides (RCCM, NCC / NIF, contact, notes) ne s'affichent pas.",
        "Une étiquette « Inactive » s'affiche si l'entité est désactivée."
      ]
    },
    related: [{ label: "Formulaire d'une entité", helpId: 'patrimoine.entites.formulaire' }],
    keywords: ['identité', 'statut fiscal', 'rccm']
  },
  {
    id: 'patrimoine.entite.hierarchie',
    kind: 'section',
    title: 'Hiérarchie',
    summary: "Cette carte montre l'entité mère et les filiales de l'entité. Cliquez sur un nom pour ouvrir sa fiche.",
    faq: [
      {
        q: "Comment changer l'entité mère ?",
        a: 'Avec « Modifier », champ « Entité mère » : choisissez-en une autre ou videz le champ.'
      },
      {
        q: 'Comment ajouter une filiale ?',
        a: 'Ouvrez ou créez la filiale et choisissez cette entité comme « Entité mère ».'
      }
    ],
    related: [{ label: "Formulaire d'une entité", helpId: 'patrimoine.entites.formulaire' }],
    keywords: ['hiérarchie', 'filiale', 'entité mère', 'holding']
  },
  {
    id: 'patrimoine.entite.biens',
    kind: 'section',
    title: 'Biens rattachés',
    summary:
      "Cette section liste les biens que l'entité détient, avec la part de chacun. Vous y rattachez un bien, modifiez une part ou la retirez.",
    steps: [
      {
        title: 'Rattacher un bien',
        detail: 'Bouton « Rattacher un bien » : choisissez le bien et saisissez la quote-part.'
      },
      { title: 'Modifier une part', detail: 'Cliquez sur le crayon de la ligne.' },
      { title: 'Retirer un bien', detail: 'Cliquez sur la corbeille puis confirmez.' }
    ],
    consequences: [
      'La somme des quotes-parts de toutes les entités sur un même bien ne peut pas dépasser 100 %.',
      "Une entité ne peut être rattachée qu'une fois à un même bien.",
      "Si le bien n'a pas d'actif de patrimoine associé, il en reçoit un automatiquement.",
      'Retirer un rattachement ne supprime pas le bien.'
    ],
    faq: [
      {
        q: 'Le rattachement est refusé.',
        a: "La somme des parts dépasserait 100 %, ou cette entité détient déjà ce bien. Le message d'erreur le précise."
      },
      {
        q: "À quoi sert la « Date d'effet » ?",
        a: "Elle indique le début de la détention. Une date à venir place le bien « À venir » : il n'entre pas encore dans la consolidation."
      }
    ],
    permissions: { note: 'Rattacher, modifier et retirer demandent « Modifier le patrimoine personnel ».' },
    related: [{ label: 'Tableau des biens rattachés', helpId: 'patrimoine.entite.biens.tableau' }],
    keywords: ['rattacher', 'quote-part', 'détention', 'bien', 'part']
  },
  {
    id: 'patrimoine.entite.biens.tableau',
    kind: 'table',
    title: 'Tableau des biens rattachés',
    summary:
      "Chaque ligne est un bien détenu par l'entité, avec sa quote-part, le total détenu sur ce bien et la date de début.",
    howToRead: {
      columns: [
        { key: 'title', label: 'Bien', description: 'Le titre du bien.' },
        { key: 'reference', label: 'Référence', description: 'La référence interne du bien.' },
        {
          key: 'sharePercent',
          label: 'Quote-part',
          description: 'La part de cette entité sur le bien, en pourcentage.'
        },
        {
          key: 'propertyTotalSharePercent',
          label: 'Total sur le bien',
          description: 'La somme des parts de toutes les entités sur ce bien. Elle ne dépasse jamais 100 %.'
        },
        {
          key: 'effectiveFrom',
          label: 'Depuis',
          description: "La date d'effet du rattachement. Un tiret (—) veut dire aucune date."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: 'Le crayon modifie la quote-part ; la corbeille retire le rattachement.'
        }
      ],
      notes: ['Le champ de recherche filtre sur le bien, la référence et les notes.']
    },
    faq: [
      {
        q: 'Que signifie un total inférieur à 100 % ?',
        a: "Une partie du bien n'est attribuée à aucune entité."
      }
    ],
    related: [{ label: 'Biens rattachés', helpId: 'patrimoine.entite.biens' }],
    keywords: ['quote-part', 'total', 'depuis', 'référence']
  },
  {
    id: 'patrimoine.entite.rattachement',
    kind: 'section',
    title: 'Rattacher un bien ou modifier une quote-part',
    summary: "Cette fenêtre sert à rattacher un bien à l'entité, ou à corriger la quote-part d'un bien déjà rattaché.",
    howToRead: {
      notes: [
        'Bien : à choisir à la création ; il ne se change plus ensuite.',
        'Quote-part (%) : de 0,0001 à 100.',
        "Date d'effet : facultative ; au format année-mois-jour.",
        'Notes : texte libre, facultatif.'
      ]
    },
    consequences: [
      'La quote-part est refusée si, avec les autres entités, le total dépasse 100 %.',
      "La consolidation et l'estimation fiscale de l'entité sont recalculées."
    ],
    faq: [
      {
        q: 'Puis-je changer le bien ?',
        a: 'Non : retirez le rattachement puis créez-en un nouveau.'
      }
    ],
    related: [{ label: 'Biens rattachés', helpId: 'patrimoine.entite.biens' }],
    keywords: ['rattachement', 'quote-part', "date d'effet"]
  },
  {
    id: 'patrimoine.entite.consolidation',
    kind: 'section',
    title: 'Consolidation',
    summary:
      "La consolidation additionne, selon la quote-part de l'entité, la valeur, la dette, les loyers et les charges de ses biens, et en tire des rendements.",
    howToRead: {
      notes: [
        'Biens : nombre de biens comptés (hors biens « À venir »).',
        'Valeur estimée et Dette restante : valeur et capital restant dû, au prorata des quotes-parts. Capitaux nets = valeur moins dette.',
        'Loyers annuels, Charges annuelles et Mensualités annuelles : chiffres annuels au prorata des quotes-parts.',
        "Flux de trésorerie annuel : loyers moins charges moins mensualités (vert s'il est positif, rouge sinon).",
        "Rendement brut, net et net-net, Plus-value latente : mêmes définitions que sur l'écran Performance, appliquées au total.",
        '« Situation au … » donne la date du calcul.'
      ]
    },
    consequences: [
      "Un bien dont la date d'effet est à venir est étiqueté « À venir » et exclu des totaux.",
      "Le bandeau « Coût de revient incomplet » signale qu'au moins un bien n'a pas de coût de revient : le rendement net-net et la plus-value latente ne sont alors pas calculés."
    ],
    faq: [
      {
        q: 'Pourquoi la plus-value latente affiche-t-elle « — » ?',
        a: "Au moins un bien n'a pas de prix d'acquisition renseigné dans ses valorisations."
      },
      {
        q: 'La consolidation inclut-elle les filiales ?',
        a: 'Non : elle ne porte que sur les biens rattachés à cette entité.'
      }
    ],
    related: [
      { label: 'Tableau de consolidation', helpId: 'patrimoine.entite.consolidation.tableau' },
      { label: 'Performance du patrimoine', helpId: 'patrimoine.performance' }
    ],
    keywords: ['consolidation', 'capitaux nets', 'flux', 'rendement', 'valeur', 'dette']
  },
  {
    id: 'patrimoine.entite.consolidation.tableau',
    kind: 'table',
    title: 'Tableau de la consolidation',
    summary:
      "Chaque ligne est un bien de l'entité, avec sa part, sa valeur, sa dette, son flux annuel et ses rendements.",
    howToRead: {
      columns: [
        {
          key: 'title',
          label: 'Bien',
          description: "Le titre du bien. L'étiquette « À venir » signale une date d'effet future."
        },
        { key: 'internalReference', label: 'Référence', description: 'La référence interne.' },
        { key: 'sharePercent', label: 'Quote-part', description: "La part de l'entité sur le bien." },
        {
          key: 'estimatedValue',
          label: 'Valeur estimée',
          description: 'La valeur du bien au prorata de la quote-part.'
        },
        { key: 'outstandingDebt', label: 'Dette restante', description: 'Le capital restant dû, au prorata.' },
        {
          key: 'annualCashFlow',
          label: 'Flux annuel',
          description: 'Loyers moins charges moins mensualités, au prorata.'
        },
        { key: 'grossYield', label: 'Rendement brut', description: 'Loyers divisés par la valeur du bien.' },
        { key: 'netYield', label: 'Rendement net', description: 'Loyers moins charges, divisés par la valeur du bien.' }
      ],
      notes: [
        "Les rendements ne dépendent pas de la quote-part : c'est un rapport entre deux montants qui subissent la même part."
      ]
    },
    related: [{ label: 'Consolidation', helpId: 'patrimoine.entite.consolidation' }],
    keywords: ['biens', 'rendement', 'flux', 'valeur']
  },
  {
    id: 'patrimoine.entite.fiscalite',
    kind: 'section',
    title: "Estimation fiscale de l'entité",
    summary:
      "Cette section estime, pour l'année choisie, l'impôt foncier et l'impôt sur les revenus fonciers des biens de l'entité, selon sa quote-part.",
    howToRead: {
      notes: [
        "Le titre donne le total de l'impôt foncier et celui de l'impôt sur les revenus fonciers, en FCFA.",
        "Chaque bien a sa carte avec sa quote-part ; « Année partielle » signale un rattachement commencé en cours d'année.",
        '« Paramètres à valider » signale que certains paramètres fiscaux sont encore à faire valider.',
        "Si l'année choisie n'a pas de paramètres, ceux de l'année disponible la plus proche sont utilisés, et un message le dit."
      ]
    },
    steps: [{ title: "Choisir l'année", detail: 'Liste « Année fiscale » en haut à droite de la carte.' }],
    consequences: [
      "Il s'agit d'une estimation indicative, à valider par un conseil fiscal : elle ne remplace aucune déclaration.",
      "Un bien dont le rattachement commence après la fin de l'année choisie n'est pas compté."
    ],
    faq: [
      {
        q: "Peut-on s'y fier pour déclarer ?",
        a: 'Non : le calcul est indicatif et repose sur des paramètres encore à valider.'
      }
    ],
    related: [
      { label: 'Détail du calcul', helpId: 'patrimoine.entites.calcul-fiscal' },
      { label: 'Paramètres fiscaux', helpId: 'patrimoine.fiscalite' }
    ],
    keywords: ['impôt', 'taxe foncière', 'revenus fonciers', 'fiscalité', 'estimation']
  },
  {
    id: 'patrimoine.entites.calcul-fiscal',
    kind: 'table',
    title: "Détail du calcul d'un impôt",
    summary:
      'Ce tableau montre, ligne par ligne, comment un impôt est obtenu : base, abattements, taux, montant et source.',
    howToRead: {
      columns: [
        {
          key: 'code',
          label: 'Ligne',
          description:
            'Le type de ligne : Base, Abattement, Base imposable, Principal, Tranche, Minimum, Majoration ou Exonération.'
        },
        { key: 'label', label: 'Libellé', description: "L'explication de la ligne." },
        { key: 'base', label: 'Base', description: 'Le montant sur lequel on calcule.' },
        { key: 'rate', label: 'Taux', description: 'Le taux appliqué, en pourcentage.' },
        { key: 'amount', label: 'Montant', description: 'Le montant de la ligne.' },
        {
          key: 'source',
          label: 'Source',
          description: "Le texte d'où vient le paramètre ; « À valider » signale un paramètre non validé."
        }
      ],
      notes: [
        'Un impôt « non applicable » est signalé par une étiquette (par exemple Exonéré, Exonération temporaire, Paramètres fiscaux indisponibles ou Pays non géré par le moteur fiscal).',
        "Des remarques peuvent s'afficher au-dessus du tableau, par exemple une valeur locative estimée à partir de la valeur marchande."
      ]
    },
    related: [{ label: 'Paramètres fiscaux', helpId: 'patrimoine.fiscalite' }],
    keywords: ['calcul', 'base', 'taux', 'abattement', 'exonération', 'tranche']
  },
  {
    id: 'patrimoine.fiscalite',
    kind: 'page',
    title: 'Paramètres fiscaux',
    summary:
      "Cet écran affiche, en lecture seule, les taux, bases et exonérations que le moteur fiscal utilise pour estimer l'impôt foncier et l'impôt sur les revenus fonciers, par pays et par année.",
    purpose:
      "Il vous permet de vérifier d'où viennent les chiffres des estimations fiscales : chaque ligne indique sa source et si elle est validée.",
    steps: [
      { title: 'Choisir le pays', detail: "Côte d'Ivoire ou Mali, en haut de page." },
      { title: "Choisir l'année", detail: 'Facultatif : sans année, le moteur affiche les plus récentes.' },
      {
        title: 'Rechercher ou filtrer',
        detail: 'Cherchez un impôt, une clé, un bien ou une source ; filtrez par Impôt et Statut.'
      }
    ],
    consequences: [
      'Cet écran ne modifie rien : les paramètres ne se changent pas ici.',
      "Si l'année demandée n'a pas de paramètres, une phrase indique l'année affichée à la place."
    ],
    faq: [
      {
        q: 'Que veut dire « À valider » ?',
        a: "Le paramètre vient des textes en vigueur mais n'a pas encore été confirmé par un conseil fiscal. L'estimation qui l'utilise reste indicative."
      },
      {
        q: 'Comment corriger un taux ?',
        a: 'Pas depuis cet écran : les paramètres sont tenus à jour par la plateforme.'
      },
      {
        q: 'À quoi servent ces paramètres ?',
        a: "Ils servent à estimer l'impôt foncier et l'impôt sur les revenus fonciers : chaque ligne indique sa source et si elle est validée."
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Consulter demande le droit « Voir les biens ».' },
    related: [{ label: 'Tableau des paramètres', helpId: 'patrimoine.fiscalite.tableau' }],
    keywords: ['fiscalité', 'impôt', 'taxe foncière', 'taux', 'paramètres', "côte d'ivoire", 'mali']
  },
  {
    id: 'patrimoine.fiscalite.tableau',
    kind: 'table',
    title: 'Tableau des paramètres fiscaux',
    summary:
      "Chaque ligne est un paramètre du moteur fiscal : à quel impôt et à quel type de bien il s'applique, sa valeur, sa source et son statut.",
    howToRead: {
      columns: [
        { key: 'taxKind', label: 'Impôt', description: '« Impôt foncier » ou « Impôt sur les revenus fonciers ».' },
        {
          key: 'key',
          label: 'Clé',
          description: 'Le nom du paramètre : base de calcul, taux, abattement, minimum, exonération…'
        },
        { key: 'propertyKind', label: 'Bien', description: 'Bâti, Non bâti ou Tous.' },
        {
          key: 'occupancy',
          label: 'Occupation',
          description: 'Habitation principale, Occupé par le propriétaire, Loué, Vacant ou Tous.'
        },
        { key: 'ownerKind', label: 'Propriétaire', description: 'Personne physique, Personne morale ou Tous.' },
        {
          key: 'value',
          label: 'Valeur',
          description: "La valeur, avec « % » ou « an(s) » quand c'est un taux ou une durée."
        },
        { key: 'label', label: 'Libellé', description: 'Explication du paramètre.' },
        {
          key: 'source',
          label: 'Source',
          description: 'Le texte de référence ; « Voir la source » ouvre le lien officiel quand il existe.'
        },
        { key: 'status', label: 'Statut', description: '« Validé » ou « À valider ».' },
        { key: 'notes', label: 'Notes', description: 'Remarques complémentaires.' }
      ],
      statuses: [
        { value: 'VALIDE', label: 'Validé', description: 'Paramètre confirmé.' },
        {
          value: 'A_VALIDER',
          label: 'À valider',
          description: 'Paramètre tiré des textes mais pas encore confirmé par un conseil fiscal.'
        }
      ],
      notes: ["« Tous » veut dire que la ligne s'applique quelle que soit la valeur de cette colonne."]
    },
    faq: [
      {
        q: 'Pourquoi plusieurs lignes pour un même taux ?',
        a: "Le taux dépend du type de bien, de l'occupation et du propriétaire : une ligne par cas."
      }
    ],
    related: [{ label: 'Paramètres fiscaux', helpId: 'patrimoine.fiscalite' }],
    keywords: ['colonnes', 'statuts', 'taux', 'clé', 'source', 'validé']
  },
  {
    id: 'patrimoine.entites.fiscalite-bien',
    kind: 'section',
    title: "Détenteurs et fiscalité d'un bien",
    summary:
      "Cette partie de l'onglet « Patrimoine » d'un bien dit qui le détient et pour quelle part, fixe son profil fiscal et estime son impôt.",
    steps: [
      { title: 'Indiquer les détenteurs', detail: 'Carte « Détenteurs et quotes-parts ».' },
      {
        title: 'Compléter le profil fiscal',
        detail: 'Carte « Profil fiscal », si les valeurs déduites ne conviennent pas.'
      },
      { title: "Lire l'estimation", detail: 'Carte « Estimation fiscale », par année.' }
    ],
    consequences: ["Chaque enregistrement recalcule l'estimation fiscale du bien."],
    related: [
      { label: 'Détenteurs et quotes-parts', helpId: 'patrimoine.entites.detenteurs-bien' },
      { label: 'Profil fiscal', helpId: 'patrimoine.entites.profil-fiscal' },
      { label: 'Estimation fiscale du bien', helpId: 'patrimoine.entites.estimation-bien' }
    ],
    keywords: ['détenteurs', 'profil fiscal', 'impôt', 'bien']
  },
  {
    id: 'patrimoine.entites.detenteurs-bien',
    kind: 'section',
    title: 'Détenteurs et quotes-parts',
    summary:
      "Cette carte liste les entités qui détiennent le bien et la part de chacune. Elle se règle en une fois, avec un seul bouton d'enregistrement.",
    steps: [
      {
        title: 'Ajouter un détenteur',
        detail: "Bouton « Ajouter un détenteur », puis choisissez l'entité et sa part."
      },
      { title: 'Retirer une ligne', detail: 'Bouton « Retirer » de la ligne.' },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer les détenteurs ».' }
    ],
    consequences: [
      "L'enregistrement remplace entièrement la liste des détenteurs du bien.",
      "Le total ne peut pas dépasser 100 % ; une même entité ne peut figurer qu'une fois.",
      "La part non attribuée (sous 100 %) apparaît dans l'estimation comme « Part non rattachée »."
    ],
    faq: [
      {
        q: 'La somme dépasse 100 %.',
        a: "Le message « la somme dépasse 100 % » s'affiche : réduisez une part avant d'enregistrer."
      },
      { q: 'La liste des entités est vide.', a: "Créez d'abord les entités dans l'écran « Entités détentrices »." }
    ],
    permissions: { note: 'Modifier demande le droit « Modifier les biens ».' },
    related: [{ label: 'Entités détentrices', helpId: 'patrimoine.entites' }],
    keywords: ['détenteur', 'quote-part', 'propriétaire', 'part']
  },
  {
    id: 'patrimoine.entites.profil-fiscal',
    kind: 'section',
    title: "Profil fiscal d'un bien",
    summary:
      "Le profil fiscal précise le pays, le caractère bâti ou non bâti et l'occupation du bien, pour affiner l'estimation de l'impôt. Les champs laissés vides sont déduits.",
    howToRead: {
      notes: [
        'Pays, Bâti / non bâti, Occupation : laissez vide pour utiliser la valeur déduite.',
        'Valeur locative saisie : valeur locative que vous déclarez, si elle diffère du loyer.',
        "Exonéré jusqu'à l'année et Motif : pour un bien exonéré temporairement.",
        'Sous le formulaire, « Valeurs déduites » rappelle ce qui est utilisé quand le profil ne dit rien : bâti ou non, occupation, loyer annuel et valeur marchande.'
      ]
    },
    steps: [
      { title: 'Compléter les champs utiles' },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer le profil fiscal ».' }
    ],
    consequences: ["L'estimation fiscale du bien est recalculée après l'enregistrement."],
    permissions: { note: 'Modifier demande le droit « Modifier les biens ».' },
    related: [{ label: 'Estimation fiscale du bien', helpId: 'patrimoine.entites.estimation-bien' }],
    keywords: ['profil fiscal', 'bâti', 'occupation', 'exonération', 'valeur locative']
  },
  {
    id: 'patrimoine.entites.estimation-bien',
    kind: 'section',
    title: "Estimation fiscale d'un bien",
    summary:
      "Pour l'année choisie, cette carte estime les impôts du bien, détenteur par détenteur, selon la quote-part de chacun.",
    steps: [{ title: "Choisir l'année", detail: 'Liste « Année fiscale » en haut à droite.' }],
    consequences: [
      "C'est une estimation indicative, à valider par un conseil fiscal : elle ne remplace aucune déclaration."
    ],
    faq: [
      {
        q: 'Que veut dire « Part non rattachée » ?',
        a: "La part du bien qui n'est attribuée à aucune entité."
      }
    ],
    related: [{ label: 'Détail du calcul', helpId: 'patrimoine.entites.calcul-fiscal' }],
    keywords: ['estimation', 'impôt', 'année fiscale']
  }
];

export default entries;
