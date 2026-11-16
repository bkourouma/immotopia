import type { HelpEntry } from '../../../types';

/** Zone « equipe » du module « administration » (fr) : collaborateurs, invitations et profil personnel. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Liste des collaborateurs
  {
    id: 'administration.equipe.collaborateurs',
    kind: 'page',
    title: 'Collaborateurs',
    summary:
      'Retrouvez ici toutes les personnes qui travaillent dans votre agence, avec leurs rôles et leur statut. Vous pouvez en inviter de nouvelles, ouvrir une fiche, désactiver ou réactiver un compte.',
    purpose:
      'Cette liste sert à savoir qui a accès à votre agence et avec quels droits. Un collaborateur apparaît dans la liste quand il a accepté son invitation.',
    steps: [
      {
        title: 'Chercher un collaborateur',
        detail: 'Tapez un nom ou une adresse e-mail dans « Rechercher », ou filtrez par « Statut » et par « Rôle ».'
      },
      {
        title: 'Ouvrir une fiche',
        detail: "Cliquez sur l'icône « œil » (« Voir les détails ») pour changer ses rôles ou agir sur son compte."
      },
      {
        title: 'Désactiver ou activer un compte',
        detail: "Utilisez l'icône « Désactiver » ou « Activer » en bout de ligne, puis confirmez avec « Oui »."
      },
      {
        title: 'Inviter un nouveau collaborateur',
        detail: 'Cliquez sur « Inviter un collaborateur » en haut de page.'
      }
    ],
    consequences: [
      "Désactiver un collaborateur lui retire l'accès à l'agence et le déconnecte. Il peut être réactivé ensuite.",
      "Les invitations encore en attente qu'il avait envoyées sont annulées en même temps."
    ],
    faq: [
      {
        q: "Je viens d'inviter quelqu'un : pourquoi n'est-il pas dans la liste ?",
        a: "Il apparaît dès qu'il a accepté son invitation. Avant cela, retrouvez-le dans l'écran « Invitations »."
      },
      {
        q: 'Puis-je me désactiver moi-même ?',
        a: "Non, l'application le refuse. Elle refuse aussi de désactiver le dernier administrateur actif de l'agence."
      },
      {
        q: 'Que signifie « Jamais » dans « Dernière connexion » ?',
        a: "La personne ne s'est encore jamais connectée avec ce compte."
      },
      {
        q: 'Quels sont les droits nécessaires ?',
        a: 'Ouvrir la liste demande « Voir les collaborateurs ». Désactiver demande « Désactiver des collaborateurs », et activer demande « Modifier les collaborateurs ».'
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire'],
      note: 'Droit requis pour voir la liste : « Voir les collaborateurs ».'
    },
    related: [
      { label: 'Tableau des collaborateurs', helpId: 'administration.equipe.collaborateurs.tableau' },
      { label: 'Inviter un collaborateur', helpId: 'administration.equipe.inviter' },
      { label: 'Invitations en cours', helpId: 'administration.equipe.invitations' }
    ],
    keywords: ['équipe', 'utilisateurs', 'employés', 'personnel', 'accès', 'comptes', 'membres']
  },
  {
    id: 'administration.equipe.collaborateurs.tableau',
    kind: 'table',
    title: 'Tableau des collaborateurs',
    summary:
      'Chaque ligne est un collaborateur de votre agence. Le tableau montre son nom, ses rôles, son statut et sa dernière connexion.',
    howToRead: {
      columns: [
        {
          key: 'user',
          label: 'Utilisateur',
          description:
            "Le nom complet et, dessous, l'adresse e-mail. Sans nom enregistré, l'adresse e-mail s'affiche seule."
        },
        { key: 'roles', label: 'Rôles', description: "Les rôles attribués dans l'agence, un badge par rôle." },
        {
          key: 'status',
          label: 'Statut',
          description: "L'état du compte dans l'agence (voir les statuts ci-dessous)."
        },
        {
          key: 'lastLogin',
          label: 'Dernière connexion',
          description: 'Date de la dernière connexion, ou « Jamais ».'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Voir les détails », puis « Désactiver » (compte actif) ou « Activer » (autres statuts).'
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: "Le collaborateur peut se connecter et travailler dans l'agence."
        },
        {
          value: 'PENDING_INVITE',
          label: 'Invitation en attente',
          description:
            "Le compte est prévu mais pas encore activé, par exemple l'administrateur d'une agence tout juste créée."
        },
        {
          value: 'DISABLED',
          label: 'Désactivé',
          description: "L'accès à l'agence est coupé. Le compte peut être réactivé."
        }
      ],
      notes: [
        "La barre de recherche filtre par texte (nom ou e-mail), par statut et par rôle. Les filtres restent dans l'adresse de la page.",
        "Le bouton d'export reprend les mêmes critères que la liste affichée."
      ]
    },
    steps: [
      { title: 'Filtrer la liste', detail: 'Utilisez « Rechercher », « Statut » et « Rôle ».' },
      { title: 'Ouvrir une fiche', detail: 'Icône « œil » en bout de ligne.' },
      { title: 'Désactiver ou activer', detail: 'Icône en bout de ligne, puis « Oui » pour confirmer.' }
    ],
    consequences: [
      "« Désactiver » coupe l'accès, déconnecte la personne et annule les invitations en attente qu'elle avait envoyées.",
      "« Activer » rend l'accès à la personne avec les rôles qu'elle avait. Elle n'est pas prévenue par e-mail."
    ],
    faq: [
      {
        q: 'Pourquoi « Activer » apparaît-il pour une invitation en attente ?',
        a: "Le bouton s'affiche pour tout statut autre que « Actif »."
      },
      {
        q: 'Un collaborateur désactivé perd-il ses rôles ?',
        a: 'Les rôles sont conservés : à la réactivation, il retrouve ses anciens rôles.'
      },
      {
        q: 'Pourquoi un message de refus apparaît-il ?',
        a: "Par exemple parce que vous essayez de vous désactiver vous-même, ou de toucher à un administrateur sans l'être. Le message affiché donne la raison."
      }
    ],
    permissions: {
      note: '« Désactiver des collaborateurs » pour désactiver, « Modifier les collaborateurs » pour activer.'
    },
    related: [{ label: 'Collaborateurs', helpId: 'administration.equipe.collaborateurs' }],
    keywords: ['statut', 'désactiver', 'activer', 'rôle', 'dernière connexion', 'exporter']
  },

  // ------------------------------------------------------------------ Fiche d'un collaborateur
  {
    id: 'administration.equipe.collaborateur-detail',
    kind: 'page',
    title: "Fiche d'un collaborateur",
    summary:
      "Consultez les informations d'un collaborateur, changez ses rôles, réinitialisez son mot de passe ou coupez ses sessions ouvertes.",
    purpose:
      "Cette fiche sert à ajuster les droits d'une personne de l'équipe et à réagir en cas de problème d'accès (mot de passe oublié, appareil perdu).",
    steps: [
      {
        title: 'Vérifier les informations',
        detail: 'Carte « Informations du collaborateur » : e-mail, nom, statut, dernière connexion.'
      },
      {
        title: 'Cocher les rôles',
        detail: 'Cochez ou décochez les rôles proposés, puis cliquez sur « Enregistrer les rôles ».'
      },
      {
        title: 'Agir sur le compte',
        detail:
          'Sous « Actions » : « Réinitialiser le mot de passe » ou « Révoquer les sessions », avec une confirmation.'
      }
    ],
    consequences: [
      'Enregistrer les rôles remplace tous les rôles de la personne par votre sélection.',
      '« Réinitialiser le mot de passe » envoie un lien par e-mail et déconnecte la personne.',
      '« Révoquer les sessions » déconnecte la personne de tous ses appareils.'
    ],
    faq: [
      {
        q: 'Puis-je changer mes propres rôles ?',
        a: "Non, l'application refuse : personne ne modifie ses propres rôles."
      },
      {
        q: 'Où désactiver ou réactiver le compte ?',
        a: 'Depuis la liste des collaborateurs, avec les icônes « Désactiver » et « Activer » de la ligne.'
      },
      {
        q: "Pourquoi le statut s'affiche-t-il en anglais pour un collaborateur désactivé ?",
        a: "C'est un défaut d'affichage connu de cet écran : le mot « DISABLED » peut apparaître au lieu de « Désactivé »."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire'],
      note: 'Ouvrir la fiche demande « Voir les collaborateurs » ; changer les rôles, réinitialiser le mot de passe et révoquer les sessions demandent « Modifier les collaborateurs ».'
    },
    related: [
      { label: 'Rôles du collaborateur', helpId: 'administration.equipe.collaborateur-detail.roles' },
      { label: 'Actions sur le compte', helpId: 'administration.equipe.collaborateur-detail.actions' },
      { label: 'Collaborateurs', to: '/tenant/:tenantId/collaborators' }
    ],
    keywords: ['fiche', 'détail', 'rôles', 'mot de passe', 'sessions', 'droits', 'permissions']
  },
  {
    id: 'administration.equipe.collaborateur-detail.informations',
    kind: 'section',
    title: 'Informations du collaborateur',
    summary:
      "Cette carte rappelle l'e-mail, le nom complet, le statut et la dernière connexion de la personne. Elle est en lecture seule.",
    howToRead: {
      notes: [
        'Statut : « Actif », « Invitation en attente » ou « Désactivé ».',
        'Dernière connexion : date et heure, ou « Jamais ».',
        "Le nom et l'e-mail ne se modifient pas ici."
      ]
    },
    faq: [
      {
        q: "Comment corriger le nom ou l'e-mail d'un collaborateur ?",
        a: 'Cet écran ne le permet pas.'
      },
      {
        q: 'Que veut dire « — » dans « Nom complet » ?',
        a: "Aucun nom n'est enregistré pour ce compte."
      },
      {
        q: 'Pourquoi « Jamais » pour la dernière connexion ?',
        a: "La personne ne s'est pas encore connectée avec ce compte."
      }
    ],
    permissions: { note: 'Demande « Voir les collaborateurs ».' },
    related: [{ label: "Fiche d'un collaborateur", helpId: 'administration.equipe.collaborateur-detail' }],
    keywords: ['informations', 'e-mail', 'nom', 'statut']
  },
  {
    id: 'administration.equipe.collaborateur-detail.roles',
    kind: 'section',
    title: 'Rôles du collaborateur',
    summary:
      "Un rôle donne à la personne un ensemble de droits dans l'agence. Cochez les rôles voulus puis cliquez sur « Enregistrer les rôles ».",
    purpose:
      'Les rôles proposés sont ceux prévus pour les agences. Sous chaque nom, une phrase décrit ce que le rôle permet.',
    howToRead: {
      notes: [
        "Administrateur de l'agence : gestion complète (paramètres, collaborateurs, CRM, biens, location, facturation). L'écran l'affiche sous le nom « Administrateur tenant ».",
        "Gestionnaire : droits de gestion sans modification de la facturation. L'écran l'affiche sous le nom « Gestionnaire tenant ».",
        "Agent : droits limités, biens et visites, contacts et affaires. L'écran l'affiche sous le nom « Agent tenant ».",
        "Comptable : facturation et informations comptables. L'écran l'affiche sous le nom « Comptable tenant ».",
        'Magasinier : reçoit, sort, transfère et compte le stock, sans voir les valeurs ni la comptabilité.',
        "Chef de chantier : compte le stock de ses chantiers, notamment par WhatsApp, sans valider l'inventaire ni voir les valeurs."
      ]
    },
    steps: [
      { title: 'Cocher les rôles', detail: 'Une personne peut avoir plusieurs rôles.' },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer les rôles ». Le message « Rôles mis à jour avec succès » confirme.'
      }
    ],
    consequences: [
      'Les anciens rôles sont remplacés par votre sélection : ce qui est décoché est retiré.',
      "Les nouveaux droits s'appliquent à la personne tout de suite.",
      "Donner ou retirer le rôle d'administrateur est réservé à un administrateur de l'agence.",
      "L'agence garde toujours au moins un administrateur actif : retirer ce rôle au dernier est refusé.",
      "La modification est notée dans le journal d'activité de l'agence."
    ],
    faq: [
      {
        q: 'Pourquoi la liste des rôles affiche-t-elle « Chargement des rôles… » ?',
        a: "Les rôles se chargent à l'ouverture de la fiche. Si la liste reste vide, rechargez la page."
      },
      {
        q: 'Puis-je changer mon propre rôle ?',
        a: "Non, c'est refusé. Demandez-le à un autre administrateur."
      },
      {
        q: "Un gestionnaire peut-il donner le rôle d'administrateur ?",
        a: "Non. Cette action est réservée aux administrateurs de l'agence."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire'],
      note: 'Demande « Modifier les collaborateurs ».'
    },
    related: [{ label: "Fiche d'un collaborateur", helpId: 'administration.equipe.collaborateur-detail' }],
    keywords: ['rôle', 'droits', 'permissions', 'administrateur', 'comptable', 'agent', 'magasinier']
  },
  {
    id: 'administration.equipe.collaborateur-detail.actions',
    kind: 'section',
    title: 'Actions sur le compte',
    summary:
      'Deux boutons permettent de dépanner un collaborateur : « Réinitialiser le mot de passe » et « Révoquer les sessions ». Chacun demande une confirmation.',
    purpose: "À utiliser quand quelqu'un a oublié son mot de passe, ou quand un appareil est perdu ou n'est plus sûr.",
    steps: [
      {
        title: "Choisir l'action",
        detail: 'Cliquez sur « Réinitialiser le mot de passe » ou sur « Révoquer les sessions ».'
      },
      { title: 'Confirmer', detail: 'Validez dans la fenêtre : « Réinitialiser » ou « Révoquer ».' }
    ],
    consequences: [
      'Réinitialiser le mot de passe : un e-mail avec un lien à usage unique, valable 24 heures, est envoyé à la personne. Elle choisit elle-même son nouveau mot de passe.',
      "Dès la réinitialisation, ses sessions ouvertes sont fermées. Pour un compte partagé avec d'autres agences ou la plateforme, son mot de passe actuel n'est pas modifié : seul le lien est envoyé.",
      'Révoquer les sessions : la personne est déconnectée de tous ses appareils et doit se reconnecter. Son mot de passe ne change pas.',
      "Aucune de ces actions ne s'annule. Les deux sont notées dans le journal d'activité."
    ],
    faq: [
      {
        q: "La personne n'a pas reçu l'e-mail, que faire ?",
        a: "Si l'envoi échoue, l'application ne l'indique pas à l'écran. Vérifiez l'adresse puis relancez l'action."
      },
      {
        q: 'Peut-on réinitialiser un compte désactivé ?',
        a: "Non. Seul un membre actif peut voir son mot de passe réinitialisé : réactivez-le d'abord."
      },
      {
        q: 'Puis-je déconnecter un administrateur ?',
        a: "Seul un administrateur de l'agence le peut. Les sessions d'un super-administrateur ne se révoquent pas depuis une agence."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence", 'Gestionnaire'],
      note: 'Demande « Modifier les collaborateurs ».'
    },
    related: [{ label: "Fiche d'un collaborateur", helpId: 'administration.equipe.collaborateur-detail' }],
    keywords: ['mot de passe oublié', 'déconnecter', 'sessions', 'réinitialiser', 'sécurité']
  },

  // ------------------------------------------------------------------ Inviter un collaborateur
  {
    id: 'administration.equipe.inviter',
    kind: 'page',
    title: 'Inviter un collaborateur',
    summary:
      "Saisissez l'adresse e-mail de la personne et choisissez ses rôles. Elle reçoit un lien pour rejoindre votre agence.",
    purpose:
      "C'est la façon d'ajouter quelqu'un à l'équipe. La personne choisit elle-même son mot de passe en acceptant l'invitation.",
    steps: [
      { title: "Saisir l'e-mail", detail: 'Champ « Email » : adresse valide, obligatoire.' },
      {
        title: 'Choisir les rôles',
        detail: 'Cliquez sur une carte de rôle pour la cocher. Au moins un rôle est obligatoire.'
      },
      {
        title: 'Envoyer',
        detail: "Cliquez sur « Envoyer l'invitation ». Vous arrivez ensuite dans l'écran « Invitations »."
      }
    ],
    consequences: [
      "Un e-mail est envoyé avec un lien d'acceptation. Il indique l'agence, les rôles et la date limite.",
      "Si l'adresse correspond à un contact de votre agence ayant un numéro et un accord WhatsApp, le lien peut aussi lui être envoyé par WhatsApp.",
      "L'invitation est valable 7 jours.",
      "Si l'e-mail n'a pas pu partir, l'invitation est quand même créée : un message d'avertissement s'affiche, utilisez « Renvoyer » dans l'écran « Invitations ».",
      "À l'acceptation, la personne reçoit les rôles choisis ; un nouveau compte demande un mot de passe."
    ],
    faq: [
      {
        q: "Pourquoi l'invitation est-elle refusée ?",
        a: "Soit une invitation en attente existe déjà pour cette adresse, soit la personne est déjà membre, soit votre agence n'est plus active. Le message affiché donne la raison."
      },
      {
        q: 'La personne est désactivée : puis-je la réinviter ?',
        a: 'Non. Réactivez-la depuis la liste des collaborateurs.'
      },
      {
        q: 'Qui peut inviter un administrateur ?',
        a: "Seuls les administrateurs de l'agence. Un gestionnaire ne peut pas attribuer ce rôle."
      },
      {
        q: 'La personne a déjà un compte ImmoTopia, que se passe-t-il ?',
        a: "Elle doit être connectée avec ce compte pour accepter. Son mot de passe n'est pas modifié."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      note: 'Demande « Créer des collaborateurs ».'
    },
    related: [
      { label: 'Rôles', helpId: 'administration.equipe.inviter.roles' },
      { label: 'Invitations en cours', helpId: 'administration.equipe.invitations' }
    ],
    keywords: ['inviter', 'ajouter', 'nouvel employé', 'inviter par e-mail', 'équipe'],
    tour: {
      steps: [
        {
          target: 'inviter-email',
          title: "L'adresse e-mail",
          description: "Saisissez l'adresse de la personne : c'est là que le lien d'invitation sera envoyé."
        },
        {
          target: 'inviter-roles',
          title: 'Les rôles',
          description: 'Cliquez sur une carte pour la cocher. Les droits de la personne dépendent des rôles choisis.'
        },
        {
          target: 'inviter-envoyer',
          title: "Envoyer l'invitation",
          description: "Le bouton reste grisé tant qu'aucun rôle n'est coché."
        }
      ]
    }
  },
  {
    id: 'administration.equipe.inviter.roles',
    kind: 'section',
    title: 'Rôles de la personne invitée',
    summary:
      'Chaque carte est un rôle, avec une courte description de ses droits. Cochez un ou plusieurs rôles : au moins un est obligatoire.',
    howToRead: {
      notes: [
        "Les rôles courants : Administrateur de l'agence, Gestionnaire, Agent, Comptable, Magasinier, Chef de chantier.",
        "L'écran affiche encore certains noms avec le mot « tenant » (par exemple « Gestionnaire tenant ») : c'est le même rôle.",
        'Une carte cochée est entourée de bleu.'
      ]
    },
    steps: [
      { title: 'Lire la description', detail: 'Elle résume ce que le rôle permet.' },
      { title: 'Cocher', detail: 'Cliquez sur la carte ou sur la case.' }
    ],
    consequences: [
      "Les rôles sont donnés à la personne quand elle accepte l'invitation, pas avant.",
      'Les rôles peuvent être changés ensuite depuis sa fiche.'
    ],
    faq: [
      {
        q: 'La liste est vide ou en erreur, que faire ?',
        a: 'Utilisez le bouton « Reessayer » ou « Recharger » affiché sous le message.'
      },
      {
        q: 'Quel rôle choisir pour un comptable ?',
        a: "« Comptable » : facturation et informations comptables de l'agence."
      },
      {
        q: 'Puis-je cocher plusieurs rôles ?',
        a: "Oui, les droits s'additionnent."
      }
    ],
    permissions: { note: "Attribuer le rôle d'administrateur est réservé aux administrateurs de l'agence." },
    related: [{ label: 'Inviter un collaborateur', helpId: 'administration.equipe.inviter' }],
    keywords: ['rôle', 'droits', 'administrateur', 'agent', 'comptable']
  },

  // ------------------------------------------------------------------ Invitations en cours
  {
    id: 'administration.equipe.invitations',
    kind: 'page',
    title: 'Invitations',
    summary:
      'Suivez les invitations envoyées à vos futurs collaborateurs : en attente, acceptées, révoquées ou expirées. Vous pouvez renvoyer ou révoquer une invitation en attente.',
    purpose:
      "Cet écran sert à relancer une personne qui n'a pas répondu, ou à annuler une invitation envoyée par erreur.",
    steps: [
      {
        title: 'Chercher une invitation',
        detail: "« Rechercher » par adresse e-mail, filtre « Statut », filtre « Date d'invitation »."
      },
      { title: 'Renvoyer', detail: 'Icône « Renvoyer » sur une invitation en attente, puis « Oui ».' },
      { title: 'Révoquer', detail: 'Icône « Révoquer », puis « Oui ».' },
      { title: 'Inviter une autre personne', detail: 'Bouton « Nouvelle invitation ».' }
    ],
    consequences: [
      "Renvoyer envoie un nouvel e-mail avec un nouveau lien, valable 7 jours à partir de ce moment. L'ancien lien ne marche plus une fois le nouvel e-mail parti.",
      "Révoquer annule l'invitation : le lien ne fonctionne plus. Aucun e-mail n'est envoyé à la personne et l'action ne s'annule pas. Il faudra créer une nouvelle invitation."
    ],
    faq: [
      {
        q: "L'invitation est expirée, comment relancer ?",
        a: "Les boutons n'existent plus pour une invitation expirée. Créez une nouvelle invitation avec « Nouvelle invitation »."
      },
      {
        q: "Pourquoi n'y a-t-il aucune action sur certaines lignes ?",
        a: "Seules les invitations « En attente » dont la date n'est pas passée peuvent être renvoyées ou révoquées."
      },
      {
        q: "Où voir la personne une fois l'invitation acceptée ?",
        a: "Dans l'écran « Collaborateurs »."
      }
    ],
    permissions: {
      roles: ["Administrateur de l'agence"],
      note: 'Voir la liste demande « Voir les collaborateurs » ; renvoyer demande « Créer des collaborateurs » ; révoquer demande « Modifier les collaborateurs ».'
    },
    related: [
      { label: 'Tableau des invitations', helpId: 'administration.equipe.invitations.tableau' },
      { label: 'Inviter un collaborateur', helpId: 'administration.equipe.inviter' }
    ],
    keywords: ['invitation', 'renvoyer', 'révoquer', 'annuler', 'lien', 'relancer']
  },
  {
    id: 'administration.equipe.invitations.tableau',
    kind: 'table',
    title: 'Tableau des invitations',
    summary:
      "Chaque ligne est une invitation envoyée. Le tableau montre l'e-mail, le statut, la date d'envoi et la date d'expiration.",
    howToRead: {
      columns: [
        { key: 'email', label: 'Email', description: "L'adresse de la personne invitée." },
        { key: 'status', label: 'Statut', description: "Où en est l'invitation (voir les statuts ci-dessous)." },
        { key: 'invitedAt', label: "Date d'invitation", description: "Le jour où l'invitation a été créée." },
        {
          key: 'expiresAt',
          label: 'Expiration',
          description: 'Le dernier jour de validité du lien. Un renvoi repousse cette date de 7 jours.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Renvoyer » et « Révoquer », uniquement pour une invitation en attente et encore valable.'
        }
      ],
      statuses: [
        {
          value: 'PENDING',
          label: 'En attente',
          description: "La personne n'a pas encore accepté et le lien est valable."
        },
        { value: 'ACCEPTED', label: 'Acceptée', description: "La personne a rejoint l'agence." },
        { value: 'REVOKED', label: 'Révoquée', description: "L'invitation a été annulée : le lien ne marche plus." },
        {
          value: 'EXPIRED',
          label: 'Expirée',
          description:
            "La date limite est passée sans acceptation. Une invitation en attente dont la date est passée s'affiche « Expirée »."
        }
      ],
      notes: ["Le filtre « Date d'invitation » porte sur la colonne « Date d'invitation »."]
    },
    steps: [
      { title: 'Filtrer', detail: 'Par e-mail, statut ou date.' },
      { title: 'Agir', detail: 'Icônes « Renvoyer » ou « Révoquer » en bout de ligne, puis « Oui ».' }
    ],
    consequences: [
      '« Renvoyer » envoie un e-mail neuf et prolonge la validité de 7 jours.',
      '« Révoquer » est définitif : créez une nouvelle invitation pour réinviter la personne.',
      'Si le collaborateur qui avait invité est désactivé, ses invitations en attente passent en « Révoquée ».'
    ],
    faq: [
      {
        q: 'Que se passe-t-il si le renvoi échoue ?',
        a: "L'application affiche une erreur et l'ancien lien reste valable."
      },
      {
        q: 'Les invitations acceptées restent-elles dans la liste ?',
        a: 'Oui, avec le statut « Acceptée ».'
      },
      {
        q: 'Puis-je exporter la liste ?',
        a: "Oui, avec le bouton d'export du tableau."
      }
    ],
    permissions: {
      note: '« Créer des collaborateurs » pour renvoyer, « Modifier les collaborateurs » pour révoquer.'
    },
    related: [{ label: 'Invitations', helpId: 'administration.equipe.invitations' }],
    keywords: ['statut', 'expiration', 'renvoyer', 'révoquer', 'exporter']
  },

  // ------------------------------------------------------------------ Mon profil
  {
    id: 'administration.equipe.profil',
    kind: 'page',
    title: 'Mon profil',
    summary:
      "Cette page rappelle les informations de votre compte et vous permet de choisir la langue de l'application. Un lien vous mène aussi au changement de mot de passe.",
    purpose: 'Elle est personnelle : chacun voit son propre compte, quelle que soit son agence.',
    steps: [
      {
        title: 'Vérifier le compte',
        detail: 'Carte « Informations du compte » : e-mail, nom complet, date de création et de dernière mise à jour.'
      },
      { title: 'Choisir la langue', detail: 'Section « Langue » : Français, English ou العربية.' },
      {
        title: 'Changer le mot de passe',
        detail: 'Cliquez sur « Changer le mot de passe » : vous arrivez sur la page de mot de passe oublié.'
      }
    ],
    consequences: [
      "La langue choisie s'applique à l'interface et aux e-mails qui vous sont envoyés. Elle vous suit d'un appareil à l'autre.",
      'Le changement de mot de passe passe par un lien reçu par e-mail.'
    ],
    faq: [
      {
        q: 'Puis-je modifier mon nom ou mon e-mail ici ?',
        a: 'Non, ces informations sont en lecture seule.'
      },
      {
        q: 'Que signifie la mention « Email vérifié » ?',
        a: "Elle s'affiche quand votre adresse e-mail a été vérifiée."
      },
      {
        q: "Pourquoi suis-je « Utilisateur » alors que j'administre mon agence ?",
        a: "La mention « Administrateur » est réservée aux administrateurs de la plateforme. Vos droits dans l'agence dépendent de vos rôles."
      }
    ],
    permissions: { note: 'Tout utilisateur connecté peut ouvrir sa page de profil.' },
    related: [
      { label: 'Informations du compte', helpId: 'administration.equipe.profil.informations' },
      { label: 'Langue', helpId: 'administration.equipe.profil.langue' }
    ],
    keywords: ['profil', 'compte', 'langue', 'mot de passe', 'e-mail', 'avatar']
  },
  {
    id: 'administration.equipe.profil.informations',
    kind: 'section',
    title: 'Informations du compte',
    summary:
      'Cette carte montre votre e-mail, votre nom complet, la date de création de votre compte et celle de sa dernière mise à jour.',
    howToRead: {
      notes: [
        'En haut, une pastille indique « Administrateur » (administrateur de la plateforme) ou « Utilisateur ».',
        'La pastille « Email vérifié » apparaît quand votre adresse a été vérifiée.',
        'Les dates sont écrites en toutes lettres, dans la langue choisie.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi puis-je seulement lire ces informations ?',
        a: "Cet écran n'offre pas de modification."
      },
      {
        q: 'Que veut dire « — » à côté de « Nom complet » ?',
        a: "Aucun nom n'est enregistré sur votre compte."
      },
      {
        q: 'À quoi sert « Dernière mise à jour » ?',
        a: "C'est la date de la dernière modification de votre compte."
      }
    ],
    related: [{ label: 'Mon profil', helpId: 'administration.equipe.profil' }],
    keywords: ['compte', 'e-mail', 'nom', 'date de création']
  },
  {
    id: 'administration.equipe.profil.langue',
    kind: 'section',
    title: 'Langue',
    summary: "Choisissez la langue de l'application : Français, English ou العربية. Le choix s'applique tout de suite.",
    purpose:
      "La langue vaut pour l'interface et pour les e-mails que l'application vous envoie. Elle est enregistrée sur votre compte et vous suit d'un appareil à l'autre.",
    steps: [
      { title: 'Ouvrir la liste', detail: 'Cliquez sur la liste « Changer la langue ».' },
      { title: 'Choisir', detail: "Chaque langue s'écrit dans sa propre langue." }
    ],
    consequences: [
      "Avec l'arabe, toute la mise en page est inversée, de droite à gauche.",
      'Le choix est personnel : il ne change rien pour les autres collaborateurs.'
    ],
    faq: [
      {
        q: 'La langue ne change pas, que faire ?',
        a: 'Attendez la fin du chargement indiqué dans la liste, puis rechargez la page si besoin.'
      },
      {
        q: 'Les documents de mon agence changent-ils de langue ?',
        a: "L'écran ne le dit pas : il ne parle que de l'interface et de vos e-mails."
      },
      {
        q: 'Puis-je revenir au français ?',
        a: 'Oui, à tout moment, avec la même liste.'
      }
    ],
    related: [{ label: 'Mon profil', helpId: 'administration.equipe.profil' }],
    keywords: ['langue', 'français', 'anglais', 'arabe', 'traduction']
  }
];

export default entries;
