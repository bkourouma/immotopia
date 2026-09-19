import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Button, Input, Modal, Space, Switch, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createEmployee, listEmployees } from '../../services/finance-salaries-service';
import type { Employee } from '../../types/finance-salaries-types';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, StatusTag } from '../../components/primitives';

const { Text } = Typography;

/**
 * Salaires — la liste des salariés, et l'enregistrement d'un salarié. Lot 4,
 * troisième sous-lot (PRD E8, besoins B11 et P9 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot4-salaries.ts`).
 *
 * Chemin supposé : `/tenant/:tenantId/finance/salaires`. **Cet écran n'est pas
 * câblé** : `App.tsx`, `navigation/model.tsx`, `dev/atelier/Atelier.tsx` et
 * `dev/atelier/mock-api.ts` sont des fichiers-registres réservés au
 * superviseur, qui les branche à l'intégration. `tenantId` est lu dans le
 * CHEMIN (`useParams`), jamais en paramètre de requête.
 *
 * Construite sur le même modèle que `pages/finance/Associations.tsx` : mêmes
 * primitives, une seule modale de création, un `<DataView>` non paginé
 * puisque `listEmployees` rend l'ensemble des salariés du tenant (au plus
 * quelques dizaines).
 *
 * ---------------------------------------------------------------------------
 * Ce que cette liste rend visible en un coup d'œil
 * ---------------------------------------------------------------------------
 *
 * Le salarié, son rôle, et **ce qu'on lui doit**. `accountBalance` est positif
 * quand nous lui devons ; il devient négatif après une avance sur salaire,
 * qu'un règlement supérieur au solde produit délibérément (contrat gelé,
 * `ValidateSalaryPaymentTx`). Ces deux situations ne se lisent pas de la même
 * façon, et un nombre signé nu ne les distingue pas : `libelleSolde` ci-dessous
 * dit laquelle des deux on regarde, en toutes lettres.
 *
 * **Aucun montant n'est calculé ici.** Le solde arrive tout fait du serveur.
 * Le seul geste appliqué à un nombre est un changement de signe pour dire
 * « avance de X » plutôt que « moins X » — une mise en mots, pas un calcul,
 * et le même parti pris que `resteAConsommer` dans `BauxDeTerrain.tsx`.
 *
 * **Vocabulaire (P-1 du PRD).** On *saisit* une note, on la *valide*, on
 * *règle* un salarié — jamais « débit » ni « crédit ».
 */

/** Ce que dit le solde, en toutes lettres. Voir l'en-tête : un signe ne se lit pas. */
function libelleSolde(employe: Employee): React.ReactNode {
  if (employe.accountBalance > 0) {
    return <MoneyValue value={employe.accountBalance} />;
  }
  if (employe.accountBalance === 0) {
    return <Text type="secondary">Rien à lui verser</Text>;
  }
  return (
    <Text type="warning">
      Avance de <MoneyValue value={-employe.accountBalance} /> à retenir
    </Text>
  );
}

