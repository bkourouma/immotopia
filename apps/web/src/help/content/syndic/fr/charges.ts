import type { HelpEntry } from '../../../types';

/** Zone « charges » du module « syndic » (fr) : budgets, appels de charges, programmation, suivi mensuel, quittances. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Budgets
  {
    id: 'syndic.budgets.liste',
    kind: 'page',
    title: "Budgets et campagnes d'appels",
    summary:
      "Cet écran prépare le budget prévisionnel de la copropriété, le répartit entre les lots puis génère les appels de charges correspondants. Il compte trois onglets : « Budgets », « Répartition des lots » et « Campagnes d'appels ».",
    purpose:
      'Le budget fixe ce que la copropriété prévoit de dépenser sur un exercice, poste par poste. Une fois approuvé, il sert de base aux appels de charges de chaque lot.',
    steps: [
      {
        title: 'Créer le budget',
        detail: 'Bouton « Nouveau budget » : exercice, libellé, clé de distribution et postes.'
      },
      {
        title: 'Approuver',
        detail: 'Dans la ligne du budget, « Approuver ». Un budget doit être approuvé avant de générer des appels.'
      },
      {
        title: 'Répartir',
        detail: "« Répartir » calcule la part de chaque lot, visible dans l'onglet « Répartition des lots »."
      },
      {
        title: 'Générer les appels',
        detail: "« Générer appels » émet un appel par lot et crée une campagne dans l'onglet « Campagnes d'appels »."
      },
      { title: 'Clôturer', detail: "En fin d'exercice, « Clôturer » verrouille définitivement le budget." }
    ],
    consequences: [
      'Générer les appels débite le compte de chaque lot et prévient les copropriétaires : voir la fiche « Générer les appels depuis un budget ».',
      "La clôture d'un budget est définitive.",
      "Le bouton « Nouvelle campagne » crée seulement une fiche de campagne vide : il n'émet aucun appel de charges."
    ],
    faq: [
      {
        q: 'Pourquoi « Générer appels » est-il refusé ?',
        a: "Le budget doit être au statut « Approuvé ». Un budget en brouillon, révisé ou clôturé ne peut pas générer d'appels."
      },
      {
        q: "L'approbation passe-t-elle par l'assemblée générale ?",
        a: "Sur cet écran, le bouton « Approuver » change simplement le statut : il ne demande pas de résolution d'assemblée. Tenez le vote en assemblée avant d'approuver."
      },
      {
        q: 'Comment modifier un budget déjà approuvé ?',
        a: "Cliquez sur « Réviser » : il passe au statut « Révisé », puis vous pouvez l'approuver de nouveau."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété', 'Comptable'],
      note: 'Consulter demande le droit de consultation de la copropriété. Créer, approuver, réviser, clôturer, répartir et générer les appels demandent le droit de modification de la copropriété.'
    },
    related: [
      { label: 'Budgets', helpId: 'syndic.budgets.liste.tableau' },
      { label: 'Générer les appels depuis un budget', helpId: 'syndic.budgets.liste.generation' },
      { label: 'Appels de charges', helpId: 'syndic.charges.liste' },
      { label: 'Programmation', helpId: 'syndic.programmation.liste' }
    ],
    keywords: ['budget', 'budget prévisionnel', 'exercice', 'charges', 'campagne', 'clé de répartition', 'tantièmes']
  },
  {
    id: 'syndic.budgets.liste.tableau',
    kind: 'table',
    title: 'Budgets',
    summary:
      "Ce tableau liste les budgets de la copropriété, un par exercice ou version. Chaque ligne porte les actions pour l'approuver, le répartir, générer les appels ou le clôturer.",
    howToRead: {
      columns: [
        { key: 'fiscalYear', label: 'Exercice', description: "L'année du budget." },
        { key: 'label', label: 'Libellé', description: 'Le nom donné au budget.' },
        { key: 'totalAmount', label: 'Montant', description: 'Total des postes prévus, en FCFA.' },
        {
          key: 'allocations',
          label: 'Allocations',
          description: 'Nombre de lots pour lesquels une répartition est enregistrée. 0 : pas encore répartie.'
        },
        { key: 'status', label: 'Statut', description: 'Avancement du budget (voir ci-dessous).' },
        {
          key: 'actions',
          label: 'Actions',
          description:
            'Gestes possibles selon le statut : « Approuver », « Réviser », « Clôturer », « Répartir », « Postes et fonds », « Voir allocations », « Générer appels ».'
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: 'Budget en préparation, pas encore approuvé.' },
        { value: 'APPROVED', label: 'Approuvé', description: 'Budget validé : il peut générer des appels de charges.' },
        {
          value: 'REVISED',
          label: 'Révisé',
          description: 'Budget repassé en révision après approbation. Il peut être approuvé de nouveau.'
        },
        { value: 'CLOSED', label: 'Clôturé', description: 'Exercice terminé : plus rien ne se modifie.' }
      ],
      notes: [
        'Passages possibles : Brouillon vers Approuvé ; Approuvé vers Révisé ou Clôturé ; Révisé vers Approuvé ou Clôturé.',
        "« Voir allocations » est grisé tant que le budget n'a pas été réparti."
      ]
    },
    steps: [
      { title: 'Approuver', detail: '« Approuver » est proposé aux budgets en brouillon ou révisés.' },
      {
        title: 'Répartir',
        detail: '« Répartir » recalcule la part de chaque lot à partir des postes et de leur clé de distribution.'
      },
      {
        title: 'Consulter les postes',
        detail: '« Postes et fonds » montre chaque poste avec son budgété, son réalisé et son écart.'
      },
      {
        title: 'Générer les appels',
        detail: '« Générer appels » ouvre la fenêtre de génération (budget approuvé uniquement).'
      },
      {
        title: 'Clôturer',
        detail:
          "« Clôturer » (budgets approuvés ou révisés) affiche le budgété, le réalisé et l'écart avant de demander confirmation."
      }
    ],
    consequences: [
      '« Clôturer » est définitif : le budget, ses postes et sa répartition ne peuvent plus être modifiés.',
      "On ne peut pas clôturer un budget tant qu'une programmation d'appels active l'utilise : mettez-la en pause ou terminez-la d'abord.",
      '« Répartir » remplace la répartition enregistrée précédemment pour ce budget.'
    ],
    faq: [
      {
        q: 'À quoi sert « Répartir » ?',
        a: "À calculer ce que chaque lot doit payer sur l'exercice, selon la clé de distribution de chaque poste. Le résultat s'affiche dans l'onglet « Répartition des lots »."
      },
      {
        q: 'Pourquoi « Répartir » est-il grisé ?',
        a: "Le budget est clôturé : plus aucune modification n'est possible."
      },
      {
        q: 'Que signifie un réalisé incomplet ?',
        a: "Des factures ou imputations de l'exercice ne sont rattachées à aucun poste du budget. Une alerte l'indique, avec leur nombre et leur montant."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Les actions de ce tableau demandent le droit de modification de la copropriété.'
    },
    related: [
      { label: 'Créer un budget', helpId: 'syndic.budgets.liste.nouveau' },
      { label: 'Postes et fonds', helpId: 'syndic.budgets.liste.postes' },
      { label: 'Générer les appels depuis un budget', helpId: 'syndic.budgets.liste.generation' }
    ],
    keywords: ['approuver un budget', 'clôture', 'révision', 'exercice', 'répartir', 'statut du budget']
  },
  {
    id: 'syndic.budgets.liste.nouveau',
    kind: 'section',
    title: 'Créer un budget',
    summary:
      'Cette fenêtre enregistre un budget prévisionnel : un exercice, une clé de distribution et la liste des postes avec leur montant prévu. Le total du budget est la somme des postes.',
    howToRead: {
      notes: [
        "« Clé de distribution » : « Tantièmes généraux », « Tantièmes spéciaux », « Répartition égale » ou « Manuelle ». Elle s'applique à tous les postes du budget.",
        '« Postes du budget » : pour chaque poste, une « Catégorie », une « Description » et un « Montant prévu » supérieur à 0.',
        '« Fonds alimenté par ce poste (optionnel) » apparaît seulement si la copropriété a au moins un fonds.'
      ]
    },
    steps: [
      {
        title: "Choisir l'exercice et le libellé",
        detail: "L'exercice est l'année du budget (l'année en cours par défaut)."
      },
      { title: 'Choisir la clé de distribution', detail: 'Par défaut « Tantièmes généraux ».' },
      {
        title: 'Ajouter les postes',
        detail: '« Ajouter un poste » pour chaque dépense prévue ; « Retirer le poste » pour en enlever un.'
      },
      { title: 'Vérifier le total', detail: 'Le « Total du budget » se calcule seul en bas de la fenêtre.' },
      { title: 'Créer', detail: 'Cliquez sur « Créer budget » : il naît au statut « Brouillon ».' }
    ],
    consequences: [
      "Le budget créé est au statut « Brouillon » : aucun appel n'est émis et personne n'est prévenu.",
      'Depuis cet écran, vous ne pouvez plus changer les montants des postes après création ; seul le fonds alimenté de chaque poste se modifie, via « Postes et fonds ».'
    ],
    faq: [
      {
        q: 'Un poste peut-il alimenter un fonds ?',
        a: 'Oui, si un fonds existe : le fonds reçoit la part de ce poste dans chaque paiement de charges enregistré ensuite.'
      },
      {
        q: 'Pourquoi la création est-elle refusée ?',
        a: 'Chaque poste doit avoir une catégorie, une description et un montant prévu supérieur à 0, et le libellé est obligatoire.'
      },
      {
        q: 'La clé « Manuelle » demande-t-elle une saisie par lot ?',
        a: 'Non, pas sur cet écran : la clé est enregistrée telle quelle sur les postes. Pour la répartition réelle, vérifiez le résultat avec « Répartir ».'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Créer un budget demande le droit de modification de la copropriété.' },
    related: [{ label: 'Budgets', helpId: 'syndic.budgets.liste.tableau' }],
    keywords: ['nouveau budget', 'postes', 'montant prévu', 'clé de distribution', 'tantièmes']
  },
  {
    id: 'syndic.budgets.liste.postes',
    kind: 'table',
    title: 'Postes et fonds',
    summary:
      "Ce tableau détaille les postes d'un budget : ce qui était prévu, ce qui est réalisé, l'écart et le fonds éventuellement alimenté. Vous pouvez rattacher un poste à un fonds tant que le budget n'est pas clôturé.",
    howToRead: {
      columns: [
        { key: 'category', label: 'Catégorie', description: 'Le type de dépense du poste.' },
        { key: 'description', label: 'Description', description: 'Le détail du poste.' },
        { key: 'amountForecast', label: 'Budgété', description: 'Le montant prévu.' },
        {
          key: 'amountActual',
          label: 'Réalisé',
          description: 'Ce qui a vraiment été dépensé : factures et incidents rattachés au poste.'
        },
        {
          key: 'ecart',
          label: 'Écart',
          description: 'Budgété moins réalisé. Un écart négatif (en rouge) signale un dépassement.'
        },
        {
          key: 'fonds',
          label: 'Fonds alimenté',
          description: 'Le fonds qui reçoit la part de ce poste dans chaque paiement de charges.'
        }
      ],
      notes: [
        'La ligne « Total » additionne les postes.',
        "Une alerte jaune indique des factures ou imputations de l'exercice non rattachées à un poste : le réalisé est alors incomplet."
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: 'Dans la ligne du budget, cliquez sur « Postes et fonds ».' },
      {
        title: 'Choisir un fonds',
        detail:
          "Dans la colonne « Fonds alimenté », sélectionnez le fonds du poste ; effacez le choix pour retirer l'affectation."
      }
    ],
    consequences: [
      "L'affectation s'enregistre dès que vous choisissez le fonds.",
      'Un poste affecté à un fonds lui verse sa part de chaque paiement de charges enregistré ensuite, au prorata de la répartition du lot. Les paiements déjà reçus ne sont pas repris.',
      'Budget clôturé : lecture seule.'
    ],
    faq: [
      {
        q: 'Pourquoi la liste de fonds est-elle vide ?',
        a: "Il n'y a pas encore de fonds. Créez-en un d'abord dans la trésorerie de la copropriété."
      },
      {
        q: 'Les paiements passés alimentent-ils le fonds ?',
        a: "Non. Seuls les paiements enregistrés après l'affectation le font."
      },
      {
        q: 'Que signifie un écart en rouge ?',
        a: 'La colonne « Écart » est le budgété moins le réalisé : un écart négatif, en rouge, signale que le poste a dépassé son montant prévu.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Choisir un fonds demande le droit de modification de la copropriété.' },
    related: [{ label: 'Budgets', helpId: 'syndic.budgets.liste.tableau' }],
    keywords: ['postes', 'fonds', 'budgété', 'réalisé', 'écart', 'dépassement']
  },
  {
    id: 'syndic.budgets.liste.generation',
    kind: 'section',
    title: 'Générer les appels depuis un budget',
    summary:
      "Cette fenêtre émet les appels de charges d'un budget approuvé : un appel par lot, regroupés dans une campagne. Vous choisissez la période, l'échéance et le découpage de l'année.",
    howToRead: {
      notes: [
        '« Libellé de la campagne » et « Période » : proposés automatiquement (par exemple « 2026 » ou « 2026-T1 ») ; vous pouvez les modifier.',
        '« Type de campagne » : « Régulier » (charges courantes) ou « Exceptionnel ».',
        "« Répartir sur » : « 1 période (annuel) », « 2 périodes (semestriel) », « 4 périodes (trimestriel) » ou « 12 périodes (mensuel) ». Le montant annuel de chaque lot est divisé en parts égales ; la dernière période de l'année absorbe l'arrondi.",
        '« Période n° » : la part à émettre maintenant, de 1 au nombre de périodes choisi.'
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: "Dans la ligne d'un budget approuvé, cliquez sur « Générer appels »." },
      { title: 'Nommer la campagne', detail: 'Vérifiez le libellé et la période.' },
      {
        title: "Fixer l'échéance",
        detail:
          "Choisissez la « Date échéance ». Une date passée est acceptée : les appels seront aussitôt en retard (un avertissement s'affiche)."
      },
      { title: 'Choisir le découpage', detail: '« Répartir sur » puis « Période n° » pour émettre la part voulue.' },
      { title: 'Générer', detail: 'Cliquez sur « Générer ».' }
    ],
    consequences: [
      "C'est irréversible depuis cet écran : la campagne et les appels sont créés, rien ne les annule ni ne les supprime.",
      "Chaque lot reçoit un appel pour sa quote-part (répartition du budget, ou part de la période). Un lot dont la part est nulle n'est pas appelé.",
      'Le compte de chaque lot est débité du montant appelé. Si le lot a une avance, elle est imputée tout de suite ; un appel ainsi soldé reçoit sa quittance.',
      "Les copropriétaires sont prévenus par e-mail et WhatsApp, sans pièce jointe, si leur coordonnée existe et si la notification « Appel de charges émis » est activée. L'appel est créé même si l'envoi échoue.",
      'Une seule campagne « Régulier » est possible par copropriété et par période : une seconde est refusée.'
    ],
    faq: [
      {
        q: 'Puis-je générer plusieurs fois le même budget ?',
        a: 'Oui pour des périodes différentes (par exemple trimestre 1 puis 2). Une campagne « Régulier » existe au plus une fois par période.'
      },
      {
        q: 'Pourquoi le message « budget doit être approuvé » ?',
        a: "Seul un budget au statut « Approuvé » peut générer des appels. Approuvez-le d'abord."
      },
      {
        q: "Un copropriétaire n'a rien reçu. Pourquoi ?",
        a: "Son lot n'a peut-être pas de copropriétaire, d'e-mail ou de numéro WhatsApp, ou la notification est désactivée. L'appel existe quand même : téléchargez l'avis depuis « Appels de charges »."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Générer les appels demande le droit de modification de la copropriété.' },
    related: [
      { label: 'Campagnes', helpId: 'syndic.budgets.liste.campagnes' },
      { label: 'Appels de charges', helpId: 'syndic.charges.liste' },
      { label: 'Programmation', helpId: 'syndic.programmation.liste' }
    ],
    keywords: ['générer les appels', 'appel de fonds', 'campagne', 'trimestriel', 'semestriel', 'mensuel', 'émission']
  },
  {
    id: 'syndic.budgets.liste.repartition',
    kind: 'table',
    title: 'Répartition des lots',
    summary:
      "Ce tableau montre, pour un budget, ce que doit payer chaque lot sur l'exercice et le détail par poste. Il se remplit avec « Répartir » ou « Voir allocations ».",
    howToRead: {
      columns: [
        { key: 'lot', label: 'Lot', description: 'Le lot concerné.' },
        {
          key: 'totalAllocated',
          label: 'Total alloué',
          description: 'La quote-part annuelle du lot, tous postes confondus.'
        },
        { key: 'breakdown', label: 'Détail lignes', description: 'La part du lot pour chaque catégorie de poste.' }
      ],
      notes: [
        'Le titre au-dessus du tableau indique le budget affiché.',
        "Tableau vide : cliquez sur « Répartir » ou « Voir allocations » dans l'onglet « Budgets ».",
        "Un lot sans tantième n'entre pas dans la répartition par tantièmes."
      ]
    },
    consequences: [
      "Cet onglet est une consultation : rien n'est émis ni envoyé.",
      'Les montants servent de base aux appels générés depuis le budget.'
    ],
    faq: [
      {
        q: 'Pourquoi mon tableau est-il vide ?',
        a: "Aucun budget n'a encore été affiché. Retournez dans l'onglet « Budgets » et cliquez sur « Répartir » ou « Voir allocations »."
      },
      {
        q: 'Pourquoi un lot manque-t-il ?',
        a: "Un lot sans tantième n'est pas appelé en répartition par tantièmes. Vérifiez ses tantièmes dans la fiche du lot."
      },
      {
        q: 'Que montrent les colonnes « Total alloué » et « Détail lignes » ?',
        a: '« Total alloué » est la quote-part annuelle du lot, tous postes confondus ; « Détail lignes » donne sa part pour chaque catégorie de poste.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Consulter demande le droit de consultation de la copropriété.' },
    related: [{ label: 'Budgets', helpId: 'syndic.budgets.liste.tableau' }],
    keywords: ['répartition', 'quote-part', 'allocation', 'tantièmes', 'lots']
  },
  {
    id: 'syndic.budgets.liste.campagnes',
    kind: 'table',
    title: "Campagnes d'appels",
    summary:
      "Ce tableau liste les campagnes d'appels de la copropriété : chaque génération d'appels depuis un budget crée une campagne qui regroupe les appels des lots.",
    howToRead: {
      columns: [
        { key: 'label', label: 'Libellé', description: 'Le nom de la campagne.' },
        { key: 'period', label: 'Période', description: 'La période couverte.' },
        { key: 'batchType', label: 'Type', description: '« Régulier » (charges courantes) ou « Exceptionnel ».' },
        { key: 'dueDate', label: 'Échéance', description: 'La date limite de paiement des appels de la campagne.' },
        { key: 'totalAmount', label: 'Montant', description: 'Le total appelé sur tous les lots.' },
        { key: 'charges', label: 'Charges', description: "Nombre d'appels de charges rattachés à la campagne." },
        { key: 'status', label: 'Statut', description: '« Brouillon », « Envoyé » ou « Clôturé ».' }
      ],
      notes: [
        "Une campagne créée par « Générer appels » est « Envoyée » et contient autant d'appels que de lots appelés.",
        "« Nouvelle campagne » crée seulement une fiche (libellé, période, échéance, montant total, type) : le compteur « Charges » reste à 0 et aucun appel n'est émis."
      ]
    },
    consequences: [
      "« Nouvelle campagne » n'émet aucun appel et ne prévient personne : c'est un simple enregistrement."
    ],
    faq: [
      {
        q: 'Où voir les appels de chaque lot ?',
        a: "Dans l'écran « Appels de charges » : une ligne par lot et par période."
      },
      {
        q: 'Quelle différence entre « Régulier » et « Exceptionnel » ?',
        a: '« Régulier » désigne les charges courantes (une seule par période) ; « Exceptionnel » un appel ponctuel, par exemple pour des travaux.'
      },
      {
        q: 'Pourquoi une campagne affiche-t-elle 0 dans « Charges » ?',
        a: "Elle a été créée avec « Nouvelle campagne » : c'est une simple fiche, sans appel émis. Une campagne créée par « Générer appels » contient autant d'appels que de lots appelés."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Créer une campagne demande le droit de modification de la copropriété.' },
    related: [{ label: 'Générer les appels depuis un budget', helpId: 'syndic.budgets.liste.generation' }],
    keywords: ['campagne', "lot d'appels", 'régulier', 'exceptionnel', 'émission']
  },

  // ------------------------------------------------------------------ Appels de charges
  {
    id: 'syndic.charges.liste',
    kind: 'page',
    title: 'Appels de charges',
    summary:
      'Cet écran liste les appels de charges de la copropriété, lot par lot, avec ce qui est payé et ce qui reste dû. Vous y émettez un nouvel appel et enregistrez les paiements.',
    purpose:
      "Un appel de charges est la somme demandée à un copropriétaire pour une période, avec une date d'échéance. Les cartes du haut donnent le montant appelé, les dossiers en attente et ceux en retard.",
    steps: [
      {
        title: 'Émettre un appel',
        detail:
          "Cliquez sur « Nouvel appel de charges », choisissez la cible, la période, le montant et l'échéance, puis « Créer »."
      },
      {
        title: 'Suivre',
        detail: 'Retrouvez chaque appel dans la liste ; filtrez par statut ou par lot avec la barre de recherche.'
      },
      { title: 'Télécharger un avis', detail: "Sur la ligne : « Avis d'appel (PDF) » ou « Avis d'appel (Word) »." },
      {
        title: 'Encaisser',
        detail: '« Enregistrer un paiement » (en haut ou sur la ligne) ouvre la saisie du règlement du lot.'
      }
    ],
    consequences: [
      "Émettre un appel débite le compte du lot et prévient le copropriétaire. Il n'y a ni suppression ni annulation depuis cet écran.",
      'Le détail du calcul est dans la fiche « Créer un appel de charges ».'
    ],
    faq: [
      {
        q: 'Comment corriger un appel émis par erreur ?',
        a: "Cet écran ne permet ni de le modifier ni de le supprimer. Vérifiez donc le montant, la cible et l'échéance avant de cliquer sur « Créer »."
      },
      {
        q: 'Pourquoi « Nouvel appel de charges » est-il grisé ?',
        a: "La copropriété n'a encore aucun lot : créez les lots d'abord."
      },
      {
        q: 'Que veut dire « Paiement déclaré » ?',
        a: 'Un copropriétaire a déclaré un paiement mobile money qui attend votre validation. Un bandeau en haut de la liste renvoie vers les paiements à valider.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété', 'Comptable'],
      note: "Consulter demande le droit de consultation de la copropriété. Créer un appel demande le droit de création ; l'affecter à un fonds, ou saisir un paiement, demande le droit de modification."
    },
    related: [
      { label: 'Créer un appel de charges', helpId: 'syndic.charges.liste.creation' },
      { label: 'Liste des appels', helpId: 'syndic.charges.liste.tableau' },
      { label: 'Programmation', helpId: 'syndic.programmation.liste' },
      { label: 'Quittances', helpId: 'syndic.quittances.liste' }
    ],
    keywords: ['appel de fonds', 'appel de charges', 'charges', 'impayés', 'échéance', 'émission', "avis d'appel"],
    tour: {
      autoStart: true,
      steps: [
        {
          target: 'charges-nouvel-appel',
          title: 'Émettre un appel',
          description:
            'Ce bouton ouvre le formulaire : cible (un lot, plusieurs ou tous), période, montant, répartition, échéance. À la création, le compte de chaque lot est débité et les copropriétaires sont prévenus.'
        },
        {
          target: 'charges-synthese',
          title: 'Les chiffres clés',
          description:
            'Montant appelé, dossiers en attente et dossiers en retard se mettent à jour après chaque émission ou paiement.'
        },
        {
          target: 'charges-tableau',
          title: 'Un appel par lot',
          description:
            "Après l'émission, chaque lot a sa ligne avec son échéance, ce qui est payé et le reste dû. Vous y téléchargez l'avis d'appel."
        },
        {
          target: 'charges-paiement',
          title: 'Encaisser',
          description:
            "Quand un copropriétaire paie, enregistrez le règlement ici : il solde les appels les plus anciens d'abord, et l'excédent devient une avance."
        }
      ]
    }
  },
  {
    id: 'syndic.charges.liste.synthese',
    kind: 'section',
    title: 'Chiffres des appels de charges',
    summary:
      'Ces trois cartes résument les appels qui correspondent à la recherche en cours : le montant appelé, les dossiers en attente et ceux en retard.',
    howToRead: {
      notes: [
        '« Montant appelé » : total des montants des appels affichés par la recherche.',
        "« Dossiers en attente » : nombre d'appels non soldés dont l'échéance n'est pas passée.",
        "« Dossiers en retard » : nombre d'appels non soldés dont l'échéance est passée. La carte devient rouge s'il y en a.",
        'Les chiffres suivent les filtres de la liste : sans filtre, ils couvrent toute la copropriété.'
      ]
    },
    consequences: ["Ces cartes sont de la consultation : rien n'est envoyé."],
    faq: [
      {
        q: 'Pourquoi les chiffres changent-ils quand je filtre ?',
        a: 'Ils sont calculés sur les appels qui correspondent à votre recherche, pas sur tous les appels.'
      },
      {
        q: "Qu'est-ce qui fait passer un dossier en retard ?",
        a: "Une échéance dépassée alors qu'il reste quelque chose à payer, même si un paiement partiel a eu lieu."
      },
      {
        q: 'Que compte « Dossiers en attente » ?',
        a: "Le nombre d'appels non soldés dont l'échéance n'est pas passée. Dès que l'échéance est passée, l'appel passe dans « Dossiers en retard »."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Consulter demande le droit de consultation de la copropriété.' },
    related: [{ label: 'Liste des appels', helpId: 'syndic.charges.liste.tableau' }],
    keywords: ['montant appelé', 'en attente', 'en retard', 'impayés', 'synthèse']
  },
  {
    id: 'syndic.charges.liste.tableau',
    kind: 'table',
    title: 'Liste des appels de charges',
    summary:
      "Ce tableau liste les appels de charges, un par lot et par période, avec le payé, le reste dû et le statut. Les boutons de chaque ligne permettent d'encaisser, de télécharger l'avis ou d'affecter l'appel à un fonds.",
    howToRead: {
      columns: [
        { key: 'period', label: 'Période', description: 'La période appelée (par exemple « 2026-T1 »).' },
        { key: 'lotNumber', label: 'Lot', description: 'Le lot concerné.' },
        { key: 'amount', label: 'Montant', description: 'Le montant appelé à ce lot.' },
        {
          key: 'dueDate',
          label: 'Échéance',
          description: "La date limite. En rouge quand elle est passée et que l'appel n'est pas payé."
        },
        {
          key: 'isRecurring',
          label: 'Charge récurrente',
          description: "« Non », ou « Oui » avec la fréquence et le nombre d'occurrences."
        },
        { key: 'paid', label: 'Payé', description: 'Ce qui a déjà été réglé sur cet appel.' },
        { key: 'outstanding', label: 'Reste', description: 'Ce qui reste à payer.' },
        {
          key: 'status',
          label: 'Statut',
          description:
            "Avancement de l'appel. L'étiquette « Paiement déclaré » s'ajoute si un paiement mobile money attend validation."
        },
        {
          key: 'fund',
          label: 'Fonds',
          description: "Le fonds qui reçoit en entier ce qui est payé sur cet appel, s'il y en a un."
        },
        {
          key: 'actions',
          label: 'Actions',
          description:
            "« Enregistrer un paiement », « Avis d'appel (PDF) », « Avis d'appel (Word) », « Affecter à un fonds » et « Lien de paiement »."
        }
      ],
      statuses: [
        { value: 'PENDING', label: 'En attente', description: "Rien n'est payé et l'échéance n'est pas passée." },
        { value: 'PARTIAL', label: 'Partiel', description: 'Une partie est payée, il reste un solde.' },
        { value: 'PAID', label: 'Payé', description: "L'appel est entièrement soldé." },
        {
          value: 'OVERDUE',
          label: 'En retard',
          description: "L'échéance est passée et il reste quelque chose à payer."
        }
      ],
      notes: [
        "Un paiement partiel reste « Partiel » ; il passe « En retard » dès que l'échéance est dépassée.",
        "La colonne « Fonds » n'apparaît que si la copropriété a des fonds.",
        "« Lien de paiement » n'apparaît que si le paiement en ligne est utilisable et que l'appel est en FCFA avec un reste dû."
      ]
    },
    steps: [
      { title: 'Rechercher', detail: 'La barre au-dessus du tableau filtre par texte, statut ou lot.' },
      { title: 'Télécharger un avis', detail: "« Avis d'appel (PDF) » ou « Avis d'appel (Word) » sur la ligne." },
      {
        title: 'Encaisser',
        detail: "« Enregistrer un paiement » (grisé si l'appel est déjà payé) ouvre la saisie pour ce lot."
      },
      {
        title: 'Affecter à un fonds',
        detail: '« Affecter à un fonds » choisit le fonds qui recevra les paiements de cet appel.'
      },
      {
        title: 'Exporter',
        detail:
          "Le menu d'export du tableau reprend tous les appels qui correspondent à la recherche, pas seulement la page affichée."
      }
    ],
    consequences: [
      'Affecter un appel à un fonds ne vaut que pour les paiements enregistrés ensuite : les paiements déjà reçus ne sont pas repris.',
      'Télécharger un avis ne prévient personne.'
    ],
    faq: [
      {
        q: "Comment voir les appels d'un seul lot ?",
        a: 'Utilisez le critère « Lot » de la barre de recherche.'
      },
      {
        q: 'Pourquoi « Enregistrer un paiement » est-il grisé sur une ligne ?',
        a: "L'appel est déjà au statut « Payé »."
      },
      {
        q: "Où voir la quittance d'un appel soldé ?",
        a: "Dans l'écran « Quittances »."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Consulter demande le droit de consultation de la copropriété. Affecter à un fonds et saisir un paiement demandent le droit de modification.'
    },
    related: [
      { label: 'Créer un appel de charges', helpId: 'syndic.charges.liste.creation' },
      { label: 'Quittances', helpId: 'syndic.quittances.liste' }
    ],
    keywords: ['appel de charges', 'impayé', 'reste dû', "avis d'appel", 'fonds', 'paiement partiel', 'statut']
  },
  {
    id: 'syndic.charges.liste.creation',
    kind: 'section',
    title: 'Créer un appel de charges',
    summary:
      'Ce formulaire émet un appel de charges pour un lot, plusieurs lots ou tous les lots. Pour plusieurs lots, vous donnez un total et choisissez comment le répartir.',
    howToRead: {
      notes: [
        '« Cible » : « Un lot », « Plusieurs lots » ou « Tous les lots » (les lots sans tantièmes sont laissés de côté).',
        '« Libellé de la période » : obligatoire, sauf si vous renseignez les deux dates de début et de fin, qui composent alors le libellé.',
        "« Montant » : pour un seul lot, c'est le montant de ce lot. Pour plusieurs lots, « Montant total à répartir ».",
        "« Date d'échéance » : une date passée est acceptée ; l'appel sera aussitôt en retard (un avertissement s'affiche).",
        "« Fonds alimenté (optionnel) » apparaît s'il existe des fonds.",
        '« Charge récurrente » : « Oui » demande une « Fréquence » (« Mensuelle », « Trimestrielle », « Annuelle ») et des « Occurrences » (1 à 24).'
      ]
    },
    steps: [
      { title: 'Choisir la cible', detail: 'Un lot, plusieurs lots ou tous les lots.' },
      { title: 'Indiquer la période', detail: 'Un libellé (par exemple 2026-Q1) ou les deux dates.' },
      {
        title: 'Saisir le montant',
        detail: "Pour plusieurs lots, choisissez aussi la répartition et contrôlez l'aperçu par lot."
      },
      { title: "Fixer l'échéance", detail: 'La date limite de paiement.' },
      { title: 'Options', detail: 'Le fonds alimenté et la charge récurrente, si besoin.' },
      { title: 'Créer', detail: 'Cliquez sur « Créer » : la fenêtre se ferme et la liste se met à jour.' }
    ],
    consequences: [
      "Irréversible depuis cet écran : on ne peut ni modifier ni supprimer un appel émis. Relisez l'aperçu avant de créer.",
      'Montant par lot : pour un seul lot, le montant saisi. Pour plusieurs lots, le total est réparti selon la méthode choisie ; la somme des parts égale toujours le total.',
      "Le compte de chaque lot est débité. L'avance éventuelle du lot est imputée aussitôt : un appel entièrement couvert passe « Payé », reçoit sa quittance et n'est pas notifié comme « à payer ».",
      "Pour les appels restant dus, le copropriétaire est prévenu par e-mail et WhatsApp, sans pièce jointe, si ses coordonnées existent et si la notification « Appel de charges émis » est activée. Un lot sans copropriétaire n'est pas prévenu. L'appel est créé même si l'envoi échoue.",
      "Charge récurrente : toutes les occurrences sont créées d'un coup, avec leurs échéances décalées, et toutes notifiées tout de suite. Pour une émission automatique à chaque période, utilisez « Programmation »."
    ],
    faq: [
      {
        q: 'Quelle répartition choisir ?',
        a: 'Voir la fiche « Répartition entre les lots ». « Par tantièmes » est la plus courante.'
      },
      {
        q: "Le copropriétaire reçoit-il l'avis en pièce jointe ?",
        a: "Pas sur une création manuelle : le message est envoyé sans pièce jointe. Téléchargez l'avis depuis la ligne et transmettez-le si besoin."
      },
      {
        q: 'Puis-je saisir un arriéré ancien ?',
        a: "Oui : une échéance passée est autorisée. L'appel naît « En retard »."
      },
      {
        q: "Pourquoi l'affectation à un fonds est-elle refusée ?",
        a: 'Choisir un fonds demande le droit de modification de la copropriété, en plus du droit de création.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Créer un appel demande le droit de création de la copropriété ; choisir un fonds demande en plus le droit de modification.'
    },
    related: [
      { label: 'Répartition entre les lots', helpId: 'syndic.charges.liste.repartition' },
      { label: 'Programmation', helpId: 'syndic.programmation.liste' },
      { label: 'Générer les appels depuis un budget', helpId: 'syndic.budgets.liste.generation' }
    ],
    keywords: ['émettre un appel', 'appel de fonds', 'nouvel appel', 'arriérés', 'récurrent', 'notification']
  },
  {
    id: 'syndic.charges.liste.repartition',
    kind: 'section',
    title: 'Répartition entre les lots',
    summary:
      "Quand l'appel vise plusieurs lots ou tous les lots, ce choix décide comment le total est partagé. L'aperçu sous le montant montre la part de chaque lot avant de créer.",
    howToRead: {
      statuses: [
        {
          value: 'SHARES',
          label: 'Par tantièmes',
          description: 'Le total est réparti au prorata des tantièmes généraux de chaque lot.'
        },
        {
          value: 'BY_LOT_TYPE',
          label: 'Par type de lot',
          description:
            'Chaque lot paie le montant du barème de la copropriété selon son type (appartement, parking…). Rien à saisir.'
        },
        {
          value: 'EQUAL',
          label: 'Équitablement',
          description: 'Le total est divisé à parts égales entre les lots, quels que soient leurs tantièmes.'
        }
      ],
      notes: [
        "L'aperçu liste le lot, son type et son montant, puis le total.",
        'Avec « Par type de lot », le barème doit être renseigné : le lien « Paramétrer le barème de la copropriété » y mène.'
      ]
    },
    consequences: [
      "L'aperçu est une simulation : rien n'est émis tant que vous n'avez pas cliqué sur « Créer ».",
      'Un montant impossible à répartir (par exemple barème manquant pour un type de lot) bloque la création avec un message.'
    ],
    faq: [
      {
        q: "Pourquoi n'y a-t-il pas de choix pour un seul lot ?",
        a: "Pour un seul lot, le montant saisi est celui du lot : il n'y a rien à répartir."
      },
      {
        q: "Un lot manque dans l'aperçu.",
        a: 'Avec « Tous les lots », les lots sans tantièmes ne sont pas appelés.'
      },
      {
        q: 'Où régler le barème par type de lot ?',
        a: 'Dans la fiche de la copropriété, via le lien « Paramétrer le barème de la copropriété ».'
      }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Créer un appel de charges', helpId: 'syndic.charges.liste.creation' }],
    keywords: ['répartition', 'tantièmes', 'barème', 'type de lot', 'à parts égales', 'clé de répartition']
  },

  // ------------------------------------------------------------------ Programmation
  {
    id: 'syndic.programmation.liste',
    kind: 'page',
    title: 'Programmation des appels de charges',
    summary:
      'Cet écran automatise les appels de charges récurrents : une programmation émet seule un appel à chaque période, impute les avances et prévient les copropriétaires.',
    purpose:
      "Au lieu de créer un appel à la main chaque trimestre ou chaque mois, vous décrivez une fois la fréquence, le jour d'émission et le montant. La copropriété émet ensuite chaque période, sans oubli.",
    steps: [
      {
        title: 'Créer',
        detail:
          "Bouton « Nouvelle programmation » : libellé, fréquence, jour d'émission, délai avant échéance, source du montant, dates."
      },
      {
        title: "Vérifier l'aperçu",
        detail:
          "Ouvrez la programmation puis l'onglet « Aperçu » pour voir les périodes à venir et les montants par lot."
      },
      {
        title: 'Laisser tourner',
        detail:
          "Chaque jour à 6 h, les programmations actives dont la date d'émission est arrivée émettent leur période."
      },
      {
        title: 'Émettre à la demande',
        detail: '« Exécuter maintenant » émet tout de suite la période due ou en cours.'
      },
      { title: 'Suivre', detail: "L'onglet « Historique » liste les exécutions, leurs avis et leurs erreurs." }
    ],
    consequences: [
      "Une période émise ne l'est jamais deux fois : une seconde exécution est « Ignorée (déjà traitée) ».",
      "Une exécution crée un appel par lot, débite les comptes, impute les avances, et envoie l'avis d'appel PDF en pièce jointe aux copropriétaires qui ont encore à payer.",
      "Deux programmations actives d'une même copropriété ne peuvent pas couvrir la même période."
    ],
    faq: [
      {
        q: 'Que se passe-t-il si le serveur était arrêté ?',
        a: "Les périodes manquées sont rattrapées dans l'ordre, jusqu'à 12 par programmation et par passage."
      },
      {
        q: 'Reprendre une programmation en pause rattrape-t-il les périodes passées ?',
        a: 'Non : les périodes qui tombaient pendant la pause ne sont pas rattrapées.'
      },
      {
        q: "Une échéance déjà passée à l'émission ?",
        a: "Elle est décalée : date d'émission réelle plus le délai avant échéance. La date décalée est indiquée dans le résultat."
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété', 'Comptable'],
      note: 'Consulter demande le droit de consultation de la copropriété. Créer, modifier, mettre en pause, exécuter, renvoyer les avis ou supprimer demandent le droit de modification.'
    },
    related: [
      { label: 'Programmations', helpId: 'syndic.programmation.liste.tableau' },
      { label: 'Paramètres de la programmation', helpId: 'syndic.programmation.liste.formulaire' },
      { label: 'Appels de charges', helpId: 'syndic.charges.liste' }
    ],
    keywords: ['appels récurrents', 'automatique', 'programmation', 'émission automatique', 'trimestriel', 'mensuel']
  },
  {
    id: 'syndic.programmation.liste.tableau',
    kind: 'table',
    title: 'Programmations',
    summary:
      "Ce tableau liste les programmations d'appels de la copropriété avec leur prochaine émission, leur état et leur dernière exécution. Chaque ligne permet de l'ouvrir, l'exécuter, la mettre en pause ou la supprimer.",
    howToRead: {
      columns: [
        { key: 'label', label: 'Libellé', description: 'Le nom de la programmation et sa fréquence.' },
        {
          key: 'source',
          label: 'Source et montant',
          description:
            '« Budget approuvé » (avec le budget) ou « Montant fixe » (avec le montant ou le barème, et le mode de répartition).'
        },
        {
          key: 'next',
          label: 'Prochaine émission',
          description: "La prochaine période, sa date d'émission et son échéance. « Aucune » quand la fin est atteinte."
        },
        { key: 'status', label: 'Statut', description: '« Active » ou « En pause ».' },
        {
          key: 'lastRun',
          label: 'Dernière exécution',
          description: "La dernière période traitée et son résultat, avec le nombre d'avis envoyés ou non."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Ouvrir », « Exécuter maintenant », « Pause » ou « Reprise », « Supprimer ».'
        }
      ],
      statuses: [
        { value: 'SUCCESS', label: 'Réussie', description: 'La période a été émise.' },
        {
          value: 'FAILED',
          label: 'Échec',
          description: "L'émission a échoué ; la période sera retentée. L'erreur s'affiche sous le statut."
        },
        {
          value: 'SKIPPED',
          label: 'Ignorée (déjà traitée)',
          description: "La période avait déjà été émise : rien n'a été recréé."
        }
      ],
      notes: [
        "« Renvoyer les avis non envoyés » apparaît quand des avis n'ont pas pu partir ; il retente l'e-mail et WhatsApp pour les appels encore dus et sans avis envoyé.",
        "Une ligne « Échéance décalée au… » signale une échéance repoussée parce qu'elle était déjà passée."
      ]
    },
    steps: [
      { title: 'Ouvrir', detail: "« Ouvrir » affiche les paramètres, l'aperçu et l'historique." },
      { title: 'Exécuter maintenant', detail: 'Disponible seulement si la programmation est active.' },
      {
        title: 'Mettre en pause',
        detail: "« Pause » arrête les émissions en gardant l'historique ; « Reprise » les relance."
      },
      { title: 'Supprimer', detail: '« Supprimer » demande confirmation.' }
    ],
    consequences: [
      "« Exécuter maintenant » émet réellement les appels de la période, débite les comptes et envoie les avis : c'est irréversible depuis cet écran.",
      "« Supprimer » : si des appels ont déjà été émis, la programmation est désactivée au lieu d'être supprimée ; sinon elle disparaît avec son historique. Les appels déjà émis restent.",
      '« Reprise » est refusée si une autre programmation active couvre la même période.'
    ],
    faq: [
      {
        q: 'Une programmation en pause émet-elle encore ?',
        a: 'Non. Elle garde son historique mais ne génère plus rien tant que vous ne cliquez pas sur « Reprise ».'
      },
      {
        q: "Un avis n'est pas parti. Que faire ?",
        a: 'Lisez la raison sous « Dernière exécution » (lot sans copropriétaire, e-mail absent, notification désactivée…), corrigez-la, puis « Renvoyer les avis non envoyés ».'
      },
      {
        q: 'Pourquoi « Exécuter maintenant » est-il grisé ?',
        a: 'La programmation est en pause.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      note: 'Les actions de ce tableau demandent le droit de modification de la copropriété.'
    },
    related: [
      { label: 'Paramètres de la programmation', helpId: 'syndic.programmation.liste.formulaire' },
      { label: 'Exécutions', helpId: 'syndic.programmation.liste.executions' }
    ],
    keywords: ['exécuter maintenant', 'pause', 'reprise', 'supprimer', 'avis non envoyés', 'dernière exécution']
  },
  {
    id: 'syndic.programmation.liste.formulaire',
    kind: 'section',
    title: 'Paramètres de la programmation',
    summary:
      'Ce volet crée ou modifie une programmation : sa fréquence, son calendrier, la source du montant et sa période de validité.',
    howToRead: {
      notes: [
        '« Fréquence » : « Mensuelle », « Trimestrielle », « Semestrielle » ou « Annuelle ». Elle ne change plus une fois des périodes émises.',
        "« Jour d'émission » : jour du premier mois de chaque période, de 1 à 28.",
        "« Délai avant échéance (jours) » : nombre de jours entre l'émission et l'échéance, de 0 à 365.",
        '« Source du montant » : « Budget approuvé » (seuls les budgets approuvés sont proposés ; chaque exécution reprend le budget voté divisé par le nombre de périodes) ou « Montant fixe ».',
        'Montant fixe : « Répartition entre les lots » (« Par tantièmes », « Par type de lot », « Équitablement »), « Montant total par période » et, par tantièmes, « Inclure les lots annexes (parkings, caves, locaux…) ».',
        '« Date de début » (figée après la première émission), « Date de fin (optionnelle) », et « Active » ou « En pause ».'
      ]
    },
    steps: [
      { title: 'Nommer', detail: 'Un libellé clair, par exemple « Charges courantes trimestrielles ».' },
      { title: 'Régler le calendrier', detail: "Fréquence, jour d'émission et délai avant échéance." },
      {
        title: 'Choisir la source',
        detail: "Un budget approuvé, ou un montant fixe avec sa répartition ; l'aperçu par lot s'affiche."
      },
      { title: 'Fixer les dates', detail: "Date de début, et date de fin si la programmation doit s'arrêter." },
      { title: 'Enregistrer', detail: "« Créer » ou « Enregistrer » dans l'en-tête du volet." }
    ],
    consequences: [
      'Enregistrer ne crée aucun appel tout de suite : la première période sera émise à sa date, ou par « Exécuter maintenant ».',
      'Tant que des périodes ont été émises, la fréquence et la date de début ne peuvent plus changer.',
      "Une programmation sur « Budget approuvé » demande qu'un budget approuvé existe."
    ],
    faq: [
      {
        q: "Pourquoi 28 au maximum pour le jour d'émission ?",
        a: 'Pour que le jour existe chaque mois, février compris.'
      },
      {
        q: 'Les lots annexes sont-ils appelés ?',
        a: 'Par tantièmes, seulement si « Inclure les lots annexes » est activé ; sinon seuls les appartements, bureaux et commerces le sont.'
      },
      {
        q: "Aucun budget n'apparaît.",
        a: 'Seuls les budgets approuvés sont proposés. Approuvez-en un dans « Budgets ».'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Créer ou modifier demande le droit de modification de la copropriété.' },
    related: [
      { label: 'Aperçu', helpId: 'syndic.programmation.liste.apercu' },
      { label: 'Répartition entre les lots', helpId: 'syndic.charges.liste.repartition' }
    ],
    keywords: ['fréquence', "jour d'émission", 'délai', 'montant fixe', 'budget approuvé', 'lots annexes']
  },
  {
    id: 'syndic.programmation.liste.apercu',
    kind: 'section',
    title: 'Aperçu des périodes à venir',
    summary:
      "Cet onglet simule les prochaines périodes de la programmation : dates d'émission et d'échéance, montant total et part de chaque lot. Rien n'est émis.",
    howToRead: {
      notes: [
        '« Émission » et « Échéance » : les dates prévues de la période.',
        '« Répartition » : le mode de répartition, pour un montant fixe.',
        "« Montant total » : le total de la période. Une erreur de calcul s'y affiche en rouge.",
        "Un avertissement précise quand l'échéance serait déjà passée à l'émission : elle est alors décalée."
      ]
    },
    consequences: ["L'aperçu est une simulation : aucun appel n'est créé et personne n'est prévenu."],
    faq: [
      {
        q: "Pourquoi l'onglet « Aperçu » est-il grisé ?",
        a: "Il s'ouvre une fois la programmation créée : ouvrez-la depuis le tableau."
      },
      {
        q: 'Pourquoi « Aucune période à venir » ?',
        a: "La date de fin est atteinte : il n'y a plus rien à émettre."
      },
      {
        q: "L'aperçu crée-t-il de vrais appels de charges ?",
        a: "Non, c'est une simulation : aucun appel n'est créé et personne n'est prévenu."
      }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Paramètres de la programmation', helpId: 'syndic.programmation.liste.formulaire' }],
    keywords: ['aperçu', 'simulation', 'périodes à venir', 'prévisualisation']
  },
  {
    id: 'syndic.programmation.liste.executions',
    kind: 'table',
    title: 'Exécutions de la programmation',
    summary:
      "Cet onglet liste chaque passage de la programmation : période traitée, résultat, nombre d'appels créés et d'avis envoyés, erreurs éventuelles.",
    howToRead: {
      columns: [
        { key: 'periodLabel', label: 'Période', description: 'La période traitée.' },
        { key: 'status', label: 'Statut', description: '« Réussie », « Échec » ou « Ignorée (déjà traitée) ».' },
        {
          key: 'trigger',
          label: 'Déclenchement',
          description: '« Automatique » (passage quotidien) ou « Manuelle » (« Exécuter maintenant »).'
        },
        { key: 'callsCreated', label: 'Appels créés', description: "Nombre d'appels de charges émis." },
        {
          key: 'callsCovered',
          label: 'Couverts',
          description: "Appels aussitôt soldés par l'avance du lot : ils reçoivent une quittance et aucun avis."
        },
        { key: 'notices', label: 'Avis', description: 'Avis envoyés et non envoyés, avec la raison de chaque échec.' },
        { key: 'createdAt', label: 'Date', description: "Le jour de l'exécution." },
        { key: 'error', label: 'Erreur', description: "La cause d'un échec." }
      ],
      statuses: [
        { value: 'SUCCESS', label: 'Réussie', description: 'La période a été émise.' },
        { value: 'FAILED', label: 'Échec', description: "L'émission a échoué ; elle sera retentée." },
        { value: 'SKIPPED', label: 'Ignorée (déjà traitée)', description: 'La période avait déjà été émise.' }
      ],
      notes: [
        'Deux erreurs fréquentes : agence suspendue, ou abonnement sans le module Syndic ou en lecture seule. Régularisez puis rejouez la période avec « Exécuter maintenant ».'
      ]
    },
    consequences: [
      "« Renvoyer les avis non envoyés » retente l'e-mail et WhatsApp, après confirmation, pour les appels de l'exécution encore dus et sans avis déjà envoyé. Un renvoi trop rapproché du précédent est refusé."
    ],
    faq: [
      {
        q: 'Que signifie « Couverts » ?',
        a: "Le lot avait une avance qui a soldé l'appel dès son émission. Le copropriétaire reçoit une quittance, pas un avis à payer."
      },
      {
        q: 'Une période en échec est-elle perdue ?',
        a: 'Non, elle est retentée au passage suivant, ou à la main avec « Exécuter maintenant ».'
      },
      {
        q: 'À quoi sert « Renvoyer les avis non envoyés » ?',
        a: "À retenter l'e-mail et WhatsApp, après confirmation, pour les appels de l'exécution encore dus et sans avis déjà envoyé. Un renvoi trop rapproché du précédent est refusé."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Renvoyer les avis demande le droit de modification de la copropriété.' },
    related: [{ label: 'Programmations', helpId: 'syndic.programmation.liste.tableau' }],
    keywords: ['historique', 'exécutions', 'avis non envoyés', 'échec', 'renvoyer']
  },

  // ------------------------------------------------------------------ Suivi mensuel
  {
    id: 'syndic.suivi.liste',
    kind: 'page',
    title: 'Suivi mensuel',
    summary:
      "Cet écran montre, pour chaque lot, l'état des charges mois par mois sur un exercice : réglé, partiel, dû ou en retard. Il sert à repérer d'un coup d'œil qui est à jour.",
    purpose:
      'Les appels de charges couvrent souvent plusieurs mois. Le suivi mensuel répartit chaque appel sur ses mois et indique, pour chacun, ce qui est payé.',
    steps: [
      {
        title: "Choisir l'exercice",
        detail: "Le sélecteur « Exercice » propose l'année en cours, les trois précédentes et la suivante."
      },
      {
        title: 'Chercher un lot',
        detail:
          'La barre de recherche accepte un numéro de lot ou un copropriétaire, et le statut sur au moins un mois.'
      },
      { title: 'Lire la grille', detail: 'Survolez une case pour voir le montant dû et réglé du mois.' }
    ],
    consequences: ["Écran de consultation : aucune action ne modifie les appels ni n'envoie de message."],
    faq: [
      {
        q: 'Comment un appel trimestriel apparaît-il ?',
        a: "Il est réparti à parts égales sur ses trois mois ; le dernier mois absorbe l'arrondi."
      },
      {
        q: 'Un paiement partiel sur un trimestre ?',
        a: "Le paiement remplit les mois dans l'ordre : un trimestre à moitié payé montre le premier mois réglé, pas trois mois partiels."
      },
      {
        q: 'La case est vide avec un tiret.',
        a: 'Aucun appel ne couvre ce mois pour ce lot.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Consulter demande le droit de consultation de la copropriété.' },
    related: [
      { label: 'Grille mensuelle', helpId: 'syndic.suivi.liste.grille' },
      { label: 'Appels de charges', helpId: 'syndic.charges.liste' }
    ],
    keywords: ['suivi mensuel', 'mois par mois', 'impayés', 'retards', 'grille', 'avance']
  },
  {
    id: 'syndic.suivi.liste.grille',
    kind: 'section',
    title: 'Grille mensuelle des lots',
    summary:
      "Chaque ligne est un lot, chaque colonne un mois de l'exercice. La couleur et le texte de la case donnent l'état du mois ; la dernière colonne montre l'avance du lot.",
    howToRead: {
      columns: [
        { key: 'lot', label: 'Lot', description: 'Le numéro du lot.' },
        { key: 'owner', label: 'Copropriétaire', description: 'Le copropriétaire du lot, ou « Sans copropriétaire ».' },
        {
          key: 'months',
          label: 'Janv. à Déc.',
          description: "Un état par mois. Survolez la case : « dû » et « réglé » du mois s'affichent."
        },
        {
          key: 'advance',
          label: 'Avance',
          description: "Somme versée par le lot en plus de ce qui était appelé, en attente d'être imputée."
        }
      ],
      statuses: [
        { value: 'PAID', label: 'Réglé', description: 'Le mois est entièrement payé.' },
        {
          value: 'PARTIAL',
          label: 'Partiel',
          description: "Une partie du mois est payée, l'échéance n'est pas passée."
        },
        { value: 'DUE', label: 'Dû', description: "Rien n'est payé et l'échéance n'est pas passée." },
        {
          value: 'OVERDUE',
          label: 'En retard',
          description: "Une part non soldée d'un appel dont l'échéance est passée. Un partiel échu est en retard."
        },
        { value: 'NONE', label: '—', description: 'Aucun appel ne couvre ce mois.' }
      ],
      notes: [
        'Un appel sans dates de période est rangé au mois de son échéance.',
        'Le critère « Statut sur au moins un mois » garde les lots qui ont au moins un mois dans les statuts choisis.'
      ]
    },
    consequences: ["Consultation seulement : rien n'est envoyé ni modifié."],
    faq: [
      {
        q: 'Pourquoi un lot a-t-il une avance ?',
        a: "Il a payé plus que ce qui était appelé. L'avance sera imputée automatiquement sur ses prochains appels, les plus anciens d'abord."
      },
      {
        q: "Pourquoi un mois « En retard » alors qu'une partie est payée ?",
        a: "Un paiement partiel dont l'échéance est passée est considéré en retard."
      },
      {
        q: 'Que signifie « — » dans une case ?',
        a: 'Aucun appel ne couvre ce mois pour ce lot.'
      }
    ],
    permissions: { feature: 'SYNDIC' },
    related: [{ label: 'Liste des appels', helpId: 'syndic.charges.liste.tableau' }],
    keywords: ['grille', 'réglé', 'partiel', 'dû', 'en retard', 'avance', 'légende']
  },

  // ------------------------------------------------------------------ Quittances
  {
    id: 'syndic.quittances.liste',
    kind: 'page',
    title: 'Quittances',
    summary:
      'Cet écran conserve les reçus de paiement et les quittances de charges de la copropriété. Vous pouvez les télécharger, les renvoyer par e-mail, générer les manquantes et imprimer en groupe.',
    purpose:
      'Chaque paiement de charges produit un document pour le copropriétaire : une quittance quand un appel est soldé, un reçu quand le paiement est partiel ou laisse une avance.',
    steps: [
      {
        title: 'Rechercher',
        detail: 'La barre filtre par numéro, type, période, lot, copropriétaire ou « Rattrapé ».'
      },
      {
        title: 'Télécharger',
        detail: 'Sur la ligne : « Télécharger » (PDF), « Traduction arabe » ou « Télécharger (Word) ».'
      },
      { title: 'Renvoyer', detail: '« Renvoyer » envoie de nouveau le document par e-mail au copropriétaire.' },
      {
        title: 'Rattraper',
        detail: "« Générer les quittances manquantes » crée les quittances des appels soldés qui n'en ont pas."
      },
      { title: 'Imprimer', detail: '« Imprimer les quittances » prépare un PDF groupé sur une période.' }
    ],
    consequences: [
      'Les documents sont créés par les paiements : un paiement enregistré produit son reçu ou ses quittances et les envoie au copropriétaire par e-mail, avec le PDF joint.',
      "« Générer les quittances manquantes » n'envoie aucun e-mail.",
      '« Renvoyer » envoie réellement un e-mail au copropriétaire.'
    ],
    faq: [
      {
        q: 'Reçu ou quittance ?',
        a: 'Un reçu (numéro en R-) est émis pour un paiement partiel ou qui laisse une avance. Un paiement qui solde exactement ses appels ne reçoit que leurs quittances (numéro en Q-).'
      },
      {
        q: 'Pourquoi « Renvoyer » est-il refusé ?',
        a: "Le document vient d'être envoyé (attendez deux minutes), le lot n'a pas d'adresse e-mail, ou un document rattrapé désigne un copropriétaire qui n'est plus celui du lot."
      },
      {
        q: 'Que veut dire « Rattrapé » ?',
        a: 'Le document a été créé après coup par « Générer les quittances manquantes », et non au moment du paiement.'
      }
    ],
    permissions: {
      feature: 'SYNDIC',
      roles: ['Gestionnaire de copropriété', 'Comptable'],
      note: 'Consulter, télécharger et imprimer demandent le droit de consultation de la copropriété. Renvoyer par e-mail et générer les quittances manquantes demandent le droit de modification.'
    },
    related: [
      { label: 'Liste des reçus et quittances', helpId: 'syndic.quittances.liste.tableau' },
      { label: 'Imprimer les quittances', helpId: 'syndic.quittances.liste.impression' },
      { label: 'Appels de charges', helpId: 'syndic.charges.liste' }
    ],
    keywords: ['quittance', 'reçu', 'justificatif de paiement', 'impression', 'renvoyer', 'e-mail']
  },
  {
    id: 'syndic.quittances.liste.tableau',
    kind: 'table',
    title: 'Reçus et quittances',
    summary:
      "Ce tableau liste les reçus et quittances, avec leur lot, leur montant et l'état de l'envoi par e-mail. Chaque ligne se télécharge ou se renvoie.",
    howToRead: {
      columns: [
        { key: 'number', label: 'Numéro', description: 'Le numéro du document.' },
        { key: 'kind', label: 'Type', description: '« Quittance » ou « Reçu ».' },
        { key: 'lotNumber', label: 'Lot', description: 'Le lot concerné.' },
        { key: 'coownerName', label: 'Copropriétaire', description: 'Le destinataire, ou « Sans copropriétaire ».' },
        { key: 'period', label: 'Période', description: 'La période couverte.' },
        { key: 'amount', label: 'Montant', description: 'Le montant du document.' },
        { key: 'issuedAt', label: 'Émis le', description: "La date d'émission." },
        {
          key: 'email',
          label: 'E-mail',
          description: "La date d'envoi (vert), « Non envoyé », ou « Erreur » avec la cause."
        },
        {
          key: 'backfilled',
          label: 'Rattrapé',
          description: "L'étiquette « Rattrapé » marque un document créé après coup."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: '« Télécharger », « Traduction arabe », « Télécharger (Word) » et « Renvoyer ».'
        }
      ],
      statuses: [
        { value: 'QUITTANCE', label: 'Quittance', description: 'Délivrée quand un appel est entièrement soldé.' },
        { value: 'RECEIPT', label: 'Reçu', description: 'Délivré pour un paiement partiel ou qui laisse une avance.' }
      ],
      notes: ['« Traduction arabe » télécharge le PDF en arabe.']
    },
    steps: [
      {
        title: 'Filtrer',
        detail:
          "Critères : « Type », « Période » (documents dont la période chevauche l'intervalle), « Lot », « Copropriétaire », « Rattrapé »."
      },
      { title: 'Télécharger', detail: 'Un clic sur « Télécharger », « Traduction arabe » ou « Télécharger (Word) ».' },
      { title: 'Renvoyer', detail: '« Renvoyer » renvoie le document par e-mail au copropriétaire du lot.' }
    ],
    consequences: [
      '« Renvoyer » envoie un e-mail : un deuxième renvoi dans les deux minutes est refusé, et le nombre de renvois est limité.',
      'Télécharger ne prévient personne.'
    ],
    faq: [
      {
        q: 'La colonne « E-mail » affiche une erreur.',
        a: "L'envoi a échoué (messagerie qui refuse l'e-mail ou ne répond pas). Corrigez l'adresse du copropriétaire puis cliquez sur « Renvoyer »."
      },
      {
        q: 'Peut-on exporter la liste ?',
        a: "Oui, le menu d'export reprend tous les documents qui correspondent à la recherche."
      },
      {
        q: 'Quelle différence entre « Quittance » et « Reçu » ?',
        a: "Une « Quittance » est délivrée quand un appel est entièrement soldé ; un « Reçu » l'est pour un paiement partiel ou qui laisse une avance."
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Renvoyer demande le droit de modification de la copropriété.' },
    related: [{ label: 'Imprimer les quittances', helpId: 'syndic.quittances.liste.impression' }],
    keywords: ['quittance', 'reçu', 'renvoyer par e-mail', 'traduction arabe', 'Word', 'rattrapé']
  },
  {
    id: 'syndic.quittances.liste.impression',
    kind: 'section',
    title: 'Imprimer les quittances',
    summary:
      "Cette fenêtre prépare un PDF groupé des reçus et quittances d'une période, placés sur des feuilles A4 (1 à 3 colonnes, 1 à 4 lignes). Vous pouvez le prévisualiser avant de le télécharger.",
    howToRead: {
      notes: [
        '« Période » : obligatoire ; raccourcis « Mois en cours », « Trimestre en cours », « Année en cours ».',
        '« Type de document » : « Quittances », « Reçus » ou « Tous ».',
        '« Portée » : « Tous les copropriétaires » ou « Un copropriétaire ou un lot » (choisir le lot).',
        '« Mise en page A4 » : « Colonnes » (1 à 3) et « Lignes » (1 à 4), avec un petit schéma de la feuille.'
      ]
    },
    steps: [
      { title: 'Choisir la période', detail: 'Les deux dates, ou un raccourci.' },
      { title: 'Choisir le type et la portée', detail: 'Tous les copropriétaires, ou un lot.' },
      { title: 'Régler la mise en page', detail: 'Colonnes et lignes par feuille.' },
      { title: 'Aperçu', detail: 'Affiche le PDF dans la fenêtre.' },
      { title: 'Télécharger', detail: 'Enregistre le PDF groupé.' }
    ],
    consequences: [
      "L'impression ne modifie aucun document et n'envoie aucun e-mail.",
      'Limites : 500 documents au plus et 250 feuilles au plus par impression ; un message vous invite à réduire la période ou à augmenter le nombre de quittances par feuille.',
      'Les impressions sont limitées en fréquence : au-delà, attendez une minute ; une seule impression à la fois.'
    ],
    faq: [
      {
        q: 'Pourquoi « Aperçu » et « Télécharger » sont-ils grisés ?',
        a: 'Il faut une période, et un lot si vous choisissez « Un copropriétaire ou un lot ».'
      },
      {
        q: '« Aucun document ne correspond » ?',
        a: "Aucun reçu ni quittance n'existe pour cette période et ce type. Élargissez la période ou générez les quittances manquantes."
      },
      {
        q: "Combien de quittances peut-on imprimer d'un coup ?",
        a: 'Au plus 500 documents et 250 feuilles par impression. Au-delà, réduisez la période ou augmentez le nombre de quittances par feuille.'
      }
    ],
    permissions: { feature: 'SYNDIC', note: 'Imprimer demande le droit de consultation de la copropriété.' },
    related: [{ label: 'Reçus et quittances', helpId: 'syndic.quittances.liste.tableau' }],
    keywords: ['imprimer', 'impression groupée', 'A4', 'grille', 'PDF', 'quittances']
  }
];

export default entries;
