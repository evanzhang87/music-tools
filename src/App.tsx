import { useState } from 'react';
import RhythmModule from './RhythmModule';
import FretboardModule from './FretboardModule';

type ModuleId = 'rhythm' | 'fretboard';

const MODULES: Array<{ id: ModuleId; label: string; icon: string; hint: string }> = [
  { id: 'rhythm', label: '随机节奏', icon: '♪', hint: '生成规范记谱的随机节奏练习' },
  { id: 'fretboard', label: '指板音记忆', icon: '🎸', hint: '音名 ↔ 指板位置 双向记忆' },
];

export default function App() {
  const [active, setActive] = useState<ModuleId>('rhythm');

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-pink-50">
      <div className="flex min-h-screen">
        {/* 侧边栏 */}
        <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
          <div className="px-6 pt-6 pb-5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 text-white grid place-items-center text-lg shadow-md shadow-pink-500/20">
                ♫
              </span>
              <div>
                <div className="font-semibold text-slate-800 leading-tight">Evan Music Lab</div>
                <div className="text-[11px] text-slate-400">音乐练习 · 工具箱</div>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1.5">
            {MODULES.map((m) => {
              const isActive = m.id === active;
              return (
                <button
                  key={m.id}
                  onClick={() => setActive(m.id)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm font-medium ${
                    isActive
                      ? 'bg-gradient-to-r from-pink-500 to-violet-500 text-white shadow-md shadow-pink-500/20'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-lg">{m.icon}</span>
                  <span className="flex flex-col">
                    <span>{m.label}</span>
                    <span className={`text-[11px] font-normal ${isActive ? 'text-white/80' : 'text-slate-400'}`}>{m.hint}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-100 text-[11px] text-slate-400">
            基于 VexFlow 5 · React + Vite
          </div>
        </aside>

        {/* 内容区 */}
        <main className="flex-1 p-8 lg:p-10">
          <div className="max-w-5xl mx-auto">
            {active === 'rhythm' && <RhythmModule />}
            {active === 'fretboard' && <FretboardModule />}
          </div>
        </main>
      </div>
    </div>
  );
}
