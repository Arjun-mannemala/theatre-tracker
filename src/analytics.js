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
