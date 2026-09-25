/**
 * `uuid` v13 ne publie plus qu'une build ESM (`"type": "module"` dans son
 * package.json, `export { ... }` dans `dist-node/index.js`). Node 24 la
 * charge sans probleme via `require(esm)`, mais Jest a son propre chargeur de
 * modules CommonJS (jest-runtime) qui ne beneficie pas de cette
 * interoperabilite et echoue avec `SyntaxError: Unexpected token 'export'`.
 *
 * Le probleme n'apparaissait dans aucun test avant le lot E (multi-tenant) :
 * aucun test existant n'importait de fichier import ant transitivement
 * `rental-payment-controller.ts` (le seul point d'entree qui utilise `uuid`).
 * `__tests__/unit/routes-inventory.test.ts` et
 * `__tests__/integration/isolation.test.ts` importent l'app Express
 * COMPLETE (via `src/app.ts`) et le font apparaitre en premier.
 *
 * Ce shim remplace `uuid` UNIQUEMENT dans Jest (voir `moduleNameMapper` dans
 * `jest.config.js`) par l'equivalent du module natif `crypto.randomUUID()` —
 * un vrai UUID v4, RFC 4122. Le code de production continue de resoudre le
 * vrai paquet `uuid` via `ts-node`/`tsc`, tous deux compatibles ESM.
 */
const crypto = require('crypto');

function v4() {
  return crypto.randomUUID();
}

module.exports = { v4, default: { v4 } };
