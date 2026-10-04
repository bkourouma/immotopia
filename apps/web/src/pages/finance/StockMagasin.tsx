import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from 'antd';
import { PageHeader } from '../../components/primitives/PageHeader';
import { StateBlock } from '../../components/primitives/StateBlock';
import { SkeletonList } from '../../components/primitives/Skeleton';
import { ModuleNotIncluded } from '../../components/primitives/ModuleNotIncluded';
import { ChoixLieu, MagasinAccueil, type GesteMagasin } from '../../components/finance/stock/magasin/MagasinAccueil';
import { MagasinBon } from '../../components/finance/stock/magasin/MagasinBon';
import { GesteRecevoir } from '../../components/finance/stock/magasin/GesteRecevoir';
import { GesteSortir } from '../../components/finance/stock/magasin/GesteSortir';
import { GesteTransferer } from '../../components/finance/stock/magasin/GesteTransferer';
import { GesteCompter } from '../../components/finance/stock/magasin/GesteCompter';
import { useStockFieldContext } from '../../hooks/useStockFieldContext';
import { isModuleNotIncludedError } from '../../utils/module-not-included';
import { t } from '../../i18n/t';

/** Clé du lieu courant dans le navigateur (ecrans §6.2). */
export function cleLieuMagasin(tenantId: string): string {
  return `immotopia.stock.lieu.${tenantId}`;
}

function lireLieuMemorise(tenantId: string): string | null {
  try {
    return window.localStorage.getItem(cleLieuMagasin(tenantId));
  } catch {
    return null;
  }
}

function memoriserLieu(tenantId: string, lieuId: string): void {
  try {
    window.localStorage.setItem(cleLieuMagasin(tenantId), lieuId);
  } catch {
    // Stockage refusé (navigation privée) : le lieu sera redemandé, rien de plus.
  }
}

type Vue =
  { kind: 'accueil' } | { kind: 'lieu' } | { kind: 'geste'; geste: GesteMagasin } | { kind: 'bon'; slipId: string };

function estRefus(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 403;
}

/**
 * E2 — Magasin, l'écran mobile en trois gestes (ecrans §6) : recevoir,
 * sortir, compter — et, repliés, transférer. Conçu pour un Android d'entrée de
 * gamme de 360 px sur un réseau 3G instable : un seul appel au chargement
 * (`GET /stock/field-context`), des étapes plein écran, des listes plutôt que
 * du texte, **aucune valeur** et aucun prix demandé, même à qui voit les
 * valeurs. Les gestes affichés sont ceux que `abilities` permet.
 */
export function StockMagasin(): React.ReactElement {
  const { tenantId } = useParams<{ tenantId: string }>();
  const contexte = useStockFieldContext(tenantId);
  const [lieuId, setLieuId] = useState<string | null>(() => (tenantId ? lireLieuMemorise(tenantId) : null));
  const [vue, setVue] = useState<Vue>({ kind: 'accueil' });
  // Change à chaque « Nouvelle réception » : le geste repart vierge.
  const [passage, setPassage] = useState(0);

  const donnees = contexte.data?.data ?? null;
  const lieuValide = Boolean(donnees && lieuId && donnees.locations.some(lieu => lieu.id === lieuId && lieu.isActive));

  // Un lieu mémorisé absent ou désactivé : le choix est redemandé.
  useEffect(() => {
    if (donnees && !lieuValide && vue.kind !== 'lieu') setVue({ kind: 'lieu' });
  }, [donnees, lieuValide, vue.kind]);

  const retourAccueil = useCallback(() => setVue({ kind: 'accueil' }), []);
  const recommencer = useCallback(() => setPassage(valeur => valeur + 1), []);

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const enTete = (
    <PageHeader
      title={t('Magasin')}
      subtitle={
        donnees && lieuValide && vue.kind !== 'lieu' ? (
          <span>
            {t('Lieu : {{lieu}}', { lieu: donnees.locations.find(lieu => lieu.id === lieuId)?.label ?? '' })}{' '}
            {vue.kind === 'accueil' ? (
              <Button type="link" onClick={() => setVue({ kind: 'lieu' })} style={{ paddingInline: 4, minHeight: 44 }}>
                {t('Changer')}
              </Button>
            ) : null}
          </span>
        ) : undefined
      }
    />
  );

  let corps: React.ReactNode;
  if (contexte.isPending) {
    corps = <SkeletonList rows={3} />;
  } else if (contexte.isError) {
    if (isModuleNotIncludedError(contexte.error)) {
      corps = <ModuleNotIncluded />;
    } else if (estRefus(contexte.error)) {
      corps = (
        <StateBlock
          variant="forbidden"
          title={t('Le stock ne vous est pas ouvert')}
          description={t(
            'Votre rôle ne comprend pas la consultation du stock. Demandez à l’administrateur de l’agence de vous attribuer le rôle Magasinier ou un rôle qui la comprend.'
          )}
        />
      );
    } else {
      corps = (
        <>
          <StateBlock variant="error" description={t('Le contexte du magasin n’a pas pu être chargé.')} />
          <Button type="primary" block onClick={() => void contexte.refetch()} style={{ minHeight: 48, fontSize: 16 }}>
            {t('Réessayer')}
          </Button>
        </>
      );
    }
  } else if (!donnees) {
    corps = null;
  } else if (vue.kind === 'lieu' || !lieuValide || !lieuId) {
    corps = (
      <ChoixLieu
        lieux={donnees.locations}
        lieuId={lieuValide ? lieuId : null}
        onChoisir={id => {
          memoriserLieu(tenantId, id);
          setLieuId(id);
          setVue({ kind: 'accueil' });
        }}
      />
    );
  } else if (vue.kind === 'bon') {
    corps = (
      <MagasinBon tenantId={tenantId} slipId={vue.slipId} abilities={donnees.abilities} onRetour={retourAccueil} />
    );
  } else if (vue.kind === 'geste') {
    const commun = {
      tenantId,
      contexte: donnees,
      lieuCourantId: lieuId,
      onQuitter: retourAccueil,
      onRecommencer: recommencer
    };
    const cle = `${vue.geste}-${passage}`;
    corps =
      vue.geste === 'recevoir' ? (
        <GesteRecevoir key={cle} {...commun} />
      ) : vue.geste === 'sortir' ? (
        <GesteSortir key={cle} {...commun} />
      ) : vue.geste === 'transferer' ? (
        <GesteTransferer key={cle} {...commun} />
      ) : (
        <GesteCompter key={cle} {...commun} />
      );
  } else {
    corps = (
      <MagasinAccueil
        tenantId={tenantId}
        contexte={donnees}
        lieuId={lieuId}
        onGeste={geste => setVue({ kind: 'geste', geste })}
        onOuvrirBon={slipId => setVue({ kind: 'bon', slipId })}
      />
    );
  }

  return (
    <div style={{ maxWidth: 560, marginInline: 'auto', fontSize: 16 }}>
      {enTete}
      {corps}
    </div>
  );
}

export default StockMagasin;
