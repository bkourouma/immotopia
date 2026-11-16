import type { HelpEntry } from '../../../types';

/** Zone « documents » du module « communication » (fr) : modèles de documents de l'agence. */
const entries: HelpEntry[] = [
  {
    id: 'communication.documents.modeles',
    kind: 'page',
    title: 'Modèles de documents',
    summary:
      'Gérez les fichiers Word (.docx) qui servent à produire les baux, reçus de loyer et relevés de compte de votre agence : ajout, modèle par défaut, désactivation, suppression.',
    purpose:
      "Un modèle est un document Word contenant des variables entre doubles accolades, par exemple {{AGENCE_NOM}}. À la génération d'un document de location, ImmoTopia les remplace par les vraies informations (agence, loyer, locataire…) et enregistre le résultat au format Word.\n\nSeuls quatre types ont des modèles : Bail Habitation, Bail Commercial, Reçu de Loyer et Relevé de Compte.",
    howToRead: {
      notes: [
        "ImmoTopia prend d'abord le modèle choisi dans le formulaire de génération (s'il est actif et du bon type), sinon le modèle « Par défaut » de l'agence pour ce type, sinon le dernier modèle actif de l'agence, sinon le modèle standard d'ImmoTopia."
      ]
    },
    steps: [
      {
        title: 'Ajouter un modèle',
        detail:
          'Cliquez sur « Ajouter un template », choisissez le type, donnez un nom et sélectionnez votre fichier Word.'
      },
      {
        title: 'Choisir le modèle par défaut',
        detail: "Dans la ligne du modèle, cliquez sur « Définir par défaut ». Il n'y en a qu'un par type."
      },
      {
        title: 'Mettre un modèle de côté',
        detail: "Cliquez sur « Désactiver » : il n'est plus proposé à la génération. « Activer » le remet en service."
      }
    ],
    consequences: [
      'Un modèle ne change que les documents générés après lui.',
      "« Régénérer » relit le modèle : si celui d'origine est désactivé ou supprimé, le modèle par défaut est utilisé.",
      'La suppression est définitive ; pour pouvoir revenir en arrière, préférez « Désactiver ».',
      'Le premier modèle ajouté pour un type devient automatiquement le modèle par défaut de ce type.'
    ],
    faq: [
      {
        q: 'Quels documents puis-je personnaliser ?',
        a: "Les quatre types de la liste ; aucun autre n'est disponible ici."
      },
      {
        q: "Je n'ai ajouté aucun modèle : puis-je quand même générer des documents ?",
        a: "Oui, si le modèle standard d'ImmoTopia est installé. Le tableau affiche alors « Aucun modèle de document n'est encore enregistré pour cette agence »."
      },
      {
        q: 'Pourquoi mon action est-elle refusée ?',
        a: "Ajouter, activer, désactiver, définir par défaut et supprimer demandent le droit « Modifier les documents location ». Les boutons restent visibles, mais l'action échoue sans ce droit."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Voir la liste : « Voir les documents location » (ou « Générer des documents location »). Toute modification : « Modifier les documents location ».'
    },
    related: [
      { label: 'Lire le tableau des modèles', helpId: 'communication.documents.modeles.tableau' },
      { label: 'Ajouter un modèle', helpId: 'communication.documents.modeles.ajout' },
      { label: 'Créer un modèle Word avec des variables', helpId: 'communication.documents.modeles.guide' },
      { label: 'Les quatre types de modèles', helpId: 'communication.documents.modeles.types' },
      { label: 'Liste des baux', to: '/tenant/:tenantId/rental/leases' }
    ],
    keywords: [
      'modèle',
      'template',
      'contrat',
      'bail',
      'quittance',
      'reçu de loyer',
      'relevé de compte',
      'word',
      'docx',
      'personnaliser',
      'document de location'
    ]
  },
  {
    id: 'communication.documents.modeles.tableau',
    kind: 'table',
    title: 'Tableau des modèles',
    summary: 'Chaque ligne est un modèle Word de votre agence, avec son type, son statut et ses variables.',
    howToRead: {
      columns: [
        {
          key: 'name',
          label: 'Nom',
          description:
            "Nom donné au modèle, fichier d'origine dessous. « Par défaut » marque le modèle utilisé d'office."
        },
        {
          key: 'doc_type',
          label: 'Type',
          description: 'Bail Habitation, Bail Commercial, Reçu de Loyer ou Relevé de Compte.'
        },
        {
          key: 'status',
          label: 'Statut',
          description: 'Actif : utilisable à la génération. Inactif : mis de côté.'
        },
        {
          key: 'placeholders',
          label: 'Placeholders',
          description: 'Variables repérées dans le fichier Word : les trois premières, puis « +2 », « +5 »…'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Définir par défaut » (absent si déjà le cas), « Activer » ou « Désactiver », « Supprimer ».'
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: 'Proposé à la génération ; peut être le modèle par défaut.'
        },
        {
          value: 'INACTIVE',
          label: 'Inactif',
          description: 'Non proposé à la génération, ne peut pas être par défaut ; réactivable.'
        }
      ],
      notes: [
        "Seuls les modèles de votre agence sont listés, pas le modèle standard d'ImmoTopia.",
        'Sur téléphone, chaque modèle devient une carte ; « Désactiver » (ou « Activer ») et « Supprimer » passent dans le menu « ⋮ ».',
        '« Exporter » enregistre tous les modèles correspondant à votre recherche, pas seulement la page affichée.'
      ]
    },
    steps: [
      { title: 'Chercher', detail: 'Tapez un nom, un fichier, un type ou une variable.' },
      { title: 'Filtrer', detail: 'Filtrez par « Type de document », « Statut » ou « Par défaut ».' },
      { title: 'Agir sur un modèle', detail: 'Utilisez les boutons de la colonne « Actions ».' }
    ],
    consequences: [
      "« Définir par défaut » retire l'étiquette à l'ancien modèle du même type. Seul un modèle actif peut être choisi : activez-le d'abord.",
      "« Désactiver » le modèle par défaut lui retire l'étiquette ; le modèle actif le plus récent du même type, s'il existe, le remplace.",
      '« Supprimer » demande confirmation et est définitif. Un modèle par défaut supprimé est remplacé comme après une désactivation.',
      'Les documents déjà générés ne sont pas modifiés.'
    ],
    faq: [
      {
        q: 'Pourquoi « Définir par défaut » est-il refusé sur un modèle inactif ?',
        a: "Seul un modèle actif peut l'être : cliquez d'abord sur « Activer »."
      },
      {
        q: 'Pourquoi « Par défaut » a-t-il changé de modèle ?',
        a: "Le modèle par défaut a été désactivé ou supprimé : le modèle actif le plus récent du même type l'a remplacé."
      },
      {
        q: 'Mes variables sont vides : est-ce grave ?',
        a: 'Non, mais le document sera identique à chaque fois. Seules les variables en majuscules entre doubles accolades sont repérées.'
      },
      {
        q: 'Peut-on récupérer un modèle supprimé ?',
        a: 'Pas depuis cet écran : ajoutez de nouveau votre fichier Word.'
      }
    ],
    permissions: {
      note: 'Lire : « Voir les documents location » (ou « Générer des documents location ») ; colonne « Actions » : « Modifier les documents location ».'
    },
    related: [
      { label: "Vue d'ensemble des modèles", helpId: 'communication.documents.modeles' },
      { label: 'Ajouter un modèle', helpId: 'communication.documents.modeles.ajout' }
    ],
    keywords: ['liste des modèles', 'par défaut', 'activer', 'désactiver', 'supprimer un modèle', 'variables']
  },
  {
    id: 'communication.documents.modeles.guide',
    kind: 'section',
    title: 'Créer un modèle avec des variables',
    summary:
      "Un modèle se prépare dans Word : vous écrivez votre document comme d'habitude et vous placez des variables aux endroits à remplir automatiquement.",
    purpose:
      'Les variables permettent à un même modèle de servir pour tous vos baux, reçus ou relevés : à chaque génération, elles sont remplacées par les informations du bail ou du paiement concerné.',
    steps: [
      {
        title: 'Composer le document dans Word',
        detail: 'Mettez en page vos textes, votre en-tête et vos clauses comme vous le souhaitez.'
      },
      {
        title: 'Placer les variables',
        detail:
          'Là où une information doit apparaître, écrivez son nom entre doubles accolades, par exemple {{AGENCE_NOM}} ou {{BAIL_LOYER_MENSUEL}}. Utilisez des majuscules, des chiffres et le tiret bas, sans espace ni accent.'
      },
      {
        title: 'Enregistrer au format .docx',
        detail: "Seuls les fichiers Word .docx sont acceptés, jusqu'à 10 Mo."
      },
      {
        title: "L'ajouter à l'agence",
        detail: 'Cliquez sur « Ajouter un template » et suivez le formulaire.'
      }
    ],
    consequences: [
      "Une variable que le système ne connaît pas, ou dont l'information manque, reste écrite telle quelle entre accolades dans le document produit : relisez-le avant de l'envoyer.",
      "Si votre modèle utilise le nom de l'agence, le nom du locataire, le numéro du bail ou le loyer mensuel et que l'information est absente, la génération s'arrête avec un message « Champs critiques manquants ».",
      "Les variables {{LOGO_EMETTEUR}}, {{SIGNATURE_EMETTEUR}} et {{CACHET_EMETTEUR}} insèrent le logo, la signature et le cachet de l'agence. Sans image enregistrée, l'emplacement reste vide. Le logo se règle dans « Logo et couleur de marque », la signature et le cachet dans « Signature et cachet pour les documents », sur la page des paramètres de l'agence."
    ],
    faq: [
      {
        q: 'Comment modifier un modèle déjà ajouté ?',
        a: "L'écran ne permet ni de le télécharger ni de le modifier. Corrigez votre fichier Word d'origine, ajoutez-le comme nouveau modèle, définissez-le par défaut, puis désactivez ou supprimez l'ancien."
      },
      {
        q: 'Où trouver la liste de toutes les variables ?',
        a: "Cet écran n'en affiche pas la liste complète. Les variables repérées dans votre fichier apparaissent dans la colonne « Placeholders » du tableau après l'ajout."
      },
      {
        q: "Mon fichier est-il vérifié à l'ajout ?",
        a: "Seuls le format, la taille et l'absence de doublon sont contrôlés. Les variables sont repérées, mais une variable inconnue n'est pas refusée."
      },
      {
        q: 'Puis-je écrire une variable en minuscules ?',
        a: 'Non : seules les variables en majuscules, chiffres et tiret bas sont repérées et remplacées.'
      }
    ],
    permissions: { feature: 'RENTAL' },
    related: [
      { label: 'Ajouter un modèle', helpId: 'communication.documents.modeles.ajout' },
      { label: "Paramètres de l'agence", to: '/tenant/:tenantId/settings' }
    ],
    keywords: ['variable', 'accolades', 'word', 'docx', 'logo', 'signature', 'cachet', 'en-tête', 'placeholder']
  },
  {
    id: 'communication.documents.modeles.ajout',
    kind: 'section',
    title: 'Ajouter un modèle',
    summary:
      'Ce formulaire enregistre un nouveau modèle Word pour votre agence : vous choisissez son type, son nom et son fichier.',
    steps: [
      {
        title: 'Choisir le type de document',
        detail: 'Bail Habitation (proposé au départ), Bail Commercial, Reçu de Loyer ou Relevé de Compte.'
      },
      {
        title: 'Donner un nom',
        detail: 'Par exemple « Bail Habitation Standard ». Le nom est obligatoire, 255 caractères au plus.'
      },
      {
        title: 'Sélectionner le fichier',
        detail: 'Cliquez sur « Sélectionner un fichier DOCX » et choisissez un fichier Word .docx de 10 Mo au plus.'
      },
      {
        title: 'Valider',
        detail: 'Cliquez sur « Télécharger ». « Annuler » ferme le formulaire sans rien enregistrer.'
      }
    ],
    consequences: [
      "Le modèle est ajouté « Actif ». Il devient aussi modèle par défaut s'il est le premier de votre agence pour ce type ; sinon, le modèle par défaut actuel ne change pas.",
      "Le type ne peut plus être modifié après l'ajout : en cas d'erreur, ajoutez le fichier de nouveau avec le bon type et supprimez l'ancien.",
      'Un fichier au contenu identique à un modèle existant du même type est refusé (« Un modèle au contenu identique existe déjà pour ce type de document. »).',
      "Un fichier qui n'est pas au format .docx, ou de plus de 10 Mo, est refusé."
    ],
    faq: [
      {
        q: "Pourquoi l'ajout est-il refusé ?",
        a: "Le message affiché donne la raison : fichier qui n'est pas un .docx, fichier trop gros, ou modèle identique déjà présent pour ce type. Le droit « Modifier les documents location » est aussi nécessaire."
      },
      {
        q: 'Le nouveau modèle sert-il tout de suite ?',
        a: "Il est proposé dès la prochaine génération du même type. Il n'est utilisé d'office que s'il est le modèle par défaut, sinon vous le choisissez dans le formulaire de génération."
      },
      {
        q: 'Un modèle sans variable est-il accepté ?',
        a: "Oui, mais il produira toujours le même texte. Placez des variables pour que les informations du bail s'insèrent."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande le droit « Modifier les documents location ».' },
    related: [
      { label: 'Créer un modèle avec des variables', helpId: 'communication.documents.modeles.guide' },
      { label: 'Les quatre types de modèles', helpId: 'communication.documents.modeles.types' }
    ],
    keywords: ['ajouter un template', 'importer', 'téléverser', 'nouveau modèle', 'fichier word']
  },
  {
    id: 'communication.documents.modeles.types',
    kind: 'section',
    title: 'Les types de modèles',
    summary:
      "Quatre types de documents ont des modèles personnalisables. Le type choisi à l'ajout décide pour quel document le modèle pourra servir.",
    howToRead: {
      statuses: [
        {
          value: 'LEASE_HABITATION',
          label: 'Bail Habitation',
          description:
            "Le contrat de bail d'un bien d'habitation : c'est le type utilisé pour tout bail dont le bien n'est ni un bureau, ni une boutique, ni un entrepôt."
        },
        {
          value: 'LEASE_COMMERCIAL',
          label: 'Bail Commercial',
          description: "Le contrat de bail d'un bien de type bureau, boutique commerciale ou entrepôt industriel."
        },
        {
          value: 'RENT_RECEIPT',
          label: 'Reçu de Loyer',
          description: "Le reçu (quittance) d'un paiement encaissé. Chaque reçu généré reçoit son propre numéro."
        },
        {
          value: 'RENT_STATEMENT',
          label: 'Relevé de Compte',
          description: "Le relevé de compte locatif d'un bail, sur une période choisie à la génération."
        }
      ]
    },
    consequences: [
      "Un modèle n'est proposé que pour les documents de son type : un modèle de reçu ne peut pas servir à produire un contrat.",
      'Chaque type a son propre modèle par défaut.'
    ],
    faq: [
      {
        q: "Où sont l'avis d'échéance et la facture ?",
        a: "Cet écran ne propose que les quatre types ci-dessus : il n'y a pas de modèle personnalisable pour d'autres documents."
      },
      {
        q: 'Où se génèrent les documents ?',
        a: 'Dans les documents de location, depuis un bail ou un paiement. Le formulaire de génération propose les modèles actifs du type correspondant, avec le modèle par défaut présélectionné.'
      },
      {
        q: 'Comment le type commercial est-il choisi pour un contrat ?',
        a: "ImmoTopia le déduit du type de bien du bail : bureau, boutique commerciale ou entrepôt industriel donnent un contrat commercial, tous les autres un contrat d'habitation."
      }
    ],
    permissions: { feature: 'RENTAL' },
    related: [
      { label: 'Ajouter un modèle', helpId: 'communication.documents.modeles.ajout' },
      { label: "Vue d'ensemble des modèles", helpId: 'communication.documents.modeles' }
    ],
    keywords: [
      'type de document',
      'bail habitation',
      'bail commercial',
      'reçu de loyer',
      'relevé de compte',
      'quittance'
    ]
  }
];

export default entries;
