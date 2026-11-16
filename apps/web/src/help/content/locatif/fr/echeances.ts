import type { HelpEntry } from '../../../types';

/** Zone « echeances » du module « locatif » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'locatif.echeances.liste',
    kind: 'page',
    title: 'Liste des échéances',
    summary: `Retrouvez ici les échéances de loyer de votre agence : ce qui est dû, ce qui est payé et ce qui reste à payer. C'est l'écran pour encaisser un loyer, envoyer un lien de paiement ou relancer un locataire.`,
    purpose: `Une échéance est un loyer à payer pour une période (un mois, par exemple), avec sa date limite. Les échéances d'un bail se génèrent depuis la fiche du bail ; cet écran sert ensuite à suivre les paiements et les retards.\n\nLe même écran se retrouve dans l'onglet « Échéances » de la fiche d'un bail : il ne montre alors que les échéances de ce bail.`,
    steps: [
      {
        title: 'Rechercher',
        detail: `Tapez un numéro de bail, un bien ou un nom de locataire dans le champ de recherche.`
      },
      {
        title: 'Filtrer',
        detail: `Utilisez « Statut », « En retard uniquement », « Date d'échéance » et, hors fiche de bail, « Locataire ».`
      },
      {
        title: 'Encaisser un loyer en espèces',
        detail: `Cliquez sur « Encaisser », vérifiez le montant, le locataire et l'échéance, puis « Confirmer l'encaissement ».`
      },
      {
        title: 'Enregistrer un autre paiement',
        detail: `Cliquez sur « Paiement… » (sur téléphone : « Paiement détaillé… ») pour choisir le mode de paiement, le montant et la date.`
      },
      {
        title: 'Envoyer un lien de paiement ou une relance',
        detail: `Boutons « Envoyer un lien de paiement » et « Envoyer une relance » de la ligne.`
      },
      {
        title: 'Relancer plusieurs locataires',
        detail: `Bouton « Envoyer des relances en lot », en haut de l'écran.`
      },
      {
        title: 'Ouvrir le détail',
        detail: `Cliquez sur « Voir » pour ouvrir la fiche de l'échéance.`
      },
      {
        title: 'Exporter',
        detail: `Bouton « Exporter » : toutes les échéances correspondant à vos filtres sont exportées, pas seulement la page affichée.`
      }
    ],
    consequences: [
      `« Encaisser » enregistre immédiatement un paiement en espèces égal au reste à payer, daté du jour, et le rattache à l'échéance. Une confirmation vous est demandée avant l'enregistrement.`,
      `Dans l'onglet d'un bail, « Générer les échéances » crée le plan d'échéances du bail. C'est refusé si des échéances existent déjà ou si le bail est annulé ou terminé.`,
      `« Recalculer les statuts et pénalités » met à jour les statuts des échéances du bail, puis calcule les pénalités de toutes les échéances en retard de votre agence, pas seulement de ce bail.`,
      `« Supprimer toutes les échéances » est irréversible. C'est refusé si un paiement est rattaché à une échéance du bail, ou si le bail s'est terminé depuis moins de 30 jours.`,
      `Un lien de paiement ou une relance envoyé ne peut pas être rappelé.`
    ],
    faq: [
      {
        q: 'Comment est calculé le « Reste à payer » ?',
        a: `Montant dû (loyer + charges + autres frais + pénalités) moins ce qui a déjà été payé. Une échéance soldée n'affiche plus d'actions d'encaissement.`
      },
      {
        q: `Pourquoi le statut ne change-t-il pas après un recalcul ?`,
        a: `Une échéance est « En retard » dès le lendemain de sa date si rien n'est payé, « Partiel » dès qu'un paiement est enregistré, et « Payé » quand tout est réglé. Un statut « Brouillon » ou « Annulé » ne se filtre pas, mais s'affiche.`
      },
      {
        q: `Je ne vois pas « Encaisser » ou « Générer les échéances ». Pourquoi ?`,
        a: `Ces actions dépendent de vos droits : « Créer des paiements » et « Allouer les paiements » pour encaisser, « Générer les échéances » pour générer. Demandez-les à l'administrateur de votre agence.`
      },
      {
        q: `Pourquoi n'y a-t-il pas de bouton de lien ou de relance sur une ligne ?`,
        a: `Ces boutons n'apparaissent que si l'échéance est « À échoir », « Partiel » ou « En retard », avec un reste à payer, et si le bail est « Actif ».`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `Voir les échéances demande « Voir les échéances ». Encaisser demande « Créer des paiements » et « Allouer les paiements » ; le lien de paiement demande « Créer des paiements » ; les relances demandent « Allouer les paiements » ; générer, recalculer et supprimer les échéances demandent « Générer les échéances ».`
    },
    related: [
      { label: `Comment lire le tableau des échéances`, helpId: 'locatif.echeances.liste.tableau' },
      { label: `Relances en lot`, helpId: 'locatif.echeances.relance-lot' },
      { label: `Fiche d'une échéance`, helpId: 'locatif.echeances.fiche' },
      { label: 'Liste des paiements', helpId: 'locatif.paiements.liste' },
      { label: 'Liste des baux', helpId: 'locatif.baux.liste' }
    ],
    keywords: [
      'échéance',
      'échéances',
      'loyer',
      'encaisser',
      'encaissement',
      'impayé',
      'retard',
      'reste à payer',
      'relance',
      'recouvrement',
      'générer les échéances'
    ]
  },
  {
    id: 'locatif.echeances.liste.tableau',
    kind: 'table',
    title: 'Tableau des échéances',
    summary: `Chaque ligne est une échéance de loyer. Le « Reste à payer » est la donnée à regarder en premier.`,
    howToRead: {
      columns: [
        {
          key: 'bail',
          label: 'Bail',
          description: `Le numéro du bail, avec en dessous le bien concerné. Absente dans l'onglet d'un bail.`
        },
        {
          key: 'locataire',
          label: 'Locataire',
          description: `Le locataire principal du bail. Absente dans l'onglet d'un bail.`
        },
        { key: 'periode', label: 'Période', description: `La période couverte par le loyer (mois et année).` },
        { key: 'due', label: 'Échéance', description: `La date limite de paiement.` },
        { key: 'du', label: 'Montant dû', description: `Loyer, charges, autres frais et pénalités additionnés.` },
        { key: 'reste', label: 'Reste à payer', description: `Le montant dû moins ce qui a déjà été payé.` },
        { key: 'statut', label: 'Statut', description: `L'état de l'échéance (voir les statuts ci-dessous).` },
        {
          key: 'actions',
          label: 'Actions',
          description: `Voir, Encaisser, Paiement…, lien de paiement, relance. Seules les actions possibles sur la ligne et permises par vos droits s'affichent.`
        }
      ],
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: `Échéance générée mais pas encore à payer.` },
        {
          value: 'DUE',
          label: 'À échoir',
          description: `À payer, sans paiement enregistré, date limite pas encore dépassée.`
        },
        { value: 'PARTIAL', label: 'Partiel', description: `Un paiement a été enregistré, mais il reste un solde.` },
        { value: 'PAID', label: 'Payé', description: `Le montant dû est entièrement réglé.` },
        { value: 'OVERDUE', label: 'En retard', description: `La date limite est dépassée et rien n'est payé.` },
        { value: 'CANCELED', label: 'Annulé', description: `Échéance annulée : elle n'est plus à payer.` }
      ],
      notes: [
        `Sur téléphone, le tableau devient une suite de cartes : le reste à payer est en tête, et les pénalités n'apparaissent que s'il y en a.`,
        `Le filtre « Statut » propose « À échoir », « Partiel », « Payé » et « En retard ».`
      ]
    },
    steps: [
      {
        title: 'Encaisser',
        detail: `« Encaisser » règle tout le reste en espèces, à la date du jour, après confirmation.`
      },
      {
        title: 'Paiement…',
        detail: `Ouvre le formulaire de paiement : le montant proposé est le reste à payer, vous pouvez le changer.`
      },
      {
        title: 'Voir',
        detail: `Ouvre la fiche de l'échéance avec le détail des montants, les liens de paiement et les relances.`
      }
    ],
    consequences: [
      `Après un encaissement, le reste à payer diminue et le statut passe à « Partiel » ou « Payé ».`,
      `Le tableau compte 50 échéances par page.`
    ],
    faq: [
      {
        q: 'Où voir le détail des pénalités et des paiements ?',
        a: `Ouvrez la fiche de l'échéance avec « Voir » : elle détaille loyer, charges, autres frais, pénalités et montant payé.`
      },
      {
        q: 'Une échéance est soldée, pourquoi plus de bouton ?',
        a: `Quand le reste à payer est à zéro, seule l'action « Voir » reste disponible.`
      },
      {
        q: 'Le montant dû a changé, pourquoi ?',
        a: `Des pénalités ont pu être ajoutées ou ajustées sur l'échéance : elles sont comprises dans le montant dû.`
      }
    ],
    related: [
      { label: `Fiche d'une échéance`, helpId: 'locatif.echeances.fiche' },
      { label: 'Pénalités de retard', helpId: 'locatif.penalites.liste' }
    ],
    keywords: ['tableau', 'loyers', 'impayés', 'solde', 'colonne']
  },
  {
    id: 'locatif.echeances.relance-lot',
    kind: 'section',
    title: 'Relances en lot',
    summary: `Cette fenêtre prépare et envoie en une fois des relances de loyer à tous les locataires concernés. Vous voyez d'abord qui sera relancé, puis vous confirmez.`,
    purpose: `Elle sert à relancer plusieurs échéances impayées sans ouvrir chaque fiche. Depuis la fiche d'un bail, elle ne concerne que ce bail.`,
    howToRead: {
      columns: [
        { key: 'periode', label: 'Période', description: `La période du loyer.` },
        { key: 'due', label: 'Échéance', description: `La date limite de paiement.` },
        {
          key: 'retard',
          label: 'Retard',
          description: `Nombre de jours de retard, ou « dans N jours » si l'échéance n'est pas encore atteinte.`
        },
        { key: 'reste', label: 'Reste dû', description: `Le montant restant à payer.` },
        {
          key: 'niveau',
          label: 'Niveau suivant',
          description: `Le niveau de relance qui sera envoyé : 1 rappel amiable, 2 relance ferme, 3 dernier avis.`
        },
        { key: 'canaux', label: 'Canaux', description: `E-mail et/ou WhatsApp utilisables pour ce locataire.` },
        {
          key: 'lien',
          label: 'Lien joint',
          description: `« Lien de paiement » si un lien de paiement en ligne sera joint au message, « Sans lien » sinon.`
        },
        { key: 'motif', label: 'Motif', description: `Pour une ligne exclue, la raison qui empêche de la relancer.` }
      ],
      notes: [
        `Les lignes sont regroupées par locataire et par bail, avec le « Total dû » de chaque groupe.`,
        `Seules les lignes éligibles peuvent être cochées ; elles le sont toutes au départ, dans la limite de 200.`
      ]
    },
    steps: [
      {
        title: 'Régler les filtres',
        detail: `« Retard minimal (jours) » (1 par défaut) et « Jours avant échéance (0 à 30) » (0 par défaut), puis « Actualiser ».`
      },
      { title: 'Vérifier la liste', detail: `Lisez les lignes éligibles et les motifs d'exclusion.` },
      {
        title: 'Cocher ou décocher',
        detail: `Gardez seulement les échéances à relancer. Le « Montant dû de la sélection » se met à jour.`
      },
      {
        title: 'Envoyer',
        detail: `Cliquez sur « Envoyer N relance(s) ». Le résultat indique le nombre d'envoyées, d'ignorées et d'échecs, ligne par ligne.`
      }
    ],
    consequences: [
      `L'envoi est irréversible. Le locataire principal du bail reçoit le message par e-mail et/ou WhatsApp, selon ce qui est utilisable : il faut son consentement, une adresse ou un numéro, et que cette notification soit activée pour votre agence.`,
      `Le message comporte le montant dû et la date d'échéance. Il joint un lien de paiement en ligne si le paiement en ligne est disponible pour votre agence, et rappelle les numéros Mobile Money de l'agence s'ils sont enregistrés.`,
      `Il y a trois niveaux (rappel amiable, relance ferme, dernier avis), au minimum 7 jours entre deux niveaux. Une fois les trois envoyés, l'échéance n'est plus relançable.`,
      `Le serveur revérifie chaque ligne à l'envoi : une relance peut être « Ignorée » si la situation a changé (paiement reçu, paiement en cours de vérification...). Chaque envoi est consigné dans l'historique de l'échéance.`
    ],
    faq: [
      {
        q: `Pourquoi une échéance est-elle grisée ?`,
        a: `Elle est exclue pour une raison indiquée dans « Motif » : déjà soldée, relance trop récente, aucun e-mail ni WhatsApp utilisable, bail non actif, etc.`
      },
      {
        q: `Puis-je relancer plus de 200 échéances ?`,
        a: `La sélection est limitée à 200 échéances. Relancez en plusieurs fois.`
      },
      {
        q: `Que se passe-t-il si l'envoi s'interrompt ?`,
        a: `Un message l'indique, et les relances affichées dans le résultat sont déjà parties : ne les renvoyez pas.`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `Le bouton « Envoyer des relances en lot » demande « Allouer les paiements ».`
    },
    related: [
      { label: `Relance d'une seule échéance`, helpId: 'locatif.echeances.relance-individuelle' },
      { label: 'Liste des échéances', helpId: 'locatif.echeances.liste' }
    ],
    keywords: ['relancer', 'rappel', 'impayés', 'WhatsApp', 'e-mail', 'recouvrement', 'lot', 'groupée']
  },
  {
    id: 'locatif.echeances.relance-individuelle',
    kind: 'section',
    title: `Relance d'une échéance`,
    summary: `Cette fenêtre montre ce qui sera envoyé au locataire pour une échéance : niveau, canaux et aperçu du message. Rien n'est envoyé tant que vous ne cliquez pas sur « Envoyer la relance ».`,
    purpose: `Elle permet de relancer un locataire qui n'a pas payé, par e-mail et/ou WhatsApp, en gardant la trace de l'envoi dans l'historique de l'échéance.`,
    steps: [
      {
        title: `Ouvrir la fenêtre`,
        detail: `Bouton « Envoyer une relance » sur la ligne de l'échéance ou sur sa fiche.`
      },
      {
        title: 'Lire les alertes',
        detail: `Si l'échéance ne peut pas être relancée, la fenêtre en donne les raisons et le bouton d'envoi reste grisé.`
      },
      {
        title: 'Choisir le niveau',
        detail: `« Niveau de la relance » : 1 rappel amiable, 2 relance ferme, 3 dernier avis. Le niveau proposé suit les relances déjà envoyées.`
      },
      {
        title: 'Choisir les canaux',
        detail: `Cochez « E-mail » et/ou « WhatsApp ». Seuls les canaux utilisables pour ce locataire sont proposés.`
      },
      {
        title: 'Vérifier le message',
        detail: `L'aperçu est indicatif ; le texte envoyé suit le modèle de message de votre agence. Un bandeau dit si un lien de paiement en ligne sera joint.`
      },
      { title: 'Envoyer', detail: `Cliquez sur « Envoyer la relance », puis lisez le résultat canal par canal.` }
    ],
    consequences: [
      `L'envoi est irréversible. Le locataire principal du bail est prévenu, sous réserve de son consentement et de l'activation de cette notification pour votre agence.`,
      `Le message comporte le montant dû et la date d'échéance, un lien de paiement en ligne si disponible, et les numéros Mobile Money de l'agence s'ils sont enregistrés.`,
      `Il faut 7 jours au minimum entre deux niveaux, et trois niveaux au plus. Si tous les canaux échouent, le lien de paiement créé pour la relance est annulé.`,
      `Chaque canal tenté ajoute une ligne à l'historique des relances de l'échéance.`
    ],
    faq: [
      {
        q: `Pourquoi le bouton « Envoyer la relance » est-il grisé ?`,
        a: `Soit l'échéance est exclue (la fenêtre en donne le motif), soit aucun canal n'est coché ou utilisable.`
      },
      {
        q: `Puis-je choisir un autre niveau que celui proposé ?`,
        a: `Oui, la liste « Niveau de la relance » le permet. Les règles d'espacement et de maximum s'appliquent toujours.`
      },
      {
        q: 'Que signifie « Relance trop récente » ?',
        a: `Une relance a été envoyée il y a moins de 7 jours pour cette échéance : attendez avant d'en envoyer une autre.`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `Le bouton demande « Allouer les paiements ». Il n'apparaît que pour une échéance « À échoir », « Partiel » ou « En retard » avec un reste à payer, sur un bail « Actif ».`
    },
    related: [
      { label: 'Relances en lot', helpId: 'locatif.echeances.relance-lot' },
      { label: 'Historique des relances', helpId: 'locatif.echeances.fiche.relances' }
    ],
    keywords: ['relancer', 'rappel amiable', 'dernier avis', 'WhatsApp', 'e-mail', 'impayé']
  },
  {
    id: 'locatif.echeances.fiche',
    kind: 'page',
    title: `Fiche d'une échéance`,
    summary: `Cette fiche détaille une échéance de loyer : les montants, les dates, les liens de paiement envoyés et l'historique des relances. C'est ici que vous contrôlez le reste à payer avant de relancer.`,
    purpose: `Elle répond à la question « pourquoi ce loyer n'est-il pas soldé ? » : elle montre ce qui compose le montant dû, ce qui a été payé et ce qui a déjà été tenté pour obtenir le paiement.`,
    howToRead: {
      statuses: [
        { value: 'DRAFT', label: 'Brouillon', description: `Échéance générée mais pas encore à payer.` },
        {
          value: 'DUE',
          label: 'Échéance',
          description: `À payer, date limite pas encore dépassée (la liste l'appelle « À échoir »).`
        },
        { value: 'PARTIAL', label: 'Partiel', description: `Un paiement est enregistré, il reste un solde.` },
        { value: 'PAID', label: 'Payé', description: `Entièrement réglée.` },
        { value: 'OVERDUE', label: 'En retard', description: `Date limite dépassée et rien de payé.` },
        {
          value: 'CANCELED',
          label: 'Annulé',
          description: `Échéance annulée. Son statut s'affiche alors tel quel sur cette fiche.`
        }
      ],
      notes: [
        `Le statut est affiché en haut à droite et dans la carte « Informations ».`,
        `Cette fiche ne liste pas les paiements un par un : consultez la liste des paiements du bail pour les voir.`
      ]
    },
    steps: [
      { title: 'Lire les montants', detail: `Carte « Informations financières » : de « Loyer » à « Reste à payer ».` },
      { title: 'Relancer', detail: `Bouton « Envoyer une relance », en haut, si l'échéance s'y prête.` },
      {
        title: 'Envoyer un lien de paiement',
        detail: `Dans la carte « Lien de paiement Mobile Money », bouton « Envoyer un lien de paiement ».`
      },
      {
        title: `Contrôler l'historique`,
        detail: `Carte « Historique des relances » : qui a relancé, quand, sur quel canal.`
      },
      { title: 'Revenir au bail', detail: `Bouton « Retour » en haut à gauche.` }
    ],
    consequences: [
      `Cette fiche est en lecture seule : aucun montant ne s'y modifie.`,
      `Envoyer une relance ou un lien est irréversible : le message part au locataire.`
    ],
    faq: [
      {
        q: 'Comment est calculé le « Total dû » ?',
        a: `Loyer, charges de service, autres frais et pénalités additionnés. Le « Reste à payer » est ce total moins le « Montant Payé ».`
      },
      {
        q: 'Pourquoi des boutons manquent-ils ?',
        a: `Relance et lien n'apparaissent que si l'échéance est « Échéance », « Partiel » ou « En retard » avec un reste à payer, sur un bail « Actif », et selon vos droits.`
      },
      {
        q: 'Où corriger un montant ?',
        a: `Pas sur cette fiche. Une pénalité s'ajuste depuis l'onglet « Pénalités » du bail ; un paiement se gère depuis la liste des paiements.`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `Voir la fiche demande « Voir les échéances ». Les liens de paiement et l'historique des relances demandent « Voir les paiements » ; créer ou révoquer un lien demande « Créer des paiements » ; relancer demande « Allouer les paiements ».`
    },
    related: [
      { label: 'Montants de la fiche', helpId: 'locatif.echeances.fiche.finances' },
      { label: 'Liens de paiement', helpId: 'locatif.echeances.fiche.liens' },
      { label: 'Historique des relances', helpId: 'locatif.echeances.fiche.relances' },
      { label: 'Liste des échéances', helpId: 'locatif.echeances.liste' }
    ],
    keywords: ['détail échéance', 'loyer', 'reste à payer', 'total dû', 'relance', 'lien de paiement']
  },
  {
    id: 'locatif.echeances.fiche.finances',
    kind: 'section',
    title: 'Informations financières',
    summary: `Cette carte décompose le montant dû de l'échéance et montre ce qui a été payé. Le « Reste à payer » est en rouge tant qu'il y a un solde, en vert quand tout est réglé.`,
    howToRead: {
      notes: [
        `« Loyer », « Charges de service », « Autres frais » et « Pénalités » s'additionnent pour donner le « Total dû ».`,
        `« Montant Payé » est la somme déjà rattachée à cette échéance.`,
        `« Reste à payer » = « Total dû » moins « Montant Payé ».`,
        `Les montants sont en FCFA.`
      ]
    },
    consequences: [
      `Les « Pénalités » viennent du calcul des pénalités de retard ou d'un ajustement manuel : elles augmentent le total dû et le reste à payer.`
    ],
    faq: [
      {
        q: `Pourquoi le total dû est-il plus élevé que le loyer ?`,
        a: `Il inclut les charges de service, les autres frais et les éventuelles pénalités de retard.`
      },
      {
        q: 'Peut-on modifier un montant ici ?',
        a: `Non, la carte est en lecture seule.`
      }
    ],
    related: [{ label: 'Pénalités de retard', helpId: 'locatif.penalites.liste' }],
    keywords: ['montant', 'total dû', 'charges', 'pénalités', 'reste à payer', 'payé']
  },
  {
    id: 'locatif.echeances.fiche.informations',
    kind: 'section',
    title: `Informations de l'échéance`,
    summary: `Cette carte donne la période, la date limite, le statut et les dates utiles de l'échéance.`,
    howToRead: {
      notes: [
        `« Période » : le mois et l'année couverts. « Date d'échéance » : la date limite de paiement.`,
        `« Date de paiement » : n'apparaît que lorsque l'échéance a été réglée.`,
        `« Devise » : toujours affichée en FCFA.`,
        `« Date de création » et « Dernière mise à jour » : quand l'échéance a été générée puis modifiée pour la dernière fois.`
      ]
    },
    faq: [
      {
        q: `Pourquoi n'y a-t-il pas de « Date de paiement » ?`,
        a: `Elle ne s'affiche que lorsque l'échéance est réglée.`
      },
      {
        q: 'Que veut dire « En retard » ?',
        a: `La date limite est dépassée et aucun paiement n'est enregistré. Dès qu'un paiement est enregistré, l'échéance devient « Partiel », même en retard.`
      }
    ],
    keywords: ['période', 'date limite', 'statut', 'date de paiement']
  },
  {
    id: 'locatif.echeances.fiche.liens',
    kind: 'section',
    title: 'Lien de paiement Mobile Money',
    summary: `Cette carte permet d'envoyer au locataire un lien pour payer le reste dû par Mobile Money, et liste les liens déjà créés pour cette échéance.`,
    purpose: `Un lien évite au locataire de se déplacer : il paie depuis son téléphone. Le montant est recalculé au moment du paiement et n'apparaît pas dans le lien.`,
    steps: [
      {
        title: 'Créer un lien',
        detail: `Cliquez sur « Envoyer un lien de paiement » (visible seulement si l'échéance est encore à payer).`
      },
      { title: 'Suivre', detail: `Dans le tableau, lisez les consultations, le statut du lien et l'état du paiement.` },
      {
        title: 'Révoquer',
        detail: `« Révoquer » sur un lien « Actif » : le locataire ne pourra plus payer avec ce lien.`
      }
    ],
    consequences: [
      `La révocation est immédiate. Elle ne concerne que ce lien : vous pouvez en envoyer un nouveau.`,
      `Une relance peut aussi joindre un lien de paiement : il apparaît alors dans ce tableau.`
    ],
    faq: [
      {
        q: 'Pourquoi cette carte est-elle absente ?',
        a: `Elle demande le droit « Voir les paiements ».`
      },
      {
        q: `Que veut dire « À vérifier » ?`,
        a: `Le paiement en ligne demande une vérification avant d'être pris en compte. Contactez votre administrateur si cela dure.`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `Voir la carte demande « Voir les paiements » ; créer ou révoquer un lien demande « Créer des paiements ».`
    },
    related: [
      { label: 'Comment lire le tableau des liens', helpId: 'locatif.echeances.fiche.liens.tableau' },
      { label: 'Envoyer un lien de paiement', helpId: 'locatif.echeances.fiche.lien-envoi' }
    ],
    keywords: ['lien', 'Mobile Money', 'payer en ligne', 'Orange Money', 'Wave', 'MTN']
  },
  {
    id: 'locatif.echeances.fiche.liens.tableau',
    kind: 'table',
    title: 'Tableau des liens de paiement',
    summary: `Chaque ligne est un lien créé pour cette échéance. Il montre sa validité, ses consultations et le paiement obtenu.`,
    howToRead: {
      columns: [
        { key: 'createdAt', label: 'Créé le', description: `Date et heure de création du lien.` },
        {
          key: 'expiresAt',
          label: 'Expire le',
          description: `Date et heure après lesquelles le lien ne fonctionne plus.`
        },
        { key: 'viewCount', label: 'Consultations', description: `Nombre de fois où le lien a été ouvert.` },
        { key: 'lastViewedAt', label: 'Dernière consultation', description: `Date et heure de la dernière ouverture.` },
        { key: 'status', label: 'Statut', description: `État du lien (voir les statuts ci-dessous).` },
        {
          key: 'payment',
          label: 'Paiement',
          description: `Où en est le paiement fait avec ce lien, avec le montant si un paiement a eu lieu.`
        },
        { key: 'actions', label: 'Actions', description: `« Révoquer », pour un lien « Actif » seulement.` }
      ],
      statuses: [
        { value: 'ACTIVE', label: 'Actif', description: `Le lien fonctionne encore.` },
        { value: 'EXPIRED', label: 'Expiré', description: `La durée de validité est passée.` },
        { value: 'REVOKED', label: 'Révoqué', description: `Le lien a été désactivé par l'agence.` }
      ],
      notes: [
        `Colonne « Paiement » : « Aucun paiement », « Paiement en cours », « Payé », « Échoué », « Annulé », « Expiré » ou « À vérifier ».`
      ]
    },
    faq: [
      {
        q: `Un lien « Actif » a été consulté plusieurs fois : est-ce normal ?`,
        a: `Oui, le locataire peut ouvrir le lien plusieurs fois avant de payer.`
      },
      {
        q: `Puis-je revoir l'adresse d'un lien déjà créé ?`,
        a: `Non, l'adresse n'est montrée qu'à la création, en mode « Copier le lien ». Créez-en un nouveau si besoin.`
      },
      {
        q: 'Comment exporter ce tableau ?',
        a: `Utilisez le bouton « Exporter » du tableau.`
      }
    ],
    related: [{ label: 'Carte du lien de paiement', helpId: 'locatif.echeances.fiche.liens' }],
    keywords: ['liens', 'consultations', 'révoquer', 'expiré']
  },
  {
    id: 'locatif.echeances.fiche.lien-envoi',
    kind: 'section',
    title: 'Envoyer un lien de paiement',
    summary: `Cette fenêtre crée un lien de paiement Mobile Money pour l'échéance. Vous l'envoyez au locataire ou vous le copiez pour le transmettre vous-même.`,
    steps: [
      { title: 'Choisir le mode', detail: `« Envoyer au locataire (WhatsApp ou e-mail) » ou « Copier le lien ».` },
      { title: 'Régler la durée', detail: `« Durée de validité (jours) » : de 1 à 30 jours, 7 par défaut.` },
      { title: 'Valider', detail: `Cliquez sur « Envoyer le lien » ou « Créer le lien ».` },
      {
        title: 'Copier si besoin',
        detail: `En mode copie, cliquez sur « Copier » avant de fermer : le lien ne sera plus affiché ensuite.`
      }
    ],
    consequences: [
      `En mode envoi, le locataire reçoit le lien par WhatsApp ou par e-mail, selon ce qui est utilisable. Si aucun canal n'est possible (pas de consentement, pas de numéro ni d'e-mail, notification désactivée), la fenêtre l'explique et rien n'est envoyé.`,
      `Le lien ne peut plus être rappelé une fois envoyé ; on peut seulement le révoquer depuis la carte « Lien de paiement Mobile Money ».`,
      `Le montant à payer est recalculé au moment du paiement.`
    ],
    faq: [
      {
        q: `J'ai fermé la fenêtre sans copier le lien, que faire ?`,
        a: `Créez un nouveau lien : l'ancien ne peut pas être réaffiché.`
      },
      {
        q: `Pourquoi l'envoi dit-il « Aucun canal éligible » ?`,
        a: `Le locataire n'a ni numéro WhatsApp ni e-mail utilisable, ou n'a pas donné son consentement.`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `Demande « Créer des paiements ». Disponible seulement pour une échéance « À échoir », « Partiel » ou « En retard » avec un reste à payer, sur un bail « Actif ».`
    },
    related: [{ label: 'Liens de paiement', helpId: 'locatif.echeances.fiche.liens' }],
    keywords: ['lien de paiement', 'copier le lien', 'WhatsApp', 'e-mail', 'Mobile Money']
  },
  {
    id: 'locatif.echeances.fiche.relances',
    kind: 'section',
    title: 'Historique des relances',
    summary: `Cette carte garde la trace des relances envoyées pour cette échéance : quand, par quel canal et avec quel résultat. Elle est en lecture seule.`,
    purpose: `Avant de relancer, vous voyez ce qui a déjà été envoyé et à quel niveau, pour éviter de harceler un locataire ou de répéter un message.`,
    consequences: [
      `Chaque canal tenté lors d'une relance ajoute une ligne, y compris en cas d'échec.`,
      `Le niveau suivant et le délai de 7 jours entre deux relances se calculent à partir de cet historique.`
    ],
    faq: [
      {
        q: 'Pourquoi cette carte est-elle absente ?',
        a: `Elle demande le droit « Voir les paiements ».`
      },
      {
        q: `Une ligne est en « Échec », que faire ?`,
        a: `Le message n'est pas parti sur ce canal. Vérifiez le contact du locataire puis relancez.`
      }
    ],
    permissions: { feature: 'RENTAL', note: `Demande « Voir les paiements ».` },
    related: [
      { label: 'Comment lire le tableau', helpId: 'locatif.echeances.fiche.relances.tableau' },
      { label: 'Relance individuelle', helpId: 'locatif.echeances.relance-individuelle' }
    ],
    keywords: ['relances', 'historique', 'envoyée', 'niveau', 'rappel']
  },
  {
    id: 'locatif.echeances.fiche.relances.tableau',
    kind: 'table',
    title: 'Tableau des relances',
    summary: `Chaque ligne est un envoi de relance sur un canal. Une relance envoyée par e-mail et par WhatsApp donne deux lignes.`,
    howToRead: {
      columns: [
        { key: 'sent_at', label: `Date d'envoi`, description: `Date et heure de la relance.` },
        {
          key: 'level',
          label: 'Niveau de relance',
          description: `Niveau 1 rappel amiable, niveau 2 relance ferme ou niveau 3 dernier avis.`
        },
        { key: 'channel', label: 'Canal', description: `E-mail ou WhatsApp.` },
        {
          key: 'status',
          label: 'Statut',
          description: `Résultat de l'envoi ; en cas d'échec, la cause est indiquée dessous.`
        },
        { key: 'sent_by_name', label: 'Envoyée par', description: `La personne de l'agence qui a envoyé la relance.` },
        {
          key: 'payment_link_id',
          label: 'Lien de paiement',
          description: `« Lien joint » si un lien de paiement accompagnait le message.`
        }
      ],
      statuses: [
        { value: 'SENT', label: 'Envoyée', description: `Le message est parti.` },
        { value: 'DELIVERED', label: 'Remise', description: `Le message est arrivé chez le locataire.` },
        { value: 'FAILED', label: 'Échec', description: `Le message n'a pas pu partir sur ce canal.` }
      ]
    },
    faq: [
      {
        q: `Pourquoi le tableau est-il vide ?`,
        a: `Aucune relance n'a encore été envoyée pour cette échéance.`
      },
      {
        q: 'Comment envoyer une nouvelle relance ?',
        a: `Utilisez le bouton « Envoyer une relance » en haut de la fiche.`
      },
      {
        q: `« Envoyée par » est vide, pourquoi ?`,
        a: `Un tiret s'affiche quand l'auteur de l'envoi n'est pas connu.`
      }
    ],
    related: [{ label: 'Historique des relances', helpId: 'locatif.echeances.fiche.relances' }],
    keywords: ['relances', 'canal', 'échec', 'remise']
  },
  {
    id: 'locatif.penalites.liste',
    kind: 'section',
    title: 'Pénalités de retard',
    summary: `Cet écran liste les pénalités calculées sur les loyers payés en retard. Vous pouvez les recalculer, les ajuster avec une raison, joindre un justificatif ou les supprimer.`,
    purpose: `Une pénalité s'ajoute à une échéance en retard et augmente son reste à payer. L'écran se trouve dans l'onglet « Pénalités » de la fiche d'un bail.`,
    steps: [
      { title: 'Calculer', detail: `Bouton « Calculer les pénalités » : voir les conséquences ci-dessous.` },
      {
        title: 'Rechercher et filtrer',
        detail: `Par texte, « Calculée le », « Ajustée », « Montant retenu » et « Justificatif ».`
      },
      {
        title: 'Ajuster',
        detail: `« Ajuster » : indiquez le « Montant retenu » (0 est permis) et la « Raison de l'ajustement », obligatoire, puis « Enregistrer l'ajustement ».`
      },
      {
        title: 'Joindre un justificatif',
        detail: `Menu « ⋮ » puis « Ajouter un justificatif » : PDF, Word ou image (JPEG, PNG). Un nouveau fichier remplace l'ancien.`
      },
      { title: 'Supprimer', detail: `Menu « ⋮ » puis « Supprimer », et confirmez.` }
    ],
    consequences: [
      `« Calculer les pénalités » traite toutes les échéances en retard de votre agence dont le bail est « Actif », pas seulement celles du bail ouvert. Le montant suit la règle de pénalité du bail, ou à défaut celle de l'agence : montant fixe, pourcentage du loyer ou pourcentage du solde, avec un plafond éventuel et un délai de grâce.`,
      `Une pénalité déjà ajustée à la main n'est jamais recalculée.`,
      `Le montant retenu est ajouté au montant dû de l'échéance et inscrit au compte du locataire ; le statut de l'échéance est mis à jour.`,
      `Ajuster change le montant retenu mais conserve le montant calculé d'origine et la raison.`,
      `La suppression est irréversible : la pénalité disparaît de l'échéance et du compte du locataire.`
    ],
    faq: [
      {
        q: `Pourquoi une échéance en retard n'a-t-elle pas de pénalité ?`,
        a: `Le délai de grâce n'est peut-être pas écoulé, le bail n'est pas « Actif », ou le solde est sous le seuil de votre agence. Lancez « Calculer les pénalités » ensuite.`
      },
      {
        q: 'Pourquoi la raison est-elle obligatoire ?',
        a: `Un montant modifié sans explication écrite est difficile à justifier auprès du locataire et du propriétaire.`
      },
      {
        q: 'Je ne vois pas les boutons « Ajuster » ou « ⋮ ».',
        a: `Ils demandent le droit « Modifier les pénalités ». « Calculer les pénalités » demande « Calculer les pénalités ».`
      }
    ],
    permissions: {
      feature: 'RENTAL',
      note: `Voir demande « Voir les pénalités » ; calculer demande « Calculer les pénalités » ; ajuster, joindre un justificatif et supprimer demandent « Modifier les pénalités ».`
    },
    related: [
      { label: 'Comment lire le tableau des pénalités', helpId: 'locatif.penalites.liste.tableau' },
      { label: 'Liste des échéances', helpId: 'locatif.echeances.liste' },
      { label: 'Fiche du bail', helpId: 'locatif.baux.fiche' }
    ],
    keywords: ['pénalité', 'pénalités', 'retard', 'majoration', 'ajuster', 'geste commercial', 'justificatif']
  },
  {
    id: 'locatif.penalites.liste.tableau',
    kind: 'table',
    title: 'Tableau des pénalités',
    summary: `Chaque ligne est une pénalité de retard. Elle montre le montant calculé et le montant réellement retenu.`,
    howToRead: {
      columns: [
        { key: 'date', label: 'Calculée le', description: `Date du dernier calcul de la pénalité.` },
        { key: 'retard', label: 'Retard', description: `Nombre de jours de retard au moment du calcul.` },
        {
          key: 'montant',
          label: 'Montant calculé',
          description: `Le montant trouvé par le calcul automatique. Un tiret s'affiche s'il n'est pas connu.`
        },
        {
          key: 'retenu',
          label: 'Montant retenu',
          description: `Le montant réellement dû. Si vous l'avez ajusté, la raison s'affiche dessous.`
        },
        {
          key: 'actions',
          label: 'Actions',
          description: `« Justificatif » pour télécharger le fichier joint, « Ajuster » et le menu « ⋮ ».`
        }
      ],
      notes: [
        `Une pénalité n'a pas de statut : elle est soit calculée, soit ajustée.`,
        `Sur téléphone, le tableau devient des cartes : le montant retenu est en tête.`
      ]
    },
    consequences: [`Le montant retenu fait partie du montant dû de l'échéance concernée.`],
    faq: [
      {
        q: 'Comment ouvrir un justificatif ?',
        a: `Cliquez sur « Justificatif » dans la ligne : le fichier se télécharge.`
      },
      {
        q: 'Le montant retenu diffère du montant calculé, pourquoi ?',
        a: `La pénalité a été ajustée à la main : la raison saisie s'affiche sous le montant retenu.`
      },
      {
        q: 'Peut-on exporter la liste ?',
        a: `Oui, avec « Exporter » : toutes les pénalités correspondant à vos filtres sont exportées.`
      }
    ],
    related: [{ label: 'Pénalités de retard', helpId: 'locatif.penalites.liste' }],
    keywords: ['tableau', 'montant retenu', 'montant calculé', 'ajustée']
  }
];

export default entries;
