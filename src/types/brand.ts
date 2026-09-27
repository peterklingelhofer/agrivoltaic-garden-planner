declare const phantom: unique symbol

export type Brand<T, Tag extends string> = T & { readonly [phantom]: Tag }

export type Sealed<Tag extends string> = { readonly [phantom]: Tag }

const cast =
  <T>() =>
  (value: number): T =>
    value as T

export const brandNumber = cast
