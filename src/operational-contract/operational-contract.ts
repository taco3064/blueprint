declare const operationalTextBrand: unique symbol;

export type OperationalText = string & { readonly [operationalTextBrand]: true };

export function operationalText(value: string | string[]): OperationalText {
  return (Array.isArray(value) ? value.join('\n') : value) as OperationalText;
}
