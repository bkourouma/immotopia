import type { HelpEntry } from '../../../types';

/** Zone « pilotage » du module « administration » (fr) : outils du super-administrateur de la plateforme. */
const entries: HelpEntry[] = [
  // ------------------------------------------------------------------ Statistiques globales
  {
    id: 'administration.pilotage.statistiques',
    kind: 'page',
    title: 'Statistiques globales',
    summary:
      "Cet écran donne l'état actuel de la plateforme : nombre d'agences, de collaborateurs, d'abonnements et de modules activés. Les chiffres sont recomptés à chaque ouverture de la page.",
    purpose:
      "Le super-administrateur de la plateforme y suit d'un coup d'œil la taille du parc d'agences et leur état. C'est un écran de lecture : rien ne s'y modifie.",
    howToRead: {
      notes: [
        'Les chiffres ne portent sur aucune période : ils comptent tout ce qui existe au moment où vous ouvrez la page, toutes agences confondues.',
        "Il n'y a pas de bouton « Actualiser » : rouvrez la page pour recompter.",
        "En cas d'échec du chargement, un message d'erreur remplace les chiffres."
      ]
    },
    steps: [
      { title: 'Ouvrir la page', detail: 'Menu « Administration », entrée « Statistiques ».' },
      {
        title: 'Lire les quatre cartes du haut',
        detail: 'Agences, collaborateurs, abonnements, modules : voir la fiche « Les quatre indicateurs ».'
      },
      {
        title: 'Lire la carte « Activations par module »',
        detail: "Elle indique, pour chaque module, dans combien d'agences il est activé."
      }
    ],
    consequences: ["Écran en lecture seule : l'ouvrir ne change rien, ni pour les agences ni pour leurs utilisateurs."],
    faq: [
      {
        q: 'Sur quelle période portent les chiffres ?',
        a: "Sur aucune : ce sont des totaux au moment de l'affichage, pas des chiffres du mois ou de l'année."
      },
      {
        q: 'Pourquoi le nombre de collaborateurs dépasse-t-il le nombre de personnes réelles ?',
        a: "L'écran compte les rattachements à une agence. Une personne rattachée à deux agences est comptée deux fois."
      },
      {
        q: "Où voir le détail d'une agence ?",
        a: "Dans la liste des agences de la plateforme : ouvrez l'agence voulue pour voir son abonnement, ses modules et ses collaborateurs."
      }
    ],
    permissions: {
      roles: ['Super-administrateur de la plateforme'],
      note: 'Écran réservé au super-administrateur de la plateforme.'
    },
    related: [
      { label: 'Les quatre indicateurs', helpId: 'administration.pilotage.statistiques.indicateurs' },
      { label: 'Activations par module', helpId: 'administration.pilotage.statistiques.modules' },
      { label: 'Liste des agences', to: '/admin/tenants' }
    ],
    keywords: ['statistiques', 'chiffres', 'indicateurs', 'tableau de bord', 'plateforme', "nombre d'agences", 'parc']
  },
  {
    id: 'administration.pilotage.statistiques.indicateurs',
    kind: 'section',
    title: 'Les quatre indicateurs',
    summary:
      'Les quatre cartes du haut comptent les agences, les collaborateurs, les abonnements et les modules. Sous chaque gros chiffre, une ligne détaille une partie du total.',
    purpose: 'Elles donnent la taille de la plateforme et la part qui est réellement en service.',
    howToRead: {
      statuses: [
        { value: 'ACTIVE', label: 'actifs', description: 'Abonnements en cours de validité.' },
        {
          value: 'TRIALING',
          label: 'en essai',
          description: "Abonnements en période d'essai. La mention n'apparaît que s'il y en a."
        },
        {
          value: 'CANCELED',
          label: 'annulés',
          description: "Abonnements annulés. La mention n'apparaît que s'il y en a."
        }
      ],
      notes: [
        "Total agences : toutes les agences, quel que soit leur état (y compris celles en attente). Dessous : « actifs » et, s'il y en a, « suspendus ».",
        'Collaborateurs : tous les rattachements de personnes à une agence, actifs ou non. Dessous : « actifs ». Une personne dans deux agences compte deux fois.',
        "Abonnements : tous les abonnements. Un abonnement en retard de paiement ou suspendu est compté dans le total, mais n'a pas de mention propre.",
        "Modules activés : l'écran affiche le nombre de modules connus de la liste (quatre : Agence, Syndic, Promoteur et Patrimoine), même si aucune agence n'en utilise. Ce n'est pas un nombre d'activations. Le détail par module est dans la carte du dessous ; sous le chiffre, seuls les deux premiers modules sont rappelés. Le module Patrimoine s'affiche sous son code « MODULE_PATRIMOINE »."
      ]
    },
    consequences: ["Lecture seule : aucune action n'est possible depuis ces cartes."],
    faq: [
      {
        q: 'Pourquoi « Modules activés » affiche-t-il toujours le même nombre ?',
        a: "Parce qu'il compte les modules de la liste, pas ceux qui sont allumés. Pour savoir combien d'agences utilisent chaque module, regardez « Activations par module »."
      },
      {
        q: 'Une agence en attente est-elle comptée ?',
        a: 'Oui, dans « Total agences » : le total ne distingue pas les états. Seuls les « actifs » et les « suspendus » sont détaillés dessous.'
      },
      {
        q: 'Où voir les abonnements en retard de paiement ?',
        a: "Pas ici : cette carte ne les détaille pas. Ouvrez l'agence concernée dans la liste des agences."
      }
    ],
    permissions: { roles: ['Super-administrateur de la plateforme'] },
    related: [{ label: 'Statistiques globales', helpId: 'administration.pilotage.statistiques' }],
    keywords: ['agences', 'collaborateurs', 'abonnements', 'modules', 'actifs', 'suspendus', 'essai', 'annulés']
  },
  {
    id: 'administration.pilotage.statistiques.modules',
    kind: 'section',
    title: 'Activations par module',
    summary:
      "Cette carte liste chaque module de la plateforme avec le nombre d'agences où il est activé. Elle n'apparaît que si au moins un module est recensé.",
    purpose: 'Elle montre quels modules sont réellement utilisés par les agences.',
    howToRead: {
      notes: [
        "Chaque ligne donne le nom du module à gauche et le nombre d'agences où il est activé à droite.",
        "Un module qu'aucune agence n'a activé s'affiche avec 0.",
        "Les modules recensés sont Agence, Syndic, Promoteur et Patrimoine. Le module Patrimoine s'affiche sous son code « MODULE_PATRIMOINE »."
      ]
    },
    consequences: ["Lecture seule : activer ou couper un module se fait dans la fiche de l'agence."],
    faq: [
      {
        q: 'Le chiffre compte-t-il des utilisateurs ?',
        a: "Non, il compte des agences : une agence où le module est activé compte pour 1, quel que soit son nombre d'utilisateurs."
      },
      {
        q: 'Comment activer un module pour une agence ?',
        a: "Depuis la fiche de l'agence dans la liste des agences de la plateforme, pas depuis cet écran."
      },
      {
        q: 'Pourquoi l’indicateur « Modules activés » affiche-t-il 4 même si aucune agence n’a activé de module ?',
        a: 'Cet indicateur compte les modules recensés, quatre au départ, qu’une agence les ait activés ou non. Pour connaître l’usage réel, lisez le nombre d’agences de chaque ligne de cette carte.'
      }
    ],
    permissions: { roles: ['Super-administrateur de la plateforme'] },
    related: [{ label: 'Les quatre indicateurs', helpId: 'administration.pilotage.statistiques.indicateurs' }],
    keywords: ['modules', 'activation', 'syndic', 'promoteur', 'patrimoine', 'agence']
  },

  // ------------------------------------------------------------------ Journal d'audit de la plateforme
  {
    id: 'administration.pilotage.audit',
    kind: 'page',
    title: "Journal d'audit de la plateforme",
    summary:
      "Ce journal garde la trace de toutes les actions faites sur la plateforme, dans toutes les agences. Vous pouvez le filtrer, ouvrir le détail d'une ligne, l'exporter et contrôler son intégrité.",
    purpose:
      "Il répond à la question « qui a fait quoi, où et quand ? » pour toute la plateforme. Il va plus loin que le journal d'activité de chaque agence : il contient aussi des lignes réservées à la plateforme, que les agences ne voient pas.",
    howToRead: {
      notes: [
        'Le tableau est classé du plus récent au plus ancien et se charge par paquets : « Charger plus » affiche la suite.',
        "Le bouton « Exporter en CSV » (en haut à droite) est réservé au super-administrateur et limité à 50 000 lignes. Au-delà, un avertissement vous demande d'affiner les filtres.",
        'Le menu « Exporter » du tableau propose aussi un export du tableau avec les filtres en cours, plafonné à 10 000 lignes.'
      ]
    },
    steps: [
      {
        title: 'Filtrer',
        detail:
          "Utilisez la recherche libre, l'agence, la catégorie, le résultat, le type d'acteur, la visibilité ou la période."
      },
      { title: 'Ouvrir une ligne', detail: 'Cliquez sur la ligne ou sur « Voir » pour afficher son détail.' },
      {
        title: 'Suivre toute une requête',
        detail: 'Dans le détail, « Voir toute la requête » recherche toutes les lignes de la même requête.'
      },
      { title: 'Exporter', detail: '« Exporter en CSV » reprend les filtres en cours.' },
      {
        title: "Vérifier l'intégrité",
        detail: "Carte « Intégrité du journal » : choisissez une période si besoin, puis « Vérifier l'intégrité »."
      }
    ],
    consequences: [
      "Consulter le journal est lui-même enregistré : l'ouverture de la première page de résultats laisse une trace (« Charger plus » n'en ajoute pas).",
      'Un export CSV est lui aussi tracé, avant le début du téléchargement.',
      'Les lignes ne se modifient ni ne se suppriment depuis cet écran. Les lignes très anciennes peuvent être purgées après leur durée de conservation, si la purge est activée sur le serveur ; leur scellé reste.'
    ],
    faq: [
      {
        q: "Quelle différence avec le journal d'activité d'une agence ?",
        a: "Le journal d'activité d'une agence ne montre que ce que l'agence peut voir. Ici, vous voyez tout, y compris les lignes « Réservées à la plateforme »."
      },
      {
        q: 'Combien de temps les lignes sont-elles gardées ?',
        a: "La durée est réglée sur le serveur. Par défaut : 24 mois pour les lignes visibles de l'agence et 60 mois pour celles réservées à la plateforme."
      },
      {
        q: 'Pourquoi le bouton « Exporter en CSV » est-il absent ?',
        a: "Il est réservé au super-administrateur. Il disparaît aussi si le serveur refuse l'export."
      },
      {
        q: 'Qui est « Support ImmoTopia » dans la colonne Acteur ?',
        a: "C'est le libellé d'une action faite par le personnel de la plateforme (type d'acteur « Support ImmoTopia »)."
      }
    ],
    permissions: {
      roles: ['Super-administrateur de la plateforme'],
      note: "Consulter demande le droit « Voir le journal d'audit de la plateforme » ; l'export CSV demande en plus d'être super-administrateur."
    },
    related: [
      { label: 'Tableau du journal', helpId: 'administration.pilotage.audit.tableau' },
      { label: 'Intégrité du journal', helpId: 'administration.pilotage.audit.integrite' },
      { label: "Détail d'une activité", helpId: 'administration.pilotage.audit.detail' },
      { label: "Journal d'activité d'une agence", helpId: 'administration.agence.activite' }
    ],
    keywords: ['audit', 'journal', 'traçabilité', 'historique', 'qui a fait quoi', 'sécurité', 'export', 'logs']
  },
  {
    id: 'administration.pilotage.audit.tableau',
    kind: 'table',
    title: "Tableau du journal d'audit",
    summary:
      'Chaque ligne est une action enregistrée sur la plateforme. Filtrez pour retrouver une action, puis cliquez sur la ligne pour en voir le détail.',
    purpose: 'Retrouver une action précise : une connexion refusée, une modification de réglage, un export, etc.',
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Date', description: "Date et heure de l'action." },
        {
          key: 'tenant',
          label: 'Agence',
          description: 'Agence concernée. Un tiret signifie une action sans agence (niveau plateforme).'
        },
        {
          key: 'actor',
          label: 'Acteur',
          description:
            "Nom ou e-mail de la personne. À défaut, le libellé conservé au moment de l'action ou le type d'acteur."
        },
        { key: 'action', label: 'Action', description: 'Ce qui a été fait, en français.' },
        {
          key: 'resource',
          label: 'Ressource',
          description: "L'élément touché (bien, contrat, réglage…), avec sa référence quand elle est connue."
        },
        { key: 'outcome', label: 'Résultat', description: 'Réussie, Échouée ou Refusée.' },
        {
          key: 'category',
          label: 'Catégorie',
          description:
            "Famille de l'action : Authentification, Données, Administration, Sécurité, Facturation, Export, Assistant IA ou Système."
        },
        {
          key: 'visibility',
          label: 'Visibilité',
          description:
            "« Plateforme » signale une ligne réservée à la plateforme. La case reste vide pour une ligne que l'agence voit aussi."
        }
      ],
      statuses: [
        { value: 'SUCCESS', label: 'Réussie', description: "L'action a abouti." },
        { value: 'FAILURE', label: 'Échouée', description: "L'action a été tentée mais n'a pas abouti." },
        { value: 'DENIED', label: 'Refusée', description: "L'action a été refusée, par exemple faute de droits." }
      ],
      notes: [
        "Types d'acteur filtrables : Utilisateur, Support ImmoTopia, Portail, Système et Assistant IA.",
        "Filtres : recherche libre (action, ressource, acteur, identifiant de requête), Agence, Catégorie, Résultat, Type d'acteur, Visibilité et Période."
      ]
    },
    steps: [
      {
        title: 'Choisir les critères',
        detail:
          "Agence et Catégorie sont affichés en premier ; les autres filtres s'ouvrent depuis la barre de recherche."
      },
      { title: 'Lire les lignes', detail: 'Du plus récent au plus ancien.' },
      { title: 'Ouvrir le détail', detail: 'Cliquez sur une ligne, ou sur « Voir » à droite.' },
      { title: 'Voir la suite', detail: '« Charger plus », sous le tableau, ajoute les lignes suivantes.' }
    ],
    consequences: ['Lecture seule : aucune ligne ne se modifie ni ne se supprime ici.'],
    faq: [
      {
        q: "Comment retrouver toutes les lignes d'une même opération ?",
        a: "Ouvrez une ligne et cliquez sur « Voir toute la requête » : la recherche libre est remplie avec l'identifiant de la requête."
      },
      {
        q: 'Que signifie une ligne « Refusée » ?',
        a: "L'action a été bloquée, par exemple parce que la personne n'avait pas le droit. Elle ne s'est pas produite."
      },
      {
        q: 'Peut-on filtrer sur une période ?',
        a: 'Oui, avec le critère « Période » de la barre de recherche.'
      }
    ],
    permissions: { roles: ['Super-administrateur de la plateforme'] },
    related: [
      { label: "Détail d'une activité", helpId: 'administration.pilotage.audit.detail' },
      { label: "Journal d'audit de la plateforme", helpId: 'administration.pilotage.audit' }
    ],
    keywords: ['journal', 'filtre', 'recherche', 'acteur', 'résultat', 'catégorie', 'visibilité', 'export']
  },
  {
    id: 'administration.pilotage.audit.detail',
    kind: 'section',
    title: "Détail d'une activité",
    summary:
      "Cette fenêtre montre toutes les informations d'une ligne du journal : qui, quoi, quand, d'où, et ce qui a changé.",
    purpose: "Comprendre précisément une action : qui l'a faite, depuis quel appareil, et quelles valeurs ont changé.",
    howToRead: {
      notes: [
        "Date, Agence, Acteur (nom ou e-mail, puis le type d'acteur), Action, Ressource, Résultat, Catégorie et Visibilité reprennent les colonnes du tableau.",
        "Adresse IP et Navigateur indiquent d'où venait la demande. Un tiret signifie que l'information n'est pas disponible.",
        "Identifiant de requête : repère commun à toutes les lignes d'une même opération. « Voir toute la requête » ferme la fenêtre et recherche ce repère dans le tableau.",
        "Source : d'où vient l'écriture de la ligne, quand elle est connue.",
        "Le bloc « Modifications » montre les anciennes et nouvelles valeurs (avant → après). Le bloc « Détails » montre le contenu complet de l'enregistrement. Ils n'apparaissent que s'ils existent."
      ]
    },
    steps: [
      { title: 'Ouvrir la ligne', detail: 'Dans le tableau, cliquez sur la ligne ou sur « Voir ».' },
      { title: 'Lire les informations', detail: "Les champs sont dans l'ordre : date, agence, acteur, action…" },
      { title: 'Suivre la requête', detail: '« Voir toute la requête » affiche les lignes liées.' },
      { title: 'Fermer', detail: 'Bouton « Fermer » : rien ne change.' }
    ],
    consequences: ['Lecture seule : ouvrir ou fermer la fenêtre ne modifie rien.'],
    faq: [
      {
        q: "Pourquoi l'adresse IP est-elle vide ?",
        a: "Elle n'est pas toujours connue : une action faite par le système, par exemple, n'a pas d'adresse. L'écran affiche alors un tiret."
      },
      {
        q: "À quoi sert l'identifiant de requête ?",
        a: 'À regrouper toutes les lignes créées par une même opération, par exemple une action qui touche plusieurs éléments.'
      },
      {
        q: 'Où est le bloc « Modifications » ?',
        a: "Il n'apparaît que lorsque l'action a changé des valeurs. Pour une simple consultation, il n'y en a pas."
      }
    ],
    permissions: { roles: ['Super-administrateur de la plateforme'] },
    related: [{ label: 'Tableau du journal', helpId: 'administration.pilotage.audit.tableau' }],
    keywords: ['détail', 'adresse ip', 'navigateur', 'requête', 'modifications', 'avant après']
  },
  {
    id: 'administration.pilotage.audit.integrite',
    kind: 'section',
    title: 'Intégrité du journal',
    summary:
      "Cette carte contrôle que le journal n'a été ni modifié ni amputé depuis qu'il a été scellé. La vérification se lance à la demande, avec le bouton « Vérifier l'intégrité ».",
    purpose:
      "Chaque jour terminé est résumé dans un scellé, enchaîné au scellé précédent. La vérification recalcule ces résumés à partir des lignes actuelles et les compare aux scellés. Une différence révèle qu'une ligne a changé ou disparu.",
    howToRead: {
      notes: [
        'Sans période, les 500 scellés les plus récents sont vérifiés. Avec une période, seuls les scellés de ces jours le sont.',
        "Vert « Journal intègre » : aucune altération détectée. L'empreinte de la tête de la chaîne s'affiche ; vous pouvez la copier.",
        'Rouge « Intégrité du journal compromise » : soit la chaîne des scellés est rompue à un numéro de scellé donné, soit des journées ne correspondent plus à leur scellé. Le tableau des anomalies les liste.',
        "Orange « Lignes arrivées après le scellement » : des lignes sont arrivées en retard (par exemple après une panne). Ce n'est pas forcément une altération, mais à regarder.",
        "Gris « partition(s) purgée(s) » : journées anciennes dont les lignes ont été supprimées après la durée de conservation. C'est normal, leur scellé reste.",
        "Bleu « résultat tronqué » : trop d'anomalies pour tout afficher. Restreignez la période."
      ]
    },
    steps: [
      {
        title: 'Choisir la période (facultatif)',
        detail: 'Sélecteur de dates « Période ». Vous pouvez le laisser vide.'
      },
      { title: 'Lancer la vérification', detail: "Cliquez sur « Vérifier l'intégrité » et patientez." },
      { title: 'Lire le résultat', detail: "Un cadre vert ou rouge s'affiche, éventuellement suivi d'avertissements." },
      {
        title: "En cas d'anomalie",
        detail:
          "Relancez sur une période plus courte pour cerner les journées concernées, puis prévenez l'équipe technique."
      }
    ],
    consequences: [
      'La vérification ne modifie rien : elle lit et recalcule.',
      'Elle est tracée dans le journal (consultation du journal).',
      'Elle est limitée à 10 vérifications par tranche de 10 minutes ; au-delà, un message vous demande de patienter.'
    ],
    faq: [
      {
        q: "Cette vérification prouve-t-elle que rien n'a été touché ?",
        a: 'Elle détecte la modification ou la disparition de lignes. Mais les scellés sont dans la même base : pour une garantie complète, la tête de la chaîne doit aussi être conservée ailleurs.'
      },
      {
        q: 'Une ligne « arrivée après le scellement » est-elle grave ?',
        a: "Pas forcément : un service peut écrire tardivement une ligne datée d'un jour déjà scellé. À vérifier, mais ce n'est pas classé comme altération."
      },
      {
        q: 'Que faire si la chaîne est rompue ?',
        a: "Notez le numéro de scellé indiqué, la tête de chaîne et la période, puis prévenez l'équipe technique."
      },
      {
        q: 'À quel moment les jours sont-ils scellés ?',
        a: "Un jour terminé est scellé après un délai de grâce, de 2 jours par défaut. Les jours les plus récents n'ont donc pas encore de scellé."
      }
    ],
    permissions: {
      roles: ['Super-administrateur de la plateforme'],
      note: "Demande le droit « Voir le journal d'audit de la plateforme »."
    },
    related: [
      { label: 'Anomalies détectées', helpId: 'administration.pilotage.audit.integrite.anomalies' },
      { label: "Journal d'audit de la plateforme", helpId: 'administration.pilotage.audit' }
    ],
    keywords: ['intégrité', 'scellé', 'chaîne', 'empreinte', 'altération', 'falsification', 'vérifier', 'sécurité']
  },
  {
    id: 'administration.pilotage.audit.integrite.anomalies',
    kind: 'table',
    title: 'Anomalies détectées',
    summary:
      'Ce tableau liste les journées dont le contenu ne correspond plus à leur scellé, ou dont des lignes sont arrivées en retard. Il apparaît sous le cadre rouge ou orange de la vérification.',
    purpose: 'Cerner quelles journées, quelles agences et quelle visibilité sont concernées.',
    howToRead: {
      columns: [
        { key: 'sealDate', label: 'Date', description: 'Jour scellé (jour UTC).' },
        {
          key: 'tenantKey',
          label: 'Agence',
          description: "Identifiant de l'agence ; « PLATFORM » désigne les lignes sans agence."
        },
        { key: 'visibility', label: 'Visibilité', description: "Visible de l'agence, ou réservée à la plateforme." },
        { key: 'status', label: 'Statut', description: "Nature de l'anomalie (voir les statuts)." },
        { key: 'sealedRows', label: 'Lignes scellées', description: 'Nombre de lignes au moment du scellement.' },
        { key: 'foundRows', label: 'Lignes trouvées', description: "Nombre de lignes retrouvées aujourd'hui." }
      ],
      statuses: [
        {
          value: 'ALTERED',
          label: 'Contenu altéré',
          description: 'Même nombre de lignes, mais leur contenu a changé.'
        },
        { value: 'ROWS_MISSING', label: 'Lignes manquantes', description: "Il y a moins de lignes qu'au scellement." },
        {
          value: 'LATE_ROWS',
          label: 'Lignes arrivées après le scellement',
          description: "Il y a plus de lignes qu'au scellement : écriture tardive, pas forcément une altération."
        },
        {
          value: 'EXPIRED',
          label: 'Purgée après rétention',
          description:
            'Journée ancienne dont les lignes ont été supprimées normalement. Comptée à part, hors de ce tableau.'
        },
        {
          value: 'OK',
          label: 'Conforme',
          description: 'La journée correspond à son scellé. Elle ne figure pas dans ce tableau.'
        }
      ],
      notes: ['Un tableau rouge liste les anomalies graves ; un tableau orange liste les lignes arrivées en retard.']
    },
    consequences: ['Lecture seule : rien ne se corrige depuis ce tableau.'],
    faq: [
      {
        q: 'Quelle différence entre « Lignes manquantes » et « Contenu altéré » ?',
        a: "Avec « Lignes manquantes », des lignes ont disparu. Avec « Contenu altéré », le nombre est le même mais le contenu d'au moins une ligne a changé."
      },
      {
        q: 'Peut-on exporter ce tableau ?',
        a: "Oui, avec le bouton « Exporter » du tableau, s'il contient des lignes."
      },
      {
        q: 'Pourquoi la colonne Agence montre-t-elle un code ?',
        a: "Elle affiche l'identifiant de l'agence tel que le scellé le conserve, pas son nom."
      }
    ],
    permissions: { roles: ['Super-administrateur de la plateforme'] },
    related: [{ label: 'Intégrité du journal', helpId: 'administration.pilotage.audit.integrite' }],
    keywords: ['anomalie', 'scellé', 'lignes manquantes', 'altéré', 'purgée', 'partition']
  },

  // ------------------------------------------------------------------ Assistant IA
  {
    id: 'administration.pilotage.ia',
    kind: 'page',
    title: 'Assistant IA (ImmoCopilot)',
    summary:
      "Choisissez ici le fournisseur et le modèle d'intelligence artificielle qui font tourner ImmoCopilot pour toute la plateforme. Le changement s'applique à toutes les agences dès l'enregistrement.",
    purpose:
      "Ce réglage engage toute la plateforme et n'est jamais délégué : seul le super-administrateur peut le voir et le modifier. Les clés d'accès des fournisseurs ne se saisissent pas ici : elles sont placées dans la configuration du serveur par l'équipe technique.",
    howToRead: {
      notes: [
        "Un bandeau rappelle que les clés se renseignent dans la configuration du serveur, jamais dans cet écran. L'écran n'affiche aucune clé : il indique seulement « Clé configurée » ou « Clé manquante ».",
        "En bas : l'origine du réglage (« Base de données » une fois enregistré ici, sinon « Variables d'environnement ») et la dernière modification (nom de la personne, date).",
        "Cet écran ne règle ni crédits, ni tarif, ni quota d'utilisation."
      ]
    },
    steps: [
      {
        title: 'Choisir le fournisseur',
        detail: 'Carte « Fournisseur » : une option grisée est indisponible, la raison est écrite dessous.'
      },
      { title: 'Choisir le modèle', detail: 'Carte « Modèle », pour OpenRouter et Anthropic.' },
      {
        title: 'Régler les options',
        detail: 'Carte « Options Anthropic » : effort de raisonnement et repli en cas de refus.'
      },
      { title: 'Enregistrer', detail: "Le bouton « Enregistrer » ne s'active qu'après un changement." }
    ],
    consequences: [
      "L'enregistrement s'applique à toute la plateforme et est tracé dans le journal d'audit, avec l'ancien et le nouveau réglage (sans aucune clé).",
      "Avec « Désactivé », ImmoCopilot n'est plus disponible pour personne.",
      "Si le fournisseur choisi ne peut pas servir (clé manquante, par exemple), l'assistant est indisponible."
    ],
    faq: [
      {
        q: "Où saisir la clé d'accès d'un fournisseur ?",
        a: "Pas dans cet écran : elle se place dans la configuration du serveur, par l'équipe technique. L'écran vous dit seulement si elle est présente."
      },
      {
        q: 'Pourquoi une option est-elle grisée ?',
        a: "Parce que le fournisseur n'est pas utilisable (clé manquante, ou interdit en production). La raison est affichée sous l'option."
      },
      {
        q: "Comment couper l'assistant pour tout le monde ?",
        a: 'Choisissez « Désactivé » puis « Enregistrer ».'
      },
      {
        q: "Où voir la consommation ou les crédits de l'assistant ?",
        a: "Pas dans cet écran : il ne gère ni crédits ni facturation de l'assistant."
      }
    ],
    permissions: {
      roles: ['Super-administrateur de la plateforme'],
      note: 'Réglage réservé au super-administrateur de la plateforme, jamais délégué.'
    },
    related: [
      { label: 'Fournisseur', helpId: 'administration.pilotage.ia.fournisseur' },
      { label: 'Modèle', helpId: 'administration.pilotage.ia.modele' },
      { label: 'Options Anthropic', helpId: 'administration.pilotage.ia.options-anthropic' }
    ],
    keywords: [
      'ia',
      'intelligence artificielle',
      'immocopilot',
      'assistant',
      'openrouter',
      'anthropic',
      'fournisseur',
      'modèle',
      'clé'
    ]
  },
  {
    id: 'administration.pilotage.ia.fournisseur',
    kind: 'section',
    title: 'Fournisseur',
    summary:
      "Cette carte choisit qui fournit l'intelligence artificielle d'ImmoCopilot. Chaque fournisseur à clé porte une pastille « Clé configurée » ou « Clé manquante ».",
    purpose: "Désigner le service qui répond aux questions posées à ImmoCopilot, ou couper l'assistant.",
    howToRead: {
      statuses: [
        {
          value: 'disabled',
          label: 'Désactivé',
          description: 'ImmoCopilot est indisponible pour toute la plateforme.'
        },
        {
          value: 'openrouter',
          label: 'OpenRouter',
          description:
            'Passe par OpenRouter ; demande sa clé sur le serveur et un modèle de la forme fournisseur/modèle.'
        },
        {
          value: 'anthropic',
          label: 'Anthropic',
          description: 'Passe directement par Anthropic ; demande sa clé sur le serveur.'
        },
        {
          value: 'fake',
          label: 'Faux (recette)',
          description:
            "Fournisseur de test, sans intelligence réelle. Interdit en production : l'option est alors grisée."
        }
      ],
      notes: [
        "« Clé configurée » (vert) : la clé est présente sur le serveur. « Clé manquante » (rouge) : l'option est grisée, la raison est écrite dessous.",
        "Passer à OpenRouter vide le modèle s'il n'est pas de la forme fournisseur/modèle."
      ]
    },
    steps: [
      { title: 'Lire les pastilles de clé', detail: 'Vérifiez que la clé du fournisseur voulu est configurée.' },
      { title: 'Sélectionner un fournisseur', detail: 'Cliquez sur sa ligne.' },
      { title: 'Choisir le modèle', detail: 'La carte « Modèle » apparaît pour OpenRouter et Anthropic.' },
      { title: 'Enregistrer', detail: "Le choix n'est pris en compte qu'après « Enregistrer »." }
    ],
    consequences: [
      "Le choix n'est appliqué qu'à l'enregistrement, puis pour toutes les agences.",
      "Le serveur refuse l'enregistrement si la clé du fournisseur choisi manque ou si « Faux » est choisi en production."
    ],
    faq: [
      {
        q: 'Que se passe-t-il si je choisis « Désactivé » ?',
        a: "ImmoCopilot n'est plus disponible, pour toutes les agences, jusqu'à un nouveau choix."
      },
      {
        q: 'Que veut dire « Clé manquante » ?',
        a: "La clé du fournisseur n'a pas été placée sur le serveur. Demandez à l'équipe technique de l'ajouter."
      },
      {
        q: 'À quoi sert « Faux (recette) » ?',
        a: "À tester l'assistant sans appeler un vrai service. À ne pas utiliser en production, où il est refusé."
      }
    ],
    permissions: { roles: ['Super-administrateur de la plateforme'] },
    related: [
      { label: 'Modèle', helpId: 'administration.pilotage.ia.modele' },
      { label: 'Assistant IA', helpId: 'administration.pilotage.ia' }
    ],
    keywords: ['fournisseur', 'openrouter', 'anthropic', 'désactiver', 'clé', 'faux']
  },
  {
    id: 'administration.pilotage.ia.modele',
    kind: 'section',
    title: 'Modèle',
    summary:
      "Cette carte choisit le modèle d'intelligence artificielle utilisé chez le fournisseur retenu. Elle n'apparaît que pour OpenRouter et Anthropic.",
    purpose:
      'Un modèle plus puissant répond souvent mieux, un modèle plus léger est souvent plus rapide ou moins coûteux.',
    howToRead: {
      notes: [
        'OpenRouter : une liste déroulante avec recherche propose les modèles du catalogue, sous la forme fournisseur/modèle.',
        "Si le catalogue est indisponible, une zone de saisie libre apparaît avec le message « Liste indisponible, saisissez l'identifiant à la main ».",
        'Anthropic : deux suggestions (claude-opus-5-5 et claude-sonnet-5-5) ; vous pouvez aussi saisir un identifiant plus récent.',
        "Le modèle déjà enregistré reste sélectionnable même s'il a quitté le catalogue."
      ]
    },
    steps: [
      { title: 'Ouvrir la carte', detail: "Elle s'affiche après le choix d'OpenRouter ou d'Anthropic." },
      { title: 'Choisir ou saisir le modèle', detail: 'Cherchez dans la liste ou tapez son identifiant.' },
      { title: 'Enregistrer', detail: "Bouton « Enregistrer » en bas de l'écran." }
    ],
    consequences: [
      "Le modèle choisi sert toutes les agences dès l'enregistrement.",
      "Avec OpenRouter, le serveur refuse un modèle qui n'est pas de la forme fournisseur/modèle."
    ],
    faq: [
      {
        q: 'Pourquoi mon modèle Anthropic est-il vidé quand je passe à OpenRouter ?',
        a: "Les identifiants d'OpenRouter contiennent une barre oblique (fournisseur/modèle). Un identifiant Anthropic n'est pas valable chez OpenRouter, donc le champ est vidé."
      },
      {
        q: 'Que faire si la liste des modèles ne charge pas ?',
        a: "Saisissez l'identifiant du modèle à la main, sous la forme fournisseur/modèle."
      },
      {
        q: 'Quel modèle choisir ?',
        a: "L'écran ne le recommande pas. Demandez conseil à l'équipe technique avant de changer un réglage qui touche toute la plateforme."
      }
    ],
    permissions: { roles: ['Super-administrateur de la plateforme'] },
    related: [{ label: 'Fournisseur', helpId: 'administration.pilotage.ia.fournisseur' }],
    keywords: ['modèle', 'openrouter', 'anthropic', 'claude', 'catalogue']
  },
  {
    id: 'administration.pilotage.ia.options-anthropic',
    kind: 'section',
    title: 'Options Anthropic',
    summary:
      "Cette carte règle l'effort de raisonnement du modèle et le repli en cas de refus. Elle n'apparaît que lorsque le fournisseur Anthropic est choisi.",
    purpose: 'Ajuster le niveau de réflexion du modèle et la conduite à tenir quand il refuse de répondre.',
    howToRead: {
      statuses: [
        { value: 'low', label: 'Faible', description: 'Effort de raisonnement le plus bas.' },
        { value: 'medium', label: 'Moyen', description: 'Effort de raisonnement intermédiaire.' },
        { value: 'high', label: 'Élevé', description: 'Effort de raisonnement le plus haut.' }
      ],
      notes: [
        "« Repli en cas de refus » : quand le modèle refuse de répondre, le serveur applique un repli. L'écran n'en détaille pas le fonctionnement.",
        "Sans réglage enregistré, la valeur de départ de l'effort et du repli vient de la configuration du serveur."
      ]
    },
    steps: [
      { title: "Choisir l'effort", detail: 'Faible, Moyen ou Élevé.' },
      { title: 'Activer ou couper le repli', detail: 'Interrupteur « Repli en cas de refus ».' },
      { title: 'Enregistrer', detail: "Bouton « Enregistrer » en bas de l'écran." }
    ],
    consequences: ["Ces options s'appliquent à toute la plateforme après l'enregistrement."],
    faq: [
      {
        q: "Qu'est-ce que l'effort de raisonnement ?",
        a: "C'est le degré de réflexion demandé au modèle avant de répondre. L'écran ne donne pas d'autre précision sur son effet."
      },
      {
        q: 'Ces options valent-elles pour OpenRouter ?',
        a: "Non : la carte n'existe que pour Anthropic."
      },
      {
        q: 'Que fait exactement le repli ?',
        a: "Il est appliqué par le serveur quand le modèle refuse de répondre. Demandez le détail à l'équipe technique."
      }
    ],
    permissions: { roles: ['Super-administrateur de la plateforme'] },
    related: [{ label: 'Assistant IA', helpId: 'administration.pilotage.ia' }],
    keywords: ['effort', 'raisonnement', 'repli', 'refus', 'anthropic']
  },

  // ------------------------------------------------------------------ Rôles, menus et permissions
  {
    id: 'administration.pilotage.roles',
    kind: 'page',
    title: 'Rôles, menus et permissions',
    summary:
      "Choisissez un rôle à gauche, puis réglez à droite les menus qu'il voit et les permissions qu'il détient. Les rôles d'agence et les espaces propriétaire et locataire se règlent par agence ou pour toutes.",
    purpose:
      "Une permission dit ce qu'une personne a le droit de faire ; un menu dit ce que l'interface lui propose. Cacher un menu ne remplace pas une permission : les deux se règlent dans deux onglets.",
    howToRead: {
      notes: [
        'Les rôles sont étiquetés « Plateforme », « Agence » ou « Portail client ».',
        "Onglet « Menus accessibles » : l'arbre exact du menu latéral de ce rôle, par catégorie.",
        'Onglet « Permissions détaillées » : la grille des droits, rangés par groupe.',
        "Les rôles de portail (propriétaire, locataire) n'ont pas de permissions : seuls leurs menus se règlent."
      ]
    },
    steps: [
      { title: 'Choisir un rôle', detail: 'Carte « Rôles », à gauche.' },
      {
        title: 'Choisir le périmètre',
        detail: "Pour un rôle d'agence ou de portail : toutes les agences (défaut) ou une agence précise."
      },
      { title: 'Régler les menus', detail: 'Onglet « Menus accessibles », puis « Enregistrer ».' },
      { title: 'Régler les permissions', detail: 'Onglet « Permissions détaillées », puis « Enregistrer ».' }
    ],
    consequences: [
      'Une permission modifiée change les droits de toutes les personnes qui ont ce rôle, dans toutes les agences.',
      "Un menu coupé retire l'entrée du menu latéral, de la barre d'onglets du téléphone et du tiroir de navigation, mais ne bloque pas l'accès par les permissions.",
      "Rien ne s'enregistre avant le clic sur « Enregistrer » de l'onglet."
    ],
    faq: [
      {
        q: 'Quelle différence entre un menu et une permission ?',
        a: 'La permission autorise une action. Le menu montre ou cache une entrée. Cacher un menu ne protège rien : pour retirer un droit, décochez la permission.'
      },
      {
        q: 'Mon changement de menu concerne-t-il toutes les agences ?',
        a: 'Seulement si vous avez choisi « Toutes les agences (défaut) ». Si vous choisissez une agence, le réglage ne vaut que pour elle.'
      },
      {
        q: 'Pourquoi certains menus sont-ils « Verrouillés » ?',
        a: "Le menu « Administration » du super-administrateur et son entrée « Rôles et permissions » ne peuvent pas être coupés : sinon il n'y aurait plus de chemin pour revenir régler les accès."
      }
    ],
    permissions: {
      roles: ['Super-administrateur de la plateforme'],
      note: 'Écran réservé au super-administrateur ; modifier demande le droit de modifier les agences de la plateforme.'
    },
    related: [
      { label: 'Liste des rôles', helpId: 'administration.pilotage.roles.liste' },
      { label: 'Menus accessibles', helpId: 'administration.pilotage.roles.menus' },
      { label: 'Permissions détaillées', helpId: 'administration.pilotage.roles.permissions' }
    ],
    keywords: ['rôles', 'permissions', 'droits', 'menus', 'accès', 'habilitations', 'sécurité'],
    tour: {
      steps: [
        {
          target: 'roles-liste',
          title: 'Les rôles',
          description:
            "Cliquez sur un rôle pour régler ses menus et ses permissions. Les rôles de plateforme, d'agence et de portail sont étiquetés."
        },
        {
          target: 'roles-onglets',
          title: 'Menus et permissions',
          description:
            "« Menus accessibles » règle ce que le rôle voit ; « Permissions détaillées » règle ce qu'il a le droit de faire."
        },
        {
          target: 'roles-onglets',
          title: 'Enregistrer',
          description: "Chaque onglet a son bouton « Enregistrer ». Tant que vous ne cliquez pas, rien n'est modifié."
        }
      ]
    }
  },
  {
    id: 'administration.pilotage.roles.liste',
    kind: 'section',
    title: 'Rôles',
    summary:
      "Cette carte liste les rôles à régler : rôles de la plateforme, rôles d'agence et deux espaces de portail (propriétaire et locataire). Cliquez sur un rôle pour le régler.",
    purpose: 'Choisir la personne type dont vous réglez les accès.',
    howToRead: {
      notes: [
        "Étiquettes : « Plateforme », « Agence », « Portail client ». L'ordre va du plus large au plus étroit, puis alphabétique.",
        "L'étiquette orange « Menus personnalisés » indique qu'un réglage de menus existe pour ce rôle dans le périmètre affiché.",
        "Rôles d'agence proposés dans les libellés de l'application : Administrateur tenant, Gestionnaire tenant, Agent tenant, Comptable tenant (le mot tenant désigne l'agence), Magasinier et Chef de chantier. Plateforme : Super administrateur plateforme. Portails : Propriétaire (portail) et Locataire (portail).",
        'Le bouton de rechargement recharge toute la page.'
      ]
    },
    steps: [
      { title: 'Repérer le rôle', detail: 'Lisez son nom et son étiquette.' },
      { title: 'Cliquer sur le rôle', detail: 'Il se met en surbrillance.' },
      { title: 'Régler à droite', detail: 'Les onglets de droite se rapportent à ce rôle.' }
    ],
    consequences: ['Choisir un rôle ne modifie rien : seul « Enregistrer » enregistre.'],
    faq: [
      {
        q: 'Pourquoi le propriétaire et le locataire sont-ils dans la liste ?',
        a: "Ils ont un espace de portail avec son propre menu, même s'ils n'ont pas de permissions comme un collaborateur."
      },
      {
        q: 'Un rôle manque, pourquoi ?',
        a: 'La liste reprend les rôles enregistrés par la plateforme. Certains rôles réservés au système ne sont visibles que du super-administrateur.'
      },
      {
        q: 'Que se passe-t-il si je change de rôle avec des modifications non enregistrées ?',
        a: "Les modifications de menus non enregistrées sont perdues quand vous choisissez un autre rôle ; un message ne vous prévient que si vous changez d'agence."
      }
    ],
    permissions: { roles: ['Super-administrateur de la plateforme'] },
    related: [{ label: 'Rôles, menus et permissions', helpId: 'administration.pilotage.roles' }],
    keywords: [
      'rôle',
      'administrateur',
      'gestionnaire',
      'agent',
      'comptable',
      'magasinier',
      'chef de chantier',
      'propriétaire',
      'locataire'
    ]
  },
  {
    id: 'administration.pilotage.roles.menus',
    kind: 'section',
    title: 'Menus accessibles',
    summary:
      "Cet onglet règle ce que le rôle choisi voit dans son menu, avec l'arbre exact du menu latéral. Chaque entrée s'active ou se coupe, et un réglage peut valoir pour toutes les agences ou pour une seule.",
    purpose:
      "Répondre à la question « que verra cette personne dans son menu ? ». Par défaut, une entrée est active quand les permissions du rôle l'autorisent.",
    howToRead: {
      notes: [
        "« Toutes les agences (défaut) » règle toutes les agences qui n'ont pas leur propre réglage. Choisir une agence crée un réglage propre à elle.",
        "Étiquette « Hérite du défaut » : l'agence suit le réglage commun. « Réglage propre à l'agence » : elle a le sien.",
        "Pastille « n/m actifs » : nombre d'entrées actives sur le total.",
        "Étiquette « Personnalisé » : l'entrée diffère de l'état déduit des permissions du rôle. « Verrouillé » : entrée qu'on ne peut pas couper.",
        "Un rôle de plateforme se règle sans choisir d'agence.",
        'Couper une entrée coupe aussi ses sous-entrées ; les sous-entrées ne se cochent plus tant que leur parent est coupé.'
      ]
    },
    steps: [
      {
        title: 'Choisir le périmètre',
        detail:
          "Pour un rôle d'agence ou de portail : « Toutes les agences (défaut) » ou une agence. Sans choix, rien ne s'affiche."
      },
      {
        title: 'Rechercher une entrée',
        detail: 'Champ « Rechercher dans les menus », filtre « État du menu » : Actifs ou Inactifs.'
      },
      { title: 'Activer ou couper', detail: "Interrupteur de l'entrée, cases de ses sous-entrées." },
      { title: 'Enregistrer', detail: "« Enregistrer » ne s'active qu'après un changement." },
      {
        title: 'Revenir en arrière',
        detail:
          "« Valeurs par défaut » remet l'état déduit des permissions, sans enregistrer. « Revenir au défaut » efface le réglage propre d'une agence."
      }
    ],
    consequences: [
      "Une entrée coupée disparaît du menu latéral, de la barre d'onglets du téléphone et du tiroir de navigation pour ce rôle.",
      "Un menu coupé ne bloque pas l'accès : les permissions restent la vraie protection.",
      "« Revenir au défaut » supprime le réglage propre de l'agence, qui retombe sur le défaut.",
      "Changer d'agence avec des modifications non enregistrées demande confirmation, et les perd si vous confirmez."
    ],
    faq: [
      {
        q: 'Mon réglage vaut-il pour toutes les agences ?',
        a: "Oui si le périmètre est « Toutes les agences (défaut) » : un message d'alerte le rappelle. Il ne vaut que pour une agence si vous l'avez choisie."
      },
      {
        q: 'Pourquoi les sous-entrées sont-elles grisées ?',
        a: "Parce que leur entrée parente est coupée. Rallumez d'abord le parent."
      },
      {
        q: 'Comment rétablir les menus par défaut ?',
        a: "« Valeurs par défaut » remplit la page avec l'état déduit des permissions ; cliquez ensuite sur « Enregistrer » pour le conserver."
      },
      {
        q: "Pourquoi « Menus accessibles » dit-il que le rôle n'a pas de navigation ?",
        a: "Certains rôles ne sont rattachés à aucune navigation : ils n'ont donc pas de menus à régler."
      }
    ],
    permissions: {
      roles: ['Super-administrateur de la plateforme'],
      note: 'Enregistrer demande le droit de modifier les agences de la plateforme.'
    },
    related: [
      { label: 'Permissions détaillées', helpId: 'administration.pilotage.roles.permissions' },
      { label: 'Rôles', helpId: 'administration.pilotage.roles.liste' }
    ],
    keywords: ['menu', 'navigation', 'masquer', 'sidebar', 'entrée', 'périmètre', 'défaut', 'personnaliser']
  },
  {
    id: 'administration.pilotage.roles.permissions',
    kind: 'section',
    title: 'Permissions détaillées',
    summary:
      'Cet onglet liste les permissions, rangées par groupe, avec une case par permission accordée au rôle choisi. « Enregistrer » remplace la liste des permissions du rôle.',
    purpose:
      'Dire précisément ce que le rôle a le droit de faire. Chaque permission a un libellé et une description en français.',
    howToRead: {
      notes: [
        "Groupes affichés : Plateforme (administration centrale), Paramètres de l'agence, Collaborateurs, Facturation, CRM (contacts, affaires, activités), Biens immobiliers, Location (baux, loyers, documents), Maintenance, Finance et Stock de chantier.",
        "Les permissions Syndic et Patrimoine s'affichent sous leur code (SYNDIC, PATRIMOINE) car elles n'ont pas de nom de groupe.",
        'Les permissions de Communication ne sont pas affichées dans cet écran.',
        'Recherche : « Permission, description, groupe… », filtre « Accordée au rôle » : Accordées ou Non accordées.',
        "Un rôle de portail (propriétaire, locataire) n'a pas de permissions : l'écran l'explique."
      ]
    },
    steps: [
      { title: 'Choisir un rôle', detail: "Carte « Rôles ». Un rôle de portail n'a pas de permissions." },
      { title: 'Chercher une permission', detail: 'Champ de recherche et filtre « Accordée au rôle ».' },
      {
        title: 'Cocher ou décocher',
        detail: 'Une case par permission ; une coche verte confirme les permissions accordées.'
      },
      { title: 'Enregistrer', detail: "« Enregistrer » remplace d'un coup toute la liste du rôle." }
    ],
    consequences: [
      'La modification vaut pour toutes les personnes qui ont ce rôle, dans toutes les agences : les rôles ne se règlent pas agence par agence.',
      "Leurs droits sont recalculés aussitôt après l'enregistrement.",
      'Pour revenir en arrière, il faut recocher les permissions retirées et enregistrer de nouveau.',
      "Rien n'empêche, dans l'écran, de retirer des permissions importantes (y compris au rôle Super administrateur plateforme) : soyez prudent."
    ],
    faq: [
      {
        q: 'Retirer une permission pour une seule agence est-il possible ?',
        a: "Non : la permission appartient au rôle, donc à toutes les agences. Pour une seule agence, vous pouvez en revanche cacher des menus dans l'onglet voisin."
      },
      {
        q: 'Comment savoir ce que fait une permission ?',
        a: "Lisez la description sous son libellé. Si aucune traduction n'existe, l'écran affiche le code de la permission."
      },
      {
        q: "Pourquoi n'y a-t-il pas de permissions pour le propriétaire ou le locataire ?",
        a: "Leur périmètre vient de leur rattachement à l'agence (bail ou bien), pas de permissions."
      },
      {
        q: 'Un collaborateur voit-il tout de suite le changement ?',
        a: "Ses droits sont recalculés après l'enregistrement. Le menu qu'il voit dépend, lui, des réglages de l'onglet « Menus accessibles »."
      }
    ],
    permissions: {
      roles: ['Super-administrateur de la plateforme'],
      note: 'Enregistrer demande le droit de modifier les agences de la plateforme.'
    },
    related: [
      { label: 'Menus accessibles', helpId: 'administration.pilotage.roles.menus' },
      { label: 'Rôles', helpId: 'administration.pilotage.roles.liste' }
    ],
    keywords: ['permissions', 'droits', 'autorisations', 'habilitations', 'cases', 'rôle']
  },

  // ------------------------------------------------------------------ Avis sur l'aide
  {
    id: 'administration.avis-aide',
    kind: 'page',
    title: "Avis sur l'aide",
    summary:
      "Cet écran rassemble les retours des utilisateurs sur les fiches d'aide : avis « utile » ou « pas utile » et questions posées depuis une fiche. Il sert à repérer les fiches à améliorer.",
    purpose:
      "Tous les utilisateurs peuvent donner leur avis depuis une fiche d'aide. Le super-administrateur de la plateforme voit les avis de toutes les agences ; l'administrateur d'une agence voit ceux de sa propre agence.",
    howToRead: {
      notes: [
        'La période se choisit en haut à droite : 7, 30 ou 90 jours. Par défaut, 30 jours.',
        "Les fiches les plus problématiques sont en tête : celles qui cumulent le plus d'avis « pas utile » et de questions.",
        "Sur la plateforme, la liste des questions indique aussi l'agence qui l'a posée. Sur la vue d'une agence, elle ne l'indique pas.",
        "La vue d'une agence ne montre que les avis de cette agence ; les avis sans agence n'y apparaissent jamais.",
        "Jusqu'à 200 fiches sont listées, avec les 20 dernières questions de chacune."
      ]
    },
    steps: [
      { title: 'Choisir la période', detail: '7, 30 ou 90 jours.' },
      { title: 'Repérer les fiches', detail: 'Regardez « Pas utile » et « Questions ».' },
      { title: 'Lire les questions', detail: 'Cliquez sur une ligne qui a des questions pour la déplier.' }
    ],
    consequences: [
      'Écran en lecture seule : on ne répond pas aux questions depuis ici.',
      "Ces avis servent à corriger les fiches d'aide ; l'application ne prévient personne automatiquement."
    ],
    faq: [
      {
        q: 'Qui voit quoi ?',
        a: "Le super-administrateur voit tous les avis. L'administrateur d'une agence voit ceux de sa propre agence, grâce au droit « Voir le journal d'activité »."
      },
      {
        q: 'Que signifie la colonne « Fiche » ?',
        a: "Elle montre l'identifiant de la fiche d'aide (par exemple locatif.baux.liste), pas son titre."
      },
      {
        q: "Pourquoi aucun avis ne s'affiche-t-il ?",
        a: "Il n'y en a pas sur la période choisie. Essayez 90 jours."
      },
      {
        q: 'Peut-on répondre à une question ?',
        a: 'Pas depuis cet écran : il ne propose que la lecture.'
      }
    ],
    permissions: {
      roles: ['Super-administrateur de la plateforme', "Administrateur de l'agence"],
      note: "Vue plateforme : réservée au super-administrateur. Vue agence : demande le droit « Voir le journal d'activité », que seul l'administrateur de l'agence détient par défaut."
    },
    related: [{ label: 'Tableau des avis', helpId: 'administration.avis-aide.tableau' }],
    keywords: ['avis', 'retours', 'aide', 'utile', 'questions', 'amélioration', "fiches d'aide"]
  },
  {
    id: 'administration.avis-aide.tableau',
    kind: 'table',
    title: 'Tableau des avis',
    summary:
      "Chaque ligne est une fiche d'aide avec le nombre d'avis reçus. Cliquez sur une ligne qui a des questions pour les lire.",
    purpose: 'Voir quelles fiches déçoivent et quelles questions les utilisateurs se posent.',
    howToRead: {
      columns: [
        { key: 'helpId', label: 'Fiche', description: "Identifiant de la fiche d'aide concernée." },
        { key: 'useful', label: 'Utile', description: "Nombre d'avis « utile » sur la période." },
        { key: 'notUseful', label: 'Pas utile', description: "Nombre d'avis « pas utile » sur la période." },
        {
          key: 'questionsCount',
          label: 'Questions',
          description: 'Nombre de questions posées depuis la fiche (le total est exact).'
        },
        {
          key: 'lastAt',
          label: 'Dernier avis',
          description: 'Date du dernier retour reçu pour cette fiche (avis ou question).'
        }
      ],
      notes: [
        "Une ligne dépliée montre le texte de chaque question, sa date et sa langue (Français, Anglais, Arabe). Sur la plateforme, le nom de l'agence s'ajoute.",
        "Seules les 1 000 questions les plus récentes de la période sont lues, et 20 sont montrées par fiche : une fiche très bavarde peut en masquer d'autres, mais le compteur « Questions » reste exact.",
        "Ce tableau n'a pas de bouton d'export."
      ]
    },
    steps: [
      {
        title: 'Lire les compteurs',
        detail: 'Une fiche avec beaucoup de « Pas utile » ou de « Questions » est à revoir.'
      },
      { title: 'Déplier une ligne', detail: 'Cliquez dessus : seules les lignes avec des questions se déplient.' },
      { title: 'Lire les questions', detail: 'Date, langue et, sur la plateforme, agence.' }
    ],
    consequences: ["Lecture seule : aucune action n'est possible depuis ce tableau."],
    faq: [
      {
        q: 'Pourquoi le nombre de questions affichées est-il inférieur au compteur ?',
        a: "L'écran montre au plus 20 questions par fiche. Le compteur, lui, compte toutes les questions de la période."
      },
      {
        q: 'Pourquoi une ligne ne se déplie-t-elle pas ?',
        a: "Elle n'a pas de question : seuls des avis « utile » ou « pas utile » ont été reçus."
      },
      {
        q: 'Les questions peuvent-elles citer des personnes ?',
        a: "Oui, le texte est libre. C'est pourquoi la vue d'une agence est réservée à son administrateur."
      }
    ],
    permissions: {
      roles: ['Super-administrateur de la plateforme', "Administrateur de l'agence"]
    },
    related: [{ label: "Avis sur l'aide", helpId: 'administration.avis-aide' }],
    keywords: ['tableau', 'avis', 'questions', 'fiches', 'utile', 'pas utile']
  }
];

export default entries;
