import i18next from './index';

/**
 * Libellés « vivants » pour les constantes de module.
 *
 * `t()` évalué au chargement du module fige le texte dans la langue active à
 * l'import : un changement de langue ne retraduit pas la constante. Ces deux
 * fabriques gardent la forme d'origine (`LABELS[clé]`, `Object.entries`, `.map`,
 * spread…) mais reconstruisent la valeur — avec les `t()` de la fabrique — dès
 * que la langue active ou un catalogue change. Les consommateurs ne changent pas.
 *
 * Le `t('littéral')` reste dans la fabrique : l'extracteur le voit comme avant.
 *
 * ```ts
 * export const STATUS_LABELS = localizedRecord(() => ({ ACTIVE: t('Actif') }));
 * export const KIND_OPTIONS = localizedList(() => [{ value: 'a', label: t('A') }]);
 * ```
 *
 * Les valeurs sont en lecture seule en pratique : une écriture est répercutée
 * sur la valeur courante et disparaît au prochain changement de langue.
 */

let version = 0;
const invalidate = () => {
  version += 1;
};
i18next.on('languageChanged', invalidate);
i18next.on('added', invalidate);
i18next.on('removed', invalidate);

function makeLive<T extends object>(build: () => T, target: object): T {
  let builtAt = -1;
  let value: T;
  const current = (): T => {
    if (builtAt !== version) {
      value = build();
      builtAt = version;
    }
    return value;
  };

  return new Proxy(target, {
    get: (_t, key) => Reflect.get(current(), key),
    set: (_t, key, next) => Reflect.set(current(), key, next),
    has: (_t, key) => Reflect.has(current(), key),
    deleteProperty: (_t, key) => Reflect.deleteProperty(current(), key),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (proxyTarget, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(current(), key);
      // Un descripteur non configurable doit exister à l'identique sur la cible
      // (c'est le cas de `length` pour un tableau, pas des autres clés).
      if (descriptor && !Reflect.getOwnPropertyDescriptor(proxyTarget, key)) descriptor.configurable = true;
      return descriptor;
    }
  }) as T;
}

/** Objet dont les valeurs sont retraduites quand la langue change. */
export function localizedRecord<T extends object>(build: () => T): T {
  return makeLive(build, {});
}

/** Tableau dont les éléments sont retraduits quand la langue change. */
export function localizedList<T>(build: () => T[]): T[] {
  return makeLive(build, []);
}
