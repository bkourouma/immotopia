import { PrismaClient, PropertyType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed property type templates according to canevas_property_template_engine.md
 * This includes all field definitions and sections for each property type
 */
async function seedPropertyTemplates() {
  console.log('🏠 Seeding Property Type Templates...');

  const templates = [
    // ========== APPARTEMENT ==========
    {
      propertyType: PropertyType.APPARTEMENT,
      name: 'Appartement',
      description: 'Template for apartment properties',
      fieldDefinitions: [
        {
          key: 'floor',
          label: 'Étage',
          type: 'number',
          required: false,
          section: 'building',
        },
        {
          key: 'elevator',
          label: 'Ascenseur',
          type: 'boolean',
          required: false,
          section: 'building',
        },
        {
          key: 'balcony',
          label: 'Balcon',
          type: 'boolean',
          required: false,
          section: 'features',
        },
        {
          key: 'parking',
          label: 'Parking',
          type: 'boolean',
          required: false,
          section: 'features',
        },
        {
          key: 'orientation',
          label: 'Orientation',
          type: 'select',
          required: false,
          validation: {
            options: ['NORTH', 'SOUTH', 'EAST', 'WEST'],
          },
          section: 'features',
        },
      ],
      sections: [
        {
          id: 'building',
          title: 'Bâtiment',
          order: 1,
          fieldDefinitions: ['floor', 'elevator'],
        },
        {
          id: 'features',
          title: 'Caractéristiques',
          order: 2,
          fieldDefinitions: ['balcony', 'parking', 'orientation'],
        },
      ],
      validationRules: {
        floor: { min: -2, max: 50 },
      },
    },

    // ========== MAISON / VILLA ==========
    {
      propertyType: PropertyType.MAISON_VILLA,
      name: 'Maison / Villa',
      description: 'Template for house/villa properties',
      fieldDefinitions: [
        {
          key: 'habitable_area',
          label: 'Surface habitée',
          type: 'number',
          required: false,
          section: 'building',
          unit: 'm²',
        },
        {
          key: 'land_area',
          label: 'Surface terrain',
          type: 'number',
          required: false,
          section: 'land',
          unit: 'm²',
        },
        {
          key: 'garden',
          label: 'Jardin',
          type: 'boolean',
          required: false,
          section: 'features',
        },
        {
          key: 'pool',
          label: 'Piscine',
          type: 'boolean',
          required: false,
          section: 'features',
        },
        {
          key: 'levels',
          label: 'Nombre de niveaux',
          type: 'number',
          required: false,
          section: 'building',
        },
        {
          key: 'generator',
          label: 'Groupe électrogène',
          type: 'boolean',
          required: false,
          section: 'features',
        },
        {
          key: 'garage',
          label: 'Garage',
          type: 'select',
          required: false,
          validation: {
            options: ['GARAGE_1', 'GARAGE_2'],
          },
          section: 'features',
        },
      ],
      sections: [
        {
          id: 'land',
          title: 'Terrain',
          order: 1,
          fieldDefinitions: ['land_area'],
        },
        {
          id: 'building',
          title: 'Bâtiment',
          order: 2,
          fieldDefinitions: ['habitable_area', 'levels'],
        },
        {
          id: 'features',
          title: 'Caractéristiques',
          order: 3,
          fieldDefinitions: ['garden', 'pool', 'generator', 'garage'],
        },
      ],
      validationRules: {
        habitable_area: { min: 0 },
        land_area: { min: 0 },
        levels: { min: 1, max: 10 },
      },
    },

    // ========== STUDIO ==========
    {
      propertyType: PropertyType.STUDIO,
      name: 'Studio',
      description: 'Template for studio properties',
      fieldDefinitions: [
        {
          key: 'kitchenette',
          label: 'Coin cuisine',
          type: 'boolean',
          required: false,
          section: 'features',
        },
        {
          key: 'bathroom_type',
          label: 'Type de salle d\'eau',
          type: 'select',
          required: false,
          validation: {
            options: ['SHOWER', 'BATHTUB'],
          },
          section: 'features',
        },
        {
          key: 'floor',
          label: 'Étage',
          type: 'number',
          required: false,
          section: 'building',
        },
        {
          key: 'elevator',
          label: 'Ascenseur',
          type: 'boolean',
          required: false,
          section: 'building',
        },
      ],
      sections: [
        {
          id: 'building',
          title: 'Bâtiment',
          order: 1,
          fieldDefinitions: ['floor', 'elevator'],
        },
        {
          id: 'features',
          title: 'Caractéristiques',
          order: 2,
          fieldDefinitions: ['kitchenette', 'bathroom_type'],
        },
      ],
      validationRules: {
        floor: { min: -2, max: 50 },
      },
    },

    // ========== DUPLEX / TRIPLEX ==========
    {
      propertyType: PropertyType.DUPLEX_TRIPLEX,
      name: 'Duplex / Triplex',
      description: 'Template for duplex/triplex properties',
      fieldDefinitions: [
        {
          key: 'levels',
          label: 'Nombre de niveaux',
          type: 'number',
          required: false,
          section: 'building',
        },
        {
          key: 'internal_stairs',
          label: 'Escalier interne',
          type: 'boolean',
          required: false,
          section: 'building',
        },
        {
          key: 'terrace',
          label: 'Terrasse',
          type: 'boolean',
          required: false,
          section: 'features',
        },
        {
          key: 'balcony',
          label: 'Balcon',
          type: 'boolean',
          required: false,
          section: 'features',
        },
      ],
      sections: [
        {
          id: 'building',
          title: 'Bâtiment',
          order: 1,
          fieldDefinitions: ['levels', 'internal_stairs'],
        },
        {
          id: 'features',
          title: 'Caractéristiques',
          order: 2,
          fieldDefinitions: ['terrace', 'balcony'],
        },
      ],
      validationRules: {
        levels: { min: 2, max: 3 },
      },
    },

    // ========== CHAMBRE (COLOCATION) ==========
    {
      propertyType: PropertyType.CHAMBRE_COLOCATION,
      name: 'Chambre (Colocation)',
      description: 'Template for room/colocation properties',
      fieldDefinitions: [
        {
          key: 'room_area',
          label: 'Surface chambre',
          type: 'number',
          required: false,
          section: 'room',
          unit: 'm²',
        },
        {
          key: 'room_type',
          label: 'Type de chambre',
          type: 'select',
          required: false,
          validation: {
            options: ['PRIVATE', 'SHARED'],
          },
          section: 'room',
        },
        {
          key: 'bathroom_access',
          label: 'Salle de bain',
          type: 'select',
          required: false,
          validation: {
            options: ['PRIVATE', 'SHARED'],
          },
          section: 'room',
        },
        {
          key: 'kitchen_access',
          label: 'Cuisine',
          type: 'select',
          required: false,
          validation: {
            options: ['PRIVATE', 'SHARED', 'NONE'],
          },
          section: 'room',
        },
        {
          key: 'total_roommates',
          label: 'Nombre total de colocataires',
          type: 'number',
          required: false,
          section: 'room',
        },
        {
          key: 'included_services',
          label: 'Services inclus',
          type: 'multiselect',
          required: false,
          validation: {
            options: ['INTERNET', 'WATER', 'POWER', 'CLEANING'],
          },
          section: 'room',
        },
      ],
      sections: [
        {
          id: 'room',
          title: 'Caractéristiques de la chambre',
          order: 1,
          fieldDefinitions: ['room_area', 'room_type', 'bathroom_access', 'kitchen_access', 'total_roommates', 'included_services'],
        },
      ],
      validationRules: {
        room_area: { min: 0 },
        total_roommates: { min: 1 },
      },
    },

    // ========== BUREAU ==========
    {
      propertyType: PropertyType.BUREAU,
      name: 'Bureau',
      description: 'Template for office properties',
      fieldDefinitions: [
        {
          key: 'office_area',
          label: 'Surface bureaux',
          type: 'number',
          required: false,
          section: 'office',
          unit: 'm²',
        },
        {
          key: 'meeting_rooms',
          label: 'Salles de réunion',
          type: 'number',
          required: false,
          section: 'office',
        },
        {
          key: 'reception',
          label: 'Accueil / réception',
          type: 'boolean',
          required: false,
          section: 'office',
        },
        {
          key: 'fiber_ready',
          label: 'Fibre disponible',
          type: 'boolean',
          required: false,
          section: 'features',
        },
        {
          key: 'parking_spaces',
          label: 'Places de parking',
          type: 'number',
          required: false,
          section: 'features',
        },
      ],
      sections: [
        {
          id: 'office',
          title: 'Bureaux',
          order: 1,
          fieldDefinitions: ['office_area', 'meeting_rooms', 'reception'],
        },
        {
          id: 'features',
          title: 'Caractéristiques',
          order: 2,
          fieldDefinitions: ['fiber_ready', 'parking_spaces'],
        },
      ],
      validationRules: {
        office_area: { min: 0 },
        meeting_rooms: { min: 0 },
        parking_spaces: { min: 0 },
      },
    },

    // ========== BOUTIQUE / COMMERCIAL ==========
    {
      propertyType: PropertyType.BOUTIQUE_COMMERCIAL,
      name: 'Boutique / Commercial',
      description: 'Template for shop/commercial properties',
      fieldDefinitions: [
        {
          key: 'shop_area',
          label: 'Surface',
          type: 'number',
          required: false,
          section: 'shop',
          unit: 'm²',
        },
        {
          key: 'showcase',
          label: 'Vitrine',
          type: 'boolean',
          required: false,
          section: 'shop',
        },
        {
          key: 'ceiling_height',
          label: 'Hauteur sous plafond',
          type: 'number',
          required: false,
          section: 'shop',
          unit: 'm',
        },
        {
          key: 'storage_area',
          label: 'Réserve / stock',
          type: 'number',
          required: false,
          section: 'shop',
          unit: 'm²',
        },
        {
          key: 'lease_rights',
          label: 'Droit au bail / pas de porte',
          type: 'boolean',
          required: false,
          section: 'legal',
        },
      ],
      sections: [
        {
          id: 'shop',
          title: 'Caractéristiques du local',
          order: 1,
          fieldDefinitions: ['shop_area', 'showcase', 'ceiling_height', 'storage_area'],
        },
        {
          id: 'legal',
          title: 'Aspects juridiques',
          order: 2,
          fieldDefinitions: ['lease_rights'],
        },
      ],
      validationRules: {
        shop_area: { min: 0 },
        ceiling_height: { min: 0 },
        storage_area: { min: 0 },
      },
    },

    // ========== ENTREPÔT / INDUSTRIEL ==========
    {
      propertyType: PropertyType.ENTREPOT_INDUSTRIEL,
      name: 'Entrepôt / Industriel',
      description: 'Template for warehouse/industrial properties',
      fieldDefinitions: [
        {
          key: 'warehouse_area',
          label: 'Surface entrepôt',
          type: 'number',
          required: false,
          section: 'warehouse',
          unit: 'm²',
        },
        {
          key: 'office_area',
          label: 'Surface bureaux',
          type: 'number',
          required: false,
          section: 'warehouse',
          unit: 'm²',
        },
        {
          key: 'ceiling_height',
          label: 'Hauteur sous plafond',
          type: 'number',
          required: false,
          section: 'warehouse',
          unit: 'm',
        },
        {
          key: 'loading_dock',
          label: 'Quai de chargement',
          type: 'boolean',
          required: false,
          section: 'warehouse',
        },
        {
          key: 'heavy_truck_access',
          label: 'Accès poids lourds',
          type: 'boolean',
          required: false,
          section: 'warehouse',
        },
      ],
      sections: [
        {
          id: 'warehouse',
          title: 'Caractéristiques de l\'entrepôt',
          order: 1,
          fieldDefinitions: ['warehouse_area', 'office_area', 'ceiling_height', 'loading_dock', 'heavy_truck_access'],
        },
      ],
      validationRules: {
        warehouse_area: { min: 0 },
        office_area: { min: 0 },
        ceiling_height: { min: 0 },
      },
    },

    // ========== TERRAIN ==========
    {
      propertyType: PropertyType.TERRAIN,
      name: 'Terrain',
      description: 'Template for land properties',
      fieldDefinitions: [
        {
          key: 'land_area',
          label: 'Surface terrain',
          type: 'number',
          required: true,
          section: 'land',
          unit: 'm²',
        },
        {
          key: 'land_title',
          label: 'Type de titre',
          type: 'select',
          required: false,
          validation: {
            options: ['ACD', 'CPF', 'TF', 'ATTESTATION'],
          },
          section: 'legal',
        },
        {
          key: 'serviced_water',
          label: 'Eau disponible',
          type: 'boolean',
          required: false,
          section: 'utilities',
        },
        {
          key: 'serviced_power',
          label: 'Électricité disponible',
          type: 'boolean',
          required: false,
          section: 'utilities',
        },
        {
          key: 'zoning',
          label: 'Zonage',
          type: 'select',
          required: false,
          validation: {
            options: ['RESIDENTIAL', 'COMMERCIAL', 'MIXED', 'AGRICULTURAL'],
          },
          section: 'legal',
        },
      ],
      sections: [
        {
          id: 'land',
          title: 'Caractéristiques du terrain',
          order: 1,
          fieldDefinitions: ['land_area'],
        },
        {
          id: 'utilities',
          title: 'Viabilisation',
          order: 2,
          fieldDefinitions: ['serviced_water', 'serviced_power'],
        },
        {
          id: 'legal',
          title: 'Aspects juridiques',
          order: 3,
          fieldDefinitions: ['land_title', 'zoning'],
        },
      ],
      validationRules: {
        land_area: { min: 1, max: 1000000 },
      },
    },

    // ========== IMMEUBLE ==========
    {
      propertyType: PropertyType.IMMEUBLE,
      name: 'Immeuble',
      description: 'Template for building properties',
      fieldDefinitions: [
        {
          key: 'floors_count',
          label: 'Nombre d\'étages',
          type: 'number',
          required: false,
          section: 'building',
        },
        {
          key: 'units_count',
          label: 'Nombre total de lots',
          type: 'number',
          required: false,
          section: 'building',
        },
        {
          key: 'elevator',
          label: 'Ascenseur',
          type: 'boolean',
          required: false,
          section: 'building',
        },
        {
          key: 'parking_spaces',
          label: 'Places de parking',
          type: 'number',
          required: false,
          section: 'building',
        },
        {
          key: 'occupancy_rate',
          label: 'Taux d\'occupation',
          type: 'number',
          required: false,
          section: 'building',
          unit: '%',
        },
      ],
      sections: [
        {
          id: 'building',
          title: 'Caractéristiques de l\'immeuble',
          order: 1,
          fieldDefinitions: ['floors_count', 'units_count', 'elevator', 'parking_spaces', 'occupancy_rate'],
        },
      ],
      validationRules: {
        floors_count: { min: 1, max: 100 },
        units_count: { min: 1 },
        parking_spaces: { min: 0 },
        occupancy_rate: { min: 0, max: 100 },
      },
    },

    // ========== PARKING / BOX ==========
    {
      propertyType: PropertyType.PARKING_BOX,
      name: 'Parking / Box',
      description: 'Template for parking/box properties',
      fieldDefinitions: [
        {
          key: 'covered',
          label: 'Couvert',
          type: 'boolean',
          required: false,
          section: 'parking',
        },
        {
          key: 'secure_access',
          label: 'Accès sécurisé',
          type: 'boolean',
          required: false,
          section: 'parking',
        },
        {
          key: 'vehicle_height_limit',
          label: 'Hauteur max véhicule',
          type: 'number',
          required: false,
          section: 'parking',
          unit: 'm',
        },
      ],
      sections: [
        {
          id: 'parking',
          title: 'Caractéristiques du parking',
          order: 1,
          fieldDefinitions: ['covered', 'secure_access', 'vehicle_height_limit'],
        },
      ],
      validationRules: {
        vehicle_height_limit: { min: 0 },
      },
    },

    // ========== LOT (PROGRAMME NEUF) ==========
    {
      propertyType: PropertyType.LOT_PROGRAMME_NEUF,
      name: 'Lot (Programme neuf)',
      description: 'Template for new program lot properties',
      fieldDefinitions: [
        {
          key: 'program_name',
          label: 'Programme',
          type: 'text',
          required: false,
          section: 'program',
        },
        {
          key: 'lot_number',
          label: 'Numéro de lot',
          type: 'text',
          required: false,
          section: 'program',
        },
        {
          key: 'delivery_date',
          label: 'Date de livraison',
          type: 'date',
          required: false,
          section: 'program',
        },
        {
          key: 'payment_schedule',
          label: 'Échéancier',
          type: 'text',
          required: false,
          section: 'program',
        },
      ],
      sections: [
        {
          id: 'program',
          title: 'Programme',
          order: 1,
          fieldDefinitions: ['program_name', 'lot_number', 'delivery_date', 'payment_schedule'],
        },
      ],
      validationRules: {},
    },
  ];

  console.log('  Creating property templates...');
  for (const template of templates) {
    // Transform sections to match the expected format
    const sections = template.sections.map((section) => ({
      id: section.id,
      title: section.title,
      order: section.order,
      fieldDefinitions: section.fieldDefinitions.map((fieldKey) => {
        const fieldDef = template.fieldDefinitions.find((f) => f.key === fieldKey) as any;
        if (!fieldDef) {
          throw new Error(`Field ${fieldKey} not found in fieldDefinitions for ${template.propertyType}`);
        }
        return {
          key: fieldDef.key,
          label: fieldDef.label,
          type: fieldDef.type,
          required: fieldDef.required || false,
          ...(fieldDef.unit && { unit: fieldDef.unit }),
          ...(fieldDef.validation && { validation: fieldDef.validation }),
        };
      }),
    }));

    await prisma.propertyTypeTemplate.upsert({
      where: { propertyType: template.propertyType },
      update: {
        name: template.name,
        description: template.description,
        fieldDefinitions: template.fieldDefinitions as any,
        sections: sections as any,
        validationRules: template.validationRules as any,
        version: { increment: 1 },
      },
      create: {
        propertyType: template.propertyType,
        name: template.name,
        description: template.description,
        fieldDefinitions: template.fieldDefinitions as any,
        sections: sections as any,
        validationRules: template.validationRules as any,
        isActive: true,
      },
    });
  }
  console.log(`  ✓ Created/updated ${templates.length} property templates`);

  console.log('✅ Property templates seeding completed');
}

// Execute if run directly
if (require.main === module) {
  seedPropertyTemplates()
    .catch((e) => {
      console.error('❌ Error seeding property templates:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedPropertyTemplates };
