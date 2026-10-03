/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parcours de la pile Express pour l'inventaire des routes (lot E, E2).
 *
 * Express ne garde nulle part, sous forme de chaine, le chemin passe a
 * `router.use(path, ...)` pour un montage de sous-routeur : seule sa regexp
 * compilee survit (`layer.regexp`), et la reconstruire depuis la regexp est
 * fragile d'une version a l'autre de `path-to-regexp`. `installMountPathRecorder`
 * contourne le probleme a la source : il intercepte `Router.use` (la methode
 * est partagee par toutes les instances, `app` comprise, via
 * `Object.setPrototypeOf`) et note le chemin litteral sur chaque layer qu'il
 * cree, AVANT que l'app ne soit importee. Il faut donc l'appeler avant tout
 * `require('../../src/app')`.
 *
 * `collectRoutes` reconstruit ensuite, pour chaque route terminale
 * (`layer.route`), la chaine de middlewares qui s'executerait REELLEMENT :
 * pour chaque middleware simple rencontre en chemin (`router.use(fn)` ou
 * `router.use(path, fn)`), on reutilise le `layer.match(...)` d'Express
 * lui-meme (son verificateur de regexp compile, donc fiable) plutot que de
 * reimplementer un prefix-matcher : on lui teste le chemin RELATIF de la
 * route depuis le niveau ou ce middleware a ete enregistre. Comme les
 * segments `:param` d'un chemin de route sont du texte litteral pour
 * path-to-regexp (pas une vraie valeur substituee), le test fonctionne sans
 * jamais construire de requete réelle.
 */

export interface DiscoveredRoute {
  method: string;
  /** Chemin complet reconstruit, ex. `/api/tenants/:tenantId/finance/suppliers`. */
  path: string;
  /** Chaine de middlewares qui s'executerait reellement pour cette route, dans l'ordre. */
  middlewares: Array<(...args: any[]) => any>;
}

let installed = false;

/** A appeler UNE fois, avant `require('../../src/app')`. Idempotent. */
export function installMountPathRecorder(): void {
  if (installed) {
    return;
  }
  installed = true;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RouterProto = require('express').Router as any;
  const originalUse = RouterProto.use;

  RouterProto.use = function (this: any, ...args: any[]) {
    const before = this.stack.length as number;
    const result = originalUse.apply(this, args);

    let path: string | string[] = '/';
    if (typeof args[0] === 'string' || Array.isArray(args[0])) {
      path = args[0];
    }
    const mountPath = Array.isArray(path) ? path[0] : path;

    const added = this.stack.slice(before);
    for (const layer of added) {
      (layer as any).__mountPath = mountPath;
    }

    return result;
  };
}

function methodsOf(route: any): string[] {
  return Object.keys(route.methods).filter(m => route.methods[m]);
}

function normalizePath(path: string): string {
  const collapsed = path.replace(/\/{2,}/g, '/');
  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.slice(0, -1);
  }
  return collapsed.length > 0 ? collapsed : '/';
}

function routePaths(route: any): string[] {
  return Array.isArray(route.path) ? route.path : [route.path];
}

/**
 * Parcourt `app._router.stack` (recursivement dans les sous-routeurs) et
 * retourne une entree par (route terminale x methode HTTP).
 */
export function collectRoutes(app: any): DiscoveredRoute[] {
  const results: DiscoveredRoute[] = [];

  function walk(stack: any[], prefix: string, ancestors: Array<{ layer: any; prefixAtAdd: string }>): void {
    for (const layer of stack) {
      if (layer.route) {
        const route = layer.route;
        for (const rp of routePaths(route)) {
          for (const method of methodsOf(route)) {
            const chain: Array<(...args: any[]) => any> = [];
            for (const ancestor of ancestors) {
              const sincePrefix = prefix.slice(ancestor.prefixAtAdd.length);
              const testPath = normalizePath(sincePrefix + rp);
              if (ancestor.layer.match(testPath)) {
                chain.push(ancestor.layer.handle ?? ancestor.layer);
              }
            }
            chain.push(...(route.stack as any[]).map(l => l.handle));
            results.push({
              method: method.toUpperCase(),
              path: normalizePath(prefix + rp),
              middlewares: chain
            });
          }
        }
        continue;
      }

      if (layer.name === 'router' && layer.handle && Array.isArray(layer.handle.stack)) {
        const mountPath = layer.__mountPath && layer.__mountPath !== '/' ? layer.__mountPath : '';
        walk(layer.handle.stack, prefix + mountPath, ancestors);
        continue;
      }

      if (typeof layer.handle === 'function') {
        ancestors = [...ancestors, { layer, prefixAtAdd: prefix }];
      }
    }
  }

  walk(app._router.stack, '', []);
  return results;
}
