import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Button, DatePicker, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import {
  addPartnershipShare,
  getPartnership,
  getPartnerStatement,
  removePartnershipShare,
  setPropertyPartnership
} from '../../services/finance-partnerships-service';
import { listProperties } from '../../services/property-service';
import type {
  Partnership,
  PartnershipPropertyRef,
  PartnershipShare,
  PartnerStatementLine
} from '../../types/finance-partnerships-types';
import { detailKey, entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  DataView,
  DataCard,
  StatCard,
  StatusTag,
  ConfirmAction,
  useConfirmAction
} from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title } = Typography;
const { RangePicker } = DatePicker;

/**
 * Fiche d'une association — lot 4, deuxième sous-lot (PRD E7, besoin B9 ;
 * contrat gelé `packages/api/src/lib/finance/types-lot4-partnerships.ts`).
 *
 * URL : `/tenant/:tenantId/finance/associations/:partnershipId`. L'association
 * est dans le CHEMIN, pas en paramètre de requête — le défaut relevé deux fois
 * au lot 2, et une troisième fois évité ici : voir le test de navigation de
 * `__tests__/finance/associations.test.tsx`.
 *
 * ---------------------------------------------------------------------------
 * Le cœur de l'écran : ce qui reste à l'entreprise, jamais tu
 * ---------------------------------------------------------------------------
 *
 * `totalSharePercent` (somme des quotes-parts des associés) et
 * `companySharePercent` (`100 − totalSharePercent`, la part de l'entreprise)
 * arrivent tous deux calculés par le serveur — ni recalculés, ni recomposés
 * ici à partir de `shares`. Un total à cent pour cent ne laisse rien à
 * l'agence : la carte « Part de l'agence » le montre alors explicitement à
 * zéro, avec une précision en toutes lettres, plutôt que de disparaître ou de
 * laisser deviner un blanc.
 *
 * **L'état de quote-part d'un associé** (facturé, encaissé, sa part, déjà
 * reversé) est un relevé en lecture seule (`getPartnerStatement`), ouvert
 * depuis la ligne de l'associé. Rien n'y est recalculé non plus :
 * `totalShare` et `totalPaidOut` arrivent tout faits.
 *
 * **Retirer un associé est irréversible.** Le contrat gelé le refuse déjà dès
 * qu'une ventilation a été constatée sur sa part, mais l'écran le dit AVANT le
 * geste, dans `<ConfirmAction>`, jamais après coup — comme aux lots 2, 3 et 4.
 *
 * **Vocabulaire (P-1 du PRD).** On *répartit* un loyer, on *reverse* une part,
 * on *retire* un associé, on *rattache* ou on *détache* un bien — jamais
 * « débit » ni « crédit ».
 */

function pourcentage(valeur: number): string {
  return `${valeur.toLocaleString(activeLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} %`;
}

const MOIS_FR = [
  'janvier',
  t('février'),
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  t('août'),
  'septembre',
  'octobre',
  'novembre',
  t('décembre')
];

function libellePeriode(year: number, month: number): string {
  const nomMois = MOIS_FR[month - 1] ?? String(month);
  return `${nomMois.charAt(0).toUpperCase()}${nomMois.slice(1)} ${year}`;
}

