import type { HelpEntry } from '../../../types';

/** Zone « bien » du module « patrimoine » (fr) : onglet « Patrimoine » de la fiche d'un bien. */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.bien.onglet',
    kind: 'section',
    title: 'Onglet Patrimoine du bien',
    summary:
      'Cet onglet rassemble le suivi financier du bien : rendement, valorisations, dépenses, crédits, travaux et documents. Chaque rubrique a son propre onglet.',
    purpose:
      "Il sert à savoir ce que vaut le bien, ce qu'il coûte et ce qu'il rapporte. Les chiffres de la Synthèse se recalculent d'après les autres rubriques.",
    steps: [
      {
        title: 'Choisir une rubrique',
        detail:
          "Synthèse, Valorisations, Dépenses, Crédits, Travaux ou Documents. La rubrique ouverte reste dans l'adresse de la page."
      },
      { title: 'Alimenter les données', detail: 'Dans chaque rubrique, « Ajouter » ouvre un formulaire de saisie.' },
      {
        title: 'Exporter',
        detail: 'Le bouton « Exporter » propose « Synthèse PDF » ou « Classeur Excel » pour ce bien.'
      }
    ],
    consequences: [
      "Toute valorisation, dépense, crédit ou programme de travaux ajouté, modifié ou supprimé rend le rendement à recalculer : il se met à jour à l'affichage suivant de la Synthèse.",
      'Les suppressions ne se défont pas.'
    ],
    faq: [
      {
        q: "Je ne vois pas l'onglet Patrimoine.",
        a: "Il n'est proposé que si le pack de votre agence inclut le Patrimoine."
      },
      {
        q: 'Le rendement reste vide ou à « — ». Pourquoi ?',
        a: "Renseignez une valorisation, et un prix d'acquisition dans une valorisation pour le net-net et la plus-value."
      },
      {
        q: 'Où gérer les assurances ?',
        a: "Dans les onglets « Assurances et sinistres » et « Carnet d'entretien » de la fiche du bien."
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Lire demande « Voir les biens », ajouter, modifier ou supprimer demande « Modifier les biens ».'
    },
    related: [
      { label: 'Synthèse du bien', helpId: 'patrimoine.bien.synthese' },
      { label: 'Coffre-fort de documents', helpId: 'patrimoine.bien.coffre-fort' }
    ],
    keywords: ['patrimoine', 'bien', 'rendement', 'valeur', 'exporter']
  },
  {
    id: 'patrimoine.bien.synthese',
    kind: 'section',
    title: 'Synthèse et rendement du bien',
    summary:
      "La Synthèse donne le rendement actuel du bien, son rendement projeté sur plusieurs années et un graphique de projection. Elle s'appuie sur vos valorisations, dépenses, crédits et baux.",
    howToRead: {
      notes: [
        'Rendement brut : loyers annuels divisés par la dernière valeur estimée.',
        'Rendement net : loyers annuels moins les charges, divisé par la dernière valeur estimée. Les charges sont les dépenses non capitalisées payées sur les 12 derniers mois.',
        'Rendement net-net : loyers moins charges moins les mensualités des 12 prochains mois, divisé par le coût de revient.',
        "Plus-value latente : dernière valeur estimée moins coût de revient. Le coût de revient est le dernier coût d'acquisition saisi dans une valorisation, plus les dépenses capitalisées.",
        'Les loyers viennent des baux actifs du bien ; seuls les crédits au statut « Actif » comptent.',
        "Tant que le coût d'acquisition n'est pas connu, le net-net et la plus-value s'affichent « — ».",
        "Le bloc « Rendement projeté » applique les hypothèses ; les ratios bancaires s'affichent quand ils peuvent être calculés."
      ]
    },
    steps: [
      { title: 'Lire le rendement', detail: 'Blocs « Rendement » et « Rendement projeté ».' },
      {
        title: 'Régler les hypothèses',
        detail:
          'Années, croissance de la valeur, des loyers et des charges, vacance locative (en décimal : 0.05 pour 5 %).'
      },
      { title: 'Recalculer', detail: 'Cliquez sur « Recalculer » pour mettre à jour les chiffres projetés.' }
    ],
    consequences: [
      '« Recalculer » enregistre vos hypothèses pour ce bien. Si le serveur est injoignable, elles sont gardées sur votre appareil, avec un avertissement.',
      'Les hypothèses sont des projections, pas des garanties.'
    ],
    faq: [
      {
        q: 'Pourquoi les chiffres sont-ils à « — » ?',
        a: "Il manque soit une valorisation, soit un prix d'acquisition. Saisissez-les dans la rubrique « Valorisations »."
      },
      {
        q: 'Une grosse rénovation fausse-t-elle le rendement net ?',
        a: "Marquez-la « Capitalisée » : elle s'ajoute au coût de revient au lieu des charges."
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Enregistrer des hypothèses demande « Modifier les biens ».' },
    related: [{ label: 'Valorisations', helpId: 'patrimoine.bien.valorisations' }],
    keywords: ['rendement', 'rentabilité', 'brut', 'net', 'plus-value', 'projection', 'vacance']
  },
  {
    id: 'patrimoine.bien.valorisations',
    kind: 'table',
    title: 'Valorisations du bien',
    summary:
      'Chaque ligne est une estimation de la valeur du bien à une date. La plus récente sert de valeur actuelle.',
    howToRead: {
      columns: [
        { key: 'valuatedAt', label: 'Date', description: "La date de l'estimation." },
        { key: 'estimatedValue', label: 'Valeur', description: 'La valeur estimée du bien, en FCFA.' },
        { key: 'method', label: 'Méthode', description: 'Manuelle, Estimation de marché ou Expertise.' }
      ],
      notes: [
        "Le formulaire demande aussi un coût et une date d'acquisition, facultatifs, qui servent au coût de revient."
      ]
    },
    steps: [
      {
        title: 'Ajouter',
        detail: "Cliquez sur « Ajouter » : date, valeur estimée, devise, coût et date d'acquisition, méthode, notes."
      },
      { title: 'Modifier', detail: 'Bouton « Modifier » de la ligne.' },
      { title: 'Supprimer', detail: 'Bouton « Supprimer », après confirmation.' },
      { title: 'Rechercher', detail: 'Notes, méthode, plage de dates ou de valeurs.' }
    ],
    consequences: ['La suppression est définitive.', 'Toute modification rend le rendement à recalculer.'],
    faq: [
      { q: 'Comment faire apparaître la plus-value ?', a: "Saisissez le coût d'acquisition dans une valorisation." }
    ],
    related: [{ label: 'Synthèse du bien', helpId: 'patrimoine.bien.synthese' }],
    keywords: ['valorisation', 'valeur', 'estimation', 'expertise', 'acquisition']
  },
  {
    id: 'patrimoine.bien.depenses',
    kind: 'table',
    title: 'Dépenses du bien',
    summary:
      "Chaque ligne est une dépense payée pour le bien : taxe, entretien, assurance, rénovation… Un total des charges de l'année en cours est affiché sous le tableau.",
    howToRead: {
      columns: [
        { key: 'paidAt', label: 'Date', description: 'La date du paiement.' },
        { key: 'label', label: 'Libellé', description: 'La description de la dépense.' },
        {
          key: 'category',
          label: 'Catégorie',
          description:
            'Taxe foncière, Charges de copropriété, Assurance, Entretien courant, Rénovation, Honoraires de gestion, Charges communes ou Autre.'
        },
        { key: 'recurrence', label: 'Périodicité', description: 'Ponctuelle, Mensuelle, Trimestrielle ou Annuelle.' },
        { key: 'amount', label: 'Montant', description: 'Le montant payé, en FCFA.' }
      ],
      notes: ["Le total sous le tableau compte les dépenses de l'année en cours, sans les dépenses capitalisées."]
    },
    steps: [
      {
        title: 'Ajouter',
        detail:
          'Cliquez sur « Ajouter » : catégorie, libellé, montant, date de paiement, périodicité, moyen de paiement, compte de trésorerie.'
      },
      {
        title: 'Dépense périodique',
        detail:
          "Saisissez la date d'un paiement déjà fait ; elle ne peut pas être dans le futur. Les suivantes sont déduites pour le plan de trésorerie. Date de fin facultative."
      },
      {
        title: 'Capitalisée',
        detail: 'Activez-la pour une dépense qui augmente la valeur du bien (rénovation lourde).'
      },
      {
        title: 'Fournisseur',
        detail: "Si « L'agence a commandé et doit la facture » est activé, le fournisseur est obligatoire."
      }
    ],
    consequences: [
      "Une dépense capitalisée s'ajoute au coût de revient du bien, pas aux charges : elle est exclue du rendement net.",
      "Pour un bien que l'agence détient en propre, sans indivision ni propriétaire mandant, la dépense est écrite au journal comptable. Modifiée, son écriture est annulée puis réécrite ; supprimée, elle est annulée.",
      "Si l'agence doit la facture, la dépense est portée au compte fournisseurs ; sinon elle est payée sur le compte de trésorerie choisi (la caisse par défaut)."
    ],
    faq: [
      {
        q: 'Une dépense supprimée disparaît-elle de la comptabilité ?',
        a: "Son écriture est contre-passée, pas effacée : l'historique comptable reste cohérent."
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Ajouter, modifier, supprimer demande « Modifier les biens ».' },
    related: [{ label: 'Synthèse du bien', helpId: 'patrimoine.bien.synthese' }],
    keywords: ['dépense', 'charge', 'taxe foncière', 'capitalisée', 'périodicité', 'fournisseur']
  },
  {
    id: 'patrimoine.bien.credits',
    kind: 'table',
    title: 'Crédits du bien',
    summary:
      'Chaque ligne est un crédit qui finance le bien. Le tableau montre le capital restant, la mensualité et la part déjà remboursée.',
    howToRead: {
      columns: [
        { key: 'lender', label: 'Prêteur', description: 'La banque ou le prêteur.' },
        { key: 'remainingCapital', label: 'Capital restant', description: "Ce qu'il reste à rembourser, en FCFA." },
        { key: 'monthlyPayment', label: 'Mensualité', description: 'Le montant payé chaque mois.' },
        { key: 'repaid', label: 'Remboursé', description: 'La part du capital initial déjà remboursée, de 0 à 100 %.' },
        { key: 'status', label: 'Statut', description: 'Voir les statuts ci-dessous.' }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: 'Le crédit est en cours. Il compte dans le rendement net-net et les ratios bancaires.'
        },
        { value: 'CLOSED', label: 'Clôturé', description: 'Le crédit est soldé.' },
        { value: 'DEFAULTED', label: 'Défaillant', description: 'Les échéances ne sont plus payées.' }
      ]
    },
    steps: [
      {
        title: 'Ajouter',
        detail:
          "Prêteur, capital initial, capital restant, taux d'intérêt, mensualité, devise, dates de début et de fin, statut."
      },
      { title: 'Mettre à jour', detail: 'Modifiez le capital restant et le statut au fil des remboursements.' }
    ],
    consequences: [
      'La date de fin doit être après la date de début.',
      'Seuls les crédits « Actif » entrent dans les calculs de rendement ; la suppression est définitive.',
      "À l'approche de la fin d'un crédit actif, l'agence reçoit une alerte."
    ],
    faq: [{ q: 'Le capital restant se met-il à jour seul ?', a: 'Non, vous le saisissez et le modifiez vous-même.' }],
    permissions: { feature: 'PATRIMOINE', note: 'Ajouter, modifier, supprimer demande « Modifier les biens ».' },
    keywords: ['crédit', 'emprunt', 'prêt', 'banque', 'mensualité']
  },
  {
    id: 'patrimoine.bien.travaux',
    kind: 'table',
    title: 'Programmes de travaux du bien',
    summary:
      'Chaque ligne est un programme de travaux prévu ou réalisé. Une frise au-dessus du tableau montre leur calendrier.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Titre', description: 'Le nom du programme.' },
        { key: 'constructionSite', label: 'Chantier', description: 'Le chantier rattaché, ou un tiret.' },
        { key: 'plannedDate', label: 'Date prévue', description: 'La date prévue du programme.' },
        { key: 'estimatedCost', label: 'Coût estimé', description: 'Le budget prévu, en FCFA.' },
        { key: 'actualCost', label: 'Coût réel', description: 'Le coût réellement payé.' },
        { key: 'status', label: 'Statut', description: 'Voir les statuts ci-dessous.' }
      ],
      statuses: [
        { value: 'PLANNED', label: 'Planifié', description: 'Pas encore commencé.' },
        { value: 'IN_PROGRESS', label: 'En cours', description: 'Les travaux ont commencé.' },
        { value: 'COMPLETED', label: 'Terminé', description: 'Les travaux sont finis.' },
        { value: 'CANCELLED', label: 'Annulé', description: 'Le programme est abandonné.' }
      ]
    },
    steps: [
      { title: 'Ajouter', detail: 'Titre, description, coût estimé, date prévue, statut, « Capitalisé ».' },
      { title: 'Suivre', detail: 'Modifiez le statut, la date de complétion et le coût réel.' }
    ],
    consequences: [
      "Si le programme est rattaché à un chantier, son coût réel vient du chantier : le champ n'est plus modifiable ici.",
      "À l'approche de la date prévue d'un programme planifié, l'agence reçoit une alerte. La suppression est définitive."
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas modifier le coût réel ?',
        a: 'Le programme est lié à un chantier, qui fournit lui-même ce coût.'
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Ajouter, modifier, supprimer demande « Modifier les biens ».' },
    keywords: ['travaux', 'rénovation', 'chantier', 'programme']
  },
  {
    id: 'patrimoine.bien.coffre-fort',
    kind: 'table',
    title: 'Coffre-fort de documents du bien',
    summary:
      'Chaque ligne est un document du bien : titre de propriété, plan, diagnostic, assurance… Les fichiers sont protégés et se téléchargent après vérification de vos droits.',
    howToRead: {
      columns: [
        { key: 'fileName', label: 'Nom du fichier', description: 'Le nom du fichier enregistré.' },
        {
          key: 'documentType',
          label: 'Type',
          description: 'La nature du document (titre, acte notarié, plan, diagnostic, assurance, mandat…).'
        },
        {
          key: 'expirationDate',
          label: 'Expiration',
          description:
            "La date d'expiration et son état : Sans expiration, Valide, Expire dans N jours (30 au plus) ou Expiré."
        },
        { key: 'createdAt', label: 'Ajouté le', description: "La date d'ajout." }
      ]
    },
    steps: [
      { title: 'Ajouter', detail: "Cliquez sur « Ajouter » : fichier, type, date d'expiration facultative." },
      { title: 'Télécharger', detail: 'Bouton « Télécharger » de la ligne.' },
      { title: 'Supprimer', detail: 'Bouton « Supprimer », après confirmation.' }
    ],
    consequences: [
      "Les documents ne sont jamais accessibles par un simple lien : seuls les membres de l'agence autorisés les téléchargent.",
      "Un tiers n'en voit que si vous les avez cochés dans un accès partagé.",
      'La suppression efface le fichier et son enregistrement, sans retour possible.',
      "À l'approche de l'expiration (30 jours), les propriétaires du bien peuvent être prévenus par e-mail ou WhatsApp, selon leur consentement et les notifications activées."
    ],
    faq: [
      {
        q: 'Quels fichiers puis-je ajouter ?',
        a: 'PDF, Word, images JPG, PNG et TIFF (les plans peuvent aussi être au format DWG). Le contenu doit correspondre au type du fichier.'
      },
      { q: 'Je ne vois pas le bouton « Supprimer ».', a: 'Il demande le droit « Modifier les biens ».' }
    ],
    permissions: {
      note: 'Télécharger demande « Voir les biens », ajouter et supprimer demandent « Modifier les biens ».'
    },
    related: [{ label: 'Accès partagés', helpId: 'patrimoine.acces-tiers.liste' }],
    keywords: ['document', 'coffre-fort', 'titre foncier', 'fichier', 'expiration']
  }
];

export default entries;
