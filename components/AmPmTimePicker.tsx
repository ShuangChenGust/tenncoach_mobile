import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

// ─── Constants ────────────────────────────────────────────────────────────────
const ITEM_H  = 34;                 // height of each scroll row
const VISIBLE = 3;                  // items visible at once: prev / selected / next
const COL_H   = ITEM_H * VISIBLE;   // total column height = 102

const HOURS   = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = ['00', '15', '30', '45'];

// ─── Conversion helpers ───────────────────────────────────────────────────────
function to12h(time24: string): { h: number; m: number; period: 'AM' | 'PM' } {
  const parts = (time24 || '09:00').split(':');
  const h24 = Math.max(0, Math.min(23, parseInt(parts[0] ?? '0', 10) || 0));
  const rawM = parseInt(parts[1] ?? '0', 10) || 0;
  const m    = Math.round(rawM / 15) * 15 % 60;
  const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return { h, m, period };
}

function to24h(h: number, m: number, period: 'AM' | 'PM'): string {
  let h24 = h;
  if (period === 'AM' && h === 12) h24 = 0;
  else if (period === 'PM' && h !== 12) h24 = h + 12;
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDisplay(h: number, m: number, period: 'AM' | 'PM'): string {
  return `${h}:${String(m).padStart(2, '0')} ${period}`;
}

// ─── Scroll drum-roll column ──────────────────────────────────────────────────
function ScrollColumn({
  data,
  selectedIndex,
  onSelect,
  colWidth,
}: {
  data: string[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  colWidth: number;
}) {
  const scrollRef      = useRef<ScrollView>(null);
  const userScrolled   = useRef(false);
  const momentumActive = useRef(false);

  useEffect(() => {
    if (!userScrolled.current) {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }
    userScrolled.current = false;
  }, [selectedIndex]);

  const commitIndex = (y: number) => {
    const idx     = Math.round(y / ITEM_H);
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    userScrolled.current = true;
    onSelect(clamped);
  };

  return (
    <View style={[s.col, { width: colWidth }]}>
      <View style={[s.sep, { top: ITEM_H }]}     pointerEvents="none" />
      <View style={[s.sep, { top: ITEM_H * 2 }]} pointerEvents="none" />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        bounces={false}
        onScrollBeginDrag={() => { momentumActive.current = false; }}
        onMomentumScrollBegin={() => { momentumActive.current = true; }}
        onScrollEndDrag={(e) => {
          if (!momentumActive.current) commitIndex(e.nativeEvent.contentOffset.y);
        }}
        onMomentumScrollEnd={(e) => commitIndex(e.nativeEvent.contentOffset.y)}
      >
        <View style={{ height: ITEM_H }} />
        {data.map((item, index) => (
          <View key={item} style={s.item}>
            <Text style={[
              s.itemTxt,
              index === selectedIndex - 1 && s.adjTxt,
              index === selectedIndex     && s.selTxt,
              index === selectedIndex + 1 && s.adjTxt,
            ]}>
              {item}
            </Text>
          </View>
        ))}
        <View style={{ height: ITEM_H }} />
      </ScrollView>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  value: string;          // "HH:MM" 24-hour format
  onChange: (v: string) => void;
}

export default function AmPmTimePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const { h, m, period } = to12h(value);
  const hIdx = h - 1;
  const mStr = String(m).padStart(2, '0');
  const mIdx = MINUTES.indexOf(mStr) >= 0 ? MINUTES.indexOf(mStr) : 0;

  // ── Collapsed pill ────────────────────────────────────────────────────────
  if (!open) {
    return (
      <TouchableOpacity style={s.pill} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Text style={s.pillTime}>{formatDisplay(h, m, period)}</Text>
        <Text style={s.pillChevron}>✎</Text>
      </TouchableOpacity>
    );
  }

  // ── Expanded drum-roll picker ─────────────────────────────────────────────
  return (
    <View>
      <View style={s.row}>
        <ScrollColumn
          data={HOURS}
          selectedIndex={hIdx}
          colWidth={42}
          onSelect={(i) => onChange(to24h(i + 1, m, period))}
        />
        <Text style={s.colon}>:</Text>
        <ScrollColumn
          data={MINUTES}
          selectedIndex={mIdx}
          colWidth={42}
          onSelect={(i) => onChange(to24h(h, parseInt(MINUTES[i], 10), period))}
        />
        <View style={s.ampmCol}>
          {(['AM', 'PM'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[s.ampmBtn, period === p && (p === 'AM' ? s.amSel : s.pmSel)]}
              onPress={() => onChange(to24h(h, m, p))}
              activeOpacity={0.75}
            >
              <Text style={[s.ampmTxt, period === p && s.ampmTxtSel]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* Done button */}
        <TouchableOpacity style={s.doneBtn} onPress={() => setOpen(false)} activeOpacity={0.8}>
          <Text style={s.doneTxt}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Collapsed pill
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#f0f4f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillTime: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  pillChevron: { fontSize: 12, color: '#2e7d32' },

  // Expanded drum-roll
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  col: {
    height: COL_H,
    backgroundColor: '#f0f4f0',
    borderRadius: 10,
    overflow: 'hidden',
  },

  sep: {
    position: 'absolute',
    left: 6,
    right: 6,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2e7d32',
    zIndex: 1,
    opacity: 0.5,
  },

  item: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTxt: { fontSize: 13, color: '#c8ccc8', fontWeight: '500' },
  selTxt:  { fontSize: 16, color: '#1f2937', fontWeight: '700' },
  adjTxt:  { fontSize: 13, color: '#9ba89b', fontWeight: '500' },

  colon: { fontSize: 16, fontWeight: '700', color: '#999', marginBottom: 2 },

  ampmCol: {
    height: COL_H,
    borderRadius: 10,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  ampmBtn: {
    flex: 1,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f4f0',
  },
  amSel: { backgroundColor: '#e8f5e9' },
  pmSel: { backgroundColor: '#fff3e0' },
  ampmTxt:    { fontSize: 12, fontWeight: '700', color: '#bbb' },
  ampmTxtSel: { color: '#1f2937' },

  doneBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'center',
    marginLeft: 4,
  },
  doneTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
