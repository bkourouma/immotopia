import type { HelpEntry } from '../../../types';

/** Zone « affaires » du module « commercial » (fr) : liste, création, modification et fiche d'une affaire. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Liste des affaires
  {
    id: 'commercial.affaires.liste',
    kind: 'page',
    title: 'Affaires (pipeline commercial)',
    summary:
      'Retrouvez ici les affaires de votre agence : les demandes de vos clients (achat, location, vente, gestion, mandat), classées selon leur avancement, en pipeline ou en liste.',
    purpose:
      "Une affaire suit une opportunité avec un contact. Elle démarre toujours à l'étape « Nouveau » et avance jusqu'à « Gagné » ou « Perdu ». C'est votre tableau de suivi des clients à relancer.",
    steps: [
      {
        title: 'Créer une affaire',
        detail:
          "« Nouvelle affaire » ouvre le formulaire en haut de la page. Choisissez le type et le contact, puis « Créer l'affaire »."
      },
      {
        title: 'Chercher et filtrer',
        detail:
          'Utilisez « Rechercher » et les critères Étape, Type et Collaborateur. « Plus de critères » ajoute la date de création et le budget.'
      },
      {
        title: 'Choisir la vue',
        detail: '« Pipeline » (ouverte par défaut) montre une colonne par étape ; « Liste » montre un tableau.'
      },
      {
        title: 'Faire avancer une affaire',
        detail: "En pipeline, glissez la carte vers la nouvelle étape. Vous pouvez aussi changer l'étape dans la fiche."
      },
      {
        title: 'Ouvrir ou exporter',
        detail:
          'Cliquez sur une carte ou sur « Voir les détails ». « CSV » et « Excel » exportent toutes les affaires qui correspondent à vos critères.'
      }
    ],
    consequences: [
      'Une nouvelle affaire démarre toujours à « Nouveau », même créée depuis une autre colonne.',
      "Déplacer une carte change l'étape tout de suite, sans confirmation. Aucun e-mail ni message n'est envoyé au client ; le changement est inscrit au journal d'audit.",
      "Une affaire ne se supprime pas : pour la clore, passez-la à « Gagné » ou « Perdu ». Depuis le Pipeline sans critère d'étape, l'export exclut ces deux étapes."
    ],
    faq: [
      {
        q: 'Où sont les affaires « Gagné » et « Perdu » ?',
        a: "Le pipeline n'affiche par défaut que quatre étapes. Choisissez-les dans le critère Étape, ou passez en vue Liste."
      },
      {
        q: 'Je ne vois pas les actions de création ou de modification.',
        a: "Elles demandent les droits « Créer des affaires » et « Modifier les affaires ». Voyez avec l'administrateur de votre agence."
      },
      {
        q: "La carte revient dans sa colonne ou une erreur s'affiche.",
        a: "L'enregistrement a échoué (droit manquant, ou affaire modifiée par un collègue). Actualisez la page et recommencez."
      }
    ],
    permissions: {
      feature: 'CRM',
      note: "Voir : « Voir les affaires ». Créer : « Créer des affaires ». Modifier ou changer l'étape : « Modifier les affaires »."
    },
    related: [
      { label: 'Recherche, critères et vues', helpId: 'commercial.affaires.liste.recherche' },
      { label: 'Le pipeline par étape', helpId: 'commercial.affaires.liste.kanban' },
      { label: 'Le tableau de la vue Liste', helpId: 'commercial.affaires.liste.tableau' },
      { label: 'Créer une affaire', helpId: 'commercial.affaires.nouvelle' }
    ],
    keywords: [
      'affaire',
      'affaires',
      'pipeline',
      'kanban',
      'opportunité',
      'prospect',
      'étape',
      'client',
      'deal',
      'commercial',
      'export'
    ],
    tour: {
      steps: [
        {
          target: 'affaires-nouvelle',
          title: 'Créer une affaire',
          description: 'Ce bouton ouvre le formulaire de création.'
        },
        {
          target: 'affaires-recherche',
          title: 'Rechercher et filtrer',
          description: 'Tapez un nom ou une zone, ou filtrez par étape, type ou collaborateur.'
        },
        {
          target: 'affaires-vues',
          title: 'Liste ou pipeline',
          description: 'Basculez entre le tableau et les colonnes par étape.'
        },
        {
          target: 'affaires-pipeline',
          title: 'Le pipeline',
          description: "Glissez une carte vers une autre colonne pour changer l'étape."
        },
        {
          target: 'affaires-tableau',
          title: 'Le tableau',
          description: "Une ligne par affaire ; les icônes ouvrent l'affaire ou son formulaire."
        }
      ]
    }
  },
  {
    id: 'commercial.affaires.liste.recherche',
    kind: 'section',
    title: 'Recherche, critères et choix de la vue',
    summary:
      "Cette barre filtre en même temps le pipeline, la liste et l'export. Elle regroupe le champ « Rechercher », les critères et le choix entre « Liste » et « Pipeline ».",
    howToRead: {
      notes: [
        '« Rechercher » : tapez un nom ou une raison sociale de contact, un e-mail, un téléphone, une zone, le nom du collaborateur assigné ou le motif de clôture.',
        "Étape : une ou plusieurs étapes parmi Nouveau, Qualifié, Visite, Négociation, Gagné et Perdu. En pipeline, seules les colonnes choisies s'affichent.",
        'Type : Achat, Location, Vente, Gestion de biens, Mandat.',
        'Collaborateur : ne garde que les affaires assignées à ce collaborateur.',
        'Sous « Plus de critères » : Date de création (période) et Budget (minimum et maximum, en FCFA).',
        "Le nombre de résultats s'affiche à côté de la barre. Les critères sont conservés dans l'adresse de la page."
      ]
    },
    steps: [
      { title: 'Saisir ou choisir', detail: 'Tapez dans « Rechercher » ou choisissez une valeur dans un critère.' },
      { title: 'Ajouter des critères', detail: 'Cliquez sur « Plus de critères » pour la date et le budget.' },
      { title: 'Repartir de zéro', detail: 'Si rien ne correspond, « Effacer les critères » retire tous les filtres.' }
    ],
    consequences: [
      'Filtrer ne modifie aucune affaire : cela change seulement ce qui est affiché et ce qui sera exporté.'
    ],
    faq: [
      {
        q: 'Le choix Liste ou Pipeline est-il mémorisé ?',
        a: "Non : à chaque ouverture de la page, la vue « Pipeline » s'affiche d'abord."
      },
      {
        q: 'Pourquoi le filtre Collaborateur ne trouve-t-il rien ?',
        a: "Il ne montre que les affaires qui ont un collaborateur assigné. Une affaire sans collaborateur n'apparaît dans aucun résultat de ce filtre."
      },
      {
        q: 'Le filtre Étape change-t-il le pipeline ?',
        a: "Oui : le pipeline n'affiche plus que les colonnes des étapes choisies, y compris « Gagné » et « Perdu » si vous les choisissez."
      }
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: "Vue d'ensemble des affaires", helpId: 'commercial.affaires.liste' }],
    keywords: ['filtre', 'recherche', 'critères', 'budget', 'étape', 'type', 'collaborateur', 'date']
  },
  {
    id: 'commercial.affaires.liste.kanban',
    kind: 'section',
    title: 'Pipeline des affaires',
    summary:
      "Chaque colonne est une étape de la vie d'une affaire et chaque carte est une affaire. Glissez une carte d'une colonne à l'autre pour la faire avancer.",
    purpose: "Le pipeline montre d'un coup d'œil où en sont vos clients et ce qui est en attente à chaque étape.",
    howToRead: {
      statuses: [
        {
          value: 'NEW',
          label: 'Nouveau',
          description: "Nouvelle demande, pas encore qualifiée. C'est l'étape de départ."
        },
        { value: 'QUALIFIED', label: 'Qualifié', description: 'Le besoin du client est précisé et jugé sérieux.' },
        { value: 'VISIT', label: 'Visite', description: 'Le client visite ou va visiter des biens.' },
        { value: 'NEGOTIATION', label: 'Négociation', description: "L'affaire est en cours de négociation." },
        {
          value: 'WON',
          label: 'Gagné',
          description:
            "L'affaire est conclue. Cette colonne n'apparaît que si vous la choisissez dans le critère Étape."
        },
        {
          value: 'LOST',
          label: 'Perdu',
          description:
            "L'affaire est abandonnée. Cette colonne n'apparaît que si vous la choisissez dans le critère Étape."
        }
      ],
      notes: [
        "Le nombre en haut de chaque colonne est le total des affaires de l'étape, même si toutes les cartes ne sont pas encore chargées.",
        "Une carte montre le contact (initiales et nom), l'ancienneté (l'heure si c'est aujourd'hui, « 3j » pour trois jours, sinon jour et mois), le type d'affaire, le budget maximum en FCFA et la zone.",
        'Les cartes se chargent par 30 : « Afficher plus » en bas de colonne charge les suivantes. « Il semble que cette étape soit vide » signale une colonne sans affaire.',
        "« Ajouter une affaire » en haut d'une colonne ouvre le formulaire de création en haut de la page ; l'affaire commence toujours à « Nouveau »."
      ]
    },
    steps: [
      { title: 'Ouvrir une affaire', detail: 'Cliquez sur sa carte.' },
      {
        title: "Changer l'étape",
        detail: 'Glissez la carte vers la colonne voulue, puis relâchez.'
      },
      { title: 'Voir plus de cartes', detail: 'Cliquez sur « Afficher plus » en bas de la colonne.' },
      {
        title: 'Voir Gagné ou Perdu',
        detail: "Choisissez l'étape dans le critère Étape de la barre de recherche."
      }
    ],
    consequences: [
      "Relâcher la carte change l'étape immédiatement, sans confirmation ni message de réussite ; les deux colonnes concernées se rechargent.",
      "C'est réversible : remettez la carte dans son ancienne colonne. Quitter « Gagné » ou « Perdu » efface la date de clôture de l'affaire.",
      "Aucun e-mail ni message n'est envoyé au client. Le changement est inscrit au journal d'audit.",
      "Si l'enregistrement échoue (droit manquant, affaire modifiée par un collègue), un message d'erreur s'affiche et la carte reste dans sa colonne."
    ],
    faq: [
      {
        q: 'Je ne peux pas glisser les cartes sur mon téléphone.',
        a: "Le glisser-déposer dépend de votre appareil. S'il ne fonctionne pas, ouvrez l'affaire et changez l'étape depuis sa fiche."
      },
      {
        q: "Où voir la valeur estimée d'une affaire ?",
        a: "La carte montre le budget maximum du client. La valeur estimée de la transaction se lit dans la fiche de l'affaire."
      },
      {
        q: 'Le total de la colonne est plus grand que le nombre de cartes visibles.',
        a: 'Les cartes se chargent par 30. Cliquez sur « Afficher plus » pour afficher les suivantes.'
      }
    ],
    permissions: {
      feature: 'CRM',
      note: 'Déplacer une carte demande « Modifier les affaires ».'
    },
    related: [
      { label: "Changer l'étape depuis la fiche", helpId: 'commercial.affaires.detail.etape' },
      { label: 'Recherche, critères et vues', helpId: 'commercial.affaires.liste.recherche' }
    ],
    keywords: ['kanban', 'colonne', 'carte', 'glisser', 'étape', 'pipeline', 'nouveau', 'qualifié', 'négociation']
  },
  {
    id: 'commercial.affaires.liste.tableau',
    kind: 'table',
    title: 'Tableau des affaires (vue Liste)',
    summary:
      "Chaque ligne est une affaire de votre agence. Le tableau montre le type, le contact, l'étape, le budget et la zone, avec des icônes d'action.",
    howToRead: {
      columns: [
        {
          key: 'type',
          label: 'Type',
          description: "Le type d'affaire : Achat, Location, Vente, Gestion de biens ou Mandat."
        },
        { key: 'contact', label: 'Contact', description: "Le prénom et le nom du contact concerné par l'affaire." },
        {
          key: 'stage',
          label: 'Stade',
          description: "L'étape actuelle de l'affaire, dans une pastille de couleur (voir les étapes ci-dessous)."
        },
        {
          key: 'budget',
          label: 'Budget',
          description:
            "Le budget du client en FCFA : « minimum - maximum FCFA », ou « Jusqu'à … FCFA » s'il n'y a qu'un maximum. Un tiret signifie qu'aucun budget maximum n'est saisi."
        },
        {
          key: 'locationZone',
          label: 'Localisation',
          description: "La zone ou commune visée. Un tiret signifie qu'elle n'est pas renseignée."
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            "Quatre icônes : « Ajouter une activité » et « Ajouter un rendez-vous » (elles ouvrent toutes deux le formulaire d'activité de l'affaire, en haut de la page), « Voir les détails » et « Modifier »."
        }
      ],
      statuses: [
        { value: 'NEW', label: 'Nouveau', description: "Nouvelle demande. C'est l'étape de départ de toute affaire." },
        { value: 'QUALIFIED', label: 'Qualifié', description: 'Le besoin du client est précisé.' },
        { value: 'VISIT', label: 'Visite', description: 'Le client visite ou va visiter des biens.' },
        { value: 'NEGOTIATION', label: 'Négociation', description: "L'affaire est en négociation." },
        { value: 'WON', label: 'Gagné', description: "L'affaire est conclue." },
        { value: 'LOST', label: 'Perdu', description: "L'affaire est abandonnée." }
      ],
      notes: [
        "Les affaires les plus récentes sont en premier. Le tableau n'est pas triable par colonne : utilisez la recherche et les filtres.",
        'La liste affiche 20 affaires par page, avec « Précédent » et « Suivant » quand il y en a davantage. Elle montre toutes les étapes, « Gagné » et « Perdu » compris, sauf filtre contraire.',
        "L'icône « Modifier » ouvre le formulaire de modification en haut de la page, sans quitter la liste."
      ]
    },
    steps: [
      { title: 'Ouvrir une affaire', detail: "Cliquez sur l'icône « Voir les détails » de la ligne." },
      {
        title: 'Corriger une affaire',
        detail: "Cliquez sur l'icône « Modifier », changez les champs, puis « Mettre à jour l'affaire »."
      }
    ],
    consequences: [
      "Enregistrer une modification recharge la liste. L'étape ne se change pas dans ce formulaire : utilisez le pipeline ou la fiche de l'affaire."
    ],
    faq: [
      {
        q: "Comment changer l'étape depuis la liste ?",
        a: 'Ouvrez la fiche avec « Voir les détails » et choisissez la nouvelle étape dans la liste déroulante, ou passez en vue Pipeline.'
      },
      {
        q: 'Que signifie un tiret dans une colonne ?',
        a: "L'information n'est pas renseignée dans l'affaire (pas de budget maximum, pas de zone)."
      },
      {
        q: "Pourquoi « Ajouter un rendez-vous » ouvre-t-il un formulaire d'activité ?",
        a: "Les deux icônes ouvrent le même formulaire d'ajout d'activité de l'affaire, en haut de la page."
      }
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: "Vue d'ensemble des affaires", helpId: 'commercial.affaires.liste' }],
    keywords: ['tableau', 'liste', 'colonnes', 'statuts', 'étape', 'stade', 'budget', 'localisation', 'actions']
  },

  // ---------------------------------------------------------------- Création
  {
    id: 'commercial.affaires.nouvelle',
    kind: 'page',
    title: 'Créer une affaire',
    summary:
      "Ce formulaire enregistre une nouvelle affaire : ce que cherche ou propose un contact, son budget, la zone et le type de bien. L'affaire est créée à l'étape « Nouveau ».",
    purpose:
      "Créez une affaire dès qu'un client exprime un besoin : elle rattache la demande à son contact et la fait entrer dans le pipeline, pour ne plus la perdre de vue.",
    steps: [
      {
        title: "Choisir le type d'affaire",
        detail: 'Achat, Location, Vente, Gestion de biens ou Mandat. « Achat » est proposé par défaut.'
      },
      {
        title: 'Choisir le contact',
        detail:
          "Le contact est obligatoire. Si vous arrivez depuis la fiche d'un contact, il est déjà retenu et le champ n'apparaît pas."
      },
      { title: 'Indiquer budget et zone', detail: 'Budget minimum et maximum en FCFA, puis la commune recherchée.' },
      { title: 'Préciser le bien', detail: 'Type de bien, valeur estimée, puis les critères qui en dépendent.' },
      {
        title: 'Décrire le besoin',
        detail: 'Ajoutez les contraintes du client dans « Description / Besoins spécifiques ».'
      },
      { title: 'Enregistrer', detail: "Cliquez sur « Créer l'affaire ». « Annuler » abandonne la saisie." }
    ],
    consequences: [
      "L'affaire est créée à l'étape « Nouveau ». Le formulaire n'a pas de champ « Étape » : elle se change ensuite depuis le pipeline ou la fiche.",
      "La création n'envoie aucun e-mail ni message ; elle est inscrite au journal d'audit.",
      "Après l'enregistrement, vous revenez à la fiche du contact si vous veniez de lui, sinon à la liste des affaires.",
      "Le même formulaire s'ouvre en haut de la liste avec « Nouvelle affaire » : vous y restez après l'enregistrement."
    ],
    faq: [
      {
        q: 'Que faut-il remplir au minimum ?',
        a: "Seul le contact est obligatoire (le type d'affaire est déjà choisi). Si le budget maximum est inférieur au budget minimum, l'enregistrement est refusé."
      },
      {
        q: 'Je ne trouve pas mon contact.',
        a: "Créez-le d'abord dans les contacts, puis revenez créer l'affaire."
      },
      {
        q: "Puis-je choisir l'étape à la création ?",
        a: "Non, l'affaire commence toujours à « Nouveau ». Faites-la avancer ensuite dans le pipeline."
      }
    ],
    permissions: { feature: 'CRM', note: 'Créer une affaire demande « Créer des affaires ».' },
    related: [
      { label: 'Informations générales', helpId: 'commercial.affaires.nouvelle.informations' },
      { label: 'Budget et localisation', helpId: 'commercial.affaires.nouvelle.budget' },
      { label: 'Critères spécifiques', helpId: 'commercial.affaires.nouvelle.criteres' },
      { label: 'Liste des affaires', to: '/tenant/:tenantId/crm/deals' }
    ],
    keywords: ['nouvelle affaire', 'créer une affaire', 'ajouter une affaire', 'opportunité', 'prospect', 'besoin'],
    tour: {
      steps: [
        {
          target: 'affaire-informations',
          title: 'Type et contact',
          description: "Choisissez le type d'affaire et le contact concerné : le contact est obligatoire."
        },
        {
          target: 'affaire-budget',
          title: 'Budget et zone',
          description: 'Indiquez la fourchette de budget en FCFA et la commune recherchée.'
        },
        {
          target: 'affaire-bien',
          title: 'Type de bien',
          description: 'Choisissez le type de bien : les critères proposés à droite en dépendent.'
        },
        {
          target: 'affaire-enregistrer',
          title: 'Enregistrer',
          description: "L'affaire est créée à l'étape « Nouveau », sans message envoyé au client."
        }
      ]
    }
  },
  {
    id: 'commercial.affaires.nouvelle.informations',
    kind: 'section',
    title: 'Informations générales',
    summary: "Les deux champs essentiels d'une affaire : son type et le contact concerné.",
    howToRead: {
      notes: [
        'Achat : le contact cherche à acheter un bien.',
        'Location : le contact cherche à louer un bien.',
        'Vente : un propriétaire souhaite vendre son bien.',
        'Gestion de biens : un propriétaire souhaite confier la gestion de son bien.',
        'Mandat : un mandat de gestion, de vente ou de location.',
        "Contact : obligatoire. Sans contact, l'enregistrement affiche « Le contact est requis »."
      ]
    },
    steps: [
      { title: 'Choisir le type', detail: "Ouvrez la liste « Type d'affaire » et choisissez la ligne qui correspond." },
      { title: 'Choisir le contact', detail: 'Ouvrez la liste « Contact » et sélectionnez la personne concernée.' }
    ],
    consequences: [
      "Le type peut être changé plus tard avec « Modifier ». Il apparaît dans le pipeline, la liste, l'export et la fiche."
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Créer une affaire', helpId: 'commercial.affaires.nouvelle' }],
    keywords: ['type', 'achat', 'location', 'vente', 'gestion', 'mandat', 'contact']
  },
  {
    id: 'commercial.affaires.nouvelle.budget',
    kind: 'section',
    title: 'Budget et localisation',
    summary:
      "La fourchette de budget du client en FCFA et la commune qu'il vise. Ces champs sont facultatifs mais très utiles.",
    howToRead: {
      notes: [
        "Budget minimum et Budget maximum : en FCFA. Le budget maximum doit être supérieur au minimum, sinon l'enregistrement affiche une erreur sous le champ.",
        "Zone géographique (Commune) : tapez le nom d'une commune et choisissez-la dans la liste.",
        'Le budget maximum apparaît sur la carte du pipeline. Le budget, la zone et le nombre de pièces servent aussi à la recherche de biens correspondants.'
      ]
    },
    steps: [
      {
        title: 'Saisir le budget',
        detail: 'Tapez les montants sans espace : ils se mettent en forme automatiquement.'
      },
      { title: 'Choisir la commune', detail: 'Tapez par exemple « Cocody » et sélectionnez le résultat.' }
    ],
    consequences: [
      'Un champ laissé vide ne bloque rien. Dans la recherche de biens, un budget ou une zone non renseigné compte comme une correspondance parfaite.'
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Biens correspondants', helpId: 'commercial.affaires.detail.correspondance' }],
    keywords: ['budget', 'fcfa', 'zone', 'commune', 'localisation', 'minimum', 'maximum']
  },
  {
    id: 'commercial.affaires.nouvelle.bien',
    kind: 'section',
    title: 'Type de bien et valeur estimée',
    summary: "Le type de bien recherché ou proposé, et le montant auquel l'affaire devrait se conclure.",
    howToRead: {
      notes: [
        'Type de bien : Appartement, Villa, Maison, Terrain, Bureau, Local commercial, Studio, Duplex, Penthouse, Immeuble ou Autre. Le champ est facultatif et peut être vidé.',
        "Valeur estimée de la transaction (FCFA) : le montant estimé auquel l'affaire devrait se conclure. Ce n'est pas le budget du client."
      ]
    },
    steps: [
      {
        title: 'Choisir le type de bien',
        detail: 'La carte « Critères spécifiques » à droite se complète selon votre choix.'
      },
      { title: 'Saisir la valeur estimée', detail: 'Facultatif : indiquez le montant en FCFA.' }
    ],
    consequences: [
      "La valeur estimée n'apparaît pas dans le pipeline ni dans la liste : vous la retrouvez dans la fiche de l'affaire."
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Critères spécifiques', helpId: 'commercial.affaires.nouvelle.criteres' }],
    keywords: ['type de bien', 'appartement', 'villa', 'terrain', 'valeur estimée', 'immeuble']
  },
  {
    id: 'commercial.affaires.nouvelle.criteres',
    kind: 'section',
    title: 'Critères spécifiques',
    summary:
      'Cette carte change selon le type de bien choisi. Remplissez ce qui compte pour le client : tout est facultatif.',
    howToRead: {
      notes: [
        "Tant qu'aucun type de bien n'est choisi, la carte vous invite à en sélectionner un.",
        'Appartement, studio, duplex, penthouse : nombre de pièces, surface, état du meublé, étage, équipements (ascenseur, parking, balcon, terrasse).',
        'Villa, maison : surface habitable, surface du terrain, équipements (jardin, piscine, garage, parking).',
        'Terrain : superficie, type de terrain (Urbain, Village, Agricole, Industriel), viabilisé, constructible.',
        'Bureau : surface, nombre de bureaux, réception, parking. Local commercial : surface, type de commerce, vitrine, parking.',
        "Immeuble : nombre d'étages et d'appartements, standing, places de parking, taux d'occupation, ascenseur. Autre : une description du bien recherché."
      ]
    },
    steps: [
      { title: "Choisir d'abord le type de bien", detail: 'Les champs de la carte apparaissent aussitôt.' },
      { title: 'Compléter les critères utiles', detail: 'Laissez vide ce que le client ne précise pas.' }
    ],
    consequences: [
      "Les critères sont enregistrés avec l'affaire et s'affichent dans la carte « Type de bien et critères » de la fiche.",
      'À ce jour, la recherche de biens correspondants lit surtout le budget, la zone et le nombre de pièces ; la surface et les équipements sont conservés pour votre information.',
      "Si vous changez de type de bien avant d'enregistrer, seuls les critères du type finalement choisi sont enregistrés."
    ],
    faq: [
      {
        q: 'Pourquoi certains champs disparaissent-ils ?',
        a: "Chaque type de bien a ses propres critères. Changez le type de bien pour afficher les champs d'un autre type."
      },
      {
        q: 'Les critères sont-ils obligatoires ?',
        a: "Non. Tous les critères sont facultatifs : un critère vide n'exclut aucun bien."
      },
      {
        q: 'Où retrouver ces critères ensuite ?',
        a: "Dans la fiche de l'affaire, carte « Type de bien et critères ». Seuls les critères renseignés y figurent."
      }
    ],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Type de bien et valeur estimée', helpId: 'commercial.affaires.nouvelle.bien' }],
    keywords: ['critères', 'pièces', 'surface', 'équipements', 'jardin', 'piscine', 'parking', 'étage', 'standing']
  },
  {
    id: 'commercial.affaires.nouvelle.complements',
    kind: 'section',
    title: 'Informations complémentaires',
    summary: 'Un champ libre pour noter les besoins du client : contraintes, équipements souhaités, délais.',
    howToRead: {
      notes: [
        "Le texte saisi dans « Description / Besoins spécifiques » s'affiche dans la fiche de l'affaire, dans une carte du même nom.",
        'Si le type de bien est « Autre », le champ « Description du type de bien » reprend le même texte : les deux champs sont liés.'
      ]
    },
    steps: [{ title: 'Décrire le besoin', detail: 'Écrivez avec vos mots ce que le client attend de cette affaire.' }],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Créer une affaire', helpId: 'commercial.affaires.nouvelle' }],
    keywords: ['description', 'besoins', 'contraintes', 'notes']
  },

  // ---------------------------------------------------------------- Modification
  {
    id: 'commercial.affaires.modifier',
    kind: 'page',
    title: 'Modifier une affaire',
    summary:
      "Le formulaire de modification est celui de la création, rempli avec les informations actuelles de l'affaire. Changez ce qui a évolué, puis cliquez sur « Mettre à jour l'affaire ».",
    steps: [
      {
        title: 'Ouvrir le formulaire',
        detail: "Depuis la fiche de l'affaire, cliquez sur « Modifier »."
      },
      {
        title: 'Changer les champs',
        detail: 'Les sections sont les mêmes que pour la création : voir « Créer une affaire ».'
      },
      {
        title: 'Enregistrer',
        detail: "« Mettre à jour l'affaire » vous ramène à la fiche. « Annuler » y revient sans rien changer."
      }
    ],
    consequences: [
      "Le formulaire n'a pas de champ « Étape » : changez l'étape depuis le pipeline ou depuis la fiche.",
      "À l'enregistrement, l'application vérifie que personne n'a modifié l'affaire entre-temps. Sinon : « Cette affaire a été modifiée par un autre utilisateur. Actualisez la page et réessayez. »",
      "Les activités de l'affaire sont conservées. Aucun e-mail ni message n'est envoyé ; la modification est inscrite au journal d'audit."
    ],
    faq: [
      {
        q: "Comment changer l'étape d'une affaire ?",
        a: "Ce n'est pas dans ce formulaire : ouvrez la fiche et utilisez la liste déroulante, ou glissez la carte dans le pipeline."
      },
      {
        q: 'Je vois « modifiée par un autre utilisateur ».',
        a: "Un collègue a enregistré l'affaire avant vous. Actualisez la page pour voir ses changements, puis refaites votre modification."
      },
      {
        q: 'Les activités déjà saisies sont-elles perdues ?',
        a: "Non. Modifier l'affaire ne touche pas à son historique d'activités."
      }
    ],
    permissions: { feature: 'CRM', note: 'Modifier une affaire demande « Modifier les affaires ».' },
    related: [
      { label: 'Créer une affaire', helpId: 'commercial.affaires.nouvelle' },
      { label: "Fiche d'une affaire", helpId: 'commercial.affaires.detail' }
    ],
    keywords: ['modifier une affaire', 'corriger', 'mettre à jour', 'éditer']
  },

  // ---------------------------------------------------------------- Fiche d'une affaire
  {
    id: 'commercial.affaires.detail',
    kind: 'page',
    title: "Fiche d'une affaire",
    summary:
      "Cette page rassemble ce que vous savez d'une affaire : contact, budget, critères, dernières activités et biens correspondants. C'est ici que vous changez l'étape, modifiez l'affaire et cherchez des biens à proposer.",
    purpose:
      'Ouvrez la fiche avant un appel ou un rendez-vous pour retrouver ce que le client cherche et ce qui a déjà été fait.',
    howToRead: {
      notes: [
        "L'en-tête montre le type d'affaire, l'étape (pastille de couleur), puis le contact, son e-mail, son téléphone, la zone, le budget et les dates « Créé le » et « Modifié le ». Une ligne absente signifie que l'information n'est pas renseignée.",
        "Le budget s'écrit « minimum - maximum FCFA », « Jusqu'à … FCFA » ou « À partir de … FCFA » selon ce qui est saisi.",
        "Les cartes « Type de bien et critères » et « Description / Besoins spécifiques » n'apparaissent que si ces informations ont été saisies."
      ]
    },
    steps: [
      {
        title: "Changer l'étape",
        detail: 'Choisissez la nouvelle étape dans la liste déroulante, sous le bouton « Retour ».'
      },
      { title: 'Modifier', detail: 'Cliquez sur « Modifier » pour ouvrir le formulaire.' },
      { title: 'Revenir', detail: '« Retour » ramène à la liste des affaires.' },
      {
        title: 'Chercher des biens',
        detail: 'Dans la carte « Correspondance de propriétés », cliquez sur « Rechercher des correspondances ».'
      }
    ],
    consequences: [
      "Le changement d'étape est enregistré dès que vous choisissez, avec le message « Stade de l'affaire mis à jour ». Voir l'aide de l'étape pour le détail.",
      'Une affaire ne se supprime pas : pour la clore, passez-la à « Gagné » ou « Perdu ».'
    ],
    faq: [
      {
        q: 'Je ne vois pas le téléphone du contact.',
        a: "Il n'apparaît que s'il est renseigné dans la fiche du contact."
      },
      {
        q: "Un message dit que l'affaire a été modifiée par un autre utilisateur.",
        a: "Un collègue l'a enregistrée avant vous. Actualisez la page puis recommencez."
      },
      {
        q: 'Pourquoi la chronologie ne montre-t-elle que dix activités ?',
        a: "La fiche affiche les dix activités les plus récentes de l'affaire."
      }
    ],
    permissions: {
      feature: 'CRM',
      note: "Voir la fiche demande « Voir les affaires » ; « Modifier » et le changement d'étape demandent « Modifier les affaires » ; la recherche de biens demande « Lancer l'appariement biens / affaires »."
    },
    related: [
      { label: "Changer l'étape", helpId: 'commercial.affaires.detail.etape' },
      { label: 'Biens correspondants', helpId: 'commercial.affaires.detail.correspondance' },
      { label: 'Liste des affaires', to: '/tenant/:tenantId/crm/deals' }
    ],
    keywords: ['fiche affaire', 'détail', 'affaire', 'contact', 'étape', 'budget', 'client']
  },
  {
    id: 'commercial.affaires.detail.etape',
    kind: 'section',
    title: "Changer l'étape d'une affaire",
    summary:
      "La pastille à côté du type d'affaire indique l'étape actuelle. La liste déroulante à droite de l'en-tête la change, et le changement est enregistré tout de suite.",
    howToRead: {
      statuses: [
        { value: 'NEW', label: 'Nouveau', description: 'Nouvelle demande, étape de départ.' },
        { value: 'QUALIFIED', label: 'Qualifié', description: 'Le besoin du client est précisé.' },
        { value: 'VISIT', label: 'Visite', description: 'Le client visite ou va visiter des biens.' },
        { value: 'NEGOTIATION', label: 'Négociation', description: "L'affaire est en négociation." },
        { value: 'WON', label: 'Gagné', description: "L'affaire est conclue : sa date de clôture est enregistrée." },
        { value: 'LOST', label: 'Perdu', description: "L'affaire est abandonnée : sa date de clôture est enregistrée." }
      ]
    },
    steps: [
      { title: 'Ouvrir la liste', detail: 'Cliquez sur la liste déroulante située sous le bouton « Retour ».' },
      { title: "Choisir l'étape", detail: "Cliquez sur l'étape voulue (vous pouvez aussi taper son nom)." },
      { title: 'Vérifier', detail: "Le message « Stade de l'affaire mis à jour » confirme l'enregistrement." }
    ],
    consequences: [
      'Le changement est immédiat, sans confirmation. Il est réversible : choisissez une autre étape, même depuis « Gagné » ou « Perdu ».',
      "Passer à « Gagné » ou « Perdu » enregistre la date de clôture ; en sortir l'efface.",
      "Aucun e-mail ni message n'est envoyé au client ou à un collègue. Le changement est inscrit au journal d'audit, avec l'ancienne et la nouvelle étape.",
      "Changer l'étape ne modifie ni le statut du contact ni celui d'un bien.",
      "Quand une vente est conclue dans le module Ventes (acte signé) et que son offre est liée à cette affaire, l'affaire passe d'elle-même à « Gagné »."
    ],
    faq: [
      {
        q: "L'étape ne change pas et une erreur s'affiche.",
        a: "Il vous manque peut-être le droit « Modifier les affaires », ou un collègue a modifié l'affaire entre-temps. Actualisez la page et recommencez."
      },
      {
        q: 'Quelle différence entre « Gagné » et « Perdu » ?',
        a: "« Gagné » signifie que l'affaire a abouti ; « Perdu » qu'elle est abandonnée. Aucun motif n'est demandé à cet endroit."
      },
      {
        q: 'Puis-je rouvrir une affaire « Gagné » ou « Perdu » ?',
        a: 'Oui : choisissez une autre étape. La date de clôture est alors effacée.'
      }
    ],
    permissions: { feature: 'CRM', note: "Changer l'étape demande « Modifier les affaires »." },
    related: [{ label: 'Le pipeline par étape', helpId: 'commercial.affaires.liste.kanban' }],
    keywords: ['étape', 'stade', 'gagné', 'perdu', 'négociation', 'qualifié', 'clôturer', 'rouvrir']
  },
  {
    id: 'commercial.affaires.detail.criteres',
    kind: 'section',
    title: 'Type de bien et critères',
    summary:
      'Cette carte rappelle le bien recherché : type de bien, valeur estimée de la transaction et critères saisis (pièces, surface, équipements…).',
    howToRead: {
      notes: [
        'Type de bien recherché : appartement, villa, terrain, etc.',
        "Valeur estimée de la transaction : le montant auquel l'affaire devrait se conclure, en FCFA. Ce n'est pas le budget du client.",
        "Les critères (nombre de pièces, surface, surface du terrain, état du meublé, étage, nombre de bureaux, type de commerce) et les équipements (étiquettes) n'apparaissent que s'ils ont été renseignés.",
        "La carte est absente si aucune de ces informations n'a été saisie."
      ]
    },
    steps: [{ title: 'Corriger une information', detail: 'Cliquez sur « Modifier » en haut de la fiche.' }],
    consequences: ['La carte est en lecture seule : elle ne change que par le formulaire de modification.'],
    permissions: { feature: 'CRM' },
    related: [{ label: 'Critères spécifiques', helpId: 'commercial.affaires.nouvelle.criteres' }],
    keywords: ['critères', 'type de bien', 'valeur estimée', 'équipements', 'surface']
  },
  {
    id: 'commercial.affaires.detail.chronologie',
    kind: 'section',
    title: "Chronologie des activités de l'affaire",
    summary:
      "Cette carte liste les activités liées à l'affaire (appels, e-mails, visites, notes, tâches…), de la plus récente à la plus ancienne.",
    howToRead: {
      notes: [
        "Le nombre entre parenthèses est le nombre d'activités affichées : au plus dix, les plus récentes.",
        "Chaque activité montre son type, son sens (entrant, sortant, interne), sa date et son heure, son sujet, son contenu, son résultat, son auteur et, s'il y en a une, l'action suivante prévue.",
        "Les boutons « Contact » et « Affaire » ouvrent la fiche correspondante ; cliquer sur l'activité ouvre l'écran des activités filtré sur l'affaire."
      ]
    },
    steps: [
      {
        title: "Voir tout l'historique",
        detail: "Cliquez sur une activité pour ouvrir l'écran des activités de l'affaire."
      }
    ],
    consequences: ["La carte est en lecture seule : on n'y ajoute ni ne supprime d'activité."],
    permissions: { feature: 'CRM' },
    related: [{ label: "Fiche d'une affaire", helpId: 'commercial.affaires.detail' }],
    keywords: ['activités', 'historique', 'appels', 'notes', 'chronologie', 'suivi']
  },
  {
    id: 'commercial.affaires.detail.correspondance',
    kind: 'section',
    title: 'Correspondance de propriétés',
    summary:
      "Cette carte cherche, parmi les biens de votre agence, ceux qui conviennent au client. Vous pouvez ajouter les biens retenus à la sélection (« shortlist ») de l'affaire.",
    purpose: 'Elle évite de parcourir tout le catalogue pour trouver des biens à proposer au client.',
    howToRead: {
      notes: [
        "Rien ne s'affiche tant que vous n'avez pas cliqué sur « Rechercher des correspondances ». Au plus 20 biens sont proposés, du plus proche au moins proche.",
        "Les biens examinés sont ceux de l'agence (ou de ses clients sous mandat actif) qui sont publiés et au statut Disponible, Réservé ou Sous offre.",
        'Chaque résultat montre le titre du bien, son prix, sa surface, ses pièces et sa zone, puis une note globale.',
        '« Détails de correspondance » donne cinq pourcentages : Budget (30 % de la note), Localisation (25 %), Taille (20 %), Caractéristiques (15 %) et Cohérence prix (10 %). Fiez-vous surtout à ces cinq pourcentages.',
        "Un critère que l'affaire ne renseigne pas compte comme une correspondance parfaite (100 %)."
      ]
    },
    steps: [
      { title: 'Lancer la recherche', detail: 'Cliquez sur « Rechercher des correspondances ».' },
      {
        title: 'Examiner un bien',
        detail: 'Lisez la note et les détails ; « Voir les détails » ouvre la fiche du bien.'
      },
      {
        title: 'Retenir un bien',
        detail: 'Cliquez sur « Ajouter à la shortlist » : le bouton devient « Ajouté à la shortlist ».'
      }
    ],
    consequences: [
      "Ajouter un bien l'enregistre dans la présélection de l'affaire, au statut « Présélectionné ». Cela ne change ni le bien ni l'étape de l'affaire, et rien n'est envoyé au client.",
      'Ajouter deux fois le même bien ne crée pas de doublon.',
      'Les résultats de la recherche ne sont pas conservés : relancez la recherche si vous quittez la page.'
    ],
    faq: [
      {
        q: "Aucun bien n'est proposé.",
        a: "Aucun bien publié et disponible de l'agence ne correspond, ou aucun bien n'est publié. Vérifiez les biens publiés, puis relancez la recherche."
      },
      {
        q: 'Je ne vois pas le bouton de recherche, ou un message parle de droits.',
        a: "La recherche et l'ajout à la shortlist demandent le droit « Lancer l'appariement biens / affaires ». Demandez-le à l'administrateur de votre agence."
      },
      {
        q: 'Comment la zone est-elle comparée ?',
        a: "Le nom de la zone de l'affaire est comparé à celui de la zone du bien : identique, c'est une correspondance complète ; l'un contenu dans l'autre, une correspondance partielle."
      }
    ],
    permissions: {
      feature: 'CRM',
      note: "Demande « Lancer l'appariement biens / affaires »."
    },
    related: [
      { label: 'Budget et localisation', helpId: 'commercial.affaires.nouvelle.budget' },
      { label: "Fiche d'une affaire", helpId: 'commercial.affaires.detail' }
    ],
    keywords: ['correspondance', 'matching', 'biens', 'propriétés', 'shortlist', 'sélection', 'appariement', 'proposer']
  }
];

export default entries;
