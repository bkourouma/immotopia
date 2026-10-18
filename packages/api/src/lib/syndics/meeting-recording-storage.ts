import { createWriteStream, promises as fs } from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../../config/env';
import { RecordingTooLargeError } from './meeting-recording-errors';

/**
 * Stockage S3 (ou compatible) des enregistrements d'AG (spec 045, R3 et R5) :
 * telechargement EN FLUX d'un objet vers un fichier local et suppression.
 * Jamais de cle d'acces ni de cle d'objet dans les journaux ni dans les erreurs.
 */

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    if (!env.LIVEKIT_RECORDING_S3_ACCESS_KEY || !env.LIVEKIT_RECORDING_S3_SECRET) {
      throw new Error('Recording storage is not configured');
    }
    client = new S3Client({
      region: env.LIVEKIT_RECORDING_S3_REGION,
      endpoint: env.LIVEKIT_RECORDING_S3_ENDPOINT,
      forcePathStyle: env.LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE === '1',
      credentials: {
        accessKeyId: env.LIVEKIT_RECORDING_S3_ACCESS_KEY,
        secretAccessKey: env.LIVEKIT_RECORDING_S3_SECRET
      }
    });
  }
  return client;
}

/** Remise a zero du client paresseux (tests). */
export function _resetRecordingStorageForTests(): void {
  client = null;
}

/**
 * Telecharge l'objet vers `destination` : ecriture dans un fichier temporaire
 * voisin puis renommage, pour qu'un fichier incomplet ne porte jamais le nom
 * final. Rend la taille en octets. En cas d'echec le temporaire est supprime.
 */
export async function downloadRecordingObject(storageKey: string, destination: string): Promise<number> {
  const bucket = env.LIVEKIT_RECORDING_S3_BUCKET;
  if (!bucket) throw new Error('Recording storage is not configured');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;
  try {
    const response = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
    if (!response.Body) throw new Error('Empty recording object');
    // Taille annoncee par S3 : plafond verifie AVANT de telecharger quoi que ce soit.
    if ((response.ContentLength ?? 0) > env.LIVEKIT_RECORDING_MAX_BYTES) {
      (response.Body as Readable).destroy();
      throw new RecordingTooLargeError();
    }
    await pipeline(response.Body as Readable, createWriteStream(temporary));
    const { size } = await fs.stat(temporary);
    if (size === 0) throw new Error('Empty recording object');
    await fs.rename(temporary, destination);
    return size;
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
}

/** Supprime l'objet (S3 ne signale pas l'absence). */
export async function deleteRecordingObject(storageKey: string): Promise<void> {
  const bucket = env.LIVEKIT_RECORDING_S3_BUCKET;
  if (!bucket) return;
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}
