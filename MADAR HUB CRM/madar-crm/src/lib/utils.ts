import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { BASE_PATH } from "./constants";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export function formatRwf(value: number | bigint) {
  return `${new Intl.NumberFormat("en-RW").format(Number(value))} RWF`;
}

export function formatDate(value: Date | string | null | undefined, includeTime = false) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-RW", includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(new Date(value));
}

export function toDateTimeLocal(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `250${digits.slice(1)}`;
  if (!digits.startsWith("250") && digits.length === 9) digits = `250${digits}`;
  return digits;
}

export function whatsappUrl(phone: string, message?: string) {
  const base = `https://wa.me/${normalizePhone(phone)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function leadDisplayName(name: string | null, phone: string) {
  return name?.trim() || phone;
}

export function basePathUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}
