import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Spin } from 'antd';
import { t } from '../../i18n/t';
import { copilotService } from '../../services/copilot-service';
import type { CopilotToolName, RentalAlertRule } from '../../types/copilot';
import { rentalAlertDescription, rentalAlertLabels } from './rental-alert-labels';

const kinds = {
  lease_expiry: 'prepare_lease_expiry_alert',
  declaration_pending: 'prepare_declaration_alert',
  overdue_rent: 'prepare_rent_arrears_alert'
} satisfies Record<RentalAlertRule['kind'], CopilotToolName>;
type Kind = keyof typeof kinds;

function RentalAlertForm({
  tenantId,
  available,
  params,
  onClose,
  onSaved
}: {
  tenantId: string;
  available: Kind[];
  params?: URLSearchParams;
  onClose(): void;
  onSaved(): void;
}) {
  const proposedKind = params?.get('regle') as Kind;
  const [kind, setKind] = useState<Kind>(() => (available.includes(proposedKind) ? proposedKind : available[0]));
  const [days, setDays] = useState<number | null>(() => Number(params?.get('jours')) || null);
  const [minimumAmount, setMinimumAmount] = useState<number | null>(() => Number(params?.get('minimum')) || null);
  const [currency, setCurrency] = useState(params?.get('devise') ?? 'XOF');
  const [propertyId, setPropertyId] = useState(params?.get('bien') ?? undefined);
  const [search, setSearch] = useState('');
  const [properties, setProperties] = useState<Array<{ id: string; title: string; internalReference: string | null }>>(
    []
  );
  const [loadingProperty, setLoadingProperty] = useState(true);
  const [propertyError, setPropertyError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const confirmation = useRef<{ payload: string; id: string }>();
  const target = propertyId && !search ? propertyId : undefined;
  useEffect(() => {
    const controller = new AbortController();
    setPropertyError(false);
    setLoadingProperty(true);
    const timer = setTimeout(() => {
      void copilotService
        .rentalAlertProperties(tenantId, target ? { id: target } : { q: search.trim() }, controller.signal)
        .then(items => {
          if (!controller.signal.aborted) setProperties(items);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setProperties([]);
            setPropertyError(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingProperty(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tenantId, target, search]);
  const normalized = currency.trim().toUpperCase();
  const validDays = days !== null && Number.isInteger(days) && days >= 1 && days <= 3660;
  const validAmount = minimumAmount !== null && minimumAmount > 0 && minimumAmount <= 999999999999;
  const validRule = validDays && (kind !== 'overdue_rent' || (validAmount && /^[A-Z]{3}$/.test(normalized)));
  const selectedPropertyValid =
    !propertyId || (!loadingProperty && !propertyError && properties.some(item => item.id === propertyId));
  async function save() {
    if (busy || !validRule || days === null || !selectedPropertyValid) return;
    const common = { days, propertyId };
    const rule: RentalAlertRule =
      kind === 'overdue_rent'
        ? { ...common, kind, minimumAmount: minimumAmount!, currency: normalized }
        : { ...common, kind };
    const payload = JSON.stringify(rule);
    if (confirmation.current?.payload !== payload) confirmation.current = { payload, id: crypto.randomUUID() };
    setBusy(true);
    setError(false);
    try {
      await copilotService.saveRentalAlert(tenantId, confirmation.current.id, rule);
      onSaved();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const labels = rentalAlertLabels();
  const daysLabel = {
    lease_expiry: t('Jours avant la fin du bail'),
    declaration_pending: t('Jours ouvrés en attente'),
    overdue_rent: t('Jours de retard')
  }[kind];
  return (
    <Modal
      open
      title={t('Nouvelle alerte locative')}
      okText={t('Enregistrer')}
      cancelText={t('Annuler')}
      onOk={() => void save()}
      onCancel={() => {
        if (!busy) onClose();
      }}
      confirmLoading={busy}
      okButtonProps={{ disabled: !validRule || !selectedPropertyValid }}
    >
      {error && <Alert type="error" message={t('Impossible d’enregistrer cette alerte.')} />}
      <Form component={false} layout="vertical" disabled={busy}>
        <Form.Item label={t('Règle')}>
          <Select
            aria-label={t('Règle')}
            value={kind}
            onChange={setKind}
            options={available.map(value => ({ value, label: labels[value] }))}
          />
        </Form.Item>
        <Form.Item label={t('Bien')} extra={t('Sans bien sélectionné, la règle couvre toute l’agence.')}>
          <Select
            aria-label={t('Bien')}
            allowClear
            showSearch
            filterOption={false}
            loading={loadingProperty}
            placeholder={t('Toute l’agence')}
            value={propertyId}
            onSearch={setSearch}
            onChange={value => {
              setPropertyId(value);
              setSearch('');
            }}
            options={properties.map(property => ({
              value: property.id,
              label: [property.internalReference, property.title].filter(Boolean).join(' — ')
            }))}
          />
          {propertyError && <Alert type="error" message={t('Impossible de charger les biens.')} />}
        </Form.Item>
        <Form.Item label={daysLabel} required>
          <InputNumber aria-label={daysLabel} value={days} min={1} max={3660} precision={0} onChange={setDays} />
        </Form.Item>
        {kind === 'overdue_rent' && (
          <>
            <Form.Item label={t('Solde minimal')} required>
              <InputNumber aria-label={t('Solde minimal')} value={minimumAmount} min={0} onChange={setMinimumAmount} />
            </Form.Item>
            <Form.Item label={t('Devise')} required>
              <Input
                aria-label={t('Devise')}
                value={currency}
                maxLength={3}
                onChange={event => setCurrency(event.target.value)}
              />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}

export function RentalAlerts({
  tenantId,
  tools,
  params,
  onClose,
  onDraftClosed
}: {
  tenantId: string;
  tools: CopilotToolName[];
  params: URLSearchParams;
  onClose(): void;
  onDraftClosed(): void;
}) {
  const available = (Object.keys(kinds) as Kind[]).filter(kind => tools.includes(kinds[kind]));
  const hasDraft = available.includes(params.get('regle') as Kind);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Awaited<ReturnType<typeof copilotService.listRentalAlerts>>['items']>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const labels = rentalAlertLabels();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void copilotService
      .listRentalAlerts(tenantId, cursor, controller.signal)
      .then(page => {
        if (controller.signal.aborted) return;
        setItems(previous => (cursor ? [...previous, ...page.items] : page.items));
        setNext(page.nextCursor);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t('Impossible de charger les alertes locatives.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tenantId, cursor, revision]);
  function refresh() {
    setCursor(undefined);
    setRevision(value => value + 1);
  }
  function closeDraft() {
    setOpen(false);
    if (hasDraft) onDraftClosed();
  }
  async function remove(id: string) {
    try {
      await copilotService.deleteRentalAlert(tenantId, id);
      refresh();
    } catch {
      setError(t('Impossible de supprimer cette alerte.'));
    }
  }
  return (
    <>
      <Drawer
        open
        title={t('Alertes locatives')}
        onClose={onClose}
        size="min(780px, 100vw)"
        extra={
          !!available.length && (
            <Button type="primary" onClick={() => setOpen(true)}>
              {t('Nouvelle alerte locative')}
            </Button>
          )
        }
      >
        <div style={{ display: 'grid', gap: 12 }} aria-busy={loading}>
          {error && <Alert type="error" message={error} action={<Button onClick={refresh}>{t('Réessayer')}</Button>} />}
          {loading && <Spin />}
          {!loading && !error && !items.length && <Empty description={t('Aucune alerte locative.')} />}
          {items.map(({ id, rule, property }) => (
            <Card key={id} title={rule ? labels[rule.kind] : t('Alerte indisponible')}>
              {rule && <p>{rentalAlertDescription(rule)}</p>}
              {rule && (
                <p>
                  {property
                    ? [property.internalReference, property.title].filter(Boolean).join(' — ')
                    : t('Toute l’agence')}
                </p>
              )}
              <Popconfirm
                title={t('Supprimer cette alerte ?')}
                onConfirm={() => remove(id)}
                okText={t('Supprimer')}
                cancelText={t('Annuler')}
              >
                <Button danger>{t('Supprimer')}</Button>
              </Popconfirm>
            </Card>
          ))}
          {next && (
            <Button disabled={loading} onClick={() => setCursor(next)}>
              {t('Afficher plus')}
            </Button>
          )}
        </div>
      </Drawer>
      {(open || hasDraft) && !!available.length && (
        <RentalAlertForm
          key={hasDraft ? params.toString() : ''}
          tenantId={tenantId}
          available={available}
          params={hasDraft ? params : undefined}
          onClose={closeDraft}
          onSaved={() => {
            closeDraft();
            refresh();
          }}
        />
      )}
    </>
  );
}
