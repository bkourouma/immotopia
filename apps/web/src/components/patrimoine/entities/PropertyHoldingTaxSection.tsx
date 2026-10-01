import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPropertyHoldings,
  getPropertyTaxEstimate,
  getPropertyTaxProfile,
  setPropertyHoldings,
  setPropertyTaxProfile
} from '../../../services/patrimoine-entities-service';
import type { FiscalCountry, Occupancy, BuiltStatus } from '../../../types/patrimoine-entities-types';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { StateBlock, SkeletonDetail, MoneyValue } from '../../primitives';
import { fiscalCountryOptions, occupancyOptions, builtStatusOptions } from './tax-labels';
import { TaxEstimateCard } from './TaxEstimateCard';
import { TaxDisclaimer } from './TaxDisclaimer';
import { t } from '../../../i18n/t';
import { apiErrorMessage } from '../patrimoine-labels';

const { Title, Text } = Typography;

/**
 * `<PropertyHoldingTaxSection>` — détenteurs et fiscalité d'un bien, affichée
 * sous `<PropertyPatrimoineTab>` dans l'onglet Patrimoine de la fiche.
 */

export interface PropertyHoldingTaxSectionProps {
  tenantId: string;
  propertyId: string;
}

interface HoldingRow {
  entityId: string;
  sharePercent: number;
}

const CURRENT_YEAR = new Date().getFullYear();

