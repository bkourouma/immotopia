/**
 * Données du complément « équipe, paie, journal d'activité, facturation plateforme ».
 *
 * Module PUR : aucun accès base, aucun effet de bord à l'import. Les effectifs
 * par pack, les salariés de chantier et les textes d'audit sont des gabarits
 * déterministes ; le hasard vient toujours de `ctx.rng`.
 */

/** Rôles d'agence réellement présents dans la table `roles` (scope TENANT). */
export type TeamRoleKey =
  | 'TENANT_ADMIN'
  | 'TENANT_MANAGER'
  | 'TENANT_AGENT'
  | 'TENANT_ACCOUNTANT'
  | 'TENANT_SITE_MANAGER'
  | 'TENANT_STOREKEEPER';

export type RosterKind = 'active' | 'suspended' | 'removed';

export interface RosterMember {
  fullName: string;
  roleKey: TeamRoleKey;
  /** Fonction dans l'agence (affichée dans les traces d'audit ; `User` n'a pas de champ « poste »). */
  title: string;
  kind: RosterKind;
  /** Mois après le début de l'histoire où la personne rejoint l'agence. */
  joinMonth: number;
  /** Photo de profil (initiales sur fond de couleur) ; sinon l'interface affiche l'icône par défaut. */
  avatar: boolean;
  /** Jours depuis la dernière connexion (actifs) ; pour un suspendu : avant sa suspension. */
  lastLoginDaysAgo: number;
}

