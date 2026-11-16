import type { HelpEntry } from '../../../types';

/** Zone « comptabilite » du module « syndic » (fr) : prélèvements bancaires et comptabilité de la copropriété. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Prélèvements
  {
    id: 'syndic.prelevements.liste',
    kind: 'page',
    title: 'Prélèvements de charges',
    summary:
      'Cet écran organise le prélèvement bancaire des appels de charges : le compte de la copropriété, les mandats signés par les copropriétaires et les remises envoyées à la banque. Il se découpe en trois onglets.',
    purpose:
      "Au lieu de payer à la main, un copropriétaire autorise sa banque à prélever ses appels de charges échus. Les sommes sont encaissées sur le compte bancaire de la copropriété, pas sur celui de l'agence.",
    steps: [
      {
        title: 'Configurer le compte',
        detail:
          'Onglet « Compte de prélèvement du syndicat », bouton « Configurer le compte ». Sans compte actif, vous ne pouvez ni créer de mandat ni préparer de remise.'
      },
      {
        title: 'Créer les mandats',
        detail:
          "Onglet « Mandats de prélèvement », « Nouveau mandat » : téléchargez l'autorisation, faites-la signer, déposez le scan signé, puis activez le mandat."
      },
      {
        title: 'Préparer une remise',
        detail:
          'Onglet « Remises », « Préparer une remise » : choisissez la date de prélèvement. La remise reprend les appels de charges échus des lots dont le mandat est actif.'
      },
      {
        title: 'Valider puis produire le fichier',
        detail:
          'Ouvrez la remise : « Valider la remise » envoie un avis aux copropriétaires, puis « Produire le fichier » donne le fichier à charger sur votre banque en ligne.'
      },
      {
        title: 'Suivre le résultat',
        detail:
          'Après le dépôt à la banque, constatez les règlements et les rejets ligne par ligne, ou importez le fichier de retour de la banque.'
      }
    ],
    consequences: [
      "Constater un règlement crée l'encaissement sur les appels de charges du lot, avec son reçu. Un règlement constaté à tort ne s'annule pas depuis cet écran.",
      "En copropriété, aucun frais de rejet n'est refacturé au copropriétaire.",
      'Les pénalités de retard ne sont jamais prélevées.'
    ],
    faq: [
      {
        q: 'Pourquoi « Nouveau mandat » ou « Préparer une remise » est-il grisé ?',
        a: "Le compte de prélèvement du syndicat doit d'abord être configuré et actif. Ces boutons n'apparaissent que si vous avez le droit de gérer les prélèvements."
      },
      {
        q: 'Combien de comptes de prélèvement par copropriété ?',
        a: 'Un seul : le compte bancaire de la copropriété. Vous pouvez le désactiver puis le réactiver.'
      },
      {
        q: 'Que se passe-t-il quand un prélèvement est rejeté ?',
        a: "La ligne est marquée « Rejetée » et le copropriétaire reçoit un avis par e-mail s'il a une adresse. Après le nombre de rejets consécutifs fixé dans le compte (« Seuil de suspension »), son mandat est suspendu."
      },
      {
        q: "Où voir le détail d'une remise ?",
        a: "Dans l'onglet « Remises », cliquez sur la référence de la remise (ou sur sa ligne)."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété', 'Comptable'],
      note: 'Consulter demande « Prélèvements de copropriété : consulter ». Créer ou modifier le compte, les mandats et les remises demande « Prélèvements de copropriété : gérer, IBAN complet ».'
    },
    related: [
      { label: 'Compte de prélèvement du syndicat', helpId: 'syndic.prelevements.compte' },
      { label: 'Mandats de prélèvement', helpId: 'syndic.prelevements.mandats' },
      { label: 'Remises', helpId: 'syndic.prelevements.remises' },
      { label: 'Détail d’une remise', helpId: 'syndic.prelevements.remise' }
    ],
    keywords: [
      'prélèvement',
      'prélèvement bancaire',
      'mandat',
      'remise',
      'domiciliation',
      'banque',
      'charges',
      'appel de charges'
    ]
  },
  {
    id: 'syndic.prelevements.compte',
    kind: 'section',
    title: 'Compte de prélèvement du syndicat',
    summary:
      "Cette carte décrit le compte bancaire de la copropriété sur lequel les prélèvements sont encaissés et les règles de collecte. Il n'y en a qu'un par copropriété.",
    purpose:
      "Les prélèvements des charges sont encaissés sur le compte bancaire du syndicat, pas sur celui de l'agence. Le numéro d'émetteur est attribué par la banque une fois la convention signée.",
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Le compte peut recevoir des mandats et des remises.' },
        {
          value: 'INACTIVE',
          label: 'Inactif',
          description: 'Aucun nouveau mandat ni aucune nouvelle remise tant que le compte n’est pas réactivé.'
        }
      ],
      notes: [
        "« Libellé » : le nom du compte. « Banque » et « Compte du syndicat » : de simples références pour l'affichage, ce n'est ni l'IBAN ni le RIB.",
        "« Numéro d'émetteur » : donné par la banque. Tant qu'il est vide, l'étiquette « Convention non signée » s'affiche.",
        '« Jour de collecte » : jour du mois, de 1 à 28, où les prélèvements sont présentés (5 par défaut).',
        "« Prénotification (jours ouvrés) » : délai minimal entre l'avis au copropriétaire et le prélèvement (5 par défaut).",
        '« Seuil de suspension » : nombre de rejets consécutifs après lequel un mandat est suspendu (2 par défaut).',
        '« Mandats ouverts » : nombre de mandats du compte qui sont ouverts.'
      ]
    },
    steps: [
      {
        title: 'Configurer',
        detail:
          'Cliquez sur « Configurer le compte », remplissez le libellé et les trois réglages, puis « Enregistrer ».'
      },
      {
        title: 'Modifier',
        detail: "Bouton « Modifier » : changez le libellé, la banque, le numéro d'émetteur ou les réglages."
      },
      {
        title: 'Désactiver ou activer',
        detail: "Boutons « Désactiver » et « Activer » pour suspendre ou rouvrir l'usage du compte."
      }
    ],
    consequences: [
      "Désactiver le compte n'efface rien : les mandats existent toujours, mais vous ne pouvez plus créer de mandat ni préparer de remise.",
      "Laissez le numéro d'émetteur vide tant que la convention avec la banque n'est pas signée."
    ],
    faq: [
      {
        q: "Dois-je saisir l'IBAN du syndicat ?",
        a: "Non. Le champ « Compte du syndicat » est une référence courte pour l'affichage, pas l'IBAN ni le RIB."
      },
      {
        q: 'Quel jour de collecte choisir ?',
        a: "Un jour entre 1 et 28. Il s'applique à tous les mandats, sauf si un mandat a son propre jour de collecte."
      },
      {
        q: 'Je ne vois pas les boutons « Modifier » et « Activer ».',
        a: 'Ils demandent le droit « Prélèvements de copropriété : gérer, IBAN complet ».'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Modifier le compte demande « Prélèvements de copropriété : gérer, IBAN complet ».'
    },
    related: [{ label: 'Mandats de prélèvement', helpId: 'syndic.prelevements.mandats' }],
    keywords: ['compte bancaire', 'créancier', 'numéro d’émetteur', 'jour de collecte', 'convention']
  },
  {
    id: 'syndic.prelevements.mandats',
    kind: 'table',
    title: 'Mandats de prélèvement',
    summary:
      "Ce tableau liste les mandats par lot : l'autorisation donnée par un copropriétaire de prélever ses appels de charges sur son compte. Vous y créez, activez, suspendez ou révoquez les mandats.",
    purpose:
      'Un mandat relie un lot, un copropriétaire et un compte bancaire. Seuls les mandats actifs sont pris en compte dans une remise.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Référence', description: 'Numéro du mandat.' },
        { key: 'status', label: 'Statut', description: 'État du mandat (voir les statuts ci-dessous).' },
        { key: 'lot', label: 'Lot', description: 'Le lot dont les appels de charges sont prélevés.' },
        { key: 'debtor', label: 'Copropriétaire', description: 'La personne prélevée.' },
        { key: 'iban', label: 'IBAN', description: 'IBAN masqué : seuls les derniers chiffres sont visibles.' },
        { key: 'maxAmount', label: 'Plafond', description: "Montant maximal d'un prélèvement. Vide : pas de plafond." },
        { key: 'day', label: 'Jour de collecte', description: 'Jour du mois où ce mandat est prélevé.' },
        { key: 'actions', label: 'Actions', description: 'Gestes possibles selon le statut et vos droits.' }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: "Le mandat est créé mais pas encore activé : il faut le scan signé de l'autorisation."
        },
        { value: 'ACTIVE', label: 'Actif', description: 'Le mandat est prélevé dans les remises.' },
        {
          value: 'SUSPENDED',
          label: 'Suspendu',
          description:
            "Plus aucun prélèvement tant qu'il n'est pas réactivé. Il l'est aussi après trop de rejets consécutifs."
        },
        {
          value: 'REVOKED',
          label: 'Révoqué',
          description: 'Définitif : pour prélever à nouveau, créez un nouveau mandat.'
        }
      ],
      notes: ["Filtrez par statut ou par lot, ou cherchez par titulaire, lot, copropriétaire, référence ou fin d'IBAN."]
    },
    steps: [
      {
        title: 'Créer un mandat',
        detail: 'Cliquez sur « Nouveau mandat » (réservé aux gestionnaires des prélèvements).'
      },
      {
        title: "Télécharger l'autorisation",
        detail: "Bouton « Télécharger l'autorisation (PDF) » sur la ligne : faites-la signer par le copropriétaire."
      },
      {
        title: 'Déposer le scan signé',
        detail:
          'Bouton « Déposer le scan signé » (PDF, JPEG ou PNG, 10 Mo au plus). La « Signature électronique » est aussi proposée tant que le mandat est en brouillon.'
      },
      {
        title: 'Activer',
        detail:
          "Bouton « Activer » : il n'est utilisable qu'une fois le scan déposé ; vous confirmez la date de signature."
      },
      {
        title: 'Suspendre, réactiver, révoquer, modifier',
        detail: 'Boutons de la ligne. Un motif est demandé pour suspendre ou révoquer.'
      }
    ],
    consequences: [
      "La révocation est définitive. L'IBAN ne se modifie pas : pour changer de compte, révoquez le mandat puis créez-en un nouveau.",
      "Un mandat suspendu ou en brouillon n'entre dans aucune remise."
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas activer le mandat ?',
        a: "Déposez d'abord le scan signé de l'autorisation (ou lancez la signature électronique)."
      },
      {
        q: "Peut-on corriger l'IBAN d'un mandat ?",
        a: 'Non. Révoquez le mandat et créez-en un nouveau avec le bon compte.'
      },
      {
        q: 'Pourquoi un mandat est-il passé à « Suspendu » seul ?',
        a: 'Le nombre de rejets consécutifs a atteint le « Seuil de suspension » du compte. Vous pouvez le réactiver depuis la ligne.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir les mandats demande « Prélèvements de copropriété : consulter » ; la colonne « Actions » et « Nouveau mandat » demandent « Prélèvements de copropriété : gérer, IBAN complet ».'
    },
    related: [
      { label: 'Nouveau mandat', helpId: 'syndic.prelevements.mandat-nouveau' },
      { label: 'Compte de prélèvement du syndicat', helpId: 'syndic.prelevements.compte' }
    ],
    keywords: ['mandat', 'autorisation de prélèvement', 'IBAN', 'scan signé', 'activer', 'suspendre', 'révoquer']
  },
  {
    id: 'syndic.prelevements.mandat-nouveau',
    kind: 'section',
    title: 'Nouveau mandat de prélèvement',
    summary:
      "Ce formulaire crée un mandat pour un lot et un copropriétaire. Le mandat naît en brouillon : il ne sera prélevé qu'après dépôt du scan signé et activation.",
    steps: [
      { title: 'Choisir le lot', detail: 'Champ « Lot ».' },
      {
        title: 'Choisir le copropriétaire',
        detail:
          "Champ « Copropriétaire à prélever », disponible une fois le lot choisi. Un avertissement s'affiche si la personne n'a pas d'adresse e-mail."
      },
      {
        title: "Saisir l'IBAN ou le RIB",
        detail: "L'écran vérifie le compte pendant la saisie et affiche l'IBAN et le code banque reconnus."
      },
      { title: 'Renseigner le titulaire', detail: 'Champ « Titulaire du compte ».' },
      {
        title: 'Facultatif',
        detail: '« Plafond par prélèvement (FCFA) », « Jour de collecte (1 à 28) » propre à ce mandat, et « Notes ».'
      },
      {
        title: 'Créer',
        detail: "Bouton « Créer le mandat de prélèvement », puis téléchargez l'autorisation depuis la ligne du mandat."
      }
    ],
    consequences: [
      "Sans adresse e-mail, le copropriétaire ne recevra pas l'avis de prélèvement : ajoutez son adresse sur sa fiche.",
      "Le mandat est créé en brouillon : téléchargez l'autorisation, faites-la signer, déposez le scan et activez le mandat."
    ],
    faq: [
      {
        q: "Pourquoi aucun copropriétaire n'apparaît ?",
        a: "La liste dépend du lot choisi : choisissez d'abord le lot. « Aucun copropriétaire pour ce lot » signifie que le lot n'a pas de copropriétaire rattaché."
      },
      {
        q: 'À quoi sert le plafond ?',
        a: 'Un prélèvement ne dépasse jamais ce montant, même si le reste dû est plus élevé.'
      },
      {
        q: 'Le mandat est-il prélevé dès sa création ?',
        a: "Non, il naît en brouillon : il ne sera prélevé qu'après dépôt du scan signé et activation."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande « Prélèvements de copropriété : gérer, IBAN complet ».' },
    related: [{ label: 'Mandats de prélèvement', helpId: 'syndic.prelevements.mandats' }],
    keywords: ['créer un mandat', 'IBAN', 'RIB', 'plafond']
  },
  {
    id: 'syndic.prelevements.remises',
    kind: 'table',
    title: 'Remises de prélèvements',
    summary:
      "Ce tableau liste les remises : les lots de prélèvements à envoyer à la banque pour une date donnée. Cliquez sur une remise pour l'ouvrir.",
    purpose:
      'Une remise regroupe, pour une date de prélèvement, les appels de charges échus des lots dont le mandat est actif. Elle est préparée, validée, envoyée à la banque, puis ses lignes sont constatées réglées ou rejetées.',
    howToRead: {
      columns: [
        { key: 'reference', label: 'Référence', description: 'Numéro de la remise (PRL-…). Cliquez pour ouvrir.' },
        { key: 'status', label: 'Statut', description: 'Avancement de la remise.' },
        { key: 'collectionDate', label: 'Date de prélèvement', description: 'Jour où la banque prélève.' },
        { key: 'lineCount', label: 'Lignes', description: 'Nombre de lots prélevés.' },
        { key: 'total', label: 'Total', description: 'Somme des montants des lignes.' },
        {
          key: 'deadline',
          label: 'Avis de prélèvement au plus tard le',
          description: 'Dernier jour pour avertir les copropriétaires, selon le délai de prénotification du compte.'
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: 'Préparée, modifiable, rien n’est parti.' },
        {
          value: 'VALIDATED',
          label: 'Validée',
          description: 'Les avis de prélèvement ont été envoyés aux copropriétaires.'
        },
        { value: 'EXPORTED', label: 'Fichier produit', description: 'Le fichier pour la banque a été produit.' },
        {
          value: 'SUBMITTED',
          label: 'Déposée à la banque',
          description: 'Vous avez confirmé avoir chargé le fichier sur votre banque en ligne.'
        },
        { value: 'CANCELED', label: 'Annulée', description: 'Toutes les lignes sont annulées, définitivement.' }
      ],
      notes: ['Filtrez par statut ou par date de prélèvement, ou cherchez une référence de remise.']
    },
    steps: [
      {
        title: 'Préparer une remise',
        detail: 'Bouton « Préparer une remise ». Vous arrivez directement sur le détail de la remise.'
      },
      {
        title: 'Importer un retour de la banque',
        detail:
          "Bouton « Importer un retour de la banque » : déposez le fichier CSV, regardez l'aperçu, puis « Appliquer »."
      },
      {
        title: 'Retrouver un import',
        detail: "Sous le tableau, l'historique liste les fichiers de retour déjà importés."
      }
    ],
    consequences: [
      "L'import du retour de la banque ne change rien tant que vous n'avez pas cliqué sur « Appliquer ». Les règlements créent des encaissements et des reçus.",
      "En copropriété, le rejet d'un prélèvement déjà constaté réglé n'est pas pris en charge : régularisez-le dans la comptabilité de la copropriété."
    ],
    faq: [
      {
        q: 'Quelles colonnes doit contenir le fichier de retour ?',
        a: 'reference_operation, statut, date, montant, code_rejet et motif, au format CSV.'
      },
      {
        q: 'Un même fichier peut-il être importé deux fois ?',
        a: "L'écran vous prévient quand un fichier a déjà été importé."
      },
      {
        q: 'Que signifie le statut « Déposée à la banque » ?',
        a: 'Vous avez confirmé avoir chargé le fichier sur votre banque en ligne.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Voir les remises demande « Prélèvements de copropriété : consulter » ; préparer ou importer demande « Prélèvements de copropriété : gérer, IBAN complet ».'
    },
    related: [
      { label: 'Préparer une remise', helpId: 'syndic.prelevements.remise-preparer' },
      { label: 'Détail d’une remise', helpId: 'syndic.prelevements.remise' }
    ],
    keywords: ['remise', 'fichier de prélèvement', 'retour de la banque', 'import']
  },
  {
    id: 'syndic.prelevements.remise-preparer',
    kind: 'section',
    title: 'Préparer une remise',
    summary:
      'Cette fenêtre crée une remise pour une date de prélèvement. Les lignes sont calculées à partir des appels de charges échus des lots dont le mandat est actif.',
    steps: [
      {
        title: 'Choisir la date',
        detail:
          "Champ « Date de prélèvement » : l'écran propose la première date possible selon le jour de collecte et le délai d'avis du compte. Les dates trop proches sont grisées."
      },
      { title: 'Ajouter des notes', detail: 'Champ « Notes », facultatif.' },
      { title: 'Préparer', detail: "Bouton « Préparer ». La remise s'ouvre au statut « Brouillon »." }
    ],
    consequences: [
      'Pour chaque lot, le montant est le reste dû sur les appels échus à la date choisie, limité au plafond du mandat. Un lot sans rien à payer, ou dont les appels sont déjà dans une remise, est écarté.',
      "Rien n'est envoyé aux copropriétaires tant que la remise n'est pas validée."
    ],
    faq: [
      {
        q: 'Pourquoi un lot manque-t-il dans la remise ?',
        a: "Son mandat n'est pas actif, il n'a rien à payer à cette date, ou ses appels sont déjà dans une autre remise."
      },
      {
        q: 'Pourquoi cette date est-elle grisée ?',
        a: "Il faut laisser le délai d'avis (jours ouvrés) fixé dans le compte de prélèvement."
      },
      {
        q: 'Les copropriétaires sont-ils prévenus quand je prépare la remise ?',
        a: "Non, rien n'est envoyé tant que la remise n'est pas validée. Elle s'ouvre au statut « Brouillon »."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Demande « Prélèvements de copropriété : gérer, IBAN complet » et un compte de prélèvement actif.'
    },
    related: [{ label: 'Détail d’une remise', helpId: 'syndic.prelevements.remise' }],
    keywords: ['préparer', 'date de prélèvement', 'nouvelle remise']
  },
  {
    id: 'syndic.prelevements.remise',
    kind: 'page',
    title: "Détail d'une remise de prélèvements",
    summary:
      'Cet écran suit une remise de bout en bout : validation, avis aux copropriétaires, fichier pour la banque, puis règlement ou rejet de chaque ligne.',
    purpose:
      'Chaque ligne correspond à un lot prélevé. Les boutons proposés changent selon le statut de la remise : brouillon, validée, fichier produit, déposée à la banque ou annulée.',
    howToRead: {
      columns: [
        {
          key: 'reference',
          label: "Référence d'opération",
          description: 'Identifiant de la ligne, à retrouver dans le fichier de retour de la banque.'
        },
        { key: 'debtor', label: 'Débiteur', description: 'Le copropriétaire prélevé.' },
        { key: 'lot', label: 'Lot', description: 'Le lot concerné.' },
        { key: 'mandate', label: 'Mandat', description: 'Le mandat utilisé.' },
        {
          key: 'chargeCalls',
          label: 'Appels de charges couverts',
          description: 'Les appels de charges, du plus ancien au plus récent, que cette ligne règle.'
        },
        { key: 'remaining', label: 'Reste dû', description: 'Ce qui restait à payer sur ces appels.' },
        {
          key: 'amount',
          label: 'Montant prélevé',
          description: 'Le reste dû, limité au plafond du mandat (étiquette « Plafonné »).'
        },
        {
          key: 'prenotification',
          label: 'Avis de prélèvement',
          description: "État de l'avis par e-mail envoyé au copropriétaire."
        },
        { key: 'status', label: 'Statut', description: 'État de la ligne.' },
        { key: 'actions', label: 'Actions', description: 'Constater un règlement ou un rejet, ou retirer la ligne.' }
      ],
      statuses: [
        { value: 'PENDING', label: 'À prélever', description: 'Pas encore constatée.' },
        { value: 'SETTLED', label: 'Réglée', description: 'Le prélèvement a abouti : un encaissement est enregistré.' },
        { value: 'REJECTED', label: 'Rejetée', description: 'La banque a refusé le prélèvement.' },
        { value: 'CANCELED', label: 'Annulée', description: 'Ligne retirée ou remise annulée.' }
      ],
      notes: [
        "Avis de prélèvement : « En attente », « Envoyée », « Sans e-mail » (le copropriétaire n'a pas d'adresse), « Désactivée » (l'envoi est coupé pour l'agence), « Échec ».",
        "L'en-tête reprend la référence, le statut, le compte, la copropriété, la date de prélèvement, le total et les dates de chaque étape."
      ]
    },
    steps: [
      {
        title: 'Actualiser (brouillon)',
        detail: "« Actualiser » recalcule les lignes à partir des appels de charges et des mandats d'aujourd'hui."
      },
      {
        title: 'Valider la remise',
        detail:
          "Les copropriétaires reçoivent un avis de prélèvement par e-mail. Le bouton est grisé s'il n'y a aucune ligne à prélever."
      },
      {
        title: 'Produire le fichier',
        detail:
          'Le fichier contient les IBAN complets : conservez-le avec soin. « Télécharger à nouveau le fichier » reste possible ensuite.'
      },
      {
        title: 'Charger sur la banque',
        detail: 'Chargez le fichier sur votre banque en ligne, puis « Marquer comme déposée à la banque ».'
      },
      {
        title: 'Constater les résultats',
        detail:
          'Par ligne : « Constater le règlement » ou « Constater le rejet ». « Tout constater réglé » règle toutes les lignes restantes.'
      },
      {
        title: 'Renvoyer les avis',
        detail: '« Renvoyer les avis de prélèvement » relance les copropriétaires qui ne les ont pas reçus.'
      }
    ],
    consequences: [
      "Valider envoie un e-mail à chaque copropriétaire ayant une adresse. Constater un règlement crée l'encaissement sur ses appels de charges, avec un reçu ; il ne s'annule pas depuis cet écran.",
      "Un rejet envoie un avis au copropriétaire (si l'e-mail est activé) et peut suspendre le mandat. Aucun frais de rejet n'est refacturé.",
      'Annuler la remise est définitif et annule toutes ses lignes. Si le fichier a déjà été chargé à la banque, annulez aussi la remise chez elle, sinon les comptes seront débités.',
      "Retirer une ligne est possible tant que la remise est en brouillon ou validée ; la dernière ligne d'une remise validée ne se retire pas : annulez la remise."
    ],
    faq: [
      { q: 'La date de prélèvement est passée, que faire ?', a: 'Annulez la remise et préparez-en une nouvelle.' },
      {
        q: "Un copropriétaire n'a pas reçu l'avis, que faire ?",
        a: 'Vérifiez son adresse e-mail sur sa fiche, puis « Renvoyer les avis de prélèvement ».'
      },
      {
        q: 'Peut-on corriger un règlement constaté à tort ?',
        a: 'Pas depuis cet écran. Régularisez dans la comptabilité de la copropriété.'
      },
      {
        q: 'Pourquoi certains boutons manquent-ils ?',
        a: 'Ils dépendent du statut de la remise et du droit « Prélèvements de copropriété : gérer, IBAN complet ».'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Consulter demande « Prélèvements de copropriété : consulter » ; toutes les actions demandent « Prélèvements de copropriété : gérer, IBAN complet ».'
    },
    related: [
      { label: 'Remises de prélèvements', helpId: 'syndic.prelevements.remises' },
      { label: 'Prélèvements de charges', helpId: 'syndic.prelevements.liste' }
    ],
    keywords: ['remise', 'valider', 'fichier de remise', 'constater', 'rejet', 'règlement', 'déposée à la banque']
  },

  // ------------------------------------------------------------------ Comptabilité
  {
    id: 'syndic.comptabilite.liste',
    kind: 'page',
    title: 'Comptabilité de la copropriété',
    summary:
      'Cet écran regroupe la comptabilité de la copropriété : plan comptable, journaux, écritures, grand livre et balance de vérification. Elle suit le plan SYSCOHADA.',
    purpose:
      'Vous y tenez les comptes de la copropriété et contrôlez que les écritures sont équilibrées. Le grand livre détaille un compte ; la balance donne le total de chaque compte.',
    howToRead: {
      notes: [
        'Les deux compteurs du haut indiquent le nombre de « Comptes » et de « Journaux » de la copropriété.',
        'Cinq onglets : « Écritures comptables », « Grand livre », « Balance de vérification », « Plan comptable » et « Journaux comptables ».'
      ]
    },
    steps: [
      {
        title: 'Charger le plan',
        detail:
          'Si le plan comptable est vide, « Charger le plan SYSCOHADA » ajoute les comptes standards. « Nouveau compte » en crée un à la main.'
      },
      {
        title: 'Créer un journal',
        detail: '« Nouveau journal » : code, exercice, libellé et type (Général, Banque, Caisse, Charges).'
      },
      {
        title: 'Saisir une écriture',
        detail:
          '« Nouvelle écriture » : il faut au moins deux comptes et un journal. Le total des débits doit égaler celui des crédits.'
      },
      { title: 'Verrouiller', detail: "Dans l'onglet « Écritures comptables », « Verrouiller » fige une écriture." },
      {
        title: 'Contrôler',
        detail: "« Balance de vérification » puis « Grand livre » d'un compte, en gardant la même période."
      }
    ],
    consequences: [
      'Une écriture dont les débits et les crédits ne sont pas égaux est refusée.',
      'Verrouiller une écriture est définitif : aucun bouton ne permet de la rouvrir.'
    ],
    faq: [
      {
        q: 'Pourquoi « Nouvelle écriture » est-il grisé ?',
        a: 'Il faut au moins deux comptes et un journal : chargez le plan SYSCOHADA et créez un journal.'
      },
      {
        q: 'Recharger le plan SYSCOHADA écrase-t-il mes comptes ?',
        a: 'Non. Seuls les comptes manquants sont ajoutés, les comptes existants ne sont pas modifiés.'
      },
      { q: 'Peut-on modifier une écriture verrouillée ?', a: "L'écran ne le permet pas." },
      {
        q: 'Comment passer de la balance au grand livre ?',
        a: 'Cliquez sur « Grand livre » à la fin de la ligne du compte : la période de la balance est reprise.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Comptable', 'Gestionnaire de copropriété'],
      note: 'Consulter la comptabilité demande le droit de voir le module Syndic ; créer des comptes, journaux ou écritures et verrouiller demandent le droit de le modifier.'
    },
    related: [
      { label: 'Écritures comptables', helpId: 'syndic.comptabilite.ecritures' },
      { label: 'Grand livre', helpId: 'syndic.comptabilite.grand-livre' },
      { label: 'Balance de vérification', helpId: 'syndic.comptabilite.balance' },
      { label: 'Plan comptable', helpId: 'syndic.comptabilite.plan' },
      { label: 'Journaux comptables', helpId: 'syndic.comptabilite.journaux' }
    ],
    keywords: ['comptabilité', 'SYSCOHADA', 'écriture', 'journal', 'grand livre', 'balance', 'plan comptable']
  },
  {
    id: 'syndic.comptabilite.ecritures',
    kind: 'table',
    title: 'Écritures comptables',
    summary:
      'Ce tableau est le journal des écritures de la copropriété. Ouvrez une écriture avec la flèche de sa ligne pour voir ses lignes de débit et de crédit.',
    howToRead: {
      columns: [
        { key: 'entryDate', label: 'Date', description: "Date de l'écriture." },
        { key: 'reference', label: 'Référence', description: 'Référence de la pièce.' },
        { key: 'description', label: 'Description', description: "Libellé de l'écriture." }
      ],
      statuses: [
        { value: 'open', label: 'Ouverte', description: "L'écriture peut encore être verrouillée." },
        { value: 'locked', label: 'Verrouillée', description: 'Écriture figée.' }
      ],
      notes: [
        "Les colonnes « Journal », « Statut » et « Action » complètent le tableau. Dans le détail d'une écriture : « Compte », « Lot », « Libellé », « Débit » et « Crédit ».",
        'Filtres : recherche, compte, période, journal et statut.'
      ]
    },
    steps: [
      { title: 'Rechercher', detail: 'Tapez une référence, une description ou un libellé de ligne.' },
      { title: 'Filtrer', detail: 'Choisissez un compte, une période, un journal ou un statut.' },
      { title: 'Verrouiller', detail: 'Bouton « Verrouiller » sur une écriture « Ouverte ».' }
    ],
    consequences: ["Une écriture verrouillée ne peut plus être rouverte depuis l'écran."],
    faq: [
      { q: 'Comment saisir une écriture ?', a: 'Avec « Nouvelle écriture », en haut de la page.' },
      { q: "Pourquoi une écriture n'a-t-elle pas de bouton ?", a: 'Elle est déjà verrouillée.' },
      { q: 'Peut-on exporter ?', a: "Oui, le tableau propose l'export des écritures correspondant à vos filtres." }
    ],
    permissions: { feature: 'SYNDIC', note: 'Verrouiller demande le droit de modifier le module Syndic.' },
    related: [{ label: 'Nouvelle écriture comptable', helpId: 'syndic.comptabilite.ecriture-nouvelle' }],
    keywords: ['écritures', 'journal des écritures', 'verrouiller']
  },
  {
    id: 'syndic.comptabilite.ecriture-nouvelle',
    kind: 'section',
    title: 'Nouvelle écriture comptable',
    summary:
      'Cette fenêtre enregistre une écriture : un journal, une date, une référence et au moins deux lignes de débit et de crédit.',
    steps: [
      { title: 'Choisir le journal', detail: 'Champ « Journal ».' },
      {
        title: 'Indiquer la date et la référence',
        detail: 'Champs « Date écriture » et « Référence », puis la description.'
      },
      { title: 'Choisir la source', detail: 'Manuel, paiement charge, pénalité ou fonds.' },
      { title: 'Saisir les lignes', detail: 'Pour chaque ligne : compte, lot (facultatif), libellé, débit ou crédit.' },
      { title: 'Créer', detail: 'Bouton « Créer écriture ».' }
    ],
    consequences: [
      "Le total des débits doit être égal au total des crédits : sinon l'écriture est refusée.",
      "L'écriture est créée ouverte ; vous pouvez ensuite la verrouiller."
    ],
    faq: [
      {
        q: "Pourquoi l'enregistrement échoue-t-il ?",
        a: 'Le plus souvent, les débits et les crédits ne sont pas égaux.'
      },
      {
        q: 'À quoi sert le lot sur une ligne ?',
        a: 'À rattacher la ligne à un lot ; il apparaît ensuite dans le détail et dans le grand livre.'
      },
      {
        q: 'Combien de lignes faut-il saisir ?',
        a: 'Au moins deux lignes, en débit et en crédit, avec un total des débits égal au total des crédits.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de modifier le module Syndic.' },
    related: [{ label: 'Écritures comptables', helpId: 'syndic.comptabilite.ecritures' }],
    keywords: ['saisir une écriture', 'débit', 'crédit']
  },
  {
    id: 'syndic.comptabilite.grand-livre',
    kind: 'table',
    title: 'Grand livre',
    summary:
      "Le grand livre détaille, ligne par ligne, tous les mouvements d'un seul compte, avec son solde progressif. Choisissez d'abord un compte.",
    howToRead: {
      columns: [
        { key: 'entryDate', label: 'Date', description: "Date de l'écriture." },
        { key: 'reference', label: 'Pièce', description: "Référence de l'écriture." },
        { key: 'journalCode', label: 'Journal', description: 'Code du journal.' },
        { key: 'lotNumber', label: 'Lot', description: 'Lot rattaché à la ligne, le cas échéant.' },
        { key: 'debit', label: 'Débit', description: 'Montant au débit.' },
        { key: 'credit', label: 'Crédit', description: 'Montant au crédit.' },
        { key: 'runningBalance', label: 'Solde progressif', description: 'Solde du compte après cette ligne.' }
      ],
      notes: [
        "Quatre indicateurs : « Solde d'ouverture », « Total débit », « Total crédit » et « Solde de clôture » de la période.",
        'Les flèches voisines du sélecteur passent au compte précédent ou suivant du plan comptable.'
      ]
    },
    steps: [
      { title: 'Choisir un compte', detail: 'Sélecteur « Choisissez un compte » : sans compte, aucun résultat.' },
      { title: 'Filtrer', detail: 'Recherchez une pièce ou un libellé, ou limitez à une période.' },
      { title: 'Parcourir', detail: 'Boutons « Compte précédent » et « Compte suivant ».' }
    ],
    faq: [
      {
        q: 'Pourquoi le tableau est-il vide ?',
        a: "Aucun compte n'est choisi, ou le compte n'a aucun mouvement sur la période."
      },
      { q: 'Comment arriver ici depuis la balance ?', a: 'Bouton « Grand livre » sur la ligne du compte.' },
      { q: "Qu'est-ce que le solde progressif ?", a: "Le solde du compte après chaque ligne, dans l'ordre des dates." }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de voir le module Syndic.' },
    related: [{ label: 'Balance de vérification', helpId: 'syndic.comptabilite.balance' }],
    keywords: ['grand livre', 'compte', 'solde progressif']
  },
  {
    id: 'syndic.comptabilite.balance',
    kind: 'table',
    title: 'Balance de vérification',
    summary:
      "La balance donne, pour chaque compte, le total des débits, des crédits et le solde. L'indicateur « Balance équilibrée » dit si l'ensemble est cohérent.",
    howToRead: {
      columns: [
        { key: 'totalDebit', label: 'Débit', description: 'Total des débits du compte.' },
        { key: 'totalCredit', label: 'Crédit', description: 'Total des crédits du compte.' },
        { key: 'balance', label: 'Solde', description: 'Différence entre débit et crédit.' }
      ],
      notes: [
        '« Balance équilibrée » : « Oui » quand le total des débits égale celui des crédits, « Non » sinon.',
        'La ligne « Total » recalcule les montants selon vos filtres.',
        'Filtres : recherche (numéro ou intitulé), classes de comptes, période, « Masquer les comptes soldés ».'
      ]
    },
    steps: [
      { title: 'Choisir la période', detail: 'Filtre « Période ».' },
      { title: 'Filtrer', detail: 'Par classe de comptes, ou masquez les comptes soldés.' },
      {
        title: 'Ouvrir un compte',
        detail: '« Grand livre » sur la ligne ouvre le détail du compte, avec la même période.'
      }
    ],
    faq: [
      {
        q: "Que faire si la balance n'est pas équilibrée ?",
        a: "Cherchez l'écriture en cause dans le grand livre des comptes concernés."
      },
      {
        q: 'Les totaux changent quand je filtre : est-ce normal ?',
        a: "Oui, la ligne « Total » suit vos filtres, l'indicateur « Balance équilibrée » concerne l'ensemble."
      },
      {
        q: "Comment ouvrir le détail d'un compte depuis la balance ?",
        a: "Cliquez sur « Grand livre » sur la ligne du compte : le détail s'ouvre avec la même période."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Demande le droit de voir le module Syndic.' },
    related: [{ label: 'Grand livre', helpId: 'syndic.comptabilite.grand-livre' }],
    keywords: ['balance', 'équilibrée', 'totaux']
  },
  {
    id: 'syndic.comptabilite.plan',
    kind: 'table',
    title: 'Plan comptable',
    summary:
      "Le plan comptable liste les comptes utilisables dans les écritures de la copropriété, selon le plan SYSCOHADA. Vous pouvez en créer d'autres.",
    howToRead: {
      columns: [
        { key: 'accountNumber', label: 'Numéro', description: 'Numéro du compte.' },
        { key: 'accountName', label: 'Intitulé', description: 'Nom du compte.' },
        { key: 'accountClass', label: 'Classe', description: 'Classe du compte, de 1 à 9.' },
        {
          key: 'accountType',
          label: 'Type',
          description: 'Actif (bilan), Passif, Capitaux propres, Produit ou Charge.'
        }
      ],
      notes: [
        'La dernière colonne indique si le compte est « Actif » ou « Inactif ». Filtres : classe, type et actifs/inactifs.'
      ]
    },
    steps: [
      { title: 'Charger le plan', detail: 'Plan vide : « Charger le plan SYSCOHADA ».' },
      { title: 'Ajouter un compte', detail: '« Nouveau compte » : numéro, classe, intitulé et type.' }
    ],
    consequences: ['Le chargement ajoute seulement les comptes manquants.'],
    faq: [
      { q: 'Le plan est vide, que faire ?', a: 'Cliquez sur « Charger le plan SYSCOHADA » pour démarrer.' },
      { q: 'Quels types de compte existe-t-il ?', a: 'Actif (bilan), Passif, Capitaux propres, Produit et Charge.' },
      {
        q: 'Charger le plan SYSCOHADA remplace-t-il mes comptes ?',
        a: 'Non, le chargement ajoute seulement les comptes manquants.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Créer un compte ou charger le plan demande le droit de modifier le module Syndic.'
    },
    related: [{ label: 'Journaux comptables', helpId: 'syndic.comptabilite.journaux' }],
    keywords: ['plan comptable', 'SYSCOHADA', 'compte', 'classe']
  },
  {
    id: 'syndic.comptabilite.journaux',
    kind: 'table',
    title: 'Journaux comptables',
    summary:
      "Cette liste présente les journaux de la copropriété, un par type d'opération et par exercice. Chaque écriture est enregistrée dans un journal.",
    howToRead: {
      columns: [
        { key: 'code', label: 'Code', description: 'Code court du journal.' },
        { key: 'label', label: 'Libellé', description: 'Nom du journal.' },
        { key: 'journalType', label: 'Type', description: 'Général, Banque, Caisse ou Charges.' },
        { key: 'fiscalYear', label: 'Exercice', description: "Année de l'exercice." },
        { key: 'createdAt', label: 'Créé le', description: 'Date de création.' }
      ],
      notes: ['Filtres : recherche (code ou libellé), type et exercice.']
    },
    steps: [{ title: 'Créer un journal', detail: '« Nouveau journal » : code, exercice, libellé, type.' }],
    faq: [
      { q: "Pourquoi ai-je besoin d'un journal ?", a: 'Il en faut au moins un pour saisir une écriture.' },
      { q: "Peut-on avoir plusieurs journaux d'un même type ?", a: 'Oui, chaque journal a son code et son exercice.' },
      { q: 'Peut-on supprimer un journal ?', a: "L'écran ne propose pas de suppression." }
    ],
    permissions: { feature: 'SYNDIC', note: 'Créer un journal demande le droit de modifier le module Syndic.' },
    related: [{ label: 'Écritures comptables', helpId: 'syndic.comptabilite.ecritures' }],
    keywords: ['journal', 'exercice', 'banque', 'caisse']
  }
];

export default entries;
