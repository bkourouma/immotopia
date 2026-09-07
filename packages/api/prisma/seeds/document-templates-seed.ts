import { PrismaClient, DocumentType, DocumentTemplateStatus } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { uploadTemplate } from '../../src/services/document-template-service';

const prisma = new PrismaClient();

/**
 * Seed default document templates
 * 
 * This script creates global default templates for all document types.
 * Template files should be placed in: assets/modeles_documents/default/
 * 
 * Expected files:
 * - LEASE_HABITATION.docx
 * - LEASE_COMMERCIAL.docx
 * - RENT_RECEIPT.docx
 * - RENT_STATEMENT.docx
 * 
 * If template files don't exist, the script will skip creating templates for those types
 * and provide instructions.
 */
async function seedDocumentTemplates() {
  console.log('📄 Seeding Default Document Templates...\n');

  // Determine project root
  const cwd = process.cwd();
  const projectRoot =
    path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
      ? path.resolve(cwd, '..', '..')
      : cwd;

  const templatesDir = path.join(projectRoot, 'assets', 'modeles_documents', 'default');

  // Check if templates directory exists
  try {
    await fs.access(templatesDir);
  } catch {
    console.log(`⚠️  Templates directory not found: ${templatesDir}`);
    console.log('   Creating directory...');
    await fs.mkdir(templatesDir, { recursive: true });
    console.log('   ✅ Directory created\n');
  }

  // Document types to seed
  const docTypes: Array<{ type: DocumentType; filename: string; name: string }> = [
    {
      type: DocumentType.LEASE_HABITATION,
      filename: 'LEASE_HABITATION.docx',
      name: 'Contrat de Bail Habitation (Par défaut)'
    },
    {
      type: DocumentType.LEASE_COMMERCIAL,
      filename: 'LEASE_COMMERCIAL.docx',
      name: 'Contrat de Bail Commercial (Par défaut)'
    },
    {
      type: DocumentType.RENT_RECEIPT,
      filename: 'RENT_RECEIPT.docx',
      name: 'Reçu de Loyer (Par défaut)'
    },
    {
      type: DocumentType.RENT_STATEMENT,
      filename: 'RENT_STATEMENT.docx',
      name: 'Relevé de Compte Locatif (Par défaut)'
    }
  ];

  // System user ID for seeding (we'll use a placeholder or find/create one)
  let systemUserId: string;
  const systemUser = await prisma.user.findFirst({
    where: { email: { contains: 'admin' } },
    orderBy: { created_at: 'asc' }
  });

  if (systemUser) {
    systemUserId = systemUser.id;
  } else {
    // Create a system user for seeding if none exists
    const newUser = await prisma.user.create({
      data: {
        email: 'system@immotopia.local',
        passwordHash: 'seeding-only',
        fullName: 'System Seeder',
        globalRole: 'USER',
        emailVerified: true,
        isActive: false
      }
    });
    systemUserId = newUser.id;
    console.log('   ℹ️  Created system user for seeding\n');
  }

  let createdCount = 0;
  let skippedCount = 0;

  for (const docTypeConfig of docTypes) {
    const filePath = path.join(templatesDir, docTypeConfig.filename);

    try {
      // Check if file exists
      await fs.access(filePath);

      // Check if template already exists
      const existing = await prisma.documentTemplate.findFirst({
        where: {
          tenant_id: null, // Global template
          doc_type: docTypeConfig.type,
          is_default: true,
          status: DocumentTemplateStatus.ACTIVE
        }
      });

      if (existing) {
        console.log(`   ⏭️  Skipping ${docTypeConfig.type}: Default template already exists`);
        skippedCount++;
        continue;
      }

      // Read file
      const fileBuffer = await fs.readFile(filePath);

      // Upload template using the service
      await uploadTemplate(
        null, // tenantId = null for global templates
        docTypeConfig.type,
        fileBuffer,
        docTypeConfig.filename,
        docTypeConfig.name,
        systemUserId
      );

      // Mark as default
      const template = await prisma.documentTemplate.findFirst({
        where: {
          tenant_id: null,
          doc_type: docTypeConfig.type,
          status: DocumentTemplateStatus.ACTIVE
        },
        orderBy: { created_at: 'desc' }
      });

      if (template) {
        // Set as default (unset other defaults first)
        await prisma.documentTemplate.updateMany({
          where: {
            tenant_id: null,
            doc_type: docTypeConfig.type,
            is_default: true
          },
          data: { is_default: false }
        });

        await prisma.documentTemplate.update({
          where: { id: template.id },
          data: { is_default: true, status: DocumentTemplateStatus.ACTIVE }
        });

        console.log(`   ✅ Created default template for ${docTypeConfig.type}`);
        createdCount++;
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log(`   ⚠️  Skipping ${docTypeConfig.type}: File not found (${docTypeConfig.filename})`);
        skippedCount++;
      } else {
        console.error(`   ❌ Error processing ${docTypeConfig.type}:`, error.message);
      }
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   • Templates created: ${createdCount}`);
  console.log(`   • Templates skipped: ${skippedCount}`);

  if (skippedCount > 0) {
    console.log('\n💡 To create default templates:');
    console.log(`   1. Place DOCX template files in: ${templatesDir}`);
    console.log('   2. Name files: LEASE_HABITATION.docx, LEASE_COMMERCIAL.docx, etc.');
    console.log('   3. Run this seed script again');
    console.log('\n   Example template structure:');
    console.log('   CONTRAT DE BAIL HABITATION');
    console.log('   Entre: {{AGENCE_NOM}}');
    console.log('   Et: {{LOCATAIRE_NOM}}');
    console.log('   Pour le bien: {{BIEN_ADRESSE}}');
    console.log('   Loyer: {{BAIL_LOYER_MENSUEL}} FCFA');
  }

  console.log('\n✅ Document templates seeding completed!\n');
}

// Run if called directly
if (require.main === module) {
  seedDocumentTemplates()
    .catch((e) => {
      console.error('❌ Error seeding document templates:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedDocumentTemplates };
