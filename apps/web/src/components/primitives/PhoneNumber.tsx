import React from 'react';

export interface PhoneNumberProps {
  value: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Numéro de téléphone isolé de la direction du texte : en arabe (RTL), le « + »
 * et les groupes de chiffres s'inversent sinon (« 07 07 +225 »).
 */
export const PhoneNumber: React.FC<PhoneNumberProps> = ({ value, className, style }) => (
  <bdi dir="ltr" className={className} style={style}>
    {value}
  </bdi>
);
