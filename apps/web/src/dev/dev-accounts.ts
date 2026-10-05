/**
 * Comptes de démonstration pour le menu déroulant « Choisir un compte de test »
 * (`DevAccountsSelect`), au-dessus du formulaire de connexion.
 *
 * Inclus dans le bundle quand `Login.tsx` charge ce module : en `npm run dev`,
 * et dans l'image de production si `VITE_SHOW_DEMO_ACCOUNTS=true` (staging
 * app.immotopia.cloud). Les personas couvrent les quatre navigations.
 *
 * Deux familles de groupes :
 *
 * - douze agences de test, deux par pack d'abonnement (6 mois et 3 ans,
 *   `pack-*`), avec un administrateur chacune et un mot de passe commun (`PACK_PASSWORD`) ;
 *   les agences « 6 mois » Promoteur et Opérateur intégré portent en plus les
 *   comptes de recette du contrôle du stock (Magasinier, Comptable, second
 *   administrateur : `PACK_TEST_MEMBERS` côté API) ;
 *   le contrat des données est partagé avec le seed du staging côté API ;
 * - les comptes historiques (plateforme, Ivoire Résidences).
 *
 * Le garde-fou de `infra/compose/Dockerfile.web` cherche ces mots de passe et
 * le domaine `packs.immotopia.test` dans le bundle de production : mettre à
 * jour son motif si l'un d'eux change.
 */

export interface DevAccount {
  email: string;
  password: string;
  fullName: string;
  /** Persona de navigation obtenu après connexion. */
  persona: 'Super-admin' | 'Collaborateur' | 'Propriétaire' | 'Locataire';
}

export interface DevTenantAccounts {
  /**
   * Identifiant stable du groupe : `pack-*` pour une agence de test par pack,
   * `platform` pour les comptes hors agence, ou l'identifiant de l'agence.
   */
  id: string;
  name: string;
  /** Libellé court affiché dans le menu (ex. `Pack Syndic`), sinon `name`. */
  label?: string;
  accounts: DevAccount[];
}

const PASSWORD = 'DevMick@2003';

/** Mot de passe commun des administrateurs de pack. */
export const PACK_PASSWORD = 'PackTest@2026';

/** Domaine des e-mails des agences de test par pack. */
export const PACK_EMAIL_DOMAIN = 'packs.immotopia.test';

/** Profils d'historique des agences de test : 6 mois ou 3 ans de gestion. */
const PACK_PROFILES = [
  { suffix: '6m', label: '6 mois', emailSuffix: '' },
  { suffix: '3a', label: '3 ans', emailSuffix: '-3ans' }
] as const;

/**
 * Comptes de recette du contrôle du stock (lot 040), après l'administrateur de
 * l'agence « 6 mois » : contrat partagé avec `PACK_TEST_MEMBERS` (API).
 */
const STOCK_RECETTE_ACCOUNTS: Record<string, DevAccount[]> = {
  promoteur: [
    {
      email: `magasinier-promoteur@${PACK_EMAIL_DOMAIN}`,
      password: PACK_PASSWORD,
      fullName: 'Magasinier Test Promoteur',
      // Rôle TENANT_STOREKEEPER : écran Magasin, sans les valeurs.
      persona: 'Collaborateur'
    },
    {
      email: `comptable-promoteur@${PACK_EMAIL_DOMAIN}`,
      password: PACK_PASSWORD,
      fullName: 'Comptable Test Promoteur',
      // Rôle TENANT_ACCOUNTANT.
      persona: 'Collaborateur'
    }
  ],
  integre: [
    {
      email: `magasinier-integre@${PACK_EMAIL_DOMAIN}`,
      password: PACK_PASSWORD,
      fullName: 'Magasinier Test Intégré',
      // Rôle TENANT_STOREKEEPER.
      persona: 'Collaborateur'
    },
    {
      email: `responsable-integre@${PACK_EMAIL_DOMAIN}`,
      password: PACK_PASSWORD,
      fullName: 'Responsable Test Intégré',
      // Second TENANT_ADMIN : valide l'inventaire compté par un autre.
      persona: 'Collaborateur'
    }
  ]
};

/** Deux agences de test par pack (6 mois, 3 ans), un TENANT_ADMIN chacune. */
function packGroups(slug: string, label: string, fullName: string, emailLocalPart: string): DevTenantAccounts[] {
  return PACK_PROFILES.map(profile => ({
    id: `pack-${slug}-${profile.suffix}`,
    name: `Test — ${label} · ${profile.label}`,
    label: `${label} · ${profile.label}`,
    accounts: [
      {
        email: `${emailLocalPart}${profile.emailSuffix}@${PACK_EMAIL_DOMAIN}`,
        password: PACK_PASSWORD,
        fullName: `${fullName} (${profile.label})`,
        // Administrateur (TENANT_ADMIN) de l'agence de test du pack.
        persona: 'Collaborateur' as const
      },
      ...(profile.suffix === '6m' ? (STOCK_RECETTE_ACCOUNTS[slug] ?? []) : [])
    ]
  }));
}

export const DEV_TENANT_ACCOUNTS: DevTenantAccounts[] = [
  ...packGroups('agence', 'Pack Agence', 'Admin Test Agence', 'agence'),
  ...packGroups('syndic', 'Pack Syndic', 'Admin Test Syndic', 'syndic'),
  ...packGroups('promoteur', 'Pack Promoteur', 'Admin Test Promoteur', 'promoteur'),
  ...packGroups('integre', 'Pack Opérateur intégré', 'Admin Test Intégré', 'integre'),
  ...packGroups(
    'patrimoine-essentiel',
    'Pack Patrimoine Essentiel',
    'Admin Test Patrimoine Essentiel',
    'patrimoine-essentiel'
  ),
  ...packGroups('patrimoine-pro', 'Pack Patrimoine Pro', 'Admin Test Patrimoine Pro', 'patrimoine-pro'),
  {
    id: 'platform',
    name: 'Plateforme (hors agence)',
    accounts: [
      {
        email: 'admin@immobillier.com',
        password: 'Admin@123456',
        fullName: 'Super Administrator',
        // Rôle PLATFORM_SUPER_ADMIN, rattaché à aucune agence.
        persona: 'Super-admin'
      }
    ]
  },
  {
    id: '385a1e76-ac08-4db5-9802-8b2ddfb1672b',
    name: 'Ivoire Résidences',
    accounts: [
      {
        email: 'devaccrocs@gmail.com',
        password: PASSWORD,
        fullName: "Kouassi N'Guessan",
        // Membre actif de l'agence, rôle TENANT_ADMIN. Ce compte porte AUSSI
        // une fiche propriétaire, mais l'appartenance à l'agence l'emporte :
        // `resolvePersona()` tranche collaborateur.
        persona: 'Collaborateur'
      },
      {
        email: 'mickael.andjui.21@gmail.com',
        password: PASSWORD,
        fullName: 'Séraphin Koffi',
        // Client OWNER de l'agence, sans appartenance.
        persona: 'Propriétaire'
      },
      {
        email: 'scolarflow@gmail.com',
        password: PASSWORD,
        fullName: 'Mariam Diomandé',
        // Client RENTER de l'agence, sans appartenance.
        persona: 'Locataire'
      }
    ]
  }
];
