import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as DB from './db';

// expo-file-system moved to a class API in newer SDKs; the legacy path
// keeps the simple read/write helpers. Try legacy first, fall back.
let FS;
try {
  FS = require('expo-file-system/legacy');
} catch (e) {
  FS = require('expo-file-system');
}

const TABLES = [
  'settings', 'classes', 'films', 'runs', 'shows',
  'tickets', 'categories', 'expenses', 'holidays',
];

const dir = () => FS.documentDirectory || FS.cacheDirectory;

export async function buildBackup() {
  const data = {};
  for (const t of TABLES) data[t] = await DB.dumpTable(t);
  return {
    format: 'theatre-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export async function exportBackup() {
  const payload = await buildBackup();
  const name = `theatre-backup-${DB.today()}.json`;
  const path = dir() + name;
  await FS.writeAsStringAsync(path, JSON.stringify(payload), { encoding: 'utf8' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'application/json',
      dialogTitle: 'Send backup',
    });
  }
  const rows = payload.data.shows.length;
  return { path, name, shows: rows };
}

/** Replaces everything. Merging silently creates duplicate shows. */
export async function restoreBackup() {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (res.canceled) return null;
  const asset = res.assets ? res.assets[0] : res;
  const text = await FS.readAsStringAsync(asset.uri, { encoding: 'utf8' });
  const payload = JSON.parse(text);
  if (payload.format !== 'theatre-tracker') {
    throw new Error('That file is not a Theatre backup.');
  }
  const db = DB.raw();
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  for (const t of TABLES) await db.runAsync(`DELETE FROM ${t}`);
  for (const t of TABLES) {
    const rows = payload.data[t] || [];
    for (const row of rows) {
      const keys = Object.keys(row);
      const marks = keys.map(() => '?').join(',');
      await db.runAsync(
        `INSERT OR REPLACE INTO ${t} (${keys.join(',')}) VALUES (${marks})`,
        keys.map((k) => row[k])
      );
    }
  }
  await db.execAsync('PRAGMA foreign_keys = ON;');
  return { shows: (payload.data.shows || []).length, exportedAt: payload.exportedAt };
}

const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export async function exportCSV() {
  const db = DB.raw();
  const shows = await db.getAllAsync(
    `SELECT s.date, s.slot, f.title AS film, t.class_name, t.qty, t.price,
            t.seats, (t.qty * t.price) AS revenue
     FROM shows s
     LEFT JOIN runs r ON r.id = s.run_id
     LEFT JOIN films f ON f.id = r.film_id
     LEFT JOIN tickets t ON t.show_id = s.id
     ORDER BY s.date, s.id`
  );
  const exp = await db.getAllAsync(
    `SELECT kind, IFNULL(date, month) AS period, category_name, amount, note
     FROM expenses ORDER BY period`
  );

  const lines = [];
  lines.push('SHOWS');
  lines.push('Date,Slot,Film,Class,Tickets,Price,Seats,Revenue');
  for (const r of shows) {
    lines.push([r.date, r.slot, r.film, r.class_name, r.qty, r.price, r.seats, r.revenue]
      .map(esc).join(','));
  }
  lines.push('');
  lines.push('EXPENSES');
  lines.push('Type,Period,Category,Amount,Note');
  for (const r of exp) {
    lines.push([r.kind, r.period, r.category_name, r.amount, r.note].map(esc).join(','));
  }

  const name = `theatre-data-${DB.today()}.csv`;
  const path = dir() + name;
  await FS.writeAsStringAsync(path, lines.join('\n'), { encoding: 'utf8' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Send CSV' });
  }
  return { path, name };
}
