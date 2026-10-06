/**
 * Données et types partagés des compléments « commercial » de l'agence (3 ans).
 *
 * Module sans accès base : textes, gabarits et petites fonctions pures.
 */
import type { PrismaClient } from '@prisma/client';
import type { HistoryContext } from './types';

/** Contexte commun des blocs : tout ce qu'ils lisent, rien d'autre. */
export interface CommercialEnv {
  ctx: HistoryContext;
  prisma: PrismaClient;
  tenantId: string;
  adminUserId: string;
  /** Collaborateurs actifs (l'administrateur en tête). */
  staff: string[];
  rng: () => number;
  log: (message: string) => void;
  /** Fragment du tenant, garde les e-mails uniques d'une agence de test à l'autre. */
  tag: string;
}

export const FEMALE_FIRST_NAMES = new Set([
  'Aya',
  'Akissi',
  'Affoué',
  'Amenan',
  'Adjoua',
  'Aminata',
  'Fatoumata',
  'Mariam',
  'Salimata',
  'Awa',
  'Nadège',
  'Estelle',
  'Prisca',
  'Carine',
  'Sandrine'
]);

export interface ProfessionSpec {
  profession: string;
  sector: string;
  employers: readonly string[];
  incomeMin: number;
  incomeMax: number;
  stability: 'CDI' | 'CDD' | 'FREELANCE' | 'INFORMAL' | 'RETIRED';
}

export const PROFESSIONS: readonly ProfessionSpec[] = [
  {
    profession: 'Cadre bancaire',
    sector: 'Banque et finance',
    employers: ['SGBCI', 'Ecobank CI', 'Bank of Africa CI', 'NSIA Banque'],
    incomeMin: 900_000,
    incomeMax: 1_800_000,
    stability: 'CDI'
  },
  {
    profession: 'Ingénieur télécoms',
    sector: 'Télécommunications',
    employers: ['Orange CI', 'MTN CI', 'Moov Africa'],
    incomeMin: 800_000,
    incomeMax: 1_600_000,
    stability: 'CDI'
  },
  {
    profession: 'Médecin',
    sector: 'Santé',
    employers: ['Polyclinique Internationale Sainte Anne-Marie', 'CHU de Cocody', 'Clinique Farah'],
    incomeMin: 1_000_000,
    incomeMax: 2_500_000,
    stability: 'CDI'
  },
  {
    profession: 'Enseignant',
    sector: 'Éducation',
    employers: ['Lycée Technique d’Abidjan', 'Collège Jean-Mermoz', 'Université Félix Houphouët-Boigny'],
    incomeMin: 250_000,
    incomeMax: 600_000,
    stability: 'CDI'
  },
  {
    profession: 'Commerçant',
    sector: 'Commerce et distribution',
    employers: ['Compte propre'],
    incomeMin: 400_000,
    incomeMax: 2_000_000,
    stability: 'FREELANCE'
  },
  {
    profession: 'Comptable',
    sector: 'Audit et conseil',
    employers: ['Cabinet Ernst & Young CI', 'Cabinet Mazars', 'PwC Côte d’Ivoire'],
    incomeMin: 450_000,
    incomeMax: 1_100_000,
    stability: 'CDI'
  },
  {
    profession: 'Fonctionnaire',
    sector: 'Administration publique',
    employers: ['Ministère des Finances', 'Ministère de la Construction', 'Mairie de Cocody'],
    incomeMin: 300_000,
    incomeMax: 900_000,
    stability: 'CDI'
  },
  {
    profession: 'Avocat',
    sector: 'Juridique',
    employers: ['Cabinet indépendant', 'Cabinet Ouattara & Associés'],
    incomeMin: 1_200_000,
    incomeMax: 3_000_000,
    stability: 'FREELANCE'
  },
  {
    profession: 'Chef d’entreprise',
    sector: 'Services aux entreprises',
    employers: ['Société personnelle'],
    incomeMin: 1_500_000,
    incomeMax: 4_000_000,
    stability: 'FREELANCE'
  },
  {
    profession: 'Cadre logistique',
    sector: 'Transport et logistique',
    employers: ['Bolloré Africa Logistics', 'Port Autonome d’Abidjan', 'Sitarail'],
    incomeMin: 600_000,
    incomeMax: 1_300_000,
    stability: 'CDI'
  },
  {
    profession: 'Retraité',
    sector: 'Retraite',
    employers: ['CNPS'],
    incomeMin: 200_000,
    incomeMax: 500_000,
    stability: 'RETIRED'
  },
  {
    profession: 'Entrepreneur du bâtiment',
    sector: 'BTP',
    employers: ['Compte propre'],
    incomeMin: 700_000,
    incomeMax: 2_500_000,
    stability: 'FREELANCE'
  },
  {
    profession: 'Pharmacien',
    sector: 'Santé',
    employers: ['Pharmacie de la Riviera', 'Pharmacie Saint-Jean'],
    incomeMin: 900_000,
    incomeMax: 2_000_000,
    stability: 'FREELANCE'
  },
  {
    profession: 'Informaticien',
    sector: 'Numérique',
    employers: ['Abidjan Digital', 'Société Générale Africa Technologies', 'Indépendant'],
    incomeMin: 500_000,
    incomeMax: 1_400_000,
    stability: 'CDD'
  }
];

