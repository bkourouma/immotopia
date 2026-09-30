import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Button, Card, Input, InputNumber, Modal, Select, Space, Switch, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, LockOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  closeCashSession,
  getCashSession,
  getCurrentCashSession,
  listCashSessions,
  openCashSession,
  validateCashSession
} from '../../services/cash-sessions-service';
import type {
  CashSession,
  CashSessionStatus,
  DenominationValue,
  ExpectedLine
} from '../../services/cash-sessions-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  StatCard,
  DataView,
  DataCard,
  StatusTag
} from '../../components/primitives';
import type { StatusTone } from '../../components/primitives';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';
import { montantSaisiProps } from '../../utils/montant-saisi';
import { TreasuryAccountSelector } from '../../components/finance/TreasuryAccountSelector';

const { Title, Text } = Typography;
const { TextArea } = Input;

/**
 * Caisse d'agence — Lot 6 (scratchpad `lot6-contrat-api.md`).
 *
 * Deux onglets : « Ma caisse », où le caissier ouvre sa session, suit son
 * attendu en direct et la clôture par billetage ; « Historique », où un
 * responsable (autre que le caissier) consulte et valide les sessions
 * clôturées. C'est la même séparation de rôles que `PieceDeCaisse.tsx` — celui
 * qui émet n'est pas celui qui valide — appliquée ici à la caisse plutôt qu'à
 * une pièce isolée.
 *
 * **Écrans tactiles.** Les caissiers d'Abidjan travaillent souvent sur
 * téléphone ou tablette : les compteurs de billetage sont de grands
 * `<InputNumber>` (`size="large"`), et le geste de clôture passe par une seule
 * modale plutôt qu'un enchaînement d'écrans.
 *
 * **Écrit contre le contrat, l'API n'existant pas encore.** `services/
 * cash-sessions-service.ts` porte les types gelés ; les tests
 * (`__tests__/finance/caisse.test.tsx`) mockent ce service.
 */

type Onglet = 'ma-caisse' | 'historique';

/** Billets puis pièces, dans l'ordre décroissant du billetage (contrat lot 6). */
const BILLETS: DenominationValue[] = ['10000', '5000', '2000', '1000', '500'];
const PIECES: DenominationValue[] = ['250', '200', '100', '50', '25', '10', '5'];
const TOUTES_DENOMINATIONS: DenominationValue[] = [...BILLETS, ...PIECES];

const STATUS_LABEL: Record<CashSessionStatus, string> = {
  OPEN: t('Ouverte'),
  CLOSED: t('À valider'),
  VALIDATED: t('Validée')
};

const STATUS_TONE: Record<CashSessionStatus, StatusTone> = {
  OPEN: 'info',
  CLOSED: 'warning',
  VALIDATED: 'success'
};

const KIND_LABEL: Record<ExpectedLine['kind'], string> = {
  RENT_PAYMENT: t('Loyer encaissé'),
  OWNER_PAYOUT: t('Reversement propriétaire'),
  CASH_VOUCHER: t('Pièce de caisse')
};

function dateHeure(iso: string): string {
  return dayjs(iso).format(dateFormat('dateTime'));
}

/** Vert si l'écart est nul, rouge s'il manque de l'argent, orange en cas d'excédent. */
function couleurEcart(ecart: number): string {
  if (ecart === 0) return 'var(--color-success-text)';
  return ecart < 0 ? 'var(--color-error-text)' : 'var(--color-warning-text)';
}

/** Total du billetage : Σ(valeur × nombre), sur toutes les dénominations connues. */
function totalBilletage(compteurs: Partial<Record<DenominationValue, number>>): number {
  return TOUTES_DENOMINATIONS.reduce((somme, valeur) => somme + Number(valeur) * (compteurs[valeur] ?? 0), 0);
}

