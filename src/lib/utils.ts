/** Matches the CRM's phone normalisation so accounts link to the right Lead. */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `250${digits.slice(1)}`;
  if (!digits.startsWith("250") && digits.length === 9) digits = `250${digits}`;
  return digits;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function formatRwf(amount: number): string {
  return `${amount.toLocaleString("en-RW")} RWF`;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Kigali",
  }).format(date);
}
