import type { HelpEntry } from '../../../types';

/** Zone « canaux » du module « communication » (fr). */
const entries: HelpEntry[] = [
  {
    id: 'communication.canaux.email',
    kind: 'page',
    title: 'Notifications par e-mail',
    summary:
      'Choisissez quels e-mails automatiques votre agence envoie, à qui, et personnalisez leur sujet et leur texte. Chaque ligne du tableau correspond à un événement précis et à son destinataire.',
    purpose:
      "Quand un événement se produit dans l'application (bail activé, paiement approuvé, appel de charges émis…), un e-mail part automatiquement vers la personne prévue : locataire, propriétaire, copropriétaire ou collaborateur de l'agence. Ici, vous décidez si cet e-mail part ou non, et vous pouvez remplacer son texte par le vôtre.",
    steps: [
      {
        title: "Trouver l'événement",
        detail:
          "Dans le tableau, cherchez l'événement, ou filtrez par destinataire, par état « Activer » ou par événement déclencheur."
      },
      {
        title: 'Activer ou couper',
        detail: "Utilisez l'interrupteur de la colonne « Activer » : le changement est enregistré tout de suite."
      },
      {
        title: 'Ouvrir le modèle',
        detail:
          "Cliquez sur « Modifier » dans la ligne, ou choisissez l'événement dans la liste en haut de l'écran, puis cliquez sur un destinataire."
      },
      {
        title: 'Adapter le texte',
        detail: 'Changez le sujet et le corps du message, avec les variables proposées.'
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer ». Le nouveau texte est utilisé dès le prochain envoi.'
      }
    ],
    consequences: [
      "Un interrupteur coupé : l'e-mail de cet événement n'est plus envoyé par votre agence. Les e-mails déjà partis ne sont pas concernés.",
      "Le texte que vous enregistrez part tel quel chez vos clients. Relisez-le : les variables entre doubles accolades sont remplacées par les vraies informations au moment de l'envoi.",
      "Exception : l'alerte « Compte de réception de paiement modifié » part toujours vers les administrateurs de l'agence, quel que soit son interrupteur.",
      'Quelques événements de la liste, comme « Affaire créée » ou « Rappel rendez-vous », ne sont reliés à aucun envoi automatique pour le moment : les régler ne change rien.'
    ],
    faq: [
      {
        q: 'Pourquoi les interrupteurs sont-ils grisés ?',
        a: "Vous n'avez pas le droit de modifier les paramètres de l'agence. L'écran affiche alors « Lecture seule » : demandez ce droit à l'administrateur de votre agence."
      },
      {
        q: 'Puis-je envoyer un e-mail de test ?',
        a: "Non, cet écran n'a pas d'envoi de test. Le message part la première fois que l'événement se produit réellement."
      },
      {
        q: "Un événement que je cherche n'apparaît pas.",
        a: 'Selon le pack de votre agence, certains événements peuvent ne pas être proposés : seuls ceux des modules que vous possédez sont affichés.'
      }
    ],
    permissions: {
      note: "Le menu demande l'accès au module Communication. Modifier un interrupteur ou un texte demande en plus le droit de modifier les paramètres de l'agence."
    },
    related: [
      {
        label: 'Comment lire le tableau',
        helpId: 'communication.canaux.email.tableau'
      },
      {
        label: 'Choisir un événement et son destinataire',
        helpId: 'communication.canaux.email.evenement'
      },
      {
        label: "Modifier le modèle d'un e-mail",
        helpId: 'communication.canaux.email.modele'
      },
      {
        label: 'Notifications WhatsApp',
        helpId: 'communication.canaux.whatsapp'
      }
    ],
    keywords: [
      'e-mail',
      'email',
      'courriel',
      'notification',
      'message automatique',
      'modèle',
      'template',
      'sujet',
      'interrupteur',
      'rappel',
      'communication'
    ]
  },
  {
    id: 'communication.canaux.email.evenement',
    kind: 'section',
    title: 'Choisir un événement et son destinataire',
    summary:
      "Sélectionnez l'événement à personnaliser, puis le destinataire dont vous voulez modifier le message. Un même événement peut prévenir plusieurs personnes avec des textes différents.",
    purpose:
      "Un événement comme « Nouveau ticket de maintenance » peut prévenir à la fois l'agence, le locataire et le propriétaire, chacun avec son propre e-mail. Ce bloc vous fait choisir lequel modifier.",
    steps: [
      {
        title: "Chercher l'événement",
        detail: 'Ouvrez la liste « Sélectionner un événement déclencheur » et tapez quelques lettres pour la filtrer.'
      },
      {
        title: 'Voir les destinataires',
        detail: 'Ils apparaissent en boutons sous « Destinataires pour cet événement ».'
      },
      {
        title: 'Choisir un destinataire',
        detail: 'Cliquez sur son bouton : son modèle s’ouvre juste en dessous.'
      }
    ],
    consequences: [
      "Si vous changez d'événement ou de destinataire avant d'avoir cliqué sur « Enregistrer », ce que vous aviez saisi est perdu."
    ],
    faq: [
      {
        q: 'Quelle différence avec le tableau du bas ?',
        a: 'Le tableau montre tous les événements avec leur interrupteur. Cette liste regroupe les événements pour modifier le texte de chaque destinataire.'
      },
      {
        q: 'À quoi sert le bouton « Modifier » du tableau ?',
        a: "Il ouvre directement l'événement et le destinataire de la ligne, en haut de l'écran."
      },
      {
        q: 'Pourquoi un seul bouton de destinataire pour certains événements ?',
        a: "Parce que l'événement ne prévient qu'une seule personne ou un seul groupe."
      }
    ],
    related: [
      {
        label: "Modifier le modèle d'un e-mail",
        helpId: 'communication.canaux.email.modele'
      },
      {
        label: 'Comment lire le tableau',
        helpId: 'communication.canaux.email.tableau'
      }
    ],
    keywords: ['événement déclencheur', 'destinataire', 'locataire', 'propriétaire', 'agence']
  },
  {
    id: 'communication.canaux.email.modele',
    kind: 'section',
    title: "Modèle de l'e-mail",
    summary:
      "Voyez le modèle par défaut d'un e-mail et remplacez son sujet et son corps par vos propres textes. Laissez vide pour garder le modèle d'origine.",
    purpose:
      "Chaque e-mail a un modèle fourni avec l'application. Vous pouvez le personnaliser pour employer le ton de votre agence, ajouter vos coordonnées ou changer des formulations.",
    steps: [
      {
        title: "Lire le modèle d'origine",
        detail: 'Il est affiché dans « Template par défaut (modèle) » : le sujet, puis le corps.'
      },
      {
        title: 'Partir de ce modèle',
        detail: 'Cliquez sur « Utiliser ce modèle dans les champs ci-dessous ». Rien n’est enregistré à ce stade.'
      },
      {
        title: 'Modifier',
        detail: 'Changez « Sujet personnalisé » et « Corps personnalisé HTML ».'
      },
      {
        title: 'Insérer des variables',
        detail: 'Cliquez sur une variable sous « Variables pour cet événement ».'
      },
      {
        title: "Appliquer à d'autres destinataires",
        detail: "Si l'événement en a plusieurs, cochez ceux qui doivent recevoir le même texte."
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer ».'
      },
      {
        title: "Revenir à l'origine",
        detail: 'Cliquez sur « Réinitialiser au modèle par défaut ».'
      }
    ],
    consequences: [
      "Les champs sont déjà remplis avec le modèle d'origine. Si vous cliquez sur « Enregistrer » sans rien changer, ce texte est enregistré comme votre texte personnalisé : il ne suivra plus les évolutions du modèle d'origine.",
      "À l'enregistrement, le corps est nettoyé : les éléments non autorisés (comme les scripts) sont retirés. Le sujet perd ses retours à la ligne et ne dépasse pas 500 caractères.",
      "Après « Enregistrer » ou « Réinitialiser », l'éditeur se referme et la liste est rechargée.",
      "« Réinitialiser » efface votre sujet et votre corps sans demander confirmation, et remet aussi l'événement sur « Activer » : c'est irréversible."
    ],
    faq: [
      {
        q: 'Puis-je écrire du HTML ?',
        a: "Oui, le corps se saisit dans un éditeur de code HTML. Les éléments non autorisés sont retirés à l'enregistrement."
      },
      {
        q: 'Que se passe-t-il si je vide le sujet ?',
        a: 'Le sujet par défaut est utilisé.'
      },
      {
        q: 'Comment vérifier le rendu avant envoi ?',
        a: "Cet écran n'a ni aperçu ni envoi de test : relisez bien votre texte, variables comprises."
      }
    ],
    permissions: {
      note: "Modifier demande le droit de modifier les paramètres de l'agence. Sans ce droit, les champs sont en lecture seule."
    },
    related: [
      {
        label: "Variables d'un e-mail",
        helpId: 'communication.canaux.email.variables'
      },
      {
        label: "Appliquer un modèle à d'autres destinataires",
        helpId: 'communication.canaux.email.appliquer'
      }
    ],
    keywords: ['modèle', 'template', 'sujet', 'corps', 'personnaliser', 'réinitialiser', 'html']
  },
  {
    id: 'communication.canaux.email.variables',
    kind: 'section',
    title: "Variables d'un e-mail",
    summary:
      "Les variables sont des mots entre doubles accolades, comme {{agencyName}}, remplacés à l'envoi par les vraies informations. La liste affichée dépend de l'événement choisi.",
    purpose:
      "Elles permettent d'écrire un seul modèle qui s'adapte à chaque envoi : nom du destinataire, nom de l'agence, montant, date d'échéance, lien vers le portail…",
    howToRead: {
      notes: [
        "{{agencyName}} : le nom de l'agence.",
        '{{contactName}} : le nom du destinataire, pour les événements qui le proposent.',
        '{{tenantName}} : le nom du locataire.',
        '{{ownerName}} : le nom du propriétaire.',
        '{{amount}} : le montant du paiement ou de l’échéance.',
        '{{dueDate}} : la date d’échéance.'
      ]
    },
    steps: [
      {
        title: 'Afficher le modèle',
        detail: 'Choisissez un événement et un destinataire pour ouvrir son modèle.'
      },
      {
        title: 'Cliquer sur une variable',
        detail: 'Sous « Variables pour cet événement », cliquez sur celle qui vous intéresse.'
      },
      {
        title: 'La déplacer',
        detail: 'Elle est ajoutée à la fin du corps : coupez-la et collez-la où vous voulez.'
      }
    ],
    consequences: [
      'Le clic ajoute la variable dans le corps uniquement, toujours à la fin. Pour en mettre dans le sujet, tapez-la à la main.',
      "Utilisez seulement les variables de la liste : ce sont les seules que l'application connaît pour cet événement."
    ],
    faq: [
      {
        q: 'Pourquoi la liste change-t-elle selon l’événement ?',
        a: 'Chaque événement connaît des informations différentes : un paiement a un montant, un ticket de maintenance a un titre.'
      },
      {
        q: 'Pourquoi un clic sur une variable ne fait-il rien ?',
        a: "Sans le droit de modifier les paramètres de l'agence, les variables ne s'insèrent pas."
      },
      {
        q: 'Dois-je taper les accolades ?',
        a: 'Non, le clic les ajoute. Si vous tapez une variable à la main, écrivez deux accolades de chaque côté du nom.'
      }
    ],
    related: [
      {
        label: "Modèle de l'e-mail",
        helpId: 'communication.canaux.email.modele'
      }
    ],
    keywords: ['variable', 'accolades', 'nom', 'montant', 'date', 'insérer']
  },
  {
    id: 'communication.canaux.email.appliquer',
    kind: 'section',
    title: "Appliquer un modèle à d'autres destinataires",
    summary:
      'Copiez le même sujet et le même corps vers les autres destinataires du même événement, en une seule fois.',
    purpose:
      "Quand un événement prévient plusieurs personnes (par exemple le locataire et le propriétaire), vous pouvez écrire un texte puis l'appliquer aux autres sans le ressaisir. Ce bloc n'apparaît que si l'événement a plusieurs destinataires.",
    steps: [
      {
        title: 'Rédiger le texte',
        detail: 'Écrivez le sujet et le corps pour le destinataire choisi.'
      },
      {
        title: 'Cocher les autres',
        detail: 'Cochez les destinataires qui doivent recevoir le même texte.'
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer » : le texte est enregistré pour tous les destinataires cochés.'
      }
    ],
    consequences: [
      'Le sujet et le corps remplacent les textes personnalisés déjà enregistrés pour les destinataires cochés.',
      "Seuls le sujet et le corps sont copiés : l'interrupteur de chaque destinataire ne change pas.",
      'Les variables ne sont pas les mêmes pour chaque destinataire : vérifiez que celles que vous utilisez existent pour tous.'
    ],
    faq: [
      {
        q: 'Pourquoi ce bloc est-il absent ?',
        a: "L'événement n'a qu'un seul destinataire."
      },
      {
        q: 'Puis-je annuler ?',
        a: 'Oui, destinataire par destinataire, avec « Réinitialiser au modèle par défaut ».'
      },
      {
        q: 'Les cases restent-elles cochées ?',
        a: "Non, elles sont décochées après l'enregistrement."
      }
    ],
    related: [
      {
        label: "Modèle de l'e-mail",
        helpId: 'communication.canaux.email.modele'
      }
    ],
    keywords: ['copier', 'plusieurs destinataires', 'même texte', 'cocher']
  },
  {
    id: 'communication.canaux.email.tableau',
    kind: 'table',
    title: 'Liste des notifications email',
    summary:
      "Tous les e-mails automatiques que l'application peut envoyer, avec leur destinataire et leur interrupteur.",
    purpose: "Ce tableau vous donne la vue d'ensemble : lesquels sont actifs, pour qui, et lesquels vous avez coupés.",
    howToRead: {
      columns: [
        {
          key: 'label',
          label: 'Événement déclencheur',
          description: "Le nom de l'événement et, en gris dessous, ce qui le déclenche."
        },
        {
          key: 'recipientLabel',
          label: 'Destinataire',
          description:
            "La personne ou le groupe qui reçoit l'e-mail : locataire, propriétaire, copropriétaire, administrateurs ou gestionnaires de l'agence…"
        },
        {
          key: 'enabled',
          label: 'Activer',
          description:
            "Interrupteur : allumé, l'e-mail part ; éteint, il ne part pas. Tout est allumé tant que vous n'avez rien changé."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: "Le bouton « Modifier » ouvre le modèle de la ligne, en haut de l'écran."
        }
      ],
      notes: [
        'Un même événement apparaît sur plusieurs lignes quand plusieurs personnes sont prévenues, chacune avec son propre texte.',
        'La recherche et les filtres travaillent sur la liste déjà chargée ; le tableau affiche 20 lignes par page.'
      ]
    },
    steps: [
      {
        title: 'Chercher',
        detail: "Tapez un mot de l'événement, du destinataire ou de la description, ou utilisez les filtres."
      },
      {
        title: 'Activer ou couper',
        detail: "Cliquez sur l'interrupteur de la ligne."
      },
      {
        title: 'Modifier le texte',
        detail: 'Cliquez sur « Modifier ».'
      }
    ],
    consequences: [
      "L'interrupteur agit tout de suite, sans bouton d'enregistrement : un message confirme « Notification activée » ou « Notification désactivée ».",
      "Sans le droit de modifier les paramètres de l'agence, les interrupteurs sont grisés."
    ],
    faq: [
      {
        q: 'Que veut dire « Agence (admins) » ?',
        a: "Les administrateurs de l'agence reçoivent cet e-mail."
      },
      {
        q: 'Pourquoi tout est-il activé au départ ?',
        a: "Un événement pour lequel rien n'a été enregistré est considéré comme activé."
      },
      {
        q: 'Dois-je cliquer sur « Enregistrer » après un interrupteur ?',
        a: 'Non, le changement est enregistré immédiatement.'
      }
    ],
    related: [
      {
        label: 'Notifications par e-mail',
        helpId: 'communication.canaux.email'
      }
    ],
    keywords: ['liste', 'événements', 'interrupteur', 'activer', 'désactiver', 'filtrer']
  },
  {
    id: 'communication.canaux.whatsapp',
    kind: 'page',
    title: 'Notifications WhatsApp',
    summary:
      'Réglez les messages WhatsApp automatiques de votre agence : quel événement envoie un message, à qui, et avec quel texte. Un message part uniquement vers une personne qui a donné son consentement WhatsApp et dont le numéro est renseigné.',
    purpose:
      "Quand un événement se produit (échéance de loyer, bail activé, appel de charges émis…), l'application peut envoyer un message WhatsApp au locataire, au propriétaire, au copropriétaire ou aux gestionnaires. Ici, vous choisissez les événements actifs et vous pouvez remplacer le texte par défaut.\n\nL'envoi réel dépend aussi du fournisseur WhatsApp configuré par l'administrateur de la plateforme.",
    steps: [
      {
        title: "Trouver l'événement",
        detail: "Dans le tableau, cherchez l'événement, ou filtrez par destinataire ou par état « Activer »."
      },
      {
        title: 'Activer ou couper',
        detail: "Utilisez l'interrupteur de la colonne « Activer » : c'est enregistré tout de suite."
      },
      {
        title: 'Ouvrir le message',
        detail:
          "Cliquez sur « Modifier » dans la ligne, ou sur le bouton de l'événement sous « Modifier le message d'un événement »."
      },
      {
        title: 'Adapter le texte',
        detail: 'Changez le message, puis cliquez sur « Enregistrer ».'
      }
    ],
    consequences: [
      "Un interrupteur coupé : ce message WhatsApp n'est plus envoyé par votre agence.",
      'Quatre messages sont éteints tant que vous ne les allumez pas : « Fin de bail prochaine (propriétaire, WhatsApp) », « Document à renouveler (propriétaire, WhatsApp) », « Rapport mensuel du propriétaire (WhatsApp) » et « Lien de paiement du loyer (WhatsApp) ». Les autres sont allumés d’office.',
      "Deux événements partent sans action de votre part quand ils sont allumés et que la plateforme les a activés : l'invitation au groupe WhatsApp d'un nouveau contact CRM et l'annonce d'un bien publié dans ce groupe.",
      'Quelques événements, comme « Rappel rendez-vous », « Étape affaire modifiée », « Alerte renouvellement contrat (WhatsApp) » et « Incident partie commune (WhatsApp) », ne sont reliés à aucun envoi pour le moment.'
    ],
    faq: [
      {
        q: 'Pourquoi une personne ne reçoit-elle rien ?',
        a: 'Vérifiez que son consentement WhatsApp est coché et que son numéro WhatsApp (ou son téléphone principal) est renseigné dans sa fiche contact.'
      },
      {
        q: 'Puis-je envoyer un message de test ?',
        a: "Non, cet écran n'a pas d'envoi de test."
      },
      {
        q: "Un événement que je cherche n'apparaît pas.",
        a: 'Selon le pack de votre agence, certains événements peuvent ne pas être proposés : seuls ceux des modules que vous possédez sont affichés.'
      }
    ],
    permissions: {
      note: "Le menu demande l'accès au module Communication. Modifier un réglage demande ce même accès (ou d'être administrateur de l'agence) : sinon l'enregistrement est refusé."
    },
    related: [
      {
        label: 'Comment lire le tableau',
        helpId: 'communication.canaux.whatsapp.tableau'
      },
      {
        label: "Choisir l'événement à modifier",
        helpId: 'communication.canaux.whatsapp.evenement'
      },
      {
        label: "Message WhatsApp d'un événement",
        helpId: 'communication.canaux.whatsapp.message'
      },
      {
        label: 'Message groupé WhatsApp',
        helpId: 'communication.canaux.whatsapp-groupe'
      },
      {
        label: 'Notifications par e-mail',
        helpId: 'communication.canaux.email'
      }
    ],
    keywords: [
      'whatsapp',
      'message',
      'notification',
      'consentement',
      'numéro',
      'twilio',
      'rappel',
      'message automatique',
      'communication'
    ]
  },
  {
    id: 'communication.canaux.whatsapp.evenement',
    kind: 'section',
    title: "Choisir l'événement à modifier",
    summary: "Chaque bouton correspond à un événement WhatsApp. Cliquez sur l'un d'eux pour ouvrir son message.",
    purpose:
      "Sous les boutons, un encadré vert rappelle ce que déclenche l'événement et son destinataire : locataire, propriétaire, copropriétaire, contact CRM ou gestionnaires.",
    steps: [
      {
        title: 'Cliquer sur un bouton',
        detail: 'Le bouton choisi devient plein.'
      },
      {
        title: "Lire l'encadré",
        detail: "Il décrit l'événement et indique le destinataire."
      },
      {
        title: 'Modifier',
        detail: "Le formulaire du message s'ouvre juste en dessous."
      }
    ],
    consequences: [
      "Si vous changez d'événement avant d'avoir cliqué sur « Enregistrer », ce que vous aviez saisi est perdu."
    ],
    faq: [
      {
        q: 'Comment trouver vite un événement ?',
        a: 'Utilisez la recherche du tableau, puis « Modifier » sur la ligne trouvée.'
      },
      {
        q: 'Quelle différence avec le tableau ?',
        a: "Le tableau montre l'interrupteur de chaque événement ; les boutons ouvrent le message à modifier."
      },
      {
        q: "Pourquoi n'y a-t-il pas tous les événements ?",
        a: 'Selon le pack de votre agence, certains événements peuvent ne pas être proposés.'
      }
    ],
    related: [
      {
        label: "Message WhatsApp d'un événement",
        helpId: 'communication.canaux.whatsapp.message'
      }
    ],
    keywords: ['événement', 'bouton', 'destinataire']
  },
  {
    id: 'communication.canaux.whatsapp.message',
    kind: 'section',
    title: "Message WhatsApp d'un événement",
    summary:
      "Remplacez le message par défaut d'un événement par votre propre texte, ou laissez le champ vide pour garder le message d'origine.",
    purpose:
      "Le message est du texte simple, sans mise en page HTML. Vous pouvez y glisser des variables qui sont remplacées par les vraies informations à l'envoi.",
    steps: [
      {
        title: 'Lire le message',
        detail:
          "Le champ « Message personnalisé (vide = message par défaut) » est déjà rempli avec le message d'origine."
      },
      {
        title: 'Modifier',
        detail: 'Changez le texte à votre convenance.'
      },
      {
        title: 'Insérer des variables',
        detail: 'Cliquez sur une variable sous « Variables pour cet événement (cliquez pour insérer) ».'
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer ». Le formulaire reste ouvert.'
      },
      {
        title: "Revenir à l'origine",
        detail: 'Cliquez sur « Réinitialiser au message par défaut ».'
      }
    ],
    consequences: [
      "Le champ est déjà rempli avec le message d'origine. Si vous cliquez sur « Enregistrer » sans rien changer, ce texte est enregistré comme votre message personnalisé : il ne suivra plus les évolutions du message d'origine.",
      "Texte seul, sans HTML. Au-delà de 4000 caractères, l'enregistrement est refusé.",
      "Si un « Content SID (Twilio) » est renseigné et que la plateforme envoie ses messages avec Twilio, c'est le modèle Twilio qui part, pas ce texte.",
      "« Réinitialiser au message par défaut » efface votre texte et les réglages Twilio sans demander confirmation, et remet l'interrupteur dans son état d'origine : c'est irréversible."
    ],
    faq: [
      {
        q: 'Puis-je mettre un lien ?',
        a: "Oui : écrivez l'adresse complète (https://…). L'application retire la ponctuation collée à la fin pour que WhatsApp la reconnaisse comme un lien."
      },
      {
        q: 'Que devient une variable sans valeur ?',
        a: 'Elle disparaît du message : une variable vide est remplacée par rien.'
      },
      {
        q: "Comment revenir au message d'origine ?",
        a: 'Cliquez sur « Réinitialiser au message par défaut ».'
      }
    ],
    related: [
      {
        label: "Variables d'un message WhatsApp",
        helpId: 'communication.canaux.whatsapp.variables'
      },
      {
        label: 'Template Twilio',
        helpId: 'communication.canaux.whatsapp.twilio'
      }
    ],
    keywords: ['message', 'texte', 'personnaliser', 'réinitialiser', 'lien']
  },
  {
    id: 'communication.canaux.whatsapp.variables',
    kind: 'section',
    title: "Variables d'un message WhatsApp",
    summary:
      "Les variables sont des mots entre doubles accolades, comme {{tenantName}}, remplacés à l'envoi par les vraies informations. La liste dépend de l'événement choisi.",
    purpose:
      "Elles permettent d'écrire un seul message qui s'adapte à chaque envoi : nom du destinataire, nom de l'agence, montant, date d'échéance…",
    howToRead: {
      notes: [
        "{{agencyName}} : le nom de l'agence.",
        '{{tenantName}} : le nom du locataire.',
        '{{ownerName}} : le nom du propriétaire.',
        '{{amount}} : le montant.',
        '{{dueDate}} : la date d’échéance.'
      ]
    },
    steps: [
      {
        title: 'Choisir un événement',
        detail: 'Ses variables apparaissent sous le champ du message.'
      },
      {
        title: 'Cliquer sur une variable',
        detail: 'Elle est ajoutée à la fin du message.'
      },
      {
        title: 'La déplacer',
        detail: "Coupez-la et collez-la à l'endroit voulu."
      }
    ],
    consequences: [
      "Une variable sans valeur à l'envoi est remplacée par rien.",
      "Utilisez seulement les variables de la liste : ce sont les seules que l'application connaît pour cet événement."
    ],
    faq: [
      {
        q: 'Pourquoi la liste change-t-elle selon l’événement ?',
        a: 'Chaque événement connaît des informations différentes : un paiement a un montant, un ticket a un titre.'
      },
      {
        q: 'Dois-je taper les accolades ?',
        a: 'Non, le clic les ajoute. Si vous tapez une variable à la main, écrivez deux accolades de chaque côté du nom.'
      },
      {
        q: 'La variable se place-t-elle au curseur ?',
        a: 'Non, elle est toujours ajoutée à la fin du message.'
      }
    ],
    related: [
      {
        label: "Message WhatsApp d'un événement",
        helpId: 'communication.canaux.whatsapp.message'
      }
    ],
    keywords: ['variable', 'accolades', 'insérer', 'nom', 'montant']
  },
  {
    id: 'communication.canaux.whatsapp.twilio',
    kind: 'section',
    title: "Template Twilio (message à l'initiative de l'agence)",
    summary:
      "Pour écrire en premier à une personne, Twilio exige un modèle de message approuvé à l'avance. Renseignez ici son identifiant (Content SID) et la correspondance de ses variables.",
    purpose:
      "L'encadré bleu en haut de l'écran l'explique : pour envoyer sans que le client ait répondu, Twilio exige un modèle pré-approuvé. Cette section relie l'événement à ce modèle.",
    howToRead: {
      notes: [
        "Content SID (Twilio) : l'identifiant du modèle approuvé, de la forme HX suivi de chiffres et de lettres.",
        "Mapping des variables (JSON) : pour chaque numéro du modèle (1, 2…), le nom de la variable à y mettre. Exemple de l'écran : le numéro 1 reçoit la date du rendez-vous (appointmentDate), le numéro 2 son heure (appointmentTime)."
      ]
    },
    steps: [
      {
        title: "Obtenir l'identifiant",
        detail: "Munissez-vous du Content SID d'un modèle approuvé dans votre compte Twilio."
      },
      {
        title: 'Ouvrir la section',
        detail: "Dépliez « Template Twilio (message initié par l'entreprise) » sous les variables."
      },
      {
        title: "Coller l'identifiant",
        detail: 'Renseignez « Content SID (Twilio) ».'
      },
      {
        title: 'Relier les variables',
        detail: 'Renseignez « Mapping des variables (JSON) » en suivant l’exemple affiché sous le champ.'
      },
      {
        title: 'Enregistrer',
        detail: 'Cliquez sur « Enregistrer ».'
      }
    ],
    consequences: [
      "Avec un Content SID, le message envoyé est celui du modèle approuvé : votre message personnalisé n'est pas utilisé.",
      'Ce réglage ne sert que si la plateforme envoie ses messages avec Twilio. Avec un autre fournisseur, il est ignoré et le texte du message part à la place.',
      'Si la correspondance des variables est mal écrite, les valeurs ne sont pas transmises au modèle.'
    ],
    faq: [
      {
        q: 'Où trouver le Content SID ?',
        a: 'Dans votre compte Twilio, sur la fiche du modèle approuvé : il commence par HX.'
      },
      {
        q: 'Dois-je remplir cette section pour chaque événement ?',
        a: 'Non, seulement pour les événements que vous voulez envoyer en premier.'
      },
      {
        q: 'Et si je ne la remplis pas ?',
        a: "L'application envoie le texte du message. D'après l'écran, Twilio exige un modèle approuvé pour écrire en premier : sans lui, l'envoi peut être refusé."
      }
    ],
    related: [
      {
        label: "Message WhatsApp d'un événement",
        helpId: 'communication.canaux.whatsapp.message'
      }
    ],
    keywords: ['twilio', 'content sid', 'modèle approuvé', 'template', 'whatsapp', 'initiative']
  },
  {
    id: 'communication.canaux.whatsapp.tableau',
    kind: 'table',
    title: 'Liste des notifications WhatsApp',
    summary:
      "Tous les messages WhatsApp automatiques que l'application peut envoyer, avec leur destinataire et leur interrupteur.",
    purpose:
      "Ce tableau vous donne la vue d'ensemble : quels messages sont actifs, pour qui, et lesquels vous avez coupés.",
    howToRead: {
      columns: [
        {
          key: 'label',
          label: 'Événement déclencheur',
          description: "Le nom de l'événement et, en gris dessous, ce qui le déclenche."
        },
        {
          key: 'recipientLabel',
          label: 'Destinataire',
          description:
            'La personne ou le groupe qui reçoit le message : locataire, propriétaire, copropriétaire, contact CRM, groupe WhatsApp…'
        },
        {
          key: 'enabled',
          label: 'Activer',
          description:
            "Interrupteur : allumé, le message part ; éteint, il ne part pas. La plupart sont allumés tant que vous n'avez rien changé ; quatre messages destinés aux propriétaires et aux locataires sont éteints au départ."
        },
        {
          key: 'actions',
          label: 'Actions',
          description: "Le bouton « Modifier » ouvre le message de la ligne, en haut de l'écran."
        }
      ],
      notes: [
        'La recherche et les filtres travaillent sur la liste déjà chargée ; le tableau affiche 20 lignes par page.'
      ]
    },
    steps: [
      {
        title: 'Chercher',
        detail: "Tapez un mot de l'événement, du destinataire ou de la description, ou utilisez les filtres."
      },
      {
        title: 'Activer ou couper',
        detail: "Cliquez sur l'interrupteur de la ligne."
      },
      {
        title: 'Modifier le message',
        detail: 'Cliquez sur « Modifier ».'
      }
    ],
    consequences: [
      "L'interrupteur agit tout de suite, sans bouton d'enregistrement : un message confirme « Notification activée » ou « Notification désactivée ».",
      "Allumer un message ne suffit pas à l'envoyer : la personne doit avoir donné son consentement WhatsApp et avoir un numéro renseigné."
    ],
    faq: [
      {
        q: 'Pourquoi certains messages sont-ils éteints au départ ?',
        a: "Ce sont des alertes ajoutées après coup : elles restent éteintes pour éviter d'envoyer des messages que personne n'a demandés."
      },
      {
        q: 'Dois-je cliquer sur « Enregistrer » après un interrupteur ?',
        a: 'Non, le changement est enregistré immédiatement.'
      },
      {
        q: 'Que veut dire « Groupe WhatsApp » comme destinataire ?',
        a: 'Le message est publié dans le groupe WhatsApp de diffusion, et non envoyé à une personne.'
      }
    ],
    related: [
      {
        label: 'Notifications WhatsApp',
        helpId: 'communication.canaux.whatsapp'
      }
    ],
    keywords: ['liste', 'événements', 'interrupteur', 'activer', 'désactiver', 'filtrer']
  },
  {
    id: 'communication.canaux.whatsapp-groupe',
    kind: 'page',
    title: 'Message groupé WhatsApp',
    summary:
      "Écrivez un message libre, avec ou sans image, et envoyez-le d'un clic au groupe WhatsApp de diffusion. Le message part tout de suite et ne peut pas être rappelé depuis l'application.",
    purpose:
      'Ce groupe sert à diffuser des nouvelles à vos contacts, par exemple les nouveaux biens disponibles. Les annonces de biens publiés partent dans ce même groupe : ici, vous envoyez vous-même un message ponctuel.',
    steps: [
      {
        title: 'Écrire',
        detail: 'Tapez votre message dans le grand champ de saisie.'
      },
      {
        title: 'Mettre en forme',
        detail: 'Utilisez les boutons au-dessus du champ : gras, italique, barré, code, émojis, liste.'
      },
      {
        title: 'Ajouter une image',
        detail: 'Facultatif : cliquez sur « Image » (JPEG ou PNG).'
      },
      {
        title: 'Relire',
        detail: 'Le nombre de caractères est affiché sous le champ.'
      },
      {
        title: 'Envoyer',
        detail: 'Cliquez sur « Envoyer au groupe ».'
      }
    ],
    consequences: [
      "Tous les membres du groupe voient le message. Il n'y a ni confirmation avant l'envoi, ni annulation après.",
      "Le groupe est fixé dans la configuration de la plateforme : vous ne pouvez pas en choisir un autre ici, et sans cette configuration l'envoi est refusé.",
      "Le texte n'est pas gardé : si vous quittez l'écran avant l'envoi, il est perdu. Après un envoi réussi, le champ est vidé.",
      'Cet écran ne garde pas la liste des messages envoyés.'
    ],
    faq: [
      {
        q: 'Pourquoi le bouton « Envoyer au groupe » est-il grisé ?',
        a: 'Il faut au moins un texte ou une image.'
      },
      {
        q: 'Mon message a-t-il une longueur maximale ?',
        a: "Oui : 4000 caractères au plus. Au-delà, l'envoi est refusé."
      },
      {
        q: 'Le consentement des contacts est-il vérifié ?',
        a: 'Non : le message va dans le groupe, pas à chaque contact. Seules les personnes déjà membres du groupe le reçoivent.'
      }
    ],
    permissions: {
      note: "Le menu demande l'accès au module Communication. L'envoi demande ce même accès (ou d'être administrateur de l'agence)."
    },
    related: [
      {
        label: 'Mise en forme WhatsApp',
        helpId: 'communication.canaux.whatsapp-groupe.mise-en-forme'
      },
      {
        label: 'Image jointe',
        helpId: 'communication.canaux.whatsapp-groupe.image'
      },
      {
        label: 'Envoyer au groupe',
        helpId: 'communication.canaux.whatsapp-groupe.envoi'
      },
      {
        label: 'Notifications WhatsApp',
        helpId: 'communication.canaux.whatsapp'
      }
    ],
    keywords: ['groupe', 'whatsapp', 'diffusion', 'message libre', 'annonce', 'broadcast', 'image']
  },
  {
    id: 'communication.canaux.whatsapp-groupe.mise-en-forme',
    kind: 'section',
    title: 'Mise en forme WhatsApp',
    summary:
      'Les boutons au-dessus du champ ajoutent la mise en forme de WhatsApp : gras, italique, barré, code, liste et émojis.',
    purpose:
      'WhatsApp met en forme le texte grâce à des symboles placés autour des mots. Les boutons les ajoutent pour vous.',
    howToRead: {
      notes: [
        'Gras : le texte entre étoiles, *comme ceci*.',
        'Italique : le texte entre tirets bas, _comme ceci_.',
        'Barré : le texte entre tildes, ~comme ceci~.',
        'Code : le texte entre accents graves, `comme ceci`.'
      ]
    },
    steps: [
      {
        title: 'Sélectionner un mot',
        detail: 'Surlignez-le dans le champ de saisie.'
      },
      {
        title: 'Cliquer sur le bouton',
        detail: '« Gras », « Italique », « Barré » ou « Code » : les symboles sont ajoutés autour du mot.'
      },
      {
        title: 'Faire une liste',
        detail: '« Liste » ajoute un tiret au début d’une nouvelle ligne.'
      },
      {
        title: 'Ajouter un émoji',
        detail: '« Emojis » ouvre une palette de 16 émojis : cliquez pour l’insérer au curseur.'
      }
    ],
    consequences: [
      "Le champ affiche les symboles, pas le résultat : c'est WhatsApp qui met en forme à la réception.",
      "Évitez les espaces à l'intérieur des symboles, sinon la mise en forme ne s'applique pas."
    ],
    faq: [
      {
        q: "Pourquoi le gras n'apparaît-il pas dans le champ ?",
        a: "C'est normal : le champ montre les symboles, pas le rendu."
      },
      {
        q: 'Puis-je taper les symboles à la main ?',
        a: 'Oui, les boutons ne font que les ajouter.'
      },
      {
        q: 'Y a-t-il un aperçu du message ?',
        a: "Non, seulement un aperçu de l'image jointe."
      }
    ],
    related: [
      {
        label: 'Message groupé WhatsApp',
        helpId: 'communication.canaux.whatsapp-groupe'
      }
    ],
    keywords: ['gras', 'italique', 'barré', 'code', 'émoji', 'liste', 'format']
  },
  {
    id: 'communication.canaux.whatsapp-groupe.image',
    kind: 'section',
    title: 'Image jointe',
    summary: 'Ajoutez une image à votre message : elle part avec votre texte comme légende.',
    purpose: "L'image est facultative. Vous pouvez aussi envoyer une image seule, sans texte.",
    steps: [
      {
        title: 'Choisir le fichier',
        detail: 'Cliquez sur « Image » et sélectionnez une photo.'
      },
      {
        title: "Contrôler l'aperçu",
        detail: "Il s'affiche sous le champ, avec le nom du fichier."
      },
      {
        title: 'La retirer',
        detail: "Cliquez sur « Retirer l'image » pour changer d’avis."
      }
    ],
    consequences: [
      "Formats acceptés : JPEG et PNG, 5 Mo au plus. Un autre fichier est refusé par l'écran.",
      'Votre texte devient la légende de l’image.',
      "Si l'envoi de l'image échoue alors que vous avez écrit un texte, le texte part seul et l'écran l'indique. Sans texte, l'envoi échoue.",
      "Une copie de l'image est conservée par l'application."
    ],
    faq: [
      {
        q: 'Pourquoi mon image est-elle refusée ?',
        a: "Elle n'est ni en JPEG ni en PNG, ou elle dépasse 5 Mo."
      },
      {
        q: 'Puis-je envoyer plusieurs images ?',
        a: 'Non, une seule image par message.'
      },
      {
        q: "Puis-je envoyer l'image sans texte ?",
        a: "Oui : le bouton d'envoi est actif dès qu'il y a un texte ou une image."
      }
    ],
    related: [
      {
        label: 'Envoyer au groupe',
        helpId: 'communication.canaux.whatsapp-groupe.envoi'
      }
    ],
    keywords: ['image', 'photo', 'jpeg', 'png', 'légende', 'joindre']
  },
  {
    id: 'communication.canaux.whatsapp-groupe.envoi',
    kind: 'section',
    title: 'Envoyer au groupe',
    summary: 'Le bouton « Envoyer au groupe » diffuse tout de suite votre message dans le groupe WhatsApp configuré.',
    purpose: "C'est l'étape finale : une fois envoyé, le message est visible de tous les membres du groupe.",
    steps: [
      {
        title: 'Relire',
        detail: 'Vérifiez le texte, le nombre de caractères et l’image éventuelle.'
      },
      {
        title: 'Envoyer',
        detail: 'Cliquez sur « Envoyer au groupe ».'
      },
      {
        title: 'Attendre la confirmation',
        detail: 'Un message de confirmation indique que le message est envoyé et par quel fournisseur.'
      }
    ],
    consequences: [
      "L'envoi est immédiat et définitif : l'application ne permet pas de rappeler le message.",
      "Après un envoi réussi, le texte et l'image sont effacés de l'écran.",
      'En cas d’erreur, rien n’est effacé : vous pouvez corriger et recommencer.'
    ],
    faq: [
      {
        q: 'Que veut dire « image non envoyée, texte envoyé » ?',
        a: "L'image n'a pas pu partir, mais votre texte a bien été envoyé seul dans le groupe."
      },
      {
        q: "Pourquoi le fournisseur WhatsApp refuse-t-il l'envoi ?",
        a: "Le service WhatsApp de la plateforme a rejeté le message. Réessayez plus tard ou prévenez l'administrateur."
      },
      {
        q: "Que faire si le groupe n'est pas configuré ?",
        a: "L'envoi est refusé avec un message d'erreur : demandez à l'administrateur de la plateforme de configurer le groupe."
      }
    ],
    related: [
      {
        label: 'Message groupé WhatsApp',
        helpId: 'communication.canaux.whatsapp-groupe'
      }
    ],
    keywords: ['envoyer', 'groupe', 'diffuser', 'erreur', 'fournisseur']
  }
];

export default entries;
