import type { HelpEntry } from '../../../types';

/** Zone « accueil » du module « communication » (fr) : le tableau de bord d'accueil. */
const entries: HelpEntry[] = [
  {
    id: 'communication.accueil.tableau-de-bord',
    kind: 'page',
    title: 'Tableau de bord',
    summary:
      "Le tableau de bord résume l'activité de votre agence : chiffres clés, ce qu'il faut traiter aujourd'hui, graphiques et dernières nouveautés. Chaque carte mène à l'écran qui détient le détail.",
    purpose:
      "C'est la page d'accueil des collaborateurs d'une agence. Elle ne montre que les modules inclus dans votre abonnement et que vos droits vous permettent de voir.\n\nUn tiret « — » à la place d'un chiffre veut dire que le module vous est inaccessible, pas que le résultat vaut zéro.",
    howToRead: {
      notes: [
        'Tuiles du haut : « Impayés », « À encaisser sous 7 jours » et « Encaissé » du mois (gestion locative), puis « Biens », « Contacts » et « Tickets ouverts ».',
        'Montants abrégés : « 85 k » pour 85 000 FCFA, « 12,4 M » pour 12,4 millions de FCFA.'
      ]
    },
    steps: [
      { title: 'Regardez les tuiles', detail: 'Cliquez sur une tuile pour ouvrir la liste qui produit ce chiffre.' },
      { title: 'Traitez la liste du jour', detail: "Cliquez sur une ligne de « À traiter aujourd'hui »." },
      { title: 'Parcourez les graphiques', detail: 'Cliquez sur une tranche, une barre ou le lien de la carte.' }
    ],
    consequences: [
      "Cet écran est en lecture seule : rien n'y modifie vos données et aucun message n'est envoyé.",
      "Les chiffres se mettent à jour quand vous rouvrez la page, ou revenez sur l'onglet après une trentaine de secondes."
    ],
    faq: [
      {
        q: "Pourquoi un tiret « — » à la place d'un chiffre ?",
        a: "Vous n'avez pas le droit de consulter ce module (la tuile indique « Module non accessible »). Demandez-le à l'administrateur de votre agence."
      },
      {
        q: 'Pourquoi certaines tuiles ou cartes manquent-elles ?',
        a: "Une carte n'apparaît que si le module est inclus dans le pack de votre agence (gestion locative, CRM, syndic, patrimoine) et si vous avez le droit correspondant."
      },
      {
        q: 'Je suis propriétaire, locataire ou copropriétaire : où est mon tableau de bord ?',
        a: "Ce tableau est celui des collaborateurs d'une agence. Un compte client est envoyé vers son propre portail ; un espace personnel, vers l'écran de valeur nette du patrimoine."
      }
    ],
    permissions: {
      roles: ["Collaborateur d'une agence"],
      note: 'Chaque bloc dépend de vos droits de consultation (biens, contacts, affaires, baux, échéances, paiements, tickets, copropriétés).'
    },
    related: [
      { label: "La liste « À traiter aujourd'hui »", helpId: 'communication.accueil.tableau-de-bord.a-traiter' },
      { label: 'La tuile « Encaissé »', helpId: 'communication.accueil.tableau-de-bord.encaisse' }
    ],
    keywords: [
      'accueil',
      "page d'accueil",
      'tableau de bord',
      'indicateurs',
      'chiffres',
      'statistiques',
      'graphiques',
      'synthèse',
      'impayés',
      'à faire'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'accueil-indicateurs',
          title: 'Vos chiffres clés',
          description:
            'Cliquez sur une tuile pour ouvrir la liste qui produit ce chiffre. Un tiret veut dire module inaccessible.'
        },
        {
          target: 'accueil-a-traiter',
          title: "À traiter aujourd'hui",
          description: 'Les lignes les plus graves en premier : retards, paiements à valider, tickets urgents.'
        },
        {
          target: 'accueil-graphiques',
          title: 'Les graphiques',
          description: 'Cliquez sur une tranche ou une barre pour ouvrir la liste filtrée.'
        },
        {
          target: 'accueil-activite',
          title: 'Activité récente',
          description: 'Les derniers biens ajoutés, contacts enregistrés et paiements encaissés.'
        }
      ]
    }
  },
  {
    id: 'communication.accueil.tableau-de-bord.impayes',
    kind: 'section',
    title: 'Tuile « Impayés »',
    summary: 'Le montant qui reste à payer sur les échéances de loyer en retard, avec leur nombre.',
    purpose:
      "Elle vous dit combien l'agence a à relancer. Cliquez dessus pour ouvrir la liste des échéances « En retard ».",
    howToRead: {
      notes: [
        'Le montant est le reste à payer : loyer, services, autres frais et pénalités, moins ce qui a déjà été payé.',
        'Une échéance compte comme en retard si son statut est « En retard », ou si elle est encore « Brouillon » ou « À échoir » alors que sa date est dépassée.',
        "Le montant est abrégé (« 85 k », « 1,2 M »). Elle demande la gestion locative et le droit « Voir les échéances » ; sinon un tiret s'affiche."
      ]
    },
    related: [
      { label: "La liste « À traiter aujourd'hui »", helpId: 'communication.accueil.tableau-de-bord.a-traiter' }
    ],
    keywords: ['impayés', 'retard', 'loyers impayés', 'relance', 'arriérés']
  },
  {
    id: 'communication.accueil.tableau-de-bord.a-encaisser',
    kind: 'section',
    title: 'Tuile « À encaisser sous 7 jours »',
    summary: 'Le montant qui reste à payer sur les échéances de loyer arrivant à terme dans les 7 prochains jours.',
    purpose:
      "Elle vous aide à préparer la semaine d'encaissements. Cliquez dessus pour ouvrir les échéances « À échoir ».",
    howToRead: {
      notes: [
        "Sont comptées les échéances « À échoir » ou « Partiel » dont la date tombe entre aujourd'hui et les 7 jours qui suivent.",
        'Le montant est le reste à payer (loyer, services, autres frais et pénalités, moins ce qui est déjà payé).',
        'Elle demande la gestion locative et le droit « Voir les échéances ».'
      ]
    },
    keywords: ['échéances', 'semaine', 'à venir', 'loyers à encaisser']
  },
  {
    id: 'communication.accueil.tableau-de-bord.encaisse',
    kind: 'section',
    title: 'Tuile « Encaissé » du mois',
    summary: 'Le total des paiements réussis du mois en cours, comparé au mois précédent.',
    purpose:
      "C'est le chiffre mis en avant de l'écran (un filet de couleur marque le bord de la tuile). Cliquez dessus pour ouvrir la liste des paiements.",
    howToRead: {
      notes: [
        'Sont additionnés les paiements au statut « Réussi » dont la date de réussite tombe dans le mois affiché dans le titre de la tuile.',
        "Le texte du dessous donne l'évolution en pourcentage par rapport au mois précédent (par exemple « +12 % »).",
        "Si le mois précédent n'a rien encaissé, ce pourcentage n'aurait pas de sens : la tuile affiche à la place l'objectif du mois, c'est-à-dire le total des échéances du mois (loyer, services, autres frais et pénalités, hors échéances annulées), qu'elles soient déjà payées ou non.",
        "Elle demande la gestion locative et le droit « Voir les paiements ». Sans le droit « Voir les échéances », l'objectif vaut 0."
      ]
    },
    related: [{ label: 'La trésorerie sur 12 mois', helpId: 'communication.accueil.tableau-de-bord.tresorerie' }],
    keywords: ['encaissé', 'encaissement', 'recettes', 'paiements du mois', 'chiffre du mois']
  },
  {
    id: 'communication.accueil.tableau-de-bord.biens',
    kind: 'section',
    title: 'Tuile « Biens »',
    summary: "Le nombre de biens de l'agence, avec la part occupée et le nombre de biens publiés.",
    purpose: 'Cliquez dessus pour ouvrir la liste des biens.',
    howToRead: {
      notes: [
        "Le nombre compte tous les biens de l'agence, quel que soit leur statut (brouillon et archivés compris).",
        '« Occupés » = les biens « Loué » ou « Vendu », en pourcentage du total.',
        '« Publiés » = les biens que vous avez publiés. Sans aucun bien, la tuile affiche « 0 publié ».',
        "Elle demande le droit « Voir les biens ». Sans gestion locative, c'est elle qui est mise en avant."
      ]
    },
    keywords: ['biens', 'parc', 'patrimoine', "taux d'occupation", 'publiés']
  },
  {
    id: 'communication.accueil.tableau-de-bord.contacts',
    kind: 'section',
    title: 'Tuile « Contacts »',
    summary: "Le nombre de contacts de l'agence, avec le nombre d'affaires et de baux suivis.",
    purpose: 'Cliquez dessus pour ouvrir la liste des contacts.',
    howToRead: {
      notes: [
        'Le nombre compte les prospects, les clients et les contacts archivés.',
        "Le texte du dessous (« transactions suivies ») additionne les affaires du CRM et les baux de la gestion locative que vous avez le droit de voir. Il n'apparaît que si le CRM est inclus dans votre pack.",
        'Elle demande le droit « Voir les contacts ».'
      ]
    },
    keywords: ['contacts', 'clients', 'prospects', 'transactions']
  },
  {
    id: 'communication.accueil.tableau-de-bord.tickets',
    kind: 'section',
    title: 'Tuile « Tickets ouverts »',
    summary: 'Le nombre de tickets de maintenance en cours de traitement, avec les paiements déclarés à valider.',
    purpose: 'Cliquez dessus pour ouvrir la liste des tickets.',
    howToRead: {
      notes: [
        'Sont comptés les tickets déclarés, assignés ou en cours. Les tickets résolus ou annulés ne le sont plus.',
        "Le texte du dessous indique le nombre de déclarations de paiement faites par des locataires qui attendent votre validation. S'il n'y en a pas, il affiche « Aucune urgence en attente » : ce texte ne vérifie pas les tickets urgents, regardez « À traiter aujourd'hui ».",
        'Elle demande le droit « Gérer tous les tickets et prestataires ».'
      ]
    },
    keywords: ['tickets', 'maintenance', 'pannes', 'réparations', 'déclarations']
  },
  {
    id: 'communication.accueil.tableau-de-bord.a-traiter',
    kind: 'section',
    title: "Liste « À traiter aujourd'hui »",
    summary:
      'La liste de ce qui demande une action : échéances en retard, paiements déclarés à valider, tickets urgents et alertes de stock. Les plus graves sont en haut.',
    purpose:
      'Chaque ligne est cliquable en entier et ouvre la fiche concernée. Le nombre entre parenthèses est le nombre de lignes affichées.',
    howToRead: {
      statuses: [
        { value: 'danger', label: 'Urgent', description: 'Échéance en retard, ou ticket de priorité « Urgente ».' },
        {
          value: 'warning',
          label: 'À surveiller',
          description: 'Paiement déclaré à valider, ou ticket de priorité « Haute ».'
        },
        { value: 'info', label: 'Information', description: 'Simple information, sans urgence.' }
      ],
      notes: [
        "Échéances en retard : jusqu'à 4, les plus anciennes d'abord, avec le bail, le bien, les jours de retard et le reste à payer.",
        "Paiements déclarés : jusqu'à 4 déclarations des locataires en attente, avec le moyen de paiement et le montant. Gestion locative et droit « Voir les paiements » requis.",
        "Tickets : jusqu'à 4 tickets ouverts de priorité « Urgente » ou « Haute ». Droit « Gérer tous les tickets et prestataires » requis.",
        "Alertes de stock : jusqu'à 4, si votre pack inclut les chantiers et que vous avez les droits « Alertes de stock » et de voir les valeurs de stock.",
        'Les lignes sont triées par gravité puis par ancienneté, et limitées à 8. Le lien « Tout voir » ouvre les échéances.'
      ]
    },
    consequences: ["Cliquer sur une ligne ouvre l'écran concerné : rien n'est modifié tant que vous n'y agissez pas."],
    related: [{ label: 'La tuile « Impayés »', helpId: 'communication.accueil.tableau-de-bord.impayes' }],
    keywords: ['à faire', 'tâches', 'urgences', 'relances', 'alertes', 'file de travail']
  },
  {
    id: 'communication.accueil.tableau-de-bord.tresorerie',
    kind: 'section',
    title: 'Trésorerie sur 12 mois',
    summary: 'Une courbe qui compare, mois par mois, ce qui a été encaissé et ce qui était attendu.',
    purpose:
      'Elle montre si les encaissements suivent les loyers dus. Cliquer sur la courbe ou sur « Voir les paiements » ouvre les paiements.',
    howToRead: {
      notes: [
        '« Encaissé » : les paiements « Réussi », classés par mois de réussite.',
        "« Attendu » : les échéances hors annulées, classées par mois d'échéance (loyer, services, autres frais et pénalités), payées ou non.",
        'La légende donne le total des 12 mois (le mois en cours et les 11 précédents) ; ses liens ouvrent les paiements et les échéances.',
        "« Rien à tracer » s'affiche quand les deux totaux valent 0. La carte demande la gestion locative et le droit « Voir les paiements » ; sans « Voir les échéances », « Attendu » reste à 0."
      ]
    },
    related: [{ label: 'La tuile « Encaissé »', helpId: 'communication.accueil.tableau-de-bord.encaisse' }],
    keywords: ['trésorerie', 'encaissements', 'courbe', 'loyers attendus', '12 mois']
  },
  {
    id: 'communication.accueil.tableau-de-bord.echeances',
    kind: 'section',
    title: 'Échéances par statut',
    summary: 'Des barres qui montrent, pour chaque statut, le reste à encaisser sur les échéances de loyer.',
    purpose: "Elles servent à voir où se trouve l'argent à récupérer. Le lien « Encaisser » ouvre les échéances.",
    howToRead: {
      statuses: [
        { value: 'OVERDUE', label: 'En retard', description: 'Échéances dépassées et non soldées.' },
        { value: 'PARTIAL', label: 'Partiel', description: 'Échéances payées en partie.' },
        { value: 'DUE', label: 'À échoir', description: 'Échéances à venir.' },
        {
          value: 'PAID',
          label: 'Payé',
          description: 'Échéances soldées : leur barre est vide, seul leur nombre compte.'
        }
      ],
      notes: [
        "La longueur d'une barre est le reste à encaisser en FCFA ; l'infobulle donne le nombre d'échéances puis le montant.",
        'Les échéances annulées ne sont pas comptées. Les échéances « Brouillon » ou « À échoir » à la date dépassée sont classées « En retard ».',
        'Demande la gestion locative.'
      ]
    },
    keywords: ['échéances', 'statuts', 'reste à encaisser', 'retards']
  },
  {
    id: 'communication.accueil.tableau-de-bord.moyens-paiement',
    kind: 'section',
    title: 'Moyens de paiement',
    summary: 'Un camembert qui répartit les loyers encaissés sur 12 mois selon le moyen de paiement.',
    purpose: 'Il montre comment vos locataires paient. Le lien « Voir les paiements » ouvre les paiements.',
    howToRead: {
      notes: [
        'Sont comptés les paiements « Réussi » depuis le début de la période de 12 mois, par moyen : Espèces, Virement, Chèque, Mobile Money, Prélèvement bancaire, Carte bancaire ou Autre.',
        'Le total encaissé est écrit au centre ; la légende donne le montant de chaque moyen, du plus important au plus petit.',
        'Demande la gestion locative et le droit « Voir les paiements ».'
      ]
    },
    keywords: ['moyens de paiement', 'mobile money', 'espèces', 'virement', 'répartition']
  },
  {
    id: 'communication.accueil.tableau-de-bord.parc-statut',
    kind: 'section',
    title: 'Parc par statut',
    summary: "Un camembert qui répartit les biens de l'agence selon leur statut.",
    purpose:
      'Il donne la part du parc occupé ou vendu. Une tranche ou une ligne de légende ouvre la liste des biens de ce statut.',
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: 'Fiche de bien pas encore finalisée.' },
        { value: 'UNDER_REVIEW', label: 'En révision', description: 'Bien en cours de vérification.' },
        { value: 'AVAILABLE', label: 'Disponible', description: 'Bien libre.' },
        { value: 'RESERVED', label: 'Réservé', description: 'Bien réservé.' },
        { value: 'UNDER_OFFER', label: 'Sous offre', description: 'Une offre est en cours sur ce bien.' },
        { value: 'RENTED', label: 'Loué', description: 'Bien occupé par un locataire.' },
        { value: 'SOLD', label: 'Vendu', description: 'Bien vendu.' },
        { value: 'ARCHIVED', label: 'Archivé', description: 'Bien retiré de la gestion courante.' }
      ],
      notes: [
        'Le sous-titre donne la part « Loué » plus « Vendu » dans le parc. Le nombre de biens est écrit au centre.',
        'Au plus 5 statuts sont affichés ; le reste est regroupé sous « Autres » (sans lien). Il faut le droit « Voir les biens ».'
      ]
    },
    keywords: ['parc', 'biens', 'statuts', 'occupation', 'loué', 'disponible']
  },
  {
    id: 'communication.accueil.tableau-de-bord.types-biens',
    kind: 'section',
    title: 'Types de biens',
    summary: 'Des barres qui comptent les biens par type : appartement, maison, studio, bureau…',
    purpose: 'Elles montrent la composition de votre portefeuille. Une barre ouvre la liste des biens de ce type.',
    howToRead: {
      notes: [
        'Les 6 types les plus nombreux sont affichés ; les autres sont regroupés sous « Autres » (sans lien).',
        'La longueur de la barre est le nombre de biens. Il faut le droit « Voir les biens ».'
      ]
    },
    keywords: ['types de biens', 'appartement', 'maison', 'portefeuille']
  },
  {
    id: 'communication.accueil.tableau-de-bord.entonnoir',
    kind: 'section',
    title: 'Entonnoir commercial',
    summary: 'Des barres qui comptent les affaires par étape, du premier contact à la vente gagnée.',
    purpose: "Elles montrent où s'arrêtent vos affaires. Le lien « Voir les affaires » ouvre la liste des affaires.",
    howToRead: {
      statuses: [
        { value: 'NEW', label: 'Nouveau', description: "Première étape de l'entonnoir." },
        { value: 'QUALIFIED', label: 'Qualifiée', description: 'Affaire qualifiée.' },
        { value: 'VISIT', label: 'Visite', description: 'Étape des visites.' },
        { value: 'NEGOTIATION', label: 'Négociation', description: 'Étape de négociation.' },
        { value: 'WON', label: 'Gagnée', description: 'Affaire gagnée (barre verte).' }
      ],
      notes: [
        "Les affaires « Perdue » ne sont pas dans l'entonnoir : leur nombre est donné dans le sous-titre.",
        "L'infobulle d'une barre donne le nombre d'affaires et, s'il y en a une, la somme de leur valeur espérée.",
        'Demande le CRM dans votre pack et le droit « Voir les affaires ».'
      ]
    },
    keywords: ['entonnoir', 'affaires', 'pipeline', 'ventes', 'négociation']
  },
  {
    id: 'communication.accueil.tableau-de-bord.repartition-contacts',
    kind: 'section',
    title: 'Contacts par statut',
    summary: 'Un camembert qui répartit vos contacts en prospects, clients et archivés.',
    purpose:
      "Il apparaît dès que l'agence a au moins un contact. Le lien « Voir les contacts » ouvre la liste des contacts.",
    howToRead: {
      statuses: [
        { value: 'LEAD', label: 'Prospect', description: "Contact qui n'est pas encore client." },
        { value: 'ACTIVE_CLIENT', label: 'Client', description: 'Contact converti en client.' },
        { value: 'ARCHIVED', label: 'Archivé', description: 'Contact mis de côté.' }
      ],
      notes: ['Le nombre total de contacts est écrit au centre. Il faut le droit « Voir les contacts ».']
    },
    keywords: ['contacts', 'prospects', 'clients', 'répartition']
  },
  {
    id: 'communication.accueil.tableau-de-bord.tickets-priorite',
    kind: 'section',
    title: 'Tickets ouverts par priorité',
    summary: 'Des barres qui comptent les tickets de maintenance en cours selon leur priorité.',
    purpose: 'Elles montrent ce qui presse. Le lien « Voir les tickets » ouvre la liste des tickets.',
    howToRead: {
      statuses: [
        { value: 'URGENT', label: 'Urgente', description: 'Priorité la plus haute (barre rouge).' },
        { value: 'HIGH', label: 'Haute', description: 'Priorité élevée.' },
        { value: 'MEDIUM', label: 'Moyenne', description: 'Priorité normale.' },
        { value: 'LOW', label: 'Basse', description: 'Priorité la plus basse.' }
      ],
      notes: [
        "Seuls les tickets déclarés, assignés ou en cours sont comptés. « Aucun ticket ouvert. » s'affiche s'il n'y en a pas.",
        'Il faut le droit « Gérer tous les tickets et prestataires ».'
      ]
    },
    keywords: ['tickets', 'maintenance', 'priorité', 'urgent']
  },
  {
    id: 'communication.accueil.tableau-de-bord.appels-charges',
    kind: 'section',
    title: 'Appels de charges',
    summary: 'Des barres qui montrent, par statut, le montant des appels de charges de vos copropriétés.',
    purpose:
      'Elles servent à suivre le recouvrement. Le lien « Voir les copropriétés » ouvre la liste des copropriétés.',
    howToRead: {
      statuses: [
        { value: 'PENDING', label: 'En attente', description: 'Appel émis, pas encore payé et pas encore échu.' },
        { value: 'PARTIAL', label: 'Partiel', description: 'Appel payé en partie, pas encore échu.' },
        { value: 'PAID', label: 'Payé', description: 'Appel soldé.' },
        {
          value: 'OVERDUE',
          label: 'En retard',
          description: "Appel « En attente » ou « Partiel » dont l'échéance est dépassée."
        }
      ],
      notes: [
        "La longueur d'une barre est le montant en FCFA ; l'infobulle donne le nombre d'appels puis le montant.",
        'Le sous-titre donne le taux de recouvrement : appels payés plus paiements déjà reçus sur les appels partiels, en part du total appelé. Sans appel, il donne le nombre de copropriétés et de lots.',
        'Si des copropriétaires ont déclaré un paiement par mobile money, le nombre à vérifier est écrit au-dessus des barres.',
        'La carte demande le syndic dans votre pack, le droit de consulter les copropriétés, et au moins une copropriété.'
      ]
    },
    keywords: ['appels de charges', 'syndic', 'copropriété', 'recouvrement', 'charges']
  },
  {
    id: 'communication.accueil.tableau-de-bord.travaux',
    kind: 'section',
    title: 'Programmes de travaux',
    summary: 'Des barres qui montrent, par statut, le coût estimé des programmes de travaux.',
    purpose: 'Elles servent à suivre les travaux engagés. Le lien « Voir les travaux » ouvre les programmes.',
    howToRead: {
      statuses: [
        { value: 'PLANNED', label: 'Planifié', description: 'Programme prévu, pas encore commencé.' },
        { value: 'IN_PROGRESS', label: 'En cours', description: 'Travaux en cours.' },
        { value: 'COMPLETED', label: 'Terminé', description: 'Travaux terminés.' },
        { value: 'CANCELLED', label: 'Annulé', description: 'Programme abandonné.' }
      ],
      notes: [
        "La longueur d'une barre est le coût estimé en FCFA.",
        'Le sous-titre donne la somme des programmes « Planifié » et « En cours » : ce qui reste engagé.',
        'La carte demande le patrimoine dans votre pack, le droit « Voir les biens » et au moins un programme.'
      ]
    },
    keywords: ['travaux', 'programmes', 'patrimoine', 'coût', 'rénovation']
  },
  {
    id: 'communication.accueil.tableau-de-bord.activite',
    kind: 'section',
    title: 'Activité récente',
    summary:
      "Le journal des 8 derniers événements de l'agence : biens ajoutés, contacts enregistrés, paiements encaissés.",
    purpose: "Il sert à voir d'un coup d'œil ce qui s'est passé. Chaque ligne mène à la fiche concernée.",
    howToRead: {
      notes: [
        'Les événements viennent de trois sources : les biens (droit « Voir les biens »), les contacts (droit « Voir les contacts ») et les paiements réussis (gestion locative et droit « Voir les paiements »).',
        'Les plus récents sont en haut. Le moment est écrit en durée relative ; passez la souris dessus pour voir la date exacte.',
        'Un paiement indique son montant et le numéro du bail.'
      ]
    },
    keywords: ['activité', 'journal', 'historique', 'nouveautés', 'derniers événements']
  }
];

export default entries;
