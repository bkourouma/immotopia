/**
 * Garde commune des seeds de développement et de démonstration : comptes et mots
 * de passe connus, suppressions de données. À appeler EN TÊTE du script, avant
 * toute requête base.
 *
 * Deux refus, sans échappatoire (aucune variable de contournement) :
 * - `NODE_ENV=production` ;
 * - une `DATABASE_URL` dont l'hôte n'est pas la machine locale (même liste que
 *   `scripts/fix-demo-login-account.cjs`, plus `host.docker.internal` pour une
 *   base Docker locale) : un poste de développement dont le `.env` vise une
 *   base distante ne doit pas pouvoir l'effacer, même hors production.
 * `DATABASE_URL` absente : rien à vérifier ici (Prisma échouera de lui-même).
 */

/** Hôtes acceptés : boucle locale et base Docker du poste. */
const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', 'host.docker.internal']);

function refuse(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/**
 * L'hôte de `DATABASE_URL` est-il local ? Un chemin de socket Unix (`?host=/…`,
 * ou hôte vide) l'est aussi. Une URL illisible ne l'est pas (refus prudent).
 */
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return false;
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === '') {
    const socketHost = url.searchParams.get('host');
    return socketHost === null || socketHost.startsWith('/');
  }
  return LOCAL_DATABASE_HOSTS.has(hostname);
}

/** Hôte affichable : jamais l'utilisateur ni le mot de passe de l'URL. */
function displayHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname || '(illisible)';
  } catch {
    return '(illisible)';
  }
}

export function assertNotProduction(scriptName: string): void {
  if (process.env.NODE_ENV === 'production') {
    refuse(
      `Refus : ${scriptName} est un seed de développement ou de démonstration ` +
        '(comptes et mots de passe connus, suppressions). Il ne doit jamais tourner en production. ' +
        'Pour amorcer une plateforme vierge : infra/scripts/bootstrap.sh.'
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && !isLocalDatabaseUrl(databaseUrl)) {
    refuse(
      `Refus : ${scriptName} est un seed de développement ou de démonstration et DATABASE_URL ` +
        `ne vise pas la machine locale (hôte : ${displayHost(databaseUrl)}). ` +
        'Hôtes acceptés : localhost, 127.0.0.1, ::1, host.docker.internal.'
    );
  }
}