export const Association: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, partnershipId } = useParams<{ tenantId: string; partnershipId: string }>();
  const queryClient = useQueryClient();
  const confirmerAction = useConfirmAction();

  const {
    data: association,
    isPending: associationEnAttente,
    error: erreurAssociation,
    refetch: refetchAssociation
  } = useQuery({
    queryKey: detailKey('partnerships', tenantId, partnershipId ?? ''),
    queryFn: () => getPartnership(tenantId as string, partnershipId as string),
    enabled: Boolean(tenantId && partnershipId),
    staleTime: STALE_TIME.list
  });

  // Référentiel des biens, pour le seul sélecteur de rattachement ci-dessous.
  // `Property` (module biens, gelé) n'expose pas l'association à laquelle il
  // appartient déjà : ce référentiel ne permet donc d'exclure que les biens
  // déjà listés dans `association.properties`, pas ceux rattachés à une AUTRE
  // association — voir la rubrique « Hypothèses » du rapport de cet agent, et
  // le même point relevé pour les chantiers dans `BailDeTerrain.tsx`.
  const { data: biensReferentiel } = useQuery({
    queryKey: queryKey('properties', tenantId, { limit: 100 }),
    queryFn: () => listProperties(tenantId as string, { limit: 100 }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const optionsRattachement = useMemo(() => {
    const idsRattaches = new Set((association?.properties ?? []).map(p => p.propertyId));
    return (biensReferentiel?.properties ?? [])
      .filter(bien => !idsRattaches.has(bien.id))
      .map(bien => ({ value: bien.id, label: bien.title }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [biensReferentiel, association]);

  // ---------------------------------------------------------------------
  // Ajout d'un associé
  // ---------------------------------------------------------------------

  const [nomAssocie, setNomAssocie] = useState('');
  const [quotePart, setQuotePart] = useState<number | null>(null);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const peutAjouterAssocie = Boolean(nomAssocie.trim()) && Boolean(quotePart && quotePart > 0);

  const ajouterAssocie = async () => {
    if (!tenantId || !partnershipId || !peutAjouterAssocie) return;
    setAjoutEnCours(true);
    try {
      await addPartnershipShare(tenantId, partnershipId, {
        partnerName: nomAssocie.trim(),
        sharePercent: quotePart as number
      });
      await queryClient.invalidateQueries({ queryKey: detailKey('partnerships', tenantId, partnershipId) });
      message.success(t('Associé « {{value}} » ajouté.', { value: nomAssocie.trim() }));
      setNomAssocie('');
      setQuotePart(null);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'ajout de l'associé a échoué."));
    } finally {
      setAjoutEnCours(false);
    }
  };

  const retirerAssocie = async (share: PartnershipShare) => {
    if (!tenantId || !partnershipId) return;
    try {
      await removePartnershipShare(tenantId, share.id);
      await queryClient.invalidateQueries({ queryKey: detailKey('partnerships', tenantId, partnershipId) });
      message.success(t('Associé « {{partnerName}} » retiré.', { partnerName: share.partnerName }));
    } catch (err: any) {
      // Le serveur refuse ce geste dès qu'une ventilation a déjà été
      // constatée sur la part de l'associé (contrat gelé) : son message est
      // relayé tel quel, jamais deviné ici.
      message.error(err?.response?.data?.message || t("Le retrait de l'associé a échoué."));
    }
  };

  // ---------------------------------------------------------------------
  // Rattachement d'un bien
  // ---------------------------------------------------------------------

  const [bienARattacher, setBienARattacher] = useState<string | undefined>(undefined);
  const [rattachementEnCours, setRattachementEnCours] = useState(false);

  const rattacherBien = async () => {
    if (!tenantId || !partnershipId || !bienARattacher) return;
    setRattachementEnCours(true);
    try {
      await setPropertyPartnership(tenantId, bienARattacher, partnershipId);
      await queryClient.invalidateQueries({ queryKey: detailKey('partnerships', tenantId, partnershipId) });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('partnerships', tenantId) });
      message.success(t('Bien rattaché à l’association.'));
      setBienARattacher(undefined);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Le rattachement a échoué.'));
    } finally {
      setRattachementEnCours(false);
    }
  };

  const detacherBien = async (bien: PartnershipPropertyRef) => {
    if (!tenantId) return;
    try {
      await setPropertyPartnership(tenantId, bien.propertyId, null);
      await queryClient.invalidateQueries({ queryKey: detailKey('partnerships', tenantId, partnershipId ?? '') });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('partnerships', tenantId) });
      message.success(t("Bien « {{propertyLabel}} » détaché de l'association.", { propertyLabel: bien.propertyLabel }));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Le détachement a échoué.'));
    }
  };

  // ---------------------------------------------------------------------
  // État de quote-part d'un associé — lecture seule, sur demande
  // ---------------------------------------------------------------------

  const [associeConsulte, setAssocieConsulte] = useState<PartnershipShare | null>(null);
  const [plageReleve, setPlageReleve] = useState<[Dayjs, Dayjs] | null>(null);

  const {
    data: releve,
    isPending: releveEnAttente,
    error: erreurReleve
  } = useQuery({
    queryKey: queryKey('partner-statement', tenantId, {
      shareId: associeConsulte?.id ?? '',
      from: plageReleve?.[0]?.format('YYYY-MM-DD') ?? '',
      to: plageReleve?.[1]?.format('YYYY-MM-DD') ?? ''
    }),
    queryFn: () =>
      getPartnerStatement(tenantId as string, (associeConsulte as PartnershipShare).id, {
        from: plageReleve?.[0]?.format('YYYY-MM-DD'),
        to: plageReleve?.[1]?.format('YYYY-MM-DD')
      }),
    enabled: Boolean(tenantId && associeConsulte)
  });

  // ---------------------------------------------------------------------

  if (!tenantId || !partnershipId) {
    return <StateBlock variant="empty" title={t('Aucune association sélectionnée')} />;
  }

  const filAriane = [
    { label: t('Finance'), to: `/tenant/${tenantId}/finance/associations` },
    { label: t('Associations'), to: `/tenant/${tenantId}/finance/associations` },
    ...(association ? [{ label: association.label }] : [{ label: t('Association') }])
  ];

  if (erreurAssociation) {
    return (
      <>
        <PageHeader title={t('Association')} breadcrumbs={filAriane} />
        <StateBlock
          variant="error"
          description={t('Impossible de charger cette association.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetchAssociation(), primary: true }]}
        />
      </>
    );
  }

  if (associationEnAttente || !association) {
    return (
      <>
        <PageHeader title={t('Association')} breadcrumbs={filAriane} />
        <StateBlock variant="loading" />
      </>
    );
  }

  const colonnesAssocies: ColumnsType<PartnershipShare> = [
    { title: t('Associé'), key: 'associe', render: (_, s) => s.partnerName },
    { title: t('Quote-part'), key: 'part', align: 'end', render: (_, s) => pourcentage(s.sharePercent) },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, s) => (
        <Space>
          <Button
            type="link"
            onClick={() => {
              setAssocieConsulte(s);
              setPlageReleve(null);
            }}
          >
            {t("Voir l'état")}
          </Button>
          <ConfirmAction
            title={t('Retirer « {{partnerName}} » de cette association ?', { partnerName: s.partnerName })}
            description={t(
              "Cette opération est irréversible : l'historique de ce qui lui revient serait perdu. Le serveur refuse déjà ce geste si une ventilation a été constatée sur sa part — il faut d'abord solder son compte."
            )}
            okText={t('Confirmer le retrait')}
            danger
            onConfirm={() => retirerAssocie(s)}
          >
            <Button type="link" danger>
              {t('Retirer')}
            </Button>
          </ConfirmAction>
        </Space>
      )
    }
  ];

  const colonnesBiens: ColumnsType<PartnershipPropertyRef> = [
    { title: t('Bien'), key: 'bien', render: (_, p) => p.propertyLabel },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, p) => (
        <ConfirmAction
          title={t('Détacher « {{propertyLabel}} » de cette association ?', { propertyLabel: p.propertyLabel })}
          description={t(
            'Les loyers de ce bien ne seront plus répartis entre les associés à compter de la prochaine facturation. Les ventilations déjà constatées restent inchangées.'
          )}
          okText={t('Confirmer le détachement')}
          onConfirm={() => detacherBien(p)}
        >
          <Button type="link">{t('Détacher')}</Button>
        </ConfirmAction>
      )
    }
  ];

  const colonnesReleve: ColumnsType<PartnerStatementLine> = [
    { title: t('Bien'), key: 'bien', render: (_, l) => l.propertyLabel },
    { title: t('Période'), key: 'periode', render: (_, l) => libellePeriode(l.periodYear, l.periodMonth) },
    { title: t('Facturé'), key: 'facture', align: 'end', render: (_, l) => <MoneyValue value={l.rentBilled} /> },
    { title: t('Encaissé'), key: 'encaisse', align: 'end', render: (_, l) => <MoneyValue value={l.rentCollected} /> },
    {
      title: t('Sa part'),
      key: 'part',
      align: 'end',
      render: (_, l) => (
        <strong>
          <MoneyValue value={l.partnerShare} />
        </strong>
      )
    }
  ];

  // Rien ne reste à l'agence sur cette association : voir l'en-tête, ce
  // n'est pas un cas d'erreur, seulement un fait à ne pas taire.
  const rienPourLAgence = association.companySharePercent === 0;

  return (
    <>
      <PageHeader
        title={association.label}
        breadcrumbs={filAriane}
        extra={<StatusTag status={association.isActive ? 'ACTIVE' : 'INACTIVE'} />}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)'
        }}
      >
        <StatCard label={t('Total des quotes-parts')} value={pourcentage(association.totalSharePercent)} />
        <StatCard
          label={t("Part de l'agence")}
          value={pourcentage(association.companySharePercent)}
          tone={rienPourLAgence ? 'warning' : 'neutral'}
          hint={
            rienPourLAgence
              ? t("Les associés se partagent la totalité du loyer : rien ne reste à l'agence.")
              : undefined
          }
        />
      </div>

      <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
        {t('Associés')}
      </Title>
      <DataView<PartnershipShare>
        paginated={false}
        items={association.shares}
        total={association.shares.length}
        page={1}
        pageSize={Math.max(association.shares.length, 1)}
        onPageChange={() => {}}
        emptyDescription={t("Aucun associé n'est encore rattaché à cette association.")}
        columns={colonnesAssocies}
        rowKey={s => s.id}
        aria-label={t("Associés de l'association")}
        renderCard={s => (
          <DataCard
            title={s.partnerName}
            aria-label={s.partnerName}
            highlight={pourcentage(s.sharePercent)}
            primaryAction={{
              label: t("Voir l'état"),
              onClick: () => {
                setAssocieConsulte(s);
                setPlageReleve(null);
              }
            }}
            secondaryActions={[
              {
                key: 'retirer',
                danger: true,
                label: 'Retirer',
                onClick: () =>
                  confirmerAction({
                    title: t('Retirer « {{partnerName}} » de cette association ?', { partnerName: s.partnerName }),
                    description: t(
                      "Cette opération est irréversible : l'historique de ce qui lui revient serait perdu. Le serveur refuse déjà ce geste si une ventilation a été constatée sur sa part — il faut d'abord solder son compte."
                    ),
                    okText: t('Confirmer le retrait'),
                    danger: true,
                    onConfirm: () => retirerAssocie(s)
                  })
              }
            ]}
          />
        )}
      />

      <Card_AjoutAssocie
        nomAssocie={nomAssocie}
        setNomAssocie={setNomAssocie}
        quotePart={quotePart}
        setQuotePart={setQuotePart}
        peutAjouter={peutAjouterAssocie}
        ajoutEnCours={ajoutEnCours}
        onAjouter={ajouterAssocie}
      />

      <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
        {t('Biens rattachés')}
      </Title>
      <DataView<PartnershipPropertyRef>
        paginated={false}
        items={association.properties}
        total={association.properties.length}
        page={1}
        pageSize={Math.max(association.properties.length, 1)}
        onPageChange={() => {}}
        emptyDescription={t("Aucun bien n'est encore rattaché à cette association.")}
        columns={colonnesBiens}
        rowKey={p => p.propertyId}
        aria-label={t("Biens rattachés à l'association")}
        renderCard={p => (
          <DataCard
            title={p.propertyLabel}
            aria-label={p.propertyLabel}
            primaryAction={{
              label: t('Détacher'),
              onClick: () =>
                confirmerAction({
                  title: t('Détacher « {{propertyLabel}} » de cette association ?', { propertyLabel: p.propertyLabel }),
                  description: t(
                    'Les loyers de ce bien ne seront plus répartis entre les associés à compter de la prochaine facturation. Les ventilations déjà constatées restent inchangées.'
                  ),
                  okText: t('Confirmer le détachement'),
                  onConfirm: () => detacherBien(p)
                })
            }}
          />
        )}
      />

      <Card_RattacherBien
        options={optionsRattachement}
        valeur={bienARattacher}
        onChange={setBienARattacher}
        enCours={rattachementEnCours}
        onRattacher={rattacherBien}
      />

      <Modal
        title={
          associeConsulte
            ? t('État de quote-part — {{partnerName}}', { partnerName: associeConsulte.partnerName })
            : t('État de quote-part')
        }
        open={Boolean(associeConsulte)}
        onCancel={() => setAssocieConsulte(null)}
        footer={
          <Button type="primary" onClick={() => setAssocieConsulte(null)}>
            {t('Fermer')}
          </Button>
        }
        width={720}
        destroyOnHidden
      >
        {/* Relevé en lecture seule (priorité C du PRD) : rien ne s'y écrit,
            et rien n'y est recalculé — `totalShare` et `totalPaidOut`
            arrivent tout faits du contrat gelé. */}
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <label htmlFor="releve-periode">{t('Période (facultative)')}</label>
            <RangePicker
              id="releve-periode"
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              value={plageReleve}
              onChange={dates => setPlageReleve(dates && dates[0] && dates[1] ? [dates[0], dates[1]] : null)}
            />
          </div>

          {erreurReleve ? (
            <StateBlock variant="error" description={t("Impossible de charger l'état de quote-part de cet associé.")} />
          ) : (
            <DataView<PartnerStatementLine>
              paginated={false}
              items={releve?.lines ?? []}
              total={(releve?.lines ?? []).length}
              page={1}
              pageSize={Math.max((releve?.lines ?? []).length, 1)}
              onPageChange={() => {}}
              loading={releveEnAttente}
              emptyDescription={t('Aucun loyer réparti sur cette période.')}
              columns={colonnesReleve}
              rowKey={l => `${l.propertyLabel}-${l.periodYear}-${l.periodMonth}`}
              aria-label={t("Lignes de l'état de quote-part")}
              renderCard={l => (
                <DataCard
                  title={libellePeriode(l.periodYear, l.periodMonth)}
                  aria-label={libellePeriode(l.periodYear, l.periodMonth)}
                  subtitle={l.propertyLabel}
                  highlight={<MoneyValue value={l.partnerShare} />}
                  fields={[
                    { label: t('Facturé'), value: <MoneyValue value={l.rentBilled} /> },
                    { label: t('Encaissé'), value: <MoneyValue value={l.rentCollected} /> }
                  ]}
                />
              )}
            />
          )}

          {releve && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 'var(--space-3)'
              }}
            >
              <StatCard label={t('Total de sa part sur la période')} value={<MoneyValue value={releve.totalShare} />} />
              <StatCard label={t('Déjà reversé')} value={<MoneyValue value={releve.totalPaidOut} />} />
              {/*
                Le chiffre qu'un associé regarde en premier, et il ne se déduit
                PAS des deux précédents : ceux-là sont bornés à la période du
                relevé, celui-ci court sur toute l'histoire de son compte. La
                mention de la période est là pour que personne ne fasse la
                soustraction de tête et s'étonne de tomber sur autre chose.
              */}
              <StatCard label={t('Reste dû, toutes périodes')} value={<MoneyValue value={releve.accountBalance} />} />
            </div>
          )}
        </Space>
      </Modal>
    </>
  );
};

