import type { HelpEntry } from '../../../types';

/** Zone « proprietaire-biens » du module « portails » (fr) : biens, baux, revenus, échéances et paiements du propriétaire. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Accueil
  {
    id: 'portails.proprietaire.accueil',
    kind: 'page',
    title: 'Accueil du portail propriétaire',
    summary:
      "Votre tableau de bord de propriétaire : l'état de vos biens, vos revenus, les prochaines échéances, les derniers paiements reçus et les derniers incidents. C'est l'écran de départ pour suivre votre patrimoine confié à l'agence.",
    purpose:
      "Le portail vous permet de suivre vos biens sans appeler l'agence. Les chiffres viennent des biens, baux et paiements que l'agence enregistre pour vous : vous ne voyez que les biens qui vous sont rattachés.",
    steps: [
      {
        title: 'Lire la situation de vos biens',
        detail:
          "Les cartes du haut comptent vos biens, ceux qui sont loués, disponibles ou en maintenance, et le taux d'occupation."
      },
      {
        title: 'Regarder vos revenus',
        detail:
          'Les cartes « Revenus ce mois », « Revenus cette année » et « Revenus mois dernier » totalisent les paiements encaissés.'
      },
      {
        title: 'Anticiper les prochains paiements',
        detail: 'La carte « Prochains paiements » liste les 5 prochaines échéances à payer.'
      },
      {
        title: 'Contrôler ce qui est arrivé',
        detail:
          'La carte « Paiements récents » liste les 5 derniers paiements reçus, et « Tickets de maintenance récents » les 5 derniers incidents.'
      },
      {
        title: 'Actualiser',
        detail: "Le bouton « Actualiser » recharge toutes les données de l'écran."
      }
    ],
    consequences: [
      'Cet écran est en lecture seule : rien de ce que vous y faites ne modifie vos biens, vos baux ni vos paiements.',
      "Les montants sont des sommes encaissées auprès des locataires. Ils ne disent pas ce que l'agence vous a déjà reversé."
    ],
    faq: [
      {
        q: 'Pourquoi un bien manque-t-il dans mon tableau de bord ?',
        a: "Seuls les biens que l'agence vous a rattachés apparaissent : biens qui vous appartiennent, biens sous mandat de gestion en cours, ou biens loués par un bail où vous êtes indiqué comme propriétaire. Si un bien manque, contactez votre agence."
      },
      {
        q: 'Les revenus incluent-ils le dépôt de garantie ?',
        a: "Non. Le dépôt de garantie est une somme gardée pour le compte du locataire : il n'est jamais compté dans vos revenus. Vous le suivez dans l'écran « Dépôts de garantie »."
      },
      {
        q: 'Un chiffre est faux. Que faire ?',
        a: 'Vous ne pouvez pas le corriger vous-même : contactez votre agence, qui gère les données de vos baux et de vos paiements.'
      }
    ],
    permissions: {
      roles: ['Propriétaire'],
      note: "Écran du portail propriétaire. Il ne montre que les biens rattachés à votre compte par l'agence."
    },
    related: [
      { label: 'Mes propriétés', helpId: 'portails.proprietaire.biens' },
      { label: 'Revenus', helpId: 'portails.proprietaire.revenus' },
      { label: 'Échéances', helpId: 'portails.proprietaire.echeances' },
      { label: 'Paiements', helpId: 'portails.proprietaire.paiements' }
    ],
    keywords: ['tableau de bord', 'accueil', 'propriétaire', 'portefeuille', 'revenus', 'occupation', 'portail'],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'proprietaire-portefeuille',
          title: "Vos biens en un coup d'oeil",
          description:
            'Cette carte compte tous les biens qui vous sont rattachés. À côté, vous voyez combien sont loués, disponibles ou en maintenance.'
        },
        {
          target: 'proprietaire-occupation',
          title: "Le taux d'occupation",
          description:
            "C'est la part de vos biens qui ont un bail en cours. Plus il est proche de 100 %, moins vous avez de biens vides."
        },
        {
          target: 'proprietaire-revenus-mois',
          title: 'Vos revenus du mois',
          description:
            "Ce montant additionne les paiements de loyer encaissés ce mois-ci sur vos biens. Le dépôt de garantie n'en fait pas partie."
        },
        {
          target: 'proprietaire-prochains-paiements',
          title: 'Les prochaines échéances',
          description:
            'Voici les 5 prochaines échéances à payer, avec le bien, le locataire et la date. Le détail complet est dans « Échéances ».'
        },
        {
          target: 'proprietaire-paiements-recents',
          title: 'Les derniers paiements reçus',
          description:
            "Chaque ligne est un paiement réussi, avec son montant, sa méthode et sa date. Retrouvez tout l'historique dans « Paiements »."
        }
      ]
    }
  },
  {
    id: 'portails.proprietaire.accueil.portefeuille',
    kind: 'section',
    title: 'Indicateurs de votre portefeuille',
    summary:
      "Cinq cartes résument l'état de vos biens : le total, ceux qui sont loués, disponibles ou en maintenance, et le taux d'occupation.",
    howToRead: {
      notes: [
        "Total propriétés : tous les biens qui vous sont rattachés par l'agence.",
        "Louées : biens qui ont un bail actif. Le bail fait foi : un bien noté « Loué » mais sans bail actif n'est pas compté comme loué.",
        'En maintenance : biens sans bail actif dont le statut est « En révision ».',
        'Disponibles : biens sans bail actif, qui ne sont ni en maintenance, ni vendus, ni archivés, ni en brouillon.',
        "Taux d'occupation : nombre de biens loués divisé par le total, en pourcentage avec une décimale (par exemple 66,7 %).",
        'Un bien vendu, archivé ou en brouillon est compté dans le total mais pas dans les trois autres cartes : la somme des trois peut donc être plus petite que le total.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi « Louées » et « Disponibles » ne font-elles pas le total ?',
        a: 'Les biens en maintenance, vendus, archivés ou en brouillon sont comptés à part ou pas du tout. Seul « Total propriétés » les inclut tous.'
      },
      {
        q: 'Mon bien est loué mais il apparaît comme disponible. Pourquoi ?',
        a: "L'écran se fie au bail : sans bail actif rattaché au bien, il n'est pas compté comme loué. Demandez à votre agence de vérifier le bail."
      },
      {
        q: 'Où voir la liste de mes biens ?',
        a: 'Ouvrez « Mes propriétés » dans le menu.'
      }
    ],
    related: [{ label: 'Mes propriétés', helpId: 'portails.proprietaire.biens' }],
    keywords: ['total', 'louées', 'disponibles', 'maintenance', 'taux', 'occupation', 'portefeuille']
  },
  {
    id: 'portails.proprietaire.accueil.revenus',
    kind: 'section',
    title: 'Indicateurs de revenus',
    summary: 'Trois cartes totalisent les loyers encaissés sur vos biens : ce mois, cette année et le mois dernier.',
    howToRead: {
      notes: [
        'Revenus ce mois : paiements réussis dont la date tombe dans le mois en cours.',
        "Revenus cette année : paiements réussis depuis le 1er janvier de l'année en cours.",
        'Revenus mois dernier : paiements réussis du mois précédent.',
        "Les paiements qui servent à constituer un dépôt de garantie ne sont pas comptés : ce n'est pas un revenu.",
        "Ce sont les montants versés par les locataires, tels qu'enregistrés. Ils ne disent pas ce que l'agence vous a reversé."
      ]
    },
    faq: [
      {
        q: 'Un paiement du mois ne figure pas dans « Revenus ce mois ». Pourquoi ?',
        a: "Seuls les paiements réussis comptent, à la date où ils ont réussi. Un paiement en attente de validation n'est pas encore compté."
      },
      {
        q: 'Où voir le détail par mois et par bien ?',
        a: 'Ouvrez « Revenus » dans le menu : un graphique par mois et un tableau par propriété y sont proposés.'
      },
      {
        q: 'Pourquoi les revenus des années passées ne sont-ils pas ici ?',
        a: "Cet écran ne montre que trois périodes récentes. L'écran « Revenus » donne le total depuis le début et les mois des cinq dernières années."
      }
    ],
    related: [{ label: 'Revenus', helpId: 'portails.proprietaire.revenus' }],
    keywords: ['revenus', 'loyers encaissés', 'mois', 'année']
  },
  {
    id: 'portails.proprietaire.accueil.prochains-paiements',
    kind: 'section',
    title: 'Prochains paiements',
    summary: 'Les 5 prochaines échéances de loyer à payer sur vos biens, de la plus proche à la plus lointaine.',
    howToRead: {
      notes: [
        "Chaque ligne affiche le montant de l'échéance, son statut « Échéance », le bien, le locataire, la période (année-mois) et la date d'échéance.",
        "Le montant est le total de l'échéance : loyer, charges, autres frais et pénalité éventuelle.",
        "Seules les échéances « à payer » dont la date n'est pas encore passée figurent ici. Une échéance en retard ou déjà en partie payée n'est pas listée : elle se trouve dans l'écran « Échéances ».",
        "« Aucune échéance à venir » s'affiche quand il n'y en a aucune."
      ]
    },
    faq: [
      {
        q: 'Où voir les échéances en retard ?',
        a: 'Dans « Échéances » : la carte « En retard » les compte et le tableau permet de filtrer sur ce statut.'
      },
      {
        q: 'Cette liste montre-t-elle plus de 5 échéances ?',
        a: 'Non, seulement les 5 plus proches. Pour la liste complète, ouvrez « Échéances ».'
      },
      {
        q: 'Le montant est-il ce que je recevrai ?',
        a: "Non, c'est ce que le locataire doit payer pour l'échéance. Il ne tient pas compte de ce que l'agence reverse."
      }
    ],
    related: [{ label: 'Échéances', helpId: 'portails.proprietaire.echeances' }],
    keywords: ['échéances à venir', 'loyer à payer', 'prochaine échéance']
  },
  {
    id: 'portails.proprietaire.accueil.paiements-recents',
    kind: 'section',
    title: 'Paiements récents',
    summary: 'Les 5 derniers paiements de loyer reçus sur vos biens, du plus récent au plus ancien.',
    howToRead: {
      notes: [
        'Chaque ligne affiche le montant, la méthode (Espèces, Virement bancaire, Chèque, Mobile Money, Prélèvement bancaire, Carte ou Autre), le bien, le locataire et la date.',
        'Seuls les paiements réussis sont listés, hors dépôt de garantie.',
        "« Aucun paiement récent » s'affiche quand il n'y en a aucun."
      ]
    },
    faq: [
      {
        q: 'Où voir tous les paiements ?',
        a: "Dans l'écran « Paiements », qui propose recherche, filtres, export et le détail de chaque paiement."
      },
      {
        q: 'Un paiement que le locataire a fait ne figure pas ici. Pourquoi ?',
        a: "Il est probablement en attente de validation par l'agence. Il apparaît ici quand il est enregistré comme réussi."
      },
      {
        q: 'Pourquoi la date inclut-elle le jour entier ?',
        a: "C'est la date à laquelle le paiement a réussi, affichée en toutes lettres."
      }
    ],
    related: [{ label: 'Paiements', helpId: 'portails.proprietaire.paiements' }],
    keywords: ['paiements reçus', 'derniers paiements', 'encaissements']
  },
  {
    id: 'portails.proprietaire.accueil.incidents',
    kind: 'section',
    title: 'Tickets de maintenance récents',
    summary: 'Les 5 derniers incidents déclarés sur vos biens, du plus récent au plus ancien.',
    howToRead: {
      notes: [
        'Chaque ligne affiche le titre du ticket, son statut, le bien concerné et la date de création.',
        "Les statuts « En cours » et « Résolu » sont traduits. D'autres statuts peuvent s'afficher tels que le système les enregistre.",
        "« Aucun ticket récent » s'affiche quand il n'y en a aucun."
      ]
    },
    faq: [
      {
        q: "Où voir le détail d'un incident ?",
        a: "Dans l'écran « Maintenance » du portail, qui liste tous les incidents de vos biens."
      },
      {
        q: 'Puis-je déclarer un incident depuis cet écran ?',
        a: 'Non, cette carte est en lecture seule.'
      },
      {
        q: "Combien d'incidents sont montrés ?",
        a: 'Les 5 plus récents, tous statuts confondus.'
      }
    ],
    related: [{ label: 'Maintenance', helpId: 'portails.proprietaire.incidents' }],
    keywords: ['maintenance', 'incident', 'ticket', 'réparation']
  },

  // ------------------------------------------------------------------ Biens
  {
    id: 'portails.proprietaire.biens',
    kind: 'page',
    title: 'Mes propriétés',
    summary:
      "La liste de vos biens sous forme de cartes, avec leur statut, leur type et, s'il y en a un, le bail actif. Cet écran sert à retrouver un bien et à ouvrir sa fiche.",
    purpose:
      "Vous y voyez tous les biens que l'agence vous a rattachés : biens qui vous appartiennent, biens sous mandat de gestion en cours, ou biens loués par un bail où vous êtes propriétaire.",
    steps: [
      {
        title: 'Lire les cartes du haut',
        detail: 'Elles comptent tous vos biens, quelle que soit la recherche en cours.'
      },
      {
        title: 'Chercher un bien',
        detail:
          "Tapez dans « Rechercher » une partie de l'adresse ou du nom du locataire. Les filtres « Statut », « Type de propriété » et « Mode de transaction » affinent la liste."
      },
      { title: 'Ouvrir la fiche', detail: 'Cliquez sur « Voir les détails » en bas de la carte du bien.' },
      {
        title: 'Revenir à la liste complète',
        detail: 'Utilisez « Effacer les critères » quand aucun bien ne correspond.'
      }
    ],
    consequences: [
      'Cet écran est en lecture seule : vous ne pouvez ni ajouter, ni modifier, ni supprimer un bien.',
      'Les cartes sont affichées par 12, avec une pagination pour voir les suivantes.'
    ],
    faq: [
      {
        q: 'Pourquoi un bien noté « Loué » apparaît-il « Disponible » ?',
        a: 'La carte se fie au bail : un bien sans bail actif est affiché « Disponible », même si son statut enregistré est « Loué ».'
      },
      {
        q: 'Comment ajouter ou corriger un bien ?',
        a: 'Vous ne pouvez pas le faire ici. Contactez votre agence, qui gère la fiche de chaque bien.'
      },
      {
        q: "Où voir le loyer et les paiements d'un bien ?",
        a: 'Ouvrez sa fiche : les onglets « Bail actif » et « Statistiques de revenus » les détaillent.'
      }
    ],
    permissions: { roles: ['Propriétaire'], note: 'Ne montre que les biens rattachés à votre compte.' },
    related: [
      { label: "Fiche d'un bien", helpId: 'portails.proprietaire.bien-detail' },
      { label: 'Mes baux', helpId: 'portails.proprietaire.baux' }
    ],
    keywords: ['biens', 'propriétés', 'immeubles', 'logements', 'patrimoine', 'cartes']
  },
  {
    id: 'portails.proprietaire.biens.indicateurs',
    kind: 'section',
    title: 'Indicateurs de vos biens',
    summary: 'Quatre cartes comptent vos biens : le total, ceux qui sont loués, disponibles ou en maintenance.',
    howToRead: {
      notes: [
        'Total : tous vos biens, même ceux que la recherche masque.',
        'Louées : biens qui ont un bail actif.',
        'Disponibles : biens sans bail actif, ni en maintenance, ni vendus, ni archivés, ni en brouillon.',
        'En maintenance : biens sans bail actif dont le statut est « En révision ».',
        'Un bien vendu, archivé ou en brouillon est compté dans le total seulement.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi le total est-il plus grand que la somme des autres cartes ?',
        a: 'Un bien vendu, archivé ou en brouillon est compté dans le total seulement.'
      },
      {
        q: 'Quand un bien est-il compté dans « Disponibles » ?',
        a: "Quand il n'a pas de bail actif et qu'il n'est ni en maintenance, ni vendu, ni archivé, ni en brouillon."
      },
      {
        q: 'Le total change-t-il quand je tape une recherche ?',
        a: 'Non : le total compte tous vos biens, même ceux que la recherche masque.'
      }
    ],
    related: [{ label: "Indicateurs de l'accueil", helpId: 'portails.proprietaire.accueil.portefeuille' }],
    keywords: ['total', 'louées', 'disponibles', 'maintenance']
  },
  {
    id: 'portails.proprietaire.biens.liste',
    kind: 'section',
    title: 'Cartes de vos biens',
    summary:
      "Une carte par bien, avec l'adresse, le statut, le type, les modes de transaction et le bail actif. La recherche et les filtres se trouvent au-dessus.",
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: "Le bien est en préparation chez l'agence." },
        {
          value: 'UNDER_REVIEW',
          label: 'En révision',
          description: "Le bien est en cours de vérification par l'agence."
        },
        { value: 'AVAILABLE', label: 'Disponible', description: 'Le bien est libre et peut être loué.' },
        { value: 'RESERVED', label: 'Réservé', description: 'Le bien est réservé.' },
        { value: 'UNDER_OFFER', label: 'Sous offre', description: 'Une offre est en cours sur le bien.' },
        { value: 'RENTED', label: 'Loué', description: 'Le bien est loué.' },
        { value: 'SOLD', label: 'Vendu', description: 'Le bien est vendu.' },
        { value: 'ARCHIVED', label: 'Archivé', description: "Le bien n'est plus actif." }
      ],
      notes: [
        'Types de bien : Appartement, Maison / Villa, Studio, Duplex / Triplex, Chambre / Colocation, Bureau, Boutique / Commercial, Entrepôt / Industriel, Terrain, Immeuble, Parking / Box, Lot programme neuf.',
        'Modes de transaction : Vente, Location, Location courte durée.',
        'Le cadre « Bail actif » donne le locataire et le loyer par mois. Sans bail actif, un bien disponible affiche « Propriété disponible ».',
        "Le filtre « Statut » s'appuie sur le statut enregistré du bien, alors que la carte affiche « Disponible » pour un bien noté « Loué » sans bail actif.",
        'Les critères de recherche sont : adresse et nom du locataire, statut, type de propriété et mode de transaction.'
      ]
    },
    faq: [
      {
        q: 'Comment retrouver un bien précis ?',
        a: 'Tapez une partie de son adresse ou le nom du locataire dans « Rechercher ».'
      },
      {
        q: 'Que fait « Voir les détails » ?',
        a: 'Il ouvre la fiche complète du bien, avec ses onglets.'
      },
      {
        q: "Pourquoi une carte n'a-t-elle pas de loyer ?",
        a: "Le loyer vient du bail actif. Sans bail actif sur le bien, aucun loyer n'est affiché."
      }
    ],
    related: [{ label: "Fiche d'un bien", helpId: 'portails.proprietaire.bien-detail' }],
    keywords: ['carte', 'recherche', 'filtre', 'statut du bien', 'type de bien']
  },

  // ------------------------------------------------------------ Fiche d'un bien
  {
    id: 'portails.proprietaire.bien-detail',
    kind: 'page',
    title: "Fiche d'un bien",
    summary:
      "La fiche complète d'un de vos biens, en cinq onglets : informations, bail actif, historique des baux, statistiques de revenus et historique de maintenance.",
    purpose:
      "Vous y suivez un bien en particulier : qui l'occupe, ce qu'il rapporte et ce qui s'y est passé. Les chiffres viennent des baux et paiements enregistrés par l'agence.",
    steps: [
      { title: 'Choisir un onglet', detail: "Le dernier onglet ouvert est gardé dans l'adresse de la page." },
      {
        title: 'Lire le bail actif',
        detail: "L'onglet « Bail actif » donne le locataire, les dates, le loyer et les charges."
      },
      {
        title: 'Consulter les revenus',
        detail: "L'onglet « Statistiques de revenus » donne le total reçu, le mois en cours et la moyenne mensuelle."
      },
      { title: 'Revenir à la liste', detail: 'Le bouton « Retour » vous ramène à « Mes propriétés ».' }
    ],
    consequences: ["Cet écran est en lecture seule : aucune modification n'est possible."],
    faq: [
      {
        q: "Pourquoi l'onglet « Bail actif » est-il vide ?",
        a: "Le bien n'a pas de bail en cours. Les baux terminés se trouvent dans « Historique des baux »."
      },
      {
        q: 'Où voir les photos et les documents du bien ?',
        a: "Cet écran ne les affiche pas. Les documents de vos baux sont dans l'écran « Documents » du portail."
      },
      {
        q: 'Un message « accès non autorisé » apparaît. Pourquoi ?',
        a: "Le bien n'est pas rattaché à votre compte. Contactez votre agence."
      }
    ],
    permissions: { roles: ['Propriétaire'], note: 'Réservé aux biens rattachés à votre compte.' },
    related: [
      { label: 'Mes propriétés', helpId: 'portails.proprietaire.biens' },
      { label: 'Documents', helpId: 'portails.proprietaire.documents' }
    ],
    keywords: ['fiche', 'détail du bien', 'bien', 'onglets']
  },
  {
    id: 'portails.proprietaire.bien-detail.informations',
    kind: 'section',
    title: 'Informations de la propriété',
    summary: 'Les caractéristiques du bien : adresse, type, statut, modes de transaction et description.',
    howToRead: {
      notes: [
        "Statut : Brouillon, En cours d'examen, Disponible, Réservé, Sous offre, Loué, Vendu ou Archivé. Il s'agit du statut enregistré, qui peut différer de celui de la carte dans « Mes propriétés ».",
        'Modes de transaction : Vente, Location, Location courte durée.',
        'Le titre du bien est affiché en haut de la page, sous le bouton « Retour ».'
      ]
    },
    faq: [
      {
        q: 'Pourquoi le statut diffère-t-il de celui de la carte ?',
        a: "Ici s'affiche le statut enregistré, qui peut différer de celui de la carte dans « Mes propriétés »."
      },
      {
        q: 'Quels statuts un bien peut-il avoir ?',
        a: "Brouillon, En cours d'examen, Disponible, Réservé, Sous offre, Loué, Vendu ou Archivé."
      },
      { q: 'Où voir le titre du bien ?', a: 'En haut de la page, sous le bouton « Retour ».' }
    ],
    related: [{ label: 'Cartes de vos biens', helpId: 'portails.proprietaire.biens.liste' }],
    keywords: ['adresse', 'type', 'description', 'caractéristiques']
  },
  {
    id: 'portails.proprietaire.bien-detail.bail-actif',
    kind: 'section',
    title: 'Bail actif du bien',
    summary: 'Le bail en cours sur ce bien : locataire principal, dates, loyer, charges et co-locataires.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Le bail est en cours.' },
        { value: 'SUSPENDED', label: 'Suspendu', description: "Le bail est mis en pause par l'agence." },
        { value: 'DRAFT', label: 'Brouillon', description: 'Le bail est préparé mais pas encore en vigueur.' }
      ],
      notes: [
        "« Non définie » à la place de la date de fin signifie qu'aucune date de fin n'est enregistrée.",
        'Loyer mensuel et Charges sont les montants du bail, en FCFA.',
        'Les co-locataires, quand il y en a, sont listés sous le tableau.'
      ]
    },
    faq: [
      {
        q: 'Que signifie « Non définie » à la place de la date de fin ?',
        a: "Qu'aucune date de fin n'est enregistrée pour ce bail."
      },
      { q: 'Où voir les co-locataires ?', a: 'Sous le tableau, quand le bail en compte.' },
      {
        q: 'Dans quelle unité sont les montants ?',
        a: 'En FCFA : « Loyer mensuel » et « Charges » sont les montants du bail.'
      }
    ],
    related: [{ label: "Fiche d'un bail", helpId: 'portails.proprietaire.bail-detail' }],
    keywords: ['bail en cours', 'locataire', 'loyer', 'charges', 'co-locataires']
  },
  {
    id: 'portails.proprietaire.bien-detail.historique-baux',
    kind: 'section',
    title: 'Historique des baux du bien',
    summary:
      'Les anciens baux de ce bien, avec le locataire, la période et le loyer. Une recherche par nom de locataire est proposée.',
    howToRead: {
      notes: [
        'Seuls les baux terminés sont listés, avec le statut « Terminé ».',
        'Chaque ligne affiche le locataire, la période « Du … au … » et le loyer par mois.',
        "Une date de fin absente s'affiche « N/A »."
      ]
    },
    faq: [
      { q: 'Quels baux sont listés ici ?', a: 'Seulement les baux terminés, avec le statut « Terminé ».' },
      { q: 'Pourquoi « N/A » à la place de la date de fin ?', a: "Aucune date de fin n'est enregistrée pour ce bail." },
      {
        q: 'Comment retrouver un ancien locataire ?',
        a: 'Utilisez la recherche par nom de locataire proposée dans cette section.'
      }
    ],
    related: [{ label: 'Mes baux', helpId: 'portails.proprietaire.baux' }],
    keywords: ['anciens baux', 'locataires précédents', 'historique']
  },
  {
    id: 'portails.proprietaire.bien-detail.revenus',
    kind: 'section',
    title: 'Statistiques de revenus du bien',
    summary:
      'Trois chiffres sur les loyers encaissés pour ce bien : le total reçu, le mois en cours et la moyenne mensuelle.',
    howToRead: {
      notes: [
        'Total reçu : tous les paiements réussis sur ce bien depuis le début, hors dépôt de garantie.',
        'Ce mois : les paiements réussis du mois en cours.',
        'Moyenne mensuelle : le total reçu divisé par le nombre de mois écoulés depuis le premier paiement (par périodes de 30 jours, au moins un mois).',
        "Ce sont des sommes encaissées auprès du locataire, pas des reversements de l'agence."
      ]
    },
    faq: [
      {
        q: 'Pourquoi la moyenne est-elle basse ?',
        a: 'Elle répartit le total sur tous les mois depuis le premier paiement, y compris les mois sans paiement.'
      },
      {
        q: 'Le dépôt de garantie est-il compté ?',
        a: "Non, il n'est jamais compté dans les revenus."
      },
      {
        q: 'Où voir les revenus de tous mes biens ?',
        a: "Dans l'écran « Revenus » du menu."
      }
    ],
    related: [{ label: 'Revenus', helpId: 'portails.proprietaire.revenus' }],
    keywords: ['total reçu', 'moyenne mensuelle', 'revenus du bien']
  },
  {
    id: 'portails.proprietaire.bien-detail.maintenance',
    kind: 'section',
    title: 'Historique de maintenance du bien',
    summary:
      'Les incidents déclarés sur ce bien, du plus récent au plus ancien, avec une recherche par titre, catégorie ou statut.',
    howToRead: {
      notes: [
        'Chaque ligne affiche le titre, le statut, la catégorie, la priorité et la date de création.',
        "Le statut, la catégorie et la priorité s'affichent tels que le système les enregistre, sans traduction.",
        'Un ticket « RESOLVED » est affiché en vert, les autres en bleu.'
      ]
    },
    faq: [
      {
        q: 'Que montre chaque ligne ?',
        a: "Le titre, le statut, la catégorie, la priorité et la date de création de l'incident."
      },
      {
        q: 'Pourquoi certains mots ne sont-ils pas traduits ?',
        a: "Le statut, la catégorie et la priorité s'affichent tels que le système les enregistre, sans traduction."
      },
      {
        q: 'Comment retrouver un incident précis ?',
        a: 'Cherchez par titre, catégorie ou statut ; les incidents sont classés du plus récent au plus ancien.'
      }
    ],
    related: [{ label: 'Maintenance', helpId: 'portails.proprietaire.incidents' }],
    keywords: ['incidents', 'réparations', 'tickets', 'travaux']
  },

  // ------------------------------------------------------------------- Baux
  {
    id: 'portails.proprietaire.baux',
    kind: 'page',
    title: 'Mes baux',
    summary:
      'La liste des contrats de location de vos biens, avec le locataire, la période et le loyer. Elle sert à retrouver un bail et à ouvrir sa fiche.',
    purpose:
      'Chaque bail lie un de vos biens à un locataire. Vous y voyez tous les baux de vos biens, quel que soit leur statut, et les trois compteurs du haut.',
    steps: [
      {
        title: 'Lire les compteurs',
        detail: 'Baux actifs, terminés et suspendus, tous baux confondus, quelle que soit la recherche.'
      },
      {
        title: 'Chercher un bail',
        detail:
          'Tapez le bien ou le locataire dans « Rechercher ». Les filtres « Statut », « Propriété » et « Début du bail » affinent la liste.'
      },
      { title: 'Ouvrir la fiche', detail: 'Cliquez sur « Voir les détails » à droite de la ligne.' }
    ],
    consequences: ['Cet écran est en lecture seule : vous ne pouvez ni créer, ni modifier, ni résilier un bail.'],
    faq: [
      {
        q: 'Où est le bail de mon bien ?',
        a: "Si le bail ne figure pas ici, l'agence ne l'a pas encore enregistré pour ce bien. Contactez-la."
      },
      {
        q: 'Que veut dire « Non définie » ?',
        a: "Le bail n'a pas de date de fin enregistrée."
      },
      {
        q: 'Puis-je modifier le loyer ?',
        a: "Non. Seule l'agence peut modifier un bail."
      }
    ],
    permissions: { roles: ['Propriétaire'], note: 'Ne montre que les baux de vos biens.' },
    related: [
      { label: "Fiche d'un bail", helpId: 'portails.proprietaire.bail-detail' },
      { label: 'Mes propriétés', helpId: 'portails.proprietaire.biens' }
    ],
    keywords: ['baux', 'contrats de location', 'locataires', 'loyer']
  },
  {
    id: 'portails.proprietaire.baux.indicateurs',
    kind: 'section',
    title: 'Compteurs de baux',
    summary: 'Trois cartes comptent vos baux selon leur statut : actifs, terminés et suspendus.',
    howToRead: {
      notes: [
        'Baux actifs : baux en cours.',
        'Baux terminés : baux arrivés à leur terme.',
        "Baux suspendus : baux mis en pause par l'agence.",
        'Les compteurs portent sur tous vos baux, même ceux que la recherche masque. Les baux annulés ou en brouillon ne sont pas comptés ici, mais figurent dans la liste.'
      ]
    },
    faq: [
      {
        q: "Pourquoi un bail annulé n'est-il pas compté dans ces cartes ?",
        a: 'Les baux annulés ou en brouillon ne sont pas comptés ici, mais ils figurent dans la liste.'
      },
      {
        q: 'La recherche modifie-t-elle les compteurs ?',
        a: 'Non : ils portent sur tous vos baux, même ceux que la recherche masque.'
      },
      { q: 'Que veut dire « Baux suspendus » ?', a: "Ce sont les baux mis en pause par l'agence." }
    ],
    related: [{ label: 'Liste des baux', helpId: 'portails.proprietaire.baux.liste' }],
    keywords: ['baux actifs', 'baux terminés', 'baux suspendus']
  },
  {
    id: 'portails.proprietaire.baux.liste',
    kind: 'section',
    title: 'Liste des baux',
    summary: 'Chaque ligne est un bail : le bien, son statut, le locataire, les dates et le loyer par mois.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Le bail est en cours.' },
        { value: 'ENDED', label: 'Terminé', description: 'Le bail est arrivé à son terme.' },
        { value: 'SUSPENDED', label: 'Suspendu', description: "Le bail est mis en pause par l'agence." },
        { value: 'CANCELED', label: 'Annulé', description: 'Le bail a été annulé.' },
        { value: 'DRAFT', label: 'Brouillon', description: 'Le bail est préparé mais pas encore en vigueur.' }
      ],
      notes: [
        'Chaque ligne indique « Locataire : … », « Du … au … » (ou « Non définie ») et « Loyer : … / mois ».',
        'Filtres : « Statut » (Actif, Terminé, Suspendu, Annulé), « Propriété » et « Début du bail » (une période de dates).',
        'Les baux sont triés du plus récent au plus ancien selon leur date de début.'
      ]
    },
    faq: [
      {
        q: 'Comment voir seulement les baux en cours ?',
        a: 'Choisissez « Actif » dans le filtre « Statut ».'
      },
      {
        q: 'Deux baux ont la même adresse. Comment les distinguer ?',
        a: "Utilisez le filtre « Propriété », qui reconnaît chaque bien, même quand deux lots d'un immeuble partagent l'adresse."
      },
      {
        q: "Où voir le détail des paiements d'un bail ?",
        a: "Cliquez sur « Voir les détails » puis ouvrez l'onglet « Historique des paiements »."
      }
    ],
    related: [{ label: "Fiche d'un bail", helpId: 'portails.proprietaire.bail-detail' }],
    keywords: ['liste', 'recherche', 'filtre', 'statut du bail']
  },

  // ------------------------------------------------------------ Fiche d'un bail
  {
    id: 'portails.proprietaire.bail-detail',
    kind: 'page',
    title: "Fiche d'un bail",
    summary:
      "La fiche complète d'un bail, en six onglets : informations, locataires, échéances, historique des paiements, solde et dépôt de garantie.",
    purpose:
      "Vous y suivez un contrat de location : ce que le locataire doit, ce qu'il a payé et le dépôt de garantie. Les chiffres viennent des échéances et paiements enregistrés par l'agence.",
    steps: [
      {
        title: 'Lire les informations',
        detail: "L'onglet « Informations » donne le numéro, les dates, le loyer, les charges et le dépôt de garantie."
      },
      {
        title: 'Voir ce qui est dû',
        detail:
          "L'onglet « Échéances » liste le calendrier. L'onglet « Solde » résume le total dû, payé et le reste à payer."
      },
      {
        title: 'Vérifier les paiements',
        detail: "L'onglet « Historique des paiements » montre chaque paiement réussi et les échéances qu'il a soldées."
      },
      {
        title: 'Contrôler le dépôt',
        detail: "L'onglet « Dépôt de garantie » donne le montant cible, détenu et remboursé."
      }
    ],
    consequences: ["Cet écran est en lecture seule : rien n'y modifie le bail, les échéances ou les paiements."],
    faq: [
      {
        q: 'Pourquoi le « Reste à payer » est-il plus petit que le total des échéances ?',
        a: 'Il ne compte que les échéances dont la date est arrivée. Les échéances à venir sont signalées à part dans un encadré bleu.'
      },
      {
        q: "L'onglet « Dépôt de garantie » est vide. Pourquoi ?",
        a: "Aucun dépôt n'est enregistré sur ce bail. Contactez l'agence si vous en attendiez un."
      },
      {
        q: 'Les noms des locataires sont-ils modifiables ?',
        a: "Non. Seule l'agence peut les modifier."
      }
    ],
    permissions: { roles: ['Propriétaire'], note: 'Réservé aux baux de vos biens.' },
    related: [
      { label: 'Mes baux', helpId: 'portails.proprietaire.baux' },
      { label: 'Dépôts de garantie', helpId: 'portails.proprietaire.cautions' }
    ],
    keywords: ['fiche du bail', 'contrat', 'solde', 'échéancier', 'onglets']
  },
  {
    id: 'portails.proprietaire.bail-detail.informations',
    kind: 'section',
    title: 'Informations du bail',
    summary: 'Les conditions du bail : bien, numéro, dates, loyer, charges, dépôt de garantie et statut.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Le bail est en cours.' },
        { value: 'ENDED', label: 'Terminé', description: 'Le bail est arrivé à son terme.' },
        { value: 'SUSPENDED', label: 'Suspendu', description: "Le bail est mis en pause par l'agence." },
        { value: 'CANCELED', label: 'Annulé', description: 'Le bail a été annulé.' },
        { value: 'DRAFT', label: 'Brouillon', description: 'Le bail est préparé mais pas encore en vigueur.' }
      ],
      notes: [
        "« Non définie » à la place de la date de fin signifie qu'aucune date de fin n'est enregistrée.",
        "Le « Dépôt de garantie » affiché ici est le montant prévu au bail. Les sommes réellement versées se lisent dans l'onglet « Dépôt de garantie »."
      ]
    },
    faq: [
      {
        q: "Le « Dépôt de garantie » affiché est-il la somme que j'ai versée ?",
        a: "Non : c'est le montant prévu au bail. Les sommes réellement versées se lisent dans l'onglet « Dépôt de garantie »."
      },
      {
        q: 'Que signifie « Non définie » à la place de la date de fin ?',
        a: "Qu'aucune date de fin n'est enregistrée pour ce bail."
      },
      { q: 'Quels statuts un bail peut-il avoir ?', a: 'Actif, Terminé, Suspendu, Annulé ou Brouillon.' }
    ],
    keywords: ['numéro de bail', 'loyer mensuel', 'charges', 'dates']
  },
  {
    id: 'portails.proprietaire.bail-detail.locataires',
    kind: 'section',
    title: 'Locataires du bail',
    summary: "Le locataire principal (nom et e-mail) et, s'il y en a, les co-locataires.",
    howToRead: {
      notes: [
        "Le cadre « Co-locataires » n'apparaît que si le bail en compte.",
        "Seuls le nom et l'e-mail sont affichés."
      ]
    },
    faq: [
      { q: 'Quelles informations voit-on sur le locataire ?', a: "Seuls le nom et l'e-mail sont affichés." },
      {
        q: 'Pourquoi le cadre « Co-locataires » est-il absent ?',
        a: "Il n'apparaît que si le bail compte des co-locataires."
      },
      {
        q: 'Où voir les échéances et le dépôt de garantie de ce bail ?',
        a: "Dans les autres parties de la fiche du bail : le calendrier des échéances et l'onglet « Dépôt de garantie »."
      }
    ],
    keywords: ['locataire principal', 'co-locataires', 'e-mail']
  },
  {
    id: 'portails.proprietaire.bail-detail.echeances',
    kind: 'table',
    title: 'Calendrier des échéances du bail',
    summary:
      'Toutes les échéances du bail, de la plus récente à la plus ancienne, avec le montant dû, le montant payé et le statut.',
    howToRead: {
      columns: [
        { key: 'period', label: 'Période', description: 'Le mois concerné, écrit année-mois (par exemple 2026-11).' },
        { key: 'due_date', label: "Date d'échéance", description: "La date limite de paiement de l'échéance." },
        {
          key: 'amount',
          label: 'Montant',
          description: "Le total de l'échéance : loyer, charges, autres frais et pénalité éventuelle."
        },
        { key: 'amount_paid', label: 'Payé', description: 'La somme déjà enregistrée comme payée sur cette échéance.' },
        { key: 'status', label: 'Statut', description: "L'état de l'échéance." }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: "L'échéance est préparée mais pas encore exigible." },
        { value: 'DUE', label: 'Échéance', description: "L'échéance est à payer." },
        { value: 'PARTIAL', label: 'Partiel', description: 'Une partie seulement a été payée.' },
        { value: 'PAID', label: 'Payé', description: "L'échéance est soldée." },
        { value: 'OVERDUE', label: 'En retard', description: 'La date est dépassée et il reste un montant à payer.' }
      ],
      notes: ['Le tableau propose une recherche par période, des filtres et un export.']
    },
    faq: [
      {
        q: 'Pourquoi « Payé » est-il plus petit que « Montant » ?',
        a: "Le locataire n'a payé qu'une partie. Le reste doit encore être réglé."
      },
      {
        q: "D'où vient la pénalité ?",
        a: "Elle est ajoutée par l'agence en cas de retard et fait partie du « Montant »."
      },
      {
        q: 'Comment exporter le calendrier ?',
        a: "Utilisez le bouton d'export au-dessus du tableau."
      }
    ],
    related: [{ label: 'Échéances de tous vos baux', helpId: 'portails.proprietaire.echeances' }],
    keywords: ['échéancier', 'calendrier', 'loyers dus', 'retards']
  },
  {
    id: 'portails.proprietaire.bail-detail.paiements',
    kind: 'section',
    title: 'Historique des paiements du bail',
    summary: "Les paiements réussis sur ce bail, du plus récent au plus ancien, avec les échéances qu'ils ont soldées.",
    howToRead: {
      notes: [
        'Chaque ligne affiche le montant, la méthode (Espèces, Virement bancaire, Chèque, Mobile Money, Prélèvement bancaire, Carte ou Autre) et la date.',
        '« Allocations : » indique à quelles échéances le paiement a été affecté, sous la forme « période (montant) ».',
        'Une recherche par méthode et par date est proposée au-dessus de la liste.'
      ]
    },
    faq: [
      {
        q: "Qu'est-ce qu'une allocation ?",
        a: "C'est la part d'un paiement affectée à une échéance. Un même paiement peut régler plusieurs échéances."
      },
      {
        q: 'Un paiement en attente figure-t-il ici ?',
        a: 'Non, seuls les paiements réussis sont listés.'
      },
      {
        q: 'Où voir les paiements de tous mes baux ?',
        a: "Dans l'écran « Paiements »."
      }
    ],
    related: [{ label: 'Paiements', helpId: 'portails.proprietaire.paiements' }],
    keywords: ['paiements du bail', 'allocations', 'règlements']
  },
  {
    id: 'portails.proprietaire.bail-detail.solde',
    kind: 'section',
    title: 'Solde du bail',
    summary: 'Trois montants pour savoir où en est le bail : le total dû, le total payé et le reste à payer.',
    howToRead: {
      notes: [
        "Total dû : toutes les échéances du bail, payées ou non, à l'exception des échéances annulées et des brouillons non payés. Les échéances à venir en font partie.",
        'Total payé : tout ce que les paiements réussis ont soldé sur le bail.',
        'Reste à payer : ce qui reste dû sur les échéances dont la date est arrivée. Il passe au vert quand il est à zéro.',
        "L'encadré « Échéances à venir (non exigibles) » donne le montant des échéances futures non soldées. Il n'est pas inclus dans le reste à payer.",
        "L'encadré « Montant en attente de paiement » apparaît quand le reste à payer est supérieur à zéro."
      ]
    },
    faq: [
      {
        q: 'Le reste à payer est à zéro mais le locataire doit encore des loyers ?',
        a: 'Ce sont probablement des échéances à venir : elles sont indiquées à part et deviendront exigibles à leur date.'
      },
      {
        q: "Ces montants sont-ils reversés par l'agence ?",
        a: 'Non, ils décrivent la relation entre le locataire et le bail, pas les reversements au propriétaire.'
      },
      {
        q: 'Le total payé inclut-il le dépôt de garantie ?',
        a: "Non, le dépôt se lit dans l'onglet « Dépôt de garantie »."
      }
    ],
    keywords: ['solde', 'total dû', 'total payé', 'reste à payer', 'impayés']
  },
  {
    id: 'portails.proprietaire.bail-detail.depot',
    kind: 'section',
    title: 'Dépôt de garantie du bail',
    summary:
      'Le dépôt de garantie de ce bail : montant cible, montant détenu, montant remboursé et historique des mouvements.',
    howToRead: {
      notes: [
        'Montant cible : le dépôt prévu au bail.',
        "Montant détenu : le solde actuel du dépôt, c'est-à-dire ce qui a été collecté moins ce qui a été remboursé ou confisqué.",
        'Montant remboursé : la somme déjà rendue au locataire.',
        "Historique des mouvements : types Collecte, Détention, Libération, Remboursement, Confiscation et Ajustement, avec montant, date et note éventuelle. Le cadre n'apparaît que s'il y a des mouvements."
      ]
    },
    faq: [
      {
        q: 'Le dépôt est-il un revenu ?',
        a: "Non, c'est une somme gardée pour le compte du locataire. Il n'entre dans aucun total de revenus."
      },
      {
        q: 'Où voir tous mes dépôts ?',
        a: "Dans l'écran « Dépôts de garantie » du portail."
      },
      {
        q: "Rien n'est affiché. Pourquoi ?",
        a: "Aucun dépôt n'est enregistré sur ce bail : « Aucun dépôt de garantie enregistré »."
      }
    ],
    related: [{ label: 'Dépôts de garantie', helpId: 'portails.proprietaire.cautions' }],
    keywords: ['caution', 'dépôt de garantie', 'remboursement', 'confiscation']
  },

  // ---------------------------------------------------------------- Revenus
  {
    id: 'portails.proprietaire.revenus',
    kind: 'page',
    title: 'Revenus',
    summary:
      "L'analyse des loyers encaissés sur vos biens : quatre totaux, un graphique par mois et un tableau par propriété.",
    purpose:
      "Vous y voyez combien vos biens ont rapporté, mois par mois et bien par bien. Les chiffres additionnent les paiements réussis enregistrés par l'agence.",
    steps: [
      { title: 'Lire les totaux', detail: 'Les quatre cartes ne dépendent pas des filtres.' },
      { title: 'Choisir une année', detail: 'Le filtre « Année (revenus mensuels) » change le graphique par mois.' },
      {
        title: 'Choisir une période',
        detail: 'Le filtre « Période » limite le graphique et le tableau « Revenus par propriété » à ces dates.'
      },
      {
        title: 'Comparer vos biens',
        detail: 'Le tableau classe les revenus par propriété avec le nombre de paiements.'
      }
    ],
    consequences: [
      'Cet écran est en lecture seule.',
      "Le dépôt de garantie n'est jamais compté dans les revenus.",
      "Ce sont des encaissements auprès des locataires, pas des reversements de l'agence."
    ],
    faq: [
      {
        q: 'Pourquoi le graphique mensuel ne bouge-t-il pas quand je choisis une période ?',
        a: "Le graphique par mois suit seulement l'année choisie. La période s'applique au graphique et au tableau par propriété."
      },
      {
        q: 'Pourquoi mon total du mois diffère-t-il de mon virement ?',
        a: "Ces chiffres sont des encaissements. Le virement de l'agence peut suivre d'autres règles, que cet écran ne montre pas."
      },
      {
        q: 'Peut-on exporter le tableau ?',
        a: "Oui, avec le bouton d'export au-dessus du tableau."
      }
    ],
    permissions: { roles: ['Propriétaire'], note: 'Ne montre que les revenus de vos biens.' },
    related: [
      { label: 'Paiements', helpId: 'portails.proprietaire.paiements' },
      { label: 'Rapports', helpId: 'portails.proprietaire.rapports' }
    ],
    keywords: ['revenus', 'loyers', 'graphique', 'rentabilité', 'encaissements']
  },
  {
    id: 'portails.proprietaire.revenus.indicateurs',
    kind: 'section',
    title: 'Totaux de revenus',
    summary: 'Quatre cartes résument vos revenus : ce mois, cette année, depuis toujours et la moyenne mensuelle.',
    howToRead: {
      notes: [
        'Ce mois : paiements réussis du mois en cours.',
        'Cette année : paiements réussis depuis le 1er janvier.',
        'Tous les temps : tous les paiements réussis sur vos biens.',
        'Moyenne mensuelle : le total depuis toujours divisé par le nombre de mois écoulés depuis le premier paiement (par périodes de 30 jours, au moins un mois).',
        "Le dépôt de garantie n'est pas compté. Les cartes ne changent pas avec les filtres."
      ]
    },
    faq: [
      {
        q: "Pourquoi la moyenne mensuelle baisse-t-elle quand je n'ai pas de paiement ?",
        a: 'Le total est réparti sur un nombre de mois qui augmente chaque mois, même sans paiement.'
      },
      {
        q: 'Ces totaux changent-ils avec le filtre « Période » ?',
        a: 'Non, ils portent toujours sur tous vos biens et toutes les dates.'
      },
      {
        q: "Où est le total de l'année dernière ?",
        a: "Choisissez l'année voulue dans le filtre « Année (revenus mensuels) » pour voir ses mois."
      }
    ],
    keywords: ['ce mois', 'cette année', 'tous les temps', 'moyenne mensuelle']
  },
  {
    id: 'portails.proprietaire.revenus.filtres',
    kind: 'section',
    title: 'Filtres des revenus',
    summary: 'Deux choix : une période de dates pour les revenus par propriété et une année pour les revenus par mois.',
    howToRead: {
      notes: [
        'Période : deux dates (jour/mois/année). Elle limite le tableau et le graphique « Revenus par propriété », selon la date de réussite des paiements.',
        "Année (revenus mensuels) : l'année en cours et les quatre précédentes. Elle pilote le graphique « Revenus par mois ».",
        "Changer un filtre recharge l'écran."
      ]
    },
    faq: [
      {
        q: 'Sur quoi le filtre « Période » agit-il ?',
        a: "Sur le tableau et le graphique « Revenus par propriété », selon la date de réussite des paiements. Il n'agit pas sur le graphique « Revenus par mois »."
      },
      { q: 'Quelles années puis-je choisir ?', a: "L'année en cours et les quatre précédentes." },
      { q: 'Que se passe-t-il quand je change un filtre ?', a: "L'écran se recharge avec le nouveau choix." }
    ],
    keywords: ['filtres', 'période', 'année']
  },
  {
    id: 'portails.proprietaire.revenus.graphique',
    kind: 'section',
    title: 'Graphique des revenus par mois',
    summary:
      "Une courbe de vos revenus mois par mois pour l'année choisie. Les 12 mois figurent, même ceux sans paiement.",
    howToRead: {
      notes: [
        "En bas : les mois de l'année. À gauche : les montants en FCFA.",
        'Passez la souris sur un point (ou touchez-le) pour voir le montant exact du mois.',
        'La courbe additionne les paiements réussis de chaque mois, hors dépôt de garantie.',
        'Un mois sans paiement vaut 0 FCFA.'
      ]
    },
    faq: [
      {
        q: 'Comment voir une autre année ?',
        a: 'Changez la valeur du filtre « Année (revenus mensuels) ».'
      },
      {
        q: 'La courbe est à plat. Pourquoi ?',
        a: "Aucun paiement réussi n'est enregistré sur l'année choisie."
      },
      {
        q: 'Le filtre « Période » agit-il ici ?',
        a: "Non, ce graphique ne suit que l'année."
      }
    ],
    keywords: ['courbe', 'graphique', 'mois', 'évolution']
  },
  {
    id: 'portails.proprietaire.revenus.par-bien',
    kind: 'section',
    title: 'Graphique des revenus par propriété',
    summary: 'Un histogramme qui compare les revenus de chacun de vos biens sur la période choisie.',
    howToRead: {
      notes: [
        'Une barre par bien : sa hauteur est le total des paiements réussis du bien.',
        'Sans période choisie, le graphique couvre toutes les dates.',
        'Le tableau situé en dessous donne les mêmes chiffres et le nombre de paiements.'
      ]
    },
    faq: [
      { q: "Que représente la hauteur d'une barre ?", a: 'Le total des paiements réussis du bien.' },
      { q: 'Que montre le graphique si je ne choisis pas de période ?', a: 'Il couvre toutes les dates.' },
      { q: 'Où voir le nombre de paiements de chaque bien ?', a: 'Dans le tableau situé sous le graphique.' }
    ],
    keywords: ['histogramme', 'comparaison', 'par bien']
  },
  {
    id: 'portails.proprietaire.revenus.tableau',
    kind: 'table',
    title: 'Tableau des revenus par propriété',
    summary: 'Le revenu et le nombre de paiements de chaque bien sur la période choisie.',
    howToRead: {
      columns: [
        { key: 'propertyAddress', label: 'Propriété', description: 'Le bien concerné, désigné par son adresse.' },
        { key: 'revenue', label: 'Revenus', description: 'La somme des paiements réussis du bien, en FCFA.' },
        {
          key: 'paymentCount',
          label: 'Nombre de paiements',
          description: 'Combien de paiements ont été reçus pour ce bien.'
        }
      ],
      notes: [
        'La recherche porte sur le nom de la propriété.',
        'Seuls les biens qui ont reçu au moins un paiement sur la période apparaissent.'
      ]
    },
    faq: [
      {
        q: 'Un bien est absent du tableau. Pourquoi ?',
        a: "Il n'a reçu aucun paiement réussi sur la période choisie."
      },
      {
        q: 'Peut-on exporter ce tableau ?',
        a: "Oui, avec le bouton d'export au-dessus du tableau."
      },
      {
        q: 'Comment changer de période ?',
        a: 'Utilisez le filtre « Période » dans la carte « Filtres ».'
      }
    ],
    keywords: ['revenus par bien', 'paiements par bien', 'export']
  },

  // -------------------------------------------------------------- Échéances
  {
    id: 'portails.proprietaire.echeances',
    kind: 'page',
    title: 'Échéances',
    summary:
      'Le suivi des échéances de loyer de tous vos baux : des compteurs, deux montants et un tableau avec recherche et filtres.',
    purpose:
      "Une échéance est la somme qu'un locataire doit payer à une date donnée. Vous voyez ici lesquelles sont payées, à payer ou en retard.",
    steps: [
      {
        title: 'Lire les compteurs',
        detail: 'Ils portent sur toutes les échéances qui correspondent à votre recherche et à vos filtres.'
      },
      {
        title: 'Chercher',
        detail: 'Utilisez « Rechercher » (bien, locataire…), puis les filtres « Statut », « Propriété » et « Période ».'
      },
      {
        title: "Voir le détail d'une ligne",
        detail: 'Sous le montant, « payé » et « dont pénalité » précisent ce qui a été réglé.'
      },
      { title: 'Exporter', detail: "Utilisez le bouton d'export au-dessus du tableau." }
    ],
    consequences: ['Cet écran est en lecture seule : vous ne pouvez pas encaisser ni modifier une échéance.'],
    faq: [
      {
        q: 'Pourquoi une échéance « À payer » compte-t-elle dans « En retard » ?',
        a: "Une échéance dont la date est passée et qui n'est pas soldée est comptée en retard, même si l'étiquette de la ligne reste « À payer »."
      },
      {
        q: 'Le filtre « Période » porte sur quoi ?',
        a: "Sur la date d'échéance, pas sur la date de paiement."
      },
      {
        q: "Un locataire a payé mais l'échéance est « En retard » ?",
        a: "Le paiement est peut-être en attente de validation par l'agence. Contactez-la si cela dure."
      }
    ],
    permissions: { roles: ['Propriétaire'], note: 'Ne montre que les échéances de vos baux.' },
    related: [
      { label: 'Paiements', helpId: 'portails.proprietaire.paiements' },
      { label: 'Mes baux', helpId: 'portails.proprietaire.baux' }
    ],
    keywords: ['échéances', 'loyers à payer', 'retards', 'impayés', 'échéancier']
  },
  {
    id: 'portails.proprietaire.echeances.indicateurs',
    kind: 'section',
    title: "Compteurs d'échéances",
    summary: 'Quatre cartes comptent vos échéances : le total, celles à payer, en retard et payées.',
    howToRead: {
      notes: [
        'Total : toutes les échéances qui correspondent à la recherche et aux filtres.',
        "À payer : échéances à payer dont la date n'est pas encore passée.",
        'En retard : échéances en retard, ainsi que celles à payer dont la date est passée.',
        'Payées : échéances soldées.',
        'Une échéance partiellement payée est comptée dans « Total » seulement.',
        'Les chiffres sont calculés sur toutes les lignes correspondantes, pas seulement sur la page affichée.'
      ]
    },
    faq: [
      {
        q: "Pourquoi une échéance partiellement payée n'apparaît-elle pas dans « À payer » ?",
        a: 'Une échéance partiellement payée est comptée dans « Total » seulement.'
      },
      {
        q: 'Une échéance dont la date est passée est-elle « En retard » ?',
        a: 'Oui : « En retard » compte aussi les échéances à payer dont la date est passée.'
      },
      {
        q: 'Les chiffres portent-ils seulement sur la page affichée ?',
        a: 'Non : ils sont calculés sur toutes les lignes qui correspondent à la recherche et aux filtres.'
      }
    ],
    keywords: ['total', 'à payer', 'en retard', 'payées']
  },
  {
    id: 'portails.proprietaire.echeances.montants',
    kind: 'section',
    title: "Montants d'échéances",
    summary: 'Deux cartes donnent les montants : le total des échéances et ce qui reste dû.',
    howToRead: {
      notes: [
        'Montant total : la somme des montants de toutes les échéances correspondantes (loyer, charges, autres frais et pénalités).',
        'Montant dû : ce qui reste à payer sur les échéances à payer, en retard ou partielles. Les échéances à venir y sont comprises.',
        'Les montants suivent la recherche et les filtres.'
      ]
    },
    faq: [
      {
        q: 'Le montant dû est plus grand que mes retards. Pourquoi ?',
        a: 'Il inclut aussi les échéances à venir non payées, pas seulement celles en retard.'
      },
      {
        q: 'Les pénalités sont-elles incluses ?',
        a: 'Oui, elles font partie du montant de chaque échéance.'
      },
      {
        q: 'Ce montant est-il ce que je dois recevoir ?',
        a: "Non, c'est ce que les locataires doivent payer."
      }
    ],
    keywords: ['montant total', 'montant dû', 'pénalités']
  },
  {
    id: 'portails.proprietaire.echeances.tableau',
    kind: 'table',
    title: 'Liste des échéances',
    summary:
      'Une ligne par échéance, de la plus récente à la plus ancienne, avec le bien, le locataire, la période, le montant et le statut.',
    howToRead: {
      columns: [
        { key: 'propertyAddress', label: 'Propriété', description: 'Le titre du bien ou, à défaut, son adresse.' },
        { key: 'tenantName', label: 'Locataire', description: 'Le locataire principal du bail.' },
        { key: 'period', label: 'Période', description: 'Le mois concerné, écrit mois/année.' },
        { key: 'dueDate', label: "Date d'échéance", description: 'La date limite de paiement.' },
        {
          key: 'amount',
          label: 'Montant',
          description: "Le total de l'échéance, avec dessous la somme déjà payée et la part de pénalité."
        },
        {
          key: 'penaltyAmount',
          label: 'Pénalité',
          description: "La pénalité ajoutée en cas de retard, ou un tiret s'il n'y en a pas."
        },
        { key: 'status', label: 'Statut', description: "L'état de l'échéance." }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: "L'échéance est préparée mais pas encore exigible." },
        { value: 'DUE', label: 'À payer', description: "L'échéance est à payer." },
        { value: 'PARTIAL', label: 'Partiel', description: 'Une partie seulement a été payée.' },
        { value: 'PAID', label: 'Payé', description: "L'échéance est soldée." },
        { value: 'OVERDUE', label: 'En retard', description: 'La date est dépassée et il reste un montant à payer.' }
      ],
      notes: [
        "Le statut est recalculé d'après les paiements réussis : tout payé donne « Payé », une partie payée donne « Partiel ».",
        "Le filtre « Période » porte sur la date d'échéance. La recherche porte sur le bien et le locataire.",
        'Le tableau ne se trie pas par colonne.'
      ]
    },
    faq: [
      {
        q: 'Comment voir seulement les retards ?',
        a: 'Choisissez « En retard » dans le filtre « Statut ».'
      },
      {
        q: 'Que signifie « dont pénalité » ?',
        a: "C'est la part du montant qui correspond à une pénalité de retard."
      },
      {
        q: 'Comment exporter la liste ?',
        a: "Avec le bouton d'export. Il reprend toutes les lignes correspondant à vos filtres, pas seulement la page affichée."
      }
    ],
    related: [{ label: 'Paiements', helpId: 'portails.proprietaire.paiements.tableau' }],
    keywords: ['échéances', 'tableau', 'retard', 'pénalité', 'statut']
  },

  // -------------------------------------------------------------- Paiements
  {
    id: 'portails.proprietaire.paiements',
    kind: 'page',
    title: 'Paiements',
    summary:
      "L'historique des paiements de loyer reçus sur vos biens : quatre compteurs et un tableau avec recherche, filtres et détail de chaque paiement.",
    purpose:
      'Vous y retrouvez chaque paiement réussi, avec le locataire, la méthode et la date, et pouvez voir à quelles échéances il a servi.',
    steps: [
      { title: 'Lire les compteurs', detail: 'Ils suivent la recherche et les filtres choisis.' },
      {
        title: 'Chercher un paiement',
        detail: 'Utilisez « Rechercher » (bien, locataire, référence…), puis « Propriété », « Méthode » et « Période ».'
      },
      { title: 'Ouvrir le détail', detail: 'Cliquez sur « Détails » à droite de la ligne.' },
      { title: 'Exporter', detail: "Utilisez le bouton d'export au-dessus du tableau." }
    ],
    consequences: [
      'Cet écran est en lecture seule : vous ne pouvez pas enregistrer, modifier ni annuler un paiement.',
      "Seuls les paiements réussis sont listés. Les paiements qui constituent un dépôt de garantie n'y figurent pas."
    ],
    faq: [
      {
        q: 'Pourquoi « Ce mois » et « Cette année » affichent-ils un nombre et non un montant ?',
        a: 'Ces deux cartes comptent des paiements. Le montant total est donné par la carte « Montant total ».'
      },
      {
        q: 'Un paiement est introuvable.',
        a: "Il est peut-être encore en attente de validation, ou rattaché à un dépôt de garantie. Dans les deux cas il n'apparaît pas ici."
      },
      {
        q: "Ces montants sont-ils ceux que l'agence m'a reversés ?",
        a: 'Non, ce sont les paiements reçus des locataires. Les reversements ne sont pas montrés ici.'
      }
    ],
    permissions: { roles: ['Propriétaire'], note: 'Ne montre que les paiements de vos baux.' },
    related: [
      { label: 'Échéances', helpId: 'portails.proprietaire.echeances' },
      { label: 'Revenus', helpId: 'portails.proprietaire.revenus' }
    ],
    keywords: ['paiements', 'encaissements', 'loyers reçus', 'mobile money', 'historique']
  },
  {
    id: 'portails.proprietaire.paiements.indicateurs',
    kind: 'section',
    title: 'Compteurs de paiements',
    summary:
      'Quatre cartes résument vos paiements : leur nombre, leur montant total, et combien ont eu lieu ce mois et cette année.',
    howToRead: {
      notes: [
        'Total : le nombre de paiements qui correspondent à la recherche et aux filtres.',
        'Montant total : la somme de ces paiements, en FCFA.',
        'Ce mois : le nombre de paiements dont la date tombe dans le mois en cours.',
        "Cette année : le nombre de paiements dont la date tombe dans l'année en cours.",
        '« Ce mois » et « Cette année » sont des nombres de paiements, pas des montants.',
        'Les chiffres portent sur toutes les lignes correspondantes, pas seulement sur la page affichée.'
      ]
    },
    faq: [
      {
        q: '« Ce mois » est-il un montant ?',
        a: 'Non : « Ce mois » et « Cette année » sont des nombres de paiements, pas des montants.'
      },
      {
        q: 'Que compte la carte « Total » ?',
        a: 'Le nombre de paiements qui correspondent à la recherche et aux filtres.'
      },
      {
        q: 'Les chiffres portent-ils seulement sur la page affichée ?',
        a: 'Non : ils portent sur toutes les lignes correspondantes. Le montant total est exprimé en FCFA.'
      }
    ],
    keywords: ['total', 'montant total', 'ce mois', 'cette année']
  },
  {
    id: 'portails.proprietaire.paiements.tableau',
    kind: 'table',
    title: 'Historique des paiements',
    summary:
      'Une ligne par paiement réussi, du plus récent au plus ancien, avec le bien, le locataire, le montant, la date, la méthode et le statut.',
    howToRead: {
      columns: [
        { key: 'propertyAddress', label: 'Propriété', description: 'Le titre du bien ou, à défaut, son adresse.' },
        { key: 'tenantName', label: 'Locataire', description: 'Le locataire principal du bail.' },
        { key: 'amount', label: 'Montant', description: 'La somme reçue, en FCFA.' },
        {
          key: 'date',
          label: 'Date',
          description: "La date et l'heure auxquelles le paiement a réussi (jour/mois/année et heure)."
        },
        {
          key: 'method',
          label: 'Méthode',
          description: 'Mobile Money, Prélèvement bancaire, Virement bancaire, Espèces, Chèque ou Carte bancaire.'
        },
        { key: 'status', label: 'Statut', description: "L'état du paiement." },
        { key: 'actions', label: 'Actions', description: 'Le bouton « Détails » ouvre la fenêtre du paiement.' }
      ],
      statuses: [{ value: 'SUCCESS', label: 'Réussi', description: 'Le paiement est enregistré comme reçu.' }],
      notes: [
        "Seuls les paiements réussis sont listés : les paiements en attente, échoués ou annulés n'apparaissent pas ici.",
        'Filtres : « Propriété », « Méthode » et « Période » (dates). La recherche porte sur le bien, le locataire et la référence.',
        'Le tableau ne se trie pas par colonne.'
      ]
    },
    faq: [
      {
        q: 'Comment voir les paiements par Mobile Money ?',
        a: 'Choisissez « Mobile Money » dans le filtre « Méthode ».'
      },
      {
        q: 'Que fait « Détails » ?',
        a: "Il ouvre une fenêtre qui montre les informations du paiement et les échéances qu'il a réglées."
      },
      {
        q: 'Comment exporter la liste ?',
        a: "Avec le bouton d'export. Il reprend toutes les lignes correspondant à vos filtres, pas seulement la page affichée."
      }
    ],
    related: [{ label: "Détail d'un paiement", helpId: 'portails.proprietaire.paiements.detail' }],
    keywords: ['paiements', 'historique', 'méthode', 'mobile money', 'export']
  },
  {
    id: 'portails.proprietaire.paiements.detail',
    kind: 'section',
    title: "Détail d'un paiement",
    summary: "La fenêtre « Détails du paiement » : les informations du paiement et les échéances qu'il a réglées.",
    howToRead: {
      notes: [
        'Informations du paiement : Montant, Statut, Méthode, Date, Propriété.',
        "Si le paiement a été fait en ligne ou par Mobile Money, des lignes peuvent s'ajouter : « ID Transaction PSP » et « Référence PSP » (références données par le prestataire de paiement) et « Opérateur Mobile Money ». Elles n'apparaissent que si l'information existe.",
        'Allocations aux échéances : un tableau indique, pour chaque échéance réglée, la période, la propriété et le montant alloué.',
        "« Aucune allocation trouvée pour ce paiement. » s'affiche quand le paiement n'a été affecté à aucune échéance."
      ]
    },
    faq: [
      {
        q: 'Un paiement peut-il régler plusieurs échéances ?',
        a: "Oui. Chaque ligne du tableau d'allocations donne la part affectée à une échéance."
      },
      {
        q: 'À quoi sert la référence du prestataire ?',
        a: "Elle permet à l'agence de retrouver le paiement chez l'opérateur en cas de question."
      },
      {
        q: 'Peut-on modifier le paiement ?',
        a: 'Non, la fenêtre est en lecture seule. Fermez-la avec la croix en haut à droite.'
      }
    ],
    related: [{ label: 'Historique des paiements', helpId: 'portails.proprietaire.paiements.tableau' }],
    keywords: ['détails du paiement', 'allocations', 'référence', 'opérateur']
  },
  {
    id: 'portails.proprietaire.paiements.allocations',
    kind: 'table',
    title: 'Allocations aux échéances',
    summary: "Les échéances qu'un paiement a réglées, avec le montant affecté à chacune.",
    howToRead: {
      columns: [
        { key: 'installment', label: 'Échéance', description: 'La période réglée, écrite « Échéance mois/année ».' },
        { key: 'property', label: 'Propriété', description: 'Le bien concerné par cette échéance.' },
        {
          key: 'amount',
          label: 'Montant alloué',
          description: 'La part du paiement affectée à cette échéance, en FCFA.'
        }
      ],
      notes: ['La somme des montants alloués correspond au montant du paiement quand il est entièrement affecté.']
    },
    faq: [
      {
        q: 'Pourquoi la somme est-elle plus petite que le paiement ?',
        a: "Une partie du paiement n'a peut-être pas encore été affectée à une échéance."
      },
      {
        q: 'Où voir le statut de chaque échéance ?',
        a: "Dans l'écran « Échéances » ou l'onglet « Échéances » de la fiche du bail."
      },
      {
        q: 'Peut-on exporter ce tableau ?',
        a: "Oui, avec le bouton d'export au-dessus du tableau."
      }
    ],
    keywords: ['allocations', 'échéances réglées', 'affectation']
  }
];

export default entries;
