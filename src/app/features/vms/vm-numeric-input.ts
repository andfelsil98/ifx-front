// Parse only the visible decimal format; Number() alone also accepts e/hex/signs.
export function parseVmNumber(value: unknown, integer: boolean): number | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const format = integer ? /^\d{1,3}$/ : /^\d{1,3}(?:[.,]\d+)?$/;
  if (!format.test(text)) return null;
  const number = Number(text.replace(',', '.'));
  if (!Number.isFinite(number) || number <= 0 || number > 999 || (integer && !Number.isInteger(number))) return null;
  return number;
}

// Expand JS scientific notation when editing small persisted decimals, without rounding.
export function formatVmNumber(value: number): string {
  const text = String(value);
  const [coefficient, exponentText] = text.split('e');
  if (!coefficient || exponentText === undefined) return text;
  const digits = coefficient.replace('.', '');
  const point = (coefficient.indexOf('.') < 0 ? coefficient.length : coefficient.indexOf('.')) + Number(exponentText);
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${digits}${'0'.repeat(point - digits.length)}`;
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}
