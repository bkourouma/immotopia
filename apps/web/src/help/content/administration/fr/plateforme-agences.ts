import type { HelpEntry } from '../../../types';

/** Zone « plateforme-agences » du module « administration » (fr). */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ liste
  {
    id: 'administration.plateforme-agences.liste',
    kind: 'page',
    title: 'Liste des agences de la plateforme',
    summary:
      'Retrouvez ici toutes les agences clientes de la plateforme, avec leur offre, leur consommation et leur dernière activité. C’est le point de départ pour créer une agence ou ouvrir sa fiche.',
    purpose:
      'Cet espace est réservé au super-administrateur de la plateforme. Il sert à suivre les agences clientes, repérer celles qui approchent de leur limite d’abonnement et ouvrir leur fiche pour agir.',
    steps: [
      { title: 'Créer une agence', detail: 'Cliquez sur « Nouvelle agence » : un panneau s’ouvre sur le côté.' },
      {
        title: 'Rechercher',
        detail: 'Tapez un nom, un identifiant, un e-mail ou une ville dans le champ de recherche.'
      },
      {
        title: 'Filtrer',
        detail: 'Utilisez les filtres « Statut » et « Proche de la limite » pour réduire la liste.'
      },
      { title: 'Ouvrir une fiche', detail: 'Cliquez sur l’icône en forme d’œil de la ligne.' },
      { title: 'Modifier les informations', detail: 'Cliquez sur l’icône en forme de crayon de la ligne.' },
      {
        title: 'Exporter',
        detail:
          'Le bouton d’export du tableau sort toutes les agences correspondant à vos filtres, pas seulement la page affichée.'
      }
    ],
    consequences: [
      'Consulter la liste ne modifie rien. La suspension, l’activation et l’abonnement se gèrent depuis la fiche de l’agence.',
      'Aucune agence ne peut être supprimée depuis cet écran.'
    ],
    faq: [
      {
        q: 'Que veut dire « Proche de la limite » ?',
        a: 'Ce filtre garde les agences dont au moins une capacité (lots, copropriétés, chantiers…) atteint 80 % ou plus de sa limite.'
      },
      {
        q: 'Pourquoi certaines colonnes affichent-elles un tiret ?',
        a: 'Le résumé d’abonnement de l’agence n’a pas pu être lu, ou l’agence n’a pas encore de consommation à afficher.'
      },
      {
        q: 'Où est passée la page « nouvelle agence » ?',
        a: 'L’ancien lien ouvre maintenant la liste avec le panneau de création déjà ouvert : c’est le même formulaire.'
      },
      {
        q: 'Je ne vois pas cet espace. Pourquoi ?',
        a: 'Il est réservé aux super-administrateurs de la plateforme. Un administrateur d’agence ne le voit pas.'
      }
    ],
    permissions: {
      roles: ['Super administrateur plateforme'],
      note: 'Écran réservé au super-administrateur de la plateforme.'
    },
    related: [
      { label: 'Comment lire le tableau des agences', helpId: 'administration.plateforme-agences.liste.tableau' },
      { label: 'Créer une agence', helpId: 'administration.plateforme-agences.creation.assistant' }
    ],
    keywords: ['agences', 'clients', 'plateforme', 'super administrateur', 'abonnement', 'nouvelle agence']
  },
  {
    id: 'administration.plateforme-agences.liste.tableau',
    kind: 'table',
    title: 'Tableau des agences',
    summary:
      'Une ligne par agence : son nom, son statut, ses packs, l’usage de ses lots et sa prochaine échéance. Les icônes de la dernière colonne ouvrent la fiche ou la modification.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Nom', description: 'Nom de l’agence, avec son identifiant court en dessous.' },
        { key: 'status', label: 'Statut', description: 'Situation de l’agence : Actif, Suspendu ou Inactif.' },
        {
          key: 'packs',
          label: 'Packs',
          description: 'Packs d’abonnement en vigueur. « Aucun » si l’agence n’en a pas.'
        },
        {
          key: 'lotsUsage',
          label: '% de lots utilisés',
          description:
            'Part des lots consommée par rapport à la limite. La barre passe à l’orange dès 80 % et au rouge à 100 %.'
        },
        {
          key: 'nextDue',
          label: 'Prochaine échéance',
          description: 'Date de la prochaine échéance d’abonnement de l’agence.'
        },
        { key: 'contactEmail', label: 'Email', description: 'E-mail de contact de l’agence.' },
        {
          key: 'lastActivityAt',
          label: 'Dernière activité',
          description: 'Date de la dernière activité enregistrée pour l’agence.'
        },
        { key: 'actions', label: 'Actions', description: 'Voir les détails (œil) ou Modifier (crayon).' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'L’agence fonctionne normalement.' },
        {
          value: 'SUSPENDED',
          label: 'Suspendu',
          description: 'L’agence est suspendue : ses collaborateurs ne peuvent plus utiliser l’application.'
        },
        { value: 'INACTIVE', label: 'Inactif', description: 'L’agence n’est pas active. Réactivez-la depuis sa fiche.' }
      ],
      notes: [
        'Le filtre « Statut » propose Actif et Suspendu. Une agence inactive reste visible sans filtre.',
        'Un tiret signifie que l’information n’est pas disponible.'
      ]
    },
    faq: [
      {
        q: 'Que contient l’export ?',
        a: 'Toutes les agences qui correspondent à vos filtres, avec leurs packs, le pourcentage de lots et la prochaine échéance.'
      },
      {
        q: 'Comment trouver une agence précise ?',
        a: 'Tapez son nom, son identifiant, son e-mail ou sa ville dans la recherche.'
      },
      {
        q: 'Que se passe-t-il quand je clique sur une ligne ?',
        a: 'Rien : utilisez l’icône en forme d’œil pour ouvrir la fiche de l’agence.'
      }
    ],
    related: [{ label: 'Ouvrir la fiche d’une agence', helpId: 'administration.plateforme-agences.detail' }],
    keywords: ['statut agence', 'limite', 'lots', 'packs', 'échéance']
  },

  // --------------------------------------------------------------- création
  {
    id: 'administration.plateforme-agences.creation',
    kind: 'page',
    title: 'Création d’une agence (ancien lien)',
    summary:
      'Ce lien ouvre la liste des agences avec le panneau « Nouvelle agence » déjà ouvert. Aucun formulaire n’existe à part : c’est le même panneau.',
    purpose: 'Il évite de casser les anciens liens vers la création d’une agence.',
    steps: [
      { title: 'Remplir le panneau', detail: 'Renseignez l’agence, son administrateur et ses packs.' },
      { title: 'Créer', detail: 'Cliquez sur « Créer l’agence » et transmettez le lien d’invitation affiché.' }
    ],
    faq: [
      {
        q: 'Pourquoi suis-je renvoyé vers la liste ?',
        a: 'Le formulaire de création vit dans un panneau de la liste : l’ancien lien y mène directement.'
      },
      { q: 'Dois-je mettre à jour mes favoris ?', a: 'Non, l’ancien lien continue de fonctionner.' },
      {
        q: 'Où trouver le détail du formulaire ?',
        a: 'Dans l’aide du panneau « Nouvelle agence », ouverte depuis son « ? ».'
      }
    ],
    related: [
      { label: 'Le panneau « Nouvelle agence »', helpId: 'administration.plateforme-agences.creation.assistant' }
    ],
    keywords: ['nouvelle agence', 'créer une agence']
  },
  {
    id: 'administration.plateforme-agences.creation.assistant',
    kind: 'section',
    title: 'Nouvelle agence',
    summary:
      'Ce panneau crée une agence avec son administrateur et son abonnement en une seule fois. Il faut un nom d’agence, le nom et l’e-mail de l’administrateur, et au moins un pack.',
    purpose:
      'En un clic, l’agence est prête : l’administrateur reçoit une invitation et l’agence démarre avec un mois d’essai gratuit.',
    steps: [
      {
        title: 'Identifier l’agence et son administrateur',
        detail: 'Renseignez « Nom de l’agence », « Nom de l’administrateur » et « E-mail de l’administrateur ».'
      },
      {
        title: 'Choisir les packs',
        detail:
          'Cliquez sur un ou plusieurs packs. « Opérateur intégré » exclut les autres packs, et Patrimoine Essentiel et Patrimoine Pro ne se cumulent pas.'
      },
      {
        title: 'Ajouter des extensions si besoin',
        detail: 'Lots, copropriétés, chantiers ou biens détenus supplémentaires, selon les packs choisis.'
      },
      {
        title: 'Choisir le cycle de facturation',
        detail: '« Mensuel » ou « Annuel (11 mois facturés) » : le 12e mois est offert.'
      },
      {
        title: 'Mise en route accompagnée',
        detail: 'Activez-la si l’agence la souhaite : ce sont des frais uniques.'
      },
      {
        title: 'Compléter si vous le souhaitez',
        detail: '« Plus d’options » : raison sociale, contact, adresse, site web, couleur de marque.'
      },
      { title: 'Créer', detail: 'Cliquez sur « Créer l’agence ».' }
    ],
    consequences: [
      'L’agence démarre avec un essai gratuit d’un mois (30 jours), automatique et impossible à désactiver. Vous pourrez le prolonger depuis l’onglet Abonnement.',
      'L’administrateur reçoit un e-mail d’invitation. S’il n’a pas encore de compte, il en obtient un en acceptant l’invitation. Aucun mot de passe n’est affiché ni envoyé.',
      'La création est enregistrée dans le journal de la plateforme, à votre nom.',
      'Un double clic ne crée pas deux agences. En revanche, recréer la même agence avec le même administrateur peu après est refusé : l’invitation précédente reste valable.'
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Créer l’agence » est-il grisé ?',
        a: 'Aucun pack n’est choisi. Cliquez sur au moins un pack.'
      },
      {
        q: 'Pourquoi certaines extensions n’apparaissent-elles pas ?',
        a: 'Chaque extension n’est proposée qu’avec certains packs. Choisissez d’abord le pack concerné.'
      },
      {
        q: 'Que signifie le message sur l’Opérateur intégré ?',
        a: 'Pour le même volume, l’Opérateur intégré revient moins cher que vos packs : il est proposé à titre de comparaison.'
      },
      {
        q: 'Le prix affiché est-il définitif ?',
        a: 'Le récapitulatif est un calcul en direct, en FCFA hors taxes, fourni par la plateforme. Il se met à jour à chaque changement.'
      }
    ],
    permissions: {
      roles: ['Super administrateur plateforme']
    },
    related: [
      { label: 'Lire le récapitulatif chiffré', helpId: 'administration.plateforme-agences.creation.recapitulatif' },
      { label: 'Après la création', helpId: 'administration.plateforme-agences.creation.resultat' }
    ],
    keywords: ['nouvelle agence', 'tiroir', 'assistant', 'packs', 'essai gratuit', 'invitation administrateur']
  },
  {
    id: 'administration.plateforme-agences.creation.recapitulatif',
    kind: 'section',
    title: 'Récapitulatif chiffré',
    summary:
      'Il détaille, en FCFA hors taxes, ce que coûtera l’abonnement choisi. Il se recalcule dès que vous changez un pack ou une extension.',
    howToRead: {
      notes: [
        'Chaque ligne est un pack, une extension ou la mise en route, avec sa quantité.',
        '« Total HT mensuel » et « Total HT annuel (11 mois) » sont les deux totaux. Avec le cycle annuel, 11 mensualités sont facturées.',
        'La mise en route accompagnée s’ajoute en frais uniques si vous l’avez activée.',
        'Si l’Opérateur intégré revient moins cher pour le même volume, un message l’indique.'
      ]
    },
    consequences: ['Le récapitulatif n’engage rien : seule la création de l’agence enregistre l’abonnement.'],
    faq: [
      {
        q: 'Pourquoi le récapitulatif est-il vide ?',
        a: 'Aucun pack n’est choisi. Cliquez sur un pack pour voir le calcul.'
      },
      {
        q: 'Pourquoi indique-t-il « Calcul en cours… » ?',
        a: 'Le calcul se met à jour quelques instants après chaque changement.'
      },
      { q: 'Le mois d’essai est-il facturé ?', a: 'Non : l’agence démarre avec un mois d’essai gratuit.' }
    ],
    keywords: ['prix', 'total HT', 'tarif', 'FCFA', 'estimation']
  },
  {
    id: 'administration.plateforme-agences.creation.resultat',
    kind: 'section',
    title: 'Agence créée : identifiants à transmettre',
    summary:
      'Une fois l’agence créée, le panneau affiche l’offre retenue, l’administrateur et le lien d’invitation. Ce lien est la seule chose à transmettre à l’administrateur.',
    howToRead: {
      notes: [
        '« Modules et offre » : les modules ouverts, les packs, le cycle et la date de fin d’essai.',
        '« Administrateur » : son nom et son e-mail. L’étiquette « Compte existant » signale qu’il avait déjà un compte.',
        '« Lien d’invitation » : copiable. Un message indique si l’e-mail d’invitation est bien parti.',
        '« Agence déjà créée » signifie que rien n’a été recréé et que l’invitation précédente reste valable.'
      ]
    },
    steps: [
      { title: 'Vérifier l’e-mail', detail: 'Regardez si « E-mail d’invitation envoyé. » est affiché.' },
      {
        title: 'Copier le lien',
        detail:
          'Cliquez sur « Copier » et transmettez-le par un autre canal si l’e-mail n’est pas parti ou s’il est resté sans réponse.'
      },
      { title: 'Renvoyer si besoin', detail: '« Renvoyer l’invitation » génère un nouveau lien.' },
      {
        title: 'Continuer',
        detail: '« Ouvrir la fiche » ouvre l’agence ; « Créer une autre agence » repart d’un formulaire vide.'
      }
    ],
    consequences: [
      'Renvoyer l’invitation produit un nouveau lien : l’ancien cesse de fonctionner.',
      'Un e-mail peut arriver en spam ou à la mauvaise adresse : le lien reste donc affiché et copiable même quand l’e-mail est parti.',
      'Si l’e-mail n’a pas pu être envoyé, l’agence est quand même créée : transmettez le lien vous-même.'
    ],
    faq: [
      {
        q: 'Le lien a disparu, que faire ?',
        a: 'Pour une agence déjà créée, le lien déjà transmis reste valable. Cliquez sur « Renvoyer l’invitation » pour en obtenir un nouveau.'
      },
      { q: 'Combien de temps le lien est-il valable ?', a: 'Une invitation est en principe valable 7 jours.' },
      {
        q: 'L’administrateur recevra-t-il un mot de passe ?',
        a: 'Non. Il crée ou confirme son accès en acceptant l’invitation.'
      }
    ],
    related: [
      {
        label: 'Gérer les collaborateurs de l’agence',
        helpId: 'administration.plateforme-agences.detail.collaborateurs'
      }
    ],
    keywords: ['lien invitation', 'copier le lien', 'administrateur', 'identifiants', 'renvoyer']
  },

  // ----------------------------------------------------------------- détail
  {
    id: 'administration.plateforme-agences.detail',
    kind: 'page',
    title: 'Fiche d’une agence',
    summary:
      'La fiche réunit tout ce que la plateforme sait d’une agence : ses informations, ses collaborateurs, son abonnement, ses factures et son activité. Vous pouvez aussi la suspendre ou la réactiver.',
    purpose:
      'Le super-administrateur y suit et corrige la vie d’une agence cliente. Chaque onglet est un domaine : le choix de l’onglet se retrouve dans l’adresse de la page, donc partageable.',
    howToRead: {
      notes: [
        'Onglets : Vue d’ensemble, Collaborateurs, Abonnement, Factures, Activité, Statistiques, Export des données.',
        'L’étiquette à droite du titre donne le statut : Actif, Suspendu ou Inactif.'
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'L’agence fonctionne. Le bouton « Suspendre » est proposé.' },
        { value: 'SUSPENDED', label: 'Suspendu', description: 'Accès coupé. Le bouton « Activer » est proposé.' },
        { value: 'INACTIVE', label: 'Inactif', description: 'Agence non active. Le bouton « Activer » est proposé.' }
      ]
    },
    steps: [
      { title: 'Choisir un onglet', detail: 'Cliquez sur l’onglet voulu sous le titre.' },
      { title: 'Modifier les informations', detail: 'Bouton « Modifier » en haut à droite.' },
      { title: 'Suspendre', detail: '« Suspendre », puis confirmez dans la fenêtre.' },
      { title: 'Réactiver', detail: '« Activer », puis confirmez.' }
    ],
    consequences: [
      'Suspendre une agence déconnecte tous ses collaborateurs, qui perdent l’accès jusqu’à la réactivation. Leurs données sont conservées.',
      'Les portails propriétaires et copropriétaires de l’agence refusent aussi l’accès tant qu’elle est suspendue.',
      'Aucun e-mail n’est envoyé à l’agence ni à ses collaborateurs : prévenez-les vous-même.',
      'La suspension et la réactivation sont enregistrées dans le journal de la plateforme, à votre nom.',
      'Activer ne reconnecte personne : chaque collaborateur doit se reconnecter.',
      'Aucune suppression d’agence n’est possible depuis cette fiche.'
    ],
    faq: [
      { q: 'Suspendre est-il définitif ?', a: 'Non : « Activer » rétablit l’accès. Les données ne sont pas effacées.' },
      {
        q: 'Suspendre l’agence change-t-il son abonnement ?',
        a: 'Non : la suspension ne modifie pas l’abonnement, qui se gère séparément dans l’onglet Abonnement.'
      },
      {
        q: 'Comment mettre l’agence en lecture seule sans la suspendre ?',
        a: 'Dans l’onglet Abonnement, bouton « Passer en lecture seule ».'
      },
      {
        q: 'Que devient l’onglet choisi si je recharge la page ?',
        a: 'Il reste affiché : l’onglet fait partie de l’adresse de la page, que vous pouvez aussi partager.'
      }
    ],
    permissions: {
      roles: ['Super administrateur plateforme']
    },
    related: [
      { label: 'Onglet Abonnement', helpId: 'administration.plateforme-agences.detail.abonnement' },
      { label: 'Onglet Factures', helpId: 'administration.plateforme-agences.detail.factures' },
      { label: 'Modifier l’agence', helpId: 'administration.plateforme-agences.modification' }
    ],
    keywords: ['suspendre', 'réactiver', 'activer', 'fiche agence', 'statut agence']
  },
  {
    id: 'administration.plateforme-agences.detail.apercu',
    kind: 'section',
    title: 'Vue d’ensemble de l’agence',
    summary:
      'Cet onglet affiche les informations d’identité de l’agence : logo, couleur de marque, coordonnées et statut.',
    howToRead: {
      notes: [
        'Champs : nom, nom légal, e-mail, téléphone, ville, pays, site web et statut. Un tiret signifie « non renseigné ».',
        'La lecture est seule : pour corriger une information, utilisez « Modifier ».'
      ]
    },
    faq: [
      { q: 'Comment changer le logo ?', a: 'Via « Modifier », bouton « Téléverser un logo ».' },
      {
        q: 'Où est l’adresse postale ?',
        a: 'Elle ne s’affiche pas ici ; elle se lit et se corrige dans « Modifier ».'
      },
      { q: 'Où voir la couleur de marque ?', a: 'Elle s’affiche à côté du logo quand elle est renseignée.' }
    ],
    related: [{ label: 'Modifier l’agence', helpId: 'administration.plateforme-agences.modification' }],
    keywords: ['informations', 'coordonnées', 'logo', 'identité']
  },
  {
    id: 'administration.plateforme-agences.detail.collaborateurs',
    kind: 'section',
    title: 'Onglet Collaborateurs',
    summary:
      'La liste des personnes qui ont accès à l’agence, avec leur rôle et leur dernière connexion. Vous pouvez en inviter, ouvrir leur fiche, les désactiver ou les réactiver.',
    steps: [
      { title: 'Inviter', detail: 'Bouton « Inviter » : ouvre le formulaire d’invitation.' },
      { title: 'Chercher ou filtrer', detail: 'Par nom ou e-mail, par statut ou par rôle.' },
      { title: 'Ouvrir la fiche', detail: 'Icône en forme d’œil.' },
      {
        title: 'Désactiver ou activer',
        detail: 'Icône suivante de la ligne : elle agit tout de suite, sans fenêtre de confirmation.'
      }
    ],
    consequences: [
      'Désactiver un collaborateur ferme toutes ses sessions et annule les invitations en attente qu’il avait envoyées. Il garde son compte et peut être réactivé.',
      'On ne peut pas désactiver le dernier administrateur actif d’une agence, ni son propre compte.',
      'La désactivation et la réactivation sont enregistrées dans le journal, à votre nom.',
      'Aucun e-mail n’est envoyé au collaborateur quand vous le désactivez.'
    ],
    faq: [
      {
        q: 'Que signifie « Invitation en attente » ?',
        a: 'La personne a été invitée mais n’a pas encore accepté l’invitation.'
      },
      {
        q: 'Pourquoi la désactivation est-elle refusée ?',
        a: 'C’est le dernier administrateur actif de l’agence. Donnez d’abord le rôle d’administrateur à quelqu’un d’autre.'
      },
      {
        q: 'Où voir toutes les actions possibles sur une personne ?',
        a: 'Dans sa fiche : rôles, mot de passe, sessions et statut.'
      }
    ],
    related: [
      { label: 'Fiche d’un collaborateur', helpId: 'administration.plateforme-agences.collaborateur' },
      { label: 'Inviter un collaborateur', helpId: 'administration.plateforme-agences.invitation' }
    ],
    keywords: ['équipe', 'utilisateurs', 'membres', 'désactiver', 'invitation']
  },
  {
    id: 'administration.plateforme-agences.detail.collaborateurs.tableau',
    kind: 'table',
    title: 'Tableau des collaborateurs de l’agence',
    summary: 'Une ligne par collaborateur : son nom, ses rôles, son statut et sa dernière connexion.',
    howToRead: {
      columns: [
        {
          key: 'user',
          label: 'Utilisateur',
          description: 'Nom complet, ou e-mail à défaut, avec l’adresse en dessous.'
        },
        { key: 'roles', label: 'Rôles', description: 'Rôles de la personne dans cette agence.' },
        { key: 'status', label: 'Statut', description: 'Actif, Invitation en attente ou Désactivé.' },
        {
          key: 'lastLoginAt',
          label: 'Dernière connexion',
          description: 'Date de la dernière connexion, ou « Jamais ».'
        },
        { key: 'actions', label: 'Actions', description: 'Voir les détails, puis Désactiver ou Activer.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'La personne peut utiliser l’agence.' },
        {
          value: 'PENDING_INVITE',
          label: 'Invitation en attente',
          description: 'Invitation envoyée, pas encore acceptée.'
        },
        { value: 'DISABLED', label: 'Désactivé', description: 'Accès retiré à cette agence.' }
      ]
    },
    faq: [
      { q: 'Que contient l’export ?', a: 'Tous les collaborateurs correspondant à vos filtres.' },
      { q: 'Comment filtrer par rôle ?', a: 'Utilisez le filtre « Rôle » de la barre de recherche.' },
      {
        q: 'Le nombre entre parenthèses du titre, que compte-t-il ?',
        a: 'Le total des collaborateurs correspondant à votre recherche.'
      }
    ],
    keywords: ['statut collaborateur', 'rôle', 'dernière connexion']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement',
    kind: 'section',
    title: 'Onglet Abonnement',
    summary:
      'Il montre et pilote l’abonnement de l’agence : packs, consommation, dérogations, modules ouverts et demandes d’extension. C’est ici que vous prolongez l’essai ou passez l’agence en lecture seule.',
    purpose:
      'L’abonnement de l’agence est la somme de ses packs et extensions. Les modules ouverts en sont déduits automatiquement.',
    steps: [
      { title: 'Lire le résumé', detail: 'Statut, phase, période en cours, fin d’essai et politique de dépassement.' },
      { title: 'Contrôler la consommation', detail: 'Les barres comparent chaque capacité à sa limite.' },
      { title: 'Ajouter ou retirer un pack', detail: 'Bloc « Packs et extensions ».' },
      { title: 'Accorder une dérogation', detail: 'Bouton « Accorder une dérogation » du bloc « Consommation ».' },
      { title: 'Traiter les demandes', detail: 'Ouvrez « Demandes d’extension » en bas de l’onglet.' }
    ],
    consequences: [
      'Les actions de cet onglet sont enregistrées dans le journal de la plateforme, à votre nom.',
      'Aucune action de cet onglet n’envoie d’e-mail à l’agence. Les factures sont gérées dans l’onglet Factures.'
    ],
    faq: [
      {
        q: 'Pourquoi la politique de dépassement ne bloque-t-elle rien ?',
        a: 'Quand les vérifications d’abonnement sont inactives (message orange), aucun dépassement n’est bloqué, quelle que soit la politique choisie.'
      },
      {
        q: 'Où sont passés les modules ?',
        a: 'Ils sont déduits des packs et affichés dans « Modules inclus », en lecture seule.'
      },
      {
        q: 'Que se passe-t-il quand l’agence n’a pas d’abonnement ?',
        a: 'L’onglet l’indique : « Cette agence n’a pas encore d’abonnement. »'
      }
    ],
    permissions: { roles: ['Super administrateur plateforme'] },
    related: [
      { label: 'Résumé de l’abonnement', helpId: 'administration.plateforme-agences.detail.abonnement.resume' },
      { label: 'Motifs demandés', helpId: 'administration.plateforme-agences.detail.abonnement.motifs' }
    ],
    keywords: ['abonnement', 'packs', 'essai', 'lecture seule', 'dépassement', 'quota']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.resume',
    kind: 'section',
    title: 'Résumé de l’abonnement',
    summary:
      'Il donne le statut, la phase, la période en cours, la fin d’essai et les réglages de l’abonnement. La politique de dépassement se change ici d’un clic.',
    howToRead: {
      statuses: [
        { value: 'TRIALING', label: 'Essai', description: 'Période d’essai gratuite en cours.' },
        { value: 'ACTIVE', label: 'Actif', description: 'Abonnement en cours.' },
        {
          value: 'PAST_DUE',
          label: 'Impayé',
          description: 'Une échéance n’est pas réglée. Les jours de grâce courent.'
        },
        { value: 'CANCELED', label: 'Annulé', description: 'Abonnement annulé.' },
        { value: 'SUSPENDED', label: 'Suspendu', description: 'Abonnement suspendu.' }
      ],
      notes: [
        'La « Phase » est l’état de fonctionnement : Aucun abonnement, Essai, Actif, Grâce ou Lecture seule.',
        '« Jours de grâce » : délai laissé après un impayé avant la lecture seule (affiché ici, non modifiable).',
        '« Politique de dépassement » : Bloquer le dépassement, Facturer le dépassement ou Avertir seulement. Le changement est immédiat.',
        '« Remise de combinaison » : remise en pourcentage liée à la combinaison de packs.'
      ]
    },
    steps: [
      {
        title: 'Prolonger l’essai',
        detail:
          'Pendant l’essai, cliquez sur « Prolonger », saisissez un nombre de jours (15 par défaut, de 1 à 365) puis confirmez.'
      },
      {
        title: 'Changer la politique de dépassement',
        detail: 'Choisissez une valeur dans la liste : elle est enregistrée aussitôt.'
      },
      { title: 'Passer en lecture seule', detail: 'Bouton « Passer en lecture seule » : un motif est exigé.' },
      { title: 'Lever la lecture seule', detail: 'Bouton « Lever la lecture seule », puis confirmez.' }
    ],
    consequences: [
      'Prolonger l’essai repousse la fin d’essai du nombre de jours saisi, et la fin de la période en cours avec elle.',
      'La lecture seule manuelle bloque les écritures de l’agence jusqu’à ce que vous la leviez vous-même : ni un paiement ni la tâche planifiée ne la lèvent. Portails, paiements et factures restent accessibles.',
      'Le motif de la lecture seule reste affiché sur la fiche et figure dans le journal. Lever la mesure est aussi journalisé.',
      'Le changement de politique et la prolongation d’essai sont enregistrés dans le journal.',
      'Aucun e-mail n’est envoyé à l’agence par ces actions.'
    ],
    faq: [
      {
        q: 'Quelle différence entre lecture seule manuelle et lecture seule d’impayé ?',
        a: 'La manuelle est décidée par vous et ne se lève que par vous. L’impayé suit le retard de paiement.'
      },
      { q: 'Pourquoi « Prolonger » n’apparaît-il pas ?', a: 'Il n’est proposé que pendant l’essai.' },
      {
        q: 'Pourquoi un message orange « Vérifications d’abonnement inactives » ?',
        a: 'La plateforme n’applique pas encore les limites : les modules non souscrits restent accessibles et rien n’est bloqué.'
      }
    ],
    related: [{ label: 'Motifs demandés', helpId: 'administration.plateforme-agences.detail.abonnement.motifs' }],
    keywords: ['statut abonnement', 'phase', 'essai', 'grâce', 'impayé', 'lecture seule', 'politique de dépassement']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.consommation',
    kind: 'section',
    title: 'Consommation',
    summary:
      'Chaque barre compare ce que l’agence utilise à sa limite : lots, copropriétés, chantiers, biens détenus, actifs, photos d’inventaire et signatures du mois.',
    howToRead: {
      notes: [
        'La mention « 12 / 50 » veut dire 12 utilisés pour une limite de 50.',
        'La barre passe à l’orange dès 80 % et au rouge à 100 %.',
        'Si l’agence dépasse sa limite, « X au-delà du plafond » s’affiche sous la barre.',
        'Photos d’inventaire analysées et signatures électroniques se comptent par mois.'
      ]
    },
    steps: [
      {
        title: 'Accorder une dérogation',
        detail:
          'Cliquez sur « Accorder une dérogation », choisissez la capacité, la quantité (négative pour retirer), la raison et, si vous voulez, une date d’expiration.'
      }
    ],
    consequences: [
      'Une dérogation ajoute (ou retire) de la capacité sans changer les packs. Elle est enregistrée dans le journal avec sa raison.',
      'La raison est obligatoire.'
    ],
    faq: [
      {
        q: 'Une barre rouge bloque-t-elle l’agence ?',
        a: 'Cela dépend de la politique de dépassement et du mode de vérification de la plateforme. Voir le résumé de l’abonnement.'
      },
      {
        q: 'Une dérogation peut-elle s’arrêter seule ?',
        a: 'Oui, si vous renseignez « Expire le ». Sinon elle reste jusqu’à sa révocation.'
      },
      { q: 'Peut-on retirer de la capacité ?', a: 'Oui : saisissez une quantité négative.' }
    ],
    related: [
      { label: 'Tableau des dérogations', helpId: 'administration.plateforme-agences.detail.abonnement.derogations' }
    ],
    keywords: ['consommation', 'quota', 'capacité', 'plafond', 'lots']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.packs',
    kind: 'table',
    title: 'Packs et extensions',
    summary:
      'La liste des packs, extensions et mises en route de l’agence, avec leur prix mensuel figé. Vous pouvez en ajouter, modifier la remise ou le prix, changer de palier ou retirer.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Élément', description: 'Nom du pack, de l’extension ou de la mise en route.' },
        { key: 'quantity', label: 'Quantité', description: 'Nombre d’unités souscrites.' },
        {
          key: 'price',
          label: 'Prix mensuel figé',
          description: 'Quantité multipliée par le prix mensuel hors taxes de l’unité, après remise éventuelle.'
        },
        { key: 'period', label: 'Début / fin', description: 'Date de début, et date de fin ou « sans fin ».' },
        { key: 'status', label: 'Statut', description: 'Actif, Programmé ou Terminé.' },
        {
          key: 'actions',
          label: 'Actions',
          description: 'Modifier, changer de palier, retirer à l’échéance ou immédiatement.'
        }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Élément en vigueur.' },
        { value: 'SCHEDULED', label: 'Programmé', description: 'Élément qui commencera plus tard.' },
        { value: 'ENDED', label: 'Terminé', description: 'Élément arrêté : aucune action possible.' }
      ]
    },
    steps: [
      { title: 'Ajouter', detail: 'Bouton « Ajouter » : choisissez l’offre, la quantité et une remise éventuelle.' },
      {
        title: 'Modifier le prix',
        detail: '« Modifier » : remise en pourcentage ou prix mensuel figé hors taxes par unité.'
      },
      {
        title: 'Changer de palier Patrimoine',
        detail: '« Passer au Pro » ou « Passer à l’Essentiel » sur les packs Patrimoine.'
      },
      {
        title: 'Retirer à l’échéance',
        detail: 'L’élément reste actif jusqu’à la fin de la période en cours, sans remboursement.'
      },
      {
        title: 'Retirer immédiatement',
        detail: 'Un motif est exigé. L’élément s’arrête tout de suite, sans remboursement.'
      }
    ],
    consequences: [
      'Une modification de remise ou de prix prend effet sur la prochaine facture, sans prorata. Le motif est facultatif et figure dans le journal.',
      'Passer à un palier supérieur est immédiat, au prorata de la période. Passer à un palier inférieur est programmé à l’échéance, sans prorata. Pendant l’essai, le changement est immédiat et sans prorata.',
      'Un retrait immédiat n’est pas remboursé. Retirer un pack met à jour les modules ouverts de l’agence.',
      'L’ajout et le retrait sont enregistrés dans le journal de la plateforme.'
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas ajouter un pack ?',
        a: 'L’agence l’a déjà, ou il est incompatible : Patrimoine Essentiel et Pro ne se cumulent pas.'
      },
      { q: 'Pourquoi « Retirer à l’échéance » manque-t-il ?', a: 'La fin de l’élément est déjà programmée.' },
      { q: 'Pourquoi certaines extensions manquent-elles ?', a: 'Une extension n’est vendable qu’avec certains packs.' }
    ],
    related: [{ label: 'Motifs demandés', helpId: 'administration.plateforme-agences.detail.abonnement.motifs' }],
    keywords: ['pack', 'extension', 'remise', 'prix figé', 'retirer', 'palier', 'patrimoine']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.derogations',
    kind: 'table',
    title: 'Dérogations de capacité',
    summary:
      'Les ajouts ou retraits de capacité accordés à la main à l’agence, avec leur raison et leur date d’expiration.',
    howToRead: {
      columns: [
        {
          key: 'capacityKey',
          label: 'Capacité',
          description: 'Capacité concernée : lots, copropriétés, chantiers, etc.'
        },
        { key: 'delta', label: 'Quantité', description: 'Quantité ajoutée, ou retirée si elle est négative.' },
        { key: 'reason', label: 'Raison', description: 'Raison saisie lors de l’octroi.' },
        { key: 'expiresAt', label: 'Expire le', description: 'Date d’expiration, ou « sans limite ».' },
        { key: 'status', label: 'Statut', description: 'Actif, Expiré ou Révoqué.' },
        { key: 'actions', label: 'Actions', description: 'Révoquer une dérogation encore active.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'La dérogation compte dans la capacité.' },
        { value: 'EXPIRED', label: 'Expiré', description: 'La date d’expiration est dépassée.' },
        { value: 'REVOKED', label: 'Révoqué', description: 'Vous l’avez annulée.' }
      ]
    },
    consequences: [
      'Révoquer demande une confirmation et est enregistré dans le journal. La capacité revient à celle des packs.'
    ],
    faq: [
      { q: 'Peut-on rétablir une dérogation révoquée ?', a: 'Non : accordez-en une nouvelle.' },
      {
        q: 'Où voit-on la raison complète ?',
        a: 'Dans la colonne « Raison » et dans la fenêtre de confirmation de révocation.'
      },
      {
        q: 'Que se passe-t-il à l’expiration ?',
        a: 'Elle n’est plus comptée ; la ligne reste visible avec le statut « Expiré ».'
      }
    ],
    keywords: ['dérogation', 'geste commercial', 'capacité', 'révoquer']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.modules',
    kind: 'section',
    title: 'Modules inclus',
    summary:
      'Les modules de l’application (Agence, Syndic, Promoteur, Patrimoine) et leur niveau d’accès, déduits des packs de l’agence.',
    howToRead: {
      statuses: [
        { value: 'FULL', label: 'Ouvert', description: 'Le module est pleinement utilisable.' },
        { value: 'READ_ONLY', label: 'Lecture seule', description: 'L’agence peut consulter, pas modifier.' },
        { value: 'NONE', label: 'Fermé', description: 'Le module n’est pas accessible.' }
      ],
      notes: ['Cette liste est en lecture seule : pour ouvrir un module, ajoutez le pack correspondant.']
    },
    faq: [
      { q: 'Comment ouvrir un module ?', a: 'Ajoutez le pack qui le contient dans « Packs et extensions ».' },
      {
        q: 'Pourquoi un module est-il ouvert alors qu’aucun pack ne le contient ?',
        a: 'Quand les vérifications d’abonnement sont inactives, tous les modules restent accessibles.'
      },
      { q: 'Que signifie « Lecture seule » ici ?', a: 'Le niveau d’accès au module est limité à la consultation.' }
    ],
    keywords: ['modules', 'accès', 'agence', 'syndic', 'promoteur', 'patrimoine']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.demandes',
    kind: 'section',
    title: 'Demandes d’extension',
    summary:
      'Les demandes que l’agence a faites pour augmenter sa capacité ou ajouter une offre. Vous les marquez traitées ou refusées.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: 'Date de la demande.' },
        { key: 'by', label: 'Demandeur', description: 'Personne qui a fait la demande.' },
        { key: 'offer', label: 'Offre', description: 'Offre demandée, avec la quantité.' },
        { key: 'message', label: 'Message', description: 'Texte saisi par le demandeur.' },
        { key: 'status', label: 'Statut', description: 'Ouverte, Traitée ou Refusée.' },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Marquer traitée » ou « Refuser », tant que la demande est ouverte.'
        }
      ],
      statuses: [
        { value: 'OPEN', label: 'Ouverte', description: 'En attente de votre décision.' },
        { value: 'HANDLED', label: 'Traitée', description: 'Vous l’avez marquée traitée.' },
        { value: 'DECLINED', label: 'Refusée', description: 'Vous l’avez refusée.' }
      ]
    },
    consequences: [
      'Marquer traitée ou refuser ne fait que clore la demande : l’abonnement n’est pas modifié. Pour accorder l’extension, ajoutez-la vous-même dans « Packs et extensions ».',
      'La décision est enregistrée dans le journal. Une demande close ne peut plus être rouverte.'
    ],
    faq: [
      { q: 'Le demandeur est-il prévenu ?', a: 'Aucun e-mail n’est envoyé par cette action.' },
      { q: 'Comment accorder la demande ?', a: 'Ajoutez l’offre demandée, puis marquez la demande « traitée ».' },
      { q: 'Où ouvrir cette section ?', a: 'En bas de l’onglet : cliquez sur « Demandes d’extension ».' }
    ],
    keywords: ['demande', 'extension', 'traiter', 'refuser']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.apercu-facture',
    kind: 'section',
    title: 'Prochaine facture (aperçu)',
    summary:
      'Un aperçu de la prochaine facture d’abonnement de l’agence : période, lignes, total hors taxes, TVA et total TTC.',
    howToRead: {
      notes: [
        'Les montants sont en FCFA.',
        'L’aperçu ne crée aucune facture : pour en produire une, utilisez « Générer une facture » dans l’onglet Factures.',
        '« Aperçu indisponible » s’affiche si le calcul n’a pas pu être fait.'
      ]
    },
    faq: [
      { q: 'L’aperçu est-il envoyé à l’agence ?', a: 'Non, il n’est visible que par vous.' },
      {
        q: 'Pourquoi le total change-t-il après une modification de pack ?',
        a: 'L’aperçu reflète l’abonnement tel qu’il est au moment où vous ouvrez la section.'
      },
      { q: 'Où générer la vraie facture ?', a: 'Dans l’onglet Factures.' }
    ],
    related: [{ label: 'Onglet Factures', helpId: 'administration.plateforme-agences.detail.factures' }],
    keywords: ['aperçu', 'facture à venir', 'TVA', 'TTC']
  },
  {
    id: 'administration.plateforme-agences.detail.abonnement.motifs',
    kind: 'section',
    title: 'Fenêtres qui demandent un motif',
    summary:
      'Certaines actions sensibles demandent de saisir un motif avant de confirmer. Le bouton de confirmation reste grisé tant que le motif est vide.',
    howToRead: {
      notes: [
        '« Retirer immédiatement » : motif obligatoire.',
        '« Passer en lecture seule » : motif obligatoire, d’au moins 3 caractères.',
        '« Modifier » une remise ou un prix : motif facultatif.',
        'Accorder une dérogation, émettre un avoir et mettre en lecture seule depuis une facture exigent aussi une raison, dans leur propre fenêtre.'
      ]
    },
    consequences: [
      'Le motif est enregistré dans le journal de la plateforme avec votre nom et la date. Il n’est pas envoyé à l’agence.',
      'Pour la lecture seule manuelle, le motif est aussi affiché sur la fiche de l’agence.',
      'Un motif ne peut pas être modifié après coup.'
    ],
    faq: [
      {
        q: 'Pourquoi le bouton est-il grisé ?',
        a: 'Le motif est obligatoire : saisissez-le pour activer la confirmation.'
      },
      {
        q: 'Quel motif écrire ?',
        a: 'Une phrase claire, par exemple « Geste commercial » ou « Impayé de septembre ».'
      },
      {
        q: 'L’agence voit-elle le motif ?',
        a: 'Non pour le retrait et la remise. Le motif d’une lecture seule manuelle est affiché sur la fiche, côté plateforme.'
      }
    ],
    keywords: ['motif', 'raison', 'justification', 'journal', 'confirmation']
  },
  {
    id: 'administration.plateforme-agences.detail.factures',
    kind: 'section',
    title: 'Onglet Factures',
    summary:
      'Les factures d’abonnement émises par la plateforme à l’agence. Vous pouvez en générer, les émettre, enregistrer un paiement, éditer un avoir ou télécharger le PDF.',
    steps: [
      {
        title: 'Générer une facture',
        detail: 'Bouton « Générer une facture » : période suivante, ou dépassement mensuel.'
      },
      { title: 'Émettre', detail: 'Sur un brouillon, « Émettre » donne le numéro définitif et envoie la facture.' },
      {
        title: 'Enregistrer un paiement',
        detail: '« Marquer payée » : mode de règlement, date, référence, justificatif.'
      },
      { title: 'Corriger', detail: '« Avoir » annule une facture émise.' },
      { title: 'Télécharger', detail: '« PDF », ou « Traduction arabe » pour la version traduite.' }
    ],
    consequences: [
      'Émettre une facture l’envoie par e-mail, PDF joint, aux administrateurs actifs de l’agence ; à défaut, à l’e-mail de contact de l’agence.',
      'Toutes ces actions sont enregistrées dans le journal de la plateforme.'
    ],
    faq: [
      {
        q: 'Où ouvrir le détail d’une facture ?',
        a: 'Cliquez sur son numéro : un panneau montre les lignes, le règlement et les paiements en ligne.'
      },
      {
        q: 'Que signifie « Rien à facturer pour cette période » ?',
        a: 'Aucune ligne n’est à facturer pour la période demandée.'
      },
      {
        q: 'Que signifie « Cette facture existe déjà » ?',
        a: 'La facture de cette période a déjà été créée : rien n’est dupliqué.'
      }
    ],
    permissions: { roles: ['Super administrateur plateforme'] },
    related: [{ label: 'Tableau des factures', helpId: 'administration.plateforme-agences.detail.factures.tableau' }],
    keywords: ['factures', 'facturation', 'abonnement', 'émettre', 'avoir', 'paiement']
  },
  {
    id: 'administration.plateforme-agences.detail.factures.tableau',
    kind: 'table',
    title: 'Tableau des factures de l’agence',
    summary: 'Une ligne par facture ou avoir, avec sa nature, sa période, son échéance, son montant TTC et son statut.',
    howToRead: {
      columns: [
        {
          key: 'number',
          label: 'Numéro',
          description: 'Numéro de facture, ou « Brouillon » avant l’émission. Cliquez pour ouvrir le détail.'
        },
        { key: 'nature', label: 'Nature', description: 'Période, Dépassement ou Avoir.' },
        { key: 'period', label: 'Période', description: 'Période couverte par la facture.' },
        { key: 'due', label: 'Échéance', description: 'Date limite de paiement.' },
        { key: 'amount', label: 'Montant TTC', description: 'Total toutes taxes comprises, en FCFA.' },
        { key: 'status', label: 'Statut', description: 'Situation de la facture.' },
        {
          key: 'actions',
          label: 'Actions',
          description: 'PDF, Traduction arabe, Émettre, Marquer payée, Avoir, Mettre en lecture seule.'
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: 'Pas encore émise, sans numéro définitif.' },
        { value: 'ISSUED', label: 'Émise', description: 'Envoyée à l’agence, en attente de paiement.' },
        { value: 'OVERDUE', label: 'En retard', description: 'L’échéance est passée sans paiement.' },
        { value: 'PAID', label: 'Payée', description: 'Le règlement est enregistré.' },
        { value: 'FAILED', label: 'Échouée', description: 'Le paiement a échoué ; la facture reste à régler.' },
        { value: 'CANCELED', label: 'Annulée', description: 'Annulée par un avoir.' },
        { value: 'REFUNDED', label: 'Remboursée', description: 'Facture remboursée.' }
      ],
      notes: [
        '« Marquer payée » est proposé pour les factures Émise, En retard ou Échouée.',
        '« Mettre en lecture seule » n’apparaît que sur une facture de dépassement En retard.'
      ]
    },
    faq: [
      {
        q: 'Quels filtres sont disponibles ?',
        a: 'Recherche par numéro ou référence de paiement, statut, date d’émission, nature et montant TTC.'
      },
      {
        q: 'Un impayé de dépassement bloque-t-il l’agence ?',
        a: 'Non, pas automatiquement : la facture reste « En retard ». Le bouton « Mettre en lecture seule » la bloque à la main.'
      },
      { q: 'Peut-on supprimer un brouillon ?', a: 'Aucune suppression n’est proposée dans cet onglet.' }
    ],
    related: [
      { label: 'Enregistrer un paiement', helpId: 'administration.plateforme-agences.detail.factures.paiement' },
      { label: 'Émettre un avoir', helpId: 'administration.plateforme-agences.detail.factures.avoir' }
    ],
    keywords: ['statut facture', 'en retard', 'payée', 'brouillon', 'avoir', 'PDF']
  },
  {
    id: 'administration.plateforme-agences.detail.factures.generation',
    kind: 'section',
    title: 'Générer une facture',
    summary:
      'Cette fenêtre crée la facture de la période suivante ou du dépassement mensuel d’un abonnement annuel. Vous pouvez l’émettre tout de suite.',
    steps: [
      { title: 'Choisir la nature', detail: '« Période suivante » ou « Dépassement mensuel (abonnement annuel) ».' },
      {
        title: 'Décider de l’émission',
        detail: 'Cochez « Émettre immédiatement » pour envoyer la facture tout de suite.'
      },
      { title: 'Générer', detail: 'Cliquez sur « Générer ».' }
    ],
    consequences: [
      'Sans l’option d’émission, la facture reste en brouillon : elle n’est pas envoyée.',
      'Avec l’émission immédiate, la facture reçoit son numéro et est envoyée par e-mail aux administrateurs de l’agence.',
      'Si une facture existe déjà pour cette période, rien n’est créé en double.'
    ],
    faq: [
      {
        q: 'Quand choisir « Dépassement » ?',
        a: 'Pour facturer le dépassement d’un abonnement annuel, mois par mois.'
      },
      { q: 'Comment envoyer un brouillon plus tard ?', a: 'Cliquez sur « Émettre » dans la ligne du brouillon.' },
      { q: 'Peut-on modifier un brouillon ?', a: 'Aucune modification n’est proposée ici.' }
    ],
    keywords: ['générer', 'créer une facture', 'période suivante', 'dépassement']
  },
  {
    id: 'administration.plateforme-agences.detail.factures.paiement',
    kind: 'section',
    title: 'Enregistrer un paiement',
    summary:
      'Cette fenêtre constate le règlement d’une facture reçu hors de l’application : virement, Mobile Money, chèque ou espèces.',
    steps: [
      { title: 'Choisir le mode de règlement', detail: 'Virement, Mobile Money, Chèque ou Espèces.' },
      { title: 'Indiquer la date', detail: 'La date de paiement ne peut pas être dans le futur.' },
      { title: 'Ajouter une référence', detail: 'Numéro de virement, de transaction ou de chèque (facultatif).' },
      { title: 'Joindre un justificatif', detail: 'PDF ou image, un seul fichier (facultatif).' },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer le paiement ».' }
    ],
    consequences: [
      'La facture passe à « Payée ».',
      'Si l’échéance de l’abonnement est atteinte, ou si l’agence était en impayé, l’abonnement est renouvelé : le message « abonnement réactivé » le confirme.',
      'Le règlement est enregistré dans le journal, à votre nom.'
    ],
    faq: [
      {
        q: 'Le paiement en ligne passe-t-il par ici ?',
        a: 'Non : les paiements en ligne apparaissent dans le détail de la facture, sans saisie de votre part.'
      },
      {
        q: 'Peut-on annuler un paiement saisi par erreur ?',
        a: 'Aucune annulation n’est proposée dans cet onglet : vérifiez avant d’enregistrer.'
      },
      { q: 'Le justificatif est-il obligatoire ?', a: 'Non. Il se télécharge ensuite depuis le détail de la facture.' }
    ],
    keywords: ['paiement', 'marquer payée', 'virement', 'mobile money', 'chèque', 'espèces', 'justificatif']
  },
  {
    id: 'administration.plateforme-agences.detail.factures.avoir',
    kind: 'section',
    title: 'Émettre un avoir',
    summary:
      'Un avoir annule une facture émise. Il demande un motif et peut remettre ses lignes en attente pour une facture corrigée.',
    steps: [
      { title: 'Saisir le motif', detail: 'Le motif est obligatoire.' },
      {
        title: 'Choisir de refacturer',
        detail: 'Cochez « Remettre les lignes en attente pour une facture corrigée » si vous voulez refacturer ensuite.'
      },
      { title: 'Émettre', detail: 'Cliquez sur « Émettre l’avoir ».' }
    ],
    consequences: [
      'La facture d’origine est annulée et un avoir est créé. Une facture ne peut recevoir qu’un seul avoir.',
      'L’avoir est envoyé par e-mail aux administrateurs de l’agence.',
      'Si la facture était déjà payée, l’avoir la signale comme remboursement dû : le remboursement lui-même se fait hors de cet écran.',
      'L’opération est enregistrée dans le journal, motif compris. Elle est irréversible.'
    ],
    faq: [
      {
        q: 'Quelles factures peuvent recevoir un avoir ?',
        a: 'Les factures d’abonnement Émise, En retard ou Payée. Le bouton « Avoir » apparaît sur d’autres lignes mais l’opération y est refusée.'
      },
      { q: 'Peut-on faire un avoir sur un avoir ?', a: 'Non.' },
      {
        q: 'Que fait la case « Remettre les lignes en attente » ?',
        a: 'Elle remet les éléments facturés en attente, pour qu’une facture corrigée puisse les reprendre.'
      }
    ],
    keywords: ['avoir', 'annuler une facture', 'note de crédit', 'remboursement']
  },
  {
    id: 'administration.plateforme-agences.detail.activite',
    kind: 'section',
    title: 'Onglet Activité',
    summary:
      'Un coup d’œil sur la vie de l’agence : nombre de collaborateurs, dernière connexion, abonnement et modules activés.',
    howToRead: {
      notes: [
        'Trois compteurs : Collaborateurs, Collaborateurs actifs et Collaborateurs désactivés.',
        '« Dernière connexion » : date de la dernière connexion dans l’agence, ou « Jamais ».',
        'Le bloc « Abonnement » rappelle le statut et la fin de la période en cours.',
        '« Modules activés » liste les modules ouverts avec leur date d’activation.'
      ]
    },
    faq: [
      { q: 'Cet onglet permet-il d’agir ?', a: 'Non, il est en lecture seule.' },
      {
        q: 'Quelle différence avec l’onglet Statistiques ?',
        a: 'Les deux donnent des chiffres sur l’agence, de sources différentes ; Statistiques reste plus synthétique.'
      },
      { q: 'Où voir le détail des actions des utilisateurs ?', a: 'Dans le journal d’audit de la plateforme.' }
    ],
    related: [{ label: 'Journal d’audit', to: '/admin/audit' }],
    keywords: ['activité', 'dernière connexion', 'modules activés']
  },
  {
    id: 'administration.plateforme-agences.detail.statistiques',
    kind: 'section',
    title: 'Onglet Statistiques',
    summary:
      'Des chiffres clés sur l’agence : collaborateurs actifs et désactivés, modules actifs, statut d’abonnement et dernière connexion.',
    howToRead: {
      notes: [
        'Si aucun chiffre n’apparaît, c’est que les statistiques n’ont pas pu être chargées.',
        'L’onglet est en lecture seule.'
      ]
    },
    faq: [
      { q: 'Pourquoi l’onglet est-il vide ?', a: 'Les statistiques n’ont pas pu être lues. Rechargez la page.' },
      { q: 'Comment agir sur les collaborateurs ?', a: 'Depuis l’onglet Collaborateurs.' },
      { q: 'Que veut dire « Aucun abonnement » ?', a: 'L’agence n’a pas d’abonnement enregistré.' }
    ],
    keywords: ['statistiques', 'chiffres', 'indicateurs']
  },
  {
    id: 'administration.plateforme-agences.detail.export',
    kind: 'section',
    title: 'Export des données de l’agence',
    summary:
      'Cet onglet prépare une archive ZIP complète des données de l’agence : un fichier CSV par type de données, un récapitulatif Excel et les fichiers joints. L’archive reste disponible 7 jours.',
    steps: [
      { title: 'Demander l’export', detail: 'Cliquez sur « Préparer un export », puis confirmez.' },
      {
        title: 'Attendre',
        detail: 'L’état passe de « En attente » à « En cours » puis « Prêt » ; la liste se met à jour toute seule.'
      },
      { title: 'Télécharger', detail: 'Cliquez sur « Télécharger » quand l’état est « Prêt ».' }
    ],
    consequences: [
      'Un seul export à la fois par agence : une nouvelle demande est refusée tant qu’un export est en attente ou en cours.',
      'L’archive est supprimée après 7 jours. Il faut alors préparer un nouvel export.',
      'La demande, chaque téléchargement et chaque suppression sont enregistrés dans le journal de la plateforme.',
      'Les mots de passe, jetons de connexion, clés secrètes et codes de paiement ne sont jamais exportés. Le journal d’audit de la plateforme n’est pas inclus.'
    ],
    faq: [
      {
        q: 'Que contient l’archive ?',
        a: 'Les données métier de l’agence : un fichier CSV par type de données, un classeur Excel récapitulatif et les fichiers joints.'
      },
      {
        q: 'À quoi sert « Fichiers manquants » ?',
        a: 'Il compte les fichiers joints référencés mais introuvables sur le serveur au moment de l’export.'
      },
      { q: 'L’agence est-elle prévenue ?', a: 'Aucun e-mail n’est envoyé : c’est à vous de lui transmettre l’archive.' }
    ],
    permissions: { roles: ['Super administrateur plateforme'] },
    related: [
      { label: 'Historique des exports', helpId: 'administration.plateforme-agences.detail.export.historique' }
    ],
    keywords: ['export', 'archive', 'zip', 'csv', 'sauvegarde', 'données', 'récupérer les données']
  },
  {
    id: 'administration.plateforme-agences.detail.export.historique',
    kind: 'table',
    title: 'Historique des exports',
    summary: 'La liste des exports demandés pour l’agence, avec leur état, leur taille et leur date d’expiration.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Demandé le', description: 'Date et heure de la demande.' },
        { key: 'requestedBy', label: 'Demandé par', description: 'Personne qui a lancé l’export.' },
        { key: 'status', label: 'Statut', description: 'État de l’export.' },
        { key: 'size', label: 'Taille', description: 'Taille de l’archive.' },
        {
          key: 'counts',
          label: 'Tables / lignes / fichiers',
          description: 'Nombre de types de données, de lignes et de fichiers joints exportés.'
        },
        {
          key: 'missingFileCount',
          label: 'Fichiers manquants',
          description: 'Fichiers joints introuvables au moment de l’export.'
        },
        { key: 'expiresAt', label: 'Expiration', description: 'Date après laquelle l’archive est supprimée.' },
        { key: 'actions', label: 'Actions', description: 'Télécharger (si prêt) ou Supprimer.' }
      ],
      statuses: [
        { value: 'QUEUED', label: 'En attente', description: 'La demande attend son tour.' },
        { value: 'RUNNING', label: 'En cours', description: 'L’archive se prépare.' },
        { value: 'READY', label: 'Prêt', description: 'L’archive peut être téléchargée.' },
        { value: 'FAILED', label: 'Échoué', description: 'La préparation a échoué.' },
        { value: 'EXPIRED', label: 'Expiré', description: 'L’archive a été supprimée.' }
      ]
    },
    consequences: [
      'Supprimer un export demande confirmation, est irréversible et est enregistré dans le journal. Un export en cours ne peut pas être supprimé.'
    ],
    faq: [
      { q: 'Pourquoi « Archive expirée » ?', a: 'L’archive date de plus de 7 jours : préparez un nouvel export.' },
      { q: 'Pourquoi ne puis-je pas supprimer un export ?', a: 'Il est en cours de préparation.' },
      { q: 'Comment relancer un export échoué ?', a: 'Cliquez à nouveau sur « Préparer un export ».' }
    ],
    keywords: ['historique export', 'archive', 'expiration', 'téléchargement']
  },

  // ------------------------------------------------------------ modification
  {
    id: 'administration.plateforme-agences.modification',
    kind: 'page',
    title: 'Modifier une agence',
    summary:
      'Ce formulaire corrige les informations de l’agence : logo, nom, coordonnées, adresse, sous-domaine, domaine personnalisé, site web et couleur de marque.',
    purpose: 'Le super-administrateur y met à jour l’identité de l’agence cliente sans toucher à son abonnement.',
    steps: [
      {
        title: 'Changer le logo',
        detail:
          '« Téléverser un logo » (PNG, JPEG ou WebP, 2 Mo maximum) ou « Retirer ». Le logo est enregistré aussitôt.'
      },
      { title: 'Corriger les champs', detail: 'Seul le nom est obligatoire.' },
      { title: 'Vérifier les formats', detail: 'E-mail valide, site web en https://, couleur au format #RRGGBB.' },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer » : vous revenez à la fiche.' }
    ],
    consequences: [
      'Le logo se téléverse ou se retire immédiatement, sans attendre « Enregistrer ».',
      'Les autres champs ne sont enregistrés qu’avec « Enregistrer ». « Annuler » abandonne les changements.',
      'Un e-mail de contact ou un site web laissé vide n’est pas envoyé.',
      'Aucun e-mail n’est envoyé à l’agence. Les modifications sont enregistrées dans le journal.'
    ],
    faq: [
      {
        q: 'Peut-on changer le statut ou les packs ici ?',
        a: 'Non : le statut se change sur la fiche, les packs dans l’onglet Abonnement.'
      },
      {
        q: 'À quoi servent le sous-domaine et le domaine personnalisé ?',
        a: 'Ils servent à l’adresse web propre à l’agence ; le formulaire n’en dit pas plus.'
      },
      { q: 'Pourquoi mon logo est-il refusé ?', a: 'Seuls PNG, JPEG et WebP de 2 Mo maximum sont acceptés.' }
    ],
    permissions: { roles: ['Super administrateur plateforme'] },
    related: [{ label: 'Retour à la fiche de l’agence', helpId: 'administration.plateforme-agences.detail' }],
    keywords: ['modifier agence', 'logo', 'coordonnées', 'couleur de marque', 'sous-domaine', 'domaine']
  },
  {
    id: 'administration.plateforme-agences.modification.formulaire',
    kind: 'section',
    title: 'Formulaire de modification',
    summary: 'Les champs modifiables de l’agence. Seul le nom est obligatoire.',
    howToRead: {
      notes: [
        'Champs : Nom, Nom légal, Email de contact, Téléphone, Ville, Pays, Adresse, Sous-domaine, Domaine personnalisé, Site web, Couleur de marque.',
        'Le téléphone s’écrit par exemple « +225 07 00 00 00 00 ».',
        'La pastille à côté de la couleur montre la teinte saisie quand elle est valide.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi « Enregistrer » refuse-t-il ?',
        a: 'Un champ est invalide : nom vide, e-mail ou site web mal écrit, couleur hors format #RRGGBB.'
      },
      {
        q: 'Peut-on vider un champ ?',
        a: 'Oui pour les champs libres. L’e-mail, le site web et la couleur laissés vides sont simplement ignorés.'
      },
      { q: 'Où est le nom de l’administrateur ?', a: 'Il se gère dans l’onglet Collaborateurs de la fiche.' }
    ],
    keywords: ['champs', 'formulaire', 'nom légal', 'adresse']
  },

  // ------------------------------------------------------------ collaborateur
  {
    id: 'administration.plateforme-agences.collaborateur',
    kind: 'page',
    title: 'Fiche d’un collaborateur d’agence',
    summary:
      'Cette fiche montre un collaborateur d’une agence : son identité, ses rôles et ses actions possibles (mot de passe, sessions, activation).',
    purpose:
      'Le super-administrateur y dépanne un collaborateur : changer ses rôles, lui envoyer un lien de réinitialisation, le déconnecter ou le désactiver.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'La personne peut utiliser l’agence.' },
        {
          value: 'PENDING_INVITE',
          label: 'Invitation en attente',
          description: 'Invitation envoyée, pas encore acceptée.'
        },
        { value: 'DISABLED', label: 'Désactivé', description: 'Accès retiré à cette agence.' }
      ],
      notes: [
        'Informations : e-mail, nom complet, e-mail vérifié, dernière connexion, membre depuis, et date d’invitation si elle existe.'
      ]
    },
    steps: [
      { title: 'Changer les rôles', detail: 'Cochez ou décochez les rôles, puis « Enregistrer les roles ».' },
      { title: 'Réinitialiser le mot de passe', detail: 'Bouton « Reinitialiser le mot de passe », puis confirmez.' },
      { title: 'Déconnecter la personne', detail: 'Bouton « Revoquer les sessions », puis confirmez.' },
      {
        title: 'Désactiver ou activer',
        detail: 'Bouton « Desactiver le compte » ou « Activer le compte », puis confirmez.'
      }
    ],
    consequences: [
      'Réinitialiser le mot de passe envoie un e-mail avec un lien à usage unique, valable 24 heures, et ferme toutes les sessions de la personne. Son ancien mot de passe ne fonctionne plus.',
      'Révoquer les sessions oblige la personne à se reconnecter sur tous ses appareils.',
      'Désactiver ferme ses sessions et annule les invitations en attente qu’elle avait envoyées ; on ne peut pas désactiver le dernier administrateur actif ni son propre compte.',
      'Ces actions sont enregistrées dans le journal de la plateforme, à votre nom.'
    ],
    faq: [
      {
        q: 'Le nouveau mot de passe s’affiche-t-il ?',
        a: 'Non. La personne choisit son mot de passe via le lien reçu par e-mail.'
      },
      {
        q: 'Pourquoi un message de refus ?',
        a: 'Certaines actions sont protégées, par exemple sur le dernier administrateur actif ou un administrateur protégé.'
      },
      {
        q: 'Les rôles s’appliquent-ils à toutes les agences ?',
        a: 'Non : ils concernent seulement l’agence de cette fiche.'
      }
    ],
    permissions: { roles: ['Super administrateur plateforme'] },
    related: [{ label: 'Rôles de la fiche', helpId: 'administration.plateforme-agences.collaborateur.roles' }],
    keywords: ['collaborateur', 'mot de passe', 'sessions', 'désactiver', 'rôle', 'utilisateur']
  },
  {
    id: 'administration.plateforme-agences.collaborateur.roles',
    kind: 'section',
    title: 'Rôles du collaborateur',
    summary:
      'La liste des rôles de l’agence. Les cases cochées sont les rôles du collaborateur ; « Enregistrer les roles » applique le changement.',
    consequences: [
      'Les nouveaux rôles s’appliquent à cette agence seulement.',
      'Certains changements sont refusés pour protéger l’agence, par exemple retirer le dernier administrateur.'
    ],
    faq: [
      { q: 'Peut-on cumuler des rôles ?', a: 'Oui, plusieurs cases peuvent être cochées.' },
      { q: 'Où lire ce que permet chaque rôle ?', a: 'Dans « Rôles et permissions » de l’espace de la plateforme.' },
      { q: 'Faut-il enregistrer ?', a: 'Oui, cliquer sur une case ne suffit pas.' }
    ],
    related: [{ label: 'Rôles et permissions', to: '/admin/roles-permissions' }],
    keywords: ['rôles', 'droits', 'permissions', 'administrateur', 'gestionnaire', 'comptable']
  },
  {
    id: 'administration.plateforme-agences.collaborateur.actions',
    kind: 'section',
    title: 'Actions sur le compte',
    summary:
      'Trois actions de dépannage : réinitialiser le mot de passe, révoquer les sessions, désactiver ou activer le compte.',
    consequences: [
      'Réinitialiser le mot de passe : un e-mail avec un lien valable 24 heures part vers la personne, et ses sessions sont fermées.',
      'Révoquer les sessions : déconnexion de tous ses appareils.',
      'Désactiver : sessions fermées, invitations en attente de cette personne annulées.',
      'Chaque action demande confirmation et est enregistrée dans le journal.'
    ],
    faq: [
      {
        q: 'Que faire si la personne ne reçoit pas l’e-mail ?',
        a: 'Vérifiez l’adresse et les courriers indésirables ; l’action n’a pas d’autre canal.'
      },
      {
        q: 'Désactiver supprime-t-il le compte ?',
        a: 'Non : le compte et ses données restent, seul l’accès à cette agence est retiré.'
      },
      { q: 'Comment réactiver ?', a: 'Le même bouton devient « Activer le compte ».' }
    ],
    keywords: ['réinitialiser', 'mot de passe oublié', 'révoquer', 'déconnecter', 'désactiver']
  },

  // -------------------------------------------------------------- invitation
  {
    id: 'administration.plateforme-agences.invitation',
    kind: 'page',
    title: 'Inviter un collaborateur dans une agence',
    summary:
      'Ce formulaire invite une personne à rejoindre l’agence : saisissez son e-mail et cochez au moins un rôle. Elle reçoit une invitation par e-mail.',
    purpose:
      'Le super-administrateur ajoute un collaborateur à une agence cliente, par exemple quand son administrateur est indisponible.',
    steps: [
      { title: 'Saisir l’e-mail', detail: 'Adresse de la personne à inviter.' },
      { title: 'Choisir les rôles', detail: 'Cochez au moins un rôle ; la description de chacun est affichée.' },
      { title: 'Envoyer', detail: 'Cliquez sur « Envoyer l’invitation » : vous revenez à la fiche de l’agence.' }
    ],
    consequences: [
      'Une invitation est envoyée par e-mail. Si l’e-mail n’a pas pu partir, l’invitation est créée quand même et un message d’avertissement vous le signale.',
      'Si une invitation en attente existe déjà pour cette adresse, la nouvelle est refusée.',
      'Une personne déjà membre active de l’agence, ou désactivée, ne peut pas être invitée de nouveau : réactivez-la depuis sa fiche.',
      'Cette adresse ne peut pas être celle d’un super-administrateur de la plateforme.',
      'L’invitation est valable 7 jours.'
    ],
    faq: [
      { q: 'Pourquoi « Envoyer l’invitation » est-il grisé ?', a: 'Aucun rôle n’est coché.' },
      {
        q: 'La personne a déjà un compte ?',
        a: 'L’invitation lui donne accès à cette agence, sauf si elle en est déjà membre.'
      },
      {
        q: 'L’e-mail n’est pas parti, que faire ?',
        a: 'Un avertissement s’affiche et l’invitation existe quand même. Cet écran ne propose pas de renvoi.'
      }
    ],
    permissions: { roles: ['Super administrateur plateforme'] },
    related: [{ label: 'Onglet Collaborateurs', helpId: 'administration.plateforme-agences.detail.collaborateurs' }],
    keywords: ['inviter', 'invitation', 'nouveau collaborateur', 'ajouter un utilisateur']
  },
  {
    id: 'administration.plateforme-agences.invitation.formulaire',
    kind: 'section',
    title: 'Formulaire d’invitation',
    summary: 'L’e-mail de la personne et les rôles à lui donner dans l’agence. Les deux sont obligatoires.',
    howToRead: {
      notes: [
        'Les rôles proposés sont ceux de l’agence ; leur libellé et leur description s’affichent à l’écran.',
        'Cochez au moins un rôle, sinon le bouton d’envoi reste grisé.'
      ]
    },
    faq: [
      {
        q: 'Quel rôle choisir ?',
        a: 'Lisez la description affichée sous chaque rôle ; vous pouvez en cocher plusieurs.'
      },
      { q: 'Peut-on changer le rôle ensuite ?', a: 'Oui, depuis la fiche du collaborateur.' },
      {
        q: 'La majuscule dans l’e-mail compte-t-elle ?',
        a: 'Non, l’adresse est comparée sans tenir compte des majuscules.'
      }
    ],
    keywords: ['rôles', 'e-mail', 'formulaire']
  }
];

export default entries;