export const TAG_DEFS: readonly { name: string; color: string }[] = [
  { name: 'Investisseur', color: '#1d4ed8' },
  { name: 'Primo-accédant', color: '#0f766e' },
  { name: 'Diaspora', color: '#7c3aed' },
  { name: 'Expatrié', color: '#c2410c' },
  { name: 'VIP', color: '#b45309' },
  { name: 'Cadre d’entreprise', color: '#0369a1' },
  { name: 'Bailleur multi-biens', color: '#15803d' },
  { name: 'À relancer', color: '#dc2626' },
  { name: 'Financement validé', color: '#059669' },
  { name: 'Recommandé par un client', color: '#9333ea' },
  { name: 'Fonctionnaire', color: '#475569' },
  { name: 'Commerçant', color: '#a16207' }
];

/** Notes internes sur une fiche contact (CRM). */
export const CONTACT_NOTES: readonly string[] = [
  'Appel de présentation : client sérieux, projet bien cadré, rappeler en fin de semaine avec une sélection.',
  'Préfère être contacté par WhatsApp en soirée, après 18 h.',
  'A demandé une estimation de son bien actuel avant de se positionner sur un achat.',
  'Dossier de financement en cours auprès de sa banque, accord de principe attendu sous trois semaines.',
  'Souhaite un quartier calme, proche des écoles. Budget ferme, peu de marge de négociation.',
  'Très réactif, a déjà visité deux biens avec une autre agence. À convaincre sur notre sélection.',
  'Recommandé par un propriétaire de notre portefeuille, à traiter en priorité.',
  'Voyage fréquemment : privilégier les rendez-vous groupés et les visites le samedi matin.',
  'Revenu stable, justificatifs complets transmis. Dossier prêt pour une présentation propriétaire.',
  'Hésite entre location et achat. Lui envoyer une simulation comparative des deux options.',
  'Le conjoint participe aux décisions : prévoir les visites à deux.',
  'Demande de visite reportée à deux reprises, relancer sans insister.',
  'Cherche un bien à usage mixte (bureau et logement). Étudier les immeubles et les rez-de-chaussée commerciaux.',
  'A confirmé par écrit son accord sur les honoraires de l’agence.',
  'Propriétaire exigeant sur le suivi : lui adresser le relevé mensuel dès le 5 du mois.',
  'Souhaite être informé en avant-première des biens neufs en vente sur Cocody et Bingerville.'
];

export const DEAL_NOTES: readonly string[] = [
  'Le client a visité deux fois le bien, il revient avec son épouse samedi.',
  'Contre-proposition transmise au propriétaire, réponse attendue sous 48 h.',
  'Financement : accord de la banque obtenu, reste l’assurance emprunteur.',
  'Point sur le dossier avec le négociateur : le client veut négocier les frais de notaire.',
  'Le propriétaire accepte de baisser son prix de 4 % si la signature intervient avant fin de mois.',
  'Visite de contre-expertise demandée par le client (état de la toiture).',
  'Pièces d’identité et attestation de revenus reçues, dossier complet.',
  'Le client souhaite une clause suspensive d’obtention de prêt à 45 jours.'
];

