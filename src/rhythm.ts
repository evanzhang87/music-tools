// 随机节奏生成 —— 纯逻辑（不做渲染/DOM）。支持自定义拍号，默认 4/4。
// 规则：
//   1) 一拍选一个【完整节奏型】，绝不跨拍 / 不跨小节分组中点。
//   2) 八分/十六分按拍分组连梁（只连相邻的可连梁音符）。
//   3) 休止符整拍/半拍配对；半拍休止永不与其它休止相邻。
//   4) 连续整拍休止合并成长休止，不跨分组中点。
//   5) 默认只含基本节奏型；「附点」「切分」独立开关开启才加入。

export interface DurationItem { dur: string; dots?: number }
export interface RhythmCell { weight: number; items: DurationItem[] }
export interface Measure { items: DurationItem[]; beamGroups: number[][] }

// 十六分音符单位的时值表
const SIXTEENTH: Record<string, number> = {
  q: 4, '8': 2, '16': 1, '32': 0.5,
  qr: 4, '8r': 2, '16r': 1, '32r': 0.5, hr: 8, wr: 16,
};

const REST_PROB = 0.16;
const STRONG_FIRST = ['q', '8'];
const SYNC_BIG_PROB = 0.3;

// ── 三套节奏型库：按「每拍十六分单位数」组织 ────────────────────────────
// 简单拍子(四分一拍 = 4 单位)
const NOTE_Q: RhythmCell[] = [
  { weight: 5, items: [{ dur: 'q' }] },
  { weight: 6, items: [{ dur: '8' }, { dur: '8' }] },
  { weight: 2, items: [{ dur: '16' }, { dur: '16' }, { dur: '16' }, { dur: '16' }] },
  { weight: 3, items: [{ dur: '8' }, { dur: '16' }, { dur: '16' }] },
  { weight: 3, items: [{ dur: '16' }, { dur: '16' }, { dur: '8' }] },
];
const DOT_Q: RhythmCell[] = [
  { weight: 3, items: [{ dur: '8', dots: 1 }, { dur: '16' }] },
  { weight: 3, items: [{ dur: '16' }, { dur: '8', dots: 1 }] },
];
const SYNC_Q: RhythmCell[] = [
  { weight: 2, items: [{ dur: '16' }, { dur: '8' }, { dur: '16' }] },
];
const REST_Q: RhythmCell[] = [
  { weight: 5, items: [{ dur: 'qr' }] },
  { weight: 2, items: [{ dur: '8r' }, { dur: '8' }] },
  { weight: 2, items: [{ dur: '8' }, { dur: '8r' }] },
];

// 复合拍子(附点四分一拍 = 3 个八分 = 6 单位)：6/8 9/8 12/8
const NOTE_C: RhythmCell[] = [
  { weight: 5, items: [{ dur: '8' }, { dur: '8' }, { dur: '8' }] },       // 三个八分
  { weight: 4, items: [{ dur: 'q' }, { dur: '8' }] },                     // 四分 + 八分
  { weight: 3, items: [{ dur: '8' }, { dur: 'q' }] },                     // 八分 + 四分
  { weight: 3, items: [{ dur: 'q', dots: 1 }] },                          // 附点四分(整拍)
  { weight: 2, items: [{ dur: '16' }, { dur: '16' }, { dur: '8' }, { dur: '8' }] },
  { weight: 2, items: [{ dur: '8' }, { dur: '8' }, { dur: '16' }, { dur: '16' }] },
];
const DOT_C: RhythmCell[] = [
  { weight: 3, items: [{ dur: '8', dots: 1 }, { dur: '16' }, { dur: '8' }] }, // 3+1+2
];
const REST_C: RhythmCell[] = [
  { weight: 5, items: [{ dur: 'qr', dots: 1 }] },                          // 附点四分休止(整拍)
  { weight: 2, items: [{ dur: '8r' }, { dur: '8' }, { dur: '8' }] },
  { weight: 2, items: [{ dur: '8' }, { dur: '8' }, { dur: '8r' }] },
];

// 简单八分拍子(八分一拍 = 2 单位)：3/8 之外的 2/8 等
const NOTE_E: RhythmCell[] = [
  { weight: 6, items: [{ dur: '8' }] },
  { weight: 4, items: [{ dur: '16' }, { dur: '16' }] },
];
const REST_E: RhythmCell[] = [
  { weight: 5, items: [{ dur: '8r' }] },
];

