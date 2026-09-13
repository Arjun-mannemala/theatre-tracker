import * as DB from './db';

export const occ = (qty, cap) => (cap > 0 ? (qty / cap) * 100 : null);

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Daily share of this month's fixed costs. */
export async function dailyFixedShare(date) {
  const month = DB.monthOf(date);
  const total = await DB.monthlyExpenseTotal(month);
  return total / daysInMonth(month);
}

/**
 * Break-even for a single day.
 * Fixed load = that day's direct expenses + the day's slice of monthly costs
 * + the day's slice of the current run's booking cost.
 */
export async function breakEven(date, avgPrice, capacityToday) {
  const direct = await DB.dailyExpenseTotal(date);
  const fixed = await dailyFixedShare(date);
  const run = await DB.activeRun();
  let booking = 0;
  if (run && run.booking_cost) {
    const curve = await DB.runDayCurve(run.id);
    const days = Math.max(curve.length, 1);
    booking = run.booking_cost / days;
  }
  const load = direct + fixed + booking;
  const tickets = avgPrice > 0 ? Math.ceil(load / avgPrice) : null;
  const occupancy = tickets != null && capacityToday > 0 ? (tickets / capacityToday) * 100 : null;
  return { load, direct, fixed, booking, tickets, occupancy };
}

export async function daySummary(date) {
  const t = await DB.dayTotals(date);
  const direct = await DB.dailyExpenseTotal(date);
  const fixed = await dailyFixedShare(date);
  const revenue = t ? t.revenue : 0;
  const tickets = t ? t.tickets : 0;
  const capacity = t ? t.capacity : 0;
  const avgPrice = tickets > 0 ? revenue / tickets : 0;
  const be = await breakEven(date, avgPrice, capacity);
  return {
    date,
    shows: t ? t.shows : 0,
    tickets,
    revenue,
    capacity,
    occupancy: occ(tickets, capacity),
    directExpense: direct,
    fixedShare: fixed,
    cashProfit: revenue - direct,
    trueProfit: revenue - direct - fixed,
    avgPrice,
    breakEven: be,
  };
}

export async function periodSummary(from, to) {
  const days = await DB.rangeDays(from, to);
  const revenue = days.reduce((a, d) => a + (d.revenue || 0), 0);
  const tickets = days.reduce((a, d) => a + (d.tickets || 0), 0);
  const capacity = days.reduce((a, d) => a + (d.capacity || 0), 0);
  const direct = await DB.dailyExpenseRange(from, to);
  const months = new Set(days.map((d) => d.date.slice(0, 7)));
  let fixed = 0;
  for (const m of months) fixed += await DB.monthlyExpenseTotal(m);
  return {
    days,
    revenue,
    tickets,
    capacity,
    occupancy: occ(tickets, capacity),
    direct,
    fixed,
    profit: revenue - direct - fixed,
    margin: revenue > 0 ? ((revenue - direct - fixed) / revenue) * 100 : null,
    avgPrice: tickets > 0 ? revenue / tickets : 0,
    costPerSeat: tickets > 0 ? (direct + fixed) / tickets : 0,
  };
}

export function filmAgeDays(releaseDate, playedOn) {
  if (!releaseDate) return null;
  try {
    return DB.daysBetween(releaseDate.slice(0, 10), playedOn);
  } catch (e) {
    return null;
  }
}

export const AGE_BUCKETS = [
  { key: 'fresh', label: '1\u20133 months', max: 92 },
  { key: 'recent', label: '3\u201312 months', max: 365 },
  { key: 'rewatch', label: '1\u20135 years', max: 1825 },
  { key: 'classic', label: 'Over 5 years', max: Infinity },
];

export function ageBucket(days) {
  if (days == null) return null;
  return AGE_BUCKETS.find((b) => days <= b.max) || AGE_BUCKETS[AGE_BUCKETS.length - 1];
}

