import { useEffect, useState } from 'react';
import { fetchReceivingAccountQr } from '../../services/receiving-account-service';

export interface ReceivingAccountQrState {
  /** URL objet de l'image, `null` tant qu'elle n'est pas chargée. */
  url: string | null;
  loading: boolean;
  failed: boolean;
}

/**
 * Charge l'image d'un QR par la route authentifiée (blob via `utils/api-client`),
 * jamais par une balise `<img>` pointant un chemin `/uploads`. L'URL objet est
 * révoquée au changement de chemin et au démontage.
 */
export function useReceivingAccountQr(qrPath: string | null | undefined, enabled = true): ReceivingAccountQrState {
  const [state, setState] = useState<ReceivingAccountQrState>({ url: null, loading: false, failed: false });

  useEffect(() => {
    if (!qrPath || !enabled) {
      setState({ url: null, loading: false, failed: false });
      return undefined;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ url: null, loading: true, failed: false });
    fetchReceivingAccountQr(qrPath)
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, loading: false, failed: true });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [qrPath, enabled]);

  return state;
}
