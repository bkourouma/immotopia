import React from 'react';

interface PasswordStrengthProps {
  password: string;
}

/**
 * Password strength indicator component
 * Shows visual feedback on password strength
 */
export const PasswordStrength: React.FC<PasswordStrengthProps> = ({ password }) => {
  const getStrength = (pwd: string): { level: number; label: string; color: string; textColor: string } => {
    if (!pwd) {
      return { level: 0, label: '', color: 'bg-gray-200', textColor: '' };
    }

    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[a-z]/.test(pwd)) strength++;
    if (/[0-9]/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++;

    const levels = [
      // Rampe SEQUENTIELLE a cinq crans pour trois roles semantiques : les
      // roles portent les extremes, deux teintes brutes tiennent les crans
      // intermediaires. Le cran orange, lui, devait partir — il tombait sur la
      // teinte de la marque, a qui le systeme interdit de porter un etat.
      //
      // `color` peint la BARRE, `textColor` ecrit le LIBELLE, et les deux ne
      // peuvent pas etre la meme valeur : la couleur d'une barre de 8 px de
      // haut releve du seuil non-texte (3:1), celle d'un libelle du seuil
      // texte (4,5:1). Le libelle derivait de la barre par
      // `color.replace('bg-', 'text-')` — les cinq crans echouaient donc a AA,
      // « Moyen » descendant jusqu'a 1,53:1. Deux crans partagent
      // `warning-text` : l'ecart se lit sur le libelle et sur la longueur de
      // la barre, jamais sur la seule couleur (WCAG 1.4.1).
      { level: 0, label: '', color: 'bg-gray-200', textColor: '' },
      { level: 1, label: 'Très faible', color: 'bg-error', textColor: 'text-error-text' },
      { level: 2, label: 'Faible', color: 'bg-warning', textColor: 'text-warning-text' },
      { level: 3, label: 'Moyen', color: 'bg-yellow-400', textColor: 'text-warning-text' },
      { level: 4, label: 'Fort', color: 'bg-green-500', textColor: 'text-success-text' },
      { level: 5, label: 'Très fort', color: 'bg-success', textColor: 'text-success-text' }
    ];

    return levels[strength] || levels[0];
  };

  const strength = getStrength(password);

  if (!password) {
    return null;
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 rounded-full h-2">
          <div
            className={`${strength.color} h-2 rounded-full transition-all duration-300`}
            style={{ width: `${(strength.level / 5) * 100}%` }}
          />
        </div>
        {strength.label && <span className={`text-sm font-medium ${strength.textColor}`}>{strength.label}</span>}
      </div>
      <div className="mt-1 text-xs text-gray-600">
        Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère
        spécial.
      </div>
    </div>
  );
};
