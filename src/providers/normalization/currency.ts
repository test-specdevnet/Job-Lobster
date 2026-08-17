interface FrankfurterResponse {
  date: string;
  rates: Record<string, number>;
}

const FALLBACK_CAD_PER_UNIT: Record<string, number> = {
  CAD: 1,
  USD: 1.38,
  EUR: 1.61,
  GBP: 1.86,
  AUD: 0.90,
};

export interface CurrencyRates {
  cadPerUnit: Record<string, number>;
  effectiveAt: string;
  provider: string;
}

export async function getCurrencyRates(db: D1Database, now = new Date()): Promise<CurrencyRates> {
  const cached = await db.prepare(
    "SELECT currency, cad_per_unit, provider, effective_at FROM currency_rates WHERE datetime(expires_at) > datetime(?)",
  ).bind(now.toISOString()).all<{ currency: string; cad_per_unit: number; provider: string; effective_at: string }>();

  if (cached.results.length >= 4) {
    return {
      cadPerUnit: Object.fromEntries(cached.results.map((row) => [row.currency, row.cad_per_unit])),
      effectiveAt: cached.results[0].effective_at,
      provider: cached.results[0].provider,
    };
  }

  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=CAD", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Currency service returned ${response.status}`);
    const payload = (await response.json()) as FrankfurterResponse;
    const cadPerUnit: Record<string, number> = { CAD: 1 };
    for (const currency of Object.keys(FALLBACK_CAD_PER_UNIT)) {
      if (currency === "CAD") continue;
      const unitsPerCad = payload.rates[currency];
      if (unitsPerCad) cadPerUnit[currency] = 1 / unitsPerCad;
    }

    const expiresAt = new Date(now.getTime() + 12 * 3_600_000).toISOString();
    const statements = Object.entries(cadPerUnit).map(([currency, rate]) =>
      db.prepare(`
        INSERT INTO currency_rates (currency, cad_per_unit, provider, effective_at, fetched_at, expires_at)
        VALUES (?, ?, 'Frankfurter/ECB', ?, ?, ?)
        ON CONFLICT(currency) DO UPDATE SET
          cad_per_unit = excluded.cad_per_unit,
          provider = excluded.provider,
          effective_at = excluded.effective_at,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at
      `).bind(currency, rate, payload.date, now.toISOString(), expiresAt),
    );
    await db.batch(statements);
    return { cadPerUnit, effectiveAt: payload.date, provider: "Frankfurter/ECB" };
  } catch (error) {
    console.warn("currency_rate_fallback", error);
    return { cadPerUnit: FALLBACK_CAD_PER_UNIT, effectiveAt: now.toISOString(), provider: "fallback" };
  }
}
