import { Collapse, Input, Space, Switch, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { FormUnlockEntry } from '../../services/form-settings-service';
import { t } from '../../i18n/t';

const { Text } = Typography;

export interface UnlockFieldsEditorProps {
  entries: FormUnlockEntry[];
  onToggle: (formKey: string, fieldKey: string, unlocked: boolean, reason?: string) => void;
  loading?: boolean;
}

const entryId = (e: FormUnlockEntry) => `${e.formKey}::${e.fieldKey}`;

function EntryRow({
  entry,
  onToggle,
  loading
}: {
  entry: FormUnlockEntry;
  onToggle: UnlockFieldsEditorProps['onToggle'];
  loading?: boolean;
}) {
  const [reason, setReason] = useState(entry.reason ?? '');
  const label = t(entry.fieldLabel);
  return (
    <div data-testid={`unlock-row-${entryId(entry)}`} style={{ padding: '10px 0' }}>
      <Space size={12} align="start" wrap>
        <Switch
          checked={entry.unlocked}
          loading={loading}
          aria-label={t('Autoriser le réglage de {{champ}}', { champ: label })}
          onChange={checked => onToggle(entry.formKey, entry.fieldKey, checked, reason.trim() || undefined)}
        />
        <div style={{ minInlineSize: 0 }}>
          <Text strong>{label}</Text> <Text type="secondary">{t('Autoriser le réglage')}</Text>
          <div>
            <Text type="secondary">{t(entry.consequence)}</Text>
          </div>
          <Input
            size="small"
            style={{ marginBlockStart: 6, maxInlineSize: 360 }}
            value={reason}
            maxLength={500}
            placeholder={t('Motif (facultatif)')}
            aria-label={t('Motif du déverrouillage de {{champ}}', { champ: label })}
            onChange={event => setReason(event.target.value)}
          />
        </div>
      </Space>
    </div>
  );
}

export function UnlockFieldsEditor({ entries, onToggle, loading }: UnlockFieldsEditorProps) {
  const groups = useMemo(() => {
    const modules = new Map<string, Map<string, { label: string; items: FormUnlockEntry[] }>>();
    for (const entry of entries) {
      const forms = modules.get(entry.module) ?? new Map();
      const form = forms.get(entry.formKey) ?? { label: entry.formLabel, items: [] };
      form.items.push(entry);
      forms.set(entry.formKey, form);
      modules.set(entry.module, forms);
    }
    return Array.from(modules.entries());
  }, [entries]);

  if (entries.length === 0) {
    return <Text type="secondary">{t('Aucun champ sous condition.')}</Text>;
  }

  return (
    <div>
      {groups.map(([module, forms]) => (
        <section key={module} aria-label={module} style={{ marginBlockEnd: 16 }}>
          <Typography.Title level={5} style={{ textTransform: 'capitalize' }}>
            {module}
          </Typography.Title>
          <Collapse
            defaultActiveKey={Array.from(forms.keys())}
            items={Array.from(forms.entries()).map(([formKey, form]) => ({
              key: formKey,
              label: t(form.label),
              children: form.items.map(entry => (
                <EntryRow key={entryId(entry)} entry={entry} onToggle={onToggle} loading={loading} />
              ))
            }))}
          />
        </section>
      ))}
    </div>
  );
}

export default UnlockFieldsEditor;
