import type { HelpEntry } from '../../../types';

/** Zone « remises » du module « locatif » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.prelevements.remises',
    kind: 'page',
    title: 'Remises de prélèvement',
    summary:
      "Une remise regroupe les loyers à prélever sur les comptes des locataires à une même date, pour un créancier. Cet écran liste vos remises, permet d'en préparer une et d'importer les retours de la banque.",
    purpose:
      'Chaque mois, vous préparez une remise, vous la validez (les locataires reçoivent un avis), vous produisez le fichier à charger sur votre banque en ligne, puis vous enregistrez le résultat envoyé par la banque : règlements ou rejets.',
    steps: [
      {
        title: 'Préparer une remise',
        detail: 'Cliquez sur « Préparer une remise », choisissez le créancier et la date de prélèvement.'
      },
      {
        title: 'Ouvrir une remise',
        detail: 'Cliquez sur sa référence dans le tableau pour voir ses lignes et ses actions.'
      },
      {
        title: 'Rechercher et filtrer',
        detail: 'Utilisez la recherche, puis les filtres Statut, Créancier et Date de prélèvement.'
      },
      {
        title: 'Importer le retour de la banque',
        detail: 'Cliquez sur « Importer un retour de la banque » et déposez le fichier CSV reçu.'
      },
      {
        title: 'Consulter les retours déjà importés',
        detail: "L'historique en bas de page liste chaque fichier importé."
      }
    ],
    consequences: [
      'Préparer une remise ne prévient personne et ne touche à aucun compte : la remise reste un brouillon que vous pouvez actualiser ou annuler.',
      "Les locataires ne sont prévenus (avis de prélèvement par e-mail) qu'à la validation de la remise, depuis son détail.",
      "Importer un retour de la banque crée des encaissements et des quittances (règlements) ou annule des encaissements (rejets tardifs) : l'écran demande une confirmation avant d'appliquer."
    ],
    faq: [
      {
        q: 'Pourquoi certaines dates sont-elles grisées ?',
        a: "La date doit être après aujourd'hui, et l'avis de prélèvement doit pouvoir partir à temps : le nombre de jours ouvrés d'avance est fixé par le créancier."
      },
      {
        q: 'Où se règlent les jours de collecte et les plafonds ?',
        a: "Sur les créanciers et les mandats, dans l'écran des mandats de prélèvement. Cet écran ne les modifie pas."
      },
      {
        q: 'Je ne vois pas « Préparer une remise ». Pourquoi ?',
        a: "Consulter demande « Voir les prélèvements bancaires » ; préparer, valider et importer demandent « Gérer les prélèvements bancaires ». Demandez ce droit à l'administrateur de votre agence."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      roles: ['Gestionnaire', 'Comptable'],
      note: 'Consulter demande « Voir les prélèvements bancaires » ; préparer une remise ou importer un retour demande « Gérer les prélèvements bancaires ».'
    },
    related: [
      { label: 'Comment lire le tableau des remises', helpId: 'locatif.prelevements.remises.tableau' },
      { label: 'Préparer une remise', helpId: 'locatif.prelevements.remises.preparer' },
      { label: 'Importer un retour de la banque', helpId: 'locatif.prelevements.retours.import' },
      { label: 'Mandats de prélèvement', helpId: 'locatif.prelevements.mandats' }
    ],
    keywords: ['remise', 'prélèvement', 'prélèvement bancaire', 'loyer', 'banque', 'fichier', 'mandat'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'remises-preparer',
          title: 'Préparer une remise',
          description: 'Ce bouton crée une remise en brouillon pour un créancier et une date de prélèvement.'
        },
        {
          target: 'remises-import',
          title: 'Importer un retour',
          description:
            'Après le prélèvement, déposez ici le fichier CSV de la banque pour constater règlements et rejets.'
        },
        {
          target: 'remises-tableau',
          title: 'Vos remises',
          description: 'Cliquez sur une référence pour ouvrir la remise.'
        }
      ]
    }
  },
  {
    id: 'locatif.prelevements.remises.tableau',
    kind: 'table',
    title: 'Tableau des remises',
    summary:
      'Chaque ligne est une remise de prélèvement de votre agence, avec son statut, sa date, son total et la date limite des avis.',
    howToRead: {
      columns: [
        {
          key: 'reference',
          label: 'Référence',
          description: 'Le numéro de la remise. Cliquez dessus pour ouvrir son détail.'
        },
        { key: 'status', label: 'Statut', description: "L'avancement de la remise (voir les statuts ci-dessous)." },
        {
          key: 'creditor',
          label: 'Créancier',
          description: "Le compte de l'agence qui reçoit les loyers prélevés."
        },
        {
          key: 'collectionDate',
          label: 'Date de prélèvement',
          description: 'Le jour où la banque débite les locataires.'
        },
        {
          key: 'period',
          label: 'Période',
          description: 'Le mois des loyers prélevés, celui de la date de prélèvement.'
        },
        {
          key: 'lineCount',
          label: 'Lignes',
          description: 'Le nombre de prélèvements dans la remise, un par mandat retenu.'
        },
        { key: 'total', label: 'Total', description: 'La somme à prélever, en FCFA.' },
        {
          key: 'deadline',
          label: 'Avis de prélèvement au plus tard le',
          description:
            "La date limite pour prévenir les locataires : la date de prélèvement moins les jours ouvrés d'avance du créancier."
        }
      ],
      statuses: [
        {
          value: 'DRAFT',
          label: 'Brouillon',
          description: "Préparée, modifiable. Personne n'est encore prévenu."
        },
        {
          value: 'VALIDATED',
          label: 'Validée',
          description: 'Les avis de prélèvement sont partis. Le fichier peut être produit.'
        },
        {
          value: 'EXPORTED',
          label: 'Fichier produit',
          description:
            'Le fichier a été téléchargé ; il reste à le charger sur la banque puis à marquer la remise comme déposée.'
        },
        {
          value: 'SUBMITTED',
          label: 'Déposée à la banque',
          description: 'Vous avez confirmé le dépôt à la banque. Les retours peuvent être enregistrés.'
        },
        { value: 'CANCELED', label: 'Annulée', description: 'Abandonnée : toutes ses lignes sont annulées.' }
      ],
      notes: [
        'Sous un filtre, « Aucun résultat » apparaît avec un bouton pour effacer les critères.',
        'Les jours ouvrés vont du lundi au vendredi ; les jours fériés ne sont pas pris en compte.'
      ]
    },
    faq: [
      {
        q: 'Le total est-il le montant définitivement encaissé ?',
        a: "Non, c'est la somme demandée à la banque. Les encaissements réels apparaissent quand vous constatez les règlements."
      },
      {
        q: 'Puis-je exporter la liste ?',
        a: "Oui, avec le bouton d'export du tableau : toutes les remises correspondant à vos filtres sont exportées."
      },
      {
        q: 'Que filtrer pour retrouver les remises à traiter ?',
        a: 'Filtrez sur « Fichier produit » (à déposer à la banque) ou « Déposée à la banque » (retours à enregistrer).'
      }
    ],
    related: [{ label: "Détail d'une remise", helpId: 'locatif.prelevements.remise' }],
    keywords: ['remises', 'statut', 'créancier', 'date de prélèvement', 'total']
  },
  {
    id: 'locatif.prelevements.remises.preparer',
    kind: 'section',
    title: 'Préparer une remise',
    summary:
      'Cette fenêtre crée une remise en brouillon : vous choisissez un créancier actif, la date de prélèvement et, si vous le souhaitez, une note. Le système retient seul les mandats et les échéances à prélever.',
    purpose:
      "Pour chaque mandat actif du créancier, le système cherche l'échéance de loyer du mois de la date choisie. Le montant prélevé est le reste dû de cette échéance, limité au plafond du mandat s'il y en a un.",
    steps: [
      {
        title: 'Choisir le créancier',
        detail: "Seuls les créanciers actifs sont proposés. S'il n'y en a qu'un, il est déjà choisi."
      },
      {
        title: 'Choisir la date de prélèvement',
        detail:
          "Une date est proposée d'après le jour de collecte du créancier. Les dates trop proches pour envoyer l'avis à temps sont grisées."
      },
      { title: 'Ajouter une note', detail: 'Facultatif, 2000 caractères au plus.' },
      {
        title: 'Cliquer sur « Préparer »',
        detail: "La remise s'ouvre en brouillon, avec la liste des mandats non retenus et la raison."
      }
    ],
    consequences: [
      "Rien n'est envoyé ni prélevé à cette étape : la remise est un brouillon.",
      "Un mandat n'est pas retenu si : le mandat n'est pas actif (brouillon ou suspendu), le bail n'est pas actif, il n'y a pas d'échéance pour ce mois, l'échéance est soldée ou annulée, elle est déjà dans une autre remise, ou le jour de collecte du mandat tombe plus tard dans le mois.",
      'Une échéance ne peut être que dans une seule remise à la fois : elle redevient disponible si la remise est annulée.'
    ],
    faq: [
      {
        q: 'Pourquoi un locataire manque-t-il dans la remise ?',
        a: 'Regardez « Mandats non retenus » : chaque mandat écarté y figure avec sa raison.'
      },
      {
        q: 'Que se passe-t-il si le loyer dépasse le plafond du mandat ?',
        a: "La ligne est limitée au plafond et marquée « Plafonné » ; le reste de la somme n'est pas prélevé."
      },
      {
        q: "Aucun créancier n'est proposé. Que faire ?",
        a: "Créez ou activez un créancier dans l'écran des mandats de prélèvement."
      }
    ],
    related: [
      { label: "Détail d'une remise", helpId: 'locatif.prelevements.remise' },
      { label: 'Mandats de prélèvement', helpId: 'locatif.prelevements.mandats' }
    ],
    keywords: ['préparer', 'nouvelle remise', 'date', 'créancier', 'plafond', 'jours ouvrés']
  },
  {
    id: 'locatif.prelevements.retours.import',
    kind: 'section',
    title: 'Importer un retour de la banque',
    summary:
      "Déposez le fichier CSV de retour de la banque : l'écran en montre d'abord un aperçu sans rien modifier, puis vous l'appliquez pour constater les règlements et les rejets.",
    purpose:
      'Après la date de prélèvement, la banque indique quels prélèvements sont passés ou rejetés. Cet import évite de les constater un par un.',
    steps: [
      {
        title: 'Choisir le fichier',
        detail:
          'Cliquez sur « Choisir un fichier CSV ». Colonnes attendues : reference_operation, statut, date, montant, code_rejet, motif.'
      },
      {
        title: "Lire l'aperçu",
        detail:
          'Le tableau rapproche chaque ligne du fichier avec une ligne de remise. Les compteurs donnent règlements, rejets, lignes ignorées et erreurs de lecture.'
      },
      {
        title: 'Vérifier les écarts',
        detail:
          "« Raison de l'écart » explique pourquoi une ligne est ignorée : référence inconnue, montant différent, ligne déjà traitée ou annulée, date hors période."
      },
      {
        title: 'Cliquer sur « Appliquer »',
        detail: "Le bouton reste grisé s'il n'y a aucun règlement ni rejet à appliquer."
      },
      {
        title: 'Confirmer',
        detail:
          "Cliquez sur « Confirmer l'application » : le compte rendu indique les constats réussis et ceux en échec."
      }
    ],
    howToRead: {
      columns: [
        { key: 'row', label: 'Ligne du fichier', description: 'Le numéro de la ligne dans votre fichier.' },
        {
          key: 'reference',
          label: "Référence d'opération",
          description: "La référence de l'opération de prélèvement, retrouvée dans la remise."
        },
        {
          key: 'outcome',
          label: 'Retour de la banque',
          description: 'Réglée ou Rejetée, avec la date indiquée par la banque.'
        },
        {
          key: 'amount',
          label: 'Montant',
          description: 'Le montant du fichier, en FCFA. Il doit être égal à celui de la ligne.'
        },
        {
          key: 'action',
          label: 'Action',
          description:
            '« Constater le règlement », « Constater le rejet » ou « Ignorée ». « Rejet tardif » : la ligne était déjà réglée.'
        },
        {
          key: 'skipReason',
          label: "Raison de l'écart",
          description: "Pourquoi la ligne est ignorée ; un tiret signifie qu'elle sera appliquée."
        },
        { key: 'match', label: 'Ligne rapprochée', description: 'La remise, le locataire et le montant retrouvés.' }
      ]
    },
    consequences: [
      "L'aperçu ne modifie rien : les constats ne sont écrits qu'à « Appliquer », après une confirmation.",
      'Chaque règlement crée un encaissement sur le bail et émet sa quittance.',
      "Un rejet tardif (ligne déjà réglée) annule l'encaissement enregistré et sa quittance ; leur nombre est rappelé dans la confirmation.",
      'Un rejet peut refacturer des frais au locataire et suspendre le mandat après plusieurs rejets consécutifs, selon les réglages du créancier. Le locataire est prévenu du rejet par e-mail si cette notification est activée pour votre agence.',
      "Un fichier déjà importé est signalé par un avertissement avec la date d'import. Chaque import est conservé dans l'historique."
    ],
    faq: [
      {
        q: 'Mon fichier est refusé ou illisible. Que faire ?',
        a: "Vérifiez que c'est un CSV avec les colonnes attendues. Les lignes illisibles sont listées avec leur numéro."
      },
      {
        q: 'Peut-on annuler un règlement appliqué par erreur ?',
        a: "Seul un rejet tardif sur la ligne, depuis le détail de la remise, annule l'encaissement et la quittance."
      },
      {
        q: 'Pourquoi des lignes sont-elles ignorées ?',
        a: "Voir la colonne « Raison de l'écart ». Par exemple, une remise dont le fichier n'a pas été produit ne peut pas recevoir de retour."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      roles: ['Gestionnaire', 'Comptable'],
      note: 'Demande « Gérer les prélèvements bancaires ».'
    },
    related: [
      {
        label: 'Constater un règlement ou un rejet à la main',
        helpId: 'locatif.prelevements.retours.constats'
      },
      { label: 'Historique des retours', helpId: 'locatif.prelevements.retours.historique' }
    ],
    keywords: ['retour', 'fichier CSV', 'rejet', 'règlement', 'importer', 'banque', 'rapprochement']
  },
  {
    id: 'locatif.prelevements.retours.historique',
    kind: 'table',
    title: 'Historique des retours de la banque',
    summary: 'Cette liste garde la trace de chaque fichier de retour importé : quand, par qui et avec quel résultat.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: "La date de l'import." },
        { key: 'fileName', label: 'Fichier', description: 'Le nom du fichier importé.' },
        { key: 'recordCount', label: 'Lignes lues', description: 'Le nombre de lignes exploitables du fichier.' },
        { key: 'settledCount', label: 'Réglées', description: 'Les lignes constatées réglées.' },
        { key: 'rejectedCount', label: 'Rejetées', description: 'Les lignes constatées rejetées.' },
        {
          key: 'skippedCount',
          label: 'Ignorées',
          description: "Les lignes laissées de côté (la raison se voit dans l'aperçu de l'import)."
        },
        { key: 'errorCount', label: 'Erreurs', description: 'Les lignes illisibles du fichier.' },
        { key: 'importedBy', label: 'Importé par', description: "La personne qui a appliqué l'import." }
      ],
      notes: ["Recherche par nom de fichier et par période d'import. Dix fichiers par page."]
    },
    faq: [
      { q: 'Peut-on rouvrir un fichier depuis cette liste ?', a: "Non, c'est un journal de consultation." },
      {
        q: 'Où vois-je le détail de chaque ligne ?',
        a: 'Dans le détail de la remise concernée : statut, date de valeur ou de rejet, paiement.'
      },
      { q: 'Pourquoi la liste est-elle vide ?', a: "Aucun fichier de retour n'a encore été importé par votre agence." }
    ],
    related: [{ label: 'Importer un retour de la banque', helpId: 'locatif.prelevements.retours.import' }],
    keywords: ['historique', 'import', 'fichier de retour', 'journal']
  },
  {
    id: 'locatif.prelevements.remise',
    kind: 'page',
    title: "Détail d'une remise de prélèvement",
    summary:
      'Suivez ici une remise de bout en bout : ses lignes, les avis envoyés aux locataires, le fichier pour la banque et le résultat des prélèvements. Les boutons proposés changent selon le statut.',
    purpose:
      "Une remise suit toujours le même parcours : Brouillon, Validée, Fichier produit, Déposée à la banque. À chaque étape, certaines actions sont possibles, d'autres ne le sont plus.",
    steps: [
      {
        title: 'Contrôler le brouillon',
        detail:
          "« Actualiser » recalcule les lignes d'après les échéances et les mandats d'aujourd'hui. « Retirer » écarte une ligne."
      },
      {
        title: 'Valider la remise',
        detail: '« Valider la remise » envoie un avis de prélèvement par e-mail aux locataires.'
      },
      {
        title: 'Produire le fichier',
        detail: '« Produire le fichier » télécharge le fichier à charger sur votre banque en ligne.'
      },
      {
        title: 'Déposer à la banque',
        detail: 'Chargez le fichier sur la banque, puis cliquez sur « Marquer comme déposée à la banque ».'
      },
      {
        title: 'Enregistrer les retours',
        detail:
          '« Constater le règlement » ou « Constater le rejet » ligne par ligne, « Tout constater réglé », ou importez le fichier de la banque.'
      },
      {
        title: 'Annuler si besoin',
        detail: "« Annuler la remise » est possible tant qu'elle n'est pas déposée à la banque."
      }
    ],
    consequences: [
      'Valider envoie les avis par e-mail. « Renvoyer les avis de prélèvement » vise ceux qui ne les ont pas reçus.',
      "Une fois le fichier produit, une ligne ne peut plus être retirée : seule l'annulation de la remise reste possible. Le fichier contient les IBAN complets : conservez-le avec soin.",
      'Annuler une remise est définitif. Si le fichier est déjà à la banque, annulez aussi la remise chez elle, sinon les comptes seront débités.',
      'Constater un règlement crée un encaissement et sa quittance ; constater un rejet peut refacturer des frais et suspendre le mandat.'
    ],
    faq: [
      {
        q: 'Pourquoi « Valider la remise » est-il grisé ?',
        a: "La remise n'a aucune ligne « À prélever »."
      },
      {
        q: 'Pourquoi ne puis-je pas retirer la dernière ligne ?',
        a: "La dernière ligne d'une remise validée ne se retire pas : annulez la remise."
      },
      {
        q: "Je ne vois aucun bouton d'action.",
        a: "Les actions demandent « Gérer les prélèvements bancaires ». Une remise annulée n'en propose plus."
      },
      {
        q: 'Peut-on retélécharger le fichier ?',
        a: 'Oui, avec « Télécharger à nouveau le fichier » : un avertissement signale un mandat devenu inactif qui figure encore dans le fichier.'
      }
    ],
    permissions: {
      feature: 'RENTAL',
      roles: ['Gestionnaire', 'Comptable'],
      note: 'Consulter demande « Voir les prélèvements bancaires » ; toutes les actions demandent « Gérer les prélèvements bancaires ».'
    },
    related: [
      { label: 'Informations de la remise', helpId: 'locatif.prelevements.remise.synthese' },
      { label: 'Avis de prélèvement', helpId: 'locatif.prelevements.remise.avis' },
      { label: 'Lignes de la remise', helpId: 'locatif.prelevements.remise.lignes' },
      { label: 'Constater un règlement ou un rejet', helpId: 'locatif.prelevements.retours.constats' },
      { label: 'Annuler une remise', helpId: 'locatif.prelevements.remise.annulation' }
    ],
    keywords: ['remise', 'valider', 'fichier', 'banque', 'avis', 'prélèvement', 'annuler', 'IBAN'],
    tour: {
      autoStart: false,
      steps: [
        {
          target: 'remise-actions',
          title: 'Les actions',
          description:
            'Ces boutons dépendent du statut de la remise : valider, produire le fichier, marquer déposée, constater, annuler.'
        },
        {
          target: 'remise-lignes',
          title: 'Les lignes',
          description: 'Une ligne par locataire prélevé, avec son avis, son statut et ses actions.'
        }
      ]
    }
  },
  {
    id: 'locatif.prelevements.remise.synthese',
    kind: 'section',
    title: 'Informations de la remise',
    summary: 'Ce bloc résume la remise : référence, créancier, dates, total et étapes déjà franchies.',
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: 'Préparée, pas encore validée.' },
        { value: 'VALIDATED', label: 'Validée', description: 'Avis envoyés ; fichier non produit.' },
        { value: 'EXPORTED', label: 'Fichier produit', description: 'Fichier téléchargé, pas encore déclaré déposé.' },
        { value: 'SUBMITTED', label: 'Déposée à la banque', description: 'Dépôt confirmé par vous.' },
        { value: 'CANCELED', label: 'Annulée', description: "Abandonnée ; le motif d'annulation s'affiche." }
      ],
      notes: [
        "« Numéro d'émetteur » : l'identifiant du créancier auprès de la banque, un tiret s'il n'est pas renseigné.",
        '« Format du fichier » : le format du fichier produit pour la banque.',
        "« Validée le », « Fichier produit le », « Déposée à la banque le » et « Annulée le » n'apparaissent qu'une fois l'étape franchie. « Dernier téléchargement » s'affiche si le fichier a été produit plusieurs fois."
      ]
    },
    faq: [
      {
        q: 'Comment est calculée la date « Avis de prélèvement au plus tard le » ?',
        a: "C'est la date de prélèvement moins les jours ouvrés d'avance du créancier (lundi au vendredi, sans jours fériés)."
      },
      { q: 'Quelle est la période ?', a: 'Le mois de la date de prélèvement.' },
      { q: 'Que signifie « Total » ?', a: 'La somme des lignes de la remise, en FCFA.' }
    ],
    related: [{ label: 'Lignes de la remise', helpId: 'locatif.prelevements.remise.lignes' }],
    keywords: ['informations', 'référence', 'créancier', 'date', 'format du fichier', 'émetteur']
  },
  {
    id: 'locatif.prelevements.remise.avis',
    kind: 'section',
    title: 'Avis de prélèvement',
    summary:
      'Avant le prélèvement, chaque locataire reçoit un avis par e-mail. Ce message vous montre combien ont été envoyés, sont en cours ou ont échoué.',
    howToRead: {
      statuses: [
        {
          value: 'PENDING',
          label: 'En attente',
          description: "L'avis n'est pas encore parti ; la page se relit toute seule pendant deux minutes au plus."
        },
        { value: 'SENT', label: 'Envoyée', description: "L'avis est parti." },
        {
          value: 'NO_EMAIL',
          label: 'Sans e-mail',
          description: "Le locataire n'a pas d'adresse e-mail : prévenez-le autrement."
        },
        {
          value: 'DISABLED',
          label: 'Désactivée',
          description: "L'envoi de ces avis est désactivé pour votre agence."
        },
        {
          value: 'FAILED',
          label: 'Échec',
          description: "L'envoi a échoué ; utilisez « Renvoyer les avis de prélèvement »."
        }
      ],
      notes: [
        "L'avis part à l'adresse du compte portail du locataire s'il en a un, sinon à celle de sa fiche contact. L'alerte compte les adresses de chaque type.",
        "L'alerte est verte seulement si toutes les lignes ont reçu leur avis."
      ]
    },
    consequences: [
      "Les avis sont envoyés à la validation de la remise. « Renvoyer les avis de prélèvement » s'adresse à ceux qui ne les ont pas reçus.",
      'Avant « Produire le fichier », la confirmation rappelle le nombre de locataires sans avis.'
    ],
    faq: [
      {
        q: 'Un locataire dit ne pas avoir reçu son avis.',
        a: "Regardez sa ligne : « Sans e-mail » ou « Échec ». Corrigez l'adresse de sa fiche, puis « Renvoyer les avis de prélèvement »."
      },
      {
        q: 'Que se passe-t-il si des avis manquent au moment de produire le fichier ?',
        a: "L'écran vous prévient du nombre de locataires sans avis avant de produire le fichier."
      },
      {
        q: "Où voit-on l'adresse utilisée ?",
        a: 'Dans la colonne « Avis de prélèvement » des lignes, en partie masquée.'
      }
    ],
    related: [{ label: 'Lignes de la remise', helpId: 'locatif.prelevements.remise.lignes' }],
    keywords: ['avis', 'prénotification', 'e-mail', 'locataire', 'renvoyer']
  },
  {
    id: 'locatif.prelevements.remise.lignes',
    kind: 'table',
    title: 'Lignes de la remise',
    summary:
      "Chaque ligne est un prélèvement sur le compte d'un locataire, rattaché à un mandat et à une échéance de loyer.",
    howToRead: {
      columns: [
        {
          key: 'reference',
          label: "Référence d'opération",
          description:
            "La référence unique de l'opération : c'est elle que la banque renvoie dans son fichier de retour."
        },
        { key: 'debtor', label: 'Débiteur', description: 'Le locataire prélevé.' },
        { key: 'lease', label: 'Bail', description: 'Le bail concerné ; cliquez pour ouvrir sa fiche.' },
        {
          key: 'mandate',
          label: 'Mandat',
          description:
            "La référence du mandat et l'IBAN masqué. Une étiquette signale un mandat devenu suspendu, révoqué ou non activé."
        },
        { key: 'period', label: 'Période', description: "Le mois de l'échéance prélevée." },
        {
          key: 'remaining',
          label: 'Reste dû',
          description: "Ce qui restait à payer sur l'échéance au moment de la sélection."
        },
        {
          key: 'amount',
          label: 'Montant prélevé',
          description: 'La somme demandée, en FCFA. « Plafonné » : limitée au plafond du mandat.'
        },
        {
          key: 'prenotification',
          label: 'Avis de prélèvement',
          description:
            "L'état de l'avis, sa date et l'adresse utilisée ; « aucune adresse » si le locataire n'en a pas."
        },
        {
          key: 'status',
          label: 'Statut',
          description:
            'Le sort de la ligne (voir ci-dessous), avec le motif de retrait ou le code et le motif de rejet.'
        },
        {
          key: 'returnDate',
          label: 'Date de valeur ou de rejet',
          description: 'La date constatée du règlement ou du rejet.'
        },
        {
          key: 'rejectFee',
          label: 'Frais refacturés',
          description: 'Les frais de rejet refacturés au locataire, en FCFA, ou un tiret.'
        },
        {
          key: 'payment',
          label: 'Paiement',
          description: "Pour une ligne réglée : « Voir le paiement » ouvre l'encaissement créé."
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            'Selon le statut de la remise : « Retirer », « Constater le règlement », « Constater le rejet » ou « Constater un rejet tardif ».'
        }
      ],
      statuses: [
        { value: 'PENDING', label: 'À prélever', description: 'En attente du prélèvement ou de son résultat.' },
        {
          value: 'SETTLED',
          label: 'Réglée',
          description: 'Le prélèvement est passé ; un encaissement et sa quittance ont été créés.'
        },
        { value: 'REJECTED', label: 'Rejetée', description: 'La banque a refusé le prélèvement.' },
        {
          value: 'CANCELED',
          label: 'Annulée',
          description: 'Retirée de la remise ou remise annulée ; la ligne apparaît estompée.'
        }
      ],
      notes: [
        "Les colonnes « Date de valeur ou de rejet », « Frais refacturés » et « Paiement » n'apparaissent qu'une fois le fichier produit ou un résultat enregistré.",
        'La recherche porte sur la référence, le débiteur, le mandat, le bail ; filtrez aussi par statut ou montant.'
      ]
    },
    steps: [
      {
        title: 'Retirer une ligne',
        detail: 'Avant la production du fichier : « Retirer », motif facultatif, puis confirmez.'
      },
      {
        title: 'Constater un résultat',
        detail: 'Après la production du fichier : « Constater le règlement » ou « Constater le rejet » sur la ligne.'
      }
    ],
    consequences: [
      'Retirer une ligne est définitif ; si la remise est validée, le locataire a déjà son avis : prévenez-le. La dernière ligne ne se retire pas.',
      'Une ligne retirée libère son échéance pour une autre remise.',
      'Un règlement crée un encaissement et sa quittance ; un rejet tardif sur une ligne réglée les annule.'
    ],
    faq: [
      {
        q: 'Que veut dire « Plafonné » ?',
        a: "Le reste dû dépassait le plafond du mandat : seul le plafond est prélevé. Survolez l'étiquette pour le voir."
      },
      {
        q: 'Pourquoi le mandat porte-t-il une étiquette orange ?',
        a: "Il n'est plus actif depuis la préparation, mais le fichier contient encore ce prélèvement. Retirez la ligne si c'est encore possible."
      },
      { q: 'Où trouve-t-on le code de rejet ?', a: 'Sous le statut « Rejetée », avec le motif saisi.' }
    ],
    permissions: { feature: 'RENTAL', note: 'Les actions de ligne demandent « Gérer les prélèvements bancaires ».' },
    related: [
      { label: 'Constater un règlement ou un rejet', helpId: 'locatif.prelevements.retours.constats' },
      { label: 'Mandats de prélèvement', helpId: 'locatif.prelevements.mandats' }
    ],
    keywords: ['lignes', 'débiteur', 'locataire', 'mandat', 'plafonné', 'statut', 'retirer']
  },
  {
    id: 'locatif.prelevements.retours.constats',
    kind: 'section',
    title: 'Constater un règlement ou un rejet',
    summary:
      'Une fois le fichier produit, vous enregistrez ici le résultat de chaque prélèvement, à la main : règlement, rejet, rejet tardif ou « Tout constater réglé ».',
    purpose:
      "Le message « Retour de la banque : … » en haut de la remise donne les lignes en attente, réglées et rejetées avec leurs montants. L'état passe de « Retour de la banque attendu » à « Retour partiel » puis « Retour complet ».",
    steps: [
      {
        title: 'Choisir la ligne',
        detail: 'Dans le tableau, « Constater le règlement » ou « Constater le rejet ».'
      },
      {
        title: 'Choisir la date',
        detail:
          "Date de valeur ou date du rejet : entre la date de prélèvement et aujourd'hui. Aucun constat n'est possible avant la date de prélèvement."
      },
      {
        title: 'Pour un rejet : code et motif',
        detail:
          'Au moins un des deux est obligatoire. Code : lettres, chiffres, tiret, tiret bas, 20 caractères au plus ; motif : 500 caractères au plus.'
      },
      {
        title: 'Valider',
        detail:
          'Cliquez sur le bouton de la fenêtre. « Tout constater réglé » applique une même date à toutes les lignes en attente.'
      }
    ],
    consequences: [
      'Règlement : un encaissement est enregistré sur le bail et sa quittance est émise. La ligne passe à « Réglée ».',
      'Rejet : la ligne passe à « Rejetée ». Des frais de rejet peuvent être refacturés au locataire et le mandat suspendu après plusieurs rejets consécutifs, selon le créancier ; la fenêtre annonce les frais et la suspension. Le locataire reçoit un e-mail de rejet si cette notification est activée pour votre agence.',
      "Rejet tardif : sur une ligne déjà réglée, il annule l'encaissement et sa quittance.",
      "« Tout constater réglé » ne s'annule que par des rejets tardifs, ligne par ligne. Les lignes en échec sont listées dans le compte rendu."
    ],
    faq: [
      {
        q: 'Pourquoi le bouton de confirmation est-il grisé ?',
        a: "La date est hors des bornes ou, pour un rejet, ni code ni motif n'est saisi."
      },
      {
        q: 'Puis-je corriger une erreur ?',
        a: 'Un règlement se corrige par un rejet tardif. Un rejet ne se défait pas depuis cet écran.'
      },
      {
        q: 'Dois-je tout saisir à la main ?',
        a: "Non, l'import du fichier de la banque constate tout en une fois."
      }
    ],
    permissions: {
      feature: 'RENTAL',
      roles: ['Gestionnaire', 'Comptable'],
      note: 'Demande « Gérer les prélèvements bancaires ».'
    },
    related: [{ label: 'Importer un retour de la banque', helpId: 'locatif.prelevements.retours.import' }],
    keywords: ['constater', 'règlement', 'rejet', 'rejet tardif', 'quittance', 'encaissement', 'frais de rejet']
  },
  {
    id: 'locatif.prelevements.remise.annulation',
    kind: 'section',
    title: 'Annuler une remise',
    summary: "L'annulation abandonne la remise et toutes ses lignes ; elle est définitive. Un motif est obligatoire.",
    steps: [
      {
        title: 'Cliquer sur « Annuler la remise »',
        detail: 'Possible en Brouillon, Validée ou Fichier produit.'
      },
      {
        title: 'Lire le message',
        detail: "Il change selon l'avancement : rien n'est parti, avis déjà envoyés, ou fichier déjà produit."
      },
      { title: 'Saisir le motif', detail: '1 à 500 caractères, obligatoire.' },
      {
        title: 'Cocher la case si elle est demandée',
        detail:
          "Si le fichier est produit, cochez que vous avez vérifié qu'il n'est pas chargé à la banque, ou que vous l'y avez annulé."
      }
    ],
    consequences: [
      'Définitif : toutes les lignes sont annulées.',
      "Brouillon : rien n'est parti, les échéances redeviennent disponibles pour une autre remise.",
      "Validée : les locataires ont déjà reçu un avis ; prévenez-les que le prélèvement n'aura pas lieu.",
      'Fichier produit : si le fichier a été chargé à la banque, annulez aussi la remise chez elle, sinon les comptes seront débités et une nouvelle remise prélèverait une deuxième fois.'
    ],
    faq: [
      {
        q: 'Peut-on annuler après le dépôt à la banque ?',
        a: "Non : le bouton n'est plus proposé une fois la remise « Déposée à la banque »."
      },
      { q: 'Peut-on rouvrir une remise annulée ?', a: 'Non. Préparez une nouvelle remise.' },
      {
        q: 'Que faire pour écarter un seul locataire ?',
        a: "Utilisez « Retirer » sur sa ligne, tant que le fichier n'est pas produit."
      }
    ],
    permissions: { feature: 'RENTAL', note: 'Demande « Gérer les prélèvements bancaires ».' },
    related: [{ label: 'Lignes de la remise', helpId: 'locatif.prelevements.remise.lignes' }],
    keywords: ['annuler', 'annulation', 'motif', 'remise annulée']
  }
];

export default entries;
