declare const phantom: unique symbol

export type Brand<T, Tag extends string> = T & { readonly [phantom]: Tag }

export type Unbrand<T> = T extends Brand<infer U, string> ? U : T

export type Sealed<Tag extends string> = { readonly [phantom]: Tag }

const cast =
  <T>() =>
  (value: number): T =>
    value as T

export const brandNumber = cast

export const unbrand = (value: Brand<number, string>): number => value as unknown as number
