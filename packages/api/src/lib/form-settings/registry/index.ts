import type { FormDefinition, FormRegistry } from '../types';
import { FORMS as paiements } from './syndic-paiements';
import { FORMS as copropriete } from './syndic-copropriete';
import { FORMS as charges } from './syndic-charges';
import { FORMS as assemblees } from './syndic-assemblees';

const SOURCES: FormDefinition[][] = [paiements, copropriete, charges, assemblees];

function assemble(lists: FormDefinition[][]): FormRegistry {
  const registry: FormRegistry = {};
  for (const form of lists.flat()) registry[form.formKey] = form;
  return registry;
}

/** Tous les formulaires paramétrables, par `formKey`. Chaque fichier appartient à son lot métier. */
export const FORM_REGISTRY: FormRegistry = assemble(SOURCES);

/**
 * Vérifie la cohérence d'un registre : formKey unique (et égal à sa clé), fieldKey unique par
 * formulaire, `defaultMode` dans `allowedModes`. Lève une `Error` qui liste tous les écarts.
 * `sources` : les listes avant assemblage, pour repérer un formKey en double entre fichiers
 * (l'objet final le masquerait).
 */
export function assertRegistryConsistency(
  registry: FormRegistry = FORM_REGISTRY,
  sources: FormDefinition[][] = registry === FORM_REGISTRY ? SOURCES : []
): void {
  const problems: string[] = [];

  const seen = new Set<string>();
  for (const form of sources.flat()) {
    if (seen.has(form.formKey)) problems.push(`formKey en double : ${form.formKey}`);
    seen.add(form.formKey);
  }

  for (const [key, form] of Object.entries(registry)) {
    if (form.formKey !== key) problems.push(`${key} : clé du registre différente de formKey (${form.formKey})`);
    const fieldKeys = new Set<string>();
    for (const field of form.fields) {
      if (fieldKeys.has(field.key)) problems.push(`${form.formKey} : fieldKey en double : ${field.key}`);
      fieldKeys.add(field.key);
      if (!field.allowedModes.includes(field.defaultMode)) {
        problems.push(`${form.formKey}.${field.key} : defaultMode ${field.defaultMode} absent de allowedModes`);
      }
    }
  }

  if (problems.length > 0) throw new Error(`Registre des formulaires incohérent :\n- ${problems.join('\n- ')}`);
}
