import { Ajv, type AnySchema, type ValidateFunction } from 'ajv';

// Generic schema infrastructure only; protocol schemas are intentionally absent.
export function compileSchema<T = unknown>(schema: AnySchema): ValidateFunction<T> {
  const ajv = new Ajv({ allErrors: true, strict: true });
  return ajv.compile<T>(schema);
}
