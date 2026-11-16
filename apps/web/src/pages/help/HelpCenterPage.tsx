import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Collapse, Input, Tag, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { PageHeader } from '../../components/primitives/PageHeader';
import { SkeletonList } from '../../components/primitives/Skeleton';
import { StateBlock } from '../../components/primitives/StateBlock';
import { useHelp } from '../../help/help-context';
import { getAllHelpEntries, searchHelp } from '../../help/registry';
import type { HelpEntry, HelpModule } from '../../help/types';
import { LanguageContext } from '../../i18n/LanguageProvider';
import { t } from '../../i18n/t';

const { Text } = Typography;

/** Anti-rebond de la saisie : la recherche part 250 ms après la dernière frappe. */
const SEARCH_DEBOUNCE_MS = 250;
/** Longueur minimale d'une recherche (même seuil que `searchHelp`). */
const MIN_QUERY_LENGTH = 2;

/** Ordre d'affichage des modules ; les libellés sont résolus à chaque rendu (langue active). */
const MODULE_ORDER: HelpModule[] = [
  'locatif',
  'syndic',
  'finance',
  'patrimoine',
  'commercial',
  'communication',
  'portails',
  'administration'
];

function moduleLabel(module: HelpModule): string {
  switch (module) {
    case 'locatif':
      return t('Gestion locative');
    case 'syndic':
      return t('Syndic de copropriété');
    case 'finance':
      return t('Finance et comptabilité');
    case 'patrimoine':
      return t('Patrimoine');
    case 'commercial':
      return t('Biens, ventes et clients');
    case 'communication':
      return t('Communication');
    case 'portails':
      return t('Portails locataire, propriétaire et copropriétaire');
    case 'administration':
      return t('Administration');
  }
}

function kindLabel(kind: HelpEntry['kind']): string {
  switch (kind) {
    case 'page':
      return t('Page');
    case 'section':
      return t('Section');
    case 'table':
      return t('Tableau');
  }
}

interface HelpListItem {
  module: HelpModule;
  entry: HelpEntry;
  fallback: boolean;
}

/** Une entrée cliquable : ouvre la fiche dans le panneau d'aide, sans navigation. */
const HelpEntryCard: React.FC<{ item: HelpListItem; onOpen: (id: string) => void }> = ({ item, onOpen }) => {
  const { entry, module, fallback } = item;
  // Contenu en repli français : balisé pour les lecteurs d'écran et gardé en LTR dans une interface arabe.
  const frenchProps = fallback ? ({ lang: 'fr', dir: 'ltr' } as const) : {};
  return (
    <li style={{ listStyle: 'none' }}>
      <button
        type="button"
        data-testid="help-entry"
        data-help-id={entry.id}
        onClick={() => onOpen(entry.id)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
          width: '100%',
          textAlign: 'start',
          cursor: 'pointer',
          padding: 'var(--space-3) var(--space-4)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md, 8px)',
          background: 'var(--surface-card)',
          color: 'inherit',
          font: 'inherit'
        }}
      >
        <span {...frenchProps} style={{ fontWeight: 600 }}>
          {entry.title}
        </span>
        <span {...frenchProps} style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-small)' }}>
          {entry.summary}
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          <Tag style={{ margin: 0 }}>{moduleLabel(module)}</Tag>
          <Tag style={{ margin: 0 }}>{kindLabel(entry.kind)}</Tag>
          {fallback && (
            <Tag color="warning" style={{ margin: 0 }}>
              {t('en français')}
            </Tag>
          )}
        </span>
      </button>
    </li>
  );
};

const EntryList: React.FC<{ items: HelpListItem[]; onOpen: (id: string) => void }> = ({ items, onOpen }) => (
  <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', margin: 0, padding: 0 }}>
    {items.map(item => (
      <HelpEntryCard key={item.entry.id} item={item} onOpen={onOpen} />
    ))}
  </ul>
);

/**
 * Centre d'aide : recherche dans toutes les fiches, ou liste par module.
 * Route unique `/aide`, ouverte à tous les comptes authentifiés (agences et portails).
 */
export const HelpCenterPage: React.FC = () => {
  const { openHelp } = useHelp();
  // Recalcule la liste quand la langue change.
  const language = useContext(LanguageContext)?.language;

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  const [all, setAll] = useState<HelpListItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [results, setResults] = useState<HelpListItem[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Toutes les fiches, pour la liste par module.
  useEffect(() => {
    let cancelled = false;
    setAll(null);
    setLoadFailed(false);
    getAllHelpEntries()
      .then(items => {
        if (!cancelled) setAll(items);
      })
      .catch(() => {
        if (!cancelled) {
          setAll([]);
          setLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const searching = debounced.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!searching) {
      setResults(null);
      setSearchFailed(false);
      return undefined;
    }
    let cancelled = false;
    setResults(null);
    setSearchFailed(false);
    searchHelp(debounced)
      .then(found => {
        if (!cancelled) {
          setResults(found.map(r => ({ module: r.module, entry: r.entry, fallback: r.fallback })));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setSearchFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, searching, language]);

  const byModule = useMemo(() => {
    const groups = new Map<HelpModule, HelpListItem[]>();
    for (const item of all ?? []) {
      const list = groups.get(item.module) ?? [];
      list.push(item);
      groups.set(item.module, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.entry.title.localeCompare(b.entry.title, 'fr', { sensitivity: 'base' }));
    }
    return MODULE_ORDER.filter(m => groups.has(m)).map(m => ({ module: m, items: groups.get(m) ?? [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, language]);

  const open = (id: string) => openHelp(id);

  let body: React.ReactNode;
  if (searching) {
    if (results === null) {
      body = <SkeletonList aria-label={t('Recherche en cours…')} />;
    } else if (results.length === 0) {
      body = (
        <StateBlock
          variant="no-results"
          title={t('Aucun résultat pour « {{terme}} ». Essayez un autre mot.', { terme: debounced })}
          description=""
        />
      );
    } else {
      body = (
        <section aria-label={t('Résultats de la recherche')}>
          <Text type="secondary" role="status" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
            {t('Résultats : {{nombre}}', { nombre: results.length })}
          </Text>
          <EntryList items={results} onOpen={open} />
        </section>
      );
    }
  } else if (all === null) {
    body = <SkeletonList aria-label={t("Chargement de l'aide")} />;
  } else if (byModule.length === 0) {
    body = <StateBlock variant="empty" title={t("Le contenu d'aide arrive progressivement.")} description="" />;
  } else {
    body = (
      <Collapse
        defaultActiveKey={byModule.map(g => g.module)}
        items={byModule.map(g => ({
          key: g.module,
          label: moduleLabel(g.module),
          children: <EntryList items={g.items} onOpen={open} />
        }))}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={t("Centre d'aide")}
        subtitle={t('Cherchez une explication sur un écran, un tableau ou une action.')}
      />

      <div style={{ marginBottom: 'var(--space-4)', maxWidth: 640 }}>
        <Input
          autoFocus
          allowClear
          size="large"
          value={query}
          onChange={event => setQuery(event.target.value)}
          prefix={<SearchOutlined />}
          placeholder={t("Rechercher dans l'aide")}
          aria-label={t("Rechercher dans l'aide")}
        />
      </div>

      {(loadFailed || searchFailed) && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 'var(--space-4)' }}
          title={t("Une partie du contenu d'aide n'a pas pu être chargée. Réessayez dans un instant.")}
        />
      )}

      {body}
    </div>
  );
};

export default HelpCenterPage;
