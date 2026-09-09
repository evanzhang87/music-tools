// 随机节奏生成 —— 纯逻辑（不做渲染/DOM）。与线上 index.html 逻辑保持一致。
// 规则：
//   1) 一拍选一个【完整节奏型】，绝不跨拍 / 不跨小节中点。
//   2) 八分/十六分按拍分组连梁。
//   3) 休止符要么整拍(四分休止)，要么半拍休止与音符配对；半拍休止永不与其它休止相邻。
//   4) 连续整拍休止合并成二分/全小节休止，不跨 4/4 小节中点。
//   5) 默认只含基本节奏型；「附点」「切分」独立开关开启才加入对应节奏型。

export interface DurationItem {
  dur: string; // 'q' | '8' | '16' | 'qr' | '8r' | 'hr' | 'wr'，可带点(见 dots)
  dots?: number;
}

export interface RhythmCell {
  weight: number;
  items: DurationItem[];
}

export interface Measure {
  items: DurationItem[];
  beamGroups: number[][];
}

// 基本节奏型（默认，无附点、无切分）
const NOTE_CELLS: RhythmCell[] = [
  { weight: 5, items: [{ dur: 'q' }] },                                     // 四分
  { weight: 6, items: [{ dur: '8' }, { dur: '8' }] },                       // 两个八分
  { weight: 2, items: [{ dur: '16' }, { dur: '16' }, { dur: '16' }, { dur: '16' }] }, // 四个十六分
  { weight: 3, items: [{ dur: '8' }, { dur: '16' }, { dur: '16' }] },       // 后十六
  { weight: 3, items: [{ dur: '16' }, { dur: '16' }, { dur: '8' }] },       // 前十六
];

// 「附点」节奏型（独立开关）
const DOT_CELLS: RhythmCell[] = [
  { weight: 3, items: [{ dur: '8', dots: 1 }, { dur: '16' }] },             // 小附点
  { weight: 3, items: [{ dur: '16' }, { dur: '8', dots: 1 }] },             // 反附点
];

const REST_CELLS: RhythmCell[] = [
  { weight: 5, items: [{ dur: 'qr' }] },
  { weight: 2, items: [{ dur: '8r' }, { dur: '8' }] },
  { weight: 2, items: [{ dur: '8' }, { dur: '8r' }] },
];

const REST_PROB = 0.16;
const STRONG_FIRST = ['q', '8'];
const SYNC_BIG_PROB = 0.3; // 每小节出现大切分(2拍)的概率

// 「小切分」(1拍)：♬♪♬ = 十六分+八分+十六分
const SYNC_CELLS: RhythmCell[] = [
  { weight: 2, items: [{ dur: '16' }, { dur: '8' }, { dur: '16' }] },
];

// 开关状态（模块级，供 setFlags 修改）
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
  for (const c of cells) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return cells[cells.length - 1];
}

export const isRestItem = (it: DurationItem): boolean => it.dur.endsWith('r');

const isFullRestItems = (its: DurationItem[]): boolean =>
  its.length === 1 && its[0].dur === 'qr';

const isStrongStart = (cell: RhythmCell): boolean => {
  const first = cell.items[0];
  if (isRestItem(first)) return false;
  return STRONG_FIRST.includes(first.dur.replace(/r$/, ''));
};

function restOfLen(n: number): DurationItem {
  if (n >= 4) return { dur: 'wr' };
  if (n === 2) return { dur: 'hr' };
  return { dur: 'qr' };
}

function generateBeat(prevSubRest: boolean, prevEndsRest: boolean, strong: boolean): DurationItem[] {
  const pool: Array<RhythmCell & { kind: 'n' | 'r' }> = [];
  for (const c of NOTE_CELLS) {
    if (REINFORCE_STRONG && strong && !isStrongStart(c)) continue;
    pool.push({ ...c, kind: 'n' });
  }
  if (DOT) {
    for (const c of DOT_CELLS) pool.push({ ...c, kind: 'n' });
  }
  if (SYNC) {
    for (const c of SYNC_CELLS) {
      if (REINFORCE_STRONG && strong && !isStrongStart(c)) continue;
      pool.push({ ...c, kind: 'n' });
    }
  }
  for (const c of REST_CELLS) {
    if (REINFORCE_STRONG && strong) continue;
    const startsSubRest = c.items.length > 1 && isRestItem(c.items[0]) && c.items[0].dur !== 'qr';
    const isFull = c.items.length === 1 && c.items[0].dur === 'qr';
    if (startsSubRest && prevEndsRest) continue;
    if (isFull && prevSubRest) continue;
    pool.push({ ...c, kind: 'r' });
  }
  const restPool = pool.filter((c) => c.kind === 'r');
  const notePool = pool.filter((c) => c.kind === 'n');
  const chosen = restPool.length && Math.random() < REST_PROB
    ? weightedRandom(restPool)
    : weightedRandom(notePool);
  return chosen.items;
}

export function generateMeasure(): Measure {
  const items: DurationItem[] = [];
  const beamGroups: number[][] = [];
  const beats: Array<DurationItem[] | { big: true } | null> = [];
  let prevSubRest = false;
  let prevEndsRest = false;

  let usedBig = false;
  for (let b = 0; b < 4; ) {
    const strong = b === 0 || b === 2;
    if (SYNC && !usedBig && (b === 0 || b === 2) && b <= 2 && Math.random() < SYNC_BIG_PROB) {
      beats.push({ big: true });
      beats.push(null);
      usedBig = true;
      prevSubRest = false;
      prevEndsRest = false;
      b += 2;
    } else {
      const beatItems = generateBeat(prevSubRest, prevEndsRest, strong);
      beats.push(beatItems);
      const last = beatItems[beatItems.length - 1];
      prevSubRest = isRestItem(last) && last.dur !== 'qr';
      prevEndsRest = isRestItem(last);
      b += 1;
    }
  }

  let i = 0;
  while (i < 4) {
    const beatItems = beats[i];
    if (beatItems == null) { i++; continue; }
    if ('big' in beatItems) {
      items.push({ dur: '8' });
      items.push({ dur: 'q' });
      items.push({ dur: '8' });
      i += 2;
    } else if (isFullRestItems(beatItems as DurationItem[])) {
      let j = i;
      while (j < 4 && isFullRestItems(beats[j] as DurationItem[])) j++;
      let start = i;
      while (start < j) {
        if (start <= 1) {
          const end = Math.min(j - 1, 1);
          items.push(restOfLen(end - start + 1));
          start = end + 1;
        } else {
          items.push(restOfLen(j - start));
          start = j;
        }
      }
      i = j;
    } else {
      const startIdx = items.length;
      for (const it of beatItems as DurationItem[]) items.push(it);
      const noteIdxs: number[] = [];
      for (let k = startIdx; k < items.length; k++) {
        if (!isRestItem(items[k])) noteIdxs.push(k);
      }
      if (noteIdxs.length >= 2) beamGroups.push(noteIdxs);
      i++;
    }
  }

  return { items, beamGroups };
}
