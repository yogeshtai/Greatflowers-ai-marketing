// US flower-gifting occasion calendar with lead times for campaign planning.
// Returns occasions relevant NOW (within their marketing window).

export interface OccasionWindow {
  name: string;
  date: string; // YYYY-MM-DD or description like "Second Sunday in May"
  marketingStart: number; // days before the occasion to start campaigns
  marketingEnd: number; // days after (usually 0, except evergreen)
  priority: "critical" | "high" | "medium";
  description: string;
}

const OCCASIONS: OccasionWindow[] = [
  {
    name: "Valentine's Day",
    date: "02-14",
    marketingStart: 21,
    marketingEnd: 0,
    priority: "critical",
    description: "Romantic flowers, red roses, couples",
  },
  {
    name: "Mother's Day",
    date: "second-sunday-may",
    marketingStart: 21,
    marketingEnd: 0,
    priority: "critical",
    description: "Appreciation for mothers, elegant bouquets, pastels",
  },
  {
    name: "Easter",
    date: "easter",
    marketingStart: 14,
    marketingEnd: 0,
    priority: "high",
    description: "Spring flowers, lilies, pastel arrangements",
  },
  {
    name: "Administrative Professionals Day",
    date: "last-full-week-april-wednesday",
    marketingStart: 14,
    marketingEnd: 0,
    priority: "medium",
    description: "Workplace appreciation, professional arrangements",
  },
  {
    name: "Graduation Season",
    date: "05-15", // peak mid-May through early June
    marketingStart: 21,
    marketingEnd: 21,
    priority: "high",
    description: "Congratulations, bright cheerful bouquets",
  },
  {
    name: "Father's Day",
    date: "third-sunday-june",
    marketingStart: 14,
    marketingEnd: 0,
    priority: "high",
    description: "Masculine arrangements, bold colors, plants",
  },
  {
    name: "Independence Day",
    date: "07-04",
    marketingStart: 10,
    marketingEnd: 0,
    priority: "medium",
    description: "Patriotic red/white/blue arrangements",
  },
  {
    name: "Back to School",
    date: "08-20",
    marketingStart: 14,
    marketingEnd: 7,
    priority: "medium",
    description: "Teacher appreciation, fresh starts",
  },
  {
    name: "Grandparents Day",
    date: "first-sunday-after-labor-day",
    marketingStart: 10,
    marketingEnd: 0,
    priority: "medium",
    description: "Appreciation for grandparents, classic bouquets",
  },
  {
    name: "Halloween",
    date: "10-31",
    marketingStart: 14,
    marketingEnd: 0,
    priority: "medium",
    description: "Fall colors, orange/black arrangements, festive",
  },
  {
    name: "Thanksgiving",
    date: "fourth-thursday-november",
    marketingStart: 14,
    marketingEnd: 0,
    priority: "high",
    description: "Gratitude, autumn arrangements, centerpieces",
  },
  {
    name: "Christmas",
    date: "12-25",
    marketingStart: 28,
    marketingEnd: 0,
    priority: "critical",
    description: "Holiday arrangements, poinsettias, festive bouquets",
  },
  {
    name: "Hanukkah",
    date: "hanukkah",
    marketingStart: 14,
    marketingEnd: 0,
    priority: "medium",
    description: "Blue/white arrangements, celebration flowers",
  },
  {
    name: "New Year",
    date: "01-01",
    marketingStart: 10,
    marketingEnd: 3,
    priority: "high",
    description: "Fresh starts, bright cheerful arrangements",
  },
];

// Evergreen occasions (always relevant)
const EVERGREEN = [
  { name: "Birthday", description: "Personal celebration, age-appropriate arrangements" },
  { name: "Anniversary", description: "Romantic milestone, roses and elegant bouquets" },
  { name: "Sympathy", description: "Condolences, peaceful white/blue arrangements" },
  { name: "Get Well Soon", description: "Cheerful recovery wishes, bright colors" },
  { name: "Congratulations", description: "Achievement celebration, vibrant bouquets" },
  { name: "Thank You", description: "Gratitude expression, thoughtful arrangements" },
  { name: "Just Because", description: "Spontaneous gifting, seasonal favorites" },
  { name: "New Baby", description: "Birth celebration, soft pastels" },
];

function getSecondSundayOfMay(year: number): Date {
  const may = new Date(year, 4, 1); // May is month 4 (0-indexed)
  const firstDay = may.getDay();
  const firstSunday = firstDay === 0 ? 1 : 8 - firstDay;
  return new Date(year, 4, firstSunday + 7);
}

function getThirdSundayOfJune(year: number): Date {
  const june = new Date(year, 5, 1);
  const firstDay = june.getDay();
  const firstSunday = firstDay === 0 ? 1 : 8 - firstDay;
  return new Date(year, 5, firstSunday + 14);
}

