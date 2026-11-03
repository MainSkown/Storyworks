/** A copy of `o` without `key` (an optional field is dropped, not set to undefined). */
export function omitKey<T extends object, K extends PropertyKey>(o: T, key: K): Omit<T, K> {
  const copy = { ...o } as Record<PropertyKey, unknown>
  delete copy[key]
  return copy as Omit<T, K>
}
