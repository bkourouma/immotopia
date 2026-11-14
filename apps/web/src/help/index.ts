/**
 * Point d'entree UNIQUE du socle de l'aide interne : importer depuis `../help`
 * (ou `../../help`), jamais depuis un sous-fichier.
 *
 * Usage :
 *
 *   // 1. Coquille : sous le <Router>
 *   <HelpProvider tenantId={tenantId} featureAccess={featureAccess} copilotAvailable>
 *     <Shell />
 *   </HelpProvider>
 *
 *   // 2. Un « ? » isole (ouvre la fiche `locatif.baux.liste.tableau`)
 *   <HelpButton helpId="locatif.baux.liste.tableau" />
 *   <HelpButton helpId="locatif.baux.liste" label={t('Aide')} />
 *
 *   // 3. Titre de carte ou de section avec son « ? »
 *   <Card title={<HelpSectionTitle title={t('Échéancier')} helpId="locatif.baux.detail.echeancier" />} />
 *
 *   // 4. Ancre de visite guidee (cible `nouveau-bail` d'une etape de `tour`)
 *   <Button {...helpAnchor('nouveau-bail')}>{t('Nouveau bail')}</Button>
 *
 *   // 5. Cables par leurs composants (autre lot) : <PageHeader helpId=... />,
 *   //    <Table helpId=... />, <DataView helpId=... /> affichent le « ? » eux-memes.
 *
 *   // 6. Lire l'etat ou piloter l'aide
 *   const { openHelp, startTour } = useHelp();
 *   const { entry, status } = useHelpEntry('locatif.baux.liste');
 */
export { HelpProvider } from './components/HelpProvider';
export type { HelpProviderProps } from './components/HelpProvider';
export { HelpButton } from './components/HelpButton';
export type { HelpButtonProps } from './components/HelpButton';
export { HelpSectionTitle } from './components/HelpSectionTitle';
export type { HelpSectionTitleProps } from './components/HelpSectionTitle';
export { useHelp, HelpContext, INERT_HELP } from './help-context';
export type { HelpContextValue } from './help-context';
export { helpAnchor } from './anchors';
export { useHelpEntry, searchHelp, resolvePageHelpId } from './registry';
export * from './copilot-bridge';
export * from './types';
