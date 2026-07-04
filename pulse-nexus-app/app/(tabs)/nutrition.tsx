import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addWaterEntry,
  deleteEntry,
  getDayTotals,
  getEntriesForDay,
  loadTargets,
  type DayTotals,
  type NutritionEntry,
  type NutritionTargets,
  DEFAULT_TARGETS,
} from '@/lib/nutrition';
import { mirrorWaterToHealth } from '@/lib/nutrition-health';

const c = {
  bg: '#070b14',
  bgElevated: '#0f1522',
  bgCard: '#141b2a',
  border: '#1f2a3d',
  text: '#f2f5fa',
  textMuted: '#8fa3bd',
  textDim: '#5f7590',
  accent: '#4ac6ff',
  protein: '#ff6b6b',
  carbs: '#ffb454',
  fat: '#8b6cf6',
  water: '#4ac6ff',
  danger: '#ff6b6b',
};

const WATER_QUICK_ADDS = [250, 500];

export default function NutritionScreen() {
  const router = useRouter();
  const [totals, setTotals] = useState<DayTotals | null>(null);
  const [entries, setEntries] = useState<NutritionEntry[]>([]);
  const [targets, setTargets] = useState<NutritionTargets>(DEFAULT_TARGETS);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [t, e, tg] = await Promise.all([
      getDayTotals(),
      getEntriesForDay(),
      loadTargets(),
    ]);
    setTotals(t);
    setEntries(e);
    setTargets(tg);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const addWater = useCallback(
    async (ml: number) => {
      await addWaterEntry(ml);
      mirrorWaterToHealth(ml).catch(() => {});
      await load();
    },
    [load],
  );

  const removeEntry = useCallback(
    async (id: number) => {
      await deleteEntry(id);
      await load();
    },
    [load],
  );

  const kcal = totals?.calories ?? 0;
  const kcalLeft = Math.max(0, targets.calories - kcal);
  const kcalPct = targets.calories > 0 ? Math.min(1, kcal / targets.calories) : 0;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Nutrition</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
          <Pressable style={styles.logBtn} onPress={() => router.push('/log-food' as never)}>
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.calorieCard}>
          <View style={styles.calorieTop}>
            <View>
              <Text style={styles.calorieValue}>{Math.round(kcal).toLocaleString()}</Text>
              <Text style={styles.calorieLabel}>of {targets.calories.toLocaleString()} kcal</Text>
            </View>
            <View style={styles.calorieRight}>
              <Text style={styles.calorieLeft}>{Math.round(kcalLeft).toLocaleString()}</Text>
              <Text style={styles.calorieLeftLabel}>left</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${kcalPct * 100}%`, backgroundColor: c.accent }]} />
          </View>
        </View>

        <View style={styles.macroRow}>
          <MacroBar label="Protein" value={totals?.proteinG ?? 0} target={targets.proteinG} unit="g" color={c.protein} />
          <MacroBar label="Carbs" value={totals?.carbsG ?? 0} target={targets.carbsG} unit="g" color={c.carbs} />
          <MacroBar label="Fat" value={totals?.fatG ?? 0} target={targets.fatG} unit="g" color={c.fat} />
        </View>

        <View style={styles.waterCard}>
          <View style={styles.waterHead}>
            <View style={styles.waterTitleRow}>
              <Ionicons name="water" size={18} color={c.water} />
              <Text style={styles.waterTitle}>Water</Text>
            </View>
            <Text style={styles.waterValue}>
              {Math.round(totals?.waterMl ?? 0)} / {targets.waterMl} ml
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(1, (totals?.waterMl ?? 0) / (targets.waterMl || 1)) * 100}%`,
                  backgroundColor: c.water,
                },
              ]}
            />
          </View>
          <View style={styles.waterButtons}>
            {WATER_QUICK_ADDS.map((ml) => (
              <Pressable key={ml} style={styles.waterBtn} onPress={() => addWater(ml)}>
                <Ionicons name="add" size={14} color={c.water} />
                <Text style={styles.waterBtnText}>{ml} ml</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {totals?.caffeineMg ? (
          <Text style={styles.caffeine}>Caffeine today: {Math.round(totals.caffeineMg)} mg</Text>
        ) : null}

        <Text style={styles.section}>Today&apos;s log</Text>
        {entries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="restaurant-outline" size={22} color={c.textMuted} />
            <Text style={styles.emptyText}>Nothing logged yet. Tap + to add a meal or drink.</Text>
          </View>
        ) : (
          entries.map((e) => (
            <View key={e.id} style={styles.entryRow}>
              <View style={styles.entryIcon}>
                <Ionicons
                  name={e.kind === 'water' ? 'water' : 'restaurant'}
                  size={16}
                  color={e.kind === 'water' ? c.water : c.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryName}>{e.name}</Text>
                <Text style={styles.entryMeta}>
                  {e.kind === 'water'
                    ? `${Math.round(e.waterMl)} ml`
                    : `${Math.round(e.calories)} kcal · P ${Math.round(e.proteinG)} · C ${Math.round(
                        e.carbsG,
                      )} · F ${Math.round(e.fatG)}`}
                  {'  ·  '}
                  {new Date(e.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <Pressable hitSlop={8} onPress={() => removeEntry(e.id)}>
                <Ionicons name="trash-outline" size={18} color={c.textDim} />
              </Pressable>
            </View>
          ))
        )}

        <Text style={styles.note}>
          Everything is stored on your device. When Apple Health is available, entries are also
          written there so the Health app and other apps you trust can see them.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function MacroBar({
  label,
  value,
  target,
  unit,
  color,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  color: string;
}) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValue}>{Math.round(value)}</Text>
      <Text style={styles.macroTarget}>
        / {target}
        {unit}
      </Text>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 14, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, paddingHorizontal: 2 },
  title: { color: c.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  date: { color: c.textMuted, fontSize: 13, marginTop: 2 },
  logBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  calorieCard: {
    backgroundColor: c.bgElevated,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: c.border,
  },
  calorieTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  calorieValue: { color: c.text, fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  calorieLabel: { color: c.textMuted, fontSize: 13, marginTop: 2 },
  calorieRight: { alignItems: 'flex-end' },
  calorieLeft: { color: c.accent, fontSize: 24, fontWeight: '800' },
  calorieLeftLabel: { color: c.textMuted, fontSize: 12 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: c.border,
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },

  macroRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  macro: {
    flex: 1,
    backgroundColor: c.bgCard,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  macroValue: { color: c.text, fontSize: 20, fontWeight: '800' },
  macroTarget: { color: c.textDim, fontSize: 11, marginTop: -2 },
  macroTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: c.border,
    marginTop: 10,
    overflow: 'hidden',
  },
  macroFill: { height: '100%', borderRadius: 3 },
  macroLabel: {
    color: c.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
    marginTop: 8,
  },

  waterCard: {
    backgroundColor: c.bgCard,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  waterHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  waterTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waterTitle: { color: c.text, fontSize: 15, fontWeight: '700', marginLeft: 8 },
  waterValue: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
  waterButtons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  waterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${c.water}1a`,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  waterBtnText: { color: c.water, fontSize: 13, fontWeight: '700', marginLeft: 4 },

  caffeine: { color: c.textMuted, fontSize: 12, marginTop: 12, marginLeft: 2 },

  section: {
    color: c.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 2,
  },
  emptyCard: {
    backgroundColor: c.bgCard,
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
    gap: 8,
  },
  emptyText: { color: c.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8 },

  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bgCard,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  entryIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: c.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  entryName: { color: c.text, fontSize: 15, fontWeight: '700' },
  entryMeta: { color: c.textMuted, fontSize: 12, marginTop: 2 },

  note: { color: c.textDim, fontSize: 12, lineHeight: 18, marginTop: 18, textAlign: 'center' },
});
