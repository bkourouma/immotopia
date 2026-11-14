import type { HelpEntry } from '../../../types';

/** Zone « paiements » du module « locatif » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.paiements.liste',
    kind: 'page',
    title: 'Liste des paiements',
    summary:
      "Retrouvez ici les paiements de loyer reçus par votre agence, et les paiements que vos locataires ont déclarés. C'est l'écran où vous enregistrez un encaissement, puis où vous l'affectez aux échéances.",
    purpose:
      "Un paiement est l'argent reçu d'un locataire pour un bail. Il est d'abord enregistré, puis affecté à une ou plusieurs échéances, qui passent alors à « Partiel » ou « Payé ». Le même écran apparaît aussi dans l'onglet des paiements de la fiche d'un bail, limité à ce bail.",
    steps: [
      {
        title: 'Enregistrer un paiement',
        detail:
          'Cliquez sur « Nouveau paiement », choisissez le bail, le mode de paiement, le montant et la date du règlement.'
      },
      {
        title: 'Affecter le paiement',
        detail: 'Sur la ligne du paiement, cliquez sur « Affecter » puis choisissez les échéances à solder.'
      },
      {
        title: 'Rechercher et filtrer',
        detail: 'Utilisez la recherche, puis les filtres Statut, Période, Locataire, Méthode et Montant.'
      },
      {
        title: 'Ouvrir un paiement',
        detail: "Cliquez sur « Voir » pour consulter le détail, changer son statut ou l'annuler."
      },
      {
        title: 'Traiter les déclarations',
        detail:
          "Ouvrez l'onglet « Déclarations en attente » pour valider ou rejeter les paiements déclarés par vos locataires."
      },
      {
        title: 'Exporter',
        detail:
          'Bouton « Exporter » : tous les paiements correspondant à vos filtres sont exportés, pas seulement la page affichée.'
      }
    ],
    consequences: [
      "« Nouveau paiement » enregistre le paiement directement au statut « Réussi » mais ne solde aucune échéance : c'est l'affectation qui le fait. Aucun message n'est envoyé au locataire à l'enregistrement.",
      "L'affectation met à jour les échéances (« Partiel » ou « Payé ») et prévient le locataire par e-mail et le propriétaire par e-mail, si ces notifications sont activées pour votre agence. Le locataire reçoit aussi un message WhatsApp si votre agence l'a configuré.",
      "Aucune quittance n'est créée automatiquement par un paiement : elle se génère à part, depuis les documents du bail."
    ],
    faq: [
      {
        q: 'Pourquoi mon paiement apparaît-il avec un « Reste à affecter » ?',
        a: 'Il est enregistré mais pas encore rattaché à des échéances. Cliquez sur « Affecter » pour le faire.'
      },
      {
        q: 'Je ne vois pas « Nouveau paiement » ou « Affecter ». Pourquoi ?',
        a: 'Ces actions dépendent de vos droits : « Créer des paiements » pour enregistrer, « Allouer les paiements » pour affecter. Un rôle en lecture seule, comme le Comptable, ne les voit pas.'
      },
      {
        q: 'Pourquoi un paiement annulé ne montre-t-il plus de reste à affecter ?',
        a: "Un paiement « Échoué » ou « Annulé » n'a encaissé aucun argent : il n'y a rien à affecter."
      },
      {
        q: 'Comment corriger un paiement saisi par erreur ?',
        a: 'Ouvrez-le avec « Voir » et passez son statut à « Annulé » : ses affectations sont défaites et les échéances sont recalculées.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      roles: ['Gestionnaire', 'Comptable (lecture seule)'],
      note: 'Voir la liste demande « Voir les paiements », enregistrer demande « Créer des paiements », affecter et traiter les déclarations demandent « Allouer les paiements ».'
    },
    related: [
      { label: 'Comment lire le tableau des paiements', helpId: 'locatif.paiements.liste.tableau' },
      { label: 'Enregistrer un nouveau paiement', helpId: 'locatif.paiements.nouveau' },
      { label: 'Affecter un paiement aux échéances', helpId: 'locatif.paiements.affectation' },
      { label: 'Les déclarations de paiement des locataires', helpId: 'locatif.paiements.declarations' },
      { label: 'Liste des échéances', helpId: 'locatif.echeances.liste' }
    ],
    keywords: [
      'paiement',
      'encaissement',
      'encaisser',
      'règlement',
      'loyer reçu',
      'affecter',
      'allouer',
      'locataire a payé'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'paiements-nouveau',
          title: 'Enregistrer un paiement',
          description:
            'Cliquez ici dès que vous recevez un loyer : choisissez le bail, le mode de paiement, le montant et la date du règlement.'
        },
        {
          target: 'paiements-onglets',
          title: 'Paiements et déclarations',
          description:
            'Dans « Paiements », vous voyez les encaissements. Dans « Déclarations en attente », vous validez ou rejetez les paiements que vos locataires déclarent.'
        },
        {
          target: 'paiements-tableau',
          title: 'Affecter aux échéances',
          description:
            "Sur chaque ligne, « Affecter » rattache le paiement aux échéances à solder. Tant que ce n'est pas fait, la colonne « Reste à affecter » affiche le montant."
        }
      ]
    }
  },
  {
    id: 'locatif.paiements.liste.tableau',
    kind: 'table',
    title: 'Tableau des paiements',
    summary:
      "Chaque ligne est un paiement reçu, avec son montant, ce qu'il reste à affecter et son statut. Cliquez sur « Voir » pour ouvrir le paiement.",
    purpose:
      "Le tableau vous dit quels paiements attendent encore d'être rattachés à des échéances et lesquels sont soldés. Dans l'onglet d'un bail, les colonnes « Bail » et « Locataire » sont masquées.",
    howToRead: {
      columns: [
        { key: 'bail', label: 'Bail', description: 'Numéro du bail et nom du bien.' },
        { key: 'locataire', label: 'Locataire', description: 'Locataire qui a payé.' },
        {
          key: 'date',
          label: 'Date',
          description: 'Date du règlement : le jour où le locataire a payé, et non le jour de la saisie.'
        },
        { key: 'montant', label: 'Montant', description: 'Montant reçu.' },
        {
          key: 'reste',
          label: 'Reste à affecter',
          description:
            'Part du paiement pas encore rattachée à une échéance (ni au dépôt de garantie). Affiche « Affecté » quand tout est réparti.'
        },
        {
          key: 'methode',
          label: 'Méthode',
          description: 'Mode de paiement : espèces, virement, chèque, Mobile Money, etc.'
        },
        { key: 'statut', label: 'Statut', description: 'État du paiement, voir les statuts ci-dessous.' },
        {
          key: 'en-ligne',
          label: 'En ligne',
          description:
            'Renseignée seulement si le paiement est passé par le paiement en ligne ; sinon la case reste vide.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            "« Voir » ouvre le paiement ; « Affecter » apparaît si un reste est à affecter et si vous avez le droit d'allouer."
        }
      ],
      statuses: [
        { value: 'PENDING', label: 'En attente', description: 'Paiement attendu, pas encore encaissé.' },
        { value: 'SUCCESS', label: 'Réussi', description: 'Paiement encaissé : il peut être affecté.' },
        { value: 'FAILED', label: 'Échoué', description: "Le paiement n'a pas abouti : aucun argent encaissé." },
        { value: 'CANCELED', label: 'Annulé', description: 'Paiement annulé : ses affectations ont été défaites.' },
        { value: 'REFUNDED', label: 'Remboursé', description: 'Paiement remboursé. Ce statut est définitif.' },
        {
          value: 'PARTIALLY_REFUNDED',
          label: 'Partiellement remboursé',
          description: 'Une partie du paiement a été remboursée.'
        }
      ],
      notes: [
        "Sur téléphone, chaque paiement s'affiche sous forme de carte avec « Déjà affecté » et « Reste à affecter »."
      ]
    },
    steps: [
      { title: 'Rechercher', detail: 'Tapez une référence, un numéro de bail, un bien ou un nom de locataire.' },
      { title: 'Filtrer', detail: 'Statut, Période, Locataire, Méthode et Montant (en FCFA) réduisent la liste.' },
      { title: 'Affecter un paiement', detail: 'Cliquez sur « Affecter » sur la ligne.' },
      { title: 'Ouvrir un paiement', detail: 'Cliquez sur « Voir ».' }
    ],
    faq: [
      {
        q: 'Quelle date est affichée ?',
        a: "La date du règlement, c'est-à-dire le jour où le locataire a payé. Pour un paiement encore en attente, c'est la date de saisie."
      },
      {
        q: "L'export contient-il tous les paiements ?",
        a: 'Oui : tous les paiements qui correspondent à vos filtres, pas seulement la page affichée.'
      },
      {
        q: 'Que veut dire « Affecté » dans « Reste à affecter » ?',
        a: "Le paiement est entièrement réparti entre des échéances ou le dépôt de garantie : il n'y a plus rien à faire."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Demande « Voir les paiements ». Le bouton « Affecter » demande « Allouer les paiements ».'
    },
    related: [
      { label: 'Affecter un paiement aux échéances', helpId: 'locatif.paiements.affectation' },
      { label: "Fiche d'un paiement", helpId: 'locatif.paiements.fiche' }
    ],
    keywords: ['liste des paiements', 'reste à affecter', 'encaissements', 'exporter les paiements']
  },
  {
    id: 'locatif.paiements.nouveau',
    kind: 'section',
    title: 'Enregistrer un paiement',
    summary:
      "Cette fenêtre enregistre un loyer reçu d'un locataire. Elle ne solde aucune échéance : vous les affectez ensuite.",
    purpose:
      "Utilisez-la quand le locataire paie à l'agence en espèces, par virement, par chèque, par Mobile Money ou par carte. Le paiement est créé directement au statut « Réussi ».",
    steps: [
      {
        title: 'Choisir le bail',
        detail:
          "Le champ « Bail » est demandé quand vous partez de la liste globale ; il est déjà fixé dans l'onglet d'un bail."
      },
      {
        title: 'Choisir la méthode de paiement',
        detail: 'Espèces, Virement bancaire, Chèque, Mobile Money, Carte bancaire ou Autre.'
      },
      {
        title: 'Si Mobile Money',
        detail: "Renseignez l'« Opérateur » et le « Numéro de téléphone » : les deux sont obligatoires."
      },
      {
        title: 'Choisir le compte de trésorerie',
        detail: 'Facultatif : sans choix, le compte par défaut du mode de paiement est utilisé.'
      },
      { title: 'Saisir le montant', detail: 'Un nombre supérieur à 0, dans la devise du bail.' },
      {
        title: 'Indiquer la date du règlement',
        detail: 'Le jour où le locataire a payé. Elle ne peut pas être dans le futur.'
      },
      {
        title: 'Compléter si besoin',
        detail: 'Les champs « PSP », « ID Transaction PSP » et « Référence PSP » sont facultatifs.'
      },
      { title: 'Valider', detail: 'Cliquez sur « Enregistrer le paiement ».' }
    ],
    consequences: [
      'Le paiement est créé « Réussi » et daté du jour de règlement que vous avez indiqué ; il compte à cette date dans les relevés.',
      "Il n'est rattaché à aucune échéance : le montant apparaît dans « Reste à affecter » et est compté comme reçu en avance sur le compte du locataire jusqu'à l'affectation.",
      'La devise doit être celle du bail : un paiement dans une autre devise est refusé.',
      "Aucun e-mail ni message n'est envoyé à l'enregistrement. Le locataire est prévenu au moment de l'affectation.",
      'Pour défaire une erreur, passez le paiement à « Annulé » depuis sa fiche.'
    ],
    faq: [
      {
        q: "Pourquoi mon échéance est-elle toujours impayée après l'enregistrement ?",
        a: "L'enregistrement ne solde rien. Cliquez sur « Affecter » sur la ligne du paiement pour le rattacher à l'échéance."
      },
      {
        q: 'Quelle date dois-je saisir ?',
        a: "Celle où le locataire a réellement payé, même si vous saisissez plus tard : c'est elle qui sert aux relevés et au compte du locataire."
      },
      {
        q: 'Pourquoi la devise est-elle refusée ?',
        a: "Aucune conversion n'existe : le paiement doit être dans la devise du bail, le plus souvent FCFA."
      },
      {
        q: 'À quoi sert le compte de trésorerie ?',
        a: "Il indique le compte (caisse, banque, Mobile Money) qui reçoit l'argent. Sans choix, le compte par défaut du mode de paiement est crédité."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Créer des paiements ».' },
    related: [
      { label: 'Affecter un paiement aux échéances', helpId: 'locatif.paiements.affectation' },
      { label: 'Liste des paiements', helpId: 'locatif.paiements.liste' }
    ],
    keywords: [
      'nouveau paiement',
      'encaisser un loyer',
      'saisir un paiement',
      'espèces',
      'mobile money',
      'virement',
      'chèque'
    ]
  },
  {
    id: 'locatif.paiements.affectation',
    kind: 'section',
    title: 'Affecter un paiement aux échéances',
    summary:
      "Affecter, c'est répartir un paiement entre les échéances impayées d'un bail. Les échéances concernées passent à « Partiel » ou « Payé ».",
    purpose:
      "Un paiement enregistré ne solde rien tant qu'il n'est pas affecté. La fenêtre liste les échéances du bail qui ont encore un reste à payer.",
    steps: [
      {
        title: 'Lire les montants',
        detail: "« Montant total », « Déjà alloué » et « Montant disponible » rappellent ce qu'il reste à répartir."
      },
      { title: 'Cocher les échéances', detail: 'Cochez chaque échéance à payer ; son « Reste à payer » est indiqué.' },
      {
        title: 'Saisir un montant (facultatif)',
        detail:
          'Pour une échéance cochée, saisissez le montant à lui affecter. Laissé vide, le montant est calculé automatiquement.'
      },
      { title: 'Valider', detail: 'Cliquez sur « Allouer le paiement ».' }
    ],
    consequences: [
      'Sans montant saisi, les échéances sont servies de la plus ancienne à la plus récente, à hauteur de leur reste dû et du montant disponible.',
      "Une échéance entièrement couverte passe à « Payé », sinon à « Partiel ». Le montant payé de l'échéance est mis à jour.",
      "Le locataire est prévenu par e-mail et le propriétaire aussi, si ces notifications sont activées pour votre agence ; le locataire reçoit en plus un message WhatsApp si votre agence l'a configuré.",
      "Un paiement ne peut être affecté qu'une fois à une même échéance : le reliquat se verse à une autre échéance.",
      'Seul un paiement « Réussi » rattaché à un bail peut être affecté.'
    ],
    faq: [
      {
        q: "Pourquoi aucune échéance ne s'affiche-t-elle ?",
        a: "Toutes les échéances du bail sont déjà payées, ou le bail n'a pas encore d'échéances générées."
      },
      {
        q: 'Que se passe-t-il si le paiement dépasse le reste dû ?',
        a: "L'échéance n'est jamais surpayée : le surplus reste disponible pour une autre échéance."
      },
      {
        q: 'Pourquoi le montant que je saisis est-il refusé ?',
        a: "Il doit être supérieur à 0, ne pas dépasser le reste dû de l'échéance ni le montant disponible du paiement."
      },
      {
        q: 'Puis-je défaire une affectation ?',
        a: 'Pas ligne par ligne. Passer le paiement à « Annulé » défait toutes ses affectations.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Allouer les paiements ».' },
    related: [
      { label: "Fiche d'un paiement", helpId: 'locatif.paiements.fiche' },
      { label: 'Liste des échéances', helpId: 'locatif.echeances.liste' }
    ],
    keywords: ['affecter', 'allouer', 'imputer', 'imputation', 'solder une échéance', 'répartir un paiement']
  },
  {
    id: 'locatif.paiements.declarations',
    kind: 'section',
    title: 'Déclarations en attente',
    summary:
      'Vos locataires peuvent déclarer un paiement mobile money déjà effectué. Vous le vérifiez, puis vous le validez ou le rejetez depuis cet onglet.',
    purpose:
      "Une déclaration ne crédite rien tant que vous ne l'avez pas validée. Un badge sur l'onglet indique le nombre de déclarations en attente (rouge si certaines sont en retard).",
    steps: [
      { title: "Ouvrir l'onglet", detail: 'Cliquez sur « Déclarations en attente ».' },
      { title: 'Consulter', detail: 'Cliquez sur « Détail » pour voir la déclaration et la capture jointe.' },
      { title: 'Valider ou rejeter', detail: 'Utilisez « Approuver » ou « Rejeter » sur la ligne.' },
      {
        title: 'Déclarer pour un locataire',
        detail: 'Bouton « Déclarer pour un tiers », si vous avez le droit de créer des paiements.'
      }
    ],
    consequences: [
      'Valider crée un vrai paiement « Réussi » ; rejeter ne crée rien. Voir les fiches « Approuver » et « Rejeter ».',
      "La déclaration n'apparaît dans le portail du locataire que si votre agence a activé les déclarations et ajouté un numéro de réception actif."
    ],
    faq: [
      {
        q: 'Où activer les déclarations de paiement ?',
        a: "Dans les paramètres financiers de l'agence : cartes « Paiement par transfert mobile money » et « Réglages des paiements déclarés »."
      },
      {
        q: 'Que veut dire « En retard » ?',
        a: "La déclaration attend depuis plus de jours ouvrés que le délai d'alerte fixé dans les réglages."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Voir demande « Voir les paiements » ; approuver et rejeter demandent « Allouer les paiements » ; déclarer pour un tiers demande « Créer des paiements ».'
    },
    related: [
      { label: 'Tableau des déclarations', helpId: 'locatif.paiements.declarations.tableau' },
      { label: 'Réglages des paiements déclarés', helpId: 'locatif.paiements.declarations.reglages' },
      { label: 'Numéros de réception', helpId: 'locatif.paiements.declarations.numeros' }
    ],
    keywords: ['déclaration de paiement', 'paiement déclaré', 'locataire déclare', 'capture', 'valider un paiement']
  },
  {
    id: 'locatif.paiements.declarations.tableau',
    kind: 'table',
    title: 'Tableau des déclarations',
    summary: 'Chaque ligne est un paiement déclaré par un locataire (ou saisi pour lui), avec son état de traitement.',
    purpose:
      "Les actions « Approuver » et « Rejeter » n'apparaissent que sur les déclarations « En attente » et pour les personnes qui ont le droit d'allouer les paiements.",
    howToRead: {
      columns: [
        { key: 'created_at', label: 'Date de déclaration', description: 'Jour où la déclaration a été déposée.' },
        {
          key: 'payment_date',
          label: 'Date de paiement',
          description: 'Jour où le paiement a été fait selon le déclarant.'
        },
        { key: 'lease', label: 'Bail', description: 'Numéro du bail et nom du bien.' },
        { key: 'declarer', label: 'Locataire', description: 'Personne qui a déclaré le paiement.' },
        {
          key: 'installment',
          label: 'Échéance',
          description: "Échéance visée, ou « - » si le déclarant n'en a pas indiqué."
        },
        { key: 'amount', label: 'Montant', description: 'Montant déclaré.' },
        { key: 'payment_method', label: 'Méthode', description: 'Mode de paiement déclaré.' },
        { key: 'operator', label: 'Opérateur', description: 'Opérateur Mobile Money, si renseigné.' },
        {
          key: 'receiving_number',
          label: 'N° de réception',
          description: 'Numéro de votre agence qui a reçu le transfert.'
        },
        { key: 'reference', label: 'Référence', description: 'Référence de la transaction.' },
        {
          key: 'status',
          label: 'Statut',
          description:
            'État de la déclaration, avec des alertes éventuelles : « Doublon probable », « Modifié après lecture IA », « En retard ».'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Détail », voir la preuve de paiement, « Approuver » et « Rejeter ».'
        }
      ],
      statuses: [
        { value: 'PENDING', label: 'En attente', description: "À vérifier : rien n'est encore crédité." },
        { value: 'APPROVED', label: 'Approuvée', description: 'Validée : un paiement a été créé.' },
        { value: 'REJECTED', label: 'Rejetée', description: 'Refusée : aucun paiement créé.' },
        { value: 'CANCELED', label: 'Annulée', description: 'Annulée avant traitement.' }
      ],
      notes: [
        '« Doublon probable » : une autre déclaration a le même montant, le même jour et la même échéance.',
        '« Modifié après lecture IA » : le déclarant a changé des valeurs proposées par la lecture automatique de la capture.'
      ]
    },
    steps: [
      { title: 'Rechercher', detail: 'Référence, numéro de bail, bien ou déclarant.' },
      {
        title: 'Filtrer',
        detail: 'Statut, Période et Méthode. « Tous les statuts » affiche aussi les déclarations déjà traitées.'
      },
      { title: 'Examiner', detail: "Cliquez sur « Détail », ou sur l'icône de preuve pour voir la capture." },
      { title: 'Exporter', detail: 'Toutes les déclarations correspondant à vos filtres sont exportées.' }
    ],
    faq: [
      {
        q: 'Où est la capture du paiement ?',
        a: "Cliquez sur l'icône « Voir la preuve de paiement » de la ligne : une image s'ouvre, un PDF se télécharge."
      },
      {
        q: "Pourquoi n'ai-je pas les boutons « Approuver » et « Rejeter » ?",
        a: "Ils demandent le droit « Allouer les paiements » et ne s'affichent que pour une déclaration « En attente »."
      },
      {
        q: "Que faire d'un « Doublon probable » ?",
        a: "Comparez avec l'autre déclaration et la référence de transaction : rejetez avec le motif « Référence déjà utilisée » si c'est un doublon."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les paiements ».' },
    related: [
      { label: 'Approuver une déclaration', helpId: 'locatif.paiements.declarations.approuver' },
      { label: 'Rejeter une déclaration', helpId: 'locatif.paiements.declarations.rejeter' }
    ],
    keywords: ['doublon', 'preuve de paiement', 'capture', 'déclarations']
  },
  {
    id: 'locatif.paiements.declarations.approuver',
    kind: 'section',
    title: 'Valider une déclaration de paiement',
    summary:
      'Valider transforme la déclaration en un vrai paiement « Réussi ». Vous pouvez retenir un montant différent de celui déclaré.',
    purpose: 'Vérifiez le transfert sur votre compte Mobile Money avant de valider.',
    steps: [
      {
        title: 'Relire la déclaration',
        detail: 'Locataire, bail, échéance, référence, montant et date déclarés. Les alertes éventuelles sont en haut.'
      },
      {
        title: 'Contrôler le « Montant retenu »',
        detail: 'Il vaut par défaut le montant déclaré. Pour le corriger, saisissez un entier de 1 au maximum autorisé.'
      },
      {
        title: 'Ajouter une note',
        detail: '« Note (facultative) » ; elle devient obligatoire (10 à 500 caractères) si le montant retenu diffère.'
      },
      {
        title: 'Vérifier le compte de trésorerie',
        detail: 'Par défaut, celui du numéro de réception (Mobile Money) ou celui du mode de paiement.'
      },
      { title: 'Valider', detail: '« Valider telle que déclarée » ou « Valider avec correction ».' }
    ],
    consequences: [
      'Un paiement « Réussi » est créé, daté du jour du paiement déclaré, au nom du locataire.',
      "Si la déclaration vise une échéance, le paiement y est affecté jusqu'à son reste dû : l'échéance passe à « Partiel » ou « Payé ». Ce qui dépasse est compté comme reçu en avance sur le compte du locataire.",
      "Le locataire et le propriétaire sont prévenus par e-mail si ces notifications sont activées pour votre agence ; le locataire reçoit aussi un message WhatsApp si votre agence l'a configuré.",
      'La décision est définitive : une déclaration validée ne se rouvre pas. Pour défaire le paiement créé, annulez-le depuis sa fiche.',
      "Si la déclaration vient d'être traitée par quelqu'un d'autre, l'écran vous le dit et se recharge."
    ],
    faq: [
      {
        q: 'Puis-je valider un montant plus petit que celui déclaré ?',
        a: 'Oui, saisissez le « Montant retenu » et expliquez la correction dans la note obligatoire.'
      },
      {
        q: "Que se passe-t-il si aucune échéance n'est indiquée ?",
        a: "Le paiement est créé mais n'est affecté à aucune échéance : affectez-le ensuite depuis la liste des paiements."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Allouer les paiements ».' },
    related: [
      { label: 'Rejeter une déclaration', helpId: 'locatif.paiements.declarations.rejeter' },
      { label: 'Affecter un paiement aux échéances', helpId: 'locatif.paiements.affectation' }
    ],
    keywords: ['approuver', 'valider', 'montant retenu', 'correction']
  },
  {
    id: 'locatif.paiements.declarations.rejeter',
    kind: 'section',
    title: 'Rejeter une déclaration de paiement',
    summary:
      "Rejeter refuse la déclaration : aucun paiement n'est créé et aucune échéance ne bouge. Un motif est obligatoire.",
    purpose:
      'Utilisez-le quand vous ne retrouvez pas le transfert, que le montant ne correspond pas ou que la référence est déjà utilisée.',
    steps: [
      {
        title: 'Choisir le motif',
        detail:
          '« Paiement introuvable », « Montant ne correspondant pas », « Référence déjà utilisée », « Numéro de réception erroné » ou « Autre ».'
      },
      {
        title: 'Écrire un texte',
        detail: 'Facultatif, sauf pour « Autre » où il est obligatoire. Entre 10 et 500 caractères.'
      },
      { title: 'Confirmer', detail: 'Cliquez sur « Rejeter la déclaration ».' }
    ],
    consequences: [
      "Aucun paiement n'est créé et aucune échéance n'est modifiée.",
      "Le locataire et le propriétaire sont prévenus par e-mail si ces notifications sont activées pour votre agence ; le locataire reçoit aussi un message WhatsApp si votre agence l'a configuré. Le texte saisi (ou, à défaut, le libellé du motif) leur est communiqué.",
      'La décision est définitive : une déclaration rejetée ne se rouvre pas.'
    ],
    faq: [
      {
        q: 'Le locataire peut-il redéclarer ?',
        a: 'Oui, depuis son portail. Une déclaration rejetée ne bloque pas une nouvelle déclaration, même avec la même référence de transaction : seules les déclarations « En attente » ou « Approuvée » la bloquent. Vous pouvez aussi saisir le paiement vous-même avec « Nouveau paiement » ou « Déclarer pour un tiers ».'
      },
      {
        q: 'Le texte est-il obligatoire ?',
        a: "Seulement avec le motif « Autre ». Sans texte, c'est le libellé du motif qui est transmis."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Allouer les paiements ».' },
    related: [{ label: 'Valider une déclaration', helpId: 'locatif.paiements.declarations.approuver' }],
    keywords: ['rejeter', 'refuser', 'motif de rejet']
  },
  {
    id: 'locatif.paiements.declarations.tiers',
    kind: 'section',
    title: 'Déclarer un paiement pour un locataire',
    summary:
      "Vous saisissez vous-même la déclaration d'un locataire qui a payé par transfert mobile money. Elle reste à valider.",
    purpose: 'Utile quand le locataire vous envoie sa preuve de paiement par un autre canal que le portail.',
    steps: [
      { title: 'Choisir le bail', detail: 'Le locataire est celui du bail.' },
      {
        title: "Choisir l'échéance",
        detail: '« Échéance (facultative) » : seules les échéances impayées sont proposées.'
      },
      {
        title: 'Numéro de réception et opérateur',
        detail: "Le numéro de votre agence qui a reçu le transfert, et l'opérateur."
      },
      { title: 'Référence de transaction', detail: '4 à 40 caractères : lettres, chiffres, point ou tiret.' },
      {
        title: 'Montant et date',
        detail: 'Montant entier en FCFA ; date et heure du transfert, pas dans le futur ni de plus de 90 jours.'
      },
      { title: 'Joindre la capture', detail: 'Facultatif : JPEG, PNG, WebP ou PDF, 5 Mo au plus.' },
      { title: 'Valider', detail: 'Cliquez sur « Créer la déclaration ».' }
    ],
    consequences: [
      "La déclaration est créée « En attente » : elle ne crédite rien tant que vous ne l'avez pas validée.",
      "Un e-mail est envoyé à l'agence (administrateurs et propriétaire du bail) pour signaler la déclaration."
    ],
    faq: [
      {
        q: 'Pourquoi la référence est-elle refusée ?',
        a: 'Elle doit compter 4 à 40 caractères (lettres, chiffres, point ou tiret) et ne pas être déjà utilisée par une autre déclaration en attente ou validée.'
      },
      {
        q: 'Dois-je encore la valider ?',
        a: 'Oui. Comme toute déclaration, elle apparaît « En attente » dans le tableau.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Créer des paiements ».' },
    related: [{ label: 'Valider une déclaration', helpId: 'locatif.paiements.declarations.approuver' }],
    keywords: ['déclarer pour un tiers', 'saisir une déclaration', 'preuve de paiement']
  },
  {
    id: 'locatif.paiements.declarations.reglages',
    kind: 'section',
    title: 'Réglages des paiements déclarés',
    summary:
      "Cette carte active les déclarations de paiement dans le portail des locataires et règle leurs options. Elle se trouve dans les paramètres financiers de l'agence.",
    purpose: "Elle s'affiche dans les paramètres financiers de l'agence quand la gestion locative est active.",
    howToRead: {
      notes: [
        '« Déclaration de paiement activée » : sans elle, les locataires ne peuvent rien déclarer.',
        '« Capture obligatoire » : le locataire doit joindre une capture de son paiement.',
        "« Lecture IA de la capture » : l'IA propose des valeurs que le locataire relit ; elle ne valide ni ne crédite jamais rien. Elle n'est disponible que si le serveur la propose, dans la limite d'un quota mensuel affiché.",
        "« Délai d'alerte (jours ouvrés) » : au-delà, une déclaration en attente est signalée « En retard »."
      ]
    },
    steps: [
      { title: 'Activer', detail: 'Mettez « Déclaration de paiement activée » sur oui.' },
      { title: 'Ajouter un numéro de réception', detail: "Sans numéro actif, le portail n'affiche rien." },
      { title: 'Régler les options', detail: "Capture obligatoire, lecture IA, délai d'alerte." },
      { title: 'Enregistrer', detail: "Le bouton « Enregistrer » est actif dès qu'un réglage change." }
    ],
    consequences: [
      "Les réglages s'appliquent tout de suite aux nouvelles déclarations.",
      'Sans droit « Allouer les paiements », la carte est en lecture seule.'
    ],
    faq: [
      {
        q: 'Pourquoi le portail ne montre-t-il pas la déclaration de paiement ?',
        a: "Vérifiez que l'option est activée et qu'au moins un numéro de réception est actif."
      },
      {
        q: 'Que se passe-t-il quand le quota de lectures IA est atteint ?',
        a: "La lecture automatique est suspendue jusqu'au mois suivant ; les locataires saisissent alors les valeurs eux-mêmes."
      },
      {
        q: 'Pourquoi ne puis-je pas modifier ces réglages ?',
        a: 'Il faut le droit « Allouer les paiements ».'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Lecture avec « Voir les paiements », modification avec « Allouer les paiements ».'
    },
    related: [{ label: 'Numéros de réception', helpId: 'locatif.paiements.declarations.numeros' }],
    keywords: ['réglages', 'activer les déclarations', 'lecture IA', 'capture obligatoire', "délai d'alerte"]
  },
  {
    id: 'locatif.paiements.declarations.numeros',
    kind: 'section',
    title: 'Numéros de réception',
    summary:
      'Ces numéros sont ceux de votre agence où les locataires envoient leur paiement mobile money avant de le déclarer. Chaque numéro est suivi sur son propre compte de trésorerie.',
    purpose: "La carte « Paiement par transfert mobile money » se trouve dans les paramètres financiers de l'agence.",
    howToRead: {
      columns: [
        { key: 'operator', label: 'Opérateur', description: 'Orange Money, MTN MoMo, Moov Money, Wave ou Autre.' },
        { key: 'phone', label: 'Numéro', description: 'Numéro de téléphone qui reçoit le transfert.' },
        { key: 'label', label: 'Libellé', description: 'Nom facultatif pour reconnaître le numéro.' },
        {
          key: 'treasury',
          label: 'Compte de trésorerie',
          description: 'Compte qui suit les encaissements de ce numéro.'
        },
        {
          key: 'pendingDeclarations',
          label: 'En attente',
          description: 'Nombre de déclarations en attente liées à ce numéro.'
        },
        { key: 'active', label: 'État', description: 'Interrupteur actif ou inactif.' },
        { key: 'actions', label: 'Actions', description: '« Modifier » et « Supprimer ».' }
      ]
    },
    steps: [
      {
        title: 'Ajouter un numéro',
        detail: "Cliquez sur « Ajouter un numéro », choisissez l'opérateur et saisissez le numéro."
      },
      { title: 'Donner un libellé', detail: 'Facultatif, 60 caractères au plus.' },
      { title: 'Activer ou désactiver', detail: "Utilisez l'interrupteur de la colonne « État »." },
      { title: 'Modifier ou supprimer', detail: 'Boutons « Modifier » et « Supprimer » de la ligne.' }
    ],
    consequences: [
      "Supprimer un numéro auquel des déclarations sont liées le désactive seulement : il n'est pas effacé.",
      'Sans numéro actif, le portail des locataires ne propose pas la déclaration de paiement.'
    ],
    faq: [
      {
        q: 'Pourquoi mon numéro est-il seulement désactivé après suppression ?',
        a: 'Des déclarations y sont liées : on le garde pour conserver leur historique.'
      },
      {
        q: 'Pourquoi le numéro est-il refusé ?',
        a: 'Le numéro doit être valide et ne pas déjà exister parmi vos numéros de réception.'
      },
      {
        q: 'Qui peut ajouter ou modifier un numéro ?',
        a: 'Les personnes qui ont le droit « Allouer les paiements ». Les autres consultent seulement.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Lecture avec « Voir les paiements », écriture avec « Allouer les paiements ».'
    },
    related: [{ label: 'Réglages des paiements déclarés', helpId: 'locatif.paiements.declarations.reglages' }],
    keywords: ['numéro de réception', 'orange money', 'mtn', 'moov', 'wave', 'mobile money']
  },
  {
    id: 'locatif.paiements.fiche',
    kind: 'page',
    title: "Fiche d'un paiement",
    summary:
      "Cette page détaille un paiement : montant, méthode, dates, et comment il a été utilisé. Vous pouvez l'affecter aux échéances ou changer son statut.",
    purpose:
      "Elle sert à contrôler un encaissement, à finir de l'affecter, ou à l'annuler s'il a été saisi par erreur. Le bouton « Retour » ramène au bail s'il est lié à un bail, sinon à la liste des paiements.",
    steps: [
      {
        title: 'Lire les informations',
        detail:
          'Carte « Informations financières » : locataire, montant, montant alloué, montant disponible, méthode et statut.'
      },
      {
        title: 'Contrôler les dates',
        detail: "Carte « Dates » : date du règlement, date d'initiation, et date d'annulation ou d'échec selon le cas."
      },
      {
        title: "Voir l'utilisation",
        detail: "Carte « Utilisation du paiement » : échéances et dépôt de garantie qui ont reçu de l'argent."
      },
      { title: 'Affecter le reste', detail: "Cliquez sur « Allouer aux échéances » s'il reste un montant disponible." },
      { title: 'Changer le statut', detail: 'Utilisez la liste « Statut » en haut de la page.' }
    ],
    consequences: [
      "« Annulé » ou « Échoué » défait toutes les affectations du paiement, annule la collecte du dépôt de garantie qui s'y rattache et recalcule les échéances. Une confirmation est demandée.",
      "Réactiver un paiement annulé ou échoué (« Réussi ») ne rétablit pas ses anciennes affectations : il faut l'affecter de nouveau.",
      "Chaque changement de statut est enregistré dans l'historique d'audit.",
      "Aucun e-mail n'est envoyé lors d'un changement de statut. Aucune quittance n'est générée depuis cette page."
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Allouer aux échéances » est-il absent ?',
        a: 'Il faut le droit « Allouer les paiements », un paiement « Réussi » lié à un bail et un montant encore disponible.'
      },
      {
        q: 'Pourquoi la liste « Statut » est-elle grisée ?',
        a: "Vous n'avez pas le droit « Allouer les paiements », ou le paiement est « Remboursé », un statut définitif."
      },
      {
        q: 'Quels changements de statut sont possibles ?',
        a: '« En attente » devient « Réussi », « Échoué » ou « Annulé » ; « Réussi » devient « Annulé » ou « Échoué » ; « Annulé » et « Échoué » redeviennent « Réussi ».'
      },
      {
        q: 'Où est la quittance ?',
        a: "Elle n'est pas créée automatiquement par un paiement : générez-la depuis les documents du bail."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Voir demande « Voir les paiements » ; affecter et changer le statut demandent « Allouer les paiements ».'
    },
    related: [
      { label: 'Informations financières', helpId: 'locatif.paiements.fiche.informations' },
      { label: 'Utilisation du paiement', helpId: 'locatif.paiements.fiche.utilisation' },
      { label: "Changer le statut d'un paiement", helpId: 'locatif.paiements.fiche.statut' },
      { label: 'Liste des paiements', helpId: 'locatif.paiements.liste' }
    ],
    keywords: ['détail du paiement', 'annuler un paiement', 'statut du paiement', 'montant disponible']
  },
  {
    id: 'locatif.paiements.fiche.informations',
    kind: 'section',
    title: 'Informations financières',
    summary: "Cette carte résume le paiement : qui a payé, combien, comment, et ce qu'il reste à utiliser.",
    howToRead: {
      notes: [
        '« Montant alloué » : somme déjà répartie entre des échéances et le dépôt de garantie.',
        '« Montant disponible » : montant moins montant alloué. Il vaut 0 pour un paiement échoué ou annulé.',
        '« Méthode de paiement » : espèces, virement, chèque, Mobile Money, prélèvement bancaire, carte ou autre.',
        "« Opérateur Mobile Money » et « Numéro de téléphone » n'apparaissent que pour un paiement Mobile Money.",
        'Les dates sont dans la carte voisine « Dates » : « Date du règlement » est le jour où le locataire a payé.'
      ],
      statuses: [
        { value: 'PENDING', label: 'En attente', description: 'Pas encore encaissé.' },
        { value: 'SUCCESS', label: 'Réussi', description: 'Encaissé.' },
        { value: 'FAILED', label: 'Échoué', description: "N'a pas abouti." },
        { value: 'CANCELED', label: 'Annulé', description: 'Annulé, affectations défaites.' },
        { value: 'REFUNDED', label: 'Remboursé', description: 'Remboursé, définitif.' },
        { value: 'PARTIALLY_REFUNDED', label: 'Partiellement remboursé', description: 'Remboursé en partie.' }
      ]
    },
    faq: [
      {
        q: 'Pourquoi « Montant disponible » est-il à 0 ?',
        a: "Le paiement est entièrement affecté, ou il est « Échoué » ou « Annulé » et n'a donc rien encaissé."
      },
      {
        q: "Quelle différence entre « Date du règlement » et « Date d'initiation » ?",
        a: "La première est le jour où le locataire a payé, la seconde le jour où le paiement a été créé dans l'application."
      },
      {
        q: 'Le montant est-il modifiable ?',
        a: 'Non, depuis cette page. Annulez le paiement et saisissez-en un nouveau si le montant est faux.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Voir les paiements ».' },
    related: [{ label: 'Utilisation du paiement', helpId: 'locatif.paiements.fiche.utilisation' }],
    keywords: ['montant alloué', 'montant disponible', 'date du règlement']
  },
  {
    id: 'locatif.paiements.fiche.utilisation',
    kind: 'section',
    title: 'Utilisation du paiement',
    summary:
      "Cette carte montre où est passé l'argent du paiement : quelles échéances il a soldées et quels mouvements du dépôt de garantie il a alimentés.",
    steps: [
      {
        title: 'Lire « Allocations aux échéances »',
        detail: "Chaque ligne donne la période de l'échéance, sa date d'échéance, le montant alloué et la date."
      },
      {
        title: 'Lire « Allocation au dépôt de garantie »',
        detail: 'Chaque ligne donne le type de mouvement (par exemple « Collecte (dépôt de garantie) ») et le montant.'
      },
      { title: 'Affecter le reste', detail: '« Allouer aux échéances » apparaît si un montant reste disponible.' }
    ],
    consequences: [
      'Annuler ou déclarer échoué le paiement efface ces lignes : les échéances sont recalculées et la collecte du dépôt de garantie défaite.',
      'Quand « Allouer aux échéances » est utilisé, le locataire et le propriétaire sont prévenus par e-mail si ces notifications sont activées pour votre agence.'
    ],
    faq: [
      {
        q: 'Pourquoi la carte dit-elle « Aucune utilisation enregistrée » ?',
        a: "Le paiement n'a encore été affecté à aucune échéance. Utilisez « Allouer aux échéances »."
      },
      {
        q: 'Un paiement peut-il servir au dépôt de garantie ?',
        a: 'Oui : les mouvements de dépôt de garantie rattachés au paiement sont listés ici, avec leur montant.'
      }
    ],
    permissions: { feature: 'RENTAL', note: '« Allouer aux échéances » demande « Allouer les paiements ».' },
    related: [{ label: 'Affecter un paiement aux échéances', helpId: 'locatif.paiements.affectation' }],
    keywords: ['utilisation du paiement', 'allocations', 'dépôt de garantie', 'échéances soldées']
  },
  {
    id: 'locatif.paiements.fiche.statut',
    kind: 'section',
    title: "Changer le statut d'un paiement",
    summary:
      "La liste « Statut » permet de corriger un paiement : l'annuler, le déclarer échoué ou le réactiver. Seuls les changements autorisés sont proposés.",
    purpose: "C'est la façon de défaire un paiement saisi par erreur.",
    steps: [
      { title: 'Ouvrir la liste « Statut »', detail: 'Elle est en haut de la page.' },
      {
        title: 'Choisir le nouveau statut',
        detail: "Pour « Annulé » ou « Échoué », une confirmation « Annuler ce paiement ? » s'affiche."
      },
      { title: 'Confirmer', detail: 'Cliquez sur « Confirmer ».' }
    ],
    consequences: [
      'Annuler ou déclarer échoué défait les affectations aux échéances et la collecte du dépôt de garantie rattachée ; les échéances sont recalculées.',
      "Le changement est tracé dans l'historique d'audit.",
      'Un paiement « Remboursé » ne peut plus changer de statut.'
    ],
    faq: [
      {
        q: 'Puis-je passer un paiement « Réussi » à « En attente » ?',
        a: "Non : un paiement encaissé ne revient jamais « En attente ». Vous pouvez l'annuler ou le déclarer échoué."
      },
      {
        q: 'Comment réactiver un paiement annulé par erreur ?',
        a: "Choisissez « Réussi » : le paiement redevient disponible, mais il faut l'affecter de nouveau aux échéances."
      },
      {
        q: "Pourquoi aucun message n'apparaît-il pour le locataire ?",
        a: "Un changement de statut n'envoie ni e-mail ni message."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Allouer les paiements ».' },
    related: [{ label: "Fiche d'un paiement", helpId: 'locatif.paiements.fiche' }],
    keywords: ['annuler un paiement', 'réactiver', 'échoué', 'corriger un paiement']
  }
];

export default entries;
