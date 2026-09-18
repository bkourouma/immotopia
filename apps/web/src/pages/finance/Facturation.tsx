import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { App, Button, Card, Input, Select, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listBillingRuns, getBillingRun, runBilling } from '../../services/finance-service';
import { BILLING_EXCLUSION_LABELS } from '../../types/finance-types';
import type { BillingExclusionReason, BillingRun, BillingRunSummary } from '../../types/finance-types';
import { detailKey, queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  StatusTag,
  MoneyValue,
  StatCard,
  DataView,
  DataCard,
  ConfirmAction
} from '../../components/primitives';
import type { StatusTone } from '../../components/primitives';

const { Text, Title } = Typography;

/**
 * Facturation — l'écran « lancer la campagne », récit B3 du lot 1
 * (specs/016-finance-operationnelle/spec.md, User Story 3 ; PLAN §5.3 tâche
 * 1.14).
 *
 * Construit sur le même modèle que les écrans hybrides de la refonte
 * locative — `pages/rental/Installments.tsx`, `Penalties.tsx` — et que ses
 * voisins financiers (`BalanceClients.tsx`) : mêmes primitives, mêmes trois
 * états délégués à `<DataView>`, aucune pagination puisque ni l'historique ni
 * un compte rendu ne sont paginés par le contrat gelé.
 *
 * **Le point de conception qui compte : l'idempotence n'est pas un danger.**
 * `runBilling` (`finance-service.ts`) garantit que relancer la même période ne
 * duplique aucune échéance. Le bouton « Relancer » n'est donc jamais rendu
 * `danger`, sa confirmation ne parle d'aucune irréversibilité, et un texte
 * discret au-dessus l'annonce explicitement. Le résultat d'une relance —
 * des baux déjà facturés qui ressortent en exclusion — est rendu par le même
 * `<DataView>` neutre que n'importe quelle exclusion : rien n'y signale un
 * échec.
 *
 * **L'état de liste vit dans l'URL.** Il n'y a ici ni filtre ni pagination à y
 * loger — l'historique comme le compte rendu sont rendus intégralement par
 * l'API — mais la campagne dont le compte rendu est affiché l'est : `?campagne=<id>`.
 * Un lien vers cet écran, partagé ou rechargé, rouvre exactement le même
 * compte rendu.
 *
 * **Vocabulaire (P-1 du PRD).** On *facture*, on *règle*, jamais « débit » ni
 * « crédit ». Les montants passent systématiquement par `<MoneyValue>`, sans
 * préciser `currency` : la devise stockée (`XOF`) s'affiche « FCFA » par le
 * défaut du composant.
 *
 * **Le compte rendu se lit sans rien aller chercher.** Chaque ligne porte un
 * libellé — « Fatoumata Diallo — Villa Kipé 12 » — résolu par le serveur au
 * moment de la campagne et stocké avec elle. L'identifiant reste dans la
 * donnée, pour les clés de ligne, mais ne s'affiche jamais : une gestionnaire
 * qui lit « Bail 3f2a9b8c-… » ne peut rien en faire.
 *
 * Les libellés sont recopiés, pas joints : un compte rendu est une trace. Il
 * doit rester lisible des mois plus tard, même si le bail a été clos depuis.
 */

const MOIS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
];

function capitaliser(mot: string): string {
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}

/**
 * La période nommée seule : « Septembre 2026 ».
 *
 * Distincte de `libellePeriode`, qui porte la préposition. Les deux existaient
 * confondues, si bien que la colonne « Période » affichait « De novembre
 * 2026 » — une préposition sans phrase où se rattacher.
 */
function periodeSeule(mois: number, annee: number): string {
  return capitaliser(`${MOIS_FR[mois - 1] ?? String(mois)} ${annee}`);
}

/**
 * La période dans une phrase : « de septembre 2026 », « d'octobre 2026 ».
 *
 * L'élision est correcte devant voyelle, y compris pour « août » que son
 * accent circonflexe ne dispense pas de la règle.
 */
