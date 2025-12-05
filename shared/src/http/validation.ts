import { AnyZodObject, ZodSchema } from 'zod';
import { AppError } from './errors';

export function validateBody<T extends AnyZodObject>(schema: T, data: unknown) {
  try {
    return schema.parse(data);
  } catch (e: any) {
    throw new AppError(400, 'INVALID_PARAMETER', 'INVALID_PARAMETER', e.errors);
  }
}
