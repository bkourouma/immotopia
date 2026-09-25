import React, { useState } from 'react';
import { Typography, Space, Tag, Collapse } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import {
  TEMPLATE_VARIABLES,
  VARIABLE_CATEGORY_LABELS,
  getVariablePlaceholder,
  type TemplateVariable
} from '../../constants/template-variables';
import { t } from '../../i18n/t';

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

  const handleClick = (v: TemplateVariable) => {
    const placeholder = getVariablePlaceholder(v.name);
    if (onInsert) {
      onInsert(v.name, placeholder);
    } else {
      navigator.clipboard?.writeText(placeholder).catch(() => {});
    }
  };

  const renderVariableTag = (v: TemplateVariable) => (
    <Tag
      key={v.name}
      style={{ cursor: onInsert ? 'pointer' : 'pointer', marginBottom: 4 }}
      onClick={() => handleClick(v)}
      title={v.description}
    >
      {`{{${v.name}}}`}
    </Tag>
  );

  if (groupByCategory) {
    const byCategory = TEMPLATE_VARIABLES().reduce(
      (acc, v) => {
        if (!acc[v.category]) acc[v.category] = [];
        acc[v.category].push(v);
        return acc;
      },
      {} as Record<TemplateVariable['category'], TemplateVariable[]>
    );
    const categories = (Object.keys(VARIABLE_CATEGORY_LABELS()) as TemplateVariable['category'][]).filter(
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
        <Collapse
          defaultActiveKey={categories}
          items={categories.map(cat => ({
            key: cat,
            label: `${VARIABLE_CATEGORY_LABELS()[cat]} (${byCategory[cat].length})`,
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

  const visibleVars = maxVisible > 0 ? TEMPLATE_VARIABLES().slice(0, maxVisible) : TEMPLATE_VARIABLES();
  const hasMore = maxVisible > 0 && TEMPLATE_VARIABLES().length > maxVisible;

  return (
    <div style={{ marginTop: 8, marginBottom: 8 }}>
      <Space align="center" style={{ marginBottom: 8 }}>
        <CodeOutlined />
        <Text type="secondary" strong>
          {t('Variables disponibles')}
        </Text>
      </Space>
      <Space size={[4, 4]} wrap>
        {visibleVars.map(renderVariableTag)}
      </Space>
      {hasMore && (
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            + {TEMPLATE_VARIABLES().length - maxVisible} {t('autres variables. Utilisez la syntaxe')}{' '}
            {'{{nomVariable}}'}.
          </Text>
        </div>
      )}
    </div>
  );
}
