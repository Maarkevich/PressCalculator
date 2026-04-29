// ─── КОНФИГ: ПРЕССЫ И КИРПИЧ ───────────────────────────────────────────────
export const BRICK_TYPES = {
  A: [
    { id: 'a_ksurpo', name: 'КСУРПо (720 шт)', pieces: 720, strokes: 36 }
  ],
  B: [
    { id: 'b_skrpu', name: 'СКРпу (448 шт)', pieces: 448, strokes: 32 }
  ]
};

const PRESS_CONFIG = {
  A: { wasteNorm: 0.6 },
  B: { wasteNorm: 1.5 }
};

// ─── STATE ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'press_calc_state_v4';
const state = {
  press: 'A',
  brickId: 'a_ksurpo',
  normA: 84, normB: 76,
  timePerWagonMin: 0,
  remainingWagons: '',
  wasteStart: '',
  wasteCurrent: '',
  wastePrinted: '',
  swState: 'idle',
  swStartTime: 0,
  swElapsed: 0
};

// ─── DOM CACHE ────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const els = {
  pressBtns: document.querySelectorAll('.sync-press'),
  inpNormTime: $('#inp-norm-time'), inpNormWaste: $('#inp-norm-waste'),
  resWasteAllowTime: $('#res-waste-allow-time'), resWasteAllowWaste: $('#res-waste-allow-waste'),
  selBrickTime: $('#sel-brick-time'), selBrickWaste: $('#sel-brick-waste'),
  inpTime: $('#inp-time'), inpRemaining: $('#inp-remaining'),
  inpWasteStart: $('#inp-waste-start'), inpWasteCurrent: $('#inp-waste-current'), inpWastePrinted: $('#inp-waste-printed'),
  btnSwStart: $('#btn-sw-start'), btnSwStop: $('#btn-sw-stop'), btnSwApply: $('#btn-sw-apply'),
  swDisplay: $('.sw-display'), swDecimal: $('.sw-decimal'),
  resTotalTime: $('#res-total-time'), resEta: $('#res-eta'),
  resWasteUsed: $('#res-waste-used'), resWasteLimit: $('#res-waste-limit'), resWasteRemaining: $('#res-waste-remaining'),
  progWasteFill: $('#prog-waste-fill'), progWasteText: $('#prog-waste-text'),
  fabNewShift: $('#btn-new-shift')
};

// ─── УТИЛИТЫ ─────────────────────────────────────────────────────────────
export function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }
export function loadState() {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) Object.assign(state, JSON.parse(raw)); } catch {}
}
export function vibrate(p) { if (navigator.vibrate) navigator.vibrate(p); }
export function formatTime(ms) {
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), ds = Math.floor((ms % 1000) / 100);
  return `${m}:${s.toString().padStart(2,'0')}.${ds}`;
}

