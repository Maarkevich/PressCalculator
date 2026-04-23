// ─── КОНФИГ: ПРЕССЫ И КИРПИЧ (МЕНЯТЬ ТОЛЬКО ЗДЕСЬ) ───────────────────────────
export const PRESS_CONFIG = {
  A: { name: 'КСУРПо', strokesPerWagon: 36, wasteNormPercent: 0.6 },
  B: { name: 'СКРпу', strokesPerWagon: 32, wasteNormPercent: 1.5 }
};

// 📌 Чтобы добавить новый тип кирпича, просто добавьте строку в объект:
// 'short_code': { name: 'Название', piecesPerWagon: Количество }
export const BRICK_TYPES = {
  'std': { name: 'Одинарный (1НФ)', piecesPerWagon: 200 },
  'thk': { name: 'Утолщённый (1.4НФ)', piecesPerWagon: 144 },
  'blk': { name: 'Блок строительный', piecesPerWagon: 60 },
  'custom': { name: 'Другой (настрой в коде)', piecesPerWagon: 250 }
};

// ─── STATE ───────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'press_calc_state_v1';
const state = {
  press: 'A',
  brick: 'std',
  targetWagons: '',
  timePerWagonMs: 0, // миллисекунды на одну вагонетку
  wasteStart: '',
  wasteCurrent: '',
  producedWagons: '',
  // Секундомер
  swRunning: false,
  swStartTime: 0,
  swElapsed: 0
};

// ─── DOM CACHE ───────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const els = {
  selPress: $('#sel-press'), selBrick: $('#sel-brick'),
  inpTarget: $('#inp-target'), inpProduced: $('#inp-produced'),
  inpWasteStart: $('#inp-waste-start'), inpWasteCurrent: $('#inp-waste-current'),
  btnSwAction: $('#btn-sw-action'), btnSwClear: $('#btn-sw-clear'), btnSwApply: $('#btn-sw-apply'),
  swDisplay: $('.sw-display'), swDecimal: $('.sw-decimal'),
  resRemaining: $('#res-remaining'), resEta: $('#res-eta'), resStatus: $('#res-status'),
  infoStrokes: $('#info-strokes'), infoPieces: $('#info-pieces'), infoWasteLimit: $('#info-waste-limit'),
  resWasteUsed: $('#res-waste-used'), resWasteLeft: $('#res-waste-left'),
  progWagons: $('#prog-wagons'), progWagonsText: $('#prog-wagons-text'),
  progWaste: $('#prog-waste'), progWasteText: $('#prog-waste-text'),
  progWagonsFill: $('#prog-wagons .progress-fill'),
  progWasteFill: $('#prog-waste .progress-fill')
};

// ─── УТИЛИТЫ ─────────────────────────────────────────────────────────────────
export function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch {}
}
export function vibrate(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }
export function formatMs(ms) {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const ds = Math.floor((ms % 1000) / 100);
  return `${min}:${sec.toString().padStart(2,'0')}.${ds}`;
}
export function msToDecimal(ms) { return (ms / 60000).toFixed(2); }

// ─── СЕКУНДОМЕР (УСТОЙЧИВ К БЛОКИРОВКЕ ЭКРАНА) ──────────────────────────────
let swInterval;
function startSw() {
  state.swStartTime = performance.now();
  state.swRunning = true;
  updateSwUI();
  vibrate([30]);
  swInterval = setInterval(updateSwUI, 50);
}
function pauseSw() {
  state.swElapsed += performance.now() - state.swStartTime;
  state.swRunning = false;
  clearInterval(swInterval);
  updateSwUI();
}
function stopSw() {
  state.swElapsed += performance.now() - state.swStartTime;
  state.swRunning = false;
  clearInterval(swInterval);
  state.timePerWagonMs = state.swElapsed;
  vibrate([30, 20, 30]);
  updateSwUI();
  renderResults();
}
function resetSw() {
  pauseSw();
  state.swElapsed = 0;
  state.swStartTime = 0;
  state.swRunning = false;
  updateSwUI();
}
function updateSwUI() {
  const now = state.swRunning ? performance.now() : 0;
  const total = state.swElapsed + (state.swRunning ? (now - state.swStartTime) : 0);
  els.swDisplay.textContent = formatMs(total);
  els.swDecimal.textContent = `${msToDecimal(total)} мин`;

  // Логика кнопок
  if (!state.swRunning && total === 0) {
    els.btnSwAction.textContent = '▶ СТАРТ';
    els.btnSwAction.className = 'btn-primary sw-btn-start';
    els.btnSwClear.textContent = '🔄 СБРОС';
    els.btnSwApply.disabled = true;
  } else if (state.swRunning) {
    els.btnSwAction.textContent = '⏸ ПАУЗА';
    els.btnSwAction.className = 'btn-secondary sw-btn-pause';
    els.btnSwClear.textContent = '⏹ СТОП';
    els.btnSwClear.className = 'btn-primary sw-btn-stop';
    els.btnSwApply.disabled = false;
  } else {
    els.btnSwAction.textContent = '▶ СТАРТ';
    els.btnSwAction.className = 'btn-primary sw-btn-start';
    els.btnSwClear.textContent = '🔄 СБРОС';
    els.btnSwClear.className = 'btn-secondary sw-btn-reset';
    els.btnSwApply.disabled = false;
  }
}

