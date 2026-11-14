import type { HelpEntry } from '../../../types';

/** Zone « releves » du module « patrimoine » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.releves',
    kind: 'page',
    title: 'Relevés de gérance',
    summary:
      'Générez, suivez et envoyez les relevés de gérance de vos propriétaires. Un relevé résume, pour un mois, les loyers encaissés, vos honoraires, les dépenses et le net à reverser.',
    purpose:
      "Quand votre agence gère des biens pour le compte d'un propriétaire, elle lui rend compte chaque mois : ce qui a été encaissé, ce que l'agence a retenu et ce qui lui revient. Cet écran produit ce compte rendu et garde l'historique.",
    steps: [
      {
        title: 'Générer un relevé',
        detail:
          'Dans la carte « Générer un relevé de gérance », choisissez le propriétaire, saisissez le mois (AAAA-MM, par exemple 2026-03), cochez les biens, puis cliquez sur « Générer le relevé ».'
      },
      {
        title: 'Retrouver un relevé',
        detail: "Dans l'historique, utilisez la recherche ou les filtres Statut, Période et Propriétaire."
      },
      {
        title: 'Ouvrir le détail',
        detail: 'Bouton « Détails » : vous voyez tous les montants, les lignes du relevé et le partage au propriétaire.'
      },
      {
        title: 'Envoyer au propriétaire',
        detail: 'Bouton « Envoyer » sur la ligne du relevé : le propriétaire le reçoit par e-mail.'
      },
      {
        title: 'Recalculer un ancien relevé',
        detail: "Si un relevé porte l'étiquette « Ancien calcul », cliquez sur « Recalculer » avant tout envoi."
      }
    ],
    consequences: [
      "Un relevé généré est un « Brouillon ». Il n'est pas encore envoyé au propriétaire.",
      "Il n'existe qu'un relevé par propriétaire et par mois. Générer à nouveau le même mois remplace les lignes du brouillon et le recalcule ; c'est refusé si le relevé est déjà « Envoyé » (calcul à jour) ou « Payé ».",
      '« Envoyer » transmet le relevé par e-mail au propriétaire et, si WhatsApp est configuré pour votre agence, par WhatsApp aussi. Le relevé passe alors à « Envoyé » (un relevé « Payé » garde son statut).',
      "L'envoi est refusé ou ne part pas si le propriétaire n'a pas d'e-mail valide, s'il n'a pas consenti à recevoir des e-mails, ou si cet envoi est désactivé dans la configuration de l'agence.",
      'Un relevé passe à « Payé » uniquement lorsque le reversement au propriétaire est enregistré, pas par une modification à la main.'
    ],
    faq: [
      {
        q: 'Je ne trouve pas mon propriétaire dans la liste. Que faire ?',
        a: "Seuls les contacts ayant le rôle « Propriétaire » apparaissent. Il doit aussi être rattaché à un compte propriétaire de l'agence, sinon la génération est refusée avec un message qui vous le dit."
      },
      {
        q: 'Pourquoi la liste des biens est-elle vide ?',
        a: "Elle ne montre que les biens de ce propriétaire que l'agence peut inclure dans un relevé. Choisissez d'abord le propriétaire."
      },
      {
        q: 'Que veut dire « Ancien calcul » ?',
        a: "Le relevé a été fait avec l'ancienne méthode : le loyer du contrat y figure comme loyer encaissé et aucun honoraire n'est déduit. Il ne peut pas être envoyé tant qu'il n'est pas recalculé."
      },
      {
        q: "Le propriétaire n'a rien reçu. Pourquoi ?",
        a: "Un message d'avertissement s'affiche après le clic sur « Envoyer » : e-mail manquant ou non valide, consentement e-mail absent, ou envoi désactivé pour ce type de notification."
      },
      {
        q: 'Je ne vois pas cet écran dans mon menu.',
        a: 'Les relevés de gérance concernent des biens de propriétaires tiers. Ils font partie du pack Location et ne sont pas inclus dans un pack Patrimoine seul.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Consulter les relevés demande le droit de consulter les relevés de gérance ; générer, recalculer, envoyer et partager demandent le droit de créer, recalculer et envoyer les relevés de gérance.'
    },
    related: [
      { label: 'Générer un relevé', helpId: 'patrimoine.releves.generer' },
      { label: 'Historique des relevés', helpId: 'patrimoine.releves.historique' },
      { label: "Détail d'un relevé", helpId: 'patrimoine.releve' }
    ],
    keywords: [
      'relevé de gérance',
      'relevé propriétaire',
      'compte rendu de gestion',
      'reversement',
      'honoraires',
      'net à reverser',
      'envoyer au propriétaire'
    ]
  },
  {
    id: 'patrimoine.releves.generer',
    kind: 'section',
    title: 'Générer un relevé de gérance',
    summary: "Ce formulaire produit le relevé d'un propriétaire pour un mois et pour les biens que vous choisissez.",
    purpose:
      "Le relevé calcule, bien par bien, ce qui a été encaissé dans le mois, les honoraires de l'agence, les dépenses et le net à reverser au propriétaire.",
    steps: [
      {
        title: 'Propriétaire',
        detail: 'Tapez un nom pour chercher parmi vos contacts propriétaires, puis choisissez-le.'
      },
      {
        title: 'Période',
        detail: 'Saisissez le mois au format AAAA-MM, par exemple 2026-03. Un autre format est refusé.'
      },
      {
        title: 'Biens concernés',
        detail: 'Cochez un ou plusieurs biens. La liste se remplit après le choix du propriétaire.'
      },
      {
        title: 'Générer',
        detail:
          "Cliquez sur « Générer le relevé ». Le message « Relevé généré » confirme, et le relevé apparaît dans l'historique."
      }
    ],
    consequences: [
      "Le montant « encaissé » compte les règlements réussis dont la date tombe dans le mois, même s'ils soldent un loyer d'un autre mois.",
      'Net à reverser = loyers encaissés, moins les honoraires et leur TVA, moins les dépenses, moins la retenue à la source, plus les dépôts de garantie conservés.',
      "Le relevé est créé en « Brouillon » : rien n'est envoyé au propriétaire à ce stade."
    ],
    faq: [
      {
        q: 'Puis-je refaire un relevé du même mois ?',
        a: "Oui tant qu'il est en brouillon : il est recalculé. S'il est déjà envoyé (calcul à jour) ou payé, la génération est refusée."
      },
      {
        q: 'Quelle différence entre « appelé » et « encaissé » ?',
        a: "« Appelé » est ce que les locataires devaient pour le mois ; « encaissé » est ce qu'ils ont réellement payé pendant le mois."
      },
      {
        q: "Pourquoi aucun honoraire n'est déduit ?",
        a: "Les honoraires sont ceux enregistrés lors des encaissements du mois. Si le taux de l'agence n'était pas fixé, aucun n'a été prélevé : fixez-le puis recalculez le brouillon."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Demande le droit de créer, recalculer et envoyer les relevés de gérance.'
    },
    related: [
      { label: 'Historique des relevés', helpId: 'patrimoine.releves.historique' },
      { label: "Détail d'un relevé", helpId: 'patrimoine.releve' }
    ],
    keywords: ['générer un relevé', 'nouveau relevé', 'période', 'AAAA-MM', 'biens du propriétaire']
  },
  {
    id: 'patrimoine.releves.historique',
    kind: 'table',
    title: 'Historique des relevés',
    summary:
      'Chaque ligne est un relevé de gérance : le mois, le propriétaire, les montants clés, le statut et les actions possibles.',
    howToRead: {
      columns: [
        {
          key: 'period',
          label: 'Période',
          description: 'Le mois couvert par le relevé, au format AAAA-MM.'
        },
        {
          key: 'owner',
          label: 'Propriétaire',
          description: 'Le propriétaire concerné ; à défaut de nom, son e-mail.'
        },
        {
          key: 'totalRevenue',
          label: 'Loyers encaissés',
          description: 'Ce que les locataires ont payé pendant le mois, en FCFA.'
        },
        {
          key: 'fees',
          label: 'Honoraires et TVA',
          description: "Les honoraires de l'agence et leur TVA, additionnés."
        },
        {
          key: 'totalExpenses',
          label: 'Dépenses',
          description: 'Les dépenses déduites du revenu du propriétaire.'
        },
        {
          key: 'netAmount',
          label: 'Net à reverser',
          description:
            'Ce qui revient au propriétaire. Un montant négatif apparaît si les honoraires et les dépenses dépassent les loyers encaissés.'
        },
        {
          key: 'status',
          label: 'Statut',
          description: "L'avancement du relevé, avec l'étiquette « Ancien calcul » s'il y a lieu."
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            '« Détails » ouvre le relevé. « Recalculer » (anciens relevés) ou « Envoyer » (relevés à jour) apparaît selon le cas.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: 'Généré mais pas encore envoyé au propriétaire. Il peut être recalculé.'
        },
        {
          value: 'SENT',
          label: 'Envoyé',
          description: 'Transmis au propriétaire par e-mail (et WhatsApp si configuré).'
        },
        {
          value: 'PAID',
          label: 'Payé',
          description: 'Le reversement au propriétaire est enregistré. Le relevé ne peut plus être recalculé.'
        }
      ],
      notes: [
        "Un bandeau jaune en haut de la page indique combien de relevés non payés ont été calculés selon l'ancienne méthode.",
        "L'export contient tous les relevés qui correspondent à vos filtres, pas seulement la page affichée."
      ]
    },
    steps: [
      {
        title: 'Filtrer',
        detail: 'Cherchez un propriétaire, une période ou un bien, ou filtrez par statut, période et propriétaire.'
      },
      {
        title: 'Envoyer',
        detail:
          'Cliquez sur « Envoyer » : un message vous dit si le relevé est parti par e-mail seul ou aussi par WhatsApp.'
      }
    ],
    consequences: [
      "« Envoyer » fait passer un brouillon à « Envoyé » et enregistre la date d'envoi. Renvoyer un relevé « Payé » ne change pas son statut.",
      '« Recalculer » refait le relevé avec le même propriétaire, le même mois et les mêmes biens ; il repasse en « Brouillon ». Vérifiez-le avant de le renvoyer.'
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Envoyer » a-t-il disparu ?',
        a: "Il est remplacé par « Recalculer » sur les relevés de l'ancien calcul. Recalculez, vérifiez, puis envoyez."
      },
      {
        q: "Pourquoi « Recalculer » n'apparaît-il pas sur un relevé payé ?",
        a: "Un relevé payé est figé. L'écart éventuel se régularise sur le relevé suivant."
      },
      {
        q: 'Que signifie un net négatif ?',
        a: 'Les honoraires et les dépenses dépassent les loyers encaissés du mois.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: '« Envoyer » et « Recalculer » demandent le droit de créer, recalculer et envoyer les relevés de gérance.'
    },
    related: [
      { label: 'Générer un relevé', helpId: 'patrimoine.releves.generer' },
      { label: "Détail d'un relevé", helpId: 'patrimoine.releve' }
    ],
    keywords: ['historique', 'liste des relevés', 'statut', 'ancien calcul', 'recalculer', 'envoyer']
  },
  {
    id: 'patrimoine.releve',
    kind: 'page',
    title: 'Détail du relevé',
    summary:
      "Retrouvez tous les montants d'un relevé de gérance, ses lignes bien par bien et, une fois le relevé envoyé, le partage au propriétaire par lien sécurisé.",
    purpose:
      "Ce détail vous permet de vérifier un relevé avant ou après l'envoi, et d'expliquer au propriétaire d'où vient le net à reverser.",
    howToRead: {
      notes: [
        "Loyers appelés : ce que les locataires devaient pour le mois. Loyers encaissés : ce qu'ils ont payé pendant le mois. Restant dû par les locataires : les impayés à la fin du mois.",
        'Honoraires de gestion et TVA sur honoraires : le taux appliqué est indiqué entre parenthèses quand il est unique.',
        'Retenue à la source et dépôt de garantie conservé : la première est déduite du net, le second y est ajouté.',
        "Net à reverser : le montant qui revient au propriétaire. « Envoyé le » reste vide tant que le relevé n'a pas été envoyé.",
        "Un relevé de l'ancien calcul affiche seulement le loyer du contrat et les dépenses, avec un bandeau d'avertissement."
      ]
    },
    steps: [
      {
        title: 'Vérifier les montants',
        detail: 'Lisez la synthèse en haut, puis les lignes du relevé.'
      },
      {
        title: 'Recalculer si besoin',
        detail:
          "Le bouton « Recalculer » du bandeau refait le relevé : pour un ancien calcul non payé, ou pour un brouillon généré sans taux d'honoraires."
      },
      {
        title: 'Partager',
        detail:
          'En bas de page, envoyez le rapport du mois ou copiez un lien sécurisé, une fois le relevé envoyé au propriétaire.'
      },
      {
        title: 'Revenir à la liste',
        detail: 'Bouton « Retour ».'
      }
    ],
    consequences: [
      'Recalculer repasse le relevé en « Brouillon » : il faudra le renvoyer au propriétaire.',
      "Un relevé déjà « Payé » ne peut plus être recalculé, même s'il porte l'étiquette « Ancien calcul »."
    ],
    faq: [
      {
        q: "Pourquoi le bandeau dit que le taux d'honoraires n'était pas fixé ?",
        a: "Au moment du calcul, l'agence n'avait aucun taux et aucun honoraire n'a été déduit. Utilisez le lien « Fixer le taux d'honoraires », puis recalculez le brouillon."
      },
      {
        q: 'Où voir les retenues et le dépôt de garantie conservé ?',
        a: 'Dans la synthèse, et dans les lignes du relevé avec le type « Autre ».'
      },
      {
        q: "Pourquoi n'ai-je pas accès aux liens sécurisés ?",
        a: "Le partage est refusé tant que le relevé est un brouillon ou de l'ancien calcul."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Consulter demande le droit de consulter les relevés de gérance ; recalculer et partager demandent le droit de créer, recalculer et envoyer.'
    },
    related: [
      { label: 'Lignes du relevé', helpId: 'patrimoine.releve.lignes' },
      { label: 'Rapport mensuel et liens sécurisés', helpId: 'patrimoine.releve.liens' },
      { label: 'Retour aux relevés', helpId: 'patrimoine.releves' }
    ],
    keywords: [
      'détail du relevé',
      'net à reverser',
      'loyers appelés',
      'restant dû',
      'retenue à la source',
      'dépôt de garantie'
    ]
  },
  {
    id: 'patrimoine.releve.lignes',
    kind: 'table',
    title: 'Lignes du relevé',
    summary:
      'Le tableau détaille chaque montant du relevé, bien par bien : loyer encaissé, honoraires, TVA, dépenses et autres lignes.',
    howToRead: {
      columns: [
        {
          key: 'property',
          label: 'Bien',
          description: 'Le bien concerné : son titre, ou sa référence à défaut.'
        },
        {
          key: 'label',
          label: 'Libellé',
          description: "Le texte de la ligne, par exemple le détail d'une dépense."
        },
        {
          key: 'type',
          label: 'Type',
          description: 'La nature de la ligne (voir ci-dessous).'
        },
        {
          key: 'amount',
          label: 'Montant',
          description: 'Le montant de la ligne en FCFA.'
        }
      ],
      statuses: [
        {
          value: 'RENT_COLLECTED',
          label: 'Loyer encaissé',
          description: 'Un loyer payé par le locataire dans le mois.'
        },
        {
          value: 'EXPENSE_DEDUCTED',
          label: 'Dépense déduite',
          description: 'Une dépense retirée du revenu du propriétaire.'
        },
        { value: 'MANAGEMENT_FEE', label: 'Honoraires de gestion', description: "La commission de l'agence." },
        { value: 'MANAGEMENT_FEE_VAT', label: 'TVA sur honoraires', description: 'La TVA appliquée à ces honoraires.' },
        { value: 'ADVANCE', label: 'Avance', description: 'Une avance versée au propriétaire.' },
        {
          value: 'OTHER',
          label: 'Autre',
          description: 'Notamment la retenue à la source (déduite) et le dépôt de garantie conservé (ajouté).'
        }
      ],
      notes: ["L'export contient les lignes du relevé affiché."]
    },
    faq: [
      {
        q: 'Pourquoi une ligne est-elle de type « Autre » ?',
        a: "C'est le type des lignes de retenue à la source et de dépôt de garantie conservé."
      },
      {
        q: 'Comment corriger une ligne ?',
        a: "Les lignes viennent du calcul : corrigez la source (paiement, dépense, taux d'honoraires), puis recalculez si le relevé le permet."
      },
      {
        q: 'Les lignes sont-elles dans le rapport du propriétaire ?',
        a: 'Oui : son lien sécurisé montre les lignes regroupées par bien, avec le net de chaque bien.'
      }
    ],
    permissions: { feature: 'RENTAL' },
    related: [{ label: 'Détail du relevé', helpId: 'patrimoine.releve' }],
    keywords: ['lignes', 'détail des montants', 'honoraires', 'TVA', 'dépenses', 'autre']
  },
  {
    id: 'patrimoine.releve.liens',
    kind: 'section',
    title: 'Rapport mensuel et liens sécurisés',
    summary:
      'Envoyez au propriétaire le rapport du mois, ou copiez un lien sécurisé à lui transmettre vous-même. Le lien donne un accès en lecture seule au relevé.',
    purpose:
      'Le propriétaire consulte son relevé sans compte, par un lien limité dans le temps. Il y voit les montants du mois et leur détail par bien, sans vos coordonnées ni les siennes.',
    steps: [
      {
        title: 'Envoyer le rapport du mois',
        detail:
          'Cliquez sur « Envoyer le rapport du mois » : ImmoTopia choisit le meilleur canal (WhatsApp ou e-mail) selon les coordonnées et le consentement du propriétaire.'
      },
      {
        title: 'Ou copier un lien',
        detail: 'Cliquez sur « Copier le lien sécurisé », puis collez-le dans votre propre message.'
      },
      {
        title: 'Surveiller',
        detail:
          "Le tableau « Liens actifs » montre l'expiration, le nombre de consultations et la dernière consultation."
      },
      {
        title: 'Révoquer',
        detail: 'Bouton « Révoquer » sur la ligne, puis confirmez : le lien ne fonctionne plus.'
      }
    ],
    consequences: [
      "Le partage n'est possible qu'après l'envoi du relevé au propriétaire (bouton « Envoyer » de la liste) : un brouillon ou un relevé de l'ancien calcul est refusé.",
      "Le message part sur un seul canal, et un lien actif est créé. Si l'envoi échoue sur tous les canaux, le lien créé est annulé. Un clic répété renvoie le rapport : il n'y a pas de blocage anti-doublon sur cet envoi manuel.",
      "« Copier le lien sécurisé » crée un nouveau lien à chaque clic. Le lien n'est affiché qu'une seule fois : si la copie automatique échoue, une fenêtre vous le montre, et il ne pourra plus être relu après sa fermeture.",
      'Une révocation est définitive : le propriétaire ne peut plus ouvrir le rapport avec ce lien. Pour lui redonner accès, créez-en un nouveau.',
      'Chaque ouverture réussie du lien est comptée dans « Consultations ».'
    ],
    faq: [
      {
        q: 'Pourquoi « Aucun canal éligible » ?',
        a: "Le propriétaire n'a ni coordonnées ni consentement pour WhatsApp ou l'e-mail. Complétez sa fiche contact."
      },
      {
        q: 'Puis-je retrouver un lien copié ?',
        a: "Non. Le lien n'est montré qu'à sa création ; créez-en un nouveau si besoin."
      },
      {
        q: 'Combien de temps le lien reste-t-il valable ?',
        a: "Jusqu'à la date de la colonne « Expire le ». Après cette date, le propriétaire ne peut plus l'ouvrir."
      },
      {
        q: 'Le propriétaire peut-il modifier le relevé ?',
        a: 'Non, le lien est en lecture seule.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Envoyer, copier et révoquer demandent le droit de créer, recalculer et envoyer les relevés de gérance ; la liste des liens demande le droit de les consulter.'
    },
    related: [
      { label: 'Liens actifs', helpId: 'patrimoine.releve.liens-actifs' },
      { label: 'Retour aux relevés', helpId: 'patrimoine.releves' }
    ],
    keywords: ['lien sécurisé', 'rapport mensuel', 'WhatsApp', 'partager', 'révoquer', 'lecture seule']
  },
  {
    id: 'patrimoine.releve.liens-actifs',
    kind: 'table',
    title: 'Liens actifs',
    summary:
      "Les liens sécurisés encore valables pour ce relevé, avec leur date d'expiration et leur nombre de consultations.",
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Créé le', description: "La date et l'heure de création du lien." },
        { key: 'expiresAt', label: 'Expire le', description: "Après cette date, le lien ne s'ouvre plus." },
        {
          key: 'viewCount',
          label: 'Consultations',
          description: 'Le nombre de fois où le lien a été ouvert avec succès.'
        },
        {
          key: 'lastViewedAt',
          label: 'Dernière consultation',
          description: "La date de la dernière ouverture ; un tiret si le lien n'a jamais été ouvert."
        },
        { key: 'status', label: 'Statut', description: 'Toujours « Actif » : seuls les liens actifs sont listés.' },
        { key: 'actions', label: 'Actions', description: '« Révoquer » désactive le lien après confirmation.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Le lien peut encore être ouvert par le propriétaire.' }
      ],
      notes: ['Un lien révoqué ou expiré disparaît de la liste.']
    },
    faq: [
      {
        q: 'Où est passé un lien révoqué ?',
        a: "Il n'est plus listé : seuls les liens actifs apparaissent."
      },
      {
        q: 'Pourquoi « Aucun lien actif » ?',
        a: "Aucun lien n'a été créé, ou ils ont tous expiré ou été révoqués."
      },
      {
        q: 'Le nombre de consultations prouve-t-il que le propriétaire a lu le relevé ?',
        a: 'Il montre que le lien a été ouvert, pas par qui.'
      }
    ],
    permissions: { feature: 'RENTAL' },
    related: [{ label: 'Rapport mensuel et liens sécurisés', helpId: 'patrimoine.releve.liens' }],
    keywords: ['liens actifs', 'consultations', 'expiration', 'révocation']
  }
];

export default entries;
