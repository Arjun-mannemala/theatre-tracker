import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  SafeAreaView,
  Platform,
  StatusBar as RNStatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as DB from './src/db';
import { C, S } from './src/theme';
import Today from './src/screens/Today';
import Film from './src/screens/Film';
import Expenses from './src/screens/Expenses';
import Insights from './src/screens/Insights';
import Settings from './src/screens/Settings';

const TABS = [
  { key: 'today', label: 'Today', Screen: Today },
  { key: 'film', label: 'Film', Screen: Film },
  { key: 'expenses', label: 'Expenses', Screen: Expenses },
  { key: 'insights', label: 'Insights', Screen: Insights },
  { key: 'settings', label: 'Settings', Screen: Settings },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('today');
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    DB.open()
      .then(() => setReady(true))
      .catch((e) => setError(String(e.message || e)));
  }, []);

  if (error) {
    return (
      <View style={[S.screen, { justifyContent: 'center', padding: 28 }]}>
        <Text style={S.h2}>The database did not open</Text>
        <Text style={[S.dim, { marginTop: 8, lineHeight: 20 }]}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={[S.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.amber} />
      </View>
    );
  }

  const Active = TABS.find((t) => t.key === tab).Screen;

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: C.bg,
        paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
      }}>
      <StatusBar style="light" backgroundColor={C.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1 }}>
          <Active refreshKey={refreshKey} bump={bump} />
        </View>

        <View
          style={{
            flexDirection: 'row',
            borderTopWidth: 1,
            borderTopColor: C.line,
            backgroundColor: C.surface,
            paddingBottom: 6,
            paddingTop: 8,
          }}>
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
                <View
                  style={{
                    width: 18,
                    height: 2,
                    borderRadius: 2,
                    backgroundColor: on ? C.amber : 'transparent',
                    marginBottom: 6,
                  }}
                />
                <Text
                  style={{
                    color: on ? C.text : C.faint,
                    fontSize: 11.5,
                    fontWeight: on ? '600' : '400',
                  }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
