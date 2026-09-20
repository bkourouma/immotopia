import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, DatePicker, Input, InputNumber, Modal, Select, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { createLandLease, listLandLeases } from '../../services/finance-lot4-service';
import { listCostCategories } from '../../services/finance-lot2-service';
import type { LandLease } from '../../types/finance-lot4-types';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, StatusTag } from '../../components/primitives';
import { t } from '../../i18n/t';

/**
 * Baux de terrain — liste et création. Lot 4, sous-lot 1
 * (`specs/019-finance-baux-terrain/data-model.md` §5).
 *
 * Construit sur le même modèle que `pages/finance/Chantiers.tsx` : mêmes
 * primitives, une seule modale de création, un `<DataView>` non paginé
 * puisque le contrat de `listLandLeases` rend l'ensemble des baux du tenant
 * (au plus quelques dizaines, comme les chantiers).
 *
 * **Ce que cette liste rend visible en un coup d'œil.** Chaque bail affiche
 * son loyer annuel, sa mensualité (calculée par le serveur, jamais divisée
 * ici) et ce qu'il reste à consommer de l'avance versée — la colonne qui
 * traduit `accountBalance`, négatif quand on a payé d'avance, en une phrase
 * qui se lit (« il reste X à consommer »), jamais le nombre brut ni son
 * signe. Voir `resteAConsommer` ci-dessous et le commentaire du champ dans
 * `types/finance-lot4-types.ts`.
 *
 * **Vocabulaire (P-1 du PRD).** On *loue*, on *paie*, on *constate* — jamais
 * « débit » ni « crédit ».
 *
 * **Le poste de dépense est obligatoire à la création (ajout au contrat du
 * 19 septembre 2026).** C'est lui qui reçoit le loyer dans le coût des
 * chantiers rattachés : sans lui, la constatation mensuelle ne pourrait
 * produire aucune imputation. Le référentiel des postes est celui du lot 2
 * (`listCostCategories`), repris tel quel plutôt que redéfini ici.
 */

/**
 * Traduit le solde du compte de tiers en « ce qu'il reste à consommer ».
 *
 * `accountBalance` est négatif quand l'agence a payé d'avance (cas courant :
 * on règle un an, on consomme mois après mois). Ce qui reste à consommer est
 * alors l'opposé de ce solde. Si un bail affichait un solde positif — situation
 * qui ne devrait pas arriver en régime normal, voir `data-model.md` §7 —,
 * cette fonction rendrait un nombre négatif plutôt que de le masquer : mieux
 * vaut un chiffre qui alerte qu'un chiffre tronqué qui rassure à tort.
 */
function resteAConsommer(accountBalance: number): number {
  return -accountBalance;
}

