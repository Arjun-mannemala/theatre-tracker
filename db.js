import * as SQLite from 'expo-sqlite';

let db = null;

export const today = () => new Date().toISOString().slice(0, 10);
export const monthOf = (d) => (d || today()).slice(0, 7);
export const addDays = (iso, n) => {
  const t = new Date(iso + 'T00:00:00');
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0, 10);
};
export const daysBetween = (a, b) =>
  Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
export const weekdayOf = (iso) => new Date(iso + 'T00:00:00').getDay();
export const isWeekend = (iso) => [0, 6].includes(weekdayOf(iso));
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DEFAULT_SLOTS = ['Matinee', 'First Show', 'Second Show', 'Night'];

const DAILY_CATS = [
  'Staff wages',
  'Electricity',
  'Cleaning',
  'Security',
  'Water',
  'Diesel / generator',
  'Canteen supplies',
  'Petty cash',
];

const MONTHLY_CATS = [
  'Rent / lease',
  'Fixed salaries',
  'Property tax',
  'Insurance',
  'Internet',
  'Projector / AC servicing',
  'Licence fees',
  'Loan EMI',
];

export async function open() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('theatre.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate();
  return db;
}

async function migrate() {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      seats INTEGER NOT NULL DEFAULT 50,
      price REAL NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS films (
      id INTEGER PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      tmdb_id INTEGER,
      release_date TEXT,
      poster TEXT,
      genres TEXT,
      lead TEXT,
      language TEXT DEFAULT 'Telugu'
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY NOT NULL,
      film_id INTEGER NOT NULL,
      started_on TEXT NOT NULL,
      ended_on TEXT,
      booking_cost REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (film_id) REFERENCES films(id)
    );
    CREATE TABLE IF NOT EXISTS shows (
      id INTEGER PRIMARY KEY NOT NULL,
      run_id INTEGER,
      date TEXT NOT NULL,
      slot TEXT NOT NULL,
      note TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY NOT NULL,
      show_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      class_name TEXT,
      seats INTEGER NOT NULL DEFAULT 0,
      qty INTEGER NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY NOT NULL,
      category_id INTEGER,
      category_name TEXT,
      kind TEXT NOT NULL,
      date TEXT,
      month TEXT,
      amount REAL NOT NULL DEFAULT 0,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS holidays (
      date TEXT PRIMARY KEY NOT NULL,
      label TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_shows_date ON shows(date);
    CREATE INDEX IF NOT EXISTS idx_shows_run ON shows(run_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_show ON tickets(show_id);
    CREATE INDEX IF NOT EXISTS idx_exp_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_exp_month ON expenses(month);
  `);

  const seeded = await getSetting('seeded');
  if (!seeded) {
    await db.runAsync('INSERT INTO classes (name, seats, price, sort) VALUES (?,?,?,?)', [
      'Regular', 50, 0, 0,
    ]);
    await db.runAsync('INSERT INTO classes (name, seats, price, sort) VALUES (?,?,?,?)', [
      'Balcony', 50, 0, 1,
    ]);
    for (let i = 0; i < DAILY_CATS.length; i++)
      await db.runAsync('INSERT INTO categories (name, kind, sort) VALUES (?,?,?)', [
        DAILY_CATS[i], 'daily', i,
      ]);
    for (let i = 0; i < MONTHLY_CATS.length; i++)
      await db.runAsync('INSERT INTO categories (name, kind, sort) VALUES (?,?,?)', [
        MONTHLY_CATS[i], 'monthly', i,
      ]);
    await setSetting('slots', JSON.stringify(DEFAULT_SLOTS));
    await setSetting('seeded', '1');
  }
}

/* ---------- settings ---------- */

export async function getSetting(key, fallback = null) {
  const r = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
  return r ? r.value : fallback;
}

export async function setSetting(key, value) {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', [
    key, String(value),
  ]);
}

export const setSlots = (arr) => setSetting('slots', JSON.stringify(arr));

export async function renameSlot(oldName, newName) {
  const list = await getSlots();
  if (oldName === newName) return;
  await setSlots(list.map((s) => (s === oldName ? newName : s)));
  await db.runAsync('UPDATE shows SET slot=? WHERE slot=?', [newName, oldName]);
}

export async function getSlots() {
  const raw = await getSetting('slots');
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length ? v : DEFAULT_SLOTS;
  } catch (e) {
    return DEFAULT_SLOTS;
  }
}

/* ---------- classes ---------- */

export const getClasses = () =>
  db.getAllAsync('SELECT * FROM classes WHERE archived = 0 ORDER BY sort, id');

export const addClass = (name, seats, price) =>
  db.runAsync('INSERT INTO classes (name, seats, price, sort) VALUES (?,?,?,(SELECT IFNULL(MAX(sort),0)+1 FROM classes))', [
    name, seats, price,
  ]);

export async function updateClass(id, name, seats, price) {
  const prev = await db.getFirstAsync('SELECT name FROM classes WHERE id=?', [id]);
  await db.runAsync('UPDATE classes SET name=?, seats=?, price=? WHERE id=?', [name, seats, price, id]);
  if (prev && prev.name !== name) {
    await db.runAsync('UPDATE tickets SET class_name=? WHERE class_id=?', [name, id]);
  }
}

export const archiveClass = (id) => db.runAsync('UPDATE classes SET archived=1 WHERE id=?', [id]);

/** Remember the last price used so the next show pre-fills it. */
export const updateClassPriceQuiet = (id, price) =>
  db.runAsync('UPDATE classes SET price=? WHERE id=?', [price, id]);

/* ---------- films & runs ---------- */

export async function activeRun() {
  return db.getFirstAsync(
    `SELECT r.*, f.title, f.poster, f.release_date, f.genres, f.lead, f.language
     FROM runs r JOIN films f ON f.id = r.film_id
     WHERE r.active = 1 ORDER BY r.id DESC LIMIT 1`
  );
}

export async function findFilmByTitle(title) {
  return db.getFirstAsync('SELECT * FROM films WHERE LOWER(title) = LOWER(?) LIMIT 1', [title]);
}

export async function startRun(film, startedOn, bookingCost) {
  await db.runAsync('UPDATE runs SET active = 0, ended_on = IFNULL(ended_on, ?) WHERE active = 1', [
    addDays(startedOn, -1),
  ]);
  let existing = film.tmdb_id
    ? await db.getFirstAsync('SELECT * FROM films WHERE tmdb_id = ?', [film.tmdb_id])
    : await findFilmByTitle(film.title);
  let filmId;
  if (existing) {
    filmId = existing.id;
    await db.runAsync(
      'UPDATE films SET title=?, tmdb_id=IFNULL(?,tmdb_id), release_date=IFNULL(?,release_date), poster=IFNULL(?,poster), genres=IFNULL(?,genres), lead=IFNULL(?,lead) WHERE id=?',
      [film.title, film.tmdb_id || null, film.release_date || null, film.poster || null,
       film.genres || null, film.lead || null, filmId]
    );
  } else {
    const r = await db.runAsync(
      'INSERT INTO films (title, tmdb_id, release_date, poster, genres, lead, language) VALUES (?,?,?,?,?,?,?)',
      [film.title, film.tmdb_id || null, film.release_date || null, film.poster || null,
       film.genres || null, film.lead || null, film.language || 'Telugu']
    );
    filmId = r.lastInsertRowId;
  }
  const run = await db.runAsync(
    'INSERT INTO runs (film_id, started_on, booking_cost, active) VALUES (?,?,?,1)',
    [filmId, startedOn, bookingCost || 0]
  );
  return run.lastInsertRowId;
}

export const setRunBookingCost = (runId, cost) =>
  db.runAsync('UPDATE runs SET booking_cost=? WHERE id=?', [cost, runId]);

export const renameFilm = (filmId, title) =>
  db.runAsync('UPDATE films SET title=? WHERE id=?', [title, filmId]);

export const updateRun = (runId, startedOn, bookingCost) =>
  db.runAsync('UPDATE runs SET started_on=?, booking_cost=? WHERE id=?', [
    startedOn, bookingCost, runId,
  ]);

export const countRunShows = async (runId) => {
  const r = await db.getFirstAsync('SELECT COUNT(*) AS n FROM shows WHERE run_id=?', [runId]);
  return r ? r.n : 0;
};

/** Removes the run and every show logged against it. */
export async function deleteRun(runId) {
  await db.runAsync(
    'DELETE FROM tickets WHERE show_id IN (SELECT id FROM shows WHERE run_id=?)', [runId]
  );
  await db.runAsync('DELETE FROM shows WHERE run_id=?', [runId]);
  await db.runAsync('DELETE FROM runs WHERE id=?', [runId]);
}

/** Puts an archived run back as the current film. */
export async function reactivateRun(runId) {
  await db.runAsync('UPDATE runs SET active=0 WHERE active=1');
  await db.runAsync('UPDATE runs SET active=1, ended_on=NULL WHERE id=?', [runId]);
}

export async function priorRuns(filmId, excludeRunId) {
  return db.getAllAsync(
    `SELECT r.*, 
       (SELECT IFNULL(SUM(t.qty * t.price),0) FROM tickets t
          JOIN shows s ON s.id = t.show_id WHERE s.run_id = r.id) AS revenue,
       (SELECT IFNULL(SUM(t.qty),0) FROM tickets t
          JOIN shows s ON s.id = t.show_id WHERE s.run_id = r.id) AS tickets,
       (SELECT IFNULL(SUM(t.seats),0) FROM tickets t
          JOIN shows s ON s.id = t.show_id WHERE s.run_id = r.id) AS capacity,
       (SELECT COUNT(DISTINCT s.date) FROM shows s WHERE s.run_id = r.id) AS days
     FROM runs r WHERE r.film_id = ? AND r.id != ? ORDER BY r.started_on DESC`,
    [filmId, excludeRunId || 0]
  );
}

export async function allRuns() {
  return db.getAllAsync(
    `SELECT r.*, f.title, f.poster, f.release_date, f.genres, f.lead,
       (SELECT IFNULL(SUM(t.qty * t.price),0) FROM tickets t
          JOIN shows s ON s.id = t.show_id WHERE s.run_id = r.id) AS revenue,
       (SELECT IFNULL(SUM(t.qty),0) FROM tickets t
          JOIN shows s ON s.id = t.show_id WHERE s.run_id = r.id) AS tickets,
       (SELECT IFNULL(SUM(t.seats),0) FROM tickets t
          JOIN shows s ON s.id = t.show_id WHERE s.run_id = r.id) AS capacity,
       (SELECT COUNT(DISTINCT s.date) FROM shows s WHERE s.run_id = r.id) AS days,
       (SELECT COUNT(*) FROM shows s WHERE s.run_id = r.id) AS show_count
     FROM runs r JOIN films f ON f.id = r.film_id
     ORDER BY r.started_on DESC, r.id DESC`
  );
}

export const runDayCurve = (runId) =>
  db.getAllAsync(
    `SELECT s.date,
       SUM(t.qty) AS tickets,
       SUM(t.qty * t.price) AS revenue,
       SUM(t.seats) AS capacity
     FROM shows s JOIN tickets t ON t.show_id = s.id
     WHERE s.run_id = ? GROUP BY s.date ORDER BY s.date`,
    [runId]
  );

/* ---------- shows ---------- */

export async function saveShow({ runId, date, slot, lines, note }) {
  const existing = await db.getFirstAsync(
    'SELECT id FROM shows WHERE date = ? AND slot = ?', [date, slot]
  );
  let showId;
  if (existing) {
    showId = existing.id;
    await db.runAsync('DELETE FROM tickets WHERE show_id = ?', [showId]);
    await db.runAsync('UPDATE shows SET run_id=?, note=? WHERE id=?', [runId, note || null, showId]);
  } else {
    const r = await db.runAsync(
      'INSERT INTO shows (run_id, date, slot, note, created_at) VALUES (?,?,?,?,?)',
      [runId, date, slot, note || null, new Date().toISOString()]
    );
    showId = r.lastInsertRowId;
  }
  for (const l of lines) {
    await db.runAsync(
      'INSERT INTO tickets (show_id, class_id, class_name, seats, qty, price) VALUES (?,?,?,?,?,?)',
      [showId, l.class_id, l.class_name, l.seats, l.qty, l.price]
    );
  }
  return showId;
}

export const deleteShow = (id) => db.runAsync('DELETE FROM shows WHERE id = ?', [id]);

export async function showsOn(date) {
  const rows = await db.getAllAsync('SELECT * FROM shows WHERE date = ? ORDER BY id', [date]);
  for (const s of rows) {
    s.lines = await db.getAllAsync('SELECT * FROM tickets WHERE show_id = ?', [s.id]);
    s.revenue = s.lines.reduce((a, l) => a + l.qty * l.price, 0);
    s.tickets = s.lines.reduce((a, l) => a + l.qty, 0);
    s.capacity = s.lines.reduce((a, l) => a + l.seats, 0);
  }
  return rows;
}

export const dayTotals = (date) =>
  db.getFirstAsync(
    `SELECT IFNULL(SUM(t.qty),0) AS tickets,
            IFNULL(SUM(t.qty * t.price),0) AS revenue,
            IFNULL(SUM(t.seats),0) AS capacity,
            COUNT(DISTINCT s.id) AS shows
     FROM shows s LEFT JOIN tickets t ON t.show_id = s.id WHERE s.date = ?`,
    [date]
  );

export const rangeDays = (from, to) =>
  db.getAllAsync(
    `SELECT s.date,
       SUM(t.qty) AS tickets,
       SUM(t.qty * t.price) AS revenue,
       SUM(t.seats) AS capacity
     FROM shows s JOIN tickets t ON t.show_id = s.id
     WHERE s.date BETWEEN ? AND ? GROUP BY s.date ORDER BY s.date`,
    [from, to]
  );

export const slotBreakdown = (from, to) =>
  db.getAllAsync(
    `SELECT s.slot,
       SUM(t.qty) AS tickets,
       SUM(t.qty * t.price) AS revenue,
       SUM(t.seats) AS capacity,
       COUNT(DISTINCT s.id) AS shows
     FROM shows s JOIN tickets t ON t.show_id = s.id
     WHERE s.date BETWEEN ? AND ? GROUP BY s.slot`,
    [from, to]
  );

export const slotWeekdayGrid = (from, to) =>
  db.getAllAsync(
    `SELECT s.slot, CAST(strftime('%w', s.date) AS INTEGER) AS wd,
       SUM(t.qty) AS tickets, SUM(t.seats) AS capacity, SUM(t.qty*t.price) AS revenue
     FROM shows s JOIN tickets t ON t.show_id = s.id
     WHERE s.date BETWEEN ? AND ? GROUP BY s.slot, wd`,
    [from, to]
  );

export const classMix = (from, to) =>
  db.getAllAsync(
    `SELECT t.class_name,
       SUM(t.qty) AS tickets, SUM(t.qty*t.price) AS revenue, SUM(t.seats) AS capacity
     FROM shows s JOIN tickets t ON t.show_id = s.id
     WHERE s.date BETWEEN ? AND ? GROUP BY t.class_name`,
    [from, to]
  );

/* ---------- expenses ---------- */

export const getCategories = (kind) =>
  db.getAllAsync('SELECT * FROM categories WHERE kind = ? AND archived = 0 ORDER BY sort, id', [kind]);

export const addCategory = (name, kind) =>
  db.runAsync('INSERT INTO categories (name, kind, sort) VALUES (?,?,(SELECT IFNULL(MAX(sort),0)+1 FROM categories))', [
    name, kind,
  ]);

export async function renameCategory(id, name) {
  const prev = await db.getFirstAsync('SELECT name FROM categories WHERE id=?', [id]);
  await db.runAsync('UPDATE categories SET name=? WHERE id=?', [name, id]);
  if (prev && prev.name !== name) {
    await db.runAsync('UPDATE expenses SET category_name=? WHERE category_id=?', [name, id]);
  }
}

export const archiveCategory = (id) =>
  db.runAsync('UPDATE categories SET archived=1 WHERE id=?', [id]);

export async function saveExpense({ categoryId, categoryName, kind, date, month, amount, note }) {
  const where = kind === 'daily' ? 'date = ?' : 'month = ?';
  const key = kind === 'daily' ? date : month;
  const existing = await db.getFirstAsync(
    `SELECT id FROM expenses WHERE category_id = ? AND kind = ? AND ${where}`,
    [categoryId, kind, key]
  );
  if (existing) {
    if (!amount) return db.runAsync('DELETE FROM expenses WHERE id = ?', [existing.id]);
    return db.runAsync('UPDATE expenses SET amount=?, note=?, category_name=? WHERE id=?', [
      amount, note || null, categoryName, existing.id,
    ]);
  }
  if (!amount) return;
  return db.runAsync(
    'INSERT INTO expenses (category_id, category_name, kind, date, month, amount, note) VALUES (?,?,?,?,?,?,?)',
    [categoryId, categoryName, kind, date || null, month || null, amount, note || null]
  );
}

export const expensesOn = (date) =>
  db.getAllAsync('SELECT * FROM expenses WHERE kind = ? AND date = ?', ['daily', date]);

export const expensesForMonth = (month) =>
  db.getAllAsync('SELECT * FROM expenses WHERE kind = ? AND month = ?', ['monthly', month]);

export const dailyExpenseTotal = async (date) => {
  const r = await db.getFirstAsync(
    'SELECT IFNULL(SUM(amount),0) AS total FROM expenses WHERE kind=? AND date=?', ['daily', date]
  );
  return r ? r.total : 0;
};

export const monthlyExpenseTotal = async (month) => {
  const r = await db.getFirstAsync(
    'SELECT IFNULL(SUM(amount),0) AS total FROM expenses WHERE kind=? AND month=?', ['monthly', month]
  );
  return r ? r.total : 0;
};

export const dailyExpenseRange = async (from, to) => {
  const r = await db.getFirstAsync(
    'SELECT IFNULL(SUM(amount),0) AS total FROM expenses WHERE kind=? AND date BETWEEN ? AND ?',
    ['daily', from, to]
  );
  return r ? r.total : 0;
};

export const categoryBreakdown = (from, to, month) =>
  db.getAllAsync(
    `SELECT category_name AS name, kind, SUM(amount) AS total FROM expenses
     WHERE (kind='daily' AND date BETWEEN ? AND ?) OR (kind='monthly' AND month = ?)
     GROUP BY category_name, kind ORDER BY total DESC`,
    [from, to, month]
  );

export const monthlyCategoryHistory = (name, months) =>
  db.getAllAsync(
    `SELECT IFNULL(month, substr(date,1,7)) AS m, SUM(amount) AS total
     FROM expenses WHERE category_name = ? GROUP BY m ORDER BY m DESC LIMIT ?`,
    [name, months]
  );

/* ---------- holidays ---------- */

export const setHoliday = (date, label) =>
  label
    ? db.runAsync('INSERT OR REPLACE INTO holidays (date, label) VALUES (?,?)', [date, label])
    : db.runAsync('DELETE FROM holidays WHERE date = ?', [date]);

export const getHoliday = (date) =>
  db.getFirstAsync('SELECT * FROM holidays WHERE date = ?', [date]);

/* ---------- raw access for backup ---------- */

export const raw = () => db;
export const dumpTable = (t) => db.getAllAsync(`SELECT * FROM ${t}`);
