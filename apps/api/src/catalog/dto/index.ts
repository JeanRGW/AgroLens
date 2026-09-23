// Re-exported from @agrolens/contracts — the single source of truth
// for API shapes. Import application code from this module path
// (stable NestJS DTO location); do not redefine schemas here.
export {
  createPropertySchema,
  type CreatePropertyDto,
  updatePropertySchema,
  type UpdatePropertyDto,
  createTalhaoSchema,
  type CreateTalhaoDto,
  updateTalhaoSchema,
  type UpdateTalhaoDto,
  createCropTypeSchema,
  type CreateCropTypeDto,
  updateCropTypeSchema,
  type UpdateCropTypeDto,
  createEstadioSchema,
  type CreateEstadioDto,
  updateEstadioSchema,
  type UpdateEstadioDto,
  updateNamedEntitySchema,
} from '@agrolens/contracts';
