/**
 * Checks that loaded data has the shape you expect, instead of trusting it.
 * Ported unchanged from Island RPG (RDBagwell/rpg).
 * Returns a list of problems (empty = valid).
 *
 *   validateShape(save, {
 *     map: 'string',
 *     x: 'number', y: 'number',
 *     facing: 'string?',          // '?' = optional
 *     party: [{ name: 'string', level: 'integer' }],   // array of objects
 *     flags: 'object',
 *   });
 *
 * Types: 'number' (finite), 'integer', 'string', 'boolean', 'object',
 * 'array', 'any'. Nested objects are written as object literals; arrays of
 * something as a one-element array.
 */

/**
 * A type name, an object of field schemas, or a one-element array of a schema.
 * @typedef {string | Record<string, any> | any[]} Schema
 */

/**
 * @param {any} value
 * @param {Schema} schema
 * @param {string} [path='data']  used in messages
 * @returns {string[]}
 */
export function validateShape(value, schema, path = 'data') {
  /** @type {string[]} */
  const problems = [];

  if (typeof schema === 'string') {
    const optional = schema.endsWith('?');
    const type = optional ? schema.slice(0, -1) : schema;
    if (value === undefined || value === null) {
      if (!optional) problems.push(`${path} is missing`);
      return problems;
    }
    if (!matchesType(value, type)) problems.push(`${path} should be ${type}, got ${describe(value)}`);
    return problems;
  }

  if (Array.isArray(schema)) {
    if (!Array.isArray(value)) return [`${path} should be an array, got ${describe(value)}`];
    value.forEach((item, i) => problems.push(...validateShape(item, schema[0], `${path}[${i}]`)));
    return problems;
  }

  if (!isPlainObject(value)) return [`${path} should be an object, got ${describe(value)}`];
  for (const [key, child] of Object.entries(schema)) {
    problems.push(...validateShape(value[key], child, `${path}.${key}`));
  }
  return problems;
}

/**
 * @param {any} value
 * @param {string} type
 */
function matchesType(value, type) {
  switch (type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'any':
      return true;
    default:
      throw new Error(`validateShape: unknown type "${type}"`);
  }
}

/** @param {any} value */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {any} value */
function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return typeof value === 'object' ? 'an object' : `${typeof value} ${JSON.stringify(value)}`;
}
