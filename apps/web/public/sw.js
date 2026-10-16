/* Service worker d'ImmoTopia (PWA).
 *
 * REGLE CENTRALE : aucune donnee d'agence ne descend dans le cache du
 * navigateur. Le Cache API n'est pas chiffre ; qui tient l'appareil le lit.
 *   - `/api/**` et `/uploads/**` ne sont JAMAIS mis en cache (biens, contacts,
 *     finances, documents prives, jetons) ;
 *   - les pages de navigation ne sont JAMAIS stockees : en cas d'echec reseau
 *     on sert la page de repli generique `/hors-ligne.html`.
 * Ne sont gardes que des fichiers publics : le code de l'application (noms
 * haches par Vite, donc immuables), les polices, les icones et la page de
 * repli.
 *
 * Numero de la LOGIQUE ci-dessous : a incrementer quand elle change. Il nomme
 * les caches ; une version qui monte perime les precedents a l'activation.
 */
const VERSION = '1';
const COQUILLE = `immotopia-coquille-v${VERSION}`;
const ACTIFS = `immotopia-actifs-v${VERSION}`;
const REPLI = '/hors-ligne.html';
const PREFIXES_STATIQUES = ['/assets/', '/fonts/', '/icons/'];
const FICHIERS_STATIQUES = [
  '/favicon.ico',
  '/favicon-32.png',
  '/favicon-192.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest'
];
const PLAFOND_ACTIFS = 200;

function estStatique(url) {
  return (
    PREFIXES_STATIQUES.some(prefixe => url.pathname.startsWith(prefixe)) ||
    FICHIERS_STATIQUES.includes(url.pathname)
  );
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(COQUILLE);
        const reponse = await fetch(REPLI, { cache: 'reload', credentials: 'same-origin' });
        if (reponse.ok) await cache.put(REPLI, reponse);
      } catch {
        // Hors ligne a l'installation : le repli sera repris a la prochaine.
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(
        noms.filter(nom => nom !== COQUILLE && nom !== ACTIFS).map(nom => caches.delete(nom))
      );
      await self.clients.claim();
    })()
  );
});

/** Navigation : le reseau toujours ; la page de repli s'il manque. Rien n'est stocke. */
async function reseauPuisRepli(requete) {
  try {
    return await fetch(requete);
  } catch {
    const cache = await caches.open(COQUILLE);
    const repli = await cache.match(REPLI);
    return (
      repli ||
      new Response('Hors ligne.', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      })
    );
  }
}

/** Fichier public : cache d'abord (nom hache = contenu immuable), reseau ensuite. */
async function cacheDabord(requete) {
  const cache = await caches.open(ACTIFS);
  const connu = await cache.match(requete);
  if (connu) return connu;
  const reponse = await fetch(requete);
  // Seule une reponse complete et reussie entre au cache : pas de repli SPA
  // (index.html servi a la place d'un fichier absent), pas de reponse partielle.
  const type = reponse.headers.get('content-type') || '';
  if (reponse.ok && reponse.status === 200 && !type.includes('text/html')) {
    await cache.put(requete, reponse.clone());
    const cles = await cache.keys();
    if (cles.length > PLAFOND_ACTIFS) {
      await Promise.all(cles.slice(0, cles.length - PLAFOND_ACTIFS).map(cle => cache.delete(cle)));
    }
  }
  return reponse;
}

self.addEventListener('fetch', event => {
  const requete = event.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  if (requete.mode === 'navigate') {
    event.respondWith(reseauPuisRepli(requete));
    return;
  }
  if (estStatique(url)) {
    event.respondWith(cacheDabord(requete));
  }
});
