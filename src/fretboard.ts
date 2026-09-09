// 指板音记忆模块 —— 把「音名 ↔ 指板位置」双向练熟。
// 标准调弦 E A D G B E，品 0..fretMax；音高固定为十二平均律，含 #/b（同名异调按音高类等值）。

const PC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// 每根弦的空弦 MIDI(低→高)：E2 A2 D3 G3 B3 E4
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
// 每根弦空弦音高类：E A D G B E
const OPEN_PC = [4, 9, 2, 7, 11, 4];

const FRET_MARKERS = [3, 5, 7, 9, 12];

// 布局
const CW = 52;
const SH = 34;
const PAD = 14;
const DOT_R = 11;

interface FbState {
  mode: 'pos2name' | 'name2pos';
  fretMax: number;
  audio: boolean;
  useFlat: boolean;
  correct: number;
  wrong: number;
  streak: number;
  weakness: number[]; // 每音高类 错题次数
  target: { s: number; f: number } | null; // 位置→音名 的目标位置
  targetPc: number | null;                 // 音名→位置 的目标音高类
  found: Set<string>;                      // 已找到的位置 `${s}-${f}`
  totalForTarget: number;                  // 该音在范围内出现的总位置数
}

function pcAt(s: number, f: number): number {
  return (OPEN_PC[s] + f) % 12;
}

function midiAt(s: number, f: number): number {
  return OPEN_MIDI[s] + f;
}

function key(s: number, f: number): string {
  return `${s}-${f}`;
}

function countPc(pc: number, fretMax: number): number {
  let n = 0;
  for (let s = 0; s < 6; s++) for (let f = 0; f <= fretMax; f++) if (pcAt(s, f) === pc) n++;
  return n;
}

// 从范围内随机取一个位置/音高类
function randPos(fretMax: number): { s: number; f: number } {
  return { s: Math.floor(Math.random() * 6), f: Math.floor(Math.random() * (fretMax + 1)) };
}
function randPc(): number {
  return Math.floor(Math.random() * 12);
}

// Web Audio 试听
let ac: AudioContext | null = null;
function playNote(midi: number): void {
  try {
    if (!ac) ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ac.createOscillator();
    const g = ac.createGain();
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.95);
  } catch (e) { /* 忽略音频失败 */ }
}

function nameOf(pc: number, flat: boolean): string {
  return (flat ? PC_FLAT : PC_SHARP)[pc];
}

