export function toSatang(value: string): number | null {
  const match = /^(-?)(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[2].replaceAll(',', '')) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount <= 2147483647 ? (match[1] ? -amount : amount) : null;
}
export const toBaht = (value: number | null | undefined) => value == null ? '' : (value / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Format after leaving a field, so inserting commas does not move the typing cursor.
export function formatMoneyInput(value: string): string {
  const satang = toSatang(value);
  return satang === null ? value : toBaht(satang);
}