export const PROPERTY_NOTES: readonly string[] = [
  'Photos refaites par le photographe de l’agence, annonce republiée.',
  'Rappel : diagnostic électrique à renouveler avant la prochaine mise en vente.',
  'Le gardien détient un double des clés, prévenir 24 h avant chaque visite.',
  'Le propriétaire accepte de négocier jusqu’à 5 % du prix affiché.'
];

export interface SavedSearchDef {
  name: string;
  description: string;
  scope: 'PERSONAL' | 'TEAM' | 'TENANT';
  filters: Record<string, unknown>;
  uses: number;
}

export const SAVED_SEARCHES: readonly SavedSearchDef[] = [
  {
    name: 'Prospects chauds à relancer',
    description: 'Prospects à fort potentiel, sans échange depuis plus de deux semaines.',
    scope: 'TEAM',
    filters: { statuses: ['LEAD'], maturityLevels: ['HOT'], scoreMin: 60 },
    uses: 34
  },
  {
    name: 'Propriétaires bailleurs actifs',
    description: 'Tous les propriétaires dont l’agence gère au moins un bien.',
    scope: 'TENANT',
    filters: { roles: ['PROPRIETAIRE'], hasActiveRole: true, statuses: ['ACTIVE_CLIENT'] },
    uses: 52
  },
  {
    name: 'Acquéreurs avec financement',
    description: 'Contacts en recherche d’achat dont la capacité d’emprunt est confirmée.',
    scope: 'TEAM',
    filters: { dealTypes: ['ACHAT'], borrowingCapacities: ['YES'], budgetMin: 30_000_000 },
    uses: 21
  },
  {
    name: 'Locataires Cocody et Marcory',
    description: 'Locataires en place, utile pour les messages ciblés par quartier.',
    scope: 'TENANT',
    filters: { roles: ['LOCATAIRE'], locationZones: ['Cocody Riviera', 'Cocody Angré', 'Marcory Zone 4'] },
    uses: 13
  },
  {
    name: 'Contacts consentants newsletter',
    description: 'Contacts ayant accepté de recevoir la lettre d’information.',
    scope: 'TENANT',
    filters: { consentEmail: true, consentMarketing: true },
    uses: 18
  },
  {
    name: 'Nouveaux contacts du mois',
    description: 'Contacts créés au cours des trente derniers jours.',
    scope: 'PERSONAL',
    filters: { createdAfter: '__DAYS_30__' },
    uses: 41
  },
  {
    name: 'Budget supérieur à 80 M F CFA',
    description: 'Acquéreurs haut de gamme, à orienter vers les immeubles et les villas.',
    scope: 'PERSONAL',
    filters: { dealTypes: ['ACHAT'], budgetMin: 80_000_000 },
    uses: 9
  },
  {
    name: 'Contacts sans activité depuis 90 jours',
    description: 'À requalifier ou archiver lors de la revue trimestrielle.',
    scope: 'TEAM',
    filters: { lastInteractionBefore: '__DAYS_90__', statuses: ['LEAD'] },
    uses: 7
  }
];

export const FOLLOW_UPS: readonly { type: string; subject: string; content: string }[] = [
  {
    type: 'Relance téléphonique',
    subject: 'Relance après visite',
    content: 'Rappeler le client pour recueillir son retour sur la visite et proposer une seconde visite.'
  },
  {
    type: 'Envoi de sélection',
    subject: 'Sélection de biens à envoyer',
    content: 'Préparer et envoyer par WhatsApp une sélection de trois biens correspondant au budget.'
  },
  {
    type: 'Rendez-vous agence',
    subject: 'Rendez-vous de signature de mandat',
    content: 'Rendez-vous à l’agence pour la signature du mandat et la remise des pièces du bien.'
  },
  {
    type: 'Relance dossier',
    subject: 'Pièces manquantes au dossier',
    content: 'Relancer le client pour l’attestation de revenus et la copie de la pièce d’identité.'
  },
  {
    type: 'Rappel échéance',
    subject: 'Échéance de l’offre d’achat',
    content: 'L’offre arrive à échéance : obtenir la réponse du vendeur avant la date limite.'
  },
  {
    type: 'Rendez-vous notaire',
    subject: 'Préparation de l’acte chez le notaire',
    content: 'Confirmer la date de signature avec l’étude notariale et prévenir les deux parties.'
  }
];

