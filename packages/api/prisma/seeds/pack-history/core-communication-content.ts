/**
 * Contenus des newsletters des packs Syndic, Promoteur et Patrimoine : modèles
 * HTML (police Arial, c'est un e-mail), listes de diffusion et campagnes sur
 * 36 mois. Module sans accès base.
 *
 * Aucune campagne programmée (statut SCHEDULED) : le job d'envoi de l'application
 * l'enverrait réellement. Que des campagnes envoyées (historique), des brouillons
 * et une annulée.
 */

export type NewsletterPack = 'SYNDIC' | 'PROMOTEUR' | 'PATRIMOINE_ESSENTIEL' | 'PATRIMOINE_PRO';

export type ListSource =
  /** Liste dynamique : les destinataires viennent de la base (type FROM_*). */
  | { kind: 'DERIVED' }
  /** Liste manuelle alimentée par les contacts CRM ayant ce rôle. */
  | { kind: 'CRM_ROLE'; roles: string[]; limit: number }
  /** Liste manuelle alimentée par les contacts CRM portant l'une de ces étiquettes. */
  | { kind: 'CRM_TAGS'; tags: string[]; limit: number }
  /** Liste manuelle : contacts CRM clients, sinon personnes fictives. */
  | { kind: 'CRM_ACTIVE'; limit: number; fallbackWeb: number }
  /** Liste manuelle alimentée par le formulaire public du site. */
  | { kind: 'WEB'; count: number }
  /** Liste manuelle d'entreprises partenaires (adresses de démonstration). */
  | { kind: 'COMPANIES'; names: string[] };

export interface ListDef {
  key: string;
  name: string;
  type: 'MANUAL' | 'FROM_OWNERS' | 'FROM_RENTERS' | 'FROM_CRM_CONTACTS';
  doubleOptIn: boolean;
  /** Jours avant maintenant. */
  ago: number;
  source: ListSource;
}

export interface CampaignDef {
  listKey: string;
  templateIndex: number;
  subject: string;
  bodyHtml: string;
  /** Jours avant maintenant ; null pour un brouillon. */
  sentAgo: number | null;
  status: 'SENT' | 'DRAFT' | 'CANCELLED';
  openRate: number;
  failRate?: number;
}

export interface PackNewsletter {
  templates: { name: string; html: string }[];
  lists: ListDef[];
  campaigns: CampaignDef[];
}

