import React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Select } from 'antd';
import { DataCard, PageHeader, StatusTag } from '../../components/primitives';

/**
 * Scène de mesure de la restauration du défilement.
 *
 * Elle existe parce que la question ne se tranche pas par raisonnement :
 * `REFONTE_UI_UX.md` §9 en fait un critère de sortie, et la consigne était
 * explicite — **une mesure réelle, pas une déduction** : liste filtrée,
 * ouverture d'un détail, retour, position vérifiée.
 *
 * Elle monte le mécanisme réel — `useScrollRestoration`, le même que la
 * coquille — sur une liste assez longue pour défiler, avec un filtre porté par
 * l'URL et un écran de détail. Les écrans de production ne peuvent pas servir
 * ici : leurs liens pointent vers des adresses absolues que l'atelier, monté
 * sous `/atelier/*`, ne résout pas.
 *
 * Ce qu'elle mesure est donc le mécanisme, pas un écran donné. C'est
 * exactement ce dont dépendent tous les écrans, puisqu'ils partagent ce hook.
 */

const ELEMENTS = Array.from({ length: 40 }, (_, index) => ({
  id: String(index + 1),
  titre: `Élément ${index + 1}`,
  categorie: index % 3 === 0 ? 'A' : index % 3 === 1 ? 'B' : 'C',
  statut: index % 4 === 0 ? 'OVERDUE' : index % 4 === 1 ? 'PAID' : 'DUE'
}));

export const SceneDefilementListe: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const categorie = params.get('categorie');

  const visibles = categorie ? ELEMENTS.filter(e => e.categorie === categorie) : ELEMENTS;

  return (
    <>
      <PageHeader title="Liste de mesure" subtitle={`${visibles.length} éléments`} />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <label htmlFor="categorie">Catégorie</label>
        <Select
          id="categorie"
          style={{ width: 200, display: 'block' }}
          placeholder="Toutes"
          allowClear
          value={categorie || undefined}
          onChange={valeur => {
            const suivant = new URLSearchParams(params);
            if (valeur) suivant.set('categorie', valeur);
            else suivant.delete('categorie');
            setParams(suivant);
          }}
          options={[
            { value: 'A', label: 'Catégorie A' },
            { value: 'B', label: 'Catégorie B' },
            { value: 'C', label: 'Catégorie C' }
          ]}
        />
      </div>

      <div data-testid="liste">
        {visibles.map(element => (
          <DataCard
            key={element.id}
            title={element.titre}
            aria-label={element.titre}
            subtitle={`Catégorie ${element.categorie}`}
            status={<StatusTag status={element.statut} />}
            fields={[{ label: 'Identifiant', value: element.id }]}
            onOpen={() => navigate(`/atelier/defilement/${element.id}${categorie ? `?categorie=${categorie}` : ''}`)}
          />
        ))}
      </div>
    </>
  );
};

export const SceneDefilementDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const categorie = params.get('categorie');

  return (
    <>
      <PageHeader title={`Élément ${id}`} subtitle="Écran de détail" />
      <p>Revenez en arrière : la liste doit retrouver la position d'où vous êtes parti, filtre compris.</p>
      <Link to={`/atelier/defilement${categorie ? `?categorie=${categorie}` : ''}`}>
        <Button>Retour par lien (nouvelle entrée d'historique)</Button>
      </Link>
      <div style={{ height: 1200 }} aria-hidden="true" />
      <p>Fin du détail.</p>
    </>
  );
};
