import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const PUBLIC = path.resolve(__dirname, '../../../public');

type Handler = (event: unknown) => void;

/** Charge `public/sw.js` dans un faux contexte de service worker. */
function chargerServiceWorker() {
  const handlers: Record<string, Handler> = {};
  const self = {
    location: { origin: 'https://app.test' },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    skipWaiting: () => undefined,
    clients: { claim: () => Promise.resolve() }
  };
  const code = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
  vm.runInNewContext(code, { self, URL, Response, caches: {}, fetch: () => Promise.reject(new Error('hors ligne')) });
  return handlers;
}

function requete(pathname: string, init: { method?: string; mode?: string } = {}) {
  return {
    method: init.method ?? 'GET',
    mode: init.mode ?? 'no-cors',
    url: `https://app.test${pathname}`
  };
}

function intercepte(pathname: string, init?: { method?: string; mode?: string }) {
  const handlers = chargerServiceWorker();
  let repondu = false;
  handlers.fetch({
    request: requete(pathname, init),
    respondWith: (reponse: Promise<unknown>) => {
      repondu = true;
      // Le faux contexte n'a ni réseau ni Cache API : on ne teste que l'aiguillage.
      void Promise.resolve(reponse).catch(() => undefined);
    }
  });
  return repondu;
}

describe('service worker', () => {
  it("n'intercepte jamais l'API ni les fichiers téléversés", () => {
    expect(intercepte('/api/properties')).toBe(false);
    expect(intercepte('/api/auth/me')).toBe(false);
    expect(intercepte('/uploads/documents/bail.pdf')).toBe(false);
  });

  it("n'intercepte pas les requêtes qui modifient des données", () => {
    expect(intercepte('/assets/index-abc.js', { method: 'POST' })).toBe(false);
  });

  it('prend en charge les fichiers publics et les navigations', () => {
    expect(intercepte('/assets/index-abc.js')).toBe(true);
    expect(intercepte('/icons/icon-192.png')).toBe(true);
    expect(intercepte('/rental/leases', { mode: 'navigate' })).toBe(true);
  });

  it('ne met jamais une page de navigation en cache', () => {
    const code = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
    const bloc = code.slice(code.indexOf('async function reseauPuisRepli'), code.indexOf('async function cacheDabord'));
    expect(bloc).not.toMatch(/cache\.put/);
  });
});

describe('manifeste', () => {
  const manifeste = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.webmanifest'), 'utf8'));

  it('est installable : nom, start_url, mode autonome et icônes 192/512', () => {
    expect(manifeste.name).toBe('ImmoTopia');
    expect(manifeste.display).toBe('standalone');
    expect(manifeste.start_url).toBeTruthy();
    const tailles = manifeste.icons.map((i: { sizes: string }) => i.sizes);
    expect(tailles).toEqual(expect.arrayContaining(['192x192', '512x512']));
  });

  it('ne référence que des icônes qui existent', () => {
    for (const icone of manifeste.icons as { src: string }[]) {
      expect(fs.existsSync(path.join(PUBLIC, icone.src))).toBe(true);
    }
  });

  it('a une page de repli hors ligne publiée', () => {
    expect(fs.existsSync(path.join(PUBLIC, 'hors-ligne.html'))).toBe(true);
  });
});