/** Les membres hors administrateur, par pack. Noms uniques sur tout le jeu (e-mail `prenom.nom@…test`). */
export const TEAM_ROSTERS: Record<string, readonly RosterMember[]> = {
  AGENCE: [
    {
      fullName: 'Aminata Koné',
      roleKey: 'TENANT_MANAGER',
      title: 'Directrice commerciale',
      kind: 'active',
      joinMonth: 1,
      avatar: true,
      lastLoginDaysAgo: 0
    },
    {
      fullName: 'Serge Yao',
      roleKey: 'TENANT_MANAGER',
      title: 'Gestionnaire locatif',
      kind: 'active',
      joinMonth: 3,
      avatar: true,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Fatoumata Diabaté',
      roleKey: 'TENANT_AGENT',
      title: 'Agent commercial',
      kind: 'active',
      joinMonth: 5,
      avatar: true,
      lastLoginDaysAgo: 2
    },
    {
      fullName: 'Landry Gnahoré',
      roleKey: 'TENANT_AGENT',
      title: 'Agent commercial',
      kind: 'active',
      joinMonth: 9,
      avatar: false,
      lastLoginDaysAgo: 4
    },
    {
      fullName: 'Mariam Sylla',
      roleKey: 'TENANT_AGENT',
      title: 'Agent commercial',
      kind: 'active',
      joinMonth: 16,
      avatar: true,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Rodrigue Aké',
      roleKey: 'TENANT_ACCOUNTANT',
      title: 'Comptable',
      kind: 'active',
      joinMonth: 6,
      avatar: false,
      lastLoginDaysAgo: 3
    },
    {
      fullName: 'Nadège Tapé',
      roleKey: 'TENANT_AGENT',
      title: 'Assistante de direction',
      kind: 'active',
      joinMonth: 30,
      avatar: true,
      lastLoginDaysAgo: 0
    },
    {
      fullName: 'Yacouba Dago',
      roleKey: 'TENANT_AGENT',
      title: 'Agent commercial',
      kind: 'suspended',
      joinMonth: 12,
      avatar: false,
      lastLoginDaysAgo: 41
    },
    {
      fullName: 'Éric Loukou',
      roleKey: 'TENANT_AGENT',
      title: 'Agent commercial (ancien)',
      kind: 'removed',
      joinMonth: 2,
      avatar: false,
      lastLoginDaysAgo: 470
    }
  ],
  SYNDIC: [
    {
      fullName: 'Hortense Kouadio',
      roleKey: 'TENANT_MANAGER',
      title: 'Responsable syndic',
      kind: 'active',
      joinMonth: 1,
      avatar: true,
      lastLoginDaysAgo: 0
    },
    {
      fullName: 'Abdoulaye Fofana',
      roleKey: 'TENANT_MANAGER',
      title: 'Gestionnaire de copropriétés',
      kind: 'active',
      joinMonth: 4,
      avatar: true,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Christelle Brou',
      roleKey: 'TENANT_MANAGER',
      title: 'Gestionnaire de copropriétés',
      kind: 'active',
      joinMonth: 11,
      avatar: false,
      lastLoginDaysAgo: 2
    },
    {
      fullName: 'Ismaël Cissé',
      roleKey: 'TENANT_ACCOUNTANT',
      title: 'Comptable des copropriétés',
      kind: 'active',
      joinMonth: 5,
      avatar: true,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Prisca Séri',
      roleKey: 'TENANT_AGENT',
      title: 'Chargée de relation copropriétaires',
      kind: 'active',
      joinMonth: 14,
      avatar: true,
      lastLoginDaysAgo: 3
    },
    {
      fullName: 'Moussa Ouattara',
      roleKey: 'TENANT_AGENT',
      title: 'Assistant de gestion',
      kind: 'active',
      joinMonth: 24,
      avatar: false,
      lastLoginDaysAgo: 22
    },
    {
      fullName: 'Rosine Gogoua',
      roleKey: 'TENANT_AGENT',
      title: 'Chargée de relation copropriétaires',
      kind: 'suspended',
      joinMonth: 17,
      avatar: false,
      lastLoginDaysAgo: 38
    },
    {
      fullName: 'Honoré Zoro',
      roleKey: 'TENANT_MANAGER',
      title: 'Gestionnaire de copropriétés (ancien)',
      kind: 'removed',
      joinMonth: 2,
      avatar: false,
      lastLoginDaysAgo: 520
    }
  ],
  PROMOTEUR: [
    {
      fullName: 'Kouamé Ehouman',
      roleKey: 'TENANT_MANAGER',
      title: 'Directeur technique',
      kind: 'active',
      joinMonth: 1,
      avatar: true,
      lastLoginDaysAgo: 0
    },
    {
      fullName: "Alassane N'Guessan",
      roleKey: 'TENANT_SITE_MANAGER',
      title: 'Conducteur de travaux',
      kind: 'active',
      joinMonth: 2,
      avatar: true,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Lassina Traoré',
      roleKey: 'TENANT_SITE_MANAGER',
      title: 'Chef de chantier',
      kind: 'active',
      joinMonth: 4,
      avatar: false,
      lastLoginDaysAgo: 0
    },
    {
      fullName: 'Drissa Bamba',
      roleKey: 'TENANT_SITE_MANAGER',
      title: 'Chef de chantier',
      kind: 'active',
      joinMonth: 13,
      avatar: false,
      lastLoginDaysAgo: 2
    },
    {
      fullName: 'Fabrice Konan',
      roleKey: 'TENANT_STOREKEEPER',
      title: 'Magasinier',
      kind: 'active',
      joinMonth: 5,
      avatar: true,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Olivier Silué',
      roleKey: 'TENANT_STOREKEEPER',
      title: 'Magasinier',
      kind: 'active',
      joinMonth: 14,
      avatar: false,
      lastLoginDaysAgo: 5
    },
    {
      fullName: 'Béatrice Kacou',
      roleKey: 'TENANT_ACCOUNTANT',
      title: 'Comptable',
      kind: 'active',
      joinMonth: 3,
      avatar: true,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Estelle Digbeu',
      roleKey: 'TENANT_AGENT',
      title: 'Responsable commerciale (ventes de lots)',
      kind: 'active',
      joinMonth: 8,
      avatar: true,
      lastLoginDaysAgo: 2
    },
    {
      fullName: 'Hervé Amani',
      roleKey: 'TENANT_STOREKEEPER',
      title: 'Magasinier de nuit',
      kind: 'suspended',
      joinMonth: 19,
      avatar: false,
      lastLoginDaysAgo: 45
    },
    {
      fullName: 'Patrick Boni',
      roleKey: 'TENANT_SITE_MANAGER',
      title: 'Chef de chantier (ancien)',
      kind: 'removed',
      joinMonth: 3,
      avatar: false,
      lastLoginDaysAgo: 400
    }
  ],
  INTEGRE: [
    {
      fullName: 'Marie-Laure Coulibaly',
      roleKey: 'TENANT_MANAGER',
      title: 'Directrice générale adjointe',
      kind: 'active',
      joinMonth: 1,
      avatar: true,
      lastLoginDaysAgo: 0
    },
    {
      fullName: 'Jean-Marc Soro',
      roleKey: 'TENANT_MANAGER',
      title: 'Responsable syndic et gestion locative',
      kind: 'active',
      joinMonth: 3,
      avatar: true,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Yasmine Touré',
      roleKey: 'TENANT_AGENT',
      title: 'Agent commercial',
      kind: 'active',
      joinMonth: 6,
      avatar: true,
      lastLoginDaysAgo: 2
    },
    {
      fullName: 'Aboubacar Diomandé',
      roleKey: 'TENANT_AGENT',
      title: 'Agent commercial',
      kind: 'active',
      joinMonth: 10,
      avatar: false,
      lastLoginDaysAgo: 3
    },
    {
      fullName: 'Géraldine Kouassi',
      roleKey: 'TENANT_ACCOUNTANT',
      title: 'Comptable',
      kind: 'active',
      joinMonth: 4,
      avatar: true,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Kader Zoro',
      roleKey: 'TENANT_SITE_MANAGER',
      title: 'Conducteur de travaux',
      kind: 'active',
      joinMonth: 7,
      avatar: true,
      lastLoginDaysAgo: 0
    },
    {
      fullName: 'Brice Séka',
      roleKey: 'TENANT_SITE_MANAGER',
      title: 'Chef de chantier',
      kind: 'active',
      joinMonth: 12,
      avatar: false,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Tiémoko Fadiga',
      roleKey: 'TENANT_STOREKEEPER',
      title: 'Magasinier',
      kind: 'active',
      joinMonth: 9,
      avatar: false,
      lastLoginDaysAgo: 4
    },
    {
      fullName: 'Ange-Michèle Tano',
      roleKey: 'TENANT_AGENT',
      title: 'Assistante de direction',
      kind: 'active',
      joinMonth: 28,
      avatar: true,
      lastLoginDaysAgo: 25
    },
    {
      fullName: 'Basile Gbané',
      roleKey: 'TENANT_AGENT',
      title: 'Gestionnaire de copropriétés',
      kind: 'suspended',
      joinMonth: 15,
      avatar: false,
      lastLoginDaysAgo: 36
    },
    {
      fullName: 'Victor Anoh',
      roleKey: 'TENANT_MANAGER',
      title: 'Responsable chantiers (ancien)',
      kind: 'removed',
      joinMonth: 2,
      avatar: false,
      lastLoginDaysAgo: 610
    }
  ],
  PATRIMOINE_ESSENTIEL: [
    {
      fullName: 'Solange Ahoussou',
      roleKey: 'TENANT_MANAGER',
      title: 'Gestionnaire de patrimoine',
      kind: 'active',
      joinMonth: 2,
      avatar: true,
      lastLoginDaysAgo: 0
    },
    {
      fullName: 'Emmanuel Gbagbo',
      roleKey: 'TENANT_ACCOUNTANT',
      title: 'Comptable familial',
      kind: 'active',
      joinMonth: 6,
      avatar: false,
      lastLoginDaysAgo: 2
    },
    {
      fullName: 'Carine Yapi',
      roleKey: 'TENANT_AGENT',
      title: 'Chargée de gestion locative',
      kind: 'active',
      joinMonth: 10,
      avatar: true,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Narcisse Adou',
      roleKey: 'TENANT_AGENT',
      title: 'Chargé de travaux et d’entretien',
      kind: 'active',
      joinMonth: 18,
      avatar: false,
      lastLoginDaysAgo: 6
    },
    {
      fullName: 'Joëlle Kobenan',
      roleKey: 'TENANT_AGENT',
      title: 'Assistante',
      kind: 'active',
      joinMonth: 29,
      avatar: true,
      lastLoginDaysAgo: 3
    },
    {
      fullName: 'Armand Lago',
      roleKey: 'TENANT_AGENT',
      title: 'Chargé de gestion locative',
      kind: 'suspended',
      joinMonth: 14,
      avatar: false,
      lastLoginDaysAgo: 33
    },
    {
      fullName: 'Célestine Bédié',
      roleKey: 'TENANT_AGENT',
      title: 'Assistante (ancienne)',
      kind: 'removed',
      joinMonth: 4,
      avatar: false,
      lastLoginDaysAgo: 380
    }
  ],
  PATRIMOINE_PRO: [
    {
      fullName: 'Pascaline Dosso',
      roleKey: 'TENANT_MANAGER',
      title: 'Directrice du patrimoine',
      kind: 'active',
      joinMonth: 1,
      avatar: true,
      lastLoginDaysAgo: 0
    },
    {
      fullName: 'Gilbert Ouédraogo',
      roleKey: 'TENANT_MANAGER',
      title: 'Gestionnaire immobilier',
      kind: 'active',
      joinMonth: 3,
      avatar: true,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Edwige Mel',
      roleKey: 'TENANT_ACCOUNTANT',
      title: 'Comptable',
      kind: 'active',
      joinMonth: 5,
      avatar: true,
      lastLoginDaysAgo: 1
    },
    {
      fullName: 'Franck Bitty',
      roleKey: 'TENANT_AGENT',
      title: 'Chargé de gestion locative',
      kind: 'active',
      joinMonth: 8,
      avatar: false,
      lastLoginDaysAgo: 2
    },
    {
      fullName: 'Nathalie Zadi',
      roleKey: 'TENANT_AGENT',
      title: 'Chargée de travaux',
      kind: 'active',
      joinMonth: 12,
      avatar: true,
      lastLoginDaysAgo: 4
    },
    {
      fullName: 'Cédric Tchimou',
      roleKey: 'TENANT_AGENT',
      title: 'Chargé des assurances et des sinistres',
      kind: 'active',
      joinMonth: 20,
      avatar: false,
      lastLoginDaysAgo: 2
    },
    {
      fullName: 'Mélanie Gnamien',
      roleKey: 'TENANT_AGENT',
      title: 'Assistante',
      kind: 'active',
      joinMonth: 31,
      avatar: true,
      lastLoginDaysAgo: 0
    },
    {
      fullName: 'Thierry Akoto',
      roleKey: 'TENANT_AGENT',
      title: 'Chargé de gestion locative',
      kind: 'suspended',
      joinMonth: 16,
      avatar: false,
      lastLoginDaysAgo: 40
    },
    {
      fullName: 'Sylvie Ettien',
      roleKey: 'TENANT_MANAGER',
      title: 'Gestionnaire immobilier (ancienne)',
      kind: 'removed',
      joinMonth: 2,
      avatar: false,
      lastLoginDaysAgo: 430
    }
  ]
};

