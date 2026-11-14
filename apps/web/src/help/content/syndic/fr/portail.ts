import type { HelpEntry } from '../../../types';

/** Zone « portail » du module « syndic » (fr) : portail du copropriétaire (/copropriete). */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Mes lots
  {
    id: 'syndic.portail.lots',
    kind: 'page',
    title: 'Mes lots',
    summary:
      "Cet écran est l'accueil de votre espace copropriétaire : vos lots en copropriété, avec le solde du compte de chacun. Cliquez sur un lot pour voir son compte.",
    purpose:
      "Vous voyez d'un coup d'œil ce que vous devez, ou l'avance dont vous disposez, sur chaque lot. Les lots sont regroupés par copropriété.",
    howToRead: {
      statuses: [
        { value: 'DEBITEUR', label: 'Débiteur', description: 'Vous devez ce montant à la copropriété.' },
        { value: 'CREDITEUR', label: 'Créditeur', description: 'Vous avez une avance sur ce lot.' },
        { value: 'A_JOUR', label: 'Soldé', description: 'Le compte est à jour.' }
      ],
      notes: [
        "Le montant est toujours affiché sans signe : le sens se lit dans l'étiquette « Débiteur » ou « Créditeur ».",
        "« Aucun compte ouvert » signifie que le compte de ce lot n'a pas encore été ouvert par la gestion.",
        "La barre de recherche n'apparaît que si vous avez plus de 6 lots."
      ]
    },
    steps: [
      { title: 'Repérer votre lot', detail: 'Cherchez la carte « Lot » de la bonne copropriété.' },
      {
        title: 'Ouvrir le compte',
        detail: 'Cliquez sur la carte pour voir le solde, les mouvements et les appels de charges du lot.'
      },
      { title: 'Rafraîchir', detail: 'Bouton « Actualiser » pour relire vos lots.' }
    ],
    faq: [
      {
        q: 'Je ne vois pas un de mes lots, pourquoi ?',
        a: 'Seuls les lots ouverts à votre compte apparaissent. Rapprochez-vous de votre agence si un lot manque.'
      },
      {
        q: 'Que sont les tantièmes ?',
        a: 'Ce sont les parts de votre lot dans la copropriété. « Part détenue » est votre part de propriété du lot, en pourcentage.'
      },
      {
        q: "Pourquoi le solde n'a pas de signe moins ?",
        a: 'Le montant est affiché en valeur positive, avec la mention « Débiteur » ou « Créditeur ».'
      }
    ],
    permissions: {
      roles: ['Copropriétaire'],
      note: "Votre accès est ouvert par l'invitation « Inviter au portail » envoyée depuis la fiche du propriétaire du lot. Vous ne voyez que vos propres lots."
    },
    related: [
      { label: "Compte d'un lot", helpId: 'syndic.portail.compte' },
      { label: 'Mes appels de charges', helpId: 'syndic.portail.appels' },
      { label: 'Ma copropriété', helpId: 'syndic.portail.copropriete' }
    ],
    keywords: ['accueil', 'mes lots', 'solde', 'tantièmes', 'copropriétaire', 'portail']
  },
  {
    id: 'syndic.portail.lots.cartes',
    kind: 'section',
    title: 'Cartes de vos lots',
    summary:
      'Chaque copropriété a sa carte, et chaque lot y a sa ligne : type de lot, solde du compte, tantièmes et part détenue. Cliquez sur un lot pour ouvrir son compte.',
    howToRead: {
      notes: [
        'Le titre rappelle le nom de la copropriété et son adresse.',
        "« Tantièmes généraux » : votre part dans les charges communes. « Tantièmes spéciaux » n'apparaît que si votre lot en a.",
        'Le type de lot est affiché sous le numéro : Appartement, Parking, Cave, Bureau, Commerce ou Autre.'
      ]
    },
    faq: [
      { q: "Comment ouvrir le compte d'un lot ?", a: 'Cliquez sur sa carte.' },
      {
        q: 'Que veut dire « Aucun compte ouvert » ?',
        a: "Aucun compte n'a encore été ouvert pour ce lot : il n'y a donc pas de solde à afficher."
      },
      {
        q: 'Pourquoi plusieurs copropriétés ?',
        a: 'Vos lots sont regroupés par copropriété si vous en possédez dans plusieurs immeubles de la même agence.'
      }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: "Compte d'un lot", helpId: 'syndic.portail.compte' }],
    keywords: ['lot', 'carte', 'tantièmes', 'part détenue']
  },

  // ------------------------------------------------------------------ Compte d'un lot
  {
    id: 'syndic.portail.compte',
    kind: 'page',
    title: "Compte d'un lot",
    summary:
      'Cet écran détaille un de vos lots : son solde, un relevé à télécharger, les mouvements du compte et les appels de charges. Il est en lecture seule.',
    purpose: 'Vous vérifiez ici ce qui a été appelé, ce que vous avez payé et ce qui reste dû sur le lot.',
    howToRead: {
      notes: [
        "L'en-tête rappelle la copropriété, le type de lot, ses tantièmes généraux et votre part détenue.",
        'Quatre blocs se suivent : « Solde du compte », « Relevé de compte », « Mouvements du compte » et « Appels de charges du lot ».',
        "Si le lot n'est pas à vous, l'écran indique « Ce lot est introuvable dans votre espace »."
      ]
    },
    steps: [
      {
        title: 'Lire le solde',
        detail: "Le montant est suivi de « Débiteur », « Créditeur » ou « Soldé », avec une phrase d'explication."
      },
      {
        title: 'Télécharger un relevé',
        detail: 'Choisissez une période si vous le souhaitez, puis « Télécharger mon relevé (PDF) ».'
      },
      { title: 'Parcourir les mouvements', detail: 'Cherchez un libellé ou filtrez par « Type » et par « Date ».' },
      {
        title: 'Voir les appels de charges',
        detail: "En bas, le tableau des appels du lot avec leur statut et le bouton « Avis d'appel (PDF) »."
      }
    ],
    faq: [
      {
        q: 'Comment payer depuis cet écran ?',
        a: "Le paiement se fait dans « Mes appels de charges » (paiement en ligne ou déclaration d'un paiement mobile money)."
      },
      {
        q: "Je ne suis pas d'accord avec un montant, que faire ?",
        a: 'Contactez votre agence : vous pouvez consulter vos informations mais pas les modifier.'
      },
      { q: 'À quoi sert le relevé ?', a: 'À garder une trace de votre compte, sur la période que vous choisissez.' }
    ],
    permissions: {
      roles: ['Copropriétaire'],
      note: 'Lecture seule : vous ne pouvez consulter que les lots qui vous sont ouverts.'
    },
    related: [
      { label: 'Solde du compte', helpId: 'syndic.portail.compte.solde' },
      { label: 'Relevé de compte', helpId: 'syndic.portail.compte.releve' },
      { label: 'Mouvements du compte', helpId: 'syndic.portail.compte.mouvements' },
      { label: 'Mes appels de charges', helpId: 'syndic.portail.appels' }
    ],
    keywords: ['compte', 'lot', 'solde', 'relevé', 'mouvements', 'détail du lot']
  },
  {
    id: 'syndic.portail.compte.solde',
    kind: 'section',
    title: 'Solde du compte',
    summary:
      'Cette carte donne le solde actuel du lot, sans signe, avec la mention « Débiteur », « Créditeur » ou « Soldé ».',
    howToRead: {
      statuses: [
        { value: 'DEBITEUR', label: 'Débiteur', description: 'Vous devez ce montant à la copropriété.' },
        { value: 'CREDITEUR', label: 'Créditeur', description: 'Vous avez une avance sur ce lot.' },
        { value: 'A_JOUR', label: 'Soldé', description: 'Compte à jour.' }
      ]
    },
    faq: [
      {
        q: "Que signifie « Aucun compte n'est encore ouvert pour ce lot » ?",
        a: "La gestion n'a pas encore ouvert le compte du lot : il n'y a pas de solde à lire."
      },
      {
        q: 'Que devient une avance ?',
        a: 'Une avance (solde « Créditeur ») reste disponible sur le lot ; elle apparaît aussi dans « Mes paiements ».'
      },
      {
        q: "Pourquoi le solde s'affiche-t-il sans signe ?",
        a: 'La carte donne le montant sans signe, et la mention en indique le sens. « Débiteur » : vous devez ce montant à la copropriété ; « Créditeur » : vous avez une avance ; « Soldé » : compte à jour.'
      }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: 'Mouvements du compte', helpId: 'syndic.portail.compte.mouvements' }],
    keywords: ['solde', 'débiteur', 'créditeur', 'avance']
  },
  {
    id: 'syndic.portail.compte.releve',
    kind: 'section',
    title: 'Relevé de compte',
    summary:
      'Cette carte permet de télécharger votre relevé de compte du lot au format PDF, sur la période de votre choix.',
    steps: [
      { title: 'Choisir la période', detail: "Champs « Depuis le » et « Jusqu'au », facultatifs." },
      { title: 'Télécharger', detail: 'Bouton « Télécharger mon relevé (PDF) ».' }
    ],
    consequences: ['Sous le bouton, une mention indique : « 30 dernières opérations depuis votre acquisition ».'],
    faq: [
      { q: 'Faut-il choisir une période ?', a: 'Non, elle est facultative.' },
      {
        q: 'Le téléchargement échoue, que faire ?',
        a: "Un message d'erreur s'affiche. Réessayez, puis contactez votre agence si le problème persiste."
      },
      {
        q: 'Dans quel format est le relevé ?',
        a: "En PDF : cliquez sur « Télécharger mon relevé (PDF) », après avoir éventuellement choisi une période avec « Depuis le » et « Jusqu'au »."
      }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: 'Mouvements du compte', helpId: 'syndic.portail.compte.mouvements' }],
    keywords: ['relevé', 'pdf', 'télécharger', 'période']
  },
  {
    id: 'syndic.portail.compte.mouvements',
    kind: 'table',
    title: 'Mouvements du compte',
    summary:
      'Ce tableau liste tout ce qui a été porté sur le compte du lot : appels, paiements, pénalités, remises, ajustements.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'Date du mouvement.' },
        {
          key: 'type',
          label: 'Type',
          description: 'Appel de charges, Paiement, Pénalité, Remise, Ajustement ou Transfert de fonds.'
        },
        { key: 'label', label: 'Libellé', description: 'Description du mouvement.' },
        { key: 'debit', label: 'Débit', description: 'Montant au débit, le cas échéant.' },
        { key: 'credit', label: 'Crédit', description: 'Montant au crédit, le cas échéant.' },
        {
          key: 'balanceAfter',
          label: 'Solde après',
          description: 'Solde du compte après ce mouvement, avec « Débiteur » ou « Créditeur ».'
        }
      ],
      notes: ['Filtres : recherche sur le libellé, « Type » et « Date ». Le tableau peut être exporté.']
    },
    faq: [
      {
        q: "Pourquoi une ligne n'a-t-elle qu'un débit ou qu'un crédit ?",
        a: "Chaque mouvement est soit au débit, soit au crédit : l'autre colonne affiche « — »."
      },
      {
        q: 'Où voir une pénalité de retard ?',
        a: 'Quand elle est appliquée, elle apparaît ici avec le type « Pénalité ».'
      },
      {
        q: 'Le tableau est vide, est-ce normal ?',
        a: "Si aucun mouvement n'est enregistré, l'écran indique « Aucun mouvement enregistré sur ce compte »."
      }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: 'Solde du compte', helpId: 'syndic.portail.compte.solde' }],
    keywords: ['mouvements', 'débit', 'crédit', 'pénalité', 'historique']
  },

  // ------------------------------------------------------------------ Mes appels de charges
  {
    id: 'syndic.portail.appels',
    kind: 'page',
    title: 'Mes appels de charges',
    summary:
      "Cet écran liste les appels de charges de tous vos lots : montant appelé, déjà payé et reste à payer. C'est aussi ici que vous payez.",
    purpose:
      "Vous suivez vos échéances et vous réglez en ligne ou par mobile money, selon ce que votre copropriété a ouvert. Rien n'est proposé tant que votre agence n'a pas activé un moyen de paiement.",
    howToRead: {
      notes: [
        "Deux montants en haut : « Reste à payer » (tous vos appels) et « Dont en retard » avec le nombre d'appels concernés.",
        "Sous les montants, selon votre copropriété : le paiement en ligne, « Payer l'agence » (coordonnées de paiement, motif à recopier, avertissements), les numéros mobile money et le bouton « J'ai payé : déclarer mon paiement » qui mène à la déclaration.",
        "Si rien n'est ouvert, un message vous invite à vous rapprocher de votre agence."
      ]
    },
    steps: [
      { title: 'Repérer vos échéances', detail: 'Consultez le tableau et la colonne « Statut ».' },
      {
        title: 'Payer en ligne',
        detail: "Si la case « Payer » est proposée : cochez les appels d'un même lot, puis « Payer en ligne »."
      },
      {
        title: 'Ou payer par mobile money',
        detail: "Faites le transfert vers l'un des numéros affichés, puis « J'ai payé par mobile money »."
      },
      {
        title: 'Suivre la validation',
        detail: 'Votre déclaration apparaît dans « Mes paiements » ; elle est vérifiée par le syndic.'
      }
    ],
    consequences: [
      'Un appel dont le paiement en ligne est en cours, ou dont une déclaration est en vérification, ne peut plus être coché.',
      "Le reste à payer ne baisse qu'une fois le paiement confirmé ou la déclaration validée."
    ],
    faq: [
      {
        q: 'Pourquoi je ne vois aucun bouton de paiement ?',
        a: "Votre copropriété n'a pas encore ouvert de moyen de paiement : rapprochez-vous de votre agence."
      },
      {
        q: 'Où voir les pénalités ?',
        a: 'Elles ne sont pas dans ce tableau : quand elles sont appliquées, elles figurent dans les mouvements du compte du lot.'
      },
      {
        q: 'Que veut dire « En retard » ?',
        a: "L'échéance est passée et l'appel n'est pas soldé. Le statut est calculé automatiquement."
      }
    ],
    permissions: {
      roles: ['Copropriétaire'],
      note: "Lecture seule, sauf le paiement en ligne et la déclaration d'un paiement mobile money."
    },
    related: [
      { label: 'Appels de charges', helpId: 'syndic.portail.appels.tableau' },
      { label: 'Payer en ligne', helpId: 'syndic.portail.appels.paiement-en-ligne' },
      { label: 'Numéros pour payer par mobile money', helpId: 'syndic.portail.appels.mobile-money' },
      { label: "J'ai payé par mobile money", helpId: 'syndic.portail.appels.declaration' },
      { label: 'Mes paiements', helpId: 'syndic.portail.paiements' }
    ],
    keywords: ['appels de charges', 'payer', 'charges', 'échéance', 'retard', 'reste à payer'],
    tour: {
      steps: [
        {
          target: 'portail-appels-tableau',
          title: 'Vos appels de charges',
          description: 'Chaque ligne est un appel : période, échéance, montant, déjà payé et reste à payer.'
        },
        {
          target: 'portail-payer-en-ligne',
          title: 'Payer en ligne',
          description: "Cochez un ou plusieurs appels d'un même lot dans le tableau, puis cliquez ici."
        },
        {
          target: 'portail-mobile-money',
          title: 'Payer par mobile money',
          description:
            'Notez le numéro de réception de votre copropriété et faites le transfert depuis votre téléphone.'
        },
        {
          target: 'portail-declarer',
          title: 'Déclarer votre paiement',
          description:
            'Une fois le transfert fait, déclarez-le : le syndic le vérifie avant de le porter à votre compte.'
        }
      ]
    }
  },
  {
    id: 'syndic.portail.appels.tableau',
    kind: 'table',
    title: 'Appels de charges',
    summary:
      "Ce tableau liste vos appels de charges avec leur échéance, leurs montants et leur statut. Le bouton de chaque ligne télécharge l'avis d'appel.",
    howToRead: {
      columns: [
        {
          key: 'select',
          label: 'Payer',
          description:
            'Case à cocher des appels payables en ligne. Un paiement couvre un seul lot et 24 appels au plus.'
        },
        { key: 'period', label: 'Période', description: "Période couverte par l'appel." },
        { key: 'lot', label: 'Lot', description: "Numéro du lot et copropriété (absent dans le détail d'un lot)." },
        { key: 'dueDate', label: 'Échéance', description: 'Date limite de paiement.' },
        { key: 'amount', label: 'Montant', description: 'Montant appelé.' },
        { key: 'paid', label: 'Payé', description: 'Montant déjà réglé.' },
        { key: 'outstanding', label: 'Reste à payer', description: "Ce qu'il reste à régler sur cet appel." },
        {
          key: 'status',
          label: 'Statut',
          description: "État de l'appel, et mention d'un paiement en cours ou déclaré."
        },
        { key: 'notice', label: 'Avis', description: "Bouton « Avis d'appel (PDF) »." }
      ],
      statuses: [
        { value: 'PENDING', label: 'En attente', description: "L'échéance n'est pas passée et rien n'est réglé." },
        { value: 'PARTIAL', label: 'Partiel', description: "Une partie de l'appel est réglée." },
        { value: 'PAID', label: 'Payé', description: 'Appel soldé.' },
        { value: 'OVERDUE', label: 'En retard', description: "L'échéance est passée et l'appel n'est pas soldé." }
      ],
      notes: [
        'Mentions à côté du statut : « Paiement en cours » (avec « Reprendre le paiement »), « Paiement en vérification » et « Paiement déclaré, en vérification ».',
        "Filtres : recherche, « Statut », « Lot » (sur l'écran « Mes appels de charges ») et « Échéance »."
      ]
    },
    steps: [
      { title: 'Filtrer', detail: 'Cherchez une période ou filtrez par statut, lot ou échéance.' },
      {
        title: 'Télécharger un avis',
        detail:
          "Bouton « Avis d'appel (PDF) » sur la ligne ; « Avis indisponible » s'affiche si le document n'existe pas encore."
      },
      { title: 'Cocher pour payer', detail: 'Si la colonne « Payer » existe, cochez les appels à régler en ligne.' }
    ],
    faq: [
      {
        q: "Pourquoi la case d'un appel est-elle grisée ?",
        a: "Un paiement en ligne est en cours, une déclaration est en vérification, ou vous avez déjà coché un appel d'un autre lot."
      },
      {
        q: "Pourquoi n'y a-t-il pas de colonne « Payer » ?",
        a: "Le paiement en ligne n'est pas ouvert pour votre copropriété."
      },
      {
        q: 'Le tableau peut-il être exporté ?',
        a: "Oui, le tableau propose l'export des appels correspondant à vos filtres."
      }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: 'Payer en ligne', helpId: 'syndic.portail.appels.paiement-en-ligne' }],
    keywords: ['appels', "avis d'appel", 'échéance', 'statut', 'reste à payer']
  },
  {
    id: 'syndic.portail.appels.paiement-en-ligne',
    kind: 'section',
    title: 'Payer en ligne',
    summary:
      'Cette carte apparaît seulement si votre copropriété a ouvert le paiement en ligne. Vous cochez vos appels, puis vous êtes envoyé sur la page du service de paiement.',
    howToRead: {
      notes: [
        '« Moyens de paiement » liste ceux proposés : Wave, Orange Money, MTN Money, Moov Money ou Carte bancaire.',
        "Selon la copropriété, des frais du service de paiement peuvent s'ajouter au montant, ou sont pris en charge par votre agence : la carte le précise.",
        "L'étiquette « Mode démonstration » indique un essai sans vrai paiement."
      ]
    },
    steps: [
      {
        title: 'Cocher les appels',
        detail: "Dans le tableau, cochez un ou plusieurs appels d'un même lot (24 au plus)."
      },
      { title: 'Vérifier le total', detail: "La carte affiche « Total à payer » et le nombre d'appels." },
      {
        title: 'Payer',
        detail: 'Cliquez sur « Payer en ligne » : vous quittez ImmoTopia pour la page du service de paiement.'
      },
      {
        title: 'Revenir',
        detail: 'Au retour, un bandeau indique si le paiement est confirmé, en vérification, échoué ou annulé.'
      }
    ],
    consequences: [
      'Un paiement confirmé règle les appels cochés et un reçu est mis à votre disposition dans « Mes quittances ».',
      "Un paiement échoué ou annulé n'enregistre aucun montant : vous pouvez réessayer.",
      'Si un paiement est déjà en cours sur ces appels, « Reprendre le paiement » vous ramène à sa page.'
    ],
    faq: [
      { q: 'Puis-je payer deux lots en une fois ?', a: "Non, un paiement couvre les appels d'un seul lot." },
      {
        q: "J'ai fermé la page de paiement avant la fin, que faire ?",
        a: "Utilisez « Reprendre le paiement » à côté de l'appel, ou attendez : le paiement apparaît dès sa confirmation."
      },
      {
        q: 'Pourquoi le paiement est-il « en vérification » ?',
        a: "Il attend une décision du syndic. Le reste à payer ne change qu'après sa validation."
      }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: 'Appels de charges', helpId: 'syndic.portail.appels.tableau' }],
    keywords: ['payer en ligne', 'carte bancaire', 'wave', 'orange money', 'mtn', 'moov', 'frais']
  },
  {
    id: 'syndic.portail.appels.mobile-money',
    kind: 'section',
    title: 'Numéros pour payer par mobile money',
    summary:
      "Cette carte donne les numéros de réception mobile money de votre copropriété et, s'il y en a une, la consigne du syndic. Elle n'apparaît que si la déclaration de paiement est ouverte.",
    howToRead: {
      notes: [
        "Chaque numéro indique l'opérateur, le titulaire et un bouton « Copier le numéro ».",
        '« Consigne du syndic » est un texte libre du syndic, avec « Copier la consigne ».',
        'Avec plusieurs copropriétés, le nom de la copropriété est ajouté au titre : vérifiez que vous payez la bonne.'
      ]
    },
    steps: [
      { title: 'Copier le numéro', detail: "Choisissez l'un des numéros et copiez-le." },
      { title: 'Faire le transfert', detail: 'Depuis votre téléphone, envoyez le montant au numéro copié.' },
      { title: 'Déclarer', detail: "Cliquez sur « J'ai payé par mobile money » pour renseigner votre paiement." }
    ],
    consequences: [
      'Le transfert seul ne met pas votre compte à jour : il faut le déclarer, puis le syndic le vérifie.'
    ],
    faq: [
      {
        q: 'Je ne vois pas cette carte, pourquoi ?',
        a: "La déclaration de paiement mobile money n'est pas ouverte pour votre copropriété."
      },
      {
        q: 'Dois-je suivre la consigne du syndic ?',
        a: "Oui, c'est le texte rédigé par le syndic pour les payeurs, par exemple le motif à indiquer."
      },
      {
        q: 'Le transfert suffit-il pour mettre mon compte à jour ?',
        a: "Non : il faut le déclarer avec « J'ai payé par mobile money », puis le syndic le vérifie."
      }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: "J'ai payé par mobile money", helpId: 'syndic.portail.appels.declaration' }],
    keywords: ['mobile money', 'numéro de réception', 'consigne', 'wave', 'orange', 'mtn', 'moov']
  },
  {
    id: 'syndic.portail.appels.declaration',
    kind: 'section',
    title: "J'ai payé par mobile money",
    summary:
      'Ce formulaire déclare au syndic un transfert mobile money que vous avez fait. Il vérifie votre déclaration avant de la porter à votre compte.',
    steps: [
      {
        title: 'Joindre la capture',
        detail:
          "Capture du SMS ou de l'écran de confirmation, en image (JPEG, PNG, WebP) ou PDF, 5 Mo au plus. Selon la copropriété, elle est obligatoire ou facultative."
      },
      {
        title: 'Numéro de réception',
        detail: "Champ « Numéro de réception utilisé » : le numéro vers lequel vous avez envoyé l'argent."
      },
      { title: 'Numéro qui a payé', detail: 'Champ « Numéro qui a payé » : votre numéro mobile money.' },
      { title: 'Montant', detail: "« Montant envoyé (FCFA) » : le montant du SMS de l'opérateur, en nombre entier." },
      {
        title: 'Date et heure',
        detail: '« Date et heure du transfert » : dans les 90 derniers jours, jamais dans le futur.'
      },
      {
        title: 'Référence',
        detail:
          '« Référence de la transaction » : 4 à 40 caractères (lettres, chiffres, tiret, point). Elle est mise en majuscules.'
      },
      {
        title: 'Lots et appels',
        detail:
          '« Lots concernés » : cochez le ou les lots (10 au plus) et, si vous le voulez, les appels à régler. Pour plusieurs lots, indiquez la part de chacun.'
      },
      {
        title: 'Envoyer',
        detail: 'Ajoutez un commentaire si besoin (500 caractères), puis « Envoyer la déclaration ».'
      }
    ],
    consequences: [
      "Rien n'est porté à votre compte avant validation par le syndic.",
      'Sans appel coché, le paiement est affecté aux appels les plus anciens, puis en avance.',
      'La somme des parts des lots doit être égale au montant envoyé.',
      'Après validation, le reçu ou la quittance se trouve dans « Mes quittances » ; en cas de rejet, le motif est affiché dans « Mes déclarations ».'
    ],
    faq: [
      {
        q: 'À quoi sert la lecture automatique de la capture ?',
        a: 'Quand elle est disponible, elle propose des valeurs (montant, date, référence, numéros) que vous devez vérifier : « Lu automatiquement, vérifiez ».'
      },
      {
        q: 'Puis-je annuler ma déclaration ?',
        a: "Oui, tant qu'elle est « En vérification », avec « Annuler la déclaration » dans « Mes déclarations »."
      },
      {
        q: 'Pourquoi un appel ne peut-il pas être coché ?',
        a: 'Un paiement en ligne est en cours ou en vérification sur cet appel, ou il est déjà déclaré.'
      },
      {
        q: 'Le montant retenu est différent du mien, pourquoi ?',
        a: "Le syndic peut retenir un autre montant après vérification : « Montant retenu » s'affiche alors dans « Mes déclarations »."
      }
    ],
    permissions: { roles: ['Copropriétaire'], note: 'Seuls vos propres lots peuvent être déclarés.' },
    related: [
      { label: 'Mes déclarations', helpId: 'syndic.portail.paiements.declarations' },
      { label: 'Numéros pour payer par mobile money', helpId: 'syndic.portail.appels.mobile-money' }
    ],
    keywords: [
      'déclarer un paiement',
      'justificatif',
      'capture',
      'référence de transaction',
      'mobile money',
      'preuve de paiement'
    ]
  },

  // ------------------------------------------------------------------ Documents
  {
    id: 'syndic.portail.documents',
    kind: 'page',
    title: 'Documents de copropriété',
    summary:
      "Cet écran regroupe les documents que la gestion partage avec vous : le règlement de copropriété et les procès-verbaux d'assemblée générale.",
    purpose:
      'Vous retrouvez et téléchargez ces documents pour les copropriétés où vous avez un lot. Les autres documents de la gestion (diagnostics, assurances, budgets...) ne sont pas partagés ici.',
    steps: [
      { title: 'Chercher', detail: 'Tapez un titre ou un nom de copropriété, ou filtrez par « Type ».' },
      { title: 'Ouvrir le document', detail: 'Bouton « Télécharger » ou « Ouvrir » sur la ligne.' }
    ],
    faq: [
      {
        q: 'Pourquoi un document est-il « Indisponible » ?',
        a: "Le fichier n'est pas accessible pour le moment : contactez votre agence."
      },
      {
        q: 'Où est le procès-verbal de la dernière assemblée ?',
        a: "Il apparaît ici avec le type « Procès-verbal d'assemblée générale » une fois publié par la gestion."
      },
      {
        q: 'Pourquoi je ne vois pas mes factures ni mon budget ?',
        a: 'Ces documents restent réservés à la gestion ; seuls le règlement et les procès-verbaux sont partagés.'
      }
    ],
    permissions: {
      roles: ['Copropriétaire'],
      note: 'Lecture seule : vous voyez les documents des copropriétés où vous avez un lot.'
    },
    related: [{ label: 'Documents', helpId: 'syndic.portail.documents.tableau' }],
    keywords: ['documents', 'règlement', 'procès-verbal', 'pv', 'télécharger']
  },
  {
    id: 'syndic.portail.documents.tableau',
    kind: 'table',
    title: 'Documents',
    summary:
      "Ce tableau liste les documents partagés avec vous. Chaque ligne propose un bouton pour le télécharger ou l'ouvrir.",
    howToRead: {
      columns: [
        { key: 'title', label: 'Document', description: 'Titre du document.' },
        { key: 'type', label: 'Type', description: "Règlement de copropriété ou Procès-verbal d'assemblée générale." },
        { key: 'syndicate', label: 'Copropriété', description: 'Copropriété concernée.' },
        { key: 'createdAt', label: 'Ajouté le', description: "Date d'ajout du document." },
        {
          key: 'action',
          label: 'Action',
          description: '« Télécharger », « Ouvrir » (lien externe) ou « Indisponible ».'
        }
      ],
      notes: ['Filtres : recherche et « Type ». Le tableau peut être exporté.']
    },
    faq: [
      {
        q: 'Quelle différence entre « Télécharger » et « Ouvrir » ?',
        a: '« Télécharger » enregistre le fichier sur votre appareil ; « Ouvrir » ouvre un lien externe.'
      },
      { q: 'Le tableau est vide.', a: "Aucun document n'est encore disponible pour vos copropriétés." },
      { q: 'Puis-je exporter la liste ?', a: "Oui, avec l'export du tableau." }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: 'Assemblées générales', helpId: 'syndic.portail.assemblees' }],
    keywords: ['documents', 'règlement de copropriété', 'procès-verbal']
  },

  // ------------------------------------------------------------------ Assemblées générales
  {
    id: 'syndic.portail.assemblees',
    kind: 'page',
    title: 'Assemblées générales',
    summary:
      "Cet écran liste les assemblées générales de vos copropriétés : date, lieu, ordre du jour et, une fois l'assemblée clôturée, le résultat de chaque résolution.",
    purpose:
      "Vous consultez l'ordre du jour avant l'assemblée, puis les résultats après le vote. Quand l'assemblée est organisée en direct, vous pouvez la rejoindre d'ici.",
    howToRead: {
      statuses: [
        { value: 'PLANNED', label: 'Planifiée', description: "La date est fixée, l'assemblée n'a pas commencé." },
        { value: 'IN_PROGRESS', label: 'En cours', description: "L'assemblée est ouverte." },
        { value: 'COMPLETED', label: 'Clôturée', description: 'Les résultats des résolutions sont affichés.' },
        { value: 'CANCELLED', label: 'Annulée', description: "L'assemblée n'aura pas lieu." }
      ],
      notes: [
        "Filtres : recherche, « Statut » et « Date ». Chaque assemblée a sa carte, avec le type d'assemblée (ordinaire ou extraordinaire) et la date."
      ]
    },
    steps: [
      {
        title: "Repérer l'assemblée",
        detail: 'Cherchez la carte de la bonne date, ou filtrez par statut ou par date.'
      },
      {
        title: "Lire l'ordre du jour",
        detail:
          "Il est listé dans la carte ; avant publication, l'écran dit « L'ordre du jour n'est pas encore publié »."
      },
      {
        title: 'Rejoindre en direct',
        detail: "Si le bouton « Rejoindre l'AG en direct » apparaît, cliquez dessus quand l'assemblée commence."
      },
      { title: 'Consulter les résultats', detail: 'Après la clôture, la carte détaille chaque résolution.' }
    ],
    faq: [
      {
        q: "Pourquoi le bouton « Rejoindre l'AG en direct » n'apparaît-il pas ?",
        a: "Il n'apparaît qu'à partir de la veille de l'assemblée, jusqu'à sa clôture, et seulement si votre agence a l'option de direct."
      },
      {
        q: 'Puis-je voir comment les autres ont voté ?',
        a: 'Non, vous voyez les totaux et votre propre vote, pas ceux des autres lots.'
      },
      { q: 'Où trouver le procès-verbal ?', a: 'Dans « Documents », une fois publié par la gestion.' }
    ],
    permissions: {
      roles: ['Copropriétaire'],
      note: "Lecture seule. Le bouton « Rejoindre l'AG en direct » n'apparaît que si l'agence a l'option « AG en direct et visio »."
    },
    related: [
      { label: "Carte d'une assemblée", helpId: 'syndic.portail.assemblees.carte' },
      { label: "Rejoindre l'AG en direct", helpId: 'syndic.portail.assemblees.direct' },
      { label: 'Résultats des résolutions', helpId: 'syndic.portail.assemblees.resultats' },
      { label: 'Documents de copropriété', helpId: 'syndic.portail.documents' }
    ],
    keywords: ['assemblée générale', 'ag', 'convocation', 'ordre du jour', 'vote', 'résolutions']
  },
  {
    id: 'syndic.portail.assemblees.carte',
    kind: 'section',
    title: "Carte d'une assemblée",
    summary:
      "Chaque carte présente une assemblée : son type et sa date en titre, son statut, la copropriété, le lieu et l'ordre du jour.",
    howToRead: {
      notes: [
        "Le titre indique « Assemblée générale ordinaire » ou « Assemblée générale extraordinaire », avec la date et l'heure.",
        "« Lieu » affiche « Non précisé » si aucun lieu n'a été renseigné.",
        "Les résultats ne s'affichent que lorsque l'assemblée est « Clôturée »."
      ]
    },
    faq: [
      { q: "Pourquoi l'ordre du jour est-il vide ?", a: "La gestion ne l'a pas encore publié." },
      {
        q: "Qu'est-ce qu'une assemblée extraordinaire ?",
        a: "C'est une assemblée convoquée en dehors de l'assemblée annuelle ordinaire."
      },
      {
        q: 'Pourquoi une assemblée est-elle « Annulée » ?',
        a: "La gestion l'a annulée ; l'écran n'indique pas le motif."
      }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: 'Résultats des résolutions', helpId: 'syndic.portail.assemblees.resultats' }],
    keywords: ['carte', 'assemblée', 'lieu', 'ordre du jour']
  },
  {
    id: 'syndic.portail.assemblees.direct',
    kind: 'section',
    title: "Rejoindre l'AG en direct",
    summary:
      "Ce bouton vous donne votre lien personnel pour suivre l'assemblée en direct. Il n'apparaît que si l'agence a l'option « AG en direct et visio ».",
    steps: [
      {
        title: 'Attendre le bon moment',
        detail:
          "Le bouton est proposé à partir de la veille de l'assemblée, tant qu'elle est « Planifiée » ou « En cours »."
      },
      {
        title: 'Cliquer',
        detail: "« Rejoindre l'AG en direct » : votre lien personnel est préparé, puis vous y êtes envoyé."
      }
    ],
    consequences: [
      "Vous quittez l'espace copropriétaire pour la page de l'assemblée en direct.",
      "En cas de problème, un message d'erreur s'affiche sous le bouton."
    ],
    faq: [
      {
        q: 'Je ne vois pas le bouton.',
        a: "Vérifiez que l'assemblée est planifiée ou en cours, qu'on est à moins d'un jour de sa date, et que votre agence a l'option de direct."
      },
      { q: 'Le lien est-il personnel ?', a: 'Oui, il est délivré pour vous au moment du clic.' },
      { q: 'Le bouton affiche une erreur.', a: 'Réessayez un peu plus tard, puis contactez votre agence.' }
    ],
    permissions: {
      roles: ['Copropriétaire'],
      note: "Réservé aux agences ayant l'option « AG en direct et visio » ; sans elle, le bouton n'apparaît pas."
    },
    related: [{ label: 'Assemblées générales', helpId: 'syndic.portail.assemblees' }],
    keywords: ['ag en direct', 'visio', 'rejoindre', 'lien personnel']
  },
  {
    id: 'syndic.portail.assemblees.resultats',
    kind: 'section',
    title: 'Résultats des résolutions',
    summary:
      'Après la clôture, chaque résolution est détaillée : résultat, règle de majorité, total des tantièmes pour, contre et abstention, et votre vote.',
    howToRead: {
      statuses: [
        { value: 'APPROVED', label: 'Adoptée', description: 'La résolution est approuvée.' },
        { value: 'REJECTED', label: 'Rejetée', description: 'La résolution est refusée.' },
        { value: 'DEFERRED', label: 'Reportée', description: 'La résolution est repoussée.' },
        { value: 'NONE', label: 'Sans vote', description: "Aucun vote n'a été enregistré." }
      ],
      notes: [
        '« Règle » : Article 24 (majorité simple des tantièmes exprimés), Article 25 (majorité absolue des tantièmes), Article 26 (double majorité) ou Unanimité.',
        '« Tantièmes » : « Pour », « Contre » et « Abstention », sur le total des tantièmes.',
        '« Votre vote » : le vote de chacun de vos lots, par exemple « Lot 12 : Pour ».'
      ]
    },
    faq: [
      { q: 'Pourquoi je ne vois pas les résultats ?', a: "Ils n'apparaissent qu'une fois l'assemblée « Clôturée »." },
      {
        q: 'Pourquoi « Votre vote » est-il absent ?',
        a: "Aucun vote n'est enregistré pour vos lots sur cette résolution."
      },
      {
        q: "« Aucune résolution n'a été soumise au vote », que veut-il dire ?",
        a: "L'assemblée est clôturée mais n'a aucune résolution à afficher."
      }
    ],
    permissions: { roles: ['Copropriétaire'], note: 'Vous voyez les totaux et uniquement votre propre vote.' },
    related: [{ label: 'Assemblées générales', helpId: 'syndic.portail.assemblees' }],
    keywords: ['résultats', 'vote', 'majorité', 'tantièmes', 'adoptée']
  },

  // ------------------------------------------------------------------ Mes paiements
  {
    id: 'syndic.portail.paiements',
    kind: 'page',
    title: 'Mes paiements',
    summary:
      'Cet écran liste vos règlements de charges, leur affectation aux appels et les reçus qui en découlent. En dessous, « Mes déclarations » suit vos paiements mobile money déclarés.',
    purpose: "Vous vérifiez qu'un paiement a bien été pris en compte, sur quels appels, et s'il vous reste une avance.",
    howToRead: {
      notes: [
        'En haut, une carte « Avance disponible — lot … » apparaît pour chaque lot qui a une avance.',
        'Filtres : recherche, « Lot » et « Exercice » (année en cours et cinq années précédentes).',
        "« Mes déclarations » n'apparaît que si vous avez déjà déclaré un paiement."
      ]
    },
    steps: [
      { title: 'Retrouver un paiement', detail: 'Cherchez une référence ou filtrez par lot et par exercice.' },
      { title: 'Voir le détail', detail: 'Bouton « Détail » : affectations aux appels et documents émis.' },
      {
        title: 'Suivre une déclaration',
        detail: 'Dans « Mes déclarations », lisez le statut de chaque paiement déclaré.'
      }
    ],
    faq: [
      {
        q: "Mon paiement n'apparaît pas.",
        a: "Un paiement déclaré n'est porté à votre compte qu'après validation par le syndic ; en attendant, il est dans « Mes déclarations »."
      },
      {
        q: 'Que signifie « Avance restante » ?',
        a: "La part du paiement qui n'a réglé aucun appel et reste disponible sur le lot."
      },
      { q: 'Où est mon reçu ?', a: 'Dans le détail du paiement, et dans « Mes quittances ».' }
    ],
    permissions: {
      roles: ['Copropriétaire'],
      note: "Lecture seule ; seule l'annulation d'une déclaration encore « En vérification » est possible."
    },
    related: [
      { label: 'Paiements', helpId: 'syndic.portail.paiements.tableau' },
      { label: "Détail d'un paiement", helpId: 'syndic.portail.paiements.detail' },
      { label: 'Mes déclarations', helpId: 'syndic.portail.paiements.declarations' },
      { label: 'Mes quittances', helpId: 'syndic.portail.quittances' }
    ],
    keywords: ['paiements', 'règlements', 'avance', 'reçu', 'historique des paiements']
  },
  {
    id: 'syndic.portail.paiements.tableau',
    kind: 'table',
    title: 'Paiements',
    summary:
      'Ce tableau liste chaque règlement enregistré sur vos lots. Le bouton « Détail » montre à quoi il a servi.',
    howToRead: {
      columns: [
        { key: 'paidAt', label: 'Date', description: 'Date du paiement.' },
        { key: 'lot', label: 'Lot', description: 'Lot concerné.' },
        { key: 'amount', label: 'Montant', description: 'Montant du paiement.' },
        { key: 'method', label: 'Mode', description: 'Mode de paiement.' },
        { key: 'reference', label: 'Référence', description: 'Référence du paiement.' },
        {
          key: 'remainingAdvance',
          label: 'Avance restante',
          description: 'Part du paiement restée en avance après affectation.'
        },
        { key: 'detail', label: 'Détail', description: 'Ouvre le détail du paiement.' }
      ],
      notes: ['Le tableau peut être exporté avec vos filtres.']
    },
    faq: [
      { q: 'Pourquoi « Avance restante » est-elle à 0 ?', a: 'Tout le paiement a servi à régler des appels.' },
      { q: 'Comment filtrer par année ?', a: 'Utilisez le critère « Exercice ».' },
      { q: 'Le tableau est vide.', a: "Aucun paiement n'a encore été enregistré pour vos lots." }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: "Détail d'un paiement", helpId: 'syndic.portail.paiements.detail' }],
    keywords: ['paiements', 'règlements', 'référence', 'mode de paiement']
  },
  {
    id: 'syndic.portail.paiements.detail',
    kind: 'section',
    title: "Détail d'un paiement",
    summary:
      "Cette fenêtre montre comment un paiement a été affecté à vos appels de charges, l'avance éventuelle et les documents émis.",
    howToRead: {
      columns: [
        { key: 'period', label: 'Période', description: "Période de l'appel réglé." },
        { key: 'dueDate', label: 'Échéance', description: "Échéance de l'appel." },
        { key: 'amount', label: 'Montant', description: 'Montant affecté à cet appel.' },
        {
          key: 'source',
          label: 'Origine',
          description: "« Ce paiement » ou « Avance existante » (avance d'un paiement précédent)."
        }
      ],
      notes: [
        'Sans affectation, la totalité du paiement reste en avance sur le lot.',
        '« Documents » liste les reçus et quittances à télécharger, avec « Traduction arabe ».'
      ]
    },
    faq: [
      {
        q: "Qu'est-ce que « Avance existante » ?",
        a: "Une avance venue d'un paiement antérieur, utilisée pour compléter ce règlement."
      },
      {
        q: "Pourquoi aucun document n'est affiché ?",
        a: "Aucun reçu ou quittance n'a encore été émis pour ce paiement."
      },
      { q: 'À quoi sert « Traduction arabe » ?', a: 'Elle télécharge le document traduit en arabe.' }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: 'Mes quittances', helpId: 'syndic.portail.quittances' }],
    keywords: ['affectation', 'avance', 'reçu', 'détail du paiement']
  },
  {
    id: 'syndic.portail.paiements.declarations',
    kind: 'section',
    title: 'Mes déclarations',
    summary:
      "Cette section suit les paiements mobile money que vous avez déclarés au syndic. Rien n'est porté à votre compte avant validation.",
    howToRead: {
      columns: [
        { key: 'paidAt', label: 'Date du paiement', description: 'Date et heure du transfert.' },
        { key: 'lots', label: 'Lot(s)', description: 'Les lots concernés.' },
        { key: 'syndicate', label: 'Copropriété', description: 'Copropriété concernée.' },
        { key: 'receiving', label: 'Numéro de réception', description: "Opérateur et numéro qui a reçu l'argent." },
        { key: 'reference', label: 'Référence', description: 'Référence de la transaction.' },
        {
          key: 'amount',
          label: 'Montant déclaré',
          description: "Montant que vous avez déclaré, et « Montant retenu » s'il diffère."
        },
        { key: 'status', label: 'Statut', description: 'Avancement de la déclaration.' }
      ],
      statuses: [
        {
          value: 'PENDING',
          label: 'En vérification',
          description: 'Le syndic vérifie ; le reste dû de vos appels ne change pas.'
        },
        {
          value: 'APPROVED',
          label: 'Validée',
          description: 'Le paiement est porté à votre compte ; reçu ou quittance dans « Mes quittances ».'
        },
        {
          value: 'REJECTED',
          label: 'Rejetée',
          description:
            'Un motif est affiché : Paiement introuvable, Montant ne correspondant pas, Référence déjà utilisée, Numéro de réception erroné ou Autre.'
        },
        { value: 'CANCELED', label: 'Annulée', description: 'Déclaration annulée.' }
      ],
      notes: [
        "Filtres : recherche (référence, lot) et « Statut ». La section n'apparaît que si vous avez déclaré au moins un paiement."
      ]
    },
    steps: [
      { title: 'Lire le statut', detail: 'Un paiement « En vérification » attend le syndic.' },
      {
        title: 'Annuler si besoin',
        detail: "« Annuler la déclaration » puis confirmez : possible seulement tant qu'elle est en vérification."
      }
    ],
    consequences: [
      'Annuler une déclaration est définitif : si vous avez bien payé, déclarez-le de nouveau.',
      "Une déclaration rejetée n'a aucun effet sur votre compte ; lisez le motif et la note du syndic."
    ],
    faq: [
      {
        q: 'Combien de temps la vérification dure-t-elle ?',
        a: "L'écran ne donne pas de délai : le syndic traite les déclarations à son rythme."
      },
      {
        q: 'Ma déclaration est rejetée, que faire ?',
        a: "Lisez le motif, corrigez l'erreur et déclarez de nouveau, ou contactez votre agence."
      },
      { q: 'Pourquoi cette section est-elle absente ?', a: "Vous n'avez encore déclaré aucun paiement." }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: "J'ai payé par mobile money", helpId: 'syndic.portail.appels.declaration' }],
    keywords: ['déclarations', 'mobile money', 'validation', 'rejet', 'justificatif']
  },

  // ------------------------------------------------------------------ Mes quittances
  {
    id: 'syndic.portail.quittances',
    kind: 'page',
    title: 'Mes quittances',
    summary:
      'Cet écran regroupe les reçus de paiement et les quittances de charges émis pour vos lots. Vous les téléchargez en PDF.',
    purpose:
      'Vous gardez la preuve de vos paiements. Un « Reçu » correspond à un paiement ; une « Quittance » correspond à une période soldée.',
    steps: [
      {
        title: 'Filtrer',
        detail:
          'Cherchez un numéro, un lot ou une période, ou filtrez par « Lot », « Type de document » et « Période ».'
      },
      {
        title: 'Télécharger',
        detail: 'Bouton « Télécharger » sur la ligne, ou « Traduction arabe » pour la version en arabe.'
      }
    ],
    faq: [
      {
        q: 'Quelle différence entre reçu et quittance ?',
        a: "Le reçu atteste un paiement ; la quittance atteste qu'une période de charges est soldée."
      },
      {
        q: "Mon reçu n'apparaît pas après un paiement.",
        a: "Il peut arriver quelques instants après la confirmation, ou après la validation d'une déclaration."
      },
      { q: 'Puis-je avoir le document en arabe ?', a: 'Oui, avec le bouton « Traduction arabe ».' }
    ],
    permissions: { roles: ['Copropriétaire'], note: 'Lecture seule : téléchargement de vos propres documents.' },
    related: [{ label: 'Quittances et reçus', helpId: 'syndic.portail.quittances.tableau' }],
    keywords: ['quittances', 'reçus', 'justificatif de paiement', 'pdf']
  },
  {
    id: 'syndic.portail.quittances.tableau',
    kind: 'table',
    title: 'Quittances et reçus',
    summary:
      "Ce tableau liste les documents émis pour vos lots, avec leur numéro, leur montant et leur date d'émission.",
    howToRead: {
      columns: [
        { key: 'number', label: 'Numéro', description: 'Numéro du document.' },
        { key: 'kind', label: 'Type', description: 'Reçu ou Quittance.' },
        { key: 'lot', label: 'Lot', description: 'Lot concerné.' },
        { key: 'period', label: 'Période', description: 'Période couverte, le cas échéant.' },
        { key: 'amount', label: 'Montant', description: 'Montant du document.' },
        { key: 'issuedAt', label: 'Émise le', description: "Date d'émission." },
        { key: 'action', label: 'Action', description: '« Télécharger » et « Traduction arabe ».' }
      ],
      notes: ['Le tableau peut être exporté avec vos filtres.']
    },
    faq: [
      {
        q: 'Pourquoi la colonne « Période » affiche « — » ?',
        a: "Le document n'est pas rattaché à une période, par exemple un reçu de paiement."
      },
      { q: 'Le téléchargement échoue.', a: "Un message s'affiche : réessayez, puis contactez votre agence." },
      { q: 'Le tableau est vide.', a: "Aucun document n'a encore été émis pour vos lots." }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: 'Mes paiements', helpId: 'syndic.portail.paiements' }],
    keywords: ['quittances', 'reçus', 'numéro', 'période']
  },

  // ------------------------------------------------------------------ Suivi mensuel
  {
    id: 'syndic.portail.suivi',
    kind: 'page',
    title: 'Suivi mensuel',
    summary:
      "Cet écran montre, mois par mois et pour un lot, si vos charges sont réglées, partielles, dues ou en retard. Choisissez le lot et l'exercice.",
    purpose:
      "Vous voyez d'un coup d'œil l'état de vos douze mois, le total dû sur l'exercice, ce que vous avez réglé et l'avance disponible.",
    howToRead: {
      statuses: [
        { value: 'PAID', label: 'Réglé', description: 'Le mois est soldé.' },
        { value: 'PARTIAL', label: 'Partiel', description: 'Une partie seulement est réglée.' },
        { value: 'DUE', label: 'Dû', description: 'Le mois est à régler.' },
        { value: 'OVERDUE', label: 'En retard', description: "L'échéance est passée et le mois n'est pas soldé." },
        { value: 'NONE', label: '—', description: 'Aucun appel ce mois-là.' }
      ],
      notes: [
        "Trois montants en haut : « Dû sur l'exercice », « Réglé » et « Avance disponible ».",
        "Un mois précédant votre acquisition est marqué « · » avec l'info-bulle « Avant votre acquisition »."
      ]
    },
    steps: [
      { title: 'Choisir le lot', detail: 'Liste « Lot » (le premier lot est choisi par défaut).' },
      {
        title: "Choisir l'exercice",
        detail: "Liste « Exercice » : la première année proposée n'est pas antérieure à votre acquisition."
      },
      { title: 'Lire la grille', detail: 'Passez la souris sur un mois pour voir le dû et le réglé.' }
    ],
    faq: [
      {
        q: 'Que veut dire un mois marqué « · » ?',
        a: "Ce mois est antérieur à votre acquisition du lot : il n'est pas montré."
      },
      { q: 'Puis-je voir plusieurs lots ensemble ?', a: 'Non, la grille montre un lot à la fois.' },
      { q: 'Où payer un mois en retard ?', a: 'Dans « Mes appels de charges ».' }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [
      { label: 'Grille des douze mois', helpId: 'syndic.portail.suivi.grille' },
      { label: 'Mes appels de charges', helpId: 'syndic.portail.appels' }
    ],
    keywords: ['suivi mensuel', 'mois', 'exercice', 'réglé', 'retard']
  },
  {
    id: 'syndic.portail.suivi.grille',
    kind: 'section',
    title: 'Grille des douze mois',
    summary:
      "La grille affiche un mois par colonne, de « Janv. » à « Déc. », avec une couleur et un libellé selon l'état du mois. Une légende en bas rappelle les couleurs.",
    howToRead: {
      statuses: [
        { value: 'PAID', label: 'Réglé', description: 'Mois soldé.' },
        { value: 'PARTIAL', label: 'Partiel', description: 'Paiement partiel.' },
        { value: 'DUE', label: 'Dû', description: 'Mois à régler.' },
        { value: 'OVERDUE', label: 'En retard', description: 'Échéance dépassée.' }
      ],
      notes: ["L'info-bulle de chaque mois donne le montant dû et le montant réglé."]
    },
    faq: [
      { q: 'Pourquoi un mois est-il vide ?', a: "Aucun appel n'a été émis ce mois-là." },
      {
        q: 'Comment lire les montants ?',
        a: "Passez la souris sur le mois : l'info-bulle indique « dû » et « réglé »."
      },
      {
        q: "Que représente l'avance disponible ?",
        a: 'Les sommes versées en plus des appels, restées disponibles sur le lot.'
      }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: 'Suivi mensuel', helpId: 'syndic.portail.suivi' }],
    keywords: ['grille', 'mois', 'légende', 'couleurs']
  },

  // ------------------------------------------------------------------ Ma copropriété
  {
    id: 'syndic.portail.copropriete',
    kind: 'page',
    title: 'Ma copropriété',
    summary:
      'Cet écran présente votre copropriété : son identité, vos lots, et les coordonnées de qui émet vos documents et de qui gère la copropriété.',
    purpose:
      'Vous savez qui contacter et vous retrouvez les références de votre immeuble. Si vous avez des lots dans plusieurs copropriétés, choisissez celle à afficher.',
    steps: [
      {
        title: 'Choisir la copropriété',
        detail: 'Liste « Copropriété », affichée seulement si vous en avez plusieurs.'
      },
      { title: "Lire l'identité", detail: 'Adresse, immatriculation, référence cadastrale et nombre de lots.' },
      {
        title: 'Trouver votre interlocuteur',
        detail: 'Cartes « Émetteur des documents » et « Gestionnaire de la copropriété ».'
      }
    ],
    faq: [
      {
        q: "Qui est l'émetteur des documents ?",
        a: "Le mandant de la copropriété si elle en a un, sinon l'agence ; ses coordonnées sont sur ses documents."
      },
      {
        q: "Pourquoi aucun gestionnaire n'est affiché ?",
        a: "Aucun gestionnaire n'est désigné : votre interlocuteur est alors l'émetteur des documents."
      },
      {
        q: 'Pourquoi certaines lignes sont-elles absentes ?',
        a: 'Les lignes sans valeur (adresse, téléphone, e-mail) sont masquées.'
      }
    ],
    permissions: { roles: ['Copropriétaire'], note: 'Lecture seule.' },
    related: [{ label: 'Coordonnées', helpId: 'syndic.portail.copropriete.contacts' }],
    keywords: ['copropriété', 'identité', 'syndic', 'gestionnaire', 'contact']
  },
  {
    id: 'syndic.portail.copropriete.contacts',
    kind: 'section',
    title: 'Coordonnées',
    summary:
      "Ces deux cartes donnent le nom, l'adresse, le téléphone et l'e-mail de l'émetteur de vos documents et du gestionnaire de la copropriété.",
    howToRead: {
      notes: [
        "« Émetteur des documents » : celui dont le nom figure sur vos avis d'appel, reçus et quittances (le mandant, sinon l'agence).",
        "« Gestionnaire de la copropriété » : le gestionnaire désigné ; sinon l'écran vous renvoie vers l'émetteur."
      ]
    },
    faq: [
      {
        q: "À qui m'adresser pour une question sur mon compte ?",
        a: "À l'émetteur des documents ou au gestionnaire de la copropriété, selon ce qui est indiqué."
      },
      { q: 'Les logos sont-ils obligatoires ?', a: "Non, un logo n'apparaît que s'il a été ajouté." },
      { q: 'Puis-je modifier ces informations ?', a: 'Non, elles sont en lecture seule.' }
    ],
    permissions: { roles: ['Copropriétaire'] },
    related: [{ label: 'Ma copropriété', helpId: 'syndic.portail.copropriete' }],
    keywords: ['coordonnées', 'émetteur', 'gestionnaire', 'téléphone', 'e-mail']
  }
];

export default entries;
