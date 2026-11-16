import type { HelpEntry } from '../../../types';

/** Zone « actifs » du module « patrimoine » (fr). */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Valeur nette
  {
    id: 'patrimoine.valeur-nette',
    kind: 'page',
    title: 'Valeur nette',
    summary:
      'Cet écran montre ce que vous possédez, ce que vous devez et ce qui vous reste. Il additionne la valeur de vos actifs, retire vos dettes et affiche le résultat.',
    purpose:
      "La valeur nette est la photographie de votre patrimoine à la date du jour : total des actifs moins total des dettes. Chaque actif compte pour sa dernière valeur enregistrée, convertie en FCFA si besoin. L'écran montre aussi la répartition par classe d'actifs, l'évolution sur les 12 derniers mois, vos dettes personnelles et les éléments qui ne sont pas comptés.",
    steps: [
      {
        title: 'Ajouter un actif',
        detail:
          "Cliquez sur « Ajouter un actif ». Une fois créé, l'actif apparaît dans les totaux dès qu'il a une valeur."
      },
      {
        title: 'Lire les trois indicateurs',
        detail: '« Total des actifs », « Total des dettes » et « Valeur nette » (actifs moins dettes).'
      },
      {
        title: "Vérifier ce qui n'est pas compté",
        detail:
          'Si un bandeau jaune apparaît, ouvrez les actifs cités et ajoutez la valeur ou le taux de change qui manque.'
      },
      {
        title: 'Enregistrer vos dettes personnelles',
        detail: 'Dans la carte « Dettes personnelles », cliquez sur « Ajouter une dette ».'
      },
      {
        title: 'Exporter',
        detail: '« Exporter en PDF » ou « Exporter en Excel » produit votre situation patrimoniale.'
      }
    ],
    consequences: [
      "Rien de ce que vous lisez ici ne se modifie directement : pour changer un total, changez la valeur d'un actif ou une dette.",
      'Une dette ajoutée ici réduit immédiatement la valeur nette si son statut est « Actif ».'
    ],
    faq: [
      {
        q: 'Pourquoi ma valeur nette peut-elle être négative ?',
        a: 'Parce que le total des dettes dépasse le total des actifs. Le montant négatif est affiché tel quel, en rouge.'
      },
      {
        q: 'Pourquoi un actif ne figure-t-il pas dans le total ?',
        a: 'Un actif sans valeur, un actif en devise étrangère sans taux de change, un actif cédé ou un actif archivé ne sont pas comptés. Les deux premiers cas sont signalés par le bandeau jaune.'
      },
      {
        q: 'Que signifie « au » sous la valeur nette ?',
        a: "La date à laquelle le calcul est fait, c'est-à-dire aujourd'hui."
      },
      {
        q: "Je ne vois pas l'écran. Pourquoi ?",
        a: "Le patrimoine est une fonction à part. Il faut qu'elle soit incluse dans votre abonnement et que votre compte ait le droit « Voir le patrimoine personnel »."
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Consulter, calculer et exporter demande « Voir le patrimoine personnel ». Ajouter un actif ou une dette demande « Modifier le patrimoine personnel ».'
    },
    related: [
      { label: 'Mes actifs', helpId: 'patrimoine.actifs', to: '/tenant/:tenantId/patrimoine/actifs' },
      { label: 'Projections', helpId: 'patrimoine.projections', to: '/tenant/:tenantId/patrimoine/projections' },
      { label: 'Fiabilité des valeurs', helpId: 'patrimoine.valeur-nette.fiabilite' }
    ],
    keywords: ['patrimoine', 'net worth', 'richesse', 'total', 'actifs', 'dettes', 'situation patrimoniale', 'bilan']
  },
  {
    id: 'patrimoine.valeur-nette.total-actifs',
    kind: 'section',
    title: 'Total des actifs',
    summary:
      'Somme des valeurs actuelles de tous vos actifs comptés, en FCFA. Chaque actif compte pour sa dernière valeur enregistrée à ce jour.',
    howToRead: {
      notes: [
        'Un actif en devise étrangère est converti en FCFA avec le taux de change saisi sur sa fiche.',
        'Ne sont pas comptés : les actifs archivés, les actifs cédés, les actifs sans valeur et les actifs en devise étrangère sans taux de change.'
      ]
    },
    keywords: ['total des actifs', 'ce que je possède', 'patrimoine brut']
  },
  {
    id: 'patrimoine.valeur-nette.total-dettes',
    kind: 'section',
    title: 'Total des dettes',
    summary:
      "Somme du capital restant dû de vos dettes dont le statut est « Actif », qu'elles soient liées à un actif ou personnelles.",
    howToRead: {
      notes: [
        'Les dettes « Clôturé » ou « Défaillant » ne sont pas additionnées.',
        "Une dette liée à un actif qui n'est pas compté reste comptée : la dette existe toujours.",
        "Une dette en devise étrangère sans taux de change n'est pas comptée ; le bandeau jaune le signale."
      ]
    },
    keywords: ['total des dettes', 'emprunts', 'prêts', 'ce que je dois']
  },
  {
    id: 'patrimoine.valeur-nette.resultat',
    kind: 'section',
    title: 'Valeur nette (résultat)',
    summary:
      "C'est le total des actifs moins le total des dettes. Le résultat n'est jamais ramené à zéro : s'il est négatif, il s'affiche en négatif.",
    howToRead: {
      notes: ['La mention « au » donne la date du calcul.']
    },
    keywords: ['valeur nette', 'résultat', 'actifs moins dettes']
  },
  {
    id: 'patrimoine.valeur-nette.fiabilite',
    kind: 'section',
    title: 'Fiabilité des valeurs',
    summary:
      'Chaque valeur enregistrée a un niveau de fiabilité : Élevée, Moyenne ou Faible. Le message « x % de la valeur repose sur des valeurs peu fiables » vous dit quelle part du total des actifs est concernée.',
    purpose:
      "Une valeur saisie à la main sans justificatif n'a pas le même poids qu'une expertise. Ce niveau vous aide à savoir où améliorer votre information.",
    howToRead: {
      statuses: [
        {
          value: 'HIGH',
          label: 'Élevée',
          description: "Valeur issue d'une expertise ou d'un solde saisi, et suffisamment récente."
        },
        {
          value: 'MEDIUM',
          label: 'Moyenne',
          description:
            "Valeur calculée à partir des caractéristiques de l'actif, ou saisie à la main avec une source indiquée."
        },
        {
          value: 'LOW',
          label: 'Faible',
          description:
            'Valeur saisie à la main sans source, très ancienne, ou liée à un statut juridique fragile. Une valeur sans niveau enregistré est lue comme « Faible ».'
        }
      ],
      notes: [
        'Une valeur plus ancienne que le délai propre à sa classe perd un niveau, et deux niveaux si elle a plus du double de ce délai.',
        "Pour un bien immobilier, un statut juridique fragile (lettre d'attribution, attestation villageoise ou coutumière) limite la fiabilité à « Faible ». Un statut non renseigné la limite à « Moyenne ».",
        'Passez la souris sur un niveau de fiabilité pour lire ses raisons.'
      ]
    },
    steps: [
      {
        title: 'Améliorer une valeur',
        detail:
          "Ouvrez l'actif depuis le lien « Voir les actifs », puis ajoutez une valeur avec une source, ou une expertise."
      }
    ],
    faq: [
      {
        q: 'Une fiabilité faible fausse-t-elle mon total ?',
        a: 'Non, la valeur est comptée normalement. La fiabilité indique seulement le degré de confiance à lui accorder.'
      },
      {
        q: 'Que veut dire « Valeur périmée » ?',
        a: "La dernière valeur de l'actif est plus ancienne que le délai prévu pour sa classe. Délais : comptes et mobile money, stocks : 3 mois ; épargne, créances, agriculture : 6 mois ; véhicules, entreprises, autres : 12 mois ; immobilier, biens meubles : 24 mois."
      }
    ],
    related: [{ label: "Valeurs d'un actif", helpId: 'patrimoine.actif.valeurs' }],
    keywords: ['fiabilité', 'confiance', 'valeur périmée', 'valeur ancienne', 'expertise', 'source']
  },
  {
    id: 'patrimoine.valeur-nette.exclusions',
    kind: 'section',
    title: 'Éléments non comptés',
    summary:
      "Ce bandeau jaune apparaît quand un actif ou une dette est laissé de côté parce qu'une information manque. Cliquez sur le nom d'un actif pour le compléter.",
    howToRead: {
      statuses: [
        {
          value: 'NO_VALUATION',
          label: 'Sans valeur',
          description: "L'actif n'a aucune valeur enregistrée : ajoutez-en une dans l'onglet « Valeurs »."
        },
        {
          value: 'MISSING_EXCHANGE_RATE',
          label: 'Taux de change manquant',
          description:
            "L'actif ou la dette est en devise étrangère sans taux de change vers le FCFA : renseignez le taux dans la fiche de l'actif."
        }
      ],
      notes: [
        "Un actif cédé ou archivé n'est pas signalé ici : sa sortie est voulue.",
        'Une dette exclue est indiquée par la mention « Un prêt est exclu du total des dettes ».'
      ]
    },
    keywords: ['exclu', 'non compté', 'sans valeur', 'taux de change', 'anomalie']
  },
  {
    id: 'patrimoine.valeur-nette.exports',
    kind: 'section',
    title: 'Exporter la situation patrimoniale',
    summary:
      'Les boutons « Exporter en PDF » et « Exporter en Excel » téléchargent un document de votre situation patrimoniale à ce jour.',
    purpose:
      "Utile pour un dossier de banque, un notaire ou votre propre suivi. Le fichier reprend les mêmes chiffres que l'écran.",
    steps: [
      { title: 'Choisir le format', detail: 'Cliquez sur « Exporter en PDF » ou « Exporter en Excel ».' },
      { title: 'Patienter', detail: 'Le bouton affiche un chargement, puis le fichier se télécharge.' }
    ],
    consequences: [
      "Le document contient la valeur nette, la répartition par classe, la liste des actifs, la liste des dettes, les actifs non comptés et l'historique.",
      'Au-delà de 500 lignes pour les actifs ou les dettes, le fichier le signale.',
      "Si l'export échoue, un message « Export impossible » (ou celui du serveur) s'affiche. Rien n'est modifié."
    ],
    faq: [
      {
        q: "Les montants de l'export sont-ils en FCFA ?",
        a: "Les totaux sont en FCFA. Pour chaque actif, la valeur dans sa devise d'origine est aussi indiquée."
      }
    ],
    permissions: { note: 'Demande « Voir le patrimoine personnel ».' },
    keywords: ['export', 'pdf', 'excel', 'télécharger', 'situation patrimoniale', 'banque']
  },
  {
    id: 'patrimoine.valeur-nette.repartition',
    kind: 'section',
    title: 'Répartition par classe',
    summary:
      "Une barre et un tableau montrent le poids de chaque classe d'actifs (immobilier, épargne, véhicules…) dans votre total.",
    purpose: 'Elle vous aide à voir si votre patrimoine est concentré sur une seule classe.',
    howToRead: {
      notes: [
        'Chaque couleur de la barre correspond à une classe ; passez la souris dessus pour voir sa part.',
        'Seules les classes qui contiennent des actifs comptés apparaissent, de la plus grande à la plus petite.'
      ]
    },
    related: [{ label: 'Tableau de répartition', helpId: 'patrimoine.valeur-nette.repartition.tableau' }],
    keywords: ['répartition', 'classes', 'barre', 'diversification']
  },
  {
    id: 'patrimoine.valeur-nette.repartition.tableau',
    kind: 'table',
    title: 'Tableau de répartition par classe',
    summary:
      "Une ligne par classe d'actifs qui contient au moins un actif compté, avec le nombre d'actifs, la valeur totale et la part dans le total.",
    howToRead: {
      columns: [
        { key: 'assetClass', label: 'Classe', description: "La classe d'actifs, avec sa couleur dans la barre." },
        { key: 'count', label: 'Actifs', description: "Nombre d'actifs comptés dans cette classe." },
        { key: 'value', label: 'Valeur', description: 'Somme des valeurs actuelles des actifs de la classe, en FCFA.' },
        { key: 'share', label: 'Part', description: 'Valeur de la classe divisée par le total des actifs.' }
      ]
    },
    related: [{ label: 'Répartition par classe', helpId: 'patrimoine.valeur-nette.repartition' }],
    keywords: ['classe', 'part', 'valeur', 'répartition']
  },
  {
    id: 'patrimoine.valeur-nette.evolution',
    kind: 'section',
    title: 'Évolution de la valeur nette',
    summary:
      'La courbe montre, mois par mois sur les 12 derniers mois, la valeur nette, le total des actifs et le total des dettes.',
    howToRead: {
      notes: [
        'Chaque point utilise la dernière valeur connue de chaque actif à cette date.',
        "Les dettes affichées sont celles d'aujourd'hui, à toutes les dates : le passé peut donc sous-estimer la dette de l'époque. Une phrase le rappelle sous la courbe.",
        'Passez la souris sur la courbe pour lire les montants exacts.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi la courbe est-elle plate ?',
        a: "Elle ne bouge que si vous ajoutez des valeurs datées dans l'historique de vos actifs."
      }
    ],
    keywords: ['courbe', 'historique', 'graphique', '12 mois', 'évolution']
  },
  {
    id: 'patrimoine.valeur-nette.dettes',
    kind: 'section',
    title: 'Dettes',
    summary:
      "Cette carte liste vos dettes. Sur l'écran Valeur nette, ce sont vos dettes personnelles ; sur la fiche d'un actif, ce sont les dettes adossées à cet actif.",
    purpose:
      'Une dette réduit votre valeur nette tant que son statut est « Actif ». Tenir cette liste à jour garde la valeur nette juste.',
    steps: [
      {
        title: 'Ajouter une dette',
        detail:
          'Cliquez sur « Ajouter une dette », puis renseignez le prêteur, les montants, le taux, la mensualité, les dates et le statut.'
      },
      { title: 'Modifier', detail: 'Cliquez sur « Modifier » sur la ligne.' },
      {
        title: 'Supprimer',
        detail: 'Cliquez sur « Supprimer » puis confirmez. La dette est effacée.'
      },
      {
        title: 'Retrouver une dette',
        detail: 'Utilisez la recherche (prêteur, statut) et les filtres Statut, Capital restant dû et Date de fin.'
      }
    ],
    consequences: [
      "Ajouter, modifier ou supprimer une dette met à jour la valeur nette, les projections et l'export.",
      "La suppression est définitive. Pour garder la trace d'un prêt remboursé, passez plutôt son statut à « Clôturé ».",
      "Les dettes d'un actif archivé ne peuvent plus être modifiées."
    ],
    faq: [
      {
        q: 'Une dette « Clôturé » compte-t-elle dans le total ?',
        a: 'Non. Seules les dettes « Actif » sont additionnées dans le total des dettes.'
      },
      {
        q: 'Pourquoi le capital restant dû est-il refusé ?',
        a: 'Il ne peut pas dépasser le capital emprunté, et la date de fin ne peut pas précéder la date de début.'
      },
      {
        q: 'Dans quelle devise saisir une dette personnelle ?',
        a: "Une dette personnelle s'exprime en FCFA. Une dette liée à un actif se saisit en FCFA ou dans la devise de l'actif."
      }
    ],
    permissions: {
      note: 'Voir demande « Voir le patrimoine personnel » ; ajouter, modifier et supprimer demandent « Modifier le patrimoine personnel ».'
    },
    related: [
      { label: 'Tableau des dettes', helpId: 'patrimoine.valeur-nette.dettes.tableau' },
      { label: 'Formulaire de dette', helpId: 'patrimoine.valeur-nette.dette-formulaire' }
    ],
    keywords: ['dette', 'prêt', 'emprunt', 'crédit', 'mensualité', 'prêteur', 'banque']
  },
  {
    id: 'patrimoine.valeur-nette.dettes.tableau',
    kind: 'table',
    title: 'Tableau des dettes',
    summary:
      "Chaque ligne est une dette : prêteur, capital restant dû, mensualité, date de fin et statut. Le bouton d'export télécharge la liste.",
    howToRead: {
      columns: [
        { key: 'lender', label: 'Prêteur', description: "La banque, l'institution ou la personne qui a prêté." },
        {
          key: 'remainingCapital',
          label: 'Capital restant dû',
          description: "Ce qu'il reste à rembourser du capital. C'est ce montant qui compte dans le total des dettes."
        },
        { key: 'monthlyPayment', label: 'Mensualité', description: 'Le montant payé chaque mois.' },
        { key: 'endDate', label: 'Fin', description: 'Date prévue de la dernière mensualité.' },
        { key: 'status', label: 'Statut', description: "L'état de la dette (voir les statuts)." },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Modifier » ouvre le formulaire ; « Supprimer » efface la dette après confirmation.'
        }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Dette en cours : comptée dans le total des dettes.' },
        { value: 'CLOSED', label: 'Clôturé', description: 'Dette soldée : non comptée.' },
        {
          value: 'DEFAULTED',
          label: 'Défaillant',
          description: 'Dette en impayé : non comptée dans le total des dettes.'
        }
      ]
    },
    consequences: [
      'Changer un filtre ou une recherche ne modifie aucune dette : cela change seulement la liste affichée.'
    ],
    related: [{ label: 'Dettes', helpId: 'patrimoine.valeur-nette.dettes' }],
    keywords: ['dettes', 'capital restant dû', 'mensualité', 'statut', 'export']
  },
  {
    id: 'patrimoine.valeur-nette.dette-formulaire',
    kind: 'section',
    title: 'Ajouter ou modifier une dette',
    summary:
      'Ce formulaire enregistre un prêt : prêteur, capital emprunté, capital restant dû, taux, mensualité, devise, dates et statut.',
    steps: [
      { title: 'Prêteur', detail: 'Obligatoire.' },
      {
        title: 'Montants',
        detail:
          "Capital emprunté, capital restant dû, taux d'intérêt en pourcentage et mensualité : tous obligatoires. Le restant dû ne dépasse pas le capital emprunté."
      },
      { title: 'Devise', detail: 'FCFA (XOF), euro ou dollar. Les dettes personnelles se saisissent en FCFA.' },
      {
        title: 'Dates',
        detail: 'Date de début et date de fin, la fin ne précédant pas le début.'
      },
      { title: 'Statut', detail: '« Actif » par défaut ; choisissez « Clôturé » ou « Défaillant » si besoin.' },
      { title: 'Enregistrer', detail: 'Cliquez sur « Ajouter » (ou « Enregistrer » en modification).' }
    ],
    consequences: [
      "La valeur nette est recalculée dès l'enregistrement.",
      'Les projections utilisent le taux, la mensualité et la date de fin pour faire baisser la dette année après année.'
    ],
    related: [{ label: 'Dettes', helpId: 'patrimoine.valeur-nette.dettes' }],
    keywords: ['formulaire', 'dette', 'prêt', 'taux', 'mensualité']
  },

  // ---------------------------------------------------------------- Mes actifs
  {
    id: 'patrimoine.actifs',
    kind: 'page',
    title: 'Mes actifs',
    summary:
      'Cette liste regroupe tout ce qui compose votre patrimoine : immobilier, entreprises, stocks, véhicules, comptes, épargne, créances, agriculture, biens meubles et autres.',
    purpose:
      'Un actif est un élément que vous possédez et qui a une valeur. Chaque actif a une classe, une devise et un historique de valeurs. Ouvrez-en un pour suivre ses valeurs, ses dettes, ses détenteurs et ses informations.',
    steps: [
      {
        title: 'Ajouter un actif',
        detail:
          'Cliquez sur « Ajouter un actif », choisissez la classe, donnez un nom et, si possible, une première valeur.'
      },
      {
        title: 'Rechercher et filtrer',
        detail:
          'Tapez un nom, un bien lié, une référence ou une note. Filtrez par Classe, Statut, Valeur courante ou « Valeur à actualiser ».'
      },
      { title: 'Ouvrir un actif', detail: 'Cliquez sur son nom, ou double-cliquez sur la ligne.' },
      { title: 'Exporter', detail: "Le bouton d'export télécharge tous les actifs qui correspondent à vos filtres." }
    ],
    consequences: [
      'À la création, vous arrivez directement sur la fiche du nouvel actif.',
      "Un actif sans valeur n'est pas compté dans la valeur nette tant que vous n'ajoutez pas de valeur.",
      "Un espace gratuit est limité en nombre d'actifs : au-delà, l'ajout est refusé et un lien vous propose de passer au palier payant. Vos saisies sont conservées.",
      'Une agence ne peut pas avoir plus de 500 actifs non archivés : archivez-en pour en ajouter.'
    ],
    faq: [
      {
        q: 'Où est passé un actif archivé ?',
        a: 'La liste ne montre pas les actifs archivés, sauf si vous choisissez le statut « Archivé » dans les filtres.'
      },
      {
        q: 'Pourquoi un bien immobilier demande-t-il un bien existant ?',
        a: "Un actif immobilier se rattache à un bien déjà créé dans le module Biens. Aucun bien n'est créé ici, et un bien ne peut être rattaché qu'à un seul actif."
      },
      {
        q: 'Que veut dire « Valeur à actualiser » ?',
        a: "La dernière valeur de l'actif est plus ancienne que le délai prévu pour sa classe. Il est temps d'en saisir une nouvelle."
      },
      {
        q: 'Je ne vois pas le bouton « Ajouter un actif ».',
        a: 'Il faut le droit « Modifier le patrimoine personnel ». Demandez-le à la personne qui gère votre espace.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Consulter demande « Voir le patrimoine personnel » ; ajouter un actif demande « Modifier le patrimoine personnel ».'
    },
    related: [
      { label: 'Tableau des actifs', helpId: 'patrimoine.actifs.tableau' },
      { label: "Formulaire d'un actif", helpId: 'patrimoine.actifs.formulaire' },
      { label: 'Valeur nette', helpId: 'patrimoine.valeur-nette', to: '/tenant/:tenantId/patrimoine/valeur-nette' }
    ],
    keywords: ['actif', 'actifs', 'patrimoine', 'bien', 'immobilier', 'épargne', 'véhicule', 'ajouter un actif'],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'actifs-ajouter',
          title: 'Ajouter un actif',
          description:
            "Ce bouton ouvre le formulaire de création. Vous y choisissez la classe de l'actif, son nom et, si possible, sa première valeur."
        },
        {
          target: 'actifs-tableau',
          title: 'La liste de vos actifs',
          description:
            'Recherchez, filtrez, puis cliquez sur un nom pour ouvrir la fiche. Le badge à côté de la valeur indique sa fiabilité.'
        }
      ]
    }
  },
  {
    id: 'patrimoine.actifs.tableau',
    kind: 'table',
    title: 'Tableau des actifs',
    summary:
      'Chaque ligne est un actif, avec sa classe, son statut, sa valeur courante et sa fiabilité, la date de cette valeur et la dette qui lui est liée.',
    howToRead: {
      columns: [
        { key: 'name', label: 'Nom', description: "Le nom de l'actif ; cliquez dessus pour ouvrir sa fiche." },
        { key: 'assetClass', label: 'Classe', description: "La classe d'actifs (Immobilier, Épargne et placements…)." },
        { key: 'status', label: 'Statut', description: "L'état de l'actif (voir les statuts)." },
        {
          key: 'currentValue',
          label: 'Valeur courante',
          description:
            'La dernière valeur enregistrée, avec son niveau de fiabilité. « Valeur périmée » signale une valeur trop ancienne pour la classe ; « Sans valeur » signale un actif jamais valorisé.'
        },
        { key: 'valuatedAt', label: 'Date de valorisation', description: 'La date de cette dernière valeur.' },
        {
          key: 'outstandingDebtXof',
          label: 'Dette restante',
          description: "Le capital restant dû des dettes liées à l'actif, en FCFA. Un tiret (—) veut dire aucune dette."
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: "Actif détenu et compté dans la valeur nette (s'il a une valeur)."
        },
        {
          value: 'DISPOSED',
          label: 'Cédé',
          description: 'Actif vendu ou transmis : il sort de la valeur nette à sa date de cession.'
        },
        {
          value: 'ARCHIVED',
          label: 'Archivé',
          description: "Actif rangé : il n'est plus compté et ne peut plus être modifié."
        }
      ],
      notes: [
        'Les filtres sont : Classe, Statut, Valeur courante (en FCFA) et « Valeur à actualiser ». La recherche porte sur le nom, le bien lié, la référence et les notes.',
        "Les actifs archivés n'apparaissent que si vous filtrez sur le statut « Archivé ».",
        "L'export contient tous les actifs correspondant à vos filtres, pas seulement la page affichée."
      ]
    },
    faq: [
      {
        q: 'Pourquoi une valeur est-elle marquée « Valeur périmée » ?',
        a: 'Sa date dépasse le délai prévu pour la classe (3 mois pour un compte, 24 mois pour un bien immobilier, par exemple). Ajoutez une valeur récente.'
      }
    ],
    related: [
      { label: 'Mes actifs', helpId: 'patrimoine.actifs' },
      { label: 'Fiabilité des valeurs', helpId: 'patrimoine.valeur-nette.fiabilite' }
    ],
    keywords: ['colonnes', 'statut', 'valeur courante', 'périmée', 'dette restante', 'export', 'filtre']
  },
  {
    id: 'patrimoine.actifs.formulaire',
    kind: 'section',
    title: 'Ajouter ou modifier un actif',
    summary:
      "Ce tiroir enregistre un actif de n'importe quelle classe. Les champs propres à la classe choisie s'affichent sous le nom.",
    steps: [
      { title: 'Classe', detail: "Choisissez la classe. Elle n'est plus modifiable après la création." },
      {
        title: 'Bien immobilier',
        detail:
          "Pour un actif immobilier, choisissez un bien existant (un bien déjà rattaché à un actif n'est pas proposé)."
      },
      { title: 'Nom', detail: 'Obligatoire.' },
      {
        title: 'Champs de la classe',
        detail: 'Remplissez ceux qui concernent votre actif ; les champs marqués sont obligatoires.'
      },
      {
        title: 'Devise',
        detail: 'FCFA (XOF), euro ou dollar. Hors FCFA, le taux de change vers le FCFA est obligatoire.'
      },
      { title: 'Acquisition et notes', detail: "Coût et date d'acquisition, et notes libres, sont facultatifs." },
      {
        title: 'Première valorisation',
        detail: "Valeur estimée, date, méthode et source. Facultative : sans montant, aucune valeur n'est créée."
      },
      { title: 'Enregistrer', detail: "« Créer l'actif », ou « Enregistrer » en modification." }
    ],
    consequences: [
      "À la création, vous êtes envoyé sur la fiche de l'actif.",
      "En modification, la classe et le bien lié ne changent pas, et la première valorisation n'est pas proposée (utilisez l'onglet « Valeurs »).",
      'La devise ne peut plus changer une fois des valeurs ou des dettes saisies dans une autre devise.',
      'Un actif archivé ne peut plus être modifié.'
    ],
    faq: [
      {
        q: "Pourquoi demander seulement les 4 derniers chiffres d'un compte ?",
        a: 'Pour votre sécurité : saisissez exactement 4 chiffres, jamais le numéro complet.'
      },
      {
        q: 'Une expertise sans source est refusée, pourquoi ?',
        a: "Une expertise doit nommer l'expert ou le document. Sans cette source, la valeur n'est pas enregistrée."
      }
    ],
    related: [
      { label: "Classes d'actifs et champs propres", helpId: 'patrimoine.actifs.classes' },
      { label: 'Première valorisation', helpId: 'patrimoine.actifs.valorisation-initiale' }
    ],
    keywords: ['formulaire', 'créer un actif', 'modifier un actif', 'devise', 'taux de change'],
    tour: {
      steps: [
        {
          target: 'actifs-form-classe',
          title: 'Choisir la classe',
          description:
            'La classe (immobilier, véhicule, épargne…) détermine les champs qui suivent. Elle ne peut plus changer après la création.'
        },
        {
          target: 'actifs-form-nom',
          title: 'Donner un nom',
          description: 'Un nom que vous reconnaîtrez dans les listes, par exemple « Terrain de Bingerville ».'
        },
        {
          target: 'actifs-form-valorisation',
          title: 'Saisir une première valeur',
          description:
            "Facultative, mais sans valeur l'actif n'est pas compté dans votre valeur nette. Une expertise demande une source."
        },
        {
          target: 'actifs-form-creer',
          title: "Créer l'actif",
          description: "Vous arrivez ensuite sur la fiche de l'actif, où vous pouvez compléter ses valeurs."
        }
      ]
    }
  },
  {
    id: 'patrimoine.actifs.classes',
    kind: 'section',
    title: "Classes d'actifs",
    summary:
      "La classe range l'actif et décide des champs à remplir et de la façon dont on peut calculer sa valeur. Il y en a dix.",
    howToRead: {
      notes: [
        "Immobilier : un bien existant, et un statut juridique (titre foncier, arrêté de concession définitive, certificat de propriété, lettre d'attribution, attestation villageoise ou coutumière…).",
        "Entreprises et parts de sociétés : raison sociale, forme juridique, pays, pourcentage détenu, et facultativement valeur de l'entreprise ou résultat net et multiple.",
        'Stocks et marchandises : désignation, quantité, unité, coût unitaire, décote.',
        "Véhicules et équipements : type, marque, année, durée d'utilité, valeur résiduelle et méthode d'amortissement (linéaire ou dégressif).",
        'Comptes et mobile money : établissement, type de compte (bancaire, mobile money, espèces) et 4 derniers chiffres.',
        'Épargne et placements : type (placement, tontine, assurance-vie…), organisme, taux attendu, capital.',
        'Créances : débiteur, capital, recouvrabilité, échéance, taux.',
        'Agriculture et élevage : plantation, cheptel ou récolte, culture, surface, effectif, valeur unitaire.',
        'Biens meubles de valeur : désignation et catégorie. Autre : un libellé.'
      ]
    },
    faq: [
      {
        q: 'Quelle classe choisir si rien ne convient ?',
        a: 'Choisissez « Autre » et donnez un libellé. Vous saisirez les valeurs à la main.'
      },
      {
        q: 'Peut-on changer la classe plus tard ?',
        a: 'Non, elle est figée après la création. Créez un nouvel actif dans la bonne classe si besoin.'
      }
    ],
    related: [{ label: 'Calcul de valeur par classe', helpId: 'patrimoine.actif.calcul' }],
    keywords: [
      'classe',
      "types d'actifs",
      'immobilier',
      'entreprise',
      'stock',
      'véhicule',
      'épargne',
      'créance',
      'agriculture',
      'meuble'
    ]
  },
  {
    id: 'patrimoine.actifs.valorisation-initiale',
    kind: 'section',
    title: 'Première valorisation',
    summary:
      "À la création d'un actif, vous pouvez saisir en même temps sa première valeur : montant, date, méthode et source.",
    howToRead: {
      notes: [
        'Méthodes proposées : Manuelle, Estimation de marché, Expertise.',
        'La date de la valeur est celle du jour par défaut.',
        'La source (expert, document, site…) est obligatoire pour une expertise.'
      ]
    },
    consequences: [
      "Sans montant, aucune valeur n'est enregistrée : l'actif est créé « Sans valeur » et n'est pas compté dans la valeur nette.",
      'Le niveau de fiabilité de la valeur dépend de la méthode, de la source et de son ancienneté.'
    ],
    related: [{ label: 'Fiabilité des valeurs', helpId: 'patrimoine.valeur-nette.fiabilite' }],
    keywords: ['valeur initiale', 'première valeur', 'estimation', 'expertise', 'source']
  },

  // ---------------------------------------------------------------- Fiche d'un actif
  {
    id: 'patrimoine.actif',
    kind: 'page',
    title: "Fiche d'un actif",
    summary:
      "La fiche d'un actif rassemble sa valeur courante, l'historique de ses valeurs, ses dettes, ses détenteurs et ses informations.",
    purpose:
      "C'est ici que vous tenez un actif à jour : ajouter une nouvelle valeur, déclarer un prêt, indiquer qui le détient, le modifier, le céder ou l'archiver.",
    steps: [
      {
        title: 'Lire la valeur courante',
        detail:
          'Elle apparaît en haut, avec sa date, son niveau de fiabilité et la mention « Valeur périmée » si elle est ancienne.'
      },
      {
        title: "Changer d'onglet",
        detail: '« Valeurs », « Dettes », « Détenteurs » (sauf pour un bien immobilier) et « Informations ».'
      },
      {
        title: 'Ajouter une valeur',
        detail:
          'Onglet « Valeurs », bouton « Ajouter une valeur », ou « Calculer une valeur » pour obtenir une proposition.'
      },
      {
        title: 'Modifier ou clore',
        detail: 'Onglet « Informations » : « Modifier », « Marquer comme cédé » ou « Archiver ».'
      }
    ],
    consequences: [
      "Chaque nouvelle valeur ou dette met à jour la valeur nette, l'historique et les projections.",
      'Un actif archivé est figé : plus de valeur, de dette ni de modification possible.'
    ],
    faq: [
      {
        q: "Où sont les dépenses et les documents d'un bien immobilier ?",
        a: "Sur la fiche du bien, via le lien « Ouvrir la fiche du bien ». La fiche d'actif ne gère que sa valeur, ses dettes et ses informations."
      },
      {
        q: 'Que dit le message sur le statut juridique ?',
        a: "Pour un bien immobilier, un statut juridique non renseigné ou fragile limite la fiabilité de la valeur. Le bouton « Modifier l'actif » permet de le renseigner."
      },
      {
        q: "Pourquoi l'onglet « Détenteurs » manque-t-il ?",
        a: "Pour un bien immobilier, les parts se gèrent depuis les entités détentrices, pas depuis la fiche d'actif."
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: "Consulter demande « Voir le patrimoine personnel » ; ajouter ou modifier une valeur, une dette, un détenteur ou l'actif demande « Modifier le patrimoine personnel »."
    },
    related: [
      { label: 'Mes actifs', helpId: 'patrimoine.actifs', to: '/tenant/:tenantId/patrimoine/actifs' },
      { label: 'Fiabilité des valeurs', helpId: 'patrimoine.valeur-nette.fiabilite' }
    ],
    keywords: ['fiche', 'actif', 'valeur courante', 'valorisation', 'détenteur', 'céder', 'archiver']
  },
  {
    id: 'patrimoine.actif.valeur-courante',
    kind: 'section',
    title: 'Valeur courante',
    summary:
      "La valeur courante est la dernière valeur enregistrée de l'actif, avec sa date. C'est elle qui entre dans la valeur nette.",
    howToRead: {
      notes: [
        'Le badge « Élevée », « Moyenne » ou « Faible » donne la fiabilité ; passez la souris dessus pour lire ses raisons.',
        '« Valeur périmée » apparaît quand la dernière valeur est plus ancienne que le délai de la classe, pour un actif au statut « Actif ».',
        "« Sans valeur » veut dire qu'aucune valeur n'est enregistrée : l'actif n'est pas compté."
      ]
    },
    related: [{ label: 'Fiabilité des valeurs', helpId: 'patrimoine.valeur-nette.fiabilite' }],
    keywords: ['valeur courante', 'dernière valeur', 'périmée', 'fiabilité']
  },
  {
    id: 'patrimoine.actif.valeurs',
    kind: 'section',
    title: 'Historique des valeurs',
    summary:
      "L'onglet « Valeurs » garde chaque valeur datée de l'actif. La plus récente (à la date du jour) devient la valeur courante.",
    purpose:
      "Ajoutez une valeur à chaque fois que vous réévaluez l'actif. L'historique alimente la courbe de la valeur nette et la fiabilité.",
    steps: [
      { title: 'Ajouter une valeur', detail: '« Ajouter une valeur » ouvre le formulaire.' },
      {
        title: 'Calculer',
        detail:
          "« Calculer une valeur » propose un montant pour certaines classes ; rien n'est enregistré sans votre accord."
      },
      {
        title: 'Modifier ou supprimer',
        detail: 'Liens « Modifier » et « Supprimer » (avec confirmation) sur la ligne.'
      },
      {
        title: 'Rechercher',
        detail: 'Cherchez dans les notes, la source ou la méthode ; filtrez par méthode, date ou fiabilité.'
      }
    ],
    consequences: [
      'Ajouter, modifier ou supprimer une valeur met à jour la valeur nette et les listes.',
      'Supprimer une valeur est définitif.',
      "Un actif archivé n'accepte plus de modification. Un actif ne peut pas avoir plus de 1 000 valeurs."
    ],
    faq: [
      {
        q: 'Une valeur plus récente écrase-t-elle les anciennes ?',
        a: "Non, les anciennes restent dans l'historique. Seule la plus récente sert de valeur courante."
      },
      {
        q: "Pourquoi ma valeur affiche-t-elle « Manuelle » alors que j'ai calculé ?",
        a: 'Si le montant enregistré ne correspond pas au calcul, la valeur est enregistrée comme saisie manuelle.'
      }
    ],
    related: [
      { label: 'Tableau des valeurs', helpId: 'patrimoine.actif.valeurs.tableau' },
      { label: 'Calculer une valeur', helpId: 'patrimoine.actif.calcul' }
    ],
    keywords: ['valeurs', 'historique', 'valorisation', 'réévaluer', 'courbe']
  },
  {
    id: 'patrimoine.actif.valeurs.tableau',
    kind: 'table',
    title: 'Tableau des valeurs',
    summary:
      "Chaque ligne est une valeur datée : date, montant, méthode, fiabilité et source. Une courbe apparaît au-dessus dès qu'il y a au moins deux valeurs.",
    howToRead: {
      columns: [
        { key: 'valuatedAt', label: 'Date', description: 'La date à laquelle la valeur est établie.' },
        { key: 'estimatedValue', label: 'Valeur', description: 'Le montant, dans sa devise.' },
        {
          key: 'method',
          label: 'Méthode',
          description:
            'Comment la valeur a été obtenue : saisie, estimation de marché, expertise ou un calcul de la classe.'
        },
        {
          key: 'reliability',
          label: 'Fiabilité',
          description: 'Élevée, Moyenne ou Faible ; passez la souris pour lire les raisons.'
        },
        {
          key: 'source',
          label: 'Source',
          description: "L'expert, le document ou la référence. Un tiret (—) veut dire aucune source."
        },
        { key: 'actions', label: 'Actions', description: '« Modifier » ou « Supprimer » une valeur.' }
      ],
      notes: [
        "Méthodes possibles : Manuelle, Estimation de marché, Expertise, Amortissement linéaire ou dégressif, Quote-part de l'entreprise, Quantité × coût unitaire, Solde, Épargne capitalisée, Créance décotée, Quantité × valeur unitaire.",
        'Les lignes sont triées de la plus récente à la plus ancienne.'
      ]
    },
    related: [{ label: 'Historique des valeurs', helpId: 'patrimoine.actif.valeurs' }],
    keywords: ['colonnes', 'méthode', 'source', 'fiabilité', 'export']
  },
  {
    id: 'patrimoine.actif.calcul',
    kind: 'section',
    title: 'Calculer une valeur',
    summary:
      "Le bouton « Calculer une valeur » propose un montant à partir des informations de l'actif. Il ne l'enregistre jamais tout seul.",
    howToRead: {
      notes: [
        "Véhicules et équipements : coût d'acquisition réduit chaque année (amortissement linéaire sur la durée d'utilité, ou dégressif), sans passer sous la valeur résiduelle.",
        "Entreprises : pourcentage détenu × valeur de l'entreprise, ou × résultat net × multiple.",
        'Stocks : quantité × coût unitaire, diminué de la décote.',
        "Épargne et placements : capital augmenté au taux attendu, année après année, depuis la dernière valeur ou la date d'acquisition.",
        'Créances : capital × pourcentage de recouvrabilité.',
        'Agriculture : surface × valeur unitaire pour une plantation, effectif × valeur unitaire pour un cheptel ou une récolte.',
        'Comptes : le solde se saisit directement. Immobilier, biens meubles, autre : saisie manuelle ou expertise.'
      ]
    },
    steps: [
      { title: 'Calculer', detail: 'Cliquez sur « Calculer une valeur ».' },
      { title: 'Relire', detail: "Le montant s'affiche avec la méthode et les hypothèses utilisées." },
      {
        title: 'Décider',
        detail:
          "« Enregistrer cette valeur » (avec confirmation) ou « Modifier » pour ajuster le montant avant d'enregistrer."
      }
    ],
    consequences: [
      "Rien n'est écrit tant que vous ne confirmez pas.",
      'La valeur enregistrée est datée du jour du calcul.',
      "S'il manque des informations, la liste de ce qui manque s'affiche, avec un lien « Compléter les informations de l'actif »."
    ],
    faq: [
      {
        q: 'Pourquoi le calcul est-il refusé ?',
        a: "Des informations manquent, le résultat est nul ou hors limites, ou la date d'acquisition est dans le futur. Le message précise la cause."
      }
    ],
    related: [{ label: "Classes d'actifs", helpId: 'patrimoine.actifs.classes' }],
    keywords: ['calcul', 'suggestion', 'amortissement', 'capitalisation', 'estimation automatique']
  },
  {
    id: 'patrimoine.actif.valeur-formulaire',
    kind: 'section',
    title: 'Ajouter ou modifier une valeur',
    summary:
      "Ce formulaire enregistre une valeur datée pour l'actif : date, montant, devise, méthode, source et notes.",
    steps: [
      { title: 'Date', detail: "La date à laquelle la valeur est établie (aujourd'hui par défaut)." },
      { title: 'Valeur estimée', detail: 'Un montant supérieur à 0.' },
      { title: 'Devise', detail: "FCFA ou la devise de l'actif." },
      { title: 'Méthode', detail: 'Choisissez la façon dont la valeur a été obtenue.' },
      { title: 'Source', detail: "Obligatoire pour une expertise : indiquez l'expert ou le document." },
      { title: 'Enregistrer', detail: 'Cliquez sur « Ajouter » ou « Enregistrer ».' }
    ],
    consequences: [
      'Si vous choisissez une méthode de calcul mais que le montant ne correspond pas, la valeur est enregistrée comme « Manuelle ».',
      "La fiabilité est calculée à l'enregistrement ; vous ne la saisissez pas."
    ],
    related: [{ label: 'Historique des valeurs', helpId: 'patrimoine.actif.valeurs' }],
    keywords: ['formulaire', 'valeur', 'expertise', 'source', 'méthode']
  },
  {
    id: 'patrimoine.actif.detenteurs',
    kind: 'section',
    title: 'Détenteurs',
    summary:
      "L'onglet « Détenteurs » indique quelles entités possèdent l'actif et pour quelle part. Il n'existe que pour les actifs non immobiliers.",
    purpose:
      'Utile quand un actif appartient à une société, à une famille ou à plusieurs entités. Les entités se créent dans le menu des entités détentrices.',
    steps: [
      {
        title: 'Ajouter un détenteur',
        detail:
          "« Ajouter un détenteur » : choisissez l'entité, sa part en pourcentage et, si besoin, la date depuis laquelle elle détient l'actif."
      },
      { title: 'Corriger une part', detail: "« Modifier » sur la ligne (l'entité ne change pas)." },
      { title: 'Retirer', detail: '« Retirer » puis confirmez.' }
    ],
    consequences: [
      "Une part doit être supérieure à 0 et au plus égale à 100 %. L'enregistrement est refusé si le total des parts dépasse 100 %.",
      "« Retirer » enlève la part de l'entité sur cet actif ; l'entité elle-même n'est pas supprimée."
    ],
    faq: [
      {
        q: 'Le total des parts doit-il faire 100 % ?',
        a: "Il ne peut pas dépasser 100 %. S'il est inférieur, le reste n'est simplement pas attribué."
      }
    ],
    related: [{ label: 'Tableau des détenteurs', helpId: 'patrimoine.actif.detenteurs.tableau' }],
    keywords: ['détenteur', 'propriétaire', 'part', 'quote-part', 'entité', 'indivision']
  },
  {
    id: 'patrimoine.actif.detenteurs.tableau',
    kind: 'table',
    title: 'Tableau des détenteurs',
    summary: "Chaque ligne est une entité qui détient une part de l'actif.",
    howToRead: {
      columns: [
        { key: 'entityName', label: 'Entité', description: "Le nom de l'entité détentrice." },
        { key: 'sharePercent', label: 'Part', description: "Sa part de l'actif, en pourcentage." },
        {
          key: 'effectiveFrom',
          label: 'Depuis',
          description: 'La date depuis laquelle elle détient cette part. Un tiret (—) veut dire non renseignée.'
        },
        { key: 'actions', label: 'Actions', description: '« Modifier » ou « Retirer » la part.' }
      ],
      notes: ["Un bandeau d'alerte apparaît si les parts déclarées dépassent 100 %."]
    },
    related: [{ label: 'Détenteurs', helpId: 'patrimoine.actif.detenteurs' }],
    keywords: ['entité', 'part', 'depuis']
  },
  {
    id: 'patrimoine.actif.informations',
    kind: 'section',
    title: "Informations de l'actif",
    summary:
      "L'onglet « Informations » résume l'actif : classe, statut, devise, acquisition, champs propres à la classe et notes. Il permet aussi de le modifier, de le céder ou de l'archiver.",
    steps: [
      { title: 'Modifier', detail: '« Modifier » ouvre le formulaire. La classe et le bien lié ne changent pas.' },
      {
        title: 'Marquer comme cédé',
        detail: 'Indiquez la date de cession puis « Confirmer ».'
      },
      { title: 'Archiver', detail: '« Archiver », puis confirmez.' }
    ],
    consequences: [
      "« Marquer comme cédé » : l'actif sort de la valeur nette à la date de cession, son historique est conservé. Seul un actif « Actif » peut être cédé.",
      "« Archiver » : l'actif n'est plus compté, n'apparaît plus dans la liste par défaut et ne peut plus être modifié. Aucune action de l'écran ne permet de le rétablir.",
      "Ces boutons n'apparaissent que pour un actif au statut « Actif »."
    ],
    faq: [
      {
        q: 'Quelle différence entre céder et archiver ?',
        a: "Céder indique que vous ne possédez plus l'actif (avec une date). Archiver range simplement l'actif."
      }
    ],
    permissions: { note: 'Demande « Modifier le patrimoine personnel ».' },
    related: [{ label: "Formulaire d'un actif", helpId: 'patrimoine.actifs.formulaire' }],
    keywords: ['informations', 'céder', 'vendre', 'archiver', 'modifier un actif', 'cession']
  }
];

export default entries;