export const BauxDeTerrain: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [modalOuvert, setModalOuvert] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [bailleur, setBailleur] = useState('');
  const [libelleTerrain, setLibelleTerrain] = useState('');
  const [loyerAnnuel, setLoyerAnnuel] = useState<number | null>(null);
  const [posteId, setPosteId] = useState<string | undefined>(undefined);
  const [dateDebut, setDateDebut] = useState<Dayjs | null>(null);
  const [dateFin, setDateFin] = useState<Dayjs | null>(null);

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('land-leases', tenantId, {}),
    queryFn: () => listLandLeases(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  // Référentiel des postes de dépense, pour le seul champ obligatoire du
  // formulaire de création — voir l'en-tête. Le lot 2 l'expose déjà : on ne
  // le redéfinit pas ici.
  const { data: postes } = useQuery({
    queryKey: queryKey('cost-categories', tenantId, {}),
    queryFn: () => listCostCategories(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const optionsPostes = useMemo(
    () =>
      (postes ?? [])
        .filter(p => p.isActive)
        .sort((a, b) => a.position - b.position)
        .map(p => ({ value: p.id, label: p.label })),
    [postes]
  );

  const baux = data ?? [];

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const reinitialiserFormulaire = () => {
    setBailleur('');
    setLibelleTerrain('');
    setLoyerAnnuel(null);
    setPosteId(undefined);
    setDateDebut(null);
    setDateFin(null);
  };

  const ouvrirCreation = () => {
    reinitialiserFormulaire();
    setModalOuvert(true);
  };

  const fermerCreation = () => {
    if (!creationEnCours) setModalOuvert(false);
  };

  const peutCreer =
    Boolean(bailleur.trim()) &&
    Boolean(libelleTerrain.trim()) &&
    Boolean(loyerAnnuel && loyerAnnuel > 0) &&
    Boolean(posteId) &&
    Boolean(dateDebut);

  const validerCreation = async () => {
    if (!peutCreer || !dateDebut || !posteId) {
      message.error(
        t('Le bailleur, le terrain, le loyer annuel, le poste de dépense et la date de début sont obligatoires.')
      );
      return;
    }
    setCreationEnCours(true);
    try {
      const bail = await createLandLease(tenantId, {
        landlordName: bailleur.trim(),
        landLabel: libelleTerrain.trim(),
        annualAmount: loyerAnnuel as number,
        costCategoryId: posteId,
        startDate: dateDebut.format('YYYY-MM-DD'),
        endDate: dateFin ? dateFin.format('YYYY-MM-DD') : null
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('land-leases', tenantId) });
      message.success(t('Bail « {{landLabel}} » enregistré.', { landLabel: bail.landLabel }));
      setModalOuvert(false);
      navigate(`/tenant/${tenantId}/finance/baux-terrain/${bail.id}`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement du bail a échoué."));
    } finally {
      setCreationEnCours(false);
    }
  };

  const ouvrirFiche = (bail: LandLease) => navigate(`/tenant/${tenantId}/finance/baux-terrain/${bail.id}`);

  const libelleChantiers = (bail: LandLease) =>
    bail.sites.length > 0 ? bail.sites.map(s => s.siteLabel).join(', ') : t('Aucun chantier rattaché');

  const colonnes: ColumnsType<LandLease> = [
    { title: t('Bailleur'), key: 'bailleur', render: (_, b) => b.landlordName },
    { title: t('Terrain'), key: 'terrain', render: (_, b) => b.landLabel },
    // Le nom du poste, jamais son identifiant (`costCategoryId`, présent dans
    // la donnée pour la traçabilité serveur mais jamais affiché).
    { title: t('Poste'), key: 'poste', render: (_, b) => b.costCategoryLabel },
    {
      title: t('Loyer annuel'),
      key: 'annuel',
      align: 'end',
      render: (_, b) => <MoneyValue value={b.annualAmount} />
    },
    {
      title: t('Mensualité'),
      key: 'mensuel',
      align: 'end',
      // Calculée côté serveur : cette colonne se contente de l'afficher,
      // jamais de diviser `annualAmount` par douze elle-même (voir l'en-tête).
      render: (_, b) => <MoneyValue value={b.monthlyAmount} />
    },
    {
      title: t('Reste à consommer'),
      key: 'reste',
      align: 'end',
      render: (_, b) => <MoneyValue value={resteAConsommer(b.accountBalance)} />
    },
    { title: t('Chantiers rattachés'), key: 'chantiers', render: (_, b) => libelleChantiers(b) },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, b) => <StatusTag status={b.isActive ? 'ACTIVE' : 'INACTIVE'} />
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, b) => (
        <Button type="link" onClick={() => ouvrirFiche(b)}>
          {t('Voir le bail')}
        </Button>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Baux de terrain')}
        subtitle={baux.length > 0 ? `${baux.length} bail${baux.length > 1 ? 'aux' : ''}` : undefined}
        primaryAction={{ label: t('Nouveau bail'), icon: <PlusOutlined />, onClick: ouvrirCreation }}
      />

      <DataView<LandLease>
        // Le contrat de `listLandLeases` ne pagine pas (data-model.md §5).
        paginated={false}
        scrollX={1200}
        items={baux}
        total={baux.length}
        page={1}
        pageSize={Math.max(baux.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les baux de terrain.') : null}
        onRetry={() => refetch()}
        emptyDescription={t("Aucun bail de terrain n'est encore enregistré.")}
        emptyAction={{ label: t('Nouveau bail'), onClick: ouvrirCreation }}
        columns={colonnes}
        rowKey={b => b.id}
        aria-label={t('Baux de terrain')}
        renderCard={b => (
          <DataCard
            title={b.landLabel}
            aria-label={b.landLabel}
            subtitle={b.landlordName}
            status={<StatusTag status={b.isActive ? 'ACTIVE' : 'INACTIVE'} />}
            highlight={<MoneyValue value={resteAConsommer(b.accountBalance)} />}
            fields={[
              { label: 'Poste', value: b.costCategoryLabel },
              { label: t('Loyer annuel'), value: <MoneyValue value={b.annualAmount} /> },
              { label: t('Mensualité'), value: <MoneyValue value={b.monthlyAmount} /> },
              { label: 'Chantiers', value: libelleChantiers(b) }
            ]}
            onOpen={() => ouvrirFiche(b)}
          />
        )}
      />

      <Modal
        title={t('Nouveau bail de terrain')}
        open={modalOuvert}
        onCancel={fermerCreation}
        confirmLoading={creationEnCours}
        onOk={validerCreation}
        okText={t('Enregistrer le bail')}
        cancelText={t('Annuler')}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <label htmlFor="bail-bailleur">{t('Bailleur')}</label>
            <Input
              id="bail-bailleur"
              value={bailleur}
              onChange={event => setBailleur(event.target.value)}
              placeholder={t('Ex. Mamadou Camara')}
            />
          </div>
          <div>
            <label htmlFor="bail-terrain">{t('Terrain loué')}</label>
            <Input
              id="bail-terrain"
              value={libelleTerrain}
              onChange={event => setLibelleTerrain(event.target.value)}
              placeholder={t('Ex. Terrain de Nongo, 800 m²')}
            />
          </div>
          <div>
            <label htmlFor="bail-loyer">{t('Loyer annuel (FCFA)')}</label>
            <InputNumber
              id="bail-loyer"
              style={{ width: '100%' }}
              min={0}
              value={loyerAnnuel ?? undefined}
              onChange={value => setLoyerAnnuel((value as number | null) ?? null)}
            />
          </div>
          <div>
            <label htmlFor="bail-poste">{t('Poste de dépense')}</label>
            {/* C'est ce poste qui reçoit le loyer dans le coût des chantiers
                rattachés (voir l'en-tête) : sans lui, aucune constatation
                mensuelle ne pourrait produire d'imputation. */}
            <Select
              id="bail-poste"
              style={{ width: '100%' }}
              placeholder={t('Choisir un poste')}
              value={posteId}
              onChange={setPosteId}
              options={optionsPostes}
            />
          </div>
          <Space style={{ width: '100%' }} size="middle">
            <div style={{ flex: 1 }}>
              <label htmlFor="bail-debut">{t('Début')}</label>
              <DatePicker
                id="bail-debut"
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                value={dateDebut}
                onChange={setDateDebut}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="bail-fin">{t('Fin (facultative — tacite reconduction sinon)')}</label>
              <DatePicker
                id="bail-fin"
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                value={dateFin}
                onChange={setDateFin}
                disabledDate={current => (dateDebut ? current.isBefore(dateDebut, 'day') : false)}
              />
            </div>
          </Space>
        </Space>
      </Modal>
    </>
  );
};

export default BauxDeTerrain;
