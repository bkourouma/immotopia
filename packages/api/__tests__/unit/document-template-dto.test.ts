/**
 * Un modèle de document ne sort jamais avec son chemin de stockage disque
 * (`storage_path`) ni le nom de fichier interne (BUG-2026-09-30-038).
 */
import { toTemplateDto } from '../../src/controllers/document-template-controller';

describe('toTemplateDto', () => {
  it('retire storage_path et stored_filename, garde le reste', () => {
    const dto = toTemplateDto({
      id: 't-1',
      name: 'Bail',
      original_filename: 'bail.docx',
      stored_filename: 'abc.docx',
      storage_path: 'D:\\APP\\Immobillier\\uploads\\templates\\abc.docx',
      is_default: true
    });

    expect(dto).toEqual({ id: 't-1', name: 'Bail', original_filename: 'bail.docx', is_default: true });
    expect(JSON.stringify(dto)).not.toMatch(/[A-Za-z]:[\\/]|storage_path/);
  });
});
