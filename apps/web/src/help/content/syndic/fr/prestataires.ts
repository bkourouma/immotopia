import type { HelpEntry } from '../../../types';

/** Zone « prestataires » du module « syndic » (fr) : prestataires, contrats, factures de prestataires, profils des lots et incidents. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Prestataires
  {
    id: 'syndic.prestataires.liste',
    kind: 'page',
    title: 'Prestataires et contrats',
    summary:
      'Cet écran regroupe les entreprises qui travaillent pour la copropriété, leurs contrats de maintenance et leurs factures. Il se découpe en deux onglets : « Prestataires » et « Factures ».',
    purpose:
      "Les prestataires appartiennent à l'agence : un prestataire créé ici se retrouve dans toutes ses copropriétés. Les contrats et les factures, eux, ne concernent que la copropriété ouverte.",
    steps: [
      {
        title: 'Créer le prestataire',
        detail:
          'Onglet « Prestataires », bouton « Nouveau prestataire » : nom (obligatoire), spécialité, e-mail et téléphone.'
      },
      {
        title: 'Créer le contrat',
        detail:
          'Bouton « Nouveau contrat » : prestataire, nature du contrat, date de début, date de fin facultative, montant annuel.'
      },
      {
        title: 'Enregistrer une facture',
        detail: 'Onglet « Factures », bouton « Enregistrer une facture » : la dépense est inscrite en comptabilité.'
      },
      {
        title: 'Régler la facture',
        detail:
          'Cliquez sur « Ouvrir » à droite de la facture, puis « Enregistrer un paiement » en choisissant le fonds à débiter.'
      },
      {
        title: 'Suivre les soldes',
        detail: 'Le tableau « Soldes par prestataire » montre ce que la copropriété doit encore à chacun.'
      }
    ],
    consequences: [
      "Une facture enregistrée crée une écriture comptable dans la copropriété ; un paiement débite un fonds. Voir la fiche de l'onglet « Factures ».",
      "Supprimer un prestataire est définitif, et impossible s'il a un contrat ou un incident lié."
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas supprimer un prestataire ?',
        a: "Il a au moins un contrat ou un incident lié, dans cette copropriété ou une autre de l'agence. Ces liens doivent d'abord disparaître."
      },
      {
        q: 'Pourquoi « Nouveau contrat » refuse-t-il mon contrat ?',
        a: 'Un contrat de même nature est déjà actif avec ce prestataire sur la même période. Changez les dates ou la nature.'
      },
      {
        q: "Le prestataire n'est pas dans la liste du contrat, que faire ?",
        a: 'Dans le formulaire, cliquez sur « Pas de prestataire ? Créer un prestataire » : il est sélectionné dès sa création.'
      },
      {
        q: 'À quoi sert la carte « Actifs communs » ?',
        a: "Elle liste simplement, par leur nom, les équipements des parties communes de la copropriété. Elle n'a pas d'action."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété', 'Comptable'],
      note: 'Consulter demande le droit de consultation de la copropriété. Créer, modifier, supprimer, enregistrer une facture ou un paiement demandent le droit de modification de la copropriété.'
    },
    related: [
      { label: 'Prestataires', helpId: 'syndic.prestataires.tableau' },
      { label: 'Contrats de maintenance', helpId: 'syndic.prestataires.contrats' },
      { label: 'Factures des prestataires', helpId: 'syndic.prestataires.factures' },
      { label: 'Incidents et imputations', helpId: 'syndic.profils.incidents' }
    ],
    keywords: [
      'prestataire',
      'fournisseur',
      'entreprise',
      'contrat de maintenance',
      'facture fournisseur',
      'ascenseur',
      'nettoyage'
    ]
  },
  {
    id: 'syndic.prestataires.fiche',
    kind: 'section',
    title: 'Fiche d’un prestataire',
    summary:
      "La carte « Prestataires » liste les entreprises de l'agence et leur situation contractuelle avec cette copropriété. Vous y créez, modifiez ou supprimez un prestataire.",
    purpose:
      'Un prestataire est une fiche simple : nom, spécialité, e-mail, téléphone. Il sert ensuite pour les contrats, les incidents et les factures.',
    steps: [
      {
        title: 'Créer',
        detail:
          '« Nouveau prestataire », puis « Créer ». Le nom est obligatoire et doit être valide si vous saisissez un e-mail.'
      },
      { title: 'Modifier', detail: 'Bouton « Modifier » de la ligne, puis « Enregistrer ».' },
      { title: 'Supprimer', detail: 'Bouton « Supprimer » de la ligne, puis confirmation.' }
    ],
    consequences: [
      "Le nom est unique dans l'agence, sans tenir compte des majuscules ni des espaces autour : un doublon est refusé sous le champ « Nom ».",
      'La suppression est définitive. Elle est refusée si le prestataire a un contrat ou un incident lié.',
      "Aucun e-mail ni SMS n'est envoyé au prestataire."
    ],
    faq: [
      {
        q: 'Un prestataire créé ici apparaît-il dans les autres copropriétés ?',
        a: "Oui, la fiche appartient à l'agence. Seuls ses contrats, filtrés dans le tableau, dépendent de la copropriété ouverte."
      },
      {
        q: 'Puis-je renommer un prestataire déjà utilisé ?',
        a: 'Oui, avec « Modifier ». Les contrats et factures déjà liés suivent le nouveau nom.'
      },
      {
        q: 'Les boutons « Modifier » et « Supprimer » sont absents.',
        a: 'Ils demandent le droit de modification de la copropriété.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Créer, modifier et supprimer demandent le droit de modification de la copropriété.'
    },
    related: [{ label: 'Prestataires', helpId: 'syndic.prestataires.tableau' }],
    keywords: ['nouveau prestataire', 'modifier prestataire', 'supprimer prestataire', 'doublon', 'spécialité']
  },
  {
    id: 'syndic.prestataires.tableau',
    kind: 'table',
    title: 'Prestataires',
    summary:
      "Ce tableau liste les prestataires de l'agence, ceux qui ont un contrat actif avec cette copropriété en premier. La colonne « Contrats » ne compte que les contrats de cette copropriété.",
    howToRead: {
      columns: [
        {
          key: 'name',
          label: 'Prestataire',
          description: 'Nom et spécialité de la fiche, avec les initiales dans une pastille.'
        },
        {
          key: 'contact',
          label: 'Contact',
          description: 'Téléphone et e-mail cliquables. Un tiret si aucun n’est renseigné.'
        },
        {
          key: 'contracts',
          label: 'Contrats',
          description: 'Nombre de contrats actifs (« 1 actif », « 2 actifs ») et terminés, ou « Aucun contrat ».'
        },
        { key: 'actions', label: 'Actions', description: '« Modifier » et « Supprimer » (selon vos droits).' }
      ],
      notes: [
        "Filtres : « Contrat » (Contrat actif, Contrats terminés seulement, Aucun contrat) et « Spécialité ». La recherche porte sur le nom, la spécialité, le téléphone et l'e-mail."
      ]
    },
    consequences: [
      'Supprimer une ligne est définitif et refusé si le prestataire a des contrats ou des incidents liés.'
    ],
    faq: [
      { q: "Où voir le détail d'un contrat ?", a: 'Dans la carte « Contrats de maintenance », juste en dessous.' },
      {
        q: 'Que veut dire « Aucun contrat » ?',
        a: "Le prestataire n'a aucun contrat avec cette copropriété. Il peut en avoir ailleurs dans l'agence."
      },
      {
        q: 'Peut-on exporter la liste ?',
        a: "Oui, avec l'export du tableau : il reprend toutes les lignes correspondant à votre recherche."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: "Les boutons d'action demandent le droit de modification de la copropriété."
    },
    related: [{ label: 'Fiche d’un prestataire', helpId: 'syndic.prestataires.fiche' }],
    keywords: ['liste des prestataires', 'contact', 'téléphone', 'spécialité']
  },
  {
    id: 'syndic.prestataires.contrats',
    kind: 'table',
    title: 'Contrats de maintenance',
    summary:
      'Ce tableau liste les contrats de maintenance de la copropriété. Dépliez une ligne pour voir les factures rattachées au contrat.',
    purpose:
      'Un contrat relie un prestataire à la copropriété pour une prestation précise (nettoyage, ascenseur, sécurité…), avec ses dates et un montant annuel.',
    howToRead: {
      columns: [
        { key: 'provider', label: 'Prestataire', description: "L'entreprise liée au contrat." },
        {
          key: 'nature',
          label: 'Nature',
          description: 'Objet du contrat, par exemple « Nettoyage parties communes ».'
        },
        { key: 'startDate', label: 'Début', description: 'Date de début du contrat.' },
        {
          key: 'endDate',
          label: 'Fin',
          description:
            "Date de fin, ou « Sans fin ». Elle s'affiche en orange quand elle tombe dans moins de 45 jours ou qu'elle est passée."
        },
        { key: 'annualAmount', label: 'Montant annuel', description: 'Montant par an en FCFA, ou « Non renseigné ».' },
        { key: 'status', label: 'Statut', description: 'État du contrat (voir ci-dessous).' }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: 'Contrat en cours.' },
        { value: 'EXPIRED', label: 'Expiré', description: 'La durée du contrat est dépassée.' },
        { value: 'TERMINATED', label: 'Résilié', description: 'Contrat arrêté avant son terme.' }
      ],
      notes: [
        'Filtres : statut, prestataire, dates de début et de fin, montant annuel. La recherche porte sur le prestataire et la nature.'
      ]
    },
    steps: [
      { title: 'Ouvrir le formulaire', detail: "Bouton « Nouveau contrat » en haut de l'écran." },
      { title: 'Choisir le prestataire', detail: 'Ou « Pas de prestataire ? Créer un prestataire ».' },
      {
        title: 'Décrire le contrat',
        detail:
          '« Nature du contrat » et « Date de début » sont obligatoires ; « Date de fin » et « Montant annuel » sont facultatifs.'
      },
      {
        title: 'Régler l’alerte',
        detail: '« Alerte renouvellement (jours) » vaut 30 par défaut. La devise est « XOF », soit le FCFA.'
      },
      { title: 'Créer', detail: 'Bouton « Créer ».' }
    ],
    consequences: [
      'Un contrat de même nature, actif avec le même prestataire sur une période qui se chevauche, est refusé.',
      'Ce tableau ne permet ni de modifier ni de résilier un contrat.'
    ],
    faq: [
      {
        q: "Comment voir les factures d'un contrat ?",
        a: 'Cliquez sur la flèche au début de la ligne : la liste « Factures liées » apparaît.'
      },
      {
        q: 'Le contrat est-il rattaché à un budget ?',
        a: "Pas depuis ce formulaire. À l'enregistrement d'une facture, le poste de budget peut être déduit du contrat s'il en existe un seul."
      },
      {
        q: 'Que fait « Alerte renouvellement (jours) » ?',
        a: "Elle conserve le délai saisi sur le contrat. Cet écran n'envoie aucun rappel."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Créer un contrat demande le droit de modification de la copropriété.' },
    related: [
      { label: 'Factures liées', helpId: 'syndic.prestataires.factures-liees' },
      { label: 'Fiche d’un prestataire', helpId: 'syndic.prestataires.fiche' }
    ],
    keywords: ['contrat', 'maintenance', 'renouvellement', 'résiliation', 'abonnement', 'nature du contrat']
  },
  {
    id: 'syndic.prestataires.factures-liees',
    kind: 'table',
    title: 'Factures liées',
    summary:
      "Ce sous-tableau montre les factures de prestataires rattachées à un contrat ou à un incident, dans la ligne dépliée. « Ouvrir » affiche le même détail que l'onglet « Factures ».",
    howToRead: {
      columns: [
        { key: 'number', label: 'Numéro', description: 'Numéro de la facture, tel que saisi.' },
        { key: 'label', label: 'Libellé', description: 'Objet de la facture.' },
        { key: 'invoiceDate', label: 'Date', description: 'Date de la facture.' },
        { key: 'amountTTC', label: 'Montant TTC', description: 'Montant toutes taxes comprises.' },
        { key: 'amountDue', label: 'Reste dû', description: 'Ce qui reste à payer.' },
        { key: 'status', label: 'Statut', description: 'Enregistrée, Partiellement payée, Payée ou Annulée.' },
        { key: 'actions', label: 'Actions', description: '« Ouvrir » affiche le détail de la facture.' }
      ],
      notes: [
        'La liste est limitée aux 50 factures les plus récentes, cinq par page. Sans facture : « Aucune facture liée ».'
      ]
    },
    consequences: [
      "Une facture se rattache à un contrat ou à un incident à son enregistrement, depuis l'onglet « Factures »."
    ],
    faq: [
      {
        q: "Pourquoi ma facture n'apparaît-elle pas ?",
        a: 'Elle a été enregistrée sans choisir ce contrat ou cet incident. Ce tableau ne permet pas de la rattacher après coup.'
      },
      {
        q: 'Puis-je payer depuis ici ?',
        a: 'Oui : « Ouvrir », puis « Enregistrer un paiement » dans le détail de la facture.'
      },
      {
        q: 'Que se passe-t-il quand je paie ou annule une facture depuis « Ouvrir » ?',
        a: 'La liste se recharge toute seule : le « Reste dû » et le « Statut » de la ligne sont mis à jour.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Ouvrir demande le droit de consultation ; payer ou annuler demande le droit de modification de la copropriété.'
    },
    related: [{ label: 'Détail d’une facture', helpId: 'syndic.prestataires.facture-detail' }],
    keywords: ['factures du contrat', 'factures de l’incident', 'rattachées']
  },
  // ------------------------------------------------------------------ Factures
  {
    id: 'syndic.prestataires.factures',
    kind: 'section',
    title: 'Factures des prestataires',
    summary:
      'Cet onglet enregistre les factures reçues des prestataires et leurs paiements, et montre ce que la copropriété doit à chacun. Il se compose de deux tableaux : les soldes, puis les factures.',
    purpose:
      'Chaque facture est inscrite dans la comptabilité de la copropriété. Le paiement est pris sur un fonds de la copropriété (fonds de roulement, de réserve, de travaux…).',
    steps: [
      { title: 'Enregistrer', detail: 'Bouton « Enregistrer une facture » : voir la fiche du formulaire.' },
      {
        title: 'Rechercher',
        detail: 'Recherchez par numéro, libellé ou prestataire, puis filtrez par statut, date, contrat ou incident.'
      },
      { title: 'Ouvrir', detail: '« Ouvrir » affiche le détail : informations, pièce jointe, paiements.' },
      { title: 'Payer', detail: 'Dans le détail, « Enregistrer un paiement » : un paiement partiel est possible.' },
      { title: 'Annuler', detail: '« Annuler la facture » avec un motif, après avoir annulé ses paiements.' }
    ],
    consequences: [
      "L'enregistrement débite un compte de charge et crédite le compte du prestataire, dans la copropriété. La TVA est comptée dans la charge : une copropriété ne la récupère pas.",
      'Si la facture est rattachée à un poste de budget, le montant réalisé de ce poste augmente du montant TTC.',
      "Un paiement débite le fonds choisi et solde d'autant la dette envers le prestataire.",
      "Aucun e-mail ni SMS n'est envoyé au prestataire."
    ],
    faq: [
      {
        q: 'Comment corriger un montant ?',
        a: 'Depuis cet écran, une facture ne se modifie pas. Annulez-la (sans paiement actif), puis enregistrez-la à nouveau : un numéro annulé peut être réutilisé.'
      },
      {
        q: "Pourquoi l'enregistrement est-il refusé ?",
        a: 'Cas fréquents : numéro déjà utilisé par ce prestataire, exercice comptable clos à cette date, ou TTC nul. Le message précise la cause.'
      },
      { q: 'Les montants sont-ils en FCFA ?', a: 'Oui, par défaut. La devise « XOF » correspond au FCFA.' }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété', 'Comptable'],
      note: 'Consulter demande le droit de consultation de la copropriété. Enregistrer, payer, annuler et gérer la pièce jointe demandent le droit de modification de la copropriété.'
    },
    related: [
      { label: 'Enregistrer une facture', helpId: 'syndic.prestataires.facture-nouvelle' },
      { label: 'Soldes par prestataire', helpId: 'syndic.prestataires.soldes' },
      { label: 'Factures des prestataires', helpId: 'syndic.prestataires.factures-liste' },
      { label: 'Détail d’une facture', helpId: 'syndic.prestataires.facture-detail' }
    ],
    keywords: ['facture', 'fournisseur', 'paiement fournisseur', 'dette', 'charges', 'travaux', 'comptabilité']
  },
  {
    id: 'syndic.prestataires.soldes',
    kind: 'table',
    title: 'Soldes par prestataire',
    summary:
      "Ce tableau totalise, pour chaque prestataire facturé, ce qui a été facturé, payé et ce qui reste dû. Les factures annulées n'y sont pas comptées.",
    howToRead: {
      columns: [
        { key: 'providerName', label: 'Prestataire', description: 'Le prestataire facturé.' },
        { key: 'invoicesCount', label: 'Factures', description: 'Nombre de factures non annulées.' },
        { key: 'totalInvoiced', label: 'Total facturé', description: 'Somme des montants TTC.' },
        { key: 'totalPaid', label: 'Total payé', description: 'Somme des paiements non annulés.' },
        { key: 'totalDue', label: 'Reste dû', description: 'Total facturé moins total payé.' },
        {
          key: 'overdueDue',
          label: 'Dont en retard',
          description:
            "Part du reste dû dont l'échéance est dépassée, en rouge si elle n'est pas nulle. Une facture sans échéance n'est jamais en retard."
        }
      ],
      notes: [
        'Tri : le plus gros reste dû en premier. Filtres : « Reste dû » (montant) et « Avec retard ». Sans facture : « Aucune facture enregistrée ».'
      ]
    },
    faq: [
      {
        q: "Pourquoi un prestataire n'apparaît-il pas ?",
        a: "Un prestataire n'a une ligne que s'il a au moins une facture non annulée dans cette copropriété."
      },
      {
        q: 'Le tableau se met-il à jour après un paiement ?',
        a: 'Oui, après chaque facture ou paiement enregistré ou annulé.'
      },
      {
        q: 'Comment retrouver un prestataire dans ce tableau ?',
        a: 'Tapez son nom dans le champ « Rechercher », ou filtrez par « Reste dû » et « Avec retard ».'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Consulter demande le droit de consultation de la copropriété.' },
    related: [{ label: 'Factures des prestataires', helpId: 'syndic.prestataires.factures-liste' }],
    keywords: ['solde', 'dette', 'reste dû', 'retard', 'échéance dépassée']
  },
  {
    id: 'syndic.prestataires.factures-liste',
    kind: 'table',
    title: 'Factures des prestataires',
    summary:
      'Ce tableau liste les factures de prestataires de la copropriété, avec ce qui a été payé et ce qui reste dû. « Ouvrir » affiche le détail pour payer ou annuler.',
    howToRead: {
      columns: [
        { key: 'number', label: 'Numéro', description: 'Numéro de la facture du prestataire.' },
        { key: 'provider', label: 'Prestataire', description: "L'entreprise qui a facturé." },
        { key: 'label', label: 'Libellé', description: 'Objet de la facture.' },
        { key: 'invoiceDate', label: 'Date de facture', description: 'Date portée sur la facture.' },
        { key: 'amountTTC', label: 'Montant TTC', description: 'Montant hors taxe plus TVA.' },
        { key: 'amountPaid', label: 'Payé', description: 'Total des paiements non annulés.' },
        { key: 'amountDue', label: 'Reste dû', description: 'Montant TTC moins payé.' },
        {
          key: 'hasFile',
          label: 'Pièce',
          description: '« Jointe » si un scan ou une photo est rattaché, sinon « Aucune ».'
        },
        { key: 'status', label: 'Statut', description: 'État de la facture (voir ci-dessous).' },
        { key: 'actions', label: 'Actions', description: '« Ouvrir » affiche le détail.' }
      ],
      statuses: [
        { value: 'RECORDED', label: 'Enregistrée', description: 'Inscrite en comptabilité, aucun paiement actif.' },
        {
          value: 'PARTIALLY_PAID',
          label: 'Partiellement payée',
          description: 'Une partie du TTC est payée, il reste un solde.'
        },
        { value: 'PAID', label: 'Payée', description: 'Le TTC est entièrement payé.' },
        {
          value: 'CANCELLED',
          label: 'Annulée',
          description: "Annulée avec un motif ; l'écriture comptable est contre-passée. Définitif."
        }
      ],
      notes: [
        'Filtres : prestataire, statut, date de facture, contrat, incident. La recherche porte sur le numéro, le libellé et le prestataire.'
      ]
    },
    faq: [
      {
        q: "Peut-on filtrer les factures d'un incident ?",
        a: "Oui, avec le filtre « Incident ». Vous les voyez aussi en dépliant l'incident dans « Profils et incidents »."
      },
      {
        q: "L'export contient-il tout ?",
        a: 'Oui : toutes les factures qui répondent à vos filtres, pas seulement la page affichée.'
      },
      {
        q: "Comment retrouver les factures d'une période ?",
        a: 'Utilisez le filtre « Date de facture » pour choisir une plage de dates. Vous pouvez le combiner avec « Prestataire » et « Statut ».'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Consulter demande le droit de consultation de la copropriété.' },
    related: [
      { label: 'Détail d’une facture', helpId: 'syndic.prestataires.facture-detail' },
      { label: 'Enregistrer une facture', helpId: 'syndic.prestataires.facture-nouvelle' }
    ],
    keywords: ['liste des factures', 'facture payée', 'facture annulée', 'pièce jointe']
  },
  {
    id: 'syndic.prestataires.facture-nouvelle',
    kind: 'section',
    title: 'Enregistrer une facture',
    summary:
      'Ce formulaire inscrit une facture de prestataire en comptabilité. Le montant TTC est calculé : montant HT plus TVA.',
    purpose:
      'Il rattache la dépense à un prestataire et, si vous le souhaitez, à un contrat, un incident, un poste de budget et un fonds.',
    steps: [
      { title: 'Prestataire', detail: 'Choisissez-le. Si vous liez un contrat, il doit être celui de ce prestataire.' },
      {
        title: 'Rattachements',
        detail:
          '« Contrat », « Incident », « Ligne budgétaire » et « Fonds débité par défaut » sont facultatifs. Sans choix, la ligne budgétaire est déduite du contrat si un seul poste lui est lié.'
      },
      {
        title: 'Nature de la dépense',
        detail: "« Charges courantes » (par défaut) ou « Travaux » : le compte de charge utilisé n'est pas le même."
      },
      {
        title: 'Facture',
        detail:
          '« Numéro de facture », « Libellé » et « Date de facture » sont obligatoires ; « Échéance » est facultative et ne peut pas précéder la date de facture.'
      },
      {
        title: 'Montants',
        detail:
          'Saisissez « Montant HT » et « TVA » : « Montant TTC (calculé) » se met à jour. Le HT doit être supérieur à zéro.'
      },
      { title: 'Pièce jointe', detail: '« Choisir un fichier » : PDF, PNG ou JPEG de 10 Mo au plus. Facultatif.' },
      { title: 'Valider', detail: 'Bouton « Enregistrer ».' }
    ],
    consequences: [
      'Une écriture est passée à la date de la facture : charge au débit, compte du prestataire au crédit.',
      "Refusé si la date tombe dans un exercice clos, si le numéro existe déjà chez ce prestataire (facture annulée exceptée) ou si la date dépasse d'un an la date du jour.",
      'Avec un incident choisi : si cet incident porte une seule imputation « Budget syndic » sans écriture, elle est reliée à la facture. Sinon un message vous le signale ; la facture est quand même enregistrée.'
    ],
    faq: [
      {
        q: 'Faut-il choisir un fonds maintenant ?',
        a: 'Non, le champ « Fonds débité par défaut » est facultatif : vous le choisirez au moment du paiement.'
      },
      {
        q: 'La TVA est-elle récupérée ?',
        a: 'Non. La copropriété ne la récupère pas : la charge enregistrée est le montant TTC.'
      },
      {
        q: 'Que signifie la devise ?',
        a: '« XOF » est le code du FCFA. Si vous choisissez un fonds, il doit avoir la même devise que la facture.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Enregistrer une facture demande le droit de modification de la copropriété.'
    },
    related: [{ label: 'Factures des prestataires', helpId: 'syndic.prestataires.factures' }],
    keywords: [
      'nouvelle facture',
      'saisir une facture',
      'montant hors taxe',
      'TVA',
      'TTC',
      'charges courantes',
      'travaux'
    ]
  },
  {
    id: 'syndic.prestataires.facture-detail',
    kind: 'section',
    title: 'Détail d’une facture',
    summary:
      "Le tiroir d'une facture montre ses informations, sa pièce jointe et ses paiements. Vous y payez la facture, joignez la pièce ou annulez la facture.",
    steps: [
      {
        title: 'Lire la facture',
        detail:
          'Prestataire, libellé, contrat, incident, ligne budgétaire, fonds par défaut, dates, montants HT, TVA, TTC, payé et reste dû.'
      },
      {
        title: 'Joindre la pièce',
        detail: '« Ajouter une pièce jointe », puis « Télécharger », « Remplacer » ou « Supprimer ».'
      },
      { title: 'Payer', detail: '« Enregistrer un paiement » : voir la fiche des paiements.' },
      {
        title: 'Annuler la facture',
        detail: '« Annuler la facture », saisissez le motif (obligatoire), puis « Confirmer l’annulation ».'
      }
    ],
    consequences: [
      "Annuler une facture est définitif : elle ne peut plus être payée. Les paiements actifs doivent d'abord être annulés.",
      "L'annulation passe une contre-écriture datée d'aujourd'hui, retire le montant du réalisé du poste de budget et libère l'imputation d'incident liée.",
      "La pièce jointe ne peut plus être supprimée dès qu'un paiement a été enregistré (facture « Partiellement payée » ou « Payée »)."
    ],
    faq: [
      {
        q: 'Pourquoi « Annuler la facture » est-il refusé ?',
        a: "La facture a encore des paiements non annulés. Annulez-les d'abord, ou l'exercice comptable est clos à la date du jour."
      },
      {
        q: 'Quels fichiers puis-je joindre ?',
        a: 'PDF, PNG ou JPEG, 10 Mo au plus. Le type réel du fichier est vérifié.'
      },
      { q: 'Le bouton de paiement a disparu.', a: "La facture est annulée ou n'a plus de reste dû." }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Télécharger la pièce demande le droit de consultation ; le reste demande le droit de modification de la copropriété.'
    },
    related: [{ label: 'Paiements d’une facture', helpId: 'syndic.prestataires.facture-paiements' }],
    keywords: ['annuler facture', 'pièce jointe', 'télécharger', 'motif', 'contre-écriture']
  },
  {
    id: 'syndic.prestataires.facture-paiements',
    kind: 'table',
    title: 'Paiements d’une facture',
    summary:
      'Ce tableau liste les paiements faits sur une facture. « Enregistrer un paiement » en ajoute un ; « Annuler » en défait un avec un motif.',
    howToRead: {
      columns: [
        { key: 'paidAt', label: 'Date', description: 'Date du paiement.' },
        { key: 'amount', label: 'Montant', description: 'Montant payé.' },
        {
          key: 'method',
          label: 'Mode',
          description: 'Mobile money, Virement bancaire, Espèces, Chèque, Carte ou Autre.'
        },
        { key: 'reference', label: 'Référence', description: 'Numéro de transaction ou de chèque, si saisi.' },
        { key: 'fund', label: 'Fonds', description: 'Le fonds qui a été débité.' },
        { key: 'status', label: 'Statut', description: '« Actif » ou « Annulé ».' },
        { key: 'actions', label: 'Actions', description: '« Annuler » sur un paiement actif.' }
      ]
    },
    steps: [
      {
        title: 'Ouvrir le formulaire',
        detail: '« Enregistrer un paiement » : il vous propose le reste dû, la date du jour et « Virement bancaire ».'
      },
      {
        title: 'Renseigner',
        detail: '« Montant », « Date de paiement » et « Mode » sont obligatoires ; « Référence » est facultative.'
      },
      {
        title: 'Choisir le fonds',
        detail:
          '« Fonds à débiter » : sans choix, le fonds par défaut de la facture est utilisé. Sans fonds du tout, le paiement est refusé.'
      },
      { title: 'Valider', detail: 'Bouton « Enregistrer ».' }
    ],
    consequences: [
      "Le fonds est débité et un mouvement de fonds le trace ; l'écriture comptable débite le compte du prestataire et crédite la banque.",
      "Si le solde du fonds devient négatif, un avertissement s'affiche mais le paiement est enregistré.",
      "Refusé si le montant dépasse le reste dû, si la date précède celle de la facture, ou si le fonds n'a pas la devise de la facture.",
      'Annuler un paiement (motif obligatoire) recrédite le fonds, passe une contre-écriture et recalcule le statut de la facture.'
    ],
    faq: [
      {
        q: 'Puis-je payer en plusieurs fois ?',
        a: 'Oui. La facture passe à « Partiellement payée », puis à « Payée » quand le total est atteint.'
      },
      {
        q: 'Le prestataire reçoit-il une confirmation ?',
        a: "Non, aucun message n'est envoyé : l'écran enregistre seulement le paiement."
      },
      {
        q: 'Comment annuler un paiement saisi par erreur ?',
        a: 'Sur la ligne du paiement actif, cliquez sur « Annuler », saisissez le motif (obligatoire), puis validez. La ligne passe à « Annulé » et reste visible dans le tableau.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Enregistrer ou annuler un paiement demande le droit de modification de la copropriété.'
    },
    related: [{ label: 'Détail d’une facture', helpId: 'syndic.prestataires.facture-detail' }],
    keywords: [
      'paiement partiel',
      'payer une facture',
      'annuler un paiement',
      'fonds débité',
      'mobile money',
      'virement'
    ]
  },
  // ------------------------------------------------------------------ Profils et incidents
  {
    id: 'syndic.profils.liste',
    kind: 'page',
    title: 'Profils lot et incidents',
    summary:
      'Cet écran rattache à chaque lot son propriétaire et son locataire, et suit les incidents de la copropriété. Il se découpe en trois onglets : « Profils propriétaires », « Profils locataires » et « Incidents et imputations ».',
    purpose:
      "Un profil dit qui détient ou occupe un lot, depuis quand et pour quelle part. Un incident garde la trace d'une panne ou d'un sinistre, du signalement à la clôture.",
    steps: [
      {
        title: 'Créer un profil propriétaire',
        detail: 'Bouton « Profil propriétaire » : lot, contact, part en pourcentage, date de début.'
      },
      { title: 'Créer un profil locataire', detail: "Bouton « Profil locataire » : lot, contact, date d'entrée." },
      {
        title: 'Signaler un incident',
        detail: 'Bouton « Nouvel incident » : contact déclarant, type, urgence, description.'
      },
      {
        title: 'Faire avancer l’incident',
        detail: "Onglet « Incidents et imputations », « Modifier l'incident » : statut, prestataire, description."
      }
    ],
    consequences: [
      "Aucun e-mail, SMS ni WhatsApp n'est envoyé en créant un profil ou un incident.",
      'Seule « Inviter au portail » envoie un e-mail, au copropriétaire concerné.'
    ],
    faq: [
      {
        q: "Le contact n'est pas dans la liste, que faire ?",
        a: 'Dans le formulaire, vous pouvez créer le contact à la volée : il est sélectionné aussitôt.'
      },
      {
        q: "Les trois boutons du haut changent-ils d'onglet ?",
        a: "Non, ils ouvrent un formulaire. L'onglet affiché ne change pas."
      },
      {
        q: "Où est mémorisé l'onglet ?",
        a: "Dans l'adresse de la page : vous pouvez partager le lien d'un onglet précis."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété'],
      note: 'Consulter demande le droit de consultation de la copropriété. Créer, modifier, inviter au portail et signaler demandent le droit de modification de la copropriété.'
    },
    related: [
      { label: 'Profils propriétaires', helpId: 'syndic.profils.proprietaires' },
      { label: 'Profils locataires', helpId: 'syndic.profils.locataires' },
      { label: 'Incidents et imputations', helpId: 'syndic.profils.incidents' },
      { label: 'Prestataires et contrats', helpId: 'syndic.prestataires.liste' }
    ],
    keywords: ['propriétaire', 'locataire', 'copropriétaire', 'profil', 'incident', 'panne', 'sinistre', 'quote-part']
  },
  {
    id: 'syndic.profils.proprietaires',
    kind: 'table',
    title: 'Profils propriétaires',
    summary:
      "Ce tableau liste, lot par lot, les propriétaires actuels et anciens, avec leur part. Vous y créez un profil et ouvrez ou fermez l'accès au portail copropriétaire.",
    purpose:
      "Les parts des propriétaires d'un même lot ne dépassent jamais 100 %. Le propriétaire du lot suit ses profils actuels.",
    howToRead: {
      columns: [
        { key: 'lot', label: 'Lot', description: 'Le lot, avec son numéro.' },
        { key: 'contact', label: 'Contact', description: "Le propriétaire (fiche contact de l'agence)." },
        { key: 'ownershipPercentage', label: 'Part (%)', description: 'Part de propriété du lot, en pourcentage.' },
        { key: 'ownedSince', label: 'Depuis', description: "Date d'acquisition." },
        { key: 'situation', label: 'Statut', description: '« Actuel » ou « Ancien ».' },
        {
          key: 'portalAccessEnabled',
          label: 'Portail',
          description: '« Actif » si l’accès au portail est ouvert pour ce profil, sinon « Inactif ».'
        },
        {
          key: 'portal-actions',
          label: 'Accès portail',
          description: '« Inviter au portail » et, si l’accès est actif, « Révoquer l’accès ».'
        }
      ],
      statuses: [
        { value: 'current', label: 'Actuel', description: 'Profil actif dont la fin est vide ou à venir.' },
        { value: 'former', label: 'Ancien', description: 'Profil clos ou désactivé.' }
      ],
      notes: [
        "Le bandeau « Quotes-parts incomplètes » liste les lots dont les parts actuelles totalisent moins de 100 %, par exemple « Lot A12 : 50 % attribués ». Un lot sans aucun profil n'y figure pas.",
        'Filtres : lot, statut, accès au portail, quote-part incomplète.'
      ]
    },
    steps: [
      { title: 'Ouvrir le formulaire', detail: "Bouton « Profil propriétaire » en haut de l'écran." },
      { title: 'Lot et contact', detail: 'Choisissez le lot et le contact propriétaire, ou créez le contact.' },
      {
        title: 'Part et date',
        detail: '« Part de propriété (%) » vaut 100 par défaut ; « Date de début » est obligatoire.'
      },
      {
        title: 'Portail',
        detail: "« Activer accès portail » : Oui ou Non (Non par défaut). Cela marque le profil sans envoyer d'e-mail."
      },
      {
        title: 'Revente ou indivision',
        detail:
          "Si le lot a déjà un propriétaire, choisissez « Revente : clôturer l'ancien propriétaire à la date d'acquisition » ou « Indivision : ils sont propriétaires ensemble »."
      },
      {
        title: 'Inviter au portail',
        detail:
          "« Inviter au portail » sur la ligne : l'invitation part par e-mail et le lien s'affiche pour le copier."
      }
    ],
    consequences: [
      "Revente : les profils des anciens propriétaires reçoivent une date de fin égale à la date d'acquisition. Indivision : ils restent, et le total des parts ne peut pas dépasser 100 %.",
      'Refusé si ce contact est déjà propriétaire du lot (modifiez son profil) ou si les parts dépassent 100 %.',
      "« Inviter au portail » demande une adresse e-mail valide sur la fiche contact. Le compte est créé au besoin ; l'e-mail est envoyé si la messagerie est configurée. L'accès est personnel : il ouvre tous les lots du contact dans l'agence. Le lien d'activation d'un nouveau compte dure 7 jours.",
      "« Révoquer l’accès » ferme l'accès pour tous les lots du contact dans l'agence, tout de suite, sans supprimer son compte."
    ],
    faq: [
      {
        q: 'Pourquoi « Inviter au portail » est-il grisé ?',
        a: "Le profil n'est plus actif : on ne peut inviter que le propriétaire d'un profil actif."
      },
      {
        q: "Pourquoi l'invitation est-elle refusée ?",
        a: "Le contact n'a pas d'adresse e-mail valide. Complétez sa fiche, puis recommencez."
      },
      {
        q: "L'e-mail n'est pas parti, que faire ?",
        a: 'Copiez le lien affiché dans la fenêtre et transmettez-le vous-même au copropriétaire.'
      },
      {
        q: 'Peut-on modifier un profil depuis cet écran ?',
        a: "Pas depuis ce tableau : il permet de créer un profil, d'inviter et de révoquer l'accès."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Créer un profil, inviter et révoquer demandent le droit de modification de la copropriété.'
    },
    related: [
      { label: 'Profils locataires', helpId: 'syndic.profils.locataires' },
      { label: 'Compte d’un lot', to: '/tenant/:tenantId/syndics' }
    ],
    keywords: [
      'propriétaire',
      'copropriétaire',
      'quote-part',
      'indivision',
      'revente',
      'portail',
      'invitation',
      'part de propriété'
    ]
  },
  {
    id: 'syndic.profils.locataires',
    kind: 'table',
    title: 'Profils locataires',
    summary:
      'Ce tableau liste les locataires des lots de la copropriété, actuels et terminés. Vous y créez un profil et y mettez fin à un profil actuel.',
    purpose:
      'Le profil locataire est une fiche de suivi : qui occupe le lot, depuis quand, et si les charges lui sont facturées.',
    howToRead: {
      columns: [
        { key: 'lot', label: 'Lot', description: 'Le lot occupé.' },
        { key: 'contact', label: 'Contact', description: 'Le locataire (fiche contact de l’agence).' },
        { key: 'tenantSince', label: 'Depuis', description: "Date d'entrée." },
        {
          key: 'chargesBilledToTenant',
          label: 'Facture au locataire',
          description: '« Oui » ou « Non » : les charges sont-elles facturées au locataire.'
        },
        { key: 'status', label: 'Statut', description: '« Actuel » ou « Terminé ».' },
        { key: 'tenant-actions', label: 'Actions', description: '« Terminer » sur un profil actuel.' }
      ],
      statuses: [
        { value: 'current', label: 'Actuel', description: 'Profil dont la date de sortie est vide ou à venir.' },
        { value: 'former', label: 'Terminé', description: 'Le locataire est parti ; la ligne reste dans l’historique.' }
      ],
      notes: ['Filtres : lot, statut, « Facture au locataire ».']
    },
    steps: [
      { title: 'Ouvrir le formulaire', detail: "Bouton « Profil locataire » en haut de l'écran." },
      { title: 'Renseigner', detail: "Lot, « Contact locataire » et « Date d'entrée » sont obligatoires." },
      { title: 'Charges', detail: '« Charges facturées au locataire » : Oui ou Non (Non par défaut).' },
      {
        title: 'Terminer un profil',
        detail: "« Terminer » puis confirmez : la date de sortie est celle d'aujourd'hui."
      }
    ],
    consequences: [
      "« Terminer » fixe la sortie à la date du jour et passe le profil en « Terminé » ; l'historique est conservé.",
      "Ce profil est une fiche de suivi : il n'envoie aucun message."
    ],
    faq: [
      {
        q: "Puis-je corriger une date d'entrée ?",
        a: 'Pas depuis cet écran : seuls la création et « Terminer » sont proposés.'
      },
      {
        q: 'Le profil est-il lié à un bail ?',
        a: 'Ce formulaire ne demande pas de bail. Les baux se gèrent dans le module de gestion locative.'
      },
      {
        q: 'Comment retrouver un locataire ?',
        a: 'Tapez son nom, son e-mail, son téléphone ou son lot dans « Rechercher », ou filtrez par « Lot », « Statut » et « Facture au locataire ».'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Créer et terminer demandent le droit de modification de la copropriété.' },
    related: [{ label: 'Profils propriétaires', helpId: 'syndic.profils.proprietaires' }],
    keywords: ['locataire', 'occupant', 'date d’entrée', 'date de sortie', 'terminer', 'charges locatives']
  },
  {
    id: 'syndic.profils.incidents',
    kind: 'table',
    title: 'Incidents et imputations',
    summary:
      'Ce tableau suit les incidents de la copropriété, du signalement à la clôture. Dépliez une ligne pour voir ses imputations et ses factures liées.',
    purpose:
      'Un incident (panne, fuite, vandalisme…) peut avoir un prestataire assigné, des imputations de coût et des factures de prestataires rattachées.',
    howToRead: {
      columns: [
        { key: 'lot', label: 'Lot', description: 'Numéro du lot concerné, ou un tiret pour les parties communes.' },
        { key: 'incidentType', label: 'Type', description: 'Panne, Fuite, Vandalisme, Sécurité ou Autre.' },
        { key: 'urgency', label: 'Urgence', description: 'Basse, Moyenne, Haute ou Critique.' },
        { key: 'description', label: 'Description', description: "Ce qui s'est passé." },
        { key: 'reportedAt', label: 'Signalé le', description: 'Date du signalement.' },
        { key: 'status', label: 'Statut', description: "État de l'incident (voir ci-dessous)." },
        { key: 'imputations', label: 'Imputations', description: "Nombre d'imputations de coût enregistrées." },
        {
          key: 'providerId',
          label: 'Prestataire',
          description: "Liste pour assigner ou retirer le prestataire : l'enregistrement est immédiat."
        },
        { key: 'actions', label: 'Actions', description: "« Modifier l'incident » et « Ajouter imputation »." }
      ],
      statuses: [
        { value: 'REPORTED', label: 'Signalé', description: 'Incident déclaré, pas encore pris en charge.' },
        { value: 'ASSIGNED', label: 'Assigné', description: 'Confié à quelqu’un.' },
        { value: 'IN_PROGRESS', label: 'En cours', description: 'Traitement en cours.' },
        { value: 'RESOLVED', label: 'Résolu', description: 'Problème réglé.' },
        { value: 'CLOSED', label: 'Clôturé', description: 'Dossier fermé.' }
      ],
      notes: [
        'Filtres : statut, urgence, prestataire, type, lot, date de signalement, avec ou sans imputation. La recherche porte aussi sur la description et le lot.'
      ]
    },
    steps: [
      {
        title: 'Signaler',
        detail:
          'Bouton « Nouvel incident » : « Contact déclarant », « Type incident », « Urgence » et « Description » sont obligatoires ; « Lot (optionnel) » vide pour les parties communes.'
      },
      { title: 'Assigner un prestataire', detail: 'Choisissez-le dans la colonne « Prestataire ».' },
      {
        title: 'Faire avancer',
        detail: "« Modifier l'incident » : changez le statut, le prestataire ou la description, puis « Enregistrer »."
      },
      { title: 'Imputer un coût', detail: '« Ajouter imputation » : voir la fiche des imputations.' }
    ],
    consequences: [
      "Le statut ne change jamais tout seul : assigner un prestataire laisse l'incident « Signalé » tant que vous ne le modifiez pas.",
      "Passer à « Résolu » ou « Clôturé » affiche « Date de résolution » ; vide, c'est la date du jour.",
      "Aucun e-mail, SMS ou WhatsApp n'est envoyé au déclarant, au prestataire ou aux copropriétaires."
    ],
    faq: [
      {
        q: 'Comment lier une facture à un incident ?',
        a: "À l'enregistrement de la facture, dans l'onglet « Factures » de « Prestataires », choisissez l'incident. Elle apparaît ensuite dans « Factures liées »."
      },
      { q: 'Puis-je supprimer un incident ?', a: 'Non, aucun bouton ne le permet. Clôturez-le.' },
      { q: 'Le déclarant est-il prévenu de la clôture ?', a: "Non, aucun message n'est envoyé." }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Signaler, modifier, assigner et imputer demandent le droit de modification de la copropriété.'
    },
    related: [
      { label: 'Imputations d’un incident', helpId: 'syndic.profils.imputations' },
      { label: 'Factures liées', helpId: 'syndic.prestataires.factures-liees' },
      { label: 'Prestataires', helpId: 'syndic.prestataires.tableau' }
    ],
    keywords: ['incident', 'panne', 'fuite', 'sinistre', 'urgence', 'signalement', 'réparation', 'ticket']
  },
  {
    id: 'syndic.profils.imputations',
    kind: 'table',
    title: 'Imputations d’un incident',
    summary:
      "Ce sous-tableau, dans la ligne dépliée d'un incident, liste les coûts répartis sur cet incident. « Ajouter imputation » (sur la ligne de l'incident) en crée une.",
    purpose:
      "Une imputation note qui supporte une part du coût d'un incident : le budget de la copropriété, l'assurance, un propriétaire ou un tiers.",
    howToRead: {
      columns: [
        { key: 'imputationType', label: 'Type', description: 'Budget syndic, Assurance, Lot propriétaire ou Tiers.' },
        { key: 'amount', label: 'Montant', description: 'Montant imputé, en FCFA.' },
        { key: 'lot', label: 'Lot', description: 'Lot concerné, s’il y en a un.' },
        { key: 'notes', label: 'Notes', description: 'Commentaire libre.' },
        { key: 'createdAt', label: 'Créé le', description: "Date et heure d'enregistrement." }
      ],
      notes: ['Sans imputation : « Aucune imputation pour cet incident ».']
    },
    steps: [
      { title: 'Ouvrir le formulaire', detail: "« Ajouter imputation » sur la ligne de l'incident." },
      {
        title: 'Choisir',
        detail:
          "« Type imputation » et « Montant » sont obligatoires. Le lot de l'incident est proposé, et vous pouvez le changer."
      },
      { title: 'Compléter', detail: '« Poste de budget (optionnel) », « Contrat (optionnel) » et « Notes ».' }
    ],
    consequences: [
      "Une imputation est une note chiffrée : elle n'écrit rien en comptabilité et ne débite aucun compte de copropriétaire.",
      'Elle ne peut être ni modifiée ni supprimée depuis cet écran.',
      "Une imputation « Budget syndic » sert ensuite à relier la facture du prestataire à l'incident, quand une seule est en attente."
    ],
    faq: [
      {
        q: "L'imputation facture-t-elle le copropriétaire ?",
        a: "Non. Avec le type « Lot propriétaire », rien n'est débité sur son compte : c'est une information."
      },
      {
        q: 'Puis-je corriger un montant ?',
        a: 'Pas ici. Ajoutez une imputation de remplacement et précisez-le dans « Notes ».'
      },
      {
        q: 'Comment savoir quels incidents ont une imputation ?',
        a: 'Dans la liste des incidents, la colonne « Imputations » donne le nombre. Le filtre « Imputations » propose « Avec imputation » et « Sans imputation ».'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Ajouter une imputation demande le droit de modification de la copropriété.'
    },
    related: [
      { label: 'Incidents et imputations', helpId: 'syndic.profils.incidents' },
      { label: 'Factures liées', helpId: 'syndic.prestataires.factures-liees' }
    ],
    keywords: ['imputation', 'coût', 'assurance', 'budget', 'tiers', 'prise en charge']
  }
];

export default entries;
