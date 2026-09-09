import { useEffect, useRef, useState } from 'react';
import { render } from './render';
import { setFlags } from './rhythm';

export default function RhythmModule() {
  const [num, setNum] = useState(4);
  const [strong, setStrong] = useState(false);
  const [sync, setSync] = useState(false);
  const [dot, setDot] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  function generate(): void {
    setFlags({ reinforce: strong, sync, dot });
    if (outputRef.current) render(outputRef.current, num);
  }

  // 首次挂载渲染一次
  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card p-6">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">随机节奏练习</h1>
      <p className="text-slate-500 text-sm mb-6">
        音高固定为 C4 或休止符，按「一拍一个节奏型」生成，八分/十六分按拍连梁，休止符规范合并，不跨小节中点。
      </p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-5">
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
          onClick={generate}
          className="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 text-white text-sm font-medium shadow-md shadow-pink-500/20 hover:opacity-95 transition"
        >
          重新生成
        </button>
      </div>

      <div ref={outputRef} className="notation-box mt-2 w-full bg-white border border-pink-100 rounded-xl p-4" />
    </div>
  );
}
