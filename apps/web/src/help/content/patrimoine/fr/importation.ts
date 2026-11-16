import type { HelpEntry } from '../../../types';

/** Zone « importation » du module « patrimoine » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.importation',
    kind: 'page',
    title: 'Importer mon patrimoine',
    summary:
      'Reprenez votre parc depuis un fichier Excel ou CSV, en six étapes. Les erreurs sont détectées avant toute écriture : seules les lignes que vous validez sont importées.',
    purpose:
      "Plutôt que de saisir vos biens un par un, vous chargez un fichier. Deux natures sont possibles : « Biens » (crée des biens détenus par l'agence) et « Valorisations » (ajoute des valorisations à des biens existants). Les baux et les locataires ne s'importent pas ici.",
    steps: [
      {
        title: 'La nature',
        detail: 'Choisissez « Biens » ou « Valorisations », puis « Continuer ».'
      },
      {
        title: 'Le fichier',
        detail: 'Téléchargez le gabarit Excel, remplissez-le, puis déposez votre fichier (.xlsx ou .csv).'
      },
      {
        title: 'Les colonnes',
        detail: 'Indiquez à quel champ correspond chaque colonne de votre fichier, puis « Prévisualiser ».'
      },
      {
        title: "L'aperçu",
        detail: 'Corrigez les cellules en erreur, décochez les lignes à ne pas importer, puis « Importer ».'
      },
      {
        title: "L'import",
        detail: "Patientez : les lignes sont envoyées une par une. Vous pouvez arrêter l'import."
      },
      {
        title: 'Le rapport',
        detail: 'Vérifiez le résultat de chaque ligne et téléchargez le rapport au format CSV.'
      }
    ],
    consequences: [
      "Le fichier est lu sur votre poste et n'est jamais envoyé tel quel : seules les lignes validées partent, une à une.",
      "L'import ne se défait pas en un clic : il n'existe pas de bouton pour annuler les lignes déjà importées. Chaque bien créé est un vrai bien de l'agence.",
      "Un bien importé est un bien détenu par l'agence : aucun propriétaire ni mandat n'est créé.",
      "Sur la nature « Biens », l'import peut compter dans la capacité de votre abonnement (biens détenus ou lots), et il est impossible si l'abonnement est en lecture seule."
    ],
    faq: [
      {
        q: 'Puis-je importer mes locataires et mes baux ?',
        a: 'Non. Cet import crée uniquement des biens et leurs valorisations.'
      },
      {
        q: 'Quelles sont les limites du fichier ?',
        a: 'Formats .xlsx et .csv, 5 Mo au plus et 1 000 lignes de données. Un CSV doit être en UTF-8 ; sinon il est lu en Windows-1252 et un avertissement vous invite à vérifier les accents.'
      },
      {
        q: "Où est la ligne d'exemple de mon fichier ?",
        a: "La ligne d'exemple du gabarit est ignorée automatiquement ; le nombre de lignes ignorées est indiqué."
      },
      {
        q: "Que faire si l'import s'arrête ?",
        a: "Le rapport liste les lignes non traitées ou refusées. Utilisez « Relancer les lignes refusées » ou revenez à l'aperçu."
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Réservé aux utilisateurs qui peuvent créer ou modifier des biens.'
    },
    related: [
      { label: 'La nature', helpId: 'patrimoine.importation.nature' },
      { label: 'Le fichier', helpId: 'patrimoine.importation.fichier' },
      { label: 'Les colonnes', helpId: 'patrimoine.importation.colonnes' },
      { label: "L'aperçu", helpId: 'patrimoine.importation.apercu' },
      { label: 'Le rapport', helpId: 'patrimoine.importation.rapport' }
    ],
    keywords: [
      'importer',
      'import en masse',
      'Excel',
      'CSV',
      'fichier',
      'reprise de données',
      'gabarit',
      'biens',
      'valorisations'
    ],
    tour: {
      steps: [
        {
          target: 'import-etapes',
          title: 'Les six étapes',
          description: 'La barre montre où vous en êtes : nature, fichier, colonnes, aperçu, import, rapport.'
        },
        {
          target: 'import-etape-courante',
          title: "Le titre de l'étape",
          description: "Le « ? » à côté du titre explique l'étape en cours."
        },
        {
          target: 'import-contenu',
          title: "Le contenu de l'étape",
          description: "C'est ici que vous choisissez, déposez, corrigez puis lancez l'import."
        }
      ]
    }
  },
  {
    id: 'patrimoine.importation.nature',
    kind: 'section',
    title: 'Étape 1 : la nature',
    summary:
      'Vous choisissez ce que contient votre fichier : des biens à créer, ou des valorisations à ajouter à des biens existants.',
    purpose:
      "Chaque nature a ses propres champs, ses propres règles et son propre gabarit. Un fichier ne contient qu'une seule nature.",
    steps: [
      {
        title: 'Choisir la nature',
        detail:
          "« Biens » crée des biens détenus par l'agence, un par ligne, avec une valeur d'acquisition facultative. « Valorisations » ajoute des valorisations à des biens existants, rattachés par leur référence ou leur titre exact."
      },
      {
        title: 'Continuer',
        detail:
          "Le bouton « Continuer » s'active quand une nature est choisie et que les listes de référence sont chargées. En cas d'échec de chargement, cliquez sur « Réessayer »."
      }
    ],
    consequences: ["Rien n'est écrit à cette étape.", 'Plusieurs valorisations par bien sont permises.'],
    faq: [
      {
        q: 'Où importer mes baux et mes locataires ?',
        a: "Ils ne s'importent pas ici : le message en haut de l'étape le rappelle."
      },
      {
        q: 'Je dois créer des biens puis leurs valorisations. Dans quel ordre ?',
        a: "D'abord « Biens », puis « Valorisations » avec la référence attribuée à chaque bien (visible dans le rapport)."
      },
      {
        q: 'Pourquoi « Continuer » est-il grisé ?',
        a: "Aucune nature n'est choisie, ou les listes de référence (communes, biens…) sont encore en cours de chargement."
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: 'Le fichier', helpId: 'patrimoine.importation.fichier' }],
    keywords: ['nature', 'biens', 'valorisations', 'choisir']
  },
  {
    id: 'patrimoine.importation.fichier',
    kind: 'section',
    title: 'Étape 2 : le fichier',
    summary:
      "Téléchargez le gabarit, remplissez-le, puis déposez votre fichier. Il est lu sur votre poste et n'est pas envoyé.",
    purpose:
      "Le gabarit Excel contient les bonnes colonnes de la nature choisie et une ligne d'exemple. Partir du gabarit évite la plupart des erreurs de colonnes.",
    steps: [
      {
        title: 'Télécharger le gabarit',
        detail: 'Cliquez sur « Télécharger le gabarit Excel » et remplissez-le.'
      },
      {
        title: 'Déposer le fichier',
        detail:
          'Glissez le fichier dans la zone, ou cliquez pour le choisir. Formats acceptés : .xlsx et .csv (séparateur ; ou ,), 5 Mo et 1 000 lignes au plus.'
      },
      {
        title: 'Attendre la lecture',
        detail: "« Lecture du fichier… » s'affiche, puis vous passez à l'étape des colonnes."
      },
      {
        title: 'Revenir en arrière',
        detail: '« Revenir à la nature » permet de changer de nature.'
      }
    ],
    consequences: [
      "Le fichier reste sur votre poste : il est lu ici et n'est jamais envoyé.",
      "Un fichier trop gros, trop long ou d'un autre format est refusé avec un message d'erreur.",
      "Un CSV qui n'est pas en UTF-8 est lu en Windows-1252 : vérifiez les accents dans l'aperçu."
    ],
    faq: [
      {
        q: 'Mon fichier est refusé. Pourquoi ?',
        a: 'Un message en rouge donne la raison : taille, nombre de lignes ou de colonnes, ou format non accepté.'
      },
      {
        q: 'Puis-je utiliser mon propre fichier sans le gabarit ?',
        a: "Oui. À l'étape suivante vous associez chaque colonne à un champ ; les noms de colonnes courants sont souvent reconnus."
      },
      {
        q: 'Mes données sont-elles envoyées au chargement ?',
        a: "Non. Seules les lignes validées partent, au moment de l'import."
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [
      { label: 'La nature', helpId: 'patrimoine.importation.nature' },
      { label: 'Les colonnes', helpId: 'patrimoine.importation.colonnes' }
    ],
    keywords: ['gabarit', 'xlsx', 'csv', 'déposer', 'limites', 'taille']
  },
  {
    id: 'patrimoine.importation.colonnes',
    kind: 'section',
    title: 'Étape 3 : les colonnes',
    summary:
      "Vous indiquez à quel champ correspond chaque colonne de votre fichier. Les champs obligatoires sont marqués d'une étoile.",
    purpose:
      'ImmoTopia propose une correspondance quand le nom de la colonne est reconnu. Vérifiez-la et complétez celle qui manque.',
    steps: [
      {
        title: 'Vérifier le fichier',
        detail: 'Le nom du fichier, la feuille lue et le nombre de lignes trouvées sont rappelés en haut.'
      },
      {
        title: 'Associer les colonnes',
        detail:
          "Dans la liste de chaque colonne, choisissez le champ du document. Un champ ne sert qu'une fois. Laissez « Ne pas importer cette colonne » pour ignorer une colonne."
      },
      {
        title: 'Compléter les champs obligatoires',
        detail:
          'Biens : Titre, Type de bien, Ville / commune, Mode de transaction. Valorisations : Bien (référence ou titre), Date de la valorisation, Valeur estimée.'
      },
      {
        title: 'Prévisualiser',
        detail: "Le bouton « Prévisualiser » s'active quand aucun champ obligatoire ne manque."
      }
    ],
    consequences: [
      "Rien n'est écrit à cette étape.",
      'La ville / commune doit correspondre exactement à une commune du référentiel géographique.'
    ],
    faq: [
      {
        q: 'Pourquoi « Prévisualiser » est-il grisé ?',
        a: "Un champ obligatoire n'est associé à aucune colonne : l'avertissement « Champs obligatoires non rapprochés » les liste."
      },
      {
        q: 'Une colonne est mal reconnue. Que faire ?',
        a: 'Changez le champ dans la liste de cette colonne, ou choisissez « Ne pas importer cette colonne ».'
      },
      {
        q: "Un message parle d'une ligne d'exemple ignorée. Est-ce grave ?",
        a: "Non : c'est la ligne d'exemple du gabarit, volontairement laissée de côté."
      },
      {
        q: 'Les accents sont bizarres. Pourquoi ?',
        a: "Le fichier n'est pas en UTF-8 et a été lu en Windows-1252 : vérifiez les accents dans l'aperçu."
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [
      { label: 'Tableau de correspondance', helpId: 'patrimoine.importation.correspondance' },
      { label: "L'aperçu", helpId: 'patrimoine.importation.apercu' }
    ],
    keywords: ['colonnes', 'rapprochement', 'correspondance', 'champs obligatoires', 'mapping']
  },
  {
    id: 'patrimoine.importation.correspondance',
    kind: 'table',
    title: 'Tableau de correspondance des colonnes',
    summary: "Chaque ligne est une colonne de votre fichier. Vous choisissez le champ du document qu'elle alimente.",
    howToRead: {
      columns: [
        {
          key: 'entete',
          label: 'Colonne du fichier',
          description: "Le titre de la colonne tel qu'il figure dans votre fichier."
        },
        {
          key: 'exemple',
          label: 'Exemple',
          description: 'La valeur de la première ligne de données, pour vous aider à reconnaître la colonne.'
        },
        {
          key: 'champ',
          label: 'Champ du document',
          description:
            'Le champ à alimenter. Une étoile marque un champ obligatoire. Une aide courte apparaît sous la liste quand elle existe.'
        }
      ],
      notes: ["Ce tableau n'a pas d'export : il sert seulement à choisir les correspondances."]
    },
    faq: [
      {
        q: 'Puis-je associer deux colonnes au même champ ?',
        a: "Non : si vous choisissez un champ déjà pris, il est retiré de l'autre colonne."
      },
      {
        q: "À quoi sert l'aide sous la liste ?",
        a: 'Elle donne les valeurs attendues, par exemple la liste des types de bien.'
      },
      {
        q: 'Comment ignorer une colonne ?',
        a: 'Videz la liste, ce qui affiche « Ne pas importer cette colonne ».'
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: 'Étape 3 : les colonnes', helpId: 'patrimoine.importation.colonnes' }],
    keywords: ['correspondance', 'colonne du fichier', 'champ du document']
  },
  {
    id: 'patrimoine.importation.apercu',
    kind: 'section',
    title: "Étape 4 : l'aperçu",
    summary:
      "Vous voyez chaque ligne telle qu'elle sera importée. Vous corrigez les cellules, décochez ce qui ne doit pas partir, puis lancez l'import.",
    purpose:
      "C'est le dernier contrôle avant l'écriture : erreurs de saisie, doublons probables et capacité de l'abonnement s'y affichent.",
    steps: [
      {
        title: 'Lire le résumé',
        detail: 'Le bandeau compte les lignes prêtes, en erreur, en doublon probable, ignorées et hors quota.'
      },
      {
        title: 'Corriger',
        detail: "Chaque cellule est modifiable. L'état de la ligne se met à jour tout de suite."
      },
      {
        title: 'Choisir pour les doublons',
        detail:
          "« Ignorer les doublons » (choix par défaut) : la ligne est décochée et n'est pas importée. Ou les refuser : la ligne reste alors en erreur tant qu'elle n'est pas corrigée ou décochée."
      },
      {
        title: 'Décocher',
        detail: "Une ligne décochée n'est pas importée. « Tout cocher » agit sur toutes les lignes."
      },
      {
        title: 'Importer',
        detail: 'Cliquez sur « Importer N ligne(s) » : N est le nombre de lignes prêtes.'
      }
    ],
    consequences: [
      "Le bouton « Importer » est grisé s'il n'y a aucune ligne prête, si l'abonnement est en lecture seule, ou pendant l'estimation de la capacité.",
      "Pour « Biens », un doublon est une référence déjà utilisée, ou un même titre avec la même adresse, dans le fichier ou parmi vos biens. Pour « Valorisations », seuls les doublons à l'intérieur du fichier sont signalés.",
      "L'estimation de la capacité est indicative : le serveur reste l'autorité et peut refuser ou facturer autrement.",
      "Par défaut, les doublons probables sont ignorés (non importés) : changez le choix pour les refuser et voir l'erreur.",
      'Selon votre abonnement, les lignes au-delà de la capacité sont retenues (« Hors quota »), facturées en dépassement, ou envoyées avec un simple avertissement.'
    ],
    faq: [
      {
        q: 'Que veut dire « Hors quota (estimation) » ?',
        a: "La capacité de votre abonnement est atteinte : la ligne ne sera pas envoyée. L'estimation peut différer du contrôle du serveur."
      },
      {
        q: 'Quelles lignes comptent dans la capacité ?',
        a: 'Si votre pack a une capacité de biens détenus, chaque ligne compte. Sinon seules comptent les lignes proposées en Location ou en Location courte durée.'
      },
      {
        q: 'Comment ne voir que les erreurs ?',
        a: "Cochez « N'afficher que les lignes en erreur »."
      },
      {
        q: "Un message dit que l'abonnement est en lecture seule.",
        a: "L'import est impossible tant que l'abonnement n'est pas régularisé."
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [
      { label: "Tableau de l'aperçu", helpId: 'patrimoine.importation.apercu-tableau' },
      { label: "L'import", helpId: 'patrimoine.importation.import' }
    ],
    keywords: ['aperçu', 'prévisualisation', 'doublons', 'erreurs', 'quota', 'capacité', 'importer']
  },
  {
    id: 'patrimoine.importation.apercu-tableau',
    kind: 'table',
    title: "Tableau de l'aperçu",
    summary:
      "Chaque ligne de votre fichier s'affiche avec ses cellules modifiables et son état. Les erreurs sont signalées sur la cellule et dans la colonne « État ».",
    howToRead: {
      columns: [
        {
          key: 'selection',
          label: 'Case à cocher',
          description:
            'Cochée : la ligne sera importée. Décochée : elle est laissée de côté. La case du titre agit sur toutes les lignes.'
        },
        {
          key: 'numero',
          label: 'Ligne',
          description: 'Le numéro de la ligne dans votre fichier.'
        },
        {
          key: 'etat',
          label: 'État',
          description: 'Le diagnostic de la ligne (voir les états ci-dessous).'
        }
      ],
      statuses: [
        { value: 'ready', label: 'Prête', description: 'La ligne sera importée.' },
        {
          value: 'error',
          label: 'En erreur',
          description:
            "Au moins une cellule est invalide ; le motif est écrit sous l'état. Corrigez-la ou décochez la ligne."
        },
        {
          value: 'duplicate-probable',
          label: 'Doublon probable',
          description:
            'La ligne ressemble à une autre ligne du fichier ou à un bien existant. Selon votre choix, elle est ignorée ou refusée.'
        },
        {
          value: 'duplicate-ignored',
          label: 'Doublon ignoré',
          description: 'Le choix « Ignorer les doublons » a décoché cette ligne : elle ne sera pas importée.'
        },
        { value: 'unchecked', label: 'Décochée', description: 'Vous avez décoché la ligne.' },
        {
          value: 'over-quota',
          label: 'Hors quota (estimation)',
          description: "La capacité de l'abonnement est atteinte : la ligne ne sera pas envoyée."
        }
      ],
      notes: [
        'Entre « Ligne » et « État », une colonne par champ du document. Une étoile marque un champ obligatoire.',
        'Sous une cellule, « Lu : … » montre comment ImmoTopia a compris la valeur (date, montant…).'
      ]
    },
    faq: [
      {
        q: 'Comment corriger une cellule ?',
        a: 'Tapez directement dans la cellule : la ligne est contrôlée à nouveau aussitôt.'
      },
      {
        q: "Pourquoi une ligne corrigée reste-t-elle affichée avec « N'afficher que les lignes en erreur » ?",
        a: "La ligne en cours de saisie reste visible jusqu'à ce que vous quittiez la cellule."
      },
      {
        q: "L'export contient-il tout ?",
        a: 'Il reprend les lignes du tableau avec leur état, sans les cases à cocher.'
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: "Étape 4 : l'aperçu", helpId: 'patrimoine.importation.apercu' }],
    keywords: ['état des lignes', 'erreur', 'doublon', 'décocher', 'cellules']
  },
  {
    id: 'patrimoine.importation.import',
    kind: 'section',
    title: "Étape 5 : l'import",
    summary: "Les lignes prêtes sont envoyées une à une. Une barre de progression indique où en est l'import.",
    purpose:
      "Chaque ligne est créée par les mêmes fonctions que la saisie à la main : un bien peut donc être refusé pour les mêmes raisons qu'en saisie normale.",
    steps: [
      {
        title: 'Patienter',
        detail: "« Import en cours : X sur Y » s'affiche. Laissez la page ouverte."
      },
      {
        title: 'Arrêter si besoin',
        detail: "« Arrêter l'import » : la ligne en cours se termine, les suivantes ne sont pas traitées."
      }
    ],
    consequences: [
      "Les lignes déjà créées restent créées, même si vous arrêtez l'import.",
      'Les lignes non traitées apparaissent dans le rapport ; elles peuvent être relancées.',
      "Si la limite de requêtes du serveur est atteinte (1 000 requêtes par 15 minutes), l'import s'arrête : attendez quelques minutes puis relancez."
    ],
    faq: [
      {
        q: 'Puis-je quitter la page ?',
        a: "Non, restez dessus : l'envoi se fait depuis votre navigateur."
      },
      {
        q: "J'ai cliqué sur « Arrêter l'import ». Que se passe-t-il ?",
        a: '« Arrêt demandé : la ligne en cours se termine. » Les autres lignes seront marquées non traitées.'
      },
      {
        q: 'Peut-on annuler ce qui a été importé ?',
        a: "Non, il n'y a pas de bouton d'annulation."
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: 'Le rapport', helpId: 'patrimoine.importation.rapport' }],
    keywords: ['import en cours', 'progression', 'arrêter', 'limite de requêtes']
  },
  {
    id: 'patrimoine.importation.rapport',
    kind: 'section',
    title: 'Étape 6 : le rapport',
    summary:
      'Vous voyez le résultat de chaque ligne : importée, ignorée, en erreur, refusée par le serveur, partielle, hors quota ou non traitée.',
    purpose:
      "Le rapport sert à vérifier l'import, à corriger puis relancer ce qui a échoué, et à garder une trace au format CSV.",
    howToRead: {
      statuses: [
        { value: 'importee', label: 'Importée', description: 'La ligne a été créée.' },
        {
          value: 'ignoree',
          label: 'Ignorée',
          description: 'La ligne a été écartée (doublon ignoré ou case décochée).'
        },
        { value: 'en_erreur', label: 'En erreur', description: "La ligne était invalide et n'a pas été envoyée." },
        {
          value: 'refusee_serveur',
          label: 'Refusée par le serveur',
          description: 'Le serveur a refusé la ligne ; le motif est indiqué. Elle peut être relancée.'
        },
        {
          value: 'partielle',
          label: 'Partielle : bien créé, valorisation à ajouter',
          description: "Le bien a été créé mais sa valorisation d'acquisition a été refusée."
        },
        {
          value: 'hors_quota',
          label: 'Hors quota',
          description: "La capacité de l'abonnement n'a pas permis d'envoyer la ligne."
        },
        { value: 'non_traitee', label: 'Non traitée', description: "L'import s'est arrêté avant cette ligne." }
      ],
      notes: ['Les compteurs du tableau « Rapport » portent sur toutes les lignes du fichier.']
    },
    steps: [
      {
        title: 'Lire les compteurs',
        detail: 'Importées, Ignorées, En erreur, Refusées par le serveur, Partielles, Hors quota, Non traitées.'
      },
      {
        title: 'Expliquer les échecs',
        detail: 'Le tableau « Lignes à expliquer » donne le motif de chaque ligne refusée, partielle ou non traitée.'
      },
      {
        title: 'Télécharger',
        detail: "« Télécharger le rapport (CSV) » garde une trace de l'import."
      },
      {
        title: 'Relancer',
        detail:
          '« Relancer les lignes refusées (N) » renvoie les lignes que le serveur a refusées et qui peuvent être relancées.'
      },
      {
        title: 'Continuer',
        detail: "« Revenir à l'aperçu » pour corriger, ou « Importer un autre fichier » pour recommencer."
      }
    ],
    consequences: [
      "Une ligne « Partielle » ne se relance pas : le bien existe déjà. Ajoutez sa valorisation par l'import « Valorisations ».",
      "Si le serveur n'a pas répondu, le motif précise que l'élément a peut-être été créé : vérifiez la liste des biens avant de le recréer.",
      "Si l'import a été arrêté, un avertissement le précise, et les lignes restantes n'ont pas été traitées."
    ],
    faq: [
      {
        q: "Pourquoi « Relancer » n'apparaît-il pas ?",
        a: 'Aucune ligne refusée ne peut être relancée.'
      },
      {
        q: 'Où trouver la référence attribuée à un bien ?',
        a: 'Dans le rapport CSV et dans la colonne de détail ; elle sert à rattacher ensuite des valorisations.'
      },
      {
        q: 'Le rapport est-il conservé ?',
        a: "Pas dans l'application : téléchargez-le avant de quitter la page."
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: 'Tableau des lignes à expliquer', helpId: 'patrimoine.importation.rapport-tableau' }],
    keywords: ['rapport', 'résultat', 'refusées', 'relancer', 'partielle', 'CSV']
  },
  {
    id: 'patrimoine.importation.rapport-tableau',
    kind: 'table',
    title: 'Lignes à expliquer',
    summary:
      'Ce tableau ne liste que les lignes qui demandent une explication : refusées par le serveur, partielles ou non traitées.',
    howToRead: {
      columns: [
        { key: 'numero', label: 'Ligne', description: 'Le numéro de la ligne dans votre fichier.' },
        { key: 'statut', label: 'Statut', description: 'Ce qui est arrivé à la ligne.' },
        {
          key: 'motif',
          label: 'Motif',
          description: "La raison, avec un conseil lorsque la réponse du serveur n'a pas été reçue."
        }
      ],
      statuses: [
        { value: 'refusee_serveur', label: 'Refusée par le serveur', description: 'À corriger puis relancer.' },
        {
          value: 'partielle',
          label: 'Partielle : bien créé, valorisation à ajouter',
          description: "Ne pas relancer : ajouter la valorisation par l'import « Valorisations »."
        },
        { value: 'non_traitee', label: 'Non traitée', description: "L'import s'est arrêté avant cette ligne." }
      ],
      notes: [
        "La recherche porte sur le numéro de ligne, le motif, le détail et les cellules d'origine.",
        "L'export contient toutes les lignes à expliquer qui correspondent à votre recherche."
      ]
    },
    faq: [
      {
        q: "Pourquoi une ligne importée n'est-elle pas ici ?",
        a: 'Seules les lignes à expliquer sont listées ; les lignes réussies sont dans le compteur « Importées ».'
      },
      {
        q: 'Que veut dire « Réponse du serveur non reçue » ?',
        a: 'Le résultat est inconnu : le bien a peut-être été créé. Vérifiez la liste des biens avant de recréer la ligne.'
      },
      {
        q: 'Comment retrouver une ligne ?',
        a: 'Utilisez la recherche, ou filtrez par statut.'
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: 'Étape 6 : le rapport', helpId: 'patrimoine.importation.rapport' }],
    keywords: ['lignes à expliquer', 'motif', 'refusée', 'non traitée']
  }
];

export default entries;