interface CellSet { note: RhythmCell[]; dot: RhythmCell[]; sync: RhythmCell[]; rest: RhythmCell[] }
const CELLS: Record<number, CellSet> = {
  4: { note: NOTE_Q, dot: DOT_Q, sync: SYNC_Q, rest: REST_Q },
  6: { note: NOTE_C, dot: DOT_C, sync: [], rest: REST_C },
  2: { note: NOTE_E, dot: [], sync: [], rest: REST_E },
};

// ── 拍号状态 ──────────────────────────────────────────────────────────
export let NUM = 4;
export let DEN = 4;
export function setMeter(num: number, den: number): void { NUM = num; DEN = den; }

interface MeterInfo { beats: number; beatUnits: number; compound: boolean; strong: number[] }

export function meterInfo(): MeterInfo {
  const num = NUM, den = DEN;
  if (den === 8 && num % 3 === 0) {
    // 复合拍子：附点四分音符一拍
    const beats = num / 3;
    return { beats, beatUnits: 6, compound: true, strong: [0] };
  }
  if (den === 8) {
    return { beats: num, beatUnits: 2, compound: false, strong: [0] };
  }
  // den=4（含默认）：四分音符一拍
  const beats = num;
  const strong = beats >= 4 && beats % 2 === 0 ? [0, beats / 2] : [0];
  return { beats, beatUnits: 4, compound: false, strong };
}

// ── 开关 ──────────────────────────────────────────────────────────────
export let REINFORCE_STRONG = false;
export let SYNC = false;
export let DOT = false;
export function setFlags(f: { reinforce?: boolean; sync?: boolean; dot?: boolean }): void {
  if (f.reinforce !== undefined) REINFORCE_STRONG = f.reinforce;
  if (f.sync !== undefined) SYNC = f.sync;
  if (f.dot !== undefined) DOT = f.dot;
}

export function weightedRandom<T extends RhythmCell>(cells: T[]): T {
  const total = cells.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of cells) { r -= c.weight; if (r <= 0) return c; }
  return cells[cells.length - 1];
}

export const isRestItem = (it: DurationItem): boolean => it.dur.endsWith('r');
const units = (it: DurationItem): number => (SIXTEENTH[it.dur] ?? 0) * (it.dots ? 1.5 : 1);

// 可连梁：非休止的八分/十六分（含附点）
const isBeamable = (it: DurationItem): boolean => !isRestItem(it) && /^(8|16)/.test(it.dur);

const isFullRestCell = (its: DurationItem[], beatUnits: number): boolean =>
  its.length === 1 && isRestItem(its[0]) && units(its[0]) === beatUnits;
const startsSubRest = (its: DurationItem[], beatUnits: number): boolean =>
  isRestItem(its[0]) && units(its[0]) < beatUnits;

const isStrongStart = (cell: RhythmCell): boolean => {
  const first = cell.items[0];
  if (isRestItem(first)) return false;
  return STRONG_FIRST.includes(first.dur.replace(/r$/, ''));
};

// 把「一段休止(单位数)」发声成若干标准休止符（保证时值精确相加，不用会截断的单休止符）
const REST_VALUES: Array<{ u: number; d: DurationItem }> = [
  { u: 16, d: { dur: 'wr' } },
  { u: 12, d: { dur: 'hr', dots: 1 } },
  { u: 8, d: { dur: 'hr' } },
  { u: 6, d: { dur: 'qr', dots: 1 } },
  { u: 4, d: { dur: 'qr' } },
  { u: 2, d: { dur: '8r' } },
  { u: 1, d: { dur: '16r' } },
];
function emitRest(unitsTotal: number, out: DurationItem[]): void {
  let r = unitsTotal;
  for (const v of REST_VALUES) { while (r >= v.u) { out.push({ ...v.d }); r -= v.u; } }
}

// 休止合并的分组边界(拍索引)：每组不超过 16 单位，且符合记谱习惯
function restGroups(beats: number, bu: number): number[] {
  const ends: number[] = [];
  if (bu === 4) {
    if (beats % 2 === 0) ends.push(beats / 2);          // 偶数拍：中点劈开（4/4→2, 6/4→3, 2/4→1）
    else if (beats === 5) ends.push(3);                 // 5/4 → 3+2
    else if (beats === 7) ends.push(4);                 // 7/4 → 4+3
    else if (beats > 7) for (let e = 4; e < beats; e += 4) ends.push(e);
  } else if (bu === 6) {
    for (let e = 2; e < beats; e += 2) ends.push(e);    // 复合拍：每 2 拍一组
  } else {
    for (let e = 8; e < beats; e += 8) ends.push(e);
  }
  ends.push(beats);
  return ends;
}

