// VexFlow 渲染 —— 把生成的节奏画成五线谱（原样移植自旧版 rhythm.html 的 render()）。
import { Renderer, Stave, StaveNote, Voice, Formatter, StaveTie, Beam, Barline, Dot } from 'vexflow';
import { generateMeasure, isRestItem, type Measure } from './rhythm';

const STAVE_Y = 30;
const ROW_HEIGHT = 130;
const ROW_TARGET = 1200;  // 每行最大宽度；超过则换行
const GAP = 34;
const CLEF_SPACE = 90;    // 第一行首小节的 谱号+拍号 占位宽度（后续行两者都去掉）
const MIN_WIDTH = 150;
const LEFT_MARGIN = 30;   // 行首左边距：避免行首小节号居中被左缘裁掉
const RIGHT_MARGIN = 40;  // 音符区右缘与小节线之间的余量
const ROW_MARGIN = 30;    // 行末预留

interface Prepped extends Measure {
  notes: any[];
  voice: Voice;
  formatter: Formatter;
  minW: number;
  _mi: number;  // 小节号(1-based)
  _row: number;
  _clefW: number;
}

export function render(container: HTMLDivElement, numMeasures: number, num: number, den: number): void {
  container.innerHTML = '';

  const renderer = new Renderer(container, Renderer.Backends.SVG);

  // ── 第一遍：生成所有小节数据（附点/连梁分组已确定）──
  const measures: Measure[] = [];
  for (let m = 0; m < numMeasures; m++) {
    measures.push(generateMeasure());
  }

  // ── 跨小节连音线：两端都是普通音符(非休止、非十六分)就允许连，避免短音/十六分跨小节 ──
  const crossTies: Array<{ m: number; lastIdx: number; firstIdx: number }> = [];
  for (let m = 0; m < numMeasures - 1; m++) {
    const lastItem = measures[m].items[measures[m].items.length - 1];
    const firstItem = measures[m + 1].items[0];
    const isTieable = (it: any) => it && !isRestItem(it) && it.dur !== '16';
    if (isTieable(lastItem) && isTieable(firstItem) && Math.random() < 0.6) {
      crossTies.push({ m, lastIdx: measures[m].items.length - 1, firstIdx: 0 });
    }
  }

  // ── 第二遍：为每个小节构建 voice / formatter，并算出内容自然最小宽度 ──
  const prepped: Prepped[] = measures.map((measure, m) => {
    const notes = measure.items.map(it => {
      const note = new StaveNote({ keys: ['c/4'], duration: it.dur, dots: it.dots || 0 });
      if (it.dots) Dot.buildAndAttach([note], { all: true });
      return note;
    });
    const voice = new Voice({ numBeats: num, beatValue: den });
    voice.addTickables(notes);
    const formatter = new Formatter().joinVoices([voice]);
    let minW = 0;
    try { minW = formatter.preCalculateMinTotalWidth([voice]); } catch (e) { minW = 0; }
    return { ...measure, notes, voice, formatter, minW, _mi: m + 1, _row: 0, _clefW: 0 };
  });

  // ── 第三遍：自适应排版——每个小节按其内容宽度绘制，放不下就换行 ──
  const rows: Prepped[][] = [];
  const rowWidths: number[] = [];
  let row: Prepped[] = [];
  let rowW = 0;
  prepped.forEach(p => {
    if (row.length === 0) {
      const clefW = rows.length === 0 ? CLEF_SPACE : 0; // 只有第一行有谱号+拍号
      const w = Math.max(MIN_WIDTH, p.minW + clefW + GAP);
      row.push(p); rowW += w; p._row = rows.length; p._clefW = clefW;
    } else {
      const wNon = Math.max(MIN_WIDTH, p.minW + GAP);
      if (rowW + wNon > ROW_TARGET - ROW_MARGIN) {
        rows.push(row); rowWidths.push(rowW);
        const clefW = rows.length === 0 ? CLEF_SPACE : 0;
        const w = Math.max(MIN_WIDTH, p.minW + clefW + GAP);
        row = [p]; rowW = w; p._row = rows.length; p._clefW = clefW;
      } else {
        row.push(p); rowW += wNon; p._row = rows.length; p._clefW = 0;
      }
    }
  });
  if (row.length) { rows.push(row); rowWidths.push(rowW); }

  // 画布宽度自适应内容：最长行宽 + 左边距 + 行末边距
  const svgW = LEFT_MARGIN + Math.max(0, ...rowWidths) + ROW_MARGIN;
  const HEIGHT = rows.length * ROW_HEIGHT + 20;
  renderer.resize(svgW, HEIGHT);
  const ctx = renderer.getContext();

  // ── 第四遍：按行渲染 ──
  rows.forEach((rowItems, r) => {
    let curX = LEFT_MARGIN;
    const curY = STAVE_Y + r * ROW_HEIGHT;
    rowItems.forEach((p, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === rowItems.length - 1;
      const staveWidth = Math.max(MIN_WIDTH, p.minW + (p._clefW || 0) + GAP);

      const stave = new Stave(curX, curY, staveWidth);
      if (idx === 0 && p._row === 0) {
        stave.addClef('treble').addTimeSignature(`${num}/${den}`); // 只有第一行有谱号+拍号
      }
      if (isLast) stave.setEndBarType(Barline.type.END);
      stave.setMeasure(p._mi); // 每小节上方画小节号
      stave.setContext(ctx).draw();

      // 让音符区右缘离小节线留出 RIGHT_MARGIN（避免最右音符/连梁顶到小节线被裁）
      stave.getNoteEndX();
      (stave as any).endX = curX + staveWidth - RIGHT_MARGIN;

      p.formatter.formatToStave([p.voice], stave);
      p.notes.forEach(n => n.setStave(stave));

      // 按拍连梁：先创建 Beam(setBeam 抑制符尾)，再 draw，避免“小勾勾”
      const beams = p.beamGroups.map(group => new Beam(group.map(i => p.notes[i])));
      p.voice.setContext(ctx).draw();
      beams.forEach(b => b.setContext(ctx).draw());

      curX += staveWidth;
    });
  });

  // ── 第五遍：绘制跨小节连音线（只在同一行内连，避免跨行弧线）──
  crossTies
    .filter(t => (prepped[t.m]._row ?? prepped[t.m + 1]._row ?? 0) === (prepped[t.m + 1]._row ?? 0))
    .forEach(({ m, lastIdx, firstIdx }) => {
      new StaveTie({
        firstNote: prepped[m].notes[lastIdx],
        lastNote: prepped[m + 1].notes[firstIdx],
        firstIndices: [0],
        lastIndices: [0],
      } as any).setContext(ctx).draw();
    });
}