function template(title: string, color: string, intro: string, footer: string, closing: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;line-height:1.5">
<h1 style="color:${color};font-size:22px;margin:0 0 12px 0">${title}</h1>
<p>${intro}</p>
<div>{{contenu}}</div>
<p style="margin-top:24px">${closing}</p>
<p style="font-size:12px;color:#6b7280">${footer} <a href="{{lien_desinscription}}">Se désinscrire</a></p>
</div>`;
}

const p = (...paragraphs: string[]): string => paragraphs.map(x => `<p>${x}</p>`).join('');

// ───────────────────────────────────────────────────────────────────── SYNDIC

const SYNDIC: PackNewsletter = {
  templates: [
    {
      name: 'Lettre aux copropriétaires',
      html: template(
        'La lettre de votre syndic',
        '#166534',
        'Bonjour {{prenom}},',
        'Vous recevez ce message en tant que copropriétaire ou résident d’un immeuble géré par notre cabinet.',
        'Cordialement,<br/>Votre gestionnaire de copropriété'
      )
    },
    {
      name: 'Convocation et vie de la copropriété',
      html: template(
        'Vie de la copropriété',
        '#0f766e',
        'Bonjour {{prenom}},',
        'Message adressé aux membres de la copropriété.',
        'Le syndic reste à votre disposition pour toute question.'
      )
    },
    {
      name: 'Avis aux résidents et prestataires',
      html: template(
        'Avis important',
        '#b45309',
        'Bonjour {{prenom}},',
        'Avis diffusé aux résidents et aux prestataires intervenant dans nos immeubles.',
        'Merci de votre compréhension.'
      )
    }
  ],
  lists: [
    {
      key: 'COPROS',
      name: 'Copropriétaires et occupants (base CRM)',
      type: 'FROM_CRM_CONTACTS',
      doubleOptIn: false,
      ago: 1030,
      source: { kind: 'DERIVED' }
    },
    {
      key: 'CONSEIL',
      name: 'Conseils syndicaux',
      type: 'MANUAL',
      doubleOptIn: false,
      ago: 1000,
      source: { kind: 'CRM_ROLE', roles: ['COOWNER'], limit: 12 }
    },
    {
      key: 'RESIDENTS',
      name: 'Résidents locataires',
      type: 'MANUAL',
      doubleOptIn: false,
      ago: 990,
      source: { kind: 'CRM_ROLE', roles: ['TENANT'], limit: 60 }
    },
    {
      key: 'PRESTA',
      name: 'Prestataires et fournisseurs des immeubles',
      type: 'MANUAL',
      doubleOptIn: false,
      ago: 960,
      source: {
        kind: 'COMPANIES',
        names: [
          'Ascenseurs Ivoire Service',
          'Nettoyage Express Abidjan',
          'Sécurité Ivoire Protection',
          'Jardins du Golfe',
          'Plomberie Moderne d’Abobo',
          'Élec-Habitat Cocody',
          'Groupes Électrogènes Ivoire',
          'Étanchéité Plus CI',
          'Peinture Pro Abidjan',
          'Hygiène Plus CI',
          'Froid Service CI',
          'Bâtiment Plus Cocody',
          'Télésurveillance Lagune',
          'Portails et Automatismes Riviera'
        ]
      }
    },
    {
      key: 'PROSPECTS',
      name: 'Propriétaires bailleurs et investisseurs (site web)',
      type: 'MANUAL',
      doubleOptIn: true,
      ago: 940,
      source: { kind: 'WEB', count: 42 }
    }
  ],
  campaigns: [
    {
      listKey: 'COPROS',
      templateIndex: 0,
      subject: 'Bienvenue : votre syndic vous présente ses services',
      sentAgo: 1010,
      status: 'SENT',
      openRate: 0.62,
      bodyHtml: p(
        'Nous sommes heureux de vous accompagner dans la gestion de votre copropriété : appels de charges, entretien des parties communes, suivi des contrats et organisation des assemblées générales.',
        'Votre espace en ligne vous permet de consulter vos appels, vos quittances et les procès-verbaux à tout moment.'
      )
    },
    {
      listKey: 'COPROS',
      templateIndex: 1,
      subject: 'Convocation à l’assemblée générale ordinaire : approbation des comptes',
      sentAgo: 905,
      status: 'SENT',
      openRate: 0.71,
      bodyHtml: p(
        'L’assemblée générale ordinaire se tiendra dans la salle de réunion de l’immeuble. L’ordre du jour comprend l’approbation des comptes de l’exercice, le vote du budget prévisionnel et le renouvellement du conseil syndical.',
        'Si vous ne pouvez pas être présent, donnez pouvoir à un autre copropriétaire avec le formulaire joint à votre convocation.'
      )
    },
    {
      listKey: 'CONSEIL',
      templateIndex: 1,
      subject: 'Conseil syndical : préparation du budget prévisionnel',
      sentAgo: 810,
      status: 'SENT',
      openRate: 0.83,
      bodyHtml: p(
        'Avant l’assemblée, nous vous proposons une réunion de travail pour examiner les postes de dépenses : gardiennage, électricité des parties communes, entretien de l’ascenseur et provisions pour travaux.',
        'Les devis comparatifs sont disponibles dans votre espace de gestion.'
      )
    },
    {
      listKey: 'COPROS',
      templateIndex: 0,
      subject: 'Appel de charges du trimestre : modes de paiement',
      sentAgo: 650,
      status: 'SENT',
      openRate: 0.66,
      bodyHtml: p(
        'L’appel de charges du trimestre est disponible. Vous pouvez régler par Orange Money, MTN, Wave, chèque ou virement ; le paiement en ligne génère automatiquement votre quittance.',
        'Les charges réglées avant l’échéance évitent les relances et les pénalités prévues au règlement de copropriété.'
      )
    },
    {
      listKey: 'RESIDENTS',
      templateIndex: 2,
      subject: 'Résidents : rappel du règlement intérieur',
      sentAgo: 540,
      status: 'SENT',
      openRate: 0.55,
      failRate: 0.06,
      bodyHtml: p(
        'Pour la tranquillité de tous, nous rappelons les horaires de dépôt des ordures, l’usage des parkings et l’interdiction d’encombrer les parties communes.',
        'Le gardien reste votre interlocuteur pour tout incident du quotidien.'
      )
    },
    {
      listKey: 'COPROS',
      templateIndex: 1,
      subject: 'Travaux d’étanchéité de la toiture : calendrier et précautions',
      sentAgo: 410,
      status: 'SENT',
      openRate: 0.74,
      bodyHtml: p(
        'Les travaux d’étanchéité votés en assemblée débuteront dans trois semaines et dureront environ un mois. L’entreprise interviendra de 8 h à 17 h, sauf le dimanche.',
        'Nous vous remercions de dégager les terrasses et de signaler toute infiltration au syndic.'
      )
    },
    {
      listKey: 'PRESTA',
      templateIndex: 2,
      subject: 'Prestataires : consultation pour le renouvellement du contrat d’ascenseur',
      sentAgo: 280,
      status: 'SENT',
      openRate: 0.7,
      failRate: 0.08,
      bodyHtml: p(
        'Le contrat de maintenance de l’ascenseur arrive à échéance. Nous lançons une consultation : merci de nous transmettre votre offre détaillée avant la date limite indiquée dans le cahier des charges.',
        'Seront examinés le prix, les délais d’intervention et les garanties de pièces.'
      )
    },
    {
      listKey: 'COPROS',
      templateIndex: 0,
      subject: 'Charges impayées : régularisez avant l’assemblée générale',
      sentAgo: 100,
      status: 'SENT',
      openRate: 0.69,
      bodyHtml: p(
        'Quelques lots présentent encore des charges en retard. Nous vous invitons à régulariser votre situation avant l’assemblée générale afin de conserver votre droit de vote.',
        'En cas de difficulté, contactez-nous pour convenir d’un échéancier : nous préférons toujours une solution amiable.'
      )
    },
    {
      listKey: 'COPROS',
      templateIndex: 2,
      subject: 'Coupure d’eau programmée samedi : travaux sur la colonne montante',
      sentAgo: 11,
      status: 'SENT',
      openRate: 0.58,
      bodyHtml: p(
        'Une coupure d’eau est programmée samedi de 8 h à 14 h pour remplacer une vanne de la colonne montante. Prévoyez une réserve d’eau pour la matinée.',
        'Nous vous remercions de votre compréhension.'
      )
    },
    {
      listKey: 'COPROS',
      templateIndex: 1,
      subject: 'Bilan de l’exercice : synthèse des comptes de la copropriété',
      sentAgo: null,
      status: 'DRAFT',
      openRate: 0,
      bodyHtml: p(
        'Voici la synthèse des comptes de l’exercice : charges courantes, travaux réalisés, provisions et fonds de réserve.',
        'Le détail est consultable dans votre espace en ligne.'
      )
    },
    {
      listKey: 'CONSEIL',
      templateIndex: 1,
      subject: 'Convocation à la prochaine assemblée générale',
      sentAgo: null,
      status: 'DRAFT',
      openRate: 0,
      bodyHtml: p(
        'Nous préparons la convocation de la prochaine assemblée. Merci de nous indiquer les points que vous souhaitez voir figurer à l’ordre du jour.'
      )
    },
    {
      listKey: 'RESIDENTS',
      templateIndex: 2,
      subject: 'Visite de l’immeuble avec le conseil syndical (annulée)',
      sentAgo: 45,
      status: 'CANCELLED',
      openRate: 0,
      bodyHtml: p(
        'La visite annuelle des parties communes prévue ce mois-ci est annulée et sera reprogrammée après les travaux de peinture.'
      )
    }
  ]
};

// ───────────────────────────────────────────────────────────────── PROMOTEUR

const PROMOTEUR: PackNewsletter = {
  templates: [
    {
      name: 'Lettre des acquéreurs',
      html: template(
        'Votre programme avance',
        '#993c1d',
        'Bonjour {{prenom}},',
        'Vous recevez ce message car vous êtes en relation avec notre société de promotion immobilière.',
        'Cordialement,<br/>L’équipe commerciale'
      )
    },
    {
      name: 'Nouveau programme',
      html: template(
        'Nouveau programme immobilier',
        '#1e40af',
        'Bonjour {{prenom}},',
        'Information commerciale. Les prix et disponibilités sont donnés à titre indicatif.',
        'Pour réserver ou visiter l’appartement témoin, répondez à ce message ou appelez notre bureau de vente.'
      )
    },
    {
      name: 'Information partenaires',
      html: template(
        'Message à nos partenaires',
        '#166534',
        'Bonjour {{prenom}},',
        'Message adressé aux partenaires bancaires, notaires et prescripteurs.',
        'Bien cordialement,<br/>La direction des programmes'
      )
    }
  ],
  lists: [
    {
      key: 'CRM',
      name: 'Contacts CRM : acquéreurs et prospects',
      type: 'FROM_CRM_CONTACTS',
      doubleOptIn: false,
      ago: 1030,
      source: { kind: 'DERIVED' }
    },
    {
      key: 'PROSPECTS',
      name: 'Prospects acquéreurs (site et salons)',
      type: 'MANUAL',
      doubleOptIn: true,
      ago: 1020,
      source: { kind: 'WEB', count: 68 }
    },
    {
      key: 'RESERVATAIRES',
      name: 'Réservataires et acquéreurs',
      type: 'MANUAL',
      doubleOptIn: false,
      ago: 900,
      source: { kind: 'CRM_ACTIVE', limit: 40, fallbackWeb: 26 }
    },
    {
      key: 'DIASPORA',
      name: 'Investisseurs de la diaspora',
      type: 'MANUAL',
      doubleOptIn: true,
      ago: 940,
      source: { kind: 'WEB', count: 36 }
    },
    {
      key: 'PARTENAIRES',
      name: 'Partenaires : banques, notaires et courtiers',
      type: 'MANUAL',
      doubleOptIn: false,
      ago: 860,
      source: {
        kind: 'COMPANIES',
        names: [
          'Banque de l’Habitat de Côte d’Ivoire',
          'Société Générale Côte d’Ivoire',
          'Bank of Africa CI',
          'NSIA Banque',
          'Étude de Maître Kouamé',
          'Étude de Maître Coulibaly',
          'Étude de Maître Bamba',
          'Courtage Immo Financement',
          'Allianz Côte d’Ivoire',
          'Saham Assurance',
          'Cabinet d’architectes Lagune Design',
          'Bureau d’études Géotech CI'
        ]
      }
    }
  ],
  campaigns: [
    {
      listKey: 'PROSPECTS',
      templateIndex: 1,
      subject: 'Lancement commercial : Résidence Les Cocotiers à Grand-Bassam',
      sentAgo: 1000,
      status: 'SENT',
      openRate: 0.52,
      bodyHtml: p(
        'À dix minutes de la plage de Grand-Bassam, la résidence Les Cocotiers propose des appartements de 2 à 4 pièces avec balcon, parking et gardiennage.',
        'Paiement échelonné sur la durée du chantier, avec une réservation dès l’ouverture des ventes.'
      )
    },
    {
      listKey: 'DIASPORA',
      templateIndex: 1,
      subject: 'Investir depuis l’étranger : visite virtuelle et paiement échelonné',
      sentAgo: 870,
      status: 'SENT',
      openRate: 0.64,
      bodyHtml: p(
        'Vous vivez hors de Côte d’Ivoire ? Visitez nos programmes en visioconférence, signez votre contrat de réservation à distance et suivez l’avancement du chantier photo par photo.',
        'Un conseiller dédié vous accompagne de la réservation à la remise des clés.'
      )
    },
    {
      listKey: 'PROSPECTS',
      templateIndex: 0,
      subject: 'Salon de l’immobilier d’Abidjan : retrouvez-nous sur le stand',
      sentAgo: 740,
      status: 'SENT',
      openRate: 0.47,
      bodyHtml: p(
        'Notre équipe vous attend au salon pour présenter les plans, les prix de lancement et les solutions de financement avec nos banques partenaires.',
        'Présentez ce message sur le stand pour bénéficier d’un rendez-vous prioritaire.'
      )
    },
    {
      listKey: 'RESERVATAIRES',
      templateIndex: 0,
      subject: 'Avancement du chantier : fondations et gros œuvre terminés',
      sentAgo: 615,
      status: 'SENT',
      openRate: 0.78,
      bodyHtml: p(
        'Bonne nouvelle : les fondations et la dalle du rez-de-chaussée sont achevées, conformément au planning. Les photos du chantier sont disponibles dans votre espace acquéreur.',
        'La prochaine étape est l’élévation des étages, prévue sur trois mois.'
      )
    },
    {
      listKey: 'PARTENAIRES',
      templateIndex: 2,
      subject: 'Partenaires bancaires : conditions de financement de nos acquéreurs',
      sentAgo: 505,
      status: 'SENT',
      openRate: 0.72,
      failRate: 0.08,
      bodyHtml: p(
        'Nous actualisons le dossier type remis aux acquéreurs : attestation de réservation, échéancier d’appels de fonds et plans de vente en l’état futur d’achèvement.',
        'Merci de nous indiquer vos conditions de taux et de durée pour le trimestre à venir.'
      )
    },
    {
      listKey: 'RESERVATAIRES',
      templateIndex: 0,
      subject: 'Avancement du chantier : dalle du R+3 et pose des menuiseries',
      sentAgo: 385,
      status: 'SENT',
      openRate: 0.76,
      bodyHtml: p(
        'La dalle du troisième étage est coulée et la pose des menuiseries extérieures commence. Le prochain appel de fonds correspond à l’achèvement du gros œuvre.',
        'Une visite de chantier sécurisée sera proposée aux acquéreurs le mois prochain.'
      )
    },
    {
      listKey: 'PROSPECTS',
      templateIndex: 1,
      subject: 'Nouveau programme : Les Jardins d’Angré, ouverture des réservations',
      sentAgo: 250,
      status: 'SENT',
      openRate: 0.55,
      bodyHtml: p(
        'Les Jardins d’Angré, à Cocody, proposent des appartements familiaux dans une résidence sécurisée avec espaces verts et aire de jeux.',
        'Les premiers lots sont ouverts à la réservation avec des conditions de lancement réservées à nos abonnés.'
      )
    },
    {
      listKey: 'RESERVATAIRES',
      templateIndex: 0,
      subject: 'Remise des clés : calendrier des livraisons et pré-livraison',
      sentAgo: 120,
      status: 'SENT',
      openRate: 0.85,
      bodyHtml: p(
        'La résidence Les Orchidées à Marcory est livrée. Chaque acquéreur sera convié à une visite de pré-livraison avant la remise officielle des clés.',
        'Pensez à vous munir de votre contrat, de votre pièce d’identité et de l’attestation d’assurance habitation.'
      )
    },
    {
      listKey: 'DIASPORA',
      templateIndex: 1,
      subject: 'Les Jardins d’Angré : plus de la moitié des lots réservés',
      sentAgo: 13,
      status: 'SENT',
      openRate: 0.5,
      bodyHtml: p(
        'Le programme avance vite : plus de la moitié des lots sont déjà réservés. Il reste quelques appartements en étage élevé avec vue dégagée.',
        'Contactez votre conseiller pour une visite virtuelle cette semaine.'
      )
    },
    {
      listKey: 'PROSPECTS',
      templateIndex: 1,
      subject: 'Domaine des Vallons à Bingerville : pré-lancement',
      sentAgo: null,
      status: 'DRAFT',
      openRate: 0,
      bodyHtml: p(
        'Notre prochain programme verra le jour à Bingerville : villas et appartements dans un cadre verdoyant, à 25 minutes du Plateau.',
        'Inscrivez-vous pour recevoir en premier la grille de prix.'
      )
    },
    {
      listKey: 'RESERVATAIRES',
      templateIndex: 0,
      subject: 'Visite de chantier ouverte aux acquéreurs',
      sentAgo: null,
      status: 'DRAFT',
      openRate: 0,
      bodyHtml: p('Nous organisons une visite de chantier encadrée. Merci de confirmer votre présence avant vendredi.')
    },
    {
      listKey: 'PROSPECTS',
      templateIndex: 0,
      subject: 'Offre de fin d’année sur les derniers lots (annulée)',
      sentAgo: 60,
      status: 'CANCELLED',
      openRate: 0,
      bodyHtml: p('Offre promotionnelle retirée : les derniers lots de la résidence ont été réservés avant l’envoi.')
    }
  ]
};

// ──────────────────────────────────────────────────────────────── PATRIMOINE

function patrimoine(pro: boolean): PackNewsletter {
  return {
    templates: [
      {
        name: 'La lettre du patrimoine',
        html: template(
          'La lettre du patrimoine',
          '#1e40af',
          'Bonjour {{prenom}},',
          'Vous recevez ce message car vous êtes en relation avec notre cabinet de gestion patrimoniale.',
          'Bien cordialement,<br/>Votre conseiller patrimonial'
        )
      },
      {
        name: 'Information locataires',
        html: template(
          'Information aux locataires',
          '#0369a1',
          'Bonjour {{prenom}},',
          'Message adressé aux locataires des biens que nous gérons.',
          'Merci de votre confiance.'
        )
      },
      {
        name: 'Revue de patrimoine',
        html: template(
          'Votre revue de patrimoine',
          '#92400e',
          'Chère propriétaire, cher propriétaire,',
          'Message adressé aux propriétaires et associés.',
          'Nous restons à votre écoute.'
        )
      }
    ],
    lists: [
      {
        key: 'LOCATAIRES',
        name: 'Locataires en place',
        type: 'FROM_RENTERS',
        doubleOptIn: false,
        ago: 1030,
        source: { kind: 'DERIVED' }
      },
      {
        key: 'CRM',
        name: 'Réseau et contacts CRM',
        type: 'FROM_CRM_CONTACTS',
        doubleOptIn: false,
        ago: 1020,
        source: { kind: 'DERIVED' }
      },
      {
        key: 'ASSOCIES',
        name: pro ? 'Propriétaires, associés et holding' : 'Propriétaires et associés',
        type: 'MANUAL',
        doubleOptIn: false,
        ago: 1000,
        source: { kind: 'CRM_ROLE', roles: ['PROPRIETAIRE'], limit: 30 }
      },
      {
        key: 'EXPERTS',
        name: 'Experts et partenaires (notaires, banques, assureurs)',
        type: 'MANUAL',
        doubleOptIn: false,
        ago: 980,
        source: { kind: 'CRM_TAGS', tags: ['Notaire', 'Banque', 'Assurance', 'Conseil'], limit: 30 }
      },
      {
        key: 'WEB',
        name: 'Abonnés de la lettre du patrimoine (site web)',
        type: 'MANUAL',
        doubleOptIn: true,
        ago: 1000,
        source: { kind: 'WEB', count: pro ? 52 : 38 }
      }
    ],
    campaigns: [
      {
        listKey: 'WEB',
        templateIndex: 0,
        subject: 'Bienvenue : investir et gérer son patrimoine immobilier sereinement',
        sentAgo: 950,
        status: 'SENT',
        openRate: 0.58,
        bodyHtml: p(
          'Chaque mois, nous partageons des conseils pour faire fructifier un patrimoine immobilier en Côte d’Ivoire : rendement locatif, fiscalité, assurances et entretien des biens.',
          'Notre outil de suivi regroupe vos biens, vos baux, vos prêts et vos documents en un seul tableau de bord.'
        )
      },
      {
        listKey: 'LOCATAIRES',
        templateIndex: 1,
        subject: 'Locataires : payer son loyer par Wave, Orange Money, MTN ou virement',
        sentAgo: 850,
        status: 'SENT',
        openRate: 0.63,
        bodyHtml: p(
          'Votre loyer peut désormais être réglé à distance par Wave, Orange Money, MTN ou virement. Chaque paiement génère automatiquement votre quittance.',
          'Le loyer est exigible le 5 de chaque mois ; en cas de difficulté, contactez-nous avant l’échéance.'
        )
      },
      {
        listKey: 'ASSOCIES',
        templateIndex: 2,
        subject: 'Revue de patrimoine annuelle : documents à préparer',
        sentAgo: 760,
        status: 'SENT',
        openRate: 0.86,
        bodyHtml: p(
          'Nous préparons la revue annuelle de votre patrimoine : valeur des biens, rendement net, échéances de prêts et d’assurances, travaux à prévoir.',
          'Merci de nous transmettre vos derniers relevés bancaires et justificatifs de taxes foncières.'
        )
      },
      {
        listKey: 'WEB',
        templateIndex: 0,
        subject: 'Fiscalité des revenus fonciers : ce qu’il faut anticiper',
        sentAgo: 665,
        status: 'SENT',
        openRate: 0.54,
        failRate: 0.05,
        bodyHtml: p(
          'Les loyers perçus sont soumis à l’impôt sur le revenu foncier selon votre statut : propriétaire en nom propre, SCI ou société. Une retenue à la source peut s’appliquer.',
          'Gardez vos factures de travaux et vos taxes foncières : elles viennent en déduction de vos revenus imposables.'
        )
      },
      {
        listKey: 'LOCATAIRES',
        templateIndex: 1,
        subject: 'Assurance habitation : pensez à renouveler votre attestation',
        sentAgo: 560,
        status: 'SENT',
        openRate: 0.6,
        bodyHtml: p(
          'L’assurance habitation est une obligation du bail. Merci de nous transmettre votre attestation à jour avant la fin du mois.',
          'Sans attestation, nous ne pouvons pas renouveler votre bail en toute sécurité.'
        )
      },
      {
        listKey: 'EXPERTS',
        templateIndex: 0,
        subject: 'Partenaires : calendrier des actes et des échéances de la saison',
        sentAgo: 460,
        status: 'SENT',
        openRate: 0.74,
        failRate: 0.07,
        bodyHtml: p(
          'Nous partageons avec vous le calendrier des actes, renouvellements de polices et rendez-vous bancaires prévus ce semestre pour les biens que nous gérons.',
          'Merci de nous confirmer vos disponibilités pour les signatures.'
        )
      },
      {
        listKey: 'ASSOCIES',
        templateIndex: 2,
        subject: pro
          ? 'Holding et SCI : dividendes, comptes annuels et assemblées'
          : 'Assurances : renouvellement des polices multirisques',
        sentAgo: 340,
        status: 'SENT',
        openRate: 0.8,
        bodyHtml: pro
          ? p(
              'La clôture des comptes de vos sociétés approche : approbation des comptes, répartition des dividendes entre associés et assemblées annuelles.',
              'Nous préparons les procès-verbaux et les déclarations fiscales correspondantes.'
            )
          : p(
              'Les polices multirisques de plusieurs biens arrivent à échéance. Nous avons mis en concurrence trois assureurs pour améliorer vos garanties à prix égal.',
              'Retrouvez le comparatif dans votre espace.'
            )
      },
      {
        listKey: 'WEB',
        templateIndex: 0,
        subject: 'Rendement locatif : comment lire votre tableau de bord',
        sentAgo: 220,
        status: 'SENT',
        openRate: 0.57,
        bodyHtml: p(
          'Le rendement brut compare les loyers annuels à la valeur du bien ; le rendement net déduit charges, taxes et vacance locative.',
          'Un bien rentable à 8 % brut peut descendre à 5 % net : mesurez toujours les deux avant d’arbitrer.'
        )
      },
      {
        listKey: 'ASSOCIES',
        templateIndex: 2,
        subject: 'Votre rapport patrimonial du trimestre est disponible',
        sentAgo: 9,
        status: 'SENT',
        openRate: 0.62,
        bodyHtml: p(
          'Votre rapport du trimestre est disponible dans votre espace : loyers encaissés, charges, travaux et évolution de la valeur.',
          'Nous restons disponibles pour le commenter avec vous.'
        )
      },
      {
        listKey: 'CRM',
        templateIndex: 0,
        subject: 'Clôture de l’exercice : documents à fournir au comptable',
        sentAgo: null,
        status: 'DRAFT',
        openRate: 0,
        bodyHtml: p(
          'Pour clôturer l’exercice, merci de rassembler vos factures de travaux, taxes foncières et relevés bancaires.'
        )
      },
      {
        listKey: 'WEB',
        templateIndex: 0,
        subject: 'Acheter un immeuble de rapport : les erreurs à éviter',
        sentAgo: null,
        status: 'DRAFT',
        openRate: 0,
        bodyHtml: p(
          'Titre foncier non vérifié, loyers surestimés, travaux oubliés : voici les erreurs à éviter avant d’acquérir un immeuble de rapport.'
        )
      },
      {
        listKey: 'LOCATAIRES',
        templateIndex: 1,
        subject: 'Enquête de satisfaction (annulée)',
        sentAgo: 35,
        status: 'CANCELLED',
        openRate: 0,
        bodyHtml: p('L’enquête de satisfaction prévue ce mois-ci est reportée au prochain semestre.')
      }
    ]
  };
}

export function newsletterContent(pack: string): PackNewsletter | null {
  switch (pack) {
    case 'SYNDIC':
      return SYNDIC;
    case 'PROMOTEUR':
      return PROMOTEUR;
    case 'PATRIMOINE_ESSENTIEL':
      return patrimoine(false);
    case 'PATRIMOINE_PRO':
      return patrimoine(true);
    default:
      return null;
  }
}
