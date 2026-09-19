import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, Checkbox, Input, Modal, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContractor, listContractors } from '../../services/finance-contractors-service';
import type { Contractor } from '../../types/finance-contractors-types';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, DataView, DataCard, MoneyValue, StatusTag } from '../../components/primitives';

const { Text } = Typography;

/**
 * Tâcherons — liste et enregistrement. Lot 4, quatrième sous-lot (PRD E8,
 * besoin P10 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot4-contractors.ts`).
 *
 * **Fichiers-registres, hors du territoire de cet agent.** Cet écran n'est
 * câblé nulle part : `App.tsx`, `navigation/model.tsx`,
 * `dev/atelier/Atelier.tsx` et `dev/atelier/mock-api.ts` appartiennent au
 * superviseur, qui les branche à l'intégration. Les chemins supposés, et
 * déclarés ici comme tels, sont :
 *
 * - `/tenant/:tenantId/finance/tacherons` — cet écran
 * - `/tenant/:tenantId/finance/tacherons/:contractorId` — `Tacheron.tsx`
 *
 * `tenantId` est lu dans le CHEMIN (`useParams`), jamais en paramètre de
 * requête : le défaut relevé deux fois au lot 2.
 *
 * ---------------------------------------------------------------------------
 * Un tâcheron n'est pas un fournisseur
 * ---------------------------------------------------------------------------
 *
 * Il ne facture pas : il convient d'un marché, puis présente des situations
 * d'avancement. Cette liste montre donc son métier et **ce qu'on lui doit**,
 * jamais un encours de factures.
 *
 * ---------------------------------------------------------------------------
 * « Ce qu'on lui doit » — et surtout pas « solde »
 * ---------------------------------------------------------------------------
 *
 * `accountBalance` vaut « situations validées − règlements » : ce qui reste à
 * **payer**. Il ne faut jamais le confondre avec le **marché restant**
 * (« montant convenu − situations validées », ce qui reste à **exécuter**), qui
 * vit sur chaque marché et se lit sur la fiche. Les deux sont nommés en toutes
 * lettres partout, et le mot « solde » seul n'apparaît nulle part.
 *
 * Positif, il dit que nous lui devons. Négatif, il dit qu'il a reçu une avance
 * que ses prochaines situations résorberont : la liste l'écrit, plutôt que de
 * laisser un nombre négatif sans explication. Le chiffre est affiché tel que
 * le serveur l'émet — **aucun montant n'est calculé ici** (principe P-4).
 *
 * **Vocabulaire (P-1 du PRD).** On *convient* d'un marché, on *saisit* une
 * situation, on la *valide*, on *règle* un tâcheron — jamais « débit » ni
 * « crédit ».
 */

/** Ce qu'on doit au tâcheron, nommé en toutes lettres et jamais recalculé. */
function CeQuOnLuiDoit({ contractor }: { contractor: Contractor }): React.ReactElement {
  return (
    <Space orientation="vertical" size={0} style={{ alignItems: 'flex-end' }}>
      <MoneyValue value={contractor.accountBalance} signed />
      {contractor.accountBalance < 0 && (
        <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
          Avance déjà versée : ses prochaines situations la résorberont.
        </Text>
      )}
    </Space>
  );
}

