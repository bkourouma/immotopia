import type { HelpEntry } from '../../../types';

/** Zone « caisse » du module finance (fr). */
const entries: HelpEntry[] = [
  {
    id: 'finance.caisse.page',
    kind: 'page',
    title: 'Caisse',
    summary:
      "Ouvrez votre caisse en espèces, suivez ce qui entre et sort pendant la journée, puis clôturez-la en comptant l'argent. Un autre responsable valide ensuite la caisse.",
    purpose:
      "Chaque caissier tient sa propre caisse, avec un fond de caisse au départ. L'onglet « Ma caisse » est votre caisse du jour ; l'onglet « Historique » rassemble toutes les caisses de l'agence, avec leurs écarts.\n\nCet écran ne sert pas à saisir un encaissement : un loyer payé en espèces s'enregistre dans la gestion locative, puis apparaît ici tout seul dans les opérations de votre caisse.",
    steps: [
      {
        title: 'Ouvrir votre caisse',
        detail:
          'Dans « Ma caisse », choisissez la caisse, indiquez le « Fond de caisse (FCFA) », puis cliquez sur « Ouvrir la caisse ».'
      },
      {
        title: 'Suivre la journée',
        detail:
          "Les loyers encaissés, les reversements et les pièces de caisse s'ajoutent au « Montant attendu ». Cliquez sur « Actualiser » pour voir les derniers mouvements."
      },
      {
        title: 'Clôturer',
        detail:
          "Cliquez sur « Clôturer la caisse », comptez l'argent, expliquez l'écart s'il y en a un, puis cliquez sur « Clôturer »."
      },
      {
        title: 'Faire valider',
        detail:
          "Un autre responsable ouvre l'onglet « Historique », clique sur « Voir le détail » puis sur « Valider »."
      }
    ],
    consequences: [
      "Vous ne pouvez avoir qu'une seule caisse ouverte à la fois : tant qu'elle n'est pas clôturée, une nouvelle ouverture est refusée.",
      "Le montant attendu n'est jamais saisi : il se calcule (fond de caisse + encaissements − décaissements) et se fige à la clôture.",
      "Une fois clôturée, la caisse passe à « À valider ». L'écran ne permet pas de la rouvrir.",
      "À la validation, si le comptage diffère du montant attendu, l'écart est enregistré en comptabilité : un manquant en charge, un excédent en produit."
    ],
    faq: [
      {
        q: "Pourquoi un loyer encaissé n'apparaît-il pas dans ma caisse ?",
        a: 'Seuls comptent les loyers payés en espèces et enregistrés par vous pendant que votre caisse est ouverte. Vérifiez aussi que le paiement est rattaché à la même caisse que la vôtre, puis cliquez sur « Actualiser ».'
      },
      {
        q: 'Mon comptage ne correspond pas au montant attendu, que faire ?',
        a: "Clôturez quand même, en indiquant le motif de l'écart (3 caractères au moins) : sans motif, la clôture est impossible. L'écart est passé en comptabilité à la validation."
      },
      {
        q: "Je ne vois pas l'onglet « Ma caisse ».",
        a: "Il demande le droit « Créer des pièces financières ». Sans lui, l'écran s'ouvre directement sur « Historique »."
      }
    ],
    permissions: {
      note: '« Ma caisse » demande « Créer des pièces financières ». « Historique » demande « Voir les comptes de tiers ». Valider une caisse demande « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Historique des caisses',
        helpId: 'finance.caisse.historique'
      },
      {
        label: 'Clôturer la caisse',
        helpId: 'finance.caisse.cloture'
      },
      {
        label: 'Comptes de trésorerie',
        to: '/tenant/:tenantId/finance/tresorerie'
      }
    ],
    keywords: [
      'caisse',
      'espèces',
      'fond de caisse',
      'billetage',
      'clôture de caisse',
      'caissier',
      'écart de caisse',
      'encaissement',
      'comptage'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'caisse-onglets',
          title: 'Deux onglets',
          description:
            "« Ma caisse » est votre caisse du jour. « Historique » liste toutes les caisses de l'agence, à consulter ou à valider."
        },
        {
          target: 'caisse-ouvrir',
          title: 'Ouvrir votre caisse',
          description:
            "Choisissez la caisse, indiquez le fond de caisse (l'argent déjà présent), puis ouvrez-la. Ce bloc disparaît quand votre caisse est ouverte."
        },
        {
          target: 'caisse-montant-attendu',
          title: 'Le montant attendu',
          description: "Il se calcule seul : fond de caisse, plus les encaissements, moins les sorties d'espèces."
        },
        {
          target: 'caisse-operations',
          title: 'Les opérations de la caisse',
          description: 'Chaque loyer encaissé en espèces, reversement ou pièce de caisse y figure, avec son montant.'
        },
        {
          target: 'caisse-cloturer',
          title: 'Clôturer en fin de journée',
          description:
            "Comptez l'argent, notez l'écart éventuel, puis clôturez. Un autre responsable validera votre caisse."
        }
      ]
    }
  },
  {
    id: 'finance.caisse.ouverture',
    kind: 'section',
    title: 'Ouvrir ma caisse',
    summary: "Ce formulaire ouvre votre caisse du jour. Il s'affiche tant que vous n'avez aucune caisse ouverte.",
    purpose:
      "Le fond de caisse est l'argent déjà présent dans la caisse au moment de l'ouverture. C'est le point de départ du montant attendu.",
    steps: [
      {
        title: 'Choisir la caisse',
        detail:
          "La liste « Caisse » propose les comptes de nature « Caisse » encore actifs. Laissé vide, le compte par défaut de l'agence est utilisé."
      },
      {
        title: 'Indiquer le fond de caisse',
        detail: 'Saisissez le montant en FCFA. Zéro est accepté ; un montant négatif est refusé.'
      },
      {
        title: 'Ajouter une note',
        detail: "Facultatif : un mot pour retrouver le contexte de l'ouverture."
      },
      {
        title: 'Ouvrir',
        detail: "Cliquez sur « Ouvrir la caisse ». Votre caisse reçoit un numéro de la forme CAI-année-numéro d'ordre."
      }
    ],
    consequences: [
      "L'ouverture n'enregistre aucune écriture comptable.",
      "La caisse reste ouverte à votre nom jusqu'à sa clôture ; vous n'en avez qu'une à la fois."
    ],
    faq: [
      {
        q: 'Je ne trouve aucune caisse dans la liste.',
        a: "Seuls les comptes de nature « Caisse » actifs sont proposés. Ils se gèrent dans l'écran Trésorerie."
      },
      {
        q: 'Puis-je ouvrir une caisse sans argent au départ ?',
        a: 'Oui : indiquez 0. Le champ doit tout de même être rempli.'
      },
      {
        q: 'Que se passe-t-il si je laisse la caisse vide ?',
        a: "Le compte de caisse par défaut de l'agence est utilisé."
      }
    ],
    permissions: {
      note: 'Ouvrir une caisse demande « Créer des pièces financières ».'
    },
    related: [
      {
        label: "Vue d'ensemble de la caisse",
        helpId: 'finance.caisse.page'
      }
    ],
    keywords: ['ouvrir la caisse', 'fond de caisse', 'ouverture de caisse', 'caissier']
  },
  {
    id: 'finance.caisse.session',
    kind: 'section',
    title: 'Ma caisse ouverte',
    summary:
      "Cette carte montre votre caisse en cours : son numéro, l'heure d'ouverture, le montant attendu et les opérations déjà passées.",
    purpose: "C'est ici que vous suivez votre caisse pendant la journée et que vous lancez la clôture.",
    steps: [
      {
        title: "Lire l'en-tête",
        detail: "Le numéro de la caisse, l'heure d'ouverture et le nom de la caisse physique."
      },
      {
        title: 'Actualiser',
        detail: 'Cliquez sur « Actualiser » pour recharger les opérations et le montant attendu.'
      },
      {
        title: 'Vérifier les indicateurs',
        detail: 'Fond de caisse, Encaissements, Décaissements et Montant attendu.'
      },
      {
        title: 'Clôturer',
        detail: 'Le bouton « Clôturer la caisse » ouvre la fenêtre de comptage.'
      }
    ],
    consequences: [
      "Le contenu se met à jour quand vous cliquez sur « Actualiser » ou quand vous rechargez l'écran.",
      'La clôture est définitive pour vous : voir « Clôturer la caisse ».'
    ],
    faq: [
      {
        q: 'Pourquoi le montant attendu a-t-il changé ?',
        a: 'Une opération en espèces a été enregistrée depuis votre dernière actualisation : le montant se recalcule à chaque chargement.'
      },
      {
        q: "Puis-je modifier le fond de caisse après l'ouverture ?",
        a: "L'écran ne le permet pas."
      },
      {
        q: 'Où voir le détail des opérations ?',
        a: 'Dans le tableau des opérations, sous les indicateurs.'
      }
    ],
    permissions: {
      note: 'Demande « Créer des pièces financières ». Seul le caissier peut clôturer sa propre caisse.'
    },
    related: [
      {
        label: 'Le montant attendu',
        helpId: 'finance.caisse.montant-attendu'
      },
      {
        label: 'Opérations de la caisse',
        helpId: 'finance.caisse.operations'
      },
      {
        label: 'Clôturer la caisse',
        helpId: 'finance.caisse.cloture'
      }
    ],
    keywords: ['caisse ouverte', 'session de caisse', 'actualiser', 'suivre la caisse']
  },
  {
    id: 'finance.caisse.montant-attendu',
    kind: 'section',
    title: 'Le montant attendu',
    summary:
      "Le montant attendu est ce que votre caisse devrait contenir : le fond de caisse, plus les encaissements, moins les sorties d'espèces.",
    purpose:
      'Il sert de référence au comptage de clôture. Vous ne le saisissez jamais : il se déduit des opérations en espèces de votre caisse.',
    howToRead: {
      notes: [
        "Fond de caisse : le montant indiqué à l'ouverture.",
        'Encaissements : la somme des loyers payés en espèces que vous avez enregistrés pendant la session.',
        'Décaissements : la somme des reversements aux propriétaires en espèces et des pièces de caisse que vous avez validées pendant la session.',
        'Montant attendu = Fond de caisse + Encaissements − Décaissements.'
      ]
    },
    consequences: [
      "À la clôture, le serveur recalcule le montant attendu et le fige : c'est lui qui sert à calculer l'écart.",
      "Une pièce de caisse annulée ne compte plus comme sortie d'argent."
    ],
    faq: [
      {
        q: 'Quels paiements sont comptés ?',
        a: 'Les loyers payés en espèces, enregistrés par vous et rattachés à votre caisse, pendant que la session est ouverte.'
      },
      {
        q: "Une pièce de caisse que j'ai émise mais pas validée compte-t-elle ?",
        a: "Non. Elle compte une fois validée, et pour la personne qui l'a validée."
      },
      {
        q: 'Le montant à la clôture est-il différent de celui affiché ?',
        a: "Il peut l'être si une opération a été enregistrée entre-temps : il est recalculé à la clôture."
      }
    ],
    related: [
      {
        label: 'Opérations de la caisse',
        helpId: 'finance.caisse.operations'
      }
    ],
    keywords: ['montant attendu', 'attendu', 'fond de caisse', 'encaissements', 'décaissements', 'solde de caisse']
  },
  {
    id: 'finance.caisse.operations',
    kind: 'table',
    title: 'Opérations de la caisse',
    summary: 'Ce tableau liste les mouvements en espèces qui composent le montant attendu de la caisse.',
    howToRead: {
      columns: [
        {
          key: 'at',
          label: 'Date et heure',
          description: "Le moment où l'opération a été enregistrée."
        },
        {
          key: 'kind',
          label: 'Type',
          description:
            "Loyer encaissé, Reversement propriétaire ou Pièce de caisse. Cette colonne apparaît dans le détail d'une caisse."
        },
        {
          key: 'label',
          label: 'Libellé',
          description: 'Le numéro de bail, de reversement ou de pièce, avec le bénéficiaire pour une pièce de caisse.'
        },
        {
          key: 'amount',
          label: 'Montant',
          description: "Positif pour une entrée d'espèces, négatif pour une sortie."
        }
      ],
      notes: [
        "Vingt lignes par page. La recherche, le filtre « Type » et le filtre « Montant » portent sur toute la liste ; l'export reprend aussi toute la liste filtrée."
      ]
    },
    faq: [
      {
        q: 'Pourquoi certains montants sont-ils négatifs ?',
        a: "Ce sont des sorties d'espèces : reversement à un propriétaire ou pièce de caisse."
      },
      {
        q: 'Puis-je corriger une opération ici ?',
        a: "Non, ce tableau est en lecture seule. La correction se fait dans l'écran où l'opération a été enregistrée."
      },
      {
        q: 'Comment retrouver une opération précise ?',
        a: 'Tapez une partie du libellé dans la recherche, ou filtrez par type et par montant.'
      }
    ],
    related: [
      {
        label: 'Le montant attendu',
        helpId: 'finance.caisse.montant-attendu'
      }
    ],
    keywords: ['opérations', 'loyer encaissé', 'reversement', 'pièce de caisse', 'mouvements de caisse']
  },
  {
    id: 'finance.caisse.cloture',
    kind: 'section',
    title: 'Clôturer la caisse',
    summary:
      "Cette fenêtre sert à compter l'argent de votre caisse et à la clôturer. L'écart entre le comptage et le montant attendu est calculé sous vos yeux.",
    purpose:
      "La clôture met fin à votre caisse : elle fige le montant attendu et le comptage, puis attend la validation d'un responsable.",
    steps: [
      {
        title: 'Choisir le mode de comptage',
        detail:
          'Par défaut, vous comptez billet par billet et pièce par pièce. Activez « Saisir le total sans billetage » pour taper seulement le « Montant compté ».'
      },
      {
        title: 'Compter',
        detail:
          "Indiquez le nombre de billets et de pièces de chaque valeur : 10 000, 5 000, 2 000, 1 000, 500, 250, 200, 100, 50, 25, 10 et 5 FCFA. Le sous-total de chaque ligne s'affiche."
      },
      {
        title: "Lire l'écart",
        detail:
          "Le cadre gris montre le « Total compté », l'« Attendu » et l'« Écart » : « Aucun écart », « Manquant » ou « Excédent »."
      },
      {
        title: "Expliquer l'écart",
        detail:
          "S'il y en a un, remplissez « Motif de l'écart » (3 caractères au moins). Sans motif, le bouton reste grisé."
      },
      {
        title: 'Clôturer',
        detail: 'Cliquez sur « Clôturer ».'
      }
    ],
    consequences: [
      'La caisse passe à « À valider » et ne peut plus être modifiée depuis cet écran.',
      "Le montant attendu est recalculé par le serveur à ce moment ; l'écart définitif est calculé avec ce montant.",
      "Aucune écriture comptable n'est passée à la clôture : l'écart est enregistré à la validation par un autre responsable.",
      'Si vous avez saisi un billetage, il est conservé et consultable dans le détail de la caisse.'
    ],
    faq: [
      {
        q: 'Que veut dire « Manquant » et « Excédent » ?',
        a: '« Manquant » : vous avez compté moins que le montant attendu. « Excédent » : vous avez compté plus.'
      },
      {
        q: 'Pourquoi le bouton « Clôturer » est-il grisé ?',
        a: "Il y a un écart et le motif fait moins de 3 caractères. Expliquez l'écart pour activer le bouton."
      },
      {
        q: 'Dois-je obligatoirement faire le billetage ?',
        a: 'Non. Activez « Saisir le total sans billetage » pour ne taper que le montant compté.'
      },
      {
        q: 'Puis-je corriger après avoir cliqué sur « Clôturer » ?',
        a: "L'écran ne permet pas de rouvrir la caisse. Le responsable qui valide voit votre motif et peut y ajouter un commentaire."
      }
    ],
    permissions: {
      note: 'Demande « Créer des pièces financières ». Seul le caissier peut clôturer sa caisse.'
    },
    related: [
      {
        label: 'Historique des caisses',
        helpId: 'finance.caisse.historique'
      },
      {
        label: "Détail d'une caisse",
        helpId: 'finance.caisse.detail'
      }
    ],
    keywords: ['clôture', 'billetage', 'compter la caisse', 'écart', 'manquant', 'excédent', 'fermer la caisse']
  },
  {
    id: 'finance.caisse.historique',
    kind: 'table',
    title: 'Historique des caisses',
    summary:
      "Cet onglet liste toutes les caisses de l'agence, ouvertes, à valider ou validées, avec leur écart. C'est ici qu'un responsable valide une caisse clôturée.",
    purpose:
      'Il permet de contrôler les caisses passées, de repérer les écarts et de faire valider les caisses clôturées.',
    howToRead: {
      columns: [
        {
          key: 'number',
          label: 'Numéro',
          description: "Le numéro de la caisse, de la forme CAI-année-numéro d'ordre."
        },
        {
          key: 'treasury',
          label: 'Caisse',
          description: 'La caisse physique tenue pendant la session.'
        },
        {
          key: 'cashier',
          label: 'Caissier',
          description: 'La personne qui a ouvert et tenu la caisse.'
        },
        {
          key: 'openedAt',
          label: 'Ouverture',
          description: "La date et l'heure d'ouverture."
        },
        {
          key: 'closedAt',
          label: 'Clôture',
          description: "La date et l'heure de clôture. Un tiret (—) signifie que la caisse est encore ouverte."
        },
        {
          key: 'expected',
          label: 'Attendu',
          description: 'Le montant attendu : fond de caisse + encaissements − décaissements.'
        },
        {
          key: 'counted',
          label: 'Compté',
          description: 'Le montant compté à la clôture.'
        },
        {
          key: 'difference',
          label: 'Écart',
          description: "Compté moins attendu. Vert : aucun écart. Rouge : il manque de l'argent. Orange : excédent."
        },
        {
          key: 'status',
          label: 'Statut',
          description: "L'état de la caisse (voir les statuts ci-dessous)."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Voir le détail » ouvre la fiche de la caisse.'
        }
      ],
      statuses: [
        {
          value: 'OPEN',
          label: 'Ouverte',
          description: 'Le caissier tient encore sa caisse.'
        },
        {
          value: 'CLOSED',
          label: 'À valider',
          description: "La caisse est clôturée et attend la validation d'un responsable."
        },
        {
          value: 'VALIDATED',
          label: 'Validée',
          description: "Un responsable a validé la caisse. L'écart éventuel est passé en comptabilité."
        }
      ],
      notes: [
        "Filtres : recherche (numéro, caisse, caissier), « Statut », période d'ouverture, « Caissier », « Caisse » et « Écart non nul ». L'export reprend toutes les caisses qui correspondent à vos filtres."
      ]
    },
    steps: [
      {
        title: 'Filtrer',
        detail: 'Choisissez par exemple « Statut » = « À valider » pour voir les caisses qui attendent un contrôle.'
      },
      {
        title: 'Ouvrir une caisse',
        detail: 'Cliquez sur « Voir le détail ».'
      },
      {
        title: 'Valider',
        detail: 'Dans le détail, ajoutez un commentaire si besoin, puis cliquez sur « Valider ».'
      }
    ],
    faq: [
      {
        q: 'Comment repérer les caisses avec un écart ?',
        a: 'Activez le filtre « Écart non nul ».'
      },
      {
        q: 'Pourquoi ne puis-je pas valider ma propre caisse ?',
        a: "La validation est faite par une autre personne que le caissier, pour qu'un second regard contrôle le comptage."
      },
      {
        q: 'Je ne vois pas les caisses des autres caissiers.',
        a: 'La liste demande le droit « Voir les comptes de tiers ».'
      }
    ],
    permissions: {
      note: 'La liste demande « Voir les comptes de tiers ». Valider demande « Valider des pièces financières ».'
    },
    related: [
      {
        label: "Détail d'une caisse",
        helpId: 'finance.caisse.detail'
      },
      {
        label: "Vue d'ensemble de la caisse",
        helpId: 'finance.caisse.page'
      }
    ],
    keywords: ['historique', 'caisses passées', 'valider une caisse', 'écart', 'contrôle de caisse']
  },
  {
    id: 'finance.caisse.detail',
    kind: 'section',
    title: "Détail d'une caisse",
    summary:
      "Cette fenêtre montre tout ce qui concerne une caisse : qui l'a tenue, les montants, les opérations, le billetage et, pour un responsable, le bouton de validation.",
    purpose: "Elle sert à contrôler le comptage d'une caisse clôturée avant de la valider.",
    steps: [
      {
        title: 'Lire les informations',
        detail: "Caissier, caisse, ouverture, clôture, fond de caisse, attendu, compté, écart et motif de l'écart."
      },
      {
        title: 'Contrôler les opérations',
        detail: "Le tableau « Opérations » détaille les entrées et sorties d'espèces."
      },
      {
        title: 'Consulter le billetage',
        detail: "S'il a été saisi, le tableau « Billetage » montre le nombre de billets et de pièces comptés."
      },
      {
        title: 'Valider',
        detail: 'Sur une caisse « À valider », ajoutez un « Commentaire (facultatif) » puis cliquez sur « Valider ».'
      }
    ],
    consequences: [
      "La validation est faite par une autre personne que le caissier : si c'est vous qui avez tenu la caisse, l'écran vous le rappelle.",
      'Si la caisse a un écart, la validation enregistre une écriture comptable : un manquant en charge, un excédent en produit, en face du compte de la caisse.',
      "Une caisse validée ne change plus de statut ; la fenêtre affiche alors qui l'a validée et quand."
    ],
    faq: [
      {
        q: 'Je ne vois pas le bouton « Valider ».',
        a: 'La caisse doit être « À valider », vous devez avoir le droit « Valider des pièces financières » et ne pas être le caissier.'
      },
      {
        q: 'Que devient mon commentaire de validation ?',
        a: 'Il est conservé avec la caisse et affiché dans cette fenêtre.'
      },
      {
        q: "Pourquoi n'y a-t-il pas de billetage ?",
        a: 'Le caissier a clôturé en saisissant seulement le total compté.'
      }
    ],
    permissions: {
      note: "Voir une caisse demande « Voir les comptes de tiers » (ou d'en être le caissier). Valider demande « Valider des pièces financières »."
    },
    related: [
      {
        label: 'Historique des caisses',
        helpId: 'finance.caisse.historique'
      },
      {
        label: 'Billetage',
        helpId: 'finance.caisse.billetage'
      }
    ],
    keywords: ['détail de la caisse', 'valider la caisse', 'commentaire de validation', 'contrôle']
  },
  {
    id: 'finance.caisse.billetage',
    kind: 'table',
    title: 'Billetage',
    summary: 'Ce tableau montre combien de billets et de pièces de chaque valeur le caissier a comptés à la clôture.',
    howToRead: {
      columns: [
        {
          key: 'valeur',
          label: 'Valeur',
          description: 'La valeur du billet ou de la pièce, en FCFA.'
        },
        {
          key: 'nombre',
          label: 'Nombre',
          description: "Combien d'unités de cette valeur ont été comptées."
        },
        {
          key: 'sous-total',
          label: 'Sous-total',
          description: 'La valeur multipliée par le nombre.'
        }
      ],
      notes: [
        'Seules les valeurs comptées en au moins un exemplaire sont listées. Le total des sous-totaux est le « Compté » de la caisse.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi ce tableau est-il absent ?',
        a: "Il n'existe que si la caisse a été clôturée avec un billetage."
      },
      {
        q: 'À quoi sert-il ?',
        a: 'Il permet au responsable de vérifier le détail du comptage avant de valider.'
      },
      {
        q: 'Peut-on le modifier ?',
        a: 'Non, il est figé à la clôture.'
      }
    ],
    related: [
      {
        label: 'Clôturer la caisse',
        helpId: 'finance.caisse.cloture'
      }
    ],
    keywords: ['billetage', 'billets', 'pièces', 'comptage', 'coupures']
  },
  {
    id: 'finance.pieces-de-caisse.page',
    kind: 'page',
    title: 'Pièce de caisse',
    summary:
      "Émettez une pièce de caisse pour une dépense de chantier payée en espèces, puis validez-la et imprimez le bon. Tant que la pièce n'est pas validée, elle reste un brouillon.",
    purpose:
      "Une pièce de caisse est le justificatif d'une dépense réglée en espèces sur un chantier : bénéficiaire, montant, date, poste de dépense et motif. Une fois validée, elle sort l'argent de la caisse et s'ajoute au coût du chantier.\n\nLe geste se fait en deux temps : celui qui saisit émet la pièce, celui qui a le droit de valider la valide.",
    steps: [
      {
        title: 'Remplir le formulaire',
        detail:
          'Choisissez le « Chantier » et le « Poste de dépense », puis indiquez le « Bénéficiaire », le « Montant (FCFA) », la « Date » et le « Motif ». Tous ces champs sont obligatoires.'
      },
      {
        title: 'Émettre la pièce',
        detail: 'Cliquez sur « Émettre la pièce » : la pièce est créée en brouillon, sans numéro.'
      },
      {
        title: 'Valider',
        detail: 'Cliquez sur « Valider la pièce » et confirmez. La pièce reçoit alors son numéro.'
      },
      {
        title: 'Imprimer',
        detail: "Cliquez sur « Imprimer le bon » : le bon s'ouvre dans un nouvel onglet."
      },
      {
        title: 'Corriger',
        detail:
          "Brouillon : « Supprimer le brouillon ». Pièce validée : « Annuler la pièce ». Ou « Dupliquer » pour repartir d'une pièce semblable."
      }
    ],
    consequences: [
      "Un brouillon n'a ni numéro, ni écriture comptable, ni effet sur le coût du chantier : le supprimer ne laisse aucune trace.",
      "La validation est irréversible : la pièce ne se modifie plus. Elle reçoit son numéro, enregistre la dépense en comptabilité (compte de charge du poste, en face de la caisse) et s'ajoute au coût du chantier.",
      "Un chantier clôturé n'accepte plus de dépense : la validation y est refusée.",
      "Le montant sort de la caisse : si la personne qui a validé la pièce tient la caisse par défaut de l'agence, il apparaît comme décaissement dans sa caisse ouverte."
    ],
    faq: [
      {
        q: "Pourquoi ma pièce n'a-t-elle pas de numéro ?",
        a: "Le numéro est attribué à la validation. Une pièce encore en brouillon n'en a pas, ce qui évite les trous dans la numérotation."
      },
      {
        q: "Pourquoi mon chantier n'apparaît-il pas dans la liste ?",
        a: "Les chantiers clôturés sont écartés : leur coût est figé et n'accepte plus de dépense."
      },
      {
        q: 'Comment corriger une pièce déjà validée ?',
        a: 'Annulez-la avec « Annuler la pièce », puis émettez-en une nouvelle (le bouton « Dupliquer » pré-remplit le formulaire).'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Émettre et supprimer un brouillon demandent « Créer des pièces financières ». Valider ou annuler une pièce demande « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Émettre une pièce',
        helpId: 'finance.pieces-de-caisse.formulaire'
      },
      {
        label: 'La pièce émise',
        helpId: 'finance.pieces-de-caisse.piece'
      },
      {
        label: 'Pièces à valider',
        to: '/tenant/:tenantId/finance/validation'
      }
    ],
    keywords: [
      'pièce de caisse',
      'bon de caisse',
      'dépense en espèces',
      'dépense de chantier',
      'bon de sortie',
      'justificatif'
    ]
  },
  {
    id: 'finance.pieces-de-caisse.formulaire',
    kind: 'section',
    title: 'Émettre une pièce',
    summary:
      "Ce formulaire court enregistre une dépense en espèces sur un chantier. L'émission crée un brouillon : rien n'est encore comptabilisé.",
    purpose:
      "Il réunit ce qu'il faut pour justifier la dépense : où elle a eu lieu, à quel poste elle s'impute, qui est payé, combien, quand et pourquoi.",
    steps: [
      {
        title: 'Chantier',
        detail: 'Choisissez le chantier concerné. Seuls les chantiers non clôturés sont proposés.'
      },
      {
        title: 'Poste de dépense',
        detail: "Choisissez le poste auquel la dépense s'impute. Seuls les postes actifs sont proposés."
      },
      {
        title: 'Bénéficiaire et montant',
        detail: "Indiquez qui reçoit l'argent et le montant en FCFA (au moins 1)."
      },
      {
        title: 'Date et motif',
        detail: 'La date du jour est proposée. Le motif explique la dépense.'
      },
      {
        title: 'Émettre',
        detail: "Cliquez sur « Émettre la pièce ». Le formulaire se verrouille et la pièce s'affiche dessous."
      }
    ],
    consequences: [
      "L'émission crée un brouillon : pas de numéro, pas d'écriture, pas d'effet sur le coût du chantier.",
      'Le formulaire reste verrouillé tant que la pièce est affichée : utilisez « Émettre une nouvelle pièce » pour repartir de zéro, ou « Dupliquer » pour repartir de cette pièce.'
    ],
    faq: [
      {
        q: "Quel message d'erreur si un champ manque ?",
        a: 'Il faut renseigner le chantier, le poste, le bénéficiaire, un montant positif et le motif.'
      },
      {
        q: "Le chantier est déjà choisi quand j'arrive sur l'écran.",
        a: "Vous venez de la fiche d'un chantier : il est pré-sélectionné. S'il a été clôturé entre-temps, le champ est vidé et un avertissement s'affiche."
      },
      {
        q: "Puis-je modifier la pièce après l'avoir émise ?",
        a: 'Non, le formulaire est verrouillé. Supprimez le brouillon et émettez-en une nouvelle.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Demande « Créer des pièces financières ».'
    },
    related: [
      {
        label: 'La pièce émise',
        helpId: 'finance.pieces-de-caisse.piece'
      }
    ],
    keywords: ['émettre une pièce', 'chantier', 'poste de dépense', 'bénéficiaire', 'motif']
  },
  {
    id: 'finance.pieces-de-caisse.piece',
    kind: 'section',
    title: 'La pièce émise',
    summary:
      "Cette carte présente la pièce que vous venez d'émettre, son statut et les gestes possibles : valider, supprimer, annuler ou imprimer.",
    purpose:
      "Elle vous guide de l'émission à la validation : tant que la pièce est un brouillon, vous pouvez la valider ou la supprimer ; une fois validée, vous ne pouvez plus que l'annuler ou l'imprimer.",
    howToRead: {
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: "La pièce est émise mais pas validée. Elle n'a pas de numéro et n'est pas comptabilisée."
        },
        {
          value: 'VALIDATED',
          label: 'Validée',
          description: 'La pièce a un numéro et la dépense est comptabilisée. Elle ne se modifie plus.'
        },
        {
          value: 'VOIDED',
          label: 'Annulée',
          description:
            "La pièce a été annulée par une pièce d'annulation liée. Son montant ne compte plus dans le coût du chantier."
        }
      ],
      notes: [
        "Le titre montre le numéro de la pièce, ou « Pièce à valider » suivi du bénéficiaire tant qu'elle n'en a pas."
      ]
    },
    steps: [
      {
        title: 'Valider la pièce',
        detail: "Brouillon : cliquez sur « Valider la pièce », lisez l'avertissement et confirmez."
      },
      {
        title: 'Supprimer le brouillon',
        detail: "Brouillon : « Supprimer le brouillon », puis confirmez. Aucune trace n'est conservée."
      },
      {
        title: 'Annuler la pièce',
        detail: 'Pièce validée : « Annuler la pièce », puis saisissez le motif dans la fenêtre.'
      },
      {
        title: 'Imprimer le bon',
        detail: "Disponible à tout moment : le bon s'ouvre dans un nouvel onglet."
      }
    ],
    consequences: [
      'Valider est irréversible : la pièce ne se modifie plus et reçoit son numéro.',
      "Supprimer ne vaut que pour un brouillon : rien n'avait été comptabilisé. Une pièce validée ne se supprime pas, elle s'annule.",
      'Valider ou annuler une pièce demande le droit « Valider des pièces financières ».'
    ],
    faq: [
      {
        q: 'Quelle différence entre supprimer et annuler ?',
        a: "Supprimer efface un brouillon sans laisser de trace. Annuler concerne une pièce validée : elle est conservée avec son numéro, et une pièce d'annulation liée annule ses effets."
      },
      {
        q: 'Je ne peux pas valider la pièce.',
        a: 'Le droit « Valider des pièces financières » est nécessaire. La validation est aussi refusée si le chantier est clôturé.'
      },
      {
        q: 'Le bon imprimé est-il disponible pour un brouillon ?',
        a: 'Le bouton « Imprimer le bon » est proposé quel que soit le statut de la pièce.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Supprimer un brouillon demande « Créer des pièces financières ». Valider et annuler demandent « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Annuler une pièce de caisse',
        helpId: 'finance.pieces-de-caisse.annulation'
      },
      {
        label: 'Pièces à valider',
        to: '/tenant/:tenantId/finance/validation'
      }
    ],
    keywords: ['valider une pièce', 'supprimer un brouillon', 'imprimer le bon', 'statut de la pièce']
  },
  {
    id: 'finance.pieces-de-caisse.annulation',
    kind: 'section',
    title: 'Annuler une pièce de caisse',
    summary: 'Cette fenêtre annule une pièce déjà validée, en gardant une trace. Un motif est obligatoire.',
    purpose:
      "On ne modifie jamais une pièce validée : on l'annule par une pièce liée, et l'historique montre les deux. Le coût du chantier se corrige de lui-même.",
    steps: [
      {
        title: 'Ouvrir la fenêtre',
        detail: 'Sur une pièce « Validée », cliquez sur « Annuler la pièce ».'
      },
      {
        title: 'Saisir le motif',
        detail:
          "Expliquez la raison dans « Motif de l'annulation » (par exemple : erreur sur le bénéficiaire). Le bouton reste grisé tant que le motif est vide."
      },
      {
        title: 'Confirmer',
        detail: "Cliquez sur « Confirmer l'annulation », ou sur « Renoncer » pour fermer sans rien faire."
      }
    ],
    consequences: [
      "Une pièce d'annulation liée est créée : la pièce d'origine reste conservée avec son numéro.",
      "L'écriture comptable de la pièce est contrepassée et son montant ne compte plus dans le coût du chantier.",
      "Une pièce annulée ne compte plus comme sortie d'argent dans le montant attendu d'une caisse."
    ],
    faq: [
      {
        q: 'Puis-je annuler une pièce qui est encore en brouillon ?',
        a: "Non : un brouillon se supprime. L'annulation ne concerne que les pièces validées."
      },
      {
        q: 'Puis-je « dés-annuler » une pièce ?',
        a: 'Non. Émettez une nouvelle pièce, par exemple avec « Dupliquer ».'
      },
      {
        q: 'Qui peut annuler ?',
        a: 'Une personne qui a le droit « Valider des pièces financières » : annuler est la même responsabilité que valider.'
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Demande « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'La pièce émise',
        helpId: 'finance.pieces-de-caisse.piece'
      }
    ],
    keywords: ['annuler une pièce', 'annulation', 'motif', 'contrepassation', 'erreur de saisie']
  },
  {
    id: 'finance.tresorerie.page',
    kind: 'page',
    title: 'Trésorerie',
    summary:
      "Suivez les comptes où se trouve l'argent de l'agence (caisses, banques, Mobile Money…), déplacez des fonds de l'un à l'autre et gérez les versements de la retenue à la source à la DGI.",
    purpose:
      "L'écran compte trois onglets. « Comptes » liste vos comptes de trésorerie avec leur solde. « Virements internes » enregistre un déplacement d'argent entre deux de vos comptes, par exemple une remise de chèques en banque. « Retenues à la source » suit ce qui a été retenu sur les loyers et ce qui a été reversé à la DGI.\n\nCet écran ne propose pas de rapprochement avec le relevé de la banque : les soldes viennent des écritures comptables de l'agence.",
    steps: [
      {
        title: 'Créer un compte',
        detail: 'Onglet « Comptes », « Nouveau compte » : choisissez la nature, le libellé et le numéro de compte.'
      },
      {
        title: 'Déplacer des fonds',
        detail:
          "Onglet « Virements internes », « Nouveau virement » : compte de départ, compte d'arrivée, montant et date."
      },
      {
        title: 'Reverser à la DGI',
        detail: 'Onglet « Retenues à la source », « Nouveau versement » : période, montant, date et compte qui paie.'
      },
      {
        title: 'Corriger',
        detail:
          '« Annuler » sur un virement ou un versement validé, avec un motif. Un compte se corrige avec « Modifier ».'
      }
    ],
    consequences: [
      "Un virement et un versement à la DGI sont enregistrés tout de suite, avec leur écriture comptable ; il n'y a pas de brouillon.",
      "Une sortie d'argent est refusée si le compte de départ n'a pas un solde suffisant : aucun compte ne peut devenir négatif.",
      "Annuler un virement ou un versement passe l'écriture inverse ; le document reste visible avec le statut « Annulée »."
    ],
    faq: [
      {
        q: "D'où vient le solde d'un compte ?",
        a: 'Il est calculé à partir des écritures comptables du compte : total des entrées moins total des sorties.'
      },
      {
        q: 'Où enregistrer le dépôt de chèques en banque ?',
        a: 'Dans « Virements internes » : départ « Chèques à encaisser », arrivée votre compte « Banque ».'
      },
      {
        q: 'Pourquoi mon virement est-il refusé ?',
        a: 'Le plus souvent, le solde du compte de départ est insuffisant, ou les deux comptes sont identiques ou inactifs.'
      }
    ],
    permissions: {
      note: "Voir l'écran demande « Voir les comptes de tiers ». Créer un virement ou un versement demande « Créer des pièces financières » ; les annuler demande « Valider des pièces financières ». Créer ou modifier un compte demande « Paramétrer le module financier »."
    },
    related: [
      {
        label: 'Comptes de trésorerie',
        helpId: 'finance.tresorerie.comptes'
      },
      {
        label: 'Virements internes',
        helpId: 'finance.tresorerie.virements'
      },
      {
        label: 'Retenue à la source',
        helpId: 'finance.tresorerie.retenue'
      },
      {
        label: 'Caisse',
        to: '/tenant/:tenantId/finance/caisse'
      }
    ],
    keywords: [
      'trésorerie',
      'compte bancaire',
      'banque',
      'Mobile Money',
      'solde',
      'virement',
      'remise de chèques',
      'DGI',
      'retenue'
    ],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'tresorerie-onglets',
          title: 'Trois onglets',
          description:
            "« Comptes » pour voir vos soldes, « Virements internes » pour déplacer de l'argent (remise de chèques en banque, par exemple), « Retenues à la source » pour les versements à la DGI."
        },
        {
          target: 'tresorerie-comptes',
          title: 'Vos comptes et leur solde',
          description:
            "Chaque ligne est un compte : caisse, banque, Mobile Money… La colonne « Solde » vient des écritures de l'agence."
        },
        {
          target: 'tresorerie-nouveau-compte',
          title: 'Créer un compte',
          description:
            'Choisissez la nature et le numéro de compte. Le numéro et la nature ne se changent plus ensuite.'
        },
        {
          target: 'tresorerie-numerotation',
          title: 'Le numéro de compte',
          description:
            'Le numéro doit commencer par le préfixe de la nature choisie (caisses 571, banques 52, Mobile Money 55, chèques 513, cartes 515).'
        }
      ]
    }
  },
  {
    id: 'finance.tresorerie.comptes',
    kind: 'table',
    title: 'Comptes de trésorerie',
    summary:
      "Ce tableau liste les comptes où se trouve l'argent de l'agence, avec leur nature, leur numéro et leur solde.",
    purpose:
      "Chaque compte correspond à un endroit réel : une caisse, un compte en banque, un portefeuille Mobile Money, ou des chèques et des paiements par carte en attente d'encaissement. Les formulaires d'encaissement et de règlement proposent ces comptes.",
    howToRead: {
      columns: [
        {
          key: 'nature',
          label: 'Nature',
          description: 'Caisse, Banque, Mobile Money, Chèques à encaisser ou Cartes à encaisser.'
        },
        {
          key: 'numero',
          label: 'Numéro',
          description: 'Le numéro du compte dans le plan comptable.'
        },
        {
          key: 'libelle',
          label: 'Libellé',
          description: 'Le nom donné au compte, par exemple « Caisse agence Cocody ».'
        },
        {
          key: 'detail',
          label: 'Détail',
          description:
            "Pour un compte Mobile Money, l'opérateur ; pour une banque, le nom de la banque et la référence du compte. Un tiret (—) sinon."
        },
        {
          key: 'defaut',
          label: 'Défaut',
          description: "« Oui » si c'est le compte proposé en premier pour cette nature."
        },
        {
          key: 'statut',
          label: 'Statut',
          description: "Actif ou Inactif. Un compte inactif n'est plus proposé dans les formulaires."
        },
        {
          key: 'solde',
          label: 'Solde',
          description: 'Les entrées moins les sorties du compte, en FCFA.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Modifier » ouvre la fiche du compte.'
        }
      ],
      statuses: [
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: 'Le compte est utilisable.'
        },
        {
          value: 'INACTIVE',
          label: 'Inactif',
          description: "Le compte n'est plus proposé pour de nouvelles opérations ; son historique reste visible."
        }
      ],
      notes: [
        "Filtres : recherche (libellé, numéro, banque, opérateur), « Nature », « Statut » et « Compte par défaut ». L'export reprend la liste filtrée."
      ]
    },
    steps: [
      {
        title: 'Créer un compte',
        detail: 'Cliquez sur « Nouveau compte ».'
      },
      {
        title: 'Modifier un compte',
        detail: 'Cliquez sur « Modifier » sur la ligne du compte.'
      },
      {
        title: 'Chercher',
        detail: 'Utilisez la recherche ou les filtres au-dessus du tableau.'
      }
    ],
    faq: [
      {
        q: 'Comment désactiver un compte ?',
        a: "Cliquez sur « Modifier » et décochez « Compte actif ». Le dernier compte actif d'une nature ne peut pas être désactivé."
      },
      {
        q: 'Que veut dire « Défaut » ?',
        a: "C'est le compte utilisé quand aucun compte n'est désigné, par exemple pour la caisse. Il n'y en a qu'un par nature (et par opérateur pour le Mobile Money)."
      },
      {
        q: "Pourquoi le solde d'un compte est-il à zéro ?",
        a: "Aucune écriture n'a encore touché ce compte."
      }
    ],
    permissions: {
      note: 'Voir demande « Voir les comptes de tiers ». Créer et modifier demandent « Paramétrer le module financier ».'
    },
    related: [
      {
        label: 'Créer un compte de trésorerie',
        helpId: 'finance.tresorerie.compte-nouveau'
      },
      {
        label: 'Modifier un compte',
        helpId: 'finance.tresorerie.compte-modification'
      }
    ],
    keywords: ['comptes', 'solde', 'banque', 'caisse', 'Mobile Money', 'Wave', 'Orange Money', 'MTN', 'Moov']
  },
  {
    id: 'finance.tresorerie.compte-nouveau',
    kind: 'section',
    title: 'Nouveau compte de trésorerie',
    summary:
      "Ce formulaire crée un compte où l'agence reçoit ou garde de l'argent : caisse, banque, Mobile Money, chèques ou cartes à encaisser.",
    purpose:
      "Un compte est lié à un numéro du plan comptable. Il apparaît ensuite dans les formulaires d'encaissement, de règlement, de virement et d'ouverture de caisse.",
    steps: [
      {
        title: 'Nature',
        detail: 'Choisissez Caisse, Banque, Mobile Money, Chèques à encaisser ou Cartes à encaisser.'
      },
      {
        title: 'Libellé',
        detail: 'Donnez un nom clair, par exemple « Caisse agence Cocody ».'
      },
      {
        title: 'Numéro de compte',
        detail:
          "Chiffres seulement. Il doit commencer par 571 pour une caisse, 52 pour une banque, 55 pour le Mobile Money, 513 pour des chèques et 515 pour des cartes. Un exemple s'affiche selon la nature choisie."
      },
      {
        title: 'Détails',
        detail:
          "Mobile Money : choisissez l'opérateur (Orange Money, MTN MoMo, Moov Money, Wave, Autre). Banque : indiquez la banque et la référence du compte, si vous le souhaitez."
      },
      {
        title: 'Compte par défaut',
        detail: 'Activez-le pour que ce compte devienne celui proposé en premier pour sa nature.'
      },
      {
        title: 'Créer',
        detail: 'Cliquez sur « Créer ».'
      }
    ],
    consequences: [
      'Le numéro et la nature ne pourront plus être modifiés.',
      'Deux comptes ne peuvent pas porter le même numéro.',
      "Si vous le marquez par défaut, l'ancien compte par défaut de la même nature (et du même opérateur pour le Mobile Money) perd ce statut.",
      'La création ne passe aucune écriture : le solde démarre à zéro.'
    ],
    faq: [
      {
        q: 'Le numéro est refusé, pourquoi ?',
        a: 'Il ne correspond pas à la nature choisie, ou un autre compte porte déjà ce numéro.'
      },
      {
        q: 'Puis-je corriger un numéro saisi par erreur ?',
        a: "Non. Créez un nouveau compte avec le bon numéro et désactivez l'ancien."
      },
      {
        q: 'À quoi servent « Chèques à encaisser » et « Cartes à encaisser » ?',
        a: 'Ils reçoivent les chèques et les paiements par carte avant leur arrivée en banque. Un virement interne les fait ensuite passer vers le compte « Banque ».'
      }
    ],
    permissions: {
      note: 'Demande « Paramétrer le module financier ».'
    },
    related: [
      {
        label: 'Modifier un compte',
        helpId: 'finance.tresorerie.compte-modification'
      }
    ],
    keywords: ['nouveau compte', 'créer un compte', 'numéro de compte', 'SYSCOHADA', 'opérateur']
  },
  {
    id: 'finance.tresorerie.compte-modification',
    kind: 'section',
    title: 'Modifier un compte de trésorerie',
    summary:
      "Cette fenêtre change le libellé d'un compte, ses références bancaires, son statut par défaut ou son activation.",
    purpose:
      "Le numéro et la nature d'un compte sont affichés mais figés : ils définissent sa place dans la comptabilité.",
    steps: [
      {
        title: 'Libellé',
        detail: 'Renommez le compte si besoin.'
      },
      {
        title: 'Banque',
        detail: 'Pour un compte bancaire : la banque et la référence du compte.'
      },
      {
        title: 'Compte par défaut',
        detail: 'Activez pour en faire le compte proposé en premier pour sa nature.'
      },
      {
        title: 'Compte actif',
        detail: 'Décochez pour ne plus le proposer dans les formulaires.'
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer ».'
      }
    ],
    consequences: [
      "Désactiver un compte ne supprime ni son solde ni son historique ; il n'est simplement plus proposé.",
      "Le dernier compte actif d'une nature ne peut pas être désactivé.",
      "Marquer un compte par défaut retire ce statut à l'ancien compte par défaut de la même nature."
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas désactiver ce compte ?',
        a: "C'est le dernier compte actif de sa nature : activez-en un autre d'abord."
      },
      {
        q: "Puis-je changer la nature d'un compte ?",
        a: 'Non, la nature et le numéro sont non modifiables.'
      },
      {
        q: 'Que devient un compte inactif ?',
        a: "Il reste dans la liste (filtre « Statut ») avec son solde, mais n'est plus proposé pour de nouvelles opérations."
      }
    ],
    permissions: {
      note: 'Demande « Paramétrer le module financier ».'
    },
    related: [
      {
        label: 'Comptes de trésorerie',
        helpId: 'finance.tresorerie.comptes'
      }
    ],
    keywords: ['modifier un compte', 'désactiver', 'compte par défaut', 'renommer']
  },
  {
    id: 'finance.tresorerie.virements',
    kind: 'table',
    title: 'Virements internes',
    summary:
      "Ce tableau liste les déplacements d'argent entre deux comptes de l'agence. Un virement interne ne change pas le résultat : l'argent reste dans l'agence.",
    purpose:
      'Il sert typiquement à remettre des chèques en banque, à verser la caisse à la banque ou à approvisionner un portefeuille Mobile Money.',
    howToRead: {
      columns: [
        {
          key: 'numero',
          label: 'Numéro',
          description: "Le numéro du virement, de la forme VIR-année-numéro d'ordre."
        },
        {
          key: 'de',
          label: 'De',
          description: "Le compte de départ, d'où l'argent sort."
        },
        {
          key: 'vers',
          label: 'Vers',
          description: "Le compte d'arrivée, où l'argent entre."
        },
        {
          key: 'montant',
          label: 'Montant',
          description: 'Le montant déplacé, en FCFA.'
        },
        {
          key: 'date',
          label: 'Date',
          description: 'La date du virement.'
        },
        {
          key: 'statut',
          label: 'Statut',
          description: 'Validé, ou Annulée.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Annuler » est proposé sur les virements validés.'
        }
      ],
      statuses: [
        {
          value: 'VALIDATED',
          label: 'Validé',
          description: 'Le virement est enregistré et comptabilisé.'
        },
        {
          value: 'VOIDED',
          label: 'Annulée',
          description: "Le virement a été annulé : l'écriture inverse a été passée. Il reste visible."
        }
      ],
      notes: [
        "Filtres : recherche (référence, notes), « Statut », « Date », « Compte » (de ou vers) et « Montant ». L'export reprend la liste filtrée."
      ]
    },
    steps: [
      {
        title: 'Nouveau virement',
        detail: 'Cliquez sur « Nouveau virement » (voir la fiche du formulaire).'
      },
      {
        title: 'Annuler',
        detail:
          'Cliquez sur « Annuler » sur la ligne, saisissez le motif (3 caractères au moins) puis confirmez avec « Annuler le virement ».'
      }
    ],
    consequences: [
      "Un virement est comptabilisé dès sa création : le compte d'arrivée augmente, le compte de départ diminue.",
      "L'annulation passe l'écriture inverse, sans effacer le virement. Elle demande le droit « Valider des pièces financières » et un motif."
    ],
    faq: [
      {
        q: "Pourquoi n'y a-t-il pas de brouillon ?",
        a: "Le virement est enregistré directement. En cas d'erreur, annulez-le puis refaites-le."
      },
      {
        q: 'Je ne vois pas « Annuler ».',
        a: 'Seuls les virements validés peuvent être annulés, et il faut le droit « Valider des pièces financières ».'
      },
      {
        q: "Comment trouver tous les virements d'un compte ?",
        a: 'Utilisez le filtre « Compte » : il retient les virements qui partent de ce compte ou qui y arrivent.'
      }
    ],
    permissions: {
      note: 'Voir demande « Voir les comptes de tiers ». Créer demande « Créer des pièces financières ». Annuler demande « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Nouveau virement interne',
        helpId: 'finance.tresorerie.virement-nouveau'
      }
    ],
    keywords: ['virement', 'remise de chèques', 'dépôt en banque', 'transfert', 'approvisionner']
  },
  {
    id: 'finance.tresorerie.virement-nouveau',
    kind: 'section',
    title: 'Nouveau virement interne',
    summary:
      "Ce formulaire déplace de l'argent d'un compte de l'agence vers un autre. Le virement est comptabilisé immédiatement.",
    purpose:
      'Utilisez-le pour remettre des chèques en banque, déposer des espèces de la caisse en banque ou alimenter un compte Mobile Money.',
    steps: [
      {
        title: 'Compte de départ',
        detail: "Le compte d'où l'argent sort. Seuls les comptes actifs sont proposés."
      },
      {
        title: "Compte d'arrivée",
        detail: "Le compte qui reçoit l'argent. Il doit être différent du compte de départ."
      },
      {
        title: 'Montant',
        detail: 'En FCFA, au moins 1.'
      },
      {
        title: 'Date',
        detail: 'La date du jour est proposée.'
      },
      {
        title: 'Référence et notes',
        detail: 'Facultatifs : par exemple le numéro du bordereau de remise.'
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer ».'
      }
    ],
    consequences: [
      "Le virement reçoit un numéro de la forme VIR-année-numéro d'ordre et son écriture comptable est passée tout de suite.",
      'Il est refusé si le solde du compte de départ ne couvre pas le montant.',
      "Pour le corriger, il faut l'annuler, puis en saisir un nouveau."
    ],
    faq: [
      {
        q: '« Solde insuffisant » : que faire ?',
        a: "Approvisionnez d'abord le compte de départ (encaissement ou virement), ou choisissez un autre compte."
      },
      {
        q: 'Le même compte en départ et en arrivée ?',
        a: "C'est refusé : les deux comptes doivent être différents."
      },
      {
        q: 'Un virement interne change-t-il mon résultat ?',
        a: "Non : l'argent passe d'un compte à un autre, sans produit ni charge."
      }
    ],
    permissions: {
      note: 'Demande « Créer des pièces financières ».'
    },
    related: [
      {
        label: 'Virements internes',
        helpId: 'finance.tresorerie.virements'
      }
    ],
    keywords: ['nouveau virement', 'compte de départ', "compte d'arrivée", 'remise de chèques']
  },
  {
    id: 'finance.tresorerie.retenue',
    kind: 'section',
    title: 'Retenue à la source',
    summary:
      'Ces trois indicateurs montrent ce qui a été retenu à la source sur les loyers, ce qui a déjà été reversé à la DGI et ce qui reste à reverser.',
    purpose:
      "Quand elle est activée pour l'agence, la retenue à la source est prélevée sur les loyers encaissés. L'agence doit ensuite la reverser à la DGI.",
    howToRead: {
      notes: [
        'Collecté : le total des retenues à la source prélevées sur les loyers.',
        'Reversé à la DGI : le total des versements validés (les versements annulés ne comptent pas).',
        "Dû : le Collecté moins le Reversé, jamais négatif. Il s'affiche en rouge tant qu'il reste quelque chose à reverser."
      ]
    },
    consequences: [
      "Si la retenue à la source est désactivée dans les paramètres financiers de l'agence, un message l'indique et aucun nouveau versement ne peut être enregistré."
    ],
    faq: [
      {
        q: 'Pourquoi « Dû » est-il à zéro ?',
        a: "Tout ce qui a été retenu a déjà été reversé, ou rien n'a été retenu."
      },
      {
        q: 'Où activer la retenue à la source ?',
        a: "Dans les paramètres financiers de l'agence. Cet écran ne permet pas de la modifier."
      },
      {
        q: "Que devient le montant « Reversé » si j'annule un versement ?",
        a: "Il diminue du montant du versement annulé, et le « Dû » augmente d'autant."
      }
    ],
    permissions: {
      note: 'Demande « Voir les comptes de tiers ».'
    },
    related: [
      {
        label: 'Versements à la DGI',
        helpId: 'finance.tresorerie.versements'
      }
    ],
    keywords: ['retenue à la source', 'DGI', 'impôt', 'collecté', 'reversé', 'dû']
  },
  {
    id: 'finance.tresorerie.versements',
    kind: 'table',
    title: 'Versements à la DGI',
    summary: 'Ce tableau liste les versements faits à la DGI pour reverser les retenues à la source.',
    howToRead: {
      columns: [
        {
          key: 'numero',
          label: 'Numéro',
          description: "Le numéro du versement, de la forme DGI-année-numéro d'ordre."
        },
        {
          key: 'periode',
          label: 'Période',
          description: "La période concernée, telle que vous l'avez saisie (par exemple « Septembre 2026 »)."
        },
        {
          key: 'montant',
          label: 'Montant',
          description: 'Le montant versé, en FCFA.'
        },
        {
          key: 'date',
          label: 'Date',
          description: 'La date du versement.'
        },
        {
          key: 'compte',
          label: 'Compte',
          description: 'Le compte de trésorerie qui a payé.'
        },
        {
          key: 'statut',
          label: 'Statut',
          description: 'Validé, ou Annulée.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Annuler » est proposé sur les versements validés.'
        }
      ],
      statuses: [
        {
          value: 'VALIDATED',
          label: 'Validé',
          description: 'Le versement est enregistré et comptabilisé.'
        },
        {
          value: 'VOIDED',
          label: 'Annulée',
          description: "Le versement a été annulé : l'écriture inverse a été passée."
        }
      ],
      notes: ['Filtres : recherche (numéro, période, compte, référence), « Statut », « Date » et « Compte ».']
    },
    steps: [
      {
        title: 'Nouveau versement',
        detail:
          "Cliquez sur « Nouveau versement » (voir la fiche du formulaire). Le bouton n'apparaît que si la retenue à la source est activée."
      },
      {
        title: 'Annuler',
        detail:
          'Cliquez sur « Annuler », saisissez le motif (3 caractères au moins) puis confirmez avec « Annuler le versement ».'
      }
    ],
    consequences: [
      'Un versement enregistré diminue le « Dû » et la trésorerie du compte qui paie, avec son écriture comptable.',
      "L'annulation passe l'écriture inverse : le « Dû » remonte."
    ],
    faq: [
      {
        q: 'Je ne vois pas « Nouveau versement ».',
        a: "Le bouton n'est proposé que si la retenue à la source est activée, et il faut le droit « Créer des pièces financières »."
      },
      {
        q: 'Puis-je verser plus que le montant dû ?',
        a: 'Non : un versement qui dépasse le « Dû » est refusé.'
      },
      {
        q: 'Pourquoi la période est-elle du texte libre ?',
        a: "Elle sert de repère (par exemple « Septembre 2026 ») ; elle n'est pas contrôlée."
      }
    ],
    permissions: {
      note: 'Voir demande « Voir les comptes de tiers ». Créer demande « Créer des pièces financières ». Annuler demande « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Retenue à la source',
        helpId: 'finance.tresorerie.retenue'
      },
      {
        label: 'Nouveau versement à la DGI',
        helpId: 'finance.tresorerie.versement-nouveau'
      }
    ],
    keywords: ['versement DGI', 'impôt', 'retenue à la source', 'reverser', 'déclaration']
  },
  {
    id: 'finance.tresorerie.versement-nouveau',
    kind: 'section',
    title: 'Nouveau versement à la DGI',
    summary:
      "Ce formulaire enregistre le reversement à la DGI d'une partie ou de la totalité des retenues à la source collectées.",
    purpose: "Il sert à constater que l'agence a payé la DGI, et à faire baisser le montant dû.",
    steps: [
      {
        title: 'Période',
        detail: 'Indiquez la période concernée, par exemple « Septembre 2026 ».'
      },
      {
        title: 'Montant',
        detail: 'En FCFA. Il ne peut pas dépasser le montant « Dû ».'
      },
      {
        title: 'Date',
        detail: 'La date du jour est proposée.'
      },
      {
        title: 'Compte de trésorerie',
        detail: 'Choisissez le compte qui paie (caisse, banque, Mobile Money…).'
      },
      {
        title: 'Référence',
        detail: 'Facultatif : la référence de la quittance ou du virement.'
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer ».'
      }
    ],
    consequences: [
      "Le versement reçoit un numéro de la forme DGI-année-numéro d'ordre. Son écriture comptable est passée tout de suite : le montant dû à la DGI diminue et la somme sort du compte qui paie.",
      'Il est refusé si le montant dépasse le « Dû » ou si le solde du compte choisi ne le couvre pas.',
      "Pour le corriger, il faut l'annuler puis en saisir un nouveau."
    ],
    faq: [
      {
        q: '« Le versement dépasse le montant dû » : que faire ?',
        a: "Réduisez le montant : il ne peut pas dépasser ce que l'indicateur « Dû » affiche."
      },
      {
        q: 'Quel compte choisir ?',
        a: "Celui avec lequel l'agence a réellement payé la DGI : banque, caisse ou Mobile Money."
      },
      {
        q: 'Puis-je verser en plusieurs fois ?',
        a: 'Oui, tant que le total des versements validés ne dépasse pas le montant collecté.'
      }
    ],
    permissions: {
      note: 'Demande « Créer des pièces financières ». Disponible seulement si la retenue à la source est activée.'
    },
    related: [
      {
        label: 'Versements à la DGI',
        helpId: 'finance.tresorerie.versements'
      }
    ],
    keywords: ['nouveau versement', 'payer la DGI', 'reverser la retenue', 'période']
  },
  {
    id: 'finance.validation.page',
    kind: 'page',
    title: 'Pièces à valider',
    summary:
      'Retrouvez ici toutes les pièces saisies mais pas encore validées : factures fournisseurs, règlements fournisseurs et pièces de caisse. Vous les validez une à une ou par lot.',
    purpose:
      "Dans l'agence, une personne saisit et une autre valide : la saisie et la validation sont deux gestes séparés. Cet écran est celui de la personne qui valide. Chaque ligne indique qui a saisi la pièce, pour que vous puissiez filtrer par saisisseur.\n\nUne file vide est une bonne nouvelle : tout est à jour.",
    steps: [
      {
        title: 'Filtrer',
        detail:
          "Utilisez « Saisi par » pour ne voir que les pièces d'une personne, « Nature » pour un type de pièce, ainsi que la recherche, le montant et la date de saisie."
      },
      {
        title: 'Valider une pièce',
        detail: "Cliquez sur « Valider » sur la ligne, lisez l'avertissement et confirmez."
      },
      {
        title: 'Valider plusieurs pièces',
        detail: 'Cochez les pièces, puis cliquez sur « Valider la sélection » et confirmez.'
      },
      {
        title: 'Supprimer un brouillon',
        detail: 'Pour une pièce de caisse seulement : « Supprimer », puis confirmez.'
      }
    ],
    consequences: [
      "Valider est définitif : une fois validée, la pièce ne se modifie plus. Pour la corriger, il faut l'annuler par une pièce liée.",
      "Valider une pièce de caisse la numérote, enregistre la dépense en comptabilité et l'ajoute au coût du chantier.",
      "La validation par lot lance la validation de chaque pièce séparément : certaines peuvent réussir et d'autres échouer. Un compte rendu détaille les deux.",
      "Supprimer ne vaut que pour un brouillon de pièce de caisse : il n'a ni numéro, ni écriture, et ne laisse aucune trace."
    ],
    faq: [
      {
        q: 'Pourquoi une pièce reste-t-elle dans la file après une tentative ?',
        a: "Sa validation a été refusée, par exemple parce que le chantier est clôturé. Le compte rendu ou le message d'erreur en donne la raison."
      },
      {
        q: 'Pourquoi puis-je supprimer une pièce de caisse mais pas une facture ?',
        a: 'Seules les pièces de caisse peuvent être supprimées depuis cet écran.'
      },
      {
        q: 'La sélection couvre-t-elle toutes les pages ?',
        a: 'Non, seulement la page affichée. Elle est vidée quand vous changez de page ou de filtre.'
      },
      {
        q: 'La file est vide, est-ce normal ?',
        a: "Oui : aucune pièce n'attend de validation."
      }
    ],
    permissions: {
      note: 'Demande « Valider des pièces financières ». Supprimer un brouillon de pièce de caisse demande « Créer des pièces financières ».'
    },
    related: [
      {
        label: 'Tableau des pièces à valider',
        helpId: 'finance.validation.tableau'
      },
      {
        label: 'Validation par lot',
        helpId: 'finance.validation.lot'
      },
      {
        label: 'Pièce de caisse',
        to: '/tenant/:tenantId/finance/pieces-de-caisse'
      },
      {
        label: 'Importation',
        to: '/tenant/:tenantId/finance/importation'
      }
    ],
    keywords: [
      'valider',
      'validation',
      'file de validation',
      'pièces en attente',
      'brouillon',
      'facture fournisseur',
      'règlement fournisseur',
      'pièce de caisse'
    ]
  },
  {
    id: 'finance.validation.indicateurs',
    kind: 'section',
    title: 'Pièces en attente par nature',
    summary:
      'Ces trois compteurs indiquent combien de pièces attendent une validation : factures fournisseurs, règlements fournisseurs et pièces de caisse.',
    howToRead: {
      notes: [
        'Les compteurs suivent le filtre « Saisi par » : si vous choisissez une personne, ils comptent ses pièces seulement.',
        'Ils ne suivent pas le filtre « Nature » : choisir une nature ne les met pas à zéro.',
        "Ils n'apparaissent que s'il reste au moins une pièce en attente."
      ]
    },
    faq: [
      {
        q: 'Que veut dire chaque compteur ?',
        a: 'Le nombre de pièces de cette nature qui attendent encore leur validation.'
      },
      {
        q: 'Pourquoi ces compteurs ont-ils disparu ?',
        a: 'La file est vide : tout est validé.'
      },
      {
        q: 'Les compteurs sont-ils cliquables ?',
        a: 'Non. Utilisez le filtre « Nature » pour réduire la liste.'
      }
    ],
    related: [
      {
        label: 'Tableau des pièces à valider',
        helpId: 'finance.validation.tableau'
      }
    ],
    keywords: ['compteurs', 'pièces en attente', 'factures', 'règlements', 'pièces de caisse']
  },
  {
    id: 'finance.validation.tableau',
    kind: 'table',
    title: 'Tableau des pièces à valider',
    summary:
      "Chaque ligne est une pièce saisie, en attente de validation, avec sa nature, son montant et la personne qui l'a saisie.",
    howToRead: {
      columns: [
        {
          key: 'selection',
          label: 'Sélection',
          description:
            "La case à cocher sert à valider plusieurs pièces d'un coup. La case de l'en-tête coche toute la page."
        },
        {
          key: 'nature',
          label: 'Nature',
          description: 'Facture fournisseur, Règlement fournisseur ou Pièce de caisse.'
        },
        {
          key: 'piece',
          label: 'Pièce',
          description: 'Le libellé de la pièce : facture ou bon, avec le fournisseur ou le bénéficiaire.'
        },
        {
          key: 'montant',
          label: 'Montant',
          description: 'Le montant de la pièce, en FCFA.'
        },
        {
          key: 'date',
          label: 'Saisie le',
          description: 'La date de saisie de la pièce.'
        },
        {
          key: 'saisisseur',
          label: 'Saisi par',
          description: 'La personne qui a saisi la pièce.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Valider », et « Supprimer » pour une pièce de caisse.'
        }
      ],
      notes: [
        'Filtres : recherche (pièce, saisisseur), « Saisi par », « Nature », « Montant » et « Saisie du… au… ». La liste est découpée en pages de 20.'
      ]
    },
    steps: [
      {
        title: 'Valider une pièce',
        detail: 'Cliquez sur « Valider », puis confirmez.'
      },
      {
        title: 'Supprimer',
        detail: 'Pour une pièce de caisse seulement : cliquez sur « Supprimer » et confirmez.'
      }
    ],
    consequences: [
      'La validation est irréversible : la pièce ne se modifie plus.',
      "Supprimer ne laisse aucune trace : le brouillon n'avait ni numéro ni écriture."
    ],
    faq: [
      {
        q: "Comment voir les pièces d'une personne précise ?",
        a: 'Choisissez-la dans le filtre « Saisi par ».'
      },
      {
        q: 'Où modifier une pièce avant de la valider ?',
        a: 'Cet écran ne permet pas de modifier une pièce : vous pouvez seulement la valider ou, pour une pièce de caisse, la supprimer.'
      },
      {
        q: 'Que se passe-t-il si la validation échoue ?',
        a: 'Un message indique la raison et la pièce reste dans la file.'
      }
    ],
    permissions: {
      note: 'Demande « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Validation par lot',
        helpId: 'finance.validation.lot'
      }
    ],
    keywords: ['valider', 'saisi par', 'brouillons', 'pièces en attente']
  },
  {
    id: 'finance.validation.lot',
    kind: 'section',
    title: 'Validation par lot',
    summary:
      'Dès que vous cochez au moins une pièce, ce bandeau affiche leur nombre et le bouton « Valider la sélection ».',
    purpose:
      "La validation par lot est un raccourci : elle lance, pièce par pièce, la même validation que le bouton « Valider » d'une ligne.",
    steps: [
      {
        title: 'Cocher',
        detail: "Cochez les pièces voulues, ou utilisez la case de l'en-tête pour toute la page."
      },
      {
        title: 'Valider la sélection',
        detail: 'Cliquez sur « Valider la sélection ».'
      },
      {
        title: 'Confirmer',
        detail: "Lisez l'avertissement d'irréversibilité et confirmez."
      },
      {
        title: 'Lire le compte rendu',
        detail: 'Il liste les pièces validées et celles qui ont échoué, avec la raison.'
      }
    ],
    consequences: [
      "Chaque pièce est validée séparément : un échec n'empêche pas les autres.",
      'Les pièces validées ne se modifient plus ; pour les corriger, il faut les annuler une à une.'
    ],
    faq: [
      {
        q: 'Pourquoi le bandeau a-t-il disparu ?',
        a: 'La sélection est vidée dès que vous changez de page, de taille de page ou de filtre.'
      },
      {
        q: 'Puis-je sélectionner des pièces sur plusieurs pages ?',
        a: 'Non : la sélection vaut pour la page affichée.'
      },
      {
        q: 'Que faire des pièces en échec ?',
        a: 'Lisez la raison dans le compte rendu, corrigez la cause, puis validez-les à nouveau.'
      }
    ],
    permissions: {
      note: 'Demande « Valider des pièces financières ».'
    },
    related: [
      {
        label: 'Compte rendu de la validation en lot',
        helpId: 'finance.validation.compte-rendu'
      }
    ],
    keywords: ['valider la sélection', 'validation en lot', 'cocher', 'plusieurs pièces']
  },
  {
    id: 'finance.validation.compte-rendu',
    kind: 'section',
    title: 'Compte rendu de la validation en lot',
    summary:
      'Après une validation par lot, ce cadre dit combien de pièces ont été validées, lesquelles, et pourquoi les autres ont échoué.',
    steps: [
      {
        title: 'Lire le résumé',
        detail: "Le nombre de pièces validées et, s'il y en a, le nombre d'échecs."
      },
      {
        title: 'Vérifier les échecs',
        detail: 'Chaque pièce en échec est listée en rouge avec la raison donnée par le serveur.'
      },
      {
        title: 'Fermer',
        detail: 'Cliquez sur « Fermer » quand vous avez pris note.'
      }
    ],
    consequences: [
      'Les pièces listées comme validées sont définitives et ont disparu de la file.',
      'Les pièces en échec restent dans la file, inchangées.'
    ],
    faq: [
      {
        q: 'Le compte rendu disparaît-il tout seul ?',
        a: "Non, il reste jusqu'à ce que vous cliquiez sur « Fermer » ou que vous quittiez l'écran."
      },
      {
        q: "Un échec signifie-t-il que rien n'a été enregistré pour cette pièce ?",
        a: "La pièce reste dans la file, donc elle n'est pas validée."
      },
      {
        q: 'Puis-je retrouver ce compte rendu plus tard ?',
        a: 'Non, notez les échecs avant de le fermer.'
      }
    ],
    related: [
      {
        label: 'Validation par lot',
        helpId: 'finance.validation.lot'
      }
    ],
    keywords: ['compte rendu', 'échec', 'validation en lot', 'rapport']
  },
  {
    id: 'finance.importation.page',
    kind: 'page',
    title: 'Importation',
    summary:
      "Reprenez un suivi tenu sous Excel en l'important dans le module Finance, en cinq étapes. Les pièces sont saisies en brouillon, jamais validées.",
    purpose:
      "L'importation évite de ressaisir à la main un classeur Excel : pièces de caisse, factures fournisseurs, bons de commande, notes de salaire, situations de tâcheron, réceptions et sorties de stock, constatations de loyer de terrain.\n\nLe fichier est lu sur votre ordinateur et n'est jamais envoyé : seules les lignes que vous confirmez partent, une à une.",
    steps: [
      {
        title: 'Le document',
        detail:
          'Choisissez le « Type de document », le chantier si on vous le demande, et la « Date par défaut », puis « Continuer ».'
      },
      {
        title: 'Le fichier',
        detail: 'Déposez le classeur Excel (.xlsx ou .xlsm) ou cliquez pour le choisir.'
      },
      {
        title: 'Les colonnes',
        detail:
          "Indiquez, pour chaque colonne du fichier, le champ du document qu'elle remplit, puis cliquez sur « Prévisualiser »."
      },
      {
        title: "L'aperçu",
        detail:
          'Corrigez les cellules, décochez les lignes à ne pas importer, puis cliquez sur « Importer N ligne(s) ».'
      },
      {
        title: "L'import",
        detail: 'Suivez la progression, puis lisez le compte rendu : lignes saisies, refusées, décochées ou en erreur.'
      }
    ],
    consequences: [
      'Les pièces sont saisies en brouillon, jamais validées : elles se valident ensuite depuis « Pièces à valider » quand leur nature y passe. Les réceptions et sorties de stock et les constatations de loyer de terrain sont enregistrées comme depuis leur écran habituel.',
      'Les lignes en erreur ne sont pas envoyées. Une ligne décochée non plus.',
      "Un doublon probable n'est pas bloqué : s'il reste coché, il est importé.",
      "Un refus du serveur sur une ligne n'arrête pas les lignes suivantes."
    ],
    faq: [
      {
        q: 'Mon fichier est-il envoyé sur Internet ?',
        a: 'Non. Il est lu dans votre navigateur ; seules les lignes confirmées sont enregistrées.'
      },
      {
        q: 'Quel format de fichier est accepté ?',
        a: "Un classeur Excel (.xlsx ou .xlsm). Un autre format n'est pas lu."
      },
      {
        q: 'Que faire si une ligne est refusée ?',
        a: "Lisez le motif dans le compte rendu, puis revenez à l'aperçu, corrigez la ligne et relancez-la. Décochez d'abord les lignes déjà saisies."
      },
      {
        q: 'Comment éviter les doublons ?',
        a: "L'aperçu signale les lignes qui ressemblent à des pièces déjà saisies. Pour la pièce de caisse, ce contrôle n'est pas possible : vérifiez vous-même."
      }
    ],
    permissions: {
      note: 'Importer des pièces demande le droit « Créer des pièces financières ».'
    },
    related: [
      {
        label: 'Choisir le document',
        helpId: 'finance.importation.document'
      },
      {
        label: 'Pièces à valider',
        to: '/tenant/:tenantId/finance/validation'
      }
    ],
    keywords: ['importer', 'Excel', 'classeur', 'xlsx', 'reprise de données', 'import', 'fichier'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'importation-etapes',
          title: 'Cinq étapes',
          description:
            "Le document, le fichier, les colonnes, l'aperçu, puis l'import. Vous pouvez revenir en arrière avant d'importer."
        },
        {
          target: 'importation-type',
          title: 'Que contient votre fichier ?',
          description:
            "Choisissez le type de document. Une description s'affiche, et le chantier est demandé quand il est nécessaire."
        },
        {
          target: 'importation-continuer',
          title: 'Continuer',
          description: "Le bouton s'active quand le document, le chantier éventuel et la date sont prêts."
        }
      ]
    }
  },
  {
    id: 'finance.importation.document',
    kind: 'section',
    title: 'Étape 1 : le document',
    summary:
      "Cette première étape dit ce que contient votre fichier : le type de document, le chantier et la date à utiliser quand une ligne n'en a pas.",
    purpose:
      "Le type de document décide des champs à reconnaître dans votre fichier et de ce qui sera créé à l'import.",
    steps: [
      {
        title: 'Type de document',
        detail:
          "Choisissez parmi : Pièce de caisse, Facture fournisseur, Bon de commande, Note de salaire, Situation de tâcheron, Réception de stock, Sortie de stock, Constatation de loyer de terrain. Une description s'affiche."
      },
      {
        title: 'Chantier',
        detail:
          'Demandé pour une pièce de caisse, une facture fournisseur, un bon de commande ou une sortie de stock ; facultatif pour une note de salaire ; absent pour les autres types.'
      },
      {
        title: 'Date par défaut',
        detail: "Elle est utilisée pour les lignes dont le fichier ne porte aucune date. Aujourd'hui par défaut."
      },
      {
        title: 'Continuer',
        detail: "Le bouton « Continuer » s'active quand tout est prêt."
      }
    ],
    consequences: [
      "Changer de type de document efface le fichier, les colonnes et l'aperçu déjà préparés.",
      "Les listes de référence (chantiers, postes, fournisseurs…) sont chargées dès le choix du type ; en cas d'échec, un bouton « Réessayer » apparaît."
    ],
    faq: [
      {
        q: 'Pourquoi « Continuer » est-il grisé ?',
        a: "Aucun type n'est choisi, ou un chantier obligatoire manque, ou les listes de référence sont encore en chargement."
      },
      {
        q: 'À quoi sert la date par défaut ?',
        a: "À dater les lignes qui n'ont pas de date dans votre fichier."
      },
      {
        q: 'Où trouver mon type de document ?',
        a: 'Tapez quelques lettres dans la liste : elle est cherchable.'
      }
    ],
    related: [
      {
        label: "Vue d'ensemble de l'importation",
        helpId: 'finance.importation.page'
      }
    ],
    keywords: ['type de document', 'chantier', 'date par défaut', 'nature', 'étape 1']
  },
  {
    id: 'finance.importation.fichier',
    kind: 'section',
    title: 'Étape 2 : le fichier',
    summary: "Déposez ici le classeur Excel à importer. Il est lu sur votre ordinateur et n'est jamais envoyé.",
    steps: [
      {
        title: 'Déposer le fichier',
        detail: 'Glissez le classeur dans la zone, ou cliquez dessus pour le choisir. Formats : .xlsx et .xlsm.'
      },
      {
        title: 'Attendre la lecture',
        detail: "« Lecture du classeur… » s'affiche, puis vous passez à l'étape des colonnes."
      },
      {
        title: "Changer d'avis",
        detail: '« Revenir au document » ramène à la première étape.'
      }
    ],
    consequences: [
      'Le fichier reste sur votre poste : il est lu dans le navigateur.',
      'Un classeur sans ligne lisible, ou un fichier illisible, est refusé avec un message.'
    ],
    faq: [
      {
        q: 'Mon fichier est refusé.',
        a: "Il doit être un classeur Excel (.xlsx) contenant au moins une ligne de données sous une ligne d'en-têtes."
      },
      {
        q: 'Quelle feuille est lue ?',
        a: "L'étape suivante affiche le nom de la feuille lue et le nombre de lignes trouvées."
      },
      {
        q: 'Puis-je déposer un autre fichier ensuite ?',
        a: "Oui : « Changer de fichier » à l'étape des colonnes."
      }
    ],
    related: [
      {
        label: 'Étape 3 : les colonnes',
        helpId: 'finance.importation.colonnes'
      }
    ],
    keywords: ['déposer', 'fichier excel', 'xlsx', 'étape 2']
  },
  {
    id: 'finance.importation.colonnes',
    kind: 'table',
    title: 'Étape 3 : les colonnes',
    summary:
      "Ce tableau fait correspondre chaque colonne de votre fichier à un champ du document. L'écran propose déjà un choix d'après les en-têtes ; vérifiez-le.",
    howToRead: {
      columns: [
        {
          key: 'entete',
          label: 'Colonne du fichier',
          description: "L'en-tête de la colonne, tel qu'il figure dans votre fichier."
        },
        {
          key: 'exemple',
          label: 'Exemple',
          description: 'La valeur de la première ligne de données, pour reconnaître la colonne.'
        },
        {
          key: 'champ',
          label: 'Champ du document',
          description: 'Le champ rempli par cette colonne. Un astérisque (*) marque un champ obligatoire.'
        }
      ],
      notes: [
        'En haut : le nom du fichier, la feuille lue et le nombre de lignes trouvées.',
        "Un champ ne peut servir qu'une fois : le choisir ailleurs le libère de sa colonne précédente."
      ]
    },
    steps: [
      {
        title: 'Vérifier les propositions',
        detail: 'Corrigez celles qui sont fausses avec la liste de chaque ligne.'
      },
      {
        title: 'Ignorer une colonne',
        detail: 'Choisissez « Ne pas importer cette colonne ».'
      },
      {
        title: 'Prévisualiser',
        detail: "Cliquez sur « Prévisualiser ». Le bouton reste grisé tant qu'un champ obligatoire n'est pas rapproché."
      }
    ],
    consequences: [
      "Rien n'est enregistré à cette étape.",
      'Les champs obligatoires non rapprochés sont listés dans un avertissement jaune.'
    ],
    faq: [
      {
        q: 'Pourquoi « Prévisualiser » est-il grisé ?',
        a: "Un champ obligatoire (*) n'est rapproché d'aucune colonne, ou le fichier ne contient aucune ligne."
      },
      {
        q: "Une colonne n'a pas été reconnue.",
        a: 'Choisissez vous-même son champ dans la liste de la ligne.'
      },
      {
        q: 'Puis-je changer de fichier ?',
        a: 'Oui : « Changer de fichier ».'
      }
    ],
    related: [
      {
        label: "Étape 4 : l'aperçu",
        helpId: 'finance.importation.apercu'
      }
    ],
    keywords: ['colonnes', 'rapprochement des colonnes', 'champs', 'en-têtes', 'étape 3']
  },
  {
    id: 'finance.importation.apercu',
    kind: 'table',
    title: "Étape 4 : l'aperçu",
    summary:
      "L'aperçu montre chaque ligne telle qu'elle sera importée. Corrigez les cellules en erreur, décochez ce que vous ne voulez pas importer, puis lancez l'import.",
    howToRead: {
      columns: [
        {
          key: 'selection',
          label: 'Sélection',
          description: "Cochée, la ligne est importée. La case de l'en-tête coche ou décoche tout."
        },
        {
          key: 'numero',
          label: 'Ligne',
          description: 'Le numéro de la ligne dans votre fichier.'
        },
        {
          key: 'etat',
          label: 'État',
          description: 'Les erreurs de la ligne, « Doublon probable », ou « Prête ».'
        }
      ],
      notes: [
        "États possibles : « Prête » (la ligne sera importée si elle est cochée), « Doublon probable » (une pièce semblable existe déjà ; la ligne part quand même si elle reste cochée) ou le motif d'erreur écrit en rouge (la ligne n'est pas envoyée tant qu'elle n'est pas corrigée).",
        "Les autres colonnes sont les champs du document (obligatoires marqués d'un *) ; chaque cellule est un champ que vous pouvez corriger. 25 lignes par page.",
        'Le message du haut résume : lignes prêtes, en erreur et doublons probables.'
      ]
    },
    steps: [
      {
        title: 'Corriger',
        detail: "Modifiez directement les cellules en erreur : l'état se met à jour à chaque frappe."
      },
      {
        title: 'Décocher',
        detail: 'Décochez les lignes à ne pas importer.'
      },
      {
        title: 'Importer',
        detail: "Cliquez sur « Importer N ligne(s) ». Le bouton est grisé s'il n'y a aucune ligne à envoyer."
      },
      {
        title: 'Revenir',
        detail: '« Revenir aux colonnes » pour changer le rapprochement.'
      }
    ],
    consequences: [
      "Rien n'est enregistré avant le clic sur « Importer ».",
      'Les lignes en erreur ne sont pas envoyées ; les lignes décochées non plus.',
      'Pour la pièce de caisse, les doublons ne peuvent pas être signalés : un avertissement le dit.',
      "Si la liste des pièces déjà saisies n'a pas pu être lue, un avertissement précise que les doublons ne seront pas signalés."
    ],
    faq: [
      {
        q: "Que faire d'un doublon probable ?",
        a: 'Vérifiez : si la pièce existe déjà, décochez la ligne. Deux dépenses identiques le même jour existent aussi : dans ce cas laissez-la cochée.'
      },
      {
        q: 'Pourquoi « Importer » est-il grisé ?',
        a: "Aucune ligne cochée et sans erreur n'est à envoyer."
      },
      {
        q: 'Ma correction est-elle conservée si je reviens aux colonnes ?',
        a: "Revenir aux colonnes puis prévisualiser de nouveau reconstruit l'aperçu à partir du fichier : refaites alors vos corrections."
      }
    ],
    related: [
      {
        label: 'Étape 5 : compte rendu',
        helpId: 'finance.importation.compte-rendu'
      }
    ],
    keywords: ['aperçu', 'prévisualisation', 'doublon', 'erreur', 'corriger', 'étape 4']
  },
  {
    id: 'finance.importation.compte-rendu',
    kind: 'section',
    title: 'Étape 5 : le compte rendu',
    summary:
      "Après l'import, ce récapitulatif dit combien de lignes ont été saisies, refusées, décochées ou laissées en erreur.",
    howToRead: {
      notes: [
        'Pièces saisies en brouillon : le nombre de lignes enregistrées.',
        "Lignes refusées par le serveur : celles que l'enregistrement a rejetées ; elles sont détaillées dans le tableau suivant.",
        'Lignes décochées : celles que vous avez choisi de ne pas importer.',
        "Lignes en erreur, non envoyées : celles qui restaient en erreur dans l'aperçu."
      ]
    },
    steps: [
      {
        title: 'Suivre la progression',
        detail: 'Une barre indique « Saisie en cours : N sur total ».'
      },
      {
        title: 'Lire le résumé',
        detail: 'Les quatre compteurs ci-dessus.'
      },
      {
        title: 'Valider les pièces',
        detail: 'Les pièces créées en brouillon se valident depuis « Pièces à valider », là où leur nature y passe.'
      },
      {
        title: 'Recommencer',
        detail: "« Importer un autre fichier », ou « Revenir à l'aperçu » s'il reste des lignes refusées ou en erreur."
      }
    ],
    consequences: [
      "Les lignes saisies sont enregistrées : relancer l'import avec les mêmes lignes cochées peut créer des doublons.",
      "Avant de revenir à l'aperçu pour relancer des lignes refusées, décochez les lignes déjà saisies."
    ],
    faq: [
      {
        q: 'Le total ne correspond pas au nombre de lignes de mon fichier.',
        a: "Les lignes décochées et celles en erreur ne sont pas envoyées. Si l'import s'est arrêté avant la fin, vérifiez ce qui a été enregistré avant de relancer."
      },
      {
        q: 'Où retrouver mes pièces importées ?',
        a: 'Les pièces financières en brouillon sont dans « Pièces à valider ».'
      },
      {
        q: 'Une ligne refusée est-elle perdue ?',
        a: "Non : elle reste dans l'aperçu. Corrigez-la, décochez les autres, puis relancez."
      }
    ],
    related: [
      {
        label: 'Lignes refusées',
        helpId: 'finance.importation.refus'
      },
      {
        label: 'Pièces à valider',
        to: '/tenant/:tenantId/finance/validation'
      }
    ],
    keywords: ['compte rendu', "résultat de l'import", 'lignes saisies', 'brouillon', 'étape 5']
  },
  {
    id: 'finance.importation.refus',
    kind: 'table',
    title: 'Lignes refusées par le serveur',
    summary:
      "Ce tableau n'apparaît que si certaines lignes ont été refusées à l'enregistrement. Il donne, pour chacune, la raison indiquée.",
    howToRead: {
      columns: [
        {
          key: 'numero',
          label: 'Ligne',
          description: 'Le numéro de la ligne dans votre fichier.'
        },
        {
          key: 'motif',
          label: 'Motif rendu par le serveur',
          description: 'La raison du refus : un champ invalide, une règle de gestion, un droit manquant…'
        }
      ]
    },
    steps: [
      {
        title: 'Lire le motif',
        detail: 'Comprenez la cause : donnée incorrecte, élément inconnu, chantier clôturé…'
      },
      {
        title: 'Corriger',
        detail: "« Revenir à l'aperçu », corrigez la ligne et décochez les lignes déjà saisies."
      },
      {
        title: 'Relancer',
        detail: 'Cliquez de nouveau sur « Importer N ligne(s) ».'
      }
    ],
    faq: [
      {
        q: 'Une ligne refusée a-t-elle quand même été créée ?',
        a: "Normalement non, le refus signifie que l'enregistrement n'a pas eu lieu. Si le message dit que la réponse du serveur n'est pas parvenue, vérifiez avant de relancer."
      },
      {
        q: "Puis-je corriger la cause hors de l'importation ?",
        a: "Oui, par exemple en créant l'élément manquant, puis en reprenant l'import."
      },
      {
        q: 'Pourquoi plusieurs lignes ont-elles le même motif ?',
        a: 'Elles ont probablement la même donnée à corriger.'
      }
    ],
    related: [
      {
        label: 'Le compte rendu',
        helpId: 'finance.importation.compte-rendu'
      }
    ],
    keywords: ['lignes refusées', 'motif', 'erreur serveur', 'refus']
  }
];

export default entries;
