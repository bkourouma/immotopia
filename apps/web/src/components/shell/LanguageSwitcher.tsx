import React from 'react';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { CheckOutlined, GlobalOutlined } from '@ant-design/icons';
import { useLanguage } from '../../i18n/useLanguage';
import { t } from '../../i18n/t';
import { LANGUAGE_CODES, LANGUAGES, type Language } from '../../i18n/config';

export interface LanguageSwitcherProps {
  /**
   * `compact` n'affiche que le code de la langue (FR / EN / ع) : c'est la forme
   * retenue dans l'en-tête, où la place revient au fil d'Ariane.
   */
  variant?: 'compact' | 'full';
}

/**
 * Sélecteur de langue — le bouton « FR » que l'en-tête avait perdu, cette fois
 * relié à quelque chose.
 *
 * Chaque langue s'écrit **dans sa propre langue** (« Français », « English »,
 * « العربية ») : quelqu'un qui cherche l'arabe ne sait pas forcément lire
 * « Arabe » en français, et c'est précisément pour cette personne que le menu
 * existe.
 */
export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ variant = 'compact' }) => {
  const { language, setLanguage, isSwitching } = useLanguage();

  const items: MenuProps['items'] = LANGUAGE_CODES.map(code => ({
    key: code,
    // `lang` sur l'élément : le lecteur d'écran prononce « العربية » en arabe
    // au lieu de l'épeler avec la voix française.
    label: (
      <span lang={code} dir={LANGUAGES[code].dir} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1 }}>{LANGUAGES[code].nativeName}</span>
        {code === language && <CheckOutlined style={{ fontSize: 12, color: 'var(--color-primary)' }} />}
      </span>
    ),
    onClick: () => {
      if (code !== language) void setLanguage(code as Language);
    }
  }));

  return (
    <Dropdown menu={{ items, selectedKeys: [language] }} placement="bottomRight" trigger={['click']}>
      <Button
        type="text"
        loading={isSwitching}
        aria-label={t('Changer la langue')}
        icon={<GlobalOutlined />}
        style={{ minWidth: 44, height: 44, flexShrink: 0 }}
      >
        {variant === 'compact' ? LANGUAGES[language].short : LANGUAGES[language].nativeName}
      </Button>
    </Dropdown>
  );
};
