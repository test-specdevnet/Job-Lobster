import { annualizeHourlySalary } from "../../lib/salary";
import type { RawSalary } from "../types";

function parseAmount(raw: string) {
  const compact = raw.replace(/,/g, "").trim().toLowerCase();
  const amount = Number.parseFloat(compact.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount)) return null;
  return /k\b/.test(compact) ? amount * 1_000 : amount;
}

function inferCurrency(text: string, country: string | null) {
  if (/ca\$|\bcad\b/i.test(text)) return "CAD";
  if (/us\$|\busd\b/i.test(text)) return "USD";
  if (/\bgbp\b|£/.test(text)) return "GBP";
  if (/\beur\b|€/.test(text)) return "EUR";
  if (/\baud\b|a\$/i.test(text)) return "AUD";
  if (/\$/.test(text)) return /canada/i.test(country ?? "") ? "CAD" : "USD";
  return null;
}

function annualize(amount: number, interval: RawSalary["interval"]) {
  if (interval === "hour") return annualizeHourlySalary(amount);
  if (interval === "month") return Math.round(amount * 12);
  return Math.round(amount);
}

export function normalizeRawSalary(salary: RawSalary) {
  return {
    minimum: annualize(salary.minimum, salary.interval),
    maximum: salary.maximum === null ? null : annualize(salary.maximum, salary.interval),
    currency: salary.currency?.toUpperCase() ?? null,
    evidence: salary.evidence,
  };
}

export function parseEmployerSalary(description: string, country: string | null): RawSalary | null {
  const compensationStarts = [...description.matchAll(/base salary|salary range|compensation|base pay|pay range/gi)]
    .map((match) => match.index ?? 0);
  const windows = compensationStarts.map((start) => description.slice(start, start + 700));
  windows.push(description);

  const rangePattern = /((?:CA|US|A)?\$|£|€|\b(?:CAD|USD|GBP|EUR|AUD)\b)?\s*(\d{2,3}(?:[,.]\d{3})*(?:\.\d+)?\s*[kK]?)\s*(?:-|–|—|to)\s*((?:CA|US|A)?\$|£|€|\b(?:CAD|USD|GBP|EUR|AUD)\b)?\s*(\d{2,3}(?:[,.]\d{3})*(?:\.\d+)?\s*[kK]?)/i;
  const singlePattern = /((?:CA|US|A)?\$|£|€|\b(?:CAD|USD|GBP|EUR|AUD)\b)\s*(\d{2,3}(?:[,.]\d{3})*(?:\.\d+)?\s*[kK]?)/i;

  for (const window of windows) {
    const range = window.match(rangePattern);
    const single = range ? null : window.match(singlePattern);
    const minimum = parseAmount(range?.[2] ?? single?.[2] ?? "");
    const maximum = range ? parseAmount(range[4]) : minimum;
    if (minimum === null) continue;

    const interval: RawSalary["interval"] = /(?:per\s+hour|hourly|\/\s*hr|an hour)/i.test(window.slice(0, 400))
      ? "hour"
      : /(?:per\s+month|monthly|\/\s*month)/i.test(window.slice(0, 400))
        ? "month"
        : "year";
    const annualMinimum = annualize(minimum, interval);
    if (annualMinimum < 20_000 || annualMinimum > 1_000_000) continue;

    const evidence = (range?.[0] ?? single?.[0] ?? "").trim();
    return {
      minimum,
      maximum,
      currency: inferCurrency(`${range?.[1] ?? single?.[1] ?? ""} ${range?.[3] ?? ""} ${window.slice(0, 180)}`, country),
      interval,
      evidence,
    };
  }
  return null;
}
