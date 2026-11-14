import type { HelpEntry } from '../../../types';

/** Zone « terrains » du module « patrimoine » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'patrimoine.terrains',
    kind: 'page',
    title: 'Régularisation foncière',
    summary:
      "Suivez les démarches de régularisation foncière de vos terrains, de l'attestation villageoise au titre foncier. Chaque dossier regroupe les étapes, les échéances, les frais et les pièces d'un bien.",
    purpose:
      'Régulariser un terrain demande plusieurs démarches successives. Cet écran vous montre, pour chaque bien, où en est le dossier, ce qui est en retard et ce que cela coûte.',
    steps: [
      {
        title: 'Ouvrir un dossier',
        detail: 'Cliquez sur « Nouveau dossier », choisissez le bien et la filière, puis « Créer le dossier ».'
      },
      {
        title: 'Retrouver un dossier',
        detail: 'Utilisez la recherche, ou les filtres Statut et Bien.'
      },
      {
        title: 'Suivre',
        detail: 'Cliquez sur le nom du bien pour ouvrir le dossier et faire avancer ses étapes.'
      }
    ],
    consequences: [
      "Un bien ne peut avoir qu'un seul dossier « En cours » à la fois : un deuxième est refusé.",
      "La filière « Côte d'Ivoire » est signalée « À valider par un juriste local » : ne la prenez pas pour un avis juridique.",
      'Les frais de régularisation sont un chiffre à part : ils ne sont pas ajoutés au coût de revient du bien.'
    ],
    faq: [
      {
        q: 'Pourquoi ne puis-je pas créer un dossier pour ce bien ?',
        a: "Ce bien a déjà un dossier de régularisation « En cours ». Terminez-le ou abandonnez-le d'abord."
      },
      {
        q: 'Que veut dire « À valider » ?',
        a: "La filière n'a pas encore été confirmée par un juriste local : faites-la vérifier avant de vous y fier."
      },
      {
        q: 'La liste est-elle partageable ?',
        a: "Oui : les filtres sont dans l'adresse de la page, que vous pouvez copier."
      },
      {
        q: 'Je ne vois pas le bouton « Nouveau dossier ».',
        a: 'Créer un dossier demande le droit de modifier les biens ; consulter demande celui de voir les biens.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Consulter demande le droit « Voir les biens » ; créer et modifier un dossier demandent « Modifier les biens ».'
    },
    related: [
      { label: 'Tableau des dossiers', helpId: 'patrimoine.terrains.liste' },
      { label: 'Nouveau dossier', helpId: 'patrimoine.terrains.nouveau' },
      { label: "Détail d'un dossier", helpId: 'patrimoine.terrain' }
    ],
    keywords: [
      'terrain',
      'régularisation foncière',
      'titre foncier',
      'ACD',
      'attestation villageoise',
      'bornage',
      'géomètre',
      'dossier foncier'
    ]
  },
  {
    id: 'patrimoine.terrains.liste',
    kind: 'table',
    title: 'Tableau des dossiers de régularisation',
    summary:
      "Chaque ligne est un dossier : le bien, la filière, l'avancement, le statut, les frais, la prochaine échéance et les étapes en retard.",
    howToRead: {
      columns: [
        {
          key: 'bien',
          label: 'Bien',
          description: 'Le titre du bien (cliquez pour ouvrir le dossier) et sa référence.'
        },
        {
          key: 'filiere',
          label: 'Filière',
          description:
            "Le parcours suivi. L'étiquette « À valider » signale une filière à faire vérifier par un juriste local."
        },
        {
          key: 'avancement',
          label: 'Avancement',
          description: "Le pourcentage et le nombre d'étapes terminées sur le total."
        },
        {
          key: 'statut',
          label: 'Statut',
          description: "L'état du dossier (voir ci-dessous)."
        },
        {
          key: 'frais',
          label: 'Frais engagés',
          description: 'La somme des coûts saisis sur les étapes, en FCFA.'
        },
        {
          key: 'echeance',
          label: 'Prochaine échéance',
          description:
            "La date d'échéance la plus proche parmi les étapes non terminées d'un dossier en cours ; un tiret s'il n'y en a pas."
        },
        {
          key: 'retard',
          label: 'Étapes en retard',
          description: "Le nombre d'étapes « À faire » ou « En cours » dont l'échéance est dépassée."
        }
      ],
      statuses: [
        {
          value: 'EN_COURS',
          label: 'En cours',
          description: 'Le dossier avance : ses étapes peuvent être modifiées.'
        },
        {
          value: 'TERMINEE',
          label: 'Terminé',
          description:
            'Toutes les étapes obligatoires sont terminées et le dossier est clos. Il peut être rouvert avec un motif.'
        },
        {
          value: 'ABANDONNEE',
          label: 'Abandonné',
          description: 'Le dossier est arrêté sans être achevé. Il peut être rouvert avec un motif.'
        }
      ],
      notes: [
        "La recherche porte sur le bien, la référence, la filière, l'étape en cours et le statut.",
        "La liste est chargée en entier : il n'y a pas de pages. L'export reprend les dossiers qui correspondent à vos filtres.",
        "Sur téléphone, chaque dossier s'affiche sous forme de carte."
      ]
    },
    steps: [
      {
        title: 'Filtrer par bien',
        detail: 'Le filtre Bien ne propose que les biens qui ont déjà un dossier.'
      },
      {
        title: 'Ouvrir',
        detail: 'Cliquez sur le nom du bien, ou sur la carte sur téléphone.'
      }
    ],
    faq: [
      {
        q: 'Pourquoi la prochaine échéance est-elle vide ?',
        a: "Le dossier n'est plus en cours, ou aucune étape non terminée n'a d'échéance."
      },
      {
        q: 'Que sont les frais engagés ?',
        a: 'Le total des coûts saisis dans chaque étape, en FCFA.'
      },
      {
        q: "Comment retrouver tous les dossiers d'un terrain ?",
        a: "Filtrez par bien : les dossiers terminés ou abandonnés du bien s'affichent aussi."
      }
    ],
    permissions: { feature: 'PATRIMOINE' },
    related: [{ label: "Détail d'un dossier", helpId: 'patrimoine.terrain' }],
    keywords: ['dossiers', 'avancement', 'frais', 'échéance', 'retard', 'statut']
  },
  {
    id: 'patrimoine.terrains.nouveau',
    kind: 'section',
    title: 'Nouveau dossier de régularisation',
    summary:
      "Ce formulaire ouvre le dossier d'un bien. Selon la filière choisie, les étapes sont préparées pour vous ou saisies par vous.",
    purpose:
      "Vous choisissez le bien, la filière, éventuellement la date de début et des notes. Le dossier s'ouvre aussitôt « En cours ».",
    steps: [
      {
        title: 'Bien',
        detail: 'Recherchez et choisissez le bien concerné.'
      },
      {
        title: 'Filière',
        detail:
          "« Côte d'Ivoire — de l'attestation villageoise au titre foncier » prépare six étapes. « Personnalisée » vous laisse écrire vos propres étapes."
      },
      {
        title: 'Date de début et notes',
        detail: "La date de début est facultative : à défaut, c'est la date du jour."
      },
      {
        title: 'Étapes personnalisées',
        detail:
          'Pour la filière personnalisée, ajoutez de 1 à 30 étapes : libellé, échéance facultative, case « Obligatoire ».'
      },
      {
        title: 'Créer',
        detail: 'Cliquez sur « Créer le dossier » : vous arrivez sur le détail du dossier.'
      }
    ],
    consequences: [
      "Les six étapes de la filière « Côte d'Ivoire » sont toutes obligatoires : Attestation villageoise, Dossier technique du géomètre, Bornage contradictoire, Demande d'ACD au ministère, Arrêté de concession définitive (ACD), Titre foncier.",
      "Aucune durée n'est proposée : fixez vous-même les échéances dans chaque étape.",
      'Si le bien a déjà un dossier en cours, la création est refusée avec le message « Ce bien a déjà un dossier de régularisation en cours ».'
    ],
    faq: [
      {
        q: 'Puis-je changer de filière après la création ?',
        a: 'Non, la filière est fixée à la création.'
      },
      {
        q: "Puis-je modifier les étapes de la filière « Côte d'Ivoire » ?",
        a: "Leurs libellés et leur caractère obligatoire sont fixes. Vous pouvez modifier l'échéance, le coût, les notes et la pièce de chaque étape."
      },
      {
        q: "Combien d'étapes peut avoir une filière personnalisée ?",
        a: 'Au moins une et au plus trente.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Demande le droit « Modifier les biens ».'
    },
    related: [{ label: "Détail d'un dossier", helpId: 'patrimoine.terrain' }],
    keywords: ['nouveau dossier', 'filière', 'personnalisée', "Côte d'Ivoire", 'créer']
  },
  {
    id: 'patrimoine.terrain',
    kind: 'page',
    title: 'Détail du dossier de régularisation',
    summary:
      "Un dossier suit la régularisation d'un bien étape par étape : avancement, frais, frise des étapes et notes. Vous le terminez, l'abandonnez ou le rouvrez depuis le haut de la page.",
    purpose:
      "C'est ici que vous faites avancer chaque démarche, rattachez les pièces justificatives et gardez la trace des coûts.",
    howToRead: {
      statuses: [
        { value: 'EN_COURS', label: 'En cours', description: 'Le dossier est modifiable.' },
        {
          value: 'TERMINEE',
          label: 'Terminé',
          description: "Dossier clos ; la date de clôture s'affiche. Tout est en lecture seule."
        },
        {
          value: 'ABANDONNEE',
          label: 'Abandonné',
          description: "Dossier arrêté ; la date de clôture s'affiche. Tout est en lecture seule."
        }
      ],
      notes: [
        "Avancement : le pourcentage d'étapes terminées et leur nombre sur le total.",
        "Frais de régularisation : la somme des coûts des étapes. Ce montant n'est pas inclus dans le coût de revient du bien.",
        'Un bandeau « À valider par un juriste local » apparaît sur une filière non confirmée.'
      ]
    },
    steps: [
      {
        title: 'Faire avancer les étapes',
        detail: 'Dans la carte « Étapes », cliquez sur « Détails et actions » pour une étape.'
      },
      {
        title: 'Terminer le dossier',
        detail:
          'Bouton « Terminer le dossier » : possible quand toutes les étapes obligatoires sont terminées. Un motif est facultatif.'
      },
      {
        title: 'Abandonner le dossier',
        detail: 'Bouton « Abandonner le dossier », avec un motif facultatif.'
      },
      {
        title: 'Rouvrir',
        detail: 'Un dossier terminé ou abandonné se rouvre avec « Rouvrir le dossier » ; le motif est obligatoire.'
      }
    ],
    consequences: [
      "Terminer ou abandonner ferme le dossier : plus aucune étape ni note ne peut être modifiée tant qu'il n'est pas rouvert.",
      "On ne peut pas terminer un dossier dont une étape obligatoire n'est pas terminée.",
      'Rouvrir est refusé si le bien a entre-temps un autre dossier en cours.',
      "Les administrateurs de l'agence peuvent recevoir une alerte par e-mail pour une étape en retard (une seule fois par échéance), si cette notification est activée pour l'agence."
    ],
    faq: [
      {
        q: 'Pourquoi « Terminer le dossier » est-il refusé ?',
        a: "Une étape obligatoire n'est pas terminée : le message « Toutes les étapes obligatoires doivent être terminées. » l'indique."
      },
      {
        q: 'Pourquoi tout est-il grisé ?',
        a: 'Le dossier est terminé ou abandonné. Cliquez sur « Rouvrir le dossier » et donnez un motif.'
      },
      {
        q: "Où modifier le coût d'une étape ?",
        a: "Dans le panneau de l'étape, champ « Coût engagé (XOF) »."
      },
      {
        q: 'Où retrouver la fiche du bien ?',
        a: 'Le lien « Voir la fiche du bien » est sous le titre.'
      }
    ],
    permissions: {
      feature: 'PATRIMOINE',
      note: 'Consulter demande « Voir les biens » ; terminer, abandonner, rouvrir et modifier demandent « Modifier les biens ».'
    },
    related: [
      { label: 'Les étapes du dossier', helpId: 'patrimoine.terrain.etapes' },
      { label: "Le panneau d'une étape", helpId: 'patrimoine.terrain.etape' },
      { label: 'Les notes du dossier', helpId: 'patrimoine.terrain.notes' },
      { label: 'Retour aux dossiers', helpId: 'patrimoine.terrains' }
    ],
    keywords: ['dossier', 'terminer', 'abandonner', 'rouvrir', 'frais de régularisation', 'clôture']
  },
  {
    id: 'patrimoine.terrain.etapes',
    kind: 'section',
    title: 'Étapes du dossier',
    summary:
      "La frise liste les étapes dans l'ordre, avec leur statut, leurs dates, leur coût et la pièce rattachée. Les actions se font dans le panneau de chaque étape.",
    purpose:
      "Une étape est une démarche à accomplir. La filière « Côte d'Ivoire » en compte six, toutes obligatoires ; une filière personnalisée a vos propres étapes.",
    howToRead: {
      statuses: [
        { value: 'A_FAIRE', label: 'À faire', description: "L'étape n'est pas commencée." },
        {
          value: 'EN_COURS',
          label: 'En cours',
          description: "L'étape est commencée ; sa date de début est enregistrée."
        },
        { value: 'TERMINEE', label: 'Terminée', description: "L'étape est achevée ; sa date de fin est enregistrée." },
        { value: 'BLOQUEE', label: 'Bloquée', description: "L'étape est en attente d'un déblocage." }
      ],
      notes: [
        "Filière « Côte d'Ivoire », dans l'ordre : 1. Attestation villageoise ; 2. Dossier technique du géomètre ; 3. Bornage contradictoire ; 4. Demande d'ACD au ministère ; 5. Arrêté de concession définitive (ACD) ; 6. Titre foncier.",
        "Une étape non obligatoire porte l'étiquette « Facultative ». « En retard » signale une étape « À faire » ou « En cours » dont l'échéance est passée.",
        'La ligne « Échéance » affiche aussi le début et la fin, et la ligne « Coût » la pièce rattachée.'
      ]
    },
    steps: [
      {
        title: 'Ouvrir une étape',
        detail: 'Cliquez sur « Détails et actions ».'
      },
      {
        title: 'Ajouter une étape',
        detail: 'Filière personnalisée seulement, dossier en cours : saisissez le libellé puis « Ajouter une étape ».'
      }
    ],
    consequences: [
      'On ne peut terminer une étape que si toutes les étapes obligatoires qui la précèdent sont terminées.',
      "Les étapes de la filière « Côte d'Ivoire » ne peuvent ni être ajoutées ni être supprimées.",
      'Une étape ajoutée est obligatoire.'
    ],
    faq: [
      {
        q: "Pourquoi ne puis-je pas terminer l'étape 3 ?",
        a: "Une étape obligatoire précédente n'est pas terminée."
      },
      {
        q: 'Que signifie une pastille rouge sur la frise ?',
        a: "L'étape est en retard ou bloquée."
      },
      {
        q: "Où ajouter une étape à la filière « Côte d'Ivoire » ?",
        a: "Ce n'est pas possible : seules les filières personnalisées acceptent des étapes en plus."
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Modifier demande le droit « Modifier les biens ».' },
    related: [{ label: "Le panneau d'une étape", helpId: 'patrimoine.terrain.etape' }],
    keywords: ['étapes', 'frise', 'attestation villageoise', 'bornage', 'ACD', 'titre foncier', 'retard']
  },
  {
    id: 'patrimoine.terrain.etape',
    kind: 'section',
    title: "Panneau d'une étape",
    summary:
      "Le panneau latéral d'une étape sert à changer son statut, régler l'échéance et le coût, écrire des notes et rattacher la pièce justificative.",
    purpose: "Chaque étape garde ses dates, son coût et sa pièce : le panneau est l'endroit où vous les renseignez.",
    steps: [
      {
        title: 'Changer le statut',
        detail:
          "Les boutons proposés dépendent de l'état : « Démarrer », « Débloquer », « Terminer l'étape », « Marquer comme bloquée », « Remettre à faire », « Rouvrir l'étape »."
      },
      {
        title: 'Régler échéance, coût et notes',
        detail: "Renseignez l'échéance, le coût engagé (XOF) et les notes, puis « Enregistrer l'étape »."
      },
      {
        title: 'Rattacher une pièce',
        detail:
          'Choisissez un document existant du bien puis « Rattacher », ou téléversez un nouveau fichier. « Télécharger la pièce » et « Détacher la pièce » sont aussi proposés.'
      },
      {
        title: 'Supprimer',
        detail: "« Supprimer l'étape » : réservé aux étapes d'une filière personnalisée, à faire, sans coût ni pièce."
      }
    ],
    consequences: [
      "Rouvrir une étape terminée demande un motif, et n'est possible que si aucune étape suivante n'est terminée : rouvrez d'abord les suivantes.",
      "La suppression d'une étape est définitive. Un dossier garde au moins une étape.",
      "Une pièce téléversée est ajoutée aux documents du bien, avec le type de pièce suggéré pour l'étape ; elle y reste même si vous la détachez de l'étape.",
      "Sur la filière « Côte d'Ivoire », le libellé et le caractère obligatoire ne se modifient pas."
    ],
    faq: [
      {
        q: "Pourquoi un seul bouton de statut s'affiche-t-il ?",
        a: "Seuls les changements autorisés sont proposés ; par exemple « Terminer l'étape » disparaît si une étape obligatoire précédente n'est pas terminée."
      },
      {
        q: 'Quelle pièce joindre à chaque étape ?',
        a: "Le type de pièce suggéré est rappelé sous « Ou téléverser un nouveau fichier » : par exemple Plan pour le dossier du géomètre et le bornage, Arrêté de concession définitive (ACD) pour l'ACD, Titre de propriété pour le titre foncier."
      },
      {
        q: 'Tous les champs sont grisés.',
        a: "Le dossier n'est plus « En cours » : rouvrez-le depuis sa page."
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Demande le droit « Modifier les biens ».' },
    related: [{ label: 'Les étapes du dossier', helpId: 'patrimoine.terrain.etapes' }],
    keywords: ['étape', 'pièce justificative', 'coût', 'échéance', 'bloquer', "rouvrir l'étape"]
  },
  {
    id: 'patrimoine.terrain.notes',
    kind: 'section',
    title: 'Notes du dossier',
    summary: 'Un espace libre pour garder le contexte du dossier : interlocuteurs, démarches en attente, décisions.',
    steps: [
      {
        title: 'Écrire',
        detail: 'Saisissez vos notes (5 000 caractères au plus).'
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer les notes ».'
      }
    ],
    consequences: ['Les notes ne sont modifiables que tant que le dossier est « En cours ».'],
    faq: [
      {
        q: "Les notes sont-elles différentes de celles d'une étape ?",
        a: 'Oui : ces notes concernent tout le dossier, chaque étape a les siennes.'
      },
      {
        q: 'Pourquoi le bouton « Enregistrer les notes » a-t-il disparu ?',
        a: 'Le dossier est terminé ou abandonné.'
      },
      {
        q: 'Puis-je saisir des notes dès la création ?',
        a: 'Oui, le formulaire de création a un champ « Notes ».'
      }
    ],
    permissions: { feature: 'PATRIMOINE', note: 'Demande le droit « Modifier les biens ».' },
    related: [{ label: 'Détail du dossier', helpId: 'patrimoine.terrain' }],
    keywords: ['notes', 'commentaires', 'suivi']
  }
];

export default entries;
