/**
 * Utility to sanitize data before writing to Cloud Firestore.
 * Firestore strictly disallows `undefined` values in documents and nested maps.
 *
 * Rules:
 * - Omits keys whose values are `undefined`
 * - Retains `null` values as valid Firestore null literals
 * - Recursively cleans nested objects and arrays
 * - Preserves Date objects, primitives, and valid array elements
 */
export function sanitizeFirestoreData<T>(data: T): T {
  if (data === undefined) {
    return undefined as unknown as T;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (data instanceof Date) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestoreData(item)) as unknown as T;
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      sanitized[key] = sanitizeFirestoreData(value);
    }
  }
  return sanitized as T;
}
