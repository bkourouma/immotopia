import type { HelpEntry } from '../../../types';

/** Zone « assurances » du module « patrimoine » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.sinistres',
    kind: 'page',
    title: 'Sinistres',
    summary:
      "Cette page liste les sinistres de toute l'agence, avec leur statut et leurs montants. Elle sert à suivre et à rechercher ; les changements de statut se font dans la fiche du bien.",
    purpose:
      "Un sinistre est un dommage déclaré à l'assureur. Le suivi complet d'un dossier (statut, pièces, historique) se fait dans l'onglet « Assurances et sinistres » de la fiche du bien concerné.",
    steps: [
      { title: 'Rechercher et filtrer', detail: 'Par texte, statut, bien ou police.' },
      { title: 'Exporter', detail: "Le bouton d'export reprend tous les sinistres correspondant à vos filtres." },
      { title: 'Ouvrir un bien', detail: 'Cliquez sur la référence du bien pour ouvrir sa fiche et gérer le dossier.' }
    ],
    faq: [
      {
        q: 'Où déclarer un sinistre ?',
        a: 'Dans la fiche du bien, onglet « Assurances et sinistres », bouton « Déclarer un sinistre ».'
      },
      {
        q: 'Pourquoi cette page est-elle en lecture seule ?',
        a: "Elle donne la vue d'ensemble ; les actions se font bien par bien."
      },
      { q: 'Je ne vois pas cette page.', a: 'Elle demande « Voir les biens » et un pack incluant le Patrimoine.' }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Demande « Voir les biens ».' },
    related: [{ label: 'Tableau des sinistres', helpId: 'patrimoine.sinistres.liste' }],
    keywords: ['sinistre', 'assurance', 'dommage', 'indemnisation']
  },
  {
    id: 'patrimoine.sinistres.liste',
    kind: 'table',
    title: 'Tableau des sinistres',
    summary:
      'Chaque ligne est un sinistre déclaré dans votre agence, tous biens confondus. Cette page sert à suivre et à rechercher : les changements de statut se font dans la fiche du bien.',
    purpose:
      "Un sinistre est un dommage déclaré à l'assureur (dégât des eaux, incendie, vol…). Cette vue d'ensemble vous montre où en sont tous les dossiers de l'agence, avec les montants réclamés et indemnisés.",
    howToRead: {
      columns: [
        { key: 'bien', label: 'Bien', description: 'La référence du bien. Cliquez dessus pour ouvrir sa fiche.' },
        { key: 'police', label: 'Police', description: "L'assureur et le numéro de la police d'assurance concernée." },
        { key: 'cause', label: 'Cause', description: 'La cause déclarée du sinistre.' },
        { key: 'date', label: 'Date du sinistre', description: "La date à laquelle le dommage s'est produit." },
        { key: 'statut', label: 'Statut', description: "L'avancement du dossier (voir les statuts ci-dessous)." },
        {
          key: 'reclame',
          label: 'Montant réclamé',
          description: "Le montant demandé à l'assureur, dans la devise de la police."
        },
        {
          key: 'indemnise',
          label: 'Indemnisé',
          description:
            "Le montant que l'assureur a accepté de payer. Il reste à 0 tant que le dossier n'est pas tranché."
        },
        {
          key: 'reste',
          label: 'Reste à charge',
          description:
            "Ce qui n'est pas remboursé : montant réclamé moins montant indemnisé. Un tiret (—) s'affiche tant que le dossier n'est ni indemnisé, ni rejeté, ni clos."
        }
      ],
      statuses: [
        { value: 'DECLARED', label: 'Déclaré', description: "Le sinistre vient d'être enregistré." },
        {
          value: 'INSURER_NOTIFIED',
          label: 'Assureur prévenu',
          description: "Vous avez signalé le sinistre à l'assureur."
        },
        { value: 'EXPERTISE', label: 'Expertise', description: "L'assureur fait expertiser le dommage." },
        { value: 'SETTLED', label: 'Indemnisé', description: "L'assureur a fixé une indemnisation." },
        { value: 'REJECTED', label: 'Rejeté', description: "L'assureur a refusé de prendre le sinistre en charge." },
        { value: 'CLOSED', label: 'Clos', description: 'Le dossier est terminé : il ne peut plus être modifié.' }
      ],
      notes: [
        'Les montants sont des sommes en FCFA pour une police en franc CFA ; une police dans une autre devise affiche son code de devise.'
      ]
    },
    steps: [
      { title: 'Rechercher', detail: 'Tapez un bien, une police, un assureur ou un mot de la description.' },
      { title: 'Filtrer', detail: 'Réduisez la liste par statut, par bien ou par police.' },
      {
        title: 'Exporter',
        detail:
          "Le bouton d'export récupère tous les sinistres correspondant à vos filtres, pas seulement la page affichée."
      },
      {
        title: 'Faire avancer un dossier',
        detail: 'Ouvrez la fiche du bien (clic sur sa référence), onglet « Assurances et sinistres », puis « Détail ».'
      }
    ],
    faq: [
      {
        q: 'Où déclarer un nouveau sinistre ?',
        a: 'Pas depuis cette page. Ouvrez la fiche du bien, onglet « Assurances et sinistres », puis « Déclarer un sinistre ».'
      },
      {
        q: 'Pourquoi le reste à charge est-il vide ?',
        a: "Il n'est calculé que lorsque le dossier est indemnisé, rejeté ou clos. Avant, le montant n'est pas connu."
      },
      {
        q: 'Je ne vois aucun sinistre.',
        a: "Aucun sinistre n'a encore été déclaré, ou vos filtres sont trop stricts. Effacez les critères pour revoir toute la liste."
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',

      note: 'La lecture demande « Voir les biens ».'
    },
    related: [
      { label: "Déclarer et suivre un sinistre d'un bien", helpId: 'patrimoine.assurances.sinistres' },
      { label: "Détail d'un sinistre", helpId: 'patrimoine.sinistres.detail' }
    ],
    keywords: ['sinistre', 'assurance', 'dommage', 'dégât des eaux', 'incendie', 'vol', 'indemnisation', 'assureur']
  },
  {
    id: 'patrimoine.sinistres.detail',
    kind: 'section',
    title: "Détail d'un sinistre",
    summary:
      "Ce volet montre toute la vie d'un sinistre : statut, montants, historique daté et pièces jointes. C'est ici que vous le faites avancer.",
    howToRead: {
      notes: [
        "La frise en haut suit le parcours normal : Déclaré, Assureur prévenu, Expertise, Indemnisé, Clos. Un sinistre rejeté remplace l'étape « Indemnisé » par « Rejeté ».",
        "Le montant indemnisé et la franchise sont saisis au passage au statut « Indemnisé ». La franchise est une information : elle n'entre pas dans le calcul.",
        'Le reste à charge est calculé automatiquement (montant réclamé moins montant indemnisé) et ne se saisit pas. Il apparaît une fois le dossier indemnisé, rejeté ou clos.',
        "L'historique liste chaque changement de statut avec sa date, la personne qui l'a fait et sa note éventuelle."
      ]
    },
    steps: [
      {
        title: 'Lire le dossier',
        detail: 'Statut, police, date, cause, description et montants sont en lecture seule.'
      },
      {
        title: 'Faire avancer le dossier',
        detail: 'Utilisez les boutons « Passer à … » sous le tableau (voir leur aide).'
      },
      {
        title: 'Joindre des pièces',
        detail: "Ajoutez photos, devis, rapport d'expertise, courriers ou factures dans la zone « Pièces »."
      }
    ],
    consequences: [
      "Ouvrir ce volet ne modifie rien. Chaque changement de statut est enregistré dans l'historique du dossier et au journal d'audit de l'agence.",
      "Le « Ticket lié » et le « Motif du rejet » n'apparaissent que s'ils existent."
    ],
    faq: [
      {
        q: 'Pourquoi ne vois-je pas de boutons de changement de statut ?',
        a: 'Soit le sinistre est clos (plus aucune étape possible), soit votre rôle ne permet pas de modifier les biens.'
      },
      {
        q: 'Peut-on corriger le montant réclamé ?',
        a: "Pas depuis cet écran : il n'existe pas de formulaire de modification du sinistre dans l'interface."
      }
    ],
    permissions: { note: 'Voir demande « Voir les biens », agir demande « Modifier les biens ».' },
    related: [
      { label: 'Changer le statut', helpId: 'patrimoine.sinistres.transitions' },
      { label: 'Pièces du sinistre', helpId: 'patrimoine.sinistres.documents' }
    ],
    keywords: ['sinistre', 'historique', 'reste à charge', 'franchise', 'indemnisation']
  },
  {
    id: 'patrimoine.sinistres.declaration',
    kind: 'section',
    title: 'Déclarer un sinistre',
    summary:
      "Ce formulaire enregistre un nouveau sinistre sur un bien, rattaché à une de ses polices d'assurance. Le dossier démarre au statut « Déclaré ».",
    steps: [
      {
        title: 'Choisir la police',
        detail:
          "Une police du bien est obligatoire. Sans police, le bouton « Déclarer un sinistre » est grisé : ajoutez d'abord une police."
      },
      { title: 'Date du sinistre', detail: 'Obligatoire ; elle ne peut pas être dans le futur.' },
      {
        title: 'Cause et description',
        detail:
          "Cause : Dégât des eaux, Incendie, Vol, Dommage structurel, Tempête ou Autre. Décrivez ce qui s'est passé."
      },
      {
        title: 'Montant réclamé',
        detail:
          "Le montant demandé à l'assureur, dans la devise de la police (FCFA en général). La franchise est facultative."
      },
      {
        title: 'Liens facultatifs',
        detail: 'Vous pouvez relier un ticket de maintenance du bien et une dépense déjà saisie.'
      },
      { title: 'Valider', detail: 'Cliquez sur « Déclarer ».' }
    ],
    consequences: [
      "Le sinistre est créé au statut « Déclaré » et la création est tracée au journal d'audit.",
      "Aucune dépense n'est créée : la dépense liée n'est qu'un lien. Aucun message n'est envoyé à l'assureur par l'application."
    ],
    faq: [
      {
        q: 'Peut-on supprimer ou modifier un sinistre déclaré ?',
        a: "L'interface ne propose ni modification ni suppression. Les montants indemnisés se saisissent au changement de statut."
      },
      { q: 'Pourquoi la devise est-elle imposée ?', a: 'Le sinistre est déclaré dans la devise de sa police.' }
    ],
    permissions: { note: 'Demande « Modifier les biens ».' },
    related: [{ label: "Polices d'assurance du bien", helpId: 'patrimoine.assurances.polices' }],
    keywords: ['déclarer', 'sinistre', 'déclaration', 'assurance']
  },
  {
    id: 'patrimoine.sinistres.transitions',
    kind: 'section',
    title: "Changer le statut d'un sinistre",
    summary:
      'Les boutons « Passer à … » font avancer le dossier. Seules les étapes autorisées depuis le statut actuel sont proposées.',
    howToRead: {
      statuses: [
        { value: 'DECLARED', label: 'Déclaré', description: 'Étape suivante possible : « Assureur prévenu ».' },
        {
          value: 'INSURER_NOTIFIED',
          label: 'Assureur prévenu',
          description: "Étapes possibles : « Expertise », « Indemnisé » ou « Rejeté » (l'expertise peut être sautée)."
        },
        { value: 'EXPERTISE', label: 'Expertise', description: 'Étapes possibles : « Indemnisé » ou « Rejeté ».' },
        { value: 'SETTLED', label: 'Indemnisé', description: 'Étape suivante possible : « Clos ».' },
        { value: 'REJECTED', label: 'Rejeté', description: 'Étape suivante possible : « Clos ».' },
        { value: 'CLOSED', label: 'Clos', description: 'Aucune étape possible.' }
      ]
    },
    steps: [
      {
        title: 'Cliquer sur le bouton voulu',
        detail: "« Assureur prévenu », « Expertise » et « Clos » s'appliquent tout de suite."
      },
      {
        title: 'Indemnisé',
        detail:
          'Une fenêtre demande le montant indemnisé (obligatoire, au plus égal au montant réclamé), la franchise et une note facultative.'
      },
      { title: 'Rejeté', detail: 'Une fenêtre demande le motif du rejet (obligatoire) et une note facultative.' },
      { title: 'Confirmer', detail: 'Cliquez sur « Confirmer ».' }
    ],
    consequences: [
      "Le changement est daté et enregistré dans l'historique avec votre nom, et tracé au journal d'audit.",
      "« Passer à Assureur prévenu » n'envoie rien à l'assureur : cela enregistre seulement que vous l'avez prévenu.",
      'Au rejet, le montant indemnisé est fixé à 0 : le reste à charge est alors égal au montant réclamé.',
      'On ne revient jamais en arrière. « Clos » est définitif : le sinistre et ses pièces ne sont plus modifiables.'
    ],
    faq: [
      {
        q: 'Je me suis trompé de statut, que faire ?',
        a: "Le changement ne s'annule pas depuis l'interface. Vérifiez donc avant de confirmer, surtout pour « Indemnisé », « Rejeté » et « Clos »."
      },
      { q: 'Pourquoi le montant indemnisé est-il refusé ?', a: 'Il ne peut pas dépasser le montant réclamé.' }
    ],
    permissions: { note: 'Demande « Modifier les biens ».' },
    related: [{ label: "Détail d'un sinistre", helpId: 'patrimoine.sinistres.detail' }],
    keywords: ['statut', 'indemniser', 'rejeter', 'clore', 'expertise']
  },
  {
    id: 'patrimoine.sinistres.documents',
    kind: 'section',
    title: "Pièces d'un sinistre",
    summary:
      'Cette zone regroupe les photos, devis, rapports et courriers du dossier, classés par nature. Chaque pièce se télécharge ou se retire.',
    howToRead: {
      notes: [
        "Natures proposées : Photo avant, Photo après, Devis, Rapport d'expertise, Courrier de l'assureur, Facture.",
        'Formats acceptés : PDF, Word (.doc, .docx), images JPG, PNG et TIFF.'
      ]
    },
    steps: [
      { title: 'Choisir la nature', detail: 'Dans la liste « Nature de la pièce ».' },
      { title: 'Ajouter', detail: 'Cliquez sur « Ajouter une pièce » et choisissez le fichier.' },
      {
        title: 'Télécharger ou retirer',
        detail: '« Télécharger » récupère le fichier ; « Retirer » détache la pièce du sinistre après confirmation.'
      }
    ],
    consequences: [
      "Le fichier est d'abord versé dans les documents du bien (type « Assurance »), puis rattaché au sinistre. Si le rattachement échoue, le fichier reste dans les documents du bien.",
      '« Retirer » ne supprime pas le fichier : il reste dans les documents du bien.',
      'Dès que le sinistre est clos, les pièces ne peuvent plus être ajoutées ni retirées.'
    ],
    faq: [
      { q: 'Où retrouver le fichier retiré ?', a: 'Dans les documents du bien, avec le type « Assurance ».' },
      {
        q: "Pourquoi n'y a-t-il plus de bouton d'ajout ?",
        a: 'Le sinistre est clos, ou votre rôle ne permet pas de modifier les biens.'
      }
    ],
    permissions: { note: 'Télécharger demande « Voir les biens », ajouter ou retirer demande « Modifier les biens ».' },
    related: [{ label: 'Coffre-fort de documents du bien', helpId: 'patrimoine.bien.coffre-fort' }],
    keywords: ['pièce', 'photo', 'devis', 'expertise', 'facture', 'document']
  },
  {
    id: 'patrimoine.assurances.polices',
    kind: 'section',
    title: "Polices d'assurance du bien",
    summary:
      "Cette carte liste les contrats d'assurance du bien (assureur, couverture, dates, prime). Elle permet d'ajouter, de modifier ou de supprimer une police.",
    purpose:
      'Une police est indispensable pour déclarer un sinistre. Son statut est calculé à partir de ses dates, pour repérer les contrats qui arrivent à terme.',
    steps: [
      {
        title: 'Ajouter',
        detail:
          'Cliquez sur « Ajouter une police » : assureur, numéro, type de couverture, début, fin, prime annuelle, devise.'
      },
      {
        title: 'Type de couverture',
        detail: 'Multirisque habitation, Multirisque immeuble, Responsabilité du propriétaire ou Autre.'
      },
      { title: 'Pièce justificative', detail: 'Facultative : joignez le contrat (PDF, Word ou image).' },
      { title: 'Modifier ou supprimer', detail: 'Boutons « Modifier » et « Supprimer » de la ligne.' }
    ],
    consequences: [
      'La date de fin ne peut pas précéder la date de début.',
      'La pièce jointe est versée dans les documents du bien (type « Assurance »).',
      'Une police qui a des sinistres rattachés ne peut pas être supprimée, et sa devise ne peut plus changer.',
      "À l'approche de la fin d'une police (30 jours), un e-mail d'alerte est envoyé aux administrateurs de l'agence si cette notification est activée."
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas supprimer une police ?',
        a: 'Des sinistres y sont rattachés. Elle doit être conservée.'
      },
      { q: 'Je ne vois pas « Ajouter une police ».', a: 'Cette action demande le droit « Modifier les biens ».' }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Voir demande « Voir les biens », modifier demande « Modifier les biens ».'
    },
    related: [{ label: 'Tableau des polices', helpId: 'patrimoine.assurances.polices.tableau' }],
    keywords: ['police', 'assurance', 'contrat', 'assureur', 'prime', 'couverture']
  },
  {
    id: 'patrimoine.assurances.polices.tableau',
    kind: 'table',
    title: "Tableau des polices d'assurance",
    summary:
      "Chaque ligne est une police du bien. Le statut et l'échéance se calculent d'après les dates et la date du jour.",
    howToRead: {
      columns: [
        { key: 'insurer', label: 'Assureur', description: "Le nom de la compagnie d'assurance." },
        { key: 'policyNumber', label: 'Numéro de police', description: 'Le numéro du contrat.' },
        { key: 'coverageType', label: 'Couverture', description: 'Le type de garantie souscrite.' },
        { key: 'startDate', label: 'Début', description: 'La date de début de la police.' },
        { key: 'endDate', label: 'Fin', description: 'La date de fin de la police.' },
        {
          key: 'annualPremium',
          label: 'Prime annuelle',
          description: "Le montant payé chaque année (prime) ; un tiret si elle n'est pas renseignée."
        },
        { key: 'status', label: 'Statut', description: 'Calculé automatiquement (voir ci-dessous).' },
        {
          key: 'daysToExpiry',
          label: 'Échéance',
          description:
            'Le nombre de jours avant la fin, ou depuis la fin. Un tiret pour une police pas encore commencée.'
        }
      ],
      statuses: [
        { value: 'UPCOMING', label: 'À venir', description: "La police n'a pas encore commencé." },
        { value: 'ACTIVE', label: 'Active', description: 'En cours, avec plus de 30 jours avant la fin.' },
        {
          value: 'EXPIRING_SOON',
          label: 'Expire bientôt',
          description: 'En cours, avec 30 jours ou moins avant la fin.'
        },
        { value: 'EXPIRED', label: 'Expirée', description: 'La date de fin est passée.' }
      ]
    },
    faq: [
      {
        q: 'Le statut peut-il être choisi ?',
        a: 'Non, il se déduit des dates. Pour renouveler, modifiez les dates ou ajoutez une nouvelle police.'
      },
      { q: "À quoi sert le bouton d'export ?", a: 'Il exporte le tableau des polices du bien.' },
      { q: 'La colonne Actions est absente.', a: "Elle n'apparaît que si vous avez le droit « Modifier les biens »." }
    ],
    related: [{ label: 'Polices du bien', helpId: 'patrimoine.assurances.polices' }],
    keywords: ['police', 'échéance', 'expire', 'prime']
  },
  {
    id: 'patrimoine.assurances.sinistres',
    kind: 'section',
    title: "Sinistres d'un bien",
    summary:
      "Cette carte liste les sinistres du bien avec leur cause, leur statut, le montant réclamé et la frise d'avancement. « Détail » ouvre le dossier complet.",
    steps: [
      { title: 'Déclarer', detail: 'Cliquez sur « Déclarer un sinistre » (il faut au moins une police sur le bien).' },
      { title: 'Suivre', detail: "La frise sous chaque ligne montre l'étape atteinte." },
      { title: 'Ouvrir un dossier', detail: 'Cliquez sur « Détail » pour changer le statut et gérer les pièces.' },
      {
        title: 'Rechercher',
        detail: 'Au-delà de 10 sinistres, une barre de recherche et des filtres (statut, date, montant) apparaissent.'
      }
    ],
    faq: [
      {
        q: 'Pourquoi « Déclarer un sinistre » est-il grisé ?',
        a: "Le bien n'a aucune police d'assurance. Ajoutez-en une d'abord."
      },
      { q: "Où voir les sinistres de toute l'agence ?", a: 'Dans la page « Sinistres » du module Patrimoine.' }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Déclarer et changer le statut demandent « Modifier les biens ».' },
    related: [
      { label: 'Déclarer un sinistre', helpId: 'patrimoine.sinistres.declaration' },
      { label: 'Tous les sinistres', helpId: 'patrimoine.sinistres.liste' }
    ],
    keywords: ['sinistre', 'déclarer', 'dossier', 'assurance']
  },
  {
    id: 'patrimoine.assurances.carnet',
    kind: 'section',
    title: "Carnet d'entretien du bien",
    summary:
      'Le carnet garde la mémoire des interventions sur le bien (plomberie, électricité, climatisation…), la plus récente en haut.',
    purpose:
      "Il aide à retrouver ce qui a été fait, par qui et à quel coût, et à suivre les prochaines échéances d'entretien et les fins de garantie.",
    howToRead: {
      notes: [
        'Catégories : Plomberie, Électricité, Climatisation, Groupe électrogène, Toiture et étanchéité, Peinture, Autre.',
        'Sous chaque intervention : prestataire, coût, prochaine échéance et fin de garantie, quand ils sont renseignés.'
      ]
    },
    steps: [
      {
        title: 'Ajouter',
        detail:
          'Cliquez sur « Ajouter une intervention » : catégorie, date, prestataire, coût, devise, description, échéances.'
      },
      { title: 'Filtrer', detail: "La liste « Toutes les catégories » restreint l'affichage à une catégorie." },
      { title: 'Exporter', detail: 'Le bouton « Exporter (CSV) » télécharge toutes les interventions du bien.' },
      { title: 'Modifier ou supprimer', detail: 'Liens « Modifier » et « Supprimer » sous chaque intervention.' }
    ],
    consequences: [
      'Le prestataire se choisit parmi ceux de votre agence ; la pièce justificative facultative est versée dans les documents du bien (type « Autre »).',
      "La suppression d'une intervention est définitive.",
      "Une prochaine échéance ou une fin de garantie qui approche (30 jours) déclenche un e-mail d'alerte aux administrateurs de l'agence, si cette notification est activée."
    ],
    faq: [
      { q: "L'export suit-il le filtre de catégorie ?", a: 'Non, il contient toutes les interventions du bien.' },
      {
        q: 'Je ne vois pas les boutons de modification.',
        a: "Ils demandent le droit « Modifier les biens ». L'export reste disponible."
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Modifier demande « Modifier les biens ».' },
    keywords: ['entretien', 'intervention', 'garantie', 'prestataire', 'maintenance', 'carnet']
  }
];

export default entries;
