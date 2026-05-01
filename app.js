// ─── КОНФИГ: ПРЕССЫ И КИРПИЧ (стандартные) ──────────────────────────────────
const DEFAULT_BRICKS = {
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
  swElapsed: 0,
  customBricks: { A: [], B: [] }   // пользовательские типы
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
  fabNewShift: $('#btn-new-shift'),
  // модалка добавления / редактирования
  modalOverlay: $('#modal-brick'),
  modalTitle: $('#modal-brick-title'),
  modalName: $('#modal-brick-name'),
  modalPieces: $('#modal-brick-pieces'),
  modalStrokes: $('#modal-brick-strokes'),
  modalSave: $('#modal-brick-save'),
  modalCancel: $('#modal-brick-cancel'),
  // модалка управления списком
  modalManage: $('#modal-manage'),
  manageListContainer: $('#manage-list-container'),
  modalManageClose: $('#modal-manage-close'),
  // кнопки действий с типами
  addBtns: document.querySelectorAll('.add-brick-btn'),
  manageBtns: document.querySelectorAll('.manage-brick-btn')
};

// текущий режим редактирования (id типа или null если создаём новый)
let editModeId = null;

// ─── УТИЛИТЫ ─────────────────────────────────────────────────────────────
function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }
function loadState() {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) {
    const saved = JSON.parse(raw);
    Object.assign(state, saved);
    if (!state.customBricks) state.customBricks = { A: [], B: [] };
  }} catch {}
}
function vibrate(p) { if (navigator.vibrate) navigator.vibrate(p); }
function formatTime(ms) {
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), ds = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2,'0')}.${ds}`;
}

// ─── ПОЛУЧЕНИЕ ПОЛНОГО СПИСКА КИРПИЧЕЙ ДЛЯ ПРЕССА (стандартные + кастомные)
function getFullBrickList(press) {
  const defaultList = DEFAULT_BRICKS[press] || [];
  const customList = state.customBricks[press] || [];
  return [...defaultList, ...customList];
}

function getBrick() {
  const list = getFullBrickList(state.press);
  return list.find(b => b.id === state.brickId) || list[0];
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

// ─── ОТРИСОВКА СЕЛЕКТОВ КИРПИЧЕЙ ──────────────────────────────────────────
function populateBrickSelects() {
  const list = getFullBrickList(state.press);
  if (!list.length) return;

  if (!list.find(b => b.id === state.brickId)) {
    state.brickId = list[0].id;
  }

  const optionsHtml = list.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  els.selBrickTime.innerHTML = optionsHtml;
  els.selBrickWaste.innerHTML = optionsHtml;
  els.selBrickTime.value = state.brickId;
  els.selBrickWaste.value = state.brickId;
}

// ─── СИНХРОНИЗАЦИЯ UI ПРЕССА ─────────────────────────────────────────────
function syncPressUI() {
  els.pressBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.press === state.press));
  populateBrickSelects();
  updateNormUI();
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
    els.resEta.textContent = `${String(eta.getHours()).padStart(2,'0')}:${String(eta.getMinutes()).padStart(2,'0')}`;
  } else {
    els.resTotalTime.textContent = '—';
    els.resEta.textContent = '—';
  }

  saveState();
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

// ─── МОДАЛКИ: ДОБАВЛЕНИЕ / РЕДАКТИРОВАНИЕ ТИПА ────────────────────────────
function clearBrickModalFields() {
  els.modalName.value = '';
  els.modalPieces.value = '';
  els.modalStrokes.value = '';
  editModeId = null;
  els.modalTitle.textContent = '➕ Добавить тип кирпича';
}

function openBrickModal(editId = null) {
  if (editId) {
    // режим редактирования
    const list = getFullBrickList(state.press);
    const brick = list.find(b => b.id === editId);
    if (!brick) return;
    els.modalName.value = brick.name;
    els.modalPieces.value = brick.pieces;
    els.modalStrokes.value = brick.strokes;
    editModeId = editId;
    els.modalTitle.textContent = '✏️ Редактировать тип';
  } else {
    clearBrickModalFields();
  }
  els.modalOverlay.classList.remove('hidden');
  els.modalName.focus();
}

function closeBrickModal() {
  els.modalOverlay.classList.add('hidden');
  clearBrickModalFields();
}

function saveBrickFromModal() {
  const name = els.modalName.value.trim();
  const pieces = parseInt(els.modalPieces.value) || 0;
  const strokes = parseInt(els.modalStrokes.value) || 0;

  if (!name || pieces <= 0 || strokes <= 0) {
    alert('Заполните все поля корректно (числа > 0)');
    return;
  }

  if (editModeId) {
    // обновляем существующий кастомный тип
    const list = state.customBricks[state.press];
    const idx = list.findIndex(b => b.id === editModeId);
    if (idx !== -1) {
      list[idx].name = name;
      list[idx].pieces = pieces;
      list[idx].strokes = strokes;
      // если это был выбранный тип, имя могло измениться — в селекте обновится
      if (state.brickId === editModeId) {
        // оставляем выбранным этот же id
      }
    }
  } else {
    // создаём новый
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const newBrick = { id, name, pieces, strokes };
    state.customBricks[state.press].push(newBrick);
    state.brickId = id;
  }

  // обновить селекты
  populateBrickSelects();
  // пересчитать допустимые значения
  calcAllowableWaste();
  calcWasteResults();
  saveState();
  closeBrickModal();
}

// ─── МОДАЛКА: УПРАВЛЕНИЕ СПИСКОМ ──────────────────────────────────────────
function openManageModal() {
  renderManageList();
  els.modalManage.classList.remove('hidden');
}

function closeManageModal() {
  els.modalManage.classList.add('hidden');
}

function renderManageList() {
  const custom = state.customBricks[state.press] || [];
  if (custom.length === 0) {
    els.manageListContainer.innerHTML = '<div class="manage-empty">Нет пользовательских типов</div>';
    return;
  }

  let html = '';
  custom.forEach(brick => {
    html += `
      <div class="manage-type-item">
        <div class="manage-type-info">
          <div class="manage-type-name">${brick.name}</div>
          <div class="manage-type-desc">${brick.pieces} шт, ${brick.strokes} пресс.</div>
        </div>
        <div class="manage-type-actions">
          <button data-edit="${brick.id}" title="Редактировать">✏️</button>
          <button data-delete="${brick.id}" title="Удалить">🗑</button>
        </div>
      </div>
    `;
  });
  els.manageListContainer.innerHTML = html;

  // обработчики внутри модалки
  els.manageListContainer.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.edit;
      closeManageModal();
      openBrickModal(id);
    });
  });

  els.manageListContainer.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.delete;
      if (confirm('Удалить этот тип кирпича?')) {
        deleteCustomBrick(id);
        renderManageList();
        // если после удаления список опустел, закрываем модалку
        if (state.customBricks[state.press].length === 0) {
          closeManageModal();
        }
      }
    });
  });
}

function deleteCustomBrick(id) {
  // удаляем из кастомных
  state.customBricks[state.press] = state.customBricks[state.press].filter(b => b.id !== id);
  // если удалённый был выбран, переключаемся на первый доступный
  if (state.brickId === id) {
    const list = getFullBrickList(state.press);
    state.brickId = list[0]?.id || '';
  }
  // обновить селекты
  populateBrickSelects();
  calcAllowableWaste();
  calcWasteResults();
  saveState();
}

// ─── ИНИЦИАЛИЗАЦИЯ ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  if (!state.customBricks) state.customBricks = { A: [], B: [] };

  syncPressUI();
  updateSwUI();

  els.inpTime.value = state.timePerWagonMin || '';
  els.inpRemaining.value = state.remainingWagons;
  els.inpWasteStart.value = state.wasteStart;
  els.inpWasteCurrent.value = state.wasteCurrent;
  els.inpWastePrinted.value = state.wastePrinted;

  // выбор пресса
  els.pressBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      state.press = btn.dataset.press;
      const list = getFullBrickList(state.press);
      if (!list.find(b => b.id === state.brickId)) {
        state.brickId = list[0]?.id || '';
      }
      syncPressUI();
      calcWasteResults();
    });
  });

  // выбор кирпича через select
  [els.selBrickTime, els.selBrickWaste].forEach(sel => {
    sel.addEventListener('change', e => {
      state.brickId = e.target.value;
      syncPressUI();
      calcWasteResults();
    });
  });

  // кнопки "Добавить"
  els.addBtns.forEach(btn => {
    btn.addEventListener('click', () => openBrickModal(null));
  });

  // кнопки "Управление"
  els.manageBtns.forEach(btn => {
    btn.addEventListener('click', () => openManageModal());
  });

  // модальное окно (сохранение / отмена)
  els.modalSave.addEventListener('click', saveBrickFromModal);
  els.modalCancel.addEventListener('click', closeBrickModal);
  els.modalOverlay.addEventListener('click', (e) => {
    if (e.target === els.modalOverlay) closeBrickModal();
  });

  // модалка управления
  els.modalManageClose.addEventListener('click', closeManageModal);
  els.modalManage.addEventListener('click', (e) => {
    if (e.target === els.modalManage) closeManageModal();
  });

  // норма
  const handleNormInput = (e) => {
    const val = parseInt(e.target.value) || 0;
    if (state.press === 'A') state.normA = val;
    else state.normB = val;

    calcWasteResults();
    saveState();
  };

  els.inpNormTime.addEventListener('input', handleNormInput);
  els.inpNormWaste.addEventListener('input', handleNormInput);

  // быстрые кнопки времени
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
    saveState();
  });

  els.inpRemaining.addEventListener('input', e => {
    state.remainingWagons = parseInt(e.target.value) || 0;
    calcTimeResults();
    saveState();
  });

  // поля отвала
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

  // секундомер
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

  // переключение вкладок
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

  // кнопка новой смены
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