/** Rank every completed run, with an index against the period baseline. */
export async function filmLeaderboard() {
  const runs = await DB.allRuns();
  if (!runs.length) return [];
  const withMetrics = runs.map((r) => {
    const days = r.days || 0;
    return {
      ...r,
      occupancy: occ(r.tickets, r.capacity),
      revPerDay: days > 0 ? r.revenue / days : 0,
      profit: r.revenue - (r.booking_cost || 0),
      ageDays: filmAgeDays(r.release_date, r.started_on),
    };
  });
  const baseline =
    withMetrics.reduce((a, r) => a + r.revPerDay, 0) / Math.max(withMetrics.length, 1);
  return withMetrics.map((r) => ({
    ...r,
    index: baseline > 0 ? r.revPerDay / baseline : null,
    bucket: ageBucket(r.ageDays),
  }));
}

/** Retention across a run: day 7 (or last day) vs day 1. */
export function retention(curve) {
  if (!curve || curve.length < 2) return null;
  const first = curve[0].revenue || 0;
  if (!first) return null;
  const target = curve[Math.min(6, curve.length - 1)];
  return ((target.revenue || 0) / first) * 100;
}

/** Flag categories running well above their own recent average. */
export async function expenseAnomalies(month) {
  const cats = await DB.categoryBreakdown(month + '-01', month + '-31', month);
  const out = [];
  for (const c of cats) {
    const hist = await DB.monthlyCategoryHistory(c.name, 4);
    const prior = hist.filter((h) => h.m !== month);
    if (prior.length < 2) continue;
    const avg = prior.reduce((a, h) => a + h.total, 0) / prior.length;
    if (avg > 0 && c.total > avg * 1.25) {
      out.push({ name: c.name, current: c.total, average: avg, over: ((c.total / avg) - 1) * 100 });
    }
  }
  return out;
}

export async function weekdayProfile(from, to) {
  const days = await DB.rangeDays(from, to);
  const buckets = Array.from({ length: 7 }, () => ({ revenue: 0, tickets: 0, capacity: 0, n: 0 }));
  for (const d of days) {
    const wd = DB.weekdayOf(d.date);
    buckets[wd].revenue += d.revenue || 0;
    buckets[wd].tickets += d.tickets || 0;
    buckets[wd].capacity += d.capacity || 0;
    buckets[wd].n += 1;
  }
  return buckets.map((b, i) => ({
    day: DB.WEEKDAYS[i],
    avgRevenue: b.n > 0 ? b.revenue / b.n : 0,
    occupancy: occ(b.tickets, b.capacity),
    n: b.n,
  }));
}

/* ---------- interpretation ---------- */

export function monthBounds(month) {
  return { from: month + '-01', to: month + '-' + String(daysInMonth(month)).padStart(2, '0') };
}

/** Days in the range with nothing logged at all. */
export async function coverage(from, to) {
  const days = await DB.rangeDays(from, to);
  const logged = new Set(days.map((d) => d.date));
  const total = DB.daysBetween(from, to) + 1;
  const missing = [];
  for (let i = 0; i < total; i++) {
    const d = DB.addDays(from, i);
    if (d > DB.today()) break;
    if (!logged.has(d)) missing.push(d);
  }
  return { total, logged: logged.size, missing };
}

/** Average occupancy and revenue per day, grouped by how old the film was. */
export async function byFilmAge() {
  const runs = await DB.allRuns();
  const groups = {};
  for (const r of runs) {
    const b = ageBucket(filmAgeDays(r.release_date, r.started_on));
    if (!b) continue;
    if (!groups[b.key]) groups[b.key] = { label: b.label, tickets: 0, capacity: 0, revenue: 0, days: 0, runs: 0 };
    const g = groups[b.key];
    g.tickets += r.tickets || 0;
    g.capacity += r.capacity || 0;
    g.revenue += r.revenue || 0;
    g.days += r.days || 0;
    g.runs += 1;
  }
  return AGE_BUCKETS.filter((b) => groups[b.key]).map((b) => ({
    ...groups[b.key],
    occupancy: occ(groups[b.key].tickets, groups[b.key].capacity),
    revPerDay: groups[b.key].days > 0 ? groups[b.key].revenue / groups[b.key].days : 0,
  }));
}

