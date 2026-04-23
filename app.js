// ─── КОНФИГ: ПРЕССЫ И КИРПИЧ ───────────────────────────────────────────────
// 📌 Чтобы добавить тип кирпича, просто вставьте объект в массив нужного пресса:
// { id: 'unique_id', name: 'Название', pieces: кол-во, strokes: кол-во }
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
const STORAGE_KEY = 'press_calc_state_v2';
const state = {
  press: 'A',
  brickId: 'a_ksurpo',
  timePerWagonMin: 0,
  remainingWagons: '',
  wasteStart: '',
  wasteCurrent: '',
  producedWagons: '',
  swRunning: false,
  swStartTime: 0,
  swElapsed: 0
};

// ─── DOM CACHE ────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const els = {
  pressBtnsTime: document.querySelectorAll('#panel-time .press-btn'),
  pressBtnsWaste: document.querySelectorAll('#panel-waste .press-btn'),
  selBrickTime: $('#sel-brick-time'), selBrickWaste: $('#sel-brick-waste'),
  inpTime: $('#inp-time'), inpRemaining: $('#inp-remaining'),
  inpWasteStart: $('#inp-waste-start'), inpWasteCurrent: $('#inp-waste-current'), inpProduced: $('#inp-produced'),
  btnSwAction: $('#btn-sw-action'), btnSwClear: $('#btn-sw-clear'), btnSwApply: $('#btn-sw-apply'),
  swDisplay: $('.sw-display'), swDecimal: $('.sw-decimal'),
  resTotalTime: $('#res-total-time'), resEta: $('#res-eta'),
  infoPieces: $('#info-pieces'), infoStrokes: $('#info-strokes'), infoWasteLimit: $('#info-waste-limit'),
  resWasteUsed: $('#res-waste-used'), resWasteLeft: $('#res-waste-left'),
  progWasteFill: $('#prog-waste .progress-fill'), progWasteText: $('#prog-waste-text'),
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

// ─── СЕКУНДОМЕР (УСТОЙЧИВ К БЛОКИРОВКЕ) ──────────────────────────────────
let swInterval;
function startSw() {
  state.swStartTime = Date.now() - state.swElapsed;
  state.swRunning = true;
  vibrate([30]);
  swInterval = setInterval(updateSwUI, 50);
}
function pauseSw() {
  state.swElapsed = Date.now() - state.swStartTime;
  state.swRunning = false;
  clearInterval(swInterval);
}
function stopSw() {
  state.swElapsed = Date.now() - state.swStartTime;
  state.swRunning = false;
  clearInterval(swInterval);
  vibrate([30, 20, 30]);
}
function resetSw() {
  pauseSw(); state.swElapsed = 0; updateSwUI();
}
function updateSwUI() {
  const total = state.swRunning ? (Date.now() - state.swStartTime) : state.swElapsed;
  els.swDisplay.textContent = formatTime(total);
  els.swDecimal.textContent = `${(total / 60000).toFixed(2)} мин`;

  if (!state.swRunning && total === 0) {
    els.btnSwAction.textContent = '▶ СТАРТ'; els.btnSwAction.className = 'btn-sw-start';
    els.btnSwClear.textContent = '🔄 СБРОС'; els.btnSwClear.className = 'btn-sw-reset';
    els.btnSwApply.disabled = true;
  } else if (state.swRunning) {
    els.btnSwAction.textContent = '⏸ ПАУЗА'; els.btnSwAction.className = 'btn-sw-pause';
    els.btnSwClear.textContent = '⏹ СТОП'; els.btnSwClear.className = 'btn-sw-start';
    els.btnSwApply.disabled = false;
  } else {
    els.btnSwAction.textContent = '▶ СТАРТ'; els.btnSwAction.className = 'btn-sw-start';
    els.btnSwClear.textContent = '🔄 СБРОС'; els.btnSwClear.className = 'btn-sw-reset';
    els.btnSwApply.disabled = false;
  }
}

// ─── ЛОГИКА И РЕНДЕР ─────────────────────────────────────────────────────
function syncPressUI() {
  [...els.pressBtnsTime, ...els.pressBtnsWaste].forEach(btn => {
    btn.classList.toggle('active', btn.dataset.press === state.press);
  });
  populateBrickSelect(els.selBrickTime, state.press);
  populateBrickSelect(els.selBrickWaste, state.press);
  els.selBrickTime.value = state.brickId;
  els.selBrickWaste.value = state.brickId;
  updateInfo();
  calcResults();
}

function populateBrickSelect(select, press) {
  select.innerHTML = BRICK_TYPES[press].map(b => `<option value="${b.id}">${b.name}</option>`).join('');
}

