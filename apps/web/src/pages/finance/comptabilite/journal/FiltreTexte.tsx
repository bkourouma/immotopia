import React, { useEffect, useRef, useState } from 'react';
import { Input } from 'antd';

/** Délai de frappe avant d'écrire dans l'URL (Entrée et la perte du focus valident tout de suite). */
export const DELAI_SAISIE_MS = 300;

interface FiltreTexteProps {
  id: string;
  label: string;
  placeholder: string;
  /** Valeur portée par l'URL. */
  value: string;
  /** Valeur validée : écrit dans l'URL. */
  onCommit: (value: string) => void;
  width?: number;
}

/**
 * Champ de filtre texte d'une page comptable. La saisie reste locale jusqu'à
 * validation (Entrée, perte du focus ou ~300 ms sans frappe) : chaque touche
 * ne relance pas une requête. Quand l'URL change ailleurs (effacement des
 * filtres, retour arrière), le champ suit.
 */
export const FiltreTexte: React.FC<FiltreTexteProps> = ({ id, label, placeholder, value, onCommit, width = 260 }) => {
  const [saisie, setSaisie] = useState(value);
  const valide = useRef(value);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    if (value !== valide.current) {
      valide.current = value;
      setSaisie(value);
    }
  }, [value]);

  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    []
  );

  const valider = (texte: string) => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
    const propre = texte.trim();
    if (propre === valide.current) return;
    valide.current = propre;
    commitRef.current(propre);
  };

  return (
    <div style={{ minWidth: 200, width }}>
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        allowClear
        placeholder={placeholder}
        value={saisie}
        onChange={event => {
          const texte = event.target.value;
          setSaisie(texte);
          if (minuteur.current) clearTimeout(minuteur.current);
          minuteur.current = setTimeout(() => valider(texte), DELAI_SAISIE_MS);
        }}
        onPressEnter={() => valider(saisie)}
        onBlur={() => valider(saisie)}
      />
    </div>
  );
};