// ─── РАСЧЁТЫ И РЕНДЕР ────────────────────────────────────────────────────────
function getWasteLimit() {
  const cfg = PRESS_CONFIG[state.press];
  // Отвал в ходах = ходов на ваг * (норма % / 100)
  return Math.ceil(cfg.strokesPerWagon * (cfg.wasteNormPercent / 100));
}

function updateConfigUI() {
  const p = PRESS_CONFIG[state.press];
  const b = BRICK_TYPES[state.brick];
  const limit = getWasteLimit();
  
  els.infoStrokes.textContent = p.strokesPerWagon;
  els.infoPieces.textContent = b.piecesPerWagon;
  els.infoWasteLimit.textContent = limit;
}

function renderResults() {
  const target = parseInt(state.targetWagon) || 0;
  const produced = parseInt(state.producedWagons) || 0;
  const timePerWagonMin = state.timePerWagonMs / 60000;

  // Прогноз времени
  if (target > 0 && timePerWagonMin > 0 && produced <= target) {
    const remaining = Math.max(0, target - produced);
    const minsLeft = remaining * timePerWagonMin;
    const eta = new Date(Date.now() + minsLeft * 60000);
    
    els.resRemaining.textContent = remaining;
    els.resEta.textContent = `${eta.getHours().toString().padStart(2,'0')}:${eta.getMinutes().toString().padStart(2,'0')}`;
    els.resStatus.textContent = 'В работе';
    els.resStatus.className = 'badge';

    const pct = Math.min(100, (produced / target) * 100);
    els.progWagonsFill.style.width = `${pct}%`;
    els.progWagonsFill.classList.remove('warn');
    if (pct > 90) els.progWagonsFill.classList.add('warn');
    els.progWagonsText.textContent = `${Math.round(pct)}%`;
  } else {
    els.resRemaining.textContent = '—';
    els.resEta.textContent = '—';
    els.resStatus.textContent = produced >= target ? '✅ Норма выполнена' : '⏳ Введите данные';
    els.progWagonsFill.style.width = '0%';
    els.progWagonsText.textContent = '0%';
  }

  // Отвал
  const wasteStart = parseInt(state.wasteStart) || 0;
  const wasteCurr = parseInt(state.wasteCurrent) || 0;
  const limit = getWasteLimit();
  const used = wasteStart + wasteCurr;
  const left = Math.max(0, limit - used);
  const pctUsed = limit > 0 ? (used / limit) * 100 : 0;

  els.resWasteUsed.textContent = used;
  els.resWasteLeft.textContent = left;
  els.progWasteFill.style.width = `${Math.min(100, pctUsed)}%`;
  els.progWasteText.textContent = `${pctUsed.toFixed(1)}%`;
  
  if (pctUsed > 95) {
    els.progWasteFill.classList.add('warn');
    els.resWasteUsed.style.color = 'var(--danger)';
  } else {
    els.progWasteFill.classList.remove('warn');
    els.resWasteUsed.style.color = 'var(--text)';
  }

  saveState();
}

// ─── ИНИЦИАЛИЗАЦИЯ ───────────────────────────────────────────────────────────
export function init() {
  // Заполняем селектор кирпичей
  els.selBrick.innerHTML = Object.entries(BRICK_TYPES)
    .map(([k, v]) => `<option value="${k}">${v.name} · ${v.piecesPerWagon} шт/ваг</option>`).join('');

  // Восстановление состояния
  loadState();
  els.selPress.value = state.press;
  els.selBrick.value = state.brick;
  els.inpTarget.value = state.targetWagons;
  els.inpProduced.value = state.producedWagons;
  els.inpWasteStart.value = state.wasteStart;
  els.inpWasteCurrent.value = state.wasteCurrent;

  updateConfigUI();
  renderResults();
  updateSwUI();

  // Обработчики
  els.selPress.addEventListener('change', e => { state.press = e.target.value; updateConfigUI(); renderResults(); });
  els.selBrick.addEventListener('change', e => { state.brick = e.target.value; updateConfigUI(); renderResults(); });
  
  [els.inpTarget, els.inpProduced, els.inpWasteStart, els.inpWasteCurrent].forEach(inp => {
    inp.addEventListener('input', e => {
      const key = {inpTarget:'targetWagons', inpProduced:'producedWagons', inpWasteStart:'wasteStart', inpWasteCurrent:'wasteCurrent'}[e.target.id];
      state[key] = e.target.value;
      renderResults();
    });
  });

  els.btnSwAction.addEventListener('click', () => {
    state.swRunning ? pauseSw() : startSw();
  });
  els.btnSwClear.addEventListener('click', () => {
    state.swRunning ? stopSw() : resetSw();
  });
  els.btnSwApply.addEventListener('click', () => {
    state.timePerWagonMs = state.swElapsed;
    vibrate([20]);
    renderResults();
  });

  $('#btn-new-shift').addEventListener('click', () => {
    if (confirm('Начать новую смену? Все данные будут сброшены.')) {
      state.targetWagons = ''; state.producedWagons = ''; state.wasteStart = ''; state.wasteCurrent = '';
      state.timePerWagonMs = 0; state.swElapsed = 0; state.swRunning = false; state.swStartTime = 0;
      clearInterval(swInterval);
      [els.inpTarget, els.inpProduced, els.inpWasteStart, els.inpWasteCurrent].forEach(i => i.value = '');
      updateSwUI();
      renderResults();
      saveState();
    }
  });

  // Табы
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
      $(`#panel-${target}`).hidden = false;
    });
  });
}

document.addEventListener('DOMContentLoaded', init);