import { z } from 'zod';

// Single source of truth lives in @agrolens/contracts; re-exported here so
// API code keeps a stable local import path.
export {
  resolveLimitOffset,
  type LimitOffsetInput,
  type PageParams,
  type Paginated,
} from '@agrolens/contracts';

export const limitOffsetQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type LimitOffsetQueryDto = z.infer<typeof limitOffsetQuerySchema>;

export interface PageResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function toPageResult<T>(
  items: T[],
  total: number,
  limit: number = items.length,
  offset: number = 0,
): PageResult<T> {
  return {
    items,
    total,
    limit,
    offset,
  };
}
