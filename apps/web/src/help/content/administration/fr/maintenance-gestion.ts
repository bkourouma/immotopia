import type { HelpEntry } from '../../../types';

/** Zone « maintenance-gestion » du module « administration » (fr) : tickets d'incident et prestataires, côté agence. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ File des tickets
  {
    id: 'administration.maintenance-gestion.tickets',
    kind: 'page',
    title: 'Gestion des tickets de maintenance',
    summary:
      "Retrouvez ici tous les incidents signalés pour les biens de votre agence (fuite, panne d'électricité, climatisation...). Ouvrez un ticket pour le traiter, l'assigner à un prestataire et le faire avancer jusqu'à sa résolution.",
    purpose:
      "Un ticket est une demande d'intervention déclarée par un locataire, un propriétaire ou un collaborateur de l'agence. Cette liste est la file de travail du gestionnaire : on filtre, on repère les urgences, puis on ouvre le ticket pour décider de la suite.",
    steps: [
      {
        title: 'Repérer les tickets à traiter',
        detail: 'Filtrez par « Statut » (par exemple « Déclaré ») ou par « Priorité » (par exemple « Urgente »).'
      },
      {
        title: 'Affiner la recherche',
        detail:
          'Les autres critères sont « Catégorie », « Bien », « Prestataire » et « Créé du / au ». La zone « Rechercher » cherche dans le titre, la description, le bien et le prestataire.'
      },
      {
        title: 'Ouvrir un ticket',
        detail: "Cliquez sur son titre ou sur l'icône en forme d'œil de la colonne « Action »."
      },
      {
        title: 'Exporter la liste',
        detail: 'Le tableau propose un export : il reprend les tickets correspondant à vos filtres.'
      }
    ],
    consequences: [
      "Cette liste est en lecture : rien n'est modifié tant que vous n'avez pas ouvert un ticket et enregistré vos changements.",
      "À la création d'un ticket, les administrateurs de l'agence reçoivent un e-mail, si cette notification est activée pour votre agence."
    ],
    faq: [
      {
        q: "D'où viennent les tickets ?",
        a: "Ils sont créés par les locataires et les propriétaires depuis leur portail, ou par un collaborateur de l'agence. Cet écran ne permet pas d'en créer."
      },
      {
        q: 'Je ne vois aucun ticket, est-ce normal ?',
        a: "Si aucun filtre n'est actif, c'est qu'aucun ticket n'a encore été déclaré. Sinon, retirez les filtres : le message « Aucun ticket de maintenance » n'apparaît que sans filtre."
      },
      {
        q: "Qu'est-ce qui distingue « Déclaré » de « En cours » ?",
        a: "« Déclaré » est un ticket que personne n'a encore pris en charge. Le gestionnaire le passe « En cours » quand il commence à s'en occuper."
      },
      {
        q: 'Pourquoi ne puis-je pas ouvrir cet écran ?',
        a: "Il demande le droit « Gérer tous les tickets et prestataires ». Demandez-le à l'administrateur de votre agence."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire'],
      note: 'Droit demandé : « Gérer tous les tickets et prestataires ». Les rôles qui le portent dépendent de la configuration de votre agence.'
    },
    related: [
      { label: 'Tableau des tickets', helpId: 'administration.maintenance-gestion.tickets.tableau' },
      { label: "Fiche d'un ticket", helpId: 'administration.maintenance-gestion.ticket-detail' },
      { label: 'Prestataires', helpId: 'administration.maintenance-gestion.prestataires' },
      { label: 'Liste des prestataires (écran)', to: '/tenant/:tenantId/admin/maintenance/vendors' }
    ],
    keywords: ['incident', 'panne', 'réparation', 'dépannage', 'demande', 'intervention', 'maintenance', 'ticket']
  },
  {
    id: 'administration.maintenance-gestion.tickets.tableau',
    kind: 'table',
    title: 'Tableau des tickets',
    summary:
      "Une ligne par ticket de l'agence, du plus récent au plus ancien selon la recherche appliquée. Utilisez les filtres au-dessus du tableau pour réduire la liste.",
    howToRead: {
      columns: [
        { key: 'title', label: 'Titre', description: "Intitulé de l'incident. Cliquez dessus pour ouvrir le ticket." },
        {
          key: 'property',
          label: 'Propriété',
          description: "Adresse du bien concerné. « N/A » si le bien n'a pas d'adresse."
        },
        {
          key: 'category',
          label: 'Catégorie',
          description: 'Type de problème : Plomberie, Électricité, Climatisation ou Autre.'
        },
        {
          key: 'priority',
          label: 'Priorité',
          description: "Urgence de l'intervention : Faible, Moyenne, Élevée ou Urgente."
        },
        { key: 'status', label: 'Statut', description: 'Étape actuelle du ticket (voir ci-dessous).' },
        {
          key: 'assignedVendor',
          label: 'Prestataire',
          description: "Nom du prestataire chargé de l'intervention. Un tiret signifie qu'aucun n'est assigné."
        },
        { key: 'createdAt', label: 'Date de création', description: 'Jour où le ticket a été déclaré.' },
        { key: 'action', label: 'Action', description: "L'icône en forme d'œil ouvre la fiche du ticket." }
      ],
      statuses: [
        {
          value: 'DECLARED',
          label: 'Déclaré',
          description: "Le ticket vient d'être signalé, personne ne l'a encore pris en charge."
        },
        { value: 'IN_PROGRESS', label: 'En cours', description: "L'agence a commencé à traiter le ticket." },
        {
          value: 'ASSIGNED',
          label: 'Assigné',
          description: 'Un prestataire ou un responsable est désigné pour intervenir.'
        },
        { value: 'RESOLVED', label: 'Résolu', description: "L'intervention est terminée. Le statut ne change plus." },
        { value: 'CANCELED', label: 'Annulé', description: 'Le ticket est abandonné. Le statut ne change plus.' }
      ],
      notes: [
        "Le filtre « Prestataire » ne propose que des prestataires de votre agence. Les filtres sont conservés dans l'adresse de la page : vous pouvez la mettre en favori ou la partager."
      ]
    },
    related: [{ label: "Fiche d'un ticket", helpId: 'administration.maintenance-gestion.ticket-detail' }],
    faq: [
      {
        q: 'Comment retrouver un ticket précis ?',
        a: 'Tapez un mot dans « Rechercher » : il porte sur le titre, la description, le bien et le prestataire. Vous pouvez aussi filtrer par « Statut », « Priorité », « Catégorie », « Bien », « Prestataire » ou « Créé du / au ».'
      },
      {
        q: 'Comment ouvrir un ticket ?',
        a: 'Cliquez sur son titre, ou sur l’icône en forme d’œil de la colonne « Action ».'
      },
      {
        q: 'Pourquoi le tableau est-il vide ?',
        a: 'Si des filtres sont actifs, aucun ticket ne les remplit : retirez-les pour revoir toute la liste. Sans filtre, le message « Aucun ticket de maintenance » signifie que l’agence n’a encore aucun ticket.'
      }
    ],
    keywords: ['filtre', 'recherche', 'export', 'statut', 'priorité']
  },

  // ------------------------------------------------------------------ Fiche d'un ticket
  {
    id: 'administration.maintenance-gestion.ticket-detail',
    kind: 'page',
    title: "Fiche d'un ticket de maintenance",
    summary:
      "Consultez le détail d'un incident, changez son statut et sa priorité, assignez un prestataire et notez la résolution. Les commentaires et l'historique gardent la trace de chaque étape.",
    purpose:
      "C'est ici que le gestionnaire traite l'incident : il lit la description du locataire ou du propriétaire, choisit qui intervient, fait avancer le ticket et le clôture.",
    steps: [
      {
        title: 'Lire le ticket',
        detail: 'Vérifiez la catégorie, le bien, le locataire, la description et les détails de localisation.'
      },
      {
        title: 'Passer le ticket « En cours »',
        detail: 'Dans la liste « Statut », choisissez « En cours » puis « Enregistrer les modifications ».'
      },
      {
        title: 'Choisir un prestataire',
        detail: 'Dans « Prestataire assigné », sélectionnez un prestataire actif.'
      },
      {
        title: 'Passer le ticket « Assigné »',
        detail: "Ce statut n'est accepté que si un prestataire est choisi. Enregistrez."
      },
      {
        title: 'Clôturer',
        detail:
          "Une fois l'intervention faite, choisissez « Résolu », complétez les notes de résolution et enregistrez."
      }
    ],
    consequences: [
      'Les changements du formulaire (statut, priorité, prestataire, notes) ne sont enregistrés que lorsque vous cliquez sur « Enregistrer les modifications ».',
      '« Résolu » et « Annulé » sont définitifs : le statut ne peut plus être modifié ensuite.',
      "Quand le statut change, le locataire est prévenu par e-mail et le propriétaire du bien par e-mail, si ces notifications sont activées pour votre agence ; le locataire peut aussi l'être par WhatsApp si votre agence l'a activé. Changer seulement la priorité, le prestataire ou les notes n'envoie pas de message.",
      "L'application n'envoie pas de message au prestataire : prévenez-le vous-même."
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas choisir « Assigné » ?',
        a: "On ne peut avancer que d'une étape à la fois : « Déclaré » mène à « En cours », « En cours » mène à « Assigné », « Assigné » mène à « Résolu ». « Assigné » demande aussi un prestataire choisi."
      },
      {
        q: 'Puis-je annuler un ticket ?',
        a: 'Oui, depuis « Déclaré » ou « En cours ». Un ticket « Assigné » ne peut plus être annulé : il se termine par « Résolu ».'
      },
      {
        q: 'Un message dit que le statut a changé, que faire ?',
        a: "Quelqu'un a modifié le ticket pendant que vous le consultiez. L'écran se recharge : vérifiez l'état actuel puis refaites votre modification."
      },
      {
        q: 'Mon prestataire est introuvable dans la liste.',
        a: "La liste ne montre que les prestataires actifs de votre agence. Vérifiez qu'il existe et qu'il est « Actif » dans l'écran des prestataires."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire'],
      note: 'Droit demandé : « Gérer tous les tickets et prestataires ».'
    },
    related: [
      { label: 'Prestataire et statut', helpId: 'administration.maintenance-gestion.ticket-detail.assignation' },
      { label: 'Historique des statuts', helpId: 'administration.maintenance-gestion.ticket-detail.historique' },
      { label: 'Liste des tickets', to: '/tenant/:tenantId/admin/maintenance/tickets' }
    ],
    keywords: ['résolution', 'clôturer', 'assigner', 'intervention', 'statut', 'priorité']
  },
  {
    id: 'administration.maintenance-gestion.ticket-detail.informations',
    kind: 'section',
    title: 'Informations du ticket',
    summary:
      'Résume le ticket : catégorie, bien concerné, locataire et prestataire assigné. Ces lignes sont en lecture seule.',
    howToRead: {
      notes: [
        "« Propriété » donne l'adresse du bien. « Locataire » n'apparaît que si un locataire est lié au ticket.",
        "« Prestataire assigné » n'apparaît que si un prestataire est choisi ; son téléphone s'affiche entre parenthèses s'il est renseigné.",
        'Le statut actuel est rappelé en haut de la fiche, à côté du titre et de la date de création.'
      ]
    },
    related: [
      { label: 'Prestataire et statut', helpId: 'administration.maintenance-gestion.ticket-detail.assignation' }
    ],
    faq: [
      {
        q: 'Puis-je corriger ces informations ici ?',
        a: 'Non, ces lignes sont en lecture seule. Dans la fiche, seuls le statut, la priorité, le prestataire et les notes de résolution se modifient.'
      },
      {
        q: 'Pourquoi n’y a-t-il pas de ligne « Locataire » ?',
        a: 'Elle n’apparaît que si un locataire est lié au ticket.'
      },
      {
        q: 'Où voir la date de création du ticket ?',
        a: 'En haut de la fiche, sous le titre, après la mention « Créé le ».'
      }
    ],
    keywords: ['catégorie', 'locataire', 'bien', 'adresse']
  },
  {
    id: 'administration.maintenance-gestion.ticket-detail.assignation',
    kind: 'section',
    title: 'Statut, priorité et prestataire',
    summary:
      "Ce formulaire sert à faire avancer le ticket : statut, priorité, prestataire assigné et notes de résolution. Rien n'est pris en compte avant « Enregistrer les modifications ».",
    howToRead: {
      statuses: [
        {
          value: 'DECLARED',
          label: 'Déclaré',
          description: 'Prochaines étapes possibles : « En cours » ou « Annulé ».'
        },
        {
          value: 'IN_PROGRESS',
          label: 'En cours',
          description: 'Prochaines étapes possibles : « Assigné » ou « Annulé ».'
        },
        {
          value: 'ASSIGNED',
          label: 'Assigné',
          description: 'Prochaine étape possible : « Résolu ». Demande un prestataire choisi.'
        },
        { value: 'RESOLVED', label: 'Résolu', description: 'Étape finale : la liste « Statut » est grisée.' },
        { value: 'CANCELED', label: 'Annulé', description: 'Étape finale : la liste « Statut » est grisée.' }
      ],
      notes: [
        'Priorités proposées : Faible, Moyenne, Élevée, Urgente.',
        "Le prestataire se choisit parmi les prestataires actifs de l'agence ; la croix de la liste retire l'assignation."
      ]
    },
    steps: [
      { title: 'Choisir le statut suivant', detail: 'La liste ne propose que les étapes permises.' },
      { title: 'Ajuster la priorité si besoin' },
      { title: 'Choisir le prestataire', detail: 'Obligatoire avant de passer en « Assigné ».' },
      { title: 'Saisir les notes de résolution', detail: 'Facultatif : décrivez ce qui a été fait.' },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer les modifications ».' }
    ],
    consequences: [
      "Un changement de statut est inscrit dans l'historique avec votre nom et la date, et déclenche les e-mails au locataire et au propriétaire si votre agence les a activés.",
      '« Résolu » et « Annulé » sont irréversibles.',
      "Si l'enregistrement est refusé, l'écran revient à ce qui est réellement enregistré et affiche la raison."
    ],
    faq: [
      {
        q: 'Puis-je changer de prestataire après avoir assigné ?',
        a: "Oui, tant que le ticket n'est pas « Résolu » ou « Annulé » : choisissez un autre prestataire et enregistrez. Le changement de prestataire seul n'envoie pas de message."
      },
      {
        q: 'Le prestataire est-il prévenu automatiquement ?',
        a: "Non. L'application ne lui envoie rien : contactez-le avec le numéro affiché sur la fiche."
      },
      {
        q: 'Que mettre dans les notes de résolution ?',
        a: 'Ce qui a été fait, la date et tout élément utile pour la suite. Ces notes restent sur le ticket.'
      }
    ],
    related: [
      { label: 'Historique des statuts', helpId: 'administration.maintenance-gestion.ticket-detail.historique' }
    ],
    keywords: ['assigner', 'prestataire', 'statut', 'priorité', 'résolution']
  },
  {
    id: 'administration.maintenance-gestion.ticket-detail.historique',
    kind: 'section',
    title: 'Historique des statuts',
    summary:
      "Liste chaque changement de statut du ticket, avec la date et la personne qui l'a fait. La ligne la plus récente est en bleu.",
    howToRead: {
      notes: [
        'Chaque ligne se lit « ancien statut → nouveau statut ».',
        "Si le changement n'a pas été fait par une personne, « (Système) » est affiché à la place du nom.",
        "« Aucun historique disponible » signifie qu'aucun changement n'a encore été enregistré."
      ]
    },
    faq: [
      {
        q: 'Pourquoi la première ligne n’a-t-elle pas de flèche ?',
        a: 'C’est la création du ticket : il n’y avait pas de statut avant, donc seul « Déclaré » s’affiche, avec une note de création écrite toujours en français.'
      },
      {
        q: 'Que veut dire « (Système) » ?',
        a: 'Le changement n’est rattaché à aucune personne : l’écran affiche « (Système) » à la place du nom.'
      },
      {
        q: 'Où est la remarque liée à un changement ?',
        a: 'Quand une note a été enregistrée avec le changement, elle s’affiche en gris sous le statut. La date et la personne figurent en dessous.'
      }
    ],
    keywords: ['historique', 'suivi', 'journal', 'qui a modifié']
  },
  {
    id: 'administration.maintenance-gestion.ticket-detail.pieces-jointes',
    kind: 'section',
    title: 'Pièces jointes',
    summary:
      'Affiche les photos ou documents joints au ticket lors de sa déclaration. Vous pouvez les télécharger avec le bouton « Télécharger ».',
    howToRead: {
      notes: [
        "Cet écran ne permet pas d'ajouter ni de supprimer une pièce jointe.",
        "« Aucune pièce jointe » s'affiche si rien n'a été joint."
      ]
    },
    faq: [
      {
        q: 'Que montre chaque ligne ?',
        a: 'Le nom du fichier et sa taille, ou « Taille inconnue » si elle n’est pas connue. Pour une image, une vignette s’affiche et s’agrandit au clic.'
      },
      { q: 'Comment récupérer un fichier ?', a: 'Cliquez sur « Télécharger » sur la ligne du fichier.' },
      {
        q: 'Puis-je ajouter une photo après coup ?',
        a: 'Pas depuis cet écran : il ne permet ni d’ajouter ni de supprimer une pièce jointe.'
      }
    ],
    keywords: ['photo', 'document', 'fichier', 'télécharger']
  },
  {
    id: 'administration.maintenance-gestion.ticket-detail.commentaires',
    kind: 'section',
    title: 'Commentaires',
    summary:
      "Échangez des remarques sur le ticket : les commentaires déjà postés sont listés, puis vous pouvez ajouter les vôtres. Le bouton « Envoyer » s'active dès que vous avez écrit un message.",
    steps: [
      { title: 'Écrire le message', detail: 'Dans la zone « Ajouter un commentaire... ».' },
      { title: 'Envoyer', detail: 'Cliquez sur « Envoyer ». Le commentaire apparaît dans la liste.' }
    ],
    consequences: [
      'Un commentaire ne peut pas être modifié ni supprimé depuis cet écran.',
      "L'envoi d'un commentaire ne déclenche pas d'e-mail depuis ce service : prévenez la personne concernée par un autre moyen si c'est urgent."
    ],
    faq: [
      {
        q: 'Le locataire voit-il mes commentaires ?',
        a: "À confirmer : l'écran ne précise pas la visibilité d'un commentaire côté portail. Évitez d'y écrire des informations internes sensibles."
      },
      {
        q: 'Pourquoi le bouton « Envoyer » est-il grisé ?',
        a: 'Le message est vide : écrivez au moins un caractère.'
      },
      {
        q: 'Où voir qui a écrit un commentaire ?',
        a: "L'auteur est indiqué sur chaque commentaire ; « Système » désigne un message automatique."
      }
    ],
    keywords: ['message', 'remarque', 'échange', 'note']
  },

  // ------------------------------------------------------------------ Prestataires
  {
    id: 'administration.maintenance-gestion.prestataires',
    kind: 'page',
    title: 'Gestion des prestataires',
    summary:
      'Retrouvez ici les artisans et entreprises qui interviennent pour votre agence (plombier, électricien, climatisation...). Ce sont eux que vous assignez aux tickets de maintenance.',
    purpose:
      "Un prestataire doit exister et être « Actif » pour apparaître dans la liste d'assignation d'un ticket. Les fournisseurs sont partagés avec la copropriété (contrats de maintenance).",
    steps: [
      {
        title: 'Chercher un prestataire',
        detail: 'Zone « Rechercher » : nom, spécialité, e-mail ou téléphone. Filtre « Statut » : Actifs ou Inactifs.'
      },
      {
        title: 'Supprimer un prestataire',
        detail: "Icône rouge de la colonne « Actions », puis « Oui, supprimer » après lecture de l'avertissement."
      }
    ],
    consequences: [
      "La suppression est définitive : le prestataire disparaît de l'agence.",
      "Elle est refusée tant que le prestataire est assigné à au moins un ticket, quel que soit son statut, ou lié à un contrat de copropriété. Réassignez d'abord les tickets.",
      "Supprimer un prestataire ne modifie pas les tickets passés d'autres prestataires."
    ],
    faq: [
      {
        q: 'Comment ajouter un prestataire ?',
        a: "Le bouton « Nouveau prestataire » est présent, mais à ce jour (à confirmer avec l'équipe produit) le formulaire de saisie ne s'affiche pas sur cet écran. Les prestataires déjà enregistrés restent utilisables."
      },
      {
        q: 'Un prestataire est refusé à la suppression, pourquoi ?',
        a: 'Il est encore assigné à un ticket ou lié à un contrat. Assignez un autre prestataire à ces tickets, puis réessayez.'
      },
      {
        q: 'Peut-on seulement désactiver un prestataire ?',
        a: 'Cet écran ne propose que la suppression définitive. Le statut « Actif » ou « Inactif » reste visible dans le tableau.'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire'],
      note: 'Droit demandé : « Gérer tous les tickets et prestataires ».'
    },
    related: [
      { label: 'Tableau des prestataires', helpId: 'administration.maintenance-gestion.prestataires.tableau' },
      { label: 'Liste des tickets', helpId: 'administration.maintenance-gestion.tickets' }
    ],
    keywords: ['fournisseur', 'artisan', 'plombier', 'électricien', 'entreprise', 'sous-traitant']
  },
  {
    id: 'administration.maintenance-gestion.prestataires.tableau',
    kind: 'table',
    title: 'Tableau des prestataires',
    summary:
      "Une ligne par prestataire de l'agence, classés par nom. Filtrez par « Statut » pour ne voir que les actifs ou les inactifs.",
    howToRead: {
      columns: [
        { key: 'name', label: 'Nom', description: 'Nom du prestataire ou de son entreprise.' },
        {
          key: 'phone',
          label: 'Téléphone',
          description: "Numéro à appeler pour l'intervention. Un tiret si non renseigné."
        },
        { key: 'email', label: 'Email', description: 'Adresse e-mail du prestataire. Un tiret si non renseignée.' },
        {
          key: 'specialties',
          label: 'Spécialités',
          description: "Domaines de compétence, affichés sous forme d'étiquettes."
        },
        {
          key: 'isActive',
          label: 'Statut',
          description: "« Actif » : proposé pour les tickets. « Inactif » : n'est plus proposé."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: 'Le crayon modifie, la corbeille supprime définitivement après confirmation.'
        }
      ],
      statuses: [
        {
          value: 'true',
          label: 'Actif',
          description: "Le prestataire apparaît dans la liste d'assignation d'un ticket."
        },
        { value: 'false', label: 'Inactif', description: "Le prestataire n'est plus proposé pour de nouveaux tickets." }
      ],
      notes: [
        "Le crayon de modification est présent, mais le formulaire correspondant ne s'affiche pas actuellement (à confirmer)."
      ]
    },
    consequences: [
      'La suppression par la corbeille est irréversible et refusée si le prestataire est lié à un ticket ou à un contrat de copropriété.'
    ],
    faq: [
      {
        q: 'Comment chercher un prestataire ?',
        a: 'Tapez dans « Rechercher » un nom, une spécialité, un e-mail ou un téléphone. Le filtre « Statut » propose « Actifs » ou « Inactifs ».'
      },
      {
        q: 'Que signifie un tiret dans une colonne ?',
        a: 'Le téléphone, l’e-mail ou les spécialités ne sont pas renseignés pour ce prestataire.'
      },
      {
        q: 'Que se passe-t-il quand je clique sur la corbeille ?',
        a: 'Une bulle demande « Êtes-vous sûr de vouloir supprimer définitivement ce prestataire ? ». Avec « Oui, supprimer », la suppression est irréversible ; « Annuler » ferme la bulle sans rien changer.'
      }
    ],
    keywords: ['liste', 'recherche', 'actif', 'inactif', 'supprimer']
  }
];

export default entries;