// ───────────────────────────────────────────────────────── ventes

export const NOTARIES = [
  'Étude de Maître Kouamé Aya, Plateau',
  'Étude de Maître Coulibaly Fanta, Cocody Danga',
  'Étude de Maître Ouattara Lassina, Marcory',
  'Étude de Maître Bamba Tiémoko, Plateau',
  'Étude de Maître N’Dri Marie-Laure, Riviera'
] as const;

export const CONDITION_LABELS = [
  'Obtention du prêt bancaire par l’acquéreur',
  'Purge du droit de préemption et vérification du titre foncier',
  'Production de l’attestation de propriété et du certificat de non-gage',
  'Levée de l’hypothèque grevant le bien',
  'Obtention du permis de construire modificatif',
  'Remise du quitus des taxes foncières'
] as const;

export const OFFER_CONDITIONS = [
  'Offre ferme sous réserve d’obtention du financement bancaire.',
  'Offre au comptant, signature de l’acte sous 45 jours.',
  'Offre conditionnée à la remise d’un titre foncier à jour et au certificat de non-gage.',
  'Financement mixte : apport personnel de 40 % et prêt sur 15 ans.',
  'Offre valable 15 jours, visite technique du bien demandée avant signature.'
] as const;

export const REJECT_REASONS = [
  'Offre trop éloignée du prix plancher fixé avec le vendeur.',
  'Le vendeur a préféré une offre au comptant.',
  'Délai de financement jugé trop long par le vendeur.'
] as const;

export const WITHDRAW_REASONS = [
  'L’acquéreur a obtenu un autre bien dans un quartier plus proche de son travail.',
  'Le financement bancaire n’a pas été accordé à l’acquéreur.',
  'L’acquéreur reporte son projet d’achat à l’an prochain.'
] as const;

export const MANDATE_NOTES = [
  'Mandat signé après visite d’estimation. Photos professionnelles et annonce publiée sur le site et les réseaux.',
  'Le vendeur souhaite une transaction rapide : mandat exclusif accordé contre une campagne de diffusion renforcée.',
  'Vente d’un bien familial, le vendeur est représenté par son fils muni d’une procuration.',
  'Titre foncier à jour, aucun litige connu. Honoraires convenus à la charge du vendeur.',
  'Bien occupé jusqu’à la fin du bail : visites uniquement sur rendez-vous avec le locataire.'
] as const;

export interface PropertyDocSpec {
  type:
    | 'TITLE_DEED'
    | 'TECHNICAL_DIAGNOSIS'
    | 'PLAN'
    | 'TAX_DOCUMENT'
    | 'INSURANCE'
    | 'MANDATE'
    | 'NOTARIAL_DEED'
    | 'LAND_CONCESSION'
    | 'BUILDING_PERMIT'
    | 'OTHER';
  label: string;
  fileBase: string;
}

export const DOC_LABELS: Record<PropertyDocSpec['type'], { title: string; fileBase: string }> = {
  TITLE_DEED: { title: 'Titre foncier', fileBase: 'titre-foncier' },
  TECHNICAL_DIAGNOSIS: { title: 'Diagnostic technique du bien', fileBase: 'diagnostic-technique' },
  PLAN: { title: 'Plan du bien', fileBase: 'plan' },
  TAX_DOCUMENT: { title: 'Avis de taxe foncière', fileBase: 'taxe-fonciere' },
  INSURANCE: { title: 'Attestation d’assurance habitation', fileBase: 'assurance' },
  MANDATE: { title: 'Mandat confié à l’agence', fileBase: 'mandat' },
  NOTARIAL_DEED: { title: 'Acte notarié de vente', fileBase: 'acte-notarie' },
  LAND_CONCESSION: { title: 'Arrêté de concession définitive', fileBase: 'acd' },
  BUILDING_PERMIT: { title: 'Permis de construire', fileBase: 'permis-construire' },
  OTHER: { title: 'Procès-verbal de bornage', fileBase: 'bornage' }
};

// ───────────────────────────────────────────────── communication

