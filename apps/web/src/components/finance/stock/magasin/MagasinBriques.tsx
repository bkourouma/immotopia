import React, { useCallback, useMemo, useState } from 'react';
import { Alert, App, Button, Input, Typography } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { StatusTag } from '../../../primitives/StatusTag';
import type { StatusTone } from '../../../primitives/StatusTag';
import { t } from '../../../../i18n/t';

const { Text, Title } = Typography;

/**
 * Briques d'affichage de l'écran Magasin (ecrans §6.1) : conçu d'abord pour un
 * Android d'entrée de gamme de 360 px. Aucun tableau, aucune fenêtre empilée :
 * chaque geste est une suite d'étapes plein écran, une question par étape,
 * avec une barre d'action collée en bas (« Retour » côté début de ligne,
 * action principale côté fin — la mise en page se retourne seule en arabe).
 * Cibles de 48 px au moins, lignes de liste de 56 px, police de 16 px.
 */

/** Une pastille d'une ligne de liste. */
export interface Pastille {
  key: string;
  label: string;
  tone: StatusTone;
}

export const PastilleTag: React.FC<{ pastille: Pastille }> = ({ pastille }) => (
  <StatusTag status={pastille.key} tone={pastille.tone} label={pastille.label} />
);

// ---------------------------------------------------------------------------
// Étape plein écran
// ---------------------------------------------------------------------------

export interface ActionEtape {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export interface EtapeGesteProps {
  titre: string;
  /** Rappel discret en tête (lieu de sortie, facture choisie…). */
  rappel?: React.ReactNode;
  children: React.ReactNode;
  onRetour?: () => void;
  /** Libellé du bouton de gauche ; « Retour » par défaut. */
  retourLabel?: string;
  principale?: ActionEtape;
  /** Pendant un envoi : bouton principal en chargement, les autres inactifs. */
  envoiEnCours?: boolean;
  /**
   * Contenu gardé monté d'une étape à l'autre (les photos prises avant
   * l'enregistrement, qui partent dès que le bon existe) : rendu à une place
   * fixe, il survit au changement d'étape tant que l'étape suivante est
   * aussi une `EtapeGeste`.
   */
  persistant?: React.ReactNode;
}

export const EtapeGeste: React.FC<EtapeGesteProps> = ({
  titre,
  rappel,
  children,
  onRetour,
  retourLabel,
  principale,
  envoiEnCours,
  persistant
}) => (
  <section aria-label={titre} style={{ display: 'flex', flexDirection: 'column', minHeight: '60vh' }}>
    <Title level={4} style={{ marginBlock: 'var(--space-2)', fontSize: 20 }}>
      {titre}
    </Title>
    {rappel ? (
      <Text type="secondary" style={{ display: 'block', marginBlockEnd: 'var(--space-3)', fontSize: 15 }}>
        {rappel}
      </Text>
    ) : null}
    <div style={{ flex: 1, paddingBlockEnd: 'var(--space-4)' }}>{children}</div>
    {persistant ?? null}
    {envoiEnCours ? (
      <Text type="secondary" role="status" style={{ display: 'block', marginBlockEnd: 'var(--space-2)' }}>
        {t('Envoi en cours… Ne fermez pas l’écran.')}
      </Text>
    ) : null}
    {onRetour || principale ? (
      <div
        style={{
          position: 'sticky',
          insetBlockEnd: 0,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          paddingBlock: 'var(--space-3)',
          background: 'var(--surface-page)',
          borderBlockStart: '1px solid var(--border-subtle)'
        }}
      >
        {onRetour ? (
          <Button onClick={onRetour} disabled={envoiEnCours} style={{ minHeight: 48, fontSize: 16 }}>
            {retourLabel ?? t('Retour')}
          </Button>
        ) : (
          <span />
        )}
        {principale ? (
          <Button
            type="primary"
            onClick={principale.onClick}
            disabled={principale.disabled}
            loading={principale.loading}
            style={{ minHeight: 48, fontSize: 16 }}
          >
            {principale.label}
          </Button>
        ) : null}
      </div>
    ) : null}
  </section>
);

// ---------------------------------------------------------------------------
// Gros bouton d'un geste (72 px)
// ---------------------------------------------------------------------------

export interface GrosBoutonProps {
  icone: React.ReactNode;
  titre: string;
  sousTitre: string;
  onClick: () => void;
}

export const GrosBouton: React.FC<GrosBoutonProps> = ({ icone, titre, sousTitre, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={titre}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      width: '100%',
      minHeight: 72,
      paddingInline: 'var(--space-4)',
      paddingBlock: 'var(--space-2)',
      marginBlockEnd: 'var(--space-3)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-card)',
      textAlign: 'start',
      cursor: 'pointer',
      fontSize: 16
    }}
  >
    <span aria-hidden style={{ fontSize: 26, color: 'var(--color-primary)' }}>
      {icone}
    </span>
    <span>
      <span style={{ display: 'block', fontWeight: 600, fontSize: 18, color: 'var(--text-primary)' }}>{titre}</span>
      <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 15 }}>{sousTitre}</span>
    </span>
  </button>
);

