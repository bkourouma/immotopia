import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Collapse, ColorPicker, Drawer, Form, Input, Radio, Select, Space } from 'antd';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import {
  provisionTenant,
  resendInvitation,
  type ProvisionTenantPayload,
  type ProvisionTenantResult,
  type TenantBillingCycle,
  type TenantModuleKey,
  type TenantPlanKey
} from '../../services/tenant-service';
import { TenantCreatedResult } from './TenantCreatedResult';

type TenantType = 'AGENCY' | 'OPERATOR';

/** Modules présélectionnés selon le type d'agence (décision [D] du plan lot F). */
const MODULES_BY_TYPE: Record<TenantType, TenantModuleKey[]> = {
  AGENCY: ['MODULE_AGENCY'],
  OPERATOR: ['MODULE_AGENCY', 'MODULE_SYNDIC', 'MODULE_PROMOTER']
};

function nouvelleCleIdempotence(): string {
  // Cohérent avec `pages/rental/Installments.tsx` : `crypto.randomUUID` n'existe
  // pas forcément (jsdom en test), on retombe alors sur une clé lisible mais
  // toujours unique.
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tenant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface TenantFormValues {
  name: string;
  adminFullName: string;
  adminEmail: string;
  planKey: TenantPlanKey;
  billingCycle: TenantBillingCycle;
  legalName?: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  website?: string;
  brandingPrimaryColor?: string;
}

export interface CreateTenantDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Appelé après une création réussie — la liste s'en sert pour se rafraîchir. */
  onCreated?: (result: ProvisionTenantResult) => void;
}

/**
 * `<CreateTenantDrawer>` — panneau latéral « Nouvelle agence » (lot F, plan
 * §F3) : quatre champs obligatoires visibles, le reste sous « Plus
 * d'options », un seul bouton d'envoi. Après succès, le même panneau affiche
 * l'écran de confirmation (`<TenantCreatedResult>`) au lieu de se fermer.
 *
 * Réutilisé tel quel par `TenantCreate.tsx` (route `/admin/tenants/new`) :
 * un seul formulaire, deux points d'entrée.
 */
