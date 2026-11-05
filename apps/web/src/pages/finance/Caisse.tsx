import React, { useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Card, Input, InputNumber, Modal, Space, Switch, Typography } from 'antd';
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
  ExpectedLine,
  ListCashSessionsFilters
} from '../../services/cash-sessions-service';
import { listTreasuryAccounts } from '../../services/treasury-service';
import { useListSearch } from '../../hooks/useListSearch';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  StatCard,
  DataView,
  DataCard,
  StatusTag,
  Table
} from '../../components/primitives';
import type { StatusTone } from '../../components/primitives';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';
import { localizedRecord } from '../../i18n/localized';
import { montantSaisiProps } from '../../utils/montant-saisi';
import { TreasuryAccountSelector } from '../../components/finance/TreasuryAccountSelector';
import { useAuth } from '../../hooks/useAuth';
import { useMyMenuAccess } from '../../hooks/useMenuAccess';
import { isPermissionDenied, writeErrorMessage } from '../../utils/error-handler';

const { Title, Text } = Typography;
const { TextArea } = Input;

const messageSansDroitCaisse = () => t("Vous n'avez pas le droit de tenir une caisse.");

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

const STATUS_LABEL: Record<CashSessionStatus, string> = localizedRecord(() => ({
  OPEN: t('Ouverte'),
  CLOSED: t('À valider'),
  VALIDATED: t('Validée')
}));

const STATUS_TONE: Record<CashSessionStatus, StatusTone> = {
  OPEN: 'info',
  CLOSED: 'warning',
  VALIDATED: 'success'
};

const KIND_LABEL: Record<ExpectedLine['kind'], string> = localizedRecord(() => ({
  RENT_PAYMENT: t('Loyer encaissé'),
  OWNER_PAYOUT: t('Reversement propriétaire'),
  CASH_VOUCHER: t('Pièce de caisse')
}));

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

/** Compteur de la pagination des « lignes attendues » (1–20 sur 25). */
const afficherTotal = (total: number, range: [number, number]) =>
  t('{{start}}–{{end}} sur {{total}}', { start: range[0], end: range[1], total });

// --- Lignes attendues : filtrage local (constantes de module, identité stable) ---

const TEXTE_LIGNE = [(ligne: ExpectedLine) => ligne.label];
const ACCESSEURS_LIGNE = {
  type: (ligne: ExpectedLine) => ligne.kind,
  montant: (ligne: ExpectedLine) => ligne.amount
};

/**
 * Tableau des opérations attendues d'une session (session courante, ou détail
 * dans la fenêtre). Liste reçue en entier : recherche, pagination (20 par page)
 * et export de toute la liste filtrée sont locaux. Un préfixe d'URL par
 * instance : `att` (session courante), `det` (détail d'une session).
 */
const LignesAttendues: React.FC<{
  lignes: ExpectedLine[];
  colonnes: ColumnsType<ExpectedLine>;
  paramPrefix: string;
  /** Nom accessible de la barre de recherche (distinct d'une instance à l'autre). */
  rechercheLabel: string;
}> = ({ lignes, colonnes, paramPrefix, rechercheLabel }) => {
  const criteres: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t("Libellé de l'opération…") },
    {
      key: 'type',
      type: 'multiSelect',
      label: t('Type'),
      primary: true,
      options: (Object.keys(KIND_LABEL) as ExpectedLine['kind'][]).map(kind => ({
        value: kind,
        label: KIND_LABEL[kind]
      }))
    },
    { key: 'montant', type: 'numberRange', label: t('Montant'), unit: 'FCFA', primary: true }
  ];
  const local = useLocalListSearch<ExpectedLine>(lignes, {
    paramPrefix,
    criteria: criteres,
    text: TEXTE_LIGNE,
    accessors: ACCESSEURS_LIGNE
  });

  return (
    <Table<ExpectedLine>
      {...local.tableProps}
      // Deux barres peuvent coexister (session courante, détail) : noms distincts.
      search={{ ...local.tableProps.search, 'aria-label': rechercheLabel }}
      pagination={{
        ...local.tableProps.pagination,
        hideOnSinglePage: true,
        showSizeChanger: false,
        showTotal: afficherTotal
      }}
      columns={colonnes}
      rowKey={(l, index) => `${l.kind}-${index}-${l.at}`}
      size="small"
      aria-label={t('Opérations de la caisse')}
      exportFilename={t('Opérations de la caisse')}
      exportFetchAll={local.exportAll}
    />
  );
};