function getBrick() { return BRICK_TYPES[state.press].find(b => b.id === state.brickId) || BRICK_TYPES[state.press][0]; }

function updateInfo() {
  const b = getBrick();
  els.infoPieces.textContent = b.pieces;
  els.infoStrokes.textContent = b.strokes;
  const limit = Math.ceil(b.strokes * (PRESS_CONFIG[state.press].wasteNorm / 100));
  els.infoWasteLimit.textContent = limit;
  return limit;
}

function calcResults() {
  // Время & Прогноз
  const time = parseFloat(state.timePerWagonMin) || 0;
  const rem = parseInt(state.remainingWagons) || 0;
  
  if (time > 0 && rem > 0) {
    const totalMin = time * rem;
    const h = Math.floor(totalMin / 60), m = Math.round(totalMin % 60);
    els.resTotalTime.textContent = `${h}ч ${m}м`;
    
    const eta = new Date(Date.now() + totalMin * 60000);
    els.resEta.textContent = `${eta.getHours().toString().padStart(2,'0')}:${eta.getMinutes().toString().padStart(2,'0')}`;
  } else {
    els.resTotalTime.textContent = '—'; els.resEta.textContent = '—';
  }

  // Отвал
  const start = parseInt(state.wasteStart) || 0;
  const curr = parseInt(state.wasteCurrent) || 0;
  const limit = updateInfo();
  const used = start + curr;
  const left = Math.max(0, limit - used);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

  els.resWasteUsed.textContent = used;
  els.resWasteLeft.textContent = left;
  els.progWasteFill.style.width = `${pct}%`;
  els.progWasteText.textContent = `${pct.toFixed(1)}%`;
  els.progWasteFill.classList.toggle('warn', pct > 95);

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
  els.inpProduced.value = state.producedWagons;

  // Пресс кнопки
  const handlePress = (e) => {
    const press = e.currentTarget.dataset.press;
    if (press === state.press) return;
    state.press = press;
    state.brickId = BRICK_TYPES[press][0].id;
    syncPressUI();
  };
  els.pressBtnsTime.forEach(b => b.addEventListener('click', handlePress));
  els.pressBtnsWaste.forEach(b => b.addEventListener('click', handlePress));

  // Кирпич
  [els.selBrickTime, els.selBrickWaste].forEach(sel => {
    sel.addEventListener('change', e => { state.brickId = e.target.value; syncPressUI(); });
  });

  // Кнопки быстрого времени
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const min = parseFloat(btn.dataset.min);
      state.timePerWagonMin = min;
      els.inpTime.value = min;
      document.querySelectorAll('.time-btn').forEach(b => b.classList.toggle('active', b === btn));
      calcResults();
    });
  });

  // Ручной ввод времени
  els.inpTime.addEventListener('input', e => {
    state.timePerWagonMin = e.target.value;
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
    calcResults();
  });

  // Остаток вагонеток
  els.inpRemaining.addEventListener('input', e => { state.remainingWagons = e.target.value; calcResults(); });

  // Отвал поля
  [els.inpWasteStart, els.inpWasteCurrent, els.inpProduced].forEach(inp => {
    inp.addEventListener('input', e => {
      const key = {inpWasteStart:'wasteStart', inpWasteCurrent:'wasteCurrent', inpProduced:'producedWagons'}[e.target.id];
      state[key] = e.target.value; calcResults();
    });
  });

  // Секундомер
  els.btnSwAction.addEventListener('click', () => state.swRunning ? pauseSw() : startSw());
  els.btnSwClear.addEventListener('click', () => state.swRunning ? stopSw() : resetSw());
  els.btnSwApply.addEventListener('click', () => {
    state.timePerWagonMin = parseFloat((state.swElapsed / 60000).toFixed(2));
    els.inpTime.value = state.timePerWagonMin;
    resetSw();
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
    calcResults(); vibrate([20]);
  });

  // Табы
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
      btn.classList.add('active'); btn.setAttribute('aria-selected','true');
      document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
      $(`#panel-${btn.dataset.tab}`).hidden = false;
    });
  });

  // Новая смена
  els.fabNewShift.addEventListener('click', () => {
    if (!confirm('Начать новую смену? Все данные сброшены.')) return;
    state.remainingWagons = ''; state.timePerWagonMin = 0;
    state.wasteStart = ''; state.wasteCurrent = ''; state.producedWagons = '';
    resetSw();
    els.inpRemaining.value = ''; els.inpTime.value = '';
    els.inpWasteStart.value = ''; els.inpWasteCurrent.value = ''; els.inpProduced.value = '';
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
    calcResults(); saveState();
  });
});