const NY = "America/New_York";

function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(new Date(utcMs)).map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return (Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!) - utcMs) / 60000;
}

// Next instant (>= from) at which the wall clock in America/New_York reads `hour`:00.
export function nextNewYorkHour(hour: number, from: Date = new Date()): Date {
  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    const probe = from.getTime() + dayOffset * 86_400_000;
    const nyDate = new Intl.DateTimeFormat("en-CA", { timeZone: NY }).format(new Date(probe));
    const [y, m, d] = nyDate.split("-").map(Number) as [number, number, number];
    const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
    const candidate = guess - offsetMinutes(guess - offsetMinutes(guess, NY) * 60000, NY) * 60000;
    if (candidate >= from.getTime()) return new Date(candidate);
  }
  throw new Error("could not compute next New York publish time");
}

export const istDateKey = (date: Date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
