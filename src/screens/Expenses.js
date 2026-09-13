import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import * as DB from '../db';
import { C, S, Card, Btn, Field, Pill, Divider, Empty, money } from '../theme';

export default function Expenses({ refreshKey, bump }) {
  const [kind, setKind] = useState('daily');
  const [date, setDate] = useState(DB.today());
  const [month, setMonth] = useState(DB.monthOf());
  const [cats, setCats] = useState([]);
  const [vals, setVals] = useState({});
  const [dirty, setDirty] = useState(false);

  const period = kind === 'daily' ? date : month;

  const load = useCallback(async () => {
    const c = await DB.getCategories(kind);
    setCats(c);
    const rows =
      kind === 'daily' ? await DB.expensesOn(date) : await DB.expensesForMonth(month);
    const map = {};
    for (const r of rows) map[r.category_id] = String(r.amount);
    setVals(map);
    setDirty(false);
  }, [kind, date, month]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const set = (id, v) => {
    setVals((m) => ({ ...m, [id]: v.replace(/[^0-9.]/g, '') }));
    setDirty(true);
  };

  async function save() {
    for (const c of cats) {
      await DB.saveExpense({
        categoryId: c.id,
        categoryName: c.name,
        kind,
        date: kind === 'daily' ? date : null,
        month: kind === 'daily' ? null : month,
        amount: Number(vals[c.id]) || 0,
      });
    }
    setDirty(false);
    bump();
    load();
  }

  const total = cats.reduce((a, c) => a + (Number(vals[c.id]) || 0), 0);

  const shiftMonth = (n) => setMonth(DB.shiftMonth(month, n));

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, { paddingBottom: 40 }]}>
      <Text style={S.h1}>Expenses</Text>

      <View style={[S.row, { marginTop: 14, flexWrap: 'wrap' }]}>
        <Pill label="Daily" active={kind === 'daily'} onPress={() => setKind('daily')} />
        <Pill label="Monthly" active={kind === 'monthly'} onPress={() => setKind('monthly')} />
      </View>

      <Card style={{ marginTop: 6 }}>
        <View style={S.between}>
          <View>
            <Text style={S.faint}>{kind === 'daily' ? 'For the day' : 'For the month'}</Text>
            <Text style={[S.h2, { marginTop: 3 }]}>
              {kind === 'daily'
                ? period
                : new Date(month + '-01T00:00:00').toLocaleDateString('en-IN', {
                    month: 'long',
                    year: 'numeric',
                  })}
            </Text>
          </View>
          <View style={S.row}>
            <Btn
              label={'\u2039'}
              small
              kind="ghost"
              onPress={() => (kind === 'daily' ? setDate(DB.addDays(date, -1)) : shiftMonth(-1))}
            />
            <View style={{ width: 6 }} />
            <Btn
              label={'\u203A'}
              small
              kind="ghost"
              onPress={() => (kind === 'daily' ? setDate(DB.addDays(date, 1)) : shiftMonth(1))}
            />
          </View>
        </View>
      </Card>

      {cats.length === 0 ? (
        <Empty text="No categories here yet. Add them in Settings." />
      ) : (
        <View style={{ marginTop: 14 }}>
          {cats.map((c) => (
            <View key={c.id} style={[S.row, { marginBottom: 10 }]}>
              <Text style={[S.body, { flex: 1.3 }]} numberOfLines={1}>
                {c.name}
              </Text>
              <Field
                value={vals[c.id] || ''}
                onChangeText={(v) => set(c.id, v)}
                placeholder="0"
                numeric
                style={{ flex: 1, textAlign: 'right' }}
              />
            </View>
          ))}

          <Divider />
          <View style={S.between}>
            <Text style={S.dim}>Total</Text>
            <Text style={[S.h2, { color: C.amber }]}>{money(total)}</Text>
          </View>

          <Btn
            label={dirty ? 'Save expenses' : 'Saved'}
            onPress={save}
            disabled={!dirty}
            style={{ marginTop: 14 }}
          />

          <Text style={[S.faint, { marginTop: 12, lineHeight: 17 }]}>
            {kind === 'daily'
              ? 'Leave a category blank if it was nil that day.'
              : 'Monthly costs are spread across the days of the month when profit is calculated.'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