export const NEWSLETTER_TEMPLATES: readonly { name: string; html: string }[] = [
  {
    name: 'Lettre d’information mensuelle',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
<h1 style="color:#0f4c81;font-size:22px">La lettre de l’agence</h1>
<p>Bonjour {{prenom}},</p>
<div>{{contenu}}</div>
<p style="margin-top:24px">À très bientôt,<br/>L’équipe de l’agence</p>
<p style="font-size:12px;color:#6b7280">Vous recevez ce message parce que vous êtes en relation avec notre agence. <a href="{{lien_desinscription}}">Se désinscrire</a></p>
</div>`
  },
  {
    name: 'Annonce d’un nouveau bien',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
<h1 style="color:#b45309;font-size:22px">Nouveau bien disponible</h1>
<p>Bonjour {{prenom}},</p>
<div>{{contenu}}</div>
<p style="margin-top:24px">Pour organiser une visite, répondez simplement à ce message ou appelez l’agence.</p>
<p style="font-size:12px;color:#6b7280"><a href="{{lien_desinscription}}">Se désinscrire</a></p>
</div>`
  },
  {
    name: 'Vœux et informations propriétaires',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
<h1 style="color:#166534;font-size:22px">Message à nos propriétaires</h1>
<p>Chère propriétaire, cher propriétaire,</p>
<div>{{contenu}}</div>
<p style="font-size:12px;color:#6b7280"><a href="{{lien_desinscription}}">Se désinscrire</a></p>
</div>`
  }
];

export interface CampaignDef {
  subject: string;
  bodyHtml: string;
  listKey: 'PROSPECTS' | 'PROPRIOS' | 'LOCATAIRES' | 'VIP';
  templateIndex: number;
  /** Jours avant maintenant (positif = passé, négatif = programmée dans le futur) ; null = brouillon. */
  sentAgo: number | null;
  status: 'SENT' | 'DRAFT' | 'SCHEDULED' | 'CANCELLED';
  openRate: number;
}

export const CAMPAIGNS: readonly CampaignDef[] = [
  {
    subject: 'Les nouveautés de l’agence — bilan et perspectives',
    listKey: 'PROSPECTS',
    templateIndex: 0,
    sentAgo: 1020,
    status: 'SENT',
    openRate: 0.46,
    bodyHtml:
      '<p>Nous ouvrons cette première lettre en vous présentant les services de l’agence : location, gestion locative, vente et conseil en investissement à Abidjan.</p><p>Chaque mois, nous vous informerons des biens à saisir et des évolutions du marché immobilier ivoirien.</p>'
  },
  {
    subject: 'Marché immobilier : ce qui a changé à Cocody et Marcory',
    listKey: 'PROSPECTS',
    templateIndex: 0,
    sentAgo: 880,
    status: 'SENT',
    openRate: 0.41,
    bodyHtml:
      '<p>Les loyers moyens ont progressé de 6 % à Cocody Riviera sur l’année, tandis que Marcory Zone 4 reste le secteur le plus recherché par les cadres en mobilité.</p><p>Notre équipe reste disponible pour une estimation gratuite de votre bien.</p>'
  },
  {
    subject: 'Propriétaires : ce qui change pour vos déclarations de loyers',
    listKey: 'PROPRIOS',
    templateIndex: 2,
    sentAgo: 760,
    status: 'SENT',
    openRate: 0.68,
    bodyHtml:
      '<p>Les relevés mensuels de gestion sont désormais disponibles dans votre espace propriétaire, accompagnés des justificatifs des travaux.</p><p>Pensez à vérifier vos coordonnées bancaires pour les virements de reversement.</p>'
  },
  {
    subject: 'Résidence Les Orchidées : un trois pièces à saisir à Cocody',
    listKey: 'PROSPECTS',
    templateIndex: 1,
    sentAgo: 640,
    status: 'SENT',
    openRate: 0.52,
    bodyHtml:
      '<p>Appartement de 3 pièces de 85 m², climatisé, cuisine équipée et parking sécurisé, à deux pas du carrefour de la Riviera 2.</p><p>Loyer : 450 000 F CFA par mois, charges comprises.</p>'
  },
  {
    subject: 'Nos conseils pour réussir votre premier achat immobilier',
    listKey: 'PROSPECTS',
    templateIndex: 0,
    sentAgo: 520,
    status: 'SENT',
    openRate: 0.39,
    bodyHtml:
      '<p>Financement, frais de notaire, titre foncier : les cinq vérifications à faire avant de signer une promesse de vente en Côte d’Ivoire.</p><p>Téléchargez notre guide pratique à l’agence ou demandez-le par retour de message.</p>'
  },
  {
    subject: 'Locataires : rappel des échéances et des moyens de paiement',
    listKey: 'LOCATAIRES',
    templateIndex: 0,
    sentAgo: 400,
    status: 'SENT',
    openRate: 0.73,
    bodyHtml:
      '<p>Vous pouvez régler votre loyer par Orange Money, MTN Mobile Money, Wave ou virement bancaire. Pensez à déclarer votre paiement depuis votre espace locataire.</p><p>En cas de difficulté, contactez-nous avant l’échéance pour trouver une solution.</p>'
  },
  {
    subject: 'Vente flash : terrain nu à Bingerville, titre foncier disponible',
    listKey: 'VIP',
    templateIndex: 1,
    sentAgo: 275,
    status: 'SENT',
    openRate: 0.58,
    bodyHtml:
      '<p>Terrain nu de 600 m² en zone résidentielle, titre foncier individuel, viabilisation en cours.</p><p>Visites sur rendez-vous cette semaine.</p>'
  },
  {
    subject: 'Bonne année à tous nos clients et partenaires',
    listKey: 'PROPRIOS',
    templateIndex: 2,
    sentAgo: 180,
    status: 'SENT',
    openRate: 0.71,
    bodyHtml:
      '<p>L’ensemble de l’équipe vous présente ses meilleurs vœux pour la nouvelle année. Merci pour la confiance que vous nous accordez.</p><p>Cette année, nous renforçons le suivi de vos biens avec un reporting mensuel enrichi.</p>'
  },
  {
    subject: 'Rentrée : nouveaux biens à louer à Marcory et Bingerville',
    listKey: 'PROSPECTS',
    templateIndex: 1,
    sentAgo: 95,
    status: 'SENT',
    openRate: 0.44,
    bodyHtml:
      '<p>Une sélection de studios meublés et d’appartements de trois pièces, disponibles dès maintenant.</p><p>Contactez l’agence pour planifier vos visites.</p>'
  },
  {
    subject: 'Investir dans l’immobilier locatif : les chiffres 2026',
    listKey: 'VIP',
    templateIndex: 0,
    sentAgo: 38,
    status: 'SENT',
    openRate: 0.55,
    bodyHtml:
      '<p>Rendements bruts moyens observés sur notre portefeuille : 7,2 % pour les appartements, 9,1 % pour les boutiques et bureaux.</p><p>Nos conseillers vous accompagnent dans le montage de votre projet.</p>'
  },
  {
    subject: 'Fêtes de fin d’année : horaires de l’agence et biens à saisir',
    listKey: 'VIP',
    templateIndex: 1,
    sentAgo: null,
    // Brouillon et non « programmée » : le job d'envoi du staging enverrait réellement une campagne programmée.
    status: 'DRAFT',
    openRate: 0,
    bodyHtml:
      '<p>L’agence reste ouverte jusqu’au 23 décembre et reprend le 3 janvier. Profitez de nos visites groupées de biens à la vente à Cocody, avec un conseiller financement sur place.</p>'
  },
  {
    subject: 'Compte rendu de la gestion du premier semestre',
    listKey: 'PROPRIOS',
    templateIndex: 2,
    sentAgo: null,
    status: 'DRAFT',
    openRate: 0,
    bodyHtml:
      '<p>Brouillon : synthèse des loyers encaissés, des travaux réalisés et des perspectives de revalorisation pour le second semestre.</p>'
  },
  {
    subject: 'Offre spéciale honoraires de mise en location',
    listKey: 'PROPRIOS',
    templateIndex: 0,
    sentAgo: null,
    status: 'CANCELLED',
    openRate: 0,
    bodyHtml: '<p>Campagne annulée : l’offre commerciale a été revue par la direction avant diffusion.</p>'
  }
];

// ─────────────────────────────────────────── fonctions utilitaires pures

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

export function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Arrondit un montant au multiple de `step` le plus proche. */
export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