// --- Historique des sessions : mode mixte (statut, caissier, caisse et période partent au serveur) ---

// L'API renvoie au plus 200 sessions (les plus récentes, après filtres).
const PLAFOND_HISTORIQUE = 200;

const HistoriqueSessions: React.FC<{ tenantId: string; onOpen: (id: string) => void }> = ({ tenantId, onOpen }) => {
  // `loadOptions`/`api` figés au premier rendu : l'agence se lit par une ref.
  const tenantRef = useRef(tenantId);
  tenantRef.current = tenantId;

  const comptesQuery = useQuery({
    queryKey: queryKey('treasury-accounts', tenantId, { usage: 'cash-history-filter' }),
    queryFn: () => listTreasuryAccounts(tenantId),
    staleTime: STALE_TIME.reference
  });
  const optionsCaisses = useMemo(
    () =>
      (comptesQuery.data ?? [])
        .filter(compte => compte.kind === 'CASH')
        .map(compte => ({ value: compte.id, label: [compte.label, compte.accountNumber].filter(Boolean).join(' · ') })),
    [comptesQuery.data]
  );

  // Caissiers déjà vus dans les sessions reçues : aucun service de liste ne les
  // donne, et filtrer par un caissier ne doit pas faire disparaître les autres.
  const caissiersVus = useRef(new Map<string, string>());
  const [, setVersionCaissiers] = useState(0);

  const criteres: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Numéro, caisse, caissier…'),
      api: 'search'
    },
    {
      key: 'status',
      type: 'select',
      label: t('Statut'),
      primary: true,
      options: [
        { value: 'OPEN', label: t('Ouverte') },
        { value: 'CLOSED', label: t('À valider') },
        { value: 'VALIDATED', label: t('Validée') }
      ]
    },
    {
      key: 'ouverture',
      type: 'dateRange',
      label: t('Ouverture du… au…'),
      primary: true,
      api: ['from', 'to']
    },
    {
      key: 'cashierUserId',
      type: 'select',
      label: t('Caissier'),
      options: Array.from(caissiersVus.current, ([value, label]) => ({ value, label })).sort((a, b) =>
        a.label.localeCompare(b.label)
      ),
      resolveLabel: id => caissiersVus.current.get(id)
    },
    {
      key: 'treasuryAccountId',
      type: 'select',
      label: t('Caisse'),
      options: optionsCaisses
    },
    {
      key: 'ecart',
      type: 'boolean',
      label: t('Écart non nul'),
      api: (v): Record<string, string> => (v ? { hasDifference: 'true' } : {})
    }
  ];
  // Paramètres d'API des critères serveur, disponibles avant la requête.
  const { filterParams } = useListSearch({ paramPrefix: 'his', criteria: criteres });

  const historiqueQuery = useQuery({
    queryKey: queryKey('cash-sessions', tenantId, filterParams),
    queryFn: () => listCashSessions(tenantId, filterParams as ListCashSessionsFilters),
    staleTime: STALE_TIME.list
  });

  // Mémorise les caissiers de chaque réponse (la requête, filtrée, en montre moins).
  const donnees = historiqueQuery.data;
  React.useEffect(() => {
    let nouveau = false;
    for (const session of donnees ?? []) {
      if (!caissiersVus.current.has(session.cashierUserId)) {
        caissiersVus.current.set(session.cashierUserId, session.cashierName);
        nouveau = true;
      }
    }
    if (nouveau) setVersionCaissiers(v => v + 1);
  }, [donnees]);

  const local = useLocalListSearch<CashSession>(donnees, {
    paramPrefix: 'his',
    criteria: criteres
  });

  const colonnes: ColumnsType<CashSession> = [
    { title: t('Numéro'), key: 'number', render: (_, s) => s.number },
    { title: t('Caisse'), key: 'treasury', render: (_, s) => s.treasuryLabel || '—' },
    { title: t('Caissier'), key: 'cashier', render: (_, s) => s.cashierName },
    { title: t('Ouverture'), key: 'openedAt', render: (_, s) => dateHeure(s.openedAt) },
    { title: t('Clôture'), key: 'closedAt', render: (_, s) => (s.closedAt ? dateHeure(s.closedAt) : '—') },
    {
      title: t('Attendu'),
      key: 'expected',
      align: 'end',
      exportValue: s => s.expected.amount,
      render: (_, s) => <MoneyValue value={s.expected.amount} />
    },
    {
      title: t('Compté'),
      key: 'counted',
      align: 'end',
      exportValue: s => s.countedAmount ?? null,
      render: (_, s) => <MoneyValue value={s.countedAmount} />
    },
    {
      title: t('Écart'),
      key: 'difference',
      align: 'end',
      exportValue: s => s.difference ?? null,
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
        <Button type="link" onClick={() => onOpen(s.id)}>
          {t('Voir le détail')}
        </Button>
      )
    }
  ];

  return (
    <>
      {(donnees?.length ?? 0) >= PLAFOND_HISTORIQUE && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 'var(--space-4)' }}
          title={t(
            'Seules les 200 sessions les plus récentes correspondant aux critères sont affichées. Affinez par période, statut ou caisse.'
          )}
        />
      )}
      <DataView<CashSession>
        {...local.dataViewProps}
        // Deux barres peuvent coexister (historique, détail ouvert) : noms distincts.
        search={{ ...local.dataViewProps.search, 'aria-label': t("Rechercher dans l'historique des caisses") }}
        loading={historiqueQuery.isPending}
        error={historiqueQuery.error ? t('Impossible de charger les sessions de caisse.') : null}
        errorCause={historiqueQuery.error}
        onRetry={() => historiqueQuery.refetch()}
        emptyDescription={t('Aucune session de caisse.')}
        rowKey={s => s.id}
        aria-label={t('Historique des caisses')}
        export={{ filename: t('Historique des caisses'), fetchAll: local.exportAll }}
        columns={colonnes}
        renderCard={s => (
          <DataCard
            title={s.number}
            aria-label={s.number}
            subtitle={s.cashierName}
            status={<StatusTag status={s.status} tone={STATUS_TONE[s.status]} label={STATUS_LABEL[s.status]} />}
            highlight={<MoneyValue value={s.expected.amount} />}
            onOpen={() => onOpen(s.id)}
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
};

export const Caisse: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Ce que la personne a le droit de faire (BUG-2026-09-29-006) : tenir une
  // caisse demande FINANCE_DOCUMENTS_CREATE, la valider FINANCE_DOCUMENTS_VALIDATE.
  // `permissions` nul = aucune restriction (administrateur d'agence) ; on
  // n'appelle « Ma caisse » qu'une fois les droits connus, pour ne pas
  // provoquer un 403 aussitôt masqué.
  const { permissions, ready: droitsConnus } = useMyMenuAccess(tenantId);
  const peutTenirCaisse = permissions === null || permissions.has('FINANCE_DOCUMENTS_CREATE');
  const peutValider = permissions === null || permissions.has('FINANCE_DOCUMENTS_VALIDATE');

  const [ongletChoisi, setOnglet] = useState<Onglet>('ma-caisse');
  // Sans droit de tenir une caisse, l'écran s'ouvre sur l'historique.
  const onglet: Onglet = peutTenirCaisse ? ongletChoisi : 'historique';

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
  const [sessionOuverteId, setSessionOuverteId] = useState<string | null>(null);
  // Les critères `det.*` du détail ne survivent ni à la fermeture ni au passage à une autre session.
  const [, setSearchParams] = useSearchParams();
  const ouvrirDetail = (id: string | null) => {
    setSearchParams(
      precedent => {
        const suivant = new URLSearchParams(precedent);
        for (const cle of Array.from(suivant.keys())) if (cle.startsWith('det.')) suivant.delete(cle);
        return suivant;
      },
      { replace: true }
    );
    setSessionOuverteId(id);
  };
  const [commentaireValidation, setCommentaireValidation] = useState('');
  const [validationEnCours, setValidationEnCours] = useState(false);

  const sessionCouranteQuery = useQuery({
    queryKey: queryKey('cash-session-current', tenantId, {}),
    queryFn: () => getCurrentCashSession(tenantId as string),
    enabled: Boolean(tenantId) && droitsConnus && peutTenirCaisse,
    staleTime: STALE_TIME.list,
    // Un 403 est une réponse définitive : ne pas la rejouer.
    retry: (nombre, erreur) => !isPermissionDenied(erreur) && nombre < 2
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
    if (fondDeCaisse === null) {
      message.error(t('Indiquez le fond de caisse.'));
      return;
    }
    if (fondDeCaisse < 0) {
      message.error(t('Le fond de caisse ne peut pas être négatif.'));
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
      message.error(writeErrorMessage(err, t("L'ouverture de la caisse a échoué."), messageSansDroitCaisse()));
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
      message.error(writeErrorMessage(err, t('La clôture a échoué.'), messageSansDroitCaisse()));
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
      ouvrirDetail(null);
      queryClient.invalidateQueries({ queryKey: queryKey('cash-sessions', tenantId, {}) });
      queryClient.invalidateQueries({ queryKey: queryKey('cash-session-detail', tenantId, {}) });
    } catch (err: any) {
      message.error(
        writeErrorMessage(err, t('La validation a échoué.'), t("Vous n'avez pas le droit de valider une caisse."))
      );
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
      exportValue: l => l.amount,
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
            // Pas de `min` : InputNumber recadrerait -1 en 0 sans rien dire.
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
          <LignesAttendues
            lignes={session.expected.lines}
            colonnes={colonnesOperations}
            paramPrefix="att"
            rechercheLabel={t('Rechercher dans les opérations de la session en cours')}
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

  const ongletMaCaisse = isPermissionDenied(sessionCouranteQuery.error) ? (
    <StateBlock
      variant="empty"
      title={t("Vous n'avez pas le droit de tenir une caisse.")}
      description={t("Vous pouvez consulter l'historique des caisses depuis l'onglet « Historique ».")}
    />
  ) : sessionCouranteQuery.error ? (
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

  const ongletHistorique = <HistoriqueSessions tenantId={tenantId} onOpen={ouvrirDetail} />;

  return (
    <>
      <PageHeader
        title={t('Caisse')}
        breadcrumbs={[{ label: t('Finance'), to: `/tenant/${tenantId}/finance/comptabilite` }, { label: t('Caisse') }]}
      />

      <div role="tablist" style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {peutTenirCaisse && (
          <Button
            role="tab"
            aria-selected={onglet === 'ma-caisse'}
            type={onglet === 'ma-caisse' ? 'primary' : 'default'}
            onClick={() => setOnglet('ma-caisse')}
          >
            {t('Ma caisse')}
          </Button>
        )}
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
          ouvrirDetail(null);
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
              <LignesAttendues
                lignes={detailQuery.data.expected.lines}
                paramPrefix="det"
                rechercheLabel={t('Rechercher dans les opérations de la session')}
                colonnes={[
                  { title: t('Date et heure'), key: 'at', render: (_, l) => dateHeure(l.at) },
                  { title: t('Type'), key: 'kind', render: (_, l) => KIND_LABEL[l.kind] },
                  { title: t('Libellé'), key: 'label', render: (_, l) => l.label },
                  {
                    title: t('Montant'),
                    key: 'amount',
                    align: 'end',
                    exportValue: l => l.amount,
                    render: (_, l) => <MoneyValue value={l.amount} signed />
                  }
                ]}
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
                    {
                      title: t('Valeur'),
                      key: 'valeur',
                      exportValue: l => Number(l.valeur),
                      render: (_, l) => <MoneyValue value={Number(l.valeur)} />
                    },
                    { title: t('Nombre'), key: 'nombre', align: 'end', render: (_, l) => l.nombre },
                    {
                      title: t('Sous-total'),
                      key: 'sous-total',
                      align: 'end',
                      exportValue: l => Number(l.valeur) * l.nombre,
                      render: (_, l) => <MoneyValue value={Number(l.valeur) * l.nombre} />
                    }
                  ]}
                  rowKey={l => l.valeur}
                  pagination={false}
                  size="small"
                  aria-label={t('Billetage de la caisse')}
                  exportFilename={t('Billetage')}
                />
              </>
            )}

            {detailQuery.data.status === 'CLOSED' && !peutValider && (
              <Text type="secondary">{t('La validation d’une caisse est réservée aux responsables habilités.')}</Text>
            )}

            {detailQuery.data.status === 'CLOSED' && peutValider && user?.id === detailQuery.data.cashierUserId && (
              <Text type="secondary">{t('Vous avez tenu cette caisse : un autre responsable doit la valider.')}</Text>
            )}

            {detailQuery.data.status === 'CLOSED' && peutValider && user?.id !== detailQuery.data.cashierUserId && (
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