function getFourthThursdayOfNovember(year: number): Date {
  const nov = new Date(year, 10, 1);
  const firstDay = nov.getDay();
  const firstThursday = firstDay <= 4 ? 5 - firstDay : 12 - firstDay;
  return new Date(year, 10, firstThursday + 21);
}

function getEasterSunday(year: number): Date {
  // Meeus/Jones/Butcher algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function getLaborDay(year: number): Date {
  const sept = new Date(year, 8, 1);
  const firstDay = sept.getDay();
  const firstMonday = firstDay <= 1 ? 2 - firstDay : 9 - firstDay;
  return new Date(year, 8, firstMonday);
}

function getLastFullWeekAprilWednesday(year: number): Date {
  // Admin Professionals Day: Wednesday of last full week of April
  const lastDay = new Date(year, 4, 0); // last day of April
  const lastDayOfWeek = lastDay.getDay();
  const lastSunday = lastDay.getDate() - lastDayOfWeek;
  const wednesday = lastSunday - 4; // go back one week, then forward to Wednesday
  return new Date(year, 3, wednesday);
}

function resolveOccasionDate(occasion: OccasionWindow, year: number): Date {
  if (occasion.date.includes("-")) {
    const parts = occasion.date.split("-").map(Number);
    const month = parts[0]!;
    const day = parts[1]!;
    return new Date(year, month - 1, day);
  }
  switch (occasion.date) {
    case "second-sunday-may":
      return getSecondSundayOfMay(year);
    case "third-sunday-june":
      return getThirdSundayOfJune(year);
    case "fourth-thursday-november":
      return getFourthThursdayOfNovember(year);
    case "easter":
      return getEasterSunday(year);
    case "first-sunday-after-labor-day":
      const laborDay = getLaborDay(year);
      return new Date(laborDay.getFullYear(), laborDay.getMonth(), laborDay.getDate() + 7 - laborDay.getDay());
    case "last-full-week-april-wednesday":
      return getLastFullWeekAprilWednesday(year);
    case "hanukkah":
      // Hanukkah dates vary widely; simplified to early December for now
      return new Date(year, 11, 10);
    default:
      throw new Error(`Unknown occasion date format: ${occasion.date}`);
  }
}

export interface ActiveOccasion {
  name: string;
  date: string;
  daysUntil: number;
  priority: "critical" | "high" | "medium";
  description: string;
  phase: "early" | "peak" | "late";
}

export function getActiveOccasions(today: Date = new Date()): {
  seasonal: ActiveOccasion[];
  evergreen: typeof EVERGREEN;
} {
  const year = today.getFullYear();
  const active: ActiveOccasion[] = [];

  for (const occasion of OCCASIONS) {
    let occasionDate = resolveOccasionDate(occasion, year);
    
    // Check next year too if we're near year-end
    if (today.getMonth() === 11 && occasionDate.getMonth() <= 1) {
      occasionDate = resolveOccasionDate(occasion, year + 1);
    }

    const daysUntil = Math.floor((occasionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const inWindow = daysUntil >= -occasion.marketingEnd && daysUntil <= occasion.marketingStart;

    if (inWindow) {
      let phase: "early" | "peak" | "late";
      if (daysUntil > 7) phase = "early";
      else if (daysUntil >= 0) phase = "peak";
      else phase = "late";

      const dateStr = `${occasionDate.getFullYear()}-${String(occasionDate.getMonth() + 1).padStart(2, "0")}-${String(occasionDate.getDate()).padStart(2, "0")}`;
      active.push({
        name: occasion.name,
        date: dateStr,
        daysUntil,
        priority: occasion.priority,
        description: occasion.description,
        phase,
      });
    }
  }

  // Sort by priority (critical > high > medium) then by days until
  active.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.daysUntil - b.daysUntil;
  });

  return { seasonal: active, evergreen: EVERGREEN };
}

export function formatOccasionGuidance(): string {
  const { seasonal, evergreen } = getActiveOccasions();
  
  let guidance = "CURRENT OCCASION CALENDAR:\n\n";
  
  if (seasonal.length > 0) {
    guidance += "ACTIVE SEASONAL OCCASIONS (prioritize these):\n\n";
    for (const occ of seasonal) {
      const urgency = occ.daysUntil <= 7 ? " ⚠️ URGENT" : "";
      guidance += `• ${occ.name} (${occ.date}) — ${occ.daysUntil} days away [${occ.priority.toUpperCase()}]${urgency}\n`;
      guidance += `  ${occ.description}\n`;
      guidance += `  Marketing phase: ${occ.phase}\n\n`;
    }
  } else {
    guidance += "No major seasonal occasions in the current marketing window.\n\n";
  }

  guidance += "EVERGREEN OCCASIONS (always relevant, use when no seasonal fit):\n\n";
  for (const occ of evergreen) {
    guidance += `• ${occ.name} — ${occ.description}\n`;
  }

  return guidance;
}
