import type { HelpEntry } from '../../../types';

/** Zone « personnel » du module finance (fr) : salaires et tâcherons. */
const entries: HelpEntry[] = [
  // ---------------------------------------------------------------- Salaires (liste)
  {
    id: 'finance.salaires.page',
    kind: 'page',
    title: 'Salaires',
    summary:
      'Retrouvez ici les salariés de votre agence et ce que vous leur devez. Chaque salarié a sa fiche, où vous saisissez ses notes de salaire et enregistrez ce que vous lui versez.',
    purpose:
      "Cet écran sert à suivre le personnel dont les salaires entrent dans vos comptes et, si vous le précisez, dans le coût d'un chantier. Ce n'est pas un logiciel de paie : aucune cotisation, aucun brut ni net n'est calculé. Le montant que vous saisissez est celui qui est versé.",
    steps: [
      { title: 'Trouver un salarié', detail: 'Tapez un nom ou un rôle dans le champ de recherche.' },
      {
        title: 'Voir les anciens salariés',
        detail:
          'Par défaut, seuls les salariés actifs sont listés. Activez « Inclure les anciens salariés » pour afficher les autres.'
      },
      {
        title: 'Voir qui attend un paiement',
        detail: "Activez « On lui doit quelque chose » pour ne garder que les salariés à qui vous devez de l'argent."
      },
      { title: 'Ouvrir une fiche', detail: 'Cliquez sur « Voir la fiche » (sur téléphone, sur la carte du salarié).' },
      {
        title: 'Enregistrer un salarié',
        detail:
          "Cliquez sur « Nouveau salarié », saisissez son nom (obligatoire) et son rôle (facultatif), puis « Enregistrer le salarié ». Sa fiche s'ouvre aussitôt."
      }
    ],
    consequences: [
      "Un salarié n'est pas un utilisateur de l'application : il n'a aucun accès. Son compte de suivi (ce que vous lui devez) est ouvert dès l'enregistrement.",
      "Aucun montant n'est calculé sur cet écran : « Ce qu'on lui doit » vient de ses notes de salaire validées et de ses règlements validés.",
      "L'écran ne propose ni modification ni suppression d'un salarié."
    ],
    faq: [
      {
        q: 'Un salarié est introuvable dans la liste. Pourquoi ?',
        a: 'Par défaut, seuls les salariés actifs sont affichés. Activez « Inclure les anciens salariés » pour retrouver les autres.'
      },
      {
        q: 'Où se calculent les cotisations ?',
        a: 'Nulle part : ImmoTopia ne calcule ni brut, ni net, ni cotisation. Saisissez directement le montant à verser.'
      },
      {
        q: 'Que veut dire « Avance de … à retenir » ?',
        a: 'Vous avez versé à ce salarié plus que ce que vous lui deviez. Ses prochaines notes de salaire validées réduiront cette avance.'
      },
      {
        q: "L'enregistrement d'un nouveau salarié est refusé. Pourquoi ?",
        a: "Cette action demande le droit « Paramétrer le module financier ». Demandez-le à l'administrateur de votre agence."
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: "Voir l'écran demande « Voir les comptes de tiers » ; enregistrer un salarié demande « Paramétrer le module financier »."
    },
    related: [
      { label: 'Comment lire la liste des salariés', helpId: 'finance.salaires.liste' },
      { label: 'Tâcherons', to: '/tenant/:tenantId/finance/tacherons' }
    ],
    keywords: [
      'salaire',
      'salaires',
      'paie',
      'employé',
      'employés',
      'personnel',
      'ouvrier',
      'maçon',
      "main-d'œuvre",
      'avance sur salaire'
    ]
  },
  {
    id: 'finance.salaires.liste',
    kind: 'table',
    title: 'Liste des salariés',
    summary: 'Un salarié par ligne, avec son rôle, ce que vous lui devez et son statut.',
    howToRead: {
      columns: [
        { key: 'nom', label: 'Salarié', description: 'Le nom du salarié.' },
        {
          key: 'role',
          label: 'Rôle',
          description: "Sa fonction (maçon, gardien…). Un tiret signifie qu'elle n'a pas été renseignée."
        },
        {
          key: 'solde',
          label: "Ce qu'on lui doit",
          description:
            'Le montant en FCFA que vous lui devez. « Rien à lui verser » : compte soldé. « Avance de … à retenir » : vous lui avez versé plus que dû.'
        },
        { key: 'statut', label: 'Statut', description: 'Actif ou Inactif.' },
        { key: 'actions', label: 'Actions', description: '« Voir la fiche » ouvre la fiche du salarié.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Salarié en poste : il est dans la liste par défaut.' },
        {
          value: 'INACTIVE',
          label: 'Inactif',
          description: 'Ancien salarié : visible seulement si vous activez « Inclure les anciens salariés ».'
        }
      ],
      notes: [
        'La liste affiche 20 salariés par page. Le bouton « Exporter » reprend toute la liste filtrée, pas seulement la page affichée.',
        "Le chiffre « Ce qu'on lui doit » est celui du serveur : il ne change qu'à la validation d'une note (il monte) ou d'un règlement (il baisse)."
      ]
    },
    faq: [
      {
        q: 'Comment ne voir que les salariés à payer ?',
        a: 'Activez le filtre « On lui doit quelque chose » : il garde les salariés dont le compte est positif.'
      },
      {
        q: 'Pourquoi le montant ne bouge-t-il pas après une saisie ?',
        a: 'Une note ou un règlement en brouillon ne compte pas. Le montant change quand vous validez la pièce, depuis la fiche du salarié.'
      },
      {
        q: 'La recherche ne trouve rien.',
        a: 'Elle porte sur le nom et le rôle. Vérifiez aussi que « Inclure les anciens salariés » est activé si le salarié est parti.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Voir les comptes de tiers ».' },
    related: [{ label: "Vue d'ensemble des salaires", helpId: 'finance.salaires.page' }],
    keywords: ['liste des salariés', 'solde salarié', 'dû', 'avance']
  },

  // ---------------------------------------------------------------- Fiche salarié
  {
    id: 'finance.salarie.page',
    kind: 'page',
    title: 'Fiche salarié',
    summary:
      "La fiche d'un salarié montre ce que vous lui devez, ses notes de salaire et ses règlements. C'est ici que vous saisissez une note, la validez, puis enregistrez le versement.",
    purpose:
      "Le circuit se fait en deux temps. La note de salaire constate ce que vous devez au salarié pour un mois ; le règlement constate ce que vous lui avez versé. La différence est « Ce qu'on lui doit ». Il n'y a ni brut, ni net, ni cotisation : un seul montant, celui qui est versé.",
    steps: [
      {
        title: 'Saisir la note du mois',
        detail:
          'Onglet « Notes de salaire », carte « Saisir une note de salaire » : année, mois, montant à verser, puis « Saisir la note ». Elle reste en brouillon.'
      },
      {
        title: 'Choisir un chantier si besoin',
        detail:
          "Si ce salaire doit compter dans le coût d'un chantier, choisissez-le : le poste de dépense devient obligatoire."
      },
      {
        title: 'Valider la note',
        detail: 'Cliquez sur « Valider » sur la ligne en brouillon, puis sur « Confirmer la validation ».'
      },
      {
        title: 'Enregistrer le versement',
        detail:
          'Onglet « Règlements », carte « Enregistrer un règlement » : date, montant versé, compte de trésorerie, puis « Enregistrer le règlement ».'
      },
      {
        title: 'Valider le règlement',
        detail:
          "Cliquez sur « Valider » sur la ligne en brouillon et confirmez : c'est à ce moment que la somme sort de la trésorerie."
      },
      { title: 'Contrôler le solde', detail: "Relisez « Ce qu'on lui doit » en haut de la fiche." }
    ],
    consequences: [
      "Valider est irréversible : l'écran ne propose ni modification ni annulation d'une pièce validée.",
      'Valider une note constate la charge en comptabilité (charges de personnel contre rémunérations dues, comptes 661 et 422, datées du 1er jour du mois de la note) et augmente ce que vous devez au salarié.',
      "Si la note porte un chantier, son montant s'ajoute au coût réel de ce chantier, sur le poste de dépense choisi. Un chantier clos refuse l'imputation.",
      'Valider un règlement fait sortir la somme du compte de trésorerie choisi (la caisse par défaut) et diminue ce que vous devez. Un montant supérieur au dû est accepté : le surplus devient une avance.'
    ],
    faq: [
      {
        q: 'Peut-on saisir deux notes pour le même mois ?',
        a: "Non : une seule note par salarié et par mois. Si elle existe déjà, l'écran affiche le message de refus."
      },
      {
        q: 'Comment corriger une note déjà validée ?',
        a: 'Cet écran ne propose ni modification ni annulation. Avant de valider, vérifiez bien le mois, le montant et le chantier.'
      },
      {
        q: 'Un règlement est-il lié à une note précise ?',
        a: 'Non : on règle un salarié, pas une note. Le règlement diminue ce que vous lui devez au total.'
      },
      {
        q: 'Peut-on verser une avance sur salaire ?',
        a: 'Oui. Un règlement supérieur au dû est accepté et signalé. Le compte passe alors en « Avance à retenir ».'
      },
      {
        q: 'Où sont les retenues et les cotisations ?',
        a: "Il n'y en a pas : la fiche ne calcule aucune retenue ni cotisation."
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: 'Voir la fiche demande « Voir les comptes de tiers » ; saisir une note ou un règlement demande « Créer des pièces financières » ; valider demande « Valider des pièces financières ».'
    },
    related: [
      { label: "Ce qu'on lui doit", helpId: 'finance.salarie.solde' },
      { label: 'Notes de salaire', helpId: 'finance.salarie.notes' },
      { label: 'Règlements', helpId: 'finance.salarie.reglements' },
      { label: 'Liste des salariés', to: '/tenant/:tenantId/finance/salaires' }
    ],
    keywords: ['fiche salarié', 'note de salaire', 'paie', 'règlement', 'avance sur salaire', 'valider']
  },
  {
    id: 'finance.salarie.solde',
    kind: 'section',
    title: "Ce qu'on lui doit",
    summary: "Le chiffre en haut de la fiche dit si vous devez de l'argent au salarié ou s'il a reçu une avance.",
    howToRead: {
      notes: [
        "Montant positif, « Ce qu'on lui doit » : vous lui devez cette somme.",
        '« Avance à retenir » : vous lui avez versé plus que dû. Ses prochaines notes validées réduiront cette avance.',
        'Compte soldé : rien ne lui reste dû.',
        'Le montant couvre toutes les périodes. Il ne se refait pas à partir des lignes affichées dans les onglets, qui peuvent être partielles.',
        'Seules les pièces validées comptent : un brouillon ne change rien. Le second encadré rappelle simplement le rôle du salarié.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi le chiffre ne bouge-t-il pas après ma saisie ?',
        a: "La note ou le règlement est encore en brouillon. Validez-le pour qu'il compte."
      },
      {
        q: 'Pourquoi le montant est-il présenté comme une avance ?',
        a: 'Le total des règlements validés dépasse celui des notes validées. Une prochaine note validée viendra réduire cette avance.'
      },
      {
        q: 'Est-ce le net à payer ?',
        a: "C'est le montant que vous lui devez, tel quel. Aucune cotisation ni retenue n'est calculée par ImmoTopia."
      }
    ],
    related: [{ label: "Vue d'ensemble de la fiche", helpId: 'finance.salarie.page' }],
    keywords: ['solde', 'avance', 'dû', 'reste à payer']
  },
  {
    id: 'finance.salarie.notes',
    kind: 'table',
    title: 'Notes de salaire',
    summary: 'Une note par mois : ce que vous devez au salarié pour la période, avec son chantier et son statut.',
    howToRead: {
      columns: [
        { key: 'periode', label: 'Mois', description: "Le mois et l'année du salaire." },
        { key: 'montant', label: 'Montant', description: 'Le montant à verser, en FCFA.' },
        {
          key: 'chantier',
          label: 'Chantier',
          description:
            'Le chantier dont le coût recevra ce salaire. « Aucun chantier » : la note ne compte dans aucun chantier.'
        },
        {
          key: 'poste',
          label: 'Poste de dépense',
          description: 'Le poste du chantier qui reçoit la charge. Un tiret si aucun chantier.'
        },
        { key: 'saisi', label: 'Saisi par', description: 'La personne qui a saisi la note.' },
        { key: 'statut', label: 'Statut', description: "L'état de la note." },
        { key: 'actions', label: 'Actions', description: '« Valider » apparaît seulement sur une note en brouillon.' }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: "Saisie, pas encore comptée : ni écriture, ni effet sur ce qu'on doit."
        },
        { value: 'VALIDATED', label: 'Validé', description: 'Constatée en comptabilité. Elle ne se modifie plus.' },
        { value: 'VOIDED', label: 'Annulé', description: "Note annulée. Cet écran ne permet pas d'annuler une note." }
      ],
      notes: [
        "Recherchez par chantier, poste ou auteur, et filtrez par statut ou par mois. L'export reprend toute la liste filtrée."
      ]
    },
    steps: [
      { title: 'Vérifier la note', detail: 'Contrôlez le mois, le montant et le chantier.' },
      { title: 'Valider', detail: 'Cliquez sur « Valider » sur la ligne, puis sur « Confirmer la validation ».' }
    ],
    consequences: [
      'La validation est irréversible : la charge est constatée en comptabilité et ce que vous devez au salarié augmente du montant de la note.',
      'Si un chantier est indiqué, son coût réel monte du même montant. La note est refusée si le chantier est clos.'
    ],
    faq: [
      {
        q: 'Je ne vois pas « Valider ».',
        a: "Le bouton n'apparaît que sur une note en brouillon, et valider demande le droit « Valider des pièces financières »."
      },
      {
        q: 'La validation est refusée. Pourquoi ?',
        a: "Une note déjà validée ne se valide pas deux fois, et un chantier clos n'accepte plus de dépense. Le message affiché précise la cause."
      },
      {
        q: 'Pourquoi une date de comptabilité au 1er du mois ?',
        a: "La note n'a pas de date propre : l'écriture comptable est datée du premier jour du mois de la note."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Valider demande « Valider des pièces financières ».' },
    related: [
      { label: 'Saisir une note de salaire', helpId: 'finance.salarie.saisir-note' },
      { label: 'Règlements du salarié', helpId: 'finance.salarie.reglements' }
    ],
    keywords: ['note de salaire', 'mois', 'valider', 'brouillon', 'chantier']
  },
  {
    id: 'finance.salarie.saisir-note',
    kind: 'section',
    title: 'Saisir une note de salaire',
    summary: "Ce formulaire crée la note d'un mois pour ce salarié. Le montant saisi est celui qui sera versé.",
    purpose:
      "Une note constate ce que vous devez au salarié pour un mois. Elle est créée en brouillon : elle ne compte qu'une fois validée.",
    steps: [
      {
        title: 'Année et mois',
        detail: 'Ils sont préremplis avec le mois en cours. Changez-les pour une autre période.'
      },
      { title: 'Montant à verser', detail: 'Saisissez le montant en FCFA, supérieur à zéro.' },
      {
        title: 'Chantier (facultatif)',
        detail:
          "Choisissez un chantier pour que ce salaire entre dans son coût. Sans chantier, la note n'est imputée à aucun chantier."
      },
      {
        title: 'Poste de dépense',
        detail:
          "Ce champ apparaît dès qu'un chantier est choisi et il est obligatoire. L'écran peut proposer un poste dont le nom ressemble à « main-d'œuvre » : vérifiez-le."
      },
      { title: 'Saisir la note', detail: 'Cliquez sur « Saisir la note ». Elle apparaît dans le tableau en brouillon.' }
    ],
    consequences: [
      'Le brouillon ne produit aucune écriture et ne change pas ce que vous devez.',
      'À la validation, un chantier clos refuse la note : choisissez un chantier encore ouvert.',
      "Aucune cotisation n'est calculée : le montant saisi est celui qui sera versé."
    ],
    faq: [
      {
        q: 'Pourquoi le champ « Poste de dépense » apparaît-il ?',
        a: 'Parce que vous avez choisi un chantier : le poste indique où la charge est classée dans son coût. Sans chantier, le champ disparaît.'
      },
      {
        q: 'Une note existe déjà pour ce mois.',
        a: "Il n'y a qu'une note par salarié et par mois. Le message de refus l'indique ; consultez la ligne existante dans le tableau."
      },
      {
        q: 'Peut-on saisir un mois passé ?',
        a: "Oui, choisissez l'année et le mois concernés avant de saisir la note."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Créer des pièces financières ».' },
    related: [{ label: 'Notes de salaire', helpId: 'finance.salarie.notes' }],
    keywords: ['saisir une note', 'nouvelle note', 'poste de dépense', 'chantier', "main-d'œuvre"]
  },
  {
    id: 'finance.salarie.reglements',
    kind: 'table',
    title: 'Règlements du salarié',
    summary:
      'Les versements faits au salarié : date, montant et statut. Un règlement ne vise aucune note en particulier.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'La date du versement.' },
        { key: 'montant', label: 'Montant', description: 'La somme versée, en FCFA.' },
        { key: 'saisi', label: 'Saisi par', description: 'La personne qui a enregistré le règlement.' },
        { key: 'statut', label: 'Statut', description: "L'état du règlement." },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Valider » apparaît seulement sur un règlement en brouillon.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: "Enregistré, mais l'argent n'est pas encore sorti de la trésorerie dans vos comptes."
        },
        { value: 'VALIDATED', label: 'Validé', description: 'Constaté en comptabilité. Il ne se modifie plus.' },
        {
          value: 'VOIDED',
          label: 'Annulé',
          description: "Règlement annulé. Cet écran ne permet pas d'annuler un règlement."
        }
      ],
      notes: [
        "Cet onglet ne charge la liste qu'à son ouverture. Filtrez par statut ou par date ; l'export reprend toute la liste filtrée."
      ]
    },
    steps: [
      { title: 'Contrôler la ligne', detail: 'Vérifiez la date et le montant.' },
      { title: 'Valider', detail: 'Cliquez sur « Valider » puis sur « Confirmer la validation ».' }
    ],
    consequences: [
      "La validation est irréversible : la somme sort du compte de trésorerie du règlement et ce que vous devez au salarié diminue d'autant.",
      'Un montant supérieur à ce qui est dû est accepté : la différence devient une avance sur salaire.'
    ],
    faq: [
      {
        q: 'Mon règlement est enregistré mais le solde ne change pas.',
        a: "Il est en brouillon. Le solde ne bouge qu'à la validation."
      },
      {
        q: 'Peut-on rattacher un règlement à une note ?',
        a: 'Non : le règlement diminue le total dû au salarié, sans viser une note.'
      },
      {
        q: 'Peut-on supprimer un règlement validé ?',
        a: 'Cet écran ne le permet pas. Vérifiez la date, le montant et le compte avant de valider.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Valider demande « Valider des pièces financières ».' },
    related: [
      { label: 'Enregistrer un règlement', helpId: 'finance.salarie.saisir-reglement' },
      { label: 'Notes de salaire', helpId: 'finance.salarie.notes' }
    ],
    keywords: ['règlement', 'versement', 'paiement salaire', 'avance', 'valider']
  },
  {
    id: 'finance.salarie.saisir-reglement',
    kind: 'section',
    title: 'Enregistrer un règlement',
    summary:
      'Ce formulaire enregistre un versement fait au salarié. Il est créé en brouillon et sort de la trésorerie à la validation.',
    purpose:
      'On règle un salarié, pas une note : le règlement vient en diminution de ce que vous lui devez, quel que soit le mois.',
    steps: [
      { title: 'Date du règlement', detail: "Elle est préremplie avec aujourd'hui." },
      { title: 'Montant versé', detail: 'Saisissez la somme en FCFA, supérieure à zéro.' },
      {
        title: 'Compte de trésorerie',
        detail: "Choisissez d'où l'argent sort. Sans choix, c'est la caisse (« Par défaut : la caisse »)."
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer le règlement » : il apparaît en brouillon dans le tableau.'
      },
      { title: 'Valider', detail: 'Validez la ligne depuis le tableau pour que le règlement compte.' }
    ],
    consequences: [
      'Le brouillon ne produit aucune écriture. À la validation, la somme est inscrite en sortie du compte de trésorerie choisi, contre les rémunérations dues (compte 422).',
      "Si le montant dépasse ce qui est dû, un avertissement s'affiche : la différence devient une avance sur salaire, à retenir sur ses prochaines notes. Rien ne bloque la saisie.",
      'Le règlement validé ne se modifie plus.'
    ],
    faq: [
      {
        q: 'Le montant dépasse ce qui est dû : est-ce possible ?',
        a: "Oui, c'est une avance sur salaire. L'écran vous avertit mais l'accepte."
      },
      {
        q: 'Quel compte choisir ?',
        a: "Celui d'où l'argent est réellement sorti (caisse, banque, mobile money selon vos comptes de trésorerie). Sans choix, la caisse est utilisée."
      },
      {
        q: 'Faut-il une note pour enregistrer un règlement ?',
        a: "Non, mais il est plus clair de valider d'abord la note du mois pour voir ce qui est dû."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Créer des pièces financières ».' },
    related: [{ label: 'Règlements du salarié', helpId: 'finance.salarie.reglements' }],
    keywords: ['payer un salarié', 'verser', 'avance', 'compte de trésorerie', 'caisse']
  },

  // ---------------------------------------------------------------- Tâcherons (liste)
  {
    id: 'finance.tacherons.page',
    kind: 'page',
    title: 'Tâcherons',
    summary:
      "Retrouvez ici les tâcherons de votre agence et ce que vous leur devez. Un tâcheron ne facture pas : vous convenez d'un marché avec lui, il présente des situations d'avancement, puis vous le réglez.",
    purpose:
      'Un tâcheron est un artisan ou une entreprise à qui vous confiez des travaux sur un chantier. Chaque marché porte sur un chantier et un poste de dépense ; ses situations validées entrent dans le coût du chantier.',
    steps: [
      {
        title: 'Trouver un tâcheron',
        detail: 'Tapez un nom ou un corps de métier, ou filtrez par « Corps de métier ».'
      },
      {
        title: 'Garder les actifs',
        detail:
          'Activez « Tâcherons actifs uniquement ». Le filtre est désactivé par défaut pour ne cacher aucune dette.'
      },
      {
        title: 'Ouvrir une fiche',
        detail: 'Cliquez sur « Voir la fiche » pour voir ses marchés, situations et règlements.'
      },
      {
        title: 'Enregistrer un tâcheron',
        detail:
          'Cliquez sur « Nouveau tâcheron », saisissez son nom (obligatoire) et son corps de métier (facultatif), puis « Enregistrer le tâcheron ».'
      },
      { title: 'Convenir des marchés', detail: 'Depuis la fiche : les marchés ne se conviennent pas sur cette liste.' }
    ],
    consequences: [
      "L'enregistrement ouvre le compte du tâcheron (ce que vous lui devez) et ouvre sa fiche. Aucun marché n'est créé à ce moment.",
      "Aucun montant n'est calculé sur cet écran : « Ce qu'on lui doit » est « situations validées moins règlements validés ».",
      "L'écran ne propose ni modification ni suppression d'un tâcheron."
    ],
    faq: [
      {
        q: 'Quelle différence avec un fournisseur ?',
        a: "Un fournisseur facture. Un tâcheron convient d'un marché puis présente des situations d'avancement : ses montants se suivent sur sa propre fiche."
      },
      {
        q: 'Que veut dire un montant négatif ?',
        a: 'Vous lui avez déjà versé une avance : ses prochaines situations validées la résorberont.'
      },
      {
        q: "L'enregistrement d'un tâcheron est refusé.",
        a: "Cette action demande le droit « Paramétrer le module financier ». Demandez-le à l'administrateur de votre agence."
      },
      {
        q: 'Où est la retenue de garantie ?',
        a: "Elle ne se pose pas sur cette liste ni sur la fiche : utilisez l'écran « Retenues de garantie » sur une situation validée."
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: "Voir l'écran demande « Voir les comptes de tiers » ; enregistrer un tâcheron demande « Paramétrer le module financier »."
    },
    related: [
      { label: 'Comment lire la liste des tâcherons', helpId: 'finance.tacherons.liste' },
      { label: 'Retenues de garantie', helpId: 'finance.retenues.page' },
      { label: 'Salaires', to: '/tenant/:tenantId/finance/salaires' }
    ],
    keywords: ['tâcheron', 'sous-traitant', 'artisan', 'marché', 'situation de travaux', 'entreprise de travaux']
  },
  {
    id: 'finance.tacherons.liste',
    kind: 'table',
    title: 'Liste des tâcherons',
    summary: 'Un tâcheron par ligne, avec son corps de métier, ce que vous lui devez et son statut.',
    howToRead: {
      columns: [
        { key: 'nom', label: 'Tâcheron', description: 'Le nom du tâcheron.' },
        {
          key: 'metier',
          label: 'Corps de métier',
          description: "Son métier (maçonnerie, plomberie…). « Non renseigné » s'il n'a pas été saisi."
        },
        {
          key: 'du',
          label: "Ce qu'on lui doit",
          description:
            'Situations validées moins règlements validés, tous marchés confondus. Un montant négatif est une avance déjà versée.'
        },
        { key: 'statut', label: 'Statut', description: 'Actif ou Inactif.' },
        { key: 'actions', label: 'Actions', description: '« Voir la fiche » ouvre la fiche du tâcheron.' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Tâcheron en activité.' },
        {
          value: 'INACTIVE',
          label: 'Inactif',
          description:
            'Tâcheron désactivé : il reste dans la liste par défaut, car il peut encore avoir une somme à recevoir.'
        }
      ],
      notes: [
        "« Ce qu'on lui doit » n'est pas le marché restant : le marché restant, ce qu'il reste à exécuter, se lit sur la fiche, marché par marché.",
        'Le bouton « Exporter » reprend toute la liste filtrée.'
      ]
    },
    faq: [
      {
        q: 'Pourquoi un tâcheron inactif apparaît-il ?',
        a: "Le filtre « Tâcherons actifs uniquement » est désactivé par défaut : masquer d'office un tâcheron ferait disparaître une dette."
      },
      {
        q: 'Comment filtrer par métier ?',
        a: 'Utilisez le filtre « Corps de métier », qui propose les métiers présents dans votre liste.'
      },
      {
        q: 'Pourquoi le montant ne bouge-t-il pas après une saisie ?',
        a: 'Une situation ou un règlement en brouillon ne compte pas. Le montant change à la validation, sur la fiche.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Voir les comptes de tiers ».' },
    related: [{ label: "Vue d'ensemble des tâcherons", helpId: 'finance.tacherons.page' }],
    keywords: ['liste des tâcherons', 'dû', 'avance', 'corps de métier']
  },

  // ---------------------------------------------------------------- Fiche tâcheron
  {
    id: 'finance.tacheron.page',
    kind: 'page',
    title: 'Fiche tâcheron',
    summary:
      "La fiche d'un tâcheron réunit ses marchés, leurs situations d'avancement et ses règlements. C'est ici que vous convenez d'un marché, validez une situation et réglez le tâcheron.",
    purpose:
      "Le circuit : vous convenez d'un marché (chantier, poste, montant), le tâcheron présente des situations d'avancement, vous les validez, puis vous le réglez. Deux chiffres se lisent séparément : le marché restant (à exécuter) et ce qu'on lui doit (à payer).",
    steps: [
      {
        title: "Convenir d'un marché",
        detail:
          "Onglet « Marchés », carte « Convenir d'un marché » : chantier, poste, référence, montant, date, puis « Convenir le marché »."
      },
      {
        title: 'Saisir une situation',
        detail:
          'Sous le tableau des situations : date, montant, description des travaux, puis « Saisir la situation ». Elle reste en brouillon.'
      },
      {
        title: 'Valider la situation',
        detail: 'Cliquez sur « Valider » sur la ligne, puis sur « Confirmer la validation ».'
      },
      {
        title: 'Enregistrer un règlement',
        detail:
          'Onglet « Règlements », carte « Enregistrer un règlement » : date, montant, puis « Enregistrer le règlement ».'
      },
      { title: 'Valider le règlement', detail: 'Validez la ligne : la somme sort alors de la caisse.' }
    ],
    consequences: [
      'Valider une situation est irréversible : elle est constatée en comptabilité (charge du poste du marché contre les tâcherons, compte 402), le coût réel du chantier monte du même montant et le tâcheron devient créancier de cette somme.',
      'Valider un règlement est irréversible : la somme sort de la caisse et diminue ce que vous devez au tâcheron.',
      'Un dépassement du marché ou un règlement supérieur au dû ne sont pas bloqués : ils sont signalés, le dépassement est enregistré et le règlement en trop devient une avance.',
      "Un chantier clos n'accepte plus d'imputation : la situation y est refusée."
    ],
    faq: [
      {
        q: "Quelle différence entre « Marché restant » et « Ce qu'on lui doit » ?",
        a: "Le marché restant est ce qu'il reste à exécuter sur un marché. Ce qu'on lui doit est ce qu'il reste à payer au tâcheron, tous marchés confondus."
      },
      {
        q: 'Peut-on dépasser le montant convenu ?',
        a: 'Oui : une situation qui dépasse le marché est acceptée et le marché passe en « Dépassement ».'
      },
      {
        q: "Pourquoi aucune situation ne s'affiche ?",
        a: "Les situations se rattachent à un marché : convenez d'abord un marché, puis saisissez-y des situations."
      },
      {
        q: 'Où poser une retenue de garantie ?',
        a: "Pas sur cette fiche : l'écran « Retenues de garantie » la pose sur une situation déjà validée."
      }
    ],
    permissions: {
      feature: 'CONSTRUCTION',
      note: "Voir la fiche demande « Voir les comptes de tiers » ; convenir d'un marché demande « Gérer les chantiers » ; saisir une situation ou un règlement demande « Créer des pièces financières » ; valider demande « Valider des pièces financières »."
    },
    related: [
      { label: 'Deux chiffres à ne pas confondre', helpId: 'finance.tacheron.soldes' },
      { label: 'Marchés du tâcheron', helpId: 'finance.tacheron.marches' },
      { label: "Situations d'avancement", helpId: 'finance.tacheron.situations' },
      { label: 'Retenues de garantie', helpId: 'finance.retenues.page' }
    ],
    keywords: ['fiche tâcheron', 'marché', 'situation', 'situation de travaux', 'règlement', 'acompte', 'dépassement'],
    tour: {
      steps: [
        {
          target: 'tacheron-soldes',
          title: 'Deux chiffres distincts',
          description:
            "Le marché restant dit ce qu'il reste à exécuter ; « Ce qu'on lui doit » dit ce qu'il reste à payer."
        },
        {
          target: 'tacheron-marches',
          title: 'Ses marchés',
          description:
            'Chaque ligne est un marché sur un chantier : montant convenu, situations validées, marché restant.'
        },
        {
          target: 'tacheron-convenir',
          title: "Convenir d'un marché",
          description:
            'Choisissez le chantier et le poste de dépense, puis la référence et le montant. Le chantier ne change plus ensuite.'
        },
        {
          target: 'tacheron-situations',
          title: 'Valider une situation',
          description:
            "« Valider » constate le travail : le coût du chantier monte et vous devenez redevable. C'est irréversible."
        },
        {
          target: 'tacheron-saisir-situation',
          title: 'Saisir une situation',
          description: 'Indiquez la date, le montant et décrivez les travaux : la description est obligatoire.'
        }
      ]
    }
  },
  {
    id: 'finance.tacheron.soldes',
    kind: 'section',
    title: 'Deux chiffres à ne pas confondre',
    summary: "Le marché restant et « Ce qu'on lui doit » répondent à deux questions différentes. Ne les confondez pas.",
    howToRead: {
      notes: [
        "Marché restant = montant convenu moins situations validées : ce qu'il reste à exécuter, marché par marché.",
        "Ce qu'on lui doit = situations validées moins règlements validés : ce qu'il reste à payer, tous marchés confondus.",
        "Exemple : marché de 1 000 000 FCFA, situations validées 400 000 FCFA, règlements 100 000 FCFA. Marché restant 600 000 FCFA ; ce qu'on lui doit 300 000 FCFA.",
        "Un tâcheron peut avoir fini son marché et rester créancier, ou n'avoir rien exécuté et avoir déjà reçu une avance (montant négatif).",
        '« Marchés en cours » compte les marchés actifs de ce tâcheron.'
      ]
    },
    faq: [
      {
        q: "Pourquoi « Ce qu'on lui doit » est-il négatif ?",
        a: 'Vous lui avez versé une avance. Ses prochaines situations validées la résorberont.'
      },
      {
        q: "Le marché est terminé mais je dois encore de l'argent. Normal ?",
        a: "Oui : le marché restant parle de l'exécution, pas du paiement. Enregistrez et validez les règlements restants."
      },
      {
        q: "Ces montants sont-ils recalculés par l'écran ?",
        a: "Non, ils viennent tout faits du serveur et ne changent qu'à la validation d'une situation ou d'un règlement."
      }
    ],
    related: [{ label: "Vue d'ensemble de la fiche", helpId: 'finance.tacheron.page' }],
    keywords: ['marché restant', 'solde', 'dû', 'reste à payer', 'reste à exécuter']
  },
  {
    id: 'finance.tacheron.marches',
    kind: 'table',
    title: 'Marchés du tâcheron',
    summary: 'Chaque marché relie ce tâcheron à un chantier et à un poste de dépense, pour un montant convenu.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Référence', description: 'La référence du marché, unique dans votre agence.' },
        { key: 'chantier', label: 'Chantier', description: 'Le chantier concerné.' },
        {
          key: 'poste',
          label: 'Poste de dépense',
          description: 'Le poste du chantier qui reçoit les situations dans son coût.'
        },
        { key: 'signe', label: 'Signé le', description: 'La date de signature du marché.' },
        { key: 'convenu', label: 'Montant convenu', description: 'Le montant du marché, en FCFA.' },
        { key: 'situe', label: 'Situations validées', description: 'Le total des situations validées sur ce marché.' },
        {
          key: 'restant',
          label: 'Marché restant',
          description:
            'Montant convenu moins situations validées : ce qui reste à exécuter. Négatif en cas de dépassement.'
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Voir les situations » affiche les situations de ce marché sous le tableau.'
        }
      ],
      statuses: [
        {
          value: 'OVERRUN',
          label: 'Dépassement',
          description: "Les situations validées dépassent le montant convenu. C'est une information, pas un blocage."
        }
      ],
      notes: [
        "Marché restant n'est pas « Ce qu'on lui doit » : l'un parle d'exécution, l'autre de paiement.",
        'Recherchez par référence, chantier ou poste ; filtrez par chantier ou par date de signature.'
      ]
    },
    faq: [
      {
        q: "Comment voir les situations d'un autre marché ?",
        a: 'Cliquez sur « Voir les situations » sur sa ligne. Par défaut, le premier marché est affiché.'
      },
      {
        q: 'Peut-on modifier un marché ?',
        a: 'Cet écran ne propose ni modification ni suppression. Vérifiez les informations avant de convenir du marché.'
      },
      {
        q: 'Que veut dire « Dépassement » ?',
        a: 'Le total des situations validées est supérieur au montant convenu. Le dépassement est enregistré.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Voir les comptes de tiers ».' },
    related: [
      { label: "Convenir d'un marché", helpId: 'finance.tacheron.convenir-marche' },
      { label: "Situations d'avancement", helpId: 'finance.tacheron.situations' }
    ],
    keywords: ['marché', 'contrat', 'chantier', 'montant convenu', 'dépassement']
  },
  {
    id: 'finance.tacheron.convenir-marche',
    kind: 'section',
    title: "Convenir d'un marché",
    summary:
      'Ce formulaire enregistre un marché entre ce tâcheron et un chantier, avec le poste de dépense et le montant convenu.',
    purpose:
      "Le marché fixe où les travaux seront imputés. Chaque situation d'avancement en héritera : le chantier et le poste ne se rechoisissent plus.",
    steps: [
      { title: 'Chantier', detail: "Choisissez le chantier. Un chantier clos n'accepte plus d'imputation." },
      {
        title: 'Poste de dépense',
        detail:
          'Obligatoire, jamais deviné : choisissez un poste actif. Il recevra les situations dans le coût du chantier.'
      },
      {
        title: 'Référence du marché',
        detail: 'Saisissez une référence, par exemple MAR-2026-014. Elle doit être unique dans votre agence.'
      },
      { title: 'Montant convenu', detail: 'En FCFA, supérieur à zéro.' },
      { title: 'Date de signature', detail: "Elle est préremplie avec aujourd'hui." },
      { title: 'Valider le formulaire', detail: 'Cliquez sur « Convenir le marché ».' }
    ],
    consequences: [
      "Convenir d'un marché n'écrit rien en comptabilité et ne change pas le coût du chantier : les écritures naissent à la validation des situations.",
      'Si la référence existe déjà, le marché est refusé ; un poste désactivé est aussi refusé.',
      'Cet écran ne permet ni de modifier ni de supprimer un marché.'
    ],
    faq: [
      {
        q: 'Je ne peux pas cliquer sur « Convenir le marché ».',
        a: 'Le bouton reste grisé tant que le chantier, le poste, la référence et un montant supérieur à zéro ne sont pas renseignés.'
      },
      {
        q: 'Une référence identique existe déjà.',
        a: "Chaque marché porte une référence unique dans l'agence. Choisissez-en une autre."
      },
      {
        q: 'Pourquoi un poste manque-t-il dans la liste ?',
        a: 'Seuls les postes de dépense actifs sont proposés. Un poste désactivé ne peut pas recevoir un nouveau marché.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Gérer les chantiers ».' },
    related: [
      { label: 'Marchés du tâcheron', helpId: 'finance.tacheron.marches' },
      { label: 'Chantiers', to: '/tenant/:tenantId/finance/chantiers' }
    ],
    keywords: ['nouveau marché', 'contrat tâcheron', 'référence', 'poste de dépense', 'chantier']
  },
  {
    id: 'finance.tacheron.situations',
    kind: 'table',
    title: "Situations d'avancement",
    summary:
      "Les situations du marché affiché : le travail réalisé, daté et chiffré, que vous validez pour l'inscrire au coût du chantier.",
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'La date de la situation.' },
        { key: 'description', label: 'Description', description: 'Les travaux réalisés, tels que saisis.' },
        { key: 'montant', label: 'Montant', description: 'Le montant de la situation, en FCFA.' },
        { key: 'saisie', label: 'Saisie par', description: 'La personne qui a saisi la situation.' },
        { key: 'statut', label: 'Statut', description: "L'état de la situation." },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Valider » apparaît seulement sur une situation en brouillon.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: 'Saisie, pas encore comptée : ni écriture, ni effet sur le coût du chantier.'
        },
        { value: 'VALIDATED', label: 'Validée', description: 'Constatée. Elle ne se modifie plus.' },
        {
          value: 'VOIDED',
          label: 'Annulée',
          description: "Situation annulée. Cet écran ne permet pas d'annuler une situation."
        }
      ],
      notes: [
        "Le tableau montre les situations d'un seul marché à la fois : changez de marché avec « Voir les situations ».",
        "Le marché restant et le dépassement éventuel s'affichent juste au-dessus du tableau."
      ]
    },
    steps: [
      {
        title: 'Contrôler la situation',
        detail: "Vérifiez la date, le montant et la description avec l'avancement réel."
      },
      { title: 'Valider', detail: 'Cliquez sur « Valider » puis sur « Confirmer la validation ».' }
    ],
    consequences: [
      'La validation est irréversible : la situation est constatée, le coût du chantier monte du même montant sur le poste du marché, et le tâcheron devient créancier de cette somme.',
      "Elle est refusée si le chantier est clos. Un dépassement du marché n'empêche pas la validation : il est enregistré.",
      'Valider la situation ne paie pas le tâcheron : le paiement se fait par un règlement.'
    ],
    faq: [
      {
        q: 'Pourquoi le coût du chantier a-t-il augmenté ?',
        a: 'Parce que vous avez validé une situation : son montant est ajouté au coût réel, sur le poste du marché.'
      },
      {
        q: 'La validation est refusée.',
        a: "Une situation déjà validée ne se revalide pas, et un chantier clos n'accepte plus de dépense. Le message précise la cause."
      },
      {
        q: 'Je ne vois pas « Valider ».',
        a: "Il n'apparaît que sur une situation en brouillon, et demande le droit « Valider des pièces financières »."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Valider demande « Valider des pièces financières ».' },
    related: [
      { label: 'Saisir une situation', helpId: 'finance.tacheron.saisir-situation' },
      { label: 'Marchés du tâcheron', helpId: 'finance.tacheron.marches' }
    ],
    keywords: ['situation de travaux', 'avancement', 'décompte', 'valider', 'coût du chantier']
  },
  {
    id: 'finance.tacheron.saisir-situation',
    kind: 'section',
    title: 'Saisir une situation',
    summary:
      "Ce formulaire enregistre l'avancement d'un marché : date, montant et description des travaux. Il est créé en brouillon.",
    purpose:
      'Une situation se rattache au marché affiché, jamais au tâcheron seul. Le chantier et le poste sont ceux du marché.',
    steps: [
      {
        title: 'Choisir le marché',
        detail: 'Vérifiez le marché affiché ; changez-en avec « Voir les situations » dans le tableau des marchés.'
      },
      { title: 'Date de la situation', detail: "Elle est préremplie avec aujourd'hui." },
      { title: 'Montant de la situation', detail: 'En FCFA, supérieur à zéro.' },
      {
        title: 'Description des travaux',
        detail: 'Obligatoire. Par exemple : élévation des murs du rez-de-chaussée, 60 %.'
      },
      { title: 'Saisir la situation', detail: 'Cliquez sur « Saisir la situation » : elle apparaît en brouillon.' }
    ],
    consequences: [
      'Le brouillon ne produit aucune écriture et ne change ni le coût du chantier ni ce que vous devez.',
      "Si le montant dépasse le marché restant, un avertissement s'affiche mais la saisie reste possible : le marché apparaîtra en dépassement.",
      'La description est obligatoire pour pouvoir justifier le montant plus tard.'
    ],
    faq: [
      {
        q: 'Le bouton « Saisir la situation » est grisé.',
        a: 'Il faut un montant supérieur à zéro et une description.'
      },
      {
        q: 'Le montant dépasse le marché : est-ce bloqué ?',
        a: "Non. L'écran avertit, enregistre la situation, et le marché passera en dépassement."
      },
      {
        q: 'Comment la situation compte-t-elle dans le coût ?',
        a: 'Après validation seulement, dans le tableau des situations.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Créer des pièces financières ».' },
    related: [{ label: "Situations d'avancement", helpId: 'finance.tacheron.situations' }],
    keywords: ['nouvelle situation', 'avancement', 'description des travaux', 'brouillon']
  },
  {
    id: 'finance.tacheron.reglements',
    kind: 'table',
    title: 'Règlements du tâcheron',
    summary:
      'Les sommes versées au tâcheron : date, montant et statut. Un règlement ne vise aucune situation en particulier.',
    howToRead: {
      columns: [
        { key: 'date', label: 'Date', description: 'La date du règlement.' },
        { key: 'montant', label: 'Montant', description: 'La somme versée, en FCFA.' },
        { key: 'saisi', label: 'Saisi par', description: 'La personne qui a enregistré le règlement.' },
        { key: 'statut', label: 'Statut', description: "L'état du règlement." },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Valider » apparaît seulement sur un règlement en brouillon.'
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: "Enregistré, mais la caisse n'est pas encore touchée dans vos comptes."
        },
        { value: 'VALIDATED', label: 'Validée', description: 'Constaté. Il ne se modifie plus.' },
        {
          value: 'VOIDED',
          label: 'Annulée',
          description: "Règlement annulé. Cet écran ne permet pas d'annuler un règlement."
        }
      ],
      notes: [
        "Cet onglet ne charge la liste qu'à son ouverture. Filtrez par statut, date ou montant ; l'export reprend toute la liste filtrée."
      ]
    },
    steps: [
      { title: 'Contrôler la ligne', detail: 'Vérifiez la date et le montant.' },
      { title: 'Valider', detail: 'Cliquez sur « Valider » puis sur « Confirmer la validation ».' }
    ],
    consequences: [
      'La validation est irréversible : la somme sort de la caisse et vient en diminution de ce que vous devez au tâcheron.',
      "Un règlement supérieur au dû est accepté : c'est un acompte, que ses prochaines situations validées résorberont."
    ],
    faq: [
      {
        q: "Le règlement est enregistré mais « Ce qu'on lui doit » ne change pas.",
        a: 'Le règlement est encore en brouillon : validez-le.'
      },
      {
        q: 'Peut-on choisir le compte de trésorerie ?',
        a: 'Pas sur cet écran : la somme est inscrite en sortie de la caisse.'
      },
      {
        q: 'Peut-on rattacher un règlement à une situation ?',
        a: 'Non : on règle un tâcheron, pas une situation.'
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Valider demande « Valider des pièces financières ».' },
    related: [{ label: 'Enregistrer un règlement', helpId: 'finance.tacheron.saisir-reglement' }],
    keywords: ['règlement', 'paiement tâcheron', 'acompte', 'avance', 'valider']
  },
  {
    id: 'finance.tacheron.saisir-reglement',
    kind: 'section',
    title: 'Enregistrer un règlement',
    summary:
      'Ce formulaire enregistre un paiement fait au tâcheron. Il est créé en brouillon et sort de la caisse à la validation.',
    purpose:
      'On règle un tâcheron, pas une situation : le règlement diminue ce que vous lui devez, tous marchés confondus.',
    steps: [
      { title: 'Date du règlement', detail: "Elle est préremplie avec aujourd'hui." },
      { title: 'Montant du règlement', detail: 'En FCFA, supérieur à zéro.' },
      { title: 'Enregistrer', detail: 'Cliquez sur « Enregistrer le règlement » : il apparaît en brouillon.' },
      { title: 'Valider', detail: 'Validez la ligne depuis le tableau pour que le paiement compte.' }
    ],
    consequences: [
      'Le brouillon ne produit aucune écriture. À la validation, la somme est inscrite en sortie de la caisse contre les tâcherons (compte 402).',
      "Si le montant dépasse ce qu'on lui doit, un avertissement s'affiche : le règlement sera une avance, que ses prochaines situations validées résorberont. Rien ne bloque la saisie."
    ],
    faq: [
      {
        q: 'Puis-je verser un acompte avant toute situation ?',
        a: "Oui. Le règlement est accepté et « Ce qu'on lui doit » devient négatif jusqu'à la prochaine situation validée."
      },
      {
        q: 'Le bouton est grisé.',
        a: 'Il faut un montant supérieur à zéro.'
      },
      {
        q: 'Y a-t-il une retenue de garantie sur ce formulaire ?',
        a: "Non : elle se gère dans l'écran « Retenues de garantie »."
      }
    ],
    permissions: { feature: 'CONSTRUCTION', note: 'Demande « Créer des pièces financières ».' },
    related: [
      { label: 'Règlements du tâcheron', helpId: 'finance.tacheron.reglements' },
      { label: 'Retenues de garantie', helpId: 'finance.retenues.page' }
    ],
    keywords: ['payer un tâcheron', 'acompte', 'avance', 'règlement', 'caisse']
  }
];

export default entries;
