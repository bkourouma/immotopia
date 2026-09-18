/**
 * Comptes de démonstration pour le panneau « Comptes par tenant ».
 *
 * Inclus dans le bundle quand `Login.tsx` charge ce module : en `npm run dev`,
 * et dans l'image de production si `VITE_SHOW_DEMO_ACCOUNTS=true` (démo
 * app.immotopia.cloud). Les personas couvrent les quatre navigations.
 */

export interface DevAccount {
  email: string;
  password: string;
  fullName: string;
  /** Persona de navigation obtenu après connexion. */
  persona: 'Super-admin' | 'Collaborateur' | 'Propriétaire' | 'Locataire';
}

export interface DevTenantAccounts {
  /** Identifiant de l'agence, ou `platform` pour les comptes hors agence. */
  id: string;
  name: string;
  accounts: DevAccount[];
}

const PASSWORD = 'DevMick@2003';

export const DEV_TENANT_ACCOUNTS: DevTenantAccounts[] = [
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
