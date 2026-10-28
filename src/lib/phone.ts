/**
 * Turns what a person typed into E.164 ("+14045550123"), or null if it can't be a real number.
 * US numbers can be typed any usual way: "404-555-0123", "(404) 555 0123", "1 404 555 0123".
 * Other countries need the leading "+".
 */
export function normalizePhone(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\+?[\d\s().-]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, "");

  if (s.startsWith("+")) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  if (digits.length === 10) return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+1${digits}` : null; // area code and exchange never start with 0 or 1
  if (digits.length === 11 && digits.startsWith("1")) return /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+${digits}` : null;
  return null;
}
