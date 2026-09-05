/** Small runtime decoders validate known wire fields and project only handwritten SDK properties. */
export type Decoder<T> = (value: unknown, path: string) => T;

/** Reports the offending schema location without echoing untrusted response data. */
function invalid(path: string): never {
  throw new Error(`响应字段不符合合同：${path}`);
}

/** Requires a JSON object rather than an array or null. */
export function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return invalid(path);
  return value as Record<string, unknown>;
}

/** Retains strings as wire strings without coercion or date conversion. */
export const string: Decoder<string> = (value, path) =>
  typeof value === 'string' ? value : invalid(path);

/** Accepts only finite JSON numbers without coercion. */
export const number: Decoder<number> = (value, path) =>
  typeof value === 'number' && Number.isFinite(value) ? value : invalid(path);

/** Prevents truthy strings and integers from masquerading as JSON booleans. */
export const boolean: Decoder<boolean> = (value, path) =>
  typeof value === 'boolean' ? value : invalid(path);

/** Preserves closed v1 string enums until an explicit HTTP compatibility decision changes them. */
export function enumeration<const T extends string>(
  values: readonly T[],
): Decoder<T> {
  return (value, path) =>
    typeof value === 'string' && values.includes(value as T)
      ? (value as T)
      : invalid(path);
}

/** Decodes every array member in order, including malformed members after valid ones. */
export function array<T>(decode: Decoder<T>): Decoder<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) return invalid(path);
    return value.map((item: unknown, index) =>
      decode(item, `${path}[${index}]`),
    );
  };
}

/** Allows only explicitly nullable fields to carry null. */
export function nullable<T>(decode: Decoder<T>): Decoder<T | null> {
  return (value, path) => (value === null ? null : decode(value, path));
}

/** Distinguishes optional omission from null so public objects do not acquire undefined fields. */
export function optional<T>(decode: Decoder<T>): Decoder<T | undefined> {
  return (value, path) =>
    value === undefined ? undefined : decode(value, path);
}

/** Requires a decoder for every public property and discards additive remote properties. */
export function object<T extends object>(shape: {
  [K in keyof T]-?: Decoder<T[K]>;
}): Decoder<T> {
  return (value, path) => {
    const input = record(value, path);
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(shape) as Array<keyof T & string>) {
      const decoded = shape[key](
        Object.hasOwn(input, key) ? input[key] : undefined,
        `${path}.${key}`,
      );
      if (decoded !== undefined) output[key] = decoded;
    }
    return output as T;
  };
}
