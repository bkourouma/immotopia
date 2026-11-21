import React, { useState } from 'react';
import { Typography, Space, Collapse, Input } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import {
  TEMPLATE_VARIABLES,
  VARIABLE_CATEGORY_LABELS,
  getVariablePlaceholder,
  type TemplateVariable
} from '../../constants/template-variables';
import { t } from '../../i18n/t';
import { VariableChip } from './VariableChip';

const { Text } = Typography;

export interface VariableSelectorProps {
  /** Appelé quand l'utilisateur clique sur une variable : (nomVariable, placeholder) */
  onInsert?: (variableName: string, placeholder: string) => void;
  /** Afficher les variables groupées par catégorie */
  groupByCategory?: boolean;
  /** Nombre max de variables affichées avant repli (0 = tout afficher) */
  maxVisible?: number;
}

/** Composant pour afficher les variables disponibles et permettre de les insérer dans un template (corps/sujet). */
export function VariableSelector({ onInsert, groupByCategory = true, maxVisible = 0 }: VariableSelectorProps) {
  const [expanded, setExpanded] = useState(!maxVisible);
  // Recherche : la liste compte des dizaines de variables, on la filtre au fil de la frappe.
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const variables = TEMPLATE_VARIABLES.filter(
    v => !needle || v.name.toLowerCase().includes(needle) || (v.description ?? '').toLowerCase().includes(needle)
  );

  const handleClick = (v: TemplateVariable) => {
    const placeholder = getVariablePlaceholder(v.name);
    if (onInsert) {
      onInsert(v.name, placeholder);
    } else {
      navigator.clipboard?.writeText(placeholder).catch(() => {});
    }
  };

  const renderVariableTag = (v: TemplateVariable) => (
    <VariableChip key={v.name} name={v.name} title={v.description} copy={!onInsert} onActivate={() => handleClick(v)} />
  );

  const searchField = (
    <Input.Search
      allowClear
      value={search}
      onChange={event => setSearch(event.target.value)}
      placeholder={t('Rechercher une variable')}
      aria-label={t('Rechercher une variable')}
      style={{ maxWidth: 320, marginBottom: 8 }}
    />
  );
  const noMatch =
    needle && variables.length === 0 ? (
      <Text type="secondary" role="status" style={{ display: 'block', marginBottom: 8 }}>
        {t('Aucune variable ne correspond à cette recherche.')}
      </Text>
    ) : null;

  if (groupByCategory) {
    const byCategory = variables.reduce(
      (acc, v) => {
        if (!acc[v.category]) acc[v.category] = [];
        acc[v.category].push(v);
        return acc;
      },
      {} as Record<TemplateVariable['category'], TemplateVariable[]>
    );
    const categories = (Object.keys(VARIABLE_CATEGORY_LABELS) as TemplateVariable['category'][]).filter(
      c => byCategory[c]?.length
    );

    return (
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <Space align="center" style={{ marginBottom: 8 }}>
          <CodeOutlined />
          <Text type="secondary" strong>
            {t('Variables disponibles')}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {onInsert
              ? t('Cliquez pour insérer à la position du curseur dans le corps ou le sujet.')
              : t('Cliquez pour copier.')}
          </Text>
        </Space>
        {searchField}
        {noMatch}
        <Collapse
          // Remonté quand la recherche change : les catégories qui ont des résultats restent ouvertes.
          key={needle}
          defaultActiveKey={categories}
          items={categories.map(cat => ({
            key: cat,
            label: `${VARIABLE_CATEGORY_LABELS[cat]} (${byCategory[cat].length})`,
            children: (
              <Space size={[4, 4]} wrap>
                {byCategory[cat].map(renderVariableTag)}
              </Space>
            )
          }))}
        />
      </div>
    );
  }

  const visibleVars = needle ? variables : maxVisible > 0 ? variables.slice(0, maxVisible) : variables;
  const hasMore = !needle && maxVisible > 0 && TEMPLATE_VARIABLES.length > maxVisible;

  return (
    <div style={{ marginTop: 8, marginBottom: 8 }}>
      <Space align="center" style={{ marginBottom: 8 }}>
        <CodeOutlined />
        <Text type="secondary" strong>
          {t('Variables disponibles')}
        </Text>
      </Space>
      {searchField}
      {noMatch}
      <Space size={[4, 4]} wrap>
        {visibleVars.map(renderVariableTag)}
      </Space>
      {hasMore && (
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            + {TEMPLATE_VARIABLES.length - maxVisible} {t('autres variables. Utilisez la syntaxe')} {'{{nomVariable}}'}.
          </Text>
        </div>
      )}
    </div>
  );
}
