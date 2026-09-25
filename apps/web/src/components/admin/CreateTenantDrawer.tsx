import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Checkbox, Collapse, ColorPicker, Divider, Drawer, Form, Input, InputNumber, Radio, Space, Switch, Typography } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import {
  provisionTenant,
  resendInvitation,
  type ProvisionTenantItem,
  type ProvisionTenantPayload,
  type ProvisionTenantResult,
  type TenantBillingCycle
} from '../../services/tenant-service';
import { listCatalog, quoteCatalog, type CatalogEntry, type CatalogQuote } from '../../services/subscription-v2-service';
import { MoneyValue } from '../primitives';
import { TenantCreatedResult } from './TenantCreatedResult';

const { Text, Title } = Typography;

/** Bloc de lots vendu par `EXT_LOTS_10` (docs/architecture/PLAN-ABONNEMENTS.md §2). */
const LOTS_BLOCK_SIZE = 10;

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
 * `<CreateTenantDrawer>` — panneau latéral « Nouvelle agence ».
 *
 * Vague 2, lot C : la sélection d'offre passe des trois étiquettes
 * BASIC/PRO/ELITE (dépréciées, `Subscription.planKey`) aux packs du catalogue
 * (AGENCE, SYNDIC, PROMOTEUR, INTEGRE — l'Intégré exclut les trois autres) et
 * à leurs extensions (lots par blocs de 10, copropriétés, chantiers), avec un
 * récapitulatif chiffré EN DIRECT tiré de `POST /api/admin/catalog/quote`
 * (aucun calcul de prix recopié côté web : la seule source est l'API).
 *
 * Après succès, le même panneau affiche l'écran de confirmation
 * (`<TenantCreatedResult>`) au lieu de se fermer. Réutilisé tel quel par
 * `TenantCreate.tsx` (route `/admin/tenants/new`).
 */
export const CreateTenantDrawer: React.FC<CreateTenantDrawerProps> = ({ open, onClose, onCreated }) => {
  const [form] = Form.useForm<TenantFormValues>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionTenantResult | null>(null);
  const [resending, setResending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => nouvelleCleIdempotence());

  // ---------------------------------------------------------------- offre
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedPacks, setSelectedPacks] = useState<string[]>([]);
  const [lotsBlocks, setLotsBlocks] = useState(0);
  const [extraCopros, setExtraCopros] = useState(0);
  const [extraChantiers, setExtraChantiers] = useState(0);
  const [trialEnabled] = useState(true); // Essai de 30 jours : toujours accordé par l'API à la création (D8).
  const [setupIncluded, setSetupIncluded] = useState(false);
  const [cycle, setCycle] = useState<TenantBillingCycle>('MONTHLY');

  const [quote, setQuote] = useState<CatalogQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [integreQuote, setIntegreQuote] = useState<CatalogQuote | null>(null);
  const quoteRequestId = useRef(0);

  // Une clé neuve à CHAQUE OUVERTURE, pas à chaque envoi : un double clic sur
  // « Créer l'agence » pendant que la première requête est en vol doit
  // renvoyer le même résultat (idempotence côté serveur), mais rouvrir le
  // panneau pour une nouvelle agence doit repartir sur une clé neuve.
  useEffect(() => {
    if (!open) return;
    setIdempotencyKey(nouvelleCleIdempotence());
    setResult(null);
    setError(null);
    setSelectedPacks([]);
    setLotsBlocks(0);
    setExtraCopros(0);
    setExtraChantiers(0);
    setSetupIncluded(false);
    setCycle('MONTHLY');
    setQuote(null);
    setIntegreQuote(null);
    form.resetFields();
  }, [open, form]);

  useEffect(() => {
    if (!open || catalog.length > 0 || catalogLoading) return;
    setCatalogLoading(true);
    setCatalogError(null);
    listCatalog()
      .then(setCatalog)
      .catch((err: any) => setCatalogError(err.response?.data?.message || t("Erreur lors du chargement du catalogue")))
      .finally(() => setCatalogLoading(false));
  }, [open, catalog.length, catalogLoading]);

  const packs = useMemo(() => catalog.filter(c => c.kind === 'PACK').sort((a, b) => a.sortOrder - b.sortOrder), [catalog]);
  const integre = useMemo(() => packs.find(p => p.code === 'INTEGRE'), [packs]);
  const setupItems = useMemo(() => catalog.filter(c => c.kind === 'SETUP'), [catalog]);

  const includedCapacity = (key: 'LOTS' | 'COPROPRIETES' | 'CHANTIERS') =>
    packs.filter(p => selectedPacks.includes(p.code)).reduce((sum, p) => sum + (p.capacities[key] ?? 0), 0);

  const extensionAllowed = (code: string) => {
    const item = catalog.find(c => c.code === code);
    const required = item?.rules?.requiresAnyOf;
    return !required || required.length === 0 || required.some(pack => selectedPacks.includes(pack));
  };

  const targetLots = includedCapacity('LOTS') + lotsBlocks * LOTS_BLOCK_SIZE;
  const targetCopros = includedCapacity('COPROPRIETES') + extraCopros;
  const targetChantiers = includedCapacity('CHANTIERS') + extraChantiers;

  // ---------------------------------------------------------------- aperçu chiffré en direct
  useEffect(() => {
    if (!open || selectedPacks.length === 0) {
      setQuote(null);
      setIntegreQuote(null);
      return;
    }
    const requestId = ++quoteRequestId.current;
    const timer = window.setTimeout(() => {
      setQuoting(true);
      const current = quoteCatalog({ packs: selectedPacks, lots: targetLots, copros: targetCopros, chantiers: targetChantiers });
      // Suggestion de l'Intégré (D6) : même volume, un seul pack — comparé
      // seulement quand l'agence n'a pas déjà choisi l'Intégré seul.
      const suggestion =
        selectedPacks.length === 1 && selectedPacks[0] === 'INTEGRE'
          ? Promise.resolve(null)
          : quoteCatalog({ packs: ['INTEGRE'], lots: targetLots, copros: targetCopros, chantiers: targetChantiers }).catch(
              () => null
            );
      Promise.all([current, suggestion])
        .then(([currentQuote, integreResult]) => {
          if (requestId !== quoteRequestId.current) return;
          setQuote(currentQuote);
          setIntegreQuote(integreResult);
        })
        .catch((err: any) => {
          if (requestId !== quoteRequestId.current) return;
          setQuote(null);
          setCatalogError(err.response?.data?.message || t("Erreur lors du calcul de l'estimation"));
        })
        .finally(() => {
          if (requestId === quoteRequestId.current) setQuoting(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedPacks, targetLots, targetCopros, targetChantiers]);

  const togglePack = (code: string) => {
    setSelectedPacks(current => {
      if (code === 'INTEGRE') {
        return current.includes('INTEGRE') ? [] : ['INTEGRE'];
      }
      const withoutIntegre = current.filter(c => c !== 'INTEGRE');
      return withoutIntegre.includes(code) ? withoutIntegre.filter(c => c !== code) : [...withoutIntegre, code];
    });
  };

  const setupTotal = useMemo(() => {
    if (!setupIncluded) return 0;
    return selectedPacks.reduce((sum, code) => {
      const item = setupItems.find(s => s.code === `SETUP_${code}`);
      return sum + (item?.setupPrice ?? 0);
    }, 0);
  }, [setupIncluded, selectedPacks, setupItems]);

  const integreCheaper = Boolean(integreQuote && quote && integreQuote.monthly < quote.monthly);

  const buildItems = (): ProvisionTenantItem[] => {
    const items: ProvisionTenantItem[] = selectedPacks.map(code => ({ code, quantity: 1 }));
    if (quote) {
      for (const [code, quantity] of Object.entries(quote.extensions)) {
        if (quantity > 0) items.push({ code, quantity });
      }
    }
    if (setupIncluded) {
      for (const code of selectedPacks) {
        const setupCode = `SETUP_${code}`;
        if (setupItems.some(s => s.code === setupCode)) items.push({ code: setupCode, quantity: 1 });
      }
    }
    return items;
  };

  const handleSubmit = async (values: TenantFormValues) => {
    if (selectedPacks.length === 0) {
      setError(t('Choisissez au moins un pack.'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: ProvisionTenantPayload = {
        name: values.name,
        adminFullName: values.adminFullName,
        adminEmail: values.adminEmail,
        items: buildItems(),
        billingCycle: cycle,
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
    setSelectedPacks([]);
    setLotsBlocks(0);
    setExtraCopros(0);
    setExtraChantiers(0);
    setSetupIncluded(false);
    setCycle('MONTHLY');
    setQuote(null);
    setIntegreQuote(null);
    form.resetFields();
  };

  return (
    <Drawer title={result ? t('Agence créée') : t('Nouvelle agence')} placement="right" width={560} open={open} onClose={onClose}>
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
          initialValues={{ billingCycle: 'MONTHLY' }}
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

          <Divider style={{ margin: 'var(--space-4) 0' }} />

          <Title level={5} style={{ marginBottom: 'var(--space-3)' }}>
            {t('Packs')}
          </Title>

          {catalogError && <Alert type="warning" showIcon message={catalogError} style={{ marginBottom: 'var(--space-3)' }} />}

          <div
            role="group"
            aria-label={t('Packs')}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}
          >
            {packs.map(pack => {
              const checked = selectedPacks.includes(pack.code);
              const disabled =
                catalogLoading || (pack.code !== 'INTEGRE' && selectedPacks.includes('INTEGRE'));
              return (
                <Card
                  key={pack.code}
                  size="small"
                  onClick={() => !disabled && togglePack(pack.code)}
                  role="checkbox"
                  aria-checked={checked}
                  aria-disabled={disabled}
                  tabIndex={disabled ? -1 : 0}
                  onKeyDown={event => {
                    if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      togglePack(pack.code);
                    }
                  }}
                  style={{
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                    borderColor: checked ? 'var(--color-primary)' : 'var(--border-default)',
                    borderWidth: checked ? 2 : 1
                  }}
                  styles={{ body: { padding: 'var(--space-3)' } }}
                >
                  <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div>
                      <Text strong>{pack.name}</Text>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                        {pack.description}
                      </div>
                      <div style={{ marginTop: 'var(--space-1)' }}>
                        <MoneyValue value={pack.monthlyPrice} />
                        <Text type="secondary"> {t('/ mois')}</Text>
                      </div>
                    </div>
                    {checked && <CheckCircleFilled style={{ color: 'var(--color-primary)', fontSize: 18 }} />}
                  </Space>
                </Card>
              );
            })}
          </div>

          {selectedPacks.length > 0 && (
            <>
              <Title level={5} style={{ marginBottom: 'var(--space-3)' }}>
                {t('Extensions')}
              </Title>
              <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
                {extensionAllowed('EXT_LOTS_10') && (
                  <Form.Item label={t('Lots supplémentaires (blocs de 10)')} style={{ marginBottom: 0 }}>
                    <InputNumber
                      min={0}
                      max={100}
                      value={lotsBlocks}
                      onChange={value => setLotsBlocks(Math.max(0, Math.round(Number(value) || 0)))}
                      style={{ width: '100%' }}
                      addonAfter={t('bloc(s) de 10 lots')}
                    />
                    <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                      {t('Réserve totale visée : {{value}} lots (inclus dans les packs compris).', { value: targetLots })}
                    </Text>
                  </Form.Item>
                )}
                {extensionAllowed('EXT_COPRO') && (
                  <Form.Item label={t('Copropriétés supplémentaires')} style={{ marginBottom: 0 }}>
                    <InputNumber
                      min={0}
                      max={50}
                      value={extraCopros}
                      onChange={value => setExtraCopros(Math.max(0, Math.round(Number(value) || 0)))}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                )}
                {extensionAllowed('EXT_CHANTIER') && (
                  <Form.Item label={t('Chantiers supplémentaires')} style={{ marginBottom: 0 }}>
                    <InputNumber
                      min={0}
                      max={50}
                      value={extraChantiers}
                      onChange={value => setExtraChantiers(Math.max(0, Math.round(Number(value) || 0)))}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                )}
              </Space>
            </>
          )}

          <Space direction="vertical" size="middle" style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
            <Form.Item label={t('Cycle de facturation')} style={{ marginBottom: 0 }}>
              <Radio.Group optionType="button" buttonStyle="solid" value={cycle} onChange={e => setCycle(e.target.value)}>
                <Radio.Button value="MONTHLY">{t('Mensuel')}</Radio.Button>
                <Radio.Button value="ANNUAL">{t('Annuel (11 mois facturés)')}</Radio.Button>
              </Radio.Group>
            </Form.Item>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Switch checked={trialEnabled} disabled aria-label={t("Essai gratuit d'un mois")} />
              <Text>{t("Essai gratuit d'un mois inclus (automatique, non désactivable)")}</Text>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Switch checked={setupIncluded} onChange={setSetupIncluded} aria-label={t('Mise en route accompagnée')} />
              <Text>{t('Mise en route accompagnée (facultative, frais uniques)')}</Text>
            </div>
          </Space>

          <Card
            title={t('Récapitulatif')}
            size="small"
            style={{ marginBottom: 'var(--space-4)', borderColor: 'var(--color-accent-border)' }}
            styles={{ header: { borderInlineStartColor: 'var(--color-accent)' } }}
            loading={quoting && !quote}
          >
            {selectedPacks.length === 0 ? (
              <Text type="secondary">{t('Choisissez au moins un pack pour voir le récapitulatif.')}</Text>
            ) : quote ? (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {quote.lines.map((line, index) => (
                  <div key={`${line.code ?? line.kind}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                    <Text style={{ flex: 1 }}>
                      {line.label}
                      {line.quantity > 1 ? ` × ${line.quantity}` : ''}
                    </Text>
                    <MoneyValue value={line.amount} signed />
                  </div>
                ))}
                {setupIncluded && setupTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                    <Text style={{ flex: 1 }}>{t('Mise en route (frais uniques)')}</Text>
                    <MoneyValue value={setupTotal} />
                  </div>
                )}
                <Divider style={{ margin: 'var(--space-2) 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text strong>{t('Total HT mensuel')}</Text>
                  <Text strong>
                    <MoneyValue value={quote.monthly} />
                  </Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{t('Total HT annuel (11 mois)')}</Text>
                  <MoneyValue value={quote.annual} />
                </div>
                {cycle === 'ANNUAL' && (
                  <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                    {t("L'engagement annuel facture 11 mensualités : le 12e mois est offert.")}
                  </Text>
                )}
                {integreCheaper && integreQuote && (
                  <Alert
                    type="info"
                    showIcon
                    message={t("L'Opérateur intégré revient moins cher pour ce volume")}
                    description={t('{{value}} par mois au lieu de {{current}}, tous modules ouverts.', {
                      value: new Intl.NumberFormat('fr-FR').format(integreQuote.monthly) + ' FCFA',
                      current: new Intl.NumberFormat('fr-FR').format(quote.monthly) + ' FCFA'
                    })}
                  />
                )}
              </Space>
            ) : (
              <Text type="secondary">{t('Calcul en cours…')}</Text>
            )}
          </Card>

          <Collapse
            ghost
            style={{ marginBottom: 24 }}
            items={[
              {
                key: 'plus-options',
                label: t("Plus d'options"),
                children: (
                  <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
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
            <Button type="primary" htmlType="submit" loading={loading} disabled={loading || selectedPacks.length === 0}>
              {t("Créer l'agence")}
            </Button>
          </Space>
        </Form>
      )}
    </Drawer>
  );
};
