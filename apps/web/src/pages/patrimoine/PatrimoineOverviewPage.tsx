import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PatrimoineOverview } from '../../components/patrimoine/PatrimoineOverview';
import { WorkProgramTimeline } from '../../components/patrimoine/WorkProgramTimeline';
import { getPatrimoineOverview, listTenantWorkPrograms } from '../../services/patrimoine-service';
import { useAuth } from '../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, SkeletonStats } from '../../components/primitives';

/**
 * Aperçu du patrimoine — le pire N+1 de l'application (REFONTE_UI_UX.md §8.4).
 *
 * L'écran chargeait jusqu'à **100 biens**, puis lançait une requête de travaux
 * **par bien** : jusqu'à 101 requêtes au montage, là où le §10.1 en autorise
 * trois. Sur un réseau de terrain, c'était l'écran qui ne finissait pas de
 * charger.
 *
 * Il en fait deux, désormais : l'agrégat patrimoine, et la liste des programmes
 * de travaux de l'agence — endpoint livré au commit `75f910b`, qui joint le
 * bien à chaque programme et évite donc aussi de charger les biens pour leurs
 * seuls titres.
 *
 * Corrigés au passage : un bouton qui exposait une route technique
 * (« Voir les biens (/properties) ») et trois libellés sans accents (§3.5).
 */
export const PatrimoineOverviewPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;

  const apercu = useQuery({
    queryKey: queryKey('patrimoine-apercu', agence),
    queryFn: () => getPatrimoineOverview(agence as string),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });

  const travaux = useQuery({
    // La page est explicite : cet écran montre les travaux à venir, pas
    // l'historique complet. Les charger tous ne servirait qu'à allonger la
    // frise.
    queryKey: queryKey('work-programs', agence, { limit: 20 }),
    queryFn: () => listTenantWorkPrograms(agence as string, { limit: 20 }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.list
  });

  if (!agence) {
    return (
      <StateBlock
        variant="empty"
        title="Aucune agence sélectionnée"
        description="Votre compte doit être rattaché à une agence pour consulter son patrimoine."
      />
    );
  }

  const enChargement = apercu.isPending || travaux.isPending;

  return (
    <>
      <PageHeader
        title="Patrimoine"
        subtitle="Vue consolidée du portefeuille immobilier"
        // « Voir les biens », et non « Voir les biens (/properties) » :
        // l'adresse technique n'apprend rien à qui lit le bouton.
        primaryAction={{ label: 'Voir les biens', onClick: () => navigate(`/tenant/${agence}/properties`) }}
      />

      {apercu.error ? (
        <StateBlock
          variant="error"
          description="Impossible de charger la vue consolidée."
          actions={[{ label: 'Réessayer', onClick: () => apercu.refetch(), primary: true }]}
        />
      ) : enChargement ? (
        <SkeletonStats rows={4} aria-label="Patrimoine en cours de chargement" />
      ) : apercu.data ? (
        <PatrimoineOverview data={apercu.data} />
      ) : (
        <StateBlock variant="empty" title="Aucune donnée de patrimoine" />
      )}

      {!enChargement && !apercu.error && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-h3)', marginBottom: 'var(--space-4)' }}>Programmes de travaux</h2>
          {travaux.error ? (
            <StateBlock
              variant="error"
              description="Impossible de charger les programmes de travaux."
              actions={[{ label: 'Réessayer', onClick: () => travaux.refetch(), primary: true }]}
            />
          ) : (
            <WorkProgramTimeline
              items={(travaux.data?.items ?? []).map(programme => ({
                ...programme,
                // Le titre du bien vient de la jointure serveur : plus besoin
                // de charger les biens pour l'afficher.
                propertyLabel: programme.property?.title
              }))}
            />
          )}
        </div>
      )}
    </>
  );
};
