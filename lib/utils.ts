import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

export function formatDate(d: Date | string | number | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(d: Date | string | number | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function daysAgo(d: Date | string | number | null | undefined): number | null {
  if (!d) return null;
  const ms = Date.now() - new Date(d).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function initials(first: string, last?: string | null): string {
  const f = (first || "").trim()[0] || "";
  const l = (last || "").trim()[0] || "";
  return (f + l).toUpperCase() || "?";
}

export function applyClientFilter<T extends { heatLevel: string; status: string; lastOutreachAt: Date | string | number | null; lastPurchaseAt: Date | string | number | null; birthday: string | null; onEmailList: boolean }>(all: T[], filter: string | null): T[] {
  if (!filter) return all;
  const now = Date.now();
  switch (filter) {
    case "hot":
      return all.filter((c) => c.heatLevel === "hot" && c.status === "active");
    case "stale":
      return all.filter((c) => {
        if (!c.lastOutreachAt && !c.lastPurchaseAt) return c.status === "active";
        const last = Math.max(
          c.lastOutreachAt ? new Date(c.lastOutreachAt).getTime() : 0,
          c.lastPurchaseAt ? new Date(c.lastPurchaseAt).getTime() : 0,
        );
        return c.status === "active" && (now - last) > 90 * 86400000;
      });
    case "recent_purchases":
      return all.filter((c) => c.lastPurchaseAt && (now - new Date(c.lastPurchaseAt).getTime()) < 30 * 86400000);
    case "no_outreach_60":
      return all.filter((c) => c.status === "active" && (!c.lastOutreachAt || (now - new Date(c.lastOutreachAt).getTime()) > 60 * 86400000));
    case "birthdays_month": {
      const month = new Date().getMonth() + 1;
      return all.filter((c) => {
        if (!c.birthday) return false;
        const m = parseInt(c.birthday.split("-")[1] || "0", 10);
        return m === month;
      });
    }
    case "email_subscribers":
      return all.filter((c) => c.onEmailList && c.status !== "unsubscribed");
    default:
      return all;
  }
}
