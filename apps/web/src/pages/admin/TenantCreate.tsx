import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * `/admin/tenants/new` — ancienne page pleine page de création d'agence.
 *
 * Le formulaire vit désormais dans `<CreateTenantDrawer>`, monté une seule
 * fois par `TenantsList.tsx` : dupliquer sa logique ici (validation, clé
 * d'idempotence, écran de confirmation) aurait fait deux formulaires à tenir
 * à jour de concert. Cette route reste pour ne pas casser les liens déjà en
 * circulation ; elle renvoie vers la liste en demandant l'ouverture du
 * panneau.
 */
export const TenantCreate: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/admin/tenants', { replace: true, state: { openCreate: true } });
  }, [navigate]);

  return null;
};
