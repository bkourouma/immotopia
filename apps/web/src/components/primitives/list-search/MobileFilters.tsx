import React, { useState } from 'react';
import { Button, Drawer, Typography } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import { t } from '../../../i18n/t';
import type { SearchCriterion, SearchOption, SearchValue, SearchValues } from '../../../utils/list-search/types';
import { CriterionControl } from './controls';
import { emitValue, isActiveValue } from './format';
import './list-search.css';

/**
 * Bouton « Filtres » et feuille du bas (§5.4, rendu < 992 px).
 *
 * Les critères ne s'appliquent qu'au clic sur « Appliquer » : les modifier
 * écrit dans un BROUILLON, recopié depuis `values` à chaque ouverture. Fermer
 * la feuille autrement l'abandonne. « Appliquer » envoie tout le brouillon en
 * UN seul `onChange` (un seul aller-retour d'URL, un seul rechargement).
 */

export type NonTextCriterion = Exclude<SearchCriterion, { type: 'text' }>;

export interface MobileFiltersProps {
  criteria: readonly NonTextCriterion[];
  values: SearchValues;
  labels: Readonly<Record<string, string>>;
  remember: (key: string, options: readonly SearchOption[]) => void;
  /** Reçoit TOUS les critères de la feuille (les inactifs en `undefined`). */
  onApply: (next: Partial<SearchValues>) => void;
  /** Le bouton prend toute la largeur quand il n'y a pas de champ libre à côté. */
  block?: boolean;
}

function pick(criteria: readonly NonTextCriterion[], values: SearchValues): Record<string, SearchValue> {
  const draft: Record<string, SearchValue> = {};
  for (const criterion of criteria) draft[criterion.key] = emitValue(values[criterion.key]);
  return draft;
}

export function MobileFilters({ criteria, values, labels, remember, onApply, block }: MobileFiltersProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, SearchValue>>({});

  const appliedCount = criteria.filter(criterion => isActiveValue(values[criterion.key])).length;
  const draftCount = criteria.filter(criterion => isActiveValue(draft[criterion.key])).length;

  const openSheet = () => {
    setDraft(pick(criteria, values));
    setOpen(true);
  };

  const apply = () => {
    const next: Partial<SearchValues> = {};
    for (const criterion of criteria) next[criterion.key] = emitValue(draft[criterion.key]);
    onApply(next);
    setOpen(false);
  };

  return (
    <>
      <Button
        icon={<FilterOutlined aria-hidden="true" />}
        onClick={openSheet}
        aria-haspopup="dialog"
        data-ls-fallback=""
        style={{ height: 44, minHeight: 44, flex: block ? 1 : '0 0 auto' }}
      >
        {appliedCount > 0 ? t('Filtres ({{count}})', { count: appliedCount }) : t('Filtres')}
      </Button>

      <Drawer
        title={t('Filtres')}
        placement="bottom"
        open={open}
        onClose={() => setOpen(false)}
        height="auto"
        destroyOnHidden
        // Le corps défile, la feuille ne dépasse jamais 85 % de l'écran : le pied reste à portée du pouce.
        styles={{
          wrapper: { maxHeight: '85dvh' },
          body: { paddingBottom: 'var(--space-6)', overflowY: 'auto' },
          footer: { paddingBottom: 'max(var(--space-3), env(safe-area-inset-bottom))' }
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
            <Button type="text" onClick={() => setDraft({})} style={{ minHeight: 44, flex: '0 0 auto' }}>
              {t('Réinitialiser')}
            </Button>
            <Button type="primary" onClick={apply} style={{ minHeight: 44, flex: 1 }}>
              {draftCount > 0 ? t('Appliquer ({{count}})', { count: draftCount }) : t('Appliquer')}
            </Button>
          </div>
        }
      >
        <div className="list-search-touch" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {criteria.map(criterion => (
            <div key={criterion.key}>
              {criterion.type !== 'boolean' || criterion.tristate ? (
                <div
                  style={{
                    marginBottom: 'var(--space-1)',
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--font-size-small)'
                  }}
                >
                  {criterion.label}
                </div>
              ) : null}
              <CriterionControl
                criterion={criterion}
                value={draft[criterion.key]}
                onChange={next => setDraft(previous => ({ ...previous, [criterion.key]: next }))}
                labels={labels}
                remember={remember}
                touch
              />
              {criterion.help && (
                <Typography.Text
                  type="secondary"
                  style={{ display: 'block', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-caption)' }}
                >
                  {criterion.help}
                </Typography.Text>
              )}
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}
