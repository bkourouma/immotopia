import { useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getFormModes, getPortalFormModes } from '../services/form-settings-service';
import type { FieldMode } from '../services/form-settings-service';
import AuthContext from '../context/AuthContext';

type Modes = Record<string, FieldMode>;

const cache = new Map<string, Modes>();
const inflight = new Map<string, Promise<Modes | null>>();
const listeners = new Set<() => void>();

/**
 * Invalide le cache mémoire (un formulaire, ou tous) ; les écrans montés
 * relisent. À appeler après l'enregistrement d'un réglage.
 */
export function invalidateFormFieldModes(formKey?: string): void {
  for (const key of Array.from(cache.keys())) {
    if (!formKey || key.endsWith(`|${formKey}`)) cache.delete(key);
  }
  for (const key of Array.from(inflight.keys())) {
    if (!formKey || key.endsWith(`|${formKey}`)) inflight.delete(key);
  }
  listeners.forEach(listener => listener());
}

function load(cacheKey: string, fetcher: () => Promise<{ fields: Modes }>): Promise<Modes | null> {
  const pending = inflight.get(cacheKey);
  if (pending) return pending;
  const promise: Promise<Modes | null> = fetcher()
    .then(res => {
      // Une invalidation survenue pendant la requête retire `inflight` : on ne
      // met pas en cache une réponse devenue périmée.
      if (inflight.get(cacheKey) === promise) cache.set(cacheKey, res.fields ?? {});
      return res.fields ?? {};
    })
    .catch(() => null)
    .finally(() => {
      if (inflight.get(cacheKey) === promise) inflight.delete(cacheKey);
    });
  inflight.set(cacheKey, promise);
  return promise;
}

/**
 * Modes effectifs des champs d'un formulaire. Tant que la réponse n'est pas
 * arrivée, et en cas d'erreur, chaque champ garde son comportement actuel
 * (`fallback`) : un formulaire n'est jamais bloqué.
 */
export function useFormFieldModes(
  formKey: string,
  opts?: { portal?: 'coowner' }
): {
  loading: boolean;
  mode(fieldKey: string, fallback?: FieldMode): FieldMode;
  isVisible(fieldKey: string): boolean;
  isRequired(fieldKey: string, fallbackRequired: boolean): boolean;
} {
  // Lecture non levante : hors AuthProvider, pas de tenant, donc fallback.
  const authTenantId = useContext(AuthContext)?.activeTenantId ?? null;
  // L'agence de l'URL (`/tenant/:tenantId/...`) prime : un super-admin qui agit
  // dans une agence voit les réglages de l'agence visée.
  const urlTenantId = useParams<{ tenantId?: string }>().tenantId ?? null;
  const portal = opts?.portal === 'coowner';
  const activeTenantId = portal ? authTenantId : (urlTenantId ?? authTenantId);
  // Le portail est cloisonné par agence : un copropriétaire rattaché à deux
  // agences qui bascule garde les modes de la bonne agence, sans rechargement.
  const scope = portal ? `portal:${activeTenantId ?? ''}` : (activeTenantId ?? '');
  const cacheKey = `${scope}|${formKey}`;
  const enabled = portal || Boolean(activeTenantId);

  const [, setVersion] = useState(0);
  const modes = cache.get(cacheKey) ?? null;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const run = () => {
      if (cache.has(cacheKey)) {
        if (alive) setVersion(v => v + 1);
        return;
      }
      void load(cacheKey, () =>
        portal ? getPortalFormModes(formKey) : getFormModes(activeTenantId as string, formKey)
      ).then(result => {
        if (!alive) return;
        setFailed(result === null);
        setVersion(v => v + 1);
      });
    };
    run();
    const onInvalidate = () => {
      setFailed(false);
      run();
    };
    listeners.add(onInvalidate);
    return () => {
      alive = false;
      listeners.delete(onInvalidate);
    };
  }, [cacheKey, enabled, formKey, portal, activeTenantId]);

  const mode = (fieldKey: string, fallback: FieldMode = 'OPTIONAL'): FieldMode => modes?.[fieldKey] ?? fallback;

  return {
    loading: enabled && !modes && !failed,
    mode,
    isVisible: fieldKey => mode(fieldKey, 'OPTIONAL') !== 'HIDDEN',
    isRequired: (fieldKey, fallbackRequired) => {
      const effective = modes?.[fieldKey];
      return effective ? effective === 'REQUIRED' : fallbackRequired;
    }
  };
}
