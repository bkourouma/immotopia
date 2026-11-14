import type { HelpEntry } from '../../../types';

/** Zone « stock-controle » du module finance (fr). */
const entries: HelpEntry[] = [
  // ===========================================================================
  // Transferts et inventaire du stock
  // ===========================================================================
  {
    id: 'finance.inventaire.page',
    kind: 'page',
    title: 'Transferts et inventaire du stock',
    summary:
      'Cet écran sert à déplacer de la matière d’un lieu à un autre et à compter ce qui s’y trouve. L’inventaire compare la quantité annoncée par le système à la quantité réellement comptée.',
    purpose:
      'Le stock du magasin et de chaque chantier est tenu au fil des réceptions, des sorties et des transferts. Un inventaire vérifie ces quantités sur place et corrige les écarts de façon tracée : un motif par écart, une validation par une autre personne et un procès-verbal.',
    steps: [
      {
        title: 'Choisir l’onglet',
        detail:
          '« Transfert entre lieux » (si vous avez le droit de transférer) ou « Inventaire physique ». Sans le droit de transférer, seul l’inventaire s’affiche.'
      },
      {
        title: 'Ouvrir un inventaire',
        detail: 'Onglet « Inventaire physique », bouton « Ouvrir un inventaire », puis choisissez le lieu à compter.'
      },
      {
        title: 'Compter à l’aveugle',
        detail:
          'Saisissez la quantité comptée, article par article. L’écran ne montre pas la quantité attendue pendant le comptage.'
      },
      { title: 'Clore le comptage', detail: 'Les écarts apparaissent alors, ligne par ligne.' },
      { title: 'Justifier les écarts', detail: 'Chaque écart reçoit un motif choisi dans une liste.' },
      {
        title: 'Faire valider',
        detail: 'Une autre personne habilitée valide l’inventaire. Les écarts deviennent des ajustements de stock.'
      }
    ],
    consequences: [
      'Rien ne bouge dans le stock tant que l’inventaire n’est pas validé.',
      'La validation est irréversible : elle transforme chaque écart en ajustement de stock et, quand l’écart a une valeur, en écriture comptable. Une erreur se corrige par un nouvel inventaire du même lieu.',
      'Un transfert déplace la matière d’un lieu à un autre sans l’imputer à un chantier : ce n’est pas une dépense. Seule la sortie de stock impute un chantier.'
    ],
    faq: [
      {
        q: 'Pourquoi la quantité attendue n’est-elle pas affichée ?',
        a: 'Un comptage se fait à l’aveugle, pour que personne ne compte « ce qu’il faut trouver ». La quantité attendue et les écarts apparaissent seulement quand le comptage est clos.'
      },
      {
        q: 'Je ne vois pas l’onglet « Transfert entre lieux ».',
        a: 'Il demande le droit « Transférer ». Sans lui, l’écran s’ouvre directement sur l’inventaire physique.'
      },
      {
        q: 'Comment retrouver un inventaire fait par WhatsApp ?',
        a: 'Il figure dans la liste comme les autres, avec la pastille « Ouvert par WhatsApp » dans son en-tête. Le lien « Ouvrir l’inventaire » de l’écran « Comptages terrain » y mène aussi.'
      },
      {
        q: 'Pourquoi des valeurs en FCFA manquent-elles ?',
        a: 'Les valeurs du stock ne sont affichées qu’avec le droit « Voir les valeurs du stock ». Un message le rappelle en haut de l’écran.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Magasinier (compter, transférer)', 'Responsable du stock (valider)'],
      note: 'Voir l’écran demande « Consulter le stock ». Ouvrir, compter et clore demandent « Compter ». Valider ou abandonner demande « Valider les inventaires ». Transférer demande « Transférer ».'
    },
    related: [
      { label: 'Les inventaires de l’agence', helpId: 'finance.inventaire.liste' },
      { label: 'Valider un inventaire', helpId: 'finance.inventaire.validation' },
      { label: 'Contrôle du stock : alertes et seuils', helpId: 'finance.controle-stock.page' },
      { label: 'Comptages terrain', helpId: 'finance.comptages-terrain.page' }
    ],
    keywords: [
      'inventaire',
      'comptage',
      'stock',
      'écart',
      'transfert',
      'ajustement',
      'procès-verbal',
      'magasin',
      'chantier'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'inventaire-onglets',
          title: 'Deux onglets',
          description:
            '« Transfert entre lieux » déplace de la matière ; « Inventaire physique » compte ce qui se trouve sur un lieu.'
        },
        {
          target: 'inventaire-ouvrir',
          title: 'Ouvrir un inventaire',
          description: 'Choisissez le lieu à compter. Un seul comptage en cours est possible par lieu.'
        },
        {
          target: 'inventaire-liste',
          title: 'La liste des inventaires',
          description:
            'Le bouton de la dernière colonne reprend l’inventaire là où il en est : comptage, écarts ou consultation.'
        },
        {
          target: 'inventaire-validation',
          title: 'Valider',
          description:
            'Une fois les écarts justifiés, une autre personne habilitée valide. Cette étape apparaît quand un inventaire clos est ouvert.'
        }
      ]
    }
  },
  {
    id: 'finance.inventaire.transfert',
    kind: 'section',
    title: 'Transfert entre lieux',
    summary:
      'Déplacez une quantité d’un article d’un lieu (magasin ou chantier) vers un autre. Un transfert n’impute rien : ce n’est pas une dépense.',
    purpose:
      'Livrer du ciment du magasin vers un chantier ressemble à une dépense, mais la matière reste à l’actif de l’agence, simplement ailleurs. Le coût du chantier ne bouge pas : seule la sortie de stock impute un chantier.',
    steps: [
      {
        title: 'Lieu d’origine et lieu d’arrivée',
        detail: 'Deux lieux différents. Un chantier clos ne peut pas recevoir.'
      },
      { title: 'Article transféré', detail: 'Choisissez l’article.' },
      {
        title: 'Quantité',
        detail:
          'L’écran indique ce qu’il reste au lieu d’origine, sauf si ce lieu est en cours de comptage. Une quantité supérieure au stock est refusée.'
      },
      {
        title: 'Date du transfert',
        detail:
          'Par défaut aujourd’hui. Une date trop ancienne est refusée (limite réglée dans « Réglages de contrôle »).'
      },
      {
        title: 'Qui demande ou emporte',
        detail: 'Un preneur du carnet. Si votre agence n’exige pas de preneur du carnet, un nom saisi à la main suffit.'
      },
      {
        title: 'Motif du transfert',
        detail:
          'Approvisionnement d’un chantier, retour au magasin, évacuation d’un chantier, rééquilibrage entre lieux ou autre (précision obligatoire).'
      },
      { title: 'Enregistrer le transfert', detail: 'Le résumé du dernier transfert s’affiche en dessous.' }
    ],
    consequences: [
      'Le stock du lieu d’origine baisse et celui du lieu d’arrivée augmente de la même quantité : deux lignes du journal des mouvements (une sortie, une entrée).',
      'La valeur déplacée est calculée au coût moyen du lieu d’origine et n’est montrée qu’avec le droit « Voir les valeurs du stock ». Aucun chantier n’est imputé.',
      'Vous pouvez joindre une photo de la marchandise transférée une fois le transfert enregistré.',
      'Si la connexion coupe pendant l’envoi, l’écran propose de réessayer sans créer deux transferts : un message « Ce transfert était déjà enregistré » le confirme.'
    ],
    faq: [
      {
        q: 'Un transfert fait-il baisser le budget du chantier ?',
        a: 'Non. Le chantier n’est touché que par une sortie de stock vers ce chantier, pas par un transfert.'
      },
      {
        q: 'Pourquoi le serveur refuse-t-il ma quantité ?',
        a: 'Elle dépasse ce qui reste au lieu d’origine. Vérifiez la quantité ou enregistrez d’abord la réception qui manque.'
      },
      {
        q: 'Pourquoi la quantité disponible n’est-elle pas affichée ?',
        a: 'Le lieu d’origine est en cours de comptage : sa quantité reste masquée jusqu’à la clôture du comptage.'
      },
      {
        q: 'Comment annuler un transfert ?',
        a: 'Le transfert ne s’annule pas : pour revenir en arrière, enregistrez un transfert dans l’autre sens.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', roles: ['Magasinier'], note: 'Demande le droit « Transférer ».' },
    related: [
      { label: 'Contrôle du stock : réglages', helpId: 'finance.controle-stock.reglages' },
      { label: 'Gestion du stock', to: '/tenant/:tenantId/finance/stock' }
    ],
    keywords: ['transfert', 'déplacer', 'livraison chantier', 'magasin', 'ciment', 'lieu', 'sortie']
  },
  {
    id: 'finance.inventaire.physique',
    kind: 'section',
    title: 'Inventaire physique',
    summary:
      'Retrouvez les inventaires de l’agence et ouvrez-en un nouveau. Un inventaire se compte à l’aveugle, se clôt, se justifie, puis se valide par une autre personne que celle qui a compté.',
    howToRead: {
      statuses: [
        {
          value: 'DRAFT',
          label: 'Comptage en cours',
          description: 'Les quantités se saisissent. La quantité attendue est masquée. On peut abandonner l’inventaire.'
        },
        {
          value: 'COUNTED',
          label: 'Comptage clos',
          description:
            'Les quantités sont figées, les écarts apparaissent. Reste à justifier chaque écart puis à valider.'
        },
        {
          value: 'VALIDATED',
          label: 'Validé',
          description: 'Les écarts sont devenus des ajustements de stock. L’inventaire ne s’annule plus.'
        },
        {
          value: 'CANCELLED',
          label: 'Abandonné',
          description: 'L’inventaire n’a pas été ajusté : le stock n’a pas bougé. Le lieu peut être compté à nouveau.'
        }
      ],
      notes: [
        'Trois natures d’inventaire : « Inventaire courant », « Inventaire d’ouverture » (constate ce qui se trouve déjà sur un lieu, surplus sans valeur) et « Inventaire de clôture » (propre aux chantiers, pour clôturer un chantier qui garde du stock).',
        'Un seul comptage en cours par lieu : tant qu’il n’est pas validé ou abandonné, le lieu ne peut pas être compté à nouveau.'
      ]
    },
    steps: [
      { title: 'Ouvrir un inventaire', detail: 'Bouton « Ouvrir un inventaire » (droit « Compter »).' },
      { title: 'Rechercher', detail: 'Par lieu, état, nature ou date de comptage, avec la barre de filtres.' },
      { title: 'Reprendre un inventaire', detail: 'Le bouton de la dernière colonne ouvre le détail sous la liste.' }
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas ouvrir d’inventaire sur un lieu ?',
        a: 'Un inventaire est déjà en cours sur ce lieu : il est indiqué « inventaire en cours » dans la liste des lieux. Terminez-le ou abandonnez-le d’abord.'
      },
      {
        q: 'Où voit-on le détail d’un inventaire ?',
        a: 'Sous la liste, après avoir cliqué sur le bouton de la ligne. « Fermer cet inventaire » le referme.'
      },
      {
        q: 'Je ne vois pas le bouton « Ouvrir un inventaire ».',
        a: 'Il demande le droit « Compter ».'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Magasinier', 'Chef de chantier (compter seulement)'],
      note: 'Ouvrir et compter demandent « Compter ».'
    },
    related: [
      { label: 'Tableau des inventaires', helpId: 'finance.inventaire.liste' },
      { label: 'Ouvrir un inventaire', helpId: 'finance.inventaire.ouverture' }
    ],
    keywords: ['inventaire', 'état', 'comptage en cours', 'brouillon', 'abandonné', 'nature']
  },
  {
    id: 'finance.inventaire.liste',
    kind: 'table',
    title: 'Tableau des inventaires',
    summary:
      'Chaque ligne est un inventaire de l’agence : le lieu, sa nature, sa date, son état, le nombre de lignes et d’écarts.',
    howToRead: {
      columns: [
        { key: 'lieu', label: 'Lieu', description: 'Le lieu compté (magasin ou lieu d’un chantier).' },
        {
          key: 'nature',
          label: 'Nature',
          description: 'Inventaire courant, d’ouverture ou de clôture.'
        },
        { key: 'date', label: 'Compté le', description: 'La date du comptage, choisie à l’ouverture.' },
        {
          key: 'etat',
          label: 'État',
          description:
            'Où en est l’inventaire. « Validé sans second regard » signale une validation faite par la personne qui a compté.'
        },
        { key: 'lignes', label: 'Lignes', description: 'Nombre d’articles de l’inventaire.' },
        {
          key: 'ecarts',
          label: 'Lignes en écart',
          description: '« Masqué » tant que le comptage est en cours : les écarts ne sont pas visibles.'
        },
        {
          key: 'valeur',
          label: 'Valeur de l’écart',
          description:
            'Écart net en FCFA. « estimée » tant que le comptage est clos et non validé ; figée à la validation. Visible avec le droit « Voir les valeurs du stock ».'
        },
        { key: 'auteur', label: 'Ouvert par', description: 'La personne qui a ouvert l’inventaire.' },
        {
          key: 'validateur',
          label: 'Validé par',
          description: 'La personne qui a validé, ou un tiret si pas encore validé.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            '« Poursuivre le comptage », « Justifier les écarts » ou « Consulter » selon l’état de l’inventaire.'
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Comptage en cours', description: 'Saisie des quantités en cours.' },
        { value: 'COUNTED', label: 'Comptage clos', description: 'Écarts à justifier, puis validation.' },
        { value: 'VALIDATED', label: 'Validé', description: 'Écarts appliqués au stock.' },
        { value: 'CANCELLED', label: 'Abandonné', description: 'Aucun ajustement.' }
      ]
    },
    faq: [
      {
        q: 'Que contient l’export ?',
        a: 'Tous les inventaires correspondant à vos filtres, pas seulement la page affichée.'
      },
      {
        q: 'Pourquoi « Masqué » dans la colonne des écarts ?',
        a: 'L’inventaire est en cours de comptage : l’écran ne montre ni quantité attendue ni écart avant la clôture.'
      },
      {
        q: 'La colonne « Valeur de l’écart » est absente.',
        a: 'Elle n’apparaît qu’avec le droit « Voir les valeurs du stock ».'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Consulter le stock ».' },
    related: [{ label: 'Valider un inventaire', helpId: 'finance.inventaire.validation' }],
    keywords: ['liste des inventaires', 'écart', 'état', 'validé', 'abandonné', 'export']
  },
  {
    id: 'finance.inventaire.ouverture',
    kind: 'section',
    title: 'Ouvrir un inventaire',
    summary:
      'Choisissez le lieu à compter, la nature de l’inventaire et la date du comptage. Le comptage se fait à l’aveugle.',
    steps: [
      {
        title: 'Lieu à compter',
        detail: 'Un lieu déjà en cours de comptage est grisé (« inventaire en cours »).'
      },
      {
        title: 'Nature',
        detail:
          '« Inventaire courant » par défaut. « Inventaire d’ouverture » est proposé quand le lieu le suggère, « Inventaire de clôture » pour un lieu de chantier.'
      },
      { title: 'Date du comptage', detail: 'Aujourd’hui par défaut. Une date trop ancienne est refusée.' },
      { title: 'Ouvrir l’inventaire', detail: 'Le détail de l’inventaire s’ouvre sous la liste.' }
    ],
    consequences: [
      'Un seul comptage en brouillon par lieu : deux comptages simultanés produiraient deux vérités, et le second validé écraserait le premier.',
      'À partir de l’ouverture, la quantité attendue du lieu est masquée à tous pendant le comptage (soldes, transferts, sorties).',
      'Inventaire d’ouverture : il constate ce qui se trouve déjà sur le lieu ; un surplus y entre sans valeur, car la matière a déjà été payée par les factures du chantier.',
      'Inventaire de clôture : il doit compter tous les articles présents sur le lieu ; il permet de clôturer un chantier qui garde du stock.'
    ],
    faq: [
      {
        q: 'À quoi sert « À recompter depuis le dernier inventaire » ?',
        a: 'L’écran liste les articles écartés lors du dernier inventaire et jamais recomptés depuis. Pensez à les compter.'
      },
      {
        q: 'Pourquoi un choix de nature manque-t-il ?',
        a: 'L’inventaire d’ouverture n’est proposé que pour un lieu qui en a besoin, et l’inventaire de clôture que pour un lieu de chantier.'
      },
      {
        q: 'Peut-on dater un inventaire de la semaine dernière ?',
        a: 'Oui dans la limite fixée par les « Réglages de contrôle » (7 jours au départ). Au-delà, la date est refusée.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande le droit « Compter ».' },
    related: [{ label: 'Saisir les comptages', helpId: 'finance.inventaire.saisie' }],
    keywords: ['ouvrir un inventaire', 'inventaire d’ouverture', 'inventaire de clôture', 'nature', 'lieu à compter']
  },
  {
    id: 'finance.inventaire.saisie',
    kind: 'section',
    title: 'Saisir le comptage d’un article',
    summary:
      'Pendant le comptage, saisissez article par article la quantité réellement vue. Rien n’est ajusté tant que l’inventaire n’est pas validé.',
    steps: [
      { title: 'Article compté', detail: 'Choisissez l’article dans la liste.' },
      {
        title: 'Quantité comptée',
        detail: 'Le zéro est un résultat valable : « j’ai regardé, il n’y a rien ».'
      },
      { title: 'Enregistrer le comptage', detail: 'La ligne apparaît dans le tableau des lignes du comptage.' },
      {
        title: 'Corriger une ligne',
        detail:
          '« Reprendre » remet l’article dans la saisie ; saisir le même article une seconde fois remplace son comptage.'
      },
      {
        title: 'Retirer une ligne',
        detail: '« Retirer » supprime la ligne du comptage, après confirmation. Le stock n’est pas touché.'
      },
      {
        title: 'Clore le comptage',
        detail: 'Quand tout est compté, « Clore le comptage » (au moins une ligne).'
      }
    ],
    consequences: [
      'À la clôture, les articles qui ont du stock sur le lieu et que personne n’a comptés apparaissent comme « non comptés » : une personne habilitée devra les écarter avant la validation.',
      'Après la clôture, les quantités ne se modifient plus et les écarts s’affichent.',
      'Un inventaire d’ouverture ou de clôture doit compter tous les articles présents sur le lieu, sinon la clôture est refusée et l’écran liste ce qui manque.',
      'Si vous pouvez aussi valider les inventaires, vous voyez le stock du lieu : vos lignes sont alors marquées « comptées sans aveugle » sur le procès-verbal.',
      '« Abandonner l’inventaire » demande un motif ; il est signalé aux responsables du stock s’il avait déjà des lignes.'
    ],
    faq: [
      {
        q: 'Où donner le motif d’un écart ?',
        a: 'Après la clôture, pas pendant le comptage : la saisie ne porte que l’article et la quantité.'
      },
      {
        q: 'Puis-je compter à plusieurs ?',
        a: 'Oui. Le tableau indique qui a compté chaque ligne, et la carte « Compteurs » liste les personnes concernées.'
      },
      {
        q: 'Que se passe-t-il si je ferme l’écran en cours de comptage ?',
        a: 'Les lignes enregistrées sont conservées. Rouvrez l’inventaire avec « Poursuivre le comptage ».'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Magasinier', 'Chef de chantier'],
      note: 'Saisir, retirer une ligne et clore demandent « Compter ». Abandonner demande « Valider les inventaires ».'
    },
    related: [{ label: 'Les lignes du comptage', helpId: 'finance.inventaire.lignes' }],
    keywords: ['saisir', 'quantité comptée', 'compter', 'aveugle', 'clore', 'abandonner']
  },
  {
    id: 'finance.inventaire.lignes',
    kind: 'table',
    title: 'Lignes du comptage',
    summary:
      'Une ligne par article compté. Les colonnes changent selon l’état : pendant le comptage, ni attendu ni écart ; après la clôture, tout apparaît.',
    howToRead: {
      columns: [
        {
          key: 'article',
          label: 'Article',
          description:
            'Référence et nom. Les pastilles « Non compté », « Écartée » ou « WhatsApp » précisent la ligne ; « Voir la photo » ouvre la preuve d’un comptage par WhatsApp.'
        },
        {
          key: 'attendu',
          label: 'Ce que le système disait',
          description: 'La quantité attendue, figée au moment du comptage. Absente tant que le comptage est en cours.'
        },
        {
          key: 'compte',
          label: 'Compté',
          description: 'La quantité comptée. « non compté » si personne n’a compté l’article.'
        },
        {
          key: 'ecart',
          label: 'Écart',
          description:
            'Compté moins attendu : négatif = il manque, positif = surplus. Jamais en rouge ; en orange tant que l’écart n’est pas justifié.'
        },
        {
          key: 'valeur',
          label: 'Valeur de l’écart',
          description: 'L’écart en FCFA, au coût moyen. Visible avec le droit « Voir les valeurs du stock ».'
        },
        { key: 'par', label: 'Compté par', description: 'La personne qui a saisi la ligne.' },
        { key: 'saisi', label: 'Saisi à', description: 'Date et heure de saisie, relevées par le serveur.' },
        {
          key: 'motif',
          label: 'Motif',
          description:
            '« Écart à justifier », le motif choisi, « Aucun écart », « Non compté » ou « Écartée » avec son motif.'
        },
        { key: 'pieces', label: 'Pièces jointes', description: 'Nombre de photos ou pièces rattachées à la ligne.' },
        {
          key: 'depuis',
          label: 'Mouvements depuis le comptage',
          description: 'Après validation : nombre de mouvements de stock enregistrés sur l’article depuis le comptage.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: 'Reprendre ou retirer pendant le comptage ; justifier ou écarter après la clôture.'
        }
      ],
      statuses: [
        {
          value: 'NOT_COUNTED',
          label: 'Non compté',
          description: 'L’article a du stock sur le lieu mais n’a pas été compté. À écarter avant la validation.'
        },
        {
          value: 'SET_ASIDE',
          label: 'Écartée',
          description:
            'La ligne ne sera pas ajustée et figurera au procès-verbal. À faire recompter dans un nouvel inventaire.'
        }
      ],
      notes: ['« Écarter une ligne » n’efface pas son écart : il reste compté dans le contrôle de l’inventaire.']
    },
    steps: [
      {
        title: 'Rechercher',
        detail:
          'Par article, motif ou personne ; l’option « En écart » ne garde que les lignes à écart (après clôture).'
      },
      {
        title: 'Justifier un écart',
        detail: '« Justifier » ou « Modifier le motif » ouvre la fenêtre du motif (après la clôture).'
      },
      {
        title: 'Écarter une ligne',
        detail: '« Écarter la ligne » demande un motif de 3 à 500 caractères (droit « Valider les inventaires »).'
      },
      {
        title: 'Écarter tout ce qui n’est pas compté',
        detail: '« Écarter tous les articles non comptés » s’applique en une fois, avec un motif commun.'
      }
    ],
    consequences: [
      'Une ligne écartée n’est pas ajustée à la validation ; elle est signalée aux responsables du stock.',
      'Un motif décrit ce que vous constatez : il ne met personne en cause et aucune retenue n’en découle.'
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas modifier une quantité après la clôture ?',
        a: 'Les quantités sont figées à la clôture. Pour recompter un article, écartez la ligne puis recomptez-le dans un nouvel inventaire.'
      },
      {
        q: 'Que veut dire « Comptée par une personne qui voyait le stock » ?',
        a: 'La personne qui a compté avait aussi le droit de valider et voyait donc la quantité attendue. La mention figure sur l’inventaire validé.'
      },
      {
        q: 'Que contient l’export ?',
        a: 'Les lignes de ce tableau, avec le motif en clair, selon vos filtres.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Justifier demande « Compter » ou « Valider les inventaires ». Écarter demande « Valider les inventaires ».'
    },
    related: [
      { label: 'Justifier un écart', helpId: 'finance.inventaire.justification' },
      { label: 'Valider l’inventaire', helpId: 'finance.inventaire.validation' }
    ],
    keywords: ['lignes', 'écart', 'manque', 'surplus', 'non compté', 'écarter', 'attendu']
  },
  {
    id: 'finance.inventaire.indicateurs-clos',
    kind: 'section',
    title: 'Indicateurs d’un inventaire clos',
    summary:
      'Ces cartes résument l’inventaire clos : articles comptés, lignes en écart, écarts à justifier, articles non comptés et valeur estimée de l’écart.',
    howToRead: {
      notes: [
        '« Lignes en écart » : lignes dont la quantité comptée diffère de l’attendue. La carte passe en orange s’il y en a.',
        '« Écarts à justifier » : écarts sans motif. Tant qu’il en reste, la validation est impossible.',
        '« Non comptés » : articles qui ont du stock sur le lieu et que personne n’a comptés. Ils doivent être écartés avant la validation.',
        '« Valeur estimée de l’écart » : estimée au coût moyen actuel, figée à la validation. Visible avec le droit « Voir les valeurs du stock ».'
      ]
    },
    faq: [
      {
        q: 'Pourquoi la valeur de l’écart est-elle « estimée » ?',
        a: 'Tant que l’inventaire n’est pas validé, elle utilise le coût moyen du moment. Elle est figée à la validation.'
      },
      {
        q: 'Que compte « Écarts à justifier » ?',
        a: 'Les lignes en écart sans motif, hors lignes écartées. Un surplus d’inventaire d’ouverture n’a pas besoin de motif.'
      },
      {
        q: 'Les cartes de valeur sont absentes.',
        a: 'Elles demandent le droit « Voir les valeurs du stock ».'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Lignes du comptage', helpId: 'finance.inventaire.lignes' }],
    keywords: ['indicateurs', 'écarts à justifier', 'non comptés', 'valeur estimée']
  },
  {
    id: 'finance.inventaire.justification',
    kind: 'section',
    title: 'Justifier un écart',
    summary:
      'Choisissez ce qui décrit le mieux ce que vous constatez pour une ligne en écart. Chaque écart doit avoir un motif avant la validation.',
    steps: [
      {
        title: 'Relire les chiffres',
        detail: 'La fenêtre rappelle « Attendu », « Compté » et « Écart ».'
      },
      {
        title: 'Choisir un motif',
        detail:
          'Casse, détérioration, erreur du comptage précédent, erreur de saisie d’un mouvement, confusion d’unité, sortie non enregistrée, réception non enregistrée, disparition non expliquée, ou autre (précision obligatoire).'
      },
      {
        title: 'Ajouter une photo (facultatif)',
        detail: 'Photo de la marchandise ou autre pièce.'
      },
      { title: 'Enregistrer le motif', detail: 'La ligne n’est plus signalée « à justifier ».' }
    ],
    consequences: [
      'Un motif décrit un fait. Il ne désigne personne et aucune retenue n’en découle.',
      '« Disparition non expliquée » est une constatation : elle est acceptée comme motif.',
      'Le motif reste modifiable tant que l’inventaire n’est pas validé (« Modifier le motif »).'
    ],
    faq: [
      {
        q: 'Que choisir quand je ne sais pas ?',
        a: '« Disparition non expliquée » dit exactement cela. Évitez de choisir un motif qui n’est pas vrai.'
      },
      {
        q: 'Pourquoi une précision est-elle demandée ?',
        a: 'Le motif « Autre » exige un texte libre pour être accepté.'
      },
      {
        q: 'Le surplus d’un inventaire d’ouverture doit-il être justifié ?',
        a: 'Non, il est justifié automatiquement par le système (stock d’ouverture).'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Compter » ou « Valider les inventaires ».' },
    related: [{ label: 'Valider l’inventaire', helpId: 'finance.inventaire.validation' }],
    keywords: ['motif', 'justifier', 'écart', 'casse', 'disparition']
  },
  {
    id: 'finance.inventaire.validation',
    kind: 'section',
    title: 'Valider l’inventaire',
    summary:
      'La validation applique les écarts justifiés au stock du lieu. Elle est faite par une autre personne que celle qui a compté et ne s’annule pas.',
    purpose:
      'C’est le contrôle « à quatre yeux » : celui qui compte ne valide pas son propre comptage, sauf cas particulier signalé ci-dessous.',
    steps: [
      {
        title: 'Justifier tous les écarts',
        detail: 'Tant qu’un écart n’a pas de motif, le bouton reste grisé et l’écran liste les lignes concernées.'
      },
      {
        title: 'Écarter les articles non comptés',
        detail: 'Un article non compté doit être écarté (ligne par ligne ou en une fois) avant la validation.'
      },
      {
        title: 'Cliquer sur « Valider l’inventaire »',
        detail: 'Une confirmation rappelle les conséquences. Confirmez avec « Confirmer la validation ».'
      },
      {
        title: 'Si vous avez compté vous-même',
        detail:
          'Une autre personne habilitée de l’agence doit valider. Si vous êtes la seule personne habilitée, la fenêtre « Valider sans second regard » demande pourquoi (10 à 500 caractères).'
      }
    ],
    consequences: [
      'Chaque écart justifié devient un ajustement de stock, appliqué au stock actuel du lieu : les mouvements enregistrés depuis le comptage sont conservés.',
      'Quand un ajustement a une valeur, une écriture comptable est passée à la date du comptage : en cas de manque, débit du compte « Variations des stocks de biens achetés » (603) et crédit du compte « Stocks de matières et fournitures » (311) ; en cas de surplus, l’inverse. Les surplus d’un inventaire d’ouverture entrent sans valeur, donc sans écriture.',
      'Un procès-verbal d’inventaire est généré, avec son numéro ; vous pouvez le télécharger et y rattacher le procès-verbal signé.',
      'Les valeurs sont figées : valeur comptée, écart brut, écart net, écart des lignes écartées.',
      'Des alertes peuvent être levées : écart au-dessus du seuil, lignes écartées, validation par la personne qui a compté (voir « Contrôle du stock »). Aucun chantier n’est imputé.',
      'Irréversible : l’inventaire ne s’annule pas. Une erreur se corrige par un second comptage sur le même lieu.',
      'Si des sorties enregistrées depuis le comptage ont fait baisser le stock plus que la quantité comptée, la validation est refusée : écartez la ligne et recomptez (pour un inventaire d’ouverture ou de clôture, abandonnez et recomptez le lieu).'
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Valider l’inventaire » est-il grisé ?',
        a: 'Il reste des écarts sans motif, des articles non comptés non écartés, ou vous avez compté cet inventaire et une autre personne peut le valider.'
      },
      {
        q: 'Que signifie « Validé sans second regard » ?',
        a: 'Une personne a validé un inventaire qu’elle avait aussi compté, faute d’autre validateur dans l’agence. La raison est consignée dans le procès-verbal, le journal d’activité et une alerte.'
      },
      {
        q: 'Comment corriger un inventaire déjà validé ?',
        a: 'Il ne s’annule pas. Ouvrez un nouvel inventaire sur le même lieu et recomptez : le nouvel écart sera ajusté à son tour.'
      },
      {
        q: 'Qui voit ce bloc ?',
        a: 'Les personnes qui ont le droit « Valider les inventaires ».'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Responsable du stock'],
      note: 'Demande le droit « Valider les inventaires ».'
    },
    related: [
      { label: 'Alertes déclenchées par un inventaire', helpId: 'finance.controle-stock.alertes' },
      { label: 'Procès-verbal', helpId: 'finance.inventaire.proces-verbal' }
    ],
    keywords: [
      'valider',
      'validation',
      'quatre yeux',
      'ajustement',
      'écriture comptable',
      'sans second regard',
      'irréversible'
    ]
  },
  {
    id: 'finance.inventaire.indicateurs-valide',
    kind: 'section',
    title: 'Indicateurs d’un inventaire validé',
    summary:
      'Ces cartes figent le résultat de l’inventaire à sa validation : nombre de lignes, écarts, valeur comptée et écarts valorisés.',
    howToRead: {
      notes: [
        '« Valeur comptée » : valeur des quantités comptées, figée à la validation.',
        '« Écart brut » : somme des écarts, manques et surplus confondus.',
        '« Écart net » : manques et surplus se compensent.',
        '« Écart des lignes écartées » : écart des lignes mises à l’écart, non ajustées.',
        'Un inventaire validé avant la mise en place du suivi des valeurs affiche « Non figée ».'
      ]
    },
    faq: [
      {
        q: 'Quelle différence entre écart brut et écart net ?',
        a: 'L’écart brut additionne tous les écarts sans tenir compte du signe ; l’écart net compense les manques par les surplus.'
      },
      {
        q: 'Pourquoi « Non figée » ?',
        a: 'L’inventaire a été validé avant que ces valeurs soient enregistrées : elles ne peuvent pas être reconstituées.'
      },
      {
        q: 'Pourquoi ces cartes manquent-elles ?',
        a: 'Les cartes de valeur demandent le droit « Voir les valeurs du stock ».'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Lignes écartées et non comptées', helpId: 'finance.inventaire.lignes-ecartees' }],
    keywords: ['valeur comptée', 'écart brut', 'écart net', 'inventaire validé']
  },
  {
    id: 'finance.inventaire.lignes-ecartees',
    kind: 'table',
    title: 'Lignes écartées et non comptées',
    summary:
      'Sous un inventaire validé, ces listes rassemblent les lignes qui n’ont pas été ajustées : celles qu’on a écartées et les articles non comptés.',
    howToRead: {
      columns: [
        { key: 'article', label: 'Article', description: 'Référence et nom de l’article.' },
        {
          key: 'attendu',
          label: 'Ce que le système disait',
          description: 'La quantité attendue au moment du comptage.'
        },
        { key: 'compte', label: 'Compté', description: 'La quantité comptée, ou « non compté ».' },
        { key: 'ecart', label: 'Écart', description: 'L’écart constaté. Il n’a pas été appliqué au stock.' },
        { key: 'motif', label: 'Motif', description: 'Le motif de mise à l’écart.' }
      ],
      notes: ['Ces lignes figurent au procès-verbal. Faites-les recompter dans un nouvel inventaire.']
    },
    faq: [
      {
        q: 'Pourquoi ces lignes ne sont-elles pas ajustées ?',
        a: 'Elles ont été écartées avant la validation : le stock de ces articles n’a pas changé.'
      },
      {
        q: 'Comment les régulariser ?',
        a: 'Ouvrez un nouvel inventaire sur le même lieu et recomptez ces articles.'
      },
      {
        q: 'Peut-on annuler une mise à l’écart ?',
        a: 'Pas après la validation. Seul un nouvel inventaire permet de corriger.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Lignes du comptage', helpId: 'finance.inventaire.lignes' }],
    keywords: ['écartées', 'non comptés', 'procès-verbal']
  },
  {
    id: 'finance.inventaire.proces-verbal',
    kind: 'section',
    title: 'Procès-verbal signé',
    summary:
      'Rattachez ici le procès-verbal d’inventaire signé par les personnes présentes. Le bouton de téléchargement du procès-verbal généré se trouve au-dessus du tableau.',
    steps: [
      { title: 'Télécharger le procès-verbal', detail: 'Bouton au-dessus du tableau des lignes, avec son numéro.' },
      { title: 'Faire signer', detail: 'Imprimez-le et faites-le signer sur place.' },
      { title: 'Rattacher le fichier signé', detail: 'Ajoutez-le dans cette section.' }
    ],
    consequences: [
      'Le procès-verbal est généré à la validation. Le fichier signé s’ajoute à l’inventaire et reste consultable.'
    ],
    faq: [
      {
        q: 'Qui peut ajouter le fichier signé ?',
        a: 'Les personnes qui ont le droit « Valider les inventaires ».'
      },
      {
        q: 'Où est le procès-verbal d’un inventaire non validé ?',
        a: 'Il n’existe qu’après la validation.'
      },
      {
        q: 'Le numéro du procès-verbal peut-il changer ?',
        a: 'Non, il est attribué à la validation.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Ajouter le fichier demande « Valider les inventaires ».' },
    related: [{ label: 'Valider l’inventaire', helpId: 'finance.inventaire.validation' }],
    keywords: ['procès-verbal', 'PV', 'signé', 'pièce jointe']
  },

  // ===========================================================================
  // Contrôle du stock
  // ===========================================================================
  {
    id: 'finance.controle-stock.page',
    kind: 'page',
    title: 'Contrôle du stock',
    summary:
      'Suivez les alertes, les indicateurs et les réglages du contrôle du stock. Une alerte signale un fait au-dessus d’un seuil : elle ne désigne personne.',
    purpose:
      'Cet écran aide les responsables à repérer ce qui mérite un regard : gros écart d’inventaire, sortie importante, rebut important, réception douteuse, achats de matériaux en espèces. C’est à vous de regarder et de qualifier.',
    steps: [
      { title: 'Alertes', detail: 'Traitez les alertes à traiter, filtrez par nature, chantier, lieu ou période.' },
      { title: 'Indicateurs', detail: 'Lisez les chiffres du mois, par mois et par lieu.' },
      {
        title: 'Réglages de contrôle',
        detail: 'Ajustez les seuils d’alerte, l’antériorité des dates et l’exigence d’un preneur.'
      }
    ],
    consequences: [
      'Marquer une alerte comme traitée la fait sortir de la file « À traiter » ; elle reste consultable.',
      'Modifier un seuil change les alertes futures, pas celles déjà levées.'
    ],
    faq: [
      {
        q: 'Pourquoi un onglet manque-t-il ?',
        a: '« Alertes » demande le droit « Alertes de stock ». « Indicateurs » et « Réglages de contrôle » demandent le droit « Voir les valeurs du stock ».'
      },
      {
        q: 'Que faire d’une alerte ?',
        a: 'Ouvrez l’objet concerné par son lien, regardez, puis marquez l’alerte comme traitée avec une note si utile.'
      },
      {
        q: 'Une alerte veut-elle dire qu’il y a eu un vol ?',
        a: 'Non. Elle signale seulement qu’un montant ou un taux a dépassé un seuil. Aucune retenue n’en découle.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Responsable du stock', 'Administrateur de l’agence'],
      note: 'Sans aucun des droits d’alertes ou de valeurs, l’écran est réservé : les gestes du terrain se font depuis l’écran Magasin.'
    },
    related: [
      { label: 'Les alertes du stock', helpId: 'finance.controle-stock.alertes' },
      { label: 'Les réglages de contrôle', helpId: 'finance.controle-stock.reglages' },
      { label: 'Écran Magasin', to: '/tenant/:tenantId/finance/stock/magasin' }
    ],
    keywords: ['contrôle', 'alertes', 'indicateurs', 'seuil', 'écart', 'vol', 'stock']
  },
  {
    id: 'finance.controle-stock.alertes',
    kind: 'section',
    title: 'Alertes du stock',
    summary:
      'Les alertes sont levées automatiquement quand un fait dépasse un seuil. Chacune pointe vers l’objet concerné : bon, inventaire, mouvement, facture ou pièce de caisse.',
    howToRead: {
      notes: [
        'Les alertes de montant se lèvent aux seuils de l’onglet « Réglages de contrôle » (par défaut 500 000 FCFA pour une sortie importante ; 100 000 FCFA ou 5 % de la valeur comptée pour un écart d’inventaire ; 100 000 FCFA pour des achats de matériaux en espèces).',
        '« Écart d’inventaire au-dessus du seuil » se lève à la validation, quand l’écart atteint le montant ou le pourcentage fixé. « Lignes d’inventaire écartées », « Inventaire abandonné » (avec au moins une ligne) et « Inventaire validé par son compteur » sont des informations.',
        '« Sortie importante » : un bon de sortie atteint le seuil. « Rebut important » : un rebut atteint le seuil, ou le cumul des rebuts d’un lieu sur le mois civil (une alerte « Cumul du mois »).',
        '« Facture déjà réceptionnée », « Valeur reçue supérieure à la facture » et « Réception sans prix connu » signalent une réception douteuse.',
        '« Achat de matériaux en espèces » : une pièce de caisse « matériaux » atteint le seuil, ou le cumul du mois d’un chantier (« Cumul du mois »), ce qui évite de contourner l’alerte en fractionnant.',
        '« Inventaire de chantier clos par WhatsApp » : un chef a clos son comptage ; l’alerte est « À regarder » si l’écart brut atteint un des seuils d’inventaire, sinon « Information ».'
      ]
    },
    steps: [
      { title: 'Ouvrir l’onglet « Alertes »', detail: 'Par défaut, seules les alertes « À traiter » sont listées.' },
      { title: 'Filtrer', detail: 'Statut, nature, chantier, lieu, période, ou recherche libre.' },
      {
        title: 'Ouvrir l’objet',
        detail:
          'Cliquez sur le lien de la colonne « Objet » pour voir le bon, l’inventaire, le mouvement ou la facture.'
      },
      { title: 'Marquer comme traitée', detail: 'Ajoutez une note si utile, puis confirmez.' }
    ],
    faq: [
      {
        q: 'Comment retrouver une alerte déjà traitée ?',
        a: 'Choisissez le statut « Traitées » ou « Toutes » dans la barre de filtres.'
      },
      {
        q: 'Une alerte est-elle envoyée par message ?',
        a: 'L’écran ne le dit pas : consultez cet onglet pour les voir.'
      },
      {
        q: 'Pourquoi une alerte dit-elle « Cumul du mois » ?',
        a: 'Plusieurs petits montants, tous sous le seuil, dépassent ensemble le seuil dans le mois : une seule alerte est levée pour le mois.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande le droit « Alertes de stock ».' },
    related: [
      { label: 'Tableau des alertes', helpId: 'finance.controle-stock.alertes-tableau' },
      { label: 'Régler les seuils', helpId: 'finance.controle-stock.reglages' }
    ],
    keywords: ['alerte', 'seuil', 'sortie importante', 'rebut', 'écart d’inventaire', 'espèces']
  },
  {
    id: 'finance.controle-stock.alertes-tableau',
    kind: 'table',
    title: 'Tableau des alertes',
    summary:
      'Chaque ligne est une alerte : sa gravité, son message, le montant et le seuil, le lieu, l’objet concerné, la date et le statut.',
    howToRead: {
      columns: [
        {
          key: 'gravite',
          label: 'Gravité',
          description: '« À regarder » ou « Information ».'
        },
        {
          key: 'alerte',
          label: 'Alerte',
          description: 'Titre et message ; « Cumul du mois » signale une alerte de cumul.'
        },
        {
          key: 'montant',
          label: 'Montant · seuil',
          description:
            'Le montant constaté et le seuil franchi, en FCFA. Visible avec le droit « Voir les valeurs du stock ».'
        },
        { key: 'ou', label: 'Où', description: 'Le chantier et le lieu concernés.' },
        {
          key: 'objet',
          label: 'Objet',
          description:
            'Lien vers le bon, l’inventaire, le mouvement, la facture fournisseur ou le chantier de la pièce de caisse.'
        },
        { key: 'levee', label: 'Levée le', description: 'Date à laquelle l’alerte s’est déclenchée.' },
        {
          key: 'statut',
          label: 'Statut',
          description: '« À traiter », ou la date, la personne et la note de traitement.'
        },
        { key: 'action', label: 'Action', description: '« Marquer comme traitée » (alertes à traiter).' }
      ],
      statuses: [
        { value: 'OPEN', label: 'À traiter', description: 'Dans la file à traiter.' },
        {
          value: 'ACKNOWLEDGED',
          label: 'Traitée',
          description: 'Marquée traitée par une personne, avec une note facultative.'
        },
        { value: 'WARNING', label: 'À regarder', description: 'Un seuil est franchi.' },
        { value: 'INFO', label: 'Information', description: 'Un fait à connaître, sans seuil franchi.' }
      ]
    },
    steps: [
      {
        title: 'Cliquer sur « Marquer comme traitée »',
        detail: 'Une fenêtre demande une note facultative (1 000 caractères au plus).'
      },
      { title: 'Confirmer', detail: 'L’alerte quitte la file « À traiter » et reste consultable.' }
    ],
    consequences: ['Marquer comme traitée n’annule rien : cela garde la trace que quelqu’un a regardé.'],
    faq: [
      {
        q: 'Pourquoi une alerte est-elle déjà traitée ?',
        a: 'Une autre personne l’a marquée entre-temps : l’écran l’indique et la ligne passe en « Traitée ».'
      },
      {
        q: 'Que contient l’export ?',
        a: 'Toutes les alertes correspondant à vos filtres (jusqu’à la limite d’export).'
      },
      {
        q: 'Une alerte est introuvable.',
        a: 'Si vous arrivez par un lien, l’écran élargit le statut à « Toutes » ; si elle n’existe plus, il le dit.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande le droit « Alertes de stock ».' },
    related: [{ label: 'Alertes du stock', helpId: 'finance.controle-stock.alertes' }],
    keywords: ['alertes', 'traiter', 'gravité', 'statut', 'objet']
  },
  {
    id: 'finance.controle-stock.indicateurs',
    kind: 'section',
    title: 'Indicateurs',
    summary:
      'Des chiffres mensuels pour piloter le stock : taux d’écart, inventaires validés par une autre personne, sorties avec preneur, délai de saisie. Ils portent sur des lieux et des mois, jamais sur des personnes.',
    steps: [
      { title: 'Choisir la période', detail: 'Mois de début et mois de fin, 24 mois au plus (6 mois par défaut).' },
      { title: 'Afficher', detail: 'Le bouton « Afficher » charge les chiffres.' },
      { title: 'Lire le dernier mois', detail: 'Les quatre cartes du haut portent sur le dernier mois de la période.' },
      { title: 'Détailler', detail: 'Les tableaux « Par mois » et « Par lieu et par mois » donnent le détail.' }
    ],
    faq: [
      {
        q: 'Pourquoi le taux d’écart est-il « — » ?',
        a: 'Aucun inventaire validé ce mois-là, ou valeurs non figées (inventaires validés avant le suivi), ou valeur comptée nulle.'
      },
      {
        q: 'Les chiffres désignent-ils des personnes ?',
        a: 'Non. Ils portent sur des lieux et des mois uniquement.'
      },
      {
        q: 'Pourquoi mes anciens inventaires n’y entrent-ils pas ?',
        a: 'Les inventaires validés avant la mise en place de ce contrôle n’ont pas de valeurs figées : ils ne sont pas comptés dans le taux d’écart, et l’écran donne leur nombre.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande le droit « Voir les valeurs du stock ».' },
    related: [
      { label: 'Cartes du dernier mois', helpId: 'finance.controle-stock.indicateurs-cartes' },
      { label: 'Indicateurs par mois', helpId: 'finance.controle-stock.par-mois' }
    ],
    keywords: ['indicateurs', 'taux d’écart', 'délai de saisie', 'preneur']
  },
  {
    id: 'finance.controle-stock.indicateurs-cartes',
    kind: 'section',
    title: 'Cartes du dernier mois',
    summary: 'Quatre chiffres sur le dernier mois de la période choisie.',
    howToRead: {
      notes: [
        '« Taux d’écart » : écarts des inventaires validés rapportés à la valeur comptée. Les surplus d’un inventaire d’ouverture n’y entrent pas.',
        '« Sorties avec preneur identifié » : part des sorties dont le preneur vient du carnet.',
        '« Inventaires validés par une autre personne » : part des inventaires validés par quelqu’un qui n’a pas compté.',
        '« Délai moyen de saisie » : écart moyen entre la date déclarée d’un mouvement et le jour de saisie ; l’infobulle donne la part saisie le jour même.'
      ]
    },
    faq: [
      {
        q: 'Que faire d’un taux d’écart élevé ?',
        a: 'Ouvrez les inventaires du mois et regardez les motifs. Le chiffre signale un fait, il ne juge personne.'
      },
      {
        q: 'Pourquoi 0 % de sorties avec preneur ?',
        a: 'Aucune sortie du mois n’a nommé un preneur du carnet. Vous pouvez l’exiger dans les « Réglages de contrôle ».'
      },
      {
        q: 'Un délai de saisie élevé, est-ce grave ?',
        a: 'Cela signale des saisies tardives par rapport à la date déclarée. À vous d’en comprendre la cause.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Réglages de contrôle', helpId: 'finance.controle-stock.reglages' }],
    keywords: ['taux d’écart', 'preneur', 'délai de saisie', 'indicateurs']
  },
  {
    id: 'finance.controle-stock.par-mois',
    kind: 'table',
    title: 'Indicateurs par mois',
    summary: 'Les mêmes indicateurs pour toute l’agence, un mois par ligne.',
    howToRead: {
      columns: [
        { key: 'mois', label: 'Mois', description: 'Le mois concerné.' },
        {
          key: 'ecart',
          label: 'Taux d’écart',
          description:
            'Écart des inventaires validés rapporté à la valeur comptée ; sous le taux, la part due aux lignes écartées.'
        },
        {
          key: 'non-comptees',
          label: 'Lignes non comptées',
          description: 'Nombre de lignes non comptées sur les inventaires du mois.'
        },
        {
          key: 'aveugle',
          label: 'Lignes comptées à l’aveugle',
          description: 'Part des lignes comptées par quelqu’un qui ne voyait pas la quantité attendue.'
        },
        {
          key: 'valides',
          label: 'Inventaires validés',
          description: 'Nombre d’inventaires validés, dont ceux validés par une autre personne que celle qui a compté.'
        },
        { key: 'sorties', label: 'Sorties', description: 'Nombre de sorties, dont celles avec un preneur du carnet.' },
        { key: 'rebuts', label: 'Rebuts', description: 'Valeur des rebuts en FCFA, et sa part dans les sorties.' },
        {
          key: 'delai',
          label: 'Délai moyen de saisie',
          description: 'Écart moyen, en jours, entre la date déclarée et la saisie.'
        },
        { key: 'jour-meme', label: 'Saisies le jour même', description: 'Part des mouvements saisis le jour déclaré.' }
      ]
    },
    faq: [
      { q: 'Que contient l’export ?', a: 'Les lignes du tableau pour la période choisie.' },
      {
        q: 'Pourquoi « Aucun mouvement ni inventaire sur la période » ?',
        a: 'Rien n’a été saisi sur ces mois. Élargissez la période.'
      },
      {
        q: 'Où voir le détail par lieu ?',
        a: 'Dans le tableau « Par lieu et par mois », juste en dessous.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Voir les valeurs du stock ».' },
    related: [{ label: 'Par lieu et par mois', helpId: 'finance.controle-stock.par-lieu' }],
    keywords: ['par mois', 'indicateurs', 'rebuts', 'sorties']
  },
  {
    id: 'finance.controle-stock.par-lieu',
    kind: 'table',
    title: 'Indicateurs par lieu et par mois',
    summary: 'Les mêmes indicateurs, lieu par lieu et mois par mois. Le filtre « Lieu » réduit le tableau à un lieu.',
    howToRead: {
      columns: [
        { key: 'lieu', label: 'Lieu', description: 'Le magasin ou le lieu de chantier concerné.' },
        { key: 'mois', label: 'Mois', description: 'Le mois concerné.' },
        {
          key: 'ecart',
          label: 'Taux d’écart',
          description: 'Écart des inventaires validés du lieu rapporté à leur valeur comptée.'
        },
        { key: 'non-comptees', label: 'Lignes non comptées', description: 'Lignes non comptées sur ce lieu.' },
        {
          key: 'aveugle',
          label: 'Lignes comptées à l’aveugle',
          description: 'Part des lignes comptées sans voir l’attendu.'
        },
        {
          key: 'valides',
          label: 'Inventaires validés',
          description: 'Inventaires validés, dont par une autre personne.'
        },
        { key: 'sorties', label: 'Sorties', description: 'Sorties du lieu, dont avec preneur.' },
        { key: 'rebuts', label: 'Rebuts', description: 'Valeur des rebuts du lieu et sa part.' },
        { key: 'delai', label: 'Délai moyen de saisie', description: 'Délai moyen entre date déclarée et saisie.' },
        { key: 'jour-meme', label: 'Saisies le jour même', description: 'Part saisie le jour déclaré.' }
      ]
    },
    faq: [
      {
        q: 'Comment voir un seul lieu ?',
        a: 'Choisissez-le dans le champ « Lieu » au-dessus du tableau ; « Tous les lieux » revient à la vue complète.'
      },
      { q: 'Que contient l’export ?', a: 'Les lignes affichées, donc selon le lieu choisi.' },
      { q: 'Une ligne manque pour un mois.', a: 'Aucun mouvement ni inventaire sur ce lieu ce mois-là.' }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Voir les valeurs du stock ».' },
    related: [{ label: 'Indicateurs par mois', helpId: 'finance.controle-stock.par-mois' }],
    keywords: ['par lieu', 'indicateurs', 'chantier', 'magasin']
  },
  {
    id: 'finance.controle-stock.reglages',
    kind: 'section',
    title: 'Réglages de contrôle',
    summary:
      'Fixez les seuils d’alerte, l’ancienneté maximale des dates et l’exigence d’un preneur du carnet. Les seuils proposés sont des points de départ.',
    howToRead: {
      notes: [
        '« Antériorité maximale d’une date de mouvement » : une réception, une sortie, un transfert ou un inventaire ne peut pas être daté de plus loin (7 jours au départ, 365 au plus). Pour reprendre un historique, relevez la borne le temps de l’import, puis remettez-la.',
        '« Exiger un preneur du carnet » : activé, chaque sortie et chaque transfert doit nommer un preneur du carnet ; désactivé, un nom saisi à la main suffit.',
        '« Sortie importante » : alerte quand un bon de sortie ou un rebut atteint ce montant (500 000 FCFA au départ).',
        '« Écart d’inventaire — montant » et « — taux » : alerte quand l’écart d’un inventaire validé atteint le montant (100 000 FCFA au départ) ou le pourcentage de la valeur comptée (5 % au départ).',
        '« Achats de matériaux en espèces » : alerte quand une pièce de caisse de matériaux, ou leur cumul du mois sur un chantier, atteint ce montant (100 000 FCFA au départ).',
        '« Postes « matériaux » » : les postes de dépense retenus pour l’alerte d’achats en espèces. Sans choix, ceux proposés par vos articles sont retenus.'
      ]
    },
    steps: [
      { title: 'Modifier un réglage', detail: 'Saisissez la valeur ; chaque seuil doit être supérieur à zéro.' },
      { title: 'Désactiver une alerte', detail: 'Cochez « Désactiver cette alerte » ou laissez le seuil vide.' },
      {
        title: 'Enregistrer',
        detail: '« Enregistrer les réglages » ; « Annuler les modifications » remet les valeurs enregistrées.'
      }
    ],
    consequences: [
      'Les nouveaux seuils s’appliquent aux alertes futures. Les alertes déjà levées ne changent pas.',
      'Le réglage est tracé : l’écran indique qui l’a modifié et quand.',
      'Un seuil à zéro est refusé : il ferait sonner l’alerte à chaque opération.'
    ],
    faq: [
      {
        q: 'Pourquoi les champs sont-ils grisés ?',
        a: 'Seule une personne qui peut paramétrer la finance de l’agence modifie ces réglages. Vous pouvez les lire.'
      },
      {
        q: 'Comment désactiver une alerte ?',
        a: 'Cochez « Désactiver cette alerte » à côté de son seuil, puis enregistrez.'
      },
      {
        q: 'Quels seuils choisir ?',
        a: 'Les valeurs proposées sont des points de départ : adaptez-les à la taille de vos chantiers.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Lire demande « Voir les valeurs du stock ». Modifier demande « Paramétrer le module financier ».'
    },
    related: [{ label: 'Les alertes du stock', helpId: 'finance.controle-stock.alertes' }],
    keywords: ['seuil', 'réglages', 'antériorité', 'preneur', 'alerte', 'FCFA', 'matériaux']
  },

  // ===========================================================================
  // Comptages terrain
  // ===========================================================================
  {
    id: 'finance.comptages-terrain.page',
    kind: 'page',
    title: 'Comptages terrain',
    summary:
      'Voyez, lieu par lieu et article par article, le stock théorique et le dernier comptage physique, qu’il vienne du bureau ou d’un chef de chantier par WhatsApp.',
    purpose:
      'Les comptages faits par WhatsApp entrent dans l’inventaire du lieu. Le stock ne change qu’à la validation de l’inventaire, par une autre personne que celle qui a compté.',
    steps: [
      { title: 'Filtrer', detail: 'Par chantier, lieu, article ou source du dernier comptage (WhatsApp ou Web).' },
      { title: 'Lire la ligne', detail: 'Comparez « Stock théorique » et « Dernier comptage ».' },
      { title: 'Voir la preuve', detail: '« Voir la photo » ouvre la photo, son analyse et ce que le chef a fait.' },
      { title: 'Ouvrir l’inventaire', detail: '« Ouvrir l’inventaire » mène à l’inventaire qui porte ce comptage.' }
    ],
    consequences: [
      'Quand un chef clôt son comptage par WhatsApp, une ligne « non comptée » est créée pour chaque article du lieu qu’il n’a pas photographié. Le validateur peut les écarter en une fois depuis l’inventaire.',
      'Cet écran ne change rien au stock : il se lit seulement.'
    ],
    faq: [
      {
        q: 'Pourquoi « Comptage en cours » à la place d’une quantité ?',
        a: 'Un inventaire est en cours sur le lieu : les quantités restent masquées jusqu’à la clôture du comptage.'
      },
      {
        q: 'Pourquoi aucun comptage ne s’affiche-t-il ?',
        a: 'Aucun comptage ne correspond aux filtres, ou aucun chef de chantier n’est inscrit. Si vous pouvez les inscrire, le bouton « Inscrire un chef de chantier » vous mène à l’écran WhatsApp.'
      },
      {
        q: 'La colonne « Valeur » manque.',
        a: 'Elle demande le droit « Voir les valeurs du stock ».'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Magasinier', 'Responsable du stock'],
      note: 'Demande « Consulter le stock ». Le bouton d’inscription demande « Paramétrer le module financier ».'
    },
    related: [
      { label: 'Tableau des comptages terrain', helpId: 'finance.comptages-terrain.tableau' },
      { label: 'Inventaire par WhatsApp', helpId: 'finance.whatsapp.page' },
      { label: 'Inventaires', helpId: 'finance.inventaire.page' }
    ],
    keywords: ['comptage terrain', 'photo', 'WhatsApp', 'dernier comptage', 'stock théorique']
  },
  {
    id: 'finance.comptages-terrain.tableau',
    kind: 'table',
    title: 'Tableau des comptages terrain',
    summary:
      'Une ligne par article et par lieu, avec le stock théorique, le dernier comptage, son auteur, sa source et l’inventaire concerné.',
    howToRead: {
      columns: [
        { key: 'location', label: 'Lieu', description: 'Le lieu, avec le chantier en dessous.' },
        { key: 'item', label: 'Article', description: 'Le nom et la référence de l’article.' },
        {
          key: 'theoretical',
          label: 'Stock théorique',
          description: 'Ce que le système annonce. « Comptage en cours » quand le lieu est en cours de comptage.'
        },
        {
          key: 'value',
          label: 'Valeur',
          description: 'La valeur du stock théorique en FCFA, avec le droit « Voir les valeurs du stock ».'
        },
        { key: 'last', label: 'Dernier comptage', description: 'La dernière quantité comptée, ou « Non compté ».' },
        { key: 'at', label: 'Date et heure', description: 'Date et heure du serveur.' },
        { key: 'by', label: 'Compté par', description: 'La personne qui a compté.' },
        {
          key: 'source',
          label: 'Source',
          description: '« WhatsApp » ou « Web » ; « corrigé » si le chef a corrigé la proposition.'
        },
        {
          key: 'count',
          label: 'Inventaire',
          description: 'L’état de l’inventaire et le lien « Ouvrir l’inventaire ».'
        },
        { key: 'photo', label: 'Photo', description: '« Voir la photo », ou « Photo retirée ».' }
      ],
      statuses: [
        { value: 'WHATSAPP', label: 'WhatsApp', description: 'Comptage fait par un chef de chantier par photo.' },
        { value: 'WEB', label: 'Web', description: 'Comptage saisi dans ImmoTopia.' },
        { value: 'DRAFT', label: 'Comptage en cours', description: 'L’inventaire n’est pas clos.' },
        { value: 'COUNTED', label: 'Comptage clos', description: 'Écarts à justifier puis validation.' },
        { value: 'VALIDATED', label: 'Validé', description: 'Écarts appliqués au stock.' },
        { value: 'CANCELLED', label: 'Abandonné', description: 'Inventaire sans ajustement.' }
      ],
      notes: ['Aucune colonne d’écart ici : les écarts se lisent dans l’inventaire, après sa clôture.']
    },
    faq: [
      {
        q: 'Comment lire « Non compté » ?',
        a: 'L’inventaire contient l’article, mais personne ne l’a compté : il sera écarté ou recompté.'
      },
      {
        q: 'Pourquoi « Charger plus » ?',
        a: 'La liste se charge par paquets de 50 lignes : le bouton affiche la suite.'
      },
      {
        q: 'Que contient l’export ?',
        a: 'Toutes les lignes correspondant à vos filtres, au-delà de la page affichée.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Consulter le stock ».' },
    related: [{ label: 'Voir la photo de preuve', helpId: 'finance.whatsapp.photo-preuve' }],
    keywords: ['comptage', 'dernier comptage', 'source', 'photo', 'inventaire']
  },

  // ===========================================================================
  // Inventaire par WhatsApp
  // ===========================================================================
  {
    id: 'finance.whatsapp.page',
    kind: 'page',
    title: 'Inventaire par WhatsApp',
    summary:
      'Inscrivez vos chefs de chantier pour qu’ils comptent le stock en envoyant une photo par WhatsApp. Cet écran suit aussi le quota du mois, l’état de la passerelle et les mesures.',
    purpose:
      'Le chef envoie une photo d’un article, l’analyse propose un total, il le valide ou le corrige, et le comptage entre dans l’inventaire du chantier. Le stock ne change qu’à la validation de l’inventaire au bureau.',
    steps: [
      {
        title: 'Vérifier l’état',
        detail:
          'Les trois cartes du haut disent si la passerelle est prête, où en est le quota du mois et si l’analyse des photos est active.'
      },
      {
        title: 'Inscrire un chef de chantier',
        detail: 'Onglet « Chefs de chantier » : numéro WhatsApp et chantiers (1 à 10).'
      },
      {
        title: 'Donner le code',
        detail: 'Le code à 6 chiffres s’affiche une seule fois : le chef l’envoie au numéro du bot.'
      },
      {
        title: 'Suivre',
        detail:
          'Consultez les conversations, les photos de preuve (écran « Comptages terrain ») et l’onglet « Mesures ».'
      }
    ],
    consequences: [
      'À la fin du comptage (message FIN, changement de chantier ou 30 minutes sans réponse), l’inventaire du chantier est clos et transmis au bureau, qui le vérifie et le valide.',
      'Un comptage WhatsApp ne valide rien et n’ajuste aucun stock.',
      'Tout message de prise en charge dépend de la mise en service de WhatsApp : si votre agence l’a activé, la carte « Passerelle » le dit.'
    ],
    faq: [
      {
        q: 'Pourquoi l’écran dit-il « Réservé aux administrateurs du stock » ?',
        a: 'L’inscription des chefs de chantier demande le droit « Paramétrer le module financier ».'
      },
      {
        q: 'Mon chef n’a pas de réponse du bot.',
        a: 'Vérifiez la carte « Passerelle » (connectée ou non), l’état de l’inscription (code envoyé ?), et le quota du mois.'
      },
      {
        q: 'Les chefs ont-ils besoin d’un compte ImmoTopia ?',
        a: 'Oui : ils doivent être membres de l’agence avec le rôle « Chef de chantier » pour être inscrits.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Administrateur de l’agence'],
      note: 'Demande « Paramétrer le module financier ». L’inventaire par WhatsApp est une option payante : sans elle, le bot refuse les photos.'
    },
    related: [
      { label: 'Chefs de chantier et inscriptions', helpId: 'finance.whatsapp.chefs' },
      { label: 'Passerelle, quota et analyse', helpId: 'finance.whatsapp.etat' },
      { label: 'Comptages terrain', helpId: 'finance.comptages-terrain.page' }
    ],
    keywords: ['whatsapp', 'inventaire par photo', 'chef de chantier', 'bot', 'quota', 'photo'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'whatsapp-etat',
          title: 'L’état du service',
          description:
            'Passerelle, photos analysées ce mois-ci et analyse : lisez ces cartes avant d’inscrire quelqu’un.'
        },
        {
          target: 'whatsapp-onglets',
          title: 'Les onglets',
          description:
            '« Chefs de chantier » pour les inscriptions, « Simulateur » (en mode recette seulement) et « Mesures » pour suivre la qualité.'
        },
        {
          target: 'whatsapp-inscrire',
          title: 'Inscrire un chef',
          description:
            'Choisissez le chef, son numéro WhatsApp et ses chantiers. Un code d’activation s’affiche une seule fois.'
        },
        {
          target: 'whatsapp-chefs',
          title: 'Les inscriptions',
          description:
            'Le menu « ⋮ » d’une ligne permet de modifier les chantiers, régénérer le code, voir les conversations ou révoquer.'
        }
      ]
    }
  },
  {
    id: 'finance.whatsapp.etat',
    kind: 'section',
    title: 'Passerelle, quota et analyse',
    summary:
      'Trois cartes disent si le service peut fonctionner : la passerelle WhatsApp, le quota de photos analysées du mois et l’analyse des photos.',
    howToRead: {
      notes: [
        'Passerelle : « Connectée à WhatsApp » quand la mise en service est complète ; « Configuration incomplète » quand elle ne l’est pas ; « Désactivée sur ce serveur » quand elle n’est pas activée ; « Mode recette : aucun message n’est envoyé, utilisez le simulateur » pour les essais. Le numéro du bot à donner aux chefs s’affiche quand il est connu.',
        'Photos analysées ce mois-ci : photos déjà analysées sur le total autorisé. Une photo ne compte que si son analyse a abouti ; elle est rendue au quota si l’analyse échoue. La barre passe en orange à partir de 80 %.',
        'Sous le quota : le nombre de blocs de 500 photos souscrits, ou « Option non souscrite. Le bot refuse les photos », ou un quota provisoire le temps de la mise en place.',
        'Analyse : le fournisseur et le modèle quand elle est active ; sinon l’analyse est désactivée et le bot répond qu’il ne peut pas analyser les photos.'
      ]
    },
    consequences: [
      'Quota atteint ou option non souscrite : le bot refuse les nouvelles photos et dit au chef de contacter l’administrateur. Le bureau peut saisir le comptage dans ImmoTopia.',
      'Le lien « Voir l’abonnement » apparaît quand l’option n’est pas souscrite.'
    ],
    faq: [
      {
        q: 'Que faire si la passerelle est « Désactivée sur ce serveur » ?',
        a: 'Le service n’est pas encore mis en service pour votre installation. Rapprochez-vous de l’équipe ImmoTopia : inutile d’inscrire des chefs avant.'
      },
      {
        q: 'Combien de photos puis-je analyser par mois ?',
        a: 'Le total est celui affiché sur la carte, selon les blocs de 500 photos de votre option.'
      },
      {
        q: 'Le quota est consommé : que faire ?',
        a: 'Contactez ImmoTopia pour ajouter un bloc, ou faites saisir les comptages au bureau.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Paramétrer le module financier ».' },
    related: [{ label: 'Inventaire par WhatsApp', helpId: 'finance.whatsapp.page' }],
    keywords: ['passerelle', 'quota', 'photos analysées', 'bloc de 500', 'analyse', 'numéro du bot']
  },
  {
    id: 'finance.whatsapp.chefs',
    kind: 'section',
    title: 'Chefs de chantier',
    summary:
      'Inscrivez les chefs de chantier qui comptent par WhatsApp. Leur numéro sert seulement à les reconnaître ; ils activent leur inscription avec un code.',
    purpose:
      'Circuit complet : vous inscrivez le chef, il envoie le code au numéro du bot depuis son téléphone, puis il envoie une photo par article. Le bot propose un total ; le chef valide, corrige ou annule. Il tape FIN quand il a terminé.',
    steps: [
      {
        title: 'Inscrire',
        detail:
          '« Inscrire un chef de chantier » : choisissez le chef, saisissez son numéro WhatsApp, choisissez ses chantiers.'
      },
      { title: 'Donner le code', detail: 'Notez ou copiez la consigne affichée une seule fois.' },
      { title: 'Le chef active', detail: 'Il envoie le code à 6 chiffres, depuis son numéro, au numéro du bot.' },
      {
        title: 'Il compte',
        detail: 'Une photo par article, de face, en entier. Le bot répond ; le chef tape 1, un nombre ou 0.'
      },
      { title: 'Il termine', detail: 'FIN termine ; CHANTIER change de chantier ; AIDE rappelle les consignes.' }
    ],
    consequences: [
      'Les photos reçues sont analysées par un service d’intelligence artificielle et conservées comme preuve de l’inventaire : informez vos chefs avant de les inscrire.',
      'Le chef ne voit jamais la quantité attendue : le bot ne parle pas d’écart ni d’alerte.',
      'Sans réponse du chef pendant 10 minutes, le bot le relance ; à 30 minutes sans réponse, la session se termine, une photo en attente n’est pas enregistrée et le comptage est transmis.',
      'Un chef peut avoir plusieurs chantiers (10 au plus) ; le bot lui demande sur lequel il se trouve.'
    ],
    faq: [
      {
        q: 'Pourquoi un membre n’apparaît-il pas dans la liste ?',
        a: 'Il doit être membre actif de l’agence avec le rôle « Chef de chantier ». Attribuez-le dans Collaborateurs.'
      },
      {
        q: 'Un numéro peut-il être inscrit deux fois ?',
        a: 'Non : un numéro n’a qu’une inscription non révoquée. Si le numéro est refusé, il est déjà utilisé ou invalide.'
      },
      {
        q: 'Que fait le bot quand le chef corrige la quantité ?',
        a: 'Le chef tape le nombre exact ; la ligne est enregistrée comme « Corrigée par le chef ».'
      },
      {
        q: 'Si l’article a déjà une ligne ?',
        a: 'Le bot demande d’additionner, de remplacer ou d’annuler.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      roles: ['Administrateur de l’agence'],
      note: 'Inscrire demande « Paramétrer le module financier ». Le chef lui-même ne porte que le droit « Compter ».'
    },
    related: [
      { label: 'Tableau des inscriptions', helpId: 'finance.whatsapp.inscriptions' },
      { label: 'Inscrire un chef de chantier', helpId: 'finance.whatsapp.inscrire' }
    ],
    keywords: ['chef de chantier', 'inscription', 'FIN', 'AIDE', 'CHANTIER', 'photo', 'bot']
  },
  {
    id: 'finance.whatsapp.inscriptions',
    kind: 'table',
    title: 'Chefs de chantier inscrits',
    summary:
      'Chaque ligne est l’inscription d’un chef de chantier : son numéro masqué, ses chantiers, son état, son accès et son dernier message.',
    howToRead: {
      columns: [
        { key: 'chef', label: 'Chef', description: 'Le chef de chantier inscrit.' },
        { key: 'phone', label: 'Téléphone', description: 'Le numéro WhatsApp, masqué en partie.' },
        {
          key: 'sites',
          label: 'Chantiers',
          description:
            'Les chantiers du chef. Un chantier barré n’est plus éligible (infobulle : clos, non basculé au stock ou lieu inactif).'
        },
        {
          key: 'status',
          label: 'État',
          description: 'En attente du code (avec la date limite), actif ou révoqué.'
        },
        {
          key: 'access',
          label: 'Accès',
          description:
            'Vide quand tout va bien. Sinon le motif : agence suspendue, adhésion inactive, compte désactivé, rôle Chef de chantier retiré, option non souscrite.'
        },
        { key: 'last', label: 'Dernier message', description: 'Date et heure du dernier message reçu de ce chef.' },
        {
          key: 'actions',
          label: 'Actions',
          description: 'Menu « ⋮ » : modifier les chantiers, régénérer le code, voir les conversations, révoquer.'
        }
      ],
      statuses: [
        {
          value: 'PENDING_ACTIVATION',
          label: 'En attente du code',
          description: 'Le chef n’a pas encore envoyé son code, valable jusqu’à la date indiquée.'
        },
        { value: 'ACTIVE', label: 'Actif', description: 'Le chef a envoyé le bon code : il peut compter.' },
        { value: 'REVOKED', label: 'Révoqué', description: 'L’accès est retiré ; le bot refuse ses messages.' }
      ]
    },
    steps: [
      { title: 'Modifier les chantiers', detail: 'Menu « ⋮ », « Modifier les chantiers » (inscription non révoquée).' },
      { title: 'Régénérer le code', detail: 'Menu « ⋮ », « Régénérer le code » (inscription en attente du code).' },
      { title: 'Voir les conversations', detail: 'Menu « ⋮ », « Voir les conversations ».' },
      { title: 'Révoquer', detail: 'Menu « ⋮ », « Révoquer » (inscription non révoquée).' }
    ],
    faq: [
      {
        q: 'Que contient l’export ?',
        a: 'Les chefs de chantier inscrits selon vos filtres, sans le numéro complet.'
      },
      {
        q: 'Pourquoi une colonne « Accès » est-elle remplie ?',
        a: 'Le chef est inscrit mais ne peut plus compter pour le motif indiqué. Corrigez la cause (rôle, compte, option) ou révoquez.'
      },
      {
        q: 'Où voir ce que le chef a envoyé ?',
        a: 'Dans « Voir les conversations », puis sur l’écran « Comptages terrain » pour les photos.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Paramétrer le module financier ».' },
    related: [
      { label: 'Code d’activation', helpId: 'finance.whatsapp.code-activation' },
      { label: 'Révoquer un accès', helpId: 'finance.whatsapp.revocation' }
    ],
    keywords: ['inscriptions', 'chefs', 'numéro', 'état', 'accès', 'révoqué']
  },
  {
    id: 'finance.whatsapp.inscrire',
    kind: 'section',
    title: 'Inscrire un chef de chantier',
    summary:
      'Choisissez un chef de chantier, son numéro WhatsApp et ses chantiers. Il recevra un code d’activation à envoyer au numéro du bot.',
    steps: [
      {
        title: 'Chef de chantier',
        detail: 'Seuls les membres avec le rôle « Chef de chantier » sont proposés ; ceux déjà inscrits sont grisés.'
      },
      { title: 'Numéro WhatsApp', detail: 'Format ivoirien (07 12 34 56 78) ou international (+225…).' },
      {
        title: 'Chantiers',
        detail: 'Au moins un, dix au plus. Seuls les chantiers ouverts et basculés au stock sont proposés.'
      },
      { title: 'Inscrire', detail: 'Le code d’activation s’affiche alors dans une fenêtre.' }
    ],
    consequences: [
      'L’inscription reste « En attente du code » jusqu’à ce que le chef envoie le code depuis son numéro.',
      'Ce message prouve que le chef utilise bien ce numéro et vaut son accord pour recevoir les réponses du bot.',
      'Un numéro ne peut avoir qu’une inscription non révoquée.'
    ],
    faq: [
      {
        q: 'Aucun membre n’est proposé.',
        a: 'Aucun membre n’a le rôle « Chef de chantier ». Attribuez-le dans Collaborateurs ; un lien vous y mène.'
      },
      {
        q: 'Mon chantier est grisé ou refusé.',
        a: 'Il doit être ouvert, basculé au stock et avoir un lieu actif.'
      },
      {
        q: 'Mon numéro est refusé.',
        a: 'Il est invalide, ou déjà utilisé par une inscription non révoquée.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Paramétrer le module financier ».' },
    related: [{ label: 'Code d’activation', helpId: 'finance.whatsapp.code-activation' }],
    keywords: ['inscrire', 'numéro WhatsApp', 'chantiers', '+225', 'chef']
  },
  {
    id: 'finance.whatsapp.code-activation',
    kind: 'section',
    title: 'Code d’activation',
    summary:
      'Ce code à 6 chiffres relie le numéro du chef à ImmoTopia. Il ne s’affiche qu’une seule fois : notez-le ou copiez la consigne avant de fermer.',
    steps: [
      { title: 'Lire le code', detail: 'Il est affiché en deux groupes de trois chiffres, avec le numéro du bot.' },
      { title: 'Copier la consigne', detail: '« Copier la consigne » prépare la phrase à envoyer au chef.' },
      { title: 'Transmettre au chef', detail: 'Il ouvre WhatsApp, écrit au numéro du bot et envoie le code.' },
      { title: 'Fermer', detail: 'La fenêtre ne peut plus être rouverte avec le code.' }
    ],
    consequences: [
      'Valable 72 heures et 5 essais. Passé ce délai ou après 5 mauvais essais, le code ne marche plus : régénérez-en un.',
      'Le code n’est pas conservé en clair : une fois la fenêtre fermée, il ne peut pas être relu.',
      'Le chef passe à « Actif » dès qu’il envoie le bon code.'
    ],
    faq: [
      {
        q: 'J’ai fermé la fenêtre sans noter le code.',
        a: 'Dans le menu « ⋮ » de l’inscription, choisissez « Régénérer le code » : un nouveau code remplace l’ancien.'
      },
      {
        q: 'Le chef a épuisé ses essais.',
        a: 'Régénérez le code pour lui en donner un nouveau.'
      },
      {
        q: 'Que doit écrire le chef ?',
        a: 'Le code à 6 chiffres, seul ou dans une phrase : seuls les chiffres comptent.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Paramétrer le module financier ».' },
    related: [{ label: 'Tableau des inscriptions', helpId: 'finance.whatsapp.inscriptions' }],
    keywords: ['code', 'activation', '72 heures', 'régénérer', 'essais']
  },
  {
    id: 'finance.whatsapp.chantiers',
    kind: 'section',
    title: 'Modifier les chantiers',
    summary: 'Remplacez la liste des chantiers d’un chef inscrit. Le chef ne comptera que sur ces chantiers.',
    steps: [
      { title: 'Ouvrir la fenêtre', detail: 'Menu « ⋮ » de l’inscription, « Modifier les chantiers ».' },
      { title: 'Choisir', detail: 'Un à dix chantiers ouverts et basculés au stock.' },
      { title: 'Enregistrer', detail: 'La liste remplace l’ancienne.' }
    ],
    consequences: ['Un chantier devenu inéligible reste visible, barré, pour que vous puissiez le retirer.'],
    faq: [
      { q: 'Pourquoi un chantier est-il barré ?', a: 'Il est clos, non basculé au stock ou son lieu est inactif.' },
      { q: 'Combien de chantiers au plus ?', a: 'Dix.' },
      { q: 'Puis-je modifier une inscription révoquée ?', a: 'Non. L’action n’est pas proposée.' }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Paramétrer le module financier ».' },
    related: [{ label: 'Chefs de chantier inscrits', helpId: 'finance.whatsapp.inscriptions' }],
    keywords: ['chantiers', 'modifier', 'affecter']
  },
  {
    id: 'finance.whatsapp.revocation',
    kind: 'section',
    title: 'Révoquer l’accès',
    summary: 'Retirez à un chef l’accès à l’inventaire par WhatsApp. Le bot refusera ses prochains messages.',
    steps: [
      { title: 'Ouvrir la fenêtre', detail: 'Menu « ⋮ » de l’inscription, « Révoquer ».' },
      { title: 'Motif', detail: 'Facultatif, 500 caractères au plus.' },
      { title: 'Révoquer', detail: 'Confirmez avec le bouton « Révoquer ».' }
    ],
    consequences: [
      'Le bot refuse les prochains messages de ce numéro.',
      'Une photo en attente de réponse est abandonnée.',
      'La révocation est définitive pour cette inscription : pour rétablir l’accès, inscrivez à nouveau le chef.'
    ],
    faq: [
      { q: 'Les comptages déjà faits sont-ils supprimés ?', a: 'Non. Les lignes et les photos de preuve restent.' },
      { q: 'Le motif est-il obligatoire ?', a: 'Non, il est facultatif.' },
      {
        q: 'Le chef est-il prévenu ?',
        a: 'L’écran ne l’annonce pas ; il verra seulement les refus du bot à ses prochains messages.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Paramétrer le module financier ».' },
    related: [{ label: 'Chefs de chantier inscrits', helpId: 'finance.whatsapp.inscriptions' }],
    keywords: ['révoquer', 'retirer l’accès', 'chef', 'bloquer']
  },
  {
    id: 'finance.whatsapp.conversations',
    kind: 'section',
    title: 'Conversations d’un chef',
    summary:
      'Relisez les sessions de comptage d’un chef : l’heure, le chantier, l’état de la session et le fil des messages échangés avec le bot.',
    howToRead: {
      statuses: [
        {
          value: 'AWAITING_SITE',
          label: 'Choix du chantier',
          description: 'Le bot attend que le chef choisisse son chantier.'
        },
        { value: 'ANALYZING', label: 'Analyse de la photo', description: 'Une photo est en cours d’analyse.' },
        {
          value: 'AWAITING_ITEM',
          label: 'Choix de l’article',
          description: 'Le bot attend que le chef indique l’article.'
        },
        {
          value: 'AWAITING_CONFIRMATION',
          label: 'Attente de confirmation',
          description: 'Le chef doit valider, corriger ou annuler le total proposé.'
        },
        {
          value: 'AWAITING_MERGE',
          label: 'Attente du choix ajouter ou remplacer',
          description: 'L’article a déjà une ligne dans l’inventaire.'
        },
        { value: 'READY', label: 'Prête pour une photo', description: 'Le bot attend la prochaine photo.' },
        {
          value: 'CLOSED',
          label: 'Close',
          description:
            'Session terminée : FIN, changement de chantier, sans réponse, accès perdu, inscription révoquée ou aucun chantier ouvert.'
        }
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: 'Menu « ⋮ » de l’inscription, « Voir les conversations ».' },
      {
        title: 'Déplier une session',
        detail:
          'Cliquez sur une session pour lire le fil. Une photo n’est pas chargée ici : le fil dit seulement qu’elle a été reçue.'
      }
    ],
    consequences: [
      'La lecture d’une conversation est réservée aux personnes qui paramètrent la finance ou valident les inventaires.'
    ],
    faq: [
      { q: 'Où voir la photo ?', a: 'Dans l’écran « Comptages terrain », avec « Voir la photo ».' },
      { q: 'Pourquoi « Aucune conversation » ?', a: 'Ce chef n’a encore envoyé aucun message.' },
      {
        q: 'Qui peut lire les conversations ?',
        a: 'Les personnes qui ont le droit « Paramétrer le module financier » ou « Valider les inventaires ».'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Demande « Paramétrer le module financier » ou « Valider les inventaires ».'
    },
    related: [{ label: 'Photo de preuve', helpId: 'finance.whatsapp.photo-preuve' }],
    keywords: ['conversation', 'messages', 'session', 'fil']
  },
  {
    id: 'finance.whatsapp.simulateur',
    kind: 'section',
    title: 'Simulateur',
    summary:
      'Jouez une conversation avec le bot sans WhatsApp, pour les essais de recette. Les messages ne partent pas sur WhatsApp.',
    purpose:
      'L’onglet n’existe que lorsque le service est en mode recette. Il sert à vérifier le parcours d’un chef : activation, choix du chantier, photo, validation, FIN.',
    steps: [
      { title: 'Choisir l’expéditeur', detail: 'Un chef inscrit (numéro masqué et état) ou « Numéro inconnu ».' },
      {
        title: 'Écrire un message',
        detail: 'Texte libre, 1 000 caractères au plus ; les boutons de réponse du bot se cliquent dans le fil.'
      },
      { title: 'Envoyer une photo', detail: 'JPEG, PNG ou WebP, 10 Mo au plus ; une légende est possible.' },
      {
        title: 'Avancer le temps',
        detail:
          'Pendant une session, « Avancer de 10 minutes » ou « de 30 minutes » simule la relance et la fin sans réponse.'
      }
    ],
    consequences: [
      'Les comptages obtenus s’enregistrent vraiment dans l’inventaire du chantier ; la source est notée « simulateur (recette) » sur la preuve.',
      'Pour un chef révoqué, le bot doit répondre que l’accès est retiré.'
    ],
    faq: [
      {
        q: 'Pourquoi l’onglet « Simulateur » n’apparaît-il pas ?',
        a: 'Il n’est proposé que si le service est en mode recette. Sinon, utilisez un vrai téléphone.'
      },
      {
        q: 'À quoi sert le champ « Légende » ?',
        a: 'Aux essais avec le fournisseur d’analyse de recette, qui lit des consignes dans la légende pour imposer un résultat.'
      },
      { q: 'Les messages arrivent-ils chez le chef ?', a: 'Non : « les messages ne partent pas sur WhatsApp ».' }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Paramétrer le module financier ».' },
    related: [{ label: 'Chefs de chantier', helpId: 'finance.whatsapp.chefs' }],
    keywords: ['simulateur', 'recette', 'essai', 'test', 'photo', 'légende']
  },
  {
    id: 'finance.whatsapp.mesures',
    kind: 'section',
    title: 'Mesures',
    summary:
      'Suivez, mois par mois, la qualité de l’inventaire par WhatsApp pour toute l’agence : photos analysées, rapidité, taux de validation sans correction.',
    howToRead: {
      notes: [
        '« Photos analysées » : nombre de photos analysées dans le mois.',
        '« Délai médian jusqu’à la confirmation » : temps typique entre la photo et la réponse du chef. Objectif : moins de 45 s.',
        '« Comptages validés sans correction » : part des propositions que le chef a validées telles quelles. Objectif : 88 % et plus.',
        '« Lignes avec photo de preuve » : part des lignes WhatsApp qui portent encore leur photo. Objectif : 100 %.',
        '« Photos illisibles », « Articles non reconnus », « Analyses en échec » : part des photos analysées concernées.'
      ]
    },
    steps: [{ title: 'Choisir le mois', detail: 'Le sélecteur de mois change tous les chiffres.' }],
    faq: [
      {
        q: 'Les mesures désignent-elles des personnes ?',
        a: 'Non : « Mesures de l’agence entière. Aucune mesure par personne. »'
      },
      { q: 'Pourquoi des tirets « — » ?', a: 'Aucune donnée ce mois-là pour ce chiffre.' },
      {
        q: 'Que faire si beaucoup de photos sont illisibles ?',
        a: 'Rappelez aux chefs de photographier de face, en entier, avec le flash si besoin.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Paramétrer le module financier ».' },
    related: [{ label: 'Inventaire par WhatsApp', helpId: 'finance.whatsapp.page' }],
    keywords: ['mesures', 'qualité', 'taux', 'délai', 'photos illisibles']
  },
  {
    id: 'finance.whatsapp.photo-preuve',
    kind: 'section',
    title: 'Comptage par photo',
    summary:
      'Ce volet montre la preuve d’un comptage fait par WhatsApp : la photo, son empreinte, l’analyse proposée et ce que le chef en a fait.',
    howToRead: {
      statuses: [
        { value: 'ACCEPTED', label: 'Validée telle quelle', description: 'Le chef a accepté la proposition.' },
        { value: 'CORRECTED', label: 'Corrigée par le chef', description: 'Le chef a tapé une autre quantité.' },
        { value: 'CANCELLED', label: 'Annulée', description: 'Le chef a annulé : rien n’est enregistré.' },
        { value: 'EXPIRED', label: 'Abandonnée (sans réponse)', description: 'Le chef n’a pas répondu à temps.' },
        {
          value: 'UNREADABLE',
          label: 'Photo illisible',
          description: 'Photo trop sombre, floue ou sans matériau visible.'
        },
        { value: 'UNRECOGNIZED', label: 'Article non reconnu', description: 'L’article n’a pas pu être identifié.' },
        {
          value: 'FAILED',
          label: 'Analyse en échec',
          description: 'Délai dépassé, service indisponible, réponse illisible ou analyse désactivée.'
        },
        {
          value: 'PENDING',
          label: 'En attente de la réponse du chef',
          description: 'La proposition attend sa réponse.'
        },
        { value: 'RECEIVED', label: 'Photo reçue, analyse en cours', description: 'L’analyse n’est pas terminée.' }
      ],
      notes: [
        '« Preuve » : date et heure du serveur, empreinte du fichier (toute modification serait détectable), canal, chef, chantier.',
        '« Analyse » : méthode de comptage (sacs empilés, barres ou tubes en fagot, blocs sur palette, autre), total proposé, confiance et qualité de la photo.',
        '« Ce que le chef a fait » : issue, quantité retenue, ajout ou remplacement d’un comptage existant, lien vers l’inventaire.'
      ]
    },
    steps: [
      {
        title: 'Ouvrir',
        detail: '« Voir la photo » depuis « Comptages terrain », ou le lien de photo d’une ligne d’inventaire.'
      },
      { title: 'Lire la conversation', detail: '« Voir la conversation » (pour les personnes autorisées).' },
      { title: 'Retirer la photo', detail: '« Retirer la photo », avec un motif de 3 à 500 caractères.' }
    ],
    consequences: [
      'Retirer la photo efface le fichier : le comptage et l’empreinte restent. Faites-le par exemple si la photo montre une personne.',
      'Le retrait est tracé (qui, quand, pourquoi) et irréversible.'
    ],
    faq: [
      { q: 'Qui peut retirer une photo ?', a: 'Les personnes qui ont le droit « Rebuts et retours ».' },
      {
        q: 'La photo disparaît-elle du comptage ?',
        a: 'Seul le fichier est effacé ; la ligne et son empreinte restent.'
      },
      {
        q: 'Pourquoi « La photo n’a pas pu être chargée » ?',
        a: 'Le fichier est indisponible momentanément : réessayez plus tard.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Lire demande « Consulter le stock ». Retirer la photo demande « Rebuts et retours ».'
    },
    related: [{ label: 'Comptages terrain', helpId: 'finance.comptages-terrain.page' }],
    keywords: ['photo', 'preuve', 'empreinte', 'analyse', 'confiance', 'retirer']
  }
];

export default entries;
