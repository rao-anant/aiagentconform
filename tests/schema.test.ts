import { describe, expect, it } from 'vitest';
import { compileSchema } from '../src/core/schema.js';

describe('generic JSON Schema infrastructure', () => {
  it('validates input and collects errors without modifying input', () => {
    const validate = compileSchema({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    });
    expect(validate({ name: 'example' })).toBe(true);
    const input = { extra: true };
    expect(validate(input)).toBe(false);
    expect(validate.errors?.map((error) => error.keyword)).toEqual(expect.arrayContaining(['required', 'additionalProperties']));
    expect(input).toEqual({ extra: true });
  });
});