/** Candidats invités mais pas (encore) membres : invitations en attente, expirées ou révoquées. */
export interface PendingInvitee {
  fullName: string;
  roleKey: TeamRoleKey;
  /** `pending` = invitation en cours de validité ; `expired` ; `revoked`. */
  state: 'pending' | 'pending-with-account' | 'expired' | 'revoked';
  /** Jours depuis l'envoi de l'invitation. */
  sentDaysAgo: number;
}

export const INVITEES: Record<string, readonly PendingInvitee[]> = {
  AGENCE: [
    { fullName: 'Nadia Sidibé', roleKey: 'TENANT_AGENT', state: 'pending', sentDaysAgo: 2 },
    { fullName: 'Hamed Karamoko', roleKey: 'TENANT_AGENT', state: 'pending-with-account', sentDaysAgo: 4 },
    { fullName: 'Sékou Doumbia', roleKey: 'TENANT_AGENT', state: 'expired', sentDaysAgo: 96 },
    { fullName: 'Vanessa Kra', roleKey: 'TENANT_MANAGER', state: 'expired', sentDaysAgo: 410 },
    { fullName: 'Ibrahim Camara', roleKey: 'TENANT_ACCOUNTANT', state: 'revoked', sentDaysAgo: 240 }
  ],
  SYNDIC: [
    { fullName: 'Awa Diallo', roleKey: 'TENANT_AGENT', state: 'pending', sentDaysAgo: 1 },
    { fullName: 'Mathieu Kablan', roleKey: 'TENANT_MANAGER', state: 'pending-with-account', sentDaysAgo: 5 },
    { fullName: 'Pélagie Assi', roleKey: 'TENANT_AGENT', state: 'expired', sentDaysAgo: 120 },
    { fullName: 'Idrissa Barry', roleKey: 'TENANT_ACCOUNTANT', state: 'revoked', sentDaysAgo: 300 }
  ],
  PROMOTEUR: [
    { fullName: 'Rachelle Atta', roleKey: 'TENANT_AGENT', state: 'pending', sentDaysAgo: 3 },
    { fullName: 'Souleymane Bakayoko', roleKey: 'TENANT_SITE_MANAGER', state: 'pending-with-account', sentDaysAgo: 2 },
    { fullName: 'Yves Kouakou', roleKey: 'TENANT_STOREKEEPER', state: 'expired', sentDaysAgo: 75 },
    { fullName: 'Gérard Tra Bi', roleKey: 'TENANT_SITE_MANAGER', state: 'expired', sentDaysAgo: 330 },
    { fullName: 'Mireille Assamoi', roleKey: 'TENANT_ACCOUNTANT', state: 'revoked', sentDaysAgo: 200 }
  ],
  INTEGRE: [
    { fullName: 'Clarisse Gohi', roleKey: 'TENANT_AGENT', state: 'pending', sentDaysAgo: 2 },
    { fullName: 'Oumar Sanogo', roleKey: 'TENANT_SITE_MANAGER', state: 'pending-with-account', sentDaysAgo: 6 },
    { fullName: 'Flora Bini', roleKey: 'TENANT_AGENT', state: 'expired', sentDaysAgo: 88 },
    { fullName: 'Dominique Ahi', roleKey: 'TENANT_MANAGER', state: 'expired', sentDaysAgo: 250 },
    { fullName: 'Charles Pokou', roleKey: 'TENANT_ACCOUNTANT', state: 'revoked', sentDaysAgo: 180 }
  ],
  PATRIMOINE_ESSENTIEL: [
    { fullName: 'Rebecca Danho', roleKey: 'TENANT_AGENT', state: 'pending', sentDaysAgo: 3 },
    { fullName: 'Fernand Kodjo', roleKey: 'TENANT_AGENT', state: 'expired', sentDaysAgo: 140 },
    { fullName: 'Olga Tiacoh', roleKey: 'TENANT_ACCOUNTANT', state: 'revoked', sentDaysAgo: 260 }
  ],
  PATRIMOINE_PRO: [
    { fullName: 'Ursule Kamagaté', roleKey: 'TENANT_AGENT', state: 'pending', sentDaysAgo: 1 },
    { fullName: 'Léon Djé', roleKey: 'TENANT_MANAGER', state: 'pending-with-account', sentDaysAgo: 4 },
    { fullName: 'Régine Loba', roleKey: 'TENANT_AGENT', state: 'expired', sentDaysAgo: 100 },
    { fullName: 'Casimir Yéo', roleKey: 'TENANT_ACCOUNTANT', state: 'revoked', sentDaysAgo: 220 }
  ]
};