function libellePeriode(mois: number, annee: number): string {
  const nom = MOIS_FR[mois - 1] ?? String(mois);
  const preposition = /^[aeiouyàâäéèêëîïôöùûü]/i.test(nom) ? `d’${nom}` : `de ${nom}`;
  return `${preposition} ${annee}`;
}

function libelleParDefaut(mois: number, annee: number): string {
  return `Loyer ${libellePeriode(mois, annee)}`;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

function accord(n: number, singulier: string, pluriel: string): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

/**
 * Libellé français d'un motif d'exclusion.
 *
 * `BILLING_EXCLUSION_LABELS` couvre les six valeurs du type de façon
 * exhaustive — TypeScript l'exige — mais un filet de sécurité reste posé ici :
 * si l'API en renvoyait un jour une septième avant que ce fichier ne soit mis
 * à jour, l'écran ne doit jamais afficher un code brut. Une exclusion sans
 * motif lisible est un défaut.
 */
function libelleMotif(reason: BillingExclusionReason): string {
  return BILLING_EXCLUSION_LABELS[reason] ?? 'Motif non précisé';
}

const OPTIONS_MOIS = MOIS_FR.map((nom, index) => ({ value: index + 1, label: capitaliser(nom) }));

const STATUT_CAMPAGNE: Record<BillingRun['status'], { tone: StatusTone; label: string }> = {
  RUNNING: { tone: 'info', label: 'En cours' },
  DONE: { tone: 'success', label: 'Exécutée' },
  FAILED: { tone: 'danger', label: 'Échouée' }
};

type LigneFacturee = BillingRunSummary['billed'][number];
type LigneExclue = BillingRunSummary['excluded'][number];
type LigneAvance = BillingRunSummary['advancesApplied'][number];

const COLONNES_FACTUREES: ColumnsType<LigneFacturee> = [
  { title: 'Bail', dataIndex: 'leaseLabel', key: 'bail' },
  {
    title: 'Montant facturé',
    key: 'montant',
    align: 'right',
    render: (_, ligne) => <MoneyValue value={ligne.amount} />
  }
];

const COLONNES_EXCLUES: ColumnsType<LigneExclue> = [
  { title: 'Bail', dataIndex: 'leaseLabel', key: 'bail' },
  { title: 'Motif', key: 'motif', render: (_, ligne) => libelleMotif(ligne.reason) }
];

const COLONNES_AVANCES: ColumnsType<LigneAvance> = [
  { title: 'Client', dataIndex: 'tenantLabel', key: 'client' },
  {
    title: 'Montant imputé',
    key: 'montant',
    align: 'right',
    render: (_, ligne) => <MoneyValue value={ligne.amount} />
  }
];

interface CompteRenduProps {
  run: BillingRun | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function CompteRendu({ run, loading, error, onRetry }: CompteRenduProps) {
  if (loading) {
    return <StateBlock variant="loading" />;
  }

  if (error) {
    return (
      <StateBlock
        variant="error"
        description={error}
        actions={[{ label: 'Réessayer', onClick: onRetry, primary: true }]}
      />
    );
  }

  if (!run) return null;

  const statut = STATUT_CAMPAGNE[run.status];
  const resume = run.summary;

  return (
    <Card style={{ marginBottom: 'var(--space-6)' }}>
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
            Compte rendu — {run.label}
          </Title>
          <Text type="secondary">
            {capitaliser(libellePeriode(run.periodMonth, run.periodYear))} · Exécutée le{' '}
            {dateCourte(run.finishedAt || run.startedAt)}
          </Text>
        </div>
        <StatusTag status={run.status} tone={statut.tone} label={statut.label} />
      </div>

      {run.status === 'FAILED' && (
        <StateBlock
          variant="error"
          title="Cette campagne a échoué"
          description="Aucun compte rendu n'a pu être produit pour cette exécution."
        />
      )}

      {run.status === 'RUNNING' && <StateBlock variant="loading" title="Campagne en cours d'exécution…" />}

      {resume && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-6)'
            }}
          >
            <StatCard label="Baux facturés" value={String(resume.billed.length)} tone="positive" />
            <StatCard label="Baux exclus" value={String(resume.excluded.length)} />
            <StatCard label="Avances imputées" value={String(resume.advancesApplied.length)} tone="positive" />
          </div>

          <Title level={5}>Détail des baux facturés</Title>
          <DataView<LigneFacturee>
            paginated={false}
            items={resume.billed}
            total={resume.billed.length}
            page={1}
            pageSize={Math.max(resume.billed.length, 1)}
            onPageChange={() => {}}
            emptyDescription="Aucun bail facturé pour cette période."
            columns={COLONNES_FACTUREES}
            rowKey={ligne => ligne.installmentId}
            aria-label="Baux facturés"
            renderCard={ligne => (
              <DataCard
                title={ligne.leaseLabel}
                aria-label={`Bail ${ligne.leaseLabel} facturé`}
                highlight={<MoneyValue value={ligne.amount} />}
              />
            )}
          />

          <Title level={5} style={{ marginTop: 'var(--space-6)' }}>
            Détail des baux exclus
          </Title>
          {/* Une campagne sans exclusion est une bonne campagne : la phrase
              d'état vide le dit, elle ne constate pas une absence. */}
          <DataView<LigneExclue>
            paginated={false}
            items={resume.excluded}
            total={resume.excluded.length}
            page={1}
            pageSize={Math.max(resume.excluded.length, 1)}
            onPageChange={() => {}}
            emptyDescription="Aucun bail exclu : la campagne a facturé l'ensemble des baux éligibles."
            columns={COLONNES_EXCLUES}
            rowKey={ligne => ligne.leaseId}
            aria-label="Baux exclus"
            renderCard={ligne => (
              <DataCard
                title={ligne.leaseLabel}
                aria-label={`Bail ${ligne.leaseLabel} exclu`}
                fields={[{ label: 'Motif', value: libelleMotif(ligne.reason) }]}
              />
            )}
          />

          <Title level={5} style={{ marginTop: 'var(--space-6)' }}>
            Détail des avances imputées
          </Title>
          <DataView<LigneAvance>
            paginated={false}
            items={resume.advancesApplied}
            total={resume.advancesApplied.length}
            page={1}
            pageSize={Math.max(resume.advancesApplied.length, 1)}
            onPageChange={() => {}}
            emptyDescription="Aucune avance à imputer sur cette période."
            columns={COLONNES_AVANCES}
            rowKey={ligne => `${ligne.installmentId}-${ligne.sourcePaymentId}`}
            aria-label="Avances imputées"
            renderCard={ligne => (
              <DataCard
                title={ligne.tenantLabel}
                aria-label={`Avance imputée pour ${ligne.tenantLabel}`}
                highlight={<MoneyValue value={ligne.amount} />}
              />
            )}
          />
        </>
      )}
    </Card>
  );
}