const rupees = (n) => '\u20B9' + Math.round(n || 0).toLocaleString('en-IN');

/**
 * Plain sentences drawn from the period. Each one appears only when there is
 * enough data behind it to be worth saying.
 */
export async function headlines(from, to) {
  const out = [];
  const sum = await periodSummary(from, to);
  if (!sum.days.length) return out;

  // Break-even against what actually came in
  const load = sum.direct + sum.fixed;
  if (load > 0 && sum.avgPrice > 0) {
    const perDay = load / sum.days.length;
    const need = Math.ceil(perDay / sum.avgPrice);
    const got = Math.round(sum.tickets / sum.days.length);
    out.push(
      got >= need
        ? `You need about ${need} tickets a day to cover costs. You averaged ${got}.`
        : `You need about ${need} tickets a day to cover costs. You averaged ${got}, which is ${need - got} short.`
    );
  }

  // Weekday spread
  const wd = await weekdayProfile(from, to);
  const active = wd.filter((w) => w.n >= 2);
  if (active.length >= 4) {
    const best = active.reduce((a, b) => (b.avgRevenue > a.avgRevenue ? b : a));
    const worst = active.reduce((a, b) => (b.avgRevenue < a.avgRevenue ? b : a));
    if (worst.avgRevenue > 0 && best.avgRevenue / worst.avgRevenue >= 1.4) {
      out.push(
        `${best.day} earns about ${(best.avgRevenue / worst.avgRevenue).toFixed(1)}\u00D7 what ${worst.day} does.`
      );
    }
  }

  // Slots pulling their weight
  const slots = await DB.slotBreakdown(from, to);
  if (slots.length >= 2) {
    const scored = slots.map((s) => ({ ...s, o: occ(s.tickets, s.capacity) }));
    const weak = scored.filter((s) => s.o != null && s.o < 15 && s.shows >= 5);
    if (weak.length) {
      out.push(
        `${weak.map((w) => w.slot).join(' and ')} ran under 15% full across ${weak.reduce(
          (a, w) => a + w.shows, 0
        )} shows. Worth asking whether they pay for themselves.`
      );
    } else {
      const best = scored.reduce((a, b) => ((b.o || 0) > (a.o || 0) ? b : a));
      if (best.o != null) out.push(`${best.slot} is your strongest slot at ${Math.round(best.o)}% full.`);
    }
  }

  // Class mix
  const mix = await DB.classMix(from, to);
  if (mix.length >= 2 && sum.revenue > 0) {
    const top = mix.reduce((a, b) => (b.revenue > a.revenue ? b : a));
    const shareRev = (top.revenue / sum.revenue) * 100;
    const shareTix = sum.tickets > 0 ? (top.tickets / sum.tickets) * 100 : 0;
    if (Math.abs(shareRev - shareTix) >= 8) {
      out.push(
        `${top.class_name} is ${Math.round(shareTix)}% of tickets but ${Math.round(shareRev)}% of takings.`
      );
    }
  }

  // Film age, once there is history to compare
  const ages = await byFilmAge();
  if (ages.length >= 2) {
    const sorted = ages.slice().sort((a, b) => (b.occupancy || 0) - (a.occupancy || 0));
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    if (top.occupancy != null && bottom.occupancy != null && top.occupancy - bottom.occupancy >= 8) {
      out.push(
        `Films ${top.label.toLowerCase()} run at ${Math.round(top.occupancy)}% full for you, against ${Math.round(
          bottom.occupancy
        )}% for films ${bottom.label.toLowerCase()}.`
      );
    }
  }

  // Where the money goes
  const cats = await DB.categoryBreakdown(from, to, DB.monthOf(to));
  const catTotal = cats.reduce((a, c) => a + c.total, 0);
  if (cats.length && catTotal > 0) {
    const top = cats[0];
    out.push(`${top.name} is your largest cost at ${rupees(top.total)}, ${Math.round((top.total / catTotal) * 100)}% of spend.`);
  }

  return out;
}