/** Menus coupés (rôle -> clés de menu `collaborateur.<groupe>[.<entrée>]`). */
export const MENU_CUTS: Partial<Record<TeamRoleKey, readonly string[]>> = {
  // Assistantes et agents : pas de comptabilité, pas d'achats, pas de réglages d'agence.
  TENANT_AGENT: [
    'collaborateur.finance-caisse-compta',
    'collaborateur.finance-achats',
    'collaborateur.finance-main-oeuvre',
    'collaborateur.agence.agence-finance-settings',
    'collaborateur.agence.agence-activity',
    'collaborateur.agence.agence-collaborators',
    'collaborateur.agence.agence-invitations'
  ],
  // Le comptable ne voit ni le CRM ni la communication.
  TENANT_ACCOUNTANT: ['collaborateur.crm', 'collaborateur.communication', 'collaborateur.ventes'],
  // Le magasinier ne voit que le stock : tout le reste de la finance et du commercial est coupé.
  TENANT_STOREKEEPER: [
    'collaborateur.finance-caisse-compta',
    'collaborateur.finance-clients-proprietaires',
    'collaborateur.finance-achats',
    'collaborateur.finance-main-oeuvre',
    'collaborateur.crm',
    'collaborateur.communication',
    'collaborateur.ventes',
    'collaborateur.agence'
  ],
  TENANT_SITE_MANAGER: [
    'collaborateur.finance-caisse-compta.finance-comptabilite',
    'collaborateur.finance-clients-proprietaires',
    'collaborateur.communication',
    'collaborateur.agence.agence-finance-settings',
    'collaborateur.agence.agence-collaborators'
  ]
};

