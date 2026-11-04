import { useMemo, useRef } from 'react';
import { Card } from 'antd';
import { StateBlock } from '../../../components/primitives';
import { useLocalListSearch } from '../../../utils/list-search';
import { t } from '../../../i18n/t';

/** Ce que la recherche lit dans un document de location. */
interface DocumentRecherche {
  type: string;
  title: string | null;
  document_number: string | null;
}

/** Accesseurs stables (hors du composant) : le filtrage reste mémoïsé. */
const TEXTE_DOCUMENTS = [
  (doc: { title: string | null }) => doc.title,
  (doc: { document_number: string | null }) => doc.document_number
];
const ACCESSEURS_DOCUMENTS = { type: (doc: { type: string }) => doc.type };

/**
 * Documents reçus en entier (liste bornée) : recherche locale par nom/numéro et par type.
 * `libelleType` donne le libellé d'un type (lu à chaque appel, pour suivre la langue).
 * `filteredGroupedByType` : les documents retenus, regroupés par type (ordre de première apparition).
 */
export function useDocumentsSearch<T extends DocumentRecherche>(
  documents: T[] | undefined,
  libelleType: (type: string) => string
) {
  const libelleRef = useRef(libelleType);
  libelleRef.current = libelleType;

  // Types présents dans la liste : les options du critère « Type de document ».
  const typeOptions = useMemo(
    () =>
      Array.from(new Set((documents ?? []).map(doc => doc.type))).map(type => ({
        value: type,
        label: libelleRef.current(type)
      })),
    [documents]
  );

  const local = useLocalListSearch<T>(documents, {
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Nom, numéro du document…') },
      { key: 'type', type: 'multiSelect', label: t('Type de document'), primary: true, options: typeOptions }
    ],
    text: TEXTE_DOCUMENTS,
    accessors: ACCESSEURS_DOCUMENTS
  });

  const filteredGroupedByType = useMemo(() => {
    const groupes = new Map<string, T[]>();
    for (const doc of local.filtered) {
      const groupe = groupes.get(doc.type);
      if (groupe) groupe.push(doc);
      else groupes.set(doc.type, [doc]);
    }
    return Array.from(groupes.entries());
  }, [local.filtered]);

  return { local, filteredGroupedByType };
}

/** Des documents existent mais aucun ne correspond aux critères. */
export function DocumentsSansResultat({ onClear }: { onClear: () => void }) {
  return (
    <Card>
      <StateBlock
        variant="no-results"
        actions={[{ label: t('Effacer les critères'), onClick: onClear, primary: true }]}
      />
    </Card>
  );
}
