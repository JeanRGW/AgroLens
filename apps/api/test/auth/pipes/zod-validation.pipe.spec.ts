import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../src/auth/pipes/zod-validation.pipe';

describe('ZodValidationPipe', () => {
  describe('simple object schema', () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().int().min(0).max(150),
      name: z.string().min(1).max(100),
    });

    const pipe = new ZodValidationPipe(schema);

    it('should pass valid input through', () => {
      const input = { email: 'user@example.com', age: 30, name: 'João' };
      const result = pipe.transform(input);
      expect(result).toEqual(input);
    });

    it('should apply default values from schema', () => {
      const schemaWithDefaults = z.object({
        limit: z.coerce.number().int().default(20),
        offset: z.coerce.number().int().default(0),
        name: z.string(),
      });
      const pipeWithDefaults = new ZodValidationPipe(schemaWithDefaults);

      const result = pipeWithDefaults.transform({ name: 'test' });
      expect(result).toEqual({ limit: 20, offset: 0, name: 'test' });
    });

    it('should coerce types when schema uses coerce', () => {
      const coerceSchema = z.object({
        limit: z.coerce.number().int(),
        active: z.coerce.boolean(),
      });
      const coercePipe = new ZodValidationPipe(coerceSchema);

      const result = coercePipe.transform({ limit: '50', active: 'true' });
      expect(result.limit).toBe(50);
      expect(result.active).toBe(true);
    });

    it('should throw BadRequestException for invalid input', () => {
      const input = { email: 'not-an-email', age: -1, name: '' };
      expect(() => pipe.transform(input)).toThrow(BadRequestException);
    });

    it('should include field-level error messages in the exception', () => {
      const input = { email: 'invalid', age: 200, name: '' };
      try {
        pipe.transform(input);
        fail('Expected BadRequestException');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse() as any;
        expect(response.message).toBe('Validation failed');
        expect(response.errors).toBeDefined();
        expect(Array.isArray(response.errors)).toBe(true);
        expect(response.errors.length).toBeGreaterThan(0);
        // Each error should reference the failing field
        const allMessages = response.errors.join(' ');
        expect(allMessages).toContain('email');
      }
    });

    it('should throw BadRequestException for undefined input', () => {
      expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for null input', () => {
      expect(() => pipe.transform(null)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for completely wrong type', () => {
      expect(() => pipe.transform('just a string')).toThrow(BadRequestException);
    });
  });

  describe('enum schema validation', () => {
    const enumSchema = z.object({
      source: z.enum(['drone', 'phone', 'mixed']),
    });
    const pipe = new ZodValidationPipe(enumSchema);

    it('should accept valid enum values', () => {
      expect(pipe.transform({ source: 'drone' })).toEqual({ source: 'drone' });
      expect(pipe.transform({ source: 'phone' })).toEqual({ source: 'phone' });
      expect(pipe.transform({ source: 'mixed' })).toEqual({ source: 'mixed' });
    });

    it('should reject invalid enum values', () => {
      expect(() => pipe.transform({ source: 'helicopter' })).toThrow(BadRequestException);
    });
  });

  describe('upload init schema (real-world scenario)', () => {
    const fileSchema = z.object({
      imageIndex: z.coerce.number().int().min(0).optional(),
      contentType: z.string().min(1),
      sizeBytes: z.coerce.number().int().positive().optional(),
    });

    const schema = z.object({
      clientUploadId: z.string().min(1).max(255),
      propertyId: z.string().uuid(),
      talhaoId: z.string().uuid(),
      cropTypeId: z.string().uuid(),
      source: z.enum(['drone', 'phone', 'mixed']),
      activityDate: z.coerce.date(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      files: z.array(fileSchema).min(1),
    });

    const pipe = new ZodValidationPipe(schema);

    it('should accept valid upload init payload', () => {
      const input = {
        clientUploadId: 'client-123',
        propertyId: '00000000-0000-0000-0000-000000000001',
        talhaoId: '00000000-0000-0000-0000-000000000002',
        cropTypeId: '00000000-0000-0000-0000-000000000003',
        source: 'phone',
        activityDate: '2025-06-15T10:00:00Z',
        latitude: -22.9,
        longitude: -43.1,
        files: [{ contentType: 'image/jpeg', sizeBytes: 1024 }],
      };
      const result = pipe.transform(input);
      expect(result.clientUploadId).toBe('client-123');
      expect(result.activityDate).toBeInstanceOf(Date);
    });

    it('should reject missing required fields', () => {
      const input = { clientUploadId: 'abc' };
      expect(() => pipe.transform(input)).toThrow(BadRequestException);
    });

    it('should reject empty files array', () => {
      const input = {
        clientUploadId: 'client-123',
        propertyId: '00000000-0000-0000-0000-000000000001',
        talhaoId: '00000000-0000-0000-0000-000000000002',
        cropTypeId: '00000000-0000-0000-0000-000000000003',
        source: 'phone',
        activityDate: '2025-06-15T10:00:00Z',
        latitude: -22.9,
        longitude: -43.1,
        files: [],
      };
      expect(() => pipe.transform(input)).toThrow(BadRequestException);
    });

    it('should reject non-UUID propertyId', () => {
      const input = {
        clientUploadId: 'client-123',
        propertyId: 'not-a-uuid',
        talhaoId: '00000000-0000-0000-0000-000000000002',
        cropTypeId: '00000000-0000-0000-0000-000000000003',
        source: 'phone',
        activityDate: '2025-06-15T10:00:00Z',
        latitude: -22.9,
        longitude: -43.1,
        files: [{ contentType: 'image/jpeg' }],
      };
      expect(() => pipe.transform(input)).toThrow(BadRequestException);
    });
  });

  describe('Zod.isZodError-like handling for non-Zod errors', () => {
    it('should throw generic BadRequestException for non-Zod errors', () => {
      // A schema that throws during parsing
      const throwingSchema = {
        parse: () => {
          throw new Error('Some unexpected error');
        },
      } as unknown as z.ZodSchema;
      const pipe = new ZodValidationPipe(throwingSchema);
      expect(() => pipe.transform({})).toThrow(BadRequestException);
    });
  });
});
