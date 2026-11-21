import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Upload, X, Image, Video, CheckCircle, XCircle, RotateCw, FileVideo } from 'lucide-react';
import { PropertyMediaType } from '../../types/property-types';
import apiClient from '../../utils/api-client';
import { t } from '../../i18n/t';
import { apiErrorText } from './property-api-errors';

const TYPES_ACCEPTES: Record<string, string[]> = {
  PHOTO: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  VIDEO: ['video/mp4', 'video/webm', 'video/quicktime']
};

/** Poids maximal d'un fichier, annoncé à l'écran et contrôlé avant l'envoi. */
const TAILLE_MAX_OCTETS = 50 * 1024 * 1024;

interface PropertyMediaUploadProps {
  propertyId: string;
  tenantId: string;
  onUploadComplete?: () => void;
  mediaType?: PropertyMediaType;
}

type EtatFichier = 'attente' | 'envoi' | 'envoye' | 'echec' | 'refuse';

interface FichierSuivi {
  id: number;
  file: File;
  etat: EtatFichier;
  /** 0 à 100. */
  progression: number;
  /** Motif en langage métier, quand l'état est « échec » ou « refusé ». */
  motif?: string;
}

function formaterTaille(octets: number): string {
  if (octets >= 1024 * 1024) return `${(octets / (1024 * 1024)).toFixed(1).replace('.0', '')} Mo`;
  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

/** Aperçu d'une photo choisie, avant même son envoi. */
const Vignette: React.FC<{ file: File }> = ({ file }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith('image/') || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 text-gray-400"
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : file.type.startsWith('video/') ? (
        <FileVideo className="h-5 w-5" />
      ) : (
        <Image className="h-5 w-5" />
      )}
    </span>
  );
};

