import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Alert, Pressable } from 'react-native';
import * as DB from '../db';
import * as Backup from '../backup';
import { C, S, Card, Btn, Field, Pill, Divider, money } from '../theme';

function ClassRow({ c, onSave, onRemove }) {
  const [name, setName] = useState(c.name);
  const [seats, setSeats] = useState(String(c.seats));
  const [price, setPrice] = useState(String(c.price || ''));
  const changed = name !== c.name || seats !== String(c.seats) || price !== String(c.price || '');
  return (
    <View style={{ marginBottom: 14 }}>
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
            onPress={() => onSave(c.id, name, Number(seats) || 0, Number(price) || 0)}
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
  const [newCat, setNewCat] = useState('');
  const [newClass, setNewClass] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastBackup, setLastBackup] = useState(null);

  const load = useCallback(async () => {
    setClasses(await DB.getClasses());
    setCats(await DB.getCategories(catKind));
    setLastBackup(await DB.getSetting('last_backup'));
  }, [catKind]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

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
            load();
            bump();
          },
        },
      ]
    );
  }

  const staleBackup =
    !lastBackup || DB.daysBetween(lastBackup, DB.today()) > 7;

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, { paddingBottom: 40 }]}>
      <Text style={S.h1}>Settings</Text>

      <Card style={{ marginTop: 14, borderColor: staleBackup ? C.red : C.line }}>
        <Text style={S.h2}>Backup</Text>
        <Text style={[S.dim, { marginTop: 6, lineHeight: 19 }]}>
          {lastBackup
            ? `Last backup ${lastBackup}.`
            : 'You have never backed up.'}{' '}
          Everything lives on this phone only. Send yourself a backup weekly.
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
          Name, seats, and the price to pre-fill on new shows.
        </Text>
        {classes.map((c) => (
          <ClassRow
            key={c.id}
            c={c}
            onSave={async (id, n, s, p) => {
              await DB.updateClass(id, n, s, p);
              load();
              bump();
            }}
            onRemove={(cl) =>
              Alert.alert(
                `Remove ${cl.name}?`,
                'Past shows keep their records. The class just stops appearing on new entries.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                      await DB.archiveClass(cl.id);
                      load();
                      bump();
                    },
                  },
                ]
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
              load();
              bump();
            }}
          />
        </View>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={S.h2}>Expense categories</Text>
        <View style={[S.row, { marginTop: 12, flexWrap: 'wrap' }]}>
          <Pill label="Daily" active={catKind === 'daily'} onPress={() => setCatKind('daily')} />
          <Pill
            label="Monthly"
            active={catKind === 'monthly'}
            onPress={() => setCatKind('monthly')}
          />
        </View>
        {cats.map((c) => (
          <View key={c.id} style={[S.between, { paddingVertical: 9 }]}>
            <Text style={S.body}>{c.name}</Text>
            <Pressable
              hitSlop={10}
              onPress={() =>
                Alert.alert(`Remove ${c.name}?`, 'Past entries stay in your history.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                      await DB.archiveCategory(c.id);
                      load();
                      bump();
                    },
                  },
                ])
              }>
              <Text style={{ color: C.faint, fontSize: 13 }}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <View style={[S.row, { marginTop: 10 }]}>
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
              load();
              bump();
            }}
          />
        </View>
      </Card>

      <Text style={[S.faint, { marginTop: 20, textAlign: 'center' }]}>Theatre 1.0</Text>
    </ScrollView>
  );
}
