import type { HelpEntry } from '../../../types';

/** Zone « mandats » du module « locatif » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.prelevements.mandats',
    kind: 'page',
    title: 'Prélèvements : mandats',
    summary:
      "Cet écran liste tous les mandats de prélèvement bancaire de votre agence : l'autorisation donnée par un locataire de prélever son loyer sur son compte. Il permet de les rechercher, de les filtrer et de les exporter.",
    purpose:
      "Le prélèvement bancaire se prépare en deux temps : d'abord le mandat du locataire (cet écran), ensuite les remises envoyées à la banque (onglet « Remises »). Un mandat se crée et se gère depuis l'onglet « Prélèvements » de la fiche du bail ; ici vous suivez l'ensemble.",
    steps: [
      {
        title: 'Rechercher',
        detail: 'Tapez une référence, un débiteur, un titulaire ou un numéro de bail dans le champ de recherche.'
      },
      {
        title: 'Filtrer',
        detail: 'Réduisez la liste avec les filtres Statut, Créancier et « Signé le ».'
      },
      {
        title: 'Ouvrir le bail',
        detail:
          "Cliquez sur le numéro dans la colonne « Bail » : la fiche du bail s'ouvre, où vous créez le mandat et agissez dessus."
      },
      {
        title: 'Passer aux remises',
        detail: "L'onglet « Remises » regroupe les prélèvements envoyés à la banque."
      },
      {
        title: 'Exporter',
        detail:
          "Le bouton d'export reprend tous les mandats correspondant à vos critères, pas seulement la page affichée."
      }
    ],
    consequences: [
      'Cet écran ne modifie rien : il sert à consulter. Créer, activer, suspendre ou révoquer un mandat se fait dans la fiche du bail.',
      "L'IBAN est toujours affiché masqué."
    ],
    faq: [
      {
        q: 'Où crée-t-on un mandat ?',
        a: 'Ouvrez la fiche du bail, onglet « Prélèvements », puis « Nouveau mandat de prélèvement ».'
      },
      {
        q: 'Pourquoi la liste est-elle vide ?',
        a: "Aucun mandat n'a encore été créé, ou vos critères sont trop stricts : effacez-les."
      },
      {
        q: 'Que signifie « Rejets consécutifs » ?',
        a: 'Le nombre de prélèvements rejetés par la banque à la suite. Au seuil fixé sur le créancier, le mandat est suspendu automatiquement.'
      },
      {
        q: 'Je ne vois pas cet écran. Pourquoi ?',
        a: "Il demande le droit « Voir les prélèvements bancaires » et un pack incluant la gestion locative. Demandez-le à l'administrateur de votre agence."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Consulter demande « Voir les prélèvements bancaires ». Créer, modifier, activer, suspendre ou révoquer demande « Gérer les prélèvements bancaires ».'
    },
    related: [
      { label: 'Lire le tableau des mandats', helpId: 'locatif.prelevements.mandats.tableau' },
      { label: 'Le panneau Prélèvements du bail', helpId: 'locatif.prelevements.bail' },
      { label: 'Les créanciers', helpId: 'locatif.prelevements.mandats.creanciers' },
      { label: 'Les remises de prélèvement', helpId: 'locatif.prelevements.remises' }
    ],
    keywords: ['prélèvement', 'mandat', 'autorisation de prélèvement', 'iban', 'rib', 'banque', 'loyer', 'débiteur']
  },
  {
    id: 'locatif.prelevements.mandats.tableau',
    kind: 'table',
    title: 'Tableau des mandats de prélèvement',
    summary:
      'Chaque ligne est un mandat de votre agence. Le tableau montre qui paie, depuis quel compte, au profit de quel créancier, et où en est le mandat.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Référence', description: 'Le numéro du mandat, de la forme MDT-année-numéro.' },
        { key: 'status', label: 'Statut', description: "L'état du mandat (voir les statuts ci-dessous)." },
        { key: 'debtor', label: 'Débiteur', description: 'Le locataire (ou colocataire) dont le compte est prélevé.' },
        {
          key: 'lease',
          label: 'Bail',
          description: 'Le numéro du bail concerné ; cliquez dessus pour ouvrir la fiche du bail.'
        },
        {
          key: 'iban',
          label: 'IBAN',
          description: "L'IBAN du compte, masqué : seuls les derniers caractères apparaissent."
        },
        { key: 'bankCode', label: 'Code banque', description: "Le code de la banque, tiré de l'IBAN." },
        { key: 'holder', label: 'Titulaire', description: 'Le nom du titulaire du compte bancaire.' },
        { key: 'creditor', label: 'Créancier', description: "Le compte de votre agence qui reçoit l'argent." },
        {
          key: 'maxAmount',
          label: 'Plafond',
          description:
            "Le montant maximum prélevé à chaque fois, en FCFA. Un tiret (—) signifie qu'il n'y a pas de plafond."
        },
        {
          key: 'day',
          label: 'Jour de collecte',
          description:
            "Le jour du mois où le prélèvement est prévu : celui du mandat s'il en a un, sinon celui du créancier."
        },
        {
          key: 'signedAt',
          label: 'Signé le',
          description: "La date de signature de l'autorisation. Un tiret (—) signifie qu'elle n'est pas encore connue."
        },
        {
          key: 'rejects',
          label: 'Rejets consécutifs',
          description:
            'Le nombre de rejets de la banque à la suite. Il repart de zéro quand on réactive un mandat suspendu.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: "Le mandat est créé mais pas encore activé : il attend le scan signé de l'autorisation."
        },
        { value: 'ACTIVE', label: 'Actif', description: 'Le mandat peut être utilisé pour prélever le loyer.' },
        {
          value: 'SUSPENDED',
          label: 'Suspendu',
          description: "Le mandat est mis en pause, par l'agence ou automatiquement après trop de rejets consécutifs."
        },
        { value: 'REVOKED', label: 'Révoqué', description: 'Le mandat est définitivement arrêté.' }
      ],
      notes: ["Quand un filtre est actif, l'écran affiche « Aucun résultat » et un bouton pour effacer les critères."]
    },
    faq: [
      {
        q: "Pourquoi l'IBAN est-il masqué ?",
        a: "Pour protéger les coordonnées bancaires du locataire : l'IBAN complet n'est jamais affiché dans la liste."
      },
      {
        q: 'Comment retrouver les mandats à signer ?',
        a: 'Filtrez sur le statut « Brouillon ».'
      },
      {
        q: 'Le tableau est-il trié ?',
        a: "Non, il n'y a pas de tri par colonne ; utilisez la recherche et les filtres."
      }
    ],
    related: [
      { label: "Vue d'ensemble des mandats", helpId: 'locatif.prelevements.mandats' },
      { label: 'Actions sur un mandat', helpId: 'locatif.prelevements.bail.actions' }
    ],
    keywords: ['mandat', 'statut', 'rejet', 'plafond', 'iban masqué', 'jour de collecte']
  },
  {
    id: 'locatif.prelevements.bail',
    kind: 'section',
    title: 'Prélèvements du bail',
    summary:
      "Cet onglet de la fiche du bail regroupe les mandats de prélèvement de ce bail. C'est ici que vous créez un mandat et que vous le faites avancer jusqu'à son activation.",
    purpose:
      "Le locataire autorise l'agence à prélever son loyer sur son compte bancaire. Un bail ne peut avoir qu'un seul mandat ouvert (brouillon, actif ou suspendu) avec un même créancier.",
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: "Créé, en attente du scan signé et de l'activation." },
        { value: 'ACTIVE', label: 'Actif', description: 'Utilisable pour prélever le loyer.' },
        { value: 'SUSPENDED', label: 'Suspendu', description: 'En pause ; le motif de suspension est affiché.' },
        {
          value: 'REVOKED',
          label: 'Révoqué',
          description: 'Arrêté définitivement ; le motif de révocation est affiché.'
        }
      ],
      notes: [
        'Chaque mandat est présenté dans une carte : référence, statut, débiteur, IBAN masqué, code banque, titulaire, créancier, plafond, jour de collecte, date de signature et rejets consécutifs.',
        "Tant qu'un mandat est ouvert, le bouton « Nouveau mandat de prélèvement » est grisé."
      ]
    },
    steps: [
      {
        title: 'Créer le mandat',
        detail: 'Cliquez sur « Nouveau mandat de prélèvement » et remplissez le formulaire.'
      },
      {
        title: "Faire signer l'autorisation",
        detail: "Téléchargez l'autorisation (PDF), puis déposez le scan signé ou envoyez-la en signature électronique."
      },
      { title: 'Activer', detail: 'Cliquez sur « Activer » et confirmez la date de signature.' },
      { title: 'Suivre', detail: 'Suspendez, réactivez ou révoquez le mandat selon la situation du locataire.' }
    ],
    consequences: [
      "Un mandat activé peut être repris dans une remise de prélèvement ; rien n'est prélevé tant qu'une remise n'est pas créée et validée.",
      "Pour changer de compte bancaire, il faut révoquer le mandat puis en créer un nouveau : l'IBAN ne se modifie pas."
    ],
    faq: [
      {
        q: 'Pourquoi « Nouveau mandat de prélèvement » est-il grisé ?',
        a: "Un mandat ouvert existe déjà pour ce bail. Révoquez-le avant d'en créer un nouveau."
      },
      {
        q: 'Peut-on créer un mandat sur un bail terminé ?',
        a: "Non : un bail terminé ou résilié n'accepte pas de nouveau mandat."
      },
      {
        q: "Je ne vois pas l'onglet « Prélèvements ».",
        a: 'Il demande le droit « Voir les prélèvements bancaires ».'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Voir demande « Voir les prélèvements bancaires » ; créer et agir demande « Gérer les prélèvements bancaires ».'
    },
    related: [
      { label: 'Formulaire de nouveau mandat', helpId: 'locatif.prelevements.bail.nouveau' },
      { label: 'Actions sur un mandat', helpId: 'locatif.prelevements.bail.actions' },
      { label: 'Signature électronique du mandat', helpId: 'locatif.prelevements.bail.signature' }
    ],
    keywords: ['prélèvement', 'mandat', 'bail', 'autorisation', 'iban']
  },
  {
    id: 'locatif.prelevements.bail.nouveau',
    kind: 'section',
    title: 'Nouveau mandat de prélèvement',
    summary:
      'Ce formulaire crée un mandat pour le bail ouvert. Le mandat naît « Brouillon » : il devra être signé puis activé.',
    steps: [
      {
        title: 'Créancier',
        detail: "Choisissez le compte de l'agence qui reçoit les prélèvements. S'il n'y en a qu'un, il est déjà choisi."
      },
      { title: 'Débiteur', detail: 'Choisissez le locataire principal ou un colocataire du bail.' },
      {
        title: 'IBAN ou RIB',
        detail:
          "Saisissez l'IBAN ou le RIB. Il est vérifié pendant la saisie ; en cas de succès, seuls l'IBAN masqué et le code banque s'affichent."
      },
      { title: 'Titulaire du compte', detail: 'Indiquez le nom du titulaire, tel que sur le compte.' },
      { title: 'Plafond, jour de collecte, notes', detail: 'Facultatifs. Le jour de collecte va de 1 à 28.' },
      { title: 'Créer', detail: 'Cliquez sur « Créer le mandat de prélèvement ».' }
    ],
    consequences: [
      "Un IBAN ou RIB invalide bloque la création et l'erreur s'affiche sous le champ. Un RIB est converti en IBAN.",
      'Le plafond limite le montant prélevé à chaque fois : si le loyer dû est plus élevé, la remise ne prélève que le plafond.',
      "Sans jour de collecte, c'est celui du créancier qui s'applique.",
      "Si la banque renvoie des avertissements sur l'IBAN, ils s'affichent après la création, et le mandat est créé quand même.",
      "L'IBAN n'est conservé que chiffré et n'est jamais réaffiché en entier."
    ],
    faq: [
      {
        q: 'Que faire si la liste des créanciers est vide ?',
        a: 'Créez un créancier dans les paramètres financiers, carte « Prélèvement bancaire ».'
      },
      {
        q: 'Peut-on corriger un IBAN après création ?',
        a: 'Non. Révoquez le mandat puis créez-en un nouveau avec le bon compte.'
      },
      {
        q: 'Qui peut être débiteur ?',
        a: 'Seulement le locataire principal ou un colocataire du bail.'
      }
    ],
    permissions: { note: 'Demande « Gérer les prélèvements bancaires ».' },
    related: [
      { label: 'Prélèvements du bail', helpId: 'locatif.prelevements.bail' },
      { label: 'Les créanciers', helpId: 'locatif.prelevements.mandats.creanciers' }
    ],
    keywords: ['nouveau mandat', 'iban', 'rib', 'titulaire', 'plafond', 'créancier', 'débiteur']
  },
  {
    id: 'locatif.prelevements.bail.actions',
    kind: 'section',
    title: 'Actions sur un mandat',
    summary:
      "Les boutons sous chaque mandat dépendent de son statut. Ils permettent de télécharger l'autorisation, de déposer le scan signé, d'activer, suspendre, réactiver, modifier ou révoquer.",
    howToRead: {
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description:
            "Propose le PDF, le dépôt ou remplacement du scan, « Activer » (grisé tant qu'aucun scan n'est déposé), « Modifier » et « Révoquer »."
        },
        {
          value: 'ACTIVE',
          label: 'Actif',
          description: 'Propose « Suspendre », « Modifier », « Révoquer », le PDF et « Voir le scan ».'
        },
        {
          value: 'SUSPENDED',
          label: 'Suspendu',
          description: 'Propose « Réactiver », « Modifier », « Révoquer », le PDF et « Voir le scan ».'
        },
        { value: 'REVOKED', label: 'Révoqué', description: "Plus aucune action, sauf « Voir le scan » s'il existe." }
      ]
    },
    steps: [
      {
        title: "Télécharger l'autorisation (PDF)",
        detail: "Le document à faire signer par le locataire. Il contient l'IBAN complet."
      },
      { title: 'Déposer le scan signé', detail: 'Choisissez un PDF, un JPEG ou un PNG de 10 Mo au plus.' },
      { title: 'Activer', detail: 'Choisissez la date de signature (pas dans le futur) puis confirmez.' },
      {
        title: 'Suspendre ou révoquer',
        detail: 'Saisissez un motif obligatoire (500 caractères au plus) puis confirmez.'
      },
      { title: 'Réactiver', detail: 'Remet un mandat suspendu en service, sans demande de confirmation.' },
      {
        title: 'Modifier',
        detail: "Change le plafond, le jour de collecte (1 à 28) et les notes. L'IBAN ne se modifie pas."
      }
    ],
    consequences: [
      'La révocation est définitive : pour prélever à nouveau, il faut créer un nouveau mandat. Une demande de signature électronique encore ouverte est alors annulée.',
      'La réactivation remet le compteur de rejets consécutifs à zéro.',
      'Un mandat est suspendu automatiquement quand le nombre de rejets consécutifs atteint le seuil du créancier.',
      'Le scan ne se dépose ou ne se remplace que sur un brouillon. Un scan papier déposé annule la demande de signature électronique en cours.'
    ],
    faq: [
      {
        q: 'Pourquoi « Activer » est-il grisé ?',
        a: "Il faut d'abord déposer le scan signé de l'autorisation, ou obtenir la signature électronique."
      },
      {
        q: 'Que faire pour changer de compte bancaire ?',
        a: 'Révoquez le mandat, puis créez-en un nouveau avec le nouvel IBAN.'
      },
      {
        q: "Un message « pas l'autorisation » s'affiche.",
        a: "Votre rôle n'a pas le droit « Gérer les prélèvements bancaires » : demandez-le à l'administrateur."
      }
    ],
    permissions: { note: 'Toutes ces actions demandent « Gérer les prélèvements bancaires ».' },
    related: [
      { label: 'Signature électronique du mandat', helpId: 'locatif.prelevements.bail.signature' },
      { label: 'Prélèvements du bail', helpId: 'locatif.prelevements.bail' }
    ],
    keywords: ['activer', 'suspendre', 'réactiver', 'révoquer', 'scan signé', 'motif', 'autorisation pdf']
  },
  {
    id: 'locatif.prelevements.bail.signature',
    kind: 'section',
    title: 'Signature électronique du mandat',
    summary:
      "Cette carte, facultative, envoie l'autorisation de prélèvement au locataire pour qu'il la signe en ligne. Elle n'apparaît que sur un mandat en brouillon sans scan.",
    purpose:
      "Le débiteur reçoit un lien et un code à usage unique pour signer l'autorisation. Vous pouvez aussi déposer un scan papier signé : il remplace la signature électronique.",
    steps: [
      {
        title: 'Vérifier le signataire',
        detail: 'Le signataire proposé est le débiteur du mandat ; vérifiez son contact.'
      },
      {
        title: 'Choisir le canal',
        detail: "E-mail, SMS ou WhatsApp. Le choix « sur place » n'est pas proposé : le code est obligatoire."
      },
      { title: 'Envoyer', detail: 'Cliquez sur « Envoyer pour signature électronique ».' },
      { title: 'Suivre', detail: 'Le suivi se met à jour de lui-même ; vous pouvez relancer ou annuler la demande.' },
      {
        title: 'Activer',
        detail: 'Une fois signé, un message le confirme : cliquez sur « Activer » dans les actions du mandat.'
      }
    ],
    consequences: [
      'Le locataire reçoit un message avec le lien et le code sur le canal choisi.',
      "Une fois signé, le document signé tient lieu de scan et la date de signature est reprise automatiquement ; vous pouvez la corriger à l'activation.",
      "Le mandat n'est pas activé tout seul : l'activation reste un geste de l'agence.",
      'Déposer un scan papier ou révoquer le mandat annule toute demande en cours.'
    ],
    faq: [
      {
        q: 'Cette signature est-elle obligatoire ?',
        a: 'Non. Vous pouvez faire signer le PDF sur papier et déposer le scan.'
      },
      {
        q: "Pourquoi n'y a-t-il pas d'envoi possible ?",
        a: "L'écran affiche la raison (par exemple un contact manquant). Complétez la fiche du locataire puis réessayez."
      },
      {
        q: 'Où voir le document signé ?',
        a: 'Avec « Voir le scan » dans les actions du mandat.'
      }
    ],
    permissions: { note: 'Demande « Gérer les prélèvements bancaires ».' },
    related: [
      { label: 'Actions sur un mandat', helpId: 'locatif.prelevements.bail.actions' },
      { label: 'Suivi des signatures', helpId: 'locatif.signatures.liste' }
    ],
    keywords: ['signature électronique', 'signer', 'code', 'sms', 'whatsapp', 'e-mail', 'lien de signature']
  },
  {
    id: 'locatif.prelevements.mandats.creanciers',
    kind: 'section',
    title: 'Créanciers de prélèvement',
    summary:
      "Un créancier est le compte bancaire de l'agence qui reçoit les prélèvements. Cette carte, dans les paramètres financiers, les crée et les règle.",
    howToRead: {
      columns: [
        { key: 'label', label: 'Libellé', description: 'Le nom donné au créancier.' },
        { key: 'account', label: 'Compte de trésorerie', description: 'Le compte bancaire de trésorerie relié.' },
        { key: 'bank', label: 'Banque', description: "Le nom de la banque, s'il est connu." },
        {
          key: 'identifier',
          label: "Numéro d'émetteur",
          description: "Le numéro attribué par la banque. « Convention non signée » s'affiche tant qu'il est vide."
        },
        {
          key: 'collectionDay',
          label: 'Jour de collecte',
          description: 'Le jour du mois par défaut des prélèvements (1 à 28).'
        },
        {
          key: 'prenotification',
          label: 'Prénotification (jours ouvrés)',
          description: 'Le délai en jours ouvrés avant le prélèvement.'
        },
        { key: 'fee', label: 'Frais de rejet', description: 'Le montant en FCFA retenu en cas de rejet.' },
        {
          key: 'threshold',
          label: 'Seuil de suspension',
          description: 'Le nombre de rejets consécutifs qui suspend le mandat.'
        },
        {
          key: 'open',
          label: 'Mandats ouverts',
          description: 'Le nombre de mandats en brouillon, actifs ou suspendus.'
        },
        {
          key: 'active',
          label: 'Actif',
          description: "L'interrupteur active ou désactive le créancier ; il agit tout de suite."
        }
      ]
    },
    steps: [
      { title: 'Nouveau créancier', detail: 'Cliquez sur « Nouveau créancier ».' },
      { title: 'Compte de trésorerie', detail: 'Choisissez un compte de type banque, actif et pas encore utilisé.' },
      {
        title: 'Libellé et numéro',
        detail: "Donnez un libellé. Laissez le numéro d'émetteur vide tant que la convention n'est pas signée."
      },
      {
        title: 'Réglages',
        detail: 'Jour de collecte, prénotification, frais de rejet et seuil de suspension (1 à 10).'
      },
      { title: 'Enregistrer', detail: 'Pour changer ensuite un réglage, utilisez « Modifier » sur la ligne.' }
    ],
    consequences: [
      'Un créancier désactivé ne peut plus recevoir de nouveau mandat.',
      'Un seul créancier par compte de trésorerie, même désactivé. Le compte ne se change plus après création.',
      'Au seuil de rejets consécutifs, les mandats de ce créancier sont suspendus automatiquement.'
    ],
    faq: [
      {
        q: "Où obtenir le numéro d'émetteur ?",
        a: "La banque l'attribue une fois la convention de prélèvement signée."
      },
      {
        q: "Aucun compte n'est proposé.",
        a: 'Seuls les comptes de trésorerie de type banque, actifs et sans créancier sont proposés.'
      },
      {
        q: 'Que fait le seuil de suspension ?',
        a: 'Après ce nombre de rejets de la banque à la suite, le mandat passe à « Suspendu ».'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: 'Consulter demande « Voir les prélèvements bancaires » ; créer et modifier demandent « Gérer les prélèvements bancaires ».'
    },
    related: [{ label: "Vue d'ensemble des mandats", helpId: 'locatif.prelevements.mandats' }],
    keywords: ['créancier', "numéro d'émetteur", 'convention', 'banque', 'frais de rejet', 'prénotification']
  }
];

export default entries;