export const PropertyMediaUpload: React.FC<PropertyMediaUploadProps> = ({
  propertyId,
  tenantId,
  onUploadComplete,
  mediaType = PropertyMediaType.PHOTO
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [fichiers, setFichiers] = useState<FichierSuivi[]>([]);
  const [uploadStatus, setUploadStatus] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prochainId = useRef(1);
  // Un envoi en cours bloque un second lot : évite deux files qui se croisent.
  const enCours = useRef(false);

  // Efface le message de bilan : 3 s si tout est passé, 10 s sinon.
  useEffect(() => {
    if (!uploadStatus) {
      return undefined;
    }
    const timer = setTimeout(() => setUploadStatus(null), uploadStatus.success ? 3000 : 10000);
    return () => clearTimeout(timer);
  }, [uploadStatus]);

  // Les fichiers envoyés quittent la liste avec le bilan de réussite ; les
  // échecs restent tant qu'ils n'ont pas été relancés ou écartés.
  useEffect(() => {
    if (uploadStatus === null && !uploading) {
      setFichiers(precedents =>
        precedents.some(f => f.etat === 'envoye') ? precedents.filter(f => f.etat !== 'envoye') : precedents
      );
    }
  }, [uploadStatus, uploading]);

  const modifier = useCallback((id: number, changes: Partial<FichierSuivi>) => {
    setFichiers(precedents => precedents.map(f => (f.id === id ? { ...f, ...changes } : f)));
  }, []);

  /** Refus avant envoi : type puis poids, en langage métier. Renvoie le motif, ou `null`. */
  const motifDeRefus = (file: File): string | null => {
    const acceptes = TYPES_ACCEPTES[mediaType];
    if (acceptes && !acceptes.includes(file.type)) {
      if (mediaType === PropertyMediaType.PHOTO && /\.(heic|heif)$/i.test(file.name)) {
        return t(
          'Les photos au format HEIC (iPhone) ne sont pas acceptées. Réglez l’appareil sur « le plus compatible » ou exportez la photo en JPEG.'
        );
      }
      return mediaType === PropertyMediaType.PHOTO
        ? t('Type de fichier non accepté pour une photo. Formats autorisés : JPEG, PNG, WebP.')
        : t('Type de fichier non accepté pour une vidéo. Formats autorisés : MP4, WebM, QuickTime.');
    }
    if (file.size > TAILLE_MAX_OCTETS) {
      return t('Ce fichier fait {{taille}} : la limite est de 50 Mo. Réduisez sa taille, puis ajoutez-le à nouveau.', {
        taille: formaterTaille(file.size)
      });
    }
    return null;
  };

  /** Envoie un fichier ; renvoie vrai s'il est passé. */
  const envoyer = async (suivi: FichierSuivi): Promise<boolean> => {
    modifier(suivi.id, { etat: 'envoi', progression: 0, motif: undefined });
    try {
      const formData = new FormData();
      formData.append('file', suivi.file);
      formData.append('mediaType', mediaType);

      await apiClient.post(`/tenants/${tenantId}/properties/${propertyId}/media`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: event => {
          if (event.total) modifier(suivi.id, { progression: Math.round((event.loaded / event.total) * 100) });
        }
      });
      modifier(suivi.id, { etat: 'envoye', progression: 100 });
      return true;
    } catch (error: unknown) {
      console.warn(`Error uploading ${suivi.file.name}:`, (error as { message?: string })?.message);
      modifier(suivi.id, {
        etat: 'echec',
        motif: apiErrorText(error, t('Échec du téléchargement. Veuillez réessayer.'))
      });
      return false;
    }
  };

  /** Envoie la file un fichier à la fois, puis annonce le bilan. */
  const traiter = async (aEnvoyer: FichierSuivi[], refuses: number) => {
    if (enCours.current) return;
    enCours.current = true;
    setUploading(true);
    setUploadStatus(null);
    let reussis = 0;
    let echecs = refuses;

    try {
      for (const suivi of aEnvoyer) {
        if (await envoyer(suivi)) reussis++;
        else echecs++;
      }

      if (reussis > 0 && onUploadComplete) {
        onUploadComplete();
      }

      if (echecs === 0) {
        setUploadStatus({
          success: true,
          message: t('{{successCount}} fichier{{value}} téléchargé{{value2}} avec succès !', {
            successCount: reussis,
            value: reussis > 1 ? 's' : '',
            value2: reussis > 1 ? 's' : ''
          })
        });
      } else if (reussis > 0) {
        setUploadStatus({
          success: false,
          message: t('{{successCount}} réussi{{value}}, {{errorCount}} échoué{{value2}}', {
            successCount: reussis,
            value: reussis > 1 ? 's' : '',
            errorCount: echecs,
            value2: echecs > 1 ? 's' : ''
          })
        });
      } else {
        setUploadStatus({
          success: false,
          message:
            echecs > 1
              ? t("Aucun des {{count}} fichiers n'a été envoyé. Le détail est indiqué sous chaque fichier.", {
                  count: echecs
                })
              : t("Le fichier n'a pas été envoyé. Le motif est indiqué ci-dessous.")
        });
      }
    } finally {
      enCours.current = false;
      setUploading(false);
    }
  };

  const handleFileSelect = (files: FileList | File[] | null) => {
    if (!files || files.length === 0 || enCours.current) return;

    const choisis = Array.from(files);
    const suivis: FichierSuivi[] = choisis.map(file => {
      const motif = motifDeRefus(file);
      return {
        id: prochainId.current++,
        file,
        etat: motif ? 'refuse' : 'attente',
        progression: 0,
        motif: motif ?? undefined
      };
    });

    // Les refus précédents sont remplacés par ce nouveau lot ; rien d'autre ne bouge.
    setFichiers(precedents => [...precedents.filter(f => f.etat === 'echec'), ...suivis]);
    void traiter(
      suivis.filter(f => f.etat === 'attente'),
      suivis.filter(f => f.etat === 'refuse').length
    );
  };

  const relancer = (suivi: FichierSuivi) => {
    if (enCours.current) return;
    void traiter([suivi], 0);
  };

  const ecarter = (id: number) => setFichiers(precedents => precedents.filter(f => f.id !== id));

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const libelleEtat = (f: FichierSuivi): string => {
    switch (f.etat) {
      case 'attente':
        return t("En attente d'envoi");
      case 'envoi':
        return t('Envoi en cours… {{value}} %', { value: f.progression });
      case 'envoye':
        return t('Envoyé');
      case 'refuse':
        return t('Refusé');
      default:
        return t('Échec');
    }
  };

  return (
    <div className="space-y-2">
      {/* Bilan de l'envoi, annoncé aux lecteurs d'écran */}
      {uploadStatus && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            uploadStatus.success
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {uploadStatus.success ? (
            <CheckCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          )}
          <span>{uploadStatus.message}</span>
        </div>
      )}

      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors sm:p-8 ${
          dragActive ? 'border-primary bg-primary-bg' : 'border-gray-300 hover:border-gray-400'
        } ${uploading ? 'opacity-60' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          aria-label={
            mediaType === PropertyMediaType.VIDEO
              ? t('Choisir des vidéos à ajouter')
              : t('Choisir des photos à ajouter')
          }
          accept={
            mediaType === PropertyMediaType.PHOTO
              ? 'image/jpeg,image/jpg,image/png,image/webp'
              : mediaType === PropertyMediaType.VIDEO
                ? 'video/mp4,video/webm,video/quicktime'
                : '*'
          }
          className="hidden"
          onChange={e => {
            const input = e.target;
            const choisis = input.files ? Array.from(input.files) : [];
            handleFileSelect(choisis);
            // Permet de re-choisir le même fichier après une correction.
            try {
              input.value = '';
            } catch {
              /* certains navigateurs refusent la réinitialisation */
            }
          }}
        />

        <div className="flex justify-center mb-3" aria-hidden="true">
          {mediaType === PropertyMediaType.PHOTO ? (
            <Image className="h-10 w-10 text-gray-400" />
          ) : mediaType === PropertyMediaType.VIDEO ? (
            <Video className="h-10 w-10 text-gray-400" />
          ) : (
            <Upload className="h-10 w-10 text-gray-400" />
          )}
        </div>
        <p className="text-sm text-gray-600 mb-2">{t('Glissez-déposez vos fichiers ici ou')}</p>
        <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4 me-2" aria-hidden="true" />
          {uploading ? t('Téléchargement en cours...') : t('Sélectionner des fichiers')}
        </Button>
        <p className="text-xs text-gray-500 mt-2">
          {mediaType === PropertyMediaType.PHOTO
            ? t('JPEG, PNG, WebP (max 50MB)')
            : mediaType === PropertyMediaType.VIDEO
              ? t('MP4, WebM, QuickTime (max 50MB)')
              : t('Fichiers multimédias (max 50MB)')}
        </p>
      </div>

      {/* Un fichier par ligne : son état, sa progression, son motif d'échec */}
      {fichiers.length > 0 && (
        <ul className="m-0 list-none space-y-2 p-0" aria-label={t('Fichiers en cours d’envoi')}>
          {fichiers.map(f => (
            <li
              key={f.id}
              className={`flex items-start gap-3 rounded-lg border p-2 text-sm ${
                f.etat === 'echec' || f.etat === 'refuse' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
              }`}
            >
              <Vignette file={f.file} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-gray-800">{f.file.name}</span>
                  <span className="flex-shrink-0 text-xs text-gray-500">{formaterTaille(f.file.size)}</span>
                </div>
                <div
                  className={`text-xs ${f.etat === 'echec' || f.etat === 'refuse' ? 'text-red-700' : 'text-gray-600'}`}
                >
                  {libelleEtat(f)}
                </div>
                {f.etat === 'envoi' && (
                  <div
                    role="progressbar"
                    aria-label={t('Envoi de {{value}}', { value: f.file.name })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={f.progression}
                    className="mt-1 h-1.5 w-full rounded-full bg-gray-200"
                  >
                    <div
                      className="h-1.5 rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${f.progression}%` }}
                    />
                  </div>
                )}
                {f.motif && (
                  <p role="alert" className="m-0 mt-1 text-xs text-red-700">
                    {f.motif}
                  </p>
                )}
              </div>
              {f.etat === 'echec' && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => relancer(f)}
                  aria-label={t('Réessayer l’envoi de {{value}}', { value: f.file.name })}
                >
                  <RotateCw className="h-4 w-4 me-1" aria-hidden="true" />
                  {t('Réessayer')}
                </Button>
              )}
              {(f.etat === 'echec' || f.etat === 'refuse') && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={uploading}
                  onClick={() => ecarter(f.id)}
                  aria-label={t('Écarter {{value}} de la liste', { value: f.file.name })}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
