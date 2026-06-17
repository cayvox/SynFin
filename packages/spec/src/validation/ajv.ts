import * as ajv2020 from 'ajv/dist/2020.js';
import type { AnySchema, ValidateFunction } from 'ajv/dist/2020.js';
import * as ajvFormats from 'ajv-formats';
import { allSchemas } from '../generated/schemas.js';
import type { ValidationError } from '../result.js';

const Ajv2020 = ajv2020.Ajv2020;

// ajv-formats is a CommonJS module whose runtime value is the plugin function;
// the namespace/default typing under NodeNext does not surface a call
// signature, so narrow it to the plugin shape we use.
type FormatsPlugin = (ajv: InstanceType<typeof Ajv2020>) => unknown;
const addFormats = ajvFormats.default as unknown as FormatsPlugin;

/**
 * A single Ajv instance compiling the committed JSON Schemas (the source of
 * truth for the SQSS wire types, SPECIFICATION.md §4). `allErrors` is enabled
 * so callers get every schema violation, not just the first.
 *
 * `strict: false` because schema `$id`s are bare filenames (relative), which is
 * intentional for cross-file `$ref` resolution within this package.
 */
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(allSchemas as AnySchema[]);

/**
 * Resolve a compiled validator by schema `$id` (or `$id#/$defs/Name`). Throws
 * if no schema is registered under that id — a programmer error, never a
 * data-validation outcome.
 */
export function getValidator(id: string): ValidateFunction {
  const validate = ajv.getSchema(id);
  if (!validate) {
    throw new Error(`@synfin/spec: no schema registered for id "${id}"`);
  }
  return validate;
}

/** Map Ajv's raw errors into privacy-safe {@link ValidationError}s. */
export function toValidationErrors(
  errors: ValidateFunction['errors'],
): ValidationError[] {
  if (!errors || errors.length === 0) {
    return [{ code: 'schema', message: 'schema validation failed' }];
  }
  return errors.map((e) => {
    const where = e.instancePath === '' ? '/' : e.instancePath;
    return {
      code: 'schema',
      message: `${where} ${e.message}`.trim(),
      path: e.instancePath,
    };
  });
}
