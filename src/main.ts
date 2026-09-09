import './style.css';
import { render } from './render';
import { setFlags } from './rhythm';
import { initFretboard } from './fretboard';

// ── 模块导航 ──
const tabs = document.querySelectorAll<HTMLElement>('.tab');
const modules = document.querySelectorAll<HTMLElement>('.module');
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-module');
    tabs.forEach((t) => t.classList.toggle('active', t === tab));
    modules.forEach((m) => m.classList.toggle('active', m.id === `module-${target}`));
  });
});

// ── 节奏模块 ──
const btn = document.getElementById('btn-generate') as HTMLButtonElement;
const inputMeasures = document.getElementById('input-measures') as HTMLInputElement;
const inputStrong = document.getElementById('input-strong') as HTMLInputElement;
const inputSync = document.getElementById('input-sync') as HTMLInputElement;
const inputDot = document.getElementById('input-dot') as HTMLInputElement;
const output = document.getElementById('output') as HTMLDivElement;

function generate(): void {
  const numMeasures = Math.min(16, Math.max(1, parseInt(inputMeasures.value, 10) || 4));
  setFlags({
    reinforce: inputStrong.checked,
    sync: inputSync.checked,
    dot: inputDot.checked,
  });
  render(output, numMeasures);
}

btn.addEventListener('click', generate);
generate();

// ── 指板音记忆模块 ──
initFretboard(document.getElementById('fb-root') as HTMLElement);
