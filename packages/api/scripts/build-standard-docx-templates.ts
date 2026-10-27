/**
 * Régénère les modèles DOCX standard dans `assets/modeles_standard/`.
 *
 *   cd packages/api && npx ts-node scripts/build-standard-docx-templates.ts
 *
 * La construction est déterministe : sans changement de contenu, les fichiers
 * (et leur empreinte SHA-256, affichée ici) ne bougent pas. Ajouter l'empreinte
 * d'une ancienne version à `PREVIOUS_SHIPPED_HASHES` avant d'en livrer une nouvelle.
 */
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  STANDARD_TEMPLATES,
  buildStandardTemplate,
  standardTemplatesDir
} from '../src/lib/documents/docx-standard-templates';

async function main(): Promise<void> {
  const directory = standardTemplatesDir();
  await fs.mkdir(directory, { recursive: true });
  for (const info of STANDARD_TEMPLATES) {
    const buffer = buildStandardTemplate(info.key);
    await fs.writeFile(path.join(directory, info.fileName), buffer);
    const hash = createHash('sha256').update(buffer).digest('hex');
    console.log(`${info.fileName}  ${buffer.length} octets  sha256 ${hash}`);
  }
}

main().catch(error => {
  console.error('Échec de la génération des modèles standard :', error instanceof Error ? error.message : error);
  process.exit(1);
});
