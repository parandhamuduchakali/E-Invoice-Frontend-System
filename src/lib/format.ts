/** Display formatting helpers. */

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

export function money(value: number | null | undefined): string {
  return inr.format(Number(value) || 0);
}

export function percent(value: number | null | undefined): string {
  return `${Number(value) || 0}%`;
}

/** ISO `YYYY-MM-DD` → `DD/MM/YYYY` (the format printed on Indian invoices and used by the IRP). */
export function displayDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function displayDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("en-IN");
}

/** Formats a Date as local-time `YYYY-MM-DD` (toISOString would shift the day in non-UTC zones). */
function localIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return localIso(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return localIso(date);
}

/** Shortens a 64-character IRN for tables: first 8 … last 6. */
export function shortIrn(irn: string | null | undefined): string {
  if (!irn) return "—";
  return irn.length > 20 ? `${irn.slice(0, 8)}…${irn.slice(-6)}` : irn;
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
