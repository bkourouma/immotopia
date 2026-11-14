import type { HelpEntry } from '../../../types';

/** Zone « enligne » du module « locatif » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.enligne.liste',
    kind: 'page',
    title: 'Paiements en ligne',
    summary:
      'Suivez ici les loyers que vos locataires paient en ligne, tranchez les paiements à vérifier et consultez le compte de collecte. L’écran a deux onglets : « Suivi des paiements en ligne » et « Compte de collecte ».',
    purpose:
      'Un locataire paie une échéance depuis son portail ou depuis un lien de paiement. Chaque tentative apparaît ici avec son statut. Quand la passerelle de paiement (PaySecureHub) rapporte quelque chose d’inattendu, le paiement n’est pas encaissé tout seul : il passe « À trancher » et c’est à vous de décider.',
    steps: [
      {
        title: 'Repérer les paiements à trancher',
        detail:
          'Un badge « À vérifier » sur l’onglet « Suivi des paiements en ligne » indique le nombre de cas en attente de décision.'
      },
      {
        title: 'Retrouver un paiement',
        detail:
          'Filtrez par statut, tapez un code de paiement, un locataire ou un bail, ou choisissez une période « Du » « Au ».'
      },
      {
        title: 'Actualiser un paiement',
        detail: '« Vérifier » interroge la passerelle et met le statut à jour si quelque chose a changé.'
      },
      {
        title: 'Décider d’un cas',
        detail: '« Trancher » ouvre la décision : accepter (encaisser) ou refuser.'
      },
      {
        title: 'Suivre le compte de collecte',
        detail: 'Ouvrez l’onglet « Compte de collecte » pour voir le solde et reverser vers la trésorerie.'
      }
    ],
    consequences: [
      'Si le paiement en ligne n’est pas disponible pour votre agence (non configuré, désactivé, mode simulateur non autorisé ou abonnement sans cette option), un bandeau jaune en haut de l’écran donne la raison.',
      'Accepter un paiement à trancher encaisse le montant reçu et l’affecte aux échéances encore ouvertes. Refuser n’enregistre rien et ne rembourse personne.',
      'Chaque décision et chaque reversement sont inscrits dans le journal d’audit.'
    ],
    faq: [
      {
        q: 'Pourquoi un paiement est-il « À trancher » ?',
        a: 'La passerelle a rapporté un cas à contrôler : montant différent, état contraire, transaction déjà enregistrée ou échéance qui n’est plus disponible. Le motif est écrit sous le statut.'
      },
      {
        q: 'Je ne vois pas les boutons « Vérifier » et « Trancher ». Pourquoi ?',
        a: 'Ils demandent le droit « Allouer les paiements ». Voir l’écran demande « Voir les paiements ». Demandez le droit à l’administrateur de votre agence.'
      },
      {
        q: 'Cet écran montre-t-il tous les paiements de loyer ?',
        a: 'Non, seulement les tentatives de paiement en ligne. Les autres paiements se consultent dans la liste des paiements de loyer.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Voir l’écran demande « Voir les paiements ». « Vérifier », « Trancher » et le reversement demandent « Allouer les paiements ». Le reversement demande aussi « Créer des pièces financières ».'
    },
    related: [
      { label: 'Comment lire le tableau des paiements en ligne', helpId: 'locatif.enligne.liste.tableau' },
      { label: 'Le compte de collecte', helpId: 'locatif.enligne.collecte' },
      { label: 'Trancher un paiement', helpId: 'locatif.enligne.decision' },
      { label: 'Liste des paiements de loyer', helpId: 'locatif.paiements.liste' }
    ],
    keywords: [
      'paiement en ligne',
      'mobile money',
      'lien de paiement',
      'paysecurehub',
      'passerelle',
      'checkout',
      'à trancher',
      'litige',
      'loyer payé en ligne'
    ]
  },
  {
    id: 'locatif.enligne.liste.tableau',
    kind: 'table',
    title: 'Tableau des paiements en ligne',
    summary:
      'Chaque ligne est une tentative de paiement en ligne d’un locataire. Le statut dit où elle en est ; les boutons « Vérifier » et « Trancher » apparaissent selon le statut et vos droits.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: 'Date et heure de création de la tentative.' },
        {
          key: 'codePaiement',
          label: 'Code',
          description: 'Le code du paiement (copiable). L’étiquette « Simulateur » indique un essai sans argent réel.'
        },
        { key: 'lease', label: 'Bail', description: 'La référence du bail, avec le bien en dessous.' },
        {
          key: 'renter',
          label: 'Locataire',
          description: 'Le locataire qui a lancé le paiement. « Fiche introuvable » si sa fiche n’existe plus.'
        },
        {
          key: 'installments',
          label: 'Échéances',
          description: 'Les échéances visées, au format mois/année (par exemple 03/2026).'
        },
        {
          key: 'amount',
          label: 'Montant',
          description:
            'Le montant demandé en FCFA. Si la passerelle a rapporté un autre montant, « Reçu : … » s’affiche en dessous.'
        },
        {
          key: 'origin',
          label: 'Origine',
          description:
            '« Portail » (le locataire a payé depuis son espace) ou « Lien de paiement », avec le moyen de paiement utilisé en dessous.'
        },
        {
          key: 'status',
          label: 'Statut',
          description:
            'L’état de la tentative (voir ci-dessous). Pour un paiement « À trancher », le motif est écrit en dessous ; une fois la décision prise, « Accepté » ou « Refusé » s’affiche avec la personne et sa note.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Vérifier » et « Trancher », visibles seulement avec le droit « Allouer les paiements ».'
        }
      ],
      statuses: [
        {
          value: 'PENDING',
          label: 'En attente',
          description: 'Le locataire n’a pas encore fini, ou la passerelle n’a pas encore répondu.'
        },
        { value: 'SUCCESS', label: 'Payé', description: 'Le paiement est réussi et encaissé.' },
        {
          value: 'FAILED',
          label: 'Échoué',
          description: 'Le paiement a échoué ou a été refusé. Le message d’échec est écrit en dessous.'
        },
        { value: 'CANCELED', label: 'Annulé', description: 'La tentative a été annulée.' },
        { value: 'EXPIRED', label: 'Expiré', description: 'Le délai de la tentative est dépassé sans paiement.' },
        {
          value: 'REVIEW',
          label: 'À trancher',
          description: 'Un cas à contrôler : rien n’est encaissé tant que vous n’avez pas décidé.'
        }
      ],
      notes: [
        'Motifs d’un paiement « À trancher » : « Montant payé différent du montant attendu », « État contraire rapporté par la passerelle », « Transaction fournisseur déjà enregistrée », « Une échéance visée n’est plus disponible ».',
        '« Vérifier » est proposé pour les statuts « En attente », « À trancher » et « Expiré » : un paiement réussi tardivement peut ainsi être relu.',
        '« Trancher » n’est proposé que pour un paiement « À trancher » qui n’a pas encore de décision.'
      ]
    },
    steps: [
      { title: 'Filtrer par statut', detail: 'Choisissez un ou plusieurs statuts dans le champ « Statut ».' },
      { title: 'Rechercher', detail: 'Code de paiement, locataire ou bail.' },
      { title: 'Choisir une période', detail: 'Champs « Du » et « Au », sur la date de création.' },
      {
        title: 'Vérifier un paiement',
        detail:
          'Cliquez sur « Vérifier ». Un message dit si le statut a été mis à jour ou si rien n’a changé chez la passerelle.'
      },
      { title: 'Trancher un paiement', detail: 'Cliquez sur « Trancher » pour ouvrir la fenêtre de décision.' }
    ],
    consequences: [
      '« Vérifier » relit l’état chez la passerelle et met à jour le statut de la tentative si quelque chose a changé.'
    ],
    faq: [
      {
        q: 'Que signifie « Reçu » sous un montant ?',
        a: 'Le locataire a payé un montant différent de celui demandé. Le paiement passe « À trancher » pour que vous décidiez.'
      },
      {
        q: 'Pourquoi « Vérifier » n’apparaît-il pas sur un paiement « Payé » ?',
        a: 'Il n’y a plus rien à relire : seuls les statuts « En attente », « À trancher » et « Expiré » le proposent.'
      },
      {
        q: 'Où retrouver les autres paiements de loyer ?',
        a: 'Dans la liste des paiements de loyer du locatif.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: '« Vérifier » et « Trancher » demandent « Allouer les paiements ».'
    },
    related: [
      { label: 'Trancher un paiement', helpId: 'locatif.enligne.decision' },
      { label: 'Vue d’ensemble des paiements en ligne', helpId: 'locatif.enligne.liste' }
    ],
    keywords: ['statut', 'à vérifier', 'montant reçu', 'simulateur', 'lien de paiement', 'portail']
  },
  {
    id: 'locatif.enligne.decision',
    kind: 'section',
    title: 'Trancher un paiement',
    summary:
      'Cette fenêtre vous fait décider d’un paiement « À trancher » : l’accepter pour l’encaisser, ou le refuser. Le motif et les chiffres du paiement sont rappelés en haut.',
    purpose:
      'Quand la passerelle rapporte un cas inhabituel, ImmoTopia n’encaisse rien sans votre accord. Vérifiez au besoin l’état réel de la transaction chez PaySecureHub avant de décider.',
    steps: [
      { title: 'Lire le motif', detail: 'L’encadré jaune explique pourquoi le paiement est à trancher.' },
      {
        title: 'Contrôler les chiffres',
        detail:
          'Montant demandé, montant reçu, bail, locataire, moyen de paiement, transaction fournisseur, dernière vérification.'
      },
      {
        title: 'Choisir la décision',
        detail:
          '« Accepter : enregistrer l’encaissement » ou « Refuser : ne rien enregistrer ». Une option grisée n’est pas permise pour ce motif.'
      },
      {
        title: 'Date de paiement',
        detail: 'En cas d’acceptation, choisissez la « Date de paiement » (pas dans le futur).'
      },
      { title: 'Écrire une note', detail: 'La note est facultative pour accepter et obligatoire pour refuser.' },
      { title: 'Valider', detail: 'Cliquez sur « Enregistrer la décision ».' }
    ],
    consequences: [
      'Accepter encaisse le montant reçu (ou le montant demandé s’il n’est pas rapporté) et l’affecte aux échéances encore ouvertes parmi celles visées. Un trop-perçu reste non alloué ; un montant inférieur laisse un reste dû.',
      'Refuser n’enregistre rien. L’argent reste chez PaySecureHub : aucun remboursement n’est fait depuis ImmoTopia.',
      'Une décision ne se reprend pas depuis cet écran. La note est conservée dans le journal d’audit.',
      'Cas par motif : une transaction déjà enregistrée ne peut qu’être refusée ; un état contraire alors que l’argent est déjà encaissé ne peut qu’être accepté (cela clôt simplement le suivi) ; les autres motifs permettent les deux décisions.'
    ],
    faq: [
      {
        q: 'Pourquoi une des deux décisions est-elle grisée ?',
        a: 'Le motif l’interdit : une transaction déjà enregistrée sur un autre paiement ne peut pas être acceptée, et un paiement déjà encaissé ne peut pas être refusé ici.'
      },
      {
        q: 'Le locataire est-il remboursé si je refuse ?',
        a: 'Non. Le message affiché le rappelle : le payeur n’a pas été remboursé. Le remboursement se règle avec PaySecureHub, hors d’ImmoTopia.'
      },
      {
        q: 'Pourquoi la note est-elle obligatoire pour refuser ?',
        a: 'Le motif du refus est conservé dans le journal d’audit.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande le droit « Allouer les paiements ».' },
    related: [{ label: 'Tableau des paiements en ligne', helpId: 'locatif.enligne.liste.tableau' }],
    keywords: ['trancher', 'accepter', 'refuser', 'décision', 'trop-perçu', 'montant différent', 'doublon']
  },
  {
    id: 'locatif.enligne.collecte',
    kind: 'section',
    title: 'Compte de collecte',
    summary:
      'Le compte de collecte reçoit les loyers payés en ligne avant que vous ne les reversiez vers votre trésorerie. Cet onglet montre son solde et l’historique des reversements.',
    purpose:
      'Les encaissements en ligne arrivent sur un compte comptable dédié (compte 5525). Le reversement transfère ce solde vers une banque ou une caisse de votre agence.',
    howToRead: {
      notes: [
        '« Solde comptable (5525) » : ce qu’ImmoTopia a enregistré sur le compte de collecte.',
        '« Solde PaySecureHub » : le solde lu chez la passerelle, avec sa date. Si la passerelle n’est pas configurée, en mode simulateur, sans identifiants ou injoignable, un message le dit à la place.',
        'Les deux soldes peuvent différer : le reversement n’est qu’une écriture dans ImmoTopia.'
      ]
    },
    steps: [
      { title: 'Lire les soldes', detail: 'Comparez le solde comptable et le solde PaySecureHub.' },
      {
        title: 'Reverser',
        detail:
          'Cliquez sur « Reverser vers la trésorerie ». Le bouton est inactif tant qu’il n’y a aucun solde à reverser.'
      },
      {
        title: 'Consulter l’historique',
        detail: 'Le tableau « Reversements vers la trésorerie » liste les reversements enregistrés.'
      }
    ],
    consequences: [
      'Le reversement est une écriture comptable dans ImmoTopia seulement : aucun virement réel n’est déclenché chez PaySecureHub.'
    ],
    faq: [
      {
        q: 'Pourquoi « Reverser vers la trésorerie » est-il grisé ?',
        a: 'Le solde comptable du compte de collecte est nul : il n’y a rien à reverser.'
      },
      {
        q: 'Le reversement envoie-t-il l’argent à la banque ?',
        a: 'Non. Il enregistre seulement le transfert dans votre comptabilité. Aucun virement réel n’est déclenché chez PaySecureHub.'
      },
      {
        q: 'Pourquoi le solde PaySecureHub est-il absent ?',
        a: 'La passerelle n’est pas configurée, tourne en mode simulateur, manque d’identifiants ou ne répond pas. Le message affiché précise la cause.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Voir demande « Voir les paiements ». Reverser demande « Allouer les paiements » et « Créer des pièces financières ».'
    },
    related: [
      { label: 'Reverser vers la trésorerie', helpId: 'locatif.enligne.reversement' },
      { label: 'Historique des reversements', helpId: 'locatif.enligne.collecte.reversements' }
    ],
    keywords: ['5525', 'solde', 'trésorerie', 'reversement', 'paysecurehub', 'collecte']
  },
  {
    id: 'locatif.enligne.collecte.reversements',
    kind: 'table',
    title: 'Reversements vers la trésorerie',
    summary:
      'Chaque ligne est un reversement du compte de collecte vers un compte de trésorerie de votre agence. Les plus récents sont en haut.',
    howToRead: {
      columns: [
        { key: 'number', label: 'Numéro', description: 'Le numéro du virement (par exemple VIR-2026-0001).' },
        { key: 'date', label: 'Date', description: 'La date du reversement choisie à la saisie.' },
        { key: 'toLabel', label: 'Destination', description: 'Le compte de trésorerie qui reçoit le montant.' },
        { key: 'amount', label: 'Montant', description: 'Le montant reversé en FCFA.' },
        { key: 'note', label: 'Note', description: 'La note saisie, ou un tiret s’il n’y en a pas.' },
        { key: 'createdByName', label: 'Saisi par', description: 'La personne qui a enregistré le reversement.' }
      ]
    },
    faq: [
      {
        q: 'Un reversement annulé apparaît-il ici ?',
        a: 'Non : la liste ne montre que les reversements non annulés.'
      },
      {
        q: 'Pourquoi la liste est-elle vide ?',
        a: '« Aucun reversement enregistré » signifie qu’aucun reversement n’a encore été fait depuis le compte de collecte.'
      },
      {
        q: 'Peut-on exporter ce tableau ?',
        a: 'Oui, avec les options d’export du tableau, sous le nom « Reversements vers la trésorerie ».'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les paiements ».' },
    related: [{ label: 'Le compte de collecte', helpId: 'locatif.enligne.collecte' }],
    keywords: ['virement', 'historique', 'reversement']
  },
  {
    id: 'locatif.enligne.reversement',
    kind: 'section',
    title: 'Reverser vers la trésorerie',
    summary:
      'Cette fenêtre enregistre le transfert d’une partie ou de tout le solde du compte de collecte vers une banque ou une caisse de votre agence.',
    purpose:
      'Une fois les loyers en ligne encaissés, vous les rattachez à votre trésorerie. Vous ne pouvez pas reverser plus que le solde du compte de collecte.',
    steps: [
      { title: 'Compte de destination', detail: 'Choisissez une banque ou une caisse active de votre agence.' },
      { title: 'Montant reversé', detail: 'Saisissez le montant, ou cliquez sur « Tout reverser ».' },
      { title: 'Date du reversement', detail: 'Aujourd’hui par défaut ; une date future est refusée.' },
      { title: 'Note (facultative)', detail: '500 caractères au plus.' },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer ». Un message confirme le numéro du reversement et le nouveau solde.'
      }
    ],
    consequences: [
      'Enregistrement comptable seulement : aucun virement réel n’est déclenché chez PaySecureHub.',
      'Le montant sort du compte de collecte et entre dans le compte de destination choisi. Le reversement reçoit un numéro de virement et figure dans le journal d’audit.',
      'Le reversement va vers la trésorerie de votre agence. Cet écran ne verse rien directement à un propriétaire.',
      'Cet écran n’offre aucun bouton pour annuler un reversement : vérifiez le compte et le montant avant d’enregistrer.'
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Enregistrer » est-il grisé ?',
        a: 'Il faut un compte de destination, un montant supérieur à zéro et inférieur ou égal au solde, et une date.'
      },
      {
        q: 'Quels comptes puis-je choisir ?',
        a: 'Seulement vos banques et caisses actives. Le compte de collecte lui-même n’est jamais proposé.'
      },
      {
        q: 'J’ai le message « Le montant dépasse le solde du compte de collecte ». Que faire ?',
        a: 'Baissez le montant ou cliquez sur « Tout reverser » pour prendre exactement le solde.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Demande « Allouer les paiements » et « Créer des pièces financières ». Sans ce second droit, l’enregistrement est refusé.'
    },
    related: [{ label: 'Le compte de collecte', helpId: 'locatif.enligne.collecte' }],
    keywords: ['reverser', 'transfert', 'banque', 'caisse', 'trésorerie', 'virement']
  }
];

export default entries;
