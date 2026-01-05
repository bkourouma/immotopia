import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { PropertyType, PropertyTypeTemplate } from '@prisma/client';
import { PropertyTemplate, PropertyField } from '../types/property-types';

/**
 * Get template by property type
 * @param propertyType - Property type
 * @returns Template configuration
 */
export async function getTemplateByType(propertyType: PropertyType): Promise<PropertyTemplate | null> {
  const template = await prisma.propertyTypeTemplate.findUnique({
    where: { propertyType }
  });

  if (!template || !template.isActive) {
    logger.warn('Property template not found or inactive', { propertyType });
    return null;
  }

  return {
    propertyType: template.propertyType,
    name: template.name,
    description: template.description || undefined,
    fieldDefinitions: template.fieldDefinitions as PropertyField[],
    sections: template.sections as any,
    validationRules: template.validationRules as Record<string, any>
  };
}

/**
 * Validate property data against template
 * @param propertyType - Property type
 * @param data - Property data to validate
 * @returns Validation result with errors if any
 */
export async function validatePropertyData(
  propertyType: PropertyType,
  data: Record<string, any>
): Promise<{ valid: boolean; errors: string[] }> {
  const template = await getTemplateByType(propertyType);

  if (!template) {
    return {
      valid: false,
      errors: [`Template not found for property type: ${propertyType}`]
    };
  }

  const errors: string[] = [];

  // Validate required fields
  for (const field of template.fieldDefinitions) {
    if (field.required) {
      const value = data[field.key];
      if (value === undefined || value === null || value === '') {
        errors.push(`Required field missing: ${field.label} (${field.key})`);
        continue;
      }

      // Type validation
      if (field.type === 'number' && isNaN(Number(value))) {
        errors.push(`Field ${field.label} must be a number`);
        continue;
      }

      if (field.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`Field ${field.label} must be a boolean`);
        continue;
      }

      // Range validation
      if (field.type === 'number' && field.validation) {
        const numValue = Number(value);
        if (field.validation.min !== undefined && numValue < field.validation.min) {
          errors.push(`Field ${field.label} must be at least ${field.validation.min}`);
        }
        if (field.validation.max !== undefined && numValue > field.validation.max) {
          errors.push(`Field ${field.label} must be at most ${field.validation.max}`);
        }
      }

      // Pattern validation
      if (field.type === 'text' && field.validation?.pattern) {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(String(value))) {
          errors.push(`Field ${field.label} does not match required pattern`);
        }
      }

      // Options validation
      if (field.type === 'select' && field.validation?.options) {
        if (!field.validation.options.includes(String(value))) {
          errors.push(`Field ${field.label} must be one of: ${field.validation.options.join(', ')}`);
        }
      }
    }
  }

  // Apply custom validation rules from template
  if (template.validationRules) {
    // Custom validation logic can be added here
    // For now, we'll just check if validation rules exist
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get all active templates
 * @returns List of active templates
 */
export async function getAllTemplates(): Promise<PropertyTemplate[]> {
  const templates = await prisma.propertyTypeTemplate.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  });

  return templates.map(template => ({
    propertyType: template.propertyType,
    name: template.name,
    description: template.description || undefined,
    fieldDefinitions: template.fieldDefinitions as PropertyField[],
    sections: template.sections as any,
    validationRules: template.validationRules as Record<string, any>
  }));
}




