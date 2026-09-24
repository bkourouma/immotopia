/**
 * `jsdom` (et sa chaine de dependances, ex. `html-encoding-sniffer` ->
 * `@exodus/bytes`) publie des fichiers ESM-only que jest-runtime ne sait pas
 * charger (voir `uuid-jest-shim.js` pour le detail du probleme). Seul
 * `newsletter-campaign.service.ts` l'utilise, et seulement pour construire un
 * `window` factice servant a `DOMPurify` — jamais exerce par les tests du lot
 * E (E2/E1 n'envoient aucune requete vers les routes newsletter, ils
 * importent seulement l'app pour en inspecter la pile ou verifier
 * l'etancheite d'autres ressources). Un `JSDOM` minimal suffit donc a ce que
 * l'import ne leve pas ; voir `dompurify-jest-shim.js` pour le pendant.
 */
class JSDOM {
  constructor() {
    this.window = {};
  }
}

module.exports = { JSDOM };