// 生成一拍
function generateBeat(prevSubRest: boolean, prevEndsRest: boolean, strong: boolean, mi: MeterInfo): DurationItem[] {
  const set = CELLS[mi.beatUnits];
  const pool: Array<RhythmCell & { kind: 'n' | 'r' }> = [];
  for (const c of set.note) {
    if (REINFORCE_STRONG && strong && !isStrongStart(c)) continue;
    pool.push({ ...c, kind: 'n' });
  }
  if (DOT) for (const c of set.dot) pool.push({ ...c, kind: 'n' });
  if (SYNC) for (const c of set.sync) {
    if (REINFORCE_STRONG && strong && !isStrongStart(c)) continue;
    pool.push({ ...c, kind: 'n' });
  }
  for (const c of set.rest) {
    if (REINFORCE_STRONG && strong) continue;
    if (startsSubRest(c.items, mi.beatUnits) && prevEndsRest) continue;
    if (isFullRestCell(c.items, mi.beatUnits) && prevSubRest) continue;
    pool.push({ ...c, kind: 'r' });
  }
  const restPool = pool.filter((c) => c.kind === 'r');
  const notePool = pool.filter((c) => c.kind === 'n');
  const chosen = restPool.length && Math.random() < REST_PROB ? weightedRandom(restPool) : weightedRandom(notePool);
  return chosen.items;
}

export function generateMeasure(): Measure {
  const mi = meterInfo();
  const beats = mi.beats;
  const bu = mi.beatUnits;
  const items: DurationItem[] = [];
  const beamGroups: number[][] = [];
  const slots: Array<DurationItem[] | { big: true } | null> = [];
  let prevSubRest = false;
  let prevEndsRest = false;

  // 大切分(2拍 ♪♩♪)仅在四分一拍的简单拍子、拍数>=2 时启用，每小节至多一次
  const bigEligible = bu === 4 && beats >= 2 && SYNC;
  let usedBig = false;
  for (let b = 0; b < beats; ) {
    const strong = mi.strong.includes(b);
    if (bigEligible && !usedBig && strong && b + 1 < beats && Math.random() < SYNC_BIG_PROB) {
      slots.push({ big: true });
      slots.push(null);
      usedBig = true;
      prevSubRest = false; prevEndsRest = false;
      b += 2;
    } else {
      const beatItems = generateBeat(prevSubRest, prevEndsRest, strong, mi);
      slots.push(beatItems);
      const last = beatItems[beatItems.length - 1];
      prevSubRest = isRestItem(last) && units(last) < bu;
      prevEndsRest = isRestItem(last);
      b += 1;
    }
  }

  // 休止合并：按 restGroups 的分组边界处理，保证每段可精确拆成标准休止符
  const groups = restGroups(beats, bu);

  let i = 0;
  while (i < beats) {
    const gEnd = groups.find((g) => g > i) ?? beats;
    const slot = slots[i];
    if (slot == null) { i++; continue; }
    if ('big' in slot) {
      items.push({ dur: '8' }, { dur: 'q' }, { dur: '8' }); // 大切分 ♪♩♪ (2 拍)
      i += 2;
      continue;
    }
    if (isFullRestCell(slot as DurationItem[], bu)) {
      let j = i;
      while (j < gEnd && slots[j] && !('big' in slots[j]!) && isFullRestCell(slots[j] as DurationItem[], bu)) j++;
      emitRest((j - i) * bu, items);
      i = j;
    } else {
      const beatItems = slot as DurationItem[];
      const startIdx = items.length;
      for (const it of beatItems) items.push(it);
      // 只把【相邻的可连梁音符】成组连梁（不把四分/附点四分卷进来）
      let run: number[] = [];
      const flush = () => { if (run.length >= 2) beamGroups.push(run); run = []; };
      for (let k = startIdx; k < items.length; k++) {
        if (isBeamable(items[k])) run.push(k);
        else flush();
      }
      flush();
      i++;
    }
  }

  return { items, beamGroups };
}
