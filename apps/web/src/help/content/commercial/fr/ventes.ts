import type { HelpEntry } from '../../../types';

/** Zone « ventes » du module « commercial » (fr) : tableau de bord, mandats, offres, compromis, commissions. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------------------
  // Tableau de bord des ventes
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.ventes.tableau-de-bord',
    kind: 'page',
    title: 'Ventes (tableau de bord)',
    summary:
      "Cet écran résume l'activité de vente de votre agence : mandats, offres, compromis et commissions. En dessous, la liste des mandats de vente actifs.",
    purpose:
      "Une vente suit un chemin : un mandat est signé avec le vendeur, des acquéreurs font des offres, une offre acceptée donne un compromis, puis l'acte est signé et la commission devient due. Cet écran vous montre où en est chaque étape.",
    steps: [
      {
        title: 'Créer un mandat',
        detail: "Cliquez sur « Nouveau mandat » : le formulaire de création s'ouvre sur l'écran « Mandats de vente »."
      },
      {
        title: 'Lire les indicateurs',
        detail: "Les sept cartes du haut comptent les mandats, offres, compromis et commissions de toute l'agence."
      },
      {
        title: 'Chercher un mandat actif',
        detail:
          'Utilisez le champ de recherche et les critères au-dessus de la liste, puis cliquez sur le numéro pour ouvrir le mandat.'
      },
      {
        title: 'Voir tous les mandats ou les commissions',
        detail:
          'Les boutons « Tous les mandats » et « Commissions de vente » ouvrent les deux autres écrans des ventes.'
      }
    ],
    consequences: [
      "Cet écran est en lecture seule : rien n'y change l'état d'un mandat, d'une offre ou d'un compromis. Les actions se font sur la fiche du mandat ou du compromis.",
      "Les chiffres se recalculent à chaque ouverture de l'écran ; après une signature d'acte ou un encaissement, ils se mettent à jour dès que vous revenez ici."
    ],
    faq: [
      {
        q: 'Pourquoi un mandat « Expiré » figure-t-il dans les mandats actifs ?',
        a: "Un mandat dont la date d'échéance est passée reste « Actif » tant que personne ne l'a révoqué : il apparaît « Expiré » dans la liste et compte dans « Mandats expirés »."
      },
      {
        q: 'Où sont les mandats révoqués ou vendus ?',
        a: 'Ils ne figurent que dans « Tous les mandats », où vous pouvez filtrer par statut.'
      },
      {
        q: "Je ne vois pas l'écran des ventes ou le bouton « Nouveau mandat ».",
        a: "L'écran demande le droit « Voir les affaires » et le pack Ventes de votre abonnement. Créer un mandat demande en plus « Modifier les affaires »."
      }
    ],
    permissions: {
      feature: 'SALES',
      note: 'Voir : « Voir les affaires ». Créer un mandat ou agir sur une offre ou un compromis : « Modifier les affaires ».'
    },
    related: [
      { label: 'Les indicateurs du tableau de bord', helpId: 'commercial.ventes.tableau-de-bord.indicateurs' },
      { label: 'La liste des mandats actifs', helpId: 'commercial.ventes.tableau-de-bord.mandats' },
      { label: 'Tous les mandats de vente', helpId: 'commercial.ventes.mandats' },
      { label: 'Les commissions de vente', helpId: 'commercial.ventes.commissions' }
    ],
    keywords: [
      'vente',
      'ventes',
      'mandat',
      'offre',
      'compromis',
      'commission',
      'tableau de bord',
      'pipeline',
      'transaction'
    ]
  },
  {
    id: 'commercial.ventes.tableau-de-bord.indicateurs',
    kind: 'section',
    title: 'Indicateurs des ventes',
    summary:
      'Sept cartes comptent ce qui est en cours dans votre agence. Elles ne dépendent pas de la recherche faite dans la liste en dessous.',
    howToRead: {
      notes: [
        "Mandats actifs : nombre de mandats au statut « Actif », avec en dessous la somme de leurs prix demandés. Les mandats dont l'échéance est dépassée mais pas encore révoqués y sont comptés.",
        "Mandats expirés : parmi les mandats actifs, ceux dont l'échéance est dépassée.",
        "Offres ouvertes : offres « Soumise » ou en « Contre-offre » dont la date de validité n'est pas dépassée (ou sans date de validité).",
        "Compromis signés : compromis au statut « Signé », c'est-à-dire dont l'acte n'est pas encore signé, avec la somme de leurs prix convenus.",
        "Ventes ce mois-ci : compromis au statut « Acte signé » dont la date de l'acte tombe dans le mois en cours, avec la somme de leurs prix convenus.",
        'Commissions dues : ce qui reste à encaisser (TTC) sur les commissions « À encaisser » ou « Partiellement encaissée », règlements annulés exclus.',
        'Commissions encaissées ce mois-ci : total des règlements de commission enregistrés (non annulés) dont la date tombe dans le mois en cours.'
      ]
    },
    consequences: [
      'Les cartes ne sont pas cliquables : pour agir, ouvrez les écrans « Tous les mandats » ou « Commissions de vente ».'
    ],
    faq: [
      {
        q: "Un tiret (—) s'affiche à la place du chiffre.",
        a: "Les chiffres sont en cours de chargement. Si un message d'erreur apparaît à la place des cartes, cliquez sur « Réessayer »."
      },
      {
        q: 'Pourquoi « Mandats actifs » compte-t-il des mandats expirés ?',
        a: "Parce qu'un mandat reste « Actif » jusqu'à sa révocation ou à la vente. « Mandats expirés » vous dit combien d'entre eux ont dépassé leur échéance."
      }
    ],
    related: [{ label: 'Commissions de vente', helpId: 'commercial.ventes.commissions' }],
    keywords: [
      'indicateur',
      'chiffres',
      'compteur',
      'mandats actifs',
      'offres ouvertes',
      'commissions dues',
      'ventes du mois'
    ]
  },
  {
    id: 'commercial.ventes.tableau-de-bord.mandats',
    kind: 'table',
    title: 'Mandats de vente actifs',
    summary:
      "Chaque ligne est un mandat de vente au statut « Actif », avec son bien, son vendeur, son prix demandé et son nombre d'offres.",
    howToRead: {
      columns: [
        {
          key: 'numero',
          label: 'Numéro',
          description: 'Le numéro du mandat (MV-année-numéro). Cliquez dessus pour ouvrir la fiche du mandat.'
        },
        { key: 'bien', label: 'Bien', description: 'La référence et le titre du bien à vendre.' },
        { key: 'vendeur', label: 'Vendeur', description: 'Le propriétaire qui a donné le mandat.' },
        {
          key: 'prix',
          label: 'Prix demandé',
          description: "Le prix de vente souhaité, en FCFA. Le prix plancher confidentiel n'est pas affiché ici."
        },
        { key: 'type', label: 'Type', description: '« Simple » ou « Exclusif ».' },
        {
          key: 'echeance',
          label: 'Échéance',
          description: "La date de fin du mandat. Un tiret (—) signifie qu'aucune date de fin n'est enregistrée."
        },
        {
          key: 'offres',
          label: 'Offres',
          description: "Le nombre total d'offres reçues sur ce mandat, quel que soit leur statut."
        },
        { key: 'statut', label: 'Statut', description: "« Actif », ou « Expiré » quand l'échéance est dépassée." }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: 'Le mandat est en cours : vous pouvez enregistrer des offres.'
        },
        {
          value: 'EXPIRED',
          label: 'Expiré',
          description:
            "Le mandat est actif mais sa date d'échéance est passée. Ce n'est pas un statut enregistré : il disparaît si l'échéance change."
        }
      ],
      notes: [
        'Recherche : tapez un numéro, un bien, un vendeur ou un négociateur. Critères : Type de mandat, Échéance, puis sous « Plus de critères » Début du mandat, Prix demandé (FCFA) et Échéance dépassée.',
        "Le bouton d'export (Excel, CSV ou PDF) exporte tous les mandats actifs correspondant à vos critères, pas seulement la page affichée. Sur téléphone, chaque mandat s'affiche en carte."
      ]
    },
    faq: [
      {
        q: 'Pourquoi la colonne Statut ne montre-t-elle que « Actif » ou « Expiré » ?',
        a: 'Cette liste ne reprend que les mandats actifs. Les mandats révoqués ou vendus se consultent dans « Tous les mandats ».'
      },
      {
        q: 'Comment créer un mandat ?',
        a: "Avec le bouton « Nouveau mandat » en haut de la page : il ouvre le formulaire de l'écran « Mandats de vente »."
      }
    ],
    related: [
      { label: 'Créer un mandat de vente', helpId: 'commercial.ventes.mandats.nouveau' },
      { label: "La fiche d'un mandat", helpId: 'commercial.ventes.mandat' }
    ],
    keywords: ['mandat', 'mandats actifs', 'prix demandé', 'vendeur', 'exclusif', 'simple', 'échéance', 'export']
  },

  // ---------------------------------------------------------------------------
  // Mandats de vente (liste)
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.ventes.mandats',
    kind: 'page',
    title: 'Mandats de vente',
    summary:
      "Retrouvez ici tous les mandats de vente de votre agence, quel que soit leur statut. C'est aussi ici que vous créez un nouveau mandat.",
    purpose:
      "Un mandat de vente est l'accord par lequel un propriétaire charge votre agence de vendre son bien, à un prix demandé et avec des honoraires convenus. Chaque mandat a sa fiche, où vous enregistrez les offres des acquéreurs.",
    steps: [
      {
        title: 'Créer un mandat',
        detail: 'Cliquez sur « Nouveau mandat », remplissez le formulaire, puis « Créer le mandat ».'
      },
      {
        title: 'Chercher',
        detail: 'Tapez un numéro, un bien, un vendeur ou un négociateur dans le champ de recherche.'
      },
      {
        title: 'Filtrer',
        detail:
          'Réduisez la liste avec Statut et Type de mandat ; « Plus de critères » ajoute Échéance, Début du mandat, Prix demandé et Échéance dépassée.'
      },
      {
        title: 'Ouvrir un mandat',
        detail:
          'Cliquez sur son numéro (ou sur sa carte, sur téléphone) pour voir ses offres, ses compromis et ses signatures.'
      },
      {
        title: 'Exporter',
        detail: "Le bouton d'export (Excel, CSV ou PDF) exporte tous les mandats correspondant à vos critères."
      }
    ],
    consequences: [
      'Créer un mandat ne change pas le statut du bien : le bien change de statut plus tard, quand une offre est acceptée.',
      "Un bien ne peut porter qu'un seul mandat « Actif » à la fois : un second mandat est refusé tant que le premier n'est ni révoqué ni vendu.",
      "Aucun e-mail ni message n'est envoyé au vendeur à la création. Pour lui faire signer le mandat, passez par l'onglet « Signatures » de la fiche."
    ],
    faq: [
      {
        q: 'Où est le statut « Vendu » dans les filtres ?',
        a: "Dans le critère Statut, il s'appelle « Terminé » ; dans le tableau, le même statut s'affiche « Vendu »."
      },
      {
        q: 'Comment retrouver les mandats arrivés à échéance ?',
        a: 'Ouvrez « Plus de critères » et activez « Échéance dépassée » : la liste ne garde que les mandats actifs dont la date de fin est passée.'
      },
      {
        q: 'Je ne peux pas créer de mandat.',
        a: "Il faut le droit « Modifier les affaires ». Si votre pack est limité à vos propres biens, la création d'un mandat peut aussi être refusée."
      }
    ],
    permissions: {
      feature: 'SALES',
      note: 'Voir : « Voir les affaires ». Créer un mandat : « Modifier les affaires ».'
    },
    related: [
      { label: 'Comment lire le tableau des mandats', helpId: 'commercial.ventes.mandats.tableau' },
      { label: 'Créer un mandat de vente', helpId: 'commercial.ventes.mandats.nouveau' }
    ],
    keywords: [
      'mandat de vente',
      'mandats',
      'vendre un bien',
      'propriétaire',
      'honoraires',
      'exclusif',
      'créer un mandat'
    ],
    tour: {
      steps: [
        {
          target: 'mandats-nouveau',
          title: 'Créer un mandat',
          description: 'Ce bouton ouvre le formulaire : bien, vendeur, prix demandé, honoraires et période.'
        },
        {
          target: 'mandats-tableau',
          title: 'La liste des mandats',
          description: 'Une ligne par mandat. Cliquez sur le numéro pour ouvrir la fiche et gérer les offres.'
        }
      ]
    }
  },
  {
    id: 'commercial.ventes.mandats.tableau',
    kind: 'table',
    title: 'Tableau des mandats de vente',
    summary:
      "Chaque ligne est un mandat de vente de votre agence : bien, vendeur, prix demandé, type, nombre d'offres et statut.",
    howToRead: {
      columns: [
        {
          key: 'numero',
          label: 'Numéro',
          description: 'Le numéro du mandat (MV-année-numéro). Cliquez dessus pour ouvrir la fiche.'
        },
        { key: 'bien', label: 'Bien', description: 'La référence et le titre du bien.' },
        { key: 'vendeur', label: 'Vendeur', description: 'Le propriétaire qui a donné le mandat.' },
        { key: 'prix', label: 'Prix demandé', description: 'Le prix de vente souhaité, en FCFA.' },
        { key: 'type', label: 'Type', description: '« Simple » ou « Exclusif ».' },
        { key: 'offres', label: 'Offres', description: "Le nombre total d'offres reçues, tous statuts confondus." },
        { key: 'statut', label: 'Statut', description: "L'état du mandat (voir les statuts ci-dessous)." }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: 'Le mandat est en cours : les offres peuvent être enregistrées et décidées.'
        },
        {
          value: 'EXPIRED',
          label: 'Expiré',
          description: "Le mandat est encore actif mais sa date d'échéance est passée. Révoquez-le ou faites-le suivre."
        },
        {
          value: 'REVOKED',
          label: 'Révoqué',
          description: "Le mandat a été arrêté avec un motif. Il ne reçoit plus d'offre."
        },
        {
          value: 'COMPLETED',
          label: 'Vendu',
          description:
            "Un acte de vente a été signé : le mandat est terminé. Le critère de recherche l'appelle « Terminé »."
        }
      ],
      notes: [
        'Critères en ligne : Statut et Type de mandat. Sous « Plus de critères » : Échéance, Début du mandat, Prix demandé (FCFA) et Échéance dépassée.',
        "L'export (Excel, CSV ou PDF) reprend tous les mandats correspondant à vos critères. Sur téléphone, chaque mandat s'affiche en carte avec son statut."
      ]
    },
    faq: [
      {
        q: 'Un mandat « Expiré » peut-il encore recevoir des offres ?',
        a: "Oui, tant qu'il n'est pas révoqué : seule la date d'échéance est dépassée, son statut enregistré reste « Actif »."
      },
      {
        q: 'Comment faire disparaître un mandat de la liste ?',
        a: 'Un mandat ne se supprime pas. Révoquez-le depuis sa fiche, puis filtrez sur le statut « Actif » pour ne plus le voir.'
      }
    ],
    related: [{ label: "La fiche d'un mandat", helpId: 'commercial.ventes.mandat' }],
    keywords: ['mandat', 'statut du mandat', 'révoqué', 'vendu', 'expiré', 'prix demandé', 'export']
  },
  {
    id: 'commercial.ventes.mandats.nouveau',
    kind: 'section',
    title: 'Nouveau mandat de vente',
    summary:
      'Ce formulaire enregistre le mandat donné par un propriétaire : bien, vendeur, prix demandé, honoraires, négociateur et période.',
    steps: [
      {
        title: 'Choisir le bien et le vendeur',
        detail:
          'Le vendeur se choisit parmi les propriétaires de votre agence ; le bien se cherche par référence ou titre.'
      },
      { title: 'Choisir le type de mandat', detail: '« Simple » (par défaut) ou « Exclusif ».' },
      {
        title: 'Saisir les prix',
        detail:
          '« Prix demandé » est obligatoire. « Prix plancher (confidentiel) » est facultatif et ne peut pas dépasser le prix demandé.'
      },
      {
        title: 'Régler les honoraires',
        detail:
          'Choisissez « Pourcentage » (taux supérieur à 0 et au plus 20 %) ou « Forfait » (montant en FCFA), puis qui les paie : « Vendeur » ou « Acquéreur ».'
      },
      {
        title: 'Désigner un négociateur',
        detail: "Facultatif : un collaborateur actif de l'agence et sa part, de 0 à 100 %."
      },
      {
        title: 'Fixer la période',
        detail:
          "La date de début est obligatoire (aujourd'hui par défaut) ; la date de fin est facultative et ne peut pas précéder le début."
      },
      { title: 'Créer', detail: "Cliquez sur « Créer le mandat » : la fiche du nouveau mandat s'ouvre." }
    ],
    consequences: [
      'Le mandat reçoit un numéro (MV-année-numéro) et le statut « Actif ». Le statut du bien ne change pas.',
      'La création est refusée si le bien porte déjà un mandat de vente actif.',
      "Les honoraires et la part du négociateur servent plus tard à calculer la commission, quand l'acte de vente est signé. Le prix plancher, les notes et la part du négociateur ne figurent pas dans le PDF du mandat envoyé en signature."
    ],
    faq: [
      {
        q: 'Je ne trouve pas mon vendeur dans la liste.',
        a: "La liste ne contient que les clients de l'agence qui ont le rôle Propriétaire. Convertissez d'abord le contact en propriétaire depuis le CRM."
      },
      {
        q: "Pourquoi le taux d'honoraires est-il refusé ?",
        a: 'Le taux doit être supérieur à 0 et ne pas dépasser 20 %. Au-delà, utilisez un « Forfait ».'
      },
      {
        q: 'Peut-on modifier le mandat après sa création ?',
        a: "Pas depuis cet écran : la fiche du mandat affiche ses informations mais n'a pas de bouton de modification. En cas d'erreur, révoquez le mandat et créez-en un nouveau."
      }
    ],
    permissions: { feature: 'SALES', note: 'Demande le droit « Modifier les affaires ».' },
    related: [{ label: "La fiche d'un mandat", helpId: 'commercial.ventes.mandat' }],
    keywords: [
      'créer un mandat',
      'nouveau mandat',
      'honoraires',
      'prix plancher',
      'négociateur',
      'pourcentage',
      'forfait',
      'vendeur'
    ]
  },

  // ---------------------------------------------------------------------------
  // Fiche d'un mandat
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.ventes.mandat',
    kind: 'page',
    title: "Fiche d'un mandat de vente",
    summary:
      'Cette fiche réunit les conditions du mandat et suit la vente : offres des acquéreurs, compromis, signatures et historique.',
    purpose:
      "C'est ici que vous enregistrez chaque offre, répondez par une contre-offre, acceptez ou refusez, puis créez le compromis à partir de l'offre acceptée. Le haut de la fiche rappelle le bien, le vendeur, les prix, les honoraires et les dates.",
    steps: [
      {
        title: 'Lire les conditions',
        detail:
          'Le cadre du haut montre le bien, le vendeur, le prix demandé, le prix plancher, les honoraires, le négociateur, la signature et la période.'
      },
      { title: 'Enregistrer une offre', detail: 'Onglet « Offres », bouton « Nouvelle offre ».' },
      {
        title: 'Répondre à une offre',
        detail: "Sur la ligne de l'offre : « Contre-offre », « Accepter » ou « Refuser »."
      },
      {
        title: 'Créer le compromis',
        detail: "Sur une offre « Acceptée », cliquez sur « Créer le compromis » ; la fiche du compromis s'ouvre."
      },
      { title: 'Faire signer le mandat', detail: 'Onglet « Signatures », bouton « Envoyer pour signature ».' },
      { title: 'Arrêter le mandat', detail: "Menu d'actions de l'en-tête, « Révoquer le mandat », avec un motif." }
    ],
    consequences: [
      "Accepter une offre passe le bien à « Réservé ». Un compromis signé le passe à « Sous offre », et l'acte signé à « Vendu ».",
      "Quand l'acte est signé, le mandat devient « Vendu » et les offres encore en attente passent à « Refusée ».",
      "Un mandat « Vendu » ou « Révoqué » est clos : on n'y décide plus d'offre et on n'en ajoute plus."
    ],
    faq: [
      {
        q: 'Pourquoi « Nouvelle offre » est-il grisé ?',
        a: "Le mandat n'est plus « Actif » : il est vendu ou révoqué. Les offres ne s'ajoutent que sur un mandat actif."
      },
      {
        q: "Pourquoi n'y a-t-il pas de bouton « Révoquer le mandat » ?",
        a: "Il n'apparaît que sur un mandat « Actif » dont aucun compromis n'est au statut « Signé »."
      },
      {
        q: 'Où se modifie le prix du mandat ?',
        a: 'Cette fiche ne permet pas de le modifier. Pour changer les conditions, révoquez le mandat et créez-en un nouveau.'
      }
    ],
    permissions: {
      feature: 'SALES',
      note: 'Voir : « Voir les affaires ». Offres, compromis, signatures et révocation : « Modifier les affaires ».'
    },
    related: [
      { label: 'Les conditions du mandat', helpId: 'commercial.ventes.mandat.fiche' },
      { label: 'Les offres reçues', helpId: 'commercial.ventes.mandat.offres' },
      { label: 'Le compromis de vente', helpId: 'commercial.ventes.compromis' },
      { label: 'Révoquer le mandat', helpId: 'commercial.ventes.mandat.revoquer' }
    ],
    keywords: ['mandat', 'offre', 'acquéreur', 'contre-offre', 'révoquer', 'compromis', 'vendeur', 'prix plancher'],
    tour: {
      steps: [
        {
          target: 'mandat-fiche',
          title: 'Les conditions du mandat',
          description:
            'Bien, vendeur, prix, honoraires, négociateur et dates. Le prix plancher reste visible ici seulement.'
        },
        {
          target: 'mandat-nouvelle-offre',
          title: 'Enregistrer une offre',
          description: "Saisissez l'acquéreur, le montant et le financement d'une offre reçue."
        },
        {
          target: 'mandat-offres',
          title: 'Répondre aux offres',
          description:
            "Contre-offre, acceptation ou refus se font sur la ligne de l'offre. Une offre acceptée permet de créer le compromis."
        },
        {
          target: 'mandat-onglets',
          title: 'Compromis, signatures, historique',
          description:
            "Changez d'onglet pour suivre le compromis, envoyer le mandat en signature ou voir ses dates clés."
        }
      ]
    }
  },
  {
    id: 'commercial.ventes.mandat.fiche',
    kind: 'section',
    title: 'Conditions du mandat',
    summary:
      'Le cadre du haut de la fiche récapitule le mandat : bien, vendeur, type, statut, prix, honoraires, négociateur, signature et dates.',
    howToRead: {
      notes: [
        "Prix demandé et Prix plancher : le prix plancher est confidentiel, il n'est pas imprimé dans le PDF du mandat. Un tiret (—) signifie qu'il n'est pas renseigné.",
        "Honoraires : « 5 % (Vendeur) » veut dire un pourcentage du prix convenu payé par le vendeur ; « Forfait … (Acquéreur) » un montant fixe payé par l'acquéreur.",
        'Signature : « Signé le … » une fois le mandat signé par voie électronique ; sinon « Non signé ».',
        'Statut : « Actif », « Expiré » (échéance dépassée), « Révoqué » ou « Vendu ».',
        'Co-vendeurs (indivision) : quand le bien a plusieurs propriétaires, un tableau en dessous liste chaque indivisaire avec sa quote-part en %.'
      ]
    },
    faq: [
      {
        q: 'Qui voit le prix plancher ?',
        a: "Toute personne de l'agence qui peut ouvrir la fiche. Il n'apparaît ni dans le PDF du mandat ni dans les listes."
      },
      {
        q: "Pourquoi le statut est « Expiré » alors que je n'ai rien fait ?",
        a: "La date d'échéance est passée. Le mandat reste actif tant que vous ne le révoquez pas."
      }
    ],
    related: [{ label: 'Révoquer le mandat', helpId: 'commercial.ventes.mandat.revoquer' }],
    keywords: [
      'conditions',
      'honoraires',
      'prix plancher',
      'co-vendeurs',
      'indivision',
      'négociateur',
      'signature du mandat'
    ]
  },
  {
    id: 'commercial.ventes.mandat.offres',
    kind: 'table',
    title: 'Offres reçues sur le mandat',
    summary:
      "Chaque ligne est une offre d'acquéreur sur ce mandat. Vous y répondez par une contre-offre, une acceptation ou un refus.",
    howToRead: {
      columns: [
        { key: 'numero', label: 'Numéro', description: "Le numéro de l'offre (OA-année-numéro)." },
        { key: 'acquereur', label: 'Acquéreur', description: "Le contact du CRM qui fait l'offre." },
        { key: 'montant', label: 'Montant', description: 'Le montant proposé, en FCFA.' },
        {
          key: 'contre-offre',
          label: 'Contre-offre',
          description: "Le montant que vous avez proposé en retour, ou un tiret (—) s'il n'y en a pas."
        },
        { key: 'financement', label: 'Financement', description: '« Comptant », « Crédit » ou « Mixte ».' },
        { key: 'statut', label: 'Statut', description: "L'état de l'offre (voir les statuts ci-dessous)." },
        {
          key: 'actions',
          label: 'Actions',
          description:
            "Les réponses possibles selon le statut ; « Voir le compromis » quand l'offre a déjà un compromis."
        }
      ],
      statuses: [
        { value: 'SUBMITTED', label: 'Soumise', description: "L'offre attend votre réponse." },
        {
          value: 'COUNTERED',
          label: 'Contre-offre',
          description:
            "Vous avez proposé un autre montant. L'offre peut encore être acceptée, refusée ou recevoir une nouvelle contre-offre."
        },
        {
          value: 'ACCEPTED',
          label: 'Acceptée',
          description:
            "L'offre est retenue et le bien est « Réservé ». Le prix convenu est le montant de la contre-offre s'il y en a une, sinon le montant de l'offre."
        },
        {
          value: 'REJECTED',
          label: 'Refusée',
          description: 'Refusée avec un motif, ou fermée automatiquement quand le mandat est vendu ou révoqué.'
        },
        {
          value: 'WITHDRAWN',
          label: 'Retirée',
          description:
            "L'offre a été retirée avec un motif. Un retrait n'est possible que sur une offre acceptée qui n'a pas de compromis en cours."
        },
        {
          value: 'EXPIRED',
          label: 'Expirée',
          description:
            "Statut affiché quand la date « Valable jusqu'au » est passée sur une offre « Soumise » ou en « Contre-offre ». Ce n'est pas un statut enregistré."
        }
      ],
      notes: [
        'Avec plus de 10 offres, une barre de recherche (numéro, acquéreur, financement) et des critères Statut, Financement et Montant apparaissent au-dessus du tableau.',
        "Les boutons de réponse ne s'affichent que sur un mandat « Actif »."
      ]
    },
    steps: [
      { title: "Enregistrer l'offre", detail: "« Nouvelle offre » en haut de l'onglet." },
      {
        title: 'Répondre',
        detail:
          "« Contre-offre » demande un montant ; « Refuser » demande un motif d'au moins 3 caractères ; « Accepter » demande une confirmation."
      },
      { title: 'Passer au compromis', detail: 'Sur une offre « Acceptée », « Créer le compromis ».' }
    ],
    consequences: [
      '« Accepter » passe le bien à « Réservé ». Une seule offre acceptée est possible à la fois sur un mandat, sauf si le compromis de la première est annulé.',
      '« Retirer » (offre acceptée sans compromis en cours) remet le bien à « Disponible » et demande un motif.',
      "Aucun e-mail ni message n'est envoyé à l'acquéreur : prévenez-le vous-même."
    ],
    faq: [
      {
        q: 'Je ne vois pas les boutons de réponse.',
        a: "Ils n'apparaissent que sur un mandat « Actif » et sur une offre « Soumise », en « Contre-offre » ou « Acceptée ». Ils demandent aussi le droit « Modifier les affaires »."
      },
      {
        q: 'Que devient une offre dont le compromis est annulé ?',
        a: 'Elle reste « Acceptée » mais son compromis est annulé : vous pouvez alors accepter une autre offre du mandat.'
      },
      {
        q: "Peut-on corriger le montant d'une offre ?",
        a: "Non. Faites une contre-offre, ou refusez l'offre et enregistrez-en une nouvelle."
      }
    ],
    related: [
      { label: 'Enregistrer une offre', helpId: 'commercial.ventes.mandat.nouvelle-offre' },
      { label: 'Répondre à une offre', helpId: 'commercial.ventes.mandat.decision' },
      { label: 'Créer le compromis', helpId: 'commercial.ventes.mandat.creer-compromis' }
    ],
    keywords: [
      'offre',
      'offres',
      'acquéreur',
      'contre-offre',
      'accepter',
      'refuser',
      'retirer',
      'financement',
      'réservé'
    ]
  },
  {
    id: 'commercial.ventes.mandat.nouvelle-offre',
    kind: 'section',
    title: 'Nouvelle offre',
    summary: "Ce formulaire enregistre l'offre d'un acquéreur sur le mandat. L'offre part avec le statut « Soumise ».",
    steps: [
      { title: "Choisir l'acquéreur", detail: 'Obligatoire : un contact de votre CRM, qui se cherche par nom.' },
      {
        title: 'Lier une affaire',
        detail: "Facultatif : « Affaire CRM d'origine » propose les affaires encore ouvertes de cet acquéreur."
      },
      { title: 'Saisir le montant', detail: 'Montant en FCFA, supérieur à 0.' },
      { title: 'Choisir le financement', detail: '« Comptant » (par défaut), « Crédit » ou « Mixte ».' },
      {
        title: 'Préciser la validité et les conditions',
        detail: "« Valable jusqu'au » et « Conditions » sont facultatifs."
      },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer ».' }
    ],
    consequences: [
      "L'offre reçoit un numéro (OA-année-numéro) et le statut « Soumise ». Elle compte dans « Offres ouvertes » du tableau de bord tant que sa date de validité n'est pas dépassée.",
      "Le statut du bien ne change pas et aucun message n'est envoyé à l'acquéreur.",
      "Si vous liez une affaire CRM, elle passe à l'étape « Gagné » quand l'acte de vente est signé."
    ],
    faq: [
      {
        q: "Pourquoi l'acquéreur n'est-il pas dans la liste ?",
        a: "Il doit d'abord exister comme contact dans votre CRM. Créez-le, puis revenez enregistrer l'offre."
      },
      {
        q: "À quoi sert « Valable jusqu'au » ?",
        a: "Passé cette date, l'offre s'affiche « Expirée » et n'est plus comptée dans « Offres ouvertes »."
      }
    ],
    permissions: { feature: 'SALES', note: 'Demande le droit « Modifier les affaires ».' },
    related: [{ label: 'Offres reçues sur le mandat', helpId: 'commercial.ventes.mandat.offres' }],
    keywords: ['nouvelle offre', 'acquéreur', 'montant', 'financement', 'comptant', 'crédit', 'validité']
  },
  {
    id: 'commercial.ventes.mandat.decision',
    kind: 'section',
    title: 'Répondre à une offre',
    summary: 'Cette fenêtre enregistre votre réponse à une offre : contre-offre, acceptation, refus ou retrait.',
    steps: [
      { title: 'Contre-offre', detail: 'Saisissez le montant que vous proposez en retour, puis « Confirmer ».' },
      { title: 'Accepter', detail: "Confirmez : l'offre est retenue et le bien passe « Réservé »." },
      { title: 'Refuser ou Retirer', detail: "Indiquez un motif d'au moins 3 caractères, puis « Confirmer »." }
    ],
    consequences: [
      "Une contre-offre met l'offre en « Contre-offre » ; si vous l'acceptez ensuite, le prix convenu est le montant de la contre-offre.",
      "Un refus est définitif : l'offre passe à « Refusée » et ne se rouvre pas. Un retrait passe l'offre à « Retirée » et remet le bien à « Disponible ».",
      "Aucun message n'est envoyé à l'acquéreur. Chaque décision garde sa date, son auteur et son motif."
    ],
    faq: [
      {
        q: "Pourquoi « Retirer » n'est-il proposé que sur une offre acceptée ?",
        a: "Les offres en attente se traitent par « Refuser ». « Retirer » sert à défaire une acceptation, tant que le compromis n'est pas créé."
      },
      {
        q: 'Puis-je annuler un refus par erreur ?',
        a: "Non. Enregistrez une nouvelle offre au nom de l'acquéreur."
      }
    ],
    permissions: { feature: 'SALES', note: 'Demande le droit « Modifier les affaires ».' },
    related: [{ label: 'Offres reçues sur le mandat', helpId: 'commercial.ventes.mandat.offres' }],
    keywords: ['contre-offre', 'accepter', 'refuser', 'retirer', 'décision', 'réservé']
  },
  {
    id: 'commercial.ventes.mandat.creer-compromis',
    kind: 'section',
    title: 'Créer le compromis',
    summary:
      "Cette fenêtre crée le compromis de vente à partir d'une offre acceptée, avec le prix convenu, le dépôt, le notaire et la date prévue de l'acte.",
    steps: [
      {
        title: 'Vérifier le prix convenu',
        detail: "Il est prérempli avec le montant de la contre-offre, sinon celui de l'offre."
      },
      {
        title: 'Renseigner le dépôt',
        detail:
          "Le « Dépôt de l'acquéreur » est facultatif ; « Dépôt détenu par » propose « Notaire » (par défaut) ou « Vendeur »."
      },
      { title: 'Ajouter le notaire et la date', detail: "« Notaire » et « Date prévue de l'acte » sont facultatifs." },
      { title: 'Créer', detail: "Cliquez sur « Créer » : la fiche du compromis s'ouvre." }
    ],
    consequences: [
      'Le compromis naît au statut « Brouillon » (numéro CV-année-numéro). Le statut du bien ne change pas encore : il passera à « Sous offre » à la signature du compromis.',
      "Un seul compromis est possible par offre. Ce qui est saisi ici reste modifiable depuis la fiche du compromis, jusqu'à l'acte signé ou à l'annulation."
    ],
    faq: [
      {
        q: "Pourquoi n'y a-t-il pas de bouton « Créer le compromis » ?",
        a: "Il n'apparaît que sur une offre « Acceptée » qui n'a pas encore de compromis, sur un mandat « Actif »."
      }
    ],
    permissions: { feature: 'SALES', note: 'Demande le droit « Modifier les affaires ».' },
    related: [{ label: 'La fiche du compromis', helpId: 'commercial.ventes.compromis' }],
    keywords: ['compromis', 'créer le compromis', 'prix convenu', 'dépôt', 'notaire', 'offre acceptée']
  },
  {
    id: 'commercial.ventes.mandat.compromis',
    kind: 'section',
    title: 'Onglet Compromis du mandat',
    summary:
      'Cet onglet liste les compromis de vente nés des offres de ce mandat, avec leur prix, leur acquéreur et leur statut.',
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: 'Compromis créé, pas encore signé.' },
        { value: 'SIGNED', label: 'Signé', description: "Compromis signé ; l'acte n'est pas encore passé." },
        { value: 'COMPLETED', label: 'Acte signé', description: "L'acte authentique est signé : le bien est vendu." },
        { value: 'CANCELLED', label: 'Annulé', description: 'Compromis annulé avec un motif.' }
      ]
    },
    steps: [{ title: 'Ouvrir un compromis', detail: 'Cliquez sur « Ouvrir » à droite de la ligne.' }],
    consequences: [
      "Si aucun compromis n'existe, l'onglet explique qu'il se crée depuis l'onglet « Offres », une fois une offre acceptée."
    ],
    related: [{ label: 'La fiche du compromis', helpId: 'commercial.ventes.compromis' }],
    keywords: ['compromis', 'promesse de vente', 'onglet compromis']
  },
  {
    id: 'commercial.ventes.mandat.signatures',
    kind: 'section',
    title: 'Signatures du mandat',
    summary:
      'Cet onglet envoie le mandat de vente en signature électronique au vendeur, à ses co-vendeurs et au négociateur, et garde la trace des demandes.',
    steps: [
      {
        title: 'Envoyer pour signature',
        detail:
          'Cliquez sur « Envoyer pour signature », vérifiez les signataires proposés (vendeur, co-vendeurs, négociateur) puis envoyez.'
      },
      {
        title: 'Suivre la demande',
        detail:
          'Chaque demande affiche ses signataires. Vous pouvez « Relancer », « Annuler la demande » ou « Signer sur place ».'
      },
      {
        title: 'Télécharger',
        detail: '« PDF source » donne le document envoyé ; « PDF signé » est proposé une fois la signature terminée.'
      }
    ],
    consequences: [
      "Chaque signataire est invité par le canal choisi à l'envoi (e-mail par défaut). Le PDF est produit à la volée à partir des données du mandat ; le prix plancher, les notes et la part du négociateur n'y figurent jamais.",
      'Une fois la signature terminée, la fiche affiche « Signé le … » à la ligne « Signature ». Un mandat signé ne se renvoie pas en signature.',
      'Seul un mandat « Actif » peut être envoyé en signature, et une demande ouverte à la fois.'
    ],
    faq: [
      {
        q: 'Le bouton « Envoyer pour signature » est grisé.',
        a: "Une demande est déjà ouverte (relancez-la ou annulez-la), ou le mandat n'est plus actif, ou vous n'avez pas le droit « Modifier les affaires »."
      },
      {
        q: 'Où voir le document signé ?',
        a: 'Dans la demande, avec le bouton « PDF signé », disponible quand tous les signataires ont signé.'
      }
    ],
    permissions: { feature: 'SALES', note: 'Envoi et annulation : « Modifier les affaires ».' },
    related: [{ label: 'La fiche du mandat', helpId: 'commercial.ventes.mandat' }],
    keywords: ['signature', 'signer le mandat', 'signature électronique', 'vendeur', 'co-vendeur', 'pdf signé']
  },
  {
    id: 'commercial.ventes.mandat.revoquer',
    kind: 'section',
    title: 'Révoquer le mandat',
    summary: "Cette fenêtre arrête un mandat de vente actif. Elle demande un motif d'au moins 3 caractères.",
    steps: [
      { title: 'Ouvrir la fenêtre', detail: "Dans l'en-tête de la fiche, choisissez « Révoquer le mandat »." },
      { title: 'Saisir le motif', detail: 'Au moins 3 caractères.' },
      { title: 'Confirmer', detail: 'Cliquez sur « Révoquer ».' }
    ],
    consequences: [
      "L'action est définitive : le mandat passe à « Révoqué » et ne se rouvre pas. Il reste consultable avec son motif, dans l'onglet « Historique ».",
      'Les offres encore en attente passent à « Refusée » (motif « Mandat révoqué ») et les demandes de signature ouvertes sont annulées.',
      "La révocation est refusée si une offre acceptée est encore en cours (retirez-la d'abord) ou si un compromis est « Signé »."
    ],
    faq: [
      {
        q: "Pourquoi « Révoquer le mandat » n'apparaît-il pas ?",
        a: "Le mandat n'est plus « Actif », ou un compromis est déjà signé. Dans ce dernier cas, annulez d'abord le compromis."
      },
      {
        q: 'Le vendeur est-il prévenu ?',
        a: "Non, aucun message n'est envoyé. Informez-le vous-même."
      }
    ],
    permissions: { feature: 'SALES', note: 'Demande le droit « Modifier les affaires ».' },
    related: [{ label: 'La fiche du mandat', helpId: 'commercial.ventes.mandat' }],
    keywords: ['révoquer', 'révocation', 'arrêter un mandat', 'annuler un mandat', 'motif']
  },

  // ---------------------------------------------------------------------------
  // Fiche d'un compromis
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.ventes.compromis',
    kind: 'page',
    title: "Fiche d'un compromis de vente",
    summary:
      "Cette fiche suit le compromis de bout en bout : prix, dépôt, notaire, conditions suspensives, échéancier de l'acquéreur, signatures, acte et commission.",
    purpose:
      "Le compromis fixe les termes de la vente entre le vendeur et l'acquéreur avant l'acte chez le notaire. Il passe de « Brouillon » à « Signé », puis à « Acte signé » quand la vente est conclue.",
    steps: [
      {
        title: 'Compléter le compromis',
        detail: "Renseignez prix, dépôt, notaire et date prévue de l'acte, puis « Enregistrer »."
      },
      {
        title: 'Lister les conditions suspensives',
        detail: 'Ajoutez-les en brouillon avec « Ajouter » (ex. obtention du prêt bancaire).'
      },
      {
        title: 'Prévoir les paiements',
        detail: "Saisissez l'échéancier de l'acquéreur, puis « Enregistrer l'échéancier »."
      },
      {
        title: 'Faire signer',
        detail:
          'Envoyez le compromis en signature électronique, ou cliquez sur « Signer le compromis » pour enregistrer une signature déjà faite.'
      },
      {
        title: "Passer à l'acte",
        detail: "Une fois les conditions remplies ou levées, « Passer à l'acte » avec la date de l'acte authentique."
      }
    ],
    consequences: [
      'Signer le compromis passe le bien à « Sous offre ». Annuler le compromis (brouillon ou signé) remet le bien à « Disponible ».',
      "Passer à l'acte est la conclusion de la vente : le bien passe à « Vendu », le mandat à « Vendu », les offres encore en attente à « Refusée », l'affaire CRM liée à l'offre à « Gagné », et la commission est créée.",
      "Ces opérations ne sont pas annulables depuis l'écran. Aucun e-mail ni message n'est envoyé au vendeur ou à l'acquéreur par ces boutons."
    ],
    faq: [
      {
        q: "Pourquoi « Passer à l'acte » est-il grisé ?",
        a: 'Une condition suspensive est encore « En attente » ou « Échouée ». Toutes doivent être « Remplie » ou « Levée ».'
      },
      {
        q: 'Pourquoi « Signer le compromis » est-il grisé ?',
        a: "Une demande de signature électronique est ouverte : annulez-la d'abord, sinon laissez-la aller à son terme."
      },
      {
        q: "Que devient la commission si j'annule ?",
        a: "Elle n'existe pas encore : la commission n'est créée qu'au passage à l'acte. Un compromis annulé n'en génère aucune."
      },
      {
        q: 'Peut-on modifier un compromis signé ?',
        a: "Oui, jusqu'à l'acte : prix, dépôt, notaire, date et échéancier restent modifiables. Après « Acte signé » ou « Annulé », la fiche est figée."
      }
    ],
    permissions: {
      feature: 'SALES',
      note: 'Voir : « Voir les affaires ». Toutes les actions : « Modifier les affaires ».'
    },
    related: [
      { label: 'Prix, dépôt et notaire', helpId: 'commercial.ventes.compromis.prix-depot' },
      { label: 'Conditions suspensives', helpId: 'commercial.ventes.compromis.conditions' },
      { label: "Échéancier de l'acquéreur", helpId: 'commercial.ventes.compromis.echeancier' },
      { label: "Signer, passer à l'acte, annuler", helpId: 'commercial.ventes.compromis.etapes' },
      { label: 'La commission', helpId: 'commercial.ventes.compromis.commission' }
    ],
    keywords: [
      'compromis',
      'promesse de vente',
      'acte authentique',
      'notaire',
      'conditions suspensives',
      'échéancier',
      'signer',
      'annuler'
    ],
    tour: {
      steps: [
        {
          target: 'compromis-etapes',
          title: 'Où en est la vente',
          description:
            'La frise montre Brouillon, Signé puis Acte avec les dates. Un compromis annulé affiche un bandeau rouge à la place.'
        },
        {
          target: 'compromis-conditions',
          title: 'Les conditions suspensives',
          description: "Chaque condition doit être « Remplie » ou « Levée » avant de passer à l'acte."
        },
        {
          target: 'compromis-echeancier',
          title: "L'échéancier de l'acquéreur",
          description: "Saisissez les paiements prévus, puis enregistrez l'échéancier."
        },
        {
          target: 'compromis-actions',
          title: "Signer ou passer à l'acte",
          description:
            "« Signer le compromis » en brouillon ; « Passer à l'acte » une fois signé et les conditions réglées."
        },
        {
          target: 'compromis-commission',
          title: 'La commission',
          description: "Elle apparaît ici après la signature de l'acte."
        }
      ]
    }
  },
  {
    id: 'commercial.ventes.compromis.prix-depot',
    kind: 'section',
    title: 'Prix, dépôt et notaire',
    summary:
      "Ce formulaire fixe les termes du compromis : prix convenu, dépôt de l'acquéreur, qui le détient, notaire et date prévue de l'acte.",
    howToRead: {
      notes: [
        "Prix convenu : le prix de la vente, en FCFA. C'est la base du calcul de la commission.",
        "Dépôt de l'acquéreur : la somme versée à la signature, facultative. « Dépôt détenu par » : « Notaire » ou « Vendeur ».",
        "Date prévue de l'acte : une prévision, qui ne bloque rien ; la date réelle se saisit au passage à l'acte."
      ]
    },
    steps: [{ title: 'Modifier', detail: 'Changez les champs puis cliquez sur « Enregistrer ».' }],
    consequences: [
      'Le formulaire est modifiable tant que le compromis est « Brouillon » ou « Signé » ; il est figé après « Acte signé » ou « Annulé ».',
      'Si le compromis a été envoyé en signature et que vous changez prix, dépôt, notaire ou date prévue, la demande de signature ouverte est annulée : renvoyez-la.'
    ],
    faq: [
      {
        q: 'Les champs sont grisés.',
        a: 'Le compromis est « Acte signé » ou « Annulé » : il ne se modifie plus.'
      },
      {
        q: 'Changer le prix change-t-il la commission ?',
        a: "Oui, si vous le faites avant l'acte : la commission est calculée sur le prix convenu au moment du passage à l'acte."
      }
    ],
    permissions: { feature: 'SALES', note: 'Demande le droit « Modifier les affaires ».' },
    related: [{ label: 'La commission', helpId: 'commercial.ventes.compromis.commission' }],
    keywords: ['prix convenu', 'dépôt', 'acompte', 'notaire', "date de l'acte"]
  },
  {
    id: 'commercial.ventes.compromis.signatures',
    kind: 'section',
    title: 'Signatures du compromis',
    summary:
      "Cette carte envoie le compromis en signature électronique au vendeur, à l'acquéreur et au négociateur, et garde la trace des demandes.",
    steps: [
      {
        title: 'Envoyer pour signature',
        detail:
          'Disponible tant que le compromis est « Brouillon » : « Envoyer pour signature », vérifiez les signataires, puis envoyez.'
      },
      {
        title: 'Suivre',
        detail: "« Relancer », « Annuler la demande » ou « Signer sur place » selon l'état de chaque signataire."
      },
      { title: 'Télécharger', detail: '« PDF source » et, une fois signé, « PDF signé ».' }
    ],
    consequences: [
      'Quand tous ont signé, le compromis passe à « Signé » tout seul et le bien à « Sous offre », comme avec « Signer le compromis ».',
      "Toute modification d'un champ imprimé (prix, dépôt, notaire, date prévue, conditions, échéancier) après l'envoi annule la demande ouverte.",
      "Si votre agence exige un prestataire de signature qualifié, un avertissement le dit et l'envoi est désactivé : dans ce cas, utilisez « Signer le compromis » après une signature sur papier."
    ],
    faq: [
      {
        q: "Pourquoi l'envoi est-il désactivé ?",
        a: "Le compromis n'est plus « Brouillon », une demande est déjà ouverte, ou un prestataire qualifié est requis (avertissement affiché dans la carte)."
      },
      {
        q: "Où sont les signatures d'un compromis signé ou conclu ?",
        a: "Dans cette même carte, l'historique des demandes reste affiché ; elle disparaît seulement si le compromis est annulé."
      }
    ],
    permissions: { feature: 'SALES', note: 'Envoi et annulation : « Modifier les affaires ».' },
    related: [{ label: "Signer, passer à l'acte, annuler", helpId: 'commercial.ventes.compromis.etapes' }],
    keywords: ['signature électronique', 'signer le compromis', 'pdf signé', 'relancer', 'signataires']
  },
  {
    id: 'commercial.ventes.compromis.conditions',
    kind: 'table',
    title: 'Conditions suspensives',
    summary:
      "Les conditions suspensives sont ce qui doit se réaliser pour que la vente aille à son terme, par exemple l'obtention du prêt bancaire.",
    howToRead: {
      columns: [
        { key: 'label', label: 'Condition', description: 'Le texte de la condition.' },
        {
          key: 'echeance',
          label: 'Échéance',
          description: "La date limite prévue, ou un tiret (—) s'il n'y en a pas."
        },
        {
          key: 'statut',
          label: 'Statut',
          description: "Un menu pour changer l'état tant que le compromis est modifiable ; sinon l'état en texte."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Supprimer », possible seulement tant que le compromis est « Brouillon ».'
        }
      ],
      statuses: [
        {
          value: 'PENDING',
          label: 'En attente',
          description: "La condition n'est pas encore réglée. Elle bloque le passage à l'acte."
        },
        {
          value: 'MET',
          label: 'Remplie',
          description:
            "La condition est réalisée. Elle ne bloque plus. Une fois le compromis figé, l'état s'affiche « Réalisée »."
        },
        {
          value: 'FAILED',
          label: 'Échouée',
          description:
            "La condition ne s'est pas réalisée. Elle bloque le passage à l'acte. Une fois le compromis figé, l'état s'affiche « Défaillie »."
        },
        {
          value: 'WAIVED',
          label: 'Levée',
          description:
            "On renonce à la condition. Elle ne bloque plus. Une fois le compromis figé, l'état s'affiche « Renoncée »."
        }
      ]
    },
    steps: [
      {
        title: 'Ajouter',
        detail: 'En brouillon, « Ajouter » ouvre une fenêtre : libellé obligatoire, échéance facultative.'
      },
      { title: 'Mettre à jour', detail: 'Changez le statut dans le menu de la ligne.' }
    ],
    consequences: [
      "On ne peut passer à l'acte que si toutes les conditions sont « Remplie » ou « Levée ».",
      "Ajouter ou supprimer une condition, ou changer son libellé ou son échéance, annule la demande de signature ouverte ; changer seulement son statut ne l'annule pas.",
      'Une condition ne se supprime que tant que le compromis est « Brouillon ».'
    ],
    faq: [
      {
        q: "Je n'ai pas de bouton « Ajouter ».",
        a: "Il n'est proposé qu'en « Brouillon ». Après la signature, on ne peut plus que changer le statut des conditions existantes."
      },
      {
        q: 'Une condition est « Échouée » : que faire ?',
        a: "Le passage à l'acte reste bloqué. Passez-la à « Levée » si les parties y renoncent, ou annulez le compromis."
      }
    ],
    related: [{ label: "Signer, passer à l'acte, annuler", helpId: 'commercial.ventes.compromis.etapes' }],
    keywords: ['condition suspensive', 'prêt bancaire', 'obtention du prêt', 'levée', 'remplie', "bloque l'acte"]
  },
  {
    id: 'commercial.ventes.compromis.echeancier',
    kind: 'section',
    title: "Échéancier de l'acquéreur",
    summary:
      "Cette carte note les paiements que l'acquéreur doit faire (dépôt, solde...) avec leur date et leur montant.",
    howToRead: {
      columns: [
        { key: 'label', label: 'Libellé', description: "Le nom du paiement, par exemple « Solde à l'acte »." },
        { key: 'dueDate', label: 'Échéance', description: 'La date prévue du paiement.' },
        { key: 'amount', label: 'Montant', description: 'Le montant du paiement, en FCFA.' },
        {
          key: 'paidAt',
          label: 'Payée le',
          description: "La date à laquelle l'acquéreur a payé, à renseigner à la main."
        }
      ],
      notes: [
        "Le total des lignes s'affiche à côté des boutons. Un avertissement apparaît si ce total dépasse le prix convenu."
      ]
    },
    steps: [
      { title: 'Ajouter', detail: '« Ajouter une échéance » crée une ligne vide à remplir.' },
      { title: 'Supprimer une ligne', detail: 'Le bouton rouge à droite de la ligne la retire.' },
      { title: 'Enregistrer', detail: "« Enregistrer l'échéancier » envoie toute la liste d'un coup." }
    ],
    consequences: [
      "Rien n'est sauvegardé tant que vous n'avez pas cliqué sur « Enregistrer l'échéancier ». L'enregistrement remplace toute la liste ; une ligne sans libellé ou sans montant supérieur à 0 est refusée.",
      "L'échéancier est un suivi : il n'encaisse rien et ne crée aucune écriture comptable.",
      "Changer le libellé, l'échéance ou le montant d'une ligne annule la demande de signature ouverte ; la date « Payée le » n'est pas imprimée."
    ],
    faq: [
      {
        q: 'Le total dépasse le prix, puis-je enregistrer ?',
        a: "Oui, l'avertissement n'est pas bloquant : vérifiez toutefois vos montants."
      },
      {
        q: "L'échéancier est-il pris en compte dans la commission ?",
        a: "Non. La commission se calcule sur le prix convenu, pas sur l'échéancier."
      }
    ],
    permissions: { feature: 'SALES', note: 'Demande le droit « Modifier les affaires ».' },
    related: [{ label: 'La commission', helpId: 'commercial.ventes.compromis.commission' }],
    keywords: ['échéancier', 'paiements', 'acquéreur', 'solde', 'acompte', 'échéance']
  },
  {
    id: 'commercial.ventes.compromis.commission',
    kind: 'section',
    title: 'Commission du compromis',
    summary:
      "Cette carte montre la commission de l'agence sur cette vente, créée automatiquement quand l'acte est signé.",
    howToRead: {
      notes: [
        "Montant HT : avec un mandat en « Pourcentage », le prix convenu multiplié par le taux du mandat ; avec un « Forfait », le forfait du mandat. Le résultat est arrondi à l'unité en FCFA.",
        'TVA : appliquée seulement si votre agence est assujettie à la TVA dans ses réglages financiers, au taux de ce réglage ; sinon elle est à 0.',
        'Montant TTC : Montant HT plus TVA. « Reste dû » : TTC moins les règlements enregistrés.',
        'Part du négociateur : la part des honoraires HT revenant au négociateur, au prorata de ce qui a été encaissé (le pourcentage est celui du mandat).',
        "Statut : voir les statuts de l'écran « Commissions de vente »."
      ]
    },
    consequences: [
      "Avant l'acte, la carte indique que la commission sera créée à la signature de l'acte authentique.",
      "Les montants sont figés à la création, d'après le mandat, le prix du compromis et la TVA de l'agence à ce moment-là.",
      'Pour encaisser, ouvrez « Voir les commissions de vente ».'
    ],
    related: [{ label: 'Commissions de vente', helpId: 'commercial.ventes.commissions' }],
    keywords: ['commission', 'honoraires', 'tva', 'montant ttc', 'reste dû', 'part du négociateur']
  },
  {
    id: 'commercial.ventes.compromis.etapes',
    kind: 'section',
    title: "Signer, passer à l'acte, annuler",
    summary:
      "Ces trois fenêtres font avancer le compromis : « Signer le compromis », « Passer à l'acte » et « Annuler le compromis ».",
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: 'Compromis créé, pas encore signé.' },
        { value: 'SIGNED', label: 'Signé', description: "Compromis signé ; l'acte reste à passer." },
        { value: 'COMPLETED', label: 'Acte signé', description: 'La vente est conclue ; la fiche est figée.' },
        {
          value: 'CANCELLED',
          label: 'Annulé',
          description: 'Le compromis est annulé avec un motif ; la fiche est figée.'
        }
      ]
    },
    steps: [
      {
        title: 'Signer le compromis',
        detail: 'Disponible en « Brouillon » : choisissez la date de signature, puis « Signer ».'
      },
      {
        title: "Passer à l'acte",
        detail: "Disponible en « Signé » : choisissez la date de l'acte authentique, puis « Confirmer »."
      },
      {
        title: 'Annuler le compromis',
        detail:
          "Disponible en « Brouillon » ou « Signé » : saisissez un motif d'au moins 3 caractères, puis « Annuler le compromis »."
      }
    ],
    consequences: [
      'Signer : le compromis passe à « Signé » et le bien à « Sous offre ». Une demande de signature électronique encore ouverte est annulée.',
      "Passer à l'acte : irréversible. Le compromis passe à « Acte signé », le bien à « Vendu » et indisponible, le mandat à « Vendu » ; les offres en attente passent à « Refusée » (motif « Bien vendu ») ; l'affaire CRM liée à l'offre passe à « Gagné » ; la commission est créée.",
      "Annuler : irréversible. Le compromis passe à « Annulé » et le bien revient à « Disponible ». Le mandat reste « Actif » et l'offre reste « Acceptée » : vous pouvez en accepter une autre.",
      "Aucun e-mail ni message n'est envoyé aux parties par ces actions."
    ],
    faq: [
      {
        q: "Peut-on revenir en arrière après « Passer à l'acte » ?",
        a: "Non, pas depuis l'écran : le compromis est figé et la commission créée. Vérifiez la date et les conditions avant de confirmer."
      },
      {
        q: "Quelle différence entre « Signer le compromis » et l'envoi en signature électronique ?",
        a: "« Signer le compromis » enregistre une signature déjà obtenue (papier). L'envoi électronique fait signer en ligne et marque le compromis « Signé » à la fin."
      }
    ],
    permissions: { feature: 'SALES', note: 'Demande le droit « Modifier les affaires ».' },
    related: [
      { label: 'Conditions suspensives', helpId: 'commercial.ventes.compromis.conditions' },
      { label: 'La commission', helpId: 'commercial.ventes.compromis.commission' }
    ],
    keywords: ['signer', "passer à l'acte", 'acte authentique', 'annuler le compromis', 'vendu', 'date de signature']
  },

  // ---------------------------------------------------------------------------
  // Commissions de vente
  // ---------------------------------------------------------------------------
  {
    id: 'commercial.ventes.commissions',
    kind: 'page',
    title: 'Commissions de vente',
    summary:
      "Retrouvez ici les commissions de votre agence sur les ventes conclues, ce qui a été encaissé et ce qui reste dû. C'est aussi ici que vous enregistrez un règlement.",
    purpose:
      "Une commission est créée automatiquement quand l'acte de vente est signé. Le payeur (vendeur ou acquéreur) la règle en une ou plusieurs fois ; chaque règlement est enregistré en comptabilité.",
    steps: [
      {
        title: 'Lire les totaux',
        detail:
          'Les trois cartes du haut (Total TTC, Encaissé, Reste dû) portent sur toutes les commissions qui correspondent à vos critères.'
      },
      {
        title: 'Chercher et filtrer',
        detail:
          "Recherchez un numéro, un compromis, un bien, un payeur ou un négociateur. Critères : Statut, Date d'émission, Montant TTC, Payeur, Avec un reste dû."
      },
      {
        title: 'Encaisser',
        detail: 'Cliquez sur « Encaisser » sur la ligne, remplissez la fenêtre, puis « Encaisser ».'
      },
      { title: 'Voir les règlements', detail: 'Dépliez la ligne avec la flèche à gauche pour lister ses règlements.' },
      {
        title: 'Corriger',
        detail: 'Dans les règlements dépliés, « Annuler » (avec un motif) retire un règlement enregistré par erreur.'
      }
    ],
    consequences: [
      'Chaque encaissement crée une écriture comptable : débit du compte de trésorerie choisi, crédit des honoraires de transaction (compte 70612) et, si votre agence est assujettie, de la TVA collectée.',
      "L'annulation d'un règlement passe l'écriture en sens inverse et recalcule le statut de la commission.",
      "Aucun e-mail ni reçu n'est envoyé au payeur par cet écran."
    ],
    faq: [
      {
        q: "Pourquoi la commission d'une vente n'apparaît-elle pas ?",
        a: "Elle n'existe qu'après « Passer à l'acte » sur le compromis. Un compromis « Brouillon », « Signé » ou « Annulé » n'en a pas."
      },
      {
        q: 'Puis-je encaisser plus que le reste dû ?',
        a: "Non : le montant d'un règlement ne peut pas dépasser le reste dû."
      },
      {
        q: 'Je ne vois pas « Encaisser » ou « Annuler ».',
        a: "« Encaisser » demande le droit « Créer des pièces financières » et « Annuler » un règlement « Valider des pièces financières ». « Encaisser » disparaît quand il n'y a plus de reste dû."
      }
    ],
    permissions: {
      feature: 'SALES',
      note: 'Voir : « Voir les comptes de tiers » ou « Voir les affaires ». Encaisser : « Créer des pièces financières ». Annuler un règlement : « Valider des pièces financières ».'
    },
    related: [
      { label: 'Les totaux', helpId: 'commercial.ventes.commissions.indicateurs' },
      { label: 'Le tableau des commissions', helpId: 'commercial.ventes.commissions.tableau' },
      { label: 'Encaisser une commission', helpId: 'commercial.ventes.commissions.encaisser' },
      { label: 'Annuler un règlement', helpId: 'commercial.ventes.commissions.annuler-reglement' }
    ],
    keywords: ['commission', 'honoraires', 'encaisser', 'règlement', 'reste dû', 'tva', 'négociateur', 'comptabilité']
  },
  {
    id: 'commercial.ventes.commissions.indicateurs',
    kind: 'section',
    title: 'Totaux des commissions',
    summary:
      'Trois cartes totalisent les commissions qui correspondent à votre recherche et à vos critères, toutes pages confondues.',
    howToRead: {
      notes: [
        'Total TTC : somme des montants TTC des commissions affichées par vos critères.',
        'Encaissé : somme de leurs règlements enregistrés (les règlements annulés ne comptent pas).',
        'Reste dû : Total TTC moins Encaissé.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi les totaux changent-ils quand je filtre ?',
        a: "Ils suivent vos critères : pour avoir le total de l'agence, retirez tous les critères."
      }
    ],
    related: [{ label: 'Le tableau des commissions', helpId: 'commercial.ventes.commissions.tableau' }],
    keywords: ['total', 'encaissé', 'reste dû', 'total ttc']
  },
  {
    id: 'commercial.ventes.commissions.tableau',
    kind: 'table',
    title: 'Tableau des commissions de vente',
    summary:
      "Chaque ligne est la commission d'une vente conclue : montant TTC, encaissé, reste dû, négociateur et statut.",
    howToRead: {
      columns: [
        { key: 'numero', label: 'Numéro', description: 'Le numéro de la commission (HT-année-numéro).' },
        {
          key: 'compromis',
          label: 'Compromis',
          description: "Le compromis d'où vient la commission ; cliquez pour l'ouvrir."
        },
        { key: 'bien', label: 'Bien', description: 'Le bien vendu.' },
        {
          key: 'payeur',
          label: 'Payeur',
          description: "Celui qui doit régler la commission : le vendeur ou l'acquéreur, selon le mandat."
        },
        {
          key: 'ttc',
          label: 'Montant TTC',
          description: "Le montant total dû, TVA comprise (la TVA est à 0 si l'agence n'y est pas assujettie), en FCFA."
        },
        { key: 'paye', label: 'Encaissé', description: 'Ce qui a déjà été encaissé, règlements annulés exclus.' },
        { key: 'reste', label: 'Reste dû', description: "Le montant TTC moins l'encaissé." },
        {
          key: 'negociateur',
          label: 'Négociateur',
          description: 'Le collaborateur désigné sur le mandat, ou un tiret (—).'
        },
        {
          key: 'part-negociateur',
          label: 'Part du négociateur',
          description: 'La part de commission HT du négociateur, calculée sur ce qui est déjà encaissé.'
        },
        { key: 'statut', label: 'Statut', description: "L'état de la commission (voir les statuts ci-dessous)." },
        {
          key: 'actions',
          label: 'Actions',
          description: "« Encaisser », tant qu'il reste un montant dû et que la commission n'est pas annulée."
        }
      ],
      statuses: [
        {
          value: 'DUE',
          label: 'À encaisser',
          description: "Rien n'a encore été encaissé (ou tous les règlements ont été annulés)."
        },
        {
          value: 'PARTIALLY_PAID',
          label: 'Partiellement encaissée',
          description:
            "Une partie a été encaissée ; il reste un solde. Le critère de recherche l'appelle « Partiellement réglée »."
        },
        {
          value: 'PAID',
          label: 'Encaissée',
          description: "Le montant TTC est entièrement encaissé. Le critère de recherche l'appelle « Réglée »."
        },
        {
          value: 'CANCELLED',
          label: 'Annulée',
          description:
            "Commission annulée : elle ne reçoit plus de règlement. Aucune action de l'écran ne produit ce statut aujourd'hui."
        }
      ],
      notes: [
        'Dépliez une ligne pour voir ses règlements : numéro (RC-année-numéro), date, montant, moyen, compte, référence et statut « Enregistré » ou « Annulé » (avec son motif).',
        "L'export (Excel, CSV ou PDF) reprend toutes les commissions correspondant à vos critères."
      ]
    },
    faq: [
      {
        q: 'Comment est calculé le Montant TTC ?',
        a: "Prix convenu du compromis multiplié par le taux du mandat (ou forfait du mandat), arrondi, plus la TVA si l'agence y est assujettie. Il est figé à la signature de l'acte."
      },
      {
        q: 'À quoi correspond la Part du négociateur ?',
        a: "À la part du négociateur sur les honoraires HT déjà encaissés. Elle augmente au fil des règlements ; ce n'est pas un paiement fait au négociateur."
      }
    ],
    related: [
      { label: 'Encaisser une commission', helpId: 'commercial.ventes.commissions.encaisser' },
      { label: 'Annuler un règlement', helpId: 'commercial.ventes.commissions.annuler-reglement' }
    ],
    keywords: ['commission', 'montant ttc', 'encaissé', 'reste dû', 'négociateur', 'payeur', 'statut', 'export']
  },
  {
    id: 'commercial.ventes.commissions.encaisser',
    kind: 'section',
    title: 'Encaisser une commission',
    summary: 'Cette fenêtre enregistre un règlement reçu pour une commission, en totalité ou en partie.',
    steps: [
      {
        title: 'Vérifier le montant',
        detail: 'Il est prérempli avec le reste dû ; réduisez-le pour un règlement partiel.'
      },
      {
        title: 'Indiquer la date et le moyen de paiement',
        detail: 'Moyens proposés : Espèces, Virement, Mobile Money, Chèque, Carte ou Autre.'
      },
      {
        title: 'Choisir le compte de trésorerie',
        detail: "Le compte qui reçoit l'argent ; la liste dépend du moyen de paiement choisi."
      },
      { title: 'Ajouter une référence', detail: 'Facultatif : numéro de virement, de chèque, etc.' },
      { title: 'Encaisser', detail: 'Cliquez sur « Encaisser ».' }
    ],
    consequences: [
      'Le règlement reçoit un numéro (RC-année-numéro) et une écriture comptable est passée : débit du compte de trésorerie, crédit des honoraires de transaction (compte 70612) et de la TVA pour sa part.',
      'Le statut de la commission devient « Partiellement encaissée » ou « Encaissée » selon le total encaissé.',
      "Le règlement est refusé s'il dépasse le reste dû. Il peut être annulé ensuite, avec un motif."
    ],
    faq: [
      {
        q: 'Le compte de trésorerie que je cherche est absent.',
        a: 'La liste ne propose que les comptes utilisables avec le moyen de paiement choisi. Changez le moyen ou vérifiez vos comptes de trésorerie.'
      },
      {
        q: 'Un reçu est-il envoyé au payeur ?',
        a: "Non, cet écran n'envoie aucun document."
      }
    ],
    permissions: { feature: 'SALES', note: 'Demande le droit « Créer des pièces financières ».' },
    related: [{ label: 'Annuler un règlement', helpId: 'commercial.ventes.commissions.annuler-reglement' }],
    keywords: ['encaisser', 'règlement', 'paiement', 'mobile money', 'virement', 'trésorerie', 'reste dû']
  },
  {
    id: 'commercial.ventes.commissions.annuler-reglement',
    kind: 'section',
    title: 'Annuler un règlement',
    summary:
      "Cette fenêtre annule un règlement de commission enregistré par erreur. Elle demande un motif d'au moins 3 caractères.",
    steps: [
      {
        title: 'Déplier la commission',
        detail: 'Cliquez sur la flèche à gauche de la ligne pour voir ses règlements.'
      },
      { title: 'Annuler', detail: 'Sur le règlement « Enregistré », cliquez sur « Annuler ».' },
      { title: 'Saisir le motif et confirmer', detail: 'Au moins 3 caractères, puis « Annuler le règlement ».' }
    ],
    consequences: [
      "L'écriture comptable du règlement est contre-passée : une écriture inverse est créée, l'originale n'est pas effacée.",
      'Le règlement reste listé avec le statut « Annulé » et son motif ; il ne compte plus dans « Encaissé ». Le statut de la commission est recalculé.',
      'Un règlement annulé ne se rétablit pas : enregistrez-en un nouveau avec « Encaisser ».'
    ],
    faq: [
      {
        q: 'Je ne vois pas le bouton « Annuler ».',
        a: "Il n'apparaît que sur un règlement « Enregistré » et demande le droit « Valider des pièces financières »."
      }
    ],
    permissions: { feature: 'SALES', note: 'Demande le droit « Valider des pièces financières ».' },
    related: [{ label: 'Encaisser une commission', helpId: 'commercial.ventes.commissions.encaisser' }],
    keywords: ['annuler un règlement', "erreur d'encaissement", 'contre-passation', 'motif']
  }
];

export default entries;