// ---------------------------------------------------------------------------
// Liste de choix (56 px par ligne, recherche dès 8 éléments)
// ---------------------------------------------------------------------------

export interface LigneChoix {
  id: string;
  titre: React.ReactNode;
  sousTitre?: React.ReactNode;
  pastilles?: Pastille[];
  /** Grisée, non choisissable ; `note` dit pourquoi. */
  desactivee?: boolean;
  note?: string;
  /** Texte sur lequel porte la recherche. */
  recherche?: string;
  /** Mise en évidence (ligne refusée par le serveur). */
  enEvidence?: boolean;
}

export interface ListeChoixProps {
  lignes: LigneChoix[];
  onChoisir: (id: string) => void;
  selectionId?: string | null;
  vide?: React.ReactNode;
  placeholderRecherche?: string;
  /** Lien ou bouton affiché sous la liste (« Chercher dans toutes les factures »). */
  pied?: (recherche: string) => React.ReactNode;
  /** Ligne d'action en tête de liste (« Ajouter un preneur »). */
  tete?: React.ReactNode;
  /** La recherche est portée par l'écran (une seule pour deux listes). */
  sansRecherche?: boolean;
  'aria-label'?: string;
}

/** Seuil à partir duquel une recherche s'affiche en tête de liste (ecrans §6.1). */
export const SEUIL_RECHERCHE = 8;

