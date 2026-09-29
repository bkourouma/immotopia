import React, { useState } from 'react';
import { Alert, Button, Card, Input, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createScenario,
  deleteScenario,
  listScenarios,
  updateScenario,
  type ScenarioDto,
  type ScenarioInput
} from '../../../services/patrimoine-projections-service';
import { apiErrorMessage } from '../actifs/asset-format';
import { ConfirmAction, StateBlock } from '../../primitives';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { t } from '../../../i18n/t';
import { scenarioLabel } from './projection-helpers';

const NAME_MAX = 120;

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

/** 409 : nom déjà pris ou plafond de scénarios atteint. Le message du serveur prime, sinon un texte clair. */
function scenarioErrorMessage(error: unknown, fallback: string): string {
  const message = apiErrorMessage(error, '');
  if (message) return message;
  if (statusOf(error) === 409)
    return t('Ce nom est déjà utilisé, ou la limite de 100 scénarios enregistrés est atteinte.');
  return fallback;
}

/**
 * Scénarios enregistrés : enregistrer les réglages courants, ouvrir, renommer,
 * mettre à jour ou supprimer. Aucun résultat n'est stocké : « Ouvrir » recharge
 * les réglages et relance le calcul. Le client ne connaît pas les permissions :
 * un refus 403 du serveur retire les boutons d'écriture.
 */
export const ScenariosPanel: React.FC<{
  tenantId: string;
  current: ScenarioInput;
  onOpen: (scenario: ScenarioDto) => void;
  openedId: string | null;
}> = ({ tenantId, current, onOpen, openedId }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useQuery({
    queryKey: queryKey('patrimoine-scenarios', tenantId),
    queryFn: () => listScenarios(tenantId),
    staleTime: STALE_TIME.list
  });

  const write = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patrimoine-scenarios'] })
  });

  const run = async (action: () => Promise<unknown>, fallback: string, success: string): Promise<boolean> => {
    setError(null);
    setNotice(null);
    try {
      await write.mutateAsync(action);
      setNotice(success);
      return true;
    } catch (failure) {
      if (statusOf(failure) === 403) setDenied(true);
      setError(scenarioErrorMessage(failure, fallback));
      return false;
    }
  };

  const trimmed = name.trim();
  const save = async () => {
    const saved = await run(
      () => createScenario(tenantId, { ...current, name: trimmed }),
      t("Impossible d'enregistrer ce scénario."),
      t('Scénario enregistré.')
    );
    if (saved) setName('');
  };

  const rename = async () => {
    if (!renaming) return;
    const value = renaming.name.trim();
    if (!value) return;
    const done = await run(
      () => updateScenario(tenantId, renaming.id, { name: value }),
      t('Impossible de renommer ce scénario.'),
      t('Scénario renommé.')
    );
    if (done) setRenaming(null);
  };

  return (
    <Card title={t('Scénarios enregistrés')}>
      {!denied && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 240px' }}>
            <label htmlFor="scenario-name" style={{ display: 'block', marginBottom: 4 }}>
              {t('Nom du scénario')}
            </label>
            <Input
              id="scenario-name"
              maxLength={NAME_MAX}
              value={name}
              onChange={event => setName(event.target.value)}
            />
          </div>
          <Button type="primary" onClick={save} disabled={!trimmed} loading={write.isPending}>
            {t('Enregistrer ce scénario')}
          </Button>
        </div>
      )}
      {error && <Alert type="error" showIcon style={{ marginTop: 'var(--space-3)' }} title={error} />}
      {notice && !error && <Alert type="success" showIcon style={{ marginTop: 'var(--space-3)' }} title={notice} />}

      <div style={{ marginTop: 'var(--space-4)' }}>
        {list.error ? (
          <StateBlock
            variant="error"
            description={t('Impossible de charger les scénarios enregistrés.')}
            actions={[{ label: t('Réessayer'), onClick: () => list.refetch(), primary: true }]}
          />
        ) : list.isPending ? (
          <Typography.Text type="secondary">{t('Chargement des scénarios…')}</Typography.Text>
        ) : (list.data ?? []).length === 0 ? (
          <Typography.Text type="secondary">{t("Aucun scénario enregistré pour l'instant.")}</Typography.Text>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {(list.data ?? []).map(scenario => (
              <li
                key={scenario.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--space-2)',
                  alignItems: 'center',
                  marginBottom: 'var(--space-2)'
                }}
              >
                {renaming?.id === scenario.id ? (
                  <>
                    <Input
                      aria-label={t('Nouveau nom du scénario')}
                      style={{ maxWidth: 280 }}
                      maxLength={NAME_MAX}
                      value={renaming.name}
                      onChange={event => setRenaming({ id: scenario.id, name: event.target.value })}
                    />
                    <Button size="small" type="primary" onClick={rename} disabled={!renaming.name.trim()}>
                      {t('Valider')}
                    </Button>
                    <Button size="small" onClick={() => setRenaming(null)}>
                      {t('Annuler')}
                    </Button>
                  </>
                ) : (
                  <>
                    <strong>{scenario.name}</strong>
                    <Typography.Text type="secondary">
                      {t('{{years}} ans, {{scenario}}', {
                        years: scenario.horizonYears,
                        scenario: scenarioLabel(scenario.baseScenario)
                      })}
                      {openedId === scenario.id ? ` — ${t('ouvert')}` : ''}
                    </Typography.Text>
                    <Button size="small" onClick={() => onOpen(scenario)}>
                      {t('Ouvrir')}
                    </Button>
                    {!denied && (
                      <>
                        <Button size="small" onClick={() => setRenaming({ id: scenario.id, name: scenario.name })}>
                          {t('Renommer')}
                        </Button>
                        <ConfirmAction
                          title={t('Mettre à jour « {{name}} » avec les réglages actuels ?', { name: scenario.name })}
                          okText={t('Mettre à jour')}
                          onConfirm={() =>
                            run(
                              () => updateScenario(tenantId, scenario.id, current),
                              t('Impossible de mettre à jour ce scénario.'),
                              t('Scénario mis à jour.')
                            )
                          }
                        >
                          <Button size="small">{t('Mettre à jour')}</Button>
                        </ConfirmAction>
                        <ConfirmAction
                          danger
                          title={t('Supprimer « {{name}} » ?', { name: scenario.name })}
                          okText={t('Supprimer')}
                          onConfirm={() =>
                            run(
                              () => deleteScenario(tenantId, scenario.id),
                              t('Impossible de supprimer ce scénario.'),
                              t('Scénario supprimé.')
                            )
                          }
                        >
                          <Button size="small" danger>
                            {t('Supprimer')}
                          </Button>
                        </ConfirmAction>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};
