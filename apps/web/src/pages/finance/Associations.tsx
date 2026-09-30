import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, Input, Modal, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPartnership, listPartnerships } from '../../services/finance-partnerships-service';
import type { Partnership } from '../../types/finance-partnerships-types';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, DataView, DataCard, StatusTag } from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
/**
 * Associations — liste et création. Lot 4, deuxième sous-lot (PRD E7, besoin
 * B9 ; contrat gelé `packages/api/src/lib/finance/types-lot4-partnerships.ts`).
 *
 * Construite sur le même modèle que `pages/finance/BauxDeTerrain.tsx` : mêmes
 * primitives, une seule modale de création, un `<DataView>` non paginé
 * puisque `listPartnerships` rend l'ensemble des associations du tenant (au
 * plus quelques dizaines, comme les baux de terrain).
 *
 * **Ce que cette liste rend visible en un coup d'œil.** Chaque association
 * affiche la somme de ses quotes-parts ET ce qui reste à l'entreprise
 * (`companySharePercent`) — jamais l'un sans l'autre : un total à cent pour
 * cent ne laisse rien à l'agence, et l'écran doit le dire plutôt que le taire
 * en affichant seulement la colonne qui flatte. Aucun des deux nombres n'est
 * recalculé ici : les deux arrivent tout faits du contrat gelé.
 *
 * **Vocabulaire (P-1 du PRD).** On *répartit*, on *reverse*, on *retire* un
 * associé — jamais « débit » ni « crédit ».
 */

/** Un pourcentage se lit comme tel, jamais comme un montant : pas de `<MoneyValue>` ici. */
function pourcentage(valeur: number): string {
  return `${valeur.toLocaleString(activeLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} %`;
}

export const Associations: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [modalOuvert, setModalOuvert] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [libelle, setLibelle] = useState('');

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('partnerships', tenantId, {}),
    queryFn: () => listPartnerships(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const associations = data ?? [];

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const ouvrirCreation = () => {
    setLibelle('');
    setModalOuvert(true);
  };

  const fermerCreation = () => {
    if (!creationEnCours) setModalOuvert(false);
  };

  const peutCreer = Boolean(libelle.trim());

  const validerCreation = async () => {
    if (!peutCreer) {
      message.error(t('Le nom de l’association est obligatoire.'));
      return;
    }
    setCreationEnCours(true);
    try {
      const association = await createPartnership(tenantId, { label: libelle.trim() });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('partnerships', tenantId) });
      message.success(t('Association « {{label}} » enregistrée.', { label: association.label }));
      setModalOuvert(false);
      navigate(`/tenant/${tenantId}/finance/associations/${association.id}`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement de l'association a échoué."));
    } finally {
      setCreationEnCours(false);
    }
  };

  const ouvrirFiche = (association: Partnership) =>
    navigate(`/tenant/${tenantId}/finance/associations/${association.id}`);

  const libelleAssocies = (association: Partnership) =>
    association.shares.length > 0 ? association.shares.map(s => s.partnerName).join(', ') : t('Aucun associé');

  const libelleBiens = (association: Partnership) =>
    association.properties.length > 0
      ? association.properties.map(p => p.propertyLabel).join(', ')
      : t('Aucun bien rattaché');

  const colonnes: ColumnsType<Partnership> = [
    { title: t('Association'), key: 'label', render: (_, a) => a.label },
    { title: t('Associés'), key: 'associes', render: (_, a) => libelleAssocies(a) },
    // Les deux nombres qui doivent toujours se lire ensemble : voir l'en-tête.
    {
      title: t('Total des quotes-parts'),
      key: 'total-parts',
      align: 'end',
      render: (_, a) => pourcentage(a.totalSharePercent)
    },
    {
      title: t("Part de l'agence"),
      key: 'part-agence',
      align: 'end',
      render: (_, a) => pourcentage(a.companySharePercent)
    },
    { title: t('Biens rattachés'), key: 'biens', render: (_, a) => libelleBiens(a) },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, a) => <StatusTag status={a.isActive ? 'ACTIVE' : 'INACTIVE'} />
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, a) => (
        <Button type="link" onClick={() => ouvrirFiche(a)}>
          {t('Voir la fiche')}
        </Button>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Associations')}
        subtitle={
          associations.length > 0
            ? `${associations.length} association${associations.length > 1 ? 's' : ''}`
            : undefined
        }
        primaryAction={{ label: t('Nouvelle association'), icon: <PlusOutlined />, onClick: ouvrirCreation }}
      />

      <DataView<Partnership>
        // Le contrat de `listPartnerships` ne pagine pas.
        paginated={false}
        scrollX={1200}
        items={associations}
        total={associations.length}
        page={1}
        pageSize={Math.max(associations.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les associations.') : null}
        onRetry={() => refetch()}
        emptyDescription={t("Aucune association n'est encore enregistrée.")}
        emptyAction={{ label: t('Nouvelle association'), onClick: ouvrirCreation }}
        columns={colonnes}
        rowKey={a => a.id}
        aria-label={t('Associations')}
        renderCard={a => (
          <DataCard
            title={a.label}
            aria-label={a.label}
            subtitle={libelleAssocies(a)}
            status={<StatusTag status={a.isActive ? 'ACTIVE' : 'INACTIVE'} />}
            highlight={pourcentage(a.companySharePercent)}
            fields={[
              { label: t('Total des quotes-parts'), value: pourcentage(a.totalSharePercent) },
              { label: t("Part de l'agence"), value: pourcentage(a.companySharePercent) },
              { label: t('Biens'), value: libelleBiens(a) }
            ]}
            onOpen={() => ouvrirFiche(a)}
          />
        )}
      />

      <Modal
        title={t('Nouvelle association')}
        open={modalOuvert}
        onCancel={fermerCreation}
        confirmLoading={creationEnCours}
        onOk={validerCreation}
        okText={t("Enregistrer l'association")}
        cancelText={t('Annuler')}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <label htmlFor="association-label">{t("Nom de l'association")}</label>
            {/* La création n'ouvre aucun associé (contrat gelé,
                `CreatePartnershipTx`) : ils s'ajoutent ensuite, un par un,
                depuis la fiche — une association se constitue rarement d'un
                coup. */}
            <Input
              id="association-label"
              value={libelle}
              onChange={event => setLibelle(event.target.value)}
              placeholder={t('Ex. Villa Riviera — indivision Kouadio')}
            />
          </div>
        </Space>
      </Modal>
    </>
  );
};

export default Associations;
