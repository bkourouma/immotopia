import type { HelpEntry } from '../../../types';

/** Zone « comptabilite » du module finance (fr). */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Journal
  {
    id: 'finance.journal.page',
    kind: 'page',
    title: 'Journal comptable',
    summary:
      "Le journal liste, date après date, toutes les écritures comptables de votre agence sur la période choisie. C'est ici que vous vérifiez ce qui a été enregistré et que vous exportez pour votre cabinet comptable.",
    purpose:
      "Chaque opération enregistrée par l'agence laisse une écriture : une somme inscrite au débit d'un ou plusieurs comptes et au crédit d'un ou plusieurs autres, pour le même total. Cette comptabilité est celle de l'agence (gestion locative, fournisseurs, chantiers) ; les copropriétés ont leur propre comptabilité.\n\nLes onglets Journal, Grand livre, Balance générale et Mandants lisent les mêmes écritures, du détail vers la synthèse. Cet écran est en lecture seule : on n'y modifie rien.",
    steps: [
      {
        title: 'Choisir la période',
        detail:
          'Au-dessus du tableau, saisissez deux dates ou utilisez un raccourci : « Mois en cours », « Mois précédent », « Année en cours », « Année précédente ».'
      },
      {
        title: 'Filtrer les écritures',
        detail:
          'Tapez un libellé, une référence ou une description dans « Rechercher », choisissez un « Journal », ou saisissez un numéro de compte (ou son début) dans « Compte ».'
      },
      {
        title: 'Lire une écriture',
        detail:
          'Cliquez sur « Voir les lignes » sous le libellé : vous voyez chaque compte touché, avec son débit ou son crédit.'
      },
      {
        title: 'Vérifier les totaux',
        detail:
          'Sous le tableau, « Total débit » et « Total crédit » couvrent toute la période et tous vos filtres, pas seulement la page affichée.'
      },
      {
        title: 'Actualiser si besoin',
        detail:
          'Si une opération récente manque, cliquez sur « Actualiser les écritures », puis patientez le temps de la mise à jour.'
      },
      {
        title: 'Exporter',
        detail:
          'Cliquez sur « Exporter en Excel » ou « Exporter en CSV » pour envoyer le journal à votre cabinet comptable.'
      }
    ],
    consequences: [
      'Cet écran ne modifie aucune écriture. Les écritures de la gestion locative sont mises à jour automatiquement en arrière-plan.',
      'Un export reprend toutes les écritures de la période qui correspondent à vos filtres, pas seulement la page affichée. Il attend la fin de la mise à jour des écritures avant de produire le fichier.',
      "Sans choix de votre part, la période va du 1er janvier de l'année en cours à aujourd'hui."
    ],
    faq: [
      {
        q: "Pourquoi une opération récente n'apparaît-elle pas ?",
        a: 'Les écritures de la gestion locative sont mises à jour en arrière-plan. Cliquez sur « Actualiser les écritures » et attendez la fin du message « Mise à jour des écritures en cours… ».'
      },
      {
        q: 'Que veut dire « Contre-passée » ?',
        a: "L'écriture a été annulée par une écriture inverse. Elle reste visible dans le journal pour garder la trace de ce qui s'est passé."
      },
      {
        q: 'Total débit et total crédit sont-ils toujours égaux ?',
        a: "Oui, en principe : chaque écriture porte autant au débit qu'au crédit. Si vous constatez un écart, signalez-le à l'éditeur."
      },
      {
        q: 'Je ne vois pas la page Comptabilité. Pourquoi ?',
        a: "Elle demande le droit « Voir les rapports financiers ». Demandez-le à l'administrateur de votre agence."
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      {
        label: 'Période, actualisation et exports',
        helpId: 'finance.comptabilite.periode'
      },
      { label: 'Lire une écriture', helpId: 'finance.journal.ecriture' },
      { label: 'Grand livre', helpId: 'finance.grand-livre.page' },
      { label: 'Balance générale', helpId: 'finance.balance-generale.page' }
    ],
    keywords: [
      'comptabilité',
      'écriture',
      'écritures',
      'journal',
      'pièce',
      'débit',
      'crédit',
      'export comptable',
      'cabinet comptable',
      'contre-passation'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'comptabilite-periode',
          title: 'Choisir la période',
          description:
            "Toutes les lectures comptables portent sur cette période. Par défaut : du 1er janvier à aujourd'hui."
        },
        {
          target: 'comptabilite-synchro',
          title: 'Écritures à jour',
          description:
            "L'heure de la dernière mise à jour s'affiche ici. « Actualiser les écritures » force une nouvelle mise à jour."
        },
        {
          target: 'journal-tableau',
          title: 'Les écritures',
          description: 'Une ligne par écriture. « Voir les lignes » montre les comptes débités et crédités.'
        },
        {
          target: 'comptabilite-export',
          title: 'Exporter',
          description: "Excel ou CSV, avec la période et les filtres de l'écran, pour votre cabinet comptable."
        }
      ]
    }
  },
  {
    id: 'finance.comptabilite.periode',
    kind: 'section',
    title: 'Période, actualisation et exports',
    summary:
      "Cette barre, commune aux quatre onglets de la comptabilité, fixe la période lue, indique si les écritures sont à jour et permet d'exporter.",
    purpose:
      "Les écritures de la gestion locative sont produites en arrière-plan. La barre vous montre l'heure de la dernière mise à jour et vous laisse la relancer.",
    howToRead: {
      notes: [
        "Période : deux dates, début et fin comprises. Sans choix, du 1er janvier de l'année en cours à aujourd'hui (l'exercice est l'année civile). La période est conservée dans l'adresse de la page : vous pouvez la partager.",
        'Raccourcis : « Mois en cours », « Mois précédent », « Année en cours », « Année précédente ».',
        "« Mis à jour à 14:30 » : heure de la dernière mise à jour réussie. Si elle a échoué, le message « La dernière mise à jour des écritures a échoué. » s'affiche.",
        "Bandeau « Mise à jour des écritures en cours… » : l'écran se rafraîchit seul toutes les 3 secondes jusqu'à la fin.",
        'Sous le tableau, la mention « Tous les montants sont en FCFA » vaut pour toutes les colonnes de montants.'
      ]
    },
    steps: [
      {
        title: 'Changer la période',
        detail: 'Saisissez les dates ou cliquez sur un raccourci. Le tableau repart de la première page.'
      },
      {
        title: 'Actualiser les écritures',
        detail: "Cliquez sur « Actualiser les écritures » : la mise à jour est relancée, puis l'écran se relit."
      },
      {
        title: 'Exporter',
        detail: 'Cliquez sur « Exporter en Excel » ou « Exporter en CSV ». Le fichier se télécharge.'
      }
    ],
    consequences: [
      "L'export reprend la période et les filtres de l'écran, sur toutes les pages. Un seul format se télécharge à la fois.",
      "Si le téléchargement échoue, le message « Le téléchargement a échoué. » s'affiche : relancez l'export.",
      'Actualiser les écritures ne supprime ni ne modifie rien : le calcul peut être relancé sans risque.'
    ],
    faq: [
      {
        q: "Pourquoi le chiffre d'un mois ne correspond-il pas à celui de l'année ?",
        a: 'Chaque écran lit la période choisie. Vérifiez les dates en haut avant de comparer deux états.'
      },
      {
        q: "L'export est-il long ?",
        a: 'Il attend que les écritures soient à jour avant de produire le fichier : comptez un court délai si une mise à jour est en cours.'
      },
      {
        q: 'Les écritures des copropriétés sont-elles incluses ?',
        a: "Non. Cet écran porte sur la comptabilité de l'agence ; les copropriétés ont leur propre comptabilité."
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      { label: 'Journal comptable', helpId: 'finance.journal.page' },
      { label: 'Grand livre', helpId: 'finance.grand-livre.page' }
    ],
    keywords: [
      'période',
      'exercice',
      'dates',
      'export',
      'excel',
      'csv',
      'actualiser',
      'synchronisation',
      'mise à jour',
      'cabinet comptable'
    ]
  },
  {
    id: 'finance.journal.tableau',
    kind: 'table',
    title: 'Tableau du journal',
    summary:
      'Chaque ligne est une écriture comptable, classée de la plus ancienne à la plus récente. Dépliez-la pour voir les comptes touchés.',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date',
          description: "La date de l'écriture."
        },
        {
          key: 'journal',
          label: 'Journal',
          description:
            "Le code du journal où l'écriture est classée (le nom complet se lit dans le filtre « Journal »)."
        },
        {
          key: 'reference',
          label: 'Référence',
          description: "Le numéro de la pièce qui a donné lieu à l'écriture. Il sert à retrouver le document d'origine."
        },
        {
          key: 'libelle',
          label: 'Libellé',
          description:
            "Ce que décrit l'écriture. « Voir les lignes » déplie le détail ; l'étiquette orange « Contre-passée » signale une écriture annulée par une écriture inverse."
        },
        {
          key: 'debit',
          label: 'Débit',
          description: "Total des montants inscrits au débit dans l'écriture."
        },
        {
          key: 'credit',
          label: 'Crédit',
          description: "Total des montants inscrits au crédit. Il est égal au débit : l'écriture est équilibrée."
        }
      ],
      notes: [
        'Sous le tableau, « Total débit » et « Total crédit » additionnent toute la période et tous les filtres, pas uniquement la page affichée.',
        'Sur téléphone, chaque écriture devient une carte avec les mêmes informations.'
      ]
    },
    steps: [
      {
        title: 'Rechercher une écriture',
        detail:
          'Utilisez « Rechercher » (libellé, pièce ou description), « Journal » ou « Compte ». « Effacer les critères » remet tout à zéro.'
      },
      {
        title: 'Ouvrir une écriture',
        detail: 'Cliquez sur « Voir les lignes » ; « Masquer les lignes » la referme.'
      },
      {
        title: 'Changer de page',
        detail: 'Utilisez la pagination sous le tableau (50 écritures par page par défaut, 100 au plus).'
      }
    ],
    consequences: [
      'Le tableau est en lecture seule : aucune écriture ne se modifie ni ne se supprime ici.',
      "Déplier une écriture n'a aucun effet sur les données."
    ],
    faq: [
      {
        q: "Comment retrouver toutes les écritures d'un compte ?",
        a: "Saisissez le numéro du compte, ou son début, dans « Compte ». Toutes les écritures qui touchent ce compte s'affichent."
      },
      {
        q: 'Pourquoi mon tableau est-il vide ?',
        a: 'Aucune écriture ne correspond à la période et aux filtres. Élargissez la période ou cliquez sur « Effacer les critères ».'
      },
      {
        q: "Où lire le nom complet d'un journal ?",
        a: 'Dans la liste du filtre « Journal », qui affiche le code suivi de son libellé.'
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      { label: 'Lire une écriture', helpId: 'finance.journal.ecriture' },
      {
        label: 'Période, actualisation et exports',
        helpId: 'finance.comptabilite.periode'
      }
    ],
    keywords: ['écritures', 'journal', 'référence', 'pièce', 'libellé', 'contre-passée', 'annulation']
  },
  {
    id: 'finance.journal.ecriture',
    kind: 'section',
    title: 'Lire une écriture',
    summary:
      "Le détail d'une écriture montre chaque compte touché et le sens du mouvement : débit ou crédit. Le total débit égale toujours le total crédit.",
    purpose:
      "Une écriture raconte une opération en deux temps : où l'argent ou la dette arrive (le débit) et d'où elle vient (le crédit). Le détail vous permet de contrôler qu'un loyer, un reversement ou une dépense a été classé sur les bons comptes.",
    howToRead: {
      columns: [
        {
          key: 'compte',
          label: 'Compte',
          description: "Le numéro du compte du plan comptable de l'agence."
        },
        {
          key: 'intitule',
          label: 'Intitulé',
          description: 'Le nom du compte.'
        },
        {
          key: 'libelle',
          label: 'Libellé',
          description: 'Le texte propre à cette ligne.'
        },
        {
          key: 'tiers',
          label: 'Tiers',
          description:
            'La personne concernée (propriétaire, locataire, fournisseur…) quand la ligne est rattachée à un compte de tiers ; un tiret sinon.'
        },
        {
          key: 'nature',
          label: 'Nature',
          description:
            'Pour les fonds de mandants uniquement : « Compte courant », « Dépôt de garantie » ou « À affecter ». Un tiret sinon.'
        },
        {
          key: 'debit',
          label: 'Débit',
          description: 'Montant inscrit au débit de ce compte.'
        },
        {
          key: 'credit',
          label: 'Crédit',
          description: 'Montant inscrit au crédit de ce compte.'
        }
      ],
      notes: [
        'Les lignes au débit sont listées en premier, comme dans un journal papier, puis classées par numéro de compte.',
        "Dans l'en-tête de l'écriture, la date, le journal et la référence (la pièce) situent l'opération."
      ]
    },
    steps: [
      {
        title: "Repérer l'écriture",
        detail: 'Utilisez la date, la référence ou le libellé dans le tableau.'
      },
      {
        title: 'Déplier les lignes',
        detail: 'Cliquez sur « Voir les lignes » sous le libellé.'
      },
      {
        title: "Contrôler l'équilibre",
        detail: 'Additionnez la colonne Débit et la colonne Crédit : les deux totaux sont identiques.'
      }
    ],
    consequences: [
      "Lecture seule : déplier ou replier n'enregistre rien.",
      'Une écriture « Contre-passée » a été annulée par une écriture inverse ; les deux restent visibles.'
    ],
    faq: [
      {
        q: 'Que signifient débit et crédit ?',
        a: "Ce sont les deux colonnes d'une écriture. Chaque opération est inscrite autant de fois au débit qu'au crédit."
      },
      {
        q: "Où voir tous les mouvements d'un même compte ?",
        a: "Dans l'onglet « Grand livre », en choisissant ce compte."
      },
      {
        q: 'Pourquoi la colonne Tiers affiche-t-elle un tiret ?',
        a: "La ligne n'est rattachée à aucune personne : c'est normal pour la plupart des comptes de charges ou de produits."
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      { label: 'Tableau du journal', helpId: 'finance.journal.tableau' },
      { label: 'Grand livre', helpId: 'finance.grand-livre.page' }
    ],
    keywords: ['débit', 'crédit', 'écriture', "ligne d'écriture", 'compte', 'tiers', 'pièce']
  },
  // ------------------------------------------------------------- Grand livre
  {
    id: 'finance.grand-livre.page',
    kind: 'page',
    title: 'Grand livre',
    summary:
      "Le grand livre regroupe les écritures compte par compte. Il montre, pour chaque compte, d'où il part, ce qui s'est passé et où il arrive sur la période.",
    purpose:
      "Sans compte choisi, l'écran liste les comptes mouvementés sur la période, avec leur solde d'ouverture et de clôture. En cliquant sur un compte, vous voyez ses mouvements un par un, avec un solde qui évolue ligne après ligne.\n\nLa période se règle en haut de l'écran, comme dans le journal.",
    steps: [
      {
        title: 'Régler la période',
        detail: 'Dates ou raccourcis au-dessus du tableau.'
      },
      {
        title: 'Chercher un compte',
        detail:
          'Dans le récapitulatif, tapez un numéro ou un intitulé dans « Rechercher » ; ou choisissez-le directement dans la liste « Compte ».'
      },
      {
        title: 'Ouvrir un compte',
        detail:
          'Cliquez sur son numéro, ou choisissez-le dans « Choisir un compte ». Les boutons « Compte précédent » et « Compte suivant » vous font parcourir le plan.'
      },
      {
        title: 'Affiner',
        detail: 'Dans un compte, cherchez un libellé ou une pièce, ou limitez à un « Journal ».'
      },
      {
        title: 'Exporter',
        detail:
          "« Exporter en Excel » ou « Exporter en CSV » reprend le compte affiché, ou tous les comptes si aucun n'est choisi."
      }
    ],
    consequences: [
      'Lecture seule : aucun mouvement ne se modifie ici.',
      "Le solde d'un compte reste celui du compte entier, même quand vous filtrez les lignes ; les totaux « Lignes filtrées » donnent ce que les filtres retiennent."
    ],
    faq: [
      {
        q: "Pourquoi un compte n'apparaît-il pas dans le récapitulatif ?",
        a: 'Seuls les comptes qui ont des mouvements sur la période choisie y figurent. Élargissez la période.'
      },
      {
        q: 'Que signifie un solde négatif ?',
        a: 'Le solde se calcule en débit moins crédit : un solde négatif (en rouge) est créditeur, un solde positif est débiteur.'
      },
      {
        q: 'Que veut dire « Compte introuvable » ?',
        a: "Le numéro demandé n'existe pas dans le plan comptable de l'agence. Revenez au récapitulatif avec le bouton prévu."
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      { label: 'Récapitulatif des comptes', helpId: 'finance.grand-livre.recap' },
      { label: "Mouvements d'un compte", helpId: 'finance.grand-livre.compte' },
      { label: 'Journal comptable', helpId: 'finance.journal.page' }
    ],
    keywords: ['grand livre', 'compte', 'solde', 'mouvements', 'ouverture', 'clôture', 'plan comptable']
  },
  {
    id: 'finance.grand-livre.recap',
    kind: 'table',
    title: 'Récapitulatif des comptes',
    summary:
      "Un compte par ligne : son solde d'ouverture, ses mouvements de la période et son solde de clôture. Cliquez sur un numéro pour ouvrir le compte.",
    howToRead: {
      columns: [
        {
          key: 'compte',
          label: 'Compte',
          description: 'Le numéro du compte. Un clic ouvre ses mouvements.'
        },
        {
          key: 'intitule',
          label: 'Intitulé',
          description: 'Le nom du compte.'
        },
        {
          key: 'ouverture',
          label: 'Ouverture',
          description:
            "Le solde au début de la période, c'est-à-dire tout ce qui s'est passé avant. Rouge s'il est négatif."
        },
        {
          key: 'debit',
          label: 'Débit',
          description: 'Total inscrit au débit pendant la période.'
        },
        {
          key: 'credit',
          label: 'Crédit',
          description: 'Total inscrit au crédit pendant la période.'
        },
        {
          key: 'cloture',
          label: 'Clôture',
          description: 'Le solde en fin de période : ouverture + débit − crédit.'
        }
      ],
      notes: [
        'Seuls les comptes mouvementés sur la période sont listés (50 par page).',
        'Sous le tableau, la ligne « Total » additionne débit, crédit et clôture de tous les comptes retenus.'
      ]
    },
    steps: [
      {
        title: 'Rechercher',
        detail: 'Tapez un numéro ou un intitulé de compte.'
      },
      {
        title: 'Ouvrir',
        detail: 'Cliquez sur le numéro du compte (ou sur la carte, sur téléphone).'
      }
    ],
    faq: [
      {
        q: 'Comment lire Ouverture et Clôture ?',
        a: 'Ouverture + Débit − Crédit = Clôture. Le chiffre rouge est un solde négatif, donc créditeur.'
      },
      {
        q: 'Où voir la même chose en une seule vue équilibrée ?',
        a: "Dans l'onglet « Balance générale », qui présente débit et crédit séparés pour chaque compte."
      },
      {
        q: 'Puis-je exporter ce récapitulatif ?',
        a: 'Oui : « Exporter en Excel » ou « Exporter en CSV » reprend les comptes de la période, avec votre recherche.'
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      { label: "Mouvements d'un compte", helpId: 'finance.grand-livre.compte' },
      { label: 'Balance générale', helpId: 'finance.balance-generale.page' }
    ],
    keywords: ['comptes mouvementés', "solde d'ouverture", 'solde de clôture']
  },
  {
    id: 'finance.grand-livre.compte',
    kind: 'table',
    title: "Mouvements d'un compte",
    summary:
      "Toutes les lignes d'écriture du compte choisi sur la période, dans l'ordre, avec le solde après chaque ligne.",
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: "La date de l'écriture." },
        {
          key: 'journal',
          label: 'Journal',
          description: "Le code du journal de l'écriture."
        },
        {
          key: 'piece',
          label: 'Pièce',
          description: "La référence de la pièce d'origine, pour retrouver le document."
        },
        {
          key: 'libelle',
          label: 'Libellé',
          description: 'Le texte de la ligne.'
        },
        {
          key: 'tiers',
          label: 'Tiers',
          description: "La personne rattachée à la ligne, ou un tiret s'il n'y en a pas."
        },
        {
          key: 'nature',
          label: 'Nature',
          description: 'Pour les fonds de mandants : compte courant, dépôt de garantie ou à affecter ; un tiret sinon.'
        },
        {
          key: 'debit',
          label: 'Débit',
          description: 'Montant inscrit au débit de ce compte.'
        },
        {
          key: 'credit',
          label: 'Crédit',
          description: 'Montant inscrit au crédit de ce compte.'
        },
        {
          key: 'solde',
          label: 'Solde',
          description:
            "Le solde du compte après cette ligne, calculé en débit moins crédit en partant du solde d'ouverture. Rouge s'il est négatif."
        }
      ],
      notes: [
        '100 lignes par page. Le solde affiché reste celui du compte, filtres ignorés.',
        'Sous le tableau, « Lignes filtrées » donne le total débit et crédit des lignes retenues par vos filtres.'
      ]
    },
    steps: [
      {
        title: 'Choisir le compte',
        detail: 'Cliquez sur un compte dans le récapitulatif, ou sélectionnez-le dans « Choisir un compte ».'
      },
      {
        title: 'Lire la synthèse',
        detail: "Les quatre cartes du haut donnent l'ouverture, les totaux et la clôture."
      },
      {
        title: 'Filtrer',
        detail: '« Rechercher » (libellé ou pièce) et « Journal » réduisent les lignes.'
      },
      {
        title: 'Changer de compte',
        detail: '« Compte précédent » et « Compte suivant ».'
      }
    ],
    faq: [
      {
        q: 'Pourquoi le solde ne bouge-t-il pas quand je filtre ?',
        a: "Le solde est celui du compte entier : le filtre n'en retire pas les mouvements. Seuls les totaux « Lignes filtrées » changent."
      },
      {
        q: 'Comment revenir à la liste de tous les comptes ?',
        a: 'Videz le sélecteur « Compte » avec la croix, ou, si le compte est introuvable, utilisez « Retour au récapitulatif ».'
      },
      {
        q: 'À quoi sert la colonne Pièce ?',
        a: "Elle reprend la référence de l'écriture : elle vous permet de retrouver le document d'origine et la même écriture dans le journal."
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      { label: 'Synthèse du compte', helpId: 'finance.grand-livre.synthese' },
      { label: 'Lire une écriture', helpId: 'finance.journal.ecriture' }
    ],
    keywords: ['solde progressif', 'mouvements', 'pièce', "lignes d'un compte"]
  },
  {
    id: 'finance.grand-livre.synthese',
    kind: 'section',
    title: 'Synthèse du compte',
    summary:
      "Quatre chiffres résument le compte sur la période : d'où il part, ce qui y est entré et sorti, où il arrive.",
    howToRead: {
      notes: [
        "Solde d'ouverture : le solde au premier jour de la période, tout ce qui précède inclus.",
        'Total débit et Total crédit : les mouvements de la période seulement.',
        "Solde de clôture : solde d'ouverture + total débit − total crédit. C'est le dernier solde du tableau.",
        'Un chiffre rouge est négatif : le solde est alors créditeur.'
      ]
    },
    faq: [
      {
        q: "Pourquoi le solde d'ouverture change-t-il quand je déplace la date de début ?",
        a: "Il reprend tout ce qui s'est passé avant la nouvelle date de début."
      },
      {
        q: 'Les filtres modifient-ils ces chiffres ?',
        a: 'Non. La synthèse reste celle du compte entier sur la période.'
      },
      {
        q: 'Ces chiffres sont-ils exportés ?',
        a: "Le fichier exporté reprend le compte, ses lignes et ses soldes. Vérifiez la période avant d'exporter."
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [{ label: "Mouvements d'un compte", helpId: 'finance.grand-livre.compte' }],
    keywords: ["solde d'ouverture", 'solde de clôture', 'total débit', 'total crédit']
  },
  // ----------------------------------------------------- Balance générale
  {
    id: 'finance.balance-generale.page',
    kind: 'page',
    title: 'Balance générale',
    summary:
      "La balance présente tous les comptes de l'agence d'un seul coup d'œil : solde d'ouverture, mouvements de la période et solde de clôture, chacun en débit et en crédit.",
    purpose:
      "C'est le contrôle de cohérence de la comptabilité : le total des débits doit égaler le total des crédits. Les cabinets comptables la demandent en fin de période.\n\nUn clic sur un numéro de compte ouvre son grand livre, sur la même période.",
    steps: [
      {
        title: 'Régler la période',
        detail: 'Dates ou raccourcis au-dessus du tableau.'
      },
      {
        title: 'Filtrer',
        detail: '« Rechercher » (numéro ou intitulé), « Classe » (de 1 à 9) ou « Masquer les comptes soldés ».'
      },
      {
        title: 'Vérifier les totaux',
        detail: 'La ligne « Total » sous le tableau doit montrer le même montant au débit et au crédit.'
      },
      {
        title: 'Consulter un compte',
        detail: 'Cliquez sur son numéro pour ouvrir le grand livre.'
      },
      {
        title: 'Exporter',
        detail: '« Exporter en Excel » ou « Exporter en CSV ».'
      }
    ],
    consequences: [
      'Lecture seule : rien ne se modifie ici.',
      "Si la balance n'était pas équilibrée, un bandeau rouge s'afficherait : « La balance n'est pas équilibrée : signalez-le à l'éditeur. »"
    ],
    faq: [
      {
        q: 'Que signifie la Classe ?',
        a: "C'est le premier chiffre du numéro de compte : il regroupe les comptes par grande famille du plan comptable."
      },
      {
        q: 'Que fait « Masquer les comptes soldés » ?',
        a: 'Il retire les comptes dont le solde de clôture est nul, pour ne garder que ceux qui portent un montant.'
      },
      {
        q: 'Les totaux tiennent-ils compte de mes filtres ?',
        a: 'Oui. La liste et ses totaux sont ceux de la recherche et de la classe choisies.'
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      { label: 'Tableau de la balance', helpId: 'finance.balance-generale.tableau' },
      { label: 'Grand livre', helpId: 'finance.grand-livre.page' }
    ],
    keywords: ['balance', 'balance générale', 'balance des comptes', 'équilibre', 'classe', 'comptes soldés']
  },
  {
    id: 'finance.balance-generale.tableau',
    kind: 'table',
    title: 'Tableau de la balance',
    summary:
      "Une ligne par compte, avec trois blocs : solde d'ouverture, mouvements de la période, solde de clôture. Chaque bloc a une colonne débit et une colonne crédit.",
    howToRead: {
      columns: [
        {
          key: 'compte',
          label: 'Compte',
          description: 'Le numéro du compte. Un clic ouvre son grand livre sur la même période.'
        },
        { key: 'intitule', label: 'Intitulé', description: 'Le nom du compte.' },
        {
          key: 'ouvertureDebit',
          label: "Solde d'ouverture, Débit",
          description: 'Le solde au début de la période, quand il est débiteur.'
        },
        {
          key: 'ouvertureCredit',
          label: "Solde d'ouverture, Crédit",
          description: 'Le solde au début de la période, quand il est créditeur.'
        },
        {
          key: 'mouvementsDebit',
          label: 'Mouvements de la période, Débit',
          description: 'Total inscrit au débit pendant la période.'
        },
        {
          key: 'mouvementsCredit',
          label: 'Mouvements de la période, Crédit',
          description: 'Total inscrit au crédit pendant la période.'
        },
        {
          key: 'clotureDebit',
          label: 'Solde de clôture, Débit',
          description: 'Le solde en fin de période, quand il est débiteur.'
        },
        {
          key: 'clotureCredit',
          label: 'Solde de clôture, Crédit',
          description: 'Le solde en fin de période, quand il est créditeur.'
        }
      ],
      notes: [
        "Un compte n'a qu'un seul des deux soldes d'ouverture, et un seul des deux soldes de clôture : l'autre colonne est à zéro.",
        '100 comptes par page. La ligne « Total » additionne tous les comptes de votre recherche, pas seulement la page.',
        'Sur téléphone, chaque compte devient une carte avec les trois blocs.'
      ]
    },
    steps: [
      {
        title: 'Filtrer',
        detail: '« Rechercher », « Classe », « Masquer les comptes soldés ».'
      },
      {
        title: 'Contrôler',
        detail: 'Comparez le total Débit et le total Crédit de chaque bloc : ils doivent être égaux.'
      },
      {
        title: 'Aller au détail',
        detail: 'Cliquez sur un numéro de compte.'
      }
    ],
    faq: [
      {
        q: "Pourquoi un même compte n'a-t-il qu'une colonne remplie ?",
        a: "Un solde est soit débiteur, soit créditeur : on ne le présente que dans l'une des deux colonnes."
      },
      {
        q: 'Un compte que je cherche est absent. Pourquoi ?',
        a: 'Vérifiez le filtre « Classe » et la case « Masquer les comptes soldés » : ils peuvent le retirer de la liste.'
      },
      {
        q: 'Puis-je envoyer la balance au cabinet comptable ?',
        a: 'Oui, avec « Exporter en Excel » ou « Exporter en CSV » : le fichier reprend la période et vos filtres.'
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      { label: 'Grand livre', helpId: 'finance.grand-livre.page' },
      {
        label: 'Période, actualisation et exports',
        helpId: 'finance.comptabilite.periode'
      }
    ],
    keywords: ['totaux', 'débit', 'crédit', "solde d'ouverture", 'clôture']
  },
  // ------------------------------------------------------------- Mandants
  {
    id: 'finance.mandants.page',
    kind: 'page',
    title: 'Mandants',
    summary:
      "Un mandant est un propriétaire pour qui l'agence encaisse et garde de l'argent. Cet écran montre combien l'agence détient pour chacun, et vérifie que ce total correspond bien à la comptabilité.",
    purpose:
      'Quand vous encaissez un loyer pour un propriétaire, cet argent ne vous appartient pas : vous le lui devez. Le compte de fonds des propriétaires (4731 par défaut) rassemble ces sommes.\n\nDeux vues, au choix : le « Grand livre auxiliaire des mandants » (les mouvements sur la période) et la « Balance auxiliaire des mandants » (les soldes à une date). Un solde positif est dû au mandant.',
    steps: [
      {
        title: 'Choisir la vue',
        detail: 'Boutons « Grand livre auxiliaire des mandants » ou « Balance auxiliaire des mandants ».'
      },
      {
        title: 'Chercher un mandant',
        detail: 'Tapez son nom dans « Rechercher ».'
      },
      {
        title: 'Ouvrir un mandant',
        detail:
          'Dans le grand livre auxiliaire, cliquez sur son nom pour voir ses lignes ; « Tous les mandants » ramène à la liste.'
      },
      {
        title: "Fixer une date d'arrêté",
        detail: "Dans la balance auxiliaire, choisissez la « Date d'arrêté » : par défaut, la fin de la période."
      },
      {
        title: 'Exporter',
        detail: '« Exporter en Excel » ou « Exporter en CSV ».'
      }
    ],
    consequences: [
      'Lecture seule : aucun solde ne se modifie ici.',
      "Une alerte rouge s'affiche si le total des mandants ne coïncide pas avec le solde général du compte de fonds : voir « Contrôle des mandants ».",
      "L'export reprend la vue affichée, avec la période (ou la date d'arrêté) et le mandant choisi."
    ],
    faq: [
      {
        q: 'Que veut dire « Non réparti » ?',
        a: "Ce sont des lignes du compte de fonds qui ne sont rattachées à aucun propriétaire. Elles méritent d'être regardées de près."
      },
      {
        q: "Qu'est-ce que « Compte courant », « Dépôt de garantie » et « À affecter » ?",
        a: "Le compte courant, c'est ce qui sera reversé au propriétaire. Le dépôt de garantie est détenu pour son compte. « À affecter » est un encaissement reçu, pas encore rattaché à une échéance."
      },
      {
        q: "Où voir les reversements d'un propriétaire ?",
        a: 'Cet écran ne montre que la vue comptable du compte de fonds. Choisissez un mandant pour voir ses lignes, avec leur nature.'
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      {
        label: 'Grand livre auxiliaire des mandants',
        helpId: 'finance.mandants.grand-livre'
      },
      {
        label: 'Balance auxiliaire des mandants',
        helpId: 'finance.mandants.balance'
      },
      { label: 'Contrôle des mandants', helpId: 'finance.mandants.controle' }
    ],
    keywords: [
      'mandant',
      'mandants',
      'propriétaire',
      'fonds propriétaires',
      '4731',
      'dépôt de garantie',
      'compte courant',
      'à affecter',
      'balance auxiliaire'
    ]
  },
  {
    id: 'finance.mandants.grand-livre',
    kind: 'table',
    title: 'Grand livre auxiliaire des mandants',
    summary:
      "Une ligne par propriétaire : son solde d'ouverture, les mouvements de la période et son solde de clôture. Cliquez sur un nom pour voir le détail.",
    howToRead: {
      columns: [
        {
          key: 'mandant',
          label: 'Mandant',
          description:
            'Le propriétaire. Un clic ouvre ses lignes. « Non réparti » regroupe les lignes sans propriétaire.'
        },
        {
          key: 'ouverture',
          label: "Solde d'ouverture",
          description: "Ce que l'agence détenait pour lui au début de la période. Rouge s'il est négatif."
        },
        {
          key: 'debit',
          label: 'Débit',
          description:
            'Sorties de la période : ce qui a diminué la somme due au propriétaire, par exemple un reversement.'
        },
        {
          key: 'credit',
          label: 'Crédit',
          description:
            'Entrées de la période : ce qui a augmenté la somme due au propriétaire, par exemple un loyer encaissé pour lui.'
        },
        {
          key: 'cloture',
          label: 'Solde de clôture',
          description: "Ce que l'agence détient pour lui en fin de période : ouverture + crédit − débit."
        }
      ],
      notes: [
        "Ici, le solde se lit dans le sens du mandant : positif, c'est un montant dû au propriétaire.",
        '50 mandants par page. La ligne « Total » additionne les mandants de la recherche.'
      ]
    },
    steps: [
      {
        title: 'Rechercher un mandant',
        detail: 'Tapez une partie de son nom.'
      },
      {
        title: 'Ouvrir le détail',
        detail: 'Cliquez sur son nom, ou sur la carte sur téléphone.'
      }
    ],
    faq: [
      {
        q: 'Un mandant que je cherche est absent. Pourquoi ?',
        a: 'Seuls les mandants qui ont un solde ou des mouvements apparaissent. Élargissez la période.'
      },
      {
        q: "Pourquoi ce solde n'a-t-il pas le même sens que dans le grand livre ?",
        a: "Pour les fonds de mandants, on compte crédit moins débit : l'agence doit cet argent aux propriétaires."
      },
      {
        q: "Que faire s'il y a une alerte rouge au-dessus ?",
        a: 'Lisez « Contrôle des mandants » : elle signale un écart avec le solde général du compte de fonds.'
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      { label: "Détail d'un mandant", helpId: 'finance.mandants.detail' },
      { label: 'Contrôle des mandants', helpId: 'finance.mandants.controle' }
    ],
    keywords: ['propriétaires', 'solde dû', 'reversement', 'mandant']
  },
  {
    id: 'finance.mandants.detail',
    kind: 'table',
    title: "Détail d'un mandant",
    summary:
      "Les lignes de fonds d'un propriétaire, avec le solde après chaque ligne, et, en haut, une carte d'ouverture et de clôture par nature de fonds.",
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: "La date de l'écriture." },
        {
          key: 'journal',
          label: 'Journal',
          description: "Le code du journal de l'écriture."
        },
        {
          key: 'piece',
          label: 'Pièce',
          description: "La référence de la pièce d'origine."
        },
        {
          key: 'libelle',
          label: 'Libellé',
          description: 'Le texte de la ligne.'
        },
        {
          key: 'nature',
          label: 'Nature',
          description: '« Compte courant », « Dépôt de garantie » ou « À affecter ».'
        },
        {
          key: 'debit',
          label: 'Débit',
          description: 'Ce qui diminue la somme due au propriétaire.'
        },
        {
          key: 'credit',
          label: 'Crédit',
          description: 'Ce qui augmente la somme due au propriétaire.'
        },
        {
          key: 'solde',
          label: 'Solde',
          description: 'La somme due au propriétaire après cette ligne (crédit moins débit), rouge si négative.'
        }
      ],
      notes: [
        "Les cartes du haut donnent, pour chaque nature de fonds, le solde d'ouverture et le solde de clôture.",
        'Le filtre « Nature » restreint les lignes ; 100 lignes par page.'
      ]
    },
    steps: [
      {
        title: 'Lire les cartes',
        detail: "Chaque carte porte le nom d'une nature de fonds avec son ouverture et sa clôture."
      },
      {
        title: 'Filtrer par nature',
        detail: 'Choisissez « Compte courant », « Dépôt de garantie » ou « À affecter » dans le filtre « Nature ».'
      },
      {
        title: 'Revenir à la liste',
        detail: 'Cliquez sur « Tous les mandants ».'
      }
    ],
    faq: [
      {
        q: 'Que veut dire « Mandant introuvable » ?',
        a: "Ce mandant n'existe pas ou n'appartient pas à votre agence. Revenez à la liste avec « Tous les mandants »."
      },
      {
        q: 'Où retrouver la facture ou la quittance liée à une ligne ?',
        a: "Utilisez la référence de la colonne « Pièce » pour retrouver l'écriture dans le journal."
      },
      {
        q: "Pourquoi la somme des cartes diffère-t-elle d'une ligne du tableau ?",
        a: 'Les cartes sont des soldes par nature sur la période ; le tableau détaille les lignes filtrées. Retirez le filtre pour les rapprocher.'
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      {
        label: 'Grand livre auxiliaire des mandants',
        helpId: 'finance.mandants.grand-livre'
      },
      { label: 'Lire une écriture', helpId: 'finance.journal.ecriture' }
    ],
    keywords: ['propriétaire', 'nature des fonds', 'dépôt de garantie', 'ligne']
  },
  {
    id: 'finance.mandants.balance',
    kind: 'table',
    title: 'Balance auxiliaire des mandants',
    summary:
      "Le solde de chaque propriétaire à une date d'arrêté, réparti en compte courant, dépôt de garantie et somme à affecter.",
    howToRead: {
      columns: [
        {
          key: 'mandant',
          label: 'Mandant',
          description: 'Le propriétaire. « Non réparti » regroupe les lignes sans propriétaire.'
        },
        {
          key: 'courant',
          label: 'Compte courant',
          description: 'Ce qui sera reversé au propriétaire.'
        },
        {
          key: 'depot',
          label: 'Dépôt de garantie',
          description: "Les dépôts de garantie détenus par l'agence pour son compte."
        },
        {
          key: 'affecter',
          label: 'À affecter',
          description: 'Encaissements reçus, pas encore rattachés à une échéance.'
        },
        {
          key: 'total',
          label: 'Total',
          description:
            "La somme des trois colonnes précédentes : ce que l'agence détient au total pour ce propriétaire. Rouge s'il est négatif."
        }
      ],
      notes: [
        "Tous les soldes sont arrêtés à la « Date d'arrêté » (par défaut, la fin de la période), cette date comprise.",
        'Un solde positif est dû au propriétaire. 50 mandants par page ; la ligne « Total » additionne la recherche.'
      ]
    },
    steps: [
      {
        title: "Choisir la date d'arrêté",
        detail: "Utilisez le champ « Date d'arrêté ». Tous les soldes sont recalculés à cette date."
      },
      {
        title: 'Rechercher un mandant',
        detail: 'Tapez son nom dans « Rechercher ».'
      },
      {
        title: 'Contrôler le total',
        detail: 'Si une alerte rouge apparaît au-dessus du tableau, consultez « Contrôle des mandants ».'
      },
      {
        title: 'Exporter',
        detail: '« Exporter en Excel » ou « Exporter en CSV » : le fichier est arrêté à la même date.'
      }
    ],
    faq: [
      {
        q: 'Quelle différence avec le grand livre auxiliaire ?',
        a: "La balance donne un solde à une date ; le grand livre auxiliaire détaille les mouvements d'une période."
      },
      {
        q: "Que dois-je faire d'un montant « À affecter » ?",
        a: "C'est un encaissement reçu, pas encore rattaché à une échéance. Tant qu'il n'est pas rattaché, il reste dans cette colonne."
      },
      {
        q: "Pourquoi la date d'arrêté change-t-elle quand je modifie la période ?",
        a: "Par défaut elle suit la fin de la période. Choisissez une date précise pour qu'elle ne bouge plus."
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      { label: 'Contrôle des mandants', helpId: 'finance.mandants.controle' },
      {
        label: 'Grand livre auxiliaire des mandants',
        helpId: 'finance.mandants.grand-livre'
      }
    ],
    keywords: ['solde à une date', 'arrêté', 'propriétaires', 'fonds détenus']
  },
  {
    id: 'finance.mandants.controle',
    kind: 'section',
    title: 'Contrôle des mandants',
    summary:
      "L'écran compare le total des soldes de tous les mandants au solde général du compte de fonds propriétaires. Les deux doivent être identiques.",
    purpose:
      "L'argent détenu pour les propriétaires est suivi à deux niveaux : propriétaire par propriétaire, et dans un seul compte de la comptabilité générale. Si les deux totaux diffèrent, c'est qu'une ligne est mal rattachée. Tant que tout est cohérent, l'alerte reste invisible.",
    howToRead: {
      notes: [
        'Total auxiliaire : la somme des soldes des mandants.',
        "Solde général du compte : le solde du compte de fonds propriétaires dans la comptabilité (4731 par défaut, ou le compte choisi dans les paramètres de l'agence).",
        'Écart : la différence entre les deux. Elle doit être nulle.'
      ]
    },
    steps: [
      {
        title: "Lire l'alerte",
        detail: "Relevez le total auxiliaire, le solde général du compte et l'écart affichés."
      },
      {
        title: 'Chercher « Non réparti »',
        detail: "Une ligne « Non réparti » dans la liste est le premier endroit où chercher l'origine de l'écart."
      },
      {
        title: 'Signaler',
        detail: "Si l'écart persiste, signalez-le à l'éditeur en indiquant les trois montants."
      }
    ],
    consequences: [
      "L'alerte est purement informative : elle ne bloque rien et ne corrige rien toute seule.",
      "Le contrôle porte sur le solde du compte jusqu'à la fin de la période (grand livre auxiliaire) ou jusqu'à la date d'arrêté (balance auxiliaire)."
    ],
    faq: [
      {
        q: 'Je ne vois aucune alerte. Est-ce normal ?',
        a: "Oui : l'alerte n'apparaît que s'il y a un écart. Pas d'alerte, c'est que les totaux concordent."
      },
      {
        q: "Que signifie l'écart ?",
        a: "Une partie du compte de fonds propriétaires n'est pas retrouvée dans les soldes des mandants, ou l'inverse. Le montant de l'écart donne l'ordre de grandeur à chercher."
      },
      {
        q: "Puis-je corriger l'écart depuis cet écran ?",
        a: "Non. L'écran est en lecture seule : il sert à détecter le problème."
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les rapports financiers ».'
    },
    related: [
      {
        label: 'Balance auxiliaire des mandants',
        helpId: 'finance.mandants.balance'
      },
      { label: 'Balance générale', helpId: 'finance.balance-generale.page' }
    ],
    keywords: ['écart', 'contrôle', 'alerte rouge', '4731', 'rapprochement']
  },
  // ----------------------------------------------------------------- Relevé
  {
    id: 'finance.releve.page',
    kind: 'page',
    title: 'Relevé de compte de tiers',
    summary:
      "Le relevé est l'historique d'un compte de tiers (locataire, fournisseur, salarié, tâcheron, bailleur ou associé) : chaque mouvement avec ce qui a été facturé, ce qui a été réglé et le solde après.",
    purpose:
      "On ouvre un relevé depuis une balance (clients, fournisseurs, salaires, tâcherons, baux de terrain, associations). Il se lit comme un relevé bancaire : une ligne par pièce, dans l'ordre des dates.\n\nLe titre est le nom du tiers ; au-dessus du tableau figurent le solde d'ouverture (début de la période) et le solde de clôture (fin).",
    steps: [
      {
        title: 'Choisir la période',
        detail: "Utilisez le filtre « Période ». Sans dates, le relevé montre tout l'historique jusqu'à aujourd'hui."
      },
      {
        title: 'Chercher un mouvement',
        detail: 'Tapez une partie du libellé dans « Rechercher ».'
      },
      {
        title: 'Lire le solde',
        detail: 'La colonne « Solde après » donne le solde juste après chaque ligne.'
      },
      {
        title: 'Imprimer',
        detail:
          "Cliquez sur « Imprimer » : le relevé s'ouvre en PDF dans un nouvel onglet, avec la période et la recherche choisies."
      },
      {
        title: 'Exporter',
        detail:
          'Le bouton « Exporter » propose les formats disponibles et reprend toutes les lignes de la période, pas seulement la page.'
      }
    ],
    consequences: [
      'Le relevé est en lecture seule : on ne modifie aucun mouvement ici.',
      "Les mouvements datés après aujourd'hui ne sont pas affichés.",
      'Le solde « après » ne dépend pas de votre recherche : il reste celui de la suite complète des mouvements.'
    ],
    faq: [
      {
        q: 'Comment lire le solde ?',
        a: "Solde = total facturé − total réglé depuis l'origine du compte. Un solde positif signifie qu'il reste du facturé à régler."
      },
      {
        q: "Pourquoi le vocabulaire change-t-il d'un tiers à l'autre ?",
        a: 'Un loyer pour un locataire devient une « Facture » pour un fournisseur, une « Note de salaire » pour un salarié, etc. Les chiffres se lisent de la même façon.'
      },
      {
        q: "Je ne vois pas l'écran. Pourquoi ?",
        a: "Il demande le droit « Voir les comptes de tiers ». Demandez-le à l'administrateur de votre agence."
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les comptes de tiers ».'
    },
    related: [{ label: 'Mouvements du relevé', helpId: 'finance.releve.mouvements' }],
    keywords: ['relevé', 'compte de tiers', 'historique', 'solde', 'facturé', 'réglé', 'imprimer', 'extrait de compte']
  },
  {
    id: 'finance.releve.mouvements',
    kind: 'table',
    title: 'Mouvements du relevé',
    summary:
      'Une ligne par mouvement du compte : ce qui a été facturé, ce qui a été réglé, et le solde après la ligne.',
    howToRead: {
      columns: [
        {
          key: 'date',
          label: 'Date',
          description: 'La date du mouvement.'
        },
        {
          key: 'nature',
          label: 'Nature',
          description:
            "Le type de mouvement (voir les natures ci-dessous). Ses mots s'adaptent au tiers : « Loyer », « Facture », « Note de salaire »…"
        },
        {
          key: 'libelle',
          label: 'Libellé',
          description: 'Le texte du mouvement.'
        },
        {
          key: 'facture',
          label: 'Facturé',
          description: 'Le montant qui augmente ce qui est dû. Vide si le mouvement est un règlement.'
        },
        {
          key: 'regle',
          label: 'Réglé',
          description: 'Le montant payé, qui diminue le solde.'
        },
        {
          key: 'solde',
          label: 'Solde après',
          description: 'Le solde juste après ce mouvement : total facturé − total réglé depuis le début.'
        }
      ],
      statuses: [
        {
          value: 'INSTALLMENT',
          label: 'Loyer',
          description:
            "Une échéance facturée. Elle s'appelle « Facture » pour un fournisseur, « Note de salaire » pour un salarié, « Situation d'avancement » pour un tâcheron, « Loyer de terrain » pour un bailleur, « Quote-part » pour un associé."
        },
        {
          value: 'PAYMENT',
          label: 'Règlement',
          description: 'Un paiement reçu ou effectué.'
        },
        {
          value: 'ADVANCE_RECEIVED',
          label: 'Avance reçue',
          description:
            'Un montant versé en avance, hors échéance. Pour un fournisseur, un tâcheron, un bailleur ou un associé : « Acompte versé » ; pour un salarié : « Avance versée ».'
        },
        {
          value: 'ADVANCE_APPLIED',
          label: 'Avance imputée',
          description: 'Une avance utilisée pour régler une échéance.'
        },
        {
          value: 'PENALTY',
          label: 'Pénalité',
          description: 'Une pénalité ajoutée au compte.'
        },
        {
          value: 'WAIVER',
          label: 'Remise',
          description: 'Une somme dont le tiers est dispensé.'
        },
        {
          value: 'ADJUSTMENT',
          label: 'Ajustement',
          description: 'Une correction du solde.'
        },
        {
          value: 'OPENING_BALANCE',
          label: 'Solde initial',
          description: "Le solde repris à l'ouverture du compte, avant tout autre mouvement."
        },
        {
          value: 'VOID',
          label: 'Annulation',
          description: "L'annulation d'un mouvement précédent."
        }
      ],
      notes: [
        "Sous le titre, vous lisez le solde d'ouverture et le solde de clôture de la période.",
        'Quand vous cherchez un libellé, une ligne « Lignes filtrées » donne le facturé et le réglé des lignes retenues ; « Solde après » reste celui de la suite complète.'
      ]
    },
    steps: [
      {
        title: 'Filtrer',
        detail: '« Rechercher » (libellé) et « Période ».'
      },
      {
        title: 'Parcourir',
        detail: 'Utilisez la pagination sous le tableau.'
      },
      {
        title: 'Exporter',
        detail: 'Le bouton « Exporter » relit tout le relevé de la période, par tranches, pour un fichier complet.'
      }
    ],
    faq: [
      {
        q: 'Comment corriger un montant ?',
        a: "Aucune ligne ne se modifie depuis le relevé, qui est en lecture seule. Rapprochez-vous de l'administrateur de votre agence pour faire corriger une pièce."
      },
      {
        q: "Pourquoi n'y a-t-il pas de colonnes Débit et Crédit ?",
        a: 'Le relevé parle en mots du quotidien : « Facturé » et « Réglé ». Ce sont les mêmes montants.'
      },
      {
        q: 'Pourquoi un mouvement récent manque-t-il ?',
        a: "Les mouvements datés après aujourd'hui ne sont pas affichés. Vérifiez aussi la période choisie."
      }
    ],
    permissions: {
      roles: ['Administrateur', 'Gestionnaire', 'Comptable'],
      note: 'Demande le droit « Voir les comptes de tiers ».'
    },
    related: [{ label: 'Relevé de compte de tiers', helpId: 'finance.releve.page' }],
    keywords: ['mouvements', 'facturé', 'réglé', 'solde après', 'avance', 'règlement', 'pénalité']
  }
];

export default entries;
