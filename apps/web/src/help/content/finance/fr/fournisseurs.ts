import type { HelpEntry } from '../../../types';

/** Zone « fournisseurs » du module finance (fr). */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------------------
  // Fournisseurs
  // ---------------------------------------------------------------------------
  {
    id: 'finance.fournisseurs.page',
    kind: 'page',
    title: 'Fournisseurs',
    summary:
      "Retrouvez ici les fournisseurs de votre agence : entreprises de matériaux, prestataires de services, ou les deux. C'est le point de départ pour enregistrer un fournisseur, puis saisir ses factures et ses règlements.",
    purpose:
      "Chaque fournisseur a son propre compte, qui suit ce que l'agence lui doit. Sa nature (« Matériaux », « Prestation » ou « Matériaux et prestation ») décide si ses factures doivent être rattachées à un chantier, dans une agence qui gère des chantiers.",
    steps: [
      {
        title: 'Créer un fournisseur',
        detail:
          'Cliquez sur « Nouveau fournisseur », renseignez la raison sociale et la nature, puis cliquez sur « Créer ».'
      },
      {
        title: 'Rechercher',
        detail: 'Tapez une raison sociale, un nom de contact, un téléphone ou une adresse e-mail.'
      },
      {
        title: 'Filtrer',
        detail: 'Réduisez la liste avec les filtres « Nature » et « Statut » (Actif ou Inactif).'
      },
      {
        title: 'Ouvrir ses factures',
        detail:
          "Cliquez sur « Voir ses factures » : vous arrivez sur l'écran des factures et des règlements de ce fournisseur."
      },
      {
        title: 'Exporter',
        detail:
          "Le bouton d'export reprend tous les fournisseurs qui correspondent à vos filtres, pas seulement la page affichée."
      }
    ],
    consequences: [
      "Créer un fournisseur crée en même temps son compte fournisseur, avec un solde de départ à zéro. Aucun message n'est envoyé au fournisseur.",
      'Cet écran ne permet pas de modifier un fournisseur après sa création : vérifiez la raison sociale et la nature avant de cliquer sur « Créer ».',
      'Dans les listes de choix des factures et des bons de commande, seuls les fournisseurs actifs sont proposés.'
    ],
    faq: [
      {
        q: 'À quoi sert la nature du fournisseur ?',
        a: 'Pour un fournisseur de « Matériaux » ou de « Matériaux et prestation », chaque facture doit être rattachée à au moins un chantier (si votre agence gère des chantiers). Pour une « Prestation », ce rattachement est facultatif.'
      },
      {
        q: 'Comment savoir combien je dois à un fournisseur ?',
        a: 'Ouvrez la « Balance fournisseurs » : elle affiche, pour chaque fournisseur, ce qui a été facturé, ce qui a été réglé et le solde.'
      },
      {
        q: 'Pourquoi ne puis-je pas créer de fournisseur ?',
        a: "La création demande le droit « Créer des pièces financières ». Sans ce droit, l'enregistrement est refusé : demandez-le à l'administrateur de votre agence."
      },
      {
        q: 'Où sont les factures du fournisseur ?',
        a: "Sur la ligne du fournisseur, cliquez sur « Voir ses factures ». C'est aussi là que vous saisissez un règlement."
      }
    ],
    permissions: {
      note: 'Voir la liste demande « Voir les comptes de tiers ». Créer un fournisseur demande « Créer des pièces financières ».'
    },
    related: [
      { label: 'Comment lire la liste des fournisseurs', helpId: 'finance.fournisseurs.tableau' },
      { label: 'Créer un fournisseur', helpId: 'finance.fournisseurs.nouveau' },
      { label: 'Factures et règlements', helpId: 'finance.factures-fournisseurs.page' },
      { label: 'Balance fournisseurs', helpId: 'finance.balance-fournisseurs.page' }
    ],
    keywords: [
      'fournisseur',
      'fournisseurs',
      'prestataire',
      'matériaux',
      'entreprise',
      'raison sociale',
      'créer un fournisseur',
      'achats'
    ]
  },
  {
    id: 'finance.fournisseurs.tableau',
    kind: 'table',
    title: 'Liste des fournisseurs',
    summary: 'Chaque ligne est un fournisseur de votre agence, avec sa nature, ses coordonnées et son statut.',
    howToRead: {
      columns: [
        {
          key: 'nom',
          label: 'Raison sociale',
          description: "Le nom de l'entreprise ou du prestataire, tel que vous l'avez saisi."
        },
        {
          key: 'nature',
          label: 'Nature',
          description:
            '« Matériaux », « Prestation » ou « Matériaux et prestation ». Elle décide si ses factures doivent être rattachées à un chantier.'
        },
        {
          key: 'contact',
          label: 'Contact',
          description:
            "Le nom, le téléphone et l'e-mail du contact, séparés par un point. Un tiret (—) signifie qu'aucune coordonnée n'est enregistrée."
        },
        {
          key: 'statut',
          label: 'Statut',
          description:
            '« Actif » ou « Inactif ». Seuls les fournisseurs actifs sont proposés pour une nouvelle facture ou un nouveau bon de commande.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Voir ses factures » ouvre les factures et les règlements du fournisseur.'
        }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Le fournisseur est proposé dans les listes de choix.' },
        {
          value: 'INACTIVE',
          label: 'Inactif',
          description: "Le fournisseur n'est plus proposé pour une nouvelle facture ou un nouveau bon de commande."
        }
      ],
      notes: [
        "Sur téléphone, chaque fournisseur s'affiche sous forme de carte : touchez la carte pour ouvrir ses factures."
      ]
    },
    steps: [
      {
        title: 'Rechercher',
        detail: "Le champ de recherche couvre la raison sociale, le contact, le téléphone et l'e-mail."
      },
      { title: 'Filtrer', detail: 'Utilisez « Nature » et « Statut » pour réduire la liste.' },
      { title: 'Ouvrir ses factures', detail: 'Cliquez sur « Voir ses factures » sur la ligne voulue.' }
    ],
    faq: [
      {
        q: 'Un fournisseur est « Inactif » : que se passe-t-il ?',
        a: "Il reste dans la liste et conserve son historique, mais il n'est plus proposé dans les listes de choix des nouvelles factures et des nouveaux bons de commande."
      },
      {
        q: 'Je ne trouve pas un fournisseur.',
        a: "Vérifiez les filtres posés au-dessus du tableau (nature, statut) et essayez une partie de la raison sociale, du téléphone ou de l'e-mail."
      },
      {
        q: "L'export contient-il tous les fournisseurs ?",
        a: 'Il contient tous les fournisseurs qui correspondent à vos filtres, pas seulement ceux de la page affichée.'
      }
    ],
    related: [{ label: 'Créer un fournisseur', helpId: 'finance.fournisseurs.nouveau' }],
    keywords: ['liste fournisseurs', 'actif', 'inactif', 'nature', 'contact']
  },
  {
    id: 'finance.fournisseurs.nouveau',
    kind: 'section',
    title: 'Nouveau fournisseur',
    summary:
      'Ce formulaire enregistre un fournisseur et ouvre son compte. Seules la raison sociale et la nature sont obligatoires.',
    purpose:
      'La nature se choisit avec soin : elle décide si les factures du fournisseur doivent être rattachées à un chantier.',
    steps: [
      {
        title: 'Raison sociale',
        detail: "Le nom de l'entreprise, par exemple « Matériaux du Bandama SARL ». Obligatoire."
      },
      {
        title: 'Nature',
        detail: '« Matériaux », « Prestation » ou « Matériaux et prestation ». Obligatoire.'
      },
      { title: 'Contact', detail: 'Facultatif : le nom du contact, son téléphone (+225 …) et son e-mail.' },
      { title: 'Créer', detail: 'Cliquez sur « Créer ». Un message confirme la création et la liste se met à jour.' }
    ],
    consequences: [
      'Le fournisseur est créé actif, avec un compte dont le solde est à zéro.',
      "Aucune modification n'est proposée ensuite sur cet écran : relisez avant de créer."
    ],
    faq: [
      {
        q: 'Quelle nature choisir pour un quincailler ?',
        a: "« Matériaux » : ses factures devront être rattachées à un chantier si votre agence gère des chantiers. Choisissez « Prestation » pour un artisan ou un bureau d'études."
      },
      {
        q: "Le téléphone et l'e-mail sont-ils obligatoires ?",
        a: 'Non. Seuls la raison sociale et la nature le sont.'
      },
      {
        q: 'La création a échoué, pourquoi ?',
        a: "Le message affiché en haut de l'écran donne la raison. Vérifiez aussi que vous avez le droit « Créer des pièces financières »."
      }
    ],
    permissions: { note: 'Demande le droit « Créer des pièces financières ».' },
    related: [{ label: 'Liste des fournisseurs', helpId: 'finance.fournisseurs.tableau' }],
    keywords: ['créer fournisseur', 'nouveau fournisseur', 'raison sociale', 'nature']
  },

  // ---------------------------------------------------------------------------
  // Factures et règlements d'un fournisseur
  // ---------------------------------------------------------------------------
  {
    id: 'finance.factures-fournisseurs.page',
    kind: 'page',
    title: 'Factures fournisseurs',
    summary:
      'Choisissez un fournisseur pour saisir ses factures, les valider, puis enregistrer vos règlements. Tout se fait sur cet écran : la facture, sa validation et le paiement.',
    purpose:
      "Une facture saisie reste en brouillon et ne change rien tant qu'elle n'est pas validée. À la validation, la dette envers le fournisseur et, s'il y en a, le coût des chantiers sont enregistrés. Le règlement suit le même chemin : saisi en brouillon, puis validé par une personne habilitée.",
    steps: [
      {
        title: 'Choisir le fournisseur',
        detail: 'Dans la liste « Fournisseur ». Vous pouvez aussi arriver ici depuis « Voir ses factures ».'
      },
      {
        title: 'Saisir la facture',
        detail:
          'Date, référence, lignes et, selon la nature du fournisseur, imputations au chantier. Puis « Enregistrer en brouillon ».'
      },
      {
        title: 'Valider la facture',
        detail:
          "Dans le tableau des factures, cliquez sur « Valider » puis confirmez. C'est à ce moment que la dette est enregistrée."
      },
      {
        title: 'Saisir le règlement',
        detail:
          'Dans la carte « Règlement » : date, montant, mode, compte et factures à régler. Puis « Enregistrer le règlement ».'
      },
      {
        title: 'Valider le règlement',
        detail:
          "Dans le tableau des règlements, « Valider » puis confirmez. L'argent sort alors du compte de trésorerie."
      }
    ],
    consequences: [
      'Un brouillon (facture ou règlement) ne produit aucune écriture comptable et ne modifie pas le solde du fournisseur.',
      "Valider une facture ou un règlement est irréversible : la pièce ne se modifie plus. Pour corriger, on l'annule avec un motif ; une pièce d'annulation est créée et la pièce d'origine reste conservée.",
      "Le tableau des factures et celui des règlements ont chacun leur fiche d'aide."
    ],
    faq: [
      {
        q: 'Pourquoi ne vois-je pas « Valider » ni « Annuler » ?',
        a: 'Ces actions demandent le droit « Valider des pièces financières ». Saisir demande « Créer des pièces financières ».'
      },
      {
        q: 'Je me suis trompé sur une facture validée.',
        a: 'Annulez-la avec un motif, puis utilisez « Dupliquer » pour ressaisir une facture corrigée. Sa référence annulée reste réservée : prenez-en une autre.'
      },
      {
        q: 'Puis-je verser un acompte ?',
        a: 'Oui : enregistrez un règlement sans cocher de facture. Il est enregistré comme acompte.'
      }
    ],
    permissions: {
      note: 'Voir demande « Voir les comptes de tiers ». Saisir une facture ou un règlement demande « Créer des pièces financières ». Valider ou annuler demande « Valider des pièces financières ».'
    },
    related: [
      { label: 'Saisir une facture', helpId: 'finance.factures-fournisseurs.saisie' },
      { label: 'Tableau des factures', helpId: 'finance.factures-fournisseurs.factures' },
      { label: 'Saisir un règlement', helpId: 'finance.factures-fournisseurs.reglement' },
      { label: 'Retenues de garantie', helpId: 'finance.retenues.page' }
    ],
    keywords: [
      'facture fournisseur',
      'règlement',
      'paiement fournisseur',
      'payer un fournisseur',
      'acompte',
      'valider une facture',
      'annuler une facture',
      'dette'
    ],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'facture-fournisseur-choix',
          title: 'Choisir le fournisseur',
          description:
            'Sélectionnez le fournisseur : sa nature détermine si un rattachement à un chantier est obligatoire.'
        },
        {
          target: 'facture-saisie',
          title: 'Saisir la facture',
          description:
            "La facture est enregistrée en brouillon. Elle ne compte dans aucun solde tant qu'elle n'est pas validée."
        },
        {
          target: 'facture-liste',
          title: 'Valider ou annuler',
          description: 'Valider est irréversible : seule une annulation avec motif permet ensuite de corriger.'
        },
        {
          target: 'facture-reglement',
          title: 'Régler le fournisseur',
          description: 'Cochez les factures à payer. Sans facture cochée, le règlement est un acompte.'
        }
      ]
    }
  },
  {
    id: 'finance.factures-fournisseurs.saisie',
    kind: 'section',
    title: 'Nouvelle facture',
    summary:
      'Ce formulaire enregistre une facture du fournisseur choisi, en brouillon. Le montant de la facture est la somme de ses lignes.',
    purpose:
      "La facture reprend ce que le fournisseur vous a facturé, ligne par ligne. Elle ne produira d'effet comptable qu'à sa validation.",
    steps: [
      { title: 'Date', detail: 'La date de la facture. Elle est proposée au jour même.' },
      {
        title: 'Référence',
        detail:
          'Le numéro de la facture du fournisseur, par exemple « FRS-2026-0142 ». Elle doit être unique pour ce fournisseur.'
      },
      {
        title: 'Lignes',
        detail:
          'Pour chaque ligne : un libellé, puis soit un montant, soit une quantité et un prix unitaire. « Ajouter une ligne » en ajoute une.'
      },
      {
        title: 'Imputations au chantier',
        detail:
          'Indiquez le chantier, le poste de dépense et le montant imputé (voir la fiche « Imputations au chantier »).'
      },
      {
        title: 'Enregistrer',
        detail:
          "Cliquez sur « Enregistrer en brouillon ». Le bouton reste grisé tant que le formulaire est incomplet ou que l'écart de saisie n'est pas nul."
      }
    ],
    howToRead: {
      notes: [
        "Quantité et prix unitaire : quand les deux sont remplis, le montant de la ligne devient leur produit et son champ n'est plus modifiable. Sinon, saisissez le montant directement (un forfait n'a pas de quantité).",
        '« Montant de la facture » affiche en direct la somme des lignes.'
      ]
    },
    consequences: [
      "Le brouillon ne modifie ni le solde du fournisseur ni le coût d'un chantier.",
      'La référence reste réservée pour ce fournisseur, même si la facture est annulée plus tard : il faudra en choisir une autre.',
      'Une fois la facture enregistrée, le formulaire se vide ; la facture apparaît dans le tableau des factures.'
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Enregistrer en brouillon » est-il grisé ?',
        a: 'Il faut une référence, au moins une ligne avec un libellé et un montant supérieur à zéro. Si des imputations sont demandées, elles doivent être complètes et leur total doit égaler le montant de la facture.'
      },
      {
        q: 'Comment recopier une facture semblable ?',
        a: "Dans le tableau des factures, cliquez sur « Dupliquer » : le formulaire est pré-rempli (lignes et imputations), avec une référence vide et la date du jour. Rien n'est créé avant « Enregistrer en brouillon »."
      },
      {
        q: 'Peut-on modifier un brouillon ?',
        a: "Cet écran ne propose pas de modifier ni d'annuler une facture en brouillon : relisez-la avant de l'enregistrer."
      }
    ],
    permissions: { note: 'Demande le droit « Créer des pièces financières ».' },
    related: [
      { label: 'Imputations au chantier', helpId: 'finance.factures-fournisseurs.imputations' },
      { label: 'Tableau des factures', helpId: 'finance.factures-fournisseurs.factures' }
    ],
    keywords: [
      'saisir une facture',
      'nouvelle facture',
      'référence',
      'brouillon',
      'quantité',
      'prix unitaire',
      'dupliquer'
    ]
  },
  {
    id: 'finance.factures-fournisseurs.imputations',
    kind: 'section',
    title: 'Imputations au chantier',
    summary:
      "Une imputation dit à quel chantier et à quel poste de dépense la facture est affectée. Cette partie n'apparaît que si votre agence gère des chantiers.",
    purpose:
      'Les imputations alimentent le coût réel de chaque chantier, une fois la facture validée. Un fournisseur de matériaux achète toujours pour un chantier : le rattachement est donc obligatoire pour lui.',
    steps: [
      { title: 'Ajouter une imputation', detail: 'Cliquez sur « Ajouter une imputation ».' },
      { title: 'Chantier et poste', detail: 'Choisissez le chantier, puis le poste de dépense.' },
      {
        title: 'Montant imputé',
        detail: 'Saisissez la part de la facture qui revient à ce chantier. Répétez pour plusieurs chantiers.'
      },
      {
        title: "Contrôler l'écart",
        detail:
          'La carte « Écart de saisie » doit afficher zéro : le total des imputations doit égaler le montant de la facture.'
      }
    ],
    howToRead: {
      notes: [
        'Écart de saisie = montant de la facture moins total des imputations. Il est vert quand il est nul, rouge sinon.',
        "Le bandeau « Rattachement à un chantier obligatoire » apparaît pour un fournisseur de « Matériaux » ou de « Matériaux et prestation » tant qu'aucune imputation n'est ajoutée. Pour une « Prestation », les imputations sont facultatives."
      ]
    },
    consequences: [
      'À la validation de la facture, chaque imputation entre dans le coût réel du chantier concerné.',
      "Un chantier clos n'accepte plus d'imputation : la validation de la facture est alors refusée.",
      "Si le suivi de stock est activé sur le chantier à la date de la facture, la valeur imputée entre en stock au lieu d'être comptée tout de suite comme dépense : elle devient une dépense à la sortie de magasin.",
      "Une alerte de dépassement de budget peut se déclencher à la validation si l'engagement du chantier dépasse son budget ; elle informe sans bloquer la validation."
    ],
    faq: [
      {
        q: 'Pourquoi une imputation est-elle obligatoire ?',
        a: 'Le fournisseur est de nature « Matériaux » ou « Matériaux et prestation » : un achat de matériaux est toujours destiné à un chantier.'
      },
      {
        q: 'Puis-je répartir une facture sur plusieurs chantiers ?',
        a: 'Oui : ajoutez une imputation par chantier. Le total doit égaler exactement le montant de la facture.'
      },
      {
        q: 'Je ne vois pas cette partie.',
        a: "Elle n'est affichée que si le pack de votre agence inclut les chantiers."
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Nouvelle facture', helpId: 'finance.factures-fournisseurs.saisie' }],
    keywords: ['imputation', 'chantier', 'poste de dépense', 'écart de saisie', 'rattachement']
  },
  {
    id: 'finance.factures-fournisseurs.factures',
    kind: 'table',
    title: 'Factures du fournisseur',
    summary:
      'Chaque ligne est une facture du fournisseur choisi. Depuis ce tableau, vous validez, annulez ou dupliquez une facture.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Référence', description: 'Le numéro de la facture du fournisseur.' },
        { key: 'date', label: 'Date', description: 'La date de la facture.' },
        {
          key: 'chantier',
          label: 'Chantier',
          description:
            "Le chantier auquel la facture est rattachée. Un tiret (—) signifie qu'aucun chantier n'est indiqué."
        },
        { key: 'montant', label: 'Montant', description: 'Le montant de la facture en FCFA.' },
        { key: 'statut', label: 'Statut', description: "L'état de la facture (voir les statuts ci-dessous)." },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Valider » (brouillon), « Annuler » (facture validée) et « Dupliquer » (tous les statuts).'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: "Saisie mais pas encore validée : aucun effet sur le solde ni sur le coût d'un chantier."
        },
        {
          value: 'VALIDATED',
          label: 'Validée',
          description: 'Enregistrée définitivement : la dette envers le fournisseur existe et ne se modifie plus.'
        },
        {
          value: 'VOIDED',
          label: 'Annulée',
          description:
            'Annulée avec un motif : elle ne compte plus dans le solde du fournisseur ni dans le coût du chantier.'
        }
      ]
    },
    steps: [
      {
        title: 'Rechercher et filtrer',
        detail: 'Cherchez par référence ou chantier ; filtrez par statut, chantier, date ou montant.'
      },
      { title: 'Valider', detail: 'Sur un brouillon, cliquez sur « Valider » puis sur « Confirmer la validation ».' },
      {
        title: 'Annuler',
        detail:
          "Sur une facture validée, cliquez sur « Annuler », saisissez le motif (obligatoire), puis « Confirmer l'annulation »."
      },
      {
        title: 'Dupliquer',
        detail:
          "Pré-remplit le formulaire de saisie avec les lignes et les imputations. Rien n'est créé tant que vous n'enregistrez pas."
      }
    ],
    consequences: [
      "Valider est irréversible : la facture ne se modifie plus. Une écriture comptable est enregistrée au journal (la charge d'achat d'un côté, la dette envers le fournisseur de l'autre) et le solde du fournisseur augmente du montant de la facture.",
      "Annuler crée une pièce d'annulation liée avec une écriture inverse : la facture d'origine est conservée, mais son montant ne compte plus dans le solde du fournisseur ni dans le coût du chantier. L'annulation est elle-même définitive.",
      'Une facture annulée ne peut plus être réglée, mais sa référence reste réservée pour ce fournisseur.'
    ],
    faq: [
      {
        q: 'Pourquoi la validation est-elle refusée ?',
        a: 'Les causes les plus fréquentes : la somme des imputations ne correspond pas au montant de la facture, ou un chantier imputé est clos. Le message affiché en précise la raison.'
      },
      {
        q: "Que devient le règlement si j'annule la facture ?",
        a: "L'annulation d'une facture ne supprime pas ses règlements. Vérifiez les règlements du fournisseur et annulez-les si besoin."
      },
      {
        q: 'Pourquoi ne puis-je pas valider ?',
        a: 'Valider et annuler demandent le droit « Valider des pièces financières ».'
      }
    ],
    permissions: { note: '« Valider » et « Annuler » demandent le droit « Valider des pièces financières ».' },
    related: [
      { label: 'Nouvelle facture', helpId: 'finance.factures-fournisseurs.saisie' },
      { label: 'Annuler une facture ou un règlement', helpId: 'finance.factures-fournisseurs.annulation' }
    ],
    keywords: ['valider', 'annuler', 'dupliquer', 'statut', 'facture validée', 'brouillon', 'écriture comptable']
  },
  {
    id: 'finance.factures-fournisseurs.reglement',
    kind: 'section',
    title: 'Règlement',
    summary:
      "Cette carte enregistre un paiement au fournisseur, en brouillon. Vous choisissez quelles factures il règle ; ce qui n'est affecté à aucune facture devient un acompte.",
    purpose:
      "Un règlement diminue ce que vous devez au fournisseur et fait sortir l'argent d'un compte de trésorerie (caisse, banque, portefeuille Mobile Money) une fois validé.",
    steps: [
      { title: 'Date', detail: 'La date du paiement, proposée au jour même.' },
      { title: 'Montant du règlement', detail: 'La somme réellement versée, en FCFA.' },
      {
        title: 'Mode de règlement',
        detail:
          'Espèces, Virement bancaire, Chèque, Mobile Money, Carte bancaire ou Autre. Obligatoire, sans valeur par défaut.'
      },
      {
        title: 'Compte de trésorerie',
        detail:
          'Facultatif. Laissé vide, le compte par défaut du mode est utilisé : banque pour un virement ou un chèque, caisse pour des espèces, portefeuille pour Mobile Money.'
      },
      {
        title: 'Factures à régler',
        detail:
          'Cochez les factures validées à payer. Le montant affecté est proposé au reste dû ; vous pouvez le réduire.'
      },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer le règlement » : il est créé en brouillon.' }
    ],
    howToRead: {
      notes: [
        'Seules les factures validées qui ont encore un reste à payer sont proposées. Le « reste dû » est le montant de la facture moins les règlements validés et les retenues de garantie encore détenues.',
        "Le total affecté aux factures ne peut pas dépasser le montant du règlement : sinon un message d'erreur s'affiche et l'enregistrement est bloqué.",
        'Si le montant du règlement dépasse le total affecté, la différence est indiquée comme « Part non affectée à une facture (acompte) ».'
      ]
    },
    consequences: [
      "Le brouillon n'a aucun effet : ni écriture comptable, ni mouvement du compte du fournisseur, ni sortie d'argent.",
      "Sans facture cochée, le règlement sera enregistré comme acompte : le compte du fournisseur devient en votre faveur du montant versé. Ce n'est pas une erreur."
    ],
    faq: [
      {
        q: "Pourquoi une facture n'apparaît-elle pas dans la liste ?",
        a: "Elle n'est pas validée, ou elle est déjà entièrement réglée. Une facture partiellement réglée reste proposée avec son reste dû."
      },
      {
        q: 'Que se passe-t-il si je ne choisis aucun compte de trésorerie ?',
        a: 'Le compte par défaut correspondant au mode de règlement est utilisé au moment de la validation.'
      },
      {
        q: 'Le bouton « Enregistrer le règlement » est grisé.',
        a: 'Il faut un montant supérieur à zéro, un mode de règlement, et un total affecté qui ne dépasse pas le montant du règlement.'
      }
    ],
    permissions: { note: 'Demande le droit « Créer des pièces financières ».' },
    related: [
      { label: 'Tableau des règlements', helpId: 'finance.factures-fournisseurs.reglements' },
      { label: 'Retenues de garantie', helpId: 'finance.retenues.page' }
    ],
    keywords: ['règlement', 'payer', 'paiement', 'acompte', 'mode de règlement', 'compte de trésorerie', 'reste dû']
  },
  {
    id: 'finance.factures-fournisseurs.reglements',
    kind: 'table',
    title: 'Règlements du fournisseur',
    summary:
      "Chaque ligne est un règlement saisi pour ce fournisseur, quelle que soit la personne qui l'a saisi. Depuis ce tableau, vous validez ou annulez un règlement.",
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'La date du paiement.' },
        { key: 'montant', label: 'Montant réglé', description: 'La somme versée, en FCFA.' },
        {
          key: 'mode',
          label: 'Mode',
          description: "Le mode de règlement, avec en dessous le compte de trésorerie utilisé, s'il a été choisi."
        },
        {
          key: 'affectation',
          label: 'Affectation',
          description:
            "Les références des factures réglées, ou « Acompte, sans facture ». Un message d'alerte apparaît sur un brouillon dont une facture est déjà soldée ou dépassée."
        },
        {
          key: 'acteurs',
          label: 'Saisi / validé par',
          description: "La personne qui a saisi le règlement et, une fois validé, celle qui l'a validé."
        },
        {
          key: 'statut',
          label: 'Statut',
          description: "L'état du règlement. Pour un règlement annulé, le motif s'affiche sous le statut."
        },
        { key: 'actions', label: 'Actions', description: '« Valider » (brouillon) ou « Annuler » (règlement validé).' }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: "Saisi mais pas validé : l'argent n'est pas encore sorti." },
        {
          value: 'VALIDATED',
          label: 'Validée',
          description: "Le paiement est enregistré : l'argent est sorti du compte de trésorerie et la dette a diminué."
        },
        {
          value: 'VOIDED',
          label: 'Annulée',
          description: 'Annulé avec un motif : son montant ne compte plus dans le solde du fournisseur.'
        }
      ]
    },
    steps: [
      {
        title: 'Valider',
        detail:
          "Sur un brouillon, cliquez sur « Valider » puis « Confirmer la validation ». Une alerte s'affiche si une facture visée est déjà réglée."
      },
      {
        title: 'Annuler',
        detail: 'Sur un règlement validé, cliquez sur « Annuler », saisissez le motif, puis confirmez.'
      }
    ],
    consequences: [
      'Valider est irréversible. Une écriture comptable est enregistrée (la dette envers le fournisseur diminue, le compte de trésorerie baisse du même montant), le solde du fournisseur diminue, et le reste dû de chaque facture affectée baisse. Un montant non affecté est enregistré comme acompte.',
      "La validation est refusée si le compte de trésorerie n'a pas un solde suffisant : on ne peut pas payer à découvert.",
      "Annuler crée une pièce d'annulation et une écriture inverse : le règlement d'origine est conservé, mais ce que vous devez au fournisseur remonte d'autant.",
      "Valider un règlement dont une facture est déjà soldée reste possible mais risque de payer deux fois : lisez l'alerte avant de confirmer."
    ],
    faq: [
      {
        q: 'La validation est refusée pour solde insuffisant.',
        a: 'Le compte de trésorerie utilisé ne contient pas assez : approvisionnez-le ou choisissez un autre compte avant de valider.'
      },
      {
        q: 'Quelle est la différence entre « Saisi par » et « Validé par » ?',
        a: 'Le règlement peut être saisi par une personne et validé par une autre, qui détient le droit de validation.'
      },
      {
        q: 'Comment corriger un règlement validé ?',
        a: 'Annulez-le avec un motif, puis saisissez un nouveau règlement.'
      }
    ],
    permissions: { note: '« Valider » et « Annuler » demandent le droit « Valider des pièces financières ».' },
    related: [
      { label: 'Saisir un règlement', helpId: 'finance.factures-fournisseurs.reglement' },
      { label: 'Annuler une facture ou un règlement', helpId: 'finance.factures-fournisseurs.annulation' }
    ],
    keywords: ['règlements', 'valider un règlement', 'annuler un règlement', 'acompte', 'écriture', 'trésorerie']
  },
  {
    id: 'finance.factures-fournisseurs.annulation',
    kind: 'section',
    title: 'Annuler une facture ou un règlement',
    summary:
      "L'annulation d'une pièce validée demande toujours un motif. Elle ne supprime rien : elle crée une pièce d'annulation qui corrige les comptes.",
    steps: [
      {
        title: "Ouvrir l'annulation",
        detail: 'Cliquez sur « Annuler » sur la ligne de la facture ou du règlement validé.'
      },
      {
        title: 'Saisir le motif',
        detail:
          'Par exemple « Erreur de saisie sur le montant ». Le bouton de confirmation reste grisé tant que le motif est vide.'
      },
      {
        title: 'Confirmer',
        detail: "Cliquez sur « Confirmer l'annulation », ou sur « Renoncer » pour laisser la pièce telle quelle."
      }
    ],
    consequences: [
      "L'annulation est irréversible : une annulation ne s'annule pas.",
      'Pour une facture : son montant ne compte plus dans le solde du fournisseur ni dans le coût du chantier, et sa référence reste réservée.',
      'Pour un règlement : ce que vous devez au fournisseur remonte du montant annulé.',
      "La pièce d'origine reste visible avec le statut « Annulée » et son écriture comptable est conservée, accompagnée d'une écriture inverse."
    ],
    faq: [
      {
        q: 'Peut-on rétablir une pièce annulée ?',
        a: 'Non. Utilisez « Dupliquer » (facture) ou saisissez un nouveau règlement.'
      },
      {
        q: 'Où est conservé le motif ?',
        a: "Il est enregistré avec la pièce d'annulation ; pour un règlement, il s'affiche aussi sous le statut."
      },
      {
        q: 'Pourquoi le bouton « Annuler » est-il absent ?',
        a: 'Il demande le droit « Valider des pièces financières ».'
      }
    ],
    permissions: { note: 'Demande le droit « Valider des pièces financières ».' },
    related: [
      { label: 'Tableau des factures', helpId: 'finance.factures-fournisseurs.factures' },
      { label: 'Tableau des règlements', helpId: 'finance.factures-fournisseurs.reglements' }
    ],
    keywords: ['annulation', 'motif', 'annuler', "pièce d'annulation", 'corriger']
  },

  // ---------------------------------------------------------------------------
  // Bons de commande
  // ---------------------------------------------------------------------------
  {
    id: 'finance.bons-de-commande.page',
    kind: 'page',
    title: 'Bons de commande',
    summary:
      "Retrouvez ici tous les bons de commande passés à vos fournisseurs, avec leur statut, leur état de facturation et ce qu'il reste à facturer. C'est le point de départ pour créer, ouvrir ou dupliquer un bon.",
    purpose:
      "Un bon de commande engage une dépense pour un chantier avant la facture. Tant qu'il est en brouillon, il n'engage rien ; une fois émis, son reste à facturer compte dans l'engagement du chantier, ce qui permet de suivre le budget.",
    steps: [
      {
        title: 'Créer un bon',
        detail: 'Cliquez sur « Nouveau bon » : chantier, fournisseur, référence, date et lignes.'
      },
      { title: 'Rechercher', detail: 'Tapez une référence, un chantier ou un fournisseur.' },
      {
        title: 'Filtrer',
        detail: 'Statut, chantier, fournisseur, date, facturation et montant total réduisent la liste.'
      },
      {
        title: 'Ouvrir un bon',
        detail: "Cliquez sur « Voir le détail » pour l'émettre, l'annuler ou consulter ses lignes."
      },
      {
        title: 'Dupliquer',
        detail:
          "Cliquez sur « Dupliquer » : la saisie d'un nouveau bon s'ouvre, pré-remplie avec le chantier, le fournisseur et les lignes."
      }
    ],
    consequences: [
      "Dupliquer n'écrit rien : le nouveau bon n'existe qu'après « Enregistrer en brouillon ». Il se propose pour tous les statuts, bon annulé compris.",
      'Le statut du bon (Brouillon, Émis, Annulé) et son état de facturation (Non facturé, Partiellement facturé, Soldé) sont deux informations distinctes.'
    ],
    faq: [
      {
        q: 'Le bon enregistre-t-il la réception des marchandises ?',
        a: "Non : ses seuls statuts sont « Brouillon », « Émis » et « Annulé ». Si votre chantier suit son stock, l'entrée en magasin se fait à partir d'une facture fournisseur validée, dans l'écran de stock."
      },
      {
        q: 'Comment une facture se relie-t-elle à un bon ?',
        a: "L'état de facturation se calcule à partir des factures validées rapprochées du bon. Aucun écran de saisie de facture ne propose ce rapprochement pour le moment : les colonnes « Facturation » et « Reste à facturer » ne bougent que pour une facture déjà rapprochée."
      },
      {
        q: 'Je ne vois pas cet écran.',
        a: 'Les bons de commande sont réservés aux agences dont le pack inclut les chantiers.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Voir la liste demande « Voir les comptes de tiers ». Créer un bon demande « Créer des pièces financières ». Émettre et annuler demandent « Valider des pièces financières ».'
    },
    related: [
      { label: 'Comment lire la liste des bons', helpId: 'finance.bons-de-commande.tableau' },
      { label: "Fiche d'un bon de commande", helpId: 'finance.bon-de-commande.page' },
      { label: 'Factures fournisseurs', helpId: 'finance.factures-fournisseurs.page' }
    ],
    keywords: ['bon de commande', 'commande', 'achat', 'engagement', 'engagé', 'émettre un bon', 'bc']
  },
  {
    id: 'finance.bons-de-commande.tableau',
    kind: 'table',
    title: 'Liste des bons de commande',
    summary:
      'Chaque ligne est un bon de commande. Le tableau montre son chantier, son fournisseur, son statut, son état de facturation et le reste à facturer.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Référence', description: 'Le numéro du bon, par exemple BC-2026-0042.' },
        { key: 'chantier', label: 'Chantier', description: 'Le chantier pour lequel la commande est passée.' },
        { key: 'fournisseur', label: 'Fournisseur', description: 'Le fournisseur à qui la commande est passée.' },
        { key: 'date', label: 'Date', description: 'La date du bon.' },
        { key: 'statut', label: 'Statut', description: "L'étape du bon : brouillon, émis ou annulé." },
        {
          key: 'facturation',
          label: 'Facturation',
          description:
            'Calculée à partir des factures validées rapprochées du bon : non facturé, partiellement facturé ou soldé.'
        },
        { key: 'montant', label: 'Montant total', description: 'La somme des lignes du bon, en FCFA.' },
        {
          key: 'reste',
          label: 'Reste à facturer',
          description: 'Le montant total moins ce qui est déjà facturé. Il ne descend jamais sous zéro.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Voir le détail » ouvre la fiche du bon ; « Dupliquer » ouvre une saisie pré-remplie.'
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: "Le bon est saisi mais n'engage rien." },
        {
          value: 'ISSUED',
          label: 'Émis',
          description: "Le bon est émis : son reste à facturer compte dans l'engagement du chantier."
        },
        { value: 'CANCELLED', label: 'Annulé', description: "Le bon est annulé : il n'engage plus rien." },
        { value: 'NOT_INVOICED', label: 'Non facturé', description: 'Aucune facture validée rapprochée de ce bon.' },
        {
          value: 'PARTIALLY_INVOICED',
          label: 'Partiellement facturé',
          description: 'Des factures validées couvrent une partie du bon.'
        },
        { value: 'SETTLED', label: 'Soldé', description: 'Les factures validées couvrent la totalité du bon.' }
      ],
      notes: ["Sur téléphone, chaque bon s'affiche sous forme de carte ; touchez-la pour ouvrir le bon."]
    },
    steps: [
      { title: 'Filtrer', detail: 'Le filtre « Facturation » isole par exemple les bons non facturés.' },
      { title: 'Ouvrir', detail: 'Cliquez sur « Voir le détail » pour émettre ou annuler le bon.' },
      { title: 'Exporter', detail: "Le bouton d'export reprend tous les bons qui correspondent à vos filtres." }
    ],
    faq: [
      {
        q: 'Que veut dire « Reste à facturer » ?',
        a: "C'est la part du bon qu'aucune facture validée ne couvre encore. Pour un bon émis, c'est ce montant qui compte dans l'engagement du chantier."
      },
      {
        q: 'Pourquoi un bon soldé a-t-il encore le statut « Émis » ?',
        a: "Le statut (brouillon, émis, annulé) et l'état de facturation sont indépendants : un bon peut être « Émis » et « Soldé »."
      },
      {
        q: 'Où est la date de réception ?',
        a: 'Un bon ne porte pas de suivi de réception.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: "Fiche d'un bon de commande", helpId: 'finance.bon-de-commande.page' }],
    keywords: ['liste des bons', 'reste à facturer', 'émis', 'brouillon', 'soldé', 'facturation']
  },

  // ---------------------------------------------------------------------------
  // Fiche d'un bon de commande (création et détail)
  // ---------------------------------------------------------------------------
  {
    id: 'finance.bon-de-commande.page',
    kind: 'page',
    title: 'Bon de commande',
    summary:
      "Cet écran sert à créer un bon de commande, puis à suivre sa fiche : l'émettre, l'annuler, le dupliquer et consulter ses lignes. Un bon est d'abord enregistré en brouillon.",
    purpose:
      "Le cycle d'un bon est : brouillon, puis émis, puis éventuellement annulé. Seule l'émission fait entrer son reste à facturer dans l'engagement du chantier.",
    steps: [
      {
        title: 'Créer',
        detail: 'Choisissez le chantier, le fournisseur, saisissez la référence et la date, puis les lignes.'
      },
      { title: 'Enregistrer en brouillon', detail: "Le bon est créé et sa fiche s'ouvre. Il n'engage encore rien." },
      {
        title: 'Émettre',
        detail:
          "Sur la fiche, cliquez sur « Émettre le bon » puis « Confirmer l'émission ». Le statut passe à « Émis »."
      },
      {
        title: 'Annuler',
        detail: 'Sur un bon émis, cliquez sur « Annuler le bon », saisissez le motif, puis confirmez.'
      },
      { title: 'Dupliquer', detail: "Repart d'une saisie pré-remplie avec le chantier, le fournisseur et les lignes." }
    ],
    consequences: [
      "L'émission est irréversible : un bon émis ne repasse pas en brouillon. Son reste à facturer entre alors dans l'engagement du chantier (le réalisé plus le reste à facturer des bons émis).",
      "À l'émission, une alerte de dépassement de budget peut se déclencher si l'engagement du chantier dépasse son budget ; elle informe sans empêcher l'émission.",
      "L'annulation est irréversible, exige un motif et est refusée tant qu'une facture est rapprochée du bon : corrigez d'abord la facture.",
      "Un bon n'enregistre aucune écriture comptable : seules les factures et les règlements en produisent."
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Enregistrer en brouillon » est-il grisé ?',
        a: 'Il faut un chantier, un fournisseur, une référence et au moins une ligne complète (poste, libellé, montant supérieur à zéro).'
      },
      {
        q: 'La référence est refusée.',
        a: 'Chaque référence de bon est unique dans votre agence : choisissez-en une autre.'
      },
      {
        q: 'Je ne vois pas « Émettre le bon » ni « Annuler le bon ».',
        a: "Ils demandent le droit « Valider des pièces financières ». Émettre n'est proposé que sur un brouillon ; annuler, que sur un bon émis."
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Créer demande « Créer des pièces financières ». Émettre et annuler demandent « Valider des pièces financières ».'
    },
    related: [
      { label: 'Saisir les lignes du bon', helpId: 'finance.bon-de-commande.lignes-saisie' },
      { label: 'Indicateurs du bon', helpId: 'finance.bon-de-commande.indicateurs' },
      { label: 'Lignes du bon', helpId: 'finance.bon-de-commande.lignes' },
      { label: 'Liste des bons', to: '/tenant/:tenantId/finance/bons-de-commande' }
    ],
    keywords: ['nouveau bon', 'créer un bon de commande', 'émettre', 'annuler un bon', 'engagement', 'brouillon'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'bon-entete',
          title: 'Chantier et fournisseur',
          description:
            'Choisissez le chantier et le fournisseur concernés. La référence du bon doit être unique dans votre agence.'
        },
        {
          target: 'bon-lignes',
          title: 'Les lignes du bon',
          description:
            'Chaque ligne porte un poste de dépense, un libellé et un montant. Avec une quantité et un prix unitaire, le montant se calcule seul.'
        },
        {
          target: 'bon-enregistrer',
          title: 'Enregistrer en brouillon',
          description: "Le bon n'engage rien tant qu'il n'est pas émis depuis sa fiche."
        },
        {
          target: 'bon-actions',
          title: 'Émettre ou annuler',
          description: "Émettre et annuler sont irréversibles. L'annulation demande un motif."
        }
      ]
    }
  },
  {
    id: 'finance.bon-de-commande.lignes-saisie',
    kind: 'section',
    title: 'Lignes du bon (saisie)',
    summary:
      'Chaque ligne décrit une partie de la commande : poste de dépense, libellé, quantité, prix unitaire et montant. Le montant total du bon est la somme des lignes.',
    steps: [
      { title: 'Poste', detail: 'Choisissez le poste de dépense de la ligne (obligatoire).' },
      { title: 'Libellé', detail: 'Décrivez la ligne, par exemple « Ciment CPJ 42,5 » (obligatoire).' },
      {
        title: 'Quantité et prix unitaire',
        detail: "Facultatifs. Quand les deux sont remplis, le montant devient leur produit et n'est plus modifiable."
      },
      { title: 'Montant', detail: 'À saisir directement pour un forfait, par exemple une pose, sans quantité.' },
      {
        title: 'Ajouter ou retirer',
        detail:
          "« Ajouter une ligne » en crée une ; l'icône corbeille en retire une (il en reste toujours au moins une)."
      }
    ],
    howToRead: {
      notes: [
        '« Montant total » en bas affiche en direct la somme des lignes.',
        "Le texte sous « Chantier » rappelle qu'un chantier clos n'accepte plus d'imputation."
      ]
    },
    consequences: [
      "Rien n'est enregistré avant « Enregistrer en brouillon ». Le serveur arrondit les montants au franc et conserve la quantité et le prix unitaire tels que saisis."
    ],
    faq: [
      {
        q: 'Pourquoi le champ « Montant » est-il verrouillé ?',
        a: "Parce que la quantité et le prix unitaire sont remplis : le montant est alors leur produit. Videz l'un des deux pour saisir un montant."
      },
      {
        q: 'Combien de lignes puis-je ajouter ?',
        a: 'Autant que nécessaire ; chaque ligne doit avoir un poste, un libellé et un montant supérieur à zéro.'
      },
      {
        q: "Le poste que je cherche n'existe pas.",
        a: 'Seuls les postes de dépense actifs de votre agence sont proposés. Ils se gèrent dans le paramétrage du module financier.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande le droit « Créer des pièces financières ».' },
    related: [{ label: "Fiche d'un bon de commande", helpId: 'finance.bon-de-commande.page' }],
    keywords: ['lignes', 'poste de dépense', 'quantité', 'prix unitaire', 'montant total']
  },
  {
    id: 'finance.bon-de-commande.indicateurs',
    kind: 'section',
    title: 'Indicateurs du bon',
    summary:
      "Quatre chiffres résument le bon : sa date, son montant total, ce qui est déjà facturé et ce qu'il reste à facturer.",
    howToRead: {
      notes: [
        'Montant total : la somme des lignes du bon.',
        'Facturé : la somme des factures validées rapprochées de ce bon.',
        'Reste à facturer : le montant total moins le facturé, jamais négatif.',
        'À côté du titre de la fiche, deux pastilles donnent le statut du bon et son état de facturation.'
      ]
    },
    consequences: [
      "Pour un bon émis, le « Reste à facturer » est la part qui compte dans l'engagement du chantier. Une facture validée rapprochée du bon fait baisser ce reste : elle entre alors dans le réalisé, sans être comptée deux fois."
    ],
    faq: [
      {
        q: "Le « Facturé » reste à zéro alors que j'ai une facture.",
        a: 'Seules les factures validées et rapprochées de ce bon sont comptées. Aucun écran de saisie de facture ne propose encore ce rapprochement.'
      },
      {
        q: 'Que veut dire « Soldé » ?',
        a: 'Les factures validées couvrent la totalité du bon.'
      },
      {
        q: "Un bon brouillon compte-t-il dans l'engagement ?",
        a: 'Non. Seul un bon émis, non annulé, compte par son reste à facturer.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: "Fiche d'un bon de commande", helpId: 'finance.bon-de-commande.page' }],
    keywords: ['facturé', 'reste à facturer', 'engagement', 'soldé']
  },
  {
    id: 'finance.bon-de-commande.lignes',
    kind: 'table',
    title: 'Lignes du bon de commande',
    summary: 'Chaque ligne est une partie de la commande, avec son poste de dépense, son libellé et son montant.',
    howToRead: {
      columns: [
        { key: 'poste', label: 'Poste', description: 'Le poste de dépense de la ligne.' },
        { key: 'libelle', label: 'Libellé', description: 'La description de la ligne.' },
        {
          key: 'quantite',
          label: 'Quantité',
          description: 'La quantité commandée. Elle reste vide pour une ligne saisie en montant direct.'
        },
        {
          key: 'prix-unitaire',
          label: 'Prix unitaire',
          description: "Le prix d'une unité, en FCFA. Il reste vide si aucune quantité n'a été saisie."
        },
        { key: 'montant', label: 'Montant', description: 'Le montant de la ligne, en FCFA.' }
      ],
      notes: ['Le montant total du bon est la somme des montants des lignes, et non un produit recalculé.']
    },
    steps: [
      { title: 'Parcourir', detail: 'Si le bon compte beaucoup de lignes, utilisez la pagination sous le tableau.' },
      { title: 'Exporter', detail: "Le bouton d'export reprend toutes les lignes du bon." }
    ],
    faq: [
      {
        q: 'Peut-on modifier une ligne ?',
        a: "Non, pas depuis la fiche. Annulez le bon (s'il est émis et sans facture rapprochée) puis dupliquez-le pour ressaisir."
      },
      {
        q: 'Pourquoi la quantité est-elle vide ?',
        a: 'La ligne a été saisie avec un montant seul, par exemple un forfait.'
      },
      {
        q: 'Les lignes sont-elles toutes affichées ?',
        a: "Elles sont paginées. L'export contient toutes les lignes."
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Indicateurs du bon', helpId: 'finance.bon-de-commande.indicateurs' }],
    keywords: ['lignes du bon', 'poste', 'quantité', 'prix unitaire']
  },
  {
    id: 'finance.bon-de-commande.annulation',
    kind: 'section',
    title: 'Annuler le bon',
    summary:
      "L'annulation d'un bon émis demande un motif. Elle est irréversible et retire le bon de l'engagement du chantier.",
    steps: [
      { title: 'Ouvrir', detail: 'Sur un bon émis, cliquez sur « Annuler le bon ».' },
      {
        title: 'Saisir le motif',
        detail: 'Par exemple « Commande passée en double ». Le bouton reste grisé tant que le motif est vide.'
      },
      { title: 'Confirmer', detail: "Cliquez sur « Confirmer l'annulation », ou sur « Renoncer »." }
    ],
    consequences: [
      "L'annulation est irréversible : le bon annulé n'engage plus rien au chantier.",
      "Elle est refusée si une facture est rapprochée du bon, même en brouillon : défaites d'abord le rapprochement ou annulez la facture depuis l'écran des factures fournisseurs.",
      'Le motif est conservé avec le bon.'
    ],
    faq: [
      {
        q: 'Je voulais seulement corriger une ligne.',
        a: 'Annulez le bon puis utilisez « Dupliquer » : la saisie est pré-remplie, avec une référence vide et la date du jour.'
      },
      {
        q: 'Peut-on annuler un brouillon ?',
        a: 'Cet écran propose « Annuler le bon » uniquement sur un bon émis.'
      },
      {
        q: 'Le bon annulé disparaît-il de la liste ?',
        a: 'Non : il reste avec le statut « Annulé ».'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande le droit « Valider des pièces financières ».' },
    related: [{ label: "Fiche d'un bon de commande", helpId: 'finance.bon-de-commande.page' }],
    keywords: ['annuler le bon', 'motif', 'engagement']
  },

  // ---------------------------------------------------------------------------
  // Balance fournisseurs
  // ---------------------------------------------------------------------------
  {
    id: 'finance.balance-fournisseurs.page',
    kind: 'page',
    title: 'Balance fournisseurs',
    summary:
      'Cette balance donne, pour chaque fournisseur, ce qui a été facturé, ce qui a été réglé et ce que vous lui devez. Elle se filtre par période et par chantier.',
    purpose:
      "C'est la vue d'ensemble de vos dettes envers les fournisseurs. Le total de contrôle en bas de page est la somme des soldes affichés.",
    steps: [
      {
        title: 'Choisir une période',
        detail: 'Le filtre « Période » limite les colonnes « Facturé » et « Réglé » aux mouvements de ces dates.'
      },
      {
        title: 'Choisir un chantier',
        detail: 'Le filtre « Chantier » ne garde que les mouvements liés à ce chantier.'
      },
      { title: 'Rechercher', detail: "Tapez le nom d'un fournisseur, ou filtrez par intervalle de « Solde »." },
      {
        title: 'Voir le relevé',
        detail: 'Cliquez sur « Voir le relevé » pour ouvrir le compte détaillé du fournisseur.'
      }
    ],
    consequences: [
      'Cet écran est en lecture seule : il ne modifie rien.',
      "Le solde est toujours le solde courant du compte du fournisseur ; il n'est pas recalculé sur la période."
    ],
    faq: [
      {
        q: 'Que signifie un solde négatif ?',
        a: "Vous avez versé plus que vous n'avez reçu en factures, par exemple avec un acompte. Le montant s'affiche avec son signe."
      },
      {
        q: 'Pourquoi le total de contrôle a-t-il disparu ?',
        a: "Il est masqué dès qu'une recherche ou un intervalle de solde réduit la liste, car il ne serait plus celui des lignes visibles."
      },
      {
        q: 'Où voir le détail des factures ?',
        a: "Dans « Voir le relevé » pour les mouvements du compte, ou dans l'écran des factures fournisseurs."
      }
    ],
    permissions: { note: 'Demande le droit « Voir les rapports financiers ».' },
    related: [
      { label: 'Comment lire la balance', helpId: 'finance.balance-fournisseurs.tableau' },
      { label: 'Total de contrôle', helpId: 'finance.balance-fournisseurs.total' },
      { label: 'Factures fournisseurs', helpId: 'finance.factures-fournisseurs.page' }
    ],
    keywords: ['balance', 'dette fournisseur', 'solde fournisseur', 'ce que je dois', 'relevé']
  },
  {
    id: 'finance.balance-fournisseurs.tableau',
    kind: 'table',
    title: 'Tableau de la balance fournisseurs',
    summary:
      'Une ligne par fournisseur : le facturé, le réglé et le solde. Le solde positif est ce que vous lui devez.',
    howToRead: {
      columns: [
        { key: 'fournisseur', label: 'Fournisseur', description: 'Le nom du fournisseur.' },
        {
          key: 'facture',
          label: 'Facturé',
          description:
            'Le total des mouvements de facturation sur la période choisie, en FCFA. Une facture annulée en est retirée.'
        },
        {
          key: 'regle',
          label: 'Réglé',
          description:
            'Le total des mouvements de règlement sur la période choisie, en FCFA. Un règlement annulé en est retiré.'
        },
        {
          key: 'solde',
          label: 'Solde',
          description:
            'Le solde actuel du compte du fournisseur. Positif : vous lui devez cette somme. Négatif : vous avez versé davantage (acompte).'
        },
        { key: 'actions', label: 'Actions', description: '« Voir le relevé » ouvre le compte détaillé du fournisseur.' }
      ],
      notes: [
        "Avec une période choisie, « Facturé » et « Réglé » portent l'activité de la période, mais « Solde » reste le solde actuel : une dette ne disparaît pas parce qu'aucun mouvement n'a eu lieu pendant ces dates.",
        'Une retenue de garantie posée sur une facture fait baisser le solde du fournisseur ; sa libération le fait remonter.'
      ]
    },
    steps: [
      {
        title: 'Filtrer',
        detail:
          'Période et chantier modifient les montants calculés ; la recherche et le « Solde » filtrent seulement la liste.'
      },
      { title: 'Exporter', detail: "Le bouton d'export reprend les lignes affichées selon vos filtres." }
    ],
    faq: [
      {
        q: 'Pourquoi « Facturé » moins « Réglé » ne donne-t-il pas le solde ?',
        a: "Avec une période, ces deux colonnes ne portent que l'activité de la période, alors que le solde est le solde actuel."
      },
      {
        q: 'Le filtre « Chantier » change-t-il le solde ?',
        a: 'Il restreint les montants « Facturé » et « Réglé » aux mouvements liés à ce chantier ; le solde reste celui du compte du fournisseur.'
      },
      {
        q: 'Un acompte apparaît où ?',
        a: 'Dans « Réglé » ; il rend le solde plus faible, voire négatif.'
      }
    ],
    permissions: { note: 'Demande le droit « Voir les rapports financiers ».' },
    related: [{ label: 'Total de contrôle', helpId: 'finance.balance-fournisseurs.total' }],
    keywords: ['facturé', 'réglé', 'solde', 'période', 'relevé de compte']
  },
  {
    id: 'finance.balance-fournisseurs.total',
    kind: 'section',
    title: 'Total de contrôle',
    summary:
      'Le total de contrôle est la somme des soldes de tous les fournisseurs de la balance : le montant global que vous devez.',
    howToRead: {
      notes: [
        "C'est la somme des soldes actuels, pas de l'activité de la période.",
        "Il se masque dès que la recherche ou l'intervalle de solde réduit la liste : il ne correspondrait plus aux lignes visibles."
      ]
    },
    faq: [
      {
        q: 'À quoi sert ce total ?',
        a: "À vérifier d'un coup d'œil le montant global de vos dettes fournisseurs, et à le rapprocher de votre comptabilité."
      },
      {
        q: "Pourquoi n'est-il pas affiché ?",
        a: 'Aucune ligne dans la balance, ou une recherche ou un intervalle de solde réduit la liste.'
      },
      {
        q: 'Le filtre de période le modifie-t-il ?',
        a: 'Non : il porte sur les soldes actuels.'
      }
    ],
    permissions: { note: 'Demande le droit « Voir les rapports financiers ».' },
    related: [{ label: 'Balance fournisseurs', helpId: 'finance.balance-fournisseurs.page' }],
    keywords: ['total', 'contrôle', 'dette globale']
  },

  // ---------------------------------------------------------------------------
  // Retenues de garantie
  // ---------------------------------------------------------------------------
  {
    id: 'finance.retenues.page',
    kind: 'page',
    title: 'Retenues de garantie',
    summary:
      "Une retenue de garantie met de côté une part de ce que vous devez à un fournisseur ou à un tâcheron, jusqu'à la fin de la garantie. Cet écran la pose, la suit et la libère.",
    purpose:
      "On retient un pourcentage d'une facture fournisseur ou d'une situation de tâcheron validée. L'argent reste dû, mais il n'est exigible qu'une fois la retenue libérée. Libérer ne verse rien : le paiement se fait ensuite par le chemin habituel.",
    steps: [
      { title: 'Poser une retenue', detail: 'Cliquez sur « Poser une retenue » et remplissez le formulaire.' },
      {
        title: 'Suivre',
        detail: 'Les trois cartes du haut donnent le détenu, le déjà libéré et ce qui est en retard.'
      },
      { title: 'Filtrer', detail: 'Statut, chantier, libération prévue et montant de la pièce réduisent la liste.' },
      { title: 'Libérer', detail: 'Sur une retenue détenue, cliquez sur « Libérer » puis « Confirmer la libération ».' }
    ],
    consequences: [
      'Une retenue ne diminue pas le coût du chantier : la pièce reste imputée pour son montant entier. Elle change seulement ce que vous devez maintenant.',
      "Libérer n'est pas payer : le montant redevient exigible et le tiers redevient créancier ; vous le réglez ensuite depuis l'écran des factures fournisseurs.",
      'La date de libération prévue est une prévision : rien ne se libère tout seul.'
    ],
    faq: [
      {
        q: 'Pourquoi ne vois-je pas cet écran ?',
        a: 'Les retenues de garantie sont réservées aux agences dont le pack inclut les chantiers.'
      },
      {
        q: 'Puis-je modifier ou supprimer une retenue ?',
        a: 'Cet écran ne le propose pas : on pose une retenue, puis on la libère.'
      },
      {
        q: 'Le montant retenu est-il saisi ?',
        a: 'Non. Vous saisissez seulement le taux ; le montant est calculé.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Voir demande « Voir les comptes de tiers ». Poser une retenue demande « Créer des pièces financières ». Libérer demande « Valider des pièces financières ».'
    },
    related: [
      { label: 'Indicateurs des retenues', helpId: 'finance.retenues.indicateurs' },
      { label: 'Tableau des retenues', helpId: 'finance.retenues.tableau' },
      { label: 'Poser une retenue', helpId: 'finance.retenues.pose' },
      { label: 'Factures fournisseurs', helpId: 'finance.factures-fournisseurs.page' }
    ],
    keywords: ['retenue de garantie', 'retenue', 'garantie', 'libérer', 'situation', 'tâcheron', '5 %', '10 %']
  },
  {
    id: 'finance.retenues.indicateurs',
    kind: 'section',
    title: 'Indicateurs des retenues',
    summary:
      "Trois cartes résument vos retenues : ce qui est détenu aujourd'hui, ce qui est déjà libéré et ce qui est en retard.",
    howToRead: {
      notes: [
        "« Détenu aujourd'hui » : le total des retenues détenues, en attente de libération.",
        '« Déjà libéré » : le total des retenues libérées. Ce montant est redevenu exigible ; le versement se fait ailleurs.',
        '« En retard » : le total des retenues encore détenues dont la date de libération prévue est dépassée, avec leur nombre.',
        "Les trois chiffres portent sur toutes les retenues de l'agence ; seul le filtre « Chantier » les restreint. Ils ne bougent pas avec le filtre de statut ni de date."
      ]
    },
    steps: [
      {
        title: 'Voir les retenues en retard',
        detail:
          "S'il y en a, cliquez sur la carte « En retard » : le tableau se filtre sur les retenues détenues dont la date prévue est passée."
      }
    ],
    faq: [
      {
        q: 'Que veut dire « En retard » ?',
        a: 'Une retenue encore détenue dont la date de libération prévue est passée. Rien ne la libère automatiquement : à vous de poser le geste.'
      },
      {
        q: 'Pourquoi les chiffres ne changent-ils pas quand je filtre ?',
        a: "Ils portent sur l'ensemble des retenues, sauf le filtre « Chantier » qui les restreint."
      },
      {
        q: "La carte « En retard » n'est pas cliquable.",
        a: "Elle ne l'est que lorsqu'au moins une retenue est en retard."
      }
    ],
    permissions: { feature: 'CONSTRUCTION' },
    related: [{ label: 'Tableau des retenues', helpId: 'finance.retenues.tableau' }],
    keywords: ['détenu', 'libéré', 'en retard', 'indicateurs']
  },
  {
    id: 'finance.retenues.tableau',
    kind: 'table',
    title: 'Tableau des retenues de garantie',
    summary:
      'Chaque ligne est une retenue posée sur une facture fournisseur ou une situation de tâcheron. Vous y libérez les retenues détenues.',
    howToRead: {
      columns: [
        {
          key: 'piece',
          label: 'Pièce retenue',
          description: 'La facture ou la situation sur laquelle la retenue est posée, avec sa nature en dessous.'
        },
        { key: 'tiers', label: 'Tiers', description: 'Le fournisseur ou le tâcheron concerné.' },
        {
          key: 'chantier',
          label: 'Chantier',
          description: "Le chantier de la pièce, ou « Hors chantier » si elle n'en a pas."
        },
        {
          key: 'assiette',
          label: 'Montant de la pièce',
          description:
            "Le montant de la pièce : la base sur laquelle le taux s'applique. Ce n'est pas un coût de chantier diminué."
        },
        { key: 'taux', label: 'Taux', description: 'Le pourcentage retenu.' },
        {
          key: 'retenu',
          label: 'Retenu',
          description: 'Le montant retenu : le montant de la pièce multiplié par le taux, arrondi au franc, puis figé.'
        },
        {
          key: 'prevue',
          label: 'Libération prévue',
          description: "La date prévue de libération. C'est une prévision, pas une échéance automatique."
        },
        {
          key: 'statut',
          label: 'Statut',
          description: '« Détenue » ou « Libérée », avec « En retard » si la date prévue est dépassée.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Libérer » sur une retenue détenue ; « Libérée le » avec la date sur une retenue libérée.'
        }
      ],
      statuses: [
        { value: 'HELD', label: 'Détenue', description: 'Le montant est mis de côté, en attente de libération.' },
        {
          value: 'RELEASED',
          label: 'Libérée',
          description: "Le montant est redevenu exigible. Rien n'a encore été payé."
        },
        {
          value: 'OVERDUE',
          label: 'En retard',
          description: "Retenue détenue dont la date de libération prévue est strictement avant aujourd'hui."
        }
      ]
    },
    steps: [
      { title: 'Filtrer', detail: 'Par statut, chantier, date de libération prévue ou montant de la pièce.' },
      {
        title: 'Libérer',
        detail:
          'Cliquez sur « Libérer » : la fenêtre rappelle que libérer ne verse rien. Confirmez avec « Confirmer la libération ».'
      },
      {
        title: 'Payer ensuite',
        detail:
          "Réglez le tiers depuis l'écran des factures fournisseurs (ou la fiche du tâcheron) par le chemin habituel."
      }
    ],
    consequences: [
      'Libérer est irréversible et ne verse rien. Une écriture comptable est enregistrée (la retenue de garantie diminue, la dette envers le tiers remonte du même montant) et le solde du tiers remonte.',
      'Pour une facture fournisseur, son « reste dû » remonte du montant libéré : la facture redevient proposée à un règlement.',
      'La libération se fait à la date du jour.'
    ],
    faq: [
      {
        q: "J'ai libéré une retenue : où est mon paiement ?",
        a: 'Libérer ne paie pas. Le montant est redevenu exigible : enregistrez un règlement sur la facture du fournisseur.'
      },
      {
        q: 'Peut-on annuler une libération ?',
        a: 'Cet écran ne le propose pas : elle est définitive.'
      },
      {
        q: 'La retenue diminue-t-elle le coût du chantier ?',
        a: "Non. L'ouvrage a coûté son prix entier ; la pièce reste imputée pour son montant entier."
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: '« Libérer » demande le droit « Valider des pièces financières ».'
    },
    related: [
      { label: 'Poser une retenue', helpId: 'finance.retenues.pose' },
      { label: 'Factures fournisseurs', helpId: 'finance.factures-fournisseurs.page' }
    ],
    keywords: ['libérer', 'retenue détenue', 'en retard', 'taux', 'assiette', 'libération prévue']
  },
  {
    id: 'finance.retenues.pose',
    kind: 'section',
    title: 'Poser une retenue de garantie',
    summary:
      'Ce formulaire pose une retenue sur une pièce validée : une facture fournisseur ou une situation de tâcheron. Vous choisissez la pièce, le taux et la date de libération prévue.',
    purpose:
      "Le montant retenu n'est jamais saisi : il se calcule à partir du taux. L'aperçu affiché sous le taux est seulement indicatif.",
    steps: [
      { title: 'Nature de la pièce', detail: '« Facture fournisseur » ou « Situation de tâcheron ».' },
      {
        title: 'Choisir la pièce',
        detail:
          'Pour une facture : le fournisseur, puis la facture validée. Pour une situation : le marché, puis la situation validée.'
      },
      {
        title: 'Taux de retenue',
        detail: 'Un pourcentage strictement compris entre 0 et 100. Le champ accepte de 0,01 à 99,99.'
      },
      { title: 'Date de libération prévue', detail: 'La date à laquelle vous comptez libérer la retenue.' },
      {
        title: 'Poser la retenue',
        detail: "Cliquez sur « Poser la retenue ». En cas de refus, le motif s'affiche en haut de la fenêtre."
      }
    ],
    howToRead: {
      notes: [
        "Montant retenu = montant de la pièce × taux ÷ 100, arrondi au franc. L'aperçu « environ … seraient retenus » est calculé à l'écran ; le montant définitif est décidé par le serveur.",
        'Seules les pièces validées sont proposées.'
      ]
    },
    consequences: [
      "Une pièce ne peut porter qu'une seule retenue.",
      "Sur une facture fournisseur, la retenue est refusée si elle dépasse ce qu'il reste à payer sur la facture.",
      "Une écriture comptable est enregistrée : la dette envers le tiers diminue du montant retenu, qui est porté au compte des retenues de garantie. Le solde du tiers baisse d'autant.",
      'Le coût du chantier ne bouge pas.',
      'Rien ne se libère à la date prévue : la libération reste un geste à poser depuis la liste.'
    ],
    faq: [
      {
        q: "Pourquoi ma facture n'est-elle pas proposée ?",
        a: "Seules les factures validées sont proposées. Validez-la d'abord depuis l'écran des factures fournisseurs."
      },
      {
        q: 'Pourquoi la retenue est-elle refusée ?',
        a: 'Les causes possibles : pièce non validée, retenue déjà posée sur cette pièce, taux hors de 0 à 100, montant nul après arrondi, ou retenue supérieure au reste à payer. Le message affiché précise la raison.'
      },
      {
        q: 'Puis-je saisir le montant à retenir ?',
        a: 'Non, seulement le taux ; le montant est calculé.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande le droit « Créer des pièces financières ».' },
    related: [{ label: 'Tableau des retenues', helpId: 'finance.retenues.tableau' }],
    keywords: ['poser une retenue', 'taux de retenue', 'situation', 'tâcheron', 'marché', 'facture validée']
  }
];

export default entries;
