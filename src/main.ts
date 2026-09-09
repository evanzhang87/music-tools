import './style.css';
import { render } from './render';
import { setFlags } from './rhythm';

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
