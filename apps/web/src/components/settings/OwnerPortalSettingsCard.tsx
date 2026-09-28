import React, { useEffect, useState } from 'react';
import { App, Alert, Card, Space, Spin, Switch, Typography } from 'antd';
import {
  OwnerPortalSettings,
  OwnerPortalSettingsInput,
  getOwnerPortalSettings,
  updateOwnerPortalSettings
} from '../../services/tenant-owner-portal-settings-service';
import { t } from '../../i18n/t';

const { Text } = Typography;

export interface OwnerPortalSettingsCardProps {
  tenantId: string;
}

interface SectionRow {
  key: keyof Omit<OwnerPortalSettings, 'patrimonyEnabled'>;
  label: string;
}

const SECTIONS: SectionRow[] = [
  { key: 'patrimonyShowValuation', label: t('Valorisation et plus-value') },
  { key: 'patrimonyShowYield', label: t('Rendements') },
  { key: 'patrimonyShowLoans', label: t('Emprunts') },
  { key: 'patrimonyShowWorks', label: t('Travaux') },
  { key: 'patrimonyShowDocuments', label: t('Documents') }
];

/**
 * Carte « Portail propriétaire » — lot P5, masquage de la vue patrimoine.
 *
 * Lecture `GET /tenants/:tenantId/settings/owner-portal`, enregistrement
 * `PUT` en corps partiel (un seul interrupteur à la fois). Tant que l'agence
 * n'a jamais enregistré ce réglage, l'API renvoie les valeurs par défaut
 * (tout activé) sans rien écrire — même patron que les paramètres financiers.
 *
 * Aucun contrôle de permission `TENANT_SETTINGS_EDIT` côté client (le front
 * n'a pas la liste des permissions de la personne connectée) : un refus du
 * serveur (403) bascule la carte en lecture seule pour le reste de la
 * session, plutôt que de laisser deviner un statut HTTP.
 */
export const OwnerPortalSettingsCard: React.FC<OwnerPortalSettingsCardProps> = ({ tenantId }) => {
  const { message } = App.useApp();
  const [settings, setSettings] = useState<OwnerPortalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [savingKey, setSavingKey] = useState<keyof OwnerPortalSettings | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOwnerPortalSettings(tenantId);
      setSettings(data);
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des informations'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tenantId]);

  const handleToggle = async (key: keyof OwnerPortalSettings, value: boolean) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, [key]: value });
    setSavingKey(key);
    try {
      const input: OwnerPortalSettingsInput = { [key]: value };
      const saved = await updateOwnerPortalSettings(tenantId, input);
      setSettings(saved);
      message.success(t('Réglage mis à jour'));
    } catch (err: any) {
      setSettings(previous);
      if (err?.response?.status === 403) {
        setReadOnly(true);
        message.error(t("Vous n'avez pas la permission de modifier ce réglage."));
      } else {
        message.error(err.response?.data?.message || t('Erreur lors de la sauvegarde'));
      }
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card title={t('Portail propriétaire')}>
      {loading ? (
        <Spin />
      ) : error ? (
        <Alert message={t('Erreur')} description={error} type="error" showIcon />
      ) : settings ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Text type="secondary">
            {t(
              "Contrôlez ce que les propriétaires voient dans l'onglet « Mon patrimoine » de leur portail. Masquer les emprunts retire aussi le rendement net-net, qui en révèlerait les mensualités."
            )}
          </Text>

          {readOnly && (
            <Alert
              type="info"
              showIcon
              message={t('Lecture seule')}
              description={t("Vous n'avez pas la permission de modifier ces réglages.")}
            />
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text strong>{t('Afficher la vue patrimoine')}</Text>
            <Switch
              checked={settings.patrimonyEnabled}
              loading={savingKey === 'patrimonyEnabled'}
              disabled={readOnly || Boolean(savingKey)}
              onChange={checked => void handleToggle('patrimonyEnabled', checked)}
              aria-label={t('Afficher la vue patrimoine')}
            />
          </div>

          <Space direction="vertical" size="small" style={{ width: '100%', marginInlineStart: 'var(--space-4)' }}>
            {SECTIONS.map(section => (
              <div key={section.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text type={settings.patrimonyEnabled ? undefined : 'secondary'}>{section.label}</Text>
                <Switch
                  checked={settings[section.key]}
                  loading={savingKey === section.key}
                  disabled={readOnly || !settings.patrimonyEnabled || Boolean(savingKey)}
                  onChange={checked => void handleToggle(section.key, checked)}
                  aria-label={section.label}
                />
              </div>
            ))}
          </Space>
        </Space>
      ) : null}
    </Card>
  );
};