export const Facturation: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const campagneId = searchParams.get('campagne');

  const anneeCourante = new Date().getFullYear();
  const [anneeChoisie, setAnneeChoisie] = useState(anneeCourante);
  const [moisChoisi, setMoisChoisi] = useState(new Date().getMonth() + 1);
  const [libelleModifie, setLibelleModifie] = useState(false);
  const [libelle, setLibelle] = useState(() => libelleParDefaut(moisChoisi, anneeCourante));

  // Le libellé suit le mois et l'année tant que la gestionnaire ne l'a pas
  // modifié à la main : elle peut toujours reprendre la proposition
  // automatique en changeant à nouveau la période.
  useEffect(() => {
    if (!libelleModifie) setLibelle(libelleParDefaut(moisChoisi, anneeChoisie));
  }, [moisChoisi, anneeChoisie, libelleModifie]);

  const optionsAnnees = useMemo(
    () => [anneeCourante - 1, anneeCourante, anneeCourante + 1].map(a => ({ value: a, label: String(a) })),
    [anneeCourante]
  );

  const {
    data: campagnesData,
    isPending: historiqueEnAttente,
    isFetching: historiqueEnCours,
    error: erreurHistorique,
    refetch: refetchHistorique
  } = useQuery({
    queryKey: queryKey('billing-runs', tenantId),
    queryFn: () => listBillingRuns(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const campagnes = campagnesData ?? [];
  const campagneExistante = campagnes.find(c => c.periodYear === anneeChoisie && c.periodMonth === moisChoisi);

  const {
    data: rapport,
    isPending: rapportEnAttente,
    error: erreurRapport,
    refetch: refetchRapport
  } = useQuery({
    queryKey: detailKey('billing-runs', tenantId, campagneId ?? ''),
    queryFn: () => getBillingRun(tenantId as string, campagneId as string),
    enabled: Boolean(tenantId) && Boolean(campagneId),
    staleTime: STALE_TIME.list
  });

  const ouvrirCampagne = (id: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('campagne', id);
      return next;
    });
  };

  const handleLaunch = async () => {
    if (!tenantId) return;
    try {
      const run = await runBilling(tenantId, { periodYear: anneeChoisie, periodMonth: moisChoisi, label: libelle });
      // Le résultat est déjà connu : pas besoin d'attendre un second
      // aller-retour pour afficher son compte rendu.
      queryClient.setQueryData(detailKey('billing-runs', tenantId, run.id), run);
      // Cible précisément la clé de l'historique non filtré — pas un simple
      // préfixe `['billing-runs', tenantId]`, qui invaliderait aussi la clé de
      // détail juste amorcée ci-dessus et déclencherait un second
      // aller-retour inutile pour une donnée déjà en main.
      await queryClient.invalidateQueries({ queryKey: queryKey('billing-runs', tenantId) });
      ouvrirCampagne(run.id);

      const nbFactures = run.summary?.billed.length ?? 0;
      const nbExclus = run.summary?.excluded.length ?? 0;
      message.success(
        `Campagne exécutée : ${accord(nbFactures, 'bail facturé', 'baux facturés')}, ${accord(nbExclus, 'bail exclu', 'baux exclus')}.`
      );
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Le lancement de la campagne a échoué.');
    }
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title="Aucune agence sélectionnée" />;
  }

  const titreConfirmation = campagneExistante
    ? `Relancer la campagne « ${libelle} » ?`
    : `Lancer la campagne « ${libelle} » ?`;

  const descriptionConfirmation = campagneExistante ? (
    <>
      Une campagne a déjà été exécutée pour cette période, le{' '}
      {dateCourte(campagneExistante.finishedAt || campagneExistante.startedAt)}. Relancer ne crée aucun doublon : les
      baux déjà facturés ressortiront simplement en exclusion, et seuls les baux nouvellement éligibles seront facturés.
    </>
  ) : (
    <>
      Une échéance sera créée pour chaque bail actif éligible sur cette période. Les baux suspendus, hors durée de bail,
      déjà facturés ou sans loyer renseigné seront exclus, chacun avec son motif.
    </>
  );

  const colonnesHistorique: ColumnsType<BillingRun> = [
    { title: 'Période', key: 'periode', render: (_, c) => periodeSeule(c.periodMonth, c.periodYear) },
    { title: 'Libellé', dataIndex: 'label', key: 'libelle' },
    {
      title: 'Statut',
      key: 'statut',
      render: (_, c) => {
        const s = STATUT_CAMPAGNE[c.status];
        return <StatusTag status={c.status} tone={s.tone} label={s.label} />;
      }
    },
    { title: 'Exécutée le', key: 'date', render: (_, c) => (c.finishedAt ? dateCourte(c.finishedAt) : '—') },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, c) => (
        <Button type="link" onClick={() => ouvrirCampagne(c.id)}>
          Voir le compte rendu
        </Button>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title="Facturation"
        subtitle={campagnes.length > 0 ? `${campagnes.length} campagne${campagnes.length > 1 ? 's' : ''}` : undefined}
      />

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <Title level={4} style={{ marginTop: 0 }}>
          Lancer la facturation du mois
        </Title>

        <Space wrap size="middle" align="end" style={{ marginBottom: 'var(--space-3)', width: '100%' }}>
          <div>
            <div>
              <label htmlFor="facturation-mois">Mois</label>
            </div>
            <Select
              id="facturation-mois"
              style={{ width: 180 }}
              value={moisChoisi}
              onChange={setMoisChoisi}
              options={OPTIONS_MOIS}
            />
          </div>
          <div>
            <div>
              <label htmlFor="facturation-annee">Année</label>
            </div>
            <Select
              id="facturation-annee"
              style={{ width: 120 }}
              value={anneeChoisie}
              onChange={setAnneeChoisie}
              options={optionsAnnees}
            />
          </div>
          <div style={{ minWidth: 260, flex: 1 }}>
            <div>
              <label htmlFor="facturation-libelle">Libellé</label>
            </div>
            <Input
              id="facturation-libelle"
              value={libelle}
              onChange={event => {
                setLibelle(event.target.value);
                setLibelleModifie(true);
              }}
            />
          </div>
        </Space>

        {/* Le point qui compte : la campagne est idempotente côté serveur.
            Ce n'est pas une action destructive qu'il faudrait faire craindre —
            un avertissement anxiogène sur une opération sans risque
            apprendrait à l'ignorer. */}
        <Text type="secondary" style={{ display: 'block', marginBottom: 'var(--space-4)' }}>
          Cette opération est sans risque : relancer une période déjà facturée ne crée aucun doublon d'échéance. Les
          baux déjà à jour ressortent simplement dans les exclusions, avec ce motif.
        </Text>

        <ConfirmAction
          title={titreConfirmation}
          description={descriptionConfirmation}
          okText={campagneExistante ? 'Relancer' : 'Lancer'}
          onConfirm={handleLaunch}
        >
          <Button type="primary" icon={<ThunderboltOutlined />}>
            {campagneExistante ? 'Relancer la campagne' : 'Lancer la campagne'}
          </Button>
        </ConfirmAction>
      </Card>

      {campagneId ? (
        <CompteRendu
          run={rapport ?? null}
          loading={rapportEnAttente}
          error={erreurRapport ? 'Impossible de charger ce compte rendu.' : null}
          onRetry={() => refetchRapport()}
        />
      ) : (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <Text type="secondary">
            Lancez une campagne ci-dessus, ou choisissez-en une dans l'historique pour afficher son compte rendu.
          </Text>
        </Card>
      )}

      <Title level={4}>Historique des campagnes</Title>
      <DataView<BillingRun>
        paginated={false}
        items={campagnes}
        total={campagnes.length}
        page={1}
        pageSize={Math.max(campagnes.length, 1)}
        onPageChange={() => {}}
        loading={historiqueEnAttente}
        isReloading={historiqueEnCours && !historiqueEnAttente}
        error={erreurHistorique ? "Impossible de charger l'historique des campagnes." : null}
        onRetry={() => refetchHistorique()}
        emptyDescription="Aucune campagne n'a encore été exécutée."
        columns={colonnesHistorique}
        rowKey={c => c.id}
        aria-label="Historique des campagnes"
        renderCard={c => {
          const s = STATUT_CAMPAGNE[c.status];
          return (
            <DataCard
              title={c.label}
              aria-label={`Campagne ${c.label}`}
              subtitle={periodeSeule(c.periodMonth, c.periodYear)}
              status={<StatusTag status={c.status} tone={s.tone} label={s.label} />}
              fields={[{ label: 'Exécutée le', value: c.finishedAt ? dateCourte(c.finishedAt) : '—' }]}
              onOpen={() => ouvrirCampagne(c.id)}
            />
          );
        }}
      />
    </>
  );
};
