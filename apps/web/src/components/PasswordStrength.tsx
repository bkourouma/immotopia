import React from 'react';

interface PasswordStrengthProps {
  password: string;
}

/**
 * Password strength indicator component
 * Shows visual feedback on password strength
 */
export const PasswordStrength: React.FC<PasswordStrengthProps> = ({ password }) => {
  const getStrength = (pwd: string): { level: number; label: string; color: string } => {
    if (!pwd) {
      return { level: 0, label: '', color: 'bg-gray-200' };
    }

    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[a-z]/.test(pwd)) strength++;
    if (/[0-9]/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++;

    const levels = [
      { level: 0, label: '', color: 'bg-gray-200' },
      { level: 1, label: 'Très faible', color: 'bg-red-500' },
      { level: 2, label: 'Faible', color: 'bg-orange-500' },
      { level: 3, label: 'Moyen', color: 'bg-yellow-500' },
      { level: 4, label: 'Fort', color: 'bg-green-500' },
      { level: 5, label: 'Très fort', color: 'bg-green-600' }
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
        {strength.label && (
          <span className={`text-sm font-medium ${strength.color.replace('bg-', 'text-')}`}>
            {strength.label}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-gray-600">
        Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial.
      </div>
    </div>
  );
};