// ─────────────────────────────────────────────────────────────── paie

export interface EmployeePlan {
  fullName: string;
  role: string;
  /** Salaire mensuel de départ, en F CFA. */
  baseSalary: number;
  /** Mois d'embauche (0 = début de l'histoire). */
  hireMonth: number;
  /** Mois de départ (exclu) ; absent = toujours en poste. */
  leaveMonth?: number;
  /** Affecté au chantier en cours (charge imputée au coût du chantier). */
  onSite: boolean;
}

export const EMPLOYEE_PLANS: readonly EmployeePlan[] = [
  { fullName: 'Kouadio Yves', role: "Chef d'équipe maçons", baseSalary: 260000, hireMonth: 0, onSite: true },
  { fullName: 'Soro Mamadou', role: 'Maçon', baseSalary: 135000, hireMonth: 0, onSite: true },
  { fullName: 'Bamba Issouf', role: 'Maçon', baseSalary: 135000, hireMonth: 1, onSite: true },
  { fullName: 'Koffi Désiré', role: 'Ferrailleur', baseSalary: 150000, hireMonth: 2, onSite: true },
  { fullName: 'Tuo Seydou', role: 'Coffreur-boiseur', baseSalary: 145000, hireMonth: 2, leaveMonth: 27, onSite: true },
  { fullName: 'Gnamien Alexis', role: 'Électricien du bâtiment', baseSalary: 190000, hireMonth: 4, onSite: true },
  { fullName: 'Ouattara Adama', role: 'Plombier', baseSalary: 185000, hireMonth: 4, onSite: true },
  { fullName: 'Zézé Marcel', role: 'Manœuvre', baseSalary: 90000, hireMonth: 5, leaveMonth: 19, onSite: true },
  { fullName: 'Dago Cyrille', role: 'Conducteur d’engins', baseSalary: 210000, hireMonth: 7, onSite: true },
  { fullName: 'Adjoumani Rose', role: 'Secrétaire de direction', baseSalary: 230000, hireMonth: 0, onSite: false },
  { fullName: 'Kanga Euphrasie', role: 'Assistante comptable', baseSalary: 280000, hireMonth: 6, onSite: false },
  { fullName: 'Yéo Lacina', role: 'Gardien du siège', baseSalary: 85000, hireMonth: 0, onSite: false },
  { fullName: 'Aka Jean-Baptiste', role: 'Ingénieur topographe', baseSalary: 650000, hireMonth: 10, onSite: false },
  { fullName: 'Tiémélé Armel', role: 'Chauffeur-livreur', baseSalary: 120000, hireMonth: 13, onSite: false }
];

