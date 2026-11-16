import type { HelpEntry } from '../../../types';

/** Zone « proprietaire-suivi » du module « portails » (fr). */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------ Mon compte
  {
    id: 'portails.proprietaire.compte',
    kind: 'page',
    title: 'Mon compte',
    summary:
      "Le compte courant que l'agence tient pour vous : ce qu'elle vous doit (ou ce que vous lui devez), ce qui compose ce solde et les reversements qu'elle vous a faits. L'écran est en lecture seule.",
    purpose:
      "L'agence encaisse les loyers de vos biens, retire ses honoraires et les dépenses, puis vous reverse le reste. Cet écran vous permet de vérifier ces écritures sans appeler l'agence. Il ne permet ni de demander un reversement ni de modifier une écriture.",
    steps: [
      {
        title: 'Lire le solde',
        detail:
          "La phrase en haut de page dit dans quel sens va le solde : « L'agence vous doit », « Vous devez à l'agence » ou « Votre compte est à jour ». Le montant s'affiche en dessous, sauf quand le compte est à jour."
      },
      {
        title: 'Comprendre le solde',
        detail:
          'Les cartes « Loyers encaissés », « Honoraires de gestion », « TVA sur honoraires », « Dépenses » et « Reversements reçus » détaillent ce qui le compose.'
      },
      {
        title: 'Voir les reversements',
        detail: "Onglet « Reversements reçus » : chaque somme que l'agence vous a versée."
      },
      {
        title: 'Voir chaque écriture',
        detail: 'Onglet « Détail des mouvements » : toutes les écritures du compte, avec le solde après chacune.'
      },
      {
        title: 'Chercher ou exporter',
        detail: "Utilisez la recherche au-dessus de chaque liste, ou le bouton d'export de la liste."
      },
      {
        title: 'Rafraîchir',
        detail: 'Le bouton « Actualiser » recharge le compte.'
      }
    ],
    consequences: [
      "Cet écran est en lecture seule : rien de ce que vous y faites ne modifie votre compte. Les écritures sont enregistrées par l'agence.",
      'Un reversement annulé reste visible, marqué « Annulé », pour que votre historique reste complet.'
    ],
    faq: [
      {
        q: "Que veut dire « Vous devez à l'agence » ?",
        a: "Le solde est négatif : les honoraires et dépenses enregistrés dépassent les loyers encaissés pour vous. Rapprochez-vous de l'agence pour connaître la suite."
      },
      {
        q: "Pourquoi certaines cartes n'apparaissent-elles pas ?",
        a: "« Retenue à la source », « Dépôt de garantie conservé » et « Autres mouvements » ne s'affichent que si leur montant n'est pas nul."
      },
      {
        q: 'Un virement reçu ne figure pas dans la liste. Que faire ?',
        a: "Seuls les reversements enregistrés par l'agence apparaissent. Demandez à l'agence de l'enregistrer."
      },
      {
        q: 'Le compte ne se charge pas.',
        a: 'Cliquez sur « Réessayer ». Si le message revient, contactez votre agence.'
      }
    ],
    related: [
      { label: 'Le solde et ses cartes', helpId: 'portails.proprietaire.compte.solde' },
      { label: 'Reversements reçus', helpId: 'portails.proprietaire.compte.reversements' },
      { label: 'Détail des mouvements', helpId: 'portails.proprietaire.compte.mouvements' }
    ],
    keywords: ['compte', 'solde', 'reversement', 'virement', 'honoraires', 'relevé', 'argent', 'propriétaire', 'dû']
  },
  {
    id: 'portails.proprietaire.compte.solde',
    kind: 'section',
    title: 'Solde et indicateurs du compte',
    summary:
      "Une phrase indique qui doit de l'argent à qui, puis des cartes montrent ce qui compose ce solde. Chaque carte affiche un total en FCFA.",
    howToRead: {
      columns: [],
      notes: [
        "« L'agence vous doit » : le solde est positif, c'est la somme que l'agence a à vous reverser. « Vous devez à l'agence » : le solde est négatif. « Votre compte est à jour » : le solde est nul.",
        "« Loyers encaissés » : les loyers que l'agence a reçus pour vos biens.",
        "« Honoraires de gestion » et « TVA sur honoraires » : ce que l'agence retient pour sa gestion, taxe comprise.",
        "« Dépenses » : les frais payés par l'agence pour vos biens (réparations par exemple).",
        "« Reversements reçus » : les sommes déjà versées par l'agence.",
        "« Retenue à la source » diminue le solde ; « Dépôt de garantie conservé » l'augmente ; « Autres mouvements » regroupe toute autre écriture, avec son signe. Ces trois cartes n'apparaissent que si leur montant n'est pas nul."
      ]
    },
    consequences: ["Ces chiffres sont des totaux calculés par l'agence ; vous ne pouvez pas les modifier ici."],
    faq: [
      {
        q: "Pourquoi le solde ne correspond-il pas à ce que je m'attendais à recevoir ?",
        a: 'Le solde tient compte de tous les totaux : loyers encaissés moins honoraires, taxe, dépenses, reversements et retenues. Parcourez le détail des mouvements pour voir chaque écriture.'
      },
      {
        q: 'Où voir à quoi correspond une dépense ?',
        a: 'Dans « Détail des mouvements » : la colonne « Libellé » décrit chaque écriture et « Bien » indique le bien concerné.'
      },
      {
        q: 'Le dépôt de garantie de mon locataire est-il dans mon solde ?',
        a: "Seulement la part que l'agence a conservée (« Dépôt de garantie conservé »). Le reste est détenu pour le locataire et se lit dans l'écran « Dépôts de garantie »."
      }
    ],
    related: [
      { label: 'Dépôts de garantie', helpId: 'portails.proprietaire.cautions' },
      { label: 'Détail des mouvements', helpId: 'portails.proprietaire.compte.mouvements' }
    ],
    keywords: ['solde', 'honoraires', 'tva', 'retenue à la source', 'dépenses', 'loyers encaissés']
  },
  {
    id: 'portails.proprietaire.compte.reversements',
    kind: 'table',
    title: 'Reversements reçus',
    summary:
      "Chaque ligne est une somme que l'agence vous a versée. Le tableau indique la date, le numéro, le mode de paiement, la référence, le montant et l'éventuelle annulation.",
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'Le jour où le reversement a été effectué.' },
        { key: 'number', label: 'Numéro', description: "Le numéro du reversement, attribué par l'agence." },
        {
          key: 'mode',
          label: 'Mode',
          description: 'Espèces, Virement bancaire, Chèque, Mobile Money ou Autre.'
        },
        {
          key: 'reference',
          label: 'Référence',
          description:
            "Par exemple un numéro de virement ou de chèque. Un tiret (—) signifie qu'aucune référence n'est enregistrée."
        },
        { key: 'montant', label: 'Montant', description: 'La somme versée, en FCFA.' },
        {
          key: 'statut',
          label: 'Statut',
          description: "Vide pour un reversement valide ; « Annulé » pour un reversement annulé par l'agence."
        }
      ],
      statuses: [
        { value: 'VALIDATED', label: '(aucune étiquette)', description: 'Reversement valide.' },
        {
          value: 'VOIDED',
          label: 'Annulé',
          description: "Reversement annulé par l'agence ; il est conservé dans l'historique."
        }
      ],
      notes: ["Sur téléphone, chaque reversement s'affiche sous forme de carte."]
    },
    steps: [
      { title: 'Chercher', detail: 'Tapez un numéro ou une référence dans la recherche.' },
      { title: 'Filtrer', detail: 'Réduisez la liste par Mode, Statut ou Date.' },
      { title: 'Exporter', detail: "Le bouton d'export télécharge la liste, filtres compris." }
    ],
    faq: [
      {
        q: 'Pourquoi un reversement est-il « Annulé » ?',
        a: "L'agence l'a annulé après l'avoir enregistré, par exemple pour corriger une erreur. Demandez-lui le détail."
      },
      {
        q: 'La liste est vide.',
        a: "« Aucun reversement n'a encore été effectué » : l'agence ne vous a encore rien reversé."
      },
      {
        q: 'Un reversement annulé compte-t-il dans mon solde ?',
        a: "À confirmer auprès de votre agence : l'écran affiche le statut mais ne détaille pas son effet sur le solde."
      }
    ],
    related: [{ label: 'Mon compte', helpId: 'portails.proprietaire.compte' }],
    keywords: ['reversement', 'virement', 'paiement reçu', 'versement', 'mobile money', 'chèque']
  },
  {
    id: 'portails.proprietaire.compte.mouvements',
    kind: 'table',
    title: 'Détail des mouvements',
    summary:
      "Chaque ligne est une écriture de votre compte : loyer encaissé, honoraires, dépense, reversement, etc. La dernière colonne donne le solde après l'écriture.",
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: "La date de l'écriture." },
        {
          key: 'type',
          label: 'Type',
          description:
            'Loyer encaissé, Honoraires de gestion, TVA sur honoraires, Dépense, Reversement, Annulation, Retenue à la source ou Dépôt de garantie conservé.'
        },
        { key: 'libelle', label: 'Libellé', description: "Le texte de l'écriture, saisi par l'agence." },
        {
          key: 'bien',
          label: 'Bien',
          description: "Le bien concerné, ou à défaut le numéro du bail. Un tiret (—) si aucun n'est rattaché."
        },
        {
          key: 'montant',
          label: 'Montant',
          description:
            'Précédé de + quand la somme entre dans votre compte, en rouge avec un signe moins quand elle en sort.'
        },
        { key: 'solde', label: 'Solde après', description: 'Votre solde juste après cette écriture.' }
      ],
      notes: ["Sur téléphone, chaque mouvement s'affiche sous forme de carte."]
    },
    steps: [
      { title: 'Chercher', detail: 'Tapez un libellé, un bien ou un numéro de bail.' },
      { title: 'Filtrer', detail: 'Réduisez la liste par Type, Bien ou Date.' },
      { title: 'Exporter', detail: "Le bouton d'export télécharge la liste, filtres compris." }
    ],
    faq: [
      {
        q: 'Que veut dire « Annulation » ?',
        a: "L'agence a annulé une écriture précédente. Les deux lignes restent visibles pour garder la trace."
      },
      {
        q: 'Pourquoi un montant est-il en rouge ?',
        a: "C'est une somme qui sort de votre compte (honoraires, dépense, reversement…)."
      },
      {
        q: 'Je ne comprends pas un libellé.',
        a: "Le libellé est écrit par l'agence. Contactez-la en citant la date et le montant."
      }
    ],
    related: [{ label: 'Solde et indicateurs', helpId: 'portails.proprietaire.compte.solde' }],
    keywords: ['mouvement', 'écriture', 'opération', 'loyer encaissé', 'honoraires', 'dépense']
  },

  // -------------------------------------------------- Dépôts de garantie
  {
    id: 'portails.proprietaire.cautions',
    kind: 'page',
    title: 'Dépôts de garantie',
    summary:
      "Le suivi des dépôts de garantie versés par les locataires de vos biens : montant prévu, somme que l'agence détient, somme retenue, et l'historique de chaque dépôt. L'écran est en lecture seule.",
    purpose:
      "Un dépôt de garantie est une somme que le locataire verse à l'entrée et que l'agence détient pour son compte. Ce n'est pas un revenu : il n'entre pas dans vos revenus. Ici, vous voyez où il en est.",
    steps: [
      {
        title: 'Lire les totaux',
        detail:
          "Les cartes « Total » (nombre de dépôts), « Total détenu », « Total retenu » et « Total libéré » résument l'ensemble."
      },
      {
        title: 'Parcourir la liste',
        detail: 'Chaque ligne est un dépôt, avec le bien, le locataire, les montants et le statut.'
      },
      {
        title: "Voir l'historique d'un dépôt",
        detail: 'Cliquez sur « Mouvements » : une fenêtre liste chaque opération (collecte, retenue, remboursement…).'
      },
      { title: 'Rafraîchir', detail: 'Le bouton « Actualiser » recharge la liste.' }
    ],
    consequences: [
      "Cet écran est en lecture seule : les dépôts sont gérés par l'agence.",
      "Le dépôt n'est jamais compté dans vos revenus ni dans le solde « Mon compte », sauf la part que l'agence conserve (« Dépôt de garantie conservé »)."
    ],
    faq: [
      {
        q: 'Quelle est la différence entre « Montant détenu » et « Montant retenu » ?',
        a: "« Détenu » est ce que l'agence garde pour le locataire (collecté moins remboursé et confisqué). « Retenu » regroupe les retenues en cours et les sommes confisquées."
      },
      {
        q: 'Pourquoi le statut est-il « En attente » ?',
        a: "Rien n'a encore été collecté sur ce dépôt."
      },
      {
        q: 'Je ne vois aucun dépôt.',
        a: "Aucun dépôt n'est enregistré pour vos biens : l'écran affiche « Aucun dépôt de garantie trouvé »."
      }
    ],
    related: [
      { label: 'Tableau des dépôts', helpId: 'portails.proprietaire.cautions.tableau' },
      { label: 'Mon compte', helpId: 'portails.proprietaire.compte' }
    ],
    keywords: ['caution', 'dépôt de garantie', 'garantie', 'remboursement', 'retenue', 'locataire']
  },
  {
    id: 'portails.proprietaire.cautions.indicateurs',
    kind: 'section',
    title: 'Totaux des dépôts de garantie',
    summary:
      'Quatre cartes résument vos dépôts de garantie : leur nombre, la somme détenue, la somme retenue et la somme libérée.',
    purpose:
      "Elles vous donnent d'un coup d'oeil où en sont les dépôts de vos locataires, sans lire la liste ligne par ligne.",
    howToRead: {
      notes: [
        'Total : le nombre de dépôts de garantie de vos biens.',
        "Total détenu : la somme que l'agence garde pour les locataires (collecté, moins rendu, moins confisqué).",
        'Total retenu : les retenues en cours plus les sommes confisquées.',
        "Total libéré : pour les dépôts au statut « Remboursé » ou « Confisqué », le montant du dépôt moins ce que l'agence détient encore.",
        'Les montants sont en FCFA et portent sur tous vos dépôts, pas seulement sur la page affichée.'
      ]
    },
    faq: [
      {
        q: 'Ces sommes sont-elles dans mes revenus ?',
        a: "Non. Un dépôt de garantie est détenu pour le locataire, il n'entre pas dans vos revenus."
      },
      {
        q: 'Pourquoi « Total libéré » est-il à zéro ?',
        a: "Aucun de vos dépôts n'est encore au statut « Remboursé » ou « Confisqué »."
      },
      {
        q: 'Où voir le détail de chaque dépôt ?',
        a: 'Dans la liste en dessous : la colonne « Montant détenu » et le bouton « Mouvements » donnent le détail.'
      }
    ],
    related: [{ label: 'Dépôts de garantie', helpId: 'portails.proprietaire.cautions' }],
    keywords: ['total détenu', 'total retenu', 'total libéré', 'caution', 'dépôt de garantie']
  },
  {
    id: 'portails.proprietaire.cautions.tableau',
    kind: 'table',
    title: 'Liste des dépôts de garantie',
    summary:
      "Une ligne par dépôt de garantie de vos biens. Vous y voyez le montant prévu, ce que l'agence détient, ce qu'elle a retenu et l'état du dépôt.",
    howToRead: {
      columns: [
        { key: 'propertyAddress', label: 'Propriété', description: 'Adresse du bien loué.' },
        { key: 'tenantName', label: 'Locataire', description: 'Le locataire principal du bail.' },
        { key: 'depositAmount', label: 'Montant du dépôt', description: 'Le montant prévu pour ce dépôt, en FCFA.' },
        {
          key: 'currentHeldAmount',
          label: 'Montant détenu',
          description: "Ce que l'agence garde pour le locataire : collecté, moins rendu, moins confisqué."
        },
        {
          key: 'withheldAmount',
          label: 'Montant retenu',
          description:
            "Retenues en cours plus sommes confisquées. Zéro pour un dépôt intact. Cliquez sur l'en-tête pour trier."
        },
        { key: 'status', label: 'Statut', description: "L'état du dépôt (voir ci-dessous)." },
        {
          key: 'actions',
          label: 'Actions',
          description: "« Mouvements » ouvre l'historique du dépôt."
        }
      ],
      statuses: [
        { value: 'PENDING', label: 'En attente', description: "Rien n'a encore été collecté." },
        {
          value: 'COLLECTED',
          label: 'Collecté',
          description: "Le dépôt est encaissé et aucune retenue ni remboursement n'est enregistré."
        },
        { value: 'HELD', label: 'En retenue', description: 'Une partie du dépôt est mise en retenue.' },
        { value: 'REFUNDED', label: 'Remboursé', description: 'Une somme a été remboursée au locataire.' },
        { value: 'FORFEITED', label: 'Confisqué', description: 'Une somme a été confisquée.' }
      ],
      notes: [
        'Le statut est déduit des montants du dépôt, dans cet ordre : en retenue, puis remboursé, puis confisqué.'
      ]
    },
    steps: [
      { title: "Ouvrir l'historique", detail: 'Cliquez sur « Mouvements » sur la ligne voulue.' },
      { title: 'Exporter', detail: "Le bouton d'export télécharge la liste." }
    ],
    faq: [
      {
        q: 'Pourquoi un dépôt « Remboursé » indique-t-il encore un montant détenu ?',
        a: "Le remboursement peut être partiel. Le montant détenu reste ce que l'agence garde."
      },
      {
        q: 'Qui décide de la retenue ou du remboursement ?',
        a: "L'agence enregistre ces opérations. Vous les consultez ici sans pouvoir les modifier."
      },
      {
        q: 'Les montants sont-ils inclus dans mes revenus ?',
        a: 'Non. Un dépôt de garantie est une somme détenue pour le locataire, pas un revenu.'
      }
    ],
    related: [{ label: 'Historique des mouvements', helpId: 'portails.proprietaire.cautions.mouvements' }],
    keywords: ['caution', 'dépôt', 'retenue', 'remboursé', 'confisqué', 'détenu']
  },
  {
    id: 'portails.proprietaire.cautions.mouvements',
    kind: 'table',
    title: "Historique des mouvements d'un dépôt",
    summary:
      "La liste de toutes les opérations enregistrées sur un dépôt de garantie, de la plus récente à la plus ancienne. Elle s'ouvre avec « Mouvements ».",
    howToRead: {
      columns: [
        {
          key: 'type',
          label: 'Type',
          description: 'Collecte, Mise en retenue, Libération, Remboursement, Confiscation ou Ajustement.'
        },
        { key: 'amount', label: 'Montant', description: "Le montant de l'opération, en FCFA." },
        { key: 'createdAt', label: 'Date', description: "Date et heure de l'enregistrement." },
        { key: 'note', label: 'Note', description: "Le commentaire de l'agence. Un tiret (-) s'il n'y en a pas." },
        { key: 'createdBy', label: 'Créé par', description: "La personne de l'agence qui a enregistré l'opération." }
      ]
    },
    faq: [
      {
        q: 'Que veut dire « Libération » ?',
        a: "Une somme mise en retenue est libérée. Ce libellé vient de l'agence ; en cas de doute, demandez-lui le détail."
      },
      {
        q: 'Pourquoi la fenêtre est-elle vide ?',
        a: "Aucune opération n'est enregistrée sur ce dépôt : « Aucun mouvement trouvé »."
      },
      {
        q: 'Puis-je corriger une opération ?',
        a: "Non, seule l'agence peut le faire."
      }
    ],
    related: [{ label: 'Liste des dépôts', helpId: 'portails.proprietaire.cautions.tableau' }],
    keywords: ['mouvement', 'historique', 'collecte', 'retenue', 'remboursement', 'confiscation']
  },

  // -------------------------------------------------- Maintenance
  {
    id: 'portails.proprietaire.incidents',
    kind: 'page',
    title: 'Maintenance',
    summary:
      "Le suivi des tickets de maintenance ouverts sur vos biens : réparations, pannes, travaux. Vous voyez où en est chaque ticket ; c'est l'agence qui les traite.",
    purpose:
      "Quand un locataire signale un problème ou que l'agence en ouvre un, un ticket est créé. Cet écran vous tient informé sans appeler l'agence. Il ne permet pas de créer un ticket, d'y répondre ni de le clôturer.",
    steps: [
      {
        title: 'Lire les totaux',
        detail:
          '« Total », « Ouverts » (tickets déclarés), « En cours » (en cours ou assignés) et « Résolus » suivent vos filtres.'
      },
      {
        title: 'Chercher et filtrer',
        detail: 'Cherchez un titre ou une propriété, puis filtrez par Statut, Priorité, Catégorie ou Propriété.'
      },
      { title: 'Ouvrir un ticket', detail: 'Cliquez sur « Détails » pour voir sa fiche complète.' },
      { title: 'Rafraîchir', detail: 'Le bouton « Actualiser » recharge la liste.' }
    ],
    consequences: [
      'Cet écran est en lecture seule : vous ne pouvez ni créer ni modifier un ticket.',
      "Le coût d'un ticket n'est pas affiché ici."
    ],
    faq: [
      {
        q: 'Comment signaler une panne dans mon bien ?',
        a: "Pas depuis cet écran : contactez l'agence ou demandez à votre locataire de la signaler depuis son portail."
      },
      {
        q: 'Que compte « Ouverts » ?',
        a: 'Les tickets au statut « Déclaré », pas encore pris en charge.'
      },
      {
        q: 'Pourquoi les totaux changent-ils quand je filtre ?',
        a: 'Ils sont calculés sur les tickets correspondant à vos filtres.'
      }
    ],
    related: [
      { label: 'Tableau des tickets', helpId: 'portails.proprietaire.incidents.tableau' },
      { label: "Fiche d'un ticket", helpId: 'portails.proprietaire.incidents.detail' }
    ],
    keywords: ['maintenance', 'incident', 'panne', 'réparation', 'ticket', 'travaux', 'plomberie', 'électricité']
  },
  {
    id: 'portails.proprietaire.incidents.indicateurs',
    kind: 'section',
    title: 'Totaux des tickets',
    summary: 'Quatre cartes comptent vos tickets de maintenance : le total, les ouverts, les en cours et les résolus.',
    purpose: "Elles montrent en un coup d'oeil combien de tickets attendent l'agence et combien sont réglés.",
    howToRead: {
      notes: [
        'Total : tous les tickets qui correspondent à la recherche et aux filtres.',
        'Ouverts : les tickets au statut « Déclaré », pas encore pris en charge.',
        'En cours : les tickets en cours de traitement ou déjà assignés.',
        'Résolus : les tickets au statut « Résolu ».',
        'Les autres statuts comptent dans « Total » seulement.',
        'Les chiffres sont calculés sur tous les tickets correspondants, pas seulement sur la page affichée.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi la somme des trois cartes est-elle inférieure au total ?',
        a: "Un ticket qui n'est ni déclaré, ni en cours, ni résolu est compté dans « Total » seulement."
      },
      {
        q: 'Les chiffres changent quand je filtre. Est-ce normal ?',
        a: 'Oui, les cartes suivent la recherche et les filtres que vous avez choisis.'
      },
      {
        q: 'Où voir le coût des tickets ?',
        a: "Nulle part sur cet écran : le coût d'un ticket n'est pas affiché."
      }
    ],
    related: [{ label: 'Maintenance', helpId: 'portails.proprietaire.incidents' }],
    keywords: ['ouverts', 'en cours', 'résolus', 'tickets', 'maintenance']
  },
  {
    id: 'portails.proprietaire.incidents.tableau',
    kind: 'table',
    title: 'Liste des tickets',
    summary:
      'Chaque ligne est un ticket de maintenance sur un de vos biens, avec sa catégorie, sa priorité, son statut et sa date.',
    howToRead: {
      columns: [
        { key: 'propertyAddress', label: 'Propriété', description: 'Adresse du bien concerné.' },
        { key: 'title', label: 'Titre', description: 'Le résumé du problème.' },
        { key: 'category', label: 'Catégorie', description: 'Plomberie, Électricité, Climatisation ou Autre.' },
        { key: 'priority', label: 'Priorité', description: 'Basse, Moyenne, Haute ou Urgente.' },
        { key: 'status', label: 'Statut', description: "L'avancement du ticket (voir ci-dessous)." },
        { key: 'createdAt', label: 'Date', description: 'La date de création du ticket.' },
        { key: 'actions', label: 'Actions', description: '« Détails » ouvre la fiche du ticket.' }
      ],
      statuses: [
        { value: 'DECLARED', label: 'Déclaré', description: 'Le problème est signalé, pas encore pris en charge.' },
        {
          value: 'ASSIGNED',
          label: 'Assigné',
          description: 'Le ticket est confié à une personne ou à un prestataire.'
        },
        { value: 'IN_PROGRESS', label: 'En cours', description: 'Le traitement a commencé.' },
        { value: 'RESOLVED', label: 'Résolu', description: 'Le problème est réglé.' },
        { value: 'CANCELED', label: 'Annulé', description: 'Le ticket a été annulé.' }
      ],
      notes: ['Les tickets les plus récents apparaissent en premier.']
    },
    steps: [
      { title: 'Chercher', detail: 'Tapez un titre ou une adresse.' },
      { title: 'Filtrer', detail: 'Statut, Priorité, Catégorie ou Propriété.' },
      { title: 'Ouvrir', detail: 'Cliquez sur « Détails ».' },
      { title: 'Exporter', detail: "Le bouton d'export télécharge la liste, filtres compris." }
    ],
    faq: [
      {
        q: 'Je ne vois pas un ticket que je connais.',
        a: "Vérifiez vos filtres. Seuls les tickets de vos propres biens s'affichent."
      },
      {
        q: 'Qui change le statut ?',
        a: "L'agence, au fil du traitement."
      },
      {
        q: "Pourquoi aucun coût n'apparaît-il ?",
        a: 'Les coûts de maintenance ne sont pas affichés dans cet écran.'
      }
    ],
    related: [{ label: "Fiche d'un ticket", helpId: 'portails.proprietaire.incidents.detail' }],
    keywords: ['ticket', 'panne', 'priorité', 'urgent', 'statut', 'maintenance']
  },
  {
    id: 'portails.proprietaire.incidents.detail',
    kind: 'section',
    title: 'Détails du ticket',
    summary:
      "La fiche complète d'un ticket : informations, pièces jointes, commentaires et historique des statuts. Elle s'ouvre avec « Détails ».",
    howToRead: {
      notes: [
        'Informations : titre, statut, catégorie, priorité, propriété, date de création, localisation éventuelle et description.',
        "« Vendeur assigné » : le prestataire désigné, avec son téléphone s'il est connu, lorsqu'il y en a un. « Utilisateur assigné » : la personne de l'agence chargée du ticket, ou « Non assigné ».",
        '« Pièces jointes » : les fichiers liés au ticket, à télécharger.',
        '« Commentaires » : les messages échangés sur le ticket, avec leur auteur et leur date.',
        "« Historique des statuts » : chaque changement, de l'ancien statut vers le nouveau, avec la date, une note éventuelle et la personne."
      ]
    },
    faq: [
      {
        q: "Pourquoi l'historique affiche-t-il des mots en anglais (DECLARED, IN_PROGRESS) ?",
        a: "L'historique reprend les statuts tels que l'application les enregistre : DECLARED = Déclaré, ASSIGNED = Assigné, IN_PROGRESS = En cours, RESOLVED = Résolu, CANCELED = Annulé."
      },
      {
        q: 'Puis-je écrire un commentaire ?',
        a: 'Non, cette fenêtre est en lecture seule.'
      },
      {
        q: 'Où trouver le coût de la réparation ?',
        a: "Il n'est pas affiché ici. Demandez-le à l'agence."
      }
    ],
    related: [{ label: 'Liste des tickets', helpId: 'portails.proprietaire.incidents.tableau' }],
    keywords: ['ticket', 'détail', 'commentaire', 'pièce jointe', 'historique', 'prestataire']
  },

  // -------------------------------------------------- Documents
  {
    id: 'portails.proprietaire.documents',
    kind: 'page',
    title: 'Documents',
    summary:
      'Les documents de location liés à vos biens : contrats de bail, avenants, quittances, reçus de dépôt et relevés. Vous pouvez les chercher, les filtrer et les télécharger.',
    purpose:
      "L'agence produit ces documents pour la gestion de vos biens. Vous retrouvez ici ceux rattachés à un bail, à une échéance ou à un paiement de vos biens, sans les demander à l'agence.",
    steps: [
      { title: 'Chercher', detail: 'Tapez un titre ou un numéro de document.' },
      { title: 'Filtrer', detail: 'Choisissez un ou plusieurs Types, ou une Propriété.' },
      {
        title: 'Lire la liste',
        detail: "Les documents sont rangés en cartes par type, avec leur statut, le bien et la date d'émission."
      },
      { title: 'Télécharger', detail: 'Cliquez sur « Télécharger » sur la ligne du document.' },
      { title: 'Parcourir', detail: 'Si la liste est longue, utilisez la pagination en bas de page.' }
    ],
    consequences: [
      'Le téléchargement enregistre le fichier sur votre appareil ; il ne modifie rien.',
      "Seuls les documents de vos propres biens sont visibles. Les documents annulés n'apparaissent pas."
    ],
    faq: [
      {
        q: 'Que veut dire « Brouillon » ?',
        a: "Le document n'est pas encore définitif. « Final » désigne un document validé ; un document annulé n'est pas affiché."
      },
      {
        q: 'Le téléchargement échoue.',
        a: "Un message d'erreur s'affiche. Réessayez, puis contactez l'agence si cela persiste : le fichier a pu ne pas être enregistré."
      },
      {
        q: 'Où sont les documents de mon patrimoine (titre de propriété, plans) ?',
        a: "Dans la fiche d'un bien de « Mon patrimoine », onglet « Documents », si votre agence a activé cette vue."
      }
    ],
    related: [{ label: "Fiche d'un bien du patrimoine", helpId: 'portails.proprietaire.patrimoine-detail' }],
    keywords: ['document', 'contrat', 'quittance', 'reçu', 'avenant', 'relevé', 'télécharger', 'pdf']
  },
  {
    id: 'portails.proprietaire.documents.liste',
    kind: 'section',
    title: 'Documents par type',
    summary:
      'Les documents de la page sont regroupés par type, chaque type ayant sa carte avec le nombre de documents. Chaque ligne affiche le titre, le statut, le bien et la date.',
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: 'Document pas encore définitif.' },
        { value: 'FINAL', label: 'Final', description: 'Document validé.' },
        {
          value: 'VOID',
          label: 'Annulé',
          description: 'Ce statut existe, mais ces documents ne sont pas affichés dans le portail.'
        }
      ],
      notes: [
        'Types : Contrat de bail, Avenant, Quittance de loyer, Quittance, Reçu de dépôt, Relevé, Autre.',
        'Le nombre dans la pastille est celui de la page affichée, pas du total.',
        "« Émis le » est la date d'émission du document ; elle peut manquer."
      ]
    },
    faq: [
      {
        q: 'Pourquoi un type est-il absent ?',
        a: "Aucun document de ce type n'existe pour vos biens, ou il se trouve sur une autre page ou hors de vos filtres."
      },
      {
        q: 'Quelle différence entre « Quittance de loyer » et « Quittance » ?',
        a: "Ce sont deux types distincts dans l'application. En cas de doute, ouvrez le document."
      },
      {
        q: "Un document n'a pas de titre.",
        a: "L'écran affiche alors son numéro ou un identifiant court."
      }
    ],
    related: [{ label: 'Documents', helpId: 'portails.proprietaire.documents' }],
    keywords: ['type de document', 'brouillon', 'final', 'quittance', 'contrat']
  },

  // -------------------------------------------------- Rapports
  {
    id: 'portails.proprietaire.rapports',
    kind: 'page',
    title: 'Rapports',
    summary:
      "Trois formulaires pour télécharger un fichier : un rapport de revenus, un rapport d'occupation, ou un export de données (paiements, échéances, baux).",
    purpose:
      "Ces fichiers servent à votre comptabilité ou à vos dossiers. Ils portent uniquement sur vos biens. Rien n'est envoyé à quelqu'un : le fichier se télécharge sur votre appareil.",
    steps: [
      {
        title: 'Choisir le formulaire',
        detail: "« Rapport de revenus », « Rapport d'occupation » ou « Export de données »."
      },
      {
        title: 'Remplir les champs',
        detail: "Les champs marqués d'une obligation doivent être remplis ; « optionnel » peut rester vide."
      },
      { title: 'Générer', detail: 'Cliquez sur « Générer le rapport » (ou « Exporter les données »).' },
      {
        title: 'Récupérer le fichier',
        detail: "Le navigateur télécharge le fichier ; un message confirme la réussite ou l'échec."
      }
    ],
    consequences: [
      'Générer un rapport ne modifie aucune donnée.',
      'Les rapports se téléchargent sans aperçu : ouvrez le fichier depuis vos téléchargements.'
    ],
    faq: [
      {
        q: "Pourquoi n'ai-je rien reçu ?",
        a: "Un message d'erreur s'affiche si la génération échoue, par exemple si aucun bien n'est rattaché à votre compte."
      },
      {
        q: 'Quel format choisir ?',
        a: 'PDF pour lire ou imprimer ; CSV ou Excel pour travailler les chiffres dans un tableur.'
      },
      {
        q: 'Les rapports contiennent-ils les biens des autres propriétaires ?',
        a: 'Non, uniquement les vôtres.'
      }
    ],
    related: [
      { label: 'Rapport de revenus', helpId: 'portails.proprietaire.rapports.revenus' },
      { label: "Rapport d'occupation", helpId: 'portails.proprietaire.rapports.occupation' },
      { label: 'Export de données', helpId: 'portails.proprietaire.rapports.export' }
    ],
    keywords: ['rapport', 'export', 'pdf', 'excel', 'csv', 'revenus', 'occupation', 'télécharger']
  },
  {
    id: 'portails.proprietaire.rapports.revenus',
    kind: 'section',
    title: 'Rapport de revenus',
    summary:
      'Un fichier qui totalise les loyers encaissés sur la période choisie, par bien et par mois. Il se télécharge en PDF, CSV ou Excel.',
    howToRead: {
      notes: [
        'Période : obligatoire, du jour de début au jour de fin. Seuls les paiements réussis de cette période sont comptés.',
        'Propriété : optionnelle. Vide, le rapport couvre toutes vos propriétés.',
        'Format : PDF (par défaut), CSV ou Excel.',
        'Le fichier contient le total des revenus, le nombre de paiements, le détail par bien et par mois.',
        "Un dépôt de garantie encaissé n'est pas un revenu : il n'est pas compté."
      ]
    },
    steps: [
      { title: 'Période', detail: 'Choisissez la date de début et la date de fin.' },
      { title: 'Propriété', detail: 'Au besoin, limitez le rapport à un bien.' },
      { title: 'Format', detail: 'PDF, CSV ou Excel.' },
      { title: 'Générer', detail: 'Cliquez sur « Générer le rapport ».' }
    ],
    consequences: ['Le fichier est nommé « revenue-report » suivi de la date du jour.'],
    faq: [
      {
        q: 'Le total ne correspond pas à mon relevé « Mon compte ».',
        a: 'Le rapport compte les loyers encaissés sur la période, sans honoraires ni dépenses. Le compte, lui, tient compte des déductions et des reversements.'
      },
      {
        q: 'Le formulaire refuse de partir.',
        a: 'La période et le format sont obligatoires.'
      },
      {
        q: 'Un bien choisi donne une erreur.',
        a: 'Seuls vos propres biens sont acceptés ; un bien hors de votre liste est traité comme introuvable.'
      }
    ],
    related: [{ label: 'Revenus', to: '/owner/revenues' }],
    keywords: ['revenus', 'loyers encaissés', 'rapport financier', 'période']
  },
  {
    id: 'portails.proprietaire.rapports.occupation',
    kind: 'section',
    title: "Rapport d'occupation",
    summary:
      "Un fichier qui dit, à la date choisie, quels biens étaient loués ou disponibles et le taux d'occupation. Il se télécharge en PDF, CSV ou Excel.",
    howToRead: {
      notes: [
        "Date : obligatoire, aujourd'hui par défaut. Un bien est « Loué » s'il avait un bail actif ou terminé couvrant cette date, sinon « Disponible ».",
        'Format : PDF (par défaut), CSV ou Excel.',
        "Le fichier donne le nombre de biens, de biens loués et disponibles, le taux d'occupation, et pour chaque bien le bail en cours (numéro, locataire, dates)."
      ]
    },
    steps: [
      { title: 'Date', detail: 'Choisissez la date à examiner (passée ou présente).' },
      { title: 'Format', detail: 'PDF, CSV ou Excel.' },
      { title: 'Générer', detail: 'Cliquez sur « Générer le rapport ».' }
    ],
    consequences: ['Le rapport ne porte pas sur une propriété précise : il couvre tous vos biens.'],
    faq: [
      {
        q: "Peut-on voir l'occupation à une date passée ?",
        a: "Oui : choisissez cette date. Le résultat reflète les baux de l'époque, pas l'état actuel du bien."
      },
      {
        q: "Comment est calculé le taux d'occupation ?",
        a: 'Nombre de biens loués à la date, divisé par le nombre total de vos biens.'
      },
      {
        q: "Pourquoi un bien est-il « Disponible » alors qu'il est occupé ?",
        a: "Aucun bail actif ou terminé ne couvre la date choisie. Vérifiez la date ou le bail avec l'agence."
      }
    ],
    related: [{ label: 'Rapport de revenus', helpId: 'portails.proprietaire.rapports.revenus' }],
    keywords: ['occupation', "taux d'occupation", 'loué', 'disponible', 'vacance']
  },
  {
    id: 'portails.proprietaire.rapports.export',
    kind: 'section',
    title: 'Export de données',
    summary:
      'Un fichier CSV ou Excel contenant vos paiements, vos échéances ou vos baux, que vous pouvez limiter par période et par propriété.',
    howToRead: {
      notes: [
        'Type de données : obligatoire, « Paiements », « Échéances » ou « Baux ».',
        'Format : Excel (par défaut) ou CSV. Pas de PDF pour cet export.',
        "Période et Propriété : optionnelles. Vides, l'export couvre toutes les dates et tous vos biens."
      ]
    },
    steps: [
      { title: 'Type de données', detail: 'Paiements, Échéances ou Baux.' },
      { title: 'Format', detail: 'Excel ou CSV.' },
      { title: 'Limiter', detail: 'Au besoin, choisissez une période et une propriété.' },
      { title: 'Exporter', detail: 'Cliquez sur « Exporter les données ».' }
    ],
    consequences: ["Le fichier est nommé d'après le type choisi, suivi de « export » et de la date du jour."],
    faq: [
      {
        q: 'À quoi sert la période pour les baux ?',
        a: "À confirmer : l'écran la propose pour les trois types, mais son effet sur les baux n'est pas détaillé."
      },
      {
        q: 'Puis-je ouvrir le CSV dans Excel ?',
        a: "Oui. Choisissez Excel si vous préférez un fichier prêt à l'emploi."
      },
      {
        q: 'Les données sont-elles limitées à mes biens ?',
        a: 'Oui, toujours.'
      }
    ],
    related: [
      { label: 'Paiements', to: '/owner/payments' },
      { label: 'Échéances', to: '/owner/installments' }
    ],
    keywords: ['export', 'excel', 'csv', 'paiements', 'échéances', 'baux', 'données']
  },

  // -------------------------------------------------- Préférences
  {
    id: 'portails.proprietaire.preferences',
    kind: 'page',
    title: 'Préférences',
    summary:
      "Un seul réglage pour le moment : recevoir ou non les newsletters et communications de votre agence. Il s'enregistre dès que vous cliquez.",
    purpose:
      'Votre agence peut vous écrire pour des actualités, conseils ou offres. Ce réglage dit si vous acceptez ces messages. Il ne concerne pas les messages liés à la gestion de vos biens.',
    steps: [
      { title: 'Ouvrir la page', detail: 'Le bouton affiche « Oui » ou « Non » selon votre choix actuel.' },
      { title: 'Changer', detail: "Cliquez sur l'interrupteur pour passer de « Non » à « Oui », ou l'inverse." },
      {
        title: 'Vérifier',
        detail: 'Un message confirme : « Vous recevrez les newsletters. » ou « Vous ne recevrez plus les newsletters. »'
      }
    ],
    consequences: [
      "Le changement s'enregistre immédiatement, sans bouton « Enregistrer ».",
      "Avec « Oui », l'agence peut vous inclure dans ses envois de newsletter à ses propriétaires. Avec « Non », vous n'y figurez pas.",
      "Vous pouvez changer d'avis à tout moment."
    ],
    faq: [
      {
        q: 'Cela change-t-il les messages sur mes loyers ou mes biens ?',
        a: 'À confirmer : ce réglage ne porte que sur la newsletter. Il ne désactive pas les messages de gestion.'
      },
      {
        q: 'Je ne vois pas la confirmation.',
        a: "Un message d'erreur s'affiche si l'enregistrement échoue. Réessayez."
      },
      {
        q: 'Qui voit mon choix ?',
        a: "Votre agence, qui s'en sert pour établir la liste de ses envois."
      }
    ],
    related: [{ label: 'Recevoir la newsletter', helpId: 'portails.proprietaire.preferences.newsletter' }],
    keywords: ['préférences', 'newsletter', 'communications', 'abonnement', 'consentement']
  },
  {
    id: 'portails.proprietaire.preferences.newsletter',
    kind: 'section',
    title: 'Recevoir la newsletter',
    summary:
      'Un interrupteur « Oui » / « Non » qui autorise votre agence à vous envoyer ses newsletters et communications (actualités, conseils, offres).',
    howToRead: {
      notes: [
        "« Oui » : vous acceptez de recevoir ces messages. « Non » : vous les refusez (valeur par défaut tant que vous n'avez rien choisi)."
      ]
    },
    consequences: [
      "L'enregistrement est immédiat et réversible.",
      "Votre choix est conservé par l'agence ; la liste de ses envois de newsletter ne retient que les propriétaires qui ont dit « Oui »."
    ],
    faq: [
      {
        q: 'Que se passe-t-il si je dis « Non » ?',
        a: "L'agence ne vous inclut plus dans ses envois de newsletter."
      },
      {
        q: 'Combien de messages vais-je recevoir ?',
        a: "Cela dépend de votre agence ; l'écran ne l'indique pas."
      },
      {
        q: 'Puis-je choisir le canal (e-mail, WhatsApp) ?',
        a: 'Non, ce réglage ne le permet pas.'
      }
    ],
    keywords: ['newsletter', 'consentement', 'e-mail', 'communications']
  },

  // -------------------------------------------------- Patrimoine
  {
    id: 'portails.proprietaire.patrimoine',
    kind: 'page',
    title: 'Mon patrimoine',
    summary:
      "La vue d'ensemble de vos biens : valeur estimée de votre part, plus-value latente, rendements et emprunts restants. Les informations affichées dépendent de ce que votre agence a choisi de vous montrer.",
    purpose:
      "Cet écran vous aide à mesurer ce que valent vos biens et ce qu'ils rapportent. Il est en lecture seule : les valorisations, emprunts et travaux sont saisis par l'agence.",
    steps: [
      {
        title: 'Lire les cartes',
        detail:
          '« Nombre de biens » est toujours là. « Valeur estimée (votre part) », « Plus-value latente » et « Capital restant dû » apparaissent si votre agence les a activés.'
      },
      {
        title: 'Parcourir « Vos biens »',
        detail:
          'Chaque ligne donne le bien, votre quote-part, et selon les réglages : valorisation, plus-value, rendements, capital restant dû.'
      },
      { title: 'Ouvrir un bien', detail: 'Cliquez sur « Voir le détail » pour la fiche du bien.' },
      { title: 'Rafraîchir', detail: 'Le bouton « Actualiser » recharge la vue.' }
    ],
    consequences: [
      'Cet écran est en lecture seule.',
      "Si l'agence masque la vue patrimoine, l'écran affiche « Vue indisponible »."
    ],
    faq: [
      {
        q: 'Pourquoi ne vois-je pas les rendements ou les emprunts ?',
        a: "Votre agence choisit ce qu'elle vous montre (valorisation, rendement, emprunts, travaux, documents). Demandez-lui de l'activer."
      },
      {
        q: 'Que veut dire « Non renseigné » ?',
        a: "L'information n'a pas été saisie par l'agence, par exemple aucune valorisation ou aucun prix d'acquisition. Ce n'est pas zéro."
      },
      {
        q: 'Que veut dire « Bien entier » dans « Quote-part » ?',
        a: 'Vous détenez le bien en totalité. Sinon, un pourcentage indique votre part.'
      },
      {
        q: 'Comment lire « Plus-value latente » ?',
        a: "C'est la valeur estimée moins le coût de revient (prix d'achat et dépenses capitalisées). Elle n'est pas encaissée tant que le bien n'est pas vendu."
      }
    ],
    related: [
      { label: 'Tableau « Vos biens »', helpId: 'portails.proprietaire.patrimoine.biens' },
      { label: "Fiche d'un bien", helpId: 'portails.proprietaire.patrimoine-detail' }
    ],
    keywords: ['patrimoine', 'valeur', 'valorisation', 'plus-value', 'rendement', 'emprunt', 'quote-part']
  },
  {
    id: 'portails.proprietaire.patrimoine.indicateurs',
    kind: 'section',
    title: 'Chiffres clés du patrimoine',
    summary:
      "Jusqu'à quatre cartes résument vos biens : leur nombre, la valeur estimée de votre part, la plus-value latente et le capital restant dû. Votre agence choisit lesquelles vous voyez.",
    purpose: "Elles donnent une vue rapide de ce que valent vos biens et de ce qu'il vous reste à rembourser.",
    howToRead: {
      notes: [
        'Nombre de biens : le nombre de biens de votre patrimoine. Cette carte est toujours affichée.',
        "Valeur estimée (votre part) : la somme des dernières valorisations de vos biens, chacune ramenée à votre quote-part. « Non renseigné » si aucun bien n'a de valorisation.",
        'Plus-value latente : la somme des plus-values connues, ramenées à votre quote-part. « Non renseigné » si aucune ne peut être calculée.',
        'Capital restant dû : la somme du capital restant des emprunts en cours, ramenée à votre quote-part.',
        'Les trois dernières cartes apparaissent seulement si votre agence les a activées (valorisation pour les deux premières, emprunts pour la dernière).',
        'Les montants sont en FCFA.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi ne vois-je que « Nombre de biens » ?',
        a: "Votre agence n'a activé ni l'affichage de la valorisation ni celui des emprunts. Demandez-lui de le faire."
      },
      {
        q: 'Que veut dire « Non renseigné » ?',
        a: "L'agence n'a pas saisi l'information, par exemple aucune valorisation. Ce n'est pas zéro."
      },
      {
        q: "La plus-value latente est-elle de l'argent reçu ?",
        a: "Non. C'est un écart estimé, qui n'est encaissé que si le bien est vendu."
      }
    ],
    related: [{ label: 'Mon patrimoine', helpId: 'portails.proprietaire.patrimoine' }],
    keywords: ['valeur estimée', 'plus-value latente', 'capital restant dû', 'nombre de biens', 'patrimoine']
  },
  {
    id: 'portails.proprietaire.patrimoine.biens',
    kind: 'table',
    title: 'Vos biens (patrimoine)',
    summary:
      'Une ligne par bien : votre quote-part, puis selon les réglages de votre agence la dernière valorisation, la plus-value, les rendements et le capital restant dû.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Bien', description: 'Le nom du bien et son adresse.' },
        {
          key: 'ownerSharePercent',
          label: 'Quote-part',
          description: 'Votre part en pourcentage, ou « Bien entier » si vous détenez tout.'
        },
        {
          key: 'valuation',
          label: 'Dernière valorisation',
          description: 'La plus récente valeur estimée du bien, en FCFA ; un tiret (—) si aucune.'
        },
        {
          key: 'latentCapitalGain',
          label: 'Plus-value latente',
          description: "Valeur estimée moins coût de revient. « Non renseigné » si l'une des deux manque."
        },
        {
          key: 'grossYield',
          label: 'Rendement brut',
          description: 'Loyers annuels divisés par la valeur estimée.'
        },
        {
          key: 'netYield',
          label: 'Rendement net',
          description: 'Loyers annuels moins charges annuelles, divisés par la valeur estimée.'
        },
        {
          key: 'netNetYield',
          label: 'Rendement net-net',
          description:
            "Loyers moins charges et mensualités d'emprunt des 12 prochains mois, divisés par le coût de revient. Affiché seulement si les emprunts sont visibles."
        },
        {
          key: 'loanSummary',
          label: 'Capital restant dû',
          description: "Ce qu'il reste à rembourser sur les emprunts actifs du bien."
        }
      ],
      notes: [
        "Les colonnes de valorisation, de rendement et d'emprunt n'apparaissent que si votre agence les a activées.",
        'Les rendements sont calculés sur la valeur du bien entier ; les totaux des cartes appliquent votre quote-part.',
        "Un rendement « Non renseigné » signifie qu'aucune valeur estimée n'est enregistrée."
      ]
    },
    steps: [
      { title: 'Ouvrir un bien', detail: 'Cliquez sur « Voir le détail » en bout de ligne.' },
      { title: 'Exporter', detail: "Le bouton d'export télécharge la liste." }
    ],
    faq: [
      {
        q: 'Pourquoi mon rendement est-il « Non renseigné » ?',
        a: "Sans valeur estimée, le rendement ne peut pas être calculé. L'agence doit saisir une valorisation."
      },
      {
        q: 'Le rendement tient-il compte de ma quote-part ?',
        a: 'Non, il est calculé sur le bien entier. Les cartes de totaux, elles, appliquent votre quote-part.'
      },
      {
        q: 'Un bien manque dans la liste.',
        a: "Seuls les biens qui vous sont rattachés apparaissent. Demandez à l'agence de vérifier la propriété."
      }
    ],
    related: [{ label: 'Mon patrimoine', helpId: 'portails.proprietaire.patrimoine' }],
    keywords: ['biens', 'rendement', 'valorisation', 'plus-value', 'quote-part', 'capital restant dû']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail',
    kind: 'page',
    title: "Fiche d'un bien du patrimoine",
    summary:
      "Tout ce que l'agence a enregistré sur un de vos biens : votre quote-part, sa valorisation, ses rendements, ses emprunts, ses travaux et ses documents. Les blocs affichés dépendent des réglages de votre agence.",
    purpose:
      "Vous suivez ici la valeur et la rentabilité d'un bien précis. L'écran est en lecture seule : l'agence saisit et met à jour ces données.",
    steps: [
      {
        title: 'Vérifier votre part',
        detail: 'La carte « Quote-part » dit « Bien entier » ou le pourcentage que vous détenez.'
      },
      {
        title: 'Lire la valorisation et le rendement',
        detail: 'Cartes « Valorisation » et « Rendement », si elles sont visibles.'
      },
      {
        title: 'Ouvrir un onglet',
        detail: '« Historique des valorisations », « Emprunts », « Travaux » ou « Documents ».'
      },
      { title: 'Télécharger un document', detail: 'Dans « Documents », cliquez sur « Télécharger ».' },
      { title: 'Revenir', detail: 'Le bouton « Retour » ramène à « Mon patrimoine ».' }
    ],
    consequences: [
      'Cet écran est en lecture seule.',
      "Télécharger un document l'enregistre sur votre appareil et ne modifie rien."
    ],
    faq: [
      {
        q: 'Pourquoi un onglet manque-t-il ?',
        a: "Votre agence a choisi de ne pas l'afficher, ou il n'y a rien à montrer (l'historique des valorisations n'apparaît que s'il en existe)."
      },
      {
        q: 'Que signifie « Vue indisponible » ?',
        a: "La vue patrimoine est masquée par l'agence, ou le bien ne vous appartient pas."
      },
      {
        q: 'Mes modifications ne sont pas prises en compte.',
        a: "Vous ne pouvez rien modifier ici ; la saisie se fait par l'agence."
      }
    ],
    related: [{ label: 'Mon patrimoine', helpId: 'portails.proprietaire.patrimoine' }],
    keywords: ['bien', 'fiche', 'patrimoine', 'valorisation', 'rendement', 'emprunt', 'travaux']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.quote-part',
    kind: 'section',
    title: 'Quote-part',
    summary: 'Votre part dans ce bien : « Bien entier » si vous le détenez en totalité, sinon un pourcentage.',
    howToRead: {
      notes: [
        'Cette part sert à calculer les totaux de la page « Mon patrimoine » (valeur estimée, plus-value, capital restant dû).',
        "Les montants de la fiche d'un bien portent sur le bien entier, pas sur votre part."
      ]
    },
    faq: [
      { q: 'Ma quote-part est fausse.', a: "Signalez-le à l'agence : c'est elle qui l'enregistre." },
      { q: 'Que veut dire « Bien entier » ?', a: 'Vous détenez 100 % du bien.' },
      {
        q: 'Mes revenus sont-ils proportionnels à cette part ?',
        a: 'À confirmer auprès de votre agence : cet écran ne détaille pas la répartition des loyers.'
      }
    ],
    keywords: ['quote-part', 'indivision', 'part', 'copropriété']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.valorisation',
    kind: 'section',
    title: 'Valorisation',
    summary:
      "La dernière valeur estimée du bien, sa date, le prix d'acquisition et la plus-value latente. Visible si votre agence a activé la valorisation.",
    howToRead: {
      notes: [
        '« Valeur estimée » : la valeur la plus récente enregistrée, en FCFA.',
        '« Valorisée le » : la date de cette estimation.',
        "« Prix d'acquisition » : ce que le bien a coûté ; « Non renseigné » s'il n'est pas saisi.",
        "« Plus-value latente » : valeur estimée moins coût de revient. « Non renseigné » si le prix d'acquisition est inconnu."
      ]
    },
    faq: [
      {
        q: 'Pourquoi « Aucune valorisation enregistrée » ?',
        a: "L'agence n'a pas encore saisi d'estimation pour ce bien."
      },
      {
        q: 'La plus-value est-elle un gain réel ?',
        a: 'Non, elle est « latente » : elle ne devient un gain que si le bien est vendu à ce prix.'
      },
      {
        q: 'Qui estime la valeur ?',
        a: "L'agence l'enregistre ; l'historique indique la méthode (Manuelle, Estimation de marché ou Expertise)."
      }
    ],
    keywords: ['valorisation', 'valeur estimée', 'plus-value', "prix d'acquisition"]
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.rendement',
    kind: 'section',
    title: 'Rendement',
    summary:
      'Les rendements du bien en pourcentage, avec ses loyers et charges annuels. Visible si votre agence a activé les rendements.',
    howToRead: {
      notes: [
        '« Brut » : loyers annuels divisés par la valeur estimée.',
        '« Net » : (loyers annuels moins charges annuelles) divisés par la valeur estimée.',
        "« Net-Net » : après aussi les mensualités d'emprunt des 12 prochains mois, rapporté au coût de revient. Affiché seulement si les emprunts sont visibles.",
        "« Loyer annuel » : somme des loyers des baux actifs du bien, ramenée à l'année. « Charges annuelles » : les dépenses de l'année.",
        '« Non renseigné » : le calcul est impossible, par exemple sans valeur estimée.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi ces rendements changent-ils ?',
        a: 'Ils suivent les baux actifs, les charges et la dernière valorisation enregistrés.'
      },
      {
        q: 'Mes chiffres paraissent bas.',
        a: "Vérifiez avec l'agence la valeur estimée et les charges enregistrées : ils entrent directement dans le calcul."
      },
      {
        q: 'Un rendement est-il garanti ?',
        a: "Non, c'est un calcul à partir des données enregistrées, pas une promesse."
      }
    ],
    keywords: ['rendement brut', 'rendement net', 'net-net', 'rentabilité', 'loyer annuel']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.valorisations',
    kind: 'section',
    title: 'Historique des valorisations',
    summary:
      "La liste des estimations successives du bien : date, valeur estimée et méthode. Cet onglet n'apparaît que s'il existe au moins une estimation.",
    howToRead: {
      columns: [
        { key: 'valuatedAt', label: 'Date', description: "La date de l'estimation." },
        { key: 'estimatedValue', label: 'Valeur estimée', description: 'La valeur estimée à cette date, en FCFA.' },
        { key: 'method', label: 'Méthode', description: 'Manuelle, Estimation de marché ou Expertise.' }
      ]
    },
    faq: [
      { q: "Quelle est l'estimation retenue ?", a: 'La plus récente, affichée dans la carte « Valorisation ».' },
      {
        q: 'Que veut dire « Expertise » ?',
        a: "La valeur provient d'une expertise, non d'une estimation manuelle ou de marché."
      },
      { q: 'Peut-on ajouter une estimation ?', a: "Pas ici : seule l'agence peut le faire." }
    ],
    keywords: ['historique', 'valorisation', 'expertise', 'estimation']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.emprunts',
    kind: 'section',
    title: 'Emprunts',
    summary:
      'Les emprunts rattachés au bien : prêteur, capital, capital restant dû, taux, mensualité, dates et statut. Visible si votre agence a activé les emprunts.',
    howToRead: {
      columns: [
        { key: 'lender', label: 'Prêteur', description: "L'établissement qui a prêté." },
        { key: 'capitalAmount', label: 'Capital emprunté', description: 'La somme empruntée au départ.' },
        { key: 'remainingCapital', label: 'Capital restant dû', description: "Ce qu'il reste à rembourser." },
        { key: 'interestRate', label: 'Taux', description: "Le taux d'intérêt, en pourcentage." },
        { key: 'monthlyPayment', label: 'Mensualité', description: 'Le montant remboursé chaque mois.' },
        { key: 'startDate', label: 'Début', description: 'La date de début du prêt.' },
        { key: 'endDate', label: 'Fin', description: 'La date de fin prévue.' },
        { key: 'status', label: 'Statut', description: 'Actif, Clôturé ou Défaillant.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Le prêt est en cours de remboursement.' },
        { value: 'CLOSED', label: 'Clôturé', description: 'Le prêt est soldé ou terminé.' },
        { value: 'DEFAULTED', label: 'Défaillant', description: 'Le prêt est en défaut de paiement.' }
      ],
      notes: ['Les cartes de totaux ne comptent que les emprunts « Actif ».']
    },
    faq: [
      { q: "L'onglet dit « Aucun emprunt enregistré ».", a: "Aucun prêt n'a été saisi pour ce bien par l'agence." },
      { q: 'Où voir le total pour tous mes biens ?', a: 'Dans « Mon patrimoine », carte « Capital restant dû ».' },
      {
        q: "Les mensualités sont-elles prélevées par l'agence ?",
        a: "L'écran ne le dit pas : il ne fait que consigner les données du prêt."
      }
    ],
    keywords: ['emprunt', 'prêt', 'crédit', 'mensualité', 'capital restant dû', 'banque']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.travaux',
    kind: 'section',
    title: 'Travaux',
    summary:
      'Les programmes de travaux du bien : libellé, statut, dates et coûts estimé et réel. Visible si votre agence a activé les travaux.',
    howToRead: {
      columns: [
        { key: 'title', label: 'Travaux', description: 'Le libellé du programme.' },
        { key: 'status', label: 'Statut', description: 'Prévu, En cours, Terminé ou Annulé.' },
        {
          key: 'plannedDate',
          label: 'Date prévue',
          description: 'Quand les travaux sont prévus ; un tiret (—) si inconnue.'
        },
        {
          key: 'completedDate',
          label: 'Date de fin',
          description: "Quand ils se sont terminés ; un tiret (—) s'ils sont en cours."
        },
        { key: 'estimatedCost', label: 'Coût estimé', description: 'Le budget prévu, en FCFA, ou « Non renseigné ».' },
        { key: 'actualCost', label: 'Coût réel', description: 'Le coût final, en FCFA, ou « Non renseigné ».' }
      ],
      statuses: [
        { value: 'PLANNED', label: 'Prévu', description: 'Les travaux sont planifiés.' },
        { value: 'IN_PROGRESS', label: 'En cours', description: 'Les travaux ont commencé.' },
        { value: 'COMPLETED', label: 'Terminé', description: 'Les travaux sont finis.' },
        { value: 'CANCELLED', label: 'Annulé', description: 'Les travaux sont abandonnés.' }
      ]
    },
    steps: [
      { title: 'Chercher', detail: 'Tapez un libellé dans la recherche.' },
      { title: 'Filtrer', detail: 'Filtrez par Statut.' }
    ],
    faq: [
      {
        q: 'Pourquoi le coût réel est-il « Non renseigné » ?',
        a: "Les travaux ne sont pas terminés ou l'agence n'a pas encore saisi le coût final."
      },
      {
        q: 'Ces travaux sont-ils les tickets de Maintenance ?',
        a: "Non : ce sont des programmes de travaux du patrimoine, distincts des tickets de l'écran « Maintenance »."
      },
      { q: "L'onglet dit « Aucun programme de travaux ».", a: "Aucun programme n'est enregistré pour ce bien." }
    ],
    related: [{ label: 'Maintenance', helpId: 'portails.proprietaire.incidents' }],
    keywords: ['travaux', 'rénovation', 'chantier', 'coût estimé', 'coût réel']
  },
  {
    id: 'portails.proprietaire.patrimoine-detail.documents',
    kind: 'section',
    title: 'Documents du bien',
    summary:
      'Les pièces du bien : titre de propriété, plans, assurances, etc. Chaque document se télécharge si votre agence a activé les documents.',
    howToRead: {
      notes: [
        "Chaque ligne affiche le nom du fichier, son type, la date d'ajout et, s'il y en a une, sa date d'expiration.",
        "Types possibles : Titre de propriété, Arrêté de concession définitive (ACD), Acte notarié, Permis de construire, Plan, Diagnostic technique, Assurance, Document fiscal, Mandat, Procès-verbal d'assemblée, Budget du syndicat, Contrat du syndicat, Règlement de copropriété, Autre."
      ]
    },
    steps: [
      { title: 'Chercher', detail: 'Tapez un nom de fichier ou un type.' },
      { title: 'Télécharger', detail: 'Cliquez sur « Télécharger ».' }
    ],
    consequences: ['Le téléchargement enregistre le fichier sur votre appareil et ne modifie rien.'],
    faq: [
      {
        q: 'Où sont mes quittances et contrats de bail ?',
        a: "Dans l'écran « Documents » du menu : ce sont des documents de location."
      },
      {
        q: 'Que signifie « Expire le » ?',
        a: "La date après laquelle le document n'est plus valable, par exemple une assurance."
      },
      { q: 'Je ne peux pas ajouter de document.', a: "C'est normal : l'ajout se fait par l'agence." }
    ],
    related: [{ label: 'Documents de location', helpId: 'portails.proprietaire.documents' }],
    keywords: ['documents', 'titre de propriété', 'acd', 'assurance', 'plan', 'mandat']
  }
];

export default entries;
