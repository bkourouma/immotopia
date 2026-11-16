import type { HelpEntry } from '../../../types';

/** Zone « copropriete » du module « syndic » (fr) : copropriétés, mandants, lots et compte d'un lot. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Liste des copropriétés
  {
    id: 'syndic.copropriete.liste',
    kind: 'page',
    title: 'Copropriétés',
    summary:
      'Cet écran liste les copropriétés que vous gérez, sous forme de cartes. Vous y créez une copropriété, ouvrez sa fiche ou ses lots, ou la supprimez si elle est encore vide.',
    purpose:
      "Une copropriété est l'immeuble dont vous êtes le syndic. Tout le reste du module (lots, appels de charges, assemblées, comptabilité) se rattache à elle. Les copropriétés « En liquidation » n'apparaissent pas ici.",
    steps: [
      {
        title: 'Créer une copropriété',
        detail: "Cliquez sur « Nouvelle copropriété », remplissez le nom et l'adresse (obligatoires), puis « Créer »."
      },
      {
        title: 'Ajouter les lots',
        detail:
          'Après la création, vous arrivez sur la liste des lots avec la fenêtre « Importer des lots depuis des propriétés » déjà ouverte. Fermez-la si vous préférez créer les lots à la main.'
      },
      {
        title: 'Retrouver une copropriété',
        detail:
          'Tapez dans « Rechercher » (nom, adresse, référence cadastrale, mandant) ou filtrez par « Statut », « Mandant » et « Lots ».'
      },
      {
        title: 'Ouvrir une copropriété',
        detail:
          '« Ouvrir la copropriété » ou « Voir la fiche » ouvre la fiche ; « Voir les lots » ouvre la liste des lots.'
      },
      {
        title: 'Supprimer',
        detail:
          "Le bouton « Supprimer » de la carte demande une confirmation. Il est grisé quand la copropriété a déjà des lots ou d'autres données."
      }
    ],
    consequences: [
      "La suppression est définitive : la copropriété disparaît avec ses données liées. Elle est refusée dès qu'elle a des lots, des appels de charges, des budgets, des assemblées, des documents, des contrats, des incidents, des comptes de copropriétaires ou des paiements.",
      'Pour retirer une copropriété de la gestion courante sans la supprimer, passez son statut à « En liquidation » depuis sa fiche.'
    ],
    faq: [
      {
        q: 'Où est passée une copropriété « En liquidation » ?',
        a: 'Elle est volontairement masquée de cette liste. Son statut se change dans sa fiche, bouton « Modifier ».'
      },
      {
        q: 'Que veut dire « Mandant : Identité de l’agence » ?',
        a: "La copropriété n'a pas d'agence mandante : ses documents portent l'identité de votre agence. Voir « Agences mandantes »."
      },
      {
        q: 'Pourquoi « Supprimer » est-il grisé ?',
        a: "La copropriété a des lots ou d'autres données liées. Retirez-la de la gestion courante en la passant « En liquidation »."
      },
      {
        q: "Qu'est-ce que le « Total de référence des tantièmes » ?",
        a: 'Un nombre facultatif, par exemple 10 000. Il sert seulement à vous avertir quand la somme des tantièmes des lots ne lui correspond pas.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété'],
      note: 'Voir la liste demande le droit de voir le module Syndic. Créer une copropriété demande le droit de créer dans le module Syndic ; supprimer demande le droit de modifier le module Syndic.'
    },
    related: [
      { label: 'Cartes des copropriétés', helpId: 'syndic.copropriete.liste.cartes' },
      { label: 'Créer une copropriété', helpId: 'syndic.copropriete.liste.creation' },
      { label: 'Agences mandantes', helpId: 'syndic.mandants.liste' },
      { label: 'Lots de la copropriété', helpId: 'syndic.lots.liste' }
    ],
    keywords: ['copropriété', 'immeuble', 'syndic', 'créer', 'nouvelle copropriété', 'supprimer', 'liquidation']
  },
  {
    id: 'syndic.copropriete.liste.cartes',
    kind: 'section',
    title: 'Cartes des copropriétés',
    summary:
      'Chaque carte résume une copropriété : son nom, son statut, son adresse, son nombre de lots et de bâtiments, sa référence cadastrale et son mandant.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'Copropriété en gestion courante.' },
        {
          value: 'IN_DISPUTE',
          label: 'En litige',
          description: 'Copropriété signalée en litige ; elle reste en gestion courante.'
        },
        {
          value: 'IN_LIQUIDATION',
          label: 'En liquidation',
          description: "Retirée de la gestion courante : elle n'est plus affichée dans cette liste."
        }
      ],
      notes: [
        "« Mandant » : l'agence pour le compte de laquelle la copropriété est gérée, ou « Identité de l’agence » si aucune.",
        'Le critère « Lots » de la recherche sépare les copropriétés « Avec lots » de celles « Sans lot ».'
      ]
    },
    steps: [
      { title: 'Ouvrir la fiche', detail: '« Voir la fiche » ou « Ouvrir la copropriété ».' },
      { title: 'Voir les lots', detail: "« Voir les lots » ouvre directement l'onglet des lots." },
      { title: 'Supprimer', detail: '« Supprimer », puis confirmez. Possible seulement si la copropriété est vide.' }
    ],
    faq: [
      {
        q: 'Combien de copropriétés par page ?',
        a: 'Douze. Une pagination apparaît en bas quand il y en a davantage.'
      },
      {
        q: 'Comment trouver une copropriété par son mandant ?',
        a: "Utilisez le filtre « Mandant », ou tapez le nom de l'agence mandante dans « Rechercher »."
      },
      {
        q: "Comment changer le statut d'une copropriété ?",
        a: "Ouvrez sa fiche et cliquez sur « Modifier » : le champ « Statut » s'y trouve."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Supprimer demande le droit de modifier le module Syndic.' },
    related: [{ label: 'Fiche d’une copropriété', helpId: 'syndic.copropriete.fiche' }],
    keywords: ['carte', 'statut', 'litige', 'mandant', 'recherche']
  },
  {
    id: 'syndic.copropriete.liste.creation',
    kind: 'section',
    title: 'Créer une copropriété',
    summary:
      'Cette fenêtre crée une copropriété à partir de son nom et de son adresse. Le reste est facultatif et peut être complété ou corrigé plus tard dans la fiche.',
    howToRead: {
      notes: [
        '« Nom » et « Adresse » sont obligatoires.',
        "« Total de référence des tantièmes » : facultatif. Si la somme des tantièmes des lots est différente, un avertissement s'affiche sur la liste des lots ; rien n'est bloqué.",
        "« Agence mandante » : facultatif. Les documents de la copropriété porteront le logo, la signature et le cachet du mandant choisi. Sans choix, ils portent l'identité de votre agence."
      ]
    },
    steps: [
      {
        title: 'Ouvrir',
        detail: 'Cliquez sur « Nouvelle copropriété » (ou « Créer une copropriété » si la liste est vide).'
      },
      {
        title: 'Renseigner',
        detail:
          "Saisissez « Nom » et « Adresse ». Ajoutez au besoin « Référence cadastrale », « N° d'immatriculation » et « Agence mandante »."
      },
      { title: 'Valider', detail: 'Cliquez sur « Créer ».' },
      {
        title: 'Ajouter les lots',
        detail: "Vous êtes envoyé sur la liste des lots, avec l'import des biens déjà proposé."
      }
    ],
    consequences: [
      'La copropriété est créée avec le statut « Active » et apparaît tout de suite dans la liste.',
      "Aucun e-mail ni SMS n'est envoyé à la création."
    ],
    faq: [
      {
        q: 'Puis-je modifier ces informations ensuite ?',
        a: 'Oui, depuis la fiche de la copropriété, bouton « Modifier ».'
      },
      {
        q: 'Quelle agence mandante choisir ?',
        a: "Choisissez celle pour le compte de laquelle vous gérez l'immeuble. Si elle n'existe pas encore, créez-la dans « Agences mandantes »."
      },
      {
        q: 'Pourquoi « Créer » ne fait-il rien ?',
        a: "Le « Nom » ou l'« Adresse » est vide : le formulaire affiche « Le nom est obligatoire » ou « L'adresse est obligatoire » sous le champ concerné. Remplissez-les, puis cliquez de nouveau sur « Créer »."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de créer dans le module Syndic.' },
    related: [
      { label: 'Agences mandantes', helpId: 'syndic.mandants.liste' },
      { label: 'Importer des biens en lots', helpId: 'syndic.lots.import' }
    ],
    keywords: ['nouvelle copropriété', 'créer', 'nom', 'adresse', 'tantièmes', 'mandant']
  },

  // ------------------------------------------------------------------ Agences mandantes
  {
    id: 'syndic.mandants.liste',
    kind: 'page',
    title: 'Agences mandantes',
    summary:
      'Cet écran liste les agences pour le compte desquelles votre cabinet gère des copropriétés. Chacune porte ses coordonnées, son logo, sa signature et son cachet.',
    purpose:
      "Quand un cabinet gère des immeubles pour plusieurs agences clientes, les documents d'une copropriété doivent porter l'identité de la bonne agence. Vous la rattachez à la copropriété (création ou fiche) dans le champ « Agence mandante ».",
    steps: [
      {
        title: 'Créer un mandant',
        detail: 'Cliquez sur « Nouvelle agence mandante », saisissez au moins le « Nom », puis « Enregistrer ».'
      },
      {
        title: 'Ajouter les images',
        detail: 'Une fois enregistré, le tiroir affiche « Images pour les documents » : logo, signature, cachet.'
      },
      {
        title: 'Rattacher une copropriété',
        detail: "Dans la fiche d'une copropriété, bouton « Modifier », champ « Agence mandante »."
      },
      { title: 'Modifier', detail: '« Modifier » sur la ligne rouvre le tiroir.' },
      {
        title: 'Supprimer',
        detail: "« Supprimer », puis confirmez. Possible seulement si aucune copropriété n'est rattachée."
      }
    ],
    consequences: [
      "La suppression d'un mandant est définitive.",
      "Elle est impossible tant qu'une copropriété lui est rattachée : le bouton est grisé avec l'infobulle « Détachez d'abord ses copropriétés pour pouvoir le supprimer »."
    ],
    faq: [
      {
        q: 'Deux mandants peuvent-ils avoir le même nom ?',
        a: "Non. L'enregistrement est refusé avec le message « Une agence mandante porte déjà ce nom »."
      },
      {
        q: 'Pourquoi ne puis-je pas déposer le logo tout de suite ?',
        a: "Les images s'attachent à un mandant déjà enregistré. Enregistrez d'abord les coordonnées : le tiroir reste ouvert et propose alors les images."
      },
      {
        q: 'Que se passe-t-il sans mandant ?',
        a: "Les documents de la copropriété portent l'identité de votre agence, indiquée « Identité de l’agence »."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété'],
      note: "Voir la liste demande le droit de voir le module Syndic ; créer, le droit de créer dans ce module ; modifier, supprimer ou changer le logo, le droit de le modifier. Déposer ou retirer la signature et le cachet demande en plus le droit de modifier les paramètres de l'agence."
    },
    related: [
      { label: 'Tableau des agences mandantes', helpId: 'syndic.mandants.tableau' },
      { label: 'Créer ou modifier une agence mandante', helpId: 'syndic.mandants.edition' },
      { label: 'Copropriétés', helpId: 'syndic.copropriete.liste' }
    ],
    keywords: ['mandant', 'agence cliente', 'logo', 'signature', 'cachet', 'documents', 'en-tête']
  },
  {
    id: 'syndic.mandants.tableau',
    kind: 'table',
    title: 'Tableau des agences mandantes',
    summary:
      'Ce tableau liste chaque agence mandante avec son logo, ses coordonnées et le nombre de copropriétés qui lui sont rattachées. Vous y modifiez ou supprimez un mandant.',
    howToRead: {
      columns: [
        { key: 'logo', label: 'Logo', description: "Vignette du logo, ou « — » s'il n'y en a pas." },
        { key: 'name', label: 'Nom', description: "Nom de l'agence mandante." },
        { key: 'contact', label: 'Coordonnées', description: 'Téléphone et e-mail, ou « Non renseignées ».' },
        {
          key: 'syndicateCount',
          label: 'Copropriétés',
          description: 'Nombre de copropriétés rattachées à ce mandant.'
        },
        { key: 'actions', label: 'Actions', description: '« Modifier » et « Supprimer ».' }
      ],
      notes: [
        'Les filtres « Copropriétés gérées » (Avec copropriétés / Sans copropriété) et « Logo » (Avec logo / Sans logo) aident à repérer les mandants incomplets.',
        "La recherche porte sur le nom, la dénomination légale, l'adresse, l'e-mail, le téléphone, le RCCM et le NIF."
      ]
    },
    steps: [
      { title: 'Modifier', detail: "Cliquez sur « Modifier » : le tiroir s'ouvre avec les coordonnées et les images." },
      { title: 'Supprimer', detail: '« Supprimer » puis confirmation. Grisé si le mandant a des copropriétés.' }
    ],
    consequences: ["La suppression est définitive et refusée tant qu'une copropriété est rattachée."],
    faq: [
      {
        q: "Comment détacher une copropriété d'un mandant ?",
        a: 'Ouvrez sa fiche, « Modifier », videz le champ « Agence mandante » et enregistrez.'
      },
      {
        q: 'Peut-on exporter la liste ?',
        a: "Oui, avec le bouton d'export du tableau : toutes les lignes correspondant à votre recherche sont exportées."
      },
      {
        q: 'Que compte la colonne « Copropriétés » ?',
        a: 'Les copropriétés actuellement rattachées à ce mandant.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Modifier et supprimer demandent le droit de modifier le module Syndic.' },
    related: [{ label: 'Créer ou modifier une agence mandante', helpId: 'syndic.mandants.edition' }],
    keywords: ['mandants', 'tableau', 'supprimer', 'copropriétés rattachées']
  },
  {
    id: 'syndic.mandants.edition',
    kind: 'section',
    title: 'Créer ou modifier une agence mandante',
    summary:
      "Ce tiroir enregistre les coordonnées d'un mandant, puis, une fois enregistré, son logo, sa signature et son cachet. Ces images sont utilisées sur les documents de ses copropriétés.",
    howToRead: {
      notes: [
        'Seul le « Nom » est obligatoire. « Dénomination légale », « Adresse », « Téléphone », « E-mail », « RCCM » et « NIF » sont facultatifs.',
        "Le message « Enregistrez d’abord les coordonnées… » s'affiche tant que le mandant n'est pas créé.",
        "Chaque image se dépose ou se retire séparément ; les types d'image acceptés sont indiqués dans le champ."
      ]
    },
    steps: [
      { title: 'Saisir les coordonnées', detail: 'Remplissez au moins le « Nom ».' },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer » : le tiroir reste ouvert et passe en mode modification.'
      },
      {
        title: 'Déposer les images',
        detail: 'Sous « Images pour les documents », ajoutez « Logo », « Signature » et « Cachet ».'
      },
      { title: 'Fermer', detail: 'Cliquez sur « Fermer » quand vous avez terminé.' }
    ],
    consequences: [
      'Les documents des copropriétés rattachées au mandant (par exemple reçus et quittances) portent désormais ce logo, cette signature et ce cachet.',
      "Un e-mail invalide est refusé avec « Adresse e-mail invalide » ; rien n'est envoyé au mandant."
    ],
    faq: [
      {
        q: 'Je ne peux pas déposer la signature ou le cachet.',
        a: "Ces deux images engagent l'émetteur : elles demandent le droit de modifier les paramètres de l'agence, en plus de celui de modifier le module Syndic. Le logo ne demande que ce dernier."
      },
      {
        q: 'Comment remplacer un logo ?',
        a: "Retirez l'ancien dans le champ « Logo », puis déposez le nouveau."
      },
      {
        q: "Pourquoi l'enregistrement est-il refusé ?",
        a: "Une autre agence mandante porte déjà ce nom, sans tenir compte des majuscules : le message « Une agence mandante porte déjà ce nom. » s'affiche. Choisissez un autre nom, puis cliquez de nouveau sur « Enregistrer »."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: "Enregistrer et gérer le logo demandent le droit de modifier le module Syndic. Signature et cachet demandent aussi le droit de modifier les paramètres de l'agence."
    },
    related: [{ label: 'Agences mandantes', helpId: 'syndic.mandants.liste' }],
    keywords: ['logo', 'signature', 'cachet', 'RCCM', 'NIF', 'dénomination légale', 'images', 'documents']
  },

  // ------------------------------------------------------------------ Fiche d'une copropriété
  {
    id: 'syndic.copropriete.fiche',
    kind: 'page',
    title: 'Fiche d’une copropriété',
    summary:
      "La fiche réunit l'identité de la copropriété, ses chiffres clés, son logo et quatre onglets : lots, bâtiments, appels de charges et barème par type de lot.",
    purpose:
      "C'est le point d'entrée d'une copropriété : vous vérifiez ses informations, les corrigez, puis passez aux autres onglets du haut (Lots, Prestataires, Charges, Assemblées…).",
    steps: [
      {
        title: 'Lire les chiffres clés',
        detail:
          "Les trois cartes « Lots », « Bâtiments » et « Appels de charges » ouvrent l'onglet correspondant en bas de page."
      },
      { title: 'Corriger les informations', detail: 'Dans « Informations générales », bouton « Modifier ».' },
      { title: 'Ajouter le logo', detail: 'Carte « Logo de la copropriété ».' },
      {
        title: 'Parcourir les onglets',
        detail:
          '« Résumé des lots », « Détail des bâtiments », « Détail des appels de charges », « Barème par type de lot ».'
      }
    ],
    consequences: [
      "Passer le statut à « En liquidation » retire la copropriété de la liste des copropriétés : c'est une alternative à la suppression, qui est définitive.",
      "Modifier l'agence mandante change le logo, la signature et le cachet des documents de la copropriété."
    ],
    faq: [
      {
        q: "Pourquoi la fiche ne montre-t-elle qu'un seul bâtiment ?",
        a: "L'onglet « Détail des bâtiments » affiche l'immeuble lié à la copropriété, soit une ligne."
      },
      {
        q: "Où modifier le nom ou l'adresse ?",
        a: 'Dans « Informations générales », bouton « Modifier ».'
      },
      {
        q: 'Que signifie « Nombre de lots déclaré » ?',
        a: "C'est le nombre de lots enregistrés pour cette copropriété, le même que celui de la carte « Lots »."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété'],
      note: 'Voir la fiche demande le droit de voir le module Syndic. « Modifier » et le barème demandent le droit de le modifier.'
    },
    related: [
      { label: 'Informations générales', helpId: 'syndic.copropriete.fiche.informations' },
      { label: 'Modifier la copropriété', helpId: 'syndic.copropriete.fiche.edition' },
      { label: 'Barème par type de lot', helpId: 'syndic.lots.bareme' },
      { label: 'Lots de la copropriété', helpId: 'syndic.lots.liste' }
    ],
    keywords: ['fiche', 'informations générales', 'statut', 'liquidation', 'gestionnaire', 'exercice', 'bâtiments']
  },
  {
    id: 'syndic.copropriete.fiche.indicateurs',
    kind: 'section',
    title: 'Chiffres clés de la copropriété',
    summary:
      "Trois cartes donnent le nombre de lots, de bâtiments et d'appels de charges. Un clic sur une carte ouvre l'onglet correspondant.",
    howToRead: {
      notes: [
        '« Lots » : nombre de lots de la copropriété.',
        '« Bâtiments » : nombre de bâtiments déclaré.',
        "« Appels de charges » : nombre total d'appels de charges ; « — » s'il n'a pas pu être chargé."
      ]
    },
    faq: [
      {
        q: 'Le nombre de lots est faux.',
        a: "Il suit les lots enregistrés. Ajoutez, importez ou supprimez des lots dans l'onglet « Lots »."
      },
      {
        q: 'Pourquoi « — » pour les appels de charges ?',
        a: "Le total n'a pas pu être lu pour le moment. L'onglet « Détail des appels de charges » reste utilisable."
      },
      { q: 'Les cartes sont-elles cliquables ?', a: "Oui, chacune ouvre l'onglet de même nom plus bas." }
    ],
    permissions: { feature: 'SYNDIC' },
    keywords: ['indicateurs', 'compteurs', 'lots', 'bâtiments', 'appels de charges']
  },
  {
    id: 'syndic.copropriete.fiche.informations',
    kind: 'section',
    title: 'Informations générales',
    summary:
      "Cette carte résume l'identité de la copropriété : nom, statut, adresse, références, mandant et gestionnaire.",
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Active', description: 'Gestion courante.' },
        { value: 'IN_DISPUTE', label: 'En litige', description: 'Signalée en litige ; reste en gestion courante.' },
        { value: 'IN_LIQUIDATION', label: 'En liquidation', description: 'Retirée de la liste des copropriétés.' }
      ],
      notes: [
        "« Gestionnaire » est choisi dans vos contacts. « Non renseigné » s'affiche s'il n'y en a pas.",
        "« Total de référence des tantièmes » n'apparaît que s'il a été saisi.",
        '« Exercice » est un nombre de 1 à 12, 1 par défaut.'
      ]
    },
    steps: [{ title: 'Modifier', detail: 'Cliquez sur « Modifier » en haut à droite de la carte.' }],
    faq: [
      {
        q: "Où voir l'agence mandante ?",
        a: 'Dans la ligne « Agence mandante », sous le nom de la copropriété (« Mandant »).'
      },
      {
        q: 'Comment changer le gestionnaire ?',
        a: '« Modifier », puis le champ « Gestionnaire » : il propose vos contacts.'
      },
      { q: 'Peut-on laisser un champ vide ?', a: "Oui, sauf le nom, l'adresse et le statut." }
    ],
    permissions: { feature: 'SYNDIC', note: '« Modifier » demande le droit de modifier le module Syndic.' },
    related: [{ label: 'Modifier la copropriété', helpId: 'syndic.copropriete.fiche.edition' }],
    keywords: ['identité', 'adresse', 'immatriculation', 'cadastrale', 'gestionnaire', 'mandant']
  },
  {
    id: 'syndic.copropriete.fiche.edition',
    kind: 'section',
    title: 'Modifier la copropriété',
    summary:
      'Cette fenêtre corrige les informations de la copropriété, son statut, son gestionnaire et son agence mandante.',
    howToRead: {
      notes: [
        '« Nom », « Adresse » et « Statut » sont obligatoires.',
        '« Total de référence des tantièmes » : facultatif, il sert à avertir si la somme des tantièmes des lots diffère.',
        '« Gestionnaire » : un contact de votre annuaire.',
        "« Agence mandante » : les documents porteront son logo, sa signature et son cachet. Videz le champ pour revenir à l'identité de votre agence."
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: '« Modifier » dans « Informations générales ».' },
      { title: 'Corriger', detail: 'Changez les champs voulus.' },
      { title: 'Enregistrer', detail: '« Enregistrer » ferme la fenêtre et recharge la fiche.' }
    ],
    consequences: [
      '« En liquidation » retire la copropriété de la liste des copropriétés (alternative à la suppression, qui est définitive).',
      "Si un champ est refusé, le message d'erreur s'affiche sous le champ concerné et la fenêtre reste ouverte."
    ],
    faq: [
      { q: 'Je veux retirer la copropriété sans la supprimer.', a: 'Passez son « Statut » à « En liquidation ».' },
      {
        q: 'Peut-on revenir en arrière ?',
        a: "Oui, en rouvrant la fiche (par son adresse directe) et en remettant « Active » ; elle n'apparaît plus dans la liste en attendant."
      },
      {
        q: 'Que devient le total des tantièmes si je le vide ?',
        a: "Il est supprimé : plus aucun avertissement de somme n'est affiché."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de modifier le module Syndic.' },
    keywords: ['modifier', 'statut', 'liquidation', 'gestionnaire', 'mandant', 'tantièmes']
  },
  {
    id: 'syndic.copropriete.fiche.logo',
    kind: 'section',
    title: 'Logo de la copropriété',
    summary: 'Cette carte permet de déposer, remplacer ou retirer le logo propre à la copropriété.',
    howToRead: {
      notes: ["Ce logo est celui de la copropriété. Celui de l'agence mandante se gère dans « Agences mandantes »."]
    },
    steps: [
      { title: 'Déposer', detail: 'Choisissez une image dans le champ « Logo ».' },
      { title: 'Retirer', detail: 'Utilisez le bouton de suppression du champ.' }
    ],
    faq: [
      { q: 'Quel format choisir ?', a: 'Une image simple (logo) ; les formats acceptés sont indiqués dans le champ.' },
      { q: 'Faut-il le déposer pour chaque copropriété ?', a: 'Oui, il est propre à chaque copropriété.' },
      {
        q: 'Que se passe-t-il si je dépose une très grande image ?',
        a: "L'image est d'abord réduite automatiquement à 800 px ; ensuite seulement son poids est contrôlé (PNG ou JPEG, 2 Mo maximum). Un fichier d'un autre format est refusé avec un message."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de modifier le module Syndic.' },
    keywords: ['logo', 'image', 'en-tête']
  },
  {
    id: 'syndic.copropriete.fiche.batiments',
    kind: 'table',
    title: 'Détail des bâtiments',
    summary: 'Ce tableau décrit le bâtiment lié à la copropriété : adresse, étages, unités et places de parking.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Bâtiment', description: 'Nom du bâtiment, ou nom de la copropriété à défaut.' },
        { key: 'address', label: 'Adresse', description: 'Adresse du bâtiment.' },
        { key: 'floors', label: 'Étages', description: "Nombre d'étages, ou « — » si non renseigné." },
        { key: 'units', label: 'Unités', description: "Nombre d'unités, ou « — »." },
        { key: 'parkingSpaces', label: 'Places de parking', description: 'Nombre de places, ou « — ».' }
      ],
      notes: ['Ces données viennent de la fiche du bien (immeuble) lié ; elles ne se modifient pas ici.']
    },
    faq: [
      {
        q: 'Le tableau est vide.',
        a: "Aucun bâtiment n'est lié à la copropriété : le message « Aucun bâtiment renseigné pour cette copropriété » s'affiche."
      },
      { q: "Comment corriger le nombre d'étages ?", a: 'Dans la fiche du bien correspondant, côté « Biens ».' },
      { q: 'Peut-on exporter ?', a: "Oui, avec le bouton d'export du tableau." }
    ],
    permissions: { feature: 'SYNDIC' },
    keywords: ['bâtiments', 'immeuble', 'étages', 'parking', 'unités']
  },

  // ------------------------------------------------------------------ Lots
  {
    id: 'syndic.lots.liste',
    kind: 'page',
    title: 'Lots de la copropriété',
    summary:
      'Cet écran liste les lots de la copropriété avec leurs tantièmes, leur propriétaire, leur accès au portail, leur locataire et leur bien lié. Vous y créez, importez, modifiez ou désactivez des lots.',
    purpose:
      "Un lot est une unité de la copropriété (appartement, parking, cave, bureau, commerce…). Ses tantièmes servent à répartir les charges et à compter les voix aux assemblées. C'est ici que vous reliez chaque lot à son propriétaire.",
    steps: [
      {
        title: 'Importer ou créer',
        detail: '« Importer des biens » reprend des biens existants ; « Nouveau lot » crée un lot à la main.'
      },
      {
        title: 'Vérifier les tantièmes',
        detail: "Comparez « Tantièmes généraux cumulés » au « Total de référence des tantièmes » s'il est renseigné."
      },
      {
        title: 'Relier le propriétaire',
        detail: '« Modifier » sur un lot : champ « Propriétaire CRM » et « Propriétaire depuis le ».'
      },
      { title: 'Suivre un lot', detail: '« Compte » ouvre le compte du lot : solde, appels, paiements, relevé.' },
      {
        title: 'Ouvrir le portail',
        detail:
          "« Gérer l'accès » (colonne « Portail ») mène à « Profils et incidents », où l'on invite le copropriétaire."
      }
    ],
    consequences: [
      'Un lot à 0 tantième est « Inactif » : il sort de la clé de répartition, des votes et des appels de charges futurs, mais son historique reste.',
      "Un lot ne peut être supprimé que s'il n'a aucun mouvement. Sinon, l'écran propose de le désactiver.",
      "Selon votre abonnement, la création ou l'import d'un lot peut être refusé quand la réserve de lots de votre pack est atteinte."
    ],
    faq: [
      {
        q: 'Pourquoi un lot est-il marqué « Inactif » ?',
        a: 'Ses tantièmes généraux sont à 0. Cliquez sur « Réactiver » et saisissez ses tantièmes pour le remettre en service.'
      },
      {
        q: "Que veut dire l'avertissement sur la somme des tantièmes ?",
        a: "La somme des lots diffère du « Total de référence des tantièmes ». Rien n'est bloqué ; corrigez les tantièmes ou le total."
      },
      {
        q: 'Que veut dire « Paiement déclaré » ?',
        a: 'Un copropriétaire a déclaré un paiement mobile money en attente de validation pour ce lot.'
      },
      { q: 'Que veulent dire « Occupé » et « Non occupé » ?', a: 'Un locataire est, ou non, rattaché au lot.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété'],
      note: 'Voir demande le droit de voir le module Syndic. Créer ou importer des lots demande le droit de créer dans ce module ; modifier, désactiver, supprimer et gérer les locataires demandent le droit de le modifier.'
    },
    related: [
      { label: 'Tableau des lots', helpId: 'syndic.lots.tableau' },
      { label: 'Créer ou modifier un lot', helpId: 'syndic.lots.creation' },
      { label: 'Importer des biens en lots', helpId: 'syndic.lots.import' },
      { label: 'Compte d’un lot', helpId: 'syndic.lots.compte' },
      { label: 'Barème par type de lot', helpId: 'syndic.lots.bareme' }
    ],
    keywords: ['lots', 'tantièmes', 'clé de répartition', 'propriétaire', 'copropriétaire', 'appartement', 'parking'],
    tour: {
      steps: [
        {
          target: 'lots-nouveau',
          title: 'Créer un lot',
          description: '« Nouveau lot » ouvre le formulaire : bien lié, propriétaire, numéro, type et tantièmes.'
        },
        {
          target: 'lots-importer',
          title: 'Importer des biens',
          description: "« Importer des biens » crée plusieurs lots d'un coup à partir de biens existants."
        },
        {
          target: 'lots-tableau',
          title: 'Le tableau des lots',
          description:
            'Chaque ligne est un lot. Les boutons de la colonne « Actions » modifient, désactivent ou ouvrent son compte.'
        }
      ]
    }
  },
  {
    id: 'syndic.lots.indicateurs',
    kind: 'section',
    title: 'Indicateurs des lots',
    summary:
      'Ces cartes comptent les lots, additionnent les tantièmes et montrent combien de lots ont un propriétaire, un accès au portail et un locataire actif.',
    howToRead: {
      notes: [
        '« Nombre de lots » : tous les lots, actifs ou non.',
        '« Tantièmes généraux cumulés » : la somme des tantièmes généraux de tous les lots.',
        "« Total de référence des tantièmes » : affiché seulement s'il est renseigné dans la fiche ; un avertissement apparaît si la somme est différente.",
        '« Lots avec propriétaire » : lots dont un propriétaire est renseigné.',
        "« Lots avec accès au portail » : lots dont l'accès est « Actif » ou « Partiel ».",
        '« Lots avec locataire actif » : lots avec une affectation de locataire en cours.'
      ]
    },
    faq: [
      {
        q: 'La somme des tantièmes ne correspond pas au total de référence.',
        a: "Un bandeau d'avertissement le signale. Corrigez un tantième ou le total dans la fiche de la copropriété."
      },
      {
        q: 'Les lots inactifs sont-ils comptés ?',
        a: 'Oui dans « Nombre de lots » ; leurs tantièmes valent 0 dans la somme.'
      },
      {
        q: 'Que compte « Lots avec accès au portail » ?',
        a: 'Les lots dont le portail copropriétaire est ouvert, en totalité ou en partie (indivision).'
      }
    ],
    permissions: { feature: 'SYNDIC' },
    keywords: ['indicateurs', 'tantièmes cumulés', 'portail', 'locataire actif']
  },
  {
    id: 'syndic.lots.tableau',
    kind: 'table',
    title: 'Tableau des lots',
    summary:
      'Ce tableau liste les lots avec leur type, leurs tantièmes, leur propriétaire, leur accès au portail, leur locataire et leur bien lié.',
    howToRead: {
      columns: [
        {
          key: 'lotNumber',
          label: 'Lot',
          description:
            "Numéro du lot, avec l'étiquette « Inactif » (0 tantième) ou « Paiement déclaré » quand elle s'applique."
        },
        { key: 'lotType', label: 'Type', description: 'Appartement, Parking, Cave, Bureau, Commerce ou Autre.' },
        {
          key: 'generalShares',
          label: 'Tantièmes généraux',
          description: 'Parts du lot dans les charges générales et les votes.'
        },
        {
          key: 'specialShares',
          label: 'Tantièmes spéciaux',
          description: "Parts du lot dans les charges spéciales (ascenseur…) ; « - » s'il n'y en a pas."
        },
        {
          key: 'ownerContactId',
          label: 'Propriétaire',
          description: 'Le ou les propriétaires actuels ; en indivision, « Nom 1 (50 %), Nom 2 (50 %) ».'
        },
        {
          key: 'portalAccess',
          label: 'Portail',
          description: "État de l'accès au portail copropriétaire et lien « Gérer l'accès »."
        },
        {
          key: 'tenant',
          label: 'Locataire',
          description: 'Locataire rattaché au lot, avec « Mettre fin » pour clore son affectation.'
        },
        {
          key: 'propertyId',
          label: 'Bien lié',
          description: 'Le bien (fiche Biens) auquel le lot est rattaché, ou « Non lié ».'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Modifier », « Compte », « Locataire », « Désactiver » ou « Réactiver », « Supprimer ».'
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: "L'accès au portail est ouvert pour tous les propriétaires du lot."
        },
        {
          value: 'PARTIAL',
          label: 'Partiel',
          description: "Partiel (x/y) : seuls certains propriétaires en indivision ont l'accès."
        },
        { value: 'INACTIVE', label: 'Inactif', description: "Le portail n'est pas ouvert." },
        {
          value: 'NONE',
          label: 'Sans profil',
          description: 'Aucun profil propriétaire sur ce lot : créez-en un dans « Profils et incidents ».'
        }
      ],
      notes: [
        'Filtres : « Type », « Portail », « Locataire » (Occupé / Non occupé) et « Statut du lot » (Actif / Inactif).',
        'La recherche porte sur le numéro, le propriétaire, le bien lié et le locataire.'
      ]
    },
    steps: [
      { title: 'Modifier', detail: '« Modifier » ouvre le formulaire du lot.' },
      {
        title: 'Désactiver',
        detail:
          '« Désactiver » met les tantièmes à 0 après confirmation. « Réactiver » rouvre le formulaire pour ressaisir les tantièmes.'
      },
      {
        title: 'Supprimer',
        detail:
          "« Supprimer » puis confirmation. Refusé si le lot a des appels, paiements ou reçus : l'écran propose alors « Désactiver le lot »."
      },
      { title: 'Ouvrir le compte', detail: "« Compte » ouvre le solde et l'historique du lot." }
    ],
    consequences: [
      'Désactiver un lot le retire des répartitions de charges et des votes ; ses données sont conservées et vous pouvez le réactiver.',
      "Supprimer un lot est définitif ; il n'est possible que si le lot n'a aucun mouvement.",
      "« Mettre fin » à une affectation de locataire détache le locataire du lot ; l'historique est conservé."
    ],
    faq: [
      {
        q: 'Comment inviter un copropriétaire au portail ?',
        a: "Cliquez sur « Gérer l'accès » : vous arrivez sur « Profils et incidents », où se trouve « Inviter au portail »."
      },
      {
        q: 'Pourquoi « Supprimer » échoue-t-il ?',
        a: 'Le lot a des mouvements (appels, paiements, reçus, mandats de prélèvement…). Désactivez-le plutôt.'
      },
      {
        q: 'Pourquoi le propriétaire est-il vide ?',
        a: "Aucun propriétaire n'est relié. Ouvrez « Modifier » et choisissez le « Propriétaire CRM »."
      },
      {
        q: 'Comment exporter les lots ?',
        a: "Avec le bouton d'export du tableau : toutes les lignes correspondant à votre recherche sont exportées."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Modifier, désactiver, supprimer et mettre fin à un locataire demandent le droit de modifier le module Syndic.'
    },
    related: [
      { label: 'Créer ou modifier un lot', helpId: 'syndic.lots.creation' },
      { label: 'Compte d’un lot', helpId: 'syndic.lots.compte' },
      { label: 'Inviter au portail copropriétaire', helpId: 'syndic.lots.invitation' }
    ],
    keywords: ['lot', 'désactiver', 'réactiver', 'tantièmes', 'portail', 'locataire', 'indivision']
  },
  {
    id: 'syndic.lots.creation',
    kind: 'section',
    title: 'Créer ou modifier un lot',
    summary:
      "Ce formulaire crée un lot ou en corrige un : bien lié, propriétaire, numéro, type, tantièmes et date d'entrée du propriétaire.",
    howToRead: {
      notes: [
        "Choisissez d'abord le « Bien lié » : il propose le type, le numéro et le propriétaire. Le choisir après écraserait ces champs.",
        '« Numéro de lot », « Type de lot » et « Tantièmes généraux » sont obligatoires. Le numéro doit être unique dans la copropriété.',
        '« Tantièmes généraux » à 0 : le lot est inactif, exclu de la clé de répartition et des appels futurs.',
        '« Tantièmes spéciaux » : facultatif ; sans valeur, le lot compte 0 dans une répartition en tantièmes spéciaux.',
        "« Propriétaire CRM » : un contact de votre annuaire. « Propriétaire depuis le » : date d'entrée de ce propriétaire."
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: "« Nouveau lot », ou « Modifier » sur la ligne d'un lot." },
      { title: 'Choisir le bien', detail: 'Facultatif : « Sélectionner un bien existant ».' },
      {
        title: 'Choisir le propriétaire',
        detail: 'Champ « Propriétaire CRM » ; rempli automatiquement si le bien a un propriétaire connu.'
      },
      { title: 'Saisir numéro, type, tantièmes', detail: 'Les trois champs obligatoires.' },
      { title: 'Valider', detail: '« Créer le lot » ou « Enregistrer ».' }
    ],
    consequences: [
      "Si la somme des tantièmes ne correspond pas au total de référence de la copropriété, un avertissement s'affiche ; le lot est enregistré quand même.",
      'Un numéro déjà utilisé dans la copropriété est refusé.',
      'Selon votre abonnement, la création peut être refusée quand la réserve de lots de votre pack est atteinte.'
    ],
    faq: [
      {
        q: 'Comment réactiver un lot inactif ?',
        a: "Cliquez sur « Réactiver » : la fenêtre s'ouvre avec les tantièmes vides, saisissez-les."
      },
      {
        q: 'Peut-on lier un immeuble entier ?',
        a: "Non, un lot est une unité (appartement, villa, bureau…). Un immeuble parent n'est pas proposé."
      },
      {
        q: 'Que fait « Propriétaire depuis le » ?',
        a: "Il date l'entrée du propriétaire, pour l'historique de propriété du lot."
      },
      { q: 'Les erreurs de saisie ?', a: "Elles s'affichent sous le champ concerné et la fenêtre reste ouverte." }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Créer demande le droit de créer dans le module Syndic ; modifier demande le droit de le modifier.'
    },
    related: [{ label: 'Importer des biens en lots', helpId: 'syndic.lots.import' }],
    keywords: [
      'nouveau lot',
      'numéro de lot',
      'type de lot',
      'tantièmes généraux',
      'tantièmes spéciaux',
      'propriétaire'
    ]
  },
  {
    id: 'syndic.lots.import',
    kind: 'section',
    title: 'Importer des biens en lots',
    summary:
      "Cette fenêtre crée plusieurs lots d'un coup à partir de biens déjà enregistrés. Pour un immeuble, ce sont ses appartements ou unités qui deviennent des lots.",
    howToRead: {
      notes: [
        'Si vous choisissez un immeuble, les lots importés sont ses sous-propriétés. Pour une villa, un bureau ou un commerce, le lot est le bien lui-même.',
        'Chaque lot créé reçoit 1 tantième général. Un parking reçoit aussi 1 tantième spécial.',
        'Le type de lot est déduit du type de bien ; le numéro du lot reprend la référence interne du bien.',
        "Le propriétaire est relié automatiquement quand l'e-mail du propriétaire du bien correspond à un contact."
      ]
    },
    steps: [
      {
        title: 'Ouvrir',
        detail: "« Importer des biens » (ou la fenêtre s'ouvre seule après la création d'une copropriété)."
      },
      {
        title: 'Choisir les biens',
        detail: '« Propriétés à importer » : plusieurs choix possibles, immeubles, villas, bureaux… mélangés.'
      },
      { title: 'Importer', detail: 'Cliquez sur « Importer ».' },
      { title: 'Ajuster les tantièmes', detail: 'Les lots sont créés avec 1 tantième : modifiez chaque lot ensuite.' }
    ],
    consequences: [
      'Un bien déjà importé dans cette copropriété, ou lié à une autre, est ignoré avec sa raison.',
      'Un numéro déjà pris est ignoré ; un bien refusé par la réserve de lots de votre pack est aussi ignoré.',
      'Le message indique le nombre de lots importés et le nombre de lots ignorés.'
    ],
    faq: [
      {
        q: 'Pourquoi tous mes lots ont-ils 1 tantième ?',
        a: "L'import ne connaît pas les tantièmes. Saisissez-les lot par lot avec « Modifier »."
      },
      {
        q: 'Un bien est ignoré, pourquoi ?',
        a: "Il est déjà lié à un lot, son numéro existe déjà, ou la réserve de lots du pack est atteinte. La raison s'affiche dans le message."
      },
      { q: 'Peut-on annuler un import ?', a: 'Non. Désactivez ou supprimez les lots concernés depuis le tableau.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de créer dans le module Syndic.' },
    related: [{ label: 'Créer ou modifier un lot', helpId: 'syndic.lots.creation' }],
    keywords: ['import', 'biens', 'propriétés', 'immeuble', 'sous-propriétés', 'lots en masse']
  },
  {
    id: 'syndic.lots.locataire',
    kind: 'section',
    title: 'Ajouter un locataire à un lot',
    summary:
      "Cette fenêtre rattache un contact de votre annuaire comme locataire d'un lot, avec une date de début et, si vous la connaissez, une date de fin.",
    howToRead: {
      notes: [
        "« Contact locataire » et « Date de début » sont obligatoires ; la date de début vaut aujourd'hui par défaut.",
        '« Référence bail (optionnel) » et « Notes » sont libres.',
        "Cette action sert quand le locataire n'a pas encore été rattaché via la gestion locative."
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: 'Bouton « Locataire » de la colonne « Actions » du lot.' },
      { title: 'Choisir le contact', detail: '« Sélectionner un contact CRM ».' },
      { title: 'Saisir les dates', detail: '« Date de début », puis « Date de fin » si elle est connue.' },
      { title: 'Assigner', detail: 'Cliquez sur « Assigner ».' }
    ],
    consequences: [
      'Le locataire apparaît dans la colonne « Locataire » du lot et compte dans « Lots avec locataire actif ».',
      "« Mettre fin » (dans le tableau) détache le locataire du lot ; l'historique est conservé."
    ],
    faq: [
      {
        q: 'Le locataire reçoit-il quelque chose ?',
        a: "Rien n'est affiché à l'écran à ce sujet : l'action rattache seulement le contact au lot."
      },
      {
        q: 'Comment retirer un locataire ?',
        a: 'Dans le tableau, « Mettre fin » à côté de son nom, puis « Mettre fin » pour confirmer.'
      },
      { q: "Le contact n'est pas dans la liste.", a: "Créez-le d'abord dans les contacts." }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de modifier le module Syndic.' },
    keywords: ['locataire', 'affectation', 'bail', 'occupant']
  },
  {
    id: 'syndic.lots.bareme',
    kind: 'section',
    title: 'Barème par type de lot',
    summary:
      'Cette carte fixe le montant demandé PAR LOT selon le type de lot (appartement, parking, cave…). Il est repris quand vous répartissez un appel de charges « Par type de lot ».',
    howToRead: {
      columns: [
        { key: 'lotType', label: 'Type', description: 'Appartement, Parking, Cave, Bureau, Commerce ou Autre.' },
        { key: 'count', label: 'Nombre de lots', description: 'Nombre de lots de ce type dans la copropriété.' },
        {
          key: 'rate',
          label: 'Montant par lot',
          description: 'Montant demandé à chaque lot de ce type, ou « Non renseigné ».'
        }
      ],
      notes: [
        'Un montant à 0 veut dire « type non appelé » : ces lots ne paient rien.',
        "Un champ laissé vide reste « Non renseigné » : le type n'est pas dans le barème.",
        'Les avertissements jaunes signalent « Aucun barème enregistré » ou les types de lots sans montant.'
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: 'Onglet « Barème par type de lot » de la fiche, bouton « Modifier le barème ».' },
      {
        title: 'Saisir les montants',
        detail: 'Un montant par type (en FCFA), au moins un. Un montant ne peut pas être négatif.'
      },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer » : « Barème enregistré ».' }
    ],
    consequences: [
      'Le mode de répartition « Par type de lot » devient disponible pour créer un appel de charges ou une programmation, avec ces montants.',
      'Le changement ne touche pas les appels déjà créés.'
    ],
    faq: [
      {
        q: 'Pourquoi « Par type de lot » est-il indisponible ?',
        a: "Aucun barème n'est enregistré, ou il manque des types présents dans la copropriété. Renseignez-le ici."
      },
      {
        q: 'Le montant est-il pour toute la copropriété ?',
        a: 'Non, il est défini par lot : chaque lot du type paie ce montant.'
      },
      { q: 'Je ne vois pas « Modifier le barème ».', a: 'Il demande le droit de modifier le module Syndic.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Modifier le barème demande le droit de modifier le module Syndic.' },
    related: [{ label: 'Appels de charges', helpId: 'syndic.charges.liste' }],
    keywords: ['barème', 'tarifs', 'type de lot', 'montant par lot', 'répartition par type']
  },
  {
    id: 'syndic.lots.paiement',
    kind: 'section',
    title: 'Enregistrer un paiement sur un lot',
    summary:
      "Cette fenêtre enregistre un paiement reçu pour un lot. Elle l'affecte aux appels de charges ouverts et montre l'effet avant de valider.",
    howToRead: {
      columns: [
        { key: 'period', label: 'Période', description: "Période de l'appel de charges." },
        { key: 'dueDate', label: "Date d'échéance", description: "Date limite de paiement de l'appel." },
        { key: 'outstanding', label: 'Reste dû', description: "Montant encore à payer sur l'appel." },
        { key: 'status', label: 'Statut', description: "État de l'appel (soldé, partiel, en retard…)." }
      ],
      notes: [
        'Modes de paiement proposés : « Espèces », « Virement », « Chèque » et « Mobile money ».',
        "Sans case cochée, le paiement solde d'abord les appels les plus anciens. Cochez des appels pour choisir ceux à couvrir.",
        'Le surplus devient une avance, imputée automatiquement sur les appels suivants.',
        "« Aperçu » montre, avant validation, le montant affecté à chaque appel, son origine (Paiement ou Avance), son statut après et l'avance restante."
      ]
    },
    steps: [
      { title: 'Choisir le lot', detail: "« Choisir un lot » (déjà rempli si vous venez d'un appel)." },
      {
        title: 'Saisir le paiement',
        detail: '« Montant », « Date de paiement », « Mode de paiement », « Référence (optionnel) ».'
      },
      { title: 'Choisir les appels', detail: 'Cochez les appels à couvrir, ou laissez vide.' },
      { title: "Lire l'aperçu", detail: "Vérifiez l'affectation et l'avance restante." },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer » : une fenêtre « Paiement enregistré » liste les documents émis.'
      }
    ],
    consequences: [
      "Le paiement est enregistré immédiatement et crédite le compte du lot. Il ne s'annule pas depuis cet écran.",
      "Un reçu est émis ; une quittance l'est pour chaque appel entièrement soldé. Chacun se télécharge, aussi en traduction arabe.",
      "Les documents sont envoyés par e-mail au copropriétaire, PDF joint, si son adresse est connue et si cette notification est active ; un échec d'envoi n'annule pas le paiement.",
      "L'écriture comptable de l'encaissement est passée avec le paiement ; les sommes affectées créditent aussi les fonds liés aux appels."
    ],
    faq: [
      {
        q: 'Que se passe-t-il si je valide deux fois ?',
        a: "Un double clic ou un nouvel essai ne crée pas un second paiement : l'enregistrement est protégé contre les rejeux."
      },
      {
        q: 'Le montant dépasse ce qui est dû.',
        a: 'Le surplus devient une avance du lot, visible dans « Avance disponible » et imputée sur les prochains appels.'
      },
      {
        q: 'Peut-on payer par paiement en ligne ici ?',
        a: 'Non : cette fenêtre enregistre un règlement reçu (espèces, virement, chèque, mobile money).'
      },
      {
        q: 'Comment corriger une erreur ?',
        a: "L'écran ne propose aucune annulation d'un paiement enregistré : vérifiez le montant avant de valider."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Enregistrer un paiement demande le droit de modifier le module Syndic.' },
    related: [
      { label: 'Compte d’un lot', helpId: 'syndic.lots.compte' },
      { label: 'Appels de charges', helpId: 'syndic.charges.liste' },
      { label: 'Quittances', helpId: 'syndic.quittances.liste' }
    ],
    keywords: ['encaisser', 'paiement', 'règlement', 'avance', 'reçu', 'quittance', 'mobile money', 'espèces']
  },
  {
    id: 'syndic.lots.invitation',
    kind: 'section',
    title: 'Inviter au portail copropriétaire',
    summary:
      "Après « Inviter au portail » sur un profil propriétaire, cette fenêtre confirme l'accès ouvert et affiche le lien à transmettre au copropriétaire.",
    howToRead: {
      notes: [
        "« Accès au portail ouvert » indique le nom, l'e-mail et le nombre de lots consultables en lecture seule.",
        "« Lien d'invitation » : le copropriétaire y choisit son mot de passe, lien valable 7 jours (la date de fin s'affiche).",
        "« Lien de connexion » avec l'étiquette « Compte existant » : le contact a déjà un compte ImmoTopia et se connecte avec ses identifiants habituels.",
        "Sous le lien, « E-mail d'invitation envoyé » ou un avertissement si l'e-mail n'a pas pu partir."
      ]
    },
    steps: [
      {
        title: "Lancer l'invitation",
        detail: 'Dans « Profils et incidents », onglet « Profils propriétaires », bouton « Inviter au portail ».'
      },
      { title: 'Copier le lien', detail: "Bouton « Copier » : utile si l'e-mail tarde ou arrive en spam." },
      {
        title: 'Transmettre',
        detail: "Envoyez le lien vous-même si l'e-mail n'a pas pu partir (WhatsApp, remise en main propre)."
      },
      { title: 'Fermer', detail: 'Bouton « Fermer ».' }
    ],
    consequences: [
      "Tous les lots actuels du contact dans l'agence sont ouverts au portail, en lecture seule.",
      "Un e-mail d'invitation est envoyé au contact si l'envoi d'e-mails est configuré ; aucun SMS ni WhatsApp n'est envoyé.",
      "Un contact sans adresse e-mail valide ne peut pas être invité : complétez d'abord sa fiche."
    ],
    faq: [
      {
        q: 'Le lien a expiré.',
        a: "Relancez « Inviter au portail » : un nouveau lien est émis tant que le compte n'a jamais servi."
      },
      {
        q: 'Le copropriétaire a déjà un compte.',
        a: "Le lien affiché est alors un lien de connexion, pas d'activation. Il peut utiliser « Mot de passe oublié »."
      },
      {
        q: "Peut-on retirer l'accès ?",
        a: "Oui, depuis « Profils et incidents » : la révocation ferme tous ses lots de l'agence."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Inviter demande le droit de modifier le module Syndic.' },
    related: [{ label: 'Tableau des lots', helpId: 'syndic.lots.tableau' }],
    keywords: ['portail', 'invitation', 'lien', 'copropriétaire', 'accès', 'mot de passe']
  },

  // ------------------------------------------------------------------ Compte d'un lot
  {
    id: 'syndic.lots.compte',
    kind: 'page',
    title: 'Compte d’un lot',
    summary:
      "Cet écran suit le compte d'un lot : solde, avance, historique des mouvements, reçus et quittances. Vous pouvez télécharger le relevé et ajouter un ajustement.",
    purpose:
      'Le compte du lot dit ce que le copropriétaire doit ou a versé en trop. Chaque appel de charges, paiement, pénalité ou ajustement y laisse une ligne.',
    steps: [
      {
        title: 'Lire le solde',
        detail: '« Solde courant » indique « Débiteur » (il doit), « Créditeur » (il a une avance) ou « Soldé ».'
      },
      {
        title: "Consulter l'historique",
        detail: 'Onglet « Historique des transactions » : filtrez par type et par période.'
      },
      {
        title: 'Retrouver un document',
        detail: 'Onglet « Reçus et quittances » : « Télécharger » ou « Traduction arabe ».'
      },
      { title: 'Télécharger le relevé', detail: '« Télécharger le relevé » donne le relevé du compte en PDF.' },
      { title: 'Corriger un montant', detail: '« Ajouter ajustement » (débit ou crédit).' }
    ],
    consequences: [
      "Un ajustement est définitif : l'écran ne propose pas de l'annuler. Pour corriger, saisissez un ajustement en sens inverse.",
      "Le compte du lot est créé à la première consultation s'il n'existait pas."
    ],
    faq: [
      {
        q: 'Que veut dire « Débiteur » ?',
        a: "Le copropriétaire doit encore ce montant à la copropriété. « Créditeur » signifie qu'il a une avance."
      },
      {
        q: 'Où encaisser un paiement sur ce lot ?',
        a: 'Pas depuis cet écran : utilisez « Enregistrer un paiement » dans les appels de charges.'
      },
      {
        q: "Qu'est-ce que « Avance disponible » ?",
        a: 'Un trop-perçu, imputé automatiquement sur les prochains appels de charges.'
      },
      {
        q: 'Le relevé ne se télécharge pas.',
        a: "Un message d'erreur explique la cause ; réessayez, puis contactez votre administrateur."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété', 'Comptable'],
      note: 'Voir le compte et télécharger le relevé demandent le droit de voir le module Syndic. Ajouter un ajustement demande le droit de le modifier.'
    },
    related: [
      { label: 'Indicateurs du compte', helpId: 'syndic.lots.compte.indicateurs' },
      { label: 'Historique des transactions', helpId: 'syndic.lots.compte.transactions' },
      { label: 'Reçus et quittances', helpId: 'syndic.lots.compte.recus' },
      { label: 'Ajouter un ajustement', helpId: 'syndic.lots.compte.ajustement' },
      { label: 'Enregistrer un paiement sur un lot', helpId: 'syndic.lots.paiement' }
    ],
    keywords: ['compte du lot', 'solde', 'relevé', 'avance', 'débiteur', 'créditeur', 'copropriétaire']
  },
  {
    id: 'syndic.lots.compte.indicateurs',
    kind: 'section',
    title: 'Indicateurs du compte',
    summary:
      "Quatre cartes donnent le solde courant, le nombre de transactions, le propriétaire et l'avance disponible du lot.",
    howToRead: {
      statuses: [
        { value: 'debtor', label: 'Débiteur', description: 'Le copropriétaire doit ce montant.' },
        { value: 'creditor', label: 'Créditeur', description: 'Le copropriétaire a une avance.' },
        { value: 'settled', label: 'Soldé', description: 'Compte à jour.' }
      ],
      notes: [
        '« Solde courant » est toujours affiché en valeur positive, accompagné de « Débiteur », « Créditeur » ou « Soldé ».',
        "« Transactions » : nombre total de lignes du compte, indépendamment des filtres ; « — » tant que l'historique n'est pas ouvert.",
        '« Avance disponible » : trop-perçu imputé automatiquement sur les prochains appels.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi « Transactions » affiche-t-il « — » ?',
        a: "Le compte est compté à l'ouverture de l'onglet « Historique des transactions »."
      },
      {
        q: 'Solde courant et avance, quelle différence ?',
        a: "Le solde est ce que le lot doit ou a de crédit sur son compte. L'avance est la part de paiements non encore affectée à un appel."
      },
      {
        q: 'Le propriétaire affiché est faux.',
        a: 'Il vient du compte du lot. Corrigez le propriétaire dans le tableau des lots.'
      }
    ],
    permissions: { feature: 'SYNDIC' },
    keywords: ['solde courant', 'avance', 'débiteur', 'créditeur']
  },
  {
    id: 'syndic.lots.compte.transactions',
    kind: 'table',
    title: 'Historique des transactions',
    summary:
      'Ce tableau liste tous les mouvements du compte du lot : appels de charges, paiements, pénalités, remises, ajustements et transferts de fonds.',
    howToRead: {
      columns: [
        { key: 'transactionDate', label: 'Date', description: 'Date du mouvement.' },
        { key: 'type', label: 'Type', description: 'Nature du mouvement (voir ci-dessous).' },
        { key: 'label', label: 'Libellé', description: 'Description du mouvement.' },
        { key: 'debit', label: 'Débit', description: 'Montant qui augmente ce que doit le copropriétaire.' },
        { key: 'credit', label: 'Crédit', description: 'Montant qui diminue ce que doit le copropriétaire.' },
        {
          key: 'balanceAfter',
          label: 'Solde',
          description: 'Solde après le mouvement, avec « Débiteur », « Créditeur » ou « Soldé ».'
        }
      ],
      statuses: [
        { value: 'CHARGE_CALL', label: 'Appel de charges', description: 'Débit : charges appelées au lot.' },
        { value: 'PAYMENT', label: 'Paiement', description: 'Crédit : règlement reçu.' },
        { value: 'PENALTY', label: 'Pénalité', description: 'Débit : pénalité de retard.' },
        { value: 'WAIVER', label: 'Remise', description: 'Crédit : remise accordée.' },
        { value: 'ADJUSTMENT', label: 'Ajustement', description: 'Débit ou crédit saisi à la main.' },
        {
          value: 'FUND_TRANSFER',
          label: 'Transfert de fonds',
          description: 'Mouvement lié à un fonds de la copropriété.'
        }
      ],
      notes: ['Filtres : « Type » et « Période ». La recherche porte sur le libellé du mouvement.']
    },
    faq: [
      {
        q: 'Pourquoi ce signe sur le solde ?',
        a: 'Le solde est affiché en valeur positive avec « Débiteur » (le lot doit) ou « Créditeur » (le lot a une avance).'
      },
      {
        q: "Peut-on exporter l'historique ?",
        a: 'Oui. Toutes les lignes correspondant à vos filtres sont exportées, avec un solde signé (+ débiteur, − créditeur).'
      },
      {
        q: 'Comment annuler un mouvement ?',
        a: "Par un ajustement en sens inverse : l'écran ne supprime pas de mouvement."
      }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Ajouter un ajustement', helpId: 'syndic.lots.compte.ajustement' }],
    keywords: ['historique', 'mouvements', 'transactions', 'débit', 'crédit', 'solde']
  },
  {
    id: 'syndic.lots.compte.recus',
    kind: 'table',
    title: 'Reçus et quittances du lot',
    summary:
      'Ce tableau liste les reçus et quittances émis pour ce lot, avec leur numéro, leur type, leur date et leur montant. Chaque document se télécharge.',
    howToRead: {
      columns: [
        { key: 'number', label: 'Numéro', description: 'Numéro du document.' },
        {
          key: 'kind',
          label: 'Type',
          description: '« Reçu » (un paiement) ou « Quittance » (un appel de charges soldé).'
        },
        { key: 'issuedAt', label: 'Émis le', description: "Date d'émission." }
      ],
      statuses: [
        { value: 'RECEIPT', label: 'Reçu', description: 'Émis à chaque paiement.' },
        {
          value: 'QUITTANCE',
          label: 'Quittance',
          description: 'Émise quand un appel de charges est entièrement réglé.'
        }
      ],
      notes: [
        'La colonne « Montant » donne la somme du document ; « Actions » propose « Télécharger » et « Traduction arabe ».',
        'Filtres : « Type », « Émis le » et « Rattrapés » (documents créés après coup).'
      ]
    },
    steps: [
      { title: 'Télécharger', detail: '« Télécharger » donne le document en PDF.' },
      { title: 'Version arabe', detail: '« Traduction arabe » donne une version traduite du même document.' }
    ],
    faq: [
      {
        q: 'Le tableau est vide.',
        a: 'Aucun reçu ni quittance pour ce lot : « Aucun reçu ou quittance pour ce lot. »'
      },
      { q: 'Que veut dire « Rattrapés » ?', a: "Des documents émis après coup pour d'anciens paiements ou appels." },
      {
        q: 'Le copropriétaire les reçoit-il ?',
        a: "Ils lui sont envoyés par e-mail à l'émission, si son adresse est connue ; vous pouvez aussi les télécharger ici."
      }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Quittances', helpId: 'syndic.quittances.liste' }],
    keywords: ['reçu', 'quittance', 'pdf', 'traduction arabe', 'télécharger']
  },
  {
    id: 'syndic.lots.compte.ajustement',
    kind: 'section',
    title: 'Ajouter un ajustement',
    summary:
      'Cette fenêtre ajoute au compte du lot une ligne manuelle, en débit ou en crédit, pour corriger un montant.',
    howToRead: {
      notes: [
        '« Direction » : « Débit » (le lot doit davantage) ou « Crédit » (le lot doit moins).',
        '« Montant » et « Libellé » sont obligatoires ; « Référence (optionnel) » est libre.',
        "Un montant s'exprime en FCFA, au minimum 1."
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: '« Ajouter ajustement » en haut de la page.' },
      { title: 'Choisir le sens', detail: '« Débit » ou « Crédit ».' },
      { title: 'Saisir', detail: '« Montant », « Libellé » et, si utile, « Référence (optionnel) ».' },
      { title: 'Valider', detail: 'Cliquez sur « Enregistrer » : « Ajustement enregistré ».' }
    ],
    consequences: [
      "L'ajustement est enregistré à la date du jour et modifie le solde tout de suite.",
      "Un débit consomme d'abord l'avance disponible du lot.",
      "L'écran ne propose aucune annulation : corrigez par un ajustement en sens inverse, avec un libellé clair."
    ],
    faq: [
      {
        q: 'Quand utiliser un ajustement ?',
        a: 'Pour corriger une erreur ou régulariser un montant sans appel ni paiement.'
      },
      {
        q: 'Ajustement ou paiement ?',
        a: 'Pour un règlement réellement reçu, enregistrez un paiement : il émet un reçu et alimente les fonds.'
      },
      { q: 'Le copropriétaire est-il prévenu ?', a: "Rien n'est envoyé à la saisie d'un ajustement." }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de modifier le module Syndic.' },
    keywords: ['ajustement', 'correction', 'débit', 'crédit', 'régularisation']
  },

  // ------------------------------------------------------------------ Fonds
  {
    id: 'syndic.fonds.mouvements',
    kind: 'table',
    title: 'Mouvements d’un fonds',
    summary:
      "Ce tiroir liste l'historique d'un fonds de la copropriété (réserve, travaux…) : chaque crédit ou débit avec le solde qui en résulte.",
    purpose:
      "Un fonds est une réserve d'argent suivie séparément. Son historique garde la trace de l'ouverture, des parts de charges encaissées, des dépenses, des ajustements et des paiements aux prestataires.",
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: 'Date du mouvement.' },
        { key: 'direction', label: 'Sens', description: '« Crédit » (le fonds augmente) ou « Débit » (il diminue).' },
        { key: 'amount', label: 'Montant', description: 'Montant du mouvement en FCFA.' },
        {
          key: 'balanceAfter',
          label: 'Solde après',
          description: 'Solde du fonds après ce mouvement ; en rouge s’il est négatif.'
        },
        { key: 'label', label: 'Libellé', description: 'Description du mouvement.' },
        { key: 'sourceType', label: 'Origine', description: "D'où vient le mouvement (voir ci-dessous)." }
      ],
      statuses: [
        { value: 'OPENING', label: "Solde d'ouverture", description: 'Solde de départ du fonds.' },
        {
          value: 'CHARGE_PAYMENT',
          label: 'Paiement de charges',
          description: "Part d'un paiement de charges affectée au fonds."
        },
        { value: 'MANUAL_EXPENSE', label: 'Dépense', description: 'Dépense payée par le fonds, saisie à la main.' },
        { value: 'MANUAL_ADJUSTMENT', label: 'Ajustement manuel', description: 'Correction saisie à la main.' },
        {
          value: 'PROVIDER_PAYMENT',
          label: 'Paiement prestataire',
          description: "Débit généré par le paiement d'un prestataire."
        },
        {
          value: 'PROVIDER_PAYMENT_REVERSAL',
          label: 'Annulation de paiement prestataire',
          description: 'Crédit généré par l’annulation de ce paiement.'
        }
      ]
    },
    faq: [
      {
        q: 'Le solde est en rouge.',
        a: "Le fonds est négatif après ce mouvement. C'est permis ; vérifiez les dépenses ou les ajustements."
      },
      {
        q: 'Comment ajuster le solde ?',
        a: 'Depuis le détail des fonds de la trésorerie, bouton « Ajuster le solde ».'
      },
      { q: 'Peut-on exporter ?', a: 'Oui. Tous les mouvements du fonds sont exportés, pas seulement la page affichée.' }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Détail des fonds', helpId: 'syndic.tresorerie.fonds' }],
    keywords: ['fonds', 'réserve', 'fonds de travaux', 'mouvements', 'historique', 'solde']
  }
];

export default entries;