function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export const ListeChoix: React.FC<ListeChoixProps> = ({
  lignes,
  onChoisir,
  selectionId,
  vide,
  placeholderRecherche,
  pied,
  tete,
  sansRecherche,
  'aria-label': ariaLabel
}) => {
  const [recherche, setRecherche] = useState('');
  const avecRecherche = !sansRecherche && (lignes.length >= SEUIL_RECHERCHE || Boolean(pied));
  const filtrees = useMemo(() => {
    const cle = normaliser(recherche.trim());
    if (!cle) return lignes;
    return lignes.filter(ligne => normaliser(ligne.recherche ?? '').includes(cle));
  }, [lignes, recherche]);

  return (
    <div>
      {avecRecherche ? (
        <Input
          allowClear
          prefix={<SearchOutlined aria-hidden />}
          placeholder={placeholderRecherche ?? t('Rechercher')}
          aria-label={placeholderRecherche ?? t('Rechercher')}
          value={recherche}
          onChange={event => setRecherche(event.target.value)}
          style={{ minHeight: 48, fontSize: 16, marginBlockEnd: 'var(--space-3)' }}
        />
      ) : null}
      {tete}
      {filtrees.length === 0 ? (
        <Text type="secondary" style={{ display: 'block', paddingBlock: 'var(--space-3)' }}>
          {recherche.trim() ? t('Aucun résultat pour cette recherche.') : vide}
        </Text>
      ) : (
        <ul aria-label={ariaLabel} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {filtrees.map(ligne => {
            const choisie = selectionId === ligne.id;
            return (
              <li key={ligne.id} style={{ marginBlockEnd: 'var(--space-2)' }}>
                <button
                  type="button"
                  disabled={ligne.desactivee}
                  aria-pressed={choisie}
                  onClick={() => onChoisir(ligne.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    minHeight: 56,
                    paddingInline: 'var(--space-3)',
                    paddingBlock: 'var(--space-2)',
                    textAlign: 'start',
                    fontSize: 16,
                    borderRadius: 'var(--radius-md)',
                    border: choisie
                      ? '2px solid var(--color-primary)'
                      : ligne.enEvidence
                        ? '2px solid var(--color-warning)'
                        : '1px solid var(--border-default)',
                    background: ligne.desactivee
                      ? 'var(--surface-sunken)'
                      : choisie
                        ? 'var(--color-primary-bg)'
                        : 'var(--surface-card)',
                    color: ligne.desactivee ? 'var(--text-tertiary)' : 'var(--text-primary)',
                    cursor: ligne.desactivee ? 'not-allowed' : 'pointer'
                  }}
                >
                  <span style={{ display: 'block', fontWeight: 600 }}>{ligne.titre}</span>
                  {ligne.sousTitre ? (
                    <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 14 }}>
                      {ligne.sousTitre}
                    </span>
                  ) : null}
                  {ligne.pastilles && ligne.pastilles.length > 0 ? (
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBlockStart: 4 }}>
                      {ligne.pastilles.map(pastille => (
                        <PastilleTag key={pastille.key} pastille={pastille} />
                      ))}
                    </span>
                  ) : null}
                  {ligne.note ? (
                    <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 14 }}>{ligne.note}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {pied ? pied(recherche) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Coupure réseau et envoi
// ---------------------------------------------------------------------------

/** Coupure réseau (ecrans §3.7) : les saisies sont gardées, le réessai ne double rien. */
export const AlerteCoupure: React.FC<{ onReessayer: () => void; disabled?: boolean }> = ({ onReessayer, disabled }) => (
  <Alert
    type="warning"
    showIcon
    role="alert"
    style={{ marginBlockEnd: 'var(--space-3)' }}
    message={t('La connexion a été perdue.')}
    description={t('Vos saisies sont conservées. Réessayez : l’opération ne sera pas enregistrée deux fois.')}
    action={
      <Button icon={<ReloadOutlined />} onClick={onReessayer} disabled={disabled} style={{ minHeight: 44 }}>
        {t('Réessayer')}
      </Button>
    }
  />
);

/**
 * Quitter un geste commencé demande confirmation (ecrans §6.7) : rien n'a
 * encore été enregistré, et le brouillon ne vit qu'en mémoire de page.
 */
export function useConfirmerAbandon(onQuitter: () => void) {
  const { modal } = App.useApp();
  return useCallback(
    (entame: boolean) => {
      if (!entame) {
        onQuitter();
        return;
      }
      modal.confirm({
        title: t('Abandonner cette saisie ? Rien n’a encore été enregistré.'),
        okText: t('Abandonner la saisie'),
        cancelText: t('Continuer la saisie'),
        onOk: onQuitter
      });
    },
    [modal, onQuitter]
  );
}

/** Un bloc « libellé : valeur » de l'étape de vérification. */
export const LigneRecap: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ paddingBlock: 'var(--space-2)', borderBlockEnd: '1px solid var(--border-subtle)' }}>
    <Text type="secondary" style={{ display: 'block', fontSize: 14 }}>
      {label}
    </Text>
    <div style={{ fontSize: 16 }}>{children}</div>
  </div>
);