export const Caisse: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();

  const [onglet, setOnglet] = useState<Onglet>('ma-caisse');

  // --- Ouverture -----------------------------------------------------------
  const [fondDeCaisse, setFondDeCaisse] = useState<number | null>(null);
  const [noteOuverture, setNoteOuverture] = useState('');
  const [caisseChoisie, setCaisseChoisie] = useState<string | null>(null);
  const [ouvertureEnCours, setOuvertureEnCours] = useState(false);

  // --- Clôture ---------------------------------------------------------------
  const [clotureOuverte, setClotureOuverte] = useState(false);
  const [sansBilletage, setSansBilletage] = useState(false);
  const [compteurs, setCompteurs] = useState<Partial<Record<DenominationValue, number>>>({});
  const [montantSaisi, setMontantSaisi] = useState<number | null>(null);
  const [motifEcart, setMotifEcart] = useState('');
  const [clotureEnCours, setClotureEnCours] = useState(false);

  // --- Historique --------------------------------------------------------
  const [filtreStatut, setFiltreStatut] = useState<CashSessionStatus | undefined>(undefined);
  const [sessionOuverteId, setSessionOuverteId] = useState<string | null>(null);
  const [commentaireValidation, setCommentaireValidation] = useState('');
  const [validationEnCours, setValidationEnCours] = useState(false);

  const sessionCouranteQuery = useQuery({
    queryKey: queryKey('cash-session-current', tenantId, {}),
    queryFn: () => getCurrentCashSession(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const historiqueQuery = useQuery({
    queryKey: queryKey('cash-sessions', tenantId, { status: filtreStatut }),
    queryFn: () => listCashSessions(tenantId as string, { status: filtreStatut }),
    enabled: Boolean(tenantId) && onglet === 'historique',
    staleTime: STALE_TIME.list
  });

  const detailQuery = useQuery({
    queryKey: queryKey('cash-session-detail', tenantId, { id: sessionOuverteId }),
    queryFn: () => getCashSession(tenantId as string, sessionOuverteId as string),
    enabled: Boolean(tenantId) && Boolean(sessionOuverteId)
  });

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const session = sessionCouranteQuery.data ?? null;

  const reinitialiserCloture = () => {
    setSansBilletage(false);
    setCompteurs({});
    setMontantSaisi(null);
    setMotifEcart('');
  };

  const ouvrirLaCaisse = async () => {
    if (fondDeCaisse === null || fondDeCaisse < 0) {
      message.error(t('Indiquez le fond de caisse.'));
      return;
    }
    setOuvertureEnCours(true);
    try {
      await openCashSession(tenantId, {
        openingFloat: fondDeCaisse,
        openingNote: noteOuverture.trim() || undefined,
        treasuryAccountId: caisseChoisie || undefined
      });
      setFondDeCaisse(null);
      setNoteOuverture('');
      setCaisseChoisie(null);
      message.success(t('Caisse ouverte.'));
      queryClient.invalidateQueries({ queryKey: queryKey('cash-session-current', tenantId, {}) });
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'ouverture de la caisse a échoué."));
    } finally {
      setOuvertureEnCours(false);
    }
  };

  const totalCompte = sansBilletage ? (montantSaisi ?? 0) : totalBilletage(compteurs);
  const attendu = session?.expected.amount ?? 0;
  const ecart = totalCompte - attendu;
  const motifRequis = ecart !== 0;
  const clotureImpossible = motifRequis && motifEcart.trim().length < 3;

  const clore = async () => {
    if (!session || clotureImpossible) return;
    setClotureEnCours(true);
    try {
      const payload = sansBilletage
        ? { countedAmount: montantSaisi ?? 0, differenceReason: motifRequis ? motifEcart.trim() : undefined }
        : { denominations: compteurs, differenceReason: motifRequis ? motifEcart.trim() : undefined };
      await closeCashSession(tenantId, session.id, payload);
      message.success(t('Caisse {{number}} clôturée.', { number: session.number }));
      setClotureOuverte(false);
      reinitialiserCloture();
      queryClient.invalidateQueries({ queryKey: queryKey('cash-session-current', tenantId, {}) });
      queryClient.invalidateQueries({ queryKey: queryKey('cash-sessions', tenantId, {}) });
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La clôture a échoué.'));
    } finally {
      setClotureEnCours(false);
    }
  };

  const valider = async () => {
    if (!sessionOuverteId) return;
    setValidationEnCours(true);
    try {
      const validee = await validateCashSession(tenantId, sessionOuverteId, {
        comment: commentaireValidation.trim() || undefined
      });
      message.success(t('Caisse {{number}} validée.', { number: validee.number }));
      setCommentaireValidation('');
      setSessionOuverteId(null);
      queryClient.invalidateQueries({ queryKey: queryKey('cash-sessions', tenantId, {}) });
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La validation a échoué.'));
    } finally {
      setValidationEnCours(false);
    }
  };

  // --- Onglet « Ma caisse » ------------------------------------------------

  const colonnesOperations: ColumnsType<ExpectedLine> = [
    { title: t('Date et heure'), key: 'at', width: 180, render: (_, l) => dateHeure(l.at) },
    { title: t('Libellé'), key: 'label', render: (_, l) => l.label },
    {
      title: t('Montant'),
      key: 'amount',
      align: 'end',
      render: (_, l) => <MoneyValue value={l.amount} signed />
    }
  ];

  const formulaireOuverture = (
    <Card>
      <Title level={4} style={{ marginTop: 0 }}>
        {t('Ouvrir ma caisse')}
      </Title>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <label htmlFor="caisse-compte">{t('Caisse')}</label>
          <TreasuryAccountSelector
            id="caisse-compte"
            tenantId={tenantId}
            paymentMethod="CASH"
            value={caisseChoisie}
            onChange={setCaisseChoisie}
          />
        </div>
        <div>
          <label htmlFor="caisse-fond">{t('Fond de caisse (FCFA)')}</label>
          <InputNumber
            id="caisse-fond"
            size="large"
            style={{ width: '100%' }}
            min={0}
            step={1000}
            value={fondDeCaisse ?? undefined}
            onChange={valeur => setFondDeCaisse(typeof valeur === 'number' ? valeur : null)}
            {...montantSaisiProps}
          />
        </div>
        <div>
          <label htmlFor="caisse-note-ouverture">{t('Note (facultatif)')}</label>
          <TextArea
            id="caisse-note-ouverture"
            rows={2}
            value={noteOuverture}
            onChange={event => setNoteOuverture(event.target.value)}
          />
        </div>
        <Button type="primary" size="large" loading={ouvertureEnCours} onClick={ouvrirLaCaisse}>
          {t('Ouvrir la caisse')}
        </Button>
      </Space>
    </Card>
  );

  const vueSessionOuverte = session && (
    <>
      <Card style={{ marginBottom: 'var(--space-4)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-4)'
          }}
        >
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {t('Caisse {{number}}', { number: session.number })}
            </Title>
            <Text type="secondary">{t('Ouverte le {{heure}}', { heure: dateHeure(session.openedAt) })}</Text>
            {session.treasuryLabel && (
              <Text type="secondary" style={{ display: 'block' }}>
                {session.treasuryLabel}
              </Text>
            )}
          </div>
          <Button
            icon={<ReloadOutlined />}
            loading={sessionCouranteQuery.isFetching}
            onClick={() => sessionCouranteQuery.refetch()}
          >
            {t('Actualiser')}
          </Button>
        </div>

        <Space size="middle" wrap style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
          <StatCard label={t('Fond de caisse')} value={<MoneyValue value={session.openingFloat} />} />
          <StatCard
            label={t('Encaissements')}
            value={<MoneyValue value={session.expected.receipts} />}
            tone="positive"
          />
          <StatCard
            label={t('Décaissements')}
            value={<MoneyValue value={session.expected.disbursements} />}
            tone="danger"
          />
        </Space>

        <div
          style={{
            padding: 'var(--space-4)',
            background: 'var(--surface-sunken)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)'
          }}
        >
          <Text type="secondary">{t('Montant attendu')}</Text>
          <Title level={2} style={{ margin: 0 }}>
            <MoneyValue value={session.expected.amount} />
          </Title>
        </div>

        {session.expected.lines.length > 0 ? (
          <Table<ExpectedLine>
            dataSource={session.expected.lines}
            columns={colonnesOperations}
            rowKey={(l, index) => `${l.kind}-${index}-${l.at}`}
            pagination={false}
            size="small"
            aria-label={t('Opérations de la caisse')}
          />
        ) : (
          <Text type="secondary">{t('Aucune opération pour le moment.')}</Text>
        )}

        <Button
          type="primary"
          danger
          icon={<LockOutlined />}
          size="large"
          style={{ marginTop: 'var(--space-4)' }}
          onClick={() => setClotureOuverte(true)}
        >
          {t('Clôturer la caisse')}
        </Button>
      </Card>
    </>
  );

  const ongletMaCaisse = sessionCouranteQuery.error ? (
    <StateBlock
      variant="error"
      description={t('Impossible de charger votre caisse.')}
      actions={[{ label: t('Réessayer'), onClick: () => sessionCouranteQuery.refetch(), primary: true }]}
    />
  ) : sessionCouranteQuery.isPending ? (
    <StateBlock variant="loading" />
  ) : session ? (
    vueSessionOuverte
  ) : (
    formulaireOuverture
  );

  // --- Onglet « Historique » -----------------------------------------------

  const colonnesHistorique: ColumnsType<CashSession> = [
    { title: t('Numéro'), key: 'number', render: (_, s) => s.number },
    { title: t('Caisse'), key: 'treasury', render: (_, s) => s.treasuryLabel || '—' },
    { title: t('Caissier'), key: 'cashier', render: (_, s) => s.cashierName },
    { title: t('Ouverture'), key: 'openedAt', render: (_, s) => dateHeure(s.openedAt) },
    { title: t('Clôture'), key: 'closedAt', render: (_, s) => (s.closedAt ? dateHeure(s.closedAt) : '—') },
    { title: t('Attendu'), key: 'expected', align: 'end', render: (_, s) => <MoneyValue value={s.expected.amount} /> },
    { title: t('Compté'), key: 'counted', align: 'end', render: (_, s) => <MoneyValue value={s.countedAmount} /> },
    {
      title: t('Écart'),
      key: 'difference',
      align: 'end',
      render: (_, s) =>
        s.difference === null ? (
          '—'
        ) : (
          <Text style={{ color: couleurEcart(s.difference) }}>
            <MoneyValue value={s.difference} signed />
          </Text>
        )
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_, s) => <StatusTag status={s.status} tone={STATUS_TONE[s.status]} label={STATUS_LABEL[s.status]} />
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, s) => (
        <Button type="link" onClick={() => setSessionOuverteId(s.id)}>
          {t('Voir le détail')}
        </Button>
      )
    }
  ];

  const sessions = historiqueQuery.data ?? [];

  const ongletHistorique = (
    <>
      <div style={{ marginBottom: 'var(--space-4)', maxWidth: 260 }}>
        <label htmlFor="caisse-filtre-statut">{t('Statut')}</label>
        <Select<CashSessionStatus | undefined>
          id="caisse-filtre-statut"
          style={{ width: '100%' }}
          allowClear
          placeholder={t('Tous les statuts')}
          value={filtreStatut}
          onChange={valeur => setFiltreStatut(valeur)}
          options={[
            { value: 'OPEN', label: t('Ouverte') },
            { value: 'CLOSED', label: t('À valider') },
            { value: 'VALIDATED', label: t('Validée') }
          ]}
        />
      </div>

      <DataView<CashSession>
        items={sessions}
        total={sessions.length}
        page={1}
        pageSize={sessions.length || 1}
        paginated={false}
        onPageChange={() => undefined}
        loading={historiqueQuery.isPending}
        error={historiqueQuery.error ? t('Impossible de charger les sessions de caisse.') : null}
        onRetry={() => historiqueQuery.refetch()}
        emptyDescription={t('Aucune session de caisse.')}
        rowKey={s => s.id}
        aria-label={t('Historique des caisses')}
        columns={colonnesHistorique}
        renderCard={s => (
          <DataCard
            title={s.number}
            aria-label={s.number}
            subtitle={s.cashierName}
            status={<StatusTag status={s.status} tone={STATUS_TONE[s.status]} label={STATUS_LABEL[s.status]} />}
            highlight={<MoneyValue value={s.expected.amount} />}
            onOpen={() => setSessionOuverteId(s.id)}
            fields={[
              { label: t('Caisse'), value: s.treasuryLabel || '—' },
              { label: t('Ouverture'), value: dateHeure(s.openedAt) },
              { label: t('Compté'), value: <MoneyValue value={s.countedAmount} /> }
            ]}
          />
        )}
      />
    </>
  );

  return (
    <>
      <PageHeader
        title={t('Caisse')}
        breadcrumbs={[{ label: t('Finance'), to: `/tenant/${tenantId}/finance/comptabilite` }, { label: t('Caisse') }]}
      />

      <div role="tablist" style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <Button
          role="tab"
          aria-selected={onglet === 'ma-caisse'}
          type={onglet === 'ma-caisse' ? 'primary' : 'default'}
          onClick={() => setOnglet('ma-caisse')}
        >
          {t('Ma caisse')}
        </Button>
        <Button
          role="tab"
          aria-selected={onglet === 'historique'}
          type={onglet === 'historique' ? 'primary' : 'default'}
          onClick={() => setOnglet('historique')}
        >
          {t('Historique')}
        </Button>
      </div>

      {onglet === 'ma-caisse' ? ongletMaCaisse : ongletHistorique}

      <Modal
        title={t('Clôturer la caisse')}
        open={clotureOuverte}
        onCancel={() => setClotureOuverte(false)}
        footer={null}
        destroyOnHidden
        width={640}
      >
        {session && (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>{t('Saisir le total sans billetage')}</Text>
              <Switch
                checked={sansBilletage}
                onChange={valeur => {
                  setSansBilletage(valeur);
                  setCompteurs({});
                  setMontantSaisi(null);
                }}
              />
            </div>

            {sansBilletage ? (
              <div>
                <label htmlFor="caisse-montant-compte">{t('Montant compté')}</label>
                <InputNumber
                  id="caisse-montant-compte"
                  size="large"
                  style={{ width: '100%' }}
                  min={0}
                  value={montantSaisi ?? undefined}
                  onChange={valeur => setMontantSaisi(typeof valeur === 'number' ? valeur : null)}
                  {...montantSaisiProps}
                />
              </div>
            ) : (
              <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                {[...BILLETS, ...PIECES].map(valeur => (
                  <div
                    key={valeur}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      justifyContent: 'space-between'
                    }}
                  >
                    <label htmlFor={`caisse-billet-${valeur}`} style={{ minWidth: 90 }}>
                      <MoneyValue value={Number(valeur)} />
                    </label>
                    <InputNumber
                      id={`caisse-billet-${valeur}`}
                      size="large"
                      min={0}
                      step={1}
                      style={{ width: 120 }}
                      value={compteurs[valeur] ?? undefined}
                      onChange={n =>
                        setCompteurs(precedent => ({ ...precedent, [valeur]: typeof n === 'number' ? n : undefined }))
                      }
                    />
                    <Text style={{ minWidth: 110, textAlign: 'end' }}>
                      <MoneyValue value={Number(valeur) * (compteurs[valeur] ?? 0)} />
                    </Text>
                  </div>
                ))}
              </Space>
            )}

            <div
              style={{
                padding: 'var(--space-4)',
                background: 'var(--surface-sunken)',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{t('Total compté')}</Text>
                  <Text strong>
                    <MoneyValue value={totalCompte} />
                  </Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{t('Attendu')}</Text>
                  <Text strong>
                    <MoneyValue value={attendu} />
                  </Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text>{t('Écart')}</Text>
                  <Text strong style={{ color: couleurEcart(ecart) }}>
                    {ecart === 0 ? (
                      t('Aucun écart')
                    ) : ecart < 0 ? (
                      <>
                        {t('Manquant :')} <MoneyValue value={Math.abs(ecart)} />
                      </>
                    ) : (
                      <>
                        {t('Excédent :')} <MoneyValue value={ecart} />
                      </>
                    )}
                  </Text>
                </div>
              </Space>
            </div>

            {motifRequis && (
              <div>
                <label htmlFor="caisse-motif-ecart">{t("Motif de l'écart")}</label>
                <TextArea
                  id="caisse-motif-ecart"
                  rows={2}
                  value={motifEcart}
                  onChange={event => setMotifEcart(event.target.value)}
                  placeholder={t('Expliquez cet écart')}
                />
              </div>
            )}

            <Text type="secondary">
              {t(
                "Une fois clôturée, la caisse attend la validation d'un responsable. L'écart sera passé en comptabilité à la validation."
              )}
            </Text>

            <Button
              type="primary"
              danger
              size="large"
              block
              loading={clotureEnCours}
              disabled={clotureImpossible}
              onClick={clore}
            >
              {t('Clôturer')}
            </Button>
          </Space>
        )}
      </Modal>

      <Modal
        title={
          detailQuery.data ? t('Caisse {{number}}', { number: detailQuery.data.number }) : t('Détail de la caisse')
        }
        open={Boolean(sessionOuverteId)}
        onCancel={() => {
          setSessionOuverteId(null);
          setCommentaireValidation('');
        }}
        footer={null}
        destroyOnHidden
        width={640}
      >
        {detailQuery.isPending ? (
          <StateBlock variant="loading" />
        ) : detailQuery.data ? (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Space orientation="vertical" size={4} style={{ width: '100%' }}>
              <Text>
                {t('Caissier :')} <strong>{detailQuery.data.cashierName}</strong>
              </Text>
              {detailQuery.data.treasuryLabel && (
                <Text>
                  {t('Caisse :')} {detailQuery.data.treasuryLabel}
                </Text>
              )}
              <Text>
                {t('Ouverture :')} {dateHeure(detailQuery.data.openedAt)}
              </Text>
              {detailQuery.data.closedAt && (
                <Text>
                  {t('Clôture :')} {dateHeure(detailQuery.data.closedAt)}
                </Text>
              )}
              <Text>
                {t('Fond de caisse :')} <MoneyValue value={detailQuery.data.openingFloat} />
              </Text>
              <Text>
                {t('Attendu :')} <MoneyValue value={detailQuery.data.expected.amount} />
              </Text>
              {detailQuery.data.countedAmount !== null && (
                <Text>
                  {t('Compté :')} <MoneyValue value={detailQuery.data.countedAmount} />
                </Text>
              )}
              {detailQuery.data.difference !== null && (
                <Text>
                  {t('Écart :')} <MoneyValue value={detailQuery.data.difference} signed />
                </Text>
              )}
              {detailQuery.data.differenceReason && (
                <Text>
                  {t('Motif :')} {detailQuery.data.differenceReason}
                </Text>
              )}
              {detailQuery.data.validatedByName && (
                <Text>
                  {t('Validée par {{name}} le {{heure}}', {
                    name: detailQuery.data.validatedByName,
                    heure: detailQuery.data.validatedAt ? dateHeure(detailQuery.data.validatedAt) : ''
                  })}
                </Text>
              )}
              {detailQuery.data.validationComment && (
                <Text>
                  {t('Commentaire de validation :')} {detailQuery.data.validationComment}
                </Text>
              )}
            </Space>

            <Title level={5}>{t('Opérations')}</Title>
            {detailQuery.data.expected.lines.length > 0 ? (
              <Table<ExpectedLine>
                dataSource={detailQuery.data.expected.lines}
                columns={[
                  { title: t('Date et heure'), key: 'at', render: (_, l) => dateHeure(l.at) },
                  { title: t('Type'), key: 'kind', render: (_, l) => KIND_LABEL[l.kind] },
                  { title: t('Libellé'), key: 'label', render: (_, l) => l.label },
                  {
                    title: t('Montant'),
                    key: 'amount',
                    align: 'end',
                    render: (_, l) => <MoneyValue value={l.amount} signed />
                  }
                ]}
                rowKey={(l, index) => `${l.kind}-${index}`}
                pagination={false}
                size="small"
                aria-label={t('Opérations de la caisse')}
              />
            ) : (
              <Text type="secondary">{t('Aucune opération.')}</Text>
            )}

            {detailQuery.data.denominations && (
              <>
                <Title level={5}>{t('Billetage')}</Title>
                <Table<{ valeur: DenominationValue; nombre: number }>
                  dataSource={(() => {
                    const denombrement = detailQuery.data.denominations ?? {};
                    return TOUTES_DENOMINATIONS.filter(v => (denombrement[v] ?? 0) > 0).map(valeur => ({
                      valeur,
                      nombre: denombrement[valeur] ?? 0
                    }));
                  })()}
                  columns={[
                    { title: t('Valeur'), key: 'valeur', render: (_, l) => <MoneyValue value={Number(l.valeur)} /> },
                    { title: t('Nombre'), key: 'nombre', align: 'end', render: (_, l) => l.nombre },
                    {
                      title: t('Sous-total'),
                      key: 'sous-total',
                      align: 'end',
                      render: (_, l) => <MoneyValue value={Number(l.valeur) * l.nombre} />
                    }
                  ]}
                  rowKey={l => l.valeur}
                  pagination={false}
                  size="small"
                  aria-label={t('Billetage de la caisse')}
                />
              </>
            )}

            {detailQuery.data.status === 'CLOSED' && (
              <>
                <div>
                  <label htmlFor="caisse-commentaire-validation">{t('Commentaire (facultatif)')}</label>
                  <TextArea
                    id="caisse-commentaire-validation"
                    rows={2}
                    value={commentaireValidation}
                    onChange={event => setCommentaireValidation(event.target.value)}
                  />
                </div>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  size="large"
                  block
                  loading={validationEnCours}
                  onClick={valider}
                >
                  {t('Valider')}
                </Button>
              </>
            )}
          </Space>
        ) : (
          <StateBlock variant="error" description={t('Impossible de charger cette session.')} />
        )}
      </Modal>
    </>
  );
};

export default Caisse;
