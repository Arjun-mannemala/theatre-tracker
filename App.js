import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
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


/**
 * Without this, any unhandled error closes the app with no explanation.
 * Showing the message on screen makes a crash reportable instead of silent.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null, info: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    this.setState({ info });
  }
  render() {
    if (!this.state.err) return this.props.children;
    const msg = String(this.state.err && (this.state.err.message || this.state.err));
    const stack = String((this.state.info && this.state.info.componentStack) || '').trim();
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: C.bg }}
        contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
        <Text style={S.h2}>Something broke</Text>
        <Text style={[S.dim, { marginTop: 8, lineHeight: 20 }]}>
          Screenshot this and send it over. Your saved data is untouched.
        </Text>
        <Text
          selectable
          style={{ color: C.red, marginTop: 18, fontSize: 13, lineHeight: 19 }}>
          {msg}
        </Text>
        {stack ? (
          <Text selectable style={{ color: C.faint, marginTop: 14, fontSize: 11, lineHeight: 16 }}>
            {stack.split('\n').slice(0, 12).join('\n')}
          </Text>
        ) : null}
        <Pressable
          onPress={() => this.setState({ err: null, info: null })}
          style={{
            marginTop: 24,
            backgroundColor: C.amber,
            borderRadius: 10,
            paddingVertical: 13,
            alignItems: 'center',
          }}>
          <Text style={{ color: '#241B07', fontWeight: '600' }}>Try again</Text>
        </Pressable>
      </ScrollView>
    );
  }
}

function Shell() {
  // Android draws edge to edge, so the navigation bar would otherwise sit on
  // top of the tab row and eat the taps meant for it.
  const insets = useSafeAreaInsets();
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
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <StatusBar style="light" />
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
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 10),
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
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <Shell />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
