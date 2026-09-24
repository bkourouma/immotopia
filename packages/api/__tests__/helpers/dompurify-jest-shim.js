/**
 * Pendant de `jsdom-jest-shim.js` : `dompurify` importe `jsdom` type
 * indirectement au runtime dans certains environnements Node et partage le
 * meme probleme ESM-only. `sanitize` renvoie le HTML tel quel — jamais appele
 * par les tests du lot E, qui n'exercent pas les routes newsletter.
 */
function createDOMPurify() {
  return { sanitize: html => html };
}

module.exports = createDOMPurify;
module.exports.default = createDOMPurify;
