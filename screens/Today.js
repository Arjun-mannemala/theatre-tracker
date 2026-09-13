import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Modal, Pressable, Alert } from 'react-native';
import * as DB from '../db';
import * as A from '../analytics';
import { C, S, Card, Btn, Field, Stat, Divider, Empty, money, pct } from '../theme';
import { Meter } from '../charts';

function ShowForm({ visible, onClose, date, slot, run, classes, existing, onSaved }) {
  const [lines, setLines] = useState([]);

  useEffect(() => {
    if (!visible) return;
    const seed = classes.map((c) => {
      const prev = existing ? existing.lines.find((l) => l.class_id === c.id) : null;
      return {
        class_id: c.id,
        class_name: c.name,
        seats: c.seats,
        qty: prev ? String(prev.qty) : '',
        price: prev ? String(prev.price) : c.price ? String(c.price) : '',
      };
    });
    setLines(seed);
  }, [visible, existing, classes]);

  const set = (i, key, v) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [key]: v.replace(/[^0-9.]/g, '') } : l)));

  const total = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  const tickets = lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const seats = lines.reduce((a, l) => a + (l.seats || 0), 0);

  async function save() {
    const over = lines.find((l) => (Number(l.qty) || 0) > l.seats);
    if (over) {
      Alert.alert(
        'More tickets than seats',
        `${over.class_name} has ${over.seats} seats but you entered ${over.qty}. Save anyway?`,
        [
          { text: 'Fix it', style: 'cancel' },
          { text: 'Save', onPress: commit },
        ]
      );
      return;
    }
    commit();
  }

  async function commit() {
    await DB.saveShow({
      runId: run ? run.id : null,
      date,
      slot,
      lines: lines.map((l) => ({
        class_id: l.class_id,
        class_name: l.class_name,
        seats: l.seats,
        qty: Number(l.qty) || 0,
        price: Number(l.price) || 0,
      })),
    });
    for (const l of lines) {
      if (Number(l.price) > 0) await DB.updateClassPriceQuiet(l.class_id, Number(l.price));
    }
    onSaved();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000000BB', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: C.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 18,
            borderTopWidth: 1,
            borderColor: C.line,
          }}>
          <View style={S.between}>
            <Text style={S.h2}>{slot}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: C.dim, fontSize: 22 }}>{'\u00D7'}</Text>
            </Pressable>
          </View>
          <Text style={[S.faint, { marginTop: 2 }]}>
            {run ? run.title : 'No film set'} {'\u00B7'} {date}
          </Text>

          <Divider />

          <View style={[S.row, { marginBottom: 6 }]}>
            <Text style={[S.faint, { flex: 1.4 }]}>Class</Text>
            <Text style={[S.faint, { flex: 1, textAlign: 'center' }]}>Tickets</Text>
            <Text style={[S.faint, { flex: 1, textAlign: 'center' }]}>Price</Text>
          </View>

          {lines.map((l, i) => (
            <View key={l.class_id} style={[S.row, { marginBottom: 10 }]}>
              <View style={{ flex: 1.4 }}>
                <Text style={S.body}>{l.class_name}</Text>
                <Text style={S.faint}>{l.seats} seats</Text>
              </View>
              <Field
                value={l.qty}
                onChangeText={(v) => set(i, 'qty', v)}
                placeholder="0"
                numeric
                style={{ flex: 1, marginHorizontal: 6, textAlign: 'center' }}
              />
              <Field
                value={l.price}
                onChangeText={(v) => set(i, 'price', v)}
                placeholder="0"
                numeric
                style={{ flex: 1, textAlign: 'center' }}
              />
            </View>
          ))}

          <Divider />

          <View style={S.between}>
            <Text style={S.dim}>
              {tickets} of {seats} seats {'\u00B7'} {seats > 0 ? pct((tickets / seats) * 100) : '\u2014'}
            </Text>
            <Text style={[S.h2, { color: C.amber }]}>{money(total)}</Text>
          </View>

          <Btn label="Save show" onPress={save} style={{ marginTop: 14 }} />

          {existing ? (
            <Btn
              label="Delete this show"
              kind="danger"
              small
              style={{ marginTop: 8 }}
              onPress={() =>
                Alert.alert(
                  `Delete the ${slot}?`,
                  'The tickets logged against it are removed from your totals.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        await DB.deleteShow(existing.id);
                        onSaved();
                        onClose();
                      },
                    },
                  ]
                )
              }
            />
          ) : null}
          <View style={{ height: 18 }} />
        </View>
      </View>
    </Modal>
  );
}

