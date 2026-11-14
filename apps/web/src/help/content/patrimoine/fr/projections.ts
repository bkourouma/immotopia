import type { HelpEntry } from '../../../types';

/** Zone « projections » du module « patrimoine » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.projections',
    kind: 'page',
    title: 'Projections',
    summary:
      'Cet écran estime votre valeur nette année après année, selon des hypothèses que vous pouvez modifier. Rien de ce qui est calculé ici ne change vos données réelles.',
    purpose:
      "Partez de vos actifs et dettes d'aujourd'hui, choisissez un horizon (de 1 à 30 ans) et un scénario, puis voyez la courbe. Vous pouvez ensuite simuler une vente, un achat, un emprunt, un remboursement anticipé ou une épargne mensuelle, et enregistrer vos réglages sous un nom.",
    steps: [
      {
        title: 'Régler la projection',
        detail:
          "Choisissez l'horizon, le scénario de base (Prudent, Central ou Optimiste) et, si vous voulez, « Comparer les trois scénarios »."
      },
      {
        title: 'Lire les résultats',
        detail: 'La courbe, puis le « Tableau annuel » donnent la valeur nette année par année.'
      },
      {
        title: 'Ajuster les hypothèses',
        detail:
          "Dans la carte « Hypothèses », modifiez les taux de croissance et l'inflation, puis « Appliquer les hypothèses »."
      },
      {
        title: 'Simuler une opération',
        detail: 'Dans « Simuler », ajoutez une ou plusieurs opérations puis « Lancer la simulation ».'
      },
      {
        title: 'Garder vos réglages',
        detail: 'Dans « Scénarios enregistrés », donnez un nom et cliquez sur « Enregistrer ce scénario ».'
      }
    ],
    consequences: [
      "Ce sont des hypothèses indicatives, pas une prévision. Un bandeau le rappelle en haut de l'écran.",
      'Vos revenus ne sont pas pris en compte : les mensualités de vos dettes sont supposées payées par vos revenus, donc la valeur nette augmente du capital remboursé.',
      'Seuls les actifs au statut « Actif » qui ont une valeur et les dettes au statut « Actif » entrent dans le calcul. Un actif sans valeur est signalé et laissé de côté.',
      'Les simulations ne modifient ni vos actifs, ni vos dettes. Seuls les scénarios que vous enregistrez sont conservés.'
    ],
    faq: [
      {
        q: "Que veut dire « Aujourd'hui » et « Année 3 » ?",
        a: "« Aujourd'hui » est la situation actuelle. « Année 3 » est la situation à la fin de la troisième année."
      },
      {
        q: "Pourquoi aucune projection ne s'affiche ?",
        a: 'Il faut au moins un actif avec une valeur. Le lien « Mes actifs » vous y conduit.'
      },
      {
        q: 'Pourquoi mon horizon est-il refusé ?',
        a: "L'horizon doit être un nombre entier de 1 à 30. Tant qu'il est invalide, aucun calcul n'est lancé."
      },
      {
        q: 'Mes réglages sont-ils sauvegardés automatiquement ?',
        a: 'Non. Pour les retrouver, enregistrez-les dans « Scénarios enregistrés ».'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Calculer et ouvrir un scénario demande « Voir le patrimoine personnel » ; enregistrer, renommer, mettre à jour ou supprimer un scénario demande « Modifier le patrimoine personnel ».'
    },
    related: [
      { label: 'Réglages de la projection', helpId: 'patrimoine.projections.reglages' },
      { label: 'Hypothèses', helpId: 'patrimoine.projections.hypotheses' },
      { label: 'Simuler', helpId: 'patrimoine.projections.simulation' },
      { label: 'Mes actifs', to: '/tenant/:tenantId/patrimoine/actifs' }
    ],
    keywords: ['projection', 'simulation', 'avenir', 'horizon', 'scénario', 'prévision', 'valeur nette future']
  },
  {
    id: 'patrimoine.projections.reglages',
    kind: 'section',
    title: 'Réglages de la projection',
    summary:
      "Trois réglages pilotent le calcul : l'horizon en années, le scénario de base et l'option de comparaison des trois scénarios.",
    howToRead: {
      notes: [
        'Horizon : un entier de 1 à 30 ans (10 par défaut).',
        'Scénario de base : Prudent, Central (par défaut) ou Optimiste. Chacun fixe des taux de croissance par classe et une inflation différents, visibles dans « Hypothèses ».',
        "« Comparer les trois scénarios » trace les trois courbes ensemble ; vos hypothèses personnalisées s'appliquent alors aux trois.",
        'Changer le scénario de base efface vos hypothèses personnalisées.'
      ]
    },
    consequences: ["Chaque changement relance le calcul. Pour l'horizon, le calcul attend la fin de votre saisie."],
    faq: [
      {
        q: 'Quel scénario choisir ?',
        a: "Prudent suppose des croissances faibles et une inflation plus forte, Optimiste l'inverse. Central est intermédiaire. Aucun n'est une prévision."
      }
    ],
    keywords: ['horizon', 'scénario de base', 'prudent', 'central', 'optimiste', 'comparer']
  },
  {
    id: 'patrimoine.projections.avertissements',
    kind: 'section',
    title: 'À savoir sur ces résultats',
    summary:
      "Ce bandeau jaune liste les points qui limitent la fiabilité du calcul : valeurs peu fiables, actif sans valeur, dette mal dimensionnée, trésorerie négative, opération qui ne s'applique plus.",
    howToRead: {
      notes: [
        "« x % de la valeur de départ repose sur des valeurs peu fiables » : part du total des actifs d'aujourd'hui qui repose sur des valeurs de fiabilité faible.",
        "« Un actif n'a pas de valeur » : il n'est pas compté dans la projection.",
        "« La mensualité d'une dette ne couvre pas ses intérêts » : son capital ne diminue pas, et les intérêts non payés ne sont pas comptés.",
        '« Une dette est arrivée à échéance avec un solde restant dû » : ce solde est conservé tel quel, sans intérêt.',
        "« La trésorerie devient négative en année n » : dans la simulation, vos achats, remboursements ou autres sorties dépassent l'argent disponible.",
        "« Une opération ne s'applique plus » : l'actif ou la dette visé n'existe plus ou n'est plus actif."
      ]
    },
    keywords: ['avertissement', 'alerte', 'trésorerie négative', 'dette', 'valeur peu fiable']
  },
  {
    id: 'patrimoine.projections.courbe',
    kind: 'section',
    title: 'Valeur nette par année',
    summary:
      "La courbe montre la valeur nette projetée de l'année 0 (aujourd'hui) jusqu'à l'horizon. Les valeurs exactes se lisent dans le tableau annuel.",
    howToRead: {
      notes: [
        'Sans comparaison : une courbe « Base » du scénario choisi.',
        'Avec « Comparer les trois scénarios » : une courbe par scénario, avec un motif de trait différent ; la courbe du scénario de base est plus épaisse.',
        "Après une simulation : une courbe orange en pointillés « Simulation » s'ajoute.",
        'Passez la souris sur la courbe pour lire le montant exact.'
      ]
    },
    related: [
      { label: 'Tableau annuel', helpId: 'patrimoine.projections.tableau' },
      { label: 'Hypothèses', helpId: 'patrimoine.projections.hypotheses' }
    ],
    keywords: ['courbe', 'graphique', 'scénarios', 'valeur nette projetée']
  },
  {
    id: 'patrimoine.projections.tableau',
    kind: 'table',
    title: 'Tableau annuel',
    summary:
      "Une ligne par année pour la trajectoire de base : actifs, dettes, valeur nette et valeur réelle. C'est la version chiffrée de la courbe.",
    howToRead: {
      columns: [
        {
          key: 'year',
          label: 'Année',
          description:
            "« Aujourd'hui » pour la situation actuelle, puis « Année 1 », « Année 2 »… (fin de chaque année)."
        },
        {
          key: 'assets',
          label: 'Actifs',
          description:
            "Total des actifs projeté : chaque actif croît au taux de sa classe, et les véhicules s'amortissent."
        },
        {
          key: 'debts',
          label: 'Dettes',
          description:
            'Capital restant dû projeté : chaque année, 12 mensualités remboursent les intérêts puis le capital.'
        },
        { key: 'netWorth', label: 'Valeur nette', description: 'Actifs moins dettes.' },
        {
          key: 'realNetWorth',
          label: "Valeur réelle (pouvoir d'achat d'aujourd'hui)",
          description:
            "La valeur nette divisée par l'inflation cumulée : elle exprime ce que cette somme vaudrait en pouvoir d'achat d'aujourd'hui."
        }
      ],
      notes: ['Le tableau montre toujours la projection de base, jamais la simulation.']
    },
    faq: [
      {
        q: 'Pourquoi la valeur réelle est-elle plus basse que la valeur nette ?',
        a: "Parce qu'elle retire l'effet de l'inflation supposée. À inflation de 3 %, 1 000 000 FCFA dans un an valent environ 970 000 FCFA d'aujourd'hui."
      }
    ],
    related: [{ label: 'Valeur nette par année', helpId: 'patrimoine.projections.courbe' }],
    keywords: ['tableau', 'année', 'valeur réelle', 'inflation', 'export']
  },
  {
    id: 'patrimoine.projections.ecart',
    kind: 'table',
    title: 'Écart avec la base',
    summary:
      "Après une simulation, ce tableau compare, année par année, la valeur nette de la base et celle de la simulation. La phrase au-dessus donne l'écart à la dernière année.",
    howToRead: {
      columns: [
        { key: 'year', label: 'Année', description: "L'année concernée." },
        { key: 'base', label: 'Base', description: 'Valeur nette sans vos opérations.' },
        { key: 'simulated', label: 'Simulation', description: 'Valeur nette avec vos opérations simulées.' },
        {
          key: 'delta',
          label: 'Écart',
          description: 'Simulation moins base, avec son signe : + si la simulation fait mieux, − sinon.'
        }
      ]
    },
    related: [{ label: 'Simuler', helpId: 'patrimoine.projections.simulation' }],
    keywords: ['écart', 'comparaison', 'simulation', 'delta']
  },
  {
    id: 'patrimoine.projections.hypotheses',
    kind: 'section',
    title: 'Hypothèses',
    summary:
      "Cette carte affiche les hypothèses réellement utilisées : croissance annuelle de chaque classe d'actifs et inflation annuelle. Vous pouvez les modifier.",
    purpose:
      'Les taux proposés sont indicatifs et nominaux : ils dépendent du scénario de base. Corrigez-les selon votre connaissance du marché.',
    steps: [
      { title: 'Modifier un taux', detail: "Changez la croissance d'une classe ou l'inflation." },
      {
        title: 'Appliquer',
        detail: '« Appliquer les hypothèses » relance le calcul. Les valeurs modifiées sont marquées « Personnalisée ».'
      },
      { title: 'Revenir au départ', detail: '« Rétablir les hypothèses par défaut » supprime vos personnalisations.' }
    ],
    howToRead: {
      notes: [
        'Croissance : entre −50 % et 100 % par an et par classe. Inflation : entre 0 % et 100 %.',
        "Une classe sans taux propre suit le scénario de base. Les véhicules et équipements ne suivent pas ce taux : ils s'amortissent selon leurs informations (coût, durée d'utilité, valeur résiduelle).",
        "Un actif d'épargne qui a un taux attendu utilise ce taux plutôt que celui de sa classe.",
        "L'inflation sert seulement à calculer la valeur réelle."
      ]
    },
    consequences: ['Vos hypothèses personnalisées ne sont conservées que si vous enregistrez un scénario.'],
    faq: [
      {
        q: 'Un taux est refusé, pourquoi ?',
        a: 'Un message indique les bornes : croissance entre −50 % et 100 %, inflation entre 0 % et 100 %.'
      }
    ],
    keywords: ['hypothèses', 'croissance', 'inflation', 'taux', 'personnalisée']
  },
  {
    id: 'patrimoine.projections.simulation',
    kind: 'section',
    title: 'Simuler',
    summary:
      'Vous ajoutez des opérations imaginaires (vente, achat, emprunt, remboursement, épargne), puis vous les lancez en une fois pour voir leur effet sur la valeur nette.',
    purpose: 'Une simulation ne modifie pas vos données : elle répond à la question « et si je faisais cela ? ».',
    steps: [
      {
        title: 'Choisir le type',
        detail:
          "« Type d'opération » : vente d'un actif, achat d'un actif, nouvel emprunt, remboursement anticipé ou épargne mensuelle."
      },
      { title: 'Remplir les champs', detail: "Les années vont de 1 jusqu'à l'horizon choisi." },
      { title: "Ajouter l'opération", detail: "Elle rejoint la liste « Opérations simulées ». « Retirer » l'enlève." },
      {
        title: 'Lancer',
        detail: '« Lancer la simulation » calcule la courbe « Simulation » et le tableau « Écart avec la base ».'
      }
    ],
    howToRead: {
      notes: [
        "Vente d'un actif : actifs au statut « Actif », valorisés, hors « Comptes et mobile money ». Sans prix de vente, c'est la valeur projetée de l'actif cette année-là ; les frais en pourcentage sont retirés. L'argent va dans la trésorerie simulée. Une dette liée à l'actif n'est pas soldée par la vente.",
        "Achat d'un actif : classe, nom, prix, année, croissance facultative. Le prix sort de la trésorerie ; l'actif vaut son prix, puis croît.",
        'Nouvel emprunt : montant, taux annuel, durée en années (1 à 30). Le montant entre dans la trésorerie, la dette est remboursée par mensualités constantes.',
        'Remboursement anticipé : une dette « Actif », un montant qui ne dépasse pas le capital restant dû projeté à cette année-là. Il sort de la trésorerie.',
        "Épargne mensuelle : montant par mois, de l'année de départ à l'année de fin (par défaut, l'horizon). Chaque année ajoute 12 versements à la trésorerie, sans intérêt l'année du versement.",
        "Au plus 50 opérations. Dans une même année, la croissance et les échéances passent d'abord, puis l'épargne, puis les autres opérations dans l'ordre de la liste."
      ]
    },
    consequences: [
      "Aucune donnée réelle n'est modifiée.",
      'Si vous changez la liste, un message vous invite à relancer la simulation pour mettre à jour les résultats.',
      "Les erreurs du calcul s'affichent sous l'opération concernée (par exemple un remboursement supérieur au capital restant)."
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas vendre un compte ?',
        a: "Un compte ou un solde mobile money n'est pas un actif que l'on vend. Utilisez plutôt l'épargne mensuelle ou un remboursement."
      },
      {
        q: 'Que veut dire « trésorerie négative » ?',
        a: "Vos achats ou remboursements simulés dépassent l'argent disponible (comptes compris). Le calcul continue mais vous avertit."
      }
    ],
    permissions: { note: 'Calculer demande « Voir le patrimoine personnel ».' },
    related: [{ label: 'Écart avec la base', helpId: 'patrimoine.projections.ecart' }],
    keywords: [
      'simuler',
      'vente',
      'achat',
      'emprunt',
      'remboursement anticipé',
      'épargne mensuelle',
      'opération',
      'et si'
    ]
  },
  {
    id: 'patrimoine.projections.scenarios',
    kind: 'section',
    title: 'Scénarios enregistrés',
    summary:
      'Enregistrez vos réglages (horizon, scénario de base, hypothèses personnalisées, opérations simulées) sous un nom, pour les rouvrir plus tard.',
    steps: [
      { title: 'Enregistrer', detail: 'Saisissez un « Nom du scénario » puis « Enregistrer ce scénario ».' },
      { title: 'Ouvrir', detail: '« Ouvrir » recharge les réglages et relance le calcul sur vos données du moment.' },
      { title: 'Renommer', detail: '« Renommer », nouveau nom, puis « Valider ».' },
      {
        title: 'Mettre à jour',
        detail: "« Mettre à jour » remplace les réglages du scénario par ceux de l'écran, après confirmation."
      },
      { title: 'Supprimer', detail: '« Supprimer », puis confirmez.' }
    ],
    consequences: [
      "Aucun résultat n'est stocké : seuls les réglages le sont. Les chiffres changent donc si vos actifs ou dettes changent.",
      'La suppression est définitive.',
      'Le nom est limité à 120 caractères. Un nom déjà utilisé est refusé, et on ne peut pas dépasser 100 scénarios enregistrés.',
      "Si un actif ou une dette cité par un scénario n'existe plus, l'opération est ignorée avec un avertissement."
    ],
    faq: [
      {
        q: 'Je ne vois pas les boutons pour enregistrer.',
        a: 'Il faut le droit « Modifier le patrimoine personnel ». Sans lui, vous pouvez seulement ouvrir les scénarios.'
      }
    ],
    permissions: {
      note: 'Ouvrir demande « Voir le patrimoine personnel » ; les autres actions demandent « Modifier le patrimoine personnel ».'
    },
    keywords: ['scénario', 'enregistrer', 'ouvrir', 'renommer', 'sauvegarde']
  }
];

export default entries;
