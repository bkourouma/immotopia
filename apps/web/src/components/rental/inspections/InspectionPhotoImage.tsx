import React, { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { fetchInspectionPhotoBlob } from '../../../services/lease-inspections-service';

interface InspectionPhotoImageProps {
  tenantId: string;
  leaseId: string;
  inspectionId: string;
  photoId: string;
  alt: string;
  size?: number;
  onClick?: () => void;
}

/**
 * Affiche une photo protégée d'état des lieux.
 *
 * Le fichier n'est jamais servi en statique (voir `AGENTS.md`) : il faut
 * passer par `apiClient` pour porter le cookie de session dans tous les
 * déploiements, puis fabriquer une URL d'objet locale. Chaque instance revoke
 * son URL à son démontage, pour ne pas accumuler des blobs en mémoire quand la
 * liste des photos change souvent (ajout, suppression) pendant une visite.
 */
export const InspectionPhotoImage: React.FC<InspectionPhotoImageProps> = ({
  tenantId,
  leaseId,
  inspectionId,
  photoId,
  alt,
  size = 72,
  onClick
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setObjectUrl(null);
    setFailed(false);

    fetchInspectionPhotoBlob(tenantId, leaseId, inspectionId, photoId)
      .then(blob => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [tenantId, leaseId, inspectionId, photoId]);

  const boxStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 6,
    border: '1px solid var(--border-color, #d9d9d9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    cursor: onClick ? 'pointer' : undefined,
    background: '#fafafa'
  };

  if (failed) {
    return (
      <div style={boxStyle} title={alt}>
        —
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div style={boxStyle}>
        <Spin size="small" />
      </div>
    );
  }

  return (
    <div style={boxStyle} onClick={onClick}>
      <img src={objectUrl} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
};

export default InspectionPhotoImage;
