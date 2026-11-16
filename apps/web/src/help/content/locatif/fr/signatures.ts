import type { HelpEntry } from '../../../types';

/** Zone « signatures » du module « locatif » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.signatures.liste',
    kind: 'page',
    title: 'Signatures',
    summary:
      "Suivez ici toutes les demandes de signature électronique de votre agence : qui a signé, qui doit encore signer, et jusqu'à quand. Vous pouvez relancer, annuler ou télécharger le document.",
    purpose:
      "Une demande de signature envoie un document (contrat de bail, mandat, état des lieux, compromis de vente, autorisation de prélèvement) à une ou plusieurs personnes, qui le signent en ligne depuis un lien personnel. Cet écran regroupe les demandes de tous ces documents ; l'envoi se fait depuis le document lui-même, par exemple l'onglet « Signatures » d'un bail.",
    howToRead: {
      notes: [
        'La rangée de boutons sous le titre compte les demandes par statut : « Toutes », puis un bouton par statut. Cliquer sur un bouton filtre le tableau ; les comptes tiennent compte de la recherche, du type et de la période, mais pas du statut choisi.',
        'Vous ne voyez que les types de document que vos droits vous permettent de lire (baux, mandats de gestion, ventes).'
      ]
    },
    steps: [
      {
        title: 'Repérer les demandes à suivre',
        detail: 'Cliquez sur « Envoyée » ou « Partiellement signée » pour ne voir que les demandes encore en cours.'
      },
      {
        title: 'Rechercher',
        detail:
          'Tapez un titre de document ou un nom de signataire, puis affinez par statut, type ou période de création.'
      },
      {
        title: 'Ouvrir le détail',
        detail: "Cliquez sur le titre du document pour voir les signataires et l'historique."
      },
      {
        title: 'Relancer ou annuler',
        detail:
          'Sur une demande en cours, « Relancer » renvoie le lien aux signataires en attente ; « Annuler » ferme la demande après confirmation.'
      },
      {
        title: 'Télécharger',
        detail:
          'Le bouton « Télécharger » donne le PDF signé quand la demande est « Signée », sinon le PDF envoyé à signer.'
      }
    ],
    consequences: [
      "Cet écran ne crée aucune demande : pour envoyer un document à signer, ouvrez le document (bail, mandat, état des lieux...) et utilisez son bouton d'envoi.",
      "L'annulation est définitive : plus personne ne peut signer avec les liens déjà envoyés. Vous pourrez ensuite créer une nouvelle demande pour le même document.",
      "Quand toutes les personnes ont signé, un PDF signé est produit, avec une page de signatures et une page « Certificat de signature ». La personne qui a envoyé la demande est prévenue par e-mail ; elle l'est aussi si un signataire refuse ou si la demande expire."
    ],
    faq: [
      {
        q: 'Pourquoi ne vois-je pas certaines demandes ?',
        a: 'La liste est limitée aux types de document que vous avez le droit de consulter. Sans accès aux affaires, par exemple, vous ne voyez pas les compromis de vente.'
      },
      {
        q: "Pourquoi n'ai-je pas les boutons « Relancer » et « Annuler » ?",
        a: "Ils n'apparaissent que sur une demande en cours (« Envoyée » ou « Partiellement signée ») et si vous avez le droit de modifier le document concerné, par exemple « Modifier les baux » pour un bail."
      },
      {
        q: "Que se passe-t-il quand la date d'échéance est dépassée ?",
        a: 'La demande passe à « Expirée » (mise à jour automatique) et les liens ne fonctionnent plus. Vous devez alors créer une nouvelle demande depuis le document.'
      },
      {
        q: 'Un signataire a perdu son lien, que faire ?',
        a: "Utilisez « Relancer » : un nouveau lien est envoyé aux signataires qui n'ont pas encore signé. Deux relances doivent être espacées d'au moins 10 minutes."
      }
    ],
    permissions: {
      note: "Le menu « Signatures » apparaît si vous avez au moins un de ces droits : « Voir les baux », « Voir les biens » ou « Voir les affaires ». Chaque demande n'est visible que si vous pouvez lire son type de document ; relancer et annuler demandent le droit de modification du document (« Modifier les baux » pour un bail). L'écran lui-même n'est pas réservé à un pack, mais chaque type de document suit le pack de son module."
    },
    related: [
      { label: 'Comment lire le tableau des demandes', helpId: 'locatif.signatures.liste.tableau' },
      { label: "Le détail d'une demande", helpId: 'locatif.signatures.detail' },
      { label: 'Envoyer un bail à signer', helpId: 'locatif.signatures.bail' },
      { label: 'La liste des baux', helpId: 'locatif.baux.liste' }
    ],
    keywords: [
      'signature',
      'signature électronique',
      'signer',
      'faire signer',
      'contrat',
      'relancer',
      'relance',
      'annuler',
      'pdf signé',
      'signataire',
      'expirée'
    ]
  },
  {
    id: 'locatif.signatures.liste.tableau',
    kind: 'table',
    title: 'Tableau des demandes de signature',
    summary:
      'Chaque ligne est une demande de signature de votre agence, avec son type, son statut et le nombre de signataires qui ont signé.',
    howToRead: {
      columns: [
        {
          key: 'title',
          label: 'Document',
          description: 'Le titre du document à signer. Cliquez dessus pour ouvrir le détail. Colonne triable.'
        },
        {
          key: 'kind',
          label: 'Type',
          description:
            'La nature du document : contrat de bail, mandat de gestion, mandat de vente, état des lieux, compromis de vente ou autorisation de prélèvement.'
        },
        {
          key: 'status',
          label: 'Statut',
          description: 'Où en est la demande (voir les statuts ci-dessous). Colonne triable.'
        },
        {
          key: 'signers',
          label: 'Signataires',
          description: 'Le nombre de personnes qui ont signé sur le nombre total, par exemple « 1/2 signés ».'
        },
        {
          key: 'createdAt',
          label: 'Créée le',
          description: "La date d'envoi de la demande. Colonne triable ; par défaut, les plus récentes sont en premier."
        },
        {
          key: 'expiresAt',
          label: 'Échéance',
          description:
            'La date limite pour signer. Passée cette date, une demande en cours devient « Expirée ». Colonne triable.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            "« Télécharger » est toujours proposé. « Relancer » et « Annuler » n'apparaissent que sur une demande en cours, si vous avez le droit de modification."
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: 'Demande créée mais pas encore envoyée aux signataires.'
        },
        {
          value: 'SENT',
          label: 'Envoyée',
          description: "Les signataires ont reçu leur lien ; personne n'a encore signé."
        },
        {
          value: 'PARTIALLY_SIGNED',
          label: 'Partiellement signée',
          description: 'Une partie des signataires a signé, les autres sont attendus.'
        },
        {
          value: 'COMPLETED',
          label: 'Signée',
          description: 'Tout le monde a signé. Le PDF signé est disponible au téléchargement.'
        },
        {
          value: 'DECLINED',
          label: 'Refusée',
          description: 'Un signataire a refusé de signer ; la demande est close.'
        },
        {
          value: 'EXPIRED',
          label: 'Expirée',
          description: "L'échéance est passée sans que tout le monde ait signé."
        },
        {
          value: 'CANCELED',
          label: 'Annulée',
          description: "La demande a été annulée, par l'agence ou automatiquement par le système."
        }
      ],
      notes: [
        'Les filtres sont : « Rechercher » (titre du document ou nom du signataire), « Statut », « Type de document » et « Période de création ».',
        'Seules « Envoyée » et « Partiellement signée » sont des demandes en cours : on peut alors relancer ou annuler.'
      ]
    },
    related: [
      { label: "Vue d'ensemble de l'écran", helpId: 'locatif.signatures.liste' },
      { label: "Le détail d'une demande", helpId: 'locatif.signatures.detail' }
    ],
    keywords: ['statut signature', 'signés', 'échéance', 'télécharger', 'pdf', 'refusée', 'expirée']
  },
  {
    id: 'locatif.signatures.detail',
    kind: 'section',
    title: "Détail d'une demande de signature",
    summary:
      "Le tiroir montre le type, le statut et les dates de la demande, chaque signataire avec son état, puis l'historique des événements.",
    purpose:
      'Utilisez-le pour savoir précisément qui a ouvert le document, qui a signé ou refusé, et ce qui a été fait (envoi, relance, scellement). Il conserve la trace du déroulement de la signature.',
    howToRead: {
      statuses: [
        {
          value: 'PENDING',
          label: 'En attente',
          description: "Le signataire n'a pas encore ouvert le document."
        },
        {
          value: 'OPENED',
          label: 'Document ouvert',
          description: "Le signataire a ouvert son lien mais n'a pas encore signé."
        },
        {
          value: 'SIGNED',
          label: 'A signé',
          description: 'Le signataire a signé.'
        },
        {
          value: 'DECLINED',
          label: 'A refusé',
          description: 'Le signataire a refusé de signer.'
        }
      ],
      notes: [
        'Pour chaque signataire : son nom, son rôle (Locataire, Co-locataire, Bailleur, Agent, Mandant, Vendeur...), le canal utilisé (E-mail, WhatsApp, SMS ou Sur place) et son contact en partie masqué.',
        "« Terminée le » n'apparaît que pour une demande signée. « Ouvrir le document » mène au bail, au compromis ou au mandat de vente concerné ; pour un état des lieux ou un mandat de gestion, il n'y a pas de lien.",
        "L'historique liste les événements dans l'ordre : demande créée, invitation envoyée ou échec d'envoi, document ouvert, code de vérification envoyé, erroné ou verrouillé, signature apposée ou refusée, document scellé, rappel envoyé (manuel ou automatique), demande annulée ou expirée.",
        "L'étiquette verte « Piste de preuve intacte » confirme que l'historique n'a pas été modifié ; l'étiquette rouge « Piste de preuve altérée » signale une anomalie à remonter à l'assistance."
      ]
    },
    consequences: [
      "Ce tiroir est en lecture seule : aucune action n'y modifie la demande. Pour relancer ou annuler, utilisez le tableau."
    ],
    faq: [
      {
        q: 'À quoi sert « Piste de preuve intacte » ?',
        a: "Chaque événement de la signature est enregistré à la suite des précédents. Si l'étiquette est verte, l'historique est complet et n'a pas été modifié après coup."
      },
      {
        q: 'Pourquoi le contact du signataire est-il partiellement masqué ?',
        a: "Pour protéger ses coordonnées : vous reconnaissez l'adresse ou le numéro sans l'afficher en entier."
      },
      {
        q: 'Un signataire est resté « En attente », que faire ?',
        a: "Relancez la demande depuis le tableau. Si la signature est demandée « dans l'ordre », seul le signataire dont c'est le tour reçoit la relance."
      }
    ],
    permissions: {
      note: "Il s'ouvre pour les demandes dont vous pouvez lire le type de document (par exemple « Voir les baux » pour un contrat de bail)."
    },
    related: [
      { label: "Vue d'ensemble de l'écran", helpId: 'locatif.signatures.liste' },
      { label: 'Tableau des demandes', helpId: 'locatif.signatures.liste.tableau' }
    ],
    keywords: ['historique', 'preuve', 'journal', 'signataire', 'audit', 'certificat']
  },
  {
    id: 'locatif.signatures.bail',
    kind: 'section',
    title: 'Signatures du bail',
    summary:
      "Cet onglet de la fiche d'un bail envoie le contrat de bail à signer en ligne et montre où en est chaque signataire. Il garde l'historique des demandes du bail.",
    purpose:
      'Le contrat est envoyé en PDF au locataire, aux co-locataires et au bailleur. Chacun signe depuis son téléphone ou son ordinateur, sans compte. Une seule demande peut être en cours à la fois pour un bail.',
    howToRead: {
      statuses: [
        { value: 'SENT', label: 'Envoyée', description: "Liens envoyés, personne n'a encore signé." },
        {
          value: 'PARTIALLY_SIGNED',
          label: 'Partiellement signée',
          description: 'Une partie des signataires a signé.'
        },
        { value: 'COMPLETED', label: 'Signée', description: 'Tous ont signé : le « PDF signé » est disponible.' },
        { value: 'DECLINED', label: 'Refusée', description: 'Un signataire a refusé ; la demande est close.' },
        { value: 'EXPIRED', label: 'Expirée', description: "L'échéance est passée." },
        { value: 'CANCELED', label: 'Annulée', description: 'La demande a été annulée.' }
      ],
      notes: [
        "Chaque demande est une carte : son statut, la date d'envoi et, tant qu'elle est en cours, la date d'expiration. Dessous, chaque signataire avec son rôle, son canal et son état (En attente, Document ouvert, A signé, A refusé), et la date de signature.",
        '« PDF source » télécharge le contrat envoyé ; « PDF signé » apparaît quand la demande est « Signée ».'
      ]
    },
    steps: [
      {
        title: 'Envoyer',
        detail:
          "Cliquez sur « Envoyer pour signature » : la fenêtre d'envoi s'ouvre avec le locataire, les co-locataires et le bailleur déjà proposés."
      },
      {
        title: 'Compléter les signataires',
        detail: "Pour un co-locataire, saisissez son nom et son contact. Voir l'aide de la fenêtre d'envoi."
      },
      {
        title: 'Suivre',
        detail:
          "La carte de la demande se met à jour au fil des signatures ; l'ensemble des demandes se suit aussi dans le menu « Signatures »."
      },
      {
        title: 'Relancer ou annuler',
        detail:
          "« Relancer » renvoie le lien aux signataires qui n'ont pas signé ; « Annuler la demande » ferme la demande après confirmation."
      },
      {
        title: 'Signer sur place',
        detail:
          'Pour un signataire au canal « Sur place », le bouton « Signer sur place » ouvre la signature sur votre écran, devant lui.'
      },
      {
        title: 'Récupérer le contrat signé',
        detail: 'Quand la demande est « Signée », cliquez sur « PDF signé ».'
      }
    ],
    consequences: [
      "L'envoi consomme une signature du quota mensuel de votre abonnement. Si le quota est atteint, l'envoi est refusé et un message propose d'ajouter l'extension de signatures.",
      "Le bouton d'envoi est désactivé tant qu'une demande est en cours : annulez-la d'abord pour en créer une autre.",
      'Le signataire reçoit un lien personnel (par e-mail, SMS ou WhatsApp) puis un code à usage unique pour confirmer son identité, sauf en signature sur place. Une fois tout le monde signé, un PDF scellé avec page de signatures et « Certificat de signature » est produit.',
      "L'annulation est définitive pour cette demande ; les liens déjà envoyés ne fonctionnent plus."
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Envoyer pour signature » est-il grisé ?',
        a: "Soit une demande est déjà en cours pour ce bail (annulez-la ou attendez qu'elle se termine), soit la signature électronique n'est pas disponible pour ce document."
      },
      {
        q: "Je ne vois pas le bouton d'envoi ni « Relancer ». Pourquoi ?",
        a: "Ces actions demandent le droit « Modifier les baux ». Sans ce droit, vous consultez seulement l'historique et les PDF."
      },
      {
        q: 'La signature a-t-elle une valeur juridique ?',
        a: "C'est une signature électronique simple : lien personnel, code à usage unique, consentement, date, adresse réseau et empreinte du document sont enregistrés. Sa portée exacte dépend du droit applicable ; demandez conseil à un juriste pour un cas particulier."
      },
      {
        q: "Le contrat a changé après l'envoi, que faire ?",
        a: "Annulez la demande en cours puis envoyez-en une nouvelle avec le contrat à jour : un signataire signe le document tel qu'il a été envoyé."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: "Voir l'onglet demande « Voir les baux » ; envoyer, relancer, annuler et signer sur place demandent « Modifier les baux »."
    },
    related: [
      { label: "La fenêtre d'envoi pour signature", helpId: 'locatif.signatures.envoi' },
      { label: 'Suivre toutes les signatures', helpId: 'locatif.signatures.liste' },
      { label: 'La fiche du bail', helpId: 'locatif.baux.fiche' }
    ],
    keywords: [
      'signer le bail',
      'contrat de bail',
      'signature électronique',
      'pdf signé',
      'envoyer pour signature',
      'sur place',
      'relance'
    ]
  },
  {
    id: 'locatif.signatures.envoi',
    kind: 'section',
    title: 'Envoyer pour signature',
    summary:
      "Cette fenêtre prépare la liste des signataires et la façon de les joindre, puis envoie le document à signer. Le document envoyé est celui de l'écran où vous êtes (par exemple le contrat de bail).",
    purpose:
      "Vous choisissez qui doit signer, avec quel rôle, par quel canal, dans quel ordre et pendant combien de temps. Il n'y a pas de document à choisir : le PDF est produit automatiquement à partir du bail, du mandat ou du compromis ouvert.",
    howToRead: {
      notes: [
        'Rôle : Locataire, Co-locataire, Bailleur, Agent, Mandant, Vendeur, Co-vendeur ou Acquéreur.',
        'Canal : « E-mail », « WhatsApp », « SMS » ou « Sur place ». Selon le type de document, certains canaux ne sont pas proposés (jamais « Sur place » pour une autorisation de prélèvement).',
        'WhatsApp et SMS ne sont offerts que pour un signataire lié à un contact du CRM ; WhatsApp demande de plus que ce contact ait accepté WhatsApp, et le SMS que le SMS soit activé sur la plateforme.',
        "« Signature dans l'ordre de la liste » : chaque signataire reçoit son lien seulement quand le précédent a signé.",
        '« Valable » : durée de validité en jours, de 1 à 30, 14 par défaut.'
      ]
    },
    steps: [
      {
        title: 'Vérifier les signataires',
        detail: 'Les personnes connues sont préremplies ; corrigez le nom ou le contact si besoin.'
      },
      {
        title: 'Choisir le rôle et le canal',
        detail: "Pour chaque ligne, choisissez le rôle puis le canal d'envoi."
      },
      {
        title: 'Saisir le contact',
        detail:
          "Adresse e-mail, numéro de téléphone ou numéro WhatsApp selon le canal. Aucun contact n'est demandé pour « Sur place »."
      },
      {
        title: 'Ajouter ou retirer',
        detail: "« Ajouter un signataire » ajoute une ligne ; l'icône corbeille en retire une (il en faut au moins un)."
      },
      {
        title: "Régler l'ordre et la durée",
        detail: "Activez « Signature dans l'ordre de la liste » si besoin et indiquez la durée de validité."
      },
      {
        title: 'Envoyer',
        detail: "Le bouton « Envoyer » reste grisé tant qu'un nom ou un contact manque."
      }
    ],
    consequences: [
      "Chaque signataire (hors « Sur place ») reçoit un message avec un lien personnel vers la page de signature, valable jusqu'à l'échéance.",
      "Avant de signer, la personne reçoit un code à 6 chiffres sur le même contact ; il est valable quelques minutes et le nombre d'essais est limité. Elle choisit ensuite de saisir son nom ou de dessiner sa signature, et peut aussi refuser en indiquant un motif facultatif.",
      "Pour « Sur place », aucun message n'est envoyé : la signature s'ouvre tout de suite sur votre écran pour le premier signataire concerné, sans code. Ce canal n'est pas admis pour tous les documents.",
      "L'envoi compte pour une signature dans le quota mensuel de l'agence. Si aucun lien n'a pu partir, la demande est annulée.",
      "Des rappels automatiques peuvent partir avant l'échéance (par défaut 3 jours puis 1 jour avant, selon la configuration de la plateforme) ; vous pouvez aussi relancer à la main."
    ],
    faq: [
      {
        q: 'Pourquoi WhatsApp ou SMS est-il grisé pour un signataire ?',
        a: "Ces canaux exigent un contact du CRM avec un numéro connu : liez le signataire à un contact, sinon utilisez l'e-mail. Le SMS peut aussi être désactivé sur la plateforme."
      },
      {
        q: 'Peut-on envoyer deux demandes pour le même document ?',
        a: "Non, une seule demande en cours à la fois. Annulez la demande en cours avant d'en envoyer une nouvelle."
      },
      {
        q: 'Que se passe-t-il si le quota de signatures est atteint ?',
        a: "L'envoi est refusé avec un message qui propose d'ajouter l'extension « Signatures électroniques — bloc de 50 » depuis votre abonnement."
      },
      {
        q: 'Quand utiliser « Sur place » ?',
        a: "Quand le signataire est devant vous : il signe sur votre écran, sans lien ni code. Son identité n'est donc pas vérifiée par un code."
      }
    ],
    permissions: {
      note: 'Envoyer demande le droit de modification du document concerné (par exemple « Modifier les baux ») et un quota de signatures disponible.'
    },
    related: [
      { label: "Signatures d'un bail", helpId: 'locatif.signatures.bail' },
      { label: 'Suivre toutes les signatures', helpId: 'locatif.signatures.liste' }
    ],
    keywords: [
      'envoyer pour signature',
      'signataire',
      'canal',
      'whatsapp',
      'sms',
      'code',
      'ordre',
      'validité',
      'sur place'
    ]
  }
];

export default entries;
