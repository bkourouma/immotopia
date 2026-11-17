import { assertRegistryConsistency } from '../../src/lib/form-settings/registry';
import type { FormDefinition, FormFieldDefinition } from '../../src/lib/form-settings/types';

const field = (over: Partial<FormFieldDefinition> = {}): FormFieldDefinition => ({
  key: 'a',
  label: 'A',
  fieldClass: 'OPEN',
  defaultMode: 'REQUIRED',
  allowedModes: ['REQUIRED', 'OPTIONAL'],
  consequence: 'x',
  ...over
});
const form = (formKey: string, fields: FormFieldDefinition[]): FormDefinition => ({
  formKey,
  module: 'm',
  label: 'F',
  audience: 'agency',
  fields
});

describe('assertRegistryConsistency', () => {
  it('le registre du dépôt est cohérent', () => {
    expect(() => assertRegistryConsistency()).not.toThrow();
  });

  it('accepte un registre valide', () => {
    expect(() => assertRegistryConsistency({ 'm.f': form('m.f', [field()]) }, [])).not.toThrow();
  });

  it('refuse un formKey en double entre sources', () => {
    const f = form('m.f', [field()]);
    expect(() => assertRegistryConsistency({ 'm.f': f }, [[f], [f]])).toThrow(/en double : m\.f/);
  });

  it('refuse une clé de registre différente de formKey', () => {
    expect(() => assertRegistryConsistency({ autre: form('m.f', [field()]) }, [])).toThrow(/différente de formKey/);
  });

  it('refuse un fieldKey en double', () => {
    expect(() => assertRegistryConsistency({ 'm.f': form('m.f', [field(), field()]) }, [])).toThrow(
      /fieldKey en double/
    );
  });

  it('refuse un defaultMode hors allowedModes', () => {
    const bad = field({ defaultMode: 'HIDDEN' });
    expect(() => assertRegistryConsistency({ 'm.f': form('m.f', [bad]) }, [])).toThrow(/absent de allowedModes/);
  });
});