// ─── СЕКУНДОМЕР ──────────────────────────────────────────────────────────
let swIntervalId;
function updateSwUI() {
  els.swDisplay.textContent = formatTime(state.swElapsed);
  els.swDecimal.textContent = `${(state.swElapsed / 60000).toFixed(2)} мин`;
  switch(state.swState) {
    case 'idle':
      els.btnSwStart.textContent = '▶ СТАРТ'; els.btnSwStart.className = 'btn-sw-start';
      els.btnSwStop.textContent = '⏹ СТОП'; els.btnSwStop.className = 'btn-sw-stop'; els.btnSwStop.disabled = true;
      els.btnSwApply.disabled = true; break;
    case 'running':
      els.btnSwStart.textContent = '⏸ ПАУЗА'; els.btnSwStart.className = 'btn-sw-pause';
      els.btnSwStop.textContent = '⏹ СТОП'; els.btnSwStop.className = 'btn-sw-stop'; els.btnSwStop.disabled = false;
      els.btnSwApply.disabled = true; break;
    case 'paused':
      els.btnSwStart.textContent = '▶ СТАРТ'; els.btnSwStart.className = 'btn-sw-start';
      els.btnSwStop.textContent = '⏹ СТОП'; els.btnSwStop.className = 'btn-sw-stop'; els.btnSwStop.disabled = false;
      els.btnSwApply.disabled = true; break;
    case 'stopped':
      els.btnSwStart.textContent = '▶ СТАРТ'; els.btnSwStart.className = 'btn-sw-start';
      els.btnSwStop.textContent = '🔄 СБРОС'; els.btnSwStop.className = 'btn-sw-start'; els.btnSwStop.disabled = false;
      els.btnSwApply.disabled = false; break;
  }
}
function startSw() {
  state.swState = 'running'; state.swStartTime = Date.now() - state.swElapsed;
  swIntervalId = setInterval(() => {
    state.swElapsed = Date.now() - state.swStartTime;
    els.swDisplay.textContent = formatTime(state.swElapsed);
    els.swDecimal.textContent = `${(state.swElapsed/60000).toFixed(2)} мин`;
  }, 50);
  vibrate([30]); updateSwUI();
}
function pauseSw() { state.swElapsed = Date.now() - state.swStartTime; state.swState = 'paused'; clearInterval(swIntervalId); vibrate([20]); updateSwUI(); }
function stopSw() { state.swElapsed = Date.now() - state.swStartTime; state.swState = 'stopped'; clearInterval(swIntervalId); vibrate([30,20,30]); updateSwUI(); }
function resetSw() { state.swElapsed = 0; state.swState = 'idle'; clearInterval(swIntervalId); updateSwUI(); }

// ─── ЛОГИКА И РЕНДЕР ─────────────────────────────────────────────────────
function syncPressUI() {
  els.pressBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.press === state.press));

  const list = BRICK_TYPES[state.press];
  if (!list || !list.length) return;

  if (!list.find(b => b.id === state.brickId)) {
    state.brickId = list[0].id;
  }

  const populate = (sel) => {
    sel.innerHTML = list.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    sel.value = state.brickId;
  };

  populate(els.selBrickTime);
  populate(els.selBrickWaste);

  updateNormUI();
}

function getBrick() {
  return BRICK_TYPES[state.press].find(b => b.id === state.brickId) || BRICK_TYPES[state.press][0];
}

function updateNormUI() {
  const val = state.press === 'A' ? state.normA : state.normB;
  els.inpNormTime.value = val || '';
  els.inpNormWaste.value = val || '';
  calcAllowableWaste();
}

function calcAllowableWaste() {
  const norm = state.press === 'A' ? state.normA : state.normB;
  const b = getBrick();
  const pct = PRESS_CONFIG[state.press].wasteNorm;

  if (!norm || !b) {
    els.resWasteAllowTime.textContent = '—';
    els.resWasteAllowWaste.textContent = '—';
    return 0;
  }

  const allow = Math.floor(norm * b.strokes * (pct / 100));
  els.resWasteAllowTime.textContent = `${allow} пресс.`;
  els.resWasteAllowWaste.textContent = `${allow} пресс.`;
  return allow;
}

function calcTimeResults() {
  const time = parseFloat(state.timePerWagonMin) || 0;
  const rem = parseInt(state.remainingWagons) || 0;

  if (time > 0 && rem > 0) {
    const totalMin = time * rem;
    els.resTotalTime.textContent = `${Math.floor(totalMin/60)}ч ${Math.round(totalMin%60)}м`;

    const eta = new Date(Date.now() + totalMin * 60000);
    els.resEta.textContent = `${eta.getHours().toString().padStart(2,'0')}:${eta.getMinutes().toString().padStart(2,'0')}`;
  } else {
    els.resTotalTime.textContent = '—';
    els.resEta.textContent = '—';
  }
}

