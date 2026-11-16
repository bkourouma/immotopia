import type { HelpEntry } from '../../../types';

/** Zone « chantiers » du module finance (fr). */
const entries: HelpEntry[] = [
  {
    id: 'finance.chantiers.page',
    kind: 'page',
    title: 'Liste des chantiers',
    summary:
      "Retrouvez ici tous les chantiers de votre agence, avec leur zone, leur bien, leur statut et leur coût réel. C'est le point de départ pour créer un chantier et ouvrir sa fiche.",
    purpose:
      "Un chantier regroupe toutes les dépenses d'une opération de construction : factures fournisseurs, pièces de caisse, salaires, situations de tâcherons, sorties de stock et loyer du terrain. Il peut être créé sans bien, par exemple sur un terrain loué.",
    steps: [
      {
        title: 'Créer un chantier',
        detail: 'Cliquez sur « Nouveau chantier », remplissez le formulaire, puis « Créer le chantier ».'
      },
      {
        title: 'Rechercher',
        detail: 'Tapez un nom, une zone, un bien ou un responsable dans le champ de recherche.'
      },
      {
        title: 'Filtrer',
        detail: 'Réduisez la liste avec les filtres Statut, Bien et Coût réel.'
      },
      {
        title: 'Ouvrir un chantier',
        detail: 'Cliquez sur « Voir le détail » (ou sur la carte, sur téléphone) pour ouvrir sa fiche.'
      },
      {
        title: 'Exporter',
        detail:
          'Bouton « Exporter » : tous les chantiers correspondant à vos filtres sont exportés, pas seulement la page affichée.'
      }
    ],
    consequences: [
      'Créer un chantier ne passe aucune écriture comptable et ne prévient personne. Le chantier démarre « Planifié », avec un coût réel de 0 FCFA.',
      'Selon votre abonnement, le nombre de chantiers non clôturés peut être limité : la création est alors refusée avec un message.',
      "Le budget, le stock et la clôture d'un chantier se gèrent ensuite sur leurs propres écrans."
    ],
    faq: [
      {
        q: 'Pourquoi mon chantier est-il « Sans bien (terrain loué) » ?',
        a: "Le bien est facultatif à la création : un chantier peut démarrer sur un terrain loué où aucun bien n'existe encore au patrimoine."
      },
      {
        q: 'Comment modifier le coût réel ?',
        a: "Il ne se saisit pas : c'est la somme des dépenses validées imputées au chantier. Pour le faire évoluer, validez ou corrigez la pièce d'origine."
      },
      {
        q: "Où voir le budget d'un chantier ?",
        a: 'Depuis le tableau de bord des chantiers, bouton « Voir le budget » sur la ligne du chantier.'
      },
      {
        q: 'Je ne vois pas « Nouveau chantier ». Pourquoi ?',
        a: "Cette action demande le droit « Gérer les chantiers ». Demandez-le à l'administrateur de votre agence."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter demande « Voir les comptes de tiers » ; créer un chantier demande « Gérer les chantiers ».'
    },
    related: [
      {
        label: 'Comment lire le tableau des chantiers',
        helpId: 'finance.chantiers.tableau'
      },
      {
        label: 'Tableau de bord des chantiers',
        helpId: 'finance.tableau-de-bord-chantiers.page'
      }
    ],
    keywords: [
      'chantier',
      'chantiers',
      'construction',
      'projet',
      'travaux',
      'terrain loué',
      'coût réel',
      'nouveau chantier'
    ]
  },
  {
    id: 'finance.chantiers.tableau',
    kind: 'table',
    title: 'Tableau des chantiers',
    summary:
      'Chaque ligne est un chantier de votre agence. Le tableau montre sa zone, son bien, son responsable, son statut et son coût réel.',
    howToRead: {
      columns: [
        {
          key: 'nom',
          label: 'Chantier',
          description: 'Le nom du chantier.'
        },
        {
          key: 'zone',
          label: 'Zone',
          description:
            "Le quartier ou la zone saisie à la création. Un tiret (—) signifie qu'aucune zone n'est enregistrée."
        },
        {
          key: 'bien',
          label: 'Bien',
          description:
            "Le bien rattaché au chantier. « Sans bien (terrain loué) » signifie qu'aucun bien n'est rattaché."
        },
        {
          key: 'responsable',
          label: 'Responsable',
          description:
            "La personne responsable du chantier. Cet écran ne permet pas de la choisir : un tiret (—) signifie qu'aucun responsable n'est enregistré."
        },
        {
          key: 'statut',
          label: 'Statut',
          description: "L'état du chantier (voir les statuts ci-dessous)."
        },
        {
          key: 'cout',
          label: 'Coût réel',
          description:
            "La somme des dépenses validées et non annulées imputées au chantier, en FCFA. Elle est calculée par l'application, jamais saisie."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Voir le détail » ouvre la fiche du chantier.'
        }
      ],
      statuses: [
        {
          value: 'PLANNED',
          label: 'Planifié',
          description: "Statut d'un chantier qui vient d'être créé."
        },
        {
          value: 'IN_PROGRESS',
          label: 'En cours',
          description: 'Chantier actif. Un chantier rouvert après sa clôture repasse « En cours ».'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspendu',
          description: 'Chantier mis en pause. Il reçoit encore sa part du loyer du terrain auquel il est rattaché.'
        },
        {
          value: 'CLOSED',
          label: 'Clôturé',
          description: "Chantier clôturé : son coût est figé et il n'accepte plus aucune dépense."
        }
      ],
      notes: [
        'La recherche porte sur le nom, la zone, le bien et le responsable. Les filtres sont Statut, Bien et Coût réel (minimum et maximum, en FCFA).',
        'Tous les statuts sont listés, clôturés compris : utilisez le filtre Statut pour les masquer.'
      ]
    },
    steps: [
      {
        title: 'Ouvrir un chantier',
        detail: 'Cliquez sur « Voir le détail » à droite de la ligne.'
      }
    ],
    faq: [
      {
        q: 'Que contient le coût réel ?',
        a: 'Les imputations validées du chantier : factures fournisseurs, pièces de caisse, notes de salaire, situations de tâcherons, sorties de stock et loyer de terrain.'
      },
      {
        q: "Pourquoi le coût réel n'a-t-il pas bougé après ma facture ?",
        a: "Une pièce en brouillon ne compte pas : le coût réel ne change qu'à la validation de la pièce."
      },
      {
        q: 'Un chantier clôturé reste-t-il dans la liste ?',
        a: 'Oui. Son coût réel est alors figé.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: "Fiche d'un chantier",
        helpId: 'finance.chantier.page'
      }
    ],
    keywords: ['coût réel', 'statut', 'zone', 'responsable', 'liste des chantiers']
  },
  {
    id: 'finance.chantiers.nouveau',
    kind: 'section',
    title: 'Nouveau chantier',
    summary:
      'Ce formulaire crée un chantier. Seul le nom est obligatoire : la zone, le bien et les dates sont facultatifs.',
    steps: [
      {
        title: 'Nom du chantier',
        detail: 'Obligatoire. Par exemple « Villa duplex — Angré Centre ».'
      },
      {
        title: 'Zone',
        detail: 'Facultative. Le quartier ou la commune, par exemple « Angré, Cocody ».'
      },
      {
        title: 'Bien',
        detail:
          "Facultatif. Tapez le titre d'un bien pour le chercher ; laissez vide pour un chantier sur terrain loué."
      },
      {
        title: 'Début et Fin prévue',
        detail: 'Facultatives. La date de fin prévue ne peut pas précéder la date de début.'
      },
      {
        title: 'Créer',
        detail: 'Cliquez sur « Créer le chantier » : vous arrivez sur la fiche du nouveau chantier.'
      }
    ],
    consequences: [
      'Le chantier est créé « Planifié ». Si vous laissez la date de début vide, la date du jour est retenue.',
      "Aucune écriture comptable n'est passée et personne n'est prévenu.",
      'Le responsable ne se choisit pas dans ce formulaire.',
      'Si votre abonnement limite le nombre de chantiers non clôturés et que la limite est atteinte, la création est refusée avec un message.'
    ],
    faq: [
      {
        q: 'Puis-je créer un chantier sans bien ?',
        a: "Oui. C'est même le cas d'un chantier sur terrain loué : laissez le champ « Bien » vide."
      },
      {
        q: "Pourquoi « Créer le chantier » m'affiche une erreur ?",
        a: 'Le nom du chantier est obligatoire. Un autre message peut venir de la limite de votre abonnement.'
      },
      {
        q: 'Où saisir le budget ?',
        a: 'Pas ici : le budget se pose sur son propre écran, accessible depuis le tableau de bord des chantiers.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Créer un chantier demande le droit « Gérer les chantiers ».'
    },
    related: [
      {
        label: 'Liste des chantiers',
        helpId: 'finance.chantiers.page'
      }
    ],
    keywords: ['créer un chantier', 'nouveau chantier', 'ajouter un chantier', 'terrain loué']
  },
  {
    id: 'finance.chantier.page',
    kind: 'page',
    title: "Fiche d'un chantier",
    summary:
      "La fiche réunit le coût réel du chantier, son avancement et toutes les dépenses qui lui sont imputées, par poste puis pièce par pièce. Aucun montant ne s'y saisit.",
    purpose:
      "Chaque facture fournisseur validée, pièce de caisse validée, note de salaire, situation de tâcheron, sortie de stock ou loyer de terrain est imputé à un poste de dépense du chantier. La fiche additionne ces imputations : c'est le coût réel.",
    steps: [
      {
        title: 'Lire les chiffres',
        detail:
          "Les quatre cartes du haut donnent le coût réel, l'avancement, le début et la fin prévue (ou la date de clôture)."
      },
      {
        title: 'Voir les postes',
        detail: "L'onglet « Sous-totaux par poste » additionne les dépenses poste par poste."
      },
      {
        title: 'Voir les pièces',
        detail:
          "L'onglet « Imputations » liste chaque dépense avec sa date, son poste, sa nature et sa pièce d'origine."
      },
      {
        title: 'Saisir une dépense de caisse',
        detail: '« Nouvelle pièce de caisse » ouvre la caisse avec ce chantier déjà choisi.'
      },
      {
        title: 'Aller plus loin',
        detail: 'Les actions « Lots et clôture » et « Stock du chantier » ouvrent les écrans correspondants.'
      }
    ],
    consequences: [
      'La fiche est en lecture : rien ne se modifie ici.',
      "Un chantier clôturé n'accepte plus de dépense : « Nouvelle pièce de caisse » est alors grisé, et il faut d'abord rouvrir le chantier."
    ],
    faq: [
      {
        q: "Pourquoi ma facture n'apparaît-elle pas ?",
        a: "Seules les dépenses validées et non annulées sont imputées. Une facture en brouillon n'apparaît pas."
      },
      {
        q: 'Comment corriger le coût réel ?',
        a: "Il ne se corrige pas à la main : agissez sur la pièce d'origine, puis le coût se met à jour."
      },
      {
        q: 'Où trouver le budget de ce chantier ?',
        a: 'Dans le tableau de bord des chantiers, bouton « Voir le budget ».'
      },
      {
        q: 'Que signifie « Passé au stock le … » ?',
        a: "Depuis cette date, les factures de matériaux n'entrent plus directement dans le coût : voir l'écran « Stock du chantier »."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Les chiffres du chantier',
        helpId: 'finance.chantier.indicateurs'
      },
      {
        label: 'Lots et clôture du chantier',
        helpId: 'finance.cloture-chantier.page'
      },
      {
        label: 'Stock du chantier',
        helpId: 'finance.stock-chantier.page'
      }
    ],
    keywords: ['chantier', 'fiche chantier', 'coût réel', 'imputation', 'dépenses du chantier', 'avancement']
  },
  {
    id: 'finance.chantier.indicateurs',
    kind: 'section',
    title: 'Les chiffres du chantier',
    summary:
      'Quatre cartes résument le chantier : coût réel, avancement, début, et fin prévue (ou date de clôture). Aucune ne se saisit.',
    howToRead: {
      notes: [
        "Coût réel : somme des dépenses imputées au chantier, validées et non annulées. Une pièce en brouillon ou annulée n'y entre pas. C'est le même chiffre que dans la liste des chantiers.",
        "Avancement : le pourcentage du dernier relevé d'avancement enregistré pour le chantier (0 % s'il n'y en a pas). Cet écran ne permet pas d'en saisir.",
        'Début : la date de début du chantier. Fin prévue : la date prévue à la création, ou un tiret (—) si elle est vide.',
        'Sur un chantier clôturé, la dernière carte devient « Clôturé le » et donne la date de clôture.'
      ]
    },
    faq: [
      {
        q: "Pourquoi l'avancement n'évolue-t-il pas ?",
        a: "Il reprend le dernier relevé d'avancement enregistré. Cet écran ne le modifie pas."
      },
      {
        q: 'Le coût réel inclut-il ce qui est commandé mais pas encore facturé ?',
        a: "Non. Le coût réel ne compte que les dépenses validées. Les bons de commande émis apparaissent dans l'« Engagé » du budget."
      },
      {
        q: 'Le coût réel change-t-il si le chantier passe au stock ?',
        a: "Pour la suite oui : les factures de matériaux n'y entrent plus directement, c'est la sortie de stock qui y entre."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Imputations du chantier',
        helpId: 'finance.chantier.imputations'
      },
      {
        label: 'Sous-totaux par poste',
        helpId: 'finance.chantier.postes'
      }
    ],
    keywords: ['coût réel', 'avancement', 'fin prévue', 'indicateurs']
  },
  {
    id: 'finance.chantier.postes',
    kind: 'table',
    title: 'Sous-totaux par poste',
    summary:
      'Ce tableau additionne les dépenses du chantier poste par poste (maçonnerie, électricité, etc.). Le total de ces sous-totaux est le coût réel.',
    howToRead: {
      columns: [
        {
          key: 'poste',
          label: 'Poste',
          description: 'Le poste de dépense auquel les pièces sont imputées.'
        },
        {
          key: 'montant',
          label: 'Sous-total',
          description: 'La somme des imputations validées et non annulées de ce poste, en FCFA.'
        }
      ],
      notes: [
        "Un poste n'apparaît que s'il a au moins une imputation. Les postes suivent l'ordre défini dans votre plan de postes.",
        "Pour comparer un poste à son budget, lisez aussi l'onglet « Lignes du budget » de l'écran Budget : les montants prévus y sont aussi par poste. L'engagé, lui, n'est calculé que pour le chantier entier."
      ]
    },
    faq: [
      {
        q: 'Pourquoi un poste est-il absent ?',
        a: 'Aucune dépense validée ne lui est encore imputée.'
      },
      {
        q: 'Le tableau peut-il être exporté ?',
        a: 'Oui, avec le bouton « Exporter ».'
      },
      {
        q: "Comment voir le détail d'un poste ?",
        a: "Ouvrez l'onglet « Imputations » et filtrez sur le poste."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Imputations du chantier',
        helpId: 'finance.chantier.imputations'
      },
      {
        label: "Budget d'un chantier",
        helpId: 'finance.budget-chantier.page'
      }
    ],
    keywords: ['poste', 'sous-total', 'par poste', 'répartition des dépenses']
  },
  {
    id: 'finance.chantier.imputations',
    kind: 'table',
    title: 'Imputations du chantier',
    summary:
      'Chaque ligne est une dépense validée imputée au chantier, avec sa date, son poste, sa nature et la pièce dont elle vient.',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date',
          description:
            "La date de la pièce d'origine (par exemple la date de la facture, ou le mois du loyer de terrain)."
        },
        {
          key: 'poste',
          label: 'Poste',
          description: 'Le poste de dépense sur lequel la dépense est imputée.'
        },
        {
          key: 'nature',
          label: 'Nature',
          description:
            'Le type de pièce : Facture fournisseur, Règlement fournisseur, Pièce de caisse, Note de salaire, Situation de tâcheron, Sortie de stock ou Loyer de terrain.'
        },
        {
          key: 'piece',
          label: "Pièce d'origine",
          description:
            'Un libellé lisible de la pièce (fournisseur, référence, mois et terrain…), pas un numéro technique.'
        },
        {
          key: 'montant',
          label: 'Montant',
          description: 'Le montant imputé au chantier, en FCFA.'
        }
      ],
      notes: [
        "Seules les imputations validées et non annulées sont listées : une pièce en brouillon ou annulée n'apparaît pas.",
        "Filtres : champ libre (poste, nature, pièce), Nature, Poste, Date et Montant. L'export reprend toutes les lignes filtrées."
      ]
    },
    faq: [
      {
        q: "Pourquoi une dépense n'apparaît-elle pas ?",
        a: 'Sa pièce est peut-être encore en brouillon, ou annulée.'
      },
      {
        q: 'Que veut dire « Loyer de terrain » ?',
        a: "La part du loyer d'un terrain loué constatée chaque mois et imputée aux chantiers rattachés au bail."
      },
      {
        q: 'Un même montant peut-il être compté deux fois ?',
        a: "Le coût réel additionne chaque imputation une seule fois. Une facture rapprochée d'un bon de commande n'est comptée qu'à sa validation."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Sous-totaux par poste',
        helpId: 'finance.chantier.postes'
      }
    ],
    keywords: ['imputation', 'dépense', 'pièce', 'nature', 'facture', 'pièce de caisse']
  },
  {
    id: 'finance.budget-chantier.page',
    kind: 'page',
    title: "Budget d'un chantier",
    summary:
      'Posez ici le budget prévisionnel du chantier par poste de dépense, validez-le, puis faites-le évoluer par avenants. Les cartes Réalisé et Engagé permettent de le comparer à la dépense.',
    purpose:
      "Le budget fixe l'enveloppe prévue pour chaque poste. Une fois validé, il ne reçoit plus de nouvelle ligne : toute évolution passe par un avenant, qui ajoute ou retire un montant sur un poste. On y accède depuis le tableau de bord des chantiers (« Voir le budget »).",
    steps: [
      {
        title: 'Poser le budget',
        detail:
          'Sans budget, donnez-lui un nom, ajoutez une ligne par poste (poste, libellé, montant), puis « Créer le budget ». Il est créé en brouillon.'
      },
      {
        title: 'Valider le budget',
        detail: 'Contrôlez les lignes, puis « Valider le budget » et confirmez.'
      },
      {
        title: 'Suivre les chiffres',
        detail: "Les cartes donnent le budget initial, le budget révisé, le réalisé et l'engagé."
      },
      {
        title: 'Faire évoluer par avenant',
        detail:
          "Onglet « Avenants » : « Nouvel avenant » (motif, poste, écart en plus ou en moins), puis « Valider » l'avenant."
      }
    ],
    consequences: [
      "Valider un budget est irréversible : il ne peut plus recevoir de ligne, et un chantier n'a qu'un seul budget validé.",
      "Valider un avenant est irréversible : son écart s'ajoute au budget révisé. Un avenant en brouillon ne compte pas.",
      'Budget et avenants sont des prévisions : ils ne passent aucune écriture comptable et ne préviennent personne.',
      'Une fois le budget créé, ses lignes ne se modifient plus depuis cet écran.'
    ],
    faq: [
      {
        q: 'Comment comparer le budget à la dépense, poste par poste ?',
        a: "Le budget a des montants par poste (onglet « Lignes du budget »), la fiche du chantier a le réalisé par poste (« Sous-totaux par poste »). L'engagé n'est calculé que pour le chantier entier."
      },
      {
        q: 'Pourquoi un avenant est-il refusé ?',
        a: "Seul un budget validé peut recevoir un avenant : validez d'abord le budget."
      },
      {
        q: 'Que faire si une ligne du budget est fausse ?',
        a: 'Si le budget est validé, corrigez par un avenant (écart négatif ou positif sur le poste).'
      },
      {
        q: 'Pourquoi le chantier apparaît-il « Sans budget » au tableau de bord ?',
        a: "Le tableau de bord ne lit que le budget validé : un budget en brouillon n'y compte pas."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter demande « Voir les comptes de tiers » ; créer un budget et saisir un avenant demandent « Gérer les chantiers » ; valider un budget ou un avenant demande « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Budget initial et budget révisé',
        helpId: 'finance.budget-chantier.budget-revise'
      },
      {
        label: 'Engagé et réalisé',
        helpId: 'finance.budget-chantier.engage-realise'
      },
      {
        label: 'Tableau de bord des chantiers',
        helpId: 'finance.tableau-de-bord-chantiers.page'
      }
    ],
    keywords: ['budget', 'budget chantier', 'avenant', 'prévision', 'poste', 'enveloppe', 'dépassement']
  },
  {
    id: 'finance.budget-chantier.budget-revise',
    kind: 'section',
    title: 'Budget initial et budget révisé',
    summary:
      "Le budget initial est le total des lignes du budget. Le budget révisé y ajoute les avenants validés ; c'est lui qui fait foi dès qu'un avenant est passé.",
    howToRead: {
      notes: [
        'Budget initial = somme des montants prévus de toutes les lignes du budget.',
        'Budget révisé = budget initial + somme des écarts (en plus ou en moins) des seuls avenants validés. Les avenants en brouillon ne comptent pas. Sans avenant validé, les deux sont égaux.',
        "Le tableau de bord des chantiers mesure l'écart contre le budget révisé, jamais contre l'initial.",
        "Les montants sont en FCFA. Ils sont calculés par l'application, jamais saisis dans ces cartes."
      ]
    },
    faq: [
      {
        q: "Pourquoi le budget révisé n'a-t-il pas changé après mon avenant ?",
        a: "Un avenant ne compte qu'une fois validé. Validez-le depuis l'onglet « Avenants »."
      },
      {
        q: 'Le budget révisé peut-il baisser ?',
        a: "Oui : un avenant peut comporter un écart négatif, par exemple pour retirer une partie d'une enveloppe."
      },
      {
        q: 'Le budget initial change-t-il avec les avenants ?',
        a: 'Non. Il reste le total des lignes posées à la création.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Lignes du budget',
        helpId: 'finance.budget-chantier.lignes'
      },
      {
        label: 'Avenants du budget',
        helpId: 'finance.budget-chantier.avenants'
      }
    ],
    keywords: ['budget initial', 'budget révisé', 'avenant', 'enveloppe']
  },
  {
    id: 'finance.budget-chantier.engage-realise',
    kind: 'section',
    title: 'Engagé et réalisé',
    summary:
      "Le réalisé est ce qui a été dépensé et validé. L'engagé y ajoute ce qui est commandé mais pas encore facturé.",
    howToRead: {
      notes: [
        "Réalisé = somme des dépenses imputées au chantier, validées et non annulées (factures fournisseurs, pièces de caisse, salaires, situations de tâcherons, sorties de stock, loyer de terrain). C'est le « Coût réel » de la fiche du chantier.",
        "Engagé = réalisé + reste à facturer des bons de commande émis. Le reste à facturer d'un bon est son montant total moins les factures validées rattachées à ce bon, jamais en dessous de zéro.",
        "Un bon de commande en brouillon ou annulé n'engage rien. Une facture rapprochée d'un bon n'est donc pas comptée deux fois : elle sort du reste à facturer et entre dans le réalisé.",
        "L'engagé est toujours supérieur ou égal au réalisé. Ces deux chiffres portent sur le chantier entier : aucun écran ne les donne par poste.",
        "Ces cartes n'apparaissent que lorsque le chiffre a pu être lu."
      ]
    },
    faq: [
      {
        q: "Pourquoi l'engagé est-il plus élevé que le réalisé ?",
        a: 'Des bons de commande émis ne sont pas encore, ou pas entièrement, facturés : leur reste à facturer est déjà compté.'
      },
      {
        q: 'Quand une alerte de seuil est-elle évaluée ?',
        a: "À la validation d'une facture fournisseur ou d'une pièce de caisse, et à l'émission d'un bon de commande. Elle se compare à l'engagé et au budget révisé."
      },
      {
        q: 'Le budget est-il dépassé quand le réalisé dépasse le budget ?',
        a: "Le tableau de bord compare l'engagé (et non le réalisé seul) au budget révisé : l'écart est le budget révisé moins l'engagé."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Sous-totaux par poste',
        helpId: 'finance.chantier.postes'
      },
      {
        label: 'Comment lire le tableau de bord',
        helpId: 'finance.tableau-de-bord-chantiers.tableau'
      }
    ],
    keywords: ['engagé', 'réalisé', 'bon de commande', 'reste à facturer', 'dépense', 'coût réel']
  },
  {
    id: 'finance.budget-chantier.creation',
    kind: 'section',
    title: 'Poser le budget',
    summary:
      "Quand le chantier n'a pas de budget, ce formulaire permet de le composer ligne par ligne. C'est le seul moment où l'on ajoute des lignes.",
    steps: [
      {
        title: 'Nom du budget',
        detail: 'Obligatoire, par exemple « Budget initial 2026 ».'
      },
      {
        title: 'Poste',
        detail: 'Choisissez un poste de dépense parmi les postes actifs.'
      },
      {
        title: 'Libellé',
        detail: 'Décrivez la ligne. Il est obligatoire.'
      },
      {
        title: 'Montant',
        detail:
          'Saisissez le « Montant prévu », ou renseignez « Quantité » et « Prix unitaire » : le montant prévu devient alors leur produit et ne se saisit plus.'
      },
      {
        title: 'Ajouter ou retirer',
        detail: '« Ajouter une ligne » pour un autre poste ; la corbeille retire une ligne (il en faut au moins une).'
      },
      {
        title: 'Créer',
        detail:
          '« Créer le budget » est actif quand chaque ligne a un poste, un libellé et un montant supérieur à zéro.'
      }
    ],
    consequences: [
      'Le budget est créé en brouillon : il ne compte pas encore au tableau de bord, il faut le valider.',
      "Un même poste ne peut porter qu'une seule ligne dans un budget : l'application refuse sinon.",
      'Une fois le budget créé, aucune ligne ne peut être ajoutée ni modifiée depuis cet écran.',
      "Aucune écriture comptable n'est passée."
    ],
    faq: [
      {
        q: 'Dois-je renseigner la quantité et le prix unitaire ?',
        a: 'Non. Pour une enveloppe de frais divers, saisissez directement le montant prévu.'
      },
      {
        q: 'Pourquoi « Créer le budget » est-il grisé ?',
        a: "Le nom du budget est vide, ou une ligne n'a pas de poste, de libellé ou de montant positif."
      },
      {
        q: 'Puis-je corriger un montant après la création ?',
        a: 'Pas depuis cet écran. Après validation, une correction passe par un avenant.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Créer un budget demande le droit « Gérer les chantiers ».'
    },
    related: [
      {
        label: 'Valider le budget',
        helpId: 'finance.budget-chantier.validation'
      }
    ],
    keywords: ['créer un budget', 'ligne de budget', 'poste', 'montant prévu', 'quantité', 'prix unitaire']
  },
  {
    id: 'finance.budget-chantier.validation',
    kind: 'section',
    title: 'Valider le budget',
    summary:
      'Valider le budget le rend définitif : il ne peut plus recevoir de ligne. Seul un avenant peut ensuite le faire évoluer.',
    steps: [
      {
        title: 'Contrôler',
        detail: "Relisez l'onglet « Lignes du budget » : postes, libellés, montants."
      },
      {
        title: 'Valider',
        detail: "Cliquez sur « Valider le budget », lisez l'avertissement, puis « Confirmer la validation »."
      }
    ],
    consequences: [
      "La validation est irréversible : le budget n'accepte plus de nouvelle ligne.",
      "Un chantier n'a qu'un seul budget validé : il ne se remplace pas, il s'amende.",
      "Après validation, l'écran affiche « Validé par … le … » et le budget compte au tableau de bord des chantiers.",
      "Aucune écriture comptable n'est passée et personne n'est prévenu."
    ],
    faq: [
      {
        q: 'Puis-je annuler une validation ?',
        a: 'Non. Pour changer le budget, saisissez puis validez un avenant.'
      },
      {
        q: 'Qui peut valider ?',
        a: "Un utilisateur ayant le droit « Valider des pièces financières », en général l'administrateur de l'agence."
      },
      {
        q: 'Que se passe-t-il pour les alertes ?',
        a: "Une alerte de dépassement ne peut exister que sur un budget validé : elle est évaluée ensuite, à la validation d'une dépense ou à l'émission d'un bon de commande."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Valider un budget demande le droit « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Avenants du budget',
        helpId: 'finance.budget-chantier.avenants'
      }
    ],
    keywords: ['valider le budget', 'validation', 'irréversible', 'budget validé']
  },
  {
    id: 'finance.budget-chantier.lignes',
    kind: 'table',
    title: 'Lignes du budget',
    summary: 'Chaque ligne est un montant prévu pour un poste de dépense. Leur total est le budget initial.',
    howToRead: {
      columns: [
        {
          key: 'poste',
          label: 'Poste',
          description: 'Le poste de dépense auquel la ligne se rapporte.'
        },
        {
          key: 'libelle',
          label: 'Libellé',
          description: 'La description de la ligne.'
        },
        {
          key: 'quantite',
          label: 'Quantité',
          description: 'La quantité prévue. Une case vide signifie que la ligne a été saisie directement en montant.'
        },
        {
          key: 'prix-unitaire',
          label: 'Prix unitaire',
          description: "Le prix d'une unité, en FCFA. Case vide si la ligne a été saisie directement en montant."
        },
        {
          key: 'montant',
          label: 'Montant prévu',
          description:
            'Le montant prévu en FCFA. Quand quantité et prix unitaire sont renseignés, il en est le produit.'
        }
      ],
      notes: [
        'Filtres : champ libre (poste, libellé) et Poste de dépense.',
        "Les lignes ne changent plus une fois le budget créé : seuls les avenants le font évoluer, et ils n'ajoutent pas de ligne ici."
      ]
    },
    faq: [
      {
        q: 'Pourquoi quantité et prix unitaire sont-ils vides ?',
        a: 'La ligne a été saisie en montant direct, par exemple pour une enveloppe de frais divers.'
      },
      {
        q: 'Les avenants modifient-ils ce tableau ?',
        a: "Non. Leurs écarts apparaissent dans l'onglet « Avenants » et dans le budget révisé."
      },
      {
        q: 'Comment comparer une ligne à la dépense réelle ?',
        a: 'Voir le sous-total du même poste dans la fiche du chantier, onglet « Sous-totaux par poste ».'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Sous-totaux par poste',
        helpId: 'finance.chantier.postes'
      }
    ],
    keywords: ['lignes du budget', 'montant prévu', 'poste', 'quantité', 'prix unitaire']
  },
  {
    id: 'finance.budget-chantier.avenants',
    kind: 'table',
    title: 'Avenants du budget',
    summary:
      'Chaque ligne est un avenant : une modification du budget validé, avec son motif et son écart total (en plus ou en moins).',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date',
          description: "La date de l'avenant."
        },
        {
          key: 'motif',
          label: 'Motif',
          description: "La raison de l'avenant, par exemple « Renchérissement du ciment »."
        },
        {
          key: 'saisi',
          label: 'Saisi par',
          description: "La personne qui a saisi l'avenant."
        },
        {
          key: 'ecart',
          label: 'Écart',
          description:
            "Le total des écarts des lignes de l'avenant, signé : + pour une hausse du budget, − pour une baisse."
        },
        {
          key: 'statut',
          label: 'Statut',
          description: 'Brouillon ou Validé.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Valider » apparaît sur un avenant en brouillon.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description:
            'Avenant saisi mais pas encore validé : il ne compte pas dans le budget révisé et peut encore être validé.'
        },
        {
          value: 'VALIDATED',
          label: 'Validé',
          description: 'Avenant validé : définitif, son écart est inclus dans le budget révisé.'
        }
      ],
      notes: ['Filtres : champ libre (motif, saisi par), Statut et Date.']
    },
    steps: [
      {
        title: 'Valider un avenant',
        detail: "Cliquez sur « Valider » sur sa ligne, lisez l'avertissement, puis « Confirmer la validation »."
      }
    ],
    consequences: [
      "Valider un avenant est irréversible : il ne peut plus être modifié et son écart s'ajoute au budget révisé du chantier.",
      "Aucune écriture comptable n'est passée et personne n'est prévenu."
    ],
    faq: [
      {
        q: 'Pourquoi mon avenant ne change-t-il pas le budget révisé ?',
        a: 'Il est encore en brouillon : validez-le.'
      },
      {
        q: 'Puis-je supprimer un avenant en brouillon ?',
        a: 'Cet écran ne propose pas de suppression ni de modification : seule la validation est possible.'
      },
      {
        q: 'Un écart peut-il être négatif ?',
        a: 'Oui, un avenant peut réduire une enveloppe.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter demande « Voir les comptes de tiers » ; créer un budget et saisir un avenant demandent « Gérer les chantiers » ; valider un budget ou un avenant demande « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Nouvel avenant',
        helpId: 'finance.budget-chantier.nouvel-avenant'
      },
      {
        label: 'Budget initial et budget révisé',
        helpId: 'finance.budget-chantier.budget-revise'
      }
    ],
    keywords: ['avenant', 'avenants', 'modification du budget', 'écart', 'valider un avenant']
  },
  {
    id: 'finance.budget-chantier.nouvel-avenant',
    kind: 'section',
    title: 'Nouvel avenant',
    summary:
      'Ce formulaire enregistre une modification du budget validé : un motif, puis une ou plusieurs lignes avec un écart en plus ou en moins sur un poste.',
    steps: [
      {
        title: 'Date',
        detail: "La date de l'avenant. Elle est préremplie avec la date du jour."
      },
      {
        title: 'Motif',
        detail: 'Obligatoire, par exemple « Renchérissement du ciment ».'
      },
      {
        title: 'Poste',
        detail: 'Choisissez le poste concerné pour chaque ligne.'
      },
      {
        title: 'Écart',
        detail: "Saisissez l'écart en FCFA, positif pour augmenter, négatif pour réduire. Un écart nul est refusé."
      },
      {
        title: 'Quantité et prix unitaire',
        detail:
          "Option : avec une quantité (toujours positive) et un prix unitaire (positif ou négatif), l'écart devient leur produit. Le signe se porte par le prix unitaire."
      },
      {
        title: 'Enregistrer',
        detail: "« Enregistrer l'avenant » le crée en brouillon ; il reste à le valider dans le tableau au-dessus."
      }
    ],
    consequences: [
      "L'avenant est créé en brouillon : il ne change pas encore le budget révisé.",
      "Seul un budget validé peut recevoir un avenant : sur un budget en brouillon, l'application refuse l'enregistrement.",
      "Aucune écriture comptable n'est passée et personne n'est prévenu."
    ],
    faq: [
      {
        q: 'Comment réduire une enveloppe ?',
        a: 'Saisissez un écart négatif, par exemple −500 000, sans quantité ni prix unitaire.'
      },
      {
        q: "Pourquoi « Enregistrer l'avenant » est-il grisé ?",
        a: "Il manque le motif, ou une ligne n'a pas de poste ou a un écart nul."
      },
      {
        q: 'Puis-je ajouter un poste absent du budget ?',
        a: "Le formulaire propose les postes actifs de votre agence. Une réponse de l'application peut vous dire si ce choix n'est pas accepté."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Saisir un avenant demande le droit « Gérer les chantiers ».'
    },
    related: [
      {
        label: 'Avenants du budget',
        helpId: 'finance.budget-chantier.avenants'
      }
    ],
    keywords: ['nouvel avenant', 'saisir un avenant', 'écart', 'renchérissement', 'réduire le budget']
  },
  {
    id: 'finance.stock-chantier.page',
    kind: 'page',
    title: 'Stock du chantier',
    summary:
      "Cet écran dit si le chantier est passé au stock, et rapproche ce qui a été acheté, consommé et ce qui reste sur le chantier. Tous les chiffres sont calculés par l'application.",
    purpose:
      "Un chantier passé au stock reçoit sa marchandise dans un lieu de stockage : ce n'est plus la facture de matériaux qui fait entrer la dépense dans le coût du chantier, mais la sortie de magasin. L'écran vous aide à voir où est passée la marchandise facturée.",
    steps: [
      {
        title: "Lire l'état",
        detail: 'Le bandeau en haut dit si le chantier est « Passé au stock » ou « Pas au stock ».'
      },
      {
        title: 'Faire passer le chantier au stock',
        detail:
          '« Faire passer ce chantier au stock », puis « Confirmer le passage au stock » (geste irréversible, lisez le bandeau).'
      },
      {
        title: "Faire l'inventaire d'ouverture",
        detail: "Après la bascule, « Faire l'inventaire d'ouverture » constate ce qui se trouve déjà sur place."
      },
      {
        title: 'Lire les chiffres',
        detail:
          'Les six cartes puis le tableau « Article par article » rapprochent facturé, entré, consommé et restant.'
      }
    ],
    consequences: [
      "Le passage au stock est irréversible, même pour un administrateur. Une agence qui bascule un chantier par erreur n'a qu'un recours : ne plus s'en servir.",
      "À partir du jour de la bascule, les factures de matériaux de ce chantier (selon leur date) n'entrent plus dans son coût : la marchandise entre en stock et la sortie de magasin fait entrer son coût. Les factures antérieures restent imputées.",
      "Un lieu de stockage est créé pour le chantier s'il n'en avait pas. Aucune écriture comptable n'est passée par la bascule elle-même."
    ],
    faq: [
      {
        q: 'Puis-je choisir la date de bascule ?',
        a: "Non. Elle prend effet à l'instant de la confirmation : une date choisie permettrait de reclasser des factures déjà imputées."
      },
      {
        q: 'Pourquoi les chiffres sont-ils à zéro avant la bascule ?',
        a: "Sans passage au stock, il n'y a pas de période à confronter : le facturé et l'écart ne sont pas calculés."
      },
      {
        q: 'Puis-je défaire la bascule ?',
        a: 'Non, aucune fonction ne revient en arrière.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter demande « Voir les comptes de tiers » ; faire passer un chantier au stock demande « Paramétrer le module financier ».'
    },
    related: [
      {
        label: 'Passer le chantier au stock',
        helpId: 'finance.stock-chantier.bascule'
      },
      {
        label: 'Acheté, consommé, restant',
        helpId: 'finance.stock-chantier.indicateurs'
      },
      {
        label: 'Article par article',
        helpId: 'finance.stock-chantier.articles'
      }
    ],
    keywords: ['stock', 'stock chantier', 'bascule', 'inventaire', 'magasin', 'matériaux', 'consommé']
  },
  {
    id: 'finance.stock-chantier.bascule',
    kind: 'section',
    title: 'Passer le chantier au stock',
    summary:
      "Ce bandeau dit si le chantier est passé au stock et, sinon, permet de l'y faire passer. Le geste est irréversible.",
    steps: [
      {
        title: 'Lire le bandeau',
        detail: "Avertissement orange : le chantier n'est pas au stock. Bandeau vert : il y est passé, avec la date."
      },
      {
        title: 'Basculer',
        detail: '« Faire passer ce chantier au stock » ouvre une confirmation qui rappelle les conséquences.'
      },
      {
        title: 'Confirmer',
        detail: '« Confirmer le passage au stock » : la bascule prend effet immédiatement.'
      },
      {
        title: "Faire l'inventaire d'ouverture",
        detail:
          "Si l'écran le propose, « Faire l'inventaire d'ouverture » : les quantités trouvées entrent en stock sans valeur, car leurs factures ont déjà été imputées au chantier."
      }
    ],
    consequences: [
      'Irréversible : aucune route ne revient en arrière, pas même pour un administrateur.',
      "Avant la bascule, les factures de matériaux entrent directement dans le coût du chantier à leur validation. Après, la marchandise facturée entre en stock et c'est la sortie de magasin qui l'impute au chantier.",
      "Le critère est la date de la facture : une facture datée avant le jour de la bascule s'impute comme avant, même saisie après.",
      "Un lieu de stockage est créé pour le chantier s'il n'en avait pas, et ses réceptions y atterrissent."
    ],
    faq: [
      {
        q: 'Pourquoi faire passer un chantier au stock ?',
        a: 'Pour suivre la marchandise : ce qui est reçu, sorti, et ce qui reste, plutôt que de tout compter en dépense à la facture.'
      },
      {
        q: 'Que faire si la bascule est une erreur ?',
        a: 'Elle ne peut pas être défaite. Le seul recours est de ne plus se servir du chantier.'
      },
      {
        q: "Pourquoi est-il proposé de faire un inventaire d'ouverture ?",
        a: 'Pour constater ce qui se trouve déjà sur place au moment de la bascule.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Faire passer un chantier au stock demande le droit « Paramétrer le module financier ».'
    },
    related: [
      {
        label: 'Stock du chantier',
        helpId: 'finance.stock-chantier.page'
      }
    ],
    keywords: ['bascule', 'passer au stock', 'irréversible', "inventaire d'ouverture"]
  },
  {
    id: 'finance.stock-chantier.indicateurs',
    kind: 'section',
    title: 'Acheté, consommé, restant',
    summary:
      'Six cartes rapprochent ce que les fournisseurs ont facturé au chantier, ce qui est entré en stock, ce qui a été consommé et ce qui reste.',
    howToRead: {
      notes: [
        "Facturé au chantier : factures validées rattachées au chantier depuis son passage au stock. Zéro si le chantier n'est pas passé au stock.",
        "Entré depuis une facture : valeur de la marchandise entrée au lieu du chantier à la réception d'une facture fournisseur. C'est la seule entrée confrontée au facturé.",
        "Venu d'un autre lieu : livraisons reçues d'un magasin ou d'un autre chantier de l'agence. Elles ne comptent pas dans l'écart.",
        "Consommé : sorties imputées à ce chantier, depuis n'importe quel lieu. C'est la part de son coût qui vient du stock.",
        "Restant sur le chantier : ce qui se trouve au lieu du chantier à cet instant. Un tiret signifie que la valeur n'est pas disponible.",
        "Écart entre le facturé et le reçu : facturé moins entré depuis une facture. Il peut venir de frais de transport ou de manutention portés par la facture, comme d'une quantité facturée jamais arrivée : l'application montre le chiffre sans dire laquelle des deux situations est la bonne. Il vaut 0 tant que le chantier n'est pas passé au stock, ce qui ne signifie pas que les chiffres concordent."
      ]
    },
    faq: [
      {
        q: "Pourquoi l'écart n'est-il pas égal à zéro ?",
        a: "Il compare le facturé à ce qui est réellement entré en stock depuis une facture. C'est à vous d'établir la cause : frais portés par la facture, ou marchandise non livrée."
      },
      {
        q: "Les transferts entre lieux sont-ils comptés dans l'écart ?",
        a: "Non : cette marchandise a été payée ailleurs, ou ne l'a jamais été."
      },
      {
        q: 'Les valeurs sont-elles en FCFA ?',
        a: "Oui, les montants sont en FCFA ; les quantités sont dans l'unité de chaque article."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Article par article',
        helpId: 'finance.stock-chantier.articles'
      }
    ],
    keywords: ['facturé', 'consommé', 'restant', 'écart', 'rapprochement', 'stock']
  },
  {
    id: 'finance.stock-chantier.articles',
    kind: 'table',
    title: 'Article par article',
    summary:
      'Chaque ligne est un article du stock concerné par le chantier, avec ses quantités entrées, consommées et restantes. Sous chaque quantité, la valeur est rappelée en FCFA.',
    howToRead: {
      columns: [
        {
          key: 'reference',
          label: 'Référence',
          description: "La référence de l'article."
        },
        {
          key: 'designation',
          label: 'Désignation',
          description: "Le nom de l'article."
        },
        {
          key: 'recu',
          label: 'Entré depuis une facture',
          description: "Quantité entrée au lieu du chantier à la réception d'une facture fournisseur."
        },
        {
          key: 'transfere',
          label: "Venu d'un autre lieu",
          description: 'Quantité livrée depuis un magasin ou un autre chantier.'
        },
        {
          key: 'consomme',
          label: 'Consommé',
          description: "Quantité sortie et imputée à ce chantier, depuis n'importe quel lieu."
        },
        {
          key: 'retourne',
          label: 'Retourné au fournisseur',
          description: 'Quantité renvoyée au fournisseur.'
        },
        {
          key: 'rebut',
          label: 'Mis au rebut',
          description: 'Quantité mise au rebut.'
        },
        {
          key: 'restant',
          label: 'Restant',
          description: 'Quantité qui se trouve au lieu du chantier à cet instant.'
        }
      ],
      notes: [
        "Ces colonnes ne se soustraient pas entre elles : le consommé compte les sorties vers ce chantier depuis n'importe quel lieu, tandis que l'entré, le venu d'ailleurs et le restant portent sur le seul lieu du chantier.",
        "Filtres : champ libre (référence, désignation) et « Restant non nul ». L'export reprend toutes les lignes filtrées, avec quantité et valeur de chaque colonne."
      ]
    },
    faq: [
      {
        q: 'Pourquoi entré moins consommé ne donne-t-il pas le restant ?',
        a: "Parce que le consommé inclut des sorties faites depuis d'autres lieux que celui du chantier."
      },
      {
        q: 'Pourquoi le tableau est-il vide ?',
        a: 'Aucun mouvement de stock ne concerne encore ce chantier.'
      },
      {
        q: 'Dans quelle unité sont les quantités ?',
        a: "Dans l'unité de chaque article, indiquée à côté de la quantité."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Acheté, consommé, restant',
        helpId: 'finance.stock-chantier.indicateurs'
      }
    ],
    keywords: ['article', 'quantité', 'consommé', 'restant', 'rebut', 'retour fournisseur']
  },
  {
    id: 'finance.cloture-chantier.page',
    kind: 'page',
    title: 'Lots et clôture du chantier',
    summary:
      'Découpez le chantier en lots, répartissez son coût entre eux pour obtenir leur coût de revient, puis clôturez le chantier pour figer ce coût. Chaque lot peut ensuite basculer au patrimoine.',
    purpose:
      "Sur un chantier ouvert, le coût de revient d'un lot est une estimation : une facture validée demain le fera bouger. Après la clôture, il est définitif. Ne fixez aucun prix de vente sur une estimation.",
    steps: [
      {
        title: 'Lire le bandeau',
        detail: 'Il dit si les coûts de revient sont une estimation (chantier ouvert) ou définitifs (chantier clôturé).'
      },
      {
        title: 'Ajouter les lots',
        detail: '« Ajouter un lot » : nom, surface, quote-part selon la clé choisie.'
      },
      {
        title: 'Poser la clé',
        detail: 'Choisissez la clé de répartition puis « Appliquer la clé ».'
      },
      {
        title: 'Lever les blocages',
        detail:
          "S'il en reste, la liste dit quoi faire (valider ou annuler un brouillon, faire l'inventaire de clôture, transférer le reste du stock)."
      },
      {
        title: 'Clôturer',
        detail: '« Clôturer le chantier », puis « Confirmer la clôture ».'
      },
      {
        title: 'Basculer au patrimoine',
        detail: 'Sur chaque lot, « Basculer au patrimoine » crée le bien correspondant.'
      }
    ],
    consequences: [
      "La clôture fige le coût du chantier à sa valeur du moment et il n'accepte plus aucune dépense. Elle ne passe aucune écriture comptable.",
      "Elle se défait avec « Rouvrir le chantier », tant qu'aucun lot n'a basculé au patrimoine.",
      "La bascule d'un lot est irréversible : elle crée un bien réel, avec le coût de revient figé du lot pour valeur d'acquisition, et ne se fait qu'une fois par lot."
    ],
    faq: [
      {
        q: 'Pourquoi « Clôturer le chantier » est-il grisé ?',
        a: 'Des raisons empêchent la clôture : la liste sous « Clôture du chantier » les détaille et propose le lien utile.'
      },
      {
        q: 'Puis-je rouvrir un chantier clôturé ?',
        a: "Oui, tant qu'aucun lot n'a basculé au patrimoine."
      },
      {
        q: 'Que veut dire « Non réparti » ?',
        a: "La part du coût qu'aucun lot ne porte encore, faute de lot ou de clé applicable."
      },
      {
        q: 'Puis-je encore ajouter un lot après la clôture ?',
        a: 'Non : rouvrez le chantier si le découpage doit changer.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter demande « Voir les comptes de tiers » ; ajouter, corriger, supprimer un lot et poser la clé demandent « Paramétrer le module financier » ; clôturer, rouvrir et basculer un lot au patrimoine demandent « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Clôturer le chantier',
        helpId: 'finance.cloture-chantier.cloture'
      },
      {
        label: 'Lots du chantier',
        helpId: 'finance.cloture-chantier.lots'
      },
      {
        label: 'Clé de répartition',
        helpId: 'finance.cloture-chantier.cle'
      }
    ],
    keywords: ['clôture', 'clôturer', 'lot', 'coût de revient', 'patrimoine', 'bascule', 'figer le coût', 'rouvrir'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'cloture-bandeau',
          title: 'Estimation ou définitif',
          description:
            'Ce bandeau est le plus important : orange, les coûts de revient sont une estimation ; vert, ils sont définitifs.'
        },
        {
          target: 'cloture-lots',
          title: 'Les lots',
          description:
            "Chaque ligne est un lot avec sa part et son coût de revient. Selon l'état du chantier, vous pouvez le corriger, le supprimer ou le basculer au patrimoine."
        },
        {
          target: 'cloture-cle',
          title: 'La clé de répartition',
          description:
            "Elle décide de la part de chaque lot. L'application refuse une clé que les lots ne supportent pas."
        },
        {
          target: 'cloture-zone',
          title: 'La clôture',
          description:
            "Lisez ici ce qui bloque, puis clôturez : le coût est figé. Vous pouvez rouvrir tant qu'aucun lot n'a basculé."
        }
      ]
    }
  },
  {
    id: 'finance.cloture-chantier.indicateurs',
    kind: 'section',
    title: 'Coût réparti, non réparti et clé',
    summary:
      'Trois cartes disent quel coût est réparti entre les lots, quelle part reste sans lot, et quelle clé est posée.',
    howToRead: {
      notes: [
        "Coût réparti sur les lots : le coût du chantier à répartir. Sur un chantier ouvert, c'est le coût réel à l'instant de la lecture ; sur un chantier clôturé, c'est le coût figé à la clôture.",
        "Non réparti : le coût total moins la somme des coûts de revient des lots. Il est supérieur à zéro quand le chantier n'a aucun lot, ou quand aucune clé ne s'applique encore à ces lots.",
        "Clé de répartition : « Au prorata des surfaces », « Parts égales » ou « Quotes-parts saisies ». Tant qu'aucune clé n'est posée, la part de chaque lot vaut zéro et aucun coût de revient n'est réparti.",
        'Rien ne se saisit dans ces cartes.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi « Non réparti » est-il égal au coût total ?',
        a: "Aucune clé n'est posée, ou aucun lot n'existe : le coût n'est encore porté par aucun lot."
      },
      {
        q: 'Le coût réparti change-t-il après la clôture ?',
        a: 'Non : il est figé à la valeur de la clôture.'
      },
      {
        q: 'Les montants sont-ils en FCFA ?',
        a: 'Oui.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Clé de répartition',
        helpId: 'finance.cloture-chantier.cle'
      }
    ],
    keywords: ['coût réparti', 'non réparti', 'clé de répartition']
  },
  {
    id: 'finance.cloture-chantier.lots',
    kind: 'table',
    title: 'Lots du chantier',
    summary:
      "Chaque ligne est un lot produit par le chantier, avec sa part du coût et son coût de revient. Selon l'état du chantier, on peut le corriger, le supprimer ou le basculer au patrimoine.",
    howToRead: {
      columns: [
        {
          key: 'lot',
          label: 'Lot',
          description: 'Le nom du lot, par exemple « Villa A3 ».'
        },
        {
          key: 'surface',
          label: 'Surface',
          description: "La surface du lot en m². Un tiret (—) signifie qu'elle n'est pas renseignée."
        },
        {
          key: 'quotePart',
          label: 'Quote-part saisie',
          description:
            "La quote-part saisie à la main, en pourcentage. Elle ne sert qu'avec la clé « Quotes-parts saisies »."
        },
        {
          key: 'part',
          label: 'Part',
          description: "La part du coût que porte le lot, déduite de la clé posée (calculée par l'application)."
        },
        {
          key: 'cout',
          label: 'Coût de revient',
          description:
            "La part du coût du chantier portée par le lot, en FCFA. C'est une estimation tant que le chantier est ouvert, un montant définitif après la clôture."
        },
        {
          key: 'patrimoine',
          label: 'Au patrimoine',
          description: "Le bien créé pour ce lot après la bascule. Un tiret (—) signifie que le lot n'a pas basculé."
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            "« Corriger » et « Supprimer » (chantier ouvert), « Basculer au patrimoine » (chantier clôturé), ou une mention quand l'action est impossible."
        }
      ],
      notes: [
        "Le coût de revient est la part du coût total. Le reliquat d'arrondi va au premier lot créé, pour que la somme des coûts de revient soit exactement le coût du chantier.",
        "Dès qu'un lot a basculé, tous les autres sont figés : « Figé : un lot de ce chantier a basculé ». On ne peut alors ni corriger, ni supprimer un lot, ni changer la clé.",
        'Filtres : champ libre (nom du lot) et « Au patrimoine ».'
      ]
    },
    steps: [
      {
        title: 'Corriger un lot',
        detail:
          '« Corriger » : modifiez le nom, la surface ou la quote-part. Un champ laissé vide efface la valeur enregistrée ; le coût de revient de tous les lots est recalculé.'
      },
      {
        title: 'Supprimer un lot',
        detail: '« Supprimer », puis « Confirmer la suppression » : le coût de revient des autres lots est recalculé.'
      },
      {
        title: 'Basculer au patrimoine',
        detail: 'Sur un chantier clôturé, « Basculer au patrimoine » ouvre le formulaire de création du bien.'
      }
    ],
    faq: [
      {
        q: 'Pourquoi « Corriger » et « Supprimer » ont-ils disparu ?',
        a: 'Le chantier est clôturé, ou un lot a déjà basculé au patrimoine.'
      },
      {
        q: 'Pourquoi la part est-elle à 0 % ?',
        a: "Aucune clé n'est posée, ou la clé posée ne s'applique pas à ces lots."
      },
      {
        q: 'Le total des parts affichées fait-il toujours 100 % ?',
        a: "Non : trois lots en parts égales affichent 33,33 % chacun. C'est le coût qui tombe juste au franc près."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter demande « Voir les comptes de tiers » ; ajouter, corriger, supprimer un lot et poser la clé demandent « Paramétrer le module financier » ; clôturer, rouvrir et basculer un lot au patrimoine demandent « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Clé de répartition',
        helpId: 'finance.cloture-chantier.cle'
      },
      {
        label: 'Ajouter un lot',
        helpId: 'finance.cloture-chantier.ajout-lot'
      }
    ],
    keywords: ['lot', 'coût de revient', 'surface', 'quote-part', 'patrimoine', 'corriger un lot', 'supprimer un lot']
  },
  {
    id: 'finance.cloture-chantier.cle',
    kind: 'section',
    title: 'Clé de répartition',
    summary:
      "La clé décide de la part de chaque lot, et donc de son coût de revient. L'application refuse une clé que les lots ne supportent pas.",
    howToRead: {
      notes: [
        'Au prorata des surfaces : chaque lot doit avoir une surface supérieure à zéro ; sa part est sa surface divisée par la surface totale.',
        'Parts égales : aucune donnée à saisir ; chaque lot porte la même part.',
        "Quotes-parts saisies : les quotes-parts des lots doivent totaliser exactement 100 %. Pendant la saisie, l'écran affiche la somme et ce qu'il manque ou ce qui dépasse.",
        "Quand la clé est « Quotes-parts saisies », la somme affichée ne bloque rien : on peut saisir un lot isolé pour reconfigurer. Le total de cent n'est exigé qu'au moment de poser la clé."
      ]
    },
    steps: [
      {
        title: 'Choisir',
        detail: 'Ouvrez la liste « Clé de répartition » et choisissez une clé : son exigence est rappelée dessous.'
      },
      {
        title: 'Appliquer',
        detail:
          "« Appliquer la clé » : si les lots ne la supportent pas, un message explique pourquoi et la clé n'est pas posée."
      }
    ],
    consequences: [
      'Changer la clé recalcule la part et le coût de revient de tous les lots.',
      "La clé n'est plus modifiable quand le chantier est clôturé ou quand un lot a basculé au patrimoine : la liste est alors grisée."
    ],
    faq: [
      {
        q: 'Pourquoi « Appliquer la clé » est-il refusé ?',
        a: "Un lot n'a pas de surface (clé « Au prorata des surfaces »), ou les quotes-parts ne totalisent pas 100 % (clé « Quotes-parts saisies »)."
      },
      {
        q: 'Que se passe-t-il sans clé ?',
        a: 'La part de chaque lot vaut zéro : tout le coût reste « Non réparti ».'
      },
      {
        q: 'Puis-je changer de clé après la clôture ?',
        a: 'Non : la répartition est figée à la clôture.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Poser la clé demande le droit « Paramétrer le module financier ».'
    },
    related: [
      {
        label: 'Lots du chantier',
        helpId: 'finance.cloture-chantier.lots'
      }
    ],
    keywords: ['clé de répartition', 'prorata', 'surface', 'parts égales', 'quote-part']
  },
  {
    id: 'finance.cloture-chantier.ajout-lot',
    kind: 'section',
    title: 'Ajouter un lot',
    summary:
      'Ce formulaire ajoute un lot au chantier. Seul le nom est obligatoire ; la surface et la quote-part dépendent de la clé choisie.',
    steps: [
      {
        title: 'Nom du lot',
        detail: 'Obligatoire, par exemple « Villa A3 ». Deux lots du chantier ne peuvent pas porter le même nom.'
      },
      {
        title: 'Surface (m²)',
        detail: 'Exigée par la clé « Au prorata des surfaces ».'
      },
      {
        title: 'Quote-part (%)',
        detail:
          'Exigée par la clé « Quotes-parts saisies » ; entre 0 et 100, et le total des lots ne peut pas dépasser 100 %.'
      },
      {
        title: 'Ajouter',
        detail: '« Ajouter le lot » : les champs laissés vides ne sont pas envoyés.'
      }
    ],
    consequences: [
      "Si une clé est déjà posée, le nouveau lot doit fournir ce qu'elle exige : sinon l'ajout est refusé.",
      "L'ajout recalcule la part et le coût de revient de tous les lots.",
      "Ce formulaire disparaît quand le chantier est clôturé ou qu'un lot a basculé au patrimoine."
    ],
    faq: [
      {
        q: 'Pourquoi mon ajout est-il refusé ?',
        a: "Le nom est déjà pris, ou la clé posée exige une surface ou une quote-part que vous n'avez pas renseignée."
      },
      {
        q: 'Puis-je ajouter un lot après la clôture ?',
        a: "Non : découper après coup ce qu'on a déclaré fini rouvrirait la question du coût de revient. Rouvrez le chantier."
      },
      {
        q: 'La surface est-elle obligatoire ?',
        a: 'Seulement avec la clé « Au prorata des surfaces ».'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Ajouter un lot demande le droit « Paramétrer le module financier ».'
    },
    related: [
      {
        label: 'Lots du chantier',
        helpId: 'finance.cloture-chantier.lots'
      }
    ],
    keywords: ['ajouter un lot', 'nouveau lot', 'surface', 'quote-part']
  },
  {
    id: 'finance.cloture-chantier.cloture',
    kind: 'section',
    title: 'Clôture du chantier',
    summary:
      "La clôture fige le coût du chantier. Elle est bloquée tant qu'il reste des pièces en brouillon ou du stock sur le chantier ; elle se défait par « Rouvrir le chantier » tant qu'aucun lot n'a basculé.",
    howToRead: {
      notes: [
        "Ce qui bloque la clôture : des factures fournisseurs en brouillon, des pièces de caisse non validées, des notes de salaire en brouillon, des situations d'avancement en brouillon. Côté stock : un inventaire en cours sur le lieu du chantier, du stock encore présent, ou aucun inventaire de clôture validé depuis la dernière entrée de marchandise.",
        'Un budget ou un bon de commande en brouillon ne bloque pas la clôture.',
        "L'écran liste les blocages avec le message de l'application et, pour le stock, un lien : « Ouvrir l'inventaire », « Faire l'inventaire de clôture », « Transférer le reste vers un magasin ». Ce sont les vérifications que l'application appliquera à la clôture.",
        "Parcours du stock : d'abord l'inventaire de clôture du lieu, puis le transfert du reste vers un magasin."
      ]
    },
    steps: [
      {
        title: 'Lever les blocages',
        detail: 'Validez ou annulez les brouillons, puis suivez les liens de stock.'
      },
      {
        title: 'Clôturer',
        detail: "« Clôturer le chantier », lisez l'avertissement, puis « Confirmer la clôture »."
      },
      {
        title: 'Rouvrir si besoin',
        detail:
          '« Rouvrir le chantier » puis « Confirmer la réouverture » : le coût figé est effacé et redevient calculé.'
      }
    ],
    consequences: [
      "Après la clôture, le coût est figé à sa valeur du moment et le chantier n'accepte plus aucune imputation : facture, pièce de caisse, note de salaire, situation d'avancement. Les coûts de revient des lots deviennent définitifs.",
      'La clôture ne passe aucune écriture comptable et ne prévient personne.',
      "Elle n'est pas irréversible : « Rouvrir le chantier » est possible tant qu'aucun lot n'a basculé au patrimoine. Selon votre abonnement, la réouverture peut être refusée si la limite de chantiers non clôturés est atteinte.",
      "Dès qu'un lot a basculé, « Rouvrir le chantier » est grisé : un bien existe, avec une valeur d'acquisition tirée du coût figé."
    ],
    faq: [
      {
        q: 'Une facture en brouillon bloque la clôture : que faire ?',
        a: "Validez-la ou annulez-la : l'annulation d'un brouillon le sort de la clôture sans écriture."
      },
      {
        q: 'Le coût peut-il encore bouger après la clôture ?',
        a: 'Non, tant que le chantier reste clôturé.'
      },
      {
        q: 'Pourquoi je ne peux pas rouvrir le chantier ?',
        a: 'Un lot a déjà basculé au patrimoine.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Clôturer et rouvrir demandent le droit « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Lots et clôture du chantier',
        helpId: 'finance.cloture-chantier.page'
      },
      {
        label: 'Basculer un lot au patrimoine',
        helpId: 'finance.cloture-chantier.bascule'
      }
    ],
    keywords: ['clôturer', 'clôture', 'bloqueur', 'rouvrir', 'figer', 'inventaire de clôture']
  },
  {
    id: 'finance.cloture-chantier.bascule',
    kind: 'section',
    title: 'Basculer un lot au patrimoine',
    summary:
      "Ce formulaire crée au patrimoine le bien correspondant à un lot d'un chantier clôturé. Il est irréversible et ne se fait qu'une fois par lot.",
    steps: [
      {
        title: 'Référence interne du bien',
        detail: 'Obligatoire. Elle doit être unique dans votre agence.'
      },
      {
        title: 'Titre du bien',
        detail: 'Obligatoire, par exemple « Villa A3 — Riviera ».'
      },
      {
        title: 'Type de bien et Mode de détention',
        detail: "Obligatoires. Rien n'est présélectionné : choisissez dans la liste."
      },
      {
        title: 'Adresse du bien',
        detail: 'Obligatoire. Un chantier a une zone, pas une adresse postale.'
      },
      {
        title: "Description et Date d'acquisition",
        detail: "La description est facultative ; la date d'acquisition est préremplie avec la date du jour."
      },
      {
        title: 'Créer',
        detail: '« Créer le bien au patrimoine », puis « Confirmer la création du bien ».'
      }
    ],
    consequences: [
      "Irréversible. Le bien est créé au patrimoine avec, pour valeur d'acquisition, le coût de revient figé du lot. Cette valeur n'est pas saisissable.",
      'Plus aucun lot du chantier ne peut ensuite être corrigé ni supprimé, la clé ne peut plus changer et le chantier ne peut plus être rouvert.',
      "Aucune écriture comptable n'est passée par la bascule."
    ],
    faq: [
      {
        q: "Pourquoi rien n'est-il prérempli depuis le chantier ?",
        a: "Une villa n'est pas un terrain nu, et le chantier n'a pas d'adresse postale : ce sont les informations du bien qui sera créé."
      },
      {
        q: 'Pourquoi le bouton est-il grisé ?',
        a: "Il manque la référence, le titre, l'adresse, le type de bien, le mode de détention ou la date."
      },
      {
        q: "Puis-je basculer un lot d'un chantier ouvert ?",
        a: "Non : le chantier doit d'abord être clôturé pour que le coût de revient soit définitif."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Basculer un lot au patrimoine demande le droit « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Lots du chantier',
        helpId: 'finance.cloture-chantier.lots'
      }
    ],
    keywords: ['basculer au patrimoine', 'créer un bien', "valeur d'acquisition", 'lot']
  },
  {
    id: 'finance.tableau-de-bord-chantiers.page',
    kind: 'page',
    title: 'Tableau de bord des chantiers',
    summary:
      "Une ligne par chantier compare son budget, ce qui est engagé et ce qui est réalisé, et signale les dépassements et les alertes. C'est l'écran de pilotage des chantiers.",
    purpose:
      "Chaque chiffre est calculé par l'application en une seule fois pour tous les chantiers de l'agence. L'écart se mesure contre le budget révisé : budget révisé moins engagé. Un chantier sans budget validé n'a ni écart, ni alerte.",
    steps: [
      {
        title: 'Repérer les dépassements',
        detail:
          "Cochez « Chantiers en dépassement uniquement » pour ne voir que les chantiers dont l'engagé dépasse le budget révisé."
      },
      {
        title: 'Filtrer',
        detail: 'Utilisez la recherche (chantier, zone), le filtre Statut et le filtre Écart (en FCFA).'
      },
      {
        title: 'Ouvrir le budget',
        detail: '« Voir le budget » ouvre le budget du chantier, avec ses lignes et ses avenants.'
      },
      {
        title: 'Traiter une alerte',
        detail: "« Acquitter l'alerte » la retire de la ligne une fois que vous en avez pris connaissance."
      }
    ],
    consequences: [
      "Acquitter une alerte est immédiat : l'écran ne demande pas de confirmation. Une alerte informe, elle n'interdit rien.",
      "Une alerte ne naît que si un seuil est réglé pour le chantier et qu'un budget est validé. Cet écran ne permet pas de régler le seuil.",
      "Un chantier peut être « Dans le budget » tout en ayant une alerte : le seuil d'alerte est souvent inférieur à 100 %."
    ],
    faq: [
      {
        q: 'Pourquoi un chantier est-il « Sans budget » ?',
        a: "Il n'a pas de budget validé. Un budget en brouillon n'est pas lu ici."
      },
      {
        q: 'Pourquoi je ne vois aucune alerte ?',
        a: "Aucun seuil d'alerte n'est réglé, ou aucun seuil n'a été franchi depuis la dernière évaluation."
      },
      {
        q: "L'écart est-il calculé contre le budget initial ?",
        a: 'Non, contre le budget révisé : initial plus avenants validés.'
      },
      {
        q: 'Le tableau montre-t-il les chantiers clôturés ?',
        a: 'Oui, tous les statuts, sauf si vous filtrez.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter demande « Voir les rapports financiers » ; acquitter une alerte demande « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Comment lire le tableau de bord',
        helpId: 'finance.tableau-de-bord-chantiers.tableau'
      },
      {
        label: 'Budget du chantier',
        helpId: 'finance.budget-chantier.page'
      }
    ],
    keywords: ['tableau de bord', 'pilotage', 'dépassement', 'écart', 'alerte', 'budget révisé', 'engagé', 'réalisé']
  },
  {
    id: 'finance.tableau-de-bord-chantiers.tableau',
    kind: 'table',
    title: 'Comment lire le tableau de bord',
    summary:
      'Chaque ligne est un chantier, du plus récent au plus ancien. Voici la définition exacte de chaque colonne.',
    howToRead: {
      columns: [
        {
          key: 'chantier',
          label: 'Chantier',
          description: 'Le nom du chantier.'
        },
        {
          key: 'zone',
          label: 'Zone',
          description: "La zone du chantier ; un tiret (—) si elle n'est pas renseignée."
        },
        {
          key: 'statut',
          label: 'Statut',
          description: "L'état du chantier (voir ci-dessous)."
        },
        {
          key: 'avancement',
          label: 'Avancement',
          description: "Le pourcentage du dernier relevé d'avancement enregistré (0 % s'il n'y en a pas)."
        },
        {
          key: 'budget-initial',
          label: 'Budget initial',
          description: "Le total des lignes du budget validé du chantier. Vide si le chantier n'a pas de budget validé."
        },
        {
          key: 'budget-revise',
          label: 'Budget révisé',
          description: 'Budget initial plus la somme des écarts des avenants validés. Vide sans budget validé.'
        },
        {
          key: 'engage',
          label: 'Engagé',
          description:
            "Réalisé plus le reste à facturer des bons de commande émis. Un bon en brouillon ou annulé n'engage rien."
        },
        {
          key: 'realise',
          label: 'Réalisé',
          description: "La somme des dépenses imputées au chantier, validées et non annulées : c'est le coût réel."
        },
        {
          key: 'ecart',
          label: 'Écart',
          description:
            "Budget révisé moins engagé, en FCFA, avec une étiquette : « Dans le budget » si l'écart est positif ou nul, « Dépassement » s'il est négatif, « Sans budget » sans budget validé."
        },
        {
          key: 'alerte',
          label: 'Alerte',
          description:
            "Présente quand une alerte de seuil est ouverte. L'infobulle donne le seuil franchi et la part du budget consommée au moment où l'alerte est née."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: "« Voir le budget », et « Acquitter l'alerte » quand une alerte est ouverte."
        }
      ],
      statuses: [
        {
          value: 'PLANNED',
          label: 'Planifié',
          description: 'Chantier créé, statut de départ.'
        },
        {
          value: 'IN_PROGRESS',
          label: 'En cours',
          description: 'Chantier actif.'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspendu',
          description: 'Chantier mis en pause.'
        },
        {
          value: 'CLOSED',
          label: 'Clôturé',
          description: 'Chantier clôturé : son coût est figé.'
        }
      ],
      notes: [
        'Un écart positif est une marge : budget révisé moins engagé. Un écart négatif est un dépassement.',
        "L'alerte compare l'engagé au budget révisé : elle se déclenche quand cette part atteint le seuil réglé pour le chantier (au seuil pile, elle se lève). Elle est évaluée à la validation d'une facture fournisseur ou d'une pièce de caisse, et à l'émission d'un bon de commande. Il n'y a qu'une alerte ouverte à la fois par chantier.",
        "Acquitter l'alerte la retire de la ligne ; si le seuil reste franchi, une nouvelle alerte peut apparaître à la prochaine évaluation.",
        "Filtres : Statut et « Chantiers en dépassement uniquement » sont traités par l'application ; la recherche (chantier, zone) et Écart (minimum et maximum en FCFA) filtrent les lignes reçues. L'export reprend toutes les lignes filtrées."
      ]
    },
    steps: [
      {
        title: 'Aller au budget',
        detail: 'Cliquez sur « Voir le budget » à droite de la ligne.'
      }
    ],
    faq: [
      {
        q: "Pourquoi l'écart est-il « Dans le budget » alors que j'ai une alerte ?",
        a: "L'alerte se déclenche à un seuil, souvent inférieur à 100 % du budget ; le dépassement n'existe qu'au-delà de 100 %."
      },
      {
        q: 'Pourquoi les budgets sont-ils vides ?',
        a: "Le chantier n'a pas de budget validé : posez puis validez un budget."
      },
      {
        q: "Pourquoi l'engagé est-il plus grand que le réalisé ?",
        a: 'Il ajoute le reste à facturer des bons de commande émis.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter demande « Voir les rapports financiers » ; acquitter une alerte demande « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Engagé et réalisé',
        helpId: 'finance.budget-chantier.engage-realise'
      },
      {
        label: 'Budget initial et budget révisé',
        helpId: 'finance.budget-chantier.budget-revise'
      }
    ],
    keywords: ['écart', 'dépassement', 'engagé', 'réalisé', 'budget révisé', 'alerte', 'avancement']
  },
  {
    id: 'finance.baux-terrain.page',
    kind: 'page',
    title: 'Baux de terrain',
    summary:
      "Retrouvez ici les baux des terrains que votre agence loue pour ses chantiers, avec le loyer annuel, la mensualité et ce qu'il reste à consommer de l'avance versée. C'est le point de départ pour enregistrer un bail.",
    purpose:
      "On paie en général le bailleur une fois par an, d'avance. Pour que le coût d'un chantier reste lisible, le loyer est ensuite constaté un douzième par mois et imputé aux chantiers rattachés au bail. Le détail se suit sur la fiche de chaque bail.",
    steps: [
      {
        title: 'Enregistrer un bail',
        detail: 'Cliquez sur « Nouveau bail », remplissez le formulaire, puis « Enregistrer le bail ».'
      },
      {
        title: 'Rechercher',
        detail: 'Tapez un bailleur, un terrain, un poste ou un chantier dans le champ de recherche.'
      },
      {
        title: 'Filtrer',
        detail: 'Filtrez par Statut (Actif ou Terminé) et par Poste de dépense.'
      },
      {
        title: 'Ouvrir un bail',
        detail: '« Voir le bail » ouvre sa fiche : chantiers rattachés, paiements, constatations.'
      },
      {
        title: 'Exporter',
        detail: 'Bouton « Exporter » : tous les baux correspondant à vos filtres.'
      }
    ],
    consequences: [
      'Enregistrer un bail ne passe aucune écriture comptable et ne prévient personne : il ouvre seulement un compte au nom du bailleur, à zéro.',
      "Le loyer ne coûte rien à un chantier tant que le bail n'est pas rattaché à ce chantier, depuis la fiche du bail.",
      "Les écritures naissent plus tard : à la validation d'un paiement annuel, puis à chaque constatation mensuelle."
    ],
    faq: [
      {
        q: 'Que veut dire « Reste à consommer » ?',
        a: "La part de l'avance versée au bailleur qui n'est pas encore passée en charge : paiements validés moins mois constatés."
      },
      {
        q: 'Pourquoi le poste de dépense est-il obligatoire ?',
        a: "C'est le poste qui reçoit le loyer dans le coût des chantiers rattachés."
      },
      {
        q: 'Que se passe-t-il sans date de fin ?',
        a: 'Le bail est en tacite reconduction.'
      },
      {
        q: 'Je ne vois pas « Nouveau bail ». Pourquoi ?',
        a: 'Cette action demande le droit « Gérer les chantiers ».'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter demande « Voir les comptes de tiers » ; créer un bail et rattacher un chantier demandent « Gérer les chantiers » ; saisir un paiement demande « Créer des pièces financières » ; valider un paiement et constater un mois demandent « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Comment lire le tableau des baux',
        helpId: 'finance.baux-terrain.tableau'
      },
      {
        label: "Fiche d'un bail de terrain",
        helpId: 'finance.bail-terrain.page'
      }
    ],
    keywords: ['bail de terrain', 'terrain loué', 'bailleur', 'loyer', 'loyer annuel', 'mensualité', 'chantier']
  },
  {
    id: 'finance.baux-terrain.tableau',
    kind: 'table',
    title: 'Tableau des baux de terrain',
    summary:
      "Chaque ligne est un bail de terrain : le bailleur, le terrain, le loyer et ce qu'il reste à consommer de l'avance versée.",
    howToRead: {
      columns: [
        {
          key: 'bailleur',
          label: 'Bailleur',
          description: 'La personne ou la société à qui vous louez le terrain.'
        },
        {
          key: 'terrain',
          label: 'Terrain',
          description: 'Le terrain loué, tel que saisi à la création.'
        },
        {
          key: 'poste',
          label: 'Poste',
          description: 'Le poste de dépense qui reçoit le loyer dans le coût des chantiers rattachés.'
        },
        {
          key: 'annuel',
          label: 'Loyer annuel',
          description: 'Le loyer sur douze mois, en FCFA.'
        },
        {
          key: 'mensuel',
          label: 'Mensualité',
          description:
            "Le douzième du loyer annuel, arrondi, en FCFA. Le douzième mois du cycle absorbe le reliquat d'arrondi, pour que douze mois fassent exactement un an."
        },
        {
          key: 'reste',
          label: 'Reste à consommer',
          description:
            "L'avance versée au bailleur qui n'est pas encore passée en charge : paiements validés moins mois constatés. Un montant négatif signifie que les mois constatés dépassent les paiements validés."
        },
        {
          key: 'chantiers',
          label: 'Chantiers rattachés',
          description: 'Les chantiers qui reçoivent une part du loyer, ou « Aucun chantier rattaché ».'
        },
        {
          key: 'statut',
          label: 'Statut',
          description: "Actif ou Inactif (le filtre l'appelle « Terminé »)."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Voir le bail » ouvre la fiche du bail.'
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: 'Bail suivi : son loyer est constaté chaque mois par le travail programmé.'
        },
        {
          value: 'INACTIVE',
          label: 'Inactif',
          description:
            "Bail terminé : il n'est plus constaté chaque mois. Cet écran ne permet pas de passer un bail en inactif."
        }
      ],
      notes: [
        "Filtres : recherche libre (bailleur, terrain, poste, chantier), Statut (Actif ou Terminé) et Poste de dépense. L'export reprend toute la liste filtrée."
      ]
    },
    steps: [
      {
        title: 'Ouvrir un bail',
        detail: 'Cliquez sur « Voir le bail » à droite de la ligne.'
      }
    ],
    faq: [
      {
        q: 'Pourquoi « Reste à consommer » est-il à zéro ?',
        a: "Aucun paiement n'est validé, ou tous les mois payés ont été constatés."
      },
      {
        q: "Pourquoi aucun chantier n'est-il rattaché ?",
        a: "Le rattachement se fait depuis la fiche du bail : tant qu'il manque, le loyer constaté n'est imputé à aucun chantier."
      },
      {
        q: 'Un bail se supprime-t-il ?',
        a: 'Cet écran ne propose pas de suppression.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Payé, consommé, reste à consommer',
        helpId: 'finance.bail-terrain.indicateurs'
      }
    ],
    keywords: ['bail', 'loyer annuel', 'mensualité', 'reste à consommer', 'avance', 'bailleur']
  },
  {
    id: 'finance.baux-terrain.nouveau',
    kind: 'section',
    title: 'Nouveau bail de terrain',
    summary:
      'Ce formulaire enregistre un bail. Le bailleur, le terrain, le loyer annuel, le poste de dépense et la date de début sont obligatoires.',
    steps: [
      {
        title: 'Bailleur',
        detail: 'Le nom de la personne ou de la société, par exemple « Mamadou Kouadio ».'
      },
      {
        title: 'Terrain loué',
        detail: 'Décrivez le terrain, par exemple « Terrain de la Riviera, 800 m² ».'
      },
      {
        title: 'Loyer annuel (FCFA)',
        detail: 'Le loyer sur douze mois ; il doit être supérieur à zéro.'
      },
      {
        title: 'Poste de dépense',
        detail: 'Choisissez le poste (parmi les postes actifs) qui recevra le loyer dans le coût des chantiers.'
      },
      {
        title: 'Début et Fin',
        detail:
          'La date de début est obligatoire. La fin est facultative : sans elle, le bail est en tacite reconduction. La fin doit être postérieure au début.'
      },
      {
        title: 'Enregistrer',
        detail: '« Enregistrer le bail » : vous arrivez sur la fiche du bail.'
      }
    ],
    consequences: [
      "Le bail est créé « Actif » et un compte de tiers au nom du bailleur est ouvert, à zéro. Aucune écriture comptable n'est passée, personne n'est prévenu.",
      'Le début du bail fixe le cycle des douze mois : le premier mois constaté est celui du début.',
      "Aucun chantier n'est rattaché : faites-le depuis la fiche du bail."
    ],
    faq: [
      {
        q: 'Puis-je modifier le loyer après coup ?',
        a: "Cet écran ne propose pas de modification : vérifiez avant d'enregistrer."
      },
      {
        q: 'Pourquoi « Enregistrer le bail » affiche-t-il une erreur ?',
        a: "Un champ obligatoire manque, la fin n'est pas postérieure au début, ou le poste choisi est désactivé."
      },
      {
        q: "Dois-je payer avant d'enregistrer le bail ?",
        a: 'Non : le paiement annuel se saisit ensuite, sur la fiche du bail.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Créer un bail demande le droit « Gérer les chantiers ».'
    },
    related: [
      {
        label: 'Baux de terrain',
        helpId: 'finance.baux-terrain.page'
      }
    ],
    keywords: ['nouveau bail', 'créer un bail de terrain', 'bailleur', 'loyer annuel', 'tacite reconduction']
  },
  {
    id: 'finance.bail-terrain.page',
    kind: 'page',
    title: "Fiche d'un bail de terrain",
    summary:
      "La fiche montre le loyer d'un bail, ce qui a été payé au bailleur, ce qui a déjà été consommé mois par mois, et les chantiers qui supportent ce loyer.",
    purpose:
      "On paie le bailleur une fois par an, d'avance, mais la charge se répartit sur douze mois. Chaque mois, un douzième du loyer est « constaté » et imputé aux chantiers rattachés : c'est ce qui l'ajoute à leur coût réel.",
    steps: [
      {
        title: 'Rattacher les chantiers',
        detail: 'Onglet « Chantiers rattachés » : choisissez un chantier puis « Rattacher ».'
      },
      {
        title: 'Saisir le paiement annuel',
        detail: 'Onglet « Paiements annuels » : « Nouveau paiement annuel », puis « Enregistrer le paiement ».'
      },
      {
        title: 'Valider le paiement',
        detail: 'Cliquez sur « Valider » sur la ligne du paiement et confirmez.'
      },
      {
        title: 'Suivre les mois',
        detail: 'Onglet « Constatations mensuelles » : un mois par ligne, avec les chantiers imputés.'
      }
    ],
    consequences: [
      "Valider un paiement est irréversible : il ne peut plus être modifié et passe une écriture comptable (la somme sort de la caisse et devient une charge constatée d'avance).",
      "Chaque constatation mensuelle passe une écriture (la charge de location naît, l'avance diminue) et s'impose dans le coût réel des chantiers rattachés.",
      "Rien n'est envoyé au bailleur : l'application n'envoie ni message ni quittance."
    ],
    faq: [
      {
        q: 'Pourquoi les chiffres du haut ne sont-ils pas identiques au paiement saisi ?',
        a: "Seuls les paiements validés comptent dans « Payé à ce jour » ; un brouillon n'y est pas."
      },
      {
        q: 'Quand les mois sont-ils constatés ?',
        a: 'Automatiquement au début de chaque mois (le 2, pour le mois écoulé) ; vous pouvez en rattraper un à la main.'
      },
      {
        q: "Que devient le loyer d'un mois sans chantier rattaché ?",
        a: 'Il est constaté mais sans imputation : « charge constatée sans imputation ».'
      },
      {
        q: 'Puis-je détacher un chantier ?',
        a: 'Oui : il ne recevra plus de loyer à partir de la prochaine constatation ; les mois passés ne changent pas.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter demande « Voir les comptes de tiers » ; créer un bail et rattacher un chantier demandent « Gérer les chantiers » ; saisir un paiement demande « Créer des pièces financières » ; valider un paiement et constater un mois demandent « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Payé, consommé, reste à consommer',
        helpId: 'finance.bail-terrain.indicateurs'
      },
      {
        label: 'Paiements annuels',
        helpId: 'finance.bail-terrain.paiements'
      },
      {
        label: 'Constatations mensuelles',
        helpId: 'finance.bail-terrain.constatations'
      }
    ],
    keywords: [
      'bail de terrain',
      'loyer',
      'paiement annuel',
      'constatation',
      'échéancier',
      'avance',
      'bailleur',
      'chantiers rattachés'
    ]
  },
  {
    id: 'finance.bail-terrain.indicateurs',
    kind: 'section',
    title: 'Payé, consommé, reste à consommer',
    summary:
      "Ces cartes rendent lisible le mécanisme de l'avance : ce qui a été payé, ce qui est déjà passé en charge, et ce qu'il en reste.",
    howToRead: {
      notes: [
        "Payé à ce jour : somme des paiements annuels validés de ce bail. Un paiement en brouillon n'est pas compté.",
        'Consommé à ce jour : somme de toutes les constatations mensuelles du bail.',
        "Reste à consommer : l'avance versée qui n'est pas encore passée en charge, donnée par le compte du bailleur. Elle vaut en principe payé moins consommé. Si ce montant est négatif, les mois constatés dépassent les paiements validés.",
        "Loyer annuel : le loyer sur douze mois. Mensualité : son douzième arrondi ; le douzième mois du cycle absorbe le reliquat d'arrondi, de sorte que douze constatations font exactement le loyer annuel.",
        "En dessous, l'écran rappelle la date de début du bail (et sa fin, ou « tacite reconduction ») et le poste de dépense qui reçoit le loyer."
      ]
    },
    faq: [
      {
        q: "Pourquoi « Reste à consommer » n'est-il pas égal à payé moins consommé ?",
        a: "Il vient du compte du bailleur ; un paiement ou une constatation récente peut n'être pas encore rechargé : actualisez l'écran."
      },
      {
        q: 'À quoi sert le poste de dépense ?',
        a: "C'est le poste auquel le loyer est imputé dans le coût des chantiers rattachés."
      },
      {
        q: 'Les montants sont-ils en FCFA ?',
        a: 'Oui.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Paiements annuels',
        helpId: 'finance.bail-terrain.paiements'
      },
      {
        label: 'Constatations mensuelles',
        helpId: 'finance.bail-terrain.constatations'
      }
    ],
    keywords: ['payé à ce jour', 'consommé', 'reste à consommer', 'avance', 'mensualité']
  },
  {
    id: 'finance.bail-terrain.chantiers',
    kind: 'table',
    title: 'Chantiers rattachés',
    summary:
      'Ce tableau liste les chantiers qui supportent le loyer de ce terrain. En dessous, le bloc « Rattacher un chantier existant » en ajoute un.',
    howToRead: {
      columns: [
        {
          key: 'chantier',
          label: 'Chantier',
          description: 'Le nom du chantier rattaché au bail.'
        },
        {
          key: 'statut',
          label: 'Statut',
          description: "L'état du chantier."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Détacher » retire le chantier du bail, après confirmation.'
        }
      ],
      statuses: [
        {
          value: 'PLANNED',
          label: 'Planifié',
          description: 'Chantier créé : il reçoit sa part du loyer.'
        },
        {
          value: 'IN_PROGRESS',
          label: 'En cours',
          description: 'Chantier actif : il reçoit sa part du loyer.'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspendu',
          description: 'Chantier en pause : il reçoit encore sa part du loyer.'
        },
        {
          value: 'CLOSED',
          label: 'Clôturé',
          description:
            'Chantier clôturé : il ne reçoit plus de part du loyer, qui se répartit sur les autres chantiers.'
        }
      ]
    },
    steps: [
      {
        title: 'Rattacher',
        detail: 'Dans « Rattacher un chantier existant », choisissez un chantier puis « Rattacher ».'
      },
      {
        title: 'Détacher',
        detail: '« Détacher » sur la ligne, puis « Confirmer le détachement ».'
      }
    ],
    consequences: [
      "Le loyer constaté chaque mois est réparti à parts égales entre les chantiers rattachés qui ne sont pas clôturés ; le reliquat d'arrondi va au chantier le plus ancien.",
      "Rattacher ou détacher n'agit que sur les prochaines constatations : les mois déjà constatés ne changent pas.",
      "Un chantier n'est rattaché qu'à un bail à la fois : le rattacher à celui-ci le retire de son bail précédent.",
      "Sans chantier rattaché, le loyer est constaté mais n'est imputé à aucun chantier."
    ],
    faq: [
      {
        q: "Pourquoi un chantier n'est-il pas proposé dans la liste ?",
        a: "Il est déjà rattaché à ce bail, ou la liste des chantiers de l'agence ne l'a pas encore chargé."
      },
      {
        q: 'Le détachement efface-t-il les imputations passées ?',
        a: 'Non : les mois déjà constatés gardent leurs imputations.'
      },
      {
        q: 'Qui peut rattacher ?',
        a: 'Un utilisateur ayant le droit « Gérer les chantiers ».'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Rattacher et détacher un chantier demandent le droit « Gérer les chantiers ».'
    },
    related: [
      {
        label: 'Constatations mensuelles',
        helpId: 'finance.bail-terrain.constatations'
      }
    ],
    keywords: ['rattacher un chantier', 'détacher', 'chantiers rattachés', 'répartition du loyer']
  },
  {
    id: 'finance.bail-terrain.paiements',
    kind: 'table',
    title: 'Paiements annuels',
    summary:
      "Chaque ligne est un paiement fait au bailleur, avec la période qu'il couvre. Un paiement en brouillon doit être validé pour compter.",
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date de paiement',
          description: 'La date à laquelle vous avez payé le bailleur.'
        },
        {
          key: 'periode',
          label: 'Période couverte',
          description: 'Du premier au dernier jour couverts par ce paiement.'
        },
        {
          key: 'montant',
          label: 'Montant',
          description: 'Le montant payé, en FCFA.'
        },
        {
          key: 'saisi',
          label: 'Saisi par',
          description: 'La personne qui a saisi le paiement.'
        },
        {
          key: 'statut',
          label: 'Statut',
          description: 'Brouillon ou Validé.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Valider » apparaît sur un paiement en brouillon.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description:
            'Paiement saisi, pas encore validé : il ne compte pas dans « Payé à ce jour » et ne passe aucune écriture.'
        },
        {
          value: 'VALIDATED',
          label: 'Validé',
          description: 'Paiement définitif : il compte dans « Payé à ce jour » et son écriture est passée.'
        }
      ],
      notes: [
        "La période couverte est un repère : le loyer est constaté mois par mois d'après le loyer annuel du bail, pas d'après cette période.",
        'Filtres : recherche (saisi par, période), Statut, Date de paiement et Montant.'
      ]
    },
    steps: [
      {
        title: 'Valider un paiement',
        detail: "« Valider » sur la ligne, lisez l'avertissement, puis « Confirmer la validation »."
      }
    ],
    consequences: [
      "Valider est irréversible : le paiement ne peut plus être modifié. Il passe une écriture comptable : la somme sort de la caisse et est mise en charges constatées d'avance. Le compte du bailleur enregistre l'avance versée.",
      'La validation ne génère ni quittance ni message pour le bailleur.'
    ],
    faq: [
      {
        q: 'Puis-je corriger un paiement validé ?',
        a: "Non. Cet écran ne propose pas de correction d'un paiement validé."
      },
      {
        q: 'Puis-je modifier ou supprimer un brouillon ?',
        a: "Cet écran ne propose que la validation d'un brouillon."
      },
      {
        q: 'Qui peut valider ?',
        a: 'Un utilisateur ayant le droit « Valider des pièces financières » ; saisir demande « Créer des pièces financières ».'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter demande « Voir les comptes de tiers » ; créer un bail et rattacher un chantier demandent « Gérer les chantiers » ; saisir un paiement demande « Créer des pièces financières » ; valider un paiement et constater un mois demandent « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Nouveau paiement annuel',
        helpId: 'finance.bail-terrain.nouveau-paiement'
      },
      {
        label: 'Payé, consommé, reste à consommer',
        helpId: 'finance.bail-terrain.indicateurs'
      }
    ],
    keywords: ['paiement annuel', 'valider un paiement', 'période couverte', 'avance', 'loyer payé']
  },
  {
    id: 'finance.bail-terrain.nouveau-paiement',
    kind: 'section',
    title: 'Nouveau paiement annuel',
    summary:
      "Ce formulaire enregistre en brouillon un paiement fait au bailleur. Il ne compte et ne passe d'écriture qu'une fois validé.",
    steps: [
      {
        title: 'Date de paiement',
        detail: 'Préremplie avec la date du jour : corrigez-la si besoin.'
      },
      {
        title: 'Montant',
        detail: 'Le montant payé, supérieur à zéro, en FCFA.'
      },
      {
        title: 'Période couverte',
        detail: 'Début et fin de la période couverte, obligatoires ; la fin doit être après le début.'
      },
      {
        title: 'Enregistrer',
        detail: '« Enregistrer le paiement » : il apparaît dans le tableau en brouillon, à valider.'
      }
    ],
    consequences: [
      "Le paiement est créé en brouillon : aucune écriture comptable n'est encore passée.",
      "Le formulaire se remet à zéro après l'enregistrement."
    ],
    faq: [
      {
        q: 'Pourquoi « Enregistrer le paiement » est-il grisé ?',
        a: 'Il manque un montant positif, ou le début ou la fin de la période couverte.'
      },
      {
        q: 'Où le valider ?',
        a: 'Dans le tableau des paiements, bouton « Valider » sur sa ligne.'
      },
      {
        q: 'Puis-je saisir plusieurs paiements ?',
        a: 'Oui, un par ligne ; seuls les paiements validés comptent.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Saisir un paiement demande le droit « Créer des pièces financières ».'
    },
    related: [
      {
        label: 'Paiements annuels',
        helpId: 'finance.bail-terrain.paiements'
      }
    ],
    keywords: ['nouveau paiement', 'saisir un paiement', 'loyer annuel', 'période couverte']
  },
  {
    id: 'finance.bail-terrain.constatations',
    kind: 'table',
    title: 'Constatations mensuelles',
    summary:
      'Chaque ligne est un mois de loyer constaté : un douzième du loyer annuel, passé en charge et imputé aux chantiers rattachés.',
    howToRead: {
      columns: [
        {
          key: 'periode',
          label: 'Période',
          description: 'Le mois constaté.'
        },
        {
          key: 'montant',
          label: 'Montant constaté',
          description: "Le douzième du loyer annuel, en FCFA. Le douzième mois du cycle porte le reliquat d'arrondi."
        },
        {
          key: 'imputations',
          label: 'Imputations',
          description:
            'Les chantiers qui ont reçu une part de ce mois, avec leur montant. Sans chantier : « charge constatée sans imputation ».'
        }
      ],
      notes: [
        'Le cycle de douze mois se compte à partir de la date de début du bail, pas à partir de janvier.',
        'Le travail programmé constate le mois écoulé au début de chaque mois (le 2). Rejouer un mois déjà constaté ne double rien.',
        'Filtres : recherche (période, chantier imputé) et Période.'
      ]
    },
    consequences: [
      "Chaque constatation passe une écriture comptable : la charge de location est constatée et l'avance versée diminue d'autant.",
      "Elle est imputée à parts égales aux chantiers rattachés au bail qui sont Planifiés, En cours ou Suspendus à ce moment ; le reliquat d'arrondi va au chantier le plus ancien. Cette part s'ajoute à leur coût réel, sous la nature « Loyer de terrain ».",
      'Les imputations affichées sont celles réellement produites : rattacher ou détacher un chantier plus tard ne change pas un mois passé.'
    ],
    faq: [
      {
        q: 'Pourquoi un mois est-il « sans imputation » ?',
        a: "Aucun chantier non clôturé n'était rattaché au bail ce mois-là : le loyer est constaté mais n'est porté par aucun chantier."
      },
      {
        q: 'Pourquoi le dernier mois du cycle est-il différent ?',
        a: "Il absorbe le reliquat d'arrondi pour que douze mois fassent exactement le loyer annuel."
      },
      {
        q: 'Un mois constaté peut-il être corrigé ?',
        a: "Cet écran ne propose ni correction ni suppression d'une constatation."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire', 'Comptable'],
      feature: 'CONSTRUCTION',
      note: 'Consulter cet écran demande le droit « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Constater un mois à la main',
        helpId: 'finance.bail-terrain.constater'
      },
      {
        label: 'Chantiers rattachés',
        helpId: 'finance.bail-terrain.chantiers'
      }
    ],
    keywords: ['constatation', 'mois', 'douzième', 'imputation', 'loyer de terrain', 'échéancier']
  },
  {
    id: 'finance.bail-terrain.constater',
    kind: 'section',
    title: 'Constater un mois à la main',
    summary:
      "À n'utiliser que si le travail programmé du début du mois n'a pas tourné. Rejouer un mois déjà constaté ne double rien.",
    steps: [
      {
        title: 'Année',
        detail: "L'année du mois à constater (entre 2000 et 2100)."
      },
      {
        title: 'Mois',
        detail: 'Choisissez le mois dans la liste.'
      },
      {
        title: 'Constater',
        detail: '« Constater ce mois » : le mois apparaît dans le tableau des constatations.'
      }
    ],
    consequences: [
      "La constatation est immédiate et définitive : elle passe l'écriture comptable, impute la part du loyer aux chantiers rattachés (non clôturés) et augmente leur coût réel.",
      'Un mois antérieur à la date de début du bail est refusé.',
      "Constatez un mois écoulé : cet écran ne propose pas d'annuler une constatation."
    ],
    faq: [
      {
        q: "Quand dois-je l'utiliser ?",
        a: "Si un mois manque dans le tableau des constatations alors qu'il devrait y être."
      },
      {
        q: 'Puis-je constater deux fois le même mois ?',
        a: "L'application ne crée pas de doublon : un mois déjà constaté est simplement renvoyé tel quel."
      },
      {
        q: 'Qui peut le faire ?',
        a: 'Un utilisateur ayant le droit « Valider des pièces financières ».'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Constater un mois demande le droit « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Constatations mensuelles',
        helpId: 'finance.bail-terrain.constatations'
      }
    ],
    keywords: ['constater un mois', 'rattrapage', 'constatation manuelle']
  }
];

export default entries;