export const Salaires: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Le filtre est posé par défaut : la question courante est « qui dois-je
  // payer ce mois-ci », et un ancien salarié soldé n'y répond pas. Il reste
  // visible et désactivable — `<DataView>` a besoin de savoir qu'un filtre est
  // posé pour distinguer « aucun salarié » de « aucun résultat ».
  const [actifsSeulement, setActifsSeulement] = useState(true);

  const [modalOuvert, setModalOuvert] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [nomComplet, setNomComplet] = useState('');
  const [role, setRole] = useState('');

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('employees', tenantId, { onlyActive: actifsSeulement }),
    queryFn: () => listEmployees(tenantId as string, { onlyActive: actifsSeulement }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const salaries = data ?? [];

  if (!tenantId) {
    return <StateBlock variant="empty" title="Aucune agence sélectionnée" />;
  }

  const ouvrirCreation = () => {
    setNomComplet('');
    setRole('');
    setModalOuvert(true);
  };

  const fermerCreation = () => {
    if (!creationEnCours) setModalOuvert(false);
  };

  const peutCreer = Boolean(nomComplet.trim());

  const validerCreation = async () => {
    if (!peutCreer) {
      message.error('Le nom du salarié est obligatoire.');
      return;
    }
    setCreationEnCours(true);
    try {
      // `role` est laissé de côté quand il est vide : le schéma serveur refuse
      // la chaîne vide, et le service l'omet plutôt que de l'envoyer.
      const salarie = await createEmployee(tenantId, {
        fullName: nomComplet.trim(),
        role: role.trim() || undefined
      });
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('employees', tenantId) });
      message.success(`Salarié « ${salarie.fullName} » enregistré.`);
      setModalOuvert(false);
      navigate(`/tenant/${tenantId}/finance/salaires/${salarie.id}`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || "L'enregistrement du salarié a échoué.");
    } finally {
      setCreationEnCours(false);
    }
  };

  const ouvrirFiche = (salarie: Employee) => navigate(`/tenant/${tenantId}/finance/salaires/${salarie.id}`);

  const colonnes: ColumnsType<Employee> = [
    { title: 'Salarié', key: 'nom', render: (_, e) => e.fullName },
    { title: 'Rôle', key: 'role', render: (_, e) => e.role ?? '—' },
    {
      // La colonne que la gestionnaire regarde en premier. Le libellé dit le
      // sens du nombre : « ce qu'on lui doit », jamais un solde nu.
      title: 'Ce qu’on lui doit',
      key: 'solde',
      align: 'right',
      render: (_, e) => libelleSolde(e)
    },
    {
      title: 'Statut',
      key: 'statut',
      render: (_, e) => <StatusTag status={e.isActive ? 'ACTIVE' : 'INACTIVE'} />
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, e) => (
        <Button type="link" onClick={() => ouvrirFiche(e)}>
          Voir la fiche
        </Button>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title="Salaires"
        subtitle={salaries.length > 0 ? `${salaries.length} salarié${salaries.length > 1 ? 's' : ''}` : undefined}
        primaryAction={{ label: 'Nouveau salarié', icon: <PlusOutlined />, onClick: ouvrirCreation }}
        extra={
          <Space size="small">
            <Switch
              id="salaries-actifs-seulement"
              checked={actifsSeulement}
              onChange={setActifsSeulement}
              aria-label="Actifs seulement"
            />
            <label htmlFor="salaries-actifs-seulement">Actifs seulement</label>
          </Space>
        }
      />

      <DataView<Employee>
        // Le contrat de `listEmployees` ne pagine pas.
        paginated={false}
        scrollX={900}
        items={salaries}
        total={salaries.length}
        page={1}
        pageSize={Math.max(salaries.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? 'Impossible de charger les salariés.' : null}
        onRetry={() => refetch()}
        isFiltered={actifsSeulement}
        onClearFilters={() => setActifsSeulement(false)}
        emptyDescription="Aucun salarié n'est encore enregistré."
        emptyAction={{ label: 'Nouveau salarié', onClick: ouvrirCreation }}
        columns={colonnes}
        rowKey={e => e.id}
        aria-label="Salariés"
        renderCard={e => (
          <DataCard
            title={e.fullName}
            aria-label={e.fullName}
            subtitle={e.role ?? undefined}
            status={<StatusTag status={e.isActive ? 'ACTIVE' : 'INACTIVE'} />}
            highlight={libelleSolde(e)}
            fields={[{ label: 'Ce qu’on lui doit', value: libelleSolde(e) }]}
            onOpen={() => ouvrirFiche(e)}
          />
        )}
      />

      <Modal
        title="Nouveau salarié"
        open={modalOuvert}
        onCancel={fermerCreation}
        confirmLoading={creationEnCours}
        onOk={validerCreation}
        okText="Enregistrer le salarié"
        cancelText="Annuler"
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <label htmlFor="salarie-nom">Nom du salarié</label>
            {/* Un salarié n'est pas un `User` : un maçon n'ouvre pas
                l'application, et son compte de tiers naît avec lui (contrat
                gelé, `CreateEmployeeTx`). Rien d'autre à ouvrir ici. */}
            <Input
              id="salarie-nom"
              value={nomComplet}
              onChange={event => setNomComplet(event.target.value)}
              placeholder="Ex. Ibrahima Sylla"
            />
          </div>
          <div>
            <label htmlFor="salarie-role">Rôle (facultatif)</label>
            <Input
              id="salarie-role"
              value={role}
              onChange={event => setRole(event.target.value)}
              placeholder="Ex. Maçon"
            />
          </div>
          <Text type="secondary">
            Aucune cotisation n'est calculée : le montant saisi sur une note de salaire est celui qui sera versé.
          </Text>
        </Space>
      </Modal>
    </>
  );
};

export default Salaires;
