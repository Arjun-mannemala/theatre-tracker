import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import * as DB from '../db';
import * as A from '../analytics';
import { C, S, Card, Pill, Stat, Divider, Empty, money, pct } from '../theme';
import { Bars, Curve } from '../charts';

export default function Insights({ refreshKey }) {
  const [mode, setMode] = useState('30');
  const [sum, setSum] = useState(null);
  const [lines, setLines] = useState([]);
  const [cover, setCover] = useState(null);
  const [wd, setWd] = useState([]);
  const [slots, setSlots] = useState([]);
  const [grid, setGrid] = useState([]);
  const [mix, setMix] = useState([]);
  const [ages, setAges] = useState([]);
  const [cats, setCats] = useState([]);
  const [alerts, setAlerts] = useState([]);

  const thisMonth = DB.monthOf(DB.today());
  let from, to, title;
  if (mode === 'month' || mode === 'lastmonth') {
    const m = mode === 'month' ? thisMonth : DB.shiftMonth(thisMonth, -1);
    const b = A.monthBounds(m);
    from = b.from;
    to = mode === 'month' ? DB.today() : b.to;
    title = new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });
  } else {
    const n = Number(mode);
    to = DB.today();
    from = DB.addDays(to, -(n - 1));
    title = `Last ${n} days`;
  }

  const load = useCallback(async () => {
    setSum(await A.periodSummary(from, to));
    setLines(await A.headlines(from, to));
    setCover(await A.coverage(from, to));
    setWd(await A.weekdayProfile(from, to));
    setSlots(await DB.slotBreakdown(from, to));
    setGrid(await DB.slotWeekdayGrid(from, to));
    setMix(await DB.classMix(from, to));
    setAges(await A.byFilmAge());
    setCats(await DB.categoryBreakdown(from, to, DB.monthOf(to)));
    setAlerts(await A.expenseAnomalies(DB.monthOf(to)));
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!sum) return <View style={S.screen} />;

  const hasData = sum.days.length > 0;
  const catTotal = cats.reduce((a, c) => a + c.total, 0);

  // slot x weekday occupancy lookup
  const slotNames = [...new Set(grid.map((g) => g.slot))];
  const cell = (slot, wdIndex) => {
    const r = grid.find((g) => g.slot === slot && g.wd === wdIndex);
    return r ? A.occ(r.tickets, r.capacity) : null;
  };

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, { paddingBottom: 40 }]}>
      <Text style={S.h1}>Insights</Text>
      <Text style={[S.faint, { marginTop: 2 }]}>{title}</Text>

      <View style={[S.row, { marginTop: 14, flexWrap: 'wrap' }]}>
        <Pill label="This month" active={mode === 'month'} onPress={() => setMode('month')} />
        <Pill label="Last month" active={mode === 'lastmonth'} onPress={() => setMode('lastmonth')} />
        <Pill label="7 days" active={mode === '7'} onPress={() => setMode('7')} />
        <Pill label="30 days" active={mode === '30'} onPress={() => setMode('30')} />
        <Pill label="90 days" active={mode === '90'} onPress={() => setMode('90')} />
        <Pill label="1 year" active={mode === '365'} onPress={() => setMode('365')} />
      </View>

      {!hasData ? (
        <Empty text={'Nothing logged in this period.\nLog a few shows and this fills in.'} />
      ) : (
        <View>
          {lines.length ? (
            <Card style={{ borderColor: C.amberDim }}>
              <Text style={S.faint}>What this says</Text>
              {lines.map((l, i) => (
                <View key={i} style={[S.row, { marginTop: 10, alignItems: 'flex-start' }]}>
                  <Text style={{ color: C.amber, marginRight: 8, fontSize: 15 }}>{'\u2022'}</Text>
                  <Text style={[S.body, { flex: 1, lineHeight: 21 }]}>{l}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {cover && cover.missing.length ? (
            <Card style={{ marginTop: 12 }} tone="alert">
              <Text style={[S.faint, { color: C.red }]}>Gaps in the data</Text>
              <Text style={[S.body, { marginTop: 6, lineHeight: 20 }]}>
                {cover.missing.length} of {cover.total} days have nothing logged.
              </Text>
              <Text style={[S.faint, { marginTop: 6, lineHeight: 17 }]}>
                If you were closed, ignore this. If not, the averages above are reading higher than
                they should.
              </Text>
            </Card>
          ) : null}

          <Card style={{ marginTop: 12 }}>
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
            <Divider />
            <View style={S.row}>
              <Stat label="Daily spend" value={money(sum.direct)} />
              <Stat label="Fixed costs" value={money(sum.fixed)} />
              <Stat label="Days logged" value={String(sum.days.length)} />
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
          </Card>

          {slotNames.length ? (
            <Card style={{ marginTop: 12 }}>
              <Text style={S.faint}>Occupancy by slot and weekday</Text>
              <View style={[S.row, { marginTop: 12, marginBottom: 4 }]}>
                <Text style={[S.faint, { flex: 1.5 }]} />
                {DB.WEEKDAYS.map((d) => (
                  <Text key={d} style={[S.faint, { flex: 1, textAlign: 'center', fontSize: 10 }]}>
                    {d[0]}
                  </Text>
                ))}
              </View>
              {slotNames.map((slot) => (
                <View key={slot} style={[S.row, { marginTop: 6 }]}>
                  <Text style={[S.faint, { flex: 1.5, fontSize: 11 }]} numberOfLines={1}>
                    {slot}
                  </Text>
                  {DB.WEEKDAYS.map((d, i) => {
                    const v = cell(slot, i);
                    return (
                      <View
                        key={d}
                        style={{
                          flex: 1,
                          marginHorizontal: 1,
                          paddingVertical: 6,
                          borderRadius: 4,
                          alignItems: 'center',
                          backgroundColor:
                            v == null
                              ? C.surfaceAlt
                              : v < 15
                              ? C.redDim
                              : v < 35
                              ? C.surfaceAlt
                              : C.amberDim,
                        }}>
                        <Text
                          style={{
                            fontSize: 10,
                            color: v == null ? C.faint : v < 15 ? C.red : v < 35 ? C.dim : C.amber,
                          }}>
                          {v == null ? '\u2013' : Math.round(v)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
              <Text style={[S.faint, { marginTop: 12, lineHeight: 17 }]}>
                Percent full. Red is under 15%, which rarely covers the cost of opening.
              </Text>
            </Card>
          ) : null}

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
            </Card>
          ) : null}

          {ages.length >= 2 ? (
            <Card style={{ marginTop: 12 }}>
              <Text style={S.faint}>How film age performs, across all your runs</Text>
              {ages.map((a) => (
                <View key={a.label} style={[S.between, { marginTop: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.body}>{a.label}</Text>
                    <Text style={[S.faint, { marginTop: 2 }]}>
                      {a.runs} runs {'\u00B7'} {pct(a.occupancy)} full
                    </Text>
                  </View>
                  <Text style={{ color: C.text, fontWeight: '600', fontSize: 15 }}>
                    {money(a.revPerDay)}
                    <Text style={S.faint}>/day</Text>
                  </Text>
                </View>
              ))}
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