export const PropertyHoldingTaxSection: React.FC<PropertyHoldingTaxSectionProps> = ({ tenantId, propertyId }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [rows, setRows] = useState<HoldingRow[]>([]);
  const [holdingsError, setHoldingsError] = useState<string | null>(null);
  const [savingHoldings, setSavingHoldings] = useState(false);
  const [profileForm] = Form.useForm();
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const holdingsQuery = useQuery({
    queryKey: queryKey('property-holdings', tenantId, { propertyId }),
    queryFn: () => getPropertyHoldings(tenantId, propertyId),
    staleTime: STALE_TIME.list
  });

  const profileQuery = useQuery({
    queryKey: queryKey('property-tax-profile', tenantId, { propertyId }),
    queryFn: () => getPropertyTaxProfile(tenantId, propertyId),
    staleTime: STALE_TIME.list
  });

  const estimateQuery = useQuery({
    queryKey: queryKey('property-tax-estimate', tenantId, { propertyId, year }),
    queryFn: () => getPropertyTaxEstimate(tenantId, propertyId, { year }),
    staleTime: STALE_TIME.list
  });

  useEffect(() => {
    if (!holdingsQuery.data) return;
    setRows(
      holdingsQuery.data.holdings.map(holding => ({ entityId: holding.entityId, sharePercent: holding.sharePercent }))
    );
  }, [holdingsQuery.data]);

  useEffect(() => {
    if (!profileQuery.data) return;
    const profile = profileQuery.data.profile;
    profileForm.setFieldsValue({
      country: profile?.country ?? undefined,
      builtStatus: profile?.builtStatus ?? undefined,
      occupancy: profile?.occupancy ?? undefined,
      declaredRentalValue: profile?.declaredRentalValue ?? undefined,
      exemptUntilYear: profile?.exemptUntilYear ?? undefined,
      exemptionReason: profile?.exemptionReason ?? undefined,
      notes: profile?.notes ?? undefined
    });
  }, [profileQuery.data, profileForm]);

  const shareTotal = useMemo(() => rows.reduce((sum, row) => sum + (row.sharePercent || 0), 0), [rows]);
  const shareExceeded = shareTotal > 100.0001;

  const entityOptions = (holdingsQuery.data?.entities ?? []).map(entity => ({
    value: entity.id,
    label: entity.name
  }));

  const addRow = () => setRows(prev => [...prev, { entityId: '', sharePercent: 0 }]);
  const removeRow = (index: number) => setRows(prev => prev.filter((_, i) => i !== index));
  const updateRow = (index: number, patch: Partial<HoldingRow>) =>
    setRows(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const saveHoldings = async () => {
    setHoldingsError(null);
    if (shareExceeded) {
      setHoldingsError(t('La somme des quotes-parts dépasse 100 % (actuellement {{total}} %).', { total: shareTotal }));
      return;
    }
    const validRows = rows.filter(row => row.entityId);
    setSavingHoldings(true);
    try {
      await setPropertyHoldings(tenantId, propertyId, {
        holdings: validRows.map(row => ({ entityId: row.entityId, sharePercent: row.sharePercent }))
      });
      await queryClient.invalidateQueries({ queryKey: queryKey('property-holdings', tenantId, { propertyId }) });
      await queryClient.invalidateQueries({
        queryKey: queryKey('property-tax-estimate', tenantId, { propertyId, year })
      });
      message.success(t('Détenteurs mis à jour.'));
    } catch (error) {
      setHoldingsError(apiErrorMessage(error, t("Impossible d'enregistrer les détenteurs.")));
    } finally {
      setSavingHoldings(false);
    }
  };

  const saveProfile = async () => {
    setProfileError(null);
    try {
      const values = await profileForm.validateFields();
      setSavingProfile(true);
      await setPropertyTaxProfile(tenantId, propertyId, {
        country: (values.country as FiscalCountry) ?? null,
        builtStatus: (values.builtStatus as BuiltStatus) ?? null,
        occupancy: (values.occupancy as Occupancy) ?? null,
        declaredRentalValue: values.declaredRentalValue ?? null,
        exemptUntilYear: values.exemptUntilYear ?? null,
        exemptionReason: values.exemptionReason?.trim() || null,
        notes: values.notes?.trim() || null
      });
      await queryClient.invalidateQueries({ queryKey: queryKey('property-tax-profile', tenantId, { propertyId }) });
      await queryClient.invalidateQueries({
        queryKey: queryKey('property-tax-estimate', tenantId, { propertyId, year })
      });
      message.success(t('Profil fiscal mis à jour.'));
    } catch (error) {
      if ((error as { errorFields?: unknown }).errorFields) return;
      setProfileError(apiErrorMessage(error, t("Impossible d'enregistrer le profil fiscal.")));
    } finally {
      setSavingProfile(false);
    }
  };

  if (holdingsQuery.isPending || profileQuery.isPending) {
    return <SkeletonDetail aria-label={t('Fiscalité en cours de chargement')} />;
  }

  if (holdingsQuery.error || profileQuery.error) {
    return (
      <StateBlock
        variant="error"
        description={t('Impossible de charger la fiscalité de ce bien.')}
        actions={[
          {
            label: t('Réessayer'),
            primary: true,
            onClick: () => {
              holdingsQuery.refetch();
              profileQuery.refetch();
            }
          }
        ]}
      />
    );
  }

  const derived = profileQuery.data?.derived;

  return (
    <div style={{ marginTop: 'var(--space-6)' }}>
      <Title level={3} style={{ fontSize: 'var(--font-size-h3)' }}>
        {t('Détenteurs et fiscalité')}
      </Title>

      <Card title={t('Détenteurs et quotes-parts')} style={{ marginBottom: 'var(--space-4)' }}>
        {holdingsError && (
          <div role="alert" style={{ color: 'var(--color-error-text)', marginBottom: 'var(--space-3)' }}>
            {holdingsError}
          </div>
        )}
        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          {rows.map((row, index) => (
            <Row gutter={[8, 8]} key={index} align="middle">
              <Col xs={24} sm={{ flex: 'auto' }}>
                <Select
                  style={{ width: '100%' }}
                  placeholder={t('Entité')}
                  value={row.entityId || undefined}
                  options={entityOptions}
                  onChange={value => updateRow(index, { entityId: value })}
                  aria-label={t('Entité détentrice')}
                />
              </Col>
              <Col>
                <InputNumber
                  min={0}
                  max={100}
                  step={1}
                  value={row.sharePercent}
                  onChange={value => updateRow(index, { sharePercent: Number(value) || 0 })}
                  addonAfter="%"
                  aria-label={t('Quote-part')}
                />
              </Col>
              <Col>
                <Button danger onClick={() => removeRow(index)} aria-label={t('Retirer cette ligne')}>
                  {t('Retirer')}
                </Button>
              </Col>
            </Row>
          ))}
          <Space wrap>
            <Button onClick={addRow}>{t('Ajouter un détenteur')}</Button>
            <Button type="primary" loading={savingHoldings} onClick={saveHoldings}>
              {t('Enregistrer les détenteurs')}
            </Button>
          </Space>
          <Text type="secondary">
            {t('Total des quotes-parts : {{total}} %', { total: shareTotal })}
            {shareExceeded && <Text type="danger"> — {t('la somme dépasse 100 %.')}</Text>}
          </Text>
        </Space>
      </Card>

      <Card title={t('Profil fiscal')} style={{ marginBottom: 'var(--space-4)' }}>
        {profileError && (
          <div role="alert" style={{ color: 'var(--color-error-text)', marginBottom: 'var(--space-3)' }}>
            {profileError}
          </div>
        )}
        <Form form={profileForm} layout="vertical" requiredMark={false}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="country" label={t('Pays')}>
                <Select allowClear options={fiscalCountryOptions()} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="builtStatus" label={t('Bâti / non bâti')}>
                <Select allowClear options={builtStatusOptions()} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="occupancy" label={t('Occupation')}>
                <Select allowClear options={occupancyOptions()} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="declaredRentalValue" label={t('Valeur locative saisie')}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="exemptUntilYear" label={t("Exonéré jusqu'à l'année")}>
                <InputNumber style={{ width: '100%' }} min={2000} max={2100} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="exemptionReason" label={t('Motif')}>
                <Input maxLength={300} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label={t('Notes')}>
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
          <Button type="primary" loading={savingProfile} onClick={saveProfile}>
            {t('Enregistrer le profil fiscal')}
          </Button>
        </Form>

        {derived && (
          <Space orientation="vertical" size={4} style={{ marginTop: 'var(--space-4)' }}>
            <Text type="secondary">{t('Valeurs déduites, utilisées si le profil ne les précise pas :')}</Text>
            <Text>
              {t('Bâti/non bâti déduit')} : {builtStatusOptions().find(o => o.value === derived.builtStatus)?.label}
            </Text>
            <Text>
              {t('Occupation déduite')} : {occupancyOptions().find(o => o.value === derived.occupancy)?.label}
            </Text>
            <Text>
              {t('Loyer annuel')} : <MoneyValue value={derived.annualRent} />
            </Text>
            <Text>
              {t('Valeur marchande')} :{' '}
              {derived.marketValue === null ? '—' : <MoneyValue value={derived.marketValue} />}
            </Text>
          </Space>
        )}
      </Card>

      <Card
        title={t('Estimation fiscale')}
        extra={
          <Select
            value={year}
            style={{ width: 120 }}
            onChange={value => setYear(value)}
            options={Array.from({ length: 6 }, (_, i) => CURRENT_YEAR + 2 - i).map(y => ({ value: y, label: y }))}
            aria-label={t('Année fiscale')}
          />
        }
      >
        <TaxDisclaimer />
        {estimateQuery.isPending ? (
          <SkeletonDetail aria-label={t('Estimation en cours de chargement')} />
        ) : estimateQuery.error ? (
          <StateBlock
            variant="error"
            description={t("Impossible de charger l'estimation fiscale.")}
            actions={[{ label: t('Réessayer'), primary: true, onClick: () => estimateQuery.refetch() }]}
          />
        ) : estimateQuery.data ? (
          <div>
            {estimateQuery.data.holders.map(holder => (
              <div key={`${holder.entityId ?? 'unassigned'}`} style={{ marginBottom: 'var(--space-4)' }}>
                <Title level={5}>
                  {holder.entityName ?? t('Part non rattachée')} — {holder.sharePercent} %
                </Title>
                <TaxEstimateCard computations={holder.taxes} fiscalYear={estimateQuery.data.fiscalYear} />
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
};
