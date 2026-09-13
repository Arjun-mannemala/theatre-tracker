import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';

export const C = {
  bg: '#151210',
  surface: '#211C18',
  surfaceAlt: '#2C2521',
  line: '#3A322C',
  text: '#F2EAE0',
  dim: '#9E9187',
  faint: '#6B5F56',
  amber: '#E9B33B',
  amberDim: '#4A3A17',
  red: '#B2423C',
  redDim: '#3E1F1D',
  green: '#5E9E6E',
};

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16 },
  h1: { color: C.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  h2: { color: C.text, fontSize: 19, fontWeight: '600' },
  body: { color: C.text, fontSize: 15 },
  dim: { color: C.dim, fontSize: 13 },
  faint: { color: C.faint, fontSize: 12 },
  big: { color: C.text, fontSize: 32, fontWeight: '700', letterSpacing: -1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});

export function Card({ children, style, tone }) {
  return (
    <View
      style={[
        {
          backgroundColor: C.surface,
          borderRadius: 14,
          padding: 14,
          borderWidth: 1,
          borderColor: tone === 'alert' ? C.redDim : C.line,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Btn({ label, onPress, kind = 'solid', small, style, disabled }) {
  const solid = kind === 'solid';
  const danger = kind === 'danger';
  return (
    <Pressable
      onPress={disabled ? null : onPress}
      style={({ pressed }) => [
        {
          backgroundColor: disabled
            ? C.surfaceAlt
            : solid
            ? C.amber
            : danger
            ? C.redDim
            : 'transparent',
          borderWidth: solid ? 0 : 1,
          borderColor: danger ? C.red : C.line,
          borderRadius: 10,
          paddingVertical: small ? 8 : 13,
          paddingHorizontal: small ? 12 : 16,
          alignItems: 'center',
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}>
      <Text
        style={{
          color: disabled ? C.faint : solid ? '#241B07' : danger ? C.red : C.text,
          fontWeight: '600',
          fontSize: small ? 13 : 15,
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Pill({ label, active, onPress, tone }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 13,
        borderRadius: 999,
        marginRight: 8,
        marginBottom: 8,
        backgroundColor: active ? (tone === 'red' ? C.redDim : C.amberDim) : C.surfaceAlt,
        borderWidth: 1,
        borderColor: active ? (tone === 'red' ? C.red : C.amber) : C.line,
      }}>
      <Text
        style={{
          color: active ? (tone === 'red' ? C.red : C.amber) : C.dim,
          fontSize: 13,
          fontWeight: active ? '600' : '400',
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({ value, onChangeText, placeholder, numeric, style }) {
  return (
    <TextInput
      value={value == null ? '' : String(value)}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={C.faint}
      keyboardType={numeric ? 'number-pad' : 'default'}
      style={[
        {
          backgroundColor: C.surfaceAlt,
          borderWidth: 1,
          borderColor: C.line,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 11,
          color: C.text,
          fontSize: 16,
        },
        style,
      ]}
    />
  );
}

export function Stat({ label, value, sub, tone }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={S.faint}>{label}</Text>
      <Text
        style={[
          S.big,
          { fontSize: 24, marginTop: 2, color: tone === 'red' ? C.red : tone === 'green' ? C.green : C.text },
        ]}>
        {value}
      </Text>
      {sub ? <Text style={[S.faint, { marginTop: 1 }]}>{sub}</Text> : null}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: C.line, marginVertical: 12 }} />;
}

export function Empty({ text }) {
  return (
    <View style={{ paddingVertical: 28, alignItems: 'center' }}>
      <Text style={[S.dim, { textAlign: 'center', lineHeight: 20 }]}>{text}</Text>
    </View>
  );
}

export const money = (n) => '\u20B9' + Math.round(n || 0).toLocaleString('en-IN');
export const pct = (n) => (n == null ? '\u2014' : Math.round(n) + '%');
