import type { HelpEntry } from '../../../types';

/** Zone « facturation » du module finance (fr). */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------------------
  // Facturation du mois
  // ---------------------------------------------------------------------------
  {
    id: 'finance.facturation.page',
    kind: 'page',
    title: 'Facturation du mois',
    summary:
      "Lancez ici la facturation d'un mois pour tous vos baux actifs en une seule fois, puis lisez le compte rendu : ce qui a été facturé, ce qui a été exclu et pourquoi.",
    purpose:
      "Chaque mois, l'agence doit créer l'échéance de loyer de chaque bail. Cet écran le fait pour tous les baux d'un coup, au lieu de bail par bail. Chaque échéance créée apparaît aussitôt dans le compte du locataire (Balance clients) et dans les échéances de la gestion locative.",
    steps: [
      {
        title: 'Choisir la période',
        detail:
          "Sélectionnez le mois et l'année. Un libellé est proposé (par exemple « Loyer d'octobre 2026 ») ; vous pouvez le modifier."
      },
      {
        title: 'Lancer la campagne',
        detail:
          "Cliquez sur « Lancer la campagne », puis confirmez. Si la période a déjà été facturée, le bouton s'appelle « Relancer la campagne »."
      },
      {
        title: 'Lire le compte rendu',
        detail:
          'Trois onglets : « Baux facturés », « Baux exclus » (avec le motif de chaque exclusion) et « Avances imputées ».'
      },
      {
        title: 'Retrouver une ancienne campagne',
        detail:
          "Dans « Historique des campagnes », cliquez sur « Voir le compte rendu » pour rouvrir le résultat d'un mois passé."
      }
    ],
    consequences: [
      'Pour chaque bail actif concerné par la période, une échéance de loyer est créée, avec le loyer et les charges du bail. Elle est « À payer », ou « En retard » si sa date limite est déjà passée.',
      'Le montant facturé est inscrit au compte du locataire : il augmente ce que le locataire doit, et se retrouve dans la Balance clients.',
      'Si le locataire a déjà versé une avance (un paiement pas encore affecté à une échéance), elle est imputée automatiquement sur la nouvelle échéance, du paiement le plus ancien au plus récent.',
      'Si le bien est rattaché à une association, la part de chaque associé est calculée au même moment sur le montant facturé (voir « Associations »).',
      "Relancer une période ne crée aucun doublon : les baux déjà facturés ressortent simplement dans « Baux exclus ». Une échéance préparée en brouillon depuis le bail est émise (facturée) au lieu d'être exclue.",
      "La campagne n'envoie ni e-mail, ni SMS, ni document aux locataires. Cet écran ne propose pas d'annuler une campagne."
    ],
    faq: [
      {
        q: 'Quels baux sont facturés ?',
        a: "Seulement les baux « Actifs ». Un bail suspendu, en brouillon, terminé ou annulé apparaît dans « Baux exclus » avec le motif « Le bail n'est pas actif »."
      },
      {
        q: 'Puis-je relancer sans risque une période déjà facturée ?',
        a: "Oui. Aucune échéance n'est créée en double : les baux déjà à jour sont listés dans les exclusions, et seuls les baux devenus éligibles depuis sont facturés."
      },
      {
        q: 'Pourquoi un bail trimestriel ou annuel est-il exclu ?',
        a: "Un bail n'est facturé que les mois de son rythme (mensuel, trimestriel, semestriel ou annuel), compté depuis son début. Les autres mois, il ressort avec le motif « Le bail ne se facture pas sur ce mois »."
      },
      {
        q: 'Quel montant et quelle date limite sont retenus ?',
        a: "Le loyer et les charges en vigueur à cette période (une révision de loyer ne s'applique pas aux mois précédents). La date limite est le jour d'échéance indiqué sur le bail, le 5 s'il n'en précise pas."
      },
      {
        q: 'Je ne vois pas cet écran. Pourquoi ?',
        a: 'Il fait partie du pack Gestion locative. Il faut aussi le droit « Voir les rapports financiers » pour consulter, et « Créer des pièces financières » pour lancer une campagne.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'RENTAL',
      note: "Consulter l'historique et les comptes rendus demande « Voir les rapports financiers » ; lancer ou relancer une campagne demande « Créer des pièces financières »."
    },
    related: [
      {
        label: 'Lancer la facturation du mois',
        helpId: 'finance.facturation.lancer'
      },
      { label: 'Lire le compte rendu', helpId: 'finance.facturation.compte-rendu' },
      { label: 'Balance clients', helpId: 'finance.balance-clients.page' },
      { label: 'Échéances de loyer', to: '/tenant/:tenantId/rental/installments' }
    ],
    keywords: [
      'facturation',
      'facturer les loyers',
      'campagne',
      'loyer du mois',
      'échéances',
      'appel de loyer',
      'quittancement',
      'baux actifs'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'facturation-periode',
          title: 'Choisir la période',
          description:
            "Indiquez le mois et l'année à facturer. Le libellé se met à jour tout seul tant que vous ne l'avez pas modifié."
        },
        {
          target: 'facturation-lancer',
          title: 'Lancer la campagne',
          description:
            "Un clic crée l'échéance de chaque bail actif. Relancer une période déjà facturée ne crée aucun doublon."
        },
        {
          target: 'facturation-historique',
          title: 'Retrouver les campagnes passées',
          description: 'Chaque mois facturé garde son compte rendu : ouvrez-le avec « Voir le compte rendu ».'
        }
      ]
    }
  },
  {
    id: 'finance.facturation.lancer',
    kind: 'section',
    title: 'Lancer la facturation du mois',
    summary:
      "Choisissez le mois, l'année et le libellé, puis lancez la campagne. Elle crée l'échéance de chaque bail actif concerné.",
    purpose: 'Une seule campagne existe par mois et par agence : relancer le même mois reprend la même campagne.',
    steps: [
      {
        title: 'Mois et année',
        detail:
          "Le mois et l'année du jour sont présélectionnés. L'année peut être celle d'avant, l'actuelle ou la suivante."
      },
      {
        title: 'Libellé',
        detail:
          "« Loyer de septembre 2026 » est proposé et suit votre choix de période, tant que vous ne l'avez pas modifié à la main."
      },
      {
        title: 'Confirmer',
        detail: 'La fenêtre de confirmation rappelle ce qui va se passer. Cliquez sur « Lancer » (ou « Relancer »).'
      }
    ],
    consequences: [
      'Sont exclus, chacun avec son motif : les baux qui ne sont pas actifs, ceux dont la période est hors de leur durée, ceux qui ne se facturent pas ce mois-là, ceux déjà facturés et ceux sans aucun montant (ni loyer ni charges).',
      "À la fin, un message indique le nombre de baux facturés et de baux exclus, et le compte rendu s'ouvre sous le formulaire.",
      "La campagne n'envoie rien aux locataires."
    ],
    faq: [
      {
        q: 'Que devient une campagne que je relance ?',
        a: "C'est la même campagne qui reprend : son libellé peut être mis à jour et son compte rendu est refait. Les échéances déjà créées ne bougent pas."
      },
      {
        q: 'Puis-je facturer un mois futur ?',
        a: "L'écran accepte l'année suivante. Les échéances sont alors créées avec une date limite à venir."
      },
      {
        q: 'Un bail avec des charges mais sans loyer est-il facturé ?',
        a: "Oui : l'exclusion « Le bail ne porte aucun montant » ne vise que les baux dont le total (loyer et charges) est nul."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'RENTAL',
      note: 'Lancer une campagne demande « Créer des pièces financières ».'
    },
    related: [
      { label: "Vue d'ensemble de la facturation", helpId: 'finance.facturation.page' },
      { label: 'Lire le compte rendu', helpId: 'finance.facturation.compte-rendu' }
    ],
    keywords: ['lancer', 'relancer', 'campagne', 'mois', 'libellé', 'période']
  },
  {
    id: 'finance.facturation.compte-rendu',
    kind: 'section',
    title: "Compte rendu d'une campagne",
    summary:
      "Le résultat d'une campagne : combien de baux ont été facturés, combien ont été exclus, combien d'avances ont été imputées, avec le détail dans trois onglets.",
    purpose:
      "Le compte rendu est une trace : les noms du locataire et du bien sont conservés tels qu'ils étaient au moment de la campagne, même si le bail est clos depuis.",
    howToRead: {
      statuses: [
        {
          value: 'RUNNING',
          label: 'En cours',
          description: "La campagne est en train de s'exécuter."
        },
        {
          value: 'DONE',
          label: 'Exécutée',
          description: 'La campagne est terminée et son compte rendu est complet.'
        },
        {
          value: 'FAILED',
          label: 'Échouée',
          description:
            "La campagne s'est arrêtée avant la fin. Relancez la même période : aucun bail déjà facturé ne le sera deux fois."
        }
      ],
      notes: [
        '« Baux facturés » : nombre de baux pour lesquels une échéance a été créée ou émise.',
        '« Baux exclus » : baux non facturés, chacun avec son motif.',
        "« Avances imputées » : nombre d'imputations d'avance sur les nouvelles échéances (un même locataire peut en avoir plusieurs)."
      ]
    },
    faq: [
      {
        q: "Comment rouvrir le compte rendu d'un autre mois ?",
        a: "Dans « Historique des campagnes », cliquez sur « Voir le compte rendu » : l'adresse de la page garde la campagne ouverte, vous pouvez la partager."
      },
      {
        q: "Un bail exclu doit-il m'inquiéter ?",
        a: 'Pas forcément : une campagne sans exclusion est rare. Lisez le motif : bail suspendu, hors durée, rythme trimestriel ou déjà facturé sont des cas normaux.'
      },
      {
        q: 'Les chiffres du haut changent-ils avec la recherche des tableaux ?',
        a: 'Non. Ils comptent toutes les lignes de la campagne ; la recherche ne filtre que le tableau affiché.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Demande « Voir les rapports financiers ».'
    },
    related: [
      { label: 'Baux facturés', helpId: 'finance.facturation.factures' },
      { label: 'Baux exclus', helpId: 'finance.facturation.exclus' },
      { label: 'Avances imputées', helpId: 'finance.facturation.avances' }
    ],
    keywords: ['compte rendu', 'résultat', 'récapitulatif', 'indicateurs']
  },
  {
    id: 'finance.facturation.factures',
    kind: 'table',
    title: 'Baux facturés',
    summary: 'Les baux pour lesquels la campagne a créé (ou émis) une échéance, avec le montant facturé.',
    howToRead: {
      columns: [
        {
          key: 'bail',
          label: 'Bail',
          description: 'Le locataire et le bien, par exemple « Fatoumata Kouassi — Villa Angré 12 ».'
        },
        {
          key: 'montant',
          label: 'Montant facturé',
          description:
            "Le loyer plus les charges de la période, en FCFA. Il ne tient pas compte des avances imputées : celles-ci se lisent dans l'onglet « Avances imputées »."
        }
      ],
      notes: ['Vous pouvez rechercher un locataire ou un bien, filtrer par montant et exporter la liste.']
    },
    faq: [
      {
        q: "Pourquoi un bail que j'attendais n'est-il pas ici ?",
        a: "Regardez l'onglet « Baux exclus » : il indique le motif."
      },
      {
        q: 'Où voir si le locataire a déjà payé ?',
        a: 'Dans la Balance clients ou dans les échéances de la gestion locative : ce tableau ne montre que ce qui a été facturé.'
      },
      {
        q: 'Peut-on exporter ce tableau ?',
        a: "Oui, avec le bouton d'export du tableau : toute la liste est exportée, pas seulement la page affichée."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les rapports financiers ».' },
    related: [{ label: "Compte rendu d'une campagne", helpId: 'finance.facturation.compte-rendu' }],
    keywords: ['baux facturés', 'échéances créées', 'montant facturé']
  },
  {
    id: 'finance.facturation.exclus',
    kind: 'table',
    title: 'Baux exclus',
    summary:
      "Les baux que la campagne n'a pas facturés, avec le motif de chaque exclusion. Aucun bail n'est écarté sans explication.",
    howToRead: {
      columns: [
        {
          key: 'bail',
          label: 'Bail',
          description: 'Le locataire et le bien concernés.'
        },
        {
          key: 'motif',
          label: 'Motif',
          description: "La raison pour laquelle le bail n'a pas été facturé ce mois-là."
        }
      ],
      statuses: [
        {
          value: 'PERIOD_BEFORE_LEASE_START',
          label: 'La période précède le début du bail',
          description: 'Le mois choisi est antérieur au mois de début du bail.'
        },
        {
          value: 'PERIOD_AFTER_LEASE_END',
          label: 'La période suit la fin du bail',
          description: 'Le mois commence après la date de fin du bail, ou ne tient que sur le dernier jour du bail.'
        },
        {
          value: 'PERIOD_OFF_BILLING_CYCLE',
          label: 'Le bail ne se facture pas sur ce mois',
          description: "Le bail est trimestriel, semestriel ou annuel et ce mois n'est pas un mois de facturation."
        },
        {
          value: 'LEASE_NOT_ACTIVE',
          label: "Le bail n'est pas actif",
          description: 'Le bail est en brouillon, suspendu, terminé ou annulé.'
        },
        {
          value: 'INSTALLMENT_ALREADY_EXISTS',
          label: 'Une échéance existe déjà pour cette période',
          description: 'Le bail a déjà été facturé pour ce mois, par une campagne précédente ou à la main.'
        },
        {
          value: 'LEASE_WITHOUT_AMOUNT',
          label: 'Le bail ne porte aucun montant',
          description: 'Ni loyer ni charges ne sont renseignés sur le bail pour cette période.'
        }
      ],
      notes: ["Le filtre « Motif » permet de ne voir qu'une catégorie d'exclusions."]
    },
    faq: [
      {
        q: "Que faire d'un bail exclu parce qu'il n'est pas actif ?",
        a: "Rien si c'est voulu. Sinon, ouvrez le bail et corrigez son statut, puis relancez la période : il sera facturé."
      },
      {
        q: "Que faire d'un bail « sans montant » ?",
        a: 'Renseignez le loyer (ou les charges) sur le bail, puis relancez la période.'
      },
      {
        q: 'Pourquoi voit-on beaucoup de baux « déjà facturés » après une relance ?',
        a: "C'est le comportement normal : la relance les reconnaît et ne les refacture pas."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les rapports financiers ».' },
    related: [{ label: 'Lancer la facturation du mois', helpId: 'finance.facturation.lancer' }],
    keywords: ['exclusion', 'motif', 'bail non facturé', 'bail suspendu', 'déjà facturé']
  },
  {
    id: 'finance.facturation.avances',
    kind: 'table',
    title: 'Avances imputées',
    summary:
      "Les paiements d'avance des locataires qui ont été utilisés pour régler tout de suite les échéances créées par la campagne.",
    purpose:
      "Un locataire peut avoir payé avant la facturation. La campagne reprend ce paiement, du plus ancien au plus récent, et l'affecte à la nouvelle échéance, sans que vous ayez rien à faire.",
    howToRead: {
      columns: [
        { key: 'client', label: 'Client', description: "Le locataire dont l'avance a été utilisée." },
        {
          key: 'montant',
          label: 'Montant imputé',
          description:
            "La part de l'avance affectée à l'échéance. Une avance plus grande que l'échéance n'est utilisée qu'en partie ; le reste reste disponible pour la suivante."
        }
      ],
      notes: [
        "Un dépôt de garantie n'est jamais traité comme une avance.",
        "Imputer une avance ne change pas le solde du locataire : l'argent était déjà au crédit de son compte. Seul le relevé montre qu'il a servi à régler cette échéance."
      ]
    },
    faq: [
      {
        q: "L'échéance est-elle alors payée ?",
        a: "Oui si l'avance couvre tout le montant, sinon elle est payée en partie et le reste est à régler."
      },
      {
        q: 'Pourquoi ce tableau est-il vide ?',
        a: "Aucun locataire concerné n'avait de paiement non affecté. C'est le cas le plus courant."
      },
      {
        q: 'Où voir le détail pour un locataire ?',
        a: 'Dans son relevé, accessible depuis la Balance clients avec « Voir le relevé ».'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les rapports financiers ».' },
    related: [{ label: 'Balance clients', helpId: 'finance.balance-clients.page' }],
    keywords: ['avance', 'trop-perçu', "paiement d'avance", 'imputation']
  },
  {
    id: 'finance.facturation.historique',
    kind: 'table',
    title: 'Historique des campagnes',
    summary:
      "La liste de toutes les campagnes de l'agence, une par mois facturé. Ouvrez-en une pour relire son compte rendu.",
    howToRead: {
      columns: [
        { key: 'periode', label: 'Période', description: "Le mois et l'année facturés." },
        { key: 'libelle', label: 'Libellé', description: 'Le nom donné à la campagne.' },
        { key: 'statut', label: 'Statut', description: 'Où en est la campagne (voir les statuts).' },
        {
          key: 'date',
          label: 'Exécutée le',
          description: "La date de fin de la campagne. Un tiret (—) signifie qu'elle n'est pas terminée."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Voir le compte rendu » affiche le résultat au-dessus du tableau.'
        }
      ],
      statuses: [
        { value: 'RUNNING', label: 'En cours', description: "La campagne s'exécute." },
        { value: 'DONE', label: 'Exécutée', description: 'La campagne est terminée.' },
        {
          value: 'FAILED',
          label: 'Échouée',
          description: "La campagne s'est arrêtée avant la fin : relancez la période."
        }
      ],
      notes: ["Filtres : statut, année et date d'exécution."]
    },
    faq: [
      {
        q: "Pourquoi n'y a-t-il qu'une ligne par mois ?",
        a: 'Une campagne est unique pour un mois donné : relancer le même mois reprend la même ligne.'
      },
      {
        q: 'Une campagne « Échouée » a-t-elle facturé quelque chose ?',
        a: 'Peut-être en partie. Relancez la période : les baux déjà facturés ne seront pas facturés deux fois.'
      },
      {
        q: 'Puis-je supprimer une campagne ?',
        a: "Non, l'écran ne le propose pas : l'historique est une trace."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les rapports financiers ».' },
    related: [{ label: "Compte rendu d'une campagne", helpId: 'finance.facturation.compte-rendu' }],
    keywords: ['historique', 'campagnes passées', 'mois facturés']
  },

  // ---------------------------------------------------------------------------
  // Balance clients
  // ---------------------------------------------------------------------------
  {
    id: 'finance.balance-clients.page',
    kind: 'page',
    title: 'Balance clients',
    summary:
      "Une ligne par locataire : ce qui lui a été facturé, ce qu'il a réglé et ce qu'il doit encore. Aucune saisie ici, tout se lit.",
    purpose:
      'La balance clients répond à la question « combien nos locataires nous doivent-ils ? ». Les chiffres viennent du compte de chaque locataire, alimenté par la facturation du mois et par ses paiements. Pour savoir depuis quand il doit, utilisez la Balance âgée.',
    steps: [
      {
        title: 'Rechercher',
        detail: "Tapez le nom d'un locataire dans le champ de recherche."
      },
      {
        title: 'Filtrer',
        detail: 'Limitez la liste à une « Période » ou à un « Bien ».'
      },
      {
        title: 'Ouvrir un relevé',
        detail: "Cliquez sur « Voir le relevé » pour lire le détail des mouvements d'un locataire."
      },
      {
        title: 'Exporter',
        detail: 'Le bouton « Exporter » produit un fichier CSV de la liste affichée.'
      }
    ],
    consequences: [
      "Cet écran ne modifie rien : il ne crée aucune facture, ne relance personne et n'envoie aucun message.",
      'Quand vous filtrez par période, « Facturé » et « Réglé » ne comptent que cette période, et le solde est celui à la fin de la période. Un message le rappelle.'
    ],
    faq: [
      {
        q: 'Que veut dire un solde positif ? Négatif ?',
        a: 'Un solde positif est un montant que le locataire doit. Un solde négatif (affiché en rouge) signifie que le locataire est en avance : il a versé plus que ce qui lui a été facturé.'
      },
      {
        q: "Pourquoi un locataire n'apparaît-il pas ?",
        a: 'La liste ne montre que les comptes ayant des mouvements sur la période et le bien choisis. Retirez les filtres pour voir tout le monde.'
      },
      {
        q: 'Les montants sont-ils recalculés quand je filtre ?',
        a: 'Le total de contrôle suit votre filtre : il additionne les soldes des locataires affichés.'
      },
      {
        q: 'Où voir depuis combien de temps un locataire doit ?',
        a: 'Dans la Balance âgée, qui classe les impayés par ancienneté.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'RENTAL',
      note: 'Demande « Voir les rapports financiers ».'
    },
    related: [
      { label: 'Comment lire le tableau', helpId: 'finance.balance-clients.tableau' },
      { label: 'Balance âgée', helpId: 'finance.balance-agee.page' },
      { label: 'Facturation du mois', helpId: 'finance.facturation.page' }
    ],
    keywords: ['balance', 'solde', 'impayés', 'créances', 'locataires', 'ce que doivent les locataires']
  },
  {
    id: 'finance.balance-clients.tableau',
    kind: 'table',
    title: 'Tableau de la balance clients',
    summary: "Chaque ligne est un locataire, avec ses biens, ce qui lui a été facturé, ce qu'il a réglé et son solde.",
    howToRead: {
      columns: [
        { key: 'locataire', label: 'Locataire', description: 'Le nom du locataire (son compte).' },
        {
          key: 'biens',
          label: 'Biens',
          description: "Les biens qu'il loue, séparés par un point. Un tiret (—) signifie qu'aucun bien n'est trouvé."
        },
        {
          key: 'facture',
          label: 'Facturé',
          description: 'Le total des échéances facturées au locataire sur la période affichée.'
        },
        {
          key: 'regle',
          label: 'Réglé',
          description:
            "Le total de ses règlements sur la période. Une avance reprise pour payer une échéance n'est comptée ni comme facturation ni comme règlement."
        },
        {
          key: 'solde',
          label: 'Solde',
          description:
            "Ce que le locataire doit à la fin de la période (à ce jour si aucune période n'est choisie). Négatif, il est affiché en rouge : le locataire est en avance."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Voir le relevé » ouvre le relevé détaillé du locataire.'
        }
      ],
      notes: [
        "Les loyers dont la date limite est dans le futur ne comptent pas dans le solde tant que leur échéance n'est pas arrivée."
      ]
    },
    faq: [
      {
        q: 'Pourquoi Facturé moins Réglé ne donne-t-il pas toujours le solde ?',
        a: "Le solde tient compte de tout l'historique du compte jusqu'à la fin de la période, alors que Facturé et Réglé ne comptent que la période filtrée."
      },
      {
        q: 'Le tableau est-il exportable ?',
        a: 'Oui : le bouton « Exporter » de la page produit un CSV, et le tableau a aussi son export.'
      },
      {
        q: 'Comment limiter la balance à une période ou à un bien ?',
        a: 'Utilisez les filtres « Période » et « Bien » au-dessus du tableau. Le total de contrôle suit alors la liste filtrée.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les rapports financiers ».' },
    related: [
      { label: 'Total de contrôle', helpId: 'finance.balance-clients.total' },
      { label: 'Balance âgée', helpId: 'finance.balance-agee.tableau' }
    ],
    keywords: ['facturé', 'réglé', 'solde locataire', 'relevé']
  },
  {
    id: 'finance.balance-clients.total',
    kind: 'section',
    title: 'Total de contrôle',
    summary:
      "La somme des soldes des locataires affichés dans la liste, pour vérifier d'un coup d'oeil le total dû à l'agence.",
    howToRead: {
      notes: [
        'Le total suit votre recherche et vos filtres : il additionne les soldes de la liste filtrée.',
        'Les soldes négatifs (locataires en avance) viennent en déduction des soldes positifs.'
      ]
    },
    faq: [
      {
        q: 'Ce total est-il le total des impayés ?',
        a: 'Pas exactement : les avances des locataires y sont déduites. Pour les impayés par ancienneté, voyez la Balance âgée.'
      },
      {
        q: 'Pourquoi ce total est-il absent ?',
        a: "Il n'apparaît que lorsque la liste contient au moins un locataire."
      },
      {
        q: 'Peut-on le rapprocher de la comptabilité ?',
        a: "La Balance âgée affiche en plus l'écart avec la comptabilité quand il existe."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les rapports financiers ».' },
    related: [{ label: 'Balance âgée', helpId: 'finance.balance-agee.page' }],
    keywords: ['total', 'contrôle', 'somme des soldes']
  },

  // ---------------------------------------------------------------------------
  // Balance âgée
  // ---------------------------------------------------------------------------
  {
    id: 'finance.balance-agee.page',
    kind: 'page',
    title: 'Balance âgée',
    summary:
      'La même liste de locataires que la Balance clients, mais les sommes dues sont classées par ancienneté du retard : à échoir, moins de 30 jours, 30 à 60, 60 à 90, plus de 90.',
    purpose:
      'Elle sert à relancer au bon moment : plus une dette est ancienne, plus elle est difficile à récupérer. Les tranches sont calculées à la date du jour, sur les échéances qui ne sont pas entièrement payées.',
    steps: [
      {
        title: 'Repérer les gros retards',
        detail: "Cliquez sur l'en-tête d'une tranche (par exemple « > 90 jours ») pour classer les locataires."
      },
      {
        title: 'Filtrer',
        detail: 'Recherchez un locataire, ou limitez la liste à une « Période » ou à un « Bien ».'
      },
      {
        title: 'Ouvrir un relevé',
        detail: '« Voir le relevé » affiche le détail du compte du locataire.'
      },
      {
        title: 'Exporter',
        detail: 'Le bouton « Exporter » produit un CSV avec toutes les tranches.'
      }
    ],
    consequences: [
      "Cet écran ne modifie rien et ne relance personne : c'est un outil de lecture.",
      "Le retard se compte en jours entre la date limite de l'échéance et aujourd'hui. Une échéance dont la date limite est aujourd'hui compte dans « < 30 jours »."
    ],
    faq: [
      {
        q: 'Quelles sont les tranches exactes ?',
        a: "« À échoir » : date limite après aujourd'hui. Sinon, c'est le retard en jours : « < 30 jours » (0 à 29), « 30 à 60 jours » (30 à 59), « 60 à 90 jours » (60 à 89) et « > 90 jours » (90 et plus)."
      },
      {
        q: "Qu'est-ce qui est classé dans une tranche ?",
        a: 'Le reste à payer de chaque échéance non soldée, pénalités comprises, après déduction de ce qui a déjà été payé dessus.'
      },
      {
        q: 'Que signifie « Écart avec la comptabilité » ?',
        a: "Sous le solde, ce message apparaît quand le solde comptable du locataire ne s'explique pas entièrement par ses échéances impayées (par exemple une régularisation). Un écart nul n'est pas affiché."
      },
      {
        q: 'Une avance non utilisée apparaît-elle dans les tranches ?',
        a: "Non. Un trop-perçu n'est dans aucune tranche : il se lit dans le relevé du locataire."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'RENTAL',
      note: 'Demande « Voir les rapports financiers ».'
    },
    related: [
      { label: 'Comment lire le tableau', helpId: 'finance.balance-agee.tableau' },
      { label: 'Balance clients', helpId: 'finance.balance-clients.page' }
    ],
    keywords: ['balance âgée', 'âge des créances', 'retards', 'impayés', 'relance', 'ancienneté', '90 jours']
  },
  {
    id: 'finance.balance-agee.tableau',
    kind: 'table',
    title: 'Tableau de la balance âgée',
    summary:
      "Pour chaque locataire, le solde et sa répartition en cinq tranches d'ancienneté. Les cinq colonnes de tranche se trient.",
    howToRead: {
      columns: [
        { key: 'locataire', label: 'Locataire', description: 'Le nom du locataire.' },
        { key: 'biens', label: 'Biens', description: "Les biens qu'il loue." },
        {
          key: 'solde',
          label: 'Solde',
          description:
            'La somme des cinq tranches, soit tout ce qui reste à payer sur ses échéances. Un éventuel écart avec la comptabilité est noté en dessous.'
        },
        {
          key: 'notYetDue',
          label: 'À échoir',
          description: "Les échéances dont la date limite n'est pas encore arrivée."
        },
        {
          key: 'days0To30',
          label: '< 30 jours',
          description: 'Échéances en retard depuis moins de 30 jours (0 à 29 jours).'
        },
        {
          key: 'days30To60',
          label: '30 à 60 jours',
          description: 'Échéances en retard depuis 30 à 59 jours.'
        },
        {
          key: 'days60To90',
          label: '60 à 90 jours',
          description: 'Échéances en retard depuis 60 à 89 jours.'
        },
        {
          key: 'daysOver90',
          label: '> 90 jours',
          description: 'Échéances en retard depuis 90 jours ou plus.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Voir le relevé » ouvre le relevé du locataire.'
        }
      ],
      notes: [
        "Les colonnes de tranche sont triables ; le tri s'applique à toute la liste, pas seulement à la page affichée.",
        "Une échéance encore en brouillon n'est comptée que si sa facturation est déjà inscrite au compte du locataire."
      ]
    },
    faq: [
      {
        q: 'Pourquoi la somme des tranches diffère-t-elle de la Balance clients ?',
        a: "La Balance clients suit le compte comptable ; la Balance âgée suit les échéances impayées. L'écart éventuel est signalé sous le solde."
      },
      {
        q: 'Un locataire à jour apparaît-il ?',
        a: "Oui, avec des tranches à zéro, tant qu'il a des mouvements dans le périmètre filtré."
      },
      {
        q: 'Peut-on exporter la balance âgée ?',
        a: "Oui, avec le bouton « Exporter » de la page. Le CSV reprend le solde, l'écart comptable et les cinq tranches."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les rapports financiers ».' },
    related: [
      { label: 'Total de contrôle', helpId: 'finance.balance-agee.total' },
      { label: 'Balance clients', helpId: 'finance.balance-clients.tableau' }
    ],
    keywords: ['tranches', '30 jours', '60 jours', '90 jours', 'à échoir', 'retard']
  },
  {
    id: 'finance.balance-agee.total',
    kind: 'section',
    title: 'Total de contrôle et écart',
    summary:
      "La somme des soldes (des tranches) des locataires affichés, avec, s'il existe, l'écart entre ce total et la comptabilité.",
    howToRead: {
      notes: [
        'Le total est la somme des tranches de toutes les lignes affichées : il se lit avec les colonnes qui le composent.',
        "« Écart avec la comptabilité » n'apparaît que s'il n'est pas nul. Il compare le solde comptable des locataires à ce que disent leurs échéances impayées.",
        "Les paiements déjà faits sur une échéance à échoir et les avances non utilisées sont pris en compte dans ce calcul : ils ne créent pas d'écart."
      ]
    },
    faq: [
      {
        q: 'Que faire si un écart apparaît ?',
        a: "Ouvrez le relevé des locataires concernés : un écart vient d'un mouvement qui n'est pas une échéance (régularisation, correction). Faites-le vérifier par votre comptable."
      },
      {
        q: "L'écart est-il une erreur ?",
        a: "Pas forcément. C'est un signal à examiner, pas une anomalie prouvée."
      },
      {
        q: 'Ce total suit-il mes filtres ?',
        a: 'Oui, il additionne les lignes de la liste affichée.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les rapports financiers ».' },
    related: [{ label: 'Tableau de la balance âgée', helpId: 'finance.balance-agee.tableau' }],
    keywords: ['écart comptable', 'total', 'rapprochement']
  },

  // ---------------------------------------------------------------------------
  // Comptes propriétaires
  // ---------------------------------------------------------------------------
  {
    id: 'finance.comptes-proprietaires.page',
    kind: 'page',
    title: 'Comptes propriétaires',
    summary:
      "Le compte courant que l'agence tient pour chaque propriétaire : ce que l'agence lui doit, son dernier mouvement et son dernier reversement.",
    purpose:
      "L'agence encaisse les loyers pour le compte des propriétaires. Ce compte se calcule tout seul à partir des loyers encaissés, des honoraires, de la TVA, des dépenses et des reversements déjà faits. Ouvrez un compte pour voir le détail et reverser l'argent dû.",
    steps: [
      {
        title: "Repérer ceux à qui l'on doit",
        detail:
          "Activez le filtre « Solde dû non nul », ou lisez la colonne « Solde dû » : un montant en gras orangé est une somme que l'agence doit au propriétaire."
      },
      {
        title: 'Rechercher',
        detail: 'Tapez un nom ou une adresse e-mail.'
      },
      {
        title: 'Ouvrir le compte',
        detail: 'Cliquez sur « Voir le compte » pour lire les mouvements et enregistrer un reversement.'
      }
    ],
    consequences: [
      "Cet écran est en lecture seule. À l'ouverture, les comptes sont mis à jour avec les loyers encaissés et les honoraires qui n'étaient pas encore inscrits.",
      "Les reversements s'enregistrent depuis la fiche du propriétaire, pas depuis cette liste."
    ],
    faq: [
      {
        q: 'Quels propriétaires sont listés ?',
        a: "Les propriétaires de l'agence : ceux enregistrés comme tels, ceux désignés sur un bail et ceux qui détiennent une quote-part d'un bien en indivision."
      },
      {
        q: 'Que veut dire un solde négatif ?',
        a: "Le propriétaire doit de l'argent à l'agence (par exemple des dépenses avancées par l'agence). Il n'est pas déduit du total dû aux autres propriétaires."
      },
      {
        q: 'Pourquoi cet écran est-il absent de mon menu ?',
        a: "Il fait partie du pack Gestion locative et demande le droit « Voir les comptes de tiers ». Les agences qui ne gèrent que leur propre patrimoine ne l'ont pas : il concerne des biens de tiers."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'RENTAL',
      note: 'Demande « Voir les comptes de tiers ». Non disponible pour une agence limitée à son propre patrimoine.'
    },
    related: [
      { label: 'Total dû aux propriétaires', helpId: 'finance.comptes-proprietaires.total' },
      { label: 'Tableau des comptes', helpId: 'finance.comptes-proprietaires.tableau' },
      { label: "Détail d'un compte propriétaire", helpId: 'finance.compte-proprietaire.page' }
    ],
    keywords: ['propriétaire', 'mandant', 'reversement', 'compte courant', 'solde dû', 'loyers à reverser']
  },
  {
    id: 'finance.comptes-proprietaires.total',
    kind: 'section',
    title: 'Total dû aux propriétaires',
    summary:
      "Le montant total que l'agence doit actuellement à ses propriétaires, c'est-à-dire la somme de leurs soldes positifs.",
    howToRead: {
      notes: [
        "Seuls les soldes positifs sont additionnés. Un solde négatif (propriétaire qui doit à l'agence) n'est pas déduit : chaque compte reste distinct.",
        'Ce total porte sur tous les propriétaires, même si la liste est filtrée.'
      ]
    },
    faq: [
      {
        q: 'Ce montant est-il disponible en caisse ?',
        a: "Pas forcément : c'est une dette de l'agence envers ses propriétaires, pas un solde de trésorerie."
      },
      {
        q: 'Pourquoi ce total diffère-t-il de la somme de la colonne ?',
        a: 'Les soldes négatifs de la colonne ne sont pas comptés dans le total.'
      },
      {
        q: 'Comment le faire baisser ?',
        a: 'En enregistrant des reversements depuis la fiche de chaque propriétaire.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les comptes de tiers ».' },
    related: [{ label: 'Tableau des comptes', helpId: 'finance.comptes-proprietaires.tableau' }],
    keywords: ['total dû', 'dette', 'à reverser']
  },
  {
    id: 'finance.comptes-proprietaires.tableau',
    kind: 'table',
    title: 'Tableau des comptes propriétaires',
    summary:
      "Chaque ligne est un propriétaire, avec ce que l'agence lui doit, la date de son dernier mouvement et son dernier reversement.",
    howToRead: {
      columns: [
        { key: 'proprietaire', label: 'Propriétaire', description: 'Le nom du propriétaire.' },
        { key: 'email', label: 'E-mail', description: "Son adresse e-mail, ou un tiret (—) si elle n'est pas connue." },
        {
          key: 'solde',
          label: 'Solde dû',
          description:
            "Ce que l'agence doit au propriétaire. En gras orangé s'il est positif ; négatif (en rouge), c'est le propriétaire qui doit à l'agence."
        },
        {
          key: 'dernier-mouvement',
          label: 'Dernier mouvement',
          description: 'La date de la dernière écriture du compte (loyer, honoraires, dépense, reversement…).'
        },
        {
          key: 'dernier-reversement',
          label: 'Dernier reversement',
          description:
            'Le numéro (REV-année-numéro), le montant et la date du dernier reversement validé. Les reversements annulés ne comptent pas.'
        },
        { key: 'actions', label: 'Actions', description: '« Voir le compte » ouvre la fiche du propriétaire.' }
      ],
      notes: ['Filtres : « Solde dû non nul » et « Dernier mouvement » (intervalle de dates).']
    },
    faq: [
      {
        q: 'Un propriétaire sans mouvement apparaît-il ?',
        a: "Oui, avec un solde à zéro et des tirets, tant qu'il est propriétaire de l'agence."
      },
      {
        q: 'Peut-on exporter la liste ?',
        a: "Oui, avec l'export du tableau."
      },
      {
        q: "Comment retrouver les propriétaires à qui l'agence doit de l'argent ?",
        a: "Activez le filtre « Solde dû non nul ». Il garde les comptes dont le solde n'est pas à zéro, qu'il soit positif ou négatif."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les comptes de tiers ».' },
    related: [{ label: "Détail d'un compte propriétaire", helpId: 'finance.compte-proprietaire.page' }],
    keywords: ['liste des propriétaires', 'dernier reversement', 'solde dû']
  },

  // ---------------------------------------------------------------------------
  // Compte d'un propriétaire : mouvements et reversements
  // ---------------------------------------------------------------------------
  {
    id: 'finance.compte-proprietaire.page',
    kind: 'page',
    title: "Compte d'un propriétaire",
    summary:
      "Le détail du compte d'un propriétaire : ce qui l'a crédité (loyers), ce qui l'a débité (honoraires, TVA, dépenses, reversements) et le solde que l'agence lui doit. C'est ici que l'on enregistre un reversement.",
    purpose:
      "Le solde dû est ce qu'il reste à reverser : loyers encaissés, moins les honoraires de gestion, la TVA sur ces honoraires, les dépenses payées pour le bien, les retenues éventuelles et les reversements déjà faits. Le compte se met à jour à chaque consultation.",
    steps: [
      {
        title: 'Lire le solde',
        detail: 'Le « Solde dû » en haut de page est le montant maximum que vous pouvez reverser.'
      },
      {
        title: 'Vérifier les mouvements',
        detail: "Dans l'onglet « Mouvements du compte », contrôlez les loyers, honoraires et dépenses."
      },
      {
        title: 'Reverser',
        detail: 'Cliquez sur « Nouveau reversement », vérifiez le montant, la date et le mode, puis « Enregistrer ».'
      },
      {
        title: 'Corriger une erreur',
        detail:
          "Dans l'onglet « Reversements », cliquez sur « Annuler » et indiquez le motif, puis saisissez un nouveau reversement."
      }
    ],
    consequences: [
      "Un reversement est validé dès qu'il est enregistré : il ne se modifie pas et ne se supprime pas. Il porte un numéro de la forme REV-2026-0001.",
      'Il diminue le solde dû et passe une écriture comptable : la sortie est enregistrée au compte de trésorerie choisi (caisse, banque ou mobile money).',
      "Aucun message n'est envoyé au propriétaire par l'enregistrement du reversement.",
      "Une annulation crée une pièce d'annulation visible dans les mouvements : le reversement d'origine reste affiché avec son numéro, mais son montant ne compte plus et le solde dû remonte d'autant."
    ],
    faq: [
      {
        q: 'Puis-je reverser plus que le solde dû ?',
        a: "Non, l'enregistrement est refusé si le montant dépasse le solde dû au propriétaire."
      },
      {
        q: 'Puis-je dater un reversement dans le futur ?',
        a: "Non. La date ne peut pas dépasser aujourd'hui."
      },
      {
        q: 'Je ne vois pas « Nouveau reversement » ou « Annuler ».',
        a: "Enregistrer demande « Créer des pièces financières » ; annuler demande « Valider des pièces financières ». Demandez-les à l'administrateur de l'agence."
      },
      {
        q: 'Où voir un document à remettre au propriétaire ?',
        a: "Cet écran n'imprime aucun document. Le numéro et la référence du reversement servent de preuve."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'RENTAL',
      note: 'Voir le compte demande « Voir les comptes de tiers » ; reverser demande « Créer des pièces financières » ; annuler demande « Valider des pièces financières ».'
    },
    related: [
      { label: 'Solde et indicateurs', helpId: 'finance.compte-proprietaire.solde' },
      { label: 'Nouveau reversement', helpId: 'finance.compte-proprietaire.nouveau-reversement' },
      { label: 'Annuler un reversement', helpId: 'finance.compte-proprietaire.annuler-reversement' },
      { label: 'Paramètres financiers (honoraires, TVA, retenue)', to: '/tenant/:tenantId/settings/finance' }
    ],
    keywords: [
      'reversement',
      'reverser au propriétaire',
      'payer le propriétaire',
      'loyers encaissés',
      'honoraires',
      'retenues',
      'REV'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'reversement-solde',
          title: 'Le solde dû',
          description:
            "C'est ce que l'agence doit au propriétaire après honoraires, TVA, dépenses et reversements déjà faits."
        },
        {
          target: 'reversement-nouveau',
          title: 'Enregistrer un reversement',
          description:
            "Le montant proposé est le solde dû. Un reversement validé ne se modifie plus : on l'annule avec un motif."
        },
        {
          target: 'reversement-onglets',
          title: 'Mouvements et reversements',
          description:
            '« Mouvements du compte » explique le solde ligne par ligne ; « Reversements » liste les reversements et permet de les annuler.'
        }
      ]
    }
  },
  {
    id: 'finance.compte-proprietaire.solde',
    kind: 'section',
    title: 'Solde dû et indicateurs',
    summary:
      "Le solde dû au propriétaire, et cinq totaux qui l'expliquent : loyers encaissés, honoraires, TVA, dépenses et reversements.",
    howToRead: {
      notes: [
        "Solde dû = loyers encaissés, moins honoraires, moins TVA sur honoraires, moins dépenses, moins reversements, moins retenue à la source éventuelle, plus dépôts de garantie conservés par l'agence le cas échéant.",
        "« Loyers encaissés » : les loyers réellement payés par les locataires pour ce propriétaire (hors pénalités si elles reviennent à l'agence, et hors frais de rejet de prélèvement refacturés).",
        "« Honoraires » : les honoraires de gestion de l'agence, calculés à chaque encaissement selon les conditions du bail, du propriétaire ou de l'agence (pourcentage ou forfait).",
        "« TVA » : la TVA sur ces honoraires, si l'agence y est assujettie.",
        '« Dépenses » : les dépenses des biens payées pour le compte du propriétaire.',
        '« Reversements » : ce qui a déjà été reversé, annulations déduites.',
        'La retenue à la source et le dépôt de garantie conservé ne sont pas dans ces cinq cartes : ils se lisent dans les mouvements du compte.',
        "Un solde négatif (en rouge) signifie que le propriétaire doit de l'argent à l'agence."
      ]
    },
    faq: [
      {
        q: 'Pourquoi les cartes ne donnent-elles pas exactement le solde ?',
        a: 'Une retenue à la source ou un dépôt de garantie conservé, absents des cinq cartes, peuvent expliquer la différence : cherchez-les dans les mouvements.'
      },
      {
        q: 'Les honoraires changent-ils si je modifie le taux ?',
        a: "Non pour les loyers déjà encaissés : les honoraires sont figés à l'encaissement avec les conditions du jour."
      },
      {
        q: "Où régler le taux d'honoraires, la TVA et la retenue ?",
        a: "Dans les Paramètres financiers de l'agence ; les honoraires peuvent aussi être fixés par propriétaire ou par bail."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les comptes de tiers ».' },
    related: [
      { label: 'Mouvements du compte', helpId: 'finance.compte-proprietaire.mouvements' },
      { label: 'Paramètres financiers', to: '/tenant/:tenantId/settings/finance' }
    ],
    keywords: ['solde', 'net propriétaire', 'honoraires de gestion', 'TVA', 'retenue à la source', 'dépôt de garantie']
  },
  {
    id: 'finance.compte-proprietaire.mouvements',
    kind: 'table',
    title: 'Mouvements du compte',
    summary:
      'Chaque ligne est une écriture du compte du propriétaire, du plus ancien au plus récent, avec le solde dû après cette écriture.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: "La date de l'écriture (jour de l'encaissement pour un loyer)." },
        { key: 'type', label: 'Type', description: "La nature de l'écriture (voir les types)." },
        { key: 'libelle', label: 'Libellé', description: 'Une description, par exemple le mois et le numéro de bail.' },
        {
          key: 'bien-bail',
          label: 'Bien ou bail',
          description: "Le bien et le numéro de bail concernés, ou un tiret (—) s'il n'y en a pas."
        },
        {
          key: 'debit',
          label: 'Débit',
          description: 'Ce qui diminue la somme due au propriétaire (honoraires, dépenses, reversement…).'
        },
        {
          key: 'credit',
          label: 'Crédit',
          description: 'Ce qui augmente la somme due au propriétaire (loyer encaissé…).'
        },
        {
          key: 'solde',
          label: 'Solde dû après',
          description: "Le solde dû après cette ligne, recalculé dans l'ordre des dates."
        }
      ],
      statuses: [
        {
          value: 'RENT_COLLECTED',
          label: 'Loyer encaissé',
          description: 'Un loyer payé par le locataire, au crédit du propriétaire.'
        },
        {
          value: 'MANAGEMENT_FEE',
          label: 'Honoraires',
          description: "Les honoraires de gestion de l'agence, au débit."
        },
        {
          value: 'MANAGEMENT_FEE_VAT',
          label: 'TVA sur honoraires',
          description: 'La TVA sur les honoraires, au débit.'
        },
        { value: 'EXPENSE', label: 'Dépense', description: 'Une dépense payée pour le bien, au débit.' },
        { value: 'PAYOUT', label: 'Reversement', description: 'Un reversement fait au propriétaire, au débit.' },
        {
          value: 'VOID',
          label: 'Annulation',
          description: "Une pièce d'annulation, par exemple celle d'un reversement annulé."
        },
        {
          value: 'WITHHOLDING_TAX',
          label: 'Retenue à la source',
          description: "Une retenue prélevée sur les loyers pour le compte du propriétaire, si l'agence l'a activée."
        },
        {
          value: 'DEPOSIT_RETAINED',
          label: 'Dépôt de garantie conservé',
          description: "Un dépôt de garantie conservé par l'agence et ajouté au compte du propriétaire."
        }
      ],
      notes: [
        'Un bien en indivision porte la quote-part de chaque propriétaire, indiquée dans le libellé.',
        'Le solde « après » reste celui du compte complet : une recherche ou un filtre ne le recalcule pas.'
      ]
    },
    faq: [
      {
        q: "Pourquoi un loyer est-il inscrit à la date de paiement et non à celle de l'échéance ?",
        a: 'Le compte du propriétaire ne reçoit que les loyers réellement encaissés.'
      },
      {
        q: 'Un loyer annulé disparaît-il ?',
        a: "Non, il ressort avec une écriture d'annulation. Rien n'est effacé."
      },
      {
        q: 'Comment filtrer ?',
        a: 'Par texte (libellé, bien, bail), par type, par date et par plage de débit ou de crédit.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les comptes de tiers ».' },
    related: [{ label: 'Solde et indicateurs', helpId: 'finance.compte-proprietaire.solde' }],
    keywords: ['mouvements', 'écritures', 'débit', 'crédit', 'relevé du propriétaire']
  },
  {
    id: 'finance.compte-proprietaire.reversements',
    kind: 'table',
    title: 'Reversements',
    summary:
      'La liste des reversements faits à ce propriétaire, du plus récent au plus ancien, avec leur statut. Vous pouvez en annuler un.',
    howToRead: {
      columns: [
        { key: 'numero', label: 'Numéro', description: 'Le numéro du reversement, par exemple REV-2026-0001.' },
        { key: 'date', label: 'Date', description: 'La date du reversement.' },
        { key: 'mode', label: 'Mode', description: 'Espèces, virement, chèque, Mobile Money ou autre.' },
        {
          key: 'reference',
          label: 'Référence',
          description: 'La référence saisie (numéro de virement, de chèque…), ou un tiret (—).'
        },
        { key: 'montant', label: 'Montant', description: 'Le montant reversé, barré si le reversement est annulé.' },
        { key: 'statut', label: 'Statut', description: 'Validé ou Annulé ; un reversement annulé affiche son motif.' },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Annuler » apparaît sur un reversement validé, si vous en avez le droit.'
        }
      ],
      statuses: [
        { value: 'VALIDATED', label: 'Validé', description: 'Le reversement compte dans le solde du propriétaire.' },
        { value: 'VOIDED', label: 'Annulé', description: 'Le reversement est annulé : son montant ne compte plus.' }
      ]
    },
    faq: [
      {
        q: 'Puis-je modifier un reversement ?',
        a: 'Non. Annulez-le avec un motif, puis saisissez-en un nouveau.'
      },
      {
        q: 'Comment annuler ?',
        a: 'Cliquez sur « Annuler » sur la ligne, indiquez le motif (3 caractères au moins) et confirmez.'
      },
      {
        q: 'Je ne vois pas le bouton « Annuler ».',
        a: 'Il demande le droit « Valider des pièces financières ».'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Voir demande « Voir les comptes de tiers » ; annuler demande « Valider des pièces financières ».'
    },
    related: [
      { label: 'Nouveau reversement', helpId: 'finance.compte-proprietaire.nouveau-reversement' },
      { label: 'Annuler un reversement', helpId: 'finance.compte-proprietaire.annuler-reversement' }
    ],
    keywords: ['reversements', 'paiements au propriétaire', 'REV', 'annuler']
  },
  {
    id: 'finance.compte-proprietaire.nouveau-reversement',
    kind: 'section',
    title: 'Nouveau reversement',
    summary:
      "Enregistrez l'argent que vous remettez au propriétaire : montant, date, mode de paiement, compte de trésorerie et référence.",
    steps: [
      {
        title: 'Montant',
        detail: "Le solde dû est proposé s'il est positif. Vous pouvez reverser moins, jamais plus."
      },
      {
        title: 'Date',
        detail: "Aujourd'hui par défaut ; une date future est refusée."
      },
      {
        title: 'Mode',
        detail:
          'Espèces, Virement, Chèque, Mobile Money ou Autre. Changer le mode efface le compte de trésorerie choisi.'
      },
      {
        title: 'Compte de trésorerie',
        detail: "Choisissez le compte d'où sort l'argent. Laissé vide, le compte par défaut du mode est utilisé."
      },
      {
        title: 'Référence et notes',
        detail: 'Indiquez par exemple le numéro du virement ou du chèque ; les notes sont facultatives.'
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer ». Un numéro est attribué.'
      }
    ],
    consequences: [
      "Le reversement est validé tout de suite et ne se modifie pas : en cas d'erreur, on l'annule et on en saisit un nouveau.",
      'Le solde dû diminue du montant reversé, et une écriture comptable fait sortir la somme du compte de trésorerie.',
      "Le montant est refusé s'il dépasse le solde dû, s'il n'est pas supérieur à 0 ou s'il a plus de deux décimales."
    ],
    faq: [
      {
        q: 'Le solde dû est négatif : puis-je reverser ?',
        a: "Non, il n'y a rien à reverser : le montant proposé est vide et tout reversement serait refusé."
      },
      {
        q: 'Que se passe-t-il si deux personnes reversent en même temps ?',
        a: "Le compte est verrouillé pendant l'enregistrement : le second reversement voit le solde déjà diminué et peut être refusé."
      },
      {
        q: 'Le propriétaire est-il prévenu ?',
        a: "Non, l'enregistrement n'envoie aucun message."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Créer des pièces financières ».' },
    related: [{ label: 'Reversements', helpId: 'finance.compte-proprietaire.reversements' }],
    keywords: ['reverser', 'payer le propriétaire', 'virement', 'espèces', 'mobile money']
  },
  {
    id: 'finance.compte-proprietaire.annuler-reversement',
    kind: 'section',
    title: 'Annuler un reversement',
    summary:
      'Annulez un reversement validé en indiquant un motif. Le reversement reste visible, mais il ne compte plus dans le solde dû.',
    steps: [
      {
        title: "Ouvrir l'annulation",
        detail: "Dans l'onglet « Reversements », cliquez sur « Annuler » sur la ligne concernée."
      },
      {
        title: 'Indiquer le motif',
        detail: 'Saisissez une explication (par exemple « Erreur sur le montant »). Elle est obligatoire.'
      },
      {
        title: 'Confirmer',
        detail: "Cliquez sur « Confirmer l'annulation »."
      }
    ],
    consequences: [
      "Une pièce d'annulation est créée et l'écriture comptable du reversement est contre-passée.",
      'Le solde dû remonte du montant annulé : il faut ensuite saisir un nouveau reversement correct.',
      "Un reversement déjà annulé ne peut pas l'être une seconde fois."
    ],
    faq: [
      {
        q: 'Le reversement est-il effacé ?',
        a: "Non : il reste dans la liste, barré, avec son motif d'annulation."
      },
      {
        q: 'Quelle longueur pour le motif ?',
        a: 'Au moins trois caractères.'
      },
      {
        q: "L'argent est-il rendu à l'agence ?",
        a: "L'annulation corrige les comptes. Le retour effectif de l'argent remis au propriétaire se règle en dehors de cet écran."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Valider des pièces financières ».' },
    related: [{ label: 'Reversements', helpId: 'finance.compte-proprietaire.reversements' }],
    keywords: ['annulation', 'erreur de reversement', 'contre-passation']
  },

  // ---------------------------------------------------------------------------
  // Associations
  // ---------------------------------------------------------------------------
  {
    id: 'finance.associations.page',
    kind: 'page',
    title: 'Associations',
    summary:
      "Une association regroupe des associés qui se partagent les loyers d'un ou plusieurs biens, chacun selon sa quote-part en pourcentage. Ce qui n'est pas attribué reste à l'agence.",
    purpose:
      "Quand un bien appartient à plusieurs associés (par exemple une villa en indivision), il faut savoir à qui revient chaque part du loyer. À chaque facturation du mois, le loyer d'un bien rattaché est réparti entre les associés selon leurs quotes-parts.",
    steps: [
      {
        title: "Créer l'association",
        detail:
          "Cliquez sur « Nouvelle association » et donnez-lui un nom. Les associés s'ajoutent ensuite, depuis la fiche."
      },
      {
        title: 'Contrôler les parts',
        detail:
          "Les colonnes « Total des quotes-parts » et « Part de l'agence » se lisent ensemble : à 100 %, il ne reste rien à l'agence."
      },
      {
        title: 'Repérer les parts incomplètes',
        detail:
          "Activez le filtre « Quotes-parts incomplètes » pour voir les associations dont le total n'est pas 100 %."
      },
      {
        title: 'Ouvrir la fiche',
        detail:
          "« Voir la fiche » permet d'ajouter des associés, de rattacher des biens et de lire l'état d'un associé."
      }
    ],
    consequences: [
      "Créer une association n'a aucun effet financier tant qu'elle n'a ni associé ni bien rattaché.",
      "Les associés et leurs parts ne servent qu'à la répartition faite lors des facturations futures ; rien n'est recalculé sur les mois déjà facturés."
    ],
    faq: [
      {
        q: "Que signifie « Part de l'agence » ?",
        a: "C'est ce qui reste de 100 % une fois les quotes-parts des associés retirées. Elle n'est pas un associé et n'a pas de compte propre."
      },
      {
        q: 'Peut-on dépasser 100 % ?',
        a: "Non. L'ajout d'un associé est refusé si le total des quotes-parts dépasserait 100 %."
      },
      {
        q: "Pourquoi cet écran n'apparaît-il pas ?",
        a: 'Il fait partie du pack Construction. Il demande aussi le droit « Voir les comptes de tiers ».'
      },
      {
        q: 'Peut-on désactiver une association ?',
        a: "L'écran n'en propose pas la possibilité : le statut affiché est « Actif » ou « Inactif » selon l'enregistrement."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: 'Voir demande « Voir les comptes de tiers » ; créer une association demande « Paramétrer le module financier ».'
    },
    related: [
      { label: 'Tableau des associations', helpId: 'finance.associations.tableau' },
      { label: 'Nouvelle association', helpId: 'finance.associations.nouvelle' },
      { label: "Fiche d'une association", helpId: 'finance.association.page' }
    ],
    keywords: ['association', 'indivision', 'associés', 'quote-part', 'partage de loyer', "copropriétaires d'un bien"]
  },
  {
    id: 'finance.associations.tableau',
    kind: 'table',
    title: 'Tableau des associations',
    summary:
      "Chaque ligne est une association, avec ses associés, le total de leurs quotes-parts, la part restant à l'agence et les biens rattachés.",
    howToRead: {
      columns: [
        { key: 'label', label: 'Association', description: "Le nom de l'association." },
        { key: 'associes', label: 'Associés', description: 'Les noms des associés, ou « Aucun associé ».' },
        { key: 'total-parts', label: 'Total des quotes-parts', description: 'La somme des pourcentages des associés.' },
        {
          key: 'part-agence',
          label: "Part de l'agence",
          description: "100 % moins le total des quotes-parts : ce qui reste à l'agence."
        },
        {
          key: 'biens',
          label: 'Biens rattachés',
          description: 'Les biens dont le loyer est réparti, ou « Aucun bien rattaché ».'
        },
        { key: 'statut', label: 'Statut', description: 'Actif ou Inactif.' },
        { key: 'actions', label: 'Actions', description: "« Voir la fiche » ouvre l'association." }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: "L'association est en service." },
        { value: 'INACTIVE', label: 'Inactif', description: "L'association est désactivée." }
      ],
      notes: ['Filtres : statut (Active ou Inactive) et « Quotes-parts incomplètes » (total différent de 100 %).']
    },
    faq: [
      {
        q: 'Les quotes-parts incomplètes sont-elles une erreur ?',
        a: "Non, la part manquante revient à l'agence. C'est seulement un point à vérifier."
      },
      {
        q: 'Peut-on exporter la liste ?',
        a: "Oui, avec l'export du tableau."
      },
      {
        q: 'Comment retrouver une association ?',
        a: "Tapez dans la recherche le nom de l'association, celui d'un associé ou celui d'un bien rattaché."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Voir les comptes de tiers ».' },
    related: [{ label: "Fiche d'une association", helpId: 'finance.association.page' }],
    keywords: ['associations', 'quotes-parts', "part de l'agence"]
  },
  {
    id: 'finance.associations.nouvelle',
    kind: 'section',
    title: 'Nouvelle association',
    summary:
      "Donnez un nom à l'association. Elle est créée vide : vous ajoutez ensuite ses associés et ses biens depuis sa fiche.",
    steps: [
      {
        title: 'Nommer',
        detail: 'Saisissez un nom clair, par exemple « Villa Riviera — indivision Kouadio ». Il est obligatoire.'
      },
      {
        title: 'Enregistrer',
        detail: "Cliquez sur « Enregistrer l'association » : sa fiche s'ouvre."
      }
    ],
    consequences: [
      "L'association est créée active, sans associé et sans bien.",
      "Aucune répartition n'a lieu tant que la fiche n'a pas d'associé et qu'un bien n'y est pas rattaché."
    ],
    faq: [
      {
        q: "Puis-je renommer l'association ensuite ?",
        a: "L'écran ne propose pas de renommer : choisissez un nom définitif."
      },
      {
        q: 'Le bouton « Nouvelle association » est absent.',
        a: 'Créer une association demande le droit « Paramétrer le module financier ».'
      },
      {
        q: "Faut-il créer l'association avant de facturer ?",
        a: 'Oui : la répartition se fait à la facturation du mois, sur les associations existantes à ce moment-là.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Paramétrer le module financier ».' },
    related: [{ label: "Fiche d'une association", helpId: 'finance.association.page' }],
    keywords: ['créer une association', 'nouvelle indivision']
  },

  // ---------------------------------------------------------------------------
  // Fiche d'une association
  // ---------------------------------------------------------------------------
  {
    id: 'finance.association.page',
    kind: 'page',
    title: "Fiche d'une association",
    summary:
      "Gérez ici les associés et leurs quotes-parts, les biens rattachés, et consultez l'état de quote-part de chaque associé.",
    purpose:
      "À chaque facturation du mois, le montant facturé pour un bien rattaché (loyer, charges et autres frais) est réparti entre les associés : chacun reçoit ce montant multiplié par sa quote-part. Cette part s'ajoute à son compte. Le locataire, lui, doit toujours le loyer entier.",
    steps: [
      {
        title: 'Vérifier les parts',
        detail: "Les deux cartes du haut montrent le total des quotes-parts et la part de l'agence."
      },
      {
        title: 'Ajouter les associés',
        detail: "Dans « Ajouter un associé », saisissez le nom et la quote-part en %, puis « Ajouter l'associé »."
      },
      {
        title: 'Rattacher les biens',
        detail: 'Dans « Rattacher un bien existant », choisissez le bien puis cliquez sur « Rattacher ».'
      },
      {
        title: "Lire l'état d'un associé",
        detail: "Cliquez sur « Voir l'état » sur la ligne de l'associé."
      }
    ],
    consequences: [
      'La répartition se fait lors de la facturation du mois, pour les loyers facturés après le rattachement. Les mois déjà facturés ne sont pas recalculés.',
      "Retirer un associé est irréversible. Il est refusé dès qu'une répartition a déjà été constatée sur sa part.",
      'Détacher un bien arrête la répartition à partir de la prochaine facturation ; les répartitions déjà faites restent inchangées.',
      "Rattacher à cette association un bien qui appartenait à une autre le fait changer d'association : un bien n'en a qu'une."
    ],
    faq: [
      {
        q: 'La répartition se fait-elle sur le loyer encaissé ou facturé ?',
        a: "Sur le montant facturé, au moment de la facturation du mois. L'état d'un associé montre aussi ce qui a été encaissé, à titre d'information."
      },
      {
        q: 'Que se passe-t-il avec trois associés à 33,33 % ?',
        a: "Chacun reçoit 33,33 % du montant ; les 0,01 % restants reviennent à l'agence. Le reliquat d'arrondi en francs est ajouté à la part du premier associé."
      },
      {
        q: 'Comment payer un associé ?',
        a: 'Cet écran ne comporte pas de paiement : il constate ce qui revient à chacun.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'CONSTRUCTION',
      note: "Voir demande « Voir les comptes de tiers » (et « Voir les rapports financiers » pour l'état d'un associé) ; ajouter, retirer, rattacher ou détacher demande « Paramétrer le module financier »."
    },
    related: [
      { label: "Part de l'agence et total des parts", helpId: 'finance.association.parts' },
      { label: 'Associés', helpId: 'finance.association.associes' },
      { label: 'Biens rattachés', helpId: 'finance.association.biens' },
      { label: 'État de quote-part', helpId: 'finance.association.releve' }
    ],
    keywords: ['association', 'associés', 'quote-part', 'indivision', 'répartition des loyers']
  },
  {
    id: 'finance.association.parts',
    kind: 'section',
    title: "Total des quotes-parts et part de l'agence",
    summary: "Deux chiffres à lire ensemble : la somme des quotes-parts des associés et ce qu'il reste à l'agence.",
    howToRead: {
      notes: [
        '« Total des quotes-parts » : la somme des pourcentages des associés, jamais au-dessus de 100 %.',
        "« Part de l'agence » : 100 % moins ce total.",
        "À 100 %, la carte « Part de l'agence » passe en alerte : les associés se partagent la totalité du loyer, rien ne reste à l'agence."
      ]
    },
    faq: [
      {
        q: "L'agence est-elle un associé ?",
        a: "Non. Sa part est seulement ce qui n'est attribué à personne : elle n'a pas de compte et ne se saisit pas."
      },
      {
        q: 'Pourquoi 99,99 % au lieu de 100 % ?',
        a: "Trois parts de 33,33 % totalisent 99,99 % : le centième restant revient à l'agence."
      },
      {
        q: "Comment augmenter la part de l'agence ?",
        a: "Retirez un associé qui n'a pas encore de répartition, ou ajoutez les associés avec des quotes-parts plus faibles."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Voir les comptes de tiers ».' },
    related: [{ label: 'Associés', helpId: 'finance.association.associes' }],
    keywords: ["part de l'agence", '100 %', 'quote-part']
  },
  {
    id: 'finance.association.associes',
    kind: 'table',
    title: "Associés de l'association",
    summary:
      "La liste des associés avec leur quote-part. Depuis chaque ligne, lisez l'état de l'associé ou retirez-le.",
    howToRead: {
      columns: [
        { key: 'associe', label: 'Associé', description: "Le nom de l'associé." },
        { key: 'part', label: 'Quote-part', description: 'Son pourcentage du montant facturé.' },
        {
          key: 'actions',
          label: 'Actions',
          description: "« Voir l'état » ouvre son état de quote-part ; « Retirer » le supprime de l'association."
        }
      ],
      notes: ['Un compte est créé pour chaque associé en même temps que sa part.']
    },
    steps: [{ title: 'Retirer un associé', detail: 'Cliquez sur « Retirer » puis « Confirmer le retrait ».' }],
    consequences: [
      "Le retrait est irréversible et refusé si une répartition a déjà été constatée sur la part de l'associé : son historique ne peut pas disparaître."
    ],
    faq: [
      {
        q: "Puis-je modifier la quote-part d'un associé ?",
        a: "L'écran ne le permet pas : on ne peut qu'ajouter ou retirer un associé."
      },
      {
        q: 'Pourquoi le retrait est-il refusé ?',
        a: "Parce qu'une répartition existe déjà pour cet associé : l'agence lui doit déjà de l'argent et l'historique doit rester lisible."
      },
      {
        q: 'Où lire ce qui lui revient ?',
        a: "Dans « Voir l'état » : chaque mois, le bien, le facturé, l'encaissé et sa part."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Retirer demande « Paramétrer le module financier ».' },
    related: [
      { label: 'Ajouter un associé', helpId: 'finance.association.ajout-associe' },
      { label: 'État de quote-part', helpId: 'finance.association.releve' }
    ],
    keywords: ['associés', 'retirer un associé', 'quote-part']
  },
  {
    id: 'finance.association.ajout-associe',
    kind: 'section',
    title: 'Ajouter un associé',
    summary: "Saisissez le nom de l'associé et sa quote-part en pourcentage. Un compte est créé pour lui avec sa part.",
    steps: [
      { title: 'Nom', detail: "Saisissez le nom de l'associé, par exemple « Fatoumata Kouassi »." },
      { title: 'Quote-part', detail: 'Entrez son pourcentage, de 0 à 100 (deux décimales au plus).' },
      { title: 'Valider', detail: "Cliquez sur « Ajouter l'associé »." }
    ],
    consequences: [
      "L'ajout est refusé si la somme des quotes-parts dépasserait 100 % ; le message indique ce qui est déjà attribué.",
      'La quote-part doit être supérieure à 0.',
      "L'associé participera à la répartition des facturations futures des biens rattachés."
    ],
    faq: [
      {
        q: "L'associé doit-il exister dans l'application ?",
        a: "Non, seul son nom est demandé : l'associé n'est pas un utilisateur."
      },
      {
        q: 'Puis-je ajouter un associé à 100 % ?',
        a: "Oui si aucun autre associé n'a de part ; l'agence n'a alors plus rien."
      },
      {
        q: 'Le bouton reste grisé.',
        a: 'Le nom et une quote-part supérieure à 0 sont obligatoires.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Paramétrer le module financier ».' },
    related: [{ label: 'Associés', helpId: 'finance.association.associes' }],
    keywords: ['ajouter un associé', 'nouvelle quote-part']
  },
  {
    id: 'finance.association.biens',
    kind: 'table',
    title: 'Biens rattachés',
    summary: 'Les biens dont le loyer est réparti entre les associés. Rattachez un bien existant ou détachez-en un.',
    howToRead: {
      columns: [
        { key: 'bien', label: 'Bien', description: 'Le titre du bien rattaché.' },
        { key: 'actions', label: 'Actions', description: "« Détacher » retire le bien de l'association." }
      ],
      notes: [
        "Sous le tableau, « Rattacher un bien existant » propose les biens de l'agence ; ceux déjà rattachés à cette association sont exclus de la liste."
      ]
    },
    steps: [
      { title: 'Rattacher', detail: 'Choisissez un bien dans la liste puis cliquez sur « Rattacher ».' },
      { title: 'Détacher', detail: 'Cliquez sur « Détacher » puis « Confirmer le détachement ».' }
    ],
    consequences: [
      "À partir de la prochaine facturation, les loyers d'un bien rattaché sont répartis entre les associés.",
      'Détacher un bien arrête la répartition ; les répartitions déjà constatées restent inchangées.',
      "Un bien n'appartient qu'à une association : rattacher un bien déjà rattaché ailleurs le déplace sans erreur, sans rien recalculer sur le passé."
    ],
    faq: [
      {
        q: 'Les loyers déjà facturés sont-ils répartis après le rattachement ?',
        a: 'Non, seuls les loyers facturés ensuite le sont.'
      },
      {
        q: 'Un bien sans association est-il concerné ?',
        a: "Non. La grande majorité des biens n'ont pas d'association et rien n'est réparti."
      },
      {
        q: "Que se passe-t-il si l'association n'a pas d'associé ?",
        a: "Rien n'est réparti ; la facturation du locataire n'est pas bloquée."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Rattacher ou détacher demande « Paramétrer le module financier ».' },
    related: [{ label: "Vue d'ensemble de la fiche", helpId: 'finance.association.page' }],
    keywords: ['rattacher un bien', 'détacher', "biens de l'association"]
  },
  {
    id: 'finance.association.releve',
    kind: 'section',
    title: "État de quote-part d'un associé",
    summary:
      'Pour un associé, mois par mois : le bien, ce qui a été facturé, ce qui a été encaissé et la part qui lui revient. En lecture seule.',
    howToRead: {
      columns: [
        { key: 'bien', label: 'Bien', description: 'Le bien concerné.' },
        { key: 'periode', label: 'Période', description: "Le mois et l'année du loyer." },
        {
          key: 'facture',
          label: 'Facturé',
          description: 'Le montant facturé pour le bien ce mois-là (loyer, charges et autres frais).'
        },
        { key: 'encaisse', label: 'Encaissé', description: 'Ce qui a été payé sur cette échéance à ce jour.' },
        { key: 'part', label: 'Sa part', description: "La part de l'associé : sa quote-part du montant facturé." }
      ],
      notes: [
        '« Total de sa part sur la période » et « Déjà reversé » ne comptent que la période choisie (facultative).',
        "« Reste dû, toutes périodes » est le solde du compte de l'associé sur tout son historique : il ne se déduit pas des deux autres chiffres."
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: "Cliquez sur « Voir l'état » sur la ligne de l'associé." },
      { title: 'Choisir la période', detail: 'Facultatif : sélectionnez des dates de début et de fin.' }
    ],
    faq: [
      {
        q: 'La part dépend-elle de ce qui a été encaissé ?',
        a: 'Non, elle est calculée sur le facturé. La colonne « Encaissé » est donnée pour information.'
      },
      {
        q: "D'où vient « Déjà reversé » ?",
        a: "C'est la somme des règlements portés au compte de l'associé sur la période. Cet écran ne permet pas d'en saisir."
      },
      {
        q: 'Le tableau est vide.',
        a: "Aucun loyer n'a été réparti pour cet associé sur la période : vérifiez les biens rattachés et la période."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Voir les rapports financiers ».' },
    related: [{ label: 'Associés', helpId: 'finance.association.associes' }],
    keywords: ['état de quote-part', "relevé de l'associé", 'part reversée', 'reste dû']
  },

  // ---------------------------------------------------------------------------
  // Commissions des agents
  // ---------------------------------------------------------------------------
  {
    id: 'finance.commissions.page',
    kind: 'page',
    title: 'Commissions des agents',
    summary:
      "L'état mensuel des honoraires de gestion encaissés par l'agence, ventilés par gestionnaire, avec la commission qui revient à chacun.",
    purpose:
      "Les honoraires de gestion sont calculés à chaque loyer encaissé. Chaque gestionnaire reçoit une part de ces honoraires hors taxe, sur les baux dont il est le gestionnaire. Cet écran donne, pour un mois d'encaissement, le total par agent et le détail de chaque encaissement.",
    steps: [
      {
        title: 'Choisir le mois',
        detail: 'Utilisez le sélecteur « Période » : le mois courant est affiché par défaut.'
      },
      {
        title: 'Lire les totaux',
        detail:
          'Les quatre cartes donnent les honoraires HT, la TVA, les commissions dues et les honoraires sans gestionnaire.'
      },
      {
        title: "Voir le détail d'un agent",
        detail: 'Dépliez sa ligne pour lire chaque encaissement : date, bail, bien, montant, honoraires et part.'
      }
    ],
    consequences: [
      "Cet écran est en lecture seule : il ne paie pas les commissions et n'envoie rien.",
      "Les honoraires sont figés à l'encaissement : un changement de taux ou de part ne modifie pas une commission déjà calculée."
    ],
    faq: [
      {
        q: 'Qui est « Sans gestionnaire » ?',
        a: "Les honoraires des baux pour lesquels aucun gestionnaire n'est désigné. Désignez-en un sur la fiche du bail pour que ses honoraires lui soient attribués."
      },
      {
        q: 'Où régler la part de chaque agent ?',
        a: "Dans les Paramètres financiers, carte « Commission des collaborateurs » : c'est la part des honoraires HT reversée au collaborateur sur ses baux."
      },
      {
        q: 'Les commissions sont-elles marquées comme payées ?',
        a: "Non. L'écran n'a pas de statut de paiement : il indique seulement ce qui est dû."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      feature: 'RENTAL',
      note: 'Demande « Voir les rapports financiers ».'
    },
    related: [
      { label: 'Totaux du mois', helpId: 'finance.commissions.indicateurs' },
      { label: 'Tableau des commissions', helpId: 'finance.commissions.tableau' },
      { label: 'Paramètres financiers', to: '/tenant/:tenantId/settings/finance' }
    ],
    keywords: ['commission', 'honoraires de gestion', 'gestionnaire', 'agent', 'part du collaborateur', 'rémunération']
  },
  {
    id: 'finance.commissions.indicateurs',
    kind: 'section',
    title: 'Totaux du mois',
    summary:
      'Quatre totaux pour le mois choisi : honoraires hors taxe, TVA, commissions dues aux agents et honoraires sans gestionnaire.',
    howToRead: {
      notes: [
        '« Honoraires HT » : les honoraires de gestion générés par les loyers encaissés dans le mois, hors TVA.',
        "« TVA » : la TVA sur ces honoraires, si l'agence y est assujettie.",
        '« Commissions dues aux agents » : la somme des parts qui reviennent aux gestionnaires.',
        "« Honoraires sans gestionnaire » : les honoraires des baux sans gestionnaire désigné ; aucune commission n'en découle.",
        "Le mois est celui de la date d'encaissement du loyer, pas celui de l'échéance."
      ]
    },
    faq: [
      {
        q: 'Comment une commission est-elle calculée ?',
        a: "Honoraires HT de l'encaissement multipliés par la part du gestionnaire, en pourcentage, arrondie au franc."
      },
      {
        q: "Les honoraires viennent-ils d'un pourcentage ou d'un forfait ?",
        a: "Des deux possibles, selon les conditions du bail, du propriétaire ou de l'agence : le premier niveau paramétré s'applique."
      },
      {
        q: 'Pourquoi un mois est-il à zéro ?',
        a: "Aucun honoraire n'a été encaissé sur la période, ou les conditions d'honoraires ne sont pas paramétrées."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les rapports financiers ».' },
    related: [{ label: 'Tableau des commissions', helpId: 'finance.commissions.tableau' }],
    keywords: ['total commissions', 'honoraires HT', 'TVA', 'sans gestionnaire']
  },
  {
    id: 'finance.commissions.tableau',
    kind: 'table',
    title: 'Tableau des commissions par agent',
    summary:
      "Une ligne par gestionnaire pour le mois choisi, avec sa part, le nombre d'encaissements, les honoraires et sa commission due. Dépliez une ligne pour le détail.",
    howToRead: {
      columns: [
        { key: 'agent', label: 'Agent', description: 'Le nom du gestionnaire, ou « Sans gestionnaire ».' },
        {
          key: 'sharePercent',
          label: 'Part',
          description: "Le pourcentage des honoraires HT qui lui revient, ou un tiret (—) si aucune part n'est fixée."
        },
        {
          key: 'feeCount',
          label: 'Encaissements',
          description: "Le nombre d'encaissements ayant généré des honoraires."
        },
        { key: 'feesAmount', label: 'Honoraires HT', description: 'Le total des honoraires hors taxe sur ses baux.' },
        { key: 'shareAmount', label: 'Commission due', description: 'Le total de sa part sur ces honoraires.' }
      ],
      notes: [
        "Dépliée, une ligne montre chaque encaissement : date d'encaissement, bail (lien vers sa fiche), bien, montant encaissé, honoraires et part de l'agent.",
        'La part affichée dans la colonne « Part » est la part actuelle ; la commission due utilise la part du jour de chaque encaissement.',
        'Les agents sont classés par commission décroissante ; « Sans gestionnaire » est toujours en dernier.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi la commission ne correspond-elle pas à la part actuelle ?',
        a: "La part est figée à l'encaissement : si elle a changé depuis, les anciens encaissements gardent l'ancienne."
      },
      {
        q: 'Pourquoi la colonne « Part » affiche-t-elle un tiret ?',
        a: "Aucune part n'est fixée pour ce collaborateur, sa commission est alors de zéro."
      },
      {
        q: 'Peut-on exporter ?',
        a: "Oui, avec l'export du tableau ; le détail déplié n'est pas exporté à part."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les rapports financiers ».' },
    related: [{ label: 'Totaux du mois', helpId: 'finance.commissions.indicateurs' }],
    keywords: ['commission par agent', 'détail des encaissements', "part de l'agent"]
  }
];

export default entries;