export default function Today({ refreshKey, bump }) {
  const [date, setDate] = useState(DB.today());
  const [slots, setSlots] = useState(DB.DEFAULT_SLOTS);
  const [classes, setClasses] = useState([]);
  const [run, setRun] = useState(null);
  const [shows, setShows] = useState([]);
  const [sum, setSum] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setSlots(await DB.getSlots());
    setClasses(await DB.getClasses());
    setRun(await DB.activeRun());
    setShows(await DB.showsOn(date));
    setSum(await A.daySummary(date));
  }, [date]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const byslot = (s) => shows.find((x) => x.slot === s);
  const isToday = date === DB.today();
  const label = isToday
    ? 'Today'
    : new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });

  const be = sum ? sum.breakEven : null;

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, { paddingBottom: 40 }]}>
      <View style={S.between}>
        <View>
          <Text style={S.h1}>{label}</Text>
          <Text style={S.faint}>{date}</Text>
        </View>
        <View style={S.row}>
          <Btn label={'\u2039'} small kind="ghost" onPress={() => setDate(DB.addDays(date, -1))} />
          <View style={{ width: 6 }} />
          <Btn
            label={'\u203A'}
            small
            kind="ghost"
            disabled={isToday}
            onPress={() => setDate(DB.addDays(date, 1))}
          />
        </View>
      </View>

      <Card style={{ marginTop: 14, backgroundColor: run ? C.surface : C.surfaceAlt }}>
        <Text style={S.faint}>Now showing</Text>
        <Text style={[S.h2, { marginTop: 3 }]}>{run ? run.title : 'No film set'}</Text>
        {run ? (
          <Text style={[S.dim, { marginTop: 2 }]}>
            Day {DB.daysBetween(run.started_on, date) + 1} of this run
          </Text>
        ) : (
          <Text style={[S.dim, { marginTop: 2 }]}>Set one in the Film tab before logging shows.</Text>
        )}
      </Card>

      {sum ? (
        <Card style={{ marginTop: 12 }}>
          <View style={S.row}>
            <Stat label="Revenue" value={money(sum.revenue)} />
            <Stat label="Tickets" value={String(sum.tickets)} sub={`${sum.shows} shows`} />
            <Stat
              label="Occupancy"
              value={pct(sum.occupancy)}
              tone={sum.occupancy != null && sum.occupancy < 20 ? 'red' : null}
            />
          </View>
          <Divider />
          <View style={S.row}>
            <Stat
              label="Profit after all costs"
              value={money(sum.trueProfit)}
              tone={sum.trueProfit >= 0 ? 'green' : 'red'}
              sub={`${money(sum.directExpense)} direct + ${money(sum.fixedShare)} fixed share`}
            />
          </View>

          {be && be.tickets ? (
            <View style={{ marginTop: 14 }}>
              <Meter
                value={sum.occupancy || 0}
                target={be.occupancy}
                label={`Break-even is ${be.tickets} tickets (${pct(be.occupancy)}). You are at ${
                  sum.tickets
                }.`}
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      <Text style={[S.h2, { marginTop: 22, marginBottom: 10 }]}>Shows</Text>

      {classes.length === 0 ? (
        <Empty text="No ticket classes yet. Add them in Settings." />
      ) : (
        slots.map((slot) => {
          const s = byslot(slot);
          return (
            <Pressable key={slot} onPress={() => setOpen(slot)}>
              <Card style={{ marginBottom: 8 }}>
                <View style={S.between}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.body}>{slot}</Text>
                    {s ? (
                      <Text style={[S.faint, { marginTop: 3 }]}>
                        {s.tickets} tickets {'\u00B7'} {pct((s.tickets / (s.capacity || 1)) * 100)}
                      </Text>
                    ) : (
                      <Text style={[S.faint, { marginTop: 3 }]}>Not logged</Text>
                    )}
                  </View>
                  <Text style={{ color: s ? C.amber : C.faint, fontSize: 17, fontWeight: '600' }}>
                    {s ? money(s.revenue) : 'Log'}
                  </Text>
                </View>
              </Card>
            </Pressable>
          );
        })
      )}

      <ShowForm
        visible={!!open}
        slot={open}
        date={date}
        run={run}
        classes={classes}
        existing={open ? byslot(open) : null}
        onClose={() => setOpen(null)}
        onSaved={() => {
          load();
          bump();
        }}
      />
    </ScrollView>
  );
}