export const Tacherons: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filtre « actifs seulement ». Décoché par défaut : un tâcheron désactivé
  // peut rester créancier, et le masquer d'office ferait disparaître une dette.
  const [actifsSeulement, setActifsSeulement] = useState(false);

  const [modalOuvert, setModalOuvert] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [nomComplet, setNomComplet] = useState('');
  const [metier, setMetier] = useState('');

  const filtres = actifsSeulement ? { onlyActive: true } : {};

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('contractors', tenantId, filtres),
    queryFn: () => listContractors(tenantId as string, actifsSeulement ? { onlyActive: true } : undefined),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const tacherons = data ?? [];

  if (!tenantId) {
    return <StateBlock variant="empty" title="Aucune agence sélectionnée" />;
  }

  const ouvrirCreation = () => {
    setNomComplet('');
    setMetier('');
    setModalOuvert(true);
  };

  const fermerCreation = () => {
    if (!creationEnCours) setModalOuvert(false);
  };

  const peutCreer = Boolean(nomComplet.trim());

  const validerCreation = async () => {
    if (!peutCreer) {
      message.error('Le nom du tâcheron est obligatoire.');
      return;
    }
    setCreationEnCours(true);
    try {
      // `trade` vide n'est pas envoyé en chaîne vide : le service le retire
      // (le schéma serveur le refuserait en 400).
      const tacheron = await createContractor(tenantId, { fullName: nomComplet.trim(), trade: metier.trim() });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('contractors', tenantId) });
      message.success(`Tâcheron « ${tacheron.fullName} » enregistré.`);
      setModalOuvert(false);
      navigate(`/tenant/${tenantId}/finance/tacherons/${tacheron.id}`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || "L'enregistrement du tâcheron a échoué.");
    } finally {
      setCreationEnCours(false);
    }
  };

  const ouvrirFiche = (tacheron: Contractor) => navigate(`/tenant/${tenantId}/finance/tacherons/${tacheron.id}`);

  const colonnes: ColumnsType<Contractor> = [
    { title: 'Tâcheron', key: 'nom', render: (_, t) => t.fullName },
    {
      title: 'Corps de métier',
      key: 'metier',
      render: (_, t) => t.trade ?? <Text type="secondary">Non renseigné</Text>
    },
    {
      // Jamais « solde » : voir l'en-tête. Ce n'est pas le marché restant.
      title: "Ce qu'on lui doit",
      key: 'du',
      align: 'right',
      render: (_, t) => <CeQuOnLuiDoit contractor={t} />
    },
    {
      title: 'Statut',
      key: 'statut',
      render: (_, t) => <StatusTag status={t.isActive ? 'ACTIVE' : 'INACTIVE'} />
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, t) => (
        <Button type="link" onClick={() => ouvrirFiche(t)}>
          Voir la fiche
        </Button>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title="Tâcherons"
        subtitle={tacherons.length > 0 ? `${tacherons.length} tâcheron${tacherons.length > 1 ? 's' : ''}` : undefined}
        primaryAction={{ label: 'Nouveau tâcheron', icon: <PlusOutlined />, onClick: ouvrirCreation }}
      />

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <Checkbox checked={actifsSeulement} onChange={event => setActifsSeulement(event.target.checked)}>
          Tâcherons actifs uniquement
        </Checkbox>
      </div>

      <DataView<Contractor>
        // Le contrat de `listContractors` ne pagine pas.
        paginated={false}
        scrollX={1000}
        items={tacherons}
        total={tacherons.length}
        page={1}
        pageSize={Math.max(tacherons.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? 'Impossible de charger les tâcherons.' : null}
        onRetry={() => refetch()}
        isFiltered={actifsSeulement}
        onClearFilters={() => setActifsSeulement(false)}
        emptyDescription="Aucun tâcheron n'est encore enregistré."
        emptyAction={{ label: 'Nouveau tâcheron', onClick: ouvrirCreation }}
        columns={colonnes}
        rowKey={t => t.id}
        aria-label="Tâcherons"
        renderCard={t => (
          <DataCard
            title={t.fullName}
            aria-label={t.fullName}
            subtitle={t.trade ?? 'Corps de métier non renseigné'}
            status={<StatusTag status={t.isActive ? 'ACTIVE' : 'INACTIVE'} />}
            highlight={<MoneyValue value={t.accountBalance} signed />}
            fields={[{ label: "Ce qu'on lui doit", value: <CeQuOnLuiDoit contractor={t} /> }]}
            onOpen={() => ouvrirFiche(t)}
          />
        )}
      />

      <Modal
        title="Nouveau tâcheron"
        open={modalOuvert}
        onCancel={fermerCreation}
        confirmLoading={creationEnCours}
        onOk={validerCreation}
        okText="Enregistrer le tâcheron"
        cancelText="Annuler"
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <label htmlFor="tacheron-nom">Nom du tâcheron</label>
            <Input
              id="tacheron-nom"
              value={nomComplet}
              onChange={event => setNomComplet(event.target.value)}
              placeholder="Ex. Sékou Camara"
            />
          </div>
          <div>
            <label htmlFor="tacheron-metier">Corps de métier (facultatif)</label>
            {/* Facultatif, mais jamais envoyé en chaîne vide : le service
                retire la clé quand le champ est laissé vide. */}
            <Input
              id="tacheron-metier"
              value={metier}
              onChange={event => setMetier(event.target.value)}
              placeholder="Ex. Maçonnerie"
            />
          </div>
          <Text type="secondary">
            L'enregistrement ouvre son compte de tiers. Les marchés se conviennent ensuite, depuis sa fiche.
          </Text>
        </Space>
      </Modal>
    </>
  );
};

export default Tacherons;
