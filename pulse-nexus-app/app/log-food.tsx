import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addFoodEntry, caloriesFromMacros, type NewFoodEntry } from '@/lib/nutrition';
import { mirrorFoodToHealth } from '@/lib/nutrition-health';

const c = {
  bg: '#070b14',
  bgElevated: '#0f1522',
  bgCard: '#141b2a',
  border: '#1f2a3d',
  borderStrong: '#2a3752',
  text: '#f2f5fa',
  textMuted: '#8fa3bd',
  textDim: '#5f7590',
  accent: '#4ac6ff',
  danger: '#ff6b6b',
};

type FieldKey = 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'caffeineMg';

const FIELDS: { key: FieldKey; label: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'carbsG', label: 'Carbs', unit: 'g' },
  { key: 'fatG', label: 'Fat', unit: 'g' },
  { key: 'caffeineMg', label: 'Caffeine', unit: 'mg' },
];

export default function LogFoodScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<FieldKey, string>>({
    calories: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    caffeineMg: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (k: FieldKey): number => {
    const v = Number(values[k]);
    return Number.isFinite(v) ? v : 0;
  };

  const suggestedKcal = useMemo(
    () => caloriesFromMacros(num('proteinG'), num('carbsG'), num('fatG')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.proteinG, values.carbsG, values.fatG],
  );

  const setField = (k: FieldKey, v: string) => {
    // keep digits and a single decimal point
    const cleaned = v.replace(/[^0-9.]/g, '');
    setValues((prev) => ({ ...prev, [k]: cleaned }));
  };

  const canSave = name.trim().length > 0 && (num('calories') > 0 || suggestedKcal > 0);

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const entry: NewFoodEntry = {
        name: name.trim(),
        calories: num('calories') > 0 ? num('calories') : suggestedKcal,
        proteinG: num('proteinG'),
        carbsG: num('carbsG'),
        fatG: num('fatG'),
        caffeineMg: num('caffeineMg'),
      };
      await addFoodEntry(entry);
      mirrorFoodToHealth(entry).catch(() => {});
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>What did you eat?</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Grilled chicken bowl"
            placeholderTextColor={c.textDim}
            style={styles.nameInput}
            autoFocus
            returnKeyType="next"
          />

          <View style={styles.grid}>
            {FIELDS.map((f) => (
              <View key={f.key} style={styles.field}>
                <Text style={styles.fieldLabel}>
                  {f.label} <Text style={styles.fieldUnit}>{f.unit}</Text>
                </Text>
                <TextInput
                  value={values[f.key]}
                  onChangeText={(v) => setField(f.key, v)}
                  placeholder={f.key === 'calories' && suggestedKcal > 0 ? String(suggestedKcal) : '0'}
                  placeholderTextColor={c.textDim}
                  keyboardType="decimal-pad"
                  style={styles.fieldInput}
                />
              </View>
            ))}
          </View>

          {suggestedKcal > 0 && num('calories') === 0 ? (
            <Pressable
              style={styles.suggestion}
              onPress={() => setField('calories', String(suggestedKcal))}
            >
              <Ionicons name="sparkles" size={14} color={c.accent} />
              <Text style={styles.suggestionText}>
                Use {suggestedKcal} kcal from macros (4·4·9)
              </Text>
            </Pressable>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={save}
            disabled={!canSave || saving}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Add to today'}</Text>
          </Pressable>

          <Pressable style={styles.cancel} onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 18 },
  label: {
    color: c.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: c.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
    fontSize: 17,
    padding: 14,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, marginHorizontal: -5 },
  field: { width: '50%', paddingHorizontal: 5, marginBottom: 10 },
  fieldLabel: { color: c.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  fieldUnit: { color: c.textDim, fontSize: 11 },
  fieldInput: {
    backgroundColor: c.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
    fontSize: 18,
    fontWeight: '700',
    padding: 12,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: `${c.accent}1a`,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  suggestionText: { color: c.accent, fontSize: 13, fontWeight: '600', marginLeft: 6 },
  error: { color: c.danger, fontSize: 13, marginTop: 14 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: c.accent,
    borderRadius: 14,
    padding: 15,
    marginTop: 24,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: 8 },
  cancel: { padding: 14, alignItems: 'center', marginTop: 6 },
  cancelText: { color: c.textMuted, fontSize: 15, fontWeight: '600' },
});
