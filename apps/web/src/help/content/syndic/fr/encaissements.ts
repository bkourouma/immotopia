import type { HelpEntry } from '../../../types';

/** Zone « encaissements » du module « syndic » (fr) : recouvrement, trésorerie et paiements. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Recouvrement
  {
    id: 'syndic.recouvrement.liste',
    kind: 'page',
    title: 'Recouvrement des impayés',
    summary:
      'Cet écran suit les appels de charges échus et non soldés : retards, relances, pénalités et échéanciers. Vous y relancez les copropriétaires en retard, un par un ou en groupe.',
    purpose:
      "Il sert à récupérer les impayés d'une copropriété. Il part des appels de charges dont l'échéance est passée et dont le reste dû est supérieur à zéro.",
    howToRead: {
      notes: [
        '« Lots en retard » : nombre de lots concernés. Un lot compte une seule fois, même avec plusieurs appels impayés. « Montant restant dû » : total des restes dus.',
        'Quatre onglets : « Tableau des retards », « Historique relances », « Pénalités de retard » et « Échéanciers ».',
        "Les boutons « Relance manuelle », « Appliquer pénalité » et « Créer échéancier » restent grisés tant qu'aucun appel n'est en retard."
      ]
    },
    steps: [
      {
        title: 'Repérer les retards',
        detail: "Ouvrez l'onglet « Tableau des retards » : chaque ligne est un appel échu avec son reste dû."
      },
      {
        title: 'Relancer en groupe',
        detail:
          "Cliquez sur « Lancer les relances groupées », lisez l'aperçu, puis confirmez avec « Envoyer … relance(s) »."
      },
      {
        title: 'Relancer un cas précis',
        detail: "Bouton « Relance manuelle » : choisissez l'appel, le niveau et le canal."
      },
      {
        title: 'Appliquer une pénalité',
        detail: "Bouton « Appliquer pénalité » : choisissez l'appel et le taux mensuel."
      },
      {
        title: 'Accorder un délai',
        detail: 'Bouton « Créer échéancier » : fixez le total et les échéances convenues avec le copropriétaire.'
      },
      { title: 'Suivre', detail: "L'onglet « Historique relances » montre ce qui est parti et ce qui a échoué." }
    ],
    consequences: [
      "Une relance enregistrée ne se retire pas. Si l'envoi échoue, elle reste dans l'historique avec la cause de l'échec.",
      "Une pénalité s'ajoute au compte du copropriétaire. Une pénalité remise est recréditée, mais ne se rétablit pas.",
      "Un lot qui a un échéancier actif n'est plus relancé par les relances groupées."
    ],
    faq: [
      {
        q: 'Pourquoi un appel absent du tableau ?',
        a: "Seuls les appels échus dont le reste dû est supérieur à zéro y figurent. Un appel soldé, même par une avance, n'y est pas."
      },
      {
        q: 'Quelle différence avec « Dossiers en retard » de la Trésorerie ?',
        a: 'Ici « Lots en retard » compte les lots. La Trésorerie compte les appels en retard : un lot avec deux appels impayés y compte pour deux.'
      },
      {
        q: 'Le canal choisi pour une relance manuelle change-t-il l’envoi ?',
        a: "Non, il est seulement enregistré dans l'historique. L'envoi se fait par e-mail et, si WhatsApp est actif pour l'agence, par WhatsApp."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété', 'Comptable'],
      note: "Consulter l'écran et l'aperçu des relances demande le droit de voir le module Syndic. Envoyer une relance, appliquer ou remettre une pénalité, créer un échéancier demandent le droit de modifier le module Syndic."
    },
    related: [
      { label: 'Indicateurs du recouvrement', helpId: 'syndic.recouvrement.indicateurs' },
      { label: 'Tableau des retards', helpId: 'syndic.recouvrement.retards' },
      { label: 'Relances groupées', helpId: 'syndic.recouvrement.relances-groupees' },
      { label: 'Trésorerie', helpId: 'syndic.tresorerie.liste' },
      { label: 'Paiements', helpId: 'syndic.paiements.liste' }
    ],
    keywords: ['impayé', 'retard', 'relance', 'pénalité', 'échéancier', 'recouvrement', 'charges', 'copropriétaire']
  },
  {
    id: 'syndic.recouvrement.indicateurs',
    kind: 'section',
    title: 'Indicateurs du recouvrement',
    summary:
      'Deux cartes résument les retards de la copropriété : le nombre de lots concernés et le montant total restant dû.',
    howToRead: {
      notes: [
        '« Lots en retard » : lots ayant au moins un appel échu non soldé. Un lot compte une fois.',
        "« Montant restant dû » : somme des restes dus des appels échus. Un appel couvert par un paiement ou une avance n'est pas compté.",
        "Les cartes passent en rouge dès qu'il y a un retard."
      ]
    },
    faq: [
      {
        q: 'Ces chiffres suivent-ils les paiements ?',
        a: 'Oui. Ils sont recalculés après chaque relance, pénalité ou échéancier enregistré, et quand la page est rechargée.'
      },
      {
        q: 'Pourquoi le montant ne baisse-t-il pas après une pénalité remise ?',
        a: "Les cartes comptent les restes dus des appels de charges. Les pénalités sont suivies à part, dans l'onglet « Pénalités de retard »."
      },
      {
        q: 'Un échéancier retire-t-il le lot des retards ?',
        a: "Non. Le reste dû reste compté tant qu'il n'est pas payé ; l'échéancier arrête seulement les relances groupées."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de voir le module Syndic.' },
    keywords: ['lots en retard', 'montant dû', 'total impayé']
  },
  {
    id: 'syndic.recouvrement.retards',
    kind: 'table',
    title: 'Tableau des retards',
    summary:
      'Ce tableau liste chaque appel de charges échu et non soldé, avec le reste dû et le nombre de jours de retard.',
    purpose:
      "C'est la liste de travail du recouvrement : à partir d'elle, vous décidez qui relancer, pénaliser ou mettre en échéancier.",
    howToRead: {
      columns: [
        { key: 'lot', label: 'Lot', description: 'Le lot concerné.' },
        {
          key: 'owner',
          label: 'Propriétaire',
          description: 'Le copropriétaire du lot ; « Sans propriétaire » si aucun n’est rattaché.'
        },
        { key: 'dueDate', label: 'Échéance', description: "Date limite de l'appel de charges." },
        { key: 'daysLate', label: 'Jours retard', description: "Jours écoulés depuis l'échéance." },
        { key: 'amount', label: 'Montant', description: "Montant de l'appel." },
        { key: 'paid', label: 'Payé', description: 'Part déjà réglée.' },
        { key: 'outstanding', label: 'Reste', description: 'Ce qui reste dû.' }
      ],
      notes: [
        'La recherche porte sur le lot, le propriétaire et son e-mail. Vous pouvez filtrer par jours de retard, échéance et reste dû.',
        "Le tableau est complet : la recherche et les pages se font sur l'écran, sans nouvel appel au serveur."
      ]
    },
    steps: [
      {
        title: 'Chercher',
        detail: 'Saisissez un lot ou un nom, ou ouvrez les filtres pour les jours de retard et le reste dû.'
      },
      {
        title: 'Agir',
        detail:
          "Utilisez ensuite les boutons du haut de l'écran : « Relance manuelle », « Appliquer pénalité » ou « Créer échéancier »."
      },
      { title: 'Exporter', detail: "Le tableau peut être exporté depuis sa barre d'outils." }
    ],
    faq: [
      {
        q: 'Où se règle un appel ?',
        a: "Pas ici : les encaissements s'enregistrent depuis les paiements de l'appel ou l'onglet « Paiements »."
      },
      {
        q: 'Pourquoi une ligne a-t-elle « Sans propriétaire » ?',
        a: "Aucun copropriétaire n'est rattaché au lot. Aucune relance ne peut partir tant que ce n'est pas corrigé."
      },
      {
        q: 'Sur quoi porte la recherche ?',
        a: 'Sur le lot, le propriétaire et son e-mail. Vous pouvez aussi filtrer par jours de retard, échéance et reste dû.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de voir le module Syndic.' },
    related: [{ label: 'Relances groupées', helpId: 'syndic.recouvrement.relances-groupees' }],
    keywords: ['retards', 'impayés', 'reste dû', 'jours de retard']
  },
  {
    id: 'syndic.recouvrement.relances',
    kind: 'table',
    title: 'Historique des relances',
    summary:
      "Ce tableau garde la trace de toutes les relances d'impayés, réussies ou échouées, avec leur niveau et leur canal.",
    purpose: "Il permet de savoir qui a déjà été relancé, quand, et pourquoi un envoi n'est pas parti.",
    howToRead: {
      columns: [
        { key: 'reminderLevel', label: 'Niveau', description: 'Rang de la relance pour cet appel, de 1 à 4.' },
        {
          key: 'channel',
          label: 'Canal',
          description: 'Canal enregistré avec la relance (voir la remarque ci-dessous).'
        },
        { key: 'status', label: 'Statut', description: 'Résultat de la relance.' },
        { key: 'lot', label: 'Lot', description: 'Le lot relancé.' },
        { key: 'owner', label: 'Propriétaire', description: 'Le copropriétaire du lot.' },
        { key: 'sentAt', label: 'Envoyé le', description: "Date et heure d'envoi." },
        {
          key: 'cause',
          label: 'Cause',
          description: "Raison de l'échec, uniquement pour les relances en échec ; sinon un tiret."
        }
      ],
      statuses: [
        { value: 'SENT', label: 'Envoyé', description: 'La relance est partie.' },
        { value: 'DELIVERED', label: 'Distribué', description: 'La relance a été distribuée.' },
        { value: 'FAILED', label: 'Échec', description: "L'envoi n'a pas abouti. La cause est indiquée." }
      ],
      notes: [
        "Causes d'échec fréquentes : « Le copropriétaire n’a pas d’adresse e-mail », « Aucun copropriétaire rattaché au lot », « L’appel est déjà soldé », « La notification de relance est désactivée pour l’agence », ou une erreur du serveur de messagerie.",
        "Le canal est une simple mention : l'envoi réel se fait par e-mail et, si WhatsApp est actif pour l'agence, par WhatsApp. Aucun SMS ni notification n'est envoyé par cette fonction.",
        "Filtres : statut, canal, niveau, date d'envoi et lot."
      ]
    },
    faq: [
      {
        q: 'Une relance en échec empêche-t-elle la suivante ?',
        a: "Non. Une relance en échec n'est pas comptée comme arrivée : elle ne retarde pas la relance suivante."
      },
      {
        q: 'Comment corriger la cause d’un échec ?',
        a: "Selon la cause : ajoutez l'e-mail du copropriétaire sur sa fiche, rattachez un copropriétaire au lot, ou vérifiez la notification de relance dans la configuration de l'agence. Relancez ensuite."
      },
      {
        q: 'Jusqu’à quel niveau va-t-on ?',
        a: 'Le niveau va de 1 à 4. Après le niveau 4, les relances groupées restent au niveau 4.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de voir le module Syndic.' },
    related: [
      { label: 'Relances groupées', helpId: 'syndic.recouvrement.relances-groupees' },
      { label: 'Relance manuelle', helpId: 'syndic.recouvrement.relance-manuelle' }
    ],
    keywords: ['relance', 'rappel', 'échec d’envoi', 'e-mail', 'whatsapp']
  },
  {
    id: 'syndic.recouvrement.penalites',
    kind: 'table',
    title: 'Pénalités de retard',
    summary:
      'Ce tableau liste les pénalités appliquées aux appels en retard. Vous pouvez en appliquer une nouvelle ou accorder une remise.',
    purpose:
      "Une pénalité est un montant calculé sur le reste dû d'un appel en retard. Elle est inscrite au compte du copropriétaire.",
    howToRead: {
      columns: [
        { key: 'lot', label: 'Lot', description: 'Le lot pénalisé.' },
        { key: 'owner', label: 'Propriétaire', description: 'Le copropriétaire du lot.' },
        { key: 'daysLate', label: 'Jours retard', description: 'Jours de retard retenus pour le calcul.' },
        { key: 'penaltyRate', label: 'Taux', description: 'Taux mensuel appliqué, en pourcentage.' },
        { key: 'penaltyAmount', label: 'Montant', description: 'Montant de la pénalité.' },
        { key: 'status', label: 'Statut', description: 'Active ou remise.' },
        { key: 'action', label: 'Action', description: 'Bouton « Remise » sur une pénalité encore active.' }
      ],
      statuses: [
        { value: 'false', label: 'Active', description: 'La pénalité est due.' },
        { value: 'true', label: 'Remise', description: 'La pénalité a été annulée avec un motif.' }
      ],
      notes: [
        "Calcul : reste dû × taux mensuel × jours de retard ÷ 30, plafonné au reste dû. Le taux mensuel ne peut pas dépasser 10 %. Un aperçu s'affiche avant de valider.",
        "« Jours de retard (optionnel) » : laissé vide, le retard réel depuis l'échéance est utilisé."
      ]
    },
    steps: [
      {
        title: 'Appliquer',
        detail:
          "Bouton « Appliquer pénalité » : choisissez l'appel, le taux mensuel et, si besoin, les jours de retard, puis « Appliquer »."
      },
      {
        title: 'Remettre',
        detail:
          'Sur une ligne active, cliquez sur « Remise », saisissez le motif (obligatoire), puis « Appliquer remise ».'
      }
    ],
    consequences: [
      "Appliquer une pénalité l'inscrit au débit du compte du copropriétaire, immédiatement.",
      "Accorder une remise recrédite le même montant. Elle est définitive : l'écran ne permet pas de rétablir la pénalité.",
      "Aucun message n'est envoyé au copropriétaire."
    ],
    faq: [
      { q: 'Peut-on pénaliser un appel soldé ?', a: "Non. L'application est refusée si l'appel est déjà soldé." },
      {
        q: 'Peut-on modifier une pénalité ?',
        a: 'Non. Remettez-la avec un motif, puis appliquez-en une nouvelle si nécessaire.'
      },
      {
        q: 'Le montant de la pénalité est-il compté dans « Montant restant dû » ?',
        a: 'Non. Cette carte ne compte que les restes dus des appels de charges.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir les pénalités demande le droit de voir le module Syndic. Appliquer ou remettre une pénalité demande le droit de modifier le module Syndic.'
    },
    keywords: ['pénalité', 'intérêts de retard', 'remise', 'majoration']
  },
  {
    id: 'syndic.recouvrement.echeanciers',
    kind: 'table',
    title: 'Échéanciers de paiement',
    summary:
      'Ce tableau liste les plans de paiement convenus avec des copropriétaires pour solder un appel en plusieurs échéances.',
    purpose:
      "Un échéancier formalise un accord de paiement échelonné. Tant qu'il est actif, le lot est écarté des relances groupées.",
    howToRead: {
      columns: [
        { key: 'lot', label: 'Lot', description: 'Le lot concerné.' },
        { key: 'owner', label: 'Propriétaire', description: 'Le copropriétaire du lot.' },
        { key: 'chargeCall', label: 'Appel', description: "Période de l'appel de charges visé." },
        { key: 'totalAmount', label: 'Montant total', description: 'Somme à payer selon l’accord.' },
        { key: 'agreedAt', label: 'Accord', description: "Date de l'accord." },
        { key: 'instalments', label: 'Échéances', description: 'Chaque date avec son montant.' },
        { key: 'status', label: 'Statut', description: "État de l'échéancier." }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: "L'échéancier est en cours." },
        { value: 'COMPLETED', label: 'Terminé', description: "L'échéancier est mené à son terme." },
        { value: 'DEFAULTED', label: 'En défaut', description: "Les échéances n'ont pas été respectées." }
      ]
    },
    steps: [
      {
        title: 'Créer',
        detail:
          "Bouton « Créer échéancier » : choisissez l'appel, le « Montant total » et la « Date accord (optionnel) »."
      },
      {
        title: 'Saisir les échéances',
        detail: 'Pour chaque échéance, donnez la date et le montant. « Ajouter une échéance » en ajoute une.'
      },
      { title: 'Valider', detail: 'Cliquez sur « Créer ». Le total doit être égal à la somme des échéances.' }
    ],
    consequences: [
      "L'échéancier ne change ni le reste dû de l'appel ni les paiements : il enregistre l'accord.",
      "Tant qu'un échéancier est actif sur un lot, les relances groupées l'écartent (motif « Plan de paiement actif »).",
      "Aucun message n'est envoyé au copropriétaire."
    ],
    faq: [
      {
        q: 'Pourquoi la création est-elle refusée ?',
        a: "Soit l'appel est déjà soldé, soit le total saisi ne correspond pas à la somme des échéances."
      },
      {
        q: 'L’échéancier suit-il les paiements tout seul ?',
        a: "Cet écran n'affiche pas de suivi des échéances payées. Les paiements s'enregistrent comme d'habitude sur l'appel."
      },
      {
        q: 'Un échéancier prévient-il le copropriétaire ?',
        a: "Non. Aucun message n'est envoyé : l'échéancier enregistre seulement l'accord."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir les échéanciers demande le droit de voir le module Syndic. En créer demande le droit de modifier le module Syndic.'
    },
    keywords: ['plan de paiement', 'échelonnement', 'accord', 'délai de paiement']
  },
  {
    id: 'syndic.recouvrement.relances-groupees',
    kind: 'section',
    title: 'Relances groupées',
    summary:
      "Le bouton « Lancer les relances groupées » ouvre d'abord un aperçu : les relances qui vont partir et les appels écartés. Rien n'est envoyé avant votre confirmation.",
    purpose:
      "Relancer d'un coup tous les copropriétaires dont l'appel est échu, sans en oublier ni en relancer deux fois trop vite.",
    howToRead: {
      columns: [
        { key: 'lotNumber', label: 'Lot', description: 'Le lot relancé.' },
        { key: 'period', label: 'Période', description: "Période de l'appel de charges." },
        { key: 'nextLevel', label: 'Niveau suivant', description: 'Niveau de la relance qui va partir, de 1 à 4.' }
      ],
      statuses: [
        { value: 'PAYMENT_PLAN_ACTIVE', label: 'Plan de paiement actif', description: 'Le lot a un échéancier actif.' },
        {
          value: 'REMINDER_TOO_RECENT',
          label: 'Relance trop récente',
          description: "Le délai depuis la dernière relance n'est pas écoulé (7 jours par défaut)."
        },
        {
          value: 'DECLARED_PAYMENT_PENDING',
          label: 'Paiement déclaré en cours de vérification',
          description:
            "Un paiement mobile déclaré attend votre validation, depuis moins de jours ouvrés que le délai d'alerte."
        }
      ],
      notes: [
        'Sont relancés les appels échus dont le reste dû est supérieur à zéro. Le niveau suivant est le nombre de relances déjà faites plus un, au plus 4.',
        "Après l'envoi, un résumé indique le nombre de relances envoyées, les échecs par cause et les appels écartés."
      ]
    },
    steps: [
      { title: 'Ouvrir l’aperçu', detail: 'Cliquez sur « Lancer les relances groupées ».' },
      {
        title: 'Vérifier',
        detail: 'Lisez la liste « relance(s) vont partir » et la liste des « appel(s) écarté(s) » avec leur motif.'
      },
      {
        title: 'Confirmer',
        detail: "Cliquez sur « Envoyer … relance(s) ». S'il n'y a rien à envoyer, seul « Fermer » reste."
      }
    ],
    consequences: [
      "L'envoi est définitif : chaque relance est enregistrée dans l'historique, même si l'envoi échoue.",
      "Chaque relance part par e-mail au copropriétaire. Si WhatsApp est actif pour l'agence et que le copropriétaire a un numéro, elle part aussi par WhatsApp.",
      'Les relances sont enregistrées avec le canal « E-mail ».'
    ],
    faq: [
      {
        q: 'L’aperçu peut-il différer de l’envoi ?',
        a: "Les deux utilisent les mêmes règles, mais l'envoi recalcule au moment de votre confirmation."
      },
      {
        q: 'Pourquoi un appel est-il écarté ?',
        a: 'Un échéancier est actif, une relance est trop récente, ou un paiement mobile déclaré attend votre validation. Le motif est affiché.'
      },
      {
        q: 'Comment changer le délai entre deux relances ?',
        a: 'Cet écran ne le propose pas. Sans réglage propre à la copropriété, le délai est de 7 jours.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: "Voir l'aperçu demande le droit de voir le module Syndic. Envoyer les relances demande le droit de modifier le module Syndic."
    },
    related: [{ label: 'Historique des relances', helpId: 'syndic.recouvrement.relances' }],
    keywords: ['relance en masse', 'relances automatiques', 'rappel', 'e-mail', 'aperçu']
  },
  {
    id: 'syndic.recouvrement.relance-manuelle',
    kind: 'section',
    title: 'Relance manuelle',
    summary: 'Cette fenêtre relance un copropriétaire pour un appel précis, en choisissant le niveau et le canal.',
    purpose:
      'À utiliser pour un cas particulier, hors des relances groupées, par exemple après un échange téléphonique.',
    steps: [
      { title: 'Choisir l’appel', detail: 'Dans « Appel de charges », cherchez par lot, copropriétaire ou reste dû.' },
      { title: 'Régler le niveau', detail: '« Niveau » de 1 à 4 (1 par défaut).' },
      {
        title: 'Choisir le canal',
        detail: '« Canal » : Email, SMS, WhatsApp ou Push. Il est enregistré avec la relance.'
      },
      { title: 'Créer', detail: 'Cliquez sur « Créer ».' }
    ],
    consequences: [
      "La relance est enregistrée aussitôt, puis envoyée par e-mail au copropriétaire et, si WhatsApp est actif pour l'agence, par WhatsApp.",
      "Le canal choisi n'oriente pas l'envoi : il apparaît seulement dans l'historique.",
      "Si l'envoi échoue, le message « Relance enregistrée, envoi échoué » donne la cause. La relance reste dans l'historique avec le statut « Échec »."
    ],
    faq: [
      { q: 'Peut-on relancer un appel soldé ?', a: "Non, la relance est refusée si l'appel est déjà soldé." },
      {
        q: 'Un paiement déclaré bloque-t-il la relance manuelle ?',
        a: 'Non. Seules les relances groupées écartent ces appels.'
      },
      {
        q: "Que se passe-t-il si l'envoi échoue ?",
        a: "Le message « Relance enregistrée, envoi échoué » donne la cause. La relance reste dans l'historique avec le statut « Échec »."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de modifier le module Syndic.' },
    related: [{ label: 'Historique des relances', helpId: 'syndic.recouvrement.relances' }],
    keywords: ['relance', 'rappel', 'niveau', 'canal']
  },

  // ------------------------------------------------------------------ Trésorerie
  {
    id: 'syndic.tresorerie.liste',
    kind: 'page',
    title: 'Trésorerie de la copropriété',
    summary:
      'Cet écran donne la situation financière de la copropriété : fonds, appels émis, paiements reçus et impayés. Quatre onglets détaillent chaque chiffre.',
    purpose:
      "Il répond à la question « où en est l'argent de la copropriété ? ». Il sert aussi à créer les fonds (compte courant, fonds de travaux) et à ajuster leur solde.",
    howToRead: {
      notes: [
        '« Total fonds » : somme des soldes des fonds. « Total appelé » : somme des appels de charges émis.',
        '« Total payé » : part des appels réglée. « Reste à payer » : total appelé moins total payé.',
        '« Total des avances » : paiements reçus pas encore affectés à un appel.',
        "« Dossiers en retard » : nombre d'appels échus non soldés. « Montant en retard » : leur reste dû.",
        "Cliquer sur une carte ouvre l'onglet qui la détaille."
      ]
    },
    steps: [
      { title: 'Lire les cartes', detail: "Elles résument la situation en un coup d'œil." },
      { title: 'Voir les fonds', detail: 'Onglet « Détail des fonds » : soldes, renommer, ajuster, historique.' },
      {
        title: 'Vérifier les appels et paiements',
        detail: 'Onglets « Détail des appels de fonds » et « Détail des paiements reçus ».'
      },
      {
        title: 'Traiter les retards',
        detail: "Onglet « Détail des impayés et retards », puis l'écran « Recouvrement » pour relancer."
      }
    ],
    consequences: [
      "Créer un fonds ou ajuster son solde modifie le « Total fonds » tout de suite et laisse une trace dans l'historique du fonds."
    ],
    faq: [
      {
        q: 'Où enregistrer un encaissement ?',
        a: "Pas ici : cet écran se lit. Les paiements se saisissent depuis les appels de charges ou l'écran « Paiements »."
      },
      {
        q: 'Pourquoi un fonds peut-il être négatif ?',
        a: "C'est permis (avance de trésorerie), mais un avertissement s'affiche après l'ajustement."
      },
      { q: 'À quoi sert un clic sur une carte ?', a: "Il ouvre l'onglet qui détaille le chiffre de la carte." }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété', 'Comptable'],
      note: 'Consulter demande le droit de voir le module Syndic. Créer, renommer ou ajuster un fonds demande le droit de modifier le module Syndic.'
    },
    related: [
      { label: 'Détail des fonds', helpId: 'syndic.tresorerie.fonds' },
      { label: 'Recouvrement', helpId: 'syndic.recouvrement.liste' },
      { label: 'Paiements', helpId: 'syndic.paiements.liste' }
    ],
    keywords: ['finances', 'fonds', 'solde', 'caisse', 'appels', 'paiements', 'impayés']
  },
  {
    id: 'syndic.tresorerie.indicateurs',
    kind: 'section',
    title: 'Indicateurs de trésorerie',
    summary:
      "Sept cartes résument les fonds, les appels, les paiements et les retards de la copropriété. Les cartes cliquables ouvrent l'onglet de détail.",
    howToRead: {
      notes: [
        '« Total fonds » : soldes cumulés des fonds. « Total appelé » : tous les appels de charges émis. « Total payé » : ce qui a été réglé sur ces appels.',
        '« Reste à payer » : total appelé moins total payé. « Total des avances » : paiements reçus en trop, pas encore affectés à un appel.',
        "« Dossiers en retard » : nombre d'appels échus non soldés (un lot avec deux appels impayés compte deux). « Montant en retard » : leur reste dû."
      ]
    },
    faq: [
      {
        q: 'Pourquoi « Total payé » est-il inférieur à la somme des paiements ?',
        a: 'Les avances non affectées à un appel ne sont pas comptées dans « Total payé » ; elles sont dans « Total des avances ».'
      },
      {
        q: 'Où voir le détail d’une carte ?',
        a: "Cliquez dessus : « Total fonds », « Total appelé », « Total payé », « Reste à payer » et les deux cartes de retard ouvrent l'onglet correspondant."
      },
      { q: 'Comment est calculé « Reste à payer » ?', a: "C'est « Total appelé » moins « Total payé »." }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de voir le module Syndic.' },
    keywords: ['total appelé', 'total payé', 'avances', 'reste à payer']
  },
  {
    id: 'syndic.tresorerie.fonds',
    kind: 'table',
    title: 'Détail des fonds',
    summary:
      'Ce tableau liste les fonds de la copropriété (compte courant, fonds de travaux…) avec leur solde. Vous pouvez en créer, les renommer et ajuster leur solde.',
    purpose: "Un fonds est une réserve d'argent suivie séparément. Chaque mouvement est conservé dans son historique.",
    howToRead: {
      columns: [
        { key: 'name', label: 'Fonds', description: 'Nom du fonds.' },
        { key: 'balance', label: 'Solde', description: 'Solde actuel, en FCFA.' },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Renommer », « Ajuster le solde » et « Historique des mouvements ».'
        }
      ]
    },
    steps: [
      {
        title: 'Créer un fonds',
        detail: 'Bouton « Nouveau fonds » : « Nom du fonds », « Solde initial » (0 par défaut), devise en FCFA.'
      },
      { title: 'Renommer', detail: 'Bouton « Renommer », puis « Enregistrer ».' },
      {
        title: 'Ajuster le solde',
        detail: 'Bouton « Ajuster le solde » : voir la fiche « Ajuster le solde d’un fonds ».'
      },
      { title: 'Consulter', detail: '« Historique des mouvements » ouvre la liste des mouvements du fonds.' }
    ],
    faq: [
      { q: 'Peut-on supprimer un fonds ?', a: "L'écran ne propose pas de suppression." },
      { q: 'Quelles devises sont possibles ?', a: 'Seulement le FCFA.' },
      {
        q: 'Quel solde donner à un nouveau fonds ?',
        a: 'Le « Solde initial » est à 0 par défaut. Vous pouvez saisir un autre montant à la création.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir les fonds demande le droit de voir le module Syndic. Créer, renommer et ajuster demandent le droit de modifier le module Syndic.'
    },
    related: [{ label: 'Ajuster le solde d’un fonds', helpId: 'syndic.tresorerie.ajustement' }],
    keywords: ['fonds de travaux', 'compte courant', 'réserve', 'solde']
  },
  {
    id: 'syndic.tresorerie.ajustement',
    kind: 'section',
    title: 'Ajuster le solde d’un fonds',
    summary:
      'Cette fenêtre enregistre un mouvement manuel sur un fonds : un ajustement, ou une dépense payée par le fonds.',
    purpose: 'À utiliser pour corriger un solde ou constater une dépense réglée directement par le fonds.',
    steps: [
      {
        title: 'Choisir la nature',
        detail: '« Nature du mouvement » : « Ajustement » ou « Dépense payée par le fonds ».'
      },
      {
        title: 'Choisir le sens',
        detail: '« Crédit (augmenter le solde) » ou « Débit (diminuer le solde) ». Une dépense est toujours un débit.'
      },
      { title: 'Saisir montant et motif', detail: 'Le « Montant » et le « Motif » sont obligatoires.' },
      { title: 'Appliquer', detail: 'Cliquez sur « Appliquer ».' }
    ],
    consequences: [
      'Le solde change tout de suite et le mouvement est conservé dans « Historique des mouvements ».',
      "Le solde peut devenir négatif : c'est permis, avec l'avertissement « le solde du fonds est désormais négatif »."
    ],
    faq: [
      {
        q: 'Comment corriger une erreur de saisie ?',
        a: "L'écran ne propose pas d'annuler un mouvement. Enregistrez un ajustement en sens inverse avec un motif clair."
      },
      {
        q: 'Quelle différence entre ajustement et dépense ?',
        a: "L'ajustement va dans les deux sens. La dépense diminue toujours le fonds."
      },
      {
        q: 'Le solde peut-il devenir négatif ?',
        a: "Oui, c'est permis. L'écran affiche alors l'avertissement « le solde du fonds est désormais négatif »."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de modifier le module Syndic.' },
    keywords: ['ajustement', 'dépense', 'correction de solde', 'débit', 'crédit']
  },
  {
    id: 'syndic.tresorerie.appels',
    kind: 'table',
    title: 'Détail des appels de fonds',
    summary: 'Ce tableau liste les appels de charges émis, avec ce qui a été payé et ce qui reste dû.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Référence', description: "Numéro de l'appel." },
        { key: 'period', label: 'Période', description: "Période couverte par l'appel." },
        { key: 'lotLabel', label: 'Lot', description: 'Le lot appelé.' },
        {
          key: 'ownerLabel',
          label: 'Copropriétaire',
          description: 'Le copropriétaire du lot ; « Sans copropriétaire » si aucun.'
        },
        { key: 'amount', label: 'Montant appelé', description: "Montant de l'appel." },
        { key: 'paid', label: 'Payé', description: 'Part réglée.' },
        { key: 'outstanding', label: 'Reste', description: 'Ce qui reste dû.' },
        { key: 'dueDate', label: 'Échéance', description: 'Date limite de paiement.' },
        { key: 'status', label: 'Statut', description: "État de l'appel." }
      ],
      statuses: [
        {
          value: 'PENDING',
          label: 'En attente',
          description: "Rien n'est encore payé et l'échéance n'est pas passée."
        },
        { value: 'PARTIAL', label: 'Partiel', description: 'Une partie est payée.' },
        { value: 'PAID', label: 'Payé', description: "L'appel est soldé." },
        { value: 'OVERDUE', label: 'En retard', description: "L'échéance est passée et il reste un montant dû." }
      ],
      notes: [
        "La recherche et les filtres (statut, lot) sont faits par le serveur. Il n'y a pas de tri de colonne.",
        "L'écran « Charges » sert à créer et gérer les appels ; ici, on les consulte."
      ]
    },
    faq: [
      { q: 'Où créer un appel ?', a: "Dans l'écran « Charges » de la copropriété, pas dans la Trésorerie." },
      { q: 'Pourquoi un appel est-il « En retard » ?', a: 'Son échéance est passée et il reste un montant dû.' },
      {
        q: 'Peut-on trier les colonnes ?',
        a: 'Non. Utilisez la recherche et les filtres (statut, lot), qui sont faits par le serveur.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de voir le module Syndic.' },
    keywords: ['appels de charges', 'appels de fonds', 'échéance', 'reste dû']
  },
  {
    id: 'syndic.tresorerie.paiements',
    kind: 'table',
    title: 'Détail des paiements reçus',
    summary: 'Ce tableau liste les paiements reçus, avec une ligne par appel de charges réglé.',
    purpose: 'Il permet de retrouver quel paiement a soldé quel appel, à quelle date et par quel moyen.',
    howToRead: {
      columns: [
        { key: 'paidAt', label: 'Date', description: 'Date du paiement.' },
        { key: 'lotLabel', label: 'Lot', description: 'Le lot payeur.' },
        { key: 'ownerLabel', label: 'Copropriétaire', description: 'Le copropriétaire du lot.' },
        { key: 'chargeReference', label: 'Appel concerné', description: "L'appel réglé par cette ligne." },
        { key: 'amount', label: 'Montant', description: 'Montant affecté à cet appel.' },
        { key: 'method', label: 'Mode', description: 'Moyen de paiement.' }
      ],
      notes: [
        'Modes possibles : Espèces, Virement bancaire, Chèque, Mobile money, Prélèvement, Carte, Paiement en ligne, Autre.',
        'Un paiement qui règle plusieurs appels apparaît sur plusieurs lignes. Les avances non affectées à un appel ne figurent pas ici.',
        'Les pages sont limitées à 100 lignes. Filtres : mode, date du paiement, montant.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi un paiement manque-t-il ?',
        a: "S'il n'est pas encore affecté à un appel (avance), il n'est pas listé. Il compte dans « Total des avances »."
      },
      { q: 'Peut-on exporter ?', a: "Oui, depuis la barre d'outils du tableau, avec les filtres en cours." },
      {
        q: "Combien de lignes s'affichent par page ?",
        a: 'Au plus 100 lignes par page. Vous pouvez filtrer par mode, date du paiement et montant.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de voir le module Syndic.' },
    keywords: ['encaissements', 'règlements', 'reçus', 'mode de paiement']
  },
  {
    id: 'syndic.tresorerie.impayes',
    kind: 'table',
    title: 'Détail des impayés et retards',
    summary:
      'Ce tableau liste les appels échus non soldés, avec le reste dû, les jours de retard et le nombre de relances déjà faites.',
    howToRead: {
      columns: [
        { key: 'lotLabel', label: 'Lot', description: 'Le lot en retard.' },
        { key: 'ownerLabel', label: 'Copropriétaire', description: 'Le copropriétaire du lot.' },
        { key: 'outstanding', label: 'Montant dû', description: 'Reste dû de l’appel.' },
        { key: 'daysLate', label: 'Jours de retard', description: "Jours depuis l'échéance." },
        { key: 'remindersCount', label: 'Relances', description: "Nombre de relances enregistrées pour l'appel." }
      ],
      notes: [
        'Filtres : jours de retard, montant dû, « Déjà relancé » ou « Jamais relancé ». Les colonnes numériques se trient.',
        "Pour relancer, appliquer une pénalité ou créer un échéancier, passez par l'écran « Recouvrement »."
      ]
    },
    faq: [
      {
        q: 'Quelle différence avec le Recouvrement ?',
        a: "Même liste de retards, mais ici en lecture. Le Recouvrement permet d'agir."
      },
      {
        q: 'Comment isoler les copropriétaires jamais relancés ?',
        a: 'Utilisez le filtre « Jamais relancé ». Le filtre « Déjà relancé » montre les autres.'
      },
      { q: 'Que compte la colonne « Relances » ?', a: "Le nombre de relances enregistrées pour l'appel." }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de voir le module Syndic.' },
    related: [{ label: 'Recouvrement des impayés', helpId: 'syndic.recouvrement.liste' }],
    keywords: ['impayés', 'retards', 'relancé']
  },

  // ------------------------------------------------------------------ Paiements
  {
    id: 'syndic.paiements.liste',
    kind: 'page',
    title: 'Paiements',
    summary:
      "Cet écran regroupe les paiements d'appels de charges autres que l'encaissement à la main : transferts mobile money déclarés par les copropriétaires, paiement en ligne et reversements vers la banque.",
    purpose:
      'Il sert à valider ou rejeter les paiements déclarés, à suivre les paiements en ligne et à enregistrer les reversements. Trois onglets le découpent.',
    howToRead: {
      notes: [
        'Onglet « Paiements déclarés » : la file de validation, les numéros de réception mobile money et les réglages.',
        'Onglet « Paiement en ligne » : le compte de paiement de la copropriété et le suivi des paiements.',
        'Onglet « Reversements vers la banque » : les reversements enregistrés vers le compte bancaire.',
        'Le menu « Paiements » affiche un compteur : le nombre de déclarations en attente.'
      ]
    },
    steps: [
      {
        title: 'Préparer la réception',
        detail:
          'Dans « Paiements déclarés », ajoutez au moins un numéro de réception actif, puis activez « Accepter les paiements déclarés ».'
      },
      {
        title: 'Traiter les déclarations',
        detail: "Cliquez sur « Examiner » : comparez avec le relevé de l'opérateur, puis « Valider » ou « Rejeter »."
      },
      {
        title: 'Activer le paiement en ligne',
        detail: 'Onglet « Paiement en ligne » : configurez le compte puis « Activer le paiement en ligne ».'
      },
      {
        title: 'Trancher les cas à vérifier',
        detail: 'Les paiements « À trancher » demandent une décision du gestionnaire.'
      },
      {
        title: 'Reverser',
        detail: "Quand l'argent est arrivé en banque, enregistrez-le dans « Reversements vers la banque »."
      }
    ],
    consequences: [
      "Valider une déclaration ou accepter un paiement à trancher enregistre l'encaissement sur les appels du lot. Cela ne se défait pas depuis cet écran.",
      'Les reçus et quittances sont émis et envoyés par e-mail au copropriétaire.'
    ],
    faq: [
      {
        q: 'Quels opérateurs mobile money sont connus ?',
        a: 'Orange Money, MTN MoMo, Moov Money, Wave, ou « Autre ».'
      },
      {
        q: 'Je ne vois pas le bouton « Payer » côté copropriétaire.',
        a: "Le paiement en ligne doit être actif et complet pour cette copropriété. Il n'utilise pas le compte de l'agence."
      },
      { q: 'Pourquoi des boutons sont-ils masqués ?', a: 'Ils demandent le droit de modifier le module Syndic.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété', 'Comptable'],
      note: 'Consulter demande le droit de voir le module Syndic. Valider, rejeter, vérifier, trancher, reverser et gérer les numéros demandent le droit de le modifier. Configurer le compte de paiement en ligne demande en plus « Modifier les paramètres du tenant ».'
    },
    related: [
      { label: 'Paiements déclarés', helpId: 'syndic.paiements.declares' },
      { label: 'Compte de paiement en ligne', helpId: 'syndic.paiements.passerelle' },
      { label: 'Reversements vers la banque', helpId: 'syndic.paiements.reversements' },
      { label: 'Recouvrement', helpId: 'syndic.recouvrement.liste' }
    ],
    keywords: ['mobile money', 'orange money', 'mtn', 'moov', 'wave', 'paiement en ligne', 'déclaration', 'reversement']
  },
  {
    id: 'syndic.paiements.declares',
    kind: 'table',
    title: 'Paiements déclarés',
    summary:
      'Ce tableau est la file des transferts mobile money que les copropriétaires disent avoir faits. Vous les vérifiez puis les validez ou les rejetez.',
    purpose:
      "Le copropriétaire paie à un numéro de réception de la copropriété puis le déclare sur son portail. Rien n'est crédité tant que vous n'avez pas validé.",
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Déposée le', description: 'Date de dépôt de la déclaration.' },
        {
          key: 'declaredBy',
          label: 'Déclarant',
          description: "Qui a déclaré ; l'étiquette « Gestionnaire » signale une déclaration saisie par l'agence."
        },
        { key: 'lots', label: 'Lot(s)', description: 'Lots visés.' },
        {
          key: 'receivingNumber',
          label: 'Numéro de réception',
          description: 'Opérateur, numéro et titulaire qui ont reçu le transfert.'
        },
        {
          key: 'transactionReference',
          label: 'Référence',
          description: "Référence de la transaction donnée par l'opérateur."
        },
        {
          key: 'amount',
          label: 'Montant déclaré',
          description: 'Montant déclaré ; « retenu » apparaît si le montant retenu est différent.'
        },
        { key: 'paidAt', label: 'Paiement du', description: 'Date et heure du transfert.' },
        { key: 'status', label: 'Statut', description: "État, avec d'éventuelles étiquettes d'alerte." },
        { key: 'actions', label: 'Actions', description: '« Examiner » ouvre le détail.' }
      ],
      statuses: [
        { value: 'PENDING', label: 'En attente', description: 'À vérifier. Rien n’est encore crédité.' },
        { value: 'APPROVED', label: 'Validée', description: 'Encaissée sur les appels du lot.' },
        { value: 'REJECTED', label: 'Rejetée', description: 'Refusée, avec un motif montré au copropriétaire.' },
        { value: 'CANCELED', label: 'Annulée', description: 'Annulée par le copropriétaire avant votre décision.' }
      ],
      notes: [
        'Sans choix de statut, seuls les paiements « En attente » sont affichés.',
        "Étiquettes : « En retard » (en attente depuis plus longtemps que le délai d'alerte), « Doublon suspecté », « Lue par IA ».",
        'Les compteurs au-dessus du tableau : « En attente », « En retard » (cliquez pour filtrer) et « Doublon suspecté ».'
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: 'Cliquez sur « Examiner » ou sur la ligne.' },
      { title: 'Comparer', detail: "Vérifiez le montant, la date et la référence avec le relevé de l'opérateur." },
      { title: 'Décider', detail: '« Valider » ou « Rejeter » dans le tiroir.' },
      {
        title: 'Saisir pour un copropriétaire',
        detail: '« Déclarer pour un copropriétaire » crée une déclaration à votre place ; elle reste à valider.'
      }
    ],
    consequences: [
      "Une déclaration ne crédite rien tant qu'elle est « En attente ».",
      "Les gestionnaires autorisés à valider reçoivent par e-mail un récapitulatif des déclarations à vérifier, avec une alerte quotidienne à 8 h (heure d'Abidjan) pour celles en retard, si l'agence a activé cet envoi."
    ],
    faq: [
      {
        q: 'Où est la déclaration que je cherche ?',
        a: "Elle n'est peut-être plus « En attente ». Changez le filtre « Statut » ou choisissez « Toutes »."
      },
      {
        q: 'Que signifie « Doublon suspecté » ?',
        a: "Même numéro de réception, même montant et même payeur qu'une autre déclaration à moins de 10 minutes, ou référence déjà présente sur un paiement enregistré."
      },
      {
        q: 'Les relances groupées envoient-elles un rappel pour un appel déclaré ?',
        a: "Non, pas tant que la déclaration est en attente depuis moins de jours ouvrés que le délai d'alerte."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir la file demande le droit de voir le module Syndic. « Déclarer pour un copropriétaire », valider et rejeter demandent le droit de modifier le module Syndic.'
    },
    related: [
      { label: 'Examiner une déclaration', helpId: 'syndic.paiements.declaration' },
      { label: 'Réglages des paiements déclarés', helpId: 'syndic.paiements.reglages' },
      { label: 'Numéros de réception', helpId: 'syndic.paiements.numeros' }
    ],
    keywords: ['déclaration de paiement', 'transfert', 'mobile money', 'capture', 'référence de transaction']
  },
  {
    id: 'syndic.paiements.declaration',
    kind: 'section',
    title: 'Examiner une déclaration',
    summary:
      "Ce tiroir montre tout ce qu'il faut pour décider : alertes de contrôle, détail du paiement, lots et appels visés, capture.",
    purpose: "Vous y comparez la déclaration avec le relevé de l'opérateur avant de la valider ou de la rejeter.",
    howToRead: {
      notes: [
        "Alertes : référence déjà utilisée sur un paiement enregistré, doublon probable, excédent qui deviendra une avance, paiement partiel, déclarant qui n'est plus le copropriétaire actuel, capture montrant un autre numéro de réception, date dans un exercice clos, attente depuis plusieurs jours ouvrés.",
        "Les étiquettes « IA » signalent un champ lu par l'IA, retouché ou non par le déclarant. L'IA ne valide rien.",
        "« Lots et appels visés » : si aucun appel n'est précisé, le paiement s'applique aux plus anciens appels ouverts du lot.",
        "Une déclaration traitée affiche aussi le montant et la date retenus, qui l'a traitée, le motif de rejet ou la note, et les documents émis."
      ]
    },
    steps: [
      { title: 'Lire les alertes', detail: 'Elles apparaissent en haut tant que la déclaration est en attente.' },
      {
        title: 'Vérifier le détail',
        detail: 'Déclarant, numéro payeur, numéro de réception, montant, date et référence.'
      },
      { title: 'Regarder la capture', detail: "Une image s'agrandit au clic ; un PDF s'ouvre dans un nouvel onglet." },
      { title: 'Décider', detail: '« Valider » ou « Rejeter » en bas du tiroir.' }
    ],
    consequences: [
      'Les boutons ne sont disponibles que pour une déclaration « En attente » et si vous avez le droit de modifier le module Syndic.'
    ],
    faq: [
      {
        q: 'La capture ne s’affiche pas.',
        a: "Cliquez sur « Réessayer ». Sans capture jointe, l'écran affiche « Aucune capture jointe »."
      },
      {
        q: 'Quelqu’un l’a déjà traitée.',
        a: "L'écran affiche « Cette déclaration a déjà été traitée » et la liste se rafraîchit."
      },
      {
        q: "Sur quels appels le paiement s'applique-t-il si aucun n'est précisé ?",
        a: 'Sur les plus anciens appels ouverts du lot.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir demande le droit de voir le module Syndic ; valider et rejeter demandent le droit de modifier le module Syndic.'
    },
    related: [
      { label: 'Valider une déclaration', helpId: 'syndic.paiements.validation' },
      { label: 'Rejeter une déclaration', helpId: 'syndic.paiements.rejet' }
    ],
    keywords: ['tiroir', 'alertes', 'capture', 'IA'],
    tour: {
      steps: [
        {
          target: 'decl-alertes',
          title: 'Les alertes',
          description: 'Lisez-les en premier : doublon, excédent, paiement partiel, exercice clos…'
        },
        {
          target: 'decl-details',
          title: 'Le paiement déclaré',
          description: "Comparez ces informations avec le relevé de l'opérateur."
        },
        {
          target: 'decl-capture',
          title: 'La capture',
          description: 'La capture jointe par le déclarant, si elle existe.'
        },
        { target: 'decl-valider', title: 'Valider', description: 'Encaisse le paiement sur les appels du lot.' },
        {
          target: 'decl-rejeter',
          title: 'Rejeter',
          description: 'Refuse la déclaration avec un motif montré au copropriétaire.'
        }
      ]
    }
  },
  {
    id: 'syndic.paiements.validation',
    kind: 'section',
    title: 'Valider une déclaration',
    summary:
      'Cette fenêtre encaisse la déclaration, telle quelle ou après correction du montant, de la date ou des appels visés.',
    purpose: 'La validation transforme la déclaration en encaissement réel sur les appels de charges du lot.',
    steps: [
      { title: 'Lire les alertes', detail: 'Excédent, paiement partiel et doublon sont rappelés en haut.' },
      {
        title: 'Corriger si besoin',
        detail:
          'Activez « Corriger avant de valider » : date retenue, « Montant retenu » par lot, « Appels de charges visés ».'
      },
      {
        title: 'Ajouter une note',
        detail: '« Note » de 10 à 500 caractères ; obligatoire en cas de correction et montrée au copropriétaire.'
      },
      { title: 'Valider', detail: '« Valider telle que déclarée » ou « Valider avec correction ».' }
    ],
    consequences: [
      "L'encaissement est enregistré sur les appels du lot, les plus anciens d'abord si aucun n'est choisi. Un excédent devient une avance du lot ; en cas de paiement partiel, le reste reste dû.",
      'Un reçu est émis pour le paiement et une quittance pour chaque appel soldé. Ils sont envoyés par e-mail au copropriétaire.',
      "Le copropriétaire est prévenu, sur un seul canal (e-mail ou WhatsApp) selon ses préférences et la configuration de l'agence.",
      "La validation est définitive : l'écran ne permet pas de la défaire."
    ],
    faq: [
      {
        q: 'Quel montant maximum après correction ?',
        a: 'Le total retenu ne peut pas dépasser le montant déclaré, et au moins un lot doit avoir un montant supérieur à 0.'
      },
      {
        q: 'La date déclarée tombe dans un exercice clos.',
        a: 'La correction est obligatoire : indiquez une date dans un exercice ouvert.'
      },
      {
        q: 'Quelqu’un a déjà validé.',
        a: "Vous voyez « Cette déclaration vient d’être traitée ou annulée » et rien n'est encaissé deux fois."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de modifier le module Syndic.' },
    related: [{ label: 'Rejeter une déclaration', helpId: 'syndic.paiements.rejet' }],
    keywords: ['valider', 'encaisser', 'correction', 'montant retenu', 'quittance', 'avance']
  },
  {
    id: 'syndic.paiements.rejet',
    kind: 'section',
    title: 'Rejeter une déclaration',
    summary: 'Cette fenêtre refuse une déclaration avec un motif et un texte que le copropriétaire pourra lire.',
    steps: [
      {
        title: 'Choisir le motif',
        detail:
          '« Paiement introuvable », « Montant ne correspondant pas », « Référence déjà utilisée », « Numéro de réception erroné » ou « Autre ».'
      },
      { title: 'Écrire le texte', detail: '« Texte (obligatoire) » de 10 à 500 caractères.' },
      { title: 'Confirmer', detail: 'Cliquez sur « Rejeter la déclaration ».' }
    ],
    consequences: [
      'Une déclaration rejetée ne se rouvre pas : le copropriétaire en déposera une nouvelle. La référence redevient libre.',
      'Le motif et le texte sont montrés au copropriétaire, qui est prévenu sur un seul canal (e-mail ou WhatsApp).',
      "Aucun encaissement n'est enregistré."
    ],
    faq: [
      {
        q: 'Puis-je annuler un rejet ?',
        a: 'Non. Demandez au copropriétaire de redéclarer, ou saisissez la déclaration avec « Déclarer pour un copropriétaire ».'
      },
      { q: 'Qui lit le texte ?', a: 'Le copropriétaire. Restez clair et courtois.' },
      { q: 'Quelle longueur pour le texte du rejet ?', a: 'Il est obligatoire et fait de 10 à 500 caractères.' }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de modifier le module Syndic.' },
    related: [{ label: 'Valider une déclaration', helpId: 'syndic.paiements.validation' }],
    keywords: ['rejeter', 'refuser', 'motif de rejet']
  },
  {
    id: 'syndic.paiements.declaration-tiers',
    kind: 'section',
    title: 'Déclarer pour un copropriétaire',
    summary:
      "Cette fenêtre saisit à la place d'un copropriétaire une déclaration de transfert mobile money. Elle reste à valider.",
    purpose: 'Utile quand un copropriétaire vous a remis sa preuve de paiement sans passer par son portail.',
    steps: [
      {
        title: 'Choisir le copropriétaire et les lots',
        detail:
          "« Lots concernés » : jusqu'à 10 lots, avec la « Part du lot (FCFA) » de chacun ; « Appels visés » peut rester vide (plus anciens d'abord)."
      },
      {
        title: 'Renseigner le transfert',
        detail:
          '« Numéro de réception », « Numéro du payeur », « Date et heure du transfert », « Référence de transaction ».'
      },
      { title: 'Joindre la capture', detail: 'Facultative : JPEG, PNG, WebP ou PDF, 5 Mo au plus.' },
      {
        title: 'Créer',
        detail: "Cliquez sur « Créer la déclaration » : le tiroir de la déclaration s'ouvre pour la valider."
      }
    ],
    consequences: [
      "La déclaration ne crédite rien tant que vous ne l'avez pas validée.",
      'Elle est marquée « Gestionnaire » dans la file.'
    ],
    faq: [
      {
        q: 'Quelles limites ?',
        a: "Le montant total ne dépasse pas 5 000 000 FCFA, le transfert date de moins de 90 jours et n'est pas dans le futur."
      },
      {
        q: 'Quelle référence saisir ?',
        a: 'De 4 à 40 caractères : lettres, chiffres, point ou tiret. Elle est enregistrée en majuscules et sans espaces.'
      },
      { q: 'La fenêtre dit qu’aucun numéro n’est utilisable.', a: "Ajoutez d'abord un numéro de réception actif." }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de modifier le module Syndic.' },
    keywords: ['saisir une déclaration', 'au nom du copropriétaire', 'preuve de paiement']
  },
  {
    id: 'syndic.paiements.numeros',
    kind: 'section',
    title: 'Numéros de réception mobile money',
    summary:
      'Cette carte liste les numéros sur lesquels les copropriétaires envoient leurs transferts. Chaque numéro est suivi sur son propre compte de trésorerie.',
    howToRead: {
      columns: [
        { key: 'operator', label: 'Opérateur', description: 'Orange Money, MTN MoMo, Moov Money, Wave ou Autre.' },
        {
          key: 'phoneNumber',
          label: 'Numéro',
          description: "Numéro de réception ; une étiquette signale un numéro partagé avec d'autres copropriétés."
        },
        { key: 'holderName', label: 'Titulaire', description: 'Titulaire du compte.' },
        { key: 'label', label: 'Libellé', description: 'Libellé facultatif.' },
        { key: 'treasury', label: 'Compte de trésorerie', description: 'Compte comptable du numéro et son solde.' },
        { key: 'pendingDeclarations', label: 'En attente', description: 'Déclarations à vérifier sur ce numéro.' },
        { key: 'isActive', label: 'État', description: 'Actif ou Inactif.' }
      ]
    },
    steps: [
      { title: 'Ajouter', detail: '« Ajouter un numéro » : opérateur, numéro, titulaire, libellé, « Actif ».' },
      { title: 'Modifier', detail: "« Modifier » change le titulaire, le libellé ou l'état." },
      { title: 'Désactiver', detail: '« Désactiver » retire le numéro de ce qui est proposé aux copropriétaires.' },
      { title: 'Supprimer', detail: "« Supprimer » n'est possible que si aucune déclaration n'utilise ce numéro." }
    ],
    consequences: [
      "Un numéro désactivé n'est plus proposé, mais les déclarations déjà en attente restent validables.",
      "Dès qu'une déclaration existe, l'opérateur et le numéro ne se modifient plus : désactivez-le et ajoutez-en un nouveau."
    ],
    faq: [
      { q: 'Quel format de numéro ?', a: 'Un numéro mobile ivoirien, par exemple 07 07 07 07 07.' },
      {
        q: 'Pourquoi une étiquette orange sur un numéro ?',
        a: "Ce numéro reçoit aussi les paiements d'autres copropriétés : le rapprochement se fait sur la référence."
      },
      {
        q: 'Quand peut-on supprimer un numéro ?',
        a: "Seulement si aucune déclaration n'utilise ce numéro. Sinon, désactivez-le."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir demande le droit de voir le module Syndic ; ajouter, modifier, désactiver et supprimer demandent le droit de le modifier.'
    },
    related: [{ label: 'Réglages des paiements déclarés', helpId: 'syndic.paiements.reglages' }],
    keywords: ['numéro de réception', 'orange money', 'mtn momo', 'moov money', 'wave', 'compte de trésorerie']
  },
  {
    id: 'syndic.paiements.reglages',
    kind: 'section',
    title: 'Réglages des paiements déclarés',
    summary:
      "Cette carte règle comment la copropriété accepte les paiements mobile money déclarés : activation, délai d'alerte, capture, consigne et lecture par IA.",
    howToRead: {
      notes: [
        "« Accepter les paiements déclarés » : désactivé par défaut. Sans numéro de réception actif, le portail n'affiche rien.",
        '« Délai d’alerte (jours ouvrés) » : de 1 à 15, 3 par défaut. Une déclaration en attente plus longtemps est « En retard ».',
        '« Capture obligatoire » : désactivée par défaut.',
        '« Consigne affichée au copropriétaire » : texte de 500 caractères au plus.',
        "« Pré-remplir par IA… » : l'IA propose des valeurs que le copropriétaire relit ; elle ne valide ni ne crédite rien. Un quota mensuel de lectures est affiché."
      ]
    },
    steps: [
      { title: 'Modifier', detail: 'Changez les réglages voulus.' },
      { title: 'Enregistrer', detail: "Le bouton « Enregistrer » ne s'active que s'il y a un changement." }
    ],
    consequences: [
      'Désactiver « Accepter les paiements déclarés » cache la fonction aux copropriétaires ; les déclarations déjà reçues restent à traiter.',
      "Quand le quota mensuel de lectures IA est atteint, la lecture automatique est suspendue jusqu'au mois suivant."
    ],
    faq: [
      {
        q: 'La lecture par IA est grisée.',
        a: "Elle n'est pas disponible sur ce serveur : le message « La lecture automatique n’est pas disponible sur ce serveur » s'affiche."
      },
      {
        q: 'Faut-il exiger la capture ?',
        a: "Elle aide à vérifier. Si vous l'exigez, un copropriétaire ne peut pas déclarer sans la joindre."
      },
      {
        q: "Quel est le délai d'alerte par défaut ?",
        a: '3 jours ouvrés. Vous pouvez le régler de 1 à 15 jours ouvrés.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir demande le droit de voir le module Syndic ; enregistrer demande le droit de le modifier.'
    },
    keywords: ['réglages', 'délai d’alerte', 'capture obligatoire', 'consigne', 'lecture IA']
  },
  {
    id: 'syndic.paiements.passerelle',
    kind: 'section',
    title: 'Compte de paiement de la copropriété',
    summary:
      'Cette carte configure le compte marchand PaySecureHub de la copropriété pour le paiement en ligne. Chaque copropriété encaisse sur son propre compte.',
    purpose:
      "Sans configuration active et complète, les copropriétaires ne voient pas le bouton « Payer », même si l'agence a son propre compte.",
    howToRead: {
      statuses: [
        { value: 'usable', label: 'Paiement en ligne actif', description: 'La configuration est active et complète.' },
        {
          value: 'unusable',
          label: 'Paiement en ligne non utilisable',
          description: 'Le bouton « Payer » n’est pas proposé.'
        }
      ],
      notes: [
        "« Mode » : « Simulateur » (essai, s'il est disponible) ou « Réel ». En mode réel, l'identifiant marchand et la clé sont obligatoires.",
        "La clé n'est jamais réaffichée : « Remplacer la clé » en saisit une nouvelle ; sinon elle reste inchangée.",
        '« Adresse de notification (IPN) » : à communiquer à PaySecureHub pour ce compte.',
        "« Frais du fournisseur » suit le réglage de l'agence (payeur ou agence).",
        "« Solde comptable du compte 5525 » : l'argent encaissé en ligne, avant reversement. « Solde chez le fournisseur » : lu chez PaySecureHub, avec « Actualiser ».",
        '« Dernier test » : résultat du dernier « Tester la connexion ».'
      ]
    },
    steps: [
      { title: 'Choisir le mode', detail: '« Simulateur » ou « Réel ».' },
      { title: 'Renseigner le compte', detail: '« Identifiant marchand » et « Clé API ».' },
      { title: 'Activer', detail: 'Basculez « Activer le paiement en ligne », puis « Enregistrer ».' },
      { title: 'Tester', detail: '« Tester la connexion » vérifie le compte et affiche le solde.' }
    ],
    consequences: [
      "Tant que des paiements sont en cours, le mode, l'identifiant et la clé ne peuvent pas changer.",
      "Le test et l'enregistrement n'envoient rien aux copropriétaires."
    ],
    faq: [
      {
        q: 'Je ne peux pas modifier cette carte.',
        a: 'Elle demande le droit de modifier le module Syndic et « Modifier les paramètres du tenant ». Sans eux, elle reste en lecture seule.'
      },
      {
        q: 'Aucune clé de chiffrement n’est configurée.',
        a: "L'enregistrement d'une clé est impossible tant que le serveur n'est pas configuré. Contactez l'administrateur."
      },
      {
        q: "La clé API est-elle réaffichée après l'enregistrement ?",
        a: 'Non. Pour la changer, utilisez « Remplacer la clé » ; sinon elle reste inchangée.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir demande le droit de voir le module Syndic. Enregistrer et tester demandent le droit de modifier le module Syndic et « Modifier les paramètres du tenant ».'
    },
    related: [{ label: 'Paiements en ligne', helpId: 'syndic.paiements.en-ligne' }],
    keywords: ['paysecurehub', 'passerelle', 'compte marchand', 'clé API', 'simulateur', 'paiement en ligne']
  },
  {
    id: 'syndic.paiements.en-ligne',
    kind: 'table',
    title: 'Paiements en ligne',
    summary:
      "Ce tableau suit les paiements faits en ligne par les copropriétaires. Vous pouvez vérifier un paiement chez le fournisseur ou trancher ceux qui n'ont pas pu être enregistrés seuls.",
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: 'Date de la tentative.' },
        {
          key: 'codePaiement',
          label: 'Code',
          description: 'Code du paiement ; l’étiquette « Simulateur » indique un essai.'
        },
        { key: 'lot', label: 'Lot', description: 'Le lot payeur.' },
        { key: 'payer', label: 'Payeur', description: 'Le payeur ; « Fiche introuvable » si sa fiche a disparu.' },
        { key: 'calls', label: 'Appels', description: 'Périodes des appels visés.' },
        {
          key: 'amount',
          label: 'Montant',
          description: 'Montant demandé ; « Reçu » apparaît si le montant reçu est différent.'
        },
        {
          key: 'origin',
          label: 'Origine',
          description: 'Portail du copropriétaire ou lien de paiement, avec le moyen utilisé.'
        },
        { key: 'status', label: 'Statut', description: 'État du paiement, avec la raison si besoin.' },
        { key: 'actions', label: 'Actions', description: '« Vérifier » et « Trancher ».' }
      ],
      statuses: [
        {
          value: 'REVIEW',
          label: 'À trancher',
          description: 'Encaissé chez le fournisseur mais pas enregistré automatiquement : une décision est nécessaire.'
        },
        { value: 'PENDING', label: 'En attente', description: 'Paiement en cours.' },
        { value: 'SUCCESS', label: 'Payé', description: 'Encaissé et enregistré.' },
        { value: 'FAILED', label: 'Échoué', description: "Le paiement n'a pas abouti." },
        { value: 'CANCELED', label: 'Annulé', description: 'Annulé.' },
        { value: 'EXPIRED', label: 'Expiré', description: 'La tentative a expiré.' }
      ],
      notes: [
        'Une bannière signale les paiements à trancher ; « Voir » filtre dessus.',
        'Les pastilles au-dessus du tableau donnent le nombre de paiements par statut.'
      ]
    },
    steps: [
      {
        title: 'Vérifier',
        detail: '« Vérifier » (paiements en attente ou à trancher) interroge le fournisseur et met le statut à jour.'
      },
      {
        title: 'Trancher',
        detail: '« Trancher » (paiements à trancher) ouvre la décision : voir la fiche « Trancher un paiement ».'
      }
    ],
    consequences: [
      "« Vérifier » peut faire passer un paiement à « Payé » et enregistrer l'encaissement. S'il n'y a rien de neuf, le message « Aucun changement chez le fournisseur » s'affiche."
    ],
    faq: [
      {
        q: 'Pourquoi des paiements « À trancher » ?',
        a: 'Le paiement est arrivé mais ne peut pas être enregistré seul : montant différent, exercice clos, appel disparu, transaction déjà enregistrée, ou état contraire du fournisseur.'
      },
      {
        q: 'Où est le code à donner au support ?',
        a: "Dans la colonne « Code » : l'icône de copie le prend en un clic."
      },
      {
        q: 'À quoi sert « Vérifier » ?',
        a: "Il interroge le fournisseur et met le statut à jour. S'il n'y a rien de neuf, le message « Aucun changement chez le fournisseur » s'affiche."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir demande le droit de voir le module Syndic ; « Vérifier » et « Trancher » demandent le droit de le modifier.'
    },
    related: [
      { label: 'Trancher un paiement', helpId: 'syndic.paiements.decision' },
      { label: 'Lien de paiement d’un appel', helpId: 'syndic.paiements.lien' }
    ],
    keywords: ['paiement en ligne', 'suivi', 'vérifier', 'à trancher', 'code de paiement']
  },
  {
    id: 'syndic.paiements.decision',
    kind: 'section',
    title: 'Trancher un paiement',
    summary:
      "Cette fenêtre décide du sort d'un paiement en ligne que le système n'a pas pu enregistrer seul : l'accepter (encaisser) ou le refuser.",
    purpose:
      'Le motif en haut explique pourquoi le paiement est bloqué. Le tableau récapitule le montant demandé, le montant reçu, le lot, le payeur et les appels visés.',
    howToRead: {
      statuses: [
        {
          value: 'AMOUNT_MISMATCH',
          label: 'Montant payé différent du montant attendu',
          description: 'Accepter encaisse le montant reçu.'
        },
        {
          value: 'FISCAL_YEAR_CLOSED',
          label: 'Exercice clos à la date du paiement',
          description: "Accepter demande une date d'encaissement dans un exercice ouvert."
        },
        {
          value: 'CALLS_UNAVAILABLE',
          label: 'Un appel visé a disparu ou n’appartient plus au lot',
          description: 'Accepter ou refuser sont possibles.'
        },
        {
          value: 'DUPLICATE_TRANSACTION',
          label: 'Transaction fournisseur déjà enregistrée',
          description: 'Seul le refus est possible.'
        },
        {
          value: 'CONTRARY_STATE',
          label: 'Le fournisseur rapporte un échec ou une annulation après un succès',
          description:
            "Si l'encaissement existe déjà : accepter seulement clôt le suivi. Sinon, accepter encaisse et refuser est possible."
        }
      ]
    },
    steps: [
      { title: 'Lire le motif', detail: "L'alerte jaune donne la raison." },
      { title: 'Choisir', detail: "« Accepter » ou « Refuser » ; l'option interdite est grisée." },
      {
        title: 'Date',
        detail: "En cas d'encaissement, « Date d’encaissement » (aujourd'hui si vide, jamais dans le futur)."
      },
      { title: 'Note', detail: "« Note (obligatoire) », 500 caractères au plus, conservée dans le journal d'audit." },
      { title: 'Enregistrer', detail: '« Enregistrer la décision ».' }
    ],
    consequences: [
      "Accepter enregistre l'encaissement sur les appels du lot et émet les reçus et quittances, envoyés par e-mail au copropriétaire. Si le montant reçu n'est pas rapporté, le montant demandé est enregistré.",
      "Refuser n'enregistre rien et ne rembourse pas le payeur : l'argent reste chez PaySecureHub, le remboursement se fait en dehors d'ImmoTopia.",
      'La décision est définitive.'
    ],
    faq: [
      {
        q: 'Pourquoi « Refuser » est-il grisé ?',
        a: "Quand l'encaissement existe déjà, il ne peut pas être annulé ici."
      },
      { q: 'Comment rembourser un payeur ?', a: 'Directement avec PaySecureHub, hors de cet écran.' },
      {
        q: 'La note est-elle obligatoire ?',
        a: "Oui, avec 500 caractères au plus. Elle est conservée dans le journal d'audit."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de modifier le module Syndic.' },
    keywords: ['trancher', 'accepter', 'refuser', 'à trancher', 'remboursement']
  },
  {
    id: 'syndic.paiements.reversements',
    kind: 'table',
    title: 'Reversements vers la banque',
    summary:
      "Ce tableau liste les reversements enregistrés de l'argent encaissé par PaySecureHub ou les opérateurs vers le compte bancaire de la copropriété.",
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'Date du reversement.' },
        {
          key: 'treasuryAccountNumber',
          label: 'Compte',
          description: '5525 pour le paiement en ligne, ou le compte du numéro de réception.'
        },
        { key: 'reference', label: 'Référence', description: 'Référence du virement.' },
        { key: 'amount', label: 'Montant', description: 'Montant reversé.' },
        { key: 'note', label: 'Note', description: 'Note facultative.' }
      ],
      notes: ['Filtres : texte, compte et période.', "Le bouton est grisé quand aucun compte n'a de solde à reverser."]
    },
    steps: [{ title: 'Enregistrer', detail: '« Enregistrer un reversement » ouvre la fenêtre de saisie.' }],
    faq: [
      {
        q: 'Le virement est-il déclenché ici ?',
        a: "Non. Cet écran enregistre seulement l'écriture comptable, une fois l'argent arrivé sur le compte bancaire."
      },
      { q: "Pourquoi le bouton d'enregistrement est-il grisé ?", a: "Parce qu'aucun compte n'a de solde à reverser." },
      { q: 'Comment retrouver un reversement ?', a: 'Filtrez par texte, compte et période.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir demande le droit de voir le module Syndic ; enregistrer demande le droit de le modifier.'
    },
    related: [{ label: 'Enregistrer un reversement', helpId: 'syndic.paiements.reversement' }],
    keywords: ['reversement', 'virement', 'compte 5525', 'banque']
  },
  {
    id: 'syndic.paiements.reversement',
    kind: 'section',
    title: 'Enregistrer un reversement',
    summary:
      "Cette fenêtre enregistre qu'une somme encaissée en ligne ou par mobile money a été versée sur le compte bancaire de la copropriété.",
    steps: [
      {
        title: 'Choisir le compte',
        detail: '« Compte à reverser » : PaySecureHub (5525) ou un numéro de réception, avec son solde.'
      },
      { title: 'Saisir le montant', detail: '« Montant reversé » : au plus le solde du compte.' },
      {
        title: 'Date et référence',
        detail: '« Date du reversement » (pas dans le futur) et « Référence du virement » (obligatoire).'
      },
      { title: 'Enregistrer', detail: '« Note (facultative) » si besoin, puis « Enregistrer ».' }
    ],
    consequences: [
      "L'écriture comptable est passée (compte de collecte vers le compte bancaire 521) et le solde du compte baisse du montant.",
      "Aucun virement n'est déclenché et personne n'est prévenu."
    ],
    faq: [
      { q: 'Le montant dépasse le solde.', a: 'Le reversement est refusé : réduisez-le au solde affiché.' },
      {
        q: 'Que se passe-t-il en comptabilité ?',
        a: "L'écriture passe du compte de collecte au compte bancaire 521, et le solde du compte baisse du montant reversé."
      },
      {
        q: 'Quelles informations sont obligatoires ?',
        a: 'La « Référence du virement » est obligatoire, et la date du reversement ne peut pas être dans le futur.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de modifier le module Syndic.' },
    keywords: ['reversement', 'virement bancaire', 'écriture comptable']
  },
  {
    id: 'syndic.paiements.lien',
    kind: 'section',
    title: 'Lien de paiement d’un appel',
    summary:
      'Cette fenêtre crée un lien « Payer cet appel » pour un appel de charges, à envoyer au copropriétaire ou à copier. Elle liste aussi les liens existants.',
    purpose:
      "Le copropriétaire paie le reste dû de l'appel par Mobile Money, sans se connecter. Le montant est recalculé au moment du paiement.",
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Créé le', description: 'Date de création.' },
        { key: 'expiresAt', label: 'Expire le', description: "Date d'expiration." },
        { key: 'origin', label: 'Origine', description: 'Gestionnaire, ou joint à un avis ou une relance.' },
        { key: 'viewCount', label: 'Consultations', description: 'Nombre de consultations du lien.' },
        { key: 'payment', label: 'Paiement', description: 'Statut du paiement fait avec ce lien, ou un tiret.' },
        { key: 'status', label: 'Statut', description: 'Actif, Expiré ou Révoqué.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Le lien peut encore être utilisé.' },
        { value: 'EXPIRED', label: 'Expiré', description: 'La durée de validité est dépassée.' },
        { value: 'REVOKED', label: 'Révoqué', description: 'Le lien a été désactivé.' }
      ]
    },
    steps: [
      {
        title: 'Choisir la remise',
        detail: '« Envoyer au copropriétaire (WhatsApp ou e-mail) » ou « Copier le lien ».'
      },
      { title: 'Durée', detail: '« Durée de validité (jours) » de 1 à 30, 7 par défaut.' },
      { title: 'Créer', detail: '« Envoyer le lien » ou « Créer le lien ».' },
      {
        title: 'Révoquer',
        detail: '« Révoquer » désactive un lien actif ; le copropriétaire ne pourra plus payer avec.'
      }
    ],
    consequences: [
      "Le lien complet n'est affiché qu'une seule fois, à la création : après la fermeture de la fenêtre, il ne peut plus être relu.",
      "Pour « Envoyer », le lien part par WhatsApp ou par e-mail. Sans canal éligible (ni numéro WhatsApp ni e-mail utilisable, ou pas de consentement), rien n'est envoyé et la cause s'affiche.",
      "Le lien n'existe que si le paiement en ligne de la copropriété est actif."
    ],
    faq: [
      {
        q: 'Je vois la liste mais pas le bouton de création.',
        a: 'Créer, envoyer et révoquer demandent le droit de modifier le module Syndic ; la liste demande seulement celui de voir.'
      },
      { q: 'Comment voir les liens expirés ?', a: 'Activez « Afficher aussi les liens expirés et révoqués ».' },
      {
        q: 'Combien de temps un lien reste-t-il valable ?',
        a: 'Vous choisissez la « Durée de validité (jours) » de 1 à 30 ; elle est de 7 par défaut.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir la liste demande le droit de voir le module Syndic ; créer, envoyer et révoquer demandent le droit de le modifier.'
    },
    related: [{ label: 'Paiements en ligne', helpId: 'syndic.paiements.en-ligne' }],
    keywords: ['lien de paiement', 'payer cet appel', 'mobile money', 'lien sécurisé']
  }
];

export default entries;
