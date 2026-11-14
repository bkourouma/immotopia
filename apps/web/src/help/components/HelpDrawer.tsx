import React, { useEffect, useState } from 'react';
import { Button, Drawer, Tabs, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { isRtl } from '../../i18n/config';
import { t } from '../../i18n/t';
import { useHelp } from '../help-context';
import { HELP_CENTER_PATH } from '../paths';
import { currentHelpLanguage } from '../registry';
import { HelpEntryView } from './HelpEntryView';

const DESKTOP_WIDTH = 460;

function CenterLink({ onOpen }: { onOpen: () => void }) {
  return (
    <Button type="link" style={{ padding: 0 }} onClick={onOpen}>
      {t("Ouvrir le centre d'aide")}
    </Button>
  );
}

function EmptyHelp({ onOpen }: { onOpen: () => void }) {
  return (
    <div>
      <Typography.Paragraph type="secondary">{t("Aucune aide n'est disponible pour cet écran.")}</Typography.Paragraph>
      <CenterLink onOpen={onOpen} />
    </div>
  );
}

function TabbedHelp({ pageHelpId, blockHelpId }: { pageHelpId: string; blockHelpId: string }) {
  const [active, setActive] = useState('block');
  useEffect(() => setActive('block'), [blockHelpId]);
  return (
    <Tabs
      activeKey={active}
      onChange={setActive}
      items={[
        { key: 'page', label: t('Cette page'), children: <HelpEntryView helpId={pageHelpId} /> },
        { key: 'block', label: t('Ce bloc'), children: <HelpEntryView helpId={blockHelpId} /> }
      ]}
    />
  );
}

function DrawerBody({ onOpenCenter }: { onOpenCenter: () => void }) {
  const { blockHelpId, pageHelpId } = useHelp();
  if (blockHelpId && pageHelpId && blockHelpId !== pageHelpId) {
    return <TabbedHelp pageHelpId={pageHelpId} blockHelpId={blockHelpId} />;
  }
  const single = blockHelpId ?? pageHelpId;
  return single ? <HelpEntryView helpId={single} /> : <EmptyHelp onOpen={onOpenCenter} />;
}

/** Panneau lateral d'aide : ne masque pas l'ecran, se ferme par la croix ou Echap. */
export function HelpDrawer() {
  const { open, closeHelp } = useHelp();
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const placement = isRtl(currentHelpLanguage()) ? 'left' : 'right';

  const openCenter = () => {
    navigate(HELP_CENTER_PATH);
    closeHelp();
  };

  return (
    <Drawer
      open={open}
      onClose={closeHelp}
      placement={placement}
      size={isMobile ? '100%' : DESKTOP_WIDTH}
      mask={false}
      keyboard
      title={t('Aide')}
      footer={<CenterLink onOpen={openCenter} />}
    >
      <DrawerBody onOpenCenter={openCenter} />
    </Drawer>
  );
}

export default HelpDrawer;