export function initFretboard(root: HTMLElement): void {
  let st: FbState = {
    mode: 'pos2name',
    fretMax: 12,
    audio: true,
    useFlat: false,
    correct: 0,
    wrong: 0,
    streak: 0,
    weakness: new Array(12).fill(0),
    target: null,
    targetPc: null,
    found: new Set(),
    totalForTarget: 0,
  };

  function render(): void {
    const flat = st.useFlat;
    let boardHtml = '';
    // SVG 指板
    const w = PAD * 2 + CW * (st.fretMax + 1);
    const h = PAD * 2 + SH * 5;
    let d = '';
    // 品线
    for (let f = 0; f <= st.fretMax; f++) {
      const x = PAD + f * CW;
      d += `<line x1="${x}" y1="${PAD}" x2="${x}" y2="${PAD + SH * 5}" stroke="#666" stroke-width="${f === 0 ? 6 : 1}"/>`;
    }
    // 弦线
    for (let s = 0; s < 6; s++) {
      const y = PAD + s * SH;
      d += `<line x1="${PAD}" y1="${y}" x2="${PAD + CW * (st.fretMax + 1)}" y2="${y}" stroke="${s < 3 ? '#943d3d' : '#333'}" stroke-width="${s === 5 ? 2.4 : 1}"/>`;
    }
    // 品位标记
    if (st.fretMax >= 5) {
      for (const m of FRET_MARKERS) if (m <= st.fretMax) {
        const x = PAD + m * CW + CW / 2;
        const y = PAD + 2.5 * SH;
        d += `<circle cx="${x}" cy="${y}" r="4" fill="#bbb"/>`;
      }
    }
    // 音名→位置：画出已找到的位置
    if (st.mode === 'name2pos') {
      for (const k of st.found) {
        const [s, f] = k.split('-').map(Number);
        const cx = PAD + f * CW + CW / 2;
        const cy = PAD + s * SH;
        d += `<circle cx="${cx}" cy="${cy}" r="${DOT_R}" fill="#2e8b57"/>`;
      }
    }
    // 位置→音名：画目标位置高亮
    if (st.mode === 'pos2name' && st.target) {
      const cx = PAD + st.target.f * CW + CW / 2;
      const cy = PAD + st.target.s * SH;
      d += `<circle cx="${cx}" cy="${cy}" r="${DOT_R + 2}" fill="none" stroke="#ff69b4" stroke-width="3"/>`;
      d += `<circle cx="${cx}" cy="${cy}" r="${DOT_R}" fill="#ff69b4"/>`;
    }
    boardHtml = `<svg width="${w}" height="${h}" style="background:#fff;border-radius:8px">${d}</svg>`;

    // 答案区
    let ansHtml = '';
    if (st.mode === 'pos2name') {
      ansHtml = `<div class="fb-notes">${PC_FLAT.map((_, i) => `<button class="fb-note" data-act="note" data-pc="${i}">${nameOf(i, flat)}</button>`).join('')}</div>`;
    } else {
      ansHtml = `<div class="fb-target">目标：<b>${nameOf(st.targetPc!, flat)}</b> · 已找到 <b>${st.found.size}</b>/${st.totalForTarget} · 点到音就收集，点错算一次失误</div>`;
    }

    root.innerHTML = `
      <div class="fb-controls">
        <select data-act="mode">
          <option value="pos2name" ${st.mode === 'pos2name' ? 'selected' : ''}>位置 → 音名</option>
          <option value="name2pos" ${st.mode === 'name2pos' ? 'selected' : ''}>音名 → 位置</option>
        </select>
        <select data-act="fret">
          <option value="5" ${st.fretMax === 5 ? 'selected' : ''}>0-5 品</option>
          <option value="12" ${st.fretMax === 12 ? 'selected' : ''}>0-12 品</option>
          <option value="15" ${st.fretMax === 15 ? 'selected' : ''}>0-15 品</option>
        </select>
        <label><input type="checkbox" data-act="audio" ${st.audio ? 'checked' : ''}> 试听</label>
        <label><input type="checkbox" data-act="flat" ${st.useFlat ? 'checked' : ''}> 用降号b</label>
        <button data-act="next">下一题</button>
      </div>
      <div class="fb-board" data-act="board">${boardHtml}</div>
      <div class="fb-answers">${ansHtml}</div>
      <div class="fb-feedback" data-act="feedback">对 <b>${st.correct}</b> · 错 <b>${st.wrong}</b> · 连击 <b>${st.streak}</b></div>
    `;
  }

  function newRound(): void {
    if (st.mode === 'pos2name') {
      st.target = randPos(st.fretMax);
    } else {
      st.targetPc = randPc();
      st.found = new Set();
      st.totalForTarget = countPc(st.targetPc, st.fretMax);
    }
  }

  function markCorrect(): void {
    st.correct++; st.streak++;
    render();
  }
  function markWrong(pc: number): void {
    st.wrong++; st.streak = 0;
    if (pc >= 0 && pc < 12) st.weakness[pc]++;
    render();
  }

  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!el) return;
    const act = el.getAttribute('data-act');
    if (act === 'board' || (e.target as HTMLElement).tagName === 'circle' || (e.target as HTMLElement).closest('svg')) {
      // 音名→位置：点板收集
      if (st.mode !== 'name2pos') return;
      const svg = root.querySelector('svg')!;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const f = Math.round((x - PAD - CW / 2) / CW);
      const s = Math.round((y - PAD) / SH);
      if (f < 0 || f > st.fretMax || s < 0 || s > 5) return;
      const k = key(s, f);
      if (pcAt(s, f) === st.targetPc) {
        if (!st.found.has(k)) { st.found.add(k); }
        if (st.found.size >= st.totalForTarget) markCorrect(); else render();
        if (st.audio) playNote(midiAt(s, f));
      } else {
        markWrong(pcAt(s, f));
      }
      return;
    }
    if (act === 'next') { newRound(); render(); return; }
    if (act === 'mode') { /* handled in change */ return; }
    if (act === 'note') {
      if (st.mode !== 'pos2name') return;
      const pc = Number(el.getAttribute('data-pc'));
      const tPc = pcAt(st.target!.s, st.target!.f);
      if (st.audio) playNote(midiAt(st.target!.s, st.target!.f));
      if (pc === tPc) markCorrect(); else { markWrong(pc); }
      if (pc !== tPc) { /* 再给一次机会：重新出题 */ newRound(); render(); }
      return;
    }
  });

  root.addEventListener('change', (e) => {
    const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!el) return;
    const act = el.getAttribute('data-act');
    if (act === 'mode') { st.mode = (el as HTMLSelectElement).value as FbState['mode']; newRound(); render(); }
    else if (act === 'fret') { st.fretMax = Number((el as HTMLSelectElement).value); newRound(); render(); }
    else if (act === 'audio') { st.audio = (el as HTMLInputElement).checked; }
    else if (act === 'flat') { st.useFlat = (el as HTMLInputElement).checked; render(); }
  });

  newRound();
  render();
}
