/**
 * Garde commune des seeds de développement et de démonstration : comptes et mots
 * de passe connus, suppressions de données. À appeler EN TÊTE du script, avant
 * toute requête base.
 */
export function assertNotProduction(scriptName: string): void {
  if (process.env.NODE_ENV === 'production') {
    process.stderr.write(
      `Refus : ${scriptName} est un seed de développement ou de démonstration ` +
        '(comptes et mots de passe connus, suppressions). Il ne doit jamais tourner en production. ' +
        'Pour amorcer une plateforme vierge : infra/scripts/bootstrap.sh.\n'
    );
    process.exit(1);
  }
}