function calcWasteResults() {
  const allow = calcAllowableWaste();
  const start = parseInt(state.wasteStart) || 0;
  const curr = parseInt(state.wasteCurrent) || 0;
  const printed = parseInt(state.wastePrinted) || 0;
  const b = getBrick();

  const used = curr - start - (printed * b.strokes);
  const remaining = Math.max(0, allow - used);
  const pct = allow > 0 ? Math.min(100, (used / allow) * 100) : 0;

  els.resWasteUsed.textContent = used < 0 ? 'Ошибка ввода' : used;
  els.resWasteLimit.textContent = allow;
  els.resWasteRemaining.textContent = remaining;
  els.progWasteFill.style.width = `${pct}%`;
  els.progWasteText.textContent = `${pct.toFixed(1)}%`;
  els.progWasteFill.classList.toggle('warn', pct > 95 || used < 0);

  saveState();
}

// ─── ИНИЦИАЛИЗАЦИЯ ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  syncPressUI();
  updateSwUI();

  els.inpTime.value = state.timePerWagonMin || '';
  els.inpRemaining.value = state.remainingWagons;
  els.inpWasteStart.value = state.wasteStart;
  els.inpWasteCurrent.value = state.wasteCurrent;
  els.inpWastePrinted.value = state.wastePrinted;

  els.pressBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      state.press = btn.dataset.press;
      state.brickId = BRICK_TYPES[state.press][0].id;
      syncPressUI();
      calcWasteResults();
    });
  });

  [els.selBrickTime, els.selBrickWaste].forEach(sel => {
    sel.addEventListener('change', e => {
      state.brickId = e.target.value;
      syncPressUI();
      calcWasteResults();
    });
  });

  const handleNormInput = (e) => {
    const val = parseInt(e.target.value) || 0;
    if (state.press === 'A') state.normA = val;
    else state.normB = val;

    calcAllowableWaste();
    calcWasteResults();
    saveState();
  };

  els.inpNormTime.addEventListener('input', handleNormInput);
  els.inpNormWaste.addEventListener('input', handleNormInput);

  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.timePerWagonMin = parseFloat(btn.dataset.min) || 0;
      els.inpTime.value = state.timePerWagonMin;

      document.querySelectorAll('.time-btn').forEach(b => b.classList.toggle('active', b === btn));
      calcTimeResults();
    });
  });

  els.inpTime.addEventListener('input', e => {
    state.timePerWagonMin = parseFloat(e.target.value) || 0;
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
    calcTimeResults();
  });

  els.inpRemaining.addEventListener('input', e => {
    state.remainingWagons = parseInt(e.target.value) || 0;
    calcTimeResults();
  });

  // ✅ FIXED (критический баг)
  els.inpWasteStart.addEventListener('input', e => {
    state.wasteStart = e.target.value;
    calcWasteResults();
  });
  els.inpWasteCurrent.addEventListener('input', e => {
    state.wasteCurrent = e.target.value;
    calcWasteResults();
  });
  els.inpWastePrinted.addEventListener('input', e => {
    state.wastePrinted = e.target.value;
    calcWasteResults();
  });

  els.btnSwStart.addEventListener('click', () => state.swState === 'running' ? pauseSw() : startSw());
  els.btnSwStop.addEventListener('click', () => state.swState === 'stopped' ? resetSw() : stopSw());

  els.btnSwApply.addEventListener('click', () => {
    state.timePerWagonMin = parseFloat((state.swElapsed / 60000).toFixed(2)) || 0;
    els.inpTime.value = state.timePerWagonMin;

    resetSw();
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
    calcTimeResults();
    vibrate([20]);
  });

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected','false');
      });

      btn.classList.add('active');
      btn.setAttribute('aria-selected','true');

      document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
      $(`#panel-${btn.dataset.tab}`).hidden = false;
    });
  });

  els.fabNewShift.addEventListener('click', () => {
    if (!confirm('Начать новую смену? Все данные сброшены.')) return;

    state.remainingWagons = '';
    state.timePerWagonMin = 0;
    state.wasteStart = '';
    state.wasteCurrent = '';
    state.wastePrinted = '';

    resetSw();

    [els.inpRemaining, els.inpTime, els.inpWasteStart, els.inpWasteCurrent, els.inpWastePrinted]
      .forEach(i => i.value = '');

    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));

    calcTimeResults();
    calcWasteResults();
    saveState();
  });
});