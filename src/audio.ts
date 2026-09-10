// 共用音频引擎：节拍器「咔哒」 + 节奏「哒」的发声。
// 「哒」默认用一段合成的短人声样本(src/assets/da.mp3，零前导静音)精确播放；
// 若样本尚未载入则回退到 Web Audio 共振峰合成，保证任何情况下都有声。

import daUrl from './assets/da.mp3';

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let scheduled: AudioScheduledSourceNode[] = [];

// 「哒」人声样本
let daBuffer: AudioBuffer | null = null;
let daLoading: Promise<void> | null = null;

function ensure(): AudioContext {
  if (!ac) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    ac = new Ctor();
    master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

/** 预载「哒」人声样本（幂等） */
export function ensureDa(): Promise<void> {
  const a = ensure();
  if (daBuffer) return Promise.resolve();
  if (!daLoading) {
    daLoading = fetch(daUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => new Promise<AudioBuffer>((res, rej) => a.decodeAudioData(buf, res, rej)))
      .then((decoded) => { daBuffer = decoded; })
      .catch(() => { /* 载入失败 → 保持合成兜底 */ });
  }
  return daLoading;
}

/** 停止所有已排程的声音 */
export function stopAll(): void {
  for (const s of scheduled) {
    try { s.stop(); } catch { /* 已停止 */ }
  }
  scheduled = [];
}

// 节拍器：短促的高频「咔哒」，强拍更高更响
function scheduleClick(t: number, accent: boolean): void {
  const a = ensure();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'square';
  o.frequency.value = accent ? 1500 : 1000;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(accent ? 0.32 : 0.16, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g); g.connect(master!);
  o.start(t); o.stop(t + 0.06);
  scheduled.push(o);
}

// 合成的「哒」兜底：爆破音头 + 元音(共振峰)快速衰减
function scheduleDaSynth(t: number, freq: number): void {
  const a = ensure();
  const out = a.createGain(); out.gain.value = 1; out.connect(master!);
  const o = a.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(freq * 1.05, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.04);
  const f1 = a.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 800; f1.Q.value = 6;
  const f2 = a.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1200; f2.Q.value = 8;
  const mix = a.createGain(); mix.gain.value = 0.6;
  const env = a.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  o.connect(f1); o.connect(f2); f1.connect(mix); f2.connect(mix); mix.connect(env); env.connect(out);
  o.start(t); o.stop(t + 0.3);
  scheduled.push(o);
  const n = a.createBufferSource();
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.012), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  n.buffer = buf;
  const ng = a.createGain(); ng.gain.value = 0.22;
  n.connect(ng); ng.connect(out);
  n.start(t); n.stop(t + 0.02);
  scheduled.push(n);
}

// 节奏「哒」：优先播放人声样本，其次合成兜底
function scheduleDa(t: number, freq: number): void {
  const a = ensure();
  if (daBuffer) {
    const s = a.createBufferSource();
    s.buffer = daBuffer;
    const g = a.createGain();
    g.gain.value = freq / 261.63; // 保持和声(音高由播放速率微调)
    s.playbackRate.value = freq / 261.63;
    s.connect(g); g.connect(master!);
    s.start(t);
    scheduled.push(s);
    return;
  }
  scheduleDaSynth(t, freq);
}

const SIXTEENTH: Record<string, number> = { q: 4, '8': 2, '16': 1, '32': 0.5, qr: 4, '8r': 2, '16r': 1, '32r': 0.5, hr: 8, wr: 16 };
const unitsOf = (it: { dur: string; dots?: number }): number => (SIXTEENTH[it.dur] ?? 0) * (it.dots ? 1.5 : 1);
const isRest = (it: { dur: string }) => it.dur.endsWith('r');

// 节拍器重音所在的「分母单位拍」索引
function accentSet(num: number, den: number): Set<number> {
  const s = new Set<number>();
  if (den === 8) {
    for (let i = 0; i < num; i += 3) s.add(i);
    if (s.size === 0) s.add(0);
    return s;
  }
  s.add(0);
  if (num >= 4 && num % 2 === 0) s.add(num / 2);
  return s;
}

export interface PlayOptions {
  measures: { items: { dur: string; dots?: number }[] }[];
  tieTargets: Set<string>;
  num: number;
  den: number;
  bpm: number;
  metronome: boolean;
  noteFreq?: number;
}

/** 排程播放；返回本次总时长(秒) */
export async function playRhythm(opts: PlayOptions): Promise<number> {
  const a = ensure();
  await ensureDa();
  stopAll();
  const { num, den, bpm, measures } = opts;
  const unitsPerBeat = 16 / den;
  const beatSec = 60 / bpm;
  const start = a.currentTime + 0.15;
  const freq = opts.noteFreq ?? 261.63;
  const accents = accentSet(num, den);

  let beatPos = 0;
  for (let m = 0; m < measures.length; m++) {
    const items = measures[m].items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!isRest(it) && !opts.tieTargets.has(`${m}-${i}`)) {
        scheduleDa(start + beatPos * beatSec, freq);
      }
      beatPos += unitsOf(it) / unitsPerBeat;
    }
  }

  const totalBeats = measures.length * num;
  if (opts.metronome) {
    for (let k = 0; k < totalBeats; k++) {
      scheduleClick(start + k * beatSec, accents.has(k % num));
    }
  }

  return start - a.currentTime + totalBeats * beatSec;
}
