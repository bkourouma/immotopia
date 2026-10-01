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
 * - six agences de test, une par pack d'abonnement (`pack-*`), avec un
 *   administrateur chacune et un mot de passe commun (`PACK_PASSWORD`) ;
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

/** Mot de passe commun des six administrateurs de pack. */
export const PACK_PASSWORD = 'PackTest@2026';

/** Domaine des e-mails des agences de test par pack. */
export const PACK_EMAIL_DOMAIN = 'packs.immotopia.test';

/** Une agence de test par pack d'abonnement, un TENANT_ADMIN chacune. */
function packGroup(slug: string, label: string, fullName: string, emailLocalPart: string): DevTenantAccounts {
  return {
    id: `pack-${slug}`,
    name: `Test — ${label}`,
    label,
    accounts: [
      {
        email: `${emailLocalPart}@${PACK_EMAIL_DOMAIN}`,
        password: PACK_PASSWORD,
        fullName,
        // Administrateur (TENANT_ADMIN) de l'agence de test du pack.
        persona: 'Collaborateur'
      }
    ]
  };
}

export const DEV_TENANT_ACCOUNTS: DevTenantAccounts[] = [
  packGroup('agence', 'Pack Agence', 'Admin Test Agence', 'agence'),
  packGroup('syndic', 'Pack Syndic', 'Admin Test Syndic', 'syndic'),
  packGroup('promoteur', 'Pack Promoteur', 'Admin Test Promoteur', 'promoteur'),
  packGroup('integre', 'Pack Opérateur intégré', 'Admin Test Intégré', 'integre'),
  packGroup(
    'patrimoine-essentiel',
    'Pack Patrimoine Essentiel',
    'Admin Test Patrimoine Essentiel',
    'patrimoine-essentiel'
  ),
  packGroup('patrimoine-pro', 'Pack Patrimoine Pro', 'Admin Test Patrimoine Pro', 'patrimoine-pro'),
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
