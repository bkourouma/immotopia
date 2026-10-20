import i18next from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { AUDIT_ACTION_LABELS_FR } from '../../constants/audit-labels';
import { PERMISSION_LABELS_FR } from '../../constants/permissions-labels';
import { TEMPLATE_VARIABLES } from '../../constants/template-variables';

/**
 * Ces constantes de module sont construites par `localizedRecord` /
 * `localizedList` : un changement de langue sans rechargement les retraduit.
 */
afterEach(async () => {
  await i18next.changeLanguage('fr');
});

describe('constantes de libellés — changement de langue à chaud', () => {
  it('retraduit AUDIT_ACTION_LABELS_FR', async () => {
    i18next.addResourceBundle(
      'ar',
      'app',
      { 'Modification des paramètres ou informations du tenant': 'تعديل إعدادات المستأجر' },
      true,
      true
    );
    expect(AUDIT_ACTION_LABELS_FR.TENANT_UPDATED).toBe('Modification des paramètres ou informations du tenant');

    await i18next.changeLanguage('ar');
    expect(AUDIT_ACTION_LABELS_FR.TENANT_UPDATED).toBe('تعديل إعدادات المستأجر');
    expect(Object.keys(AUDIT_ACTION_LABELS_FR)).toContain('TENANT_UPDATED');

    await i18next.changeLanguage('fr');
    expect(AUDIT_ACTION_LABELS_FR.TENANT_UPDATED).toBe('Modification des paramètres ou informations du tenant');
  });

  it('retraduit PERMISSION_LABELS_FR', async () => {
    i18next.addResourceBundle('ar', 'app', { 'Voir les tenants': 'عرض المستأجرين' }, true, true);
    expect(PERMISSION_LABELS_FR.PLATFORM_TENANTS_VIEW.label).toBe('Voir les tenants');

    await i18next.changeLanguage('ar');
    expect(PERMISSION_LABELS_FR.PLATFORM_TENANTS_VIEW.label).toBe('عرض المستأجرين');
  });

  it('retraduit TEMPLATE_VARIABLES (tableau)', async () => {
    i18next.addResourceBundle('ar', 'app', { 'Nom du destinataire': 'اسم المستلم' }, true, true);
    const label = () => TEMPLATE_VARIABLES.find(v => v.name === 'contactName')?.label;
    expect(Array.isArray(TEMPLATE_VARIABLES)).toBe(true);
    expect(label()).toBe('Nom du destinataire');

    await i18next.changeLanguage('ar');
    expect(label()).toBe('اسم المستلم');
  });
});
