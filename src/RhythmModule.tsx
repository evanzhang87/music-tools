import { useEffect, useRef, useState } from 'react';
import { render, type RenderData } from './render';
import { setFlags, setMeter } from './rhythm';
import { playRhythm, stopAll } from './audio';

const METERS = ['4/4', '2/4', '3/4', '5/4', '6/4', '7/4', '3/8', '6/8', '9/8', '12/8'];

export default function RhythmModule() {
  const [num, setNum] = useState(4);
  const [meter, setMeterSel] = useState('4/4');
  const [strong, setStrong] = useState(false);
  const [sync, setSync] = useState(false);
  const [dot, setDot] = useState(false);
  const [bpm, setBpm] = useState(80);
  const [metronome, setMetronome] = useState(true);
  const [playing, setPlaying] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<RenderData | null>(null);
  const timerRef = useRef<number | null>(null);

  function generate(): void {
    const [mn, md] = meter.split('/').map(Number);
    setMeter(mn, md);
    setFlags({ reinforce: strong, sync, dot });
    if (outputRef.current) dataRef.current = render(outputRef.current, num, mn, md);
  }

  function clearTimer(): void {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
  }

  function stop(): void {
    stopAll();
    clearTimer();
    setPlaying(false);
  }

  function togglePlay(): void {
    if (playing) { stop(); return; }
    const data = dataRef.current;
    if (!data) return;
    const [mn, md] = meter.split('/').map(Number);
    // 延音连入的音（一拍跨小节延音）不再新起「哒」
    const tieTargets = new Set(data.crossTies.map((t) => `${t.m + 1}-${t.firstIdx}`));
    const dur = playRhythm({
      measures: data.measures,
      tieTargets,
      num: mn,
      den: md,
      bpm,
      metronome,
    });
    setPlaying(true);
    timerRef.current = window.setTimeout(() => setPlaying(false), (dur + 0.3) * 1000);
  }

  // 首次挂载渲染一次
  useEffect(() => {
    generate();
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 重新生成 / 换拍号时停止播放，避免声音与谱面不一致
  function regenerate(): void {
    stop();
    generate();
  }

  return (
    <div className="card p-6">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">随机节奏练习</h1>
      <p className="text-slate-500 text-sm mb-6">
        音高固定为 C4 或休止符，按「一拍一个节奏型」生成，八分/十六分按拍连梁，休止符规范合并，不跨小节分组中点。
      </p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-5">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          拍号
          <select
            value={meter}
            onChange={(e) => { stop(); setMeterSel(e.target.value); }}
            className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-700 outline-none focus:border-pink-400 cursor-pointer"
          >
            {METERS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          小节数
          <input
            type="number"
            min={1}
            max={16}
            value={num}
            onChange={(e) => setNum(Math.max(1, Math.min(16, Number(e.target.value) || 4)))}
            className="w-16 px-3 py-1.5 border border-slate-300 rounded-lg text-center outline-none focus:border-pink-400"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={strong} onChange={(e) => setStrong(e.target.checked)} className="accent-pink-500" />
          强化重拍
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} className="accent-pink-500" />
          切分节奏
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={dot} onChange={(e) => setDot(e.target.checked)} className="accent-pink-500" />
          附点节奏
        </label>
        <button
          onClick={regenerate}
          className="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 text-white text-sm font-medium shadow-md shadow-pink-500/20 hover:opacity-95 transition"
        >
          重新生成
        </button>
      </div>

      {/* 播放控制条 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-5 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
        <button
          onClick={togglePlay}
          className={`px-5 py-2 rounded-xl text-white text-sm font-medium shadow-md transition ${
            playing
              ? 'bg-gradient-to-r from-rose-500 to-pink-600 shadow-rose-500/20'
              : 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/20'
          } hover:opacity-95`}
        >
          {playing ? '■ 停止' : '▶ 播放'}
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          速度
          <input
            type="number"
            min={30}
            max={240}
            value={bpm}
            onChange={(e) => setBpm(Math.max(30, Math.min(240, Number(e.target.value) || 80)))}
            className="w-20 px-3 py-1.5 border border-slate-300 rounded-lg text-center outline-none focus:border-pink-400"
          />
          <span className="text-slate-400">BPM</span>
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={metronome} onChange={(e) => setMetronome(e.target.checked)} className="accent-pink-500" />
          节拍器（背景固定拍）
        </label>
        <span className="text-xs text-slate-400">音符按节奏发「哒」，休止符静音</span>
      </div>

      <div ref={outputRef} className="notation-box mt-2 w-full bg-white border border-pink-100 rounded-xl p-4" />
    </div>
  );
}