// ─────────────────────────────────────────────────────────────── helpers purs

/** Retire accents et ponctuation : `Hortense Kouadio` -> `hortense.kouadio`. */
export function emailLocalPart(fullName: string): string {
  const flat = fullName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '');
  const parts = flat.split(/[\s]+/).filter(Boolean);
  const first = parts[0].replace(/[^a-z0-9-]/g, '');
  const last = parts
    .slice(1)
    .join('')
    .replace(/[^a-z0-9-]/g, '');
  return `${first}.${last}`;
}

const AVATAR_COLORS = ['#1f6f8b', '#99aa38', '#c96f3b', '#7a4e9c', '#2e8b57', '#b5485d', '#3f5fa8', '#8a6d3b'];

function initialsOf(fullName: string): string {
  const parts = fullName.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/** Photo de profil auto-suffisante (data URI SVG) : jamais de fichier ni d'appel réseau. */
export function avatarDataUri(fullName: string, index: number): string {
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
    `<rect width="128" height="128" rx="64" fill="${color}"/>` +
    `<text x="64" y="64" dy=".35em" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="52" font-weight="600" fill="#ffffff">${initialsOf(fullName)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Date au `day`-ième jour du mois `monthsAfter` mois après `start`, à `hour` h UTC. */
export function monthDate(start: Date, monthsAfter: number, day: number, hour = 9): Date {
  return new Date(Date.UTC(start.getFullYear(), start.getMonth() + monthsAfter, day, hour, 0, 0));
}

export function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
}

export function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
