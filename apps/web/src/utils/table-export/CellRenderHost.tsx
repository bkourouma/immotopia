import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Montage hors écran des cellules dont le texte n'existe qu'une fois rendu.
 *
 * Le portail est rendu PAR le composant du menu d'export : les cellules
 * héritent donc de tous les contextes de l'application (routeur, React Query,
 * i18n, thème, `App` d'Ant Design) comme dans le tableau lui-même. Le conteneur
 * est un `div` détaché du document : rien n'est visible, rien ne se mesure.
 *
 * Chaque cellule a son propre error boundary : une cellule qui lève rend `null`
 * (repli sur la valeur brute) sans emporter le paquet ni le tableau.
 */

export interface RenderJob {
  id: number;
  nodes: React.ReactNode[];
  resolve: (texts: (string | null)[]) => void;
}

class CellBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): React.ReactNode {
    return this.state.failed ? <span data-export-failed="1" /> : this.props.children;
  }
}

export function CellRenderHost({ job }: { job: RenderJob | null }): React.ReactPortal | null {
  const [container] = useState(() => document.createElement('div'));

  useEffect(() => {
    if (!job) return undefined;
    // Un tour de boucle : laisse les effets des cellules (texte posé après coup) s'exécuter.
    const timer = setTimeout(() => {
      const texts = job.nodes.map((_, index) => {
        const cell = container.querySelector(`[data-export-cell="${index}"]`);
        if (!cell || cell.querySelector('[data-export-failed]')) return null;
        return cell.textContent ?? '';
      });
      job.resolve(texts);
    }, 0);
    return () => clearTimeout(timer);
  }, [job, container]);

  if (!job) return null;
  return createPortal(
    job.nodes.map((node, index) => (
      <span key={index} data-export-cell={index}>
        <CellBoundary>{node}</CellBoundary>
      </span>
    )),
    container,
    `export-job-${job.id}`
  );
}
