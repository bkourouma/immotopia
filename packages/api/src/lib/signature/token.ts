/**
 * Jeton de signataire (spec 044, SG-R3) : 32 octets aléatoires (base64url),
 * seul le SHA-256 est stocké (`SignatureSigner.tokenHash`). Même primitive que
 * `SecureLink`, dont ce module reprend le code plutôt que de le dupliquer.
 * Le jeton en clair est remis UNE fois (lien envoyé, ou réponse de création
 * pour le mode sur place) ; il n'est jamais journalisé.
 */
export { generateToken, hashToken, hashesMatch, looksLikeToken, TOKEN_MAX_LENGTH } from '../secure-links/token';
