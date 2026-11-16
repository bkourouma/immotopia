import type { HelpEntry } from '../../../types';

/** Zone « accueil » du module « patrimoine » (fr) : vue consolidée, performance, travaux, trésorerie, espace personnel. */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.accueil',
    kind: 'page',
    title: 'Patrimoine : vue consolidée',
    summary:
      "Cet écran résume le patrimoine immobilier que votre agence détient en propre : nombre de biens, taux d'occupation, valeur, crédits, charges et loyers. En dessous, vous suivez les programmes de travaux à venir.",
    purpose:
      "Il porte sur les biens que l'agence possède elle-même, pas sur ceux qu'elle gère pour des propriétaires. Servez-vous-en pour voir l'état du portefeuille d'un coup d'œil, puis ouvrez les autres écrans du menu Patrimoine pour le détail.",
    steps: [
      {
        title: 'Lire les six indicateurs',
        detail: 'Chaque carte donne un chiffre du portefeuille. Cliquez sur son « ? » pour lire comment il est calculé.'
      },
      {
        title: 'Suivre les travaux à venir',
        detail:
          'Sous les indicateurs, la section « Programmes de travaux » liste les programmes planifiés ou en cours. Utilisez la pagination en bas pour voir les suivants.'
      },
      {
        title: 'Exporter',
        detail:
          'Bouton « Exporter » : « Synthèse PDF » ou « Classeur Excel ». Le fichier est téléchargé sur votre appareil.'
      },
      {
        title: 'Aller plus loin',
        detail: 'Le bouton « Voir les biens » ouvre la liste des biens de votre agence.'
      }
    ],
    consequences: [
      "Cet écran sert à consulter : l'ouvrir ou l'exporter ne modifie aucune donnée.",
      'Les chiffres se recalculent à chaque ouverture, à partir des biens, valorisations, emprunts, dépenses et baux enregistrés.'
    ],
    faq: [
      {
        q: 'Pourquoi un de mes biens ne compte-t-il pas ?',
        a: "Seuls les biens détenus par l'agence comptent. Pour le nombre de biens et le taux d'occupation, les biens en brouillon, vendus ou archivés sont aussi écartés."
      },
      {
        q: 'Pourquoi un bien occupé fait-il baisser le taux ?',
        a: "Il ne le fait pas : un bien est « occupé » s'il a au moins un bail en cours. Le taux baisse quand des biens retenus n'ont aucun bail en cours."
      },
      {
        q: 'Où voir les travaux terminés ou annulés ?',
        a: "Cette section n'affiche que les programmes planifiés ou en cours. L'écran « Travaux » du menu Patrimoine liste tous les programmes."
      },
      {
        q: "Pourquoi n'ai-je pas cet écran ?",
        a: "Il fait partie du pack Patrimoine et demande le droit « Voir les biens ». Demandez-les à l'administrateur de votre agence."
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Consulter demande le droit « Voir les biens ».'
    },
    related: [
      { label: 'Comment lire les indicateurs', helpId: 'patrimoine.accueil.indicateurs' },
      { label: 'Programmes de travaux à venir', helpId: 'patrimoine.accueil.travaux' },
      { label: 'Performance des biens', helpId: 'patrimoine.performance' },
      { label: 'Trésorerie prévisionnelle', helpId: 'patrimoine.tresorerie' }
    ],
    keywords: [
      'patrimoine',
      'portefeuille',
      'vue consolidée',
      'taux occupation',
      'valeur estimée',
      'crédits',
      'loyers annuels',
      'tableau de bord',
      'export'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'patrimoine-indicateurs',
          title: 'Les indicateurs du patrimoine',
          description:
            'Ces six cartes résument les biens que votre agence détient. Le « ? » de chaque carte explique le calcul.'
        },
        {
          target: 'patrimoine-travaux',
          title: 'Les travaux à venir',
          description:
            'Cette section liste les programmes de travaux planifiés ou en cours, du plus proche au plus lointain, avec le bien, la date prévue et le coût estimé.'
        },
        {
          target: 'patrimoine-export',
          title: 'Exporter le patrimoine',
          description: "Téléchargez une synthèse PDF ou un classeur Excel du patrimoine de l'agence."
        }
      ]
    }
  },
  {
    id: 'patrimoine.accueil.indicateurs',
    kind: 'section',
    title: 'Indicateurs du patrimoine',
    summary:
      "Six chiffres résument les biens que votre agence détient : nombre de biens, taux d'occupation, valeur estimée, encours de crédits, charges de l'année et loyers annuels.",
    howToRead: {
      notes: [
        "Biens au portefeuille : nombre de biens de l'agence hors brouillons, vendus et archivés. Sous le chiffre, « dont X occupés » compte les biens qui ont au moins un bail en cours.",
        "Taux d'occupation : biens occupés divisés par biens au portefeuille. Il est mis en valeur à partir de 90 % et signalé en alerte sous 80 %.",
        'Valeur estimée totale : somme de la dernière valorisation enregistrée pour chaque bien. Un bien sans valorisation ne compte pour rien.',
        'Encours de crédits : capital restant dû des emprunts en cours rattachés à un bien (les emprunts terminés ne comptent pas).',
        "Charges de l'année : dépenses des biens payées pendant l'année civile en cours. Les dépenses ajoutées au coût de revient d'un bien (« capitalisées », par exemple une grosse rénovation) n'y figurent pas.",
        'Loyers annuels : loyers des baux en cours ramenés sur 12 mois, selon la périodicité de chaque bail (un loyer trimestriel est multiplié par 4).'
      ]
    },
    faq: [
      {
        q: 'Les montants sont-ils en FCFA ?',
        a: "Ils s'affichent avec la devise enregistrée dans les données."
      },
      {
        q: "Pourquoi les loyers annuels ne correspondent-ils pas à ce que j'ai encaissé ?",
        a: 'Ce sont les loyers prévus par les baux en cours, sur 12 mois, pas les paiements reçus. Les encaissements se suivent dans la gestion locative.'
      },
      {
        q: 'Pourquoi un chiffre semble-t-il trop bas ?',
        a: "Vérifiez que vos biens sont bien déclarés comme détenus par l'agence, qu'ils ont une valorisation et que leurs baux sont en cours."
      }
    ],
    related: [{ label: 'Vue consolidée du patrimoine', helpId: 'patrimoine.accueil' }],
    keywords: ['indicateurs', 'taux occupation', 'valeur', 'encours', 'crédit', 'charges', 'loyers']
  },
  {
    id: 'patrimoine.accueil.travaux',
    kind: 'section',
    title: 'Programmes de travaux à venir',
    summary:
      'Cette frise liste les programmes de travaux planifiés ou en cours de votre agence, classés par date prévue. Chaque programme montre son titre, son bien, sa date, son coût estimé et son statut.',
    howToRead: {
      statuses: [
        {
          value: 'PLANNED',
          label: 'Planifié',
          description: "Les travaux sont prévus à la date indiquée mais n'ont pas encore démarré."
        },
        {
          value: 'IN_PROGRESS',
          label: 'En cours',
          description: 'Les travaux ont démarré.'
        }
      ],
      notes: [
        'Sous le titre, la ligne « date - montant » donne la date prévue et le coût estimé du programme.',
        'La liste est découpée en pages : utilisez la pagination sous la frise pour voir les programmes suivants.'
      ]
    },
    steps: [
      {
        title: 'Voir tous les programmes',
        detail: "Ouvrez l'écran « Travaux » du menu Patrimoine, avec recherche, filtres et export."
      },
      {
        title: 'Créer ou modifier un programme',
        detail:
          "Ouvrez la fiche d'un bien, onglet « Patrimoine », rubrique « Travaux », puis « Ajouter » ou « Modifier »."
      }
    ],
    consequences: ['Cette section est en lecture seule : aucun programme ne se modifie depuis cet écran.'],
    faq: [
      {
        q: 'Pourquoi un programme terminé a-t-il disparu ?',
        a: "Seuls les programmes planifiés ou en cours sont affichés ici. Les programmes terminés ou annulés se retrouvent dans l'écran « Travaux »."
      },
      {
        q: 'Que fait un programme dans la trésorerie ?',
        a: "Un programme planifié ou en cours est compté comme une sortie d'argent dans la trésorerie prévisionnelle."
      }
    ],
    related: [
      { label: 'Tous les programmes de travaux', helpId: 'patrimoine.travaux' },
      { label: 'Trésorerie prévisionnelle', helpId: 'patrimoine.tresorerie' }
    ],
    keywords: ['travaux', 'chantier', 'rénovation', 'frise', 'planning']
  },
  {
    id: 'patrimoine.performance',
    kind: 'page',
    title: 'Performance du patrimoine',
    summary:
      'Choisissez un bien pour voir son rendement brut, net et net-net, sa plus-value latente, ses ratios bancaires et sa projection sur plusieurs années. Les hypothèses de projection sont modifiables.',
    purpose:
      'Cet écran aide à juger si un bien rapporte assez : comparer son rendement à ses charges et à ses emprunts, et préparer un dossier de financement avec les ratios bancaires. Le calcul se fait bien par bien.',
    steps: [
      {
        title: 'Choisir un bien',
        detail: "Utilisez le champ « Sélectionnez un bien » ; tant qu'aucun bien n'est choisi, rien ne s'affiche."
      },
      {
        title: 'Lire le rendement',
        detail:
          'Les cartes « Rendement » et « Rendement projeté » donnent les pourcentages actuels et à la fin de la période.'
      },
      {
        title: 'Lire les ratios bancaires',
        detail:
          "La carte « Ratios bancaires » donne la couverture de la dette, l'endettement, le cash-on-cash et le TRI."
      },
      {
        title: 'Ajuster les hypothèses',
        detail: 'Dans « Hypothèses de projection », changez les valeurs puis cliquez sur « Recalculer ».'
      },
      {
        title: 'Suivre la courbe',
        detail:
          'Le graphique « Projection de rendement » montre année par année la valeur, les loyers, les charges et le résultat.'
      }
    ],
    consequences: [
      "En cliquant sur « Recalculer », les hypothèses sont enregistrées pour ce bien et partagées avec les collaborateurs de l'agence et vos autres appareils.",
      'Si le serveur est injoignable, un message indique que les hypothèses sont seulement conservées sur votre appareil, en attendant la connexion.',
      "Rien d'autre n'est modifié : les chiffres du bien (valeur, loyers, emprunts) ne changent pas."
    ],
    faq: [
      {
        q: 'Pourquoi le net-net et la plus-value latente affichent-ils « — » ?',
        a: "Le prix d'acquisition du bien n'est pas connu. Renseignez-le dans une valorisation du bien (onglet « Patrimoine » de sa fiche) pour obtenir ces deux chiffres."
      },
      {
        q: 'Comment saisir les taux dans les hypothèses ?',
        a: 'Sous forme décimale : 0,03 veut dire 3 %. Le champ « Années » va de 1 à 30.'
      },
      {
        q: 'Que veut dire un ratio affiché « — » ?',
        a: 'Il ne peut pas être calculé. La raison est écrite dessous, par exemple « Aucun emprunt actif sur ce bien » ou « Aucune valorisation renseignée ».'
      },
      {
        q: 'Quelle est la différence entre brut et net ?',
        a: 'Le rendement brut ne tient compte que des loyers ; le net déduit aussi les charges payées sur les 12 derniers mois.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Consulter demande le droit « Voir les biens ».'
    },
    related: [
      { label: 'Rendement', helpId: 'patrimoine.performance.rendement' },
      { label: 'Ratios bancaires', helpId: 'patrimoine.performance.ratios' },
      { label: 'Hypothèses de projection', helpId: 'patrimoine.performance.hypotheses' }
    ],
    keywords: [
      'rendement',
      'rentabilité',
      'brut',
      'net',
      'plus-value',
      'dscr',
      'ltv',
      'tri',
      'projection',
      'hypothèses'
    ]
  },
  {
    id: 'patrimoine.performance.rendement',
    kind: 'section',
    title: 'Rendement du bien',
    summary:
      "Quatre chiffres mesurent ce que le bien rapporte aujourd'hui : rendement brut, net, net-net et plus-value latente.",
    howToRead: {
      notes: [
        'Brut : loyers annuels des baux en cours divisés par la valeur estimée actuelle du bien.',
        'Net : loyers annuels moins les charges des 12 derniers mois, divisés par la valeur estimée. Les charges ajoutées au coût de revient ne sont pas déduites.',
        "Net-Net : loyers annuels moins charges moins les mensualités d'emprunt des 12 prochains mois, divisés par le coût de revient du bien.",
        "Plus-value latente : valeur estimée moins coût de revient. Elle n'est « latente » que tant que le bien n'est pas vendu.",
        "Le coût de revient est le coût d'acquisition plus les dépenses ajoutées au coût du bien. S'il n'est pas connu, le net-net et la plus-value affichent « — »."
      ]
    },
    faq: [
      {
        q: 'Pourquoi le brut est-il à 0 ?',
        a: "Le bien n'a aucun bail en cours ou aucune valorisation : le calcul ne peut pas donner un rendement."
      },
      {
        q: 'Les pourcentages sont-ils des taux annuels ?',
        a: "Oui : ils comparent les loyers et charges d'une année à la valeur ou au coût du bien."
      }
    ],
    related: [{ label: 'Rendement projeté', helpId: 'patrimoine.performance.projete' }],
    keywords: ['brut', 'net', 'net-net', 'plus-value latente', 'coût de revient', 'prix acquisition']
  },
  {
    id: 'patrimoine.performance.projete',
    kind: 'section',
    title: 'Rendement projeté',
    summary:
      "Les mêmes quatre chiffres, estimés à la dernière année de la projection. Le titre rappelle le nombre d'années choisi.",
    howToRead: {
      notes: [
        'Brut projeté, Net projeté, Net-Net projeté et Plus-value latente projetée suivent les mêmes définitions que le rendement actuel.',
        'La projection applique vos hypothèses : croissance de la valeur, des loyers et des charges, et taux de vacance locative.',
        "Les mensualités de chaque emprunt cessent d'être déduites après sa dernière échéance."
      ]
    },
    faq: [
      {
        q: 'Ces chiffres sont-ils garantis ?',
        a: 'Non : ce sont des estimations qui dépendent de vos hypothèses. Modifiez-les dans la carte « Hypothèses de projection ».'
      },
      {
        q: 'Pourquoi « — » ?',
        a: "Sans prix d'acquisition connu, le net-net et la plus-value ne se calculent pas."
      }
    ],
    related: [{ label: 'Hypothèses de projection', helpId: 'patrimoine.performance.hypotheses' }],
    keywords: ['projection', 'horizon', 'rendement projeté', 'dans 10 ans']
  },
  {
    id: 'patrimoine.performance.ratios',
    kind: 'section',
    title: 'Ratios bancaires',
    summary:
      "Quatre ratios utilisés par les banques pour juger un bien financé : couverture de la dette (DSCR), endettement (LTV), cash-on-cash et TRI. Le survol de l'icône « i » à côté de chaque nom donne sa définition.",
    howToRead: {
      notes: [
        "DSCR : (loyers annuels effectifs, vacance déduite, moins charges d'exploitation) divisés par les mensualités d'emprunt des 12 prochains mois. Au-dessus de 1, les loyers couvrent la dette.",
        'LTV : capital restant dû divisé par la valeur estimée du bien.',
        'Cash-on-cash : cash-flow net annuel après mensualités, divisé par les fonds propres investis (coût de revient moins capital emprunté).',
        'TRI (taux de rentabilité interne) : rendement du bien sur toute la période projetée, avant financement, en comptant la valeur projetée du bien comme prix de revente à la fin.',
        "Un ratio qui ne peut pas être calculé affiche « — » avec sa raison : aucune mensualité à venir, aucun emprunt actif, aucune valorisation, prix d'acquisition à renseigner, bien financé à 100 %, ou calcul impossible avec ces hypothèses."
      ]
    },
    faq: [
      {
        q: 'Pourquoi le DSCR est-il « — » ?',
        a: "Sans emprunt actif sur le bien, ou sans mensualité dans les 12 prochains mois, il n'y a pas de dette à couvrir."
      },
      {
        q: 'Les hypothèses changent-elles les ratios ?',
        a: 'Oui, la vacance locative et la projection entrent dans le calcul. Modifiez-les puis cliquez sur « Recalculer ».'
      }
    ],
    related: [{ label: 'Hypothèses de projection', helpId: 'patrimoine.performance.hypotheses' }],
    keywords: ['dscr', 'ltv', 'cash-on-cash', 'tri', 'banque', 'financement', 'endettement']
  },
  {
    id: 'patrimoine.performance.hypotheses',
    kind: 'section',
    title: 'Hypothèses de projection',
    summary:
      'Ces cinq réglages pilotent la projection et les ratios : durée, croissance de la valeur, des loyers et des charges, et vacance locative. Cliquez sur « Recalculer » pour les appliquer.',
    howToRead: {
      notes: [
        'Années : durée de la projection, de 1 à 30.',
        'Croissance valeur, loyers, charges : évolution annuelle prévue, en décimal (0,03 = 3 %), de -0,5 à 1.',
        "Vacance locative : part de l'année où le bien ne rapporte pas de loyer, en décimal de 0 à 1 (0,05 = 5 %).",
        "Valeurs de départ : 10 ans, valeur +3 %, loyers +2 %, charges +2,5 %, vacance 5 %, tant que rien n'est enregistré pour le bien."
      ]
    },
    steps: [
      { title: 'Modifier une valeur', detail: 'Tapez la nouvelle valeur dans le champ voulu.' },
      {
        title: 'Appliquer',
        detail: 'Cliquez sur « Recalculer » : le rendement projeté, les ratios et la courbe sont mis à jour.'
      }
    ],
    consequences: [
      "Les hypothèses sont enregistrées par bien, partagées entre vos appareils et avec les collaborateurs de l'agence. Un bandeau le confirme.",
      "Un bandeau orange signale que le serveur n'a pas été joint : les hypothèses restent alors sur cet appareil seulement."
    ],
    faq: [
      {
        q: 'Mes hypothèses valent-elles pour tous les biens ?',
        a: 'Non, elles sont enregistrées bien par bien. Un autre bien repart de ses propres hypothèses, ou des valeurs de départ.'
      },
      {
        q: 'Mes valeurs sont-elles limitées ?',
        a: 'Oui : années de 1 à 30, croissances de -0,5 à 1, vacance de 0 à 1. Une valeur hors limites est refusée.'
      }
    ],
    related: [{ label: 'Ratios bancaires', helpId: 'patrimoine.performance.ratios' }],
    keywords: ['hypothèses', 'croissance', 'vacance', 'recalculer', 'années']
  },
  {
    id: 'patrimoine.performance.projection',
    kind: 'section',
    title: 'Courbe de projection',
    summary:
      'Ce graphique montre, année après année, quatre courbes : valeur estimée, loyers cumulés, charges cumulées et résultat net.',
    howToRead: {
      notes: [
        'Valeur estimée : valeur du bien qui évolue avec la croissance choisie.',
        'Loyers cumulés : total des loyers reçus depuis le début de la projection, vacance déduite.',
        'Charges cumulées : total des charges depuis le début.',
        "Résultat net : loyers moins charges moins mensualités d'emprunt, cumulés.",
        'Passez la souris sur la courbe pour lire les montants de chaque année.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi le graphique est-il vide ?',
        a: "Aucun bien n'est choisi, ou le calcul est en cours."
      },
      {
        q: 'Peut-on changer la durée ?',
        a: 'Oui, avec le champ « Années » des hypothèses de projection.'
      }
    ],
    related: [{ label: 'Hypothèses de projection', helpId: 'patrimoine.performance.hypotheses' }],
    keywords: ['graphique', 'courbe', 'projection']
  },
  {
    id: 'patrimoine.travaux',
    kind: 'page',
    title: 'Programmes de travaux',
    summary:
      "Retrouvez ici tous les programmes de travaux des biens de votre agence : bien concerné, programme, date prévue et statut. La liste se filtre et s'exporte.",
    purpose:
      "Un programme de travaux est un ensemble de travaux planifiés sur un bien (rénovation, mise aux normes, entretien lourd). Cet écran donne la vue d'ensemble pour planifier et suivre les chantiers.",
    steps: [
      { title: 'Rechercher', detail: 'Tapez un programme, un bien ou une référence dans le champ de recherche.' },
      {
        title: 'Filtrer',
        detail: 'Utilisez les filtres Statut et Bien, ou ajoutez Date prévue et Coût estimé (en FCFA).'
      },
      {
        title: 'Exporter',
        detail:
          "Le bouton d'export télécharge tous les programmes qui correspondent à vos critères, pas seulement la page affichée."
      },
      {
        title: 'Créer ou modifier un programme',
        detail:
          'Depuis la fiche du bien : onglet « Patrimoine », rubrique « Travaux », puis « Ajouter » ou « Modifier ».'
      }
    ],
    consequences: [
      "Cet écran est en lecture seule : on n'y crée ni n'y modifie de programme.",
      "Un programme planifié ou en cours entre dans la trésorerie prévisionnelle comme une sortie d'argent."
    ],
    faq: [
      {
        q: 'Où ajouter un nouveau programme ?',
        a: "Sur la fiche du bien concerné, dans l'onglet « Patrimoine », rubrique « Travaux »."
      },
      {
        q: 'Le coût estimé est-il dans le tableau ?',
        a: 'Non, il sert de filtre (de/à, en FCFA). Vous le voyez dans la rubrique « Travaux » de la fiche du bien.'
      },
      {
        q: "La liste est vide alors que j'ai des travaux.",
        a: 'Un filtre est peut-être actif : effacez les critères. Sinon, vérifiez que les programmes sont bien enregistrés sur les biens de votre agence.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Consulter demande le droit « Voir les biens ».'
    },
    related: [
      { label: 'Comment lire le tableau des programmes', helpId: 'patrimoine.travaux.tableau' },
      { label: 'Trésorerie prévisionnelle', helpId: 'patrimoine.tresorerie' }
    ],
    keywords: ['travaux', 'chantier', 'rénovation', 'programme de travaux', 'maintenance', 'entretien']
  },
  {
    id: 'patrimoine.travaux.tableau',
    kind: 'table',
    title: 'Tableau des programmes de travaux',
    summary: 'Chaque ligne est un programme de travaux : le bien concerné, le programme, la date prévue et le statut.',
    howToRead: {
      columns: [
        {
          key: 'bien',
          label: 'Bien',
          description: 'Le titre du bien, avec en dessous sa référence interne.'
        },
        {
          key: 'titre',
          label: 'Programme',
          description: 'Le nom du programme de travaux.'
        },
        {
          key: 'date',
          label: 'Prévu le',
          description: "La date prévue pour les travaux. Un tiret (—) signifie qu'aucune date n'est lisible."
        },
        {
          key: 'statut',
          label: 'Statut',
          description: "L'état d'avancement du programme (voir ci-dessous)."
        }
      ],
      statuses: [
        { value: 'PLANNED', label: 'Planifié', description: "Les travaux sont prévus mais n'ont pas démarré." },
        { value: 'IN_PROGRESS', label: 'En cours', description: 'Les travaux ont démarré.' },
        { value: 'COMPLETED', label: 'Terminé', description: 'Les travaux sont achevés.' },
        { value: 'CANCELLED', label: 'Annulé', description: 'Le programme est abandonné.' }
      ],
      notes: [
        'Sur téléphone ou petit écran, le tableau devient une liste de cartes avec les mêmes informations.',
        "L'export contient tous les programmes qui correspondent à vos critères, pas seulement la page affichée."
      ]
    },
    steps: [
      { title: 'Voir les travaux en cours', detail: 'Choisissez le filtre Statut puis « En cours ».' },
      { title: "Voir les travaux d'un bien", detail: 'Choisissez le filtre Bien.' }
    ],
    consequences: [
      'Changer de filtre ou de recherche ne modifie aucun programme : cela change seulement la liste affichée et exportée.'
    ],
    faq: [
      {
        q: 'Peut-on trier par date ?',
        a: "Le tableau n'offre pas de tri par colonne : utilisez les filtres, en particulier « Date prévue »."
      },
      {
        q: 'Pourquoi « Bien inconnu » sur une carte ?',
        a: "Le programme n'est relié à aucun titre de bien lisible."
      }
    ],
    related: [{ label: "Vue d'ensemble des programmes de travaux", helpId: 'patrimoine.travaux' }],
    keywords: ['colonnes', 'statuts', 'tableau', 'export', 'planifié', 'en cours', 'terminé', 'annulé']
  },
  {
    id: 'patrimoine.tresorerie',
    kind: 'page',
    title: 'Trésorerie prévisionnelle',
    summary:
      "Ce plan estime, mois par mois, l'argent qui doit entrer et sortir pour les biens que votre agence détient, sur 12 ou 24 mois. Il signale les mois où le cumul risque de passer sous zéro.",
    purpose:
      "Il s'appuie sur les loyers à encaisser, les mensualités d'emprunt, les travaux planifiés, les dépenses périodiques et la taxe foncière estimée. C'est une estimation indicative, sans garantie de réalisation.",
    steps: [
      { title: "Choisir l'horizon", detail: '« 12 mois » ou « 24 mois ».' },
      {
        title: 'Indiquer le solde de départ',
        detail:
          'Saisissez votre trésorerie actuelle dans « Solde de départ (XOF) » (en FCFA), puis quittez le champ ou appuyez sur Entrée. Sans solde, le cumul part de zéro.'
      },
      { title: 'Limiter à un bien', detail: 'Le filtre « Bien » est sur « Tous les biens » par défaut.' },
      {
        title: 'Lire le message de tête',
        detail:
          'Il indique soit « Aucun creux de trésorerie prévu », soit le premier mois où le cumul passe sous zéro, le point le plus bas et le déficit.'
      },
      {
        title: 'Détailler un mois',
        detail: "Dans le tableau, cliquez sur le signe de dépliage d'une ligne pour voir ses flux."
      },
      {
        title: 'Compléter les sources',
        detail:
          'En bas, la carte « Sources du plan » dit ce qui manque ; vous y enregistrez la date de la taxe foncière.'
      }
    ],
    consequences: [
      "Le plan se calcule à l'ouverture : consulter, changer l'horizon ou le bien ne modifie aucune donnée.",
      "Le solde de départ n'est pas enregistré : il est à ressaisir après un rechargement de la page.",
      "Seule la date d'exigibilité de la taxe foncière est enregistrée, pour toute l'agence.",
      'Les montants en devise étrangère sont écartés du plan (un avertissement le dit) : ils ne sont ni convertis ni additionnés.',
      'Les biens en brouillon, vendus, archivés ou proposés uniquement à la vente sont exclus du plan.'
    ],
    faq: [
      {
        q: 'Que veut dire « Calculé sans solde de départ » ?',
        a: "Vous n'avez pas saisi de solde : le cumul commence à zéro et ne montre que l'évolution depuis aujourd'hui."
      },
      {
        q: "Qu'est-ce qu'un creux de trésorerie ?",
        a: 'Un mois où le cumul devient négatif : les sorties dépassent ce dont vous disposez. Le message donne le mois, le point le plus bas et le déficit.'
      },
      {
        q: 'Que sont les « Loyers en retard » ?',
        a: 'Des loyers dont la période est déjà passée et qui ne sont pas soldés. Ils sont comptés dans le premier mois du plan.'
      },
      {
        q: 'Pourquoi la taxe foncière est-elle absente ?',
        a: "La date d'exigibilité n'est pas renseignée, le montant n'est pas estimable pour certains biens, ou la prochaine échéance est hors période : passez à 24 mois."
      },
      {
        q: 'Pourquoi un bien manque-t-il ?',
        a: 'Il est exclu du plan (brouillon, vendu, archivé ou en vente seulement). La carte « Sources du plan » liste les biens exclus.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Consulter demande le droit « Voir les biens » ; enregistrer la date de la taxe foncière demande « Modifier les biens ».'
    },
    related: [
      { label: 'Tableau mensuel', helpId: 'patrimoine.tresorerie.tableau' },
      { label: 'Sources du plan', helpId: 'patrimoine.tresorerie.sources' },
      { label: 'Programmes de travaux', helpId: 'patrimoine.travaux' }
    ],
    keywords: [
      'trésorerie',
      'plan de trésorerie',
      'cash',
      'prévisionnel',
      'solde',
      'entrées',
      'sorties',
      'creux',
      'cumul'
    ]
  },
  {
    id: 'patrimoine.tresorerie.graphique',
    kind: 'section',
    title: 'Graphique entrées, sorties et cumul',
    summary:
      'Les barres montrent les entrées et les sorties de chaque mois ; la courbe montre le cumul de trésorerie. Les mêmes valeurs sont dans le tableau mensuel.',
    howToRead: {
      notes: [
        'Barres vertes : entrées du mois (loyers et loyers en retard).',
        'Barres orange : sorties du mois (emprunts, travaux, charges récurrentes, taxe foncière).',
        'Courbe bleue : le cumul, soit le solde de départ plus les résultats de chaque mois.',
        "Une ligne grise marque le zéro : quand la courbe passe dessous, c'est un creux de trésorerie.",
        'Passez la souris sur un mois pour lire les montants.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi la courbe commence-t-elle à zéro ?',
        a: "Sans solde de départ saisi, le cumul part de zéro. Saisissez votre solde actuel en haut de l'écran."
      },
      {
        q: 'Où est le détail des montants ?',
        a: 'Dans le tableau mensuel juste en dessous, où chaque ligne se déplie sur ses flux.'
      }
    ],
    related: [{ label: 'Tableau mensuel', helpId: 'patrimoine.tresorerie.tableau' }],
    keywords: ['graphique', 'barres', 'courbe', 'cumul', 'entrées', 'sorties']
  },
  {
    id: 'patrimoine.tresorerie.tableau',
    kind: 'table',
    title: 'Tableau mensuel de trésorerie',
    summary:
      'Une ligne par mois : les entrées et sorties par nature, le net du mois et le cumul. Chaque ligne se déplie pour montrer les flux qui la composent.',
    howToRead: {
      columns: [
        { key: 'month', label: 'Mois', description: "Le mois du plan, du mois en cours jusqu'à la fin de l'horizon." },
        { key: 'RENT', label: 'Loyers', description: 'Entrées : loyers à encaisser prévus ce mois-là.' },
        {
          key: 'RENT_ARREARS',
          label: 'Loyers en retard',
          description: 'Entrées : loyers de périodes passées non soldés, ramenés au premier mois.'
        },
        { key: 'LOAN', label: 'Emprunts', description: 'Sorties : mensualités des emprunts en cours.' },
        {
          key: 'WORKS',
          label: 'Travaux',
          description: 'Sorties : coût des programmes de travaux planifiés ou en cours.'
        },
        {
          key: 'RECURRING_EXPENSE',
          label: 'Charges récurrentes',
          description: 'Sorties : dépenses mensuelles, trimestrielles ou annuelles enregistrées sur les biens.'
        },
        {
          key: 'PROPERTY_TAX',
          label: 'Taxe foncière',
          description: "Sorties : taxe foncière estimée, à la date d'exigibilité renseignée."
        },
        { key: 'net', label: 'Net', description: 'Entrées moins sorties du mois.' },
        {
          key: 'cumulative',
          label: 'Cumul',
          description: 'Solde de départ plus les nets des mois écoulés dans le plan.'
        }
      ],
      notes: [
        'Dans les colonnes de sorties, les montants sont écrits sans signe moins ; le signe apparaît dans « Net » et « Cumul ».',
        'Un tiret (—) veut dire aucun montant ce mois-là.',
        "Dans le détail d'un mois, l'étiquette « Estimation indicative » signale un montant calculé avec des paramètres fiscaux non validés.",
        'Une note peut préciser par exemple « Date dépassée : ramenée au premier mois du plan » pour un programme de travaux dont la date est passée.'
      ]
    },
    steps: [
      {
        title: 'Voir le détail',
        detail: "Cliquez sur le signe de dépliage d'un mois : catégorie, bien, source et montant de chaque flux."
      },
      { title: 'Exporter', detail: "Utilisez l'export du tableau pour garder les montants du plan." }
    ],
    consequences: ["Le tableau est en lecture seule : le dépliage et l'export ne modifient aucune donnée."],
    faq: [
      {
        q: 'Pourquoi le cumul est-il négatif certains mois ?',
        a: "Les sorties dépassent les entrées et le solde de départ : c'est un creux de trésorerie, signalé en haut de l'écran."
      },
      {
        q: 'Que signifie « Aucun flux prévu ce mois-ci » ?',
        a: 'Aucun mouvement connu ne tombe dans ce mois.'
      }
    ],
    related: [{ label: 'Sources du plan', helpId: 'patrimoine.tresorerie.sources' }],
    keywords: ['mensuel', 'net', 'cumul', 'loyers', 'emprunts', 'travaux', 'taxe foncière', 'charges']
  },
  {
    id: 'patrimoine.tresorerie.sources',
    kind: 'section',
    title: 'Sources du plan',
    summary:
      "Cette carte dit quelles données alimentent le plan, lesquelles manquent et pourquoi, et quels biens sont exclus. Elle permet aussi d'enregistrer la date de la taxe foncière.",
    howToRead: {
      statuses: [
        { value: 'INCLUDED', label: 'Incluse', description: 'La source alimente le plan.' },
        { value: 'NO_DATA', label: 'Aucune donnée', description: "Rien n'est enregistré pour cette source." },
        {
          value: 'NOT_CONFIGURED',
          label: 'Non configurée',
          description: 'Il manque un réglage, par exemple la date de la taxe foncière.'
        },
        {
          value: 'PARTIAL',
          label: 'Partielle',
          description: 'Seule une partie des biens ou des éléments est prise en compte.'
        }
      ],
      notes: [
        'Les sources sont : Loyers, Emprunts, Travaux, Charges récurrentes et Taxe foncière.',
        'Sous chaque source non incluse, une phrase donne la raison.',
        '« Biens exclus du plan » liste les biens écartés avec leur motif : En vente, Vendu, Archivé ou Brouillon.'
      ]
    },
    faq: [
      {
        q: 'Que faire quand une source est « Aucune donnée » ?',
        a: "Rien, si c'est normal (par exemple aucun emprunt). Sinon, enregistrez les données manquantes sur les biens : baux, emprunts, travaux ou dépenses."
      },
      {
        q: 'Une dépense ponctuelle entre-t-elle dans le plan ?',
        a: 'Non : seules les dépenses mensuelles, trimestrielles ou annuelles comptent.'
      }
    ],
    related: [{ label: 'Date de la taxe foncière', helpId: 'patrimoine.tresorerie.taxe-fonciere' }],
    keywords: ['sources', 'données manquantes', 'biens exclus', 'périmètre']
  },
  {
    id: 'patrimoine.tresorerie.taxe-fonciere',
    kind: 'section',
    title: "Date d'exigibilité de la taxe foncière",
    summary:
      "Indiquez le mois et le jour où la taxe foncière est due chaque année. Le plan l'ajoute alors parmi les sorties, en l'estimant bien par bien.",
    steps: [
      { title: 'Choisir le mois', detail: 'Dans la liste « Mois ».' },
      { title: 'Saisir le jour', detail: 'Dans « Jour », de 1 à 31 selon le mois.' },
      { title: 'Enregistrer', detail: "Cliquez sur « Enregistrer la date d'exigibilité »." },
      { title: 'Effacer la date', detail: 'Videz les deux champs puis enregistrez.' }
    ],
    consequences: [
      "La date est enregistrée pour toute l'agence, pas pour un seul bien, et sert aux prochains calculs du plan.",
      "Le montant de la taxe vient de l'estimation fiscale des biens ; elle est signalée « Estimation indicative » si les paramètres fiscaux ne sont pas tous validés.",
      "Un bien qui a déjà une dépense périodique de taxe foncière n'est pas compté deux fois."
    ],
    faq: [
      {
        q: 'Pourquoi un message demande le mois et le jour ?',
        a: 'Les deux champs vont ensemble : remplissez-les tous les deux, ou videz-les tous les deux pour effacer la date.'
      },
      {
        q: 'Le 30 février est-il accepté ?',
        a: "Non : le jour doit exister dans le mois choisi (jusqu'au 29 pour février)."
      }
    ],
    permissions: { note: 'Enregistrer cette date demande le droit « Modifier les biens ».' },
    related: [{ label: 'Paramètres fiscaux', helpId: 'patrimoine.fiscalite' }],
    keywords: ['taxe foncière', 'impôt foncier', 'échéance', 'date', 'exigibilité']
  },
  {
    id: 'patrimoine.espace-personnel.creation',
    kind: 'section',
    title: 'Créer mon espace',
    summary:
      "Ce formulaire crée votre espace personnel pour suivre votre propre patrimoine. Il s'affiche quand votre compte n'est rattaché à aucun espace.",
    purpose:
      'Un espace personnel est un espace à vous, séparé de toute agence, pour suivre vos actifs, vos dettes et votre valeur nette. Il démarre au palier gratuit.',
    steps: [
      {
        title: 'Vérifier le nom affiché',
        detail: 'Il est pré-rempli avec le nom de votre compte ; 120 caractères au plus.'
      },
      {
        title: 'Choisir le pays',
        detail:
          "Côte d'Ivoire, Sénégal, Burkina Faso, Mali, Niger, Togo, Bénin ou Guinée-Bissau. L'indicatif téléphonique suit le pays."
      },
      {
        title: 'Saisir un téléphone (facultatif)',
        detail: 'Au format international, par exemple +2250712345678. Il sera obligatoire pour payer.'
      },
      { title: 'Valider', detail: 'Cliquez sur « Créer mon espace ».' }
    ],
    consequences: [
      "Votre espace est créé et vous en devenez l'administrateur ; vous arrivez ensuite sur l'écran « Valeur nette » de cet espace.",
      "L'espace démarre sur le palier gratuit, avec une limite d'actifs suivis.",
      "Si vous avez déjà un espace, aucun second espace n'est créé : vous êtes conduit vers le vôtre.",
      "En cas de coupure réseau, vous pouvez réessayer : vos informations sont conservées et l'espace n'est créé qu'une fois."
    ],
    faq: [
      {
        q: 'On me demande de vérifier mon adresse e-mail.',
        a: 'Confirmez-la avec le message qui vous a été envoyé, puis revenez créer votre espace.'
      },
      {
        q: 'Le téléphone est-il obligatoire ?',
        a: "Pas pour créer l'espace. Il l'est pour passer au palier payant."
      },
      {
        q: 'Le service est indisponible.',
        a: 'Un message indique que la création est momentanément impossible : réessayez dans quelques instants.'
      }
    ],
    related: [
      { label: 'Palier de votre espace', helpId: 'patrimoine.espace-personnel.palier' },
      { label: "Compteur d'actifs", helpId: 'patrimoine.espace-personnel.compteur' }
    ],
    keywords: ['espace personnel', 'particulier', 'créer mon espace', 'inscription', 'gratuit']
  },
  {
    id: 'patrimoine.espace-personnel.palier',
    kind: 'section',
    title: 'Palier de votre espace',
    summary:
      "Cette carte, sur l'écran d'abonnement de votre espace personnel, indique votre palier (gratuit ou payant), le nombre d'actifs suivis et permet de passer au palier payant.",
    howToRead: {
      notes: [
        'Palier actuel : « Palier gratuit » ou « Palier payant ».',
        'Actifs suivis : nombre utilisé sur la limite du palier ; la barre de progression passe en rouge à 100 %.',
        "Un actif compte tant qu'il n'est pas archivé : les biens et les autres actifs, y compris vendus ou cédés. Archiver libère une place.",
        'Le prix mensuel du palier payant est marqué « Tarif provisoire ».'
      ]
    },
    steps: [
      {
        title: 'Cliquer sur « Passer au palier payant »',
        detail: "Le bouton n'est actif que pour l'administrateur de l'espace."
      },
      {
        title: 'Renseigner un téléphone si demandé',
        detail: 'Un numéro est nécessaire avant de payer : saisissez-le puis cliquez sur « Enregistrer et payer ».'
      },
      { title: 'Payer en ligne', detail: 'Vous êtes envoyé vers la page de paiement.' },
      { title: "Revenir sur l'écran", detail: "La carte attend la confirmation du paiement, jusqu'à une minute." }
    ],
    consequences: [
      "Le palier ne change qu'une fois le paiement confirmé par le serveur : revenir de la page de paiement ne suffit pas.",
      'Si un paiement est déjà en cours, un message propose « Reprendre le paiement ».',
      'Le numéro de téléphone saisi est enregistré comme contact de votre espace.',
      "Cette carte n'apparaît pas pour une agence."
    ],
    faq: [
      {
        q: 'Je ne peux pas cliquer sur le bouton.',
        a: "La montée de palier est réservée à l'administrateur de l'espace."
      },
      {
        q: 'Le paiement en ligne est indisponible.',
        a: "Un message l'indique : réessayez plus tard."
      },
      {
        q: "J'ai payé mais je suis toujours en palier gratuit.",
        a: "Patientez : la confirmation peut prendre jusqu'à une minute. Rechargez ensuite l'écran."
      }
    ],
    permissions: {
      note: "Passer au palier payant demande le droit de modifier les réglages de l'espace (administrateur)."
    },
    related: [{ label: "Compteur d'actifs", helpId: 'patrimoine.espace-personnel.compteur' }],
    keywords: ['palier', 'abonnement', 'gratuit', 'payant', 'passer au palier payant', 'paiement']
  },
  {
    id: 'patrimoine.espace-personnel.compteur',
    kind: 'section',
    title: "Compteur d'actifs",
    summary:
      "Le bandeau « X actifs sur Y » des écrans du patrimoine d'un espace personnel indique combien d'actifs vous suivez par rapport à la limite de votre palier.",
    howToRead: {
      notes: [
        'Palier gratuit : bandeau bleu, qui devient orange quand la limite est atteinte, avec le lien « Passer au palier payant » et le prix mensuel (tarif provisoire).',
        'Palier payant : une simple ligne grise « X actifs sur Y ».',
        'Une agence ne voit pas ce bandeau.'
      ]
    },
    consequences: [
      "Limite atteinte : vous ne pouvez plus ajouter d'actif sans passer au palier payant ou archiver un actif existant."
    ],
    faq: [
      {
        q: "Qu'est-ce qui compte comme actif ?",
        a: 'Les actifs et les biens non archivés ; un bien lié à un actif compte une seule fois.'
      }
    ],
    related: [{ label: 'Palier de votre espace', helpId: 'patrimoine.espace-personnel.palier' }],
    keywords: ['actifs', 'limite', 'quota', 'palier gratuit']
  }
];

export default entries;
