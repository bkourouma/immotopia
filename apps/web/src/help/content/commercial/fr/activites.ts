import type { HelpEntry } from '../../../types';

/** Zone « activites » du module « commercial » (fr) : activités, calendrier, tableau de bord CRM. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------------------
  // Liste des activités
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.activites.liste',
    kind: 'page',
    title: 'Activités',
    summary:
      "Retrouvez ici toutes les interactions de votre agence avec ses contacts : appels, e-mails, visites, notes, tâches. C'est aussi ici que vous enregistrez une nouvelle activité.",
    purpose:
      "Une activité garde la trace de ce qui s'est passé avec un contact (et, si vous le souhaitez, à propos d'une affaire) : ce qui a été dit, le résultat, et la prochaine action à faire. Cet historique permet à toute l'équipe de reprendre un dossier sans tout redemander au client.",
    steps: [
      {
        title: 'Enregistrer une activité',
        detail:
          "Cliquez sur « Nouvelle activité », choisissez le contact, le type et écrivez le contenu, puis cliquez sur « Créer l'activité »."
      },
      {
        title: 'Rechercher',
        detail:
          "Tapez un mot du sujet, du contenu, du résultat, un nom de contact ou d'auteur dans le champ de recherche."
      },
      {
        title: 'Filtrer',
        detail:
          "Affinez avec les critères Type d'activité, Contact, Collaborateur, Période, Direction et Prochaine action."
      },
      {
        title: "Ouvrir le contact ou l'affaire",
        detail: 'Dans une activité, cliquez sur « Contact : … » ou « Affaire : … » pour ouvrir la fiche correspondante.'
      },
      {
        title: 'Parcourir les pages',
        detail: "La liste affiche 50 activités par page, les plus récentes d'abord."
      }
    ],
    consequences: [
      "Vous voyez toutes les activités de l'agence, pas seulement les vôtres : la liste n'est pas limitée à l'auteur.",
      'Depuis cet écran, une activité enregistrée ne se modifie pas et ne se supprime pas.',
      "Créer une activité n'envoie aucun message au contact : c'est uniquement une trace interne."
    ],
    faq: [
      {
        q: 'Comment planifier une relance ?',
        a: "Dans le formulaire, remplissez « Prochaine action » avec la date et l'heure. L'activité apparaît alors dans le calendrier, comme relance."
      },
      {
        q: 'Je ne vois pas le bouton « Nouvelle activité » ou la page est refusée. Pourquoi ?',
        a: "Cela dépend de vos droits : « Voir les activités » pour consulter, « Créer des activités » pour en enregistrer. Demandez-les à l'administrateur de votre agence."
      },
      {
        q: "Que signifie l'étiquette « Correction » ?",
        a: "Elle marque une activité qui corrige une activité précédente. Le formulaire de cet écran n'en crée pas."
      }
    ],
    permissions: {
      feature: 'CRM',
      note: 'Consulter la liste demande « Voir les activités » ; enregistrer une activité demande « Créer des activités ».'
    },
    related: [
      { label: 'Comment lire la chronologie', helpId: 'commercial.activites.liste.chronologie' },
      { label: "Remplir le formulaire d'activité", helpId: 'commercial.activites.liste.formulaire' },
      { label: 'Voir les relances dans le calendrier', helpId: 'commercial.activites.calendrier' }
    ],
    keywords: [
      'activité',
      'activités',
      'appel',
      'historique',
      'interaction',
      'suivi client',
      'note',
      'tâche',
      'relance',
      'prochaine action'
    ]
  },
  {
    id: 'commercial.activites.liste.chronologie',
    kind: 'section',
    title: 'Chronologie des activités',
    summary:
      "Chaque carte est une activité, des plus récentes aux plus anciennes. Elle indique le type, la date, le contenu, le contact, l'affaire et l'auteur.",
    howToRead: {
      statuses: [
        { value: 'CALL', label: 'Appel', description: 'Un appel téléphonique.' },
        { value: 'EMAIL', label: 'Email', description: 'Un échange par e-mail.' },
        { value: 'SMS', label: 'SMS', description: 'Un échange par SMS.' },
        { value: 'WHATSAPP', label: 'WhatsApp', description: 'Un échange par WhatsApp.' },
        { value: 'VISIT', label: 'Visite', description: 'Une visite de bien.' },
        { value: 'MEETING', label: 'Réunion', description: 'Une réunion ou un rendez-vous.' },
        { value: 'NOTE', label: 'Note', description: 'Une note interne, sans échange avec le contact.' },
        { value: 'TASK', label: 'Tâche', description: 'Une chose à faire.' },
        {
          value: 'CORRECTION',
          label: 'Correction',
          description: 'Une activité qui corrige une activité précédente.'
        }
      ],
      notes: [
        "Sous le type, une étiquette de direction précise le sens de l'échange : « Sortant » (vous contactez le client), « Entrant » (le client vous contacte) ou « Interne » (entre collègues).",
        "La ligne « Résultat : » indique l'issue de l'activité, si elle a été renseignée.",
        "L'étiquette « Action suivante » montre le type d'action prévue et sa date. Sans type précisé, elle affiche « Relance ».",
        "« Par : » donne le nom de la personne qui a enregistré l'activité."
      ]
    },
    faq: [
      {
        q: "Pourquoi une activité n'a-t-elle pas d'affaire ?",
        a: "L'affaire est facultative : une activité peut concerner seulement un contact."
      },
      {
        q: "Où est la date de l'activité ?",
        a: "À côté du type : c'est la « Date d'occurrence », c'est-à-dire le moment où l'échange a eu lieu, pas forcément celui de l'enregistrement."
      },
      {
        q: 'Comment supprimer ou modifier une activité ?',
        a: "Cet écran ne le permet pas. Enregistrez une nouvelle activité pour compléter l'historique."
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande « Voir les activités ».' },
    related: [{ label: 'Enregistrer une activité', helpId: 'commercial.activites.liste.formulaire' }],
    keywords: ['historique', 'chronologie', 'timeline', 'appel', 'visite', 'note', 'résultat', 'direction']
  },
  {
    id: 'commercial.activites.liste.formulaire',
    kind: 'section',
    title: "Formulaire d'activité",
    summary:
      'Ce formulaire enregistre un échange avec un contact : appel, visite, note, tâche… Le contact et le contenu sont obligatoires.',
    steps: [
      { title: 'Choisir le contact', detail: 'Champ « Contact » obligatoire : cherchez par nom ou e-mail.' },
      {
        title: 'Rattacher une affaire (facultatif)',
        detail:
          "Le champ « Affaire (optionnel) » propose les affaires de ce contact. Il reste grisé tant qu'aucun contact n'est choisi, et change si vous changez de contact."
      },
      {
        title: 'Préciser le type et la direction',
        detail:
          '« Type » vaut « Appel » par défaut ; « Direction » vaut « Sortant ». Changez-les si besoin : Appel, Email, SMS, WhatsApp, Visite, Réunion, Note ou Tâche.'
      },
      { title: 'Écrire', detail: '« Sujet » est facultatif ; « Contenu » est obligatoire.' },
      {
        title: 'Dater',
        detail:
          "« Date d'occurrence » est préremplie avec l'instant présent : modifiez-la si l'échange a eu lieu avant."
      },
      {
        title: 'Planifier la suite (facultatif)',
        detail:
          "« Prochaine action » (date et heure) et « Type de prochaine action » (texte libre, par exemple « Rappel » ou « Envoyer un devis »). « Résultat » note l'issue de l'échange."
      },
      { title: 'Valider', detail: "Cliquez sur « Créer l'activité »." }
    ],
    consequences: [
      "L'activité s'ajoute en haut de la chronologie, avec votre nom comme auteur.",
      'Si vous renseignez « Prochaine action », une relance apparaît dans le calendrier à cette date. Elle compte dans « Actions en retard » du tableau de bord une fois la date dépassée.',
      'La date de dernière interaction du contact est mise à jour.',
      "Aucun e-mail, SMS ou WhatsApp n'est envoyé au contact : c'est une trace interne.",
      "La création est notée dans le journal d'activité de l'agence."
    ],
    faq: [
      {
        q: "Le message « Le contact est requis » s'affiche. Que faire ?",
        a: 'Sélectionnez un contact dans la liste. Une activité est toujours rattachée à un contact.'
      },
      {
        q: "Je ne trouve pas l'affaire que je cherche.",
        a: 'La liste ne montre que les affaires du contact choisi. Vérifiez le contact.'
      },
      {
        q: 'Un rappel sera-t-il envoyé à la date de prochaine action ?',
        a: "Non, aucun rappel automatique n'est envoyé. La date sert à faire apparaître la relance dans le calendrier et le plan de travail."
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande « Créer des activités ».' },
    related: [
      { label: 'Voir les relances dans le calendrier', helpId: 'commercial.activites.calendrier' },
      { label: 'Le plan de travail du tableau de bord', helpId: 'commercial.activites.tableau-de-bord.plan-de-travail' }
    ],
    keywords: ['nouvelle activité', 'créer une activité', 'enregistrer un appel', 'prochaine action', 'relance']
  },

  // ---------------------------------------------------------------------------
  // Calendrier
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.activites.calendrier',
    kind: 'page',
    title: 'Calendrier',
    summary:
      'Le calendrier rassemble vos relances (prochaines actions planifiées) et les visites de biens. Vous pouvez le lire en agenda, en mois, en semaine ou en jour.',
    purpose:
      "C'est l'outil de travail du quotidien : savoir qui rappeler, quelles visites sont prévues, et déplacer ou terminer une relance sans quitter l'écran.",
    steps: [
      {
        title: 'Choisir la vue',
        detail:
          "« Agenda », « Mois », « Semaine » ou « Jour ». Sur un écran étroit, l'agenda s'affiche par défaut ; sur un grand écran, c'est le mois."
      },
      {
        title: 'Restreindre',
        detail:
          'Cochez « Mon calendrier » pour ne voir que vos éléments, ou décochez « Afficher les relances » pour ne garder que les visites.'
      },
      {
        title: 'Chercher ou filtrer',
        detail:
          "La recherche porte sur le titre, le client, l'affaire, le lieu et le type d'action. Elle ne cherche que dans la période affichée."
      },
      {
        title: 'Ouvrir un événement',
        detail: "Cliquez dessus : un panneau « Détails de l'événement » s'ouvre."
      },
      {
        title: 'Déplacer une relance',
        detail: 'En vue Mois, Semaine ou Jour, glissez la relance vers un autre créneau.'
      },
      {
        title: 'Créer une relance',
        detail: 'Cliquez sur « Nouvelle relance » et remplissez le formulaire.'
      },
      {
        title: 'Exporter',
        detail:
          "Menu de l'en-tête : « Exporter en CSV » ou « Exporter en tableur ». L'export reprend les événements affichés, après vos filtres."
      }
    ],
    consequences: [
      'Une relance est une activité dont la « Prochaine action » est datée. Elle sort du calendrier quand vous la marquez comme terminée.',
      "Déplacer une relance change sa date de prochaine action, rien d'autre.",
      "Déplacer une visite de bien n'est pas encore possible depuis le calendrier : un message vous le dit.",
      "Aucun message n'est envoyé au contact quand vous déplacez ou terminez un événement."
    ],
    faq: [
      {
        q: 'Pourquoi ne vois-je pas les relances des autres collaborateurs avec « Mon calendrier » ?',
        a: "Cette case ne garde que les relances que vous avez créées et les visites qui vous sont confiées. Décochez-la pour voir toute l'agence."
      },
      {
        q: 'Une relance a disparu après un clic. Pourquoi ?',
        a: "« Marquer comme terminé » efface sa date de prochaine action : elle ne figure plus au calendrier. L'activité elle-même reste dans la liste des activités."
      },
      {
        q: '« Rendez-vous » et « Visite » donnent la même liste. Est-ce normal ?',
        a: "Oui, aujourd'hui ces deux choix affichent tous les rendez-vous et visites de biens. Seul « Relance » se distingue."
      },
      {
        q: "Je cherche un nom et rien n'apparaît.",
        a: 'La recherche ne couvre que la période affichée. Changez de mois, de semaine ou de jour.'
      }
    ],
    permissions: {
      feature: 'CRM',
      note: "Le serveur demande « Voir les activités » ; l'entrée de menu « Calendrier » dépend du droit « Voir les rendez-vous ». Déplacer ou terminer une relance demande « Créer des activités »."
    },
    related: [
      { label: 'Vues et filtres du calendrier', helpId: 'commercial.activites.calendrier.vues' },
      { label: "Détails d'un événement", helpId: 'commercial.activites.calendrier.evenement' },
      { label: 'Créer une relance', helpId: 'commercial.activites.calendrier.relance' },
      { label: 'Les activités', helpId: 'commercial.activites.liste' }
    ],
    keywords: ['agenda', 'rendez-vous', 'relance', 'visite', 'planning', 'rappeler', 'calendrier'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'calendrier-nouvelle-relance',
          title: 'Créer une relance',
          description: 'Ce bouton ouvre le formulaire : le contact, le contenu et la date de la prochaine action.'
        },
        {
          target: 'calendrier-vues',
          title: 'Choisir la vue',
          description: "Passez de l'agenda au mois, à la semaine ou au jour selon ce que vous voulez voir."
        },
        {
          target: 'calendrier-recherche',
          title: 'Chercher et filtrer',
          description:
            "Filtrez par type d'événement, collaborateur ou période. La recherche porte sur la période affichée."
        },
        {
          target: 'calendrier-contenu',
          title: 'Vos événements',
          description: 'Cliquez sur un événement pour voir ses détails, le marquer comme terminé ou ouvrir le contact.'
        }
      ]
    }
  },
  {
    id: 'commercial.activites.calendrier.vues',
    kind: 'section',
    title: 'Vues et filtres du calendrier',
    summary:
      'Choisissez comment afficher vos événements et lesquels garder : vue, « Mon calendrier », relances, recherche et filtres.',
    howToRead: {
      notes: [
        "« Agenda » : liste par jour (« Aujourd'hui », « Demain », puis la date). « Mois », « Semaine » et « Jour » : grille.",
        '« Mon calendrier » : seulement les relances que vous avez créées et les visites dont vous êtes responsable ou collaborateur.',
        '« Afficher les relances » : décochée, seules les visites de biens restent.',
        "Critère « Type d'événement » : « Relance » pour les prochaines actions ; « Rendez-vous » et « Visite » affichent tous les deux les visites et rendez-vous de biens.",
        "Critère « Collaborateur » : il filtre les visites assignées à cette personne. Les relances n'ont pas de collaborateur assigné : elles disparaissent quand ce critère est utilisé.",
        'Critère « Période personnalisée » : la date de début déplace le calendrier à cette date.',
        "En grille, les visites sont en couleur d'accent, les relances en vert ; un événement terminé ou annulé est grisé.",
        "Les événements chargés couvrent la période affichée plus une marge de part et d'autre : changez de période pour en voir d'autres."
      ]
    },
    faq: [
      {
        q: 'La vue change quand je passe sur téléphone. Pourquoi ?',
        a: "Sous 992 pixels de large, l'agenda s'affiche par défaut. Votre choix explicite de vue reste prioritaire."
      },
      {
        q: 'Comment retrouver la date du jour ?',
        a: "Dans le menu de l'en-tête, choisissez « Revenir à aujourd'hui »."
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande « Voir les activités ».' },
    related: [{ label: "Vue d'ensemble du calendrier", helpId: 'commercial.activites.calendrier' }],
    keywords: ['vue', 'agenda', 'mois', 'semaine', 'jour', 'mon calendrier', 'filtre']
  },
  {
    id: 'commercial.activites.calendrier.evenement',
    kind: 'section',
    title: "Détails d'un événement",
    summary:
      "Ce panneau montre un événement du calendrier : titre, étiquettes, date, lieu. Il permet d'ouvrir le contact, l'affaire ou le bien, et de marquer l'événement comme terminé.",
    steps: [
      { title: 'Lire', detail: "« Quand » donne la date et l'heure, « Lieu » l'adresse d'une visite." },
      {
        title: 'Ouvrir la fiche liée',
        detail: "« Voir » suivi du nom du contact, puis « Voir l'affaire » et « Voir le bien » quand ils existent."
      },
      { title: 'Terminer', detail: 'Cliquez sur « Marquer comme terminé ».' }
    ],
    consequences: [
      "Pour une relance : sa date de prochaine action est effacée. Elle disparaît du calendrier, du plan de travail et ne compte plus dans « Actions en retard ». L'activité reste dans la liste. Il n'y a pas d'annulation depuis le calendrier.",
      'Pour une visite de bien : elle passe à « Effectuée ». Si elle est liée à un contact, une activité de type « Visite » (« Visite de propriété terminée … ») est ajoutée à son historique.',
      "Aucun message n'est envoyé au contact.",
      'Le bouton est grisé quand la visite est déjà « Effectuée » ou « Annulée ».'
    ],
    faq: [
      {
        q: 'Le bouton « Marquer comme terminé » échoue pour une visite. Pourquoi ?',
        a: "Terminer une visite demande le droit de planifier les visites de biens. Demandez-le à l'administrateur de votre agence."
      },
      {
        q: 'Comment reporter une relance au lieu de la terminer ?',
        a: 'Fermez ce panneau et glissez la relance vers un autre créneau, en vue Mois, Semaine ou Jour.'
      }
    ],
    permissions: {
      feature: 'CRM',
      note: 'Terminer une relance demande « Créer des activités » ; terminer une visite demande le droit de planifier les visites de biens.'
    },
    related: [{ label: "Vue d'ensemble du calendrier", helpId: 'commercial.activites.calendrier' }],
    keywords: ['terminer', 'relance faite', 'visite effectuée', 'détails', 'marquer comme terminé']
  },
  {
    id: 'commercial.activites.calendrier.relance',
    kind: 'section',
    title: 'Nouvelle relance',
    summary:
      "Ce formulaire crée une relance : une tâche rattachée à un contact, datée par « Prochaine action ». C'est le même formulaire que celui des activités.",
    steps: [
      { title: 'Choisir le contact', detail: 'Champ « Contact » obligatoire.' },
      { title: 'Écrire le contenu', detail: "Champ « Contenu » obligatoire : ce qu'il faut faire ou dire." },
      {
        title: 'Dater la relance',
        detail: "Renseignez « Prochaine action ». Sans date, la relance est placée à l'instant de la création."
      },
      {
        title: 'Préciser (facultatif)',
        detail: '« Affaire (optionnel) », « Sujet », « Type de prochaine action », « Résultat ».'
      },
      { title: 'Valider', detail: "Cliquez sur « Créer l'activité »." }
    ],
    consequences: [
      "Quel que soit le « Type » choisi dans le formulaire, l'activité est enregistrée comme « Tâche ».",
      'Elle apparaît au calendrier à la date de prochaine action et dans la liste des activités.',
      "Aucun message n'est envoyé au contact et aucun rappel automatique n'est programmé."
    ],
    faq: [
      {
        q: "J'ai choisi « Appel » mais l'activité est une « Tâche ». Pourquoi ?",
        a: 'Dans le calendrier, toute relance créée est une tâche. Pour enregistrer un appel, utilisez la page Activités.'
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande « Créer des activités ».' },
    related: [{ label: "Formulaire d'activité détaillé", helpId: 'commercial.activites.liste.formulaire' }],
    keywords: ['nouvelle relance', 'créer une relance', 'rappeler', 'tâche']
  },

  // ---------------------------------------------------------------------------
  // Tableau de bord CRM
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.activites.tableau-de-bord',
    kind: 'page',
    title: 'Tableau de bord CRM',
    summary:
      "Une vue d'ensemble de l'activité commerciale : prospects, affaires, étapes du pipeline, entonnoir de conversion, évolution et actions à faire.",
    purpose:
      "Il aide le responsable commercial à voir où en est l'agence et ce qui demande une action aujourd'hui. Cliquez sur un indicateur ou sur une barre du pipeline pour ouvrir la liste correspondante.",
    steps: [
      {
        title: 'Choisir la période',
        detail: 'Boutons « Ce mois » et « 30 derniers jours » en haut à droite.'
      },
      {
        title: 'Lire les indicateurs',
        detail:
          "Les cartes du haut comptent les prospects et les affaires, avec l'écart par rapport à la période précédente."
      },
      {
        title: "Regarder le pipeline et l'entonnoir",
        detail: "Ils montrent où se trouvent les affaires et quelle part avance d'une étape à l'autre."
      },
      {
        title: 'Traiter le plan de travail',
        detail:
          'En bas, la liste des actions en retard, du jour et de la semaine ; cliquez sur une ligne pour ouvrir le contact.'
      }
    ],
    consequences: [
      'Ce tableau est en lecture seule : rien ne change quand vous le consultez.',
      "À ce jour, le serveur calcule les indicateurs et la courbe sur les 7 derniers jours, quelle que soit la période affichée en haut de page, et sans tenir compte d'un collaborateur choisi.",
      "Le pipeline, l'entonnoir, le plan de travail et « Actions en retard » portent sur toute l'agence, sans limite de période."
    ],
    faq: [
      {
        q: 'Les chiffres ne changent pas quand je clique sur « 30 derniers jours ». Pourquoi ?',
        a: 'Les dates affichées changent, mais le serveur calcule actuellement les indicateurs sur les 7 derniers jours. Voir la fiche « Période affichée ».'
      },
      {
        q: "Je ne vois pas la carte « Performance de l'équipe ».",
        a: "Elle ne s'affiche que si le serveur fournit des données d'équipe, ce qui n'est pas le cas pour le moment."
      },
      {
        q: 'Cliquer sur « Actions en retard » ne filtre pas la liste. Est-ce normal ?',
        a: 'Oui : le clic ouvre la liste des activités, sans filtre automatique sur les retards. Utilisez le calendrier ou le plan de travail pour les retrouver.'
      }
    ],
    permissions: {
      feature: 'CRM',
      note: "Le serveur demande « Voir les contacts » ; l'entrée de menu dépend des droits sur les contacts et les affaires."
    },
    related: [
      { label: 'Période affichée', helpId: 'commercial.activites.tableau-de-bord.periode' },
      { label: 'Les indicateurs', helpId: 'commercial.activites.tableau-de-bord.indicateurs' },
      { label: 'Le plan de travail', helpId: 'commercial.activites.tableau-de-bord.plan-de-travail' }
    ],
    keywords: [
      'tableau de bord',
      'kpi',
      'statistiques',
      'pipeline',
      'entonnoir',
      'performance',
      'leads',
      'indicateurs'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'dashboard-periode',
          title: 'La période',
          description:
            "Ces boutons changent les dates affichées. Le calcul des indicateurs est décrit dans l'aide de cette zone."
        },
        {
          target: 'dashboard-indicateurs',
          title: 'Les indicateurs',
          description:
            'Prospects, affaires créées et gagnées, actions en retard. Cliquez sur une carte pour ouvrir la liste.'
        },
        {
          target: 'dashboard-pipeline',
          title: 'Le pipeline',
          description:
            'Les affaires en cours, étape par étape. Cliquez sur une barre pour ouvrir les affaires de cette étape.'
        },
        {
          target: 'dashboard-plan-de-travail',
          title: 'Le plan de travail',
          description:
            'Les actions à faire maintenant et celles de la semaine. Cliquez sur une ligne pour ouvrir le contact.'
        }
      ]
    }
  },
  {
    id: 'commercial.activites.tableau-de-bord.periode',
    kind: 'section',
    title: 'Période affichée',
    summary:
      "Les boutons « Ce mois » et « 30 derniers jours » règlent les dates affichées sous le titre. Les dates se retrouvent dans l'adresse de la page.",
    howToRead: {
      notes: [
        "« Ce mois » : du premier au dernier jour du mois en cours. « 30 derniers jours » : de il y a 30 jours à aujourd'hui (réglage de départ).",
        "À ce jour, le serveur ne tient pas compte de ces dates : il calcule les indicateurs et la courbe sur les 7 derniers jours. Ce point est à corriger côté application ; l'aide sera mise à jour ensuite."
      ]
    },
    faq: [
      {
        q: 'Puis-je choisir une autre période ?',
        a: "L'écran ne propose que ces deux boutons."
      },
      {
        q: 'Puis-je partager ma vue avec un collègue ?',
        a: "Oui : les dates sont dans l'adresse de la page, que vous pouvez copier."
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande « Voir les contacts ».' },
    related: [{ label: 'Les indicateurs', helpId: 'commercial.activites.tableau-de-bord.indicateurs' }],
    keywords: ['période', 'ce mois', '30 jours', 'dates']
  },
  {
    id: 'commercial.activites.tableau-de-bord.indicateurs',
    kind: 'section',
    title: 'Indicateurs de la période',
    summary:
      'Quatre cartes comptent les prospects et les affaires : « Nouveaux leads », « Leads convertis », « Affaires créées » et « Affaires gagnées ».',
    howToRead: {
      notes: [
        '« Nouveaux leads » : contacts au statut « Prospect » créés pendant la période.',
        '« Leads convertis » : contacts au statut « Client actif » dont la fiche a été modifiée pendant la période. Le serveur ne retient pas la date exacte du passage à « Client actif ».',
        '« Affaires créées » : affaires créées pendant la période.',
        "« Affaires gagnées » : affaires à l'étape « Gagné » dont la dernière modification tombe dans la période.",
        "Sous le chiffre, une flèche indique la hausse, la baisse ou la stabilité, avec l'écart et le pourcentage par rapport à la période précédente de même durée. Un nombre au-dessus de 1 000 s'affiche en abrégé (1.2k).",
        "À ce jour, la période réellement calculée est celle des 7 derniers jours, et le choix d'un collaborateur n'est pas appliqué."
      ]
    },
    consequences: [
      "Cliquer sur une carte ouvre la liste des contacts (au statut « Prospect » ou « Client actif ») ou des affaires (créées, ou à l'étape « Gagné »)."
    ],
    faq: [
      {
        q: 'Pourquoi « Leads convertis » ne correspond-il pas à mes conversions ?',
        a: 'Il compte les clients actifs modifiés dans la période, pas seulement ceux qui viennent de passer de prospect à client.'
      },
      {
        q: "Pourquoi n'y a-t-il pas de courbe sous les chiffres ?",
        a: "La courbe miniature n'apparaît que si le serveur envoie l'historique, ce qui n'est pas le cas pour le moment."
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande « Voir les contacts ».' },
    related: [
      { label: 'Actions en retard', helpId: 'commercial.activites.tableau-de-bord.actions-en-retard' },
      { label: 'Période affichée', helpId: 'commercial.activites.tableau-de-bord.periode' }
    ],
    keywords: ['leads', 'prospects', 'affaires gagnées', 'affaires créées', 'conversion', 'kpi']
  },
  {
    id: 'commercial.activites.tableau-de-bord.actions-en-retard',
    kind: 'section',
    title: 'Actions en retard',
    summary:
      "Cette carte compte les activités dont la date de « Prochaine action » est dépassée et qui n'ont pas été marquées comme terminées.",
    howToRead: {
      notes: [
        "Le chiffre porte sur toute l'agence et ne dépend ni de la période, ni d'un collaborateur.",
        "Une action en retard est une activité dont la date de prochaine action est passée. Si le travail est fait mais que la relance n'a pas été terminée dans le calendrier, elle reste comptée.",
        "Cette carte n'a pas d'écart avec la période précédente."
      ]
    },
    steps: [
      {
        title: 'Retrouver les retards',
        detail: 'Ouvrez le plan de travail (onglet « À faire maintenant ») ou le calendrier.'
      },
      {
        title: 'Les solder',
        detail:
          'Dans le calendrier, ouvrez la relance et cliquez sur « Marquer comme terminé », ou glissez-la vers une nouvelle date.'
      }
    ],
    consequences: [
      'Cliquer sur la carte ouvre la liste des activités, sans filtre automatique sur les retards.',
      'Terminer ou déplacer une relance dans le calendrier fait baisser ce chiffre.'
    ],
    faq: [
      {
        q: 'Pourquoi ce chiffre est-il plus grand que la liste du plan de travail ?',
        a: "Le plan de travail n'affiche que les 10 retards les plus anciens, alors que la carte les compte tous."
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande « Voir les contacts ».' },
    related: [
      { label: 'Le plan de travail', helpId: 'commercial.activites.tableau-de-bord.plan-de-travail' },
      { label: 'Le calendrier', helpId: 'commercial.activites.calendrier' }
    ],
    keywords: ['retard', 'en retard', 'relances', 'à faire', 'prochaine action']
  },
  {
    id: 'commercial.activites.tableau-de-bord.pipeline',
    kind: 'section',
    title: 'Pipeline des affaires',
    summary:
      "Un histogramme montre combien d'affaires en cours se trouvent à chaque étape : Nouveau, Qualifié, Visite, Négociation.",
    howToRead: {
      statuses: [
        { value: 'NEW', label: 'Nouveau', description: "Affaire qui vient d'être ouverte." },
        { value: 'QUALIFIED', label: 'Qualifié', description: 'Le besoin du client est qualifié.' },
        { value: 'VISIT', label: 'Visite', description: 'Des visites sont en cours.' },
        { value: 'NEGOTIATION', label: 'Négociation', description: "L'offre est en discussion." }
      ],
      notes: [
        "Seules les affaires en cours sont comptées : les étapes « Gagné » et « Perdu » n'apparaissent pas.",
        'Passez la souris sur une barre : « Nombre », « Valeur » (somme des valeurs attendues des affaires, en FCFA) et « Âge moyen » (jours depuis la création des affaires).',
        "Le pipeline porte sur toute l'agence, sans limite de période."
      ]
    },
    consequences: ['Cliquer sur une barre ouvre la liste des affaires de cette étape.'],
    faq: [
      {
        q: 'Pourquoi la valeur est-elle de 0 FCFA ?',
        a: 'La valeur additionne la valeur attendue saisie sur chaque affaire. Une affaire sans valeur attendue compte pour 0.'
      },
      {
        q: 'Où sont les affaires gagnées et perdues ?',
        a: "Elles sont comptées dans « Affaires gagnées » et dans l'entonnoir, mais pas dans ce histogramme."
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande « Voir les contacts ».' },
    related: [{ label: "L'entonnoir de conversion", helpId: 'commercial.activites.tableau-de-bord.entonnoir' }],
    keywords: ['pipeline', 'étapes', 'affaires en cours', 'valeur', 'âge moyen', 'histogramme']
  },
  {
    id: 'commercial.activites.tableau-de-bord.entonnoir',
    kind: 'section',
    title: 'Entonnoir de conversion',
    summary:
      'Ce graphique montre quelle part des contacts atteint chaque étape : Leads, Qualifié, Visite, Négociation, Gagné.',
    howToRead: {
      notes: [
        "« Leads » : tous les contacts au statut « Prospect » ou « Client actif ». C'est la base, à 100 %.",
        'Chaque étape suivante compte les affaires qui ont atteint cette étape ou une étape plus avancée (« Qualifié » compte aussi les affaires en Visite, en Négociation et gagnées).',
        "Le pourcentage de « Qualifié » se mesure par rapport aux leads ; celui des étapes suivantes, par rapport à l'étape précédente.",
        "Passez la souris sur une barre : « Nombre », « Taux » et « Perte » (part de l'étape précédente qui n'a pas atteint celle-ci).",
        "Les barres sont triées du pourcentage le plus haut au plus bas, pas forcément dans l'ordre des étapes.",
        "L'entonnoir porte sur toute l'agence, sans limite de période. Les barres ne sont pas cliquables."
      ]
    },
    faq: [
      {
        q: 'Pourquoi un taux dépasse-t-il parfois 100 % ?',
        a: "Les affaires et les contacts sont comptés séparément : un même contact peut avoir plusieurs affaires, ce qui peut faire dépasser 100 % à l'étape « Qualifié »."
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande « Voir les contacts ».' },
    related: [{ label: 'Le pipeline', helpId: 'commercial.activites.tableau-de-bord.pipeline' }],
    keywords: ['entonnoir', 'conversion', 'taux', 'perte', 'funnel']
  },
  {
    id: 'commercial.activites.tableau-de-bord.evolution',
    kind: 'section',
    title: 'Évolution dans le temps',
    summary:
      'Une courbe suit trois séries : « Activités », « Nouveaux leads » et « Affaires gagnées ». Vous choisissez celles à afficher.',
    howToRead: {
      notes: [
        "« Activités » : activités enregistrées par toute l'agence. « Nouveaux leads » : contacts « Prospect » créés. « Affaires gagnées » : affaires à l'étape « Gagné » modifiées.",
        "Chaque point regroupe les chiffres d'un jour ou d'une semaine.",
        'Cliquez sur une pastille (« Activités », « Nouveaux leads », « Affaires gagnées ») pour afficher ou masquer la série.',
        'Passez la souris sur la courbe pour lire les valeurs ; la barre sous le graphique permet de zoomer sur une partie de la période.',
        'À ce jour, la période calculée est celle des 7 derniers jours.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi la série « Activités » ne change-t-elle pas quand je choisis un collaborateur ?',
        a: "Elle compte les activités de toute l'agence."
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande « Voir les contacts ».' },
    related: [{ label: 'Période affichée', helpId: 'commercial.activites.tableau-de-bord.periode' }],
    keywords: ['évolution', 'courbe', 'graphique', 'tendance', 'temps']
  },
  {
    id: 'commercial.activites.tableau-de-bord.plan-de-travail',
    kind: 'section',
    title: 'Plan de travail',
    summary:
      'La liste des actions à faire : celles en retard et celles du jour (« À faire maintenant »), puis celles des prochains jours (« Cette semaine »).',
    howToRead: {
      notes: [
        "Une ligne est une activité dont la « Prochaine action » est datée. Elle indique le type d'action (ou « Action requise »), le sujet, la date et l'heure, le contact et l'affaire.",
        '« À faire maintenant » : les 10 actions en retard les plus anciennes, puis toutes celles du jour.',
        "« Cette semaine » : jusqu'à 10 actions des 7 prochains jours, après aujourd'hui.",
        "Le plan de travail porte sur toute l'agence : il n'est pas limité à vos actions.",
        'Les petites icônes à droite de chaque ligne ne déclenchent rien pour le moment. Pour terminer ou déplacer une action, utilisez le calendrier.'
      ]
    },
    steps: [
      { title: "Choisir l'onglet", detail: '« À faire maintenant » ou « Cette semaine ».' },
      { title: 'Ouvrir le contact', detail: "Cliquez sur une ligne : la fiche du contact s'ouvre." },
      {
        title: 'Solder dans le calendrier',
        detail: "Ouvrez le calendrier pour marquer l'action comme terminée ou la déplacer."
      }
    ],
    consequences: ['Consulter le plan de travail ne modifie rien.'],
    faq: [
      {
        q: "Ma relance n'apparaît pas ici.",
        a: "Elle n'y figure que si sa date est en retard, du jour ou dans les 7 jours qui suivent. Au-delà, elle reste visible dans le calendrier."
      },
      {
        q: 'Les messages « Tout est à jour ! » et « Aucun élément cette semaine » veulent-ils dire quoi ?',
        a: "Aucune action n'est en retard ni prévue aujourd'hui, ou aucune n'est prévue dans les 7 prochains jours."
      }
    ],
    permissions: { feature: 'CRM', note: 'Demande « Voir les contacts ».' },
    related: [
      { label: 'Actions en retard', helpId: 'commercial.activites.tableau-de-bord.actions-en-retard' },
      { label: 'Le calendrier', helpId: 'commercial.activites.calendrier' }
    ],
    keywords: ['plan de travail', 'à faire', 'relances', 'cette semaine', "aujourd'hui", 'workbench']
  }
];

export default entries;
