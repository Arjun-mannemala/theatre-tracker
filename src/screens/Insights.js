import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import * as DB from '../db';
import * as A from '../analytics';
import { C, S, Card, Pill, Stat, Divider, Empty, money, pct } from '../theme';
import { Bars, Curve } from '../charts';

const RANGES = [
  { key: 7, label: '7 days' },
  { key: 30, label: '30 days' },
  { key: 90, label: '90 days' },
  { key: 365, label: '1 year' },
];

export default function Insights({ refreshKey }) {
  const [days, setDays] = useState(30);
  const [sum, setSum] = useState(null);
  const [wd, setWd] = useState([]);
  const [slots, setSlots] = useState([]);
  const [mix, setMix] = useState([]);
  const [cats, setCats] = useState([]);
  const [alerts, setAlerts] = useState([]);

  const to = DB.today();
  const from = DB.addDays(to, -(days - 1));

  const load = useCallback(async () => {
    setSum(await A.periodSummary(from, to));
    setWd(await A.weekdayProfile(from, to));
    setSlots(await DB.slotBreakdown(from, to));
    setMix(await DB.classMix(from, to));
    setCats(await DB.categoryBreakdown(from, to, DB.monthOf(to)));
    setAlerts(await A.expenseAnomalies(DB.monthOf(to)));
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!sum) return <View style={S.screen} />;

  const hasData = sum.days.length > 0;
  const catTotal = cats.reduce((a, c) => a + c.total, 0);

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, { paddingBottom: 40 }]}>
      <Text style={S.h1}>Insights</Text>

      <View style={[S.row, { marginTop: 14, flexWrap: 'wrap' }]}>
        {RANGES.map((r) => (
          <Pill key={r.key} label={r.label} active={days === r.key} onPress={() => setDays(r.key)} />
        ))}
      </View>

      {!hasData ? (
        <Empty text={'Nothing logged in this period.\nLog a few shows and the charts fill in.'} />
      ) : (
        <View>
          <Card>
            <View style={S.row}>
              <Stat label="Revenue" value={money(sum.revenue)} sub={`${sum.tickets} tickets`} />
              <Stat
                label="Profit"
                value={money(sum.profit)}
                tone={sum.profit >= 0 ? 'green' : 'red'}
                sub={sum.margin == null ? null : `${Math.round(sum.margin)}% margin`}
              />
            </View>
            <Divider />
            <View style={S.row}>
              <Stat label="Occupancy" value={pct(sum.occupancy)} />
              <Stat label="Avg ticket" value={money(sum.avgPrice)} />
              <Stat label="Cost per ticket" value={money(sum.costPerSeat)} />
            </View>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={S.faint}>Daily revenue</Text>
            <View style={{ marginTop: 10 }}>
              <Curve
                points={sum.days.map((d) => d.revenue || 0)}
                labels={sum.days.map((d) => d.date.slice(5))}
              />
            </View>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={S.faint}>Average revenue by weekday</Text>
            <View style={{ marginTop: 12 }}>
              <Bars
                data={wd.map((w) => ({ label: w.day, value: w.avgRevenue }))}
                highlight={wd.reduce(
                  (best, w, i) => (w.avgRevenue > (wd[best] ? wd[best].avgRevenue : 0) ? i : best),
                  0
                )}
              />
            </View>
            <Text style={[S.faint, { marginTop: 10, lineHeight: 17 }]}>
              Occupancy: {wd.filter((w) => w.n > 0).map((w) => `${w.day} ${pct(w.occupancy)}`).join('  ')}
            </Text>
          </Card>

          {slots.length ? (
            <Card style={{ marginTop: 12 }}>
              <Text style={S.faint}>By show slot</Text>
              {slots
                .slice()
                .sort((a, b) => b.revenue - a.revenue)
                .map((s) => {
                  const o = A.occ(s.tickets, s.capacity);
                  return (
                    <View key={s.slot} style={[S.between, { marginTop: 12 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={S.body}>{s.slot}</Text>
                        <Text style={[S.faint, { marginTop: 2 }]}>
                          {s.shows} shows {'\u00B7'} {pct(o)} full
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: o != null && o < 15 ? C.red : C.text,
                          fontWeight: '600',
                          fontSize: 15,
                        }}>
                        {money(s.revenue)}
                      </Text>
                    </View>
                  );
                })}
              <Text style={[S.faint, { marginTop: 12, lineHeight: 17 }]}>
                A slot under 15% across many shows is usually costing more to run than it brings in.
              </Text>
            </Card>
          ) : null}

          {mix.length ? (
            <Card style={{ marginTop: 12 }}>
              <Text style={S.faint}>Class mix</Text>
              {mix.map((m) => (
                <View key={m.class_name} style={[S.between, { marginTop: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.body}>{m.class_name}</Text>
                    <Text style={[S.faint, { marginTop: 2 }]}>
                      {pct(A.occ(m.tickets, m.capacity))} full {'\u00B7'} {m.tickets} tickets
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: C.text, fontWeight: '600', fontSize: 15 }}>
                      {money(m.revenue)}
                    </Text>
                    <Text style={[S.faint, { marginTop: 2 }]}>
                      {sum.revenue > 0 ? Math.round((m.revenue / sum.revenue) * 100) : 0}% of takings
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          {alerts.length ? (
            <Card style={{ marginTop: 12 }} tone="alert">
              <Text style={[S.faint, { color: C.red }]}>Running above your own average</Text>
              {alerts.map((a) => (
                <View key={a.name} style={{ marginTop: 10 }}>
                  <Text style={S.body}>{a.name}</Text>
                  <Text style={[S.faint, { marginTop: 2 }]}>
                    {money(a.current)} this month against {money(a.average)} average {'\u00B7'}{' '}
                    {Math.round(a.over)}% over
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}

          {cats.length ? (
            <Card style={{ marginTop: 12 }}>
              <Text style={S.faint}>Where the money goes</Text>
              {cats.slice(0, 10).map((c) => (
                <View key={c.name + c.kind} style={{ marginTop: 12 }}>
                  <View style={S.between}>
                    <Text style={S.body}>{c.name}</Text>
                    <Text style={S.dim}>{money(c.total)}</Text>
                  </View>
                  <View
                    style={{
                      height: 4,
                      borderRadius: 999,
                      backgroundColor: C.surfaceAlt,
                      marginTop: 6,
                      overflow: 'hidden',
                    }}>
                    <View
                      style={{
                        width: `${catTotal > 0 ? (c.total / catTotal) * 100 : 0}%`,
                        height: '100%',
                        backgroundColor: c.kind === 'monthly' ? '#7A6A4A' : C.amber,
                      }}
                    />
                  </View>
                </View>
              ))}
              <Text style={[S.faint, { marginTop: 12 }]}>
                Amber is daily spend, muted is fixed monthly.
              </Text>
            </Card>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
