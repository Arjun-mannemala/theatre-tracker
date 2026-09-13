import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Alert, Pressable } from 'react-native';
import * as DB from '../db';
import * as Backup from '../backup';
import { C, S, Card, Btn, Field, Pill, Divider } from '../theme';

/** A name that can be edited in place, moved, and removed. */
function EditRow({ value, onRename, onRemove, onUp, canUp }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const changed = text.trim() && text !== value;
  return (
    <View style={[S.row, { marginBottom: 8 }]}>
      <Field value={text} onChangeText={setText} style={{ flex: 1 }} />
      {changed ? (
        <Btn label="Save" small style={{ marginLeft: 8 }} onPress={() => onRename(text.trim())} />
      ) : (
        <View style={S.row}>
          {onUp ? (
            <Pressable hitSlop={10} disabled={!canUp} onPress={onUp}>
              <Text style={{ color: canUp ? C.dim : C.line, fontSize: 17, paddingHorizontal: 10 }}>
                {'\u2191'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable hitSlop={10} onPress={onRemove}>
            <Text style={{ color: C.faint, fontSize: 13, paddingLeft: 8 }}>Remove</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ClassRow({ c, onSave, onRemove }) {
  const [name, setName] = useState(c.name);
  const [seats, setSeats] = useState(String(c.seats));
  const [price, setPrice] = useState(String(c.price || ''));
  useEffect(() => {
    setName(c.name);
    setSeats(String(c.seats));
    setPrice(String(c.price || ''));
  }, [c]);
  const changed = name !== c.name || seats !== String(c.seats) || price !== String(c.price || '');
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={S.row}>
        <Field value={name} onChangeText={setName} placeholder="Class" style={{ flex: 1.6 }} />
        <Field
          value={seats}
          onChangeText={(v) => setSeats(v.replace(/[^0-9]/g, ''))}
          placeholder="Seats"
          numeric
          style={{ flex: 1, marginLeft: 8, textAlign: 'center' }}
        />
        <Field
          value={price}
          onChangeText={(v) => setPrice(v.replace(/[^0-9.]/g, ''))}
          placeholder="Price"
          numeric
          style={{ flex: 1, marginLeft: 8, textAlign: 'center' }}
        />
      </View>
      <View style={[S.row, { marginTop: 8 }]}>
        {changed ? (
          <Btn
            label="Save"
            small
            onPress={() => onSave(c.id, name.trim(), Number(seats) || 0, Number(price) || 0)}
          />
        ) : null}
        <View style={{ flex: 1 }} />
        <Btn label="Remove" small kind="danger" onPress={() => onRemove(c)} />
      </View>
      <Divider />
    </View>
  );
}

export default function Settings({ refreshKey, bump }) {
  const [classes, setClasses] = useState([]);
  const [catKind, setCatKind] = useState('daily');
  const [cats, setCats] = useState([]);
  const [slots, setSlots] = useState([]);
  const [newCat, setNewCat] = useState('');
  const [newClass, setNewClass] = useState('');
  const [newSlot, setNewSlot] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastBackup, setLastBackup] = useState(null);

  const load = useCallback(async () => {
    setClasses(await DB.getClasses());
    setCats(await DB.getCategories(catKind));
    setSlots(await DB.getSlots());
    setLastBackup(await DB.getSetting('last_backup'));
  }, [catKind]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const after = () => {
    load();
    bump();
  };

  const confirmRemove = (what, note, run) =>
    Alert.alert(`Remove ${what}?`, note, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: run },
    ]);

  async function doExport() {
    setBusy(true);
    try {
      const r = await Backup.exportBackup();
      await DB.setSetting('last_backup', DB.today());
      setLastBackup(DB.today());
      Alert.alert('Backup ready', `${r.name}\n${r.shows} shows included.`);
    } catch (e) {
      Alert.alert('Backup failed', String(e.message || e));
    }
    setBusy(false);
    load();
  }

  async function doCSV() {
    setBusy(true);
    try {
      await Backup.exportCSV();
    } catch (e) {
      Alert.alert('Export failed', String(e.message || e));
    }
    setBusy(false);
  }

  function doRestore() {
    Alert.alert(
      'Restore from backup',
      'This replaces everything currently in the app. Anything logged since that backup will be gone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose file',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const r = await Backup.restoreBackup();
              if (r) Alert.alert('Restored', `${r.shows} shows are back.`);
            } catch (e) {
              Alert.alert('Restore failed', String(e.message || e));
            }
            setBusy(false);
            after();
          },
        },
      ]
    );
  }

  const staleBackup = !lastBackup || DB.daysBetween(lastBackup, DB.today()) > 7;

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, { paddingBottom: 40 }]}>
      <Text style={S.h1}>Settings</Text>

      <Card style={{ marginTop: 14, borderColor: staleBackup ? C.red : C.line }}>
        <Text style={S.h2}>Backup</Text>
        <Text style={[S.dim, { marginTop: 6, lineHeight: 19 }]}>
          {lastBackup ? `Last backup ${lastBackup}.` : 'You have never backed up.'} Everything lives
          on this phone only. Send yourself a backup weekly.
        </Text>
        <Btn label="Back up and send" onPress={doExport} disabled={busy} style={{ marginTop: 12 }} />
        <View style={[S.row, { marginTop: 8 }]}>
          <Btn label="Export CSV" kind="ghost" small onPress={doCSV} style={{ flex: 1 }} />
          <View style={{ width: 8 }} />
          <Btn label="Restore" kind="danger" small onPress={doRestore} style={{ flex: 1 }} />
        </View>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={S.h2}>Ticket classes</Text>
        <Text style={[S.faint, { marginTop: 4, marginBottom: 14 }]}>
          Name, seats, and the price to pre-fill on new shows. Renaming updates past records too.
        </Text>
        {classes.map((c) => (
          <ClassRow
            key={c.id}
            c={c}
            onSave={async (id, n, s, p) => {
              await DB.updateClass(id, n, s, p);
              after();
            }}
            onRemove={(cl) =>
              classes.length <= 1
                ? Alert.alert('Keep one class', 'You need at least one class to sell tickets in.')
                : confirmRemove(
                    cl.name,
                    'Past shows keep their records. The class just stops appearing on new entries.',
                    async () => {
                      await DB.archiveClass(cl.id);
                      after();
                    }
                  )
            }
          />
        ))}
        <View style={S.row}>
          <Field
            value={newClass}
            onChangeText={setNewClass}
            placeholder="Add a class"
            style={{ flex: 1 }}
          />
          <Btn
            label="Add"
            small
            style={{ marginLeft: 8 }}
            disabled={!newClass.trim()}
            onPress={async () => {
              await DB.addClass(newClass.trim(), 50, 0);
              setNewClass('');
              after();
            }}
          />
        </View>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={S.h2}>Show slots</Text>
        <Text style={[S.faint, { marginTop: 4, marginBottom: 12 }]}>
          The shows you run in a day, in order. Renaming carries through to shows already logged.
        </Text>
        {slots.map((name, i) => (
          <EditRow
            key={name}
            value={name}
            canUp={i > 0}
            onUp={async () => {
              const next = slots.slice();
              next.splice(i - 1, 0, next.splice(i, 1)[0]);
              await DB.setSlots(next);
              after();
            }}
            onRename={async (n) => {
              if (slots.includes(n)) {
                Alert.alert('Already there', `${n} is already in the list.`);
                return;
              }
              await DB.renameSlot(name, n);
              after();
            }}
            onRemove={() =>
              slots.length <= 1
                ? Alert.alert('Keep one slot', 'You need at least one slot to log shows against.')
                : confirmRemove(name, 'Past shows keep their records.', async () => {
                    await DB.setSlots(slots.filter((x) => x !== name));
                    after();
                  })
            }
          />
        ))}
        <View style={[S.row, { marginTop: 4 }]}>
          <Field
            value={newSlot}
            onChangeText={setNewSlot}
            placeholder="Add a slot"
            style={{ flex: 1 }}
          />
          <Btn
            label="Add"
            small
            style={{ marginLeft: 8 }}
            disabled={!newSlot.trim()}
            onPress={async () => {
              const n = newSlot.trim();
              if (slots.includes(n)) {
                Alert.alert('Already there', `${n} is already in the list.`);
                return;
              }
              await DB.setSlots([...slots, n]);
              setNewSlot('');
              after();
            }}
          />
        </View>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={S.h2}>Expense categories</Text>
        <View style={[S.row, { marginTop: 12, marginBottom: 4, flexWrap: 'wrap' }]}>
          <Pill label="Daily" active={catKind === 'daily'} onPress={() => setCatKind('daily')} />
          <Pill
            label="Monthly"
            active={catKind === 'monthly'}
            onPress={() => setCatKind('monthly')}
          />
        </View>
        {cats.map((c) => (
          <EditRow
            key={c.id}
            value={c.name}
            onRename={async (n) => {
              await DB.renameCategory(c.id, n);
              after();
            }}
            onRemove={() =>
              confirmRemove(c.name, 'Past entries stay in your history.', async () => {
                await DB.archiveCategory(c.id);
                after();
              })
            }
          />
        ))}
        <View style={[S.row, { marginTop: 4 }]}>
          <Field
            value={newCat}
            onChangeText={setNewCat}
            placeholder={`Add a ${catKind} category`}
            style={{ flex: 1 }}
          />
          <Btn
            label="Add"
            small
            style={{ marginLeft: 8 }}
            disabled={!newCat.trim()}
            onPress={async () => {
              await DB.addCategory(newCat.trim(), catKind);
              setNewCat('');
              after();
            }}
          />
        </View>
      </Card>

      <Text style={[S.faint, { marginTop: 20, textAlign: 'center' }]}>Theatre 1.0</Text>
    </ScrollView>
  );
}
