import { LockOutlined } from '@ant-design/icons';
import { Button, Segmented, Space, Tag, Typography } from 'antd';
import type { FieldMode, FormSettingsField, FormSettingsForm } from '../../services/form-settings-service';
import { t } from '../../i18n/t';

const { Text } = Typography;

const MODE_LABEL: Record<FieldMode, string> = {
  REQUIRED: 'Obligatoire',
  OPTIONAL: 'Facultatif',
  HIDDEN: 'Masqué'
};

const MODE_ORDER: FieldMode[] = ['REQUIRED', 'OPTIONAL', 'HIDDEN'];

export interface FieldModesEditorProps {
  form: FormSettingsForm;
  editable: boolean;
  /** `null` : revenir au défaut du champ. */
  onChange: (fieldKey: string, mode: FieldMode | null) => void;
}

function FieldRow({
  field,
  editable,
  onChange
}: {
  field: FormSettingsField;
  editable: boolean;
  onChange: FieldModesEditorProps['onChange'];
}) {
  const locked = field.fieldClass === 'GATED' && !field.unlocked;
  const disabled = !editable || locked;
  const options = MODE_ORDER.filter(mode => field.allowedModes.includes(mode)).map(mode => ({
    value: mode,
    label: mode === field.defaultMode ? `${t(MODE_LABEL[mode])} (${t('Par défaut')})` : t(MODE_LABEL[mode])
  }));
  const label = t(field.label);

  return (
    <div
      data-testid={`field-row-${field.key}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 0',
        borderBlockEnd: '1px solid var(--ant-color-split, #f0f0f0)'
      }}
    >
      <div style={{ flex: '1 1 260px', minInlineSize: 0 }}>
        <Space size={8} wrap>
          <Text strong>{label}</Text>
          {field.fieldClass === 'GATED' && <Tag color="gold">{t('Sous condition')}</Tag>}
        </Space>
        <div>
          <Text type="secondary">{t(field.consequence)}</Text>
        </div>
        {locked && (
          <div>
            <Text type="secondary">
              <LockOutlined aria-hidden style={{ marginInlineEnd: 6 }} />
              {t('Réglage soumis à ImmoTopia')}
            </Text>
          </div>
        )}
      </div>
      <Space size={8} wrap>
        <Segmented<FieldMode>
          aria-label={t('Mode du champ {{champ}}', { champ: label })}
          options={options}
          value={field.mode}
          disabled={disabled}
          onChange={value => onChange(field.key, value === field.defaultMode ? null : value)}
        />
        {!disabled && field.storedMode !== null && (
          <Button
            type="link"
            size="small"
            aria-label={t('Revenir au défaut pour {{champ}}', { champ: label })}
            onClick={() => onChange(field.key, null)}
          >
            {t('Revenir au défaut')}
          </Button>
        )}
      </Space>
    </div>
  );
}

export function FieldModesEditor({ form, editable, onChange }: FieldModesEditorProps) {
  return (
    <div role="group" aria-label={t(form.label)}>
      {form.fields.map(field => (
        <FieldRow key={field.key} field={field} editable={editable} onChange={onChange} />
      ))}
    </div>
  );
}

export default FieldModesEditor;