export const CreateTenantDrawer: React.FC<CreateTenantDrawerProps> = ({ open, onClose, onCreated }) => {
  const [form] = Form.useForm<TenantFormValues>();
  const [tenantType, setTenantType] = useState<TenantType>('AGENCY');
  const [modules, setModules] = useState<TenantModuleKey[]>(MODULES_BY_TYPE.AGENCY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionTenantResult | null>(null);
  const [resending, setResending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => nouvelleCleIdempotence());

  // Une clé neuve à CHAQUE OUVERTURE, pas à chaque envoi : un double clic sur
  // « Créer l'agence » pendant que la première requête est en vol doit
  // renvoyer le même résultat (idempotence côté serveur), mais rouvrir le
  // panneau pour une nouvelle agence doit repartir sur une clé neuve.
  useEffect(() => {
    if (!open) return;
    setIdempotencyKey(nouvelleCleIdempotence());
    setResult(null);
    setError(null);
    setTenantType('AGENCY');
    setModules(MODULES_BY_TYPE.AGENCY);
    form.resetFields();
  }, [open, form]);

  const handleTypeChange = (value: TenantType) => {
    setTenantType(value);
    setModules(MODULES_BY_TYPE[value]);
  };

  const handleSubmit = async (values: TenantFormValues) => {
    setLoading(true);
    setError(null);
    try {
      const payload: ProvisionTenantPayload = {
        name: values.name,
        adminFullName: values.adminFullName,
        adminEmail: values.adminEmail,
        planKey: values.planKey,
        billingCycle: values.billingCycle,
        type: tenantType,
        modules,
        legalName: values.legalName || undefined,
        contactEmail: values.contactEmail || undefined,
        contactPhone: values.contactPhone || undefined,
        country: values.country || undefined,
        city: values.city || undefined,
        address: values.address || undefined,
        website: values.website || undefined,
        brandingPrimaryColor: values.brandingPrimaryColor || undefined
      };
      const response = await provisionTenant(payload, idempotencyKey);
      if (response.success && response.data) {
        setResult(response.data);
        onCreated?.(response.data);
      } else {
        setError(response.message || t("Erreur lors de la création de l'agence"));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t("Erreur lors de la création de l'agence"));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!result) return;
    setResending(true);
    try {
      const response = await resendInvitation(result.tenant.id, result.invitation.id);
      if (response.success) {
        setResult({
          ...result,
          invitation: {
            ...result.invitation,
            acceptUrl: response.data.acceptUrl || result.invitation.acceptUrl
          },
          emailSent: response.data.emailSent ?? result.emailSent
        });
        feedback.success(t('Invitation renvoyée.'));
      } else {
        feedback.error(response.message || t("L'invitation n'a pas pu être renvoyée."));
      }
    } catch (err: any) {
      feedback.error(err.response?.data?.message || t("L'invitation n'a pas pu être renvoyée."));
    } finally {
      setResending(false);
    }
  };

  const handleCreateAnother = () => {
    setResult(null);
    setError(null);
    setIdempotencyKey(nouvelleCleIdempotence());
    setTenantType('AGENCY');
    setModules(MODULES_BY_TYPE.AGENCY);
    form.resetFields();
  };

  return (
    <Drawer title={result ? t('Agence créée') : t('Nouvelle agence')} placement="right" width={520} open={open} onClose={onClose}>
      {result ? (
        <TenantCreatedResult
          result={result}
          onResend={handleResend}
          resending={resending}
          onCreateAnother={handleCreateAnother}
          onClose={onClose}
        />
      ) : (
        <Form
          form={form}
          layout="vertical"
          initialValues={{ planKey: 'PRO', billingCycle: 'MONTHLY' }}
          onFinish={handleSubmit}
          onFinishFailed={onAntFormValidationFailed(form)}
        >
          {error && (
            <Alert
              message={t('Erreur')}
              description={error}
              type="error"
              showIcon
              closable
              onClose={() => setError(null)}
              style={{ marginBottom: 24 }}
            />
          )}

          <Form.Item
            label={t("Nom de l'agence")}
            name="name"
            rules={[{ required: true, message: t("Le nom de l'agence est requis") }]}
          >
            <Input placeholder={t("Nom de l'agence")} />
          </Form.Item>

          <Form.Item
            label={t("Nom de l'administrateur")}
            name="adminFullName"
            rules={[{ required: true, message: t("Le nom de l'administrateur est requis") }]}
          >
            <Input placeholder={t('Nom complet')} />
          </Form.Item>

          <Form.Item
            label={t("E-mail de l'administrateur")}
            name="adminEmail"
            rules={[
              { required: true, message: t("L'e-mail de l'administrateur est requis") },
              { type: 'email', message: t('E-mail invalide') }
            ]}
          >
            <Input type="email" placeholder="admin@exemple.fr" />
          </Form.Item>

          <Form.Item label={t('Offre')} name="planKey" rules={[{ required: true, message: t("L'offre est requise") }]}>
            <Select
              options={[
                { value: 'BASIC', label: t('Basic') },
                { value: 'PRO', label: t('Pro') },
                { value: 'ELITE', label: t('Elite') }
              ]}
            />
          </Form.Item>

          <Collapse
            ghost
            style={{ marginBottom: 24 }}
            items={[
              {
                key: 'plus-options',
                label: t("Plus d'options"),
                children: (
                  <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                    <Form.Item label={t("Type d'agence")} style={{ marginBottom: 0 }}>
                      <Radio.Group optionType="button" buttonStyle="solid" value={tenantType} onChange={e => handleTypeChange(e.target.value)}>
                        <Radio.Button value="AGENCY">{t('Agence')}</Radio.Button>
                        <Radio.Button value="OPERATOR">{t('Opérateur')}</Radio.Button>
                      </Radio.Group>
                    </Form.Item>

                    <Form.Item label={t('Modules')} style={{ marginBottom: 0 }}>
                      <Checkbox.Group
                        value={modules}
                        onChange={vals => setModules(vals as TenantModuleKey[])}
                        options={[
                          { value: 'MODULE_AGENCY', label: t('Agence') },
                          { value: 'MODULE_SYNDIC', label: t('Syndic') },
                          { value: 'MODULE_PROMOTER', label: t('Promoteur') }
                        ]}
                      />
                    </Form.Item>

                    <Form.Item label={t('Cycle de facturation')} name="billingCycle" style={{ marginBottom: 0 }}>
                      <Radio.Group optionType="button" buttonStyle="solid">
                        <Radio.Button value="MONTHLY">{t('Mensuel')}</Radio.Button>
                        <Radio.Button value="ANNUAL">{t('Annuel')}</Radio.Button>
                      </Radio.Group>
                    </Form.Item>

                    <Form.Item label={t('Raison sociale')} name="legalName" style={{ marginBottom: 0 }}>
                      <Input placeholder={t('Raison sociale')} />
                    </Form.Item>

                    <Form.Item label={t('E-mail de contact')} name="contactEmail" style={{ marginBottom: 0 }}>
                      <Input type="email" placeholder="contact@exemple.fr" />
                    </Form.Item>

                    <Form.Item label={t('Téléphone de contact')} name="contactPhone" style={{ marginBottom: 0 }}>
                      <Input placeholder="+225 07 00 00 00 00" />
                    </Form.Item>

                    <Form.Item label={t('Pays')} name="country" style={{ marginBottom: 0 }}>
                      <Input placeholder={t("Côte d'Ivoire")} />
                    </Form.Item>

                    <Form.Item label={t('Ville')} name="city" style={{ marginBottom: 0 }}>
                      <Input placeholder={t('Ville')} />
                    </Form.Item>

                    <Form.Item label={t('Adresse')} name="address" style={{ marginBottom: 0 }}>
                      <Input.TextArea rows={2} placeholder={t('Adresse complète')} />
                    </Form.Item>

                    <Form.Item label={t('Site web')} name="website" style={{ marginBottom: 0 }}>
                      <Input placeholder="https://" />
                    </Form.Item>

                    <Form.Item
                      label={t('Couleur de marque')}
                      name="brandingPrimaryColor"
                      style={{ marginBottom: 0 }}
                      getValueFromEvent={(color: unknown) => {
                        if (typeof color === 'string') return color;
                        if (color && typeof (color as { toHexString?: () => string }).toHexString === 'function') {
                          return (color as { toHexString: () => string }).toHexString();
                        }
                        return undefined;
                      }}
                    >
                      <ColorPicker format="hex" />
                    </Form.Item>
                  </Space>
                )
              }
            ]}
          />

          <Space>
            <Button onClick={onClose}>{t('Annuler')}</Button>
            <Button type="primary" htmlType="submit" loading={loading} disabled={loading}>
              {t("Créer l'agence")}
            </Button>
          </Space>
        </Form>
      )}
    </Drawer>
  );
};
