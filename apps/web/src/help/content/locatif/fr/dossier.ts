import type { HelpEntry } from '../../../types';

/** Zone « dossier » du module « locatif » (fr) : dépôt de garantie, documents et états des lieux d'un bail. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------------------
  // Dépôt de garantie (onglet de la fiche d'un bail)
  // ---------------------------------------------------------------------------
  {
    id: 'locatif.depots.onglet',
    kind: 'section',
    title: 'Dépôt de garantie du bail',
    summary:
      "Cet onglet suit l'argent versé en garantie par le locataire : combien est attendu, combien est détenu et tout ce qui s'est passé depuis. Chaque encaissement, retenue ou restitution y est enregistré comme un « mouvement ».",
    purpose:
      "Le dépôt de garantie couvre les loyers impayés et les dégâts éventuels. L'agence l'encaisse au début du bail, puis le restitue (en tout ou en partie) à la fin. Cet onglet garde la trace de chaque étape.",
    steps: [
      {
        title: 'Vérifier le dépôt',
        detail: 'Lisez « Montant cible », « Solde actuel » et « Statut » en haut de l’onglet.'
      },
      {
        title: 'Encaisser le dépôt',
        detail:
          'Cliquez sur « Nouveau mouvement », choisissez « Collecte » et sélectionnez le paiement du locataire qui correspond au dépôt.'
      },
      {
        title: 'Enregistrer une autre opération',
        detail: 'Blocage, libération, remboursement, confiscation ou ajustement : voir la fiche « Nouveau mouvement ».'
      },
      {
        title: 'Relire l’historique',
        detail:
          'Le tableau « Historique des mouvements » liste toutes les opérations, de la plus récente à la plus ancienne.'
      }
    ],
    consequences: [
      'Un mouvement enregistré ne peut ni être modifié ni être supprimé depuis cet écran. Vérifiez le type et le montant avant d’enregistrer.',
      'Le dépôt apparaît tout seul à la première ouverture de l’onglet, à condition que le bail ait un montant de dépôt de garantie. Sinon l’écran affiche « Aucun dépôt de garantie configuré pour ce bail ».'
    ],
    faq: [
      {
        q: 'Je ne vois pas le bouton « Nouveau mouvement ». Pourquoi ?',
        a: 'Il n’apparaît que si le dépôt existe et si vous avez le droit « Modifier les dépôts de garantie ». Demandez ce droit à l’administrateur de votre agence.'
      },
      {
        q: 'Pourquoi l’onglet dit-il qu’aucun dépôt n’est configuré ?',
        a: 'Le bail ne comporte pas de montant de dépôt de garantie. Modifiez le bail pour en indiquer un, puis rouvrez l’onglet.'
      },
      {
        q: 'Où voir les retenues proposées après la visite de sortie ?',
        a: 'Dans l’onglet « États des lieux », au bloc « Retenues sur le dépôt de garantie » de l’état des lieux de sortie. Elles ne créent aucun mouvement ici : c’est à vous de les enregistrer.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Voir l’onglet demande « Voir les dépôts de garantie ». Le bouton « Nouveau mouvement » demande « Modifier les dépôts de garantie ».'
    },
    related: [
      { label: 'Solde et statut du dépôt', helpId: 'locatif.depots.solde' },
      { label: 'Enregistrer un mouvement', helpId: 'locatif.depots.mouvement' },
      { label: 'Historique des mouvements', helpId: 'locatif.depots.historique' },
      { label: 'Retenues proposées à la sortie', helpId: 'locatif.edl.retenues' },
      { label: 'Fiche d’un bail', helpId: 'locatif.baux.fiche' }
    ],
    keywords: [
      'dépôt de garantie',
      'caution',
      'garantie',
      'dépôt',
      'restitution',
      'remboursement',
      'mouvement',
      'locataire'
    ]
  },
  {
    id: 'locatif.depots.solde',
    kind: 'section',
    title: 'Montant cible, solde et statut du dépôt',
    summary:
      'Ces trois chiffres résument le dépôt : ce qui est attendu, ce que l’agence détient aujourd’hui et si le dépôt est complet.',
    howToRead: {
      statuses: [
        {
          value: 'COMPLETE',
          label: 'Complet',
          description: 'Le solde actuel est au moins égal au montant cible.'
        },
        {
          value: 'PENDING',
          label: 'En attente',
          description:
            'Le solde actuel est inférieur au montant cible, par exemple avant l’encaissement ou après un remboursement.'
        }
      ],
      notes: [
        'Montant cible : Le montant du dépôt de garantie prévu au bail, en FCFA.',
        'Solde actuel : Ce que l’agence détient : tout ce qui a été encaissé (et ajusté), moins les remboursements et les confiscations. Un blocage ne change pas ce solde.',
        'Après un remboursement complet, le statut repasse à « En attente » : il compare seulement le solde au montant cible.',
        'Le « Blocage » met une partie du dépôt de côté (par exemple pour des réparations) sans la sortir du solde.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi le solde est-il à 0 FCFA ?',
        a: 'Le dépôt n’a pas encore été encaissé. Enregistrez une « Collecte » avec le paiement du locataire.'
      },
      {
        q: 'Le solde baisse-t-il quand je bloque une somme ?',
        a: 'Non. Seuls un remboursement et une confiscation diminuent le solde actuel.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Visible avec « Voir les dépôts de garantie ».' },
    related: [{ label: 'Enregistrer un mouvement', helpId: 'locatif.depots.mouvement' }],
    keywords: ['solde', 'montant cible', 'complet', 'en attente', 'dépôt']
  },
  {
    id: 'locatif.depots.mouvement',
    kind: 'section',
    title: 'Enregistrer un mouvement du dépôt',
    summary:
      'Le formulaire « Nouveau mouvement » enregistre une opération sur le dépôt : encaissement, blocage, libération, remboursement, confiscation ou ajustement.',
    purpose:
      'À chaque opération, l’agence choisit un type et un montant. Le solde est mis à jour tout de suite et l’opération reste visible dans l’historique.',
    howToRead: {
      statuses: [
        {
          value: 'COLLECT',
          label: 'Collecte',
          description:
            'Encaissement du dépôt. Une seule fois par dépôt, pour exactement le montant cible, avec un paiement du locataire déjà encaissé et pas encore utilisé ailleurs.'
        },
        {
          value: 'HOLD',
          label: 'Blocage',
          description:
            'Met une partie du dépôt de côté, par exemple avant des réparations. Le montant ne peut pas dépasser ce qui reste disponible, blocages déjà posés compris.'
        },
        {
          value: 'RELEASE',
          label: 'Libération',
          description:
            'Annule tout ou partie d’un blocage. Le montant ne peut pas dépasser la somme actuellement bloquée.'
        },
        {
          value: 'REFUND',
          label: 'Remboursement',
          description:
            'Rend de l’argent au locataire. Diminue le solde. Vous pouvez choisir le « Compte de trésorerie » débité.'
        },
        {
          value: 'FORFEIT',
          label: 'Confiscation',
          description: 'L’agence conserve une somme du dépôt, par exemple pour des dégâts. Diminue le solde.'
        },
        {
          value: 'ADJUSTMENT',
          label: 'Ajustement',
          description:
            'Ajoute le montant saisi au solde pour une correction. Le formulaire n’accepte pas de montant négatif.'
        }
      ],
      notes: [
        'Un remboursement ou une confiscation ne peut pas dépasser le solde actuel : l’écran affiche alors le solde disponible.',
        'Le champ « Paiement associé » n’apparaît que pour une collecte. Il ne propose que des paiements encaissés dont le montant libre couvre le dépôt.'
      ]
    },
    steps: [
      { title: 'Ouvrir le formulaire', detail: 'Cliquez sur « Nouveau mouvement ».' },
      { title: 'Choisir le type', detail: 'Dans « Type de mouvement », sélectionnez l’opération à enregistrer.' },
      {
        title: 'Collecte : choisir le paiement',
        detail: 'Sélectionnez le « Paiement associé ». Le montant se remplit tout seul avec le montant cible.'
      },
      {
        title: 'Indiquer le montant',
        detail: 'Saisissez un montant supérieur à 0 FCFA, sauf pour une collecte où il est imposé.'
      },
      {
        title: 'Remboursement : choisir le compte',
        detail: 'Si besoin, précisez le « Compte de trésorerie » débité. Sinon la caisse par défaut est utilisée.'
      },
      {
        title: 'Ajouter une note',
        detail: 'Facultatif : expliquez par exemple la raison d’un blocage ou d’une confiscation.'
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer ». Le formulaire se ferme et l’historique se met à jour.'
      }
    ],
    consequences: [
      'Irréversible depuis cet écran : un mouvement enregistré ne se modifie ni ne se supprime.',
      'Le solde, le montant bloqué et le statut du dépôt sont recalculés aussitôt.',
      'Le locataire et le propriétaire sont prévenus par e-mail si cette notification est activée pour votre agence et si leur adresse est connue. Le locataire reçoit aussi un message WhatsApp si votre agence l’a configuré. Un échec d’envoi n’annule pas le mouvement.',
      'Collecte : le paiement utilisé est reconnu comme dépôt de garantie. S’il avait créé une avance sur le compte du locataire, cette avance est retirée : un dépôt ne sert jamais à payer un loyer.',
      'Pour un bail en gestion directe, la collecte, le remboursement et la confiscation sont aussi inscrits en comptabilité automatiquement.',
      'Aucun document n’est généré par cette action.'
    ],
    faq: [
      {
        q: 'Pourquoi le champ « Paiement associé » est-il vide ?',
        a: 'Aucun paiement encaissé de ce bail n’a un montant libre au moins égal au dépôt attendu. Enregistrez d’abord le paiement, ou vérifiez qu’il n’est pas déjà affecté à un loyer.'
      },
      {
        q: 'Pourquoi puis-je encaisser le dépôt une seule fois ?',
        a: 'Un dépôt n’accepte qu’une collecte, pour le montant cible exact. Pour corriger un écart, utilisez un « Ajustement ».'
      },
      {
        q: 'Que se passe-t-il si je rembourse plus que le solde ?',
        a: 'L’enregistrement est refusé avec un message qui indique le solde disponible et le montant demandé.'
      },
      {
        q: 'Les retenues de l’état des lieux de sortie sont-elles enregistrées ici ?',
        a: 'Non. Elles servent de base au calcul du solde de tout compte. Pour les appliquer au dépôt, enregistrez une « Confiscation » ou un « Remboursement » vous-même.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Demande le droit « Modifier les dépôts de garantie » ; sans lui, le bouton « Nouveau mouvement » est masqué.'
    },
    related: [
      { label: 'Historique des mouvements', helpId: 'locatif.depots.historique' },
      { label: 'Retenues de l’état des lieux de sortie', helpId: 'locatif.edl.retenues' }
    ],
    keywords: [
      'collecte',
      'encaisser le dépôt',
      'rembourser',
      'restituer',
      'confisquer',
      'retenue',
      'blocage',
      'ajustement',
      'caution'
    ]
  },
  {
    id: 'locatif.depots.historique',
    kind: 'table',
    title: 'Historique des mouvements du dépôt',
    summary:
      'Chaque ligne est une opération enregistrée sur le dépôt, la plus récente en premier. Le montant est précédé de « + » (en vert) quand il augmente le solde et de « - » (en rouge) quand il le diminue.',
    howToRead: {
      columns: [
        { key: 'created_at', label: 'Date', description: 'Le jour où le mouvement a été enregistré.' },
        {
          key: 'type',
          label: 'Type',
          description: 'La nature de l’opération, avec une flèche verte (entrée d’argent) ou rouge (sortie).'
        },
        {
          key: 'amount',
          label: 'Montant',
          description:
            'Le montant en FCFA. Une collecte et un ajustement comptent « + ». Un blocage, une libération, un remboursement et une confiscation s’affichent avec « - ».'
        },
        {
          key: 'note',
          label: 'Note',
          description: 'Le commentaire saisi à l’enregistrement, ou un tiret s’il n’y en a pas.'
        }
      ],
      statuses: [
        { value: 'COLLECT', label: 'Collecte', description: 'Encaissement du dépôt.' },
        { value: 'HOLD', label: 'Blocage', description: 'Somme mise de côté.' },
        { value: 'RELEASE', label: 'Libération', description: 'Blocage levé.' },
        { value: 'REFUND', label: 'Remboursement', description: 'Argent rendu au locataire.' },
        { value: 'FORFEIT', label: 'Confiscation', description: 'Somme conservée par l’agence.' },
        { value: 'ADJUSTMENT', label: 'Ajustement', description: 'Correction ajoutée au solde.' }
      ],
      notes: [
        'Un blocage et une libération s’affichent avec « - » alors qu’ils ne changent pas le solde actuel : seul le montant bloqué bouge.'
      ]
    },
    faq: [
      {
        q: 'Peut-on exporter l’historique ?',
        a: 'Oui, avec le bouton d’export du tableau. Le montant exporté est un nombre signé, que vous pouvez additionner dans Excel.'
      },
      {
        q: 'Je ne retrouve pas un mouvement.',
        a: 'Le tableau montre tous les mouvements du dépôt de ce bail. Vérifiez que vous êtes bien sur le bon bail.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Visible avec « Voir les dépôts de garantie ».' },
    related: [{ label: 'Enregistrer un mouvement', helpId: 'locatif.depots.mouvement' }],
    keywords: ['mouvements', 'historique', 'dépôt', 'collecte', 'remboursement', 'export']
  },

  // ---------------------------------------------------------------------------
  // Documents du bail (onglet de la fiche d'un bail)
  // ---------------------------------------------------------------------------
  {
    id: 'locatif.documents.liste',
    kind: 'section',
    title: 'Documents du bail',
    summary:
      'Cet onglet réunit les documents produits pour le bail : contrat, reçus de loyer, relevés. Vous pouvez en générer de nouveaux, les télécharger et les régénérer.',
    purpose:
      'Chaque document est préparé à partir des données du bail et d’un modèle de document, puis conservé ici pour être téléchargé au format Word. Le locataire et le propriétaire concernés retrouvent aussi les documents non annulés dans leur espace.',
    steps: [
      { title: 'Chercher un document', detail: 'Tapez un numéro, un titre ou un numéro de bail dans « Rechercher ».' },
      { title: 'Filtrer', detail: 'Réduisez la liste par « Type », « Statut » ou date « Émis le ».' },
      { title: 'Générer', detail: 'Cliquez sur « Générer un document » : voir la fiche du formulaire.' },
      { title: 'Télécharger', detail: 'Cliquez sur « Télécharger » : le fichier s’enregistre au format Word (.docx).' },
      {
        title: 'Mettre à jour',
        detail:
          'Menu « ⋮ » puis « Régénérer à partir des données actuelles » : le document est refait avec les données du bail d’aujourd’hui.'
      }
    ],
    consequences: [
      'Un document généré depuis cet onglet est tout de suite au statut « Final ».',
      'Générer ou régénérer un contrat de bail annule les demandes de signature encore en cours sur ce bail.',
      'Aucun e-mail ni SMS n’est envoyé quand vous générez un document.'
    ],
    faq: [
      {
        q: 'Où trouver une « Quittance de loyer » ?',
        a: 'Ce type existe dans la liste et dans le filtre « Type », mais ce formulaire ne sait pas le générer. Le document que vous pouvez produire ici pour un paiement est le « Reçu de loyer ».'
      },
      {
        q: 'Que fait « Régénérer » ?',
        a: 'Il garde le même numéro de document, remplace le fichier par une nouvelle version et le remet au statut « Final ». L’ancienne version est perdue.'
      },
      {
        q: 'Pourquoi n’ai-je pas de boutons pour supprimer un document ?',
        a: 'Cet écran ne propose pas de suppression ni de changement de statut : seuls « Télécharger » et « Régénérer » existent.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Voir et télécharger demandent « Voir les documents location ». Générer et régénérer demandent « Générer des documents location ».'
    },
    related: [
      { label: 'Tableau des documents', helpId: 'locatif.documents.tableau' },
      { label: 'Générer un document', helpId: 'locatif.documents.generer' },
      { label: 'Fiche d’un bail', helpId: 'locatif.baux.fiche' }
    ],
    keywords: ['documents', 'contrat', 'reçu', 'quittance', 'relevé', 'télécharger', 'word', 'générer', 'régénérer']
  },
  {
    id: 'locatif.documents.tableau',
    kind: 'table',
    title: 'Tableau des documents',
    summary:
      'Chaque ligne est un document du bail, avec son numéro, son type, sa date d’émission et son statut. Sur téléphone, chaque document s’affiche sous forme de carte.',
    howToRead: {
      columns: [
        {
          key: 'document',
          label: 'Document',
          description: 'Le numéro du document, avec en dessous son titre s’il en a un.'
        },
        { key: 'type', label: 'Type', description: 'La nature du document (voir les types ci-dessous).' },
        { key: 'emis', label: 'Émis le', description: 'La date de création du document.' },
        { key: 'statut', label: 'Statut', description: 'L’état du document (voir ci-dessous).' },
        {
          key: 'actions',
          label: 'Actions',
          description:
            '« Télécharger » récupère le fichier. Le menu « ⋮ » propose « Régénérer à partir des données actuelles ».'
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: 'Document non finalisé.' },
        {
          value: 'FINAL',
          label: 'Final',
          description: 'Document généré et valable. C’est le statut de tout document créé depuis cet onglet.'
        },
        {
          value: 'VOID',
          label: 'Annulé',
          description: 'Document annulé : il n’est plus montré au locataire ni au propriétaire.'
        }
      ],
      notes: [
        'Types possibles : « Contrat de bail », « Avenant », « Reçu de loyer », « Quittance de loyer », « Reçu de dépôt », « Relevé » et « Autre ». Seuls « Contrat de bail », « Reçu de loyer » et « Relevé » se génèrent depuis cet onglet.',
        'Le bouton d’export enregistre tous les documents qui correspondent à vos filtres, pas seulement la page affichée.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi le numéro d’un contrat se termine par « -A2 » ?',
        a: 'Le premier contrat porte le numéro du bail. Chaque nouveau contrat généré pour le même bail ajoute « -A2 », « -A3 », etc.'
      },
      {
        q: 'Le téléchargement donne un fichier Word, pas un PDF. Est-ce normal ?',
        a: 'Oui : les documents sont fournis au format Word (.docx), que vous pouvez ensuite imprimer ou convertir.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Visible avec « Voir les documents location ».' },
    related: [{ label: 'Générer un document', helpId: 'locatif.documents.generer' }],
    keywords: ['liste des documents', 'numéro de document', 'statut', 'type', 'export']
  },
  {
    id: 'locatif.documents.generer',
    kind: 'section',
    title: 'Générer un document',
    summary:
      'Le formulaire « Générer un document » prépare un contrat de bail, un reçu de loyer ou un relevé à partir des données du bail et d’un modèle.',
    purpose:
      'Vous choisissez le type, éventuellement un modèle, puis le document est créé tout de suite et ajouté à la liste.',
    howToRead: {
      notes: [
        '« Contrat de bail » : le modèle habitation ou commercial est choisi d’après le type du bien (bureau, boutique et entrepôt donnent un contrat commercial).',
        '« Reçu de loyer » : il porte sur le dernier paiement encaissé du bail. S’il n’y a aucun paiement encaissé, la génération est refusée.',
        '« Relevé » : il faut indiquer « Début de la période » et « Fin de la période » ; la fin ne peut pas précéder le début.',
        '« Template (optionnel) » liste les modèles actifs du type choisi, le modèle par défaut est présélectionné. S’il n’y en a aucun, le modèle par défaut de l’agence est utilisé.'
      ]
    },
    steps: [
      { title: 'Ouvrir le formulaire', detail: 'Cliquez sur « Générer un document ».' },
      {
        title: 'Choisir le type',
        detail: 'Dans « Type de document » : « Contrat de bail », « Reçu de loyer » ou « Relevé ».'
      },
      { title: 'Relevé : donner la période', detail: 'Renseignez « Début de la période » et « Fin de la période ».' },
      {
        title: 'Titre et description',
        detail: 'Facultatifs : ils s’affichent dans la liste et accompagnent le document.'
      },
      {
        title: 'Modèle',
        detail: 'Gardez le modèle présélectionné ou choisissez-en un autre dans « Template (optionnel) ».'
      },
      {
        title: 'Générer',
        detail: 'Cliquez sur « Générer le document ». Un message confirme et la liste se met à jour.'
      }
    ],
    consequences: [
      'Le document est créé aussitôt, au statut « Final », avec un numéro attribué automatiquement.',
      'Un contrat généré rend caduques les demandes de signature en cours sur le bail : il faudra relancer la signature.',
      'Si des informations indispensables manquent (adresse de l’agence, contact du locataire…), la génération s’arrête avec un message qui nomme les champs manquants.',
      'Aucun e-mail ni SMS n’est envoyé : le fichier est seulement disponible dans la liste, au téléchargement.'
    ],
    faq: [
      {
        q: 'Que faire si le message parle de « Champs critiques manquants » ?',
        a: 'Complétez les informations citées (dans le bail, la fiche du locataire ou de l’agence), puis relancez la génération.'
      },
      {
        q: 'Un contrat existe déjà pour ce bail. Que se passe-t-il si j’en génère un autre ?',
        a: 'Un nouveau document est créé avec un numéro suffixé « -A2 », « -A3 »… Pour mettre à jour le contrat existant sans créer de nouveau numéro, utilisez « Régénérer » dans le menu « ⋮ ».'
      },
      {
        q: 'Pourquoi le choix « Quittance de loyer » n’est-il pas proposé ?',
        a: 'Seuls trois types ont un modèle de génération : « Contrat de bail », « Reçu de loyer » et « Relevé ».'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande le droit « Générer des documents location ».' },
    related: [
      { label: 'Documents du bail', helpId: 'locatif.documents.liste' },
      { label: 'Signatures électroniques', helpId: 'locatif.signatures.liste' }
    ],
    keywords: ['générer', 'contrat de bail', 'reçu de loyer', 'relevé', 'modèle', 'template', 'quittance']
  },

  // ---------------------------------------------------------------------------
  // États des lieux (onglet de la fiche d'un bail)
  // ---------------------------------------------------------------------------
  {
    id: 'locatif.edl.panneau',
    kind: 'section',
    title: 'États des lieux du bail',
    summary:
      'Cet onglet gère les deux constats d’un bail : l’état des lieux d’entrée et l’état des lieux de sortie. Chacun commence en brouillon, puis se finalise.',
    purpose:
      'L’état des lieux décrit chaque pièce et chaque élément du logement (état, photos, compteurs, clés). Comparer l’entrée et la sortie aide à justifier d’éventuelles retenues sur le dépôt de garantie.',
    howToRead: {
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: 'Constat en cours de saisie : il peut encore être modifié ou supprimé. Bouton « Continuer ».'
        },
        {
          value: 'FINALIZED',
          label: 'Finalisé',
          description: 'Constat figé, avec sa date de finalisation. Bouton « Consulter ».'
        }
      ],
      notes: [
        '« Non réalisé » signifie qu’aucun état des lieux de ce type n’existe encore ; le bouton « Commencer » le crée.',
        'Un bail ne peut avoir qu’un état des lieux d’entrée et qu’un état des lieux de sortie.',
        'Le bouton « Comparer entrée et sortie » apparaît quand les deux existent.'
      ]
    },
    steps: [
      {
        title: 'Commencer',
        detail: 'Sur la carte voulue, cliquez sur « Commencer », choisissez la date, puis validez.'
      },
      {
        title: 'Saisir',
        detail: 'Remplissez les pièces, éléments, compteurs et clés, puis cliquez sur « Enregistrer ».'
      },
      { title: 'Finaliser', detail: 'Quand tout est évalué, cliquez sur « Finaliser ».' },
      {
        title: 'Consulter et signer',
        detail: 'Sur un état finalisé, « Consulter » permet d’imprimer et de faire signer.'
      },
      {
        title: 'Comparer',
        detail: 'Une fois entrée et sortie créées, « Comparer entrée et sortie » montre les écarts.'
      }
    ],
    consequences: [
      'La finalisation est irréversible : le constat ne peut plus être modifié, supprimé, ni recevoir de photo.',
      'Aucun e-mail ni message n’est envoyé quand un état des lieux est commencé ou finalisé.',
      'Un brouillon peut être supprimé : cette suppression est définitive et efface aussi ses photos.'
    ],
    faq: [
      {
        q: 'Puis-je refaire un état des lieux déjà finalisé ?',
        a: 'Non : il ne peut plus être modifié ni supprimé, et un bail n’admet qu’un état des lieux par type.'
      },
      {
        q: 'Je ne vois pas « Commencer ». Pourquoi ?',
        a: 'Soit l’état des lieux de ce type existe déjà (« Continuer » ou « Consulter » s’affiche), soit l’écran est en lecture pour vous. Créer et modifier demande le droit « Modifier les baux ».'
      },
      {
        q: 'Faut-il faire l’entrée avant la sortie ?',
        a: 'Ce n’est pas obligatoire, mais si l’entrée existe, la sortie reprend ses pièces et permet la comparaison.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Voir les états des lieux demande « Voir les baux ». Créer, modifier, finaliser, supprimer et ajouter des photos demandent « Modifier les baux ».'
    },
    related: [
      { label: 'Commencer un état des lieux', helpId: 'locatif.edl.demarrer' },
      { label: 'Saisir un état des lieux', helpId: 'locatif.edl.saisie' },
      { label: 'Comparer entrée et sortie', helpId: 'locatif.edl.comparaison' },
      { label: 'Fiche d’un bail', helpId: 'locatif.baux.fiche' }
    ],
    keywords: ['état des lieux', 'entrée', 'sortie', 'constat', 'edl', 'brouillon', 'finaliser', 'visite']
  },
  {
    id: 'locatif.edl.demarrer',
    kind: 'section',
    title: 'Commencer un état des lieux',
    summary:
      'Cette fenêtre demande la date du constat et, pour une entrée, le modèle de départ. Le brouillon est créé dès que vous cliquez sur « Commencer ».',
    howToRead: {
      notes: [
        '« Date de l’état des lieux » : par défaut la date du jour.',
        '« Modèle de départ » : « Bâti seulement » propose les pièces et éléments du logement ; « Bâti, mobilier et équipements » y ajoute le mobilier et les équipements, avec quantités. Le second est présélectionné si le bien est meublé ou partiellement meublé.',
        'Pour une sortie dont l’entrée existe, le choix du modèle disparaît : les pièces de l’entrée sont reprises à l’identique pour permettre la comparaison.'
      ]
    },
    steps: [
      {
        title: 'Choisir la date',
        detail: 'Modifiez « Date de l’état des lieux » si le constat n’a pas lieu aujourd’hui.'
      },
      {
        title: 'Choisir le modèle',
        detail: 'Entrée seulement : « Bâti seulement » ou « Bâti, mobilier et équipements ».'
      },
      { title: 'Valider', detail: 'Cliquez sur « Commencer » : le formulaire de saisie s’ouvre.' }
    ],
    consequences: [
      'Le brouillon est enregistré tout de suite. Si vous quittez sans rien saisir, il reste disponible via « Continuer ».',
      'La date peut encore être changée pendant la saisie.'
    ],
    faq: [
      {
        q: 'Puis-je changer de modèle après avoir commencé ?',
        a: 'Pas directement, mais vous pouvez ajouter ou retirer des pièces et des éléments pendant la saisie. Vous pouvez aussi supprimer le brouillon et recommencer.'
      },
      {
        q: 'Pourquoi la sortie ne me propose-t-elle pas de modèle ?',
        a: 'Parce que l’entrée existe : la sortie reprend ses pièces et ses éléments pour que la comparaison soit exacte.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande le droit « Modifier les baux ».' },
    related: [{ label: 'Saisir un état des lieux', helpId: 'locatif.edl.saisie' }],
    keywords: ['commencer', 'nouvel état des lieux', 'modèle', 'meublé', 'date']
  },
  {
    id: 'locatif.edl.saisie',
    kind: 'section',
    title: 'Saisir et finaliser un état des lieux',
    summary:
      'Le formulaire rassemble la date, les pièces, les compteurs et clés, les observations et les noms des signataires. Rien n’est envoyé au serveur avant « Enregistrer ».',
    purpose:
      'C’est le constat lui-même, rempli pendant la visite du logement. Sur une sortie, chaque élément rappelle l’état relevé à l’entrée.',
    steps: [
      { title: 'Remplir les pièces', detail: 'Voir la fiche « Pièces, éléments, états et photos ».' },
      {
        title: 'Relever compteurs et clés',
        detail:
          'Notez « Électricité », « Eau », « Gaz » et « Nombre de clés ». Sur une sortie, la valeur d’entrée est rappelée.'
      },
      { title: 'Observations', detail: 'Ajoutez vos remarques dans « Observations générales ».' },
      {
        title: 'Signatures',
        detail:
          'Indiquez si « Le locataire est présent », son nom (« Nom du locataire signataire ») et « Nom de l’agent ». Ces noms sont obligatoires pour finaliser.'
      },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer » pour sauvegarder le brouillon sur le serveur.' },
      {
        title: 'Finaliser',
        detail:
          'Cliquez sur « Finaliser » puis confirmez. Si des éléments ne sont pas évalués, ils sont listés et leurs pièces s’ouvrent.'
      },
      { title: 'Supprimer le brouillon', detail: 'Bouton « Supprimer le brouillon », avec confirmation.' }
    ],
    consequences: [
      'Brouillon local : à chaque modification, la saisie est aussi gardée dans le navigateur de cet appareil. Si la page est fermée ou la connexion coupée, un message « Une saisie locale non enregistrée a été trouvée » propose « Restaurer » ou « Ignorer ». Cette copie disparaît après « Enregistrer », « Finaliser » ou la suppression.',
      'Les photos font exception : elles sont envoyées dès leur ajout, sans attendre « Enregistrer ».',
      '« Finaliser » enregistre d’abord, puis demande confirmation. Une fois finalisé, le constat ne peut plus être modifié ni supprimé : c’est irréversible.',
      'La finalisation est refusée s’il manque le nom de l’agent, le nom du locataire alors qu’il est présent, ou si un élément n’est pas évalué.',
      'Sur une sortie, le message de confirmation signale les éléments manquants sans retenue, mais ne bloque pas.',
      'Aucun e-mail n’est envoyé à la finalisation. Le document à signer se prépare ensuite depuis « Consulter », bouton « Signatures ».'
    ],
    faq: [
      {
        q: 'J’ai perdu ma connexion pendant la visite. Ai-je tout perdu ?',
        a: 'Non, si vous rouvrez le même état des lieux depuis le même appareil : la saisie non enregistrée est proposée à la restauration. Pensez à cliquer sur « Enregistrer » dès que possible.'
      },
      {
        q: 'Que signifie « {{nombre}} éléments ne sont pas encore évalués » ?',
        a: 'Certains éléments n’ont pas d’état (ou pas de quantité pour un mobilier). Complétez-les : ils sont listés et entourés en orange.'
      },
      {
        q: 'Pourquoi le nom du locataire est-il grisé ?',
        a: 'Il ne se remplit que si l’interrupteur « Le locataire est présent » est activé.'
      },
      {
        q: 'La finalisation prévient-elle le locataire ?',
        a: 'Non. Le locataire n’est contacté que si vous envoyez l’état des lieux en signature.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande le droit « Modifier les baux ».' },
    related: [
      { label: 'Pièces, éléments, états et photos', helpId: 'locatif.edl.pieces' },
      { label: 'Retenues sur le dépôt de garantie', helpId: 'locatif.edl.retenues' },
      { label: 'Signatures de l’état des lieux', helpId: 'locatif.edl.signatures' }
    ],
    keywords: ['saisir', 'finaliser', 'brouillon', 'compteurs', 'clés', 'observations', 'enregistrer', 'restaurer']
  },
  {
    id: 'locatif.edl.pieces',
    kind: 'section',
    title: 'Pièces, éléments, états et photos',
    summary:
      'Les pièces sont rangées en accordéon. Pour chaque élément (sol, murs, fenêtres, mobilier…) vous choisissez un état, un commentaire et des photos.',
    howToRead: {
      statuses: [
        { value: 'NEW', label: 'Neuf', description: 'Élément en parfait état, comme neuf.' },
        { value: 'GOOD', label: 'Bon', description: 'Bon état.' },
        { value: 'FAIR', label: 'Usagé', description: 'Usure normale.' },
        { value: 'POOR', label: 'Mauvais', description: 'Mauvais état.' },
        { value: 'BROKEN', label: 'HS', description: 'Hors service.' },
        {
          value: 'MISSING',
          label: 'Manquant',
          description: 'L’élément n’est pas là. Pour un mobilier, la quantité passe à 0.'
        }
      ],
      notes: [
        'Un élément est « évalué » quand il a un état. Un mobilier a aussi besoin d’une quantité, sauf s’il est « Manquant ».',
        'Mobilier : saisissez la « Quantité » et la « Valeur de remplacement (FCFA, à l’unité) ». Sur une sortie, « Comme à l’entrée » reprend la quantité d’entrée.',
        'Sur une sortie, chaque élément rappelle « Entrée : … » et affiche « Dégradé », « Manquant » ou « Baisse de quantité » quand l’état est moins bon qu’à l’entrée.',
        'Le titre de chaque pièce indique « à évaluer » tant qu’il reste des éléments sans état.'
      ]
    },
    steps: [
      {
        title: 'Ouvrir une pièce',
        detail: 'Cliquez sur son nom pour déplier ses éléments. Cliquez sur le nom pour le renommer.'
      },
      {
        title: 'Choisir l’état',
        detail: 'Appuyez sur le bouton correspondant : Neuf, Bon, Usagé, Mauvais, HS ou Manquant.'
      },
      { title: 'Compléter', detail: 'Ajoutez un commentaire, la quantité et la valeur pour un mobilier.' },
      {
        title: 'Prendre des photos',
        detail: 'Bouton « Photo » : sur téléphone, il ouvre l’appareil photo. Une croix rouge supprime une photo.'
      },
      {
        title: 'Ajouter ou retirer',
        detail:
          '« Nouvel élément » puis « Ajouter » (case « Mobilier (avec quantité) » pour du mobilier) ; « Nouvelle pièce » puis « Ajouter une pièce ».'
      }
    ],
    consequences: [
      'Les photos sont enregistrées immédiatement : JPEG, PNG ou WebP, 10 Mo au maximum chacune. Elles ne s’ajoutent ni ne se retirent plus une fois l’état des lieux finalisé.',
      'Sur une sortie, un élément repris de l’entrée ne peut pas être supprimé, et sa pièce non plus : indiquez « Manquant ».',
      'Dans le PDF à signer, seules les photos JPEG et PNG sont intégrées.'
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas supprimer un élément en sortie ?',
        a: 'Il vient de l’état des lieux d’entrée. Choisissez « Manquant » plutôt que de le retirer : l’écart reste visible à la comparaison.'
      },
      {
        q: 'Quelle différence entre « HS » et « Manquant » ?',
        a: '« HS » veut dire que l’élément est là mais hors service. « Manquant » veut dire qu’il n’est pas là ; il est compté à part.'
      },
      {
        q: 'Ma photo est refusée.',
        a: 'Utilisez une image JPEG, PNG ou WebP de moins de 10 Mo.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande le droit « Modifier les baux ».' },
    related: [
      { label: 'Saisir et finaliser', helpId: 'locatif.edl.saisie' },
      { label: 'Comparer entrée et sortie', helpId: 'locatif.edl.comparaison' }
    ],
    keywords: [
      'pièce',
      'élément',
      'état',
      'neuf',
      'bon',
      'usagé',
      'mauvais',
      'hs',
      'manquant',
      'photo',
      'mobilier',
      'quantité'
    ]
  },
  {
    id: 'locatif.edl.retenues',
    kind: 'section',
    title: 'Retenues sur le dépôt de garantie',
    summary:
      'Ce bloc, propre à l’état des lieux de sortie, liste les sommes que l’agence envisage de retenir sur le dépôt, avec leur total en FCFA.',
    purpose:
      'Chaque ligne a un libellé et un montant. Vous pouvez les saisir à la main ou demander des propositions d’après les écarts constatés entre l’entrée et la sortie.',
    howToRead: {
      notes: [
        '« Proposer depuis les dégradations et manquants » ajoute des lignes : pour un élément manquant ou en quantité réduite, la valeur de remplacement multipliée par la quantité manquante ; pour un élément dégradé, une ligne à 0 FCFA (aucun coût n’est connu) ; pour des clés en moins, une ligne à 0 FCFA.',
        'Une ligne proposée garde le montant proposé : si vous le modifiez, « Proposé : … FCFA » reste affiché en gris. Le total retient toujours le montant saisi.',
        '« Valeur de remplacement non renseignée : montant à saisir » signale un manquant dont la valeur est inconnue.',
        'Les propositions ne s’ajoutent jamais en double pour un même élément, et il n’y a qu’une ligne de clés.'
      ]
    },
    steps: [
      { title: 'Proposer', detail: 'Cliquez sur « Proposer depuis les dégradations et manquants ».' },
      {
        title: 'Ajuster',
        detail: 'Modifiez le « Libellé de la retenue » et le « Montant de la retenue » de chaque ligne.'
      },
      {
        title: 'Ajouter ou retirer',
        detail: '« Ajouter une ligne » crée une retenue libre ; la corbeille supprime une ligne.'
      },
      { title: 'Vérifier le total', detail: 'Le « Total » en bas résume les retenues, en FCFA.' },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer » : les lignes ne sont gardées qu’à ce moment.' }
    ],
    consequences: [
      'Rien n’est ajouté sans votre clic, et chaque ligne reste modifiable jusqu’à la finalisation.',
      'Ces retenues ne créent aucun mouvement dans l’onglet « Dépôt de garantie » : elles alimentent le calcul du solde de tout compte du bail (dépôt détenu, moins les impayés, moins les retenues).',
      'Pour appliquer réellement une retenue au dépôt, enregistrez ensuite une « Confiscation » ou un « Remboursement » dans l’onglet « Dépôt de garantie ».',
      'Une fois l’état des lieux finalisé, les retenues sont en lecture seule.'
    ],
    faq: [
      {
        q: 'Pourquoi une retenue proposée est-elle à 0 FCFA ?',
        a: 'Pour une dégradation ou des clés manquantes, aucune valeur n’est connue : à vous de saisir le montant.'
      },
      {
        q: 'Le bloc n’apparaît pas sur mon état des lieux d’entrée.',
        a: 'C’est normal : les retenues n’existent que pour la sortie.'
      },
      {
        q: 'Les retenues sont-elles prélevées automatiquement sur le dépôt ?',
        a: 'Non. Elles servent de base au solde de tout compte ; le dépôt ne bouge que si vous enregistrez un mouvement.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande le droit « Modifier les baux ».' },
    related: [
      { label: 'Mouvements du dépôt de garantie', helpId: 'locatif.depots.mouvement' },
      { label: 'Comparer entrée et sortie', helpId: 'locatif.edl.comparaison' }
    ],
    keywords: ['retenue', 'retenues', 'dépôt de garantie', 'dégradation', 'manquant', 'solde de tout compte', 'clés']
  },
  {
    id: 'locatif.edl.comparaison',
    kind: 'section',
    title: 'Comparer entrée et sortie',
    summary:
      'Cette fenêtre met côte à côte l’état des lieux d’entrée et celui de sortie : une synthèse chiffrée, puis le détail élément par élément.',
    purpose:
      'Elle montre ce qui a changé pendant le bail. Ce sont des constats : la fenêtre ne dit pas qui est responsable d’un écart.',
    howToRead: {
      notes: [
        '« Manquants » : éléments absents à la sortie alors qu’ils étaient là à l’entrée.',
        '« Baisses de quantité » : mobiliers dont la quantité a diminué.',
        '« Dégradés » : éléments dont l’état est moins bon qu’à l’entrée.',
        '« Valeur de remplacement des manquants » : somme des valeurs de remplacement des éléments manquants, en FCFA.',
        'Le bloc « Clés » donne le nombre à l’entrée et à la sortie, et signale les clés manquantes.',
        'Un tableau des compteurs affiche les relevés d’entrée, de sortie et leur différence.',
        'L’interrupteur « Afficher seulement les écarts » masque les lignes sans changement.'
      ]
    },
    steps: [
      {
        title: 'Ouvrir',
        detail: 'Cliquez sur « Comparer entrée et sortie » (visible quand les deux états des lieux existent).'
      },
      { title: 'Lire la synthèse', detail: 'Les quatre chiffres du haut résument les écarts.' },
      {
        title: 'Filtrer',
        detail: 'Activez « Afficher seulement les écarts » pour ne garder que les lignes à problème.'
      },
      { title: 'Exporter', detail: 'Utilisez le bouton d’export du tableau pour garder la comparaison.' }
    ],
    consequences: [
      'Lecture seule : cette fenêtre ne modifie rien.',
      'La comparaison fonctionne même si un des deux états des lieux est encore en brouillon ; elle reflète alors l’enregistrement le plus récent.'
    ],
    faq: [
      {
        q: 'Pourquoi une ligne est-elle en rouge ou en violet ?',
        a: 'Rouge : l’élément est dégradé. Violet : il est manquant, en baisse de quantité ou absent de la sortie.'
      },
      {
        q: 'Que veut dire « Absent de la sortie » ?',
        a: 'L’élément figurait à l’entrée mais n’existe plus dans l’état des lieux de sortie.'
      },
      {
        q: 'Une valeur de compteur de sortie inférieure à l’entrée, est-ce une erreur ?',
        a: 'La fenêtre l’indique par « Relevé de sortie inférieur à celui d’entrée » : vérifiez les deux relevés.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Visible avec « Voir les baux ».' },
    related: [
      { label: 'Tableau de comparaison', helpId: 'locatif.edl.comparaison.tableau' },
      { label: 'Retenues sur le dépôt de garantie', helpId: 'locatif.edl.retenues' }
    ],
    keywords: ['comparer', 'comparaison', 'entrée', 'sortie', 'écarts', 'dégradé', 'manquant', 'compteurs']
  },
  {
    id: 'locatif.edl.comparaison.tableau',
    kind: 'table',
    title: 'Tableau de comparaison entrée et sortie',
    summary:
      'Chaque ligne est un élément du logement, avec son état à l’entrée et à la sortie et la valeur des manquants.',
    howToRead: {
      columns: [
        { key: 'roomName', label: 'Pièce', description: 'La pièce où se trouve l’élément.' },
        { key: 'label', label: 'Élément', description: 'Le nom de l’élément.' },
        {
          key: 'entryCondition',
          label: 'État d’entrée',
          description: 'L’état relevé à l’entrée (Neuf, Bon, Usagé, Mauvais, HS, Manquant).'
        },
        {
          key: 'exitCondition',
          label: 'État de sortie',
          description:
            'L’état relevé à la sortie, avec des étiquettes « Manquant », « Baisse de quantité », « Dégradé » ou « Absent de la sortie ».'
        },
        {
          key: 'quantity',
          label: 'Quantité (entrée → sortie)',
          description:
            'Pour un mobilier : quantité à l’entrée puis à la sortie. Cette colonne n’apparaît que s’il y a du mobilier.'
        },
        {
          key: 'missingValue',
          label: 'Valeur des manquants',
          description: 'Valeur de remplacement des unités manquantes, en FCFA.'
        }
      ],
      notes: ['Un manquant n’est jamais compté comme dégradé : il est compté à part.']
    },
    faq: [
      {
        q: 'La valeur d’un manquant est vide.',
        a: 'Aucune valeur de remplacement n’a été saisie pour cet élément. Renseignez-la sur l’état des lieux ou à la main dans les retenues.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Visible avec « Voir les baux ».' },
    related: [{ label: 'Comparer entrée et sortie', helpId: 'locatif.edl.comparaison' }],
    keywords: ['tableau', 'comparaison', 'pièce', 'élément', 'état', 'quantité', 'valeur']
  },
  {
    id: 'locatif.edl.consultation',
    kind: 'section',
    title: 'Consulter un état des lieux finalisé',
    summary: 'Un état des lieux finalisé s’ouvre en lecture seule. Vous pouvez l’imprimer ou l’envoyer en signature.',
    steps: [
      { title: 'Imprimer', detail: 'Cliquez sur « Imprimer » : seul le constat sort sur le papier, sans les boutons.' },
      { title: 'Faire signer', detail: 'Cliquez sur « Signatures » : voir la fiche des signatures.' },
      { title: 'Revenir', detail: 'Cliquez sur « Retour » pour retrouver les deux cartes d’entrée et de sortie.' }
    ],
    consequences: [
      'Rien ne peut plus être modifié, ajouté ni supprimé ici.',
      'Sur une entrée meublée, le total des valeurs de remplacement de l’inventaire est affiché sous les pièces. Sur une sortie, les valeurs relevées à l’entrée sont rappelées à côté des compteurs et des clés.'
    ],
    faq: [
      {
        q: 'Comment corriger une erreur sur un état finalisé ?',
        a: 'Ce n’est pas possible depuis l’écran : le constat est figé. Notez les précisions dans un autre document ou contactez votre administrateur.'
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Visible avec « Voir les baux ».' },
    related: [{ label: 'Signatures de l’état des lieux', helpId: 'locatif.edl.signatures' }],
    keywords: ['consulter', 'imprimer', 'lecture seule', 'finalisé']
  },
  {
    id: 'locatif.edl.signatures',
    kind: 'section',
    title: 'Signatures de l’état des lieux',
    summary:
      'Un état des lieux finalisé peut être signé : sur place, à l’écran, ou à distance par un lien envoyé par e-mail. Le bouton « Signatures » se trouve à la consultation.',
    purpose:
      'Dans le formulaire de saisie, le bloc « Signatures » ne garde que la présence du locataire et les noms des signataires. La signature elle-même se fait après la finalisation.',
    howToRead: {
      notes: [
        'Les signataires sont préremplis : l’agent, le locataire, les colocataires et le propriétaire.',
        'L’agent signe toujours sur place. Le locataire aussi s’il est indiqué présent ; les autres reçoivent un lien par e-mail.',
        'Un état des lieux déjà signé ne peut pas être renvoyé en signature, mais ses demandes et leurs PDF restent consultables.'
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: 'Consultez l’état finalisé puis cliquez sur « Signatures ».' },
      { title: 'Vérifier les signataires', detail: 'Corrigez au besoin les noms et les modes de signature.' },
      {
        title: 'Signer',
        detail: 'Les personnes présentes dessinent leur signature à l’écran ; les autres reçoivent leur lien.'
      },
      { title: 'Suivre', detail: 'La fenêtre garde l’historique des demandes et leur PDF.' }
    ],
    consequences: [
      'Le document à signer est un PDF généré à partir de l’état des lieux finalisé, avec ses photos JPEG et PNG.',
      'Les signataires à distance reçoivent un e-mail avec leur lien.',
      'Un brouillon ne peut pas être envoyé en signature : finalisez-le d’abord.'
    ],
    faq: [
      {
        q: 'Pourquoi le message dit « Cet état des lieux est déjà signé » ?',
        a: 'Une demande de signature est déjà terminée : l’envoi est fermé, mais vous pouvez consulter les demandes et leurs PDF.'
      },
      {
        q: 'Le locataire n’est pas là, comment signe-t-il ?',
        a: 'Désactivez « Le locataire est présent » avant de finaliser : il recevra alors un lien par e-mail.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Le détail du circuit de signature est décrit dans l’aide des signatures électroniques.'
    },
    related: [{ label: 'Signatures électroniques', helpId: 'locatif.signatures.liste' }],
    keywords: ['signature', 'signer', 'pdf', 'état des lieux', 'sur place', 'e-mail']
  }
];

export default entries;
