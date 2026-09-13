import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Modal, Pressable, Image, ActivityIndicator } from 'react-native';
import * as DB from '../db';
import * as A from '../analytics';
import * as TMDB from '../tmdb';
import { C, S, Card, Btn, Field, Divider, Empty, money, pct } from '../theme';
import { Curve } from '../charts';

function ChangeFilm({ visible, onClose, onDone }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [cost, setCost] = useState('');
  const [picked, setPicked] = useState(null);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    if (visible) {
      setQ('');
      setResults([]);
      setPicked(null);
      setCost('');
      TMDB.getKey().then((k) => setHasKey(!!k));
    }
  }, [visible]);

  useEffect(() => {
    if (!hasKey || q.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    setBusy(true);
    const t = setTimeout(async () => {
      const r = await TMDB.search(q);
      if (alive) {
        setResults(r);
        setBusy(false);
      }
    }, 450);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, hasKey]);

  async function start(film) {
    const startedOn = DB.today();
    const runId = await DB.startRun(film, startedOn, Number(cost) || 0);
    if (film.tmdb_id) {
      TMDB.details(film.tmdb_id).then(async (d) => {
        if (!d) return;
        const db = DB.raw();
        await db.runAsync(
          'UPDATE films SET genres=?, lead=?, release_date=IFNULL(?,release_date) WHERE tmdb_id=?',
          [d.genres, d.lead, d.release_date, film.tmdb_id]
        );
      });
    }
    onDone();
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
            maxHeight: '88%',
            borderTopWidth: 1,
            borderColor: C.line,
          }}>
          <View style={S.between}>
            <Text style={S.h2}>Change film</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: C.dim, fontSize: 22 }}>{'\u00D7'}</Text>
            </Pressable>
          </View>

          <Field
            value={q}
            onChangeText={setQ}
            placeholder="Film name"
            style={{ marginTop: 14 }}
          />
          <Text style={[S.faint, { marginTop: 6 }]}>
            {hasKey
              ? 'Search fills in the poster and release year. Or just type the name and start.'
              : 'Add a TMDB key in Settings to search. Typing the name works fine without it.'}
          </Text>

          <ScrollView style={{ marginTop: 12 }} keyboardShouldPersistTaps="handled">
            {busy ? <ActivityIndicator color={C.amber} style={{ marginVertical: 12 }} /> : null}

            {results.map((r) => (
              <Pressable key={r.tmdb_id} onPress={() => setPicked(r)}>
                <Card
                  style={{
                    marginBottom: 8,
                    borderColor: picked && picked.tmdb_id === r.tmdb_id ? C.amber : C.line,
                  }}>
                  <View style={S.row}>
                    {r.poster ? (
                      <Image
                        source={{ uri: r.poster }}
                        style={{ width: 42, height: 62, borderRadius: 5, marginRight: 12 }}
                      />
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Text style={S.body}>{r.title}</Text>
                      <Text style={[S.faint, { marginTop: 3 }]}>
                        {r.release_date ? r.release_date.slice(0, 4) : 'Year unknown'}
                      </Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}

            {q.trim().length >= 2 && !busy ? (
              <Pressable onPress={() => setPicked({ title: q.trim() })}>
                <Card
                  style={{
                    marginBottom: 8,
                    borderColor: picked && !picked.tmdb_id ? C.amber : C.line,
                  }}>
                  <Text style={S.body}>Use "{q.trim()}"</Text>
                  <Text style={[S.faint, { marginTop: 3 }]}>No lookup, just the name</Text>
                </Card>
              </Pressable>
            ) : null}
          </ScrollView>

          {picked ? (
            <View>
              <Divider />
              <Text style={S.faint}>Booking cost for this run (optional)</Text>
              <Field
                value={cost}
                onChangeText={(v) => setCost(v.replace(/[^0-9.]/g, ''))}
                placeholder="0"
                numeric
                style={{ marginTop: 6 }}
              />
              <Btn
                label={`Start run: ${picked.title}`}
                onPress={() => start(picked)}
                style={{ marginTop: 12 }}
              />
            </View>
          ) : null}
          <View style={{ height: 14 }} />
        </View>
      </View>
    </Modal>
  );
}

export default function Film({ refreshKey, bump }) {
  const [run, setRun] = useState(null);
  const [curve, setCurve] = useState([]);
  const [prior, setPrior] = useState([]);
  const [board, setBoard] = useState([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await DB.activeRun();
    setRun(r);
    if (r) {
      setCurve(await DB.runDayCurve(r.id));
      setPrior(await DB.priorRuns(r.film_id, r.id));
    } else {
      setCurve([]);
      setPrior([]);
    }
    setBoard(await A.filmLeaderboard());
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const ret = A.retention(curve);
  const runRevenue = curve.reduce((a, d) => a + (d.revenue || 0), 0);
  const runTickets = curve.reduce((a, d) => a + (d.tickets || 0), 0);
  const runCap = curve.reduce((a, d) => a + (d.capacity || 0), 0);
  const age = run ? A.filmAgeDays(run.release_date, run.started_on) : null;
  const bucket = A.ageBucket(age);

  return (
    <ScrollView style={S.screen} contentContainerStyle={[S.pad, { paddingBottom: 40 }]}>
      <Text style={S.h1}>Film</Text>

      <Card style={{ marginTop: 14 }}>
        <View style={S.row}>
          {run && run.poster ? (
            <Image
              source={{ uri: run.poster }}
              style={{ width: 56, height: 82, borderRadius: 6, marginRight: 14 }}
            />
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={S.faint}>Now showing</Text>
            <Text style={[S.h2, { marginTop: 3 }]}>{run ? run.title : 'No film set'}</Text>
            {run ? (
              <Text style={[S.dim, { marginTop: 3 }]}>
                Day {DB.daysBetween(run.started_on, DB.today()) + 1}
                {run.release_date ? ` \u00B7 ${run.release_date.slice(0, 4)}` : ''}
                {bucket ? ` \u00B7 ${bucket.label} old` : ''}
              </Text>
            ) : null}
          </View>
        </View>
        <Btn
          label={run ? 'Change film' : 'Set film'}
          kind={run ? 'ghost' : 'solid'}
          onPress={() => setOpen(true)}
          style={{ marginTop: 14 }}
        />
      </Card>

      {prior.length ? (
        <Card style={{ marginTop: 12, borderColor: C.amberDim }}>
          <Text style={S.faint}>You have run this film before</Text>
          {prior.map((p) => (
            <View key={p.id} style={[S.between, { marginTop: 8 }]}>
              <Text style={S.body}>
                {new Date(p.started_on + 'T00:00:00').toLocaleDateString('en-IN', {
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
              <Text style={S.dim}>
                {p.days}d {'\u00B7'} {pct(A.occ(p.tickets, p.capacity))} {'\u00B7'} {money(p.revenue)}
              </Text>
            </View>
          ))}
          <Text style={[S.faint, { marginTop: 10, lineHeight: 17 }]}>
            {DB.daysBetween(prior[0].started_on, DB.today())} days since the last run.
          </Text>
        </Card>
      ) : null}

      {curve.length >= 2 ? (
        <Card style={{ marginTop: 12 }}>
          <Text style={S.faint}>Revenue across this run</Text>
          <View style={{ marginTop: 10 }}>
            <Curve
              points={curve.map((d) => d.revenue || 0)}
              labels={curve.map((d) => d.date.slice(5))}
            />
          </View>
          <Divider />
          <View style={S.row}>
            <View style={{ flex: 1 }}>
              <Text style={S.faint}>Run revenue</Text>
              <Text style={[S.body, { marginTop: 2 }]}>{money(runRevenue)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.faint}>Occupancy</Text>
              <Text style={[S.body, { marginTop: 2 }]}>{pct(A.occ(runTickets, runCap))}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.faint}>Holding</Text>
              <Text style={[S.body, { marginTop: 2 }]}>{ret == null ? '\u2014' : pct(ret)}</Text>
            </View>
          </View>
        </Card>
      ) : null}

      <Text style={[S.h2, { marginTop: 24, marginBottom: 10 }]}>All runs</Text>

      {board.length === 0 ? (
        <Empty text={'Runs appear here once you log shows.\nComparisons get useful after about ten films.'} />
      ) : (
        board.map((r) => (
          <Card key={r.id} style={{ marginBottom: 8 }}>
            <View style={S.between}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={S.body} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={[S.faint, { marginTop: 3 }]}>
                  {r.started_on.slice(0, 7)} {'\u00B7'} {r.days || 0} days {'\u00B7'} {pct(r.occupancy)}
                  {r.bucket ? ` \u00B7 ${r.bucket.label}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>
                  {money(r.revenue)}
                </Text>
                {r.index != null ? (
                  <Text
                    style={{
                      fontSize: 12,
                      marginTop: 3,
                      color: r.index >= 1 ? C.green : C.dim,
                    }}>
                    {r.index.toFixed(2)}
                    {'\u00D7'} baseline
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>
        ))
      )}

      <ChangeFilm
        visible={open}
        onClose={() => setOpen(false)}
        onDone={() => {
          load();
          bump();
        }}
      />
    </ScrollView>
  );
}
