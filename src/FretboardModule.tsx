import { useEffect, useRef } from 'react';
import { initFretboard } from './fretboard';

export default function FretboardModule() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rootRef.current) initFretboard(rootRef.current);
  }, []);

  return (
    <div className="card p-6">
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">指板音记忆</h1>
      <p className="text-slate-500 text-sm mb-6">
        把「音名 ↔ 指板位置」双向记牢。音位认得出、给个音名能整板找齐，含 #/b，八度关系帮你建指板地图。
      </p>
      <div ref={rootRef} />
    </div>
  );
}