/**
 * Formulaire d'ajout d'un associé, extrait pour ne pas alourdir le corps
 * principal de la fiche : c'est un simple bloc de saisie, sans logique propre
 * au-delà de ses props.
 */
function Card_AjoutAssocie(props: {
  nomAssocie: string;
  setNomAssocie: (v: string) => void;
  quotePart: number | null;
  setQuotePart: (v: number | null) => void;
  peutAjouter: boolean;
  ajoutEnCours: boolean;
  onAjouter: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 'var(--space-4)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)'
      }}
    >
      <Title level={5} style={{ marginTop: 0 }}>
        {t('Ajouter un associé')}
      </Title>
      <Space wrap size="middle" align="end">
        <div>
          <div>
            <label htmlFor="associe-nom">{t("Nom de l'associé")}</label>
          </div>
          <Input
            id="associe-nom"
            value={props.nomAssocie}
            onChange={event => props.setNomAssocie(event.target.value)}
            placeholder={t('Ex. Fatoumata Diallo')}
          />
        </div>
        <div>
          <div>
            <label htmlFor="associe-part">{t('Quote-part (%)')}</label>
          </div>
          <InputNumber
            id="associe-part"
            min={0}
            max={100}
            step={0.01}
            style={{ width: 140 }}
            value={props.quotePart ?? undefined}
            onChange={value => props.setQuotePart((value as number | null) ?? null)}
          />
        </div>
        <Button type="primary" loading={props.ajoutEnCours} disabled={!props.peutAjouter} onClick={props.onAjouter}>
          {t("Ajouter l'associé")}
        </Button>
      </Space>
    </div>
  );
}

/** Même remarque que `Card_AjoutAssocie` : un bloc de saisie, extrait par lisibilité. */
function Card_RattacherBien(props: {
  options: { value: string; label: string }[];
  valeur: string | undefined;
  onChange: (v: string | undefined) => void;
  enCours: boolean;
  onRattacher: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 'var(--space-4)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)'
      }}
    >
      <Space wrap align="end" size="middle">
        <div style={{ minWidth: 260 }}>
          <div>
            <label htmlFor="rattacher-bien">{t('Rattacher un bien existant')}</label>
          </div>
          <Select
            id="rattacher-bien"
            style={{ width: '100%' }}
            placeholder={t('Choisir un bien')}
            value={props.valeur}
            onChange={props.onChange}
            options={props.options}
            notFoundContent={t('Aucun bien disponible')}
          />
        </div>
        <Button type="primary" loading={props.enCours} disabled={!props.valeur} onClick={props.onRattacher}>
          {t('Rattacher')}
        </Button>
      </Space>
    </div>
  );
}

export default Association;
