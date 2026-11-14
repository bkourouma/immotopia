import type { HelpEntry } from '../../../types';

/** Zone « maintenance » du module « commercial » (fr) : liste, création, fiche et modification d'un ticket de maintenance. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Liste des tickets
  {
    id: 'commercial.maintenance.liste',
    kind: 'page',
    title: 'Mes tickets de maintenance',
    summary:
      "Retrouvez ici les tickets de maintenance : un ticket signale un incident sur un bien (fuite, panne, climatisation…) et permet d'en suivre le traitement.",
    purpose:
      "Chaque incident déclaré devient un ticket, classé par date de création (le plus récent en premier). Vous pouvez en créer un, le rechercher, l'ouvrir pour suivre son avancement, le modifier ou le supprimer tant qu'il est « Déclaré ».",
    steps: [
      {
        title: 'Déclarer un incident',
        detail:
          '« Nouveau ticket » ouvre le formulaire de création. Si la liste est vide, « Créer un ticket » fait la même chose.'
      },
      {
        title: 'Chercher un ticket',
        detail:
          'Tapez dans « Rechercher » ou choisissez un Statut ou un Bien. « Plus de critères » ajoute la priorité, la catégorie et la date de création.'
      },
      {
        title: 'Ouvrir la fiche',
        detail:
          "Cliquez sur la carte d'un ticket pour voir sa description, son historique, ses pièces jointes et ses commentaires."
      },
      {
        title: 'Modifier ou supprimer',
        detail: 'Les boutons « Modifier » et « Supprimer » figurent en bas de la carte, selon le statut du ticket.'
      }
    ],
    consequences: [
      'Un ticket créé démarre toujours au statut « Déclaré ».',
      '« Supprimer » efface définitivement le ticket avec ses pièces jointes, ses commentaires et son historique, après confirmation. Cette action est irréversible.',
      'Seul un ticket « Déclaré » peut être modifié ; seul un ticket « Déclaré » ou « Annulé » peut être supprimé.'
    ],
    faq: [
      {
        q: "Pourquoi n'y a-t-il pas de bouton « Modifier » sur certains tickets ?",
        a: "La modification n'est possible que tant que le ticket est « Déclaré ». Dès qu'il est pris en charge, vous ne pouvez plus le modifier."
      },
      {
        q: "Qui change le statut d'un ticket ?",
        a: "Pas cet écran : les statuts « En cours », « Assigné » et « Résolu » sont posés par un gestionnaire depuis les tickets de l'agence (menu Maintenance, « Tickets de l'agence »)."
      },
      {
        q: 'Je ne vois pas la page ou le menu.',
        a: "Il faut le droit « Créer et voir ses tickets de maintenance ». Voyez avec l'administrateur de votre agence."
      }
    ],
    permissions: {
      note: 'Droit requis : « Créer et voir ses tickets de maintenance ». La gestion de tous les tickets et des prestataires demande le droit « Gérer tous les tickets et prestataires ».'
    },
    related: [
      { label: 'Recherche et critères', helpId: 'commercial.maintenance.liste.recherche' },
      { label: 'Les cartes de tickets et leurs statuts', helpId: 'commercial.maintenance.liste.tickets' },
      { label: 'Créer un ticket', helpId: 'commercial.maintenance.nouveau' }
    ],
    keywords: [
      'maintenance',
      'ticket',
      'incident',
      'panne',
      'réparation',
      'dépannage',
      'demande',
      'plomberie',
      'électricité'
    ]
  },
  {
    id: 'commercial.maintenance.liste.recherche',
    kind: 'section',
    title: 'Recherche et critères des tickets',
    summary: "Cette barre filtre les cartes de tickets affichées en dessous. Le nombre de résultats s'affiche à côté.",
    howToRead: {
      notes: [
        '« Rechercher » : tapez un mot du titre, de la description, de la localisation, du bien ou du prestataire.',
        'Statut : Déclaré, En cours, Assigné, Résolu ou Annulé.',
        "Bien : choisissez un bien parmi ceux de l'agence (la liste se filtre quand vous tapez).",
        'Sous « Plus de critères » : Priorité (Faible, Moyenne, Élevée, Urgente), Catégorie (Plomberie, Électricité, Climatisation, Autre) et « Créé du / au » (période de création).',
        "Les critères choisis restent dans l'adresse de la page : vous pouvez la copier pour la partager."
      ]
    },
    steps: [
      { title: 'Saisir ou choisir', detail: 'Tapez dans « Rechercher » ou choisissez une valeur dans un critère.' },
      { title: 'Affiner', detail: 'Ouvrez « Plus de critères » pour la priorité, la catégorie et la date.' },
      { title: 'Repartir de zéro', detail: 'Si rien ne correspond, « Effacer les critères » retire tous les filtres.' }
    ],
    consequences: ['Filtrer ne modifie aucun ticket : cela change seulement ce qui est affiché.'],
    faq: [
      {
        q: 'Le filtre ne trouve pas mon ticket.',
        a: "Vérifiez le statut choisi : un ticket « Annulé » ou « Résolu » n'apparaît pas si vous filtrez sur un autre statut. « Effacer les critères » remet tout à zéro."
      },
      {
        q: 'Que cherche le champ « Rechercher » ?',
        a: "Le titre, la description, la localisation, le bien (titre, adresse, référence) et le prestataire. Les majuscules n'ont pas d'importance."
      },
      {
        q: 'Puis-je retrouver ma recherche plus tard ?',
        a: "Oui : les critères restent dans l'adresse de la page. Enregistrez-la dans vos favoris ou envoyez-la à un collègue."
      }
    ],
    related: [{ label: "Vue d'ensemble des tickets", helpId: 'commercial.maintenance.liste' }],
    keywords: ['filtre', 'recherche', 'critères', 'statut', 'priorité', 'catégorie']
  },
  {
    id: 'commercial.maintenance.liste.tickets',
    kind: 'section',
    title: 'Les cartes de tickets',
    summary:
      'Une carte résume un ticket : son titre, son statut, sa catégorie, sa priorité, le bien concerné et sa date de création.',
    howToRead: {
      statuses: [
        {
          value: 'DECLARED',
          label: 'Déclaré',
          description: "L'incident vient d'être signalé. C'est le seul statut où l'on peut modifier le ticket."
        },
        {
          value: 'IN_PROGRESS',
          label: 'En cours',
          description: "Le ticket est pris en charge ; il n'est plus modifiable depuis cet écran."
        },
        {
          value: 'ASSIGNED',
          label: 'Assigné',
          description: 'Le traitement est confié (par exemple à un prestataire).'
        },
        { value: 'RESOLVED', label: 'Résolu', description: "L'incident est traité. Le ticket est clos." },
        {
          value: 'CANCELED',
          label: 'Annulé',
          description: 'Le ticket est abandonné. Il est clos et peut être supprimé.'
        }
      ],
      notes: [
        "Le texte de description est coupé s'il est long : ouvrez la fiche pour le lire en entier.",
        'Au-delà de 20 tickets, des numéros de page apparaissent sous la liste.'
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: 'Cliquez sur la carte pour afficher la fiche du ticket.' },
      { title: 'Modifier', detail: '« Modifier » apparaît seulement sur un ticket « Déclaré ».' },
      {
        title: 'Supprimer',
        detail: '« Supprimer » apparaît sur un ticket « Déclaré » ou « Annulé » et demande une confirmation.'
      }
    ],
    consequences: [
      'La suppression est définitive : le ticket, ses pièces jointes, ses commentaires et son historique disparaissent.',
      'Un ticket « En cours », « Assigné » ou « Résolu » ne peut ni être modifié ni être supprimé.'
    ],
    faq: [
      {
        q: "J'ai supprimé un ticket par erreur, peut-on le récupérer ?",
        a: 'Non, la suppression est irréversible. Il faut recréer le ticket.'
      },
      {
        q: 'Que faire pour abandonner un ticket déjà en cours ?',
        a: "Le bouton « Annuler le ticket » n'existe que sur un ticket « Déclaré ». Pour un ticket plus avancé, contactez le gestionnaire de l'agence."
      }
    ],
    related: [
      { label: 'La fiche détaillée', helpId: 'commercial.maintenance.detail' },
      { label: 'Modifier un ticket', helpId: 'commercial.maintenance.modifier' }
    ],
    keywords: ['carte', 'statut', 'supprimer', 'annuler', 'priorité', 'catégorie']
  },

  // ---------------------------------------------------------------- Création
  {
    id: 'commercial.maintenance.nouveau',
    kind: 'page',
    title: 'Créer un ticket de maintenance',
    summary:
      'Remplissez ce formulaire pour signaler un incident sur un bien : choisissez le bien, décrivez le problème et joignez des photos si vous en avez.',
    purpose:
      "Le ticket permet à l'agence de suivre l'incident du signalement jusqu'à sa résolution. Plus la description est précise, plus le traitement est rapide.",
    steps: [
      {
        title: 'Choisir la propriété',
        detail:
          'Tapez pour rechercher un bien (20 résultats au plus) puis sélectionnez-le. Ce choix est obligatoire et ne pourra plus être changé.'
      },
      { title: 'Donner un titre', detail: "De 3 à 200 caractères, par exemple « Fuite d'eau dans la salle de bain »." },
      {
        title: 'Indiquer la catégorie et la priorité',
        detail:
          'Catégorie : Plomberie, Électricité, Climatisation ou Autre. Priorité : Faible, Moyenne, Élevée ou Urgente.'
      },
      {
        title: 'Décrire le problème',
        detail:
          "Description de 10 à 5 000 caractères. « Détails de localisation » (500 caractères au plus) précise l'endroit, et reste facultatif."
      },
      {
        title: 'Joindre des fichiers',
        detail: "Facultatif : jusqu'à 10 fichiers de 5 Mo au plus (JPEG, PNG, WebP ou PDF)."
      },
      {
        title: 'Valider',
        detail:
          '« Créer le ticket » enregistre le ticket puis ouvre sa fiche. « Annuler » revient à la liste sans rien enregistrer.'
      }
    ],
    consequences: [
      "Le ticket démarre au statut « Déclaré » et sa première ligne d'historique est créée. Si le bien a un bail en cours, le ticket y est rattaché.",
      "Selon les notifications e-mail activées par l'agence, un message part aux administrateurs de l'agence, un accusé de réception au locataire (s'il a une adresse e-mail) et une information au propriétaire.",
      "Les pièces jointes sont envoyées une par une après la création du ticket. Si l'une échoue, le ticket est quand même créé et un message cite les fichiers non envoyés."
    ],
    faq: [
      {
        q: 'Je ne trouve pas mon bien dans la liste.',
        a: 'Tapez la référence ou le nom du bien : la liste se met à jour. Seuls les biens de votre agence sont proposés.'
      },
      {
        q: 'Une pièce jointe a échoué, que faire ?',
        a: "La fiche du ticket ne permet pas d'ajouter de pièce jointe après coup. Si une pièce est essentielle, décrivez-la dans un commentaire ou recréez le ticket."
      },
      {
        q: "Puis-je corriger le ticket après l'avoir créé ?",
        a: "Oui, tant qu'il est « Déclaré » : titre, description, catégorie, priorité et localisation. Le bien ne peut pas être changé."
      }
    ],
    permissions: {
      note: 'Droit requis : « Créer et voir ses tickets de maintenance ».'
    },
    related: [
      { label: 'Joindre des fichiers', helpId: 'commercial.maintenance.nouveau.pieces-jointes' },
      { label: 'Retour à la liste des tickets', helpId: 'commercial.maintenance.liste' }
    ],
    keywords: ['créer', 'nouveau ticket', 'signaler', 'incident', 'panne', 'fuite', 'maintenance', 'déclarer'],
    tour: {
      steps: [
        {
          target: 'maintenance-bien',
          title: 'Le bien concerné',
          description: 'Recherchez puis choisissez le bien. Ce champ est obligatoire.'
        },
        {
          target: 'maintenance-titre',
          title: 'Titre',
          description: "Donnez un titre court qui résume l'incident."
        },
        {
          target: 'maintenance-categorie',
          title: 'Catégorie et priorité',
          description: 'Choisissez la catégorie, puis la priorité.'
        },
        {
          target: 'maintenance-description',
          title: 'Décrire le problème',
          description: "Expliquez l'incident (10 caractères au moins) et, si besoin, précisez l'endroit."
        },
        {
          target: 'maintenance-pieces-jointes',
          title: 'Photos et documents',
          description: "Joignez jusqu'à 10 fichiers (JPEG, PNG, WebP ou PDF, 5 Mo chacun)."
        },
        {
          target: 'maintenance-creer',
          title: 'Créer le ticket',
          description: 'Ce bouton enregistre le ticket et ouvre sa fiche.'
        }
      ]
    }
  },
  {
    id: 'commercial.maintenance.nouveau.pieces-jointes',
    kind: 'section',
    title: 'Pièces jointes du ticket',
    summary:
      'Joignez des photos ou des documents qui montrent le problème. Ils sont envoyés en même temps que la création du ticket.',
    howToRead: {
      notes: [
        'Types acceptés : JPEG, PNG, WebP et PDF.',
        'Taille maximale : 5 Mo par fichier. Nombre maximal : 10 fichiers.',
        'Un fichier déjà ajouté (même nom, même taille, même date) est refusé.',
        "La liste affiche le nom et la taille de chaque fichier ; « Supprimer » le retire avant l'envoi."
      ]
    },
    steps: [
      {
        title: 'Choisir les fichiers',
        detail: 'Cliquez sur « Sélectionner des fichiers » ; vous pouvez en choisir plusieurs à la fois.'
      },
      { title: 'Vérifier la liste', detail: 'Retirez avec « Supprimer » un fichier ajouté par erreur.' },
      { title: 'Créer le ticket', detail: 'Les fichiers partent après « Créer le ticket ».' }
    ],
    consequences: [
      "Rien n'est envoyé tant que vous n'avez pas cliqué sur « Créer le ticket ».",
      "Si un fichier échoue, le ticket est créé et un message nomme les fichiers non envoyés. La fiche du ticket ne permet pas d'en ajouter ensuite."
    ],
    faq: [
      {
        q: 'Mon fichier est refusé.',
        a: "Il est d'un type non accepté (par exemple Word ou vidéo), de plus de 5 Mo, déjà ajouté, ou vous avez atteint 10 fichiers."
      },
      {
        q: 'Puis-je joindre une photo prise avec mon téléphone ?',
        a: 'Oui, si elle est au format JPEG, PNG ou WebP et pèse moins de 5 Mo.'
      }
    ],
    related: [{ label: 'Créer un ticket', helpId: 'commercial.maintenance.nouveau' }],
    keywords: ['photo', 'pièce jointe', 'fichier', 'pdf', 'image', 'téléverser']
  },

  // ---------------------------------------------------------------- Fiche d'un ticket
  {
    id: 'commercial.maintenance.detail',
    kind: 'page',
    title: "Fiche d'un ticket de maintenance",
    summary:
      "Cette fiche réunit tout le suivi d'un incident : description, statut, historique des changements, pièces jointes et commentaires.",
    purpose:
      "C'est ici que vous suivez l'avancement d'un ticket et que vous échangez à son sujet. En haut figurent le titre, la date de création, le statut, la catégorie, la priorité et l'adresse du bien.",
    steps: [
      {
        title: 'Lire le ticket',
        detail: 'Vérifiez le statut, la catégorie, la priorité, la description et les détails de localisation.'
      },
      {
        title: 'Suivre le traitement',
        detail: '« Historique des statuts » liste chaque changement avec sa date et son auteur.'
      },
      {
        title: 'Consulter les pièces jointes',
        detail: "Cliquez sur la vignette d'une image pour l'agrandir, ou sur « Télécharger »."
      },
      {
        title: 'Écrire un commentaire',
        detail: 'Saisissez votre message dans « Ajouter un commentaire... » puis « Envoyer ».'
      },
      { title: 'Annuler si besoin', detail: '« Annuler le ticket » apparaît tant que le ticket est « Déclaré ».' }
    ],
    consequences: [
      'Annuler le ticket passe son statut à « Annulé », après confirmation. Un ticket annulé ne peut pas être rouvert ; il reste consultable et peut être supprimé depuis la liste.',
      "L'annulation et l'envoi d'un commentaire n'envoient pas d'e-mail."
    ],
    faq: [
      {
        q: 'Où est le bouton pour modifier le ticket ?',
        a: "Il se trouve dans la liste, sur la carte d'un ticket « Déclaré » (bouton « Modifier »)."
      },
      {
        q: 'Mon commentaire est refusé.',
        a: "Un commentaire doit être rattaché à un contact. Si l'envoi échoue, demandez à l'administrateur de vérifier que votre adresse e-mail existe comme contact de l'agence."
      },
      {
        q: 'Pourquoi le statut ne change-t-il pas ?',
        a: "Le traitement est suivi par un gestionnaire de l'agence, qui fait avancer le statut. Écrivez un commentaire si le ticket vous semble oublié."
      }
    ],
    permissions: {
      note: 'Droit requis : « Créer et voir ses tickets de maintenance ».'
    },
    related: [
      { label: 'Statut du ticket', helpId: 'commercial.maintenance.detail.statut' },
      { label: 'Historique des statuts', helpId: 'commercial.maintenance.detail.historique' },
      { label: 'Pièces jointes', helpId: 'commercial.maintenance.detail.pieces-jointes' },
      { label: 'Commentaires', helpId: 'commercial.maintenance.detail.commentaires' }
    ],
    keywords: ['ticket', 'fiche', 'suivi', 'statut', 'annuler', 'commentaire', 'historique']
  },
  {
    id: 'commercial.maintenance.detail.statut',
    kind: 'section',
    title: 'Statut du ticket',
    summary:
      "Le statut indique où en est le traitement de l'incident. Il avance dans cet ordre : Déclaré, En cours, Assigné, Résolu.",
    howToRead: {
      statuses: [
        {
          value: 'DECLARED',
          label: 'Déclaré',
          description:
            "Incident signalé, pas encore pris en charge. Vous pouvez encore le modifier, l'annuler ou le supprimer."
        },
        { value: 'IN_PROGRESS', label: 'En cours', description: "Le ticket est pris en charge par l'agence." },
        { value: 'ASSIGNED', label: 'Assigné', description: 'Le traitement est confié à un intervenant.' },
        { value: 'RESOLVED', label: 'Résolu', description: "L'incident est traité. Statut final." },
        { value: 'CANCELED', label: 'Annulé', description: 'Le ticket est abandonné. Statut final.' }
      ],
      notes: [
        'Un ticket « Déclaré » peut passer à « En cours » ou « Annulé » ; « En cours » à « Assigné » ou « Annulé » ; « Assigné » à « Résolu ». Résolu et Annulé sont définitifs.'
      ]
    },
    steps: [
      { title: "Lire l'étiquette", detail: "L'étiquette colorée en haut à droite de la fiche donne le statut actuel." },
      { title: 'Annuler un ticket déclaré', detail: '« Annuler le ticket » puis « Oui » dans la confirmation.' }
    ],
    consequences: [
      "L'annulation est irréversible : le ticket reste « Annulé » pour toujours.",
      "Le changement est inscrit dans l'historique des statuts avec la mention « Ticket annulé par le locataire ».",
      "Quand un gestionnaire fait avancer le statut, le locataire et le propriétaire peuvent être prévenus par e-mail, selon les notifications activées par l'agence."
    ],
    faq: [
      {
        q: 'Qui change le statut ?',
        a: "Les statuts « En cours », « Assigné » et « Résolu » sont posés par un gestionnaire de l'agence, depuis les tickets de l'agence. Depuis cette fiche, vous pouvez seulement annuler un ticket « Déclaré »."
      },
      {
        q: 'Le bouton « Annuler le ticket » a disparu.',
        a: "Il n'est proposé que tant que le ticket est « Déclaré »."
      }
    ],
    related: [{ label: 'Historique des statuts', helpId: 'commercial.maintenance.detail.historique' }],
    keywords: ['statut', 'étape', 'annuler', 'résolu', 'déclaré']
  },
  {
    id: 'commercial.maintenance.detail.historique',
    kind: 'section',
    title: 'Historique des statuts',
    summary:
      "La chronologie liste chaque changement de statut du ticket, du plus ancien au plus récent, avec la date et l'auteur.",
    howToRead: {
      notes: [
        "Chaque ligne montre le passage d'un statut à un autre (par exemple Déclaré → En cours). La toute première ligne indique seulement le statut de départ.",
        'Une note peut accompagner la ligne, par exemple « Ticket créé ».',
        "Sous la ligne figurent la date et l'heure, puis « par » suivi du nom de la personne. Sans nom, la mention « (Système) » s'affiche.",
        'La dernière ligne, en bleu, correspond au statut actuel.'
      ]
    },
    consequences: [
      "L'historique est en lecture seule : on ne peut ni le modifier ni le corriger. Il disparaît si le ticket est supprimé."
    ],
    faq: [
      {
        q: "Pourquoi « Aucun historique disponible » s'affiche-t-il ?",
        a: "Le ticket ne contient aucune ligne d'historique. Un ticket créé depuis l'application en a toujours une."
      },
      {
        q: 'Que veut dire « (Système) » ?',
        a: "Le changement n'a pas été fait par une personne connue, mais automatiquement."
      }
    ],
    related: [{ label: 'Statut du ticket', helpId: 'commercial.maintenance.detail.statut' }],
    keywords: ['historique', 'chronologie', 'journal', 'changement']
  },
  {
    id: 'commercial.maintenance.detail.pieces-jointes',
    kind: 'section',
    title: 'Pièces jointes de la fiche',
    summary:
      'Cette section liste les photos et documents envoyés avec le ticket. Vous pouvez les consulter et les télécharger.',
    howToRead: {
      notes: [
        "Chaque ligne affiche le nom du fichier et sa taille. Une image a une vignette, que l'on agrandit en cliquant dessus.",
        '« Télécharger » enregistre le fichier sur votre appareil.',
        "« Aucune pièce jointe » s'affiche si rien n'a été envoyé."
      ]
    },
    consequences: [
      "Cet écran ne permet ni d'ajouter ni de supprimer une pièce jointe. Les fichiers disparaissent seulement avec le ticket, s'il est supprimé.",
      'Les fichiers sont privés : ils ne sont lus que par des personnes connectées autorisées.'
    ],
    faq: [
      {
        q: 'Je veux ajouter une photo après coup.',
        a: "Ce n'est pas possible depuis la fiche. Ajoutez un commentaire pour décrire l'élément, ou recréez le ticket avec la photo."
      },
      {
        q: "La vignette ne s'affiche pas.",
        a: "Une icône de fichier la remplace si l'image n'a pas pu être chargée. « Télécharger » reste possible."
      }
    ],
    related: [{ label: 'Joindre des fichiers à la création', helpId: 'commercial.maintenance.nouveau.pieces-jointes' }],
    keywords: ['photo', 'fichier', 'télécharger', 'pièce jointe', 'document']
  },
  {
    id: 'commercial.maintenance.detail.commentaires',
    kind: 'section',
    title: 'Commentaires du ticket',
    summary: 'Le fil des commentaires garde les échanges au sujet du ticket. Vous pouvez y écrire un nouveau message.',
    howToRead: {
      notes: [
        "Chaque commentaire montre l'auteur, son type (Locataire, Gestionnaire ou Système), le message, la date et l'heure.",
        'Le type « Locataire » est aussi affiché pour un commentaire écrit depuis cet écran.',
        "« Aucun commentaire » s'affiche tant que personne n'a écrit."
      ]
    },
    steps: [
      { title: 'Écrire', detail: 'Saisissez votre message dans « Ajouter un commentaire... ».' },
      { title: 'Envoyer', detail: 'Cliquez sur « Envoyer » (le bouton reste grisé tant que le champ est vide).' }
    ],
    consequences: [
      'Le commentaire est enregistré tout de suite et ne peut pas être modifié ni supprimé depuis cet écran.',
      "Aucun e-mail n'est envoyé aux autres personnes : relisez la fiche pour voir leurs réponses."
    ],
    faq: [
      {
        q: "Le commentaire n'est pas envoyé.",
        a: "Il doit être rattaché à un contact de l'agence. Demandez à l'administrateur de vérifier que votre adresse e-mail existe comme contact."
      },
      {
        q: 'Puis-je corriger un commentaire ?',
        a: 'Non. Écrivez un nouveau commentaire pour préciser ou corriger.'
      }
    ],
    related: [{ label: "Vue d'ensemble de la fiche", helpId: 'commercial.maintenance.detail' }],
    keywords: ['commentaire', 'message', 'échange', 'discussion']
  },

  // ---------------------------------------------------------------- Modification
  {
    id: 'commercial.maintenance.modifier',
    kind: 'page',
    title: 'Modifier un ticket de maintenance',
    summary:
      "Corrigez le titre, la catégorie, la priorité, la description ou la localisation d'un ticket. Cet écran n'est disponible que pour un ticket « Déclaré ».",
    purpose:
      "Utilisez-le pour préciser ou corriger un signalement avant qu'il soit pris en charge. Le bien concerné et le bail ne peuvent pas être modifiés.",
    steps: [
      {
        title: 'Ouvrir la modification',
        detail: "Dans la liste, cliquez sur « Modifier » sur la carte d'un ticket « Déclaré »."
      },
      {
        title: 'Changer les champs',
        detail:
          'Le formulaire reprend le titre, la catégorie, la priorité, la description et les détails de localisation.'
      },
      {
        title: 'Enregistrer',
        detail: '« Enregistrer les modifications » valide. « Annuler » revient à la fiche du ticket.'
      }
    ],
    consequences: [
      "Seuls les champs que vous avez changés sont envoyés. Si rien n'a changé, le message « Aucune modification à apporter » s'affiche.",
      "Si le ticket n'est plus « Déclaré », le formulaire est refusé et vous revenez à la fiche du ticket.",
      "Les pièces jointes ne se gèrent pas ici, et la modification n'envoie pas d'e-mail."
    ],
    faq: [
      {
        q: 'Pourquoi suis-je renvoyé vers la fiche du ticket ?',
        a: 'Le ticket a changé de statut : seuls les tickets « Déclaré » se modifient.'
      },
      {
        q: 'Puis-je changer le bien concerné ?',
        a: 'Non. Si le bien est faux, annulez ou supprimez le ticket puis créez-en un nouveau.'
      }
    ],
    permissions: {
      note: 'Droit requis : « Créer et voir ses tickets de maintenance ».'
    },
    related: [{ label: 'Fiche du ticket', helpId: 'commercial.maintenance.detail' }],
    keywords: ['modifier', 'corriger', 'éditer', 'ticket', 'priorité', 'catégorie']
  }
];

export default entries;
