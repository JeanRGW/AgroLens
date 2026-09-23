import { z } from "zod";

export const createPropertySchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  owner: z.string().min(1, "Owner is required").max(200),
  address: z.string().min(1, "Address is required").max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type CreatePropertyDto = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = z.object({
  userId: z.string().uuid().optional(),
  name: z.string().min(1, "Name cannot be empty").max(200).optional(),
  owner: z.string().min(1, "Owner cannot be empty").max(200).optional(),
  address: z.string().min(1, "Address cannot be empty").max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export type UpdatePropertyDto = z.infer<typeof updatePropertySchema>;

export const propertyRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  owner: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  deletedAt: z.union([z.string(), z.date()]).nullable().optional(),
});

export type PropertyRecord = z.infer<typeof propertyRecordSchema>;

export const createTalhaoSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  propertyId: z.string().uuid("Invalid property ID"),
});

export type CreateTalhaoDto = z.infer<typeof createTalhaoSchema>;

export const updateNamedEntitySchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(200).optional(),
  userId: z.string().uuid().optional(),
});

export const updateTalhaoSchema = updateNamedEntitySchema.extend({
  propertyId: z.string().uuid().optional(),
});

export type UpdateTalhaoDto = z.infer<typeof updateTalhaoSchema>;

export const talhaoRecordSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  deletedAt: z.union([z.string(), z.date()]).nullable().optional(),
});

export type TalhaoRecord = z.infer<typeof talhaoRecordSchema>;

export const listTalhoesQuerySchema = z.object({
  propertyId: z.string().uuid().optional(),
});

export type ListTalhoesQueryDto = z.infer<typeof listTalhoesQuerySchema>;

export const createCropTypeSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
});

export type CreateCropTypeDto = z.infer<typeof createCropTypeSchema>;

export const updateCropTypeSchema = updateNamedEntitySchema;

export type UpdateCropTypeDto = z.infer<typeof updateCropTypeSchema>;

export const cropTypeRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  deletedAt: z.union([z.string(), z.date()]).nullable().optional(),
});

export type CropTypeRecord = z.infer<typeof cropTypeRecordSchema>;

export const createEstadioSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  cropTypeId: z.string().uuid("Invalid crop type ID"),
});

export type CreateEstadioDto = z.infer<typeof createEstadioSchema>;

export const updateEstadioSchema = updateNamedEntitySchema.extend({
  cropTypeId: z.string().uuid().optional(),
});

export type UpdateEstadioDto = z.infer<typeof updateEstadioSchema>;

export const estadioRecordSchema = z.object({
  id: z.string().uuid(),
  cropTypeId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  deletedAt: z.union([z.string(), z.date()]).nullable().optional(),
});

export type EstadioRecord = z.infer<typeof estadioRecordSchema>;

export const listEstadiosQuerySchema = z.object({
  cropTypeId: z.string().uuid().optional(),
});

export type ListEstadiosQueryDto = z.infer<typeof listEstadiosQuerySchema>;
