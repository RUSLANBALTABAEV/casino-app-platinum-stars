const root = document.getElementById('crash-root');
const toast = document.getElementById('crash-toast');
const toastMessage = document.getElementById('crash-toast-message');

const elements = {
  balance: document.getElementById('crash-balance'),
  betDisplay: document.getElementById('crash-bet-display'),
  multiplierLabel: document.getElementById('multiplier-label'),
  statusBadge: document.getElementById('round-status'),
  history: document.getElementById('crash-history'),
  canvas: document.getElementById('crash-canvas'),
  betInput: document.getElementById('bet-input')
};

const buttons = {
  start: document.getElementById('btn-start-round'),
  cashout: document.getElementById('btn-cashout'),
  clearHistory: document.getElementById('btn-clear-history'),
  chips: document.querySelectorAll('.chip-btn')
};

const defaultConfig = {
  baseBet: 50,
  maxMultiplier: 12,
  autoCashout: 0,
  roundDelay: 4
};

const state = {
  config: { ...defaultConfig },
  balance: 300,
  bet: 50,
  running: false,
  awaitingStart: false,
  multiplier: 1,
  crashPoint: 2.4,
  history: [],
  animationFrame: null,
  startTime: 0,
  elapsed: 0,
  serverSynced: false,
  initDataRaw: null,
  balancePollId: null,
  path: [],
  crashed: false,
  flameOffset: 0,
  sessionId: null,       // ← текущая игровая сессия
  apiPending: false,     // ← блокировка двойных кликов
};

// ─── Toast ───────────────────────────────────────────────────────────
function showToast(message) {
  toastMessage.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

// ─── Display helpers ─────────────────────────────────────────────────
function formatMultiplier(v) {
  return `x${v.toFixed(2)}`;
}

function updateBalanceDisplay() {
  if (elements.balance) elements.balance.textContent = `${state.balance} ★`;
}

function updateBetDisplay() {
  if (elements.betDisplay) elements.betDisplay.textContent = `${state.bet} ★`;
  if (elements.betInput) elements.betInput.value = state.bet;
}

function setControlsEnabled(enabled) {
  buttons.start.disabled = !enabled;
  buttons.cashout.disabled = enabled;
  if (elements.betInput) elements.betInput.disabled = !enabled;
  buttons.chips.forEach(b => b.disabled = !enabled);
}

function updateMultiplierDisplay() {
  elements.multiplierLabel.textContent = formatMultiplier(state.multiplier);
}

function setStatus(label, variant) {
  elements.statusBadge.textContent = label;
  elements.statusBadge.className = `status-badge status-${variant}`;
}

function updateHistory() {
  elements.history.innerHTML = '';
  [...state.history].reverse().forEach(entry => {
    const row = document.createElement('div');
    row.className = `history-row ${entry.result === 'Cashout' ? 'win' : 'loss'}`;
    row.innerHTML = `
      <span>${entry.result === 'Cashout' ? '✅' : '💥'} ${entry.result}</span>
      <span>${formatMultiplier(entry.crash)}</span>
      ${entry.payout ? `<span class="payout">+${entry.payout} ★</span>` : ''}
    `;
    elements.history.appendChild(row);
  });
}

// ─── Canvas / Rocket ─────────────────────────────────────────────────
const canvas = elements.canvas;
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawRocket(x, y, angle, crashed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (!crashed) {
    // Flame (behind rocket)
    const flameLen = 18 + Math.sin(state.flameOffset) * 6;
    const flameGrad = ctx.createLinearGradient(0, 0, 0, flameLen);
    flameGrad.addColorStop(0, 'rgba(255,200,50,0.95)');
    flameGrad.addColorStop(0.4, 'rgba(255,100,20,0.8)');
    flameGrad.addColorStop(1, 'rgba(255,50,0,0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-5, 4);
    ctx.quadraticCurveTo(0, flameLen + 4, 5, 4);
    ctx.closePath();
    ctx.fill();

    // Secondary flame (shimmer)
    const fl2 = ctx.createLinearGradient(0, 0, 0, flameLen * 0.7);
    fl2.addColorStop(0, 'rgba(255,255,100,0.9)');
    fl2.addColorStop(1, 'rgba(255,150,0,0)');
    ctx.fillStyle = fl2;
    ctx.beginPath();
    ctx.moveTo(-2.5, 4);
    ctx.quadraticCurveTo(0, flameLen * 0.7 + 4, 2.5, 4);
    ctx.closePath();
    ctx.fill();
  }

  // Body
  const bodyGrad = ctx.createLinearGradient(-8, -20, 8, 8);
  if (crashed) {
    bodyGrad.addColorStop(0, '#ff4444');
    bodyGrad.addColorStop(1, '#aa1100');
  } else {
    bodyGrad.addColorStop(0, '#e8e8e8');
    bodyGrad.addColorStop(0.5, '#c0c0c0');
    bodyGrad.addColorStop(1, '#888');
  }
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(0, -22);          // nose
  ctx.bezierCurveTo(8, -14, 8, 0, 6, 8);   // right side
  ctx.lineTo(-6, 8);
  ctx.bezierCurveTo(-8, 0, -8, -14, 0, -22);
  ctx.closePath();
  ctx.fill();

  // Window
  if (!crashed) {
    ctx.fillStyle = 'rgba(120,200,255,0.85)';
    ctx.beginPath();
    ctx.arc(0, -8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Left fin
  ctx.fillStyle = crashed ? '#cc3300' : '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(-6, 4);
  ctx.lineTo(-14, 14);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fill();

  // Right fin
  ctx.beginPath();
  ctx.moveTo(6, 4);
  ctx.lineTo(14, 14);
  ctx.lineTo(6, 8);
  ctx.closePath();
  ctx.fill();

  // Highlight gleam
  if (!crashed) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-2, -18);
    ctx.quadraticCurveTo(-4, -8, -5, 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawChart() {
  const { width, height } = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, width, height);

  // Background grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const yg = height * (i / 4);
    ctx.beginPath(); ctx.moveTo(0, yg); ctx.lineTo(width, yg); ctx.stroke();
  }
  for (let i = 1; i < 5; i++) {
    const xg = width * (i / 5);
    ctx.beginPath(); ctx.moveTo(xg, 0); ctx.lineTo(xg, height); ctx.stroke();
  }

  const points = state.path;
  if (!points.length) return;

  const lastPt = points[points.length - 1];
  const maxT = Math.max(12, lastPt.t + 1);

  // Compute last position
  const lastX = (lastPt.t / maxT) * width;
  const lastY = height - (lastPt.mult / state.config.maxMultiplier) * (height - 20) - 10;

  // Fill under curve
  const fillGrad = ctx.createLinearGradient(0, 0, 0, height);
  if (state.crashed) {
    fillGrad.addColorStop(0, 'rgba(220,50,50,0.25)');
    fillGrad.addColorStop(1, 'rgba(220,50,50,0.02)');
  } else {
    fillGrad.addColorStop(0, 'rgba(251,191,36,0.22)');
    fillGrad.addColorStop(1, 'rgba(251,191,36,0.02)');
  }
  ctx.fillStyle = fillGrad;
  ctx.beginPath();
  ctx.moveTo(0, height);
  points.forEach(point => {
    const x = (point.t / maxT) * width;
    const y = height - (point.mult / state.config.maxMultiplier) * (height - 20) - 10;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(lastX, height);
  ctx.closePath();
  ctx.fill();

  // Main line
  const lineGrad = ctx.createLinearGradient(0, height, lastX, lastY);
  if (state.crashed) {
    lineGrad.addColorStop(0, 'rgba(255,100,100,0.6)');
    lineGrad.addColorStop(1, '#ff3333');
  } else {
    lineGrad.addColorStop(0, 'rgba(251,191,36,0.5)');
    lineGrad.addColorStop(1, '#fbbf24');
  }
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((point, i) => {
    const x = (point.t / maxT) * width;
    const y = height - (point.mult / state.config.maxMultiplier) * (height - 20) - 10;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Compute rocket angle from last two points
  let angle = -Math.PI / 2; // default: straight up
  if (points.length >= 2) {
    const prev = points[points.length - 2];
    const px = (prev.t / maxT) * width;
    const py = height - (prev.mult / state.config.maxMultiplier) * (height - 20) - 10;
    const dx = lastX - px;
    const dy = lastY - py;
    angle = Math.atan2(dx, -dy);  // Fixed: nose points in direction of travel
  }

  // Draw rocket at tip of the line
  state.flameOffset += 0.3;
  drawRocket(lastX, lastY, angle, state.crashed);
}

// ─── Game logic ──────────────────────────────────────────────────────
function generateCrashPoint(max) {
  const roll = Math.random();
  const weighted = 1 / Math.max(0.08, roll);
  return Math.min(max, Math.max(1.0, weighted));
}

function stopAnimation() {
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
}

function finalizeRound(result, payout) {
  state.history.push({ crash: state.multiplier, result, payout });
  updateHistory();
  setControlsEnabled(true);
  state.running = false;
  state.awaitingStart = false;
  state.elapsed = 0;
  state.path = [];
  updateBalanceDisplay();
  setStatus('Ожидание', 'idle');
}

function crashRound() {
  stopAnimation();
  state.crashed = true;
  setStatus('💥 Крэш!', 'crash');
  showToast('Множитель обрушился!');
  updateMultiplierDisplay();
  drawChart();

  // Уведомляем сервер о крэше (ставка уже списана при старте)
  if (state.sessionId) {
    callCrashApi({ action: 'crash', sessionId: state.sessionId, bet: state.bet })
      .then(() => { state.sessionId = null; })
      .catch(() => { fetchBalance(); }); // На ошибку — обновляем баланс с сервера
  }

  setTimeout(() => {
    state.crashed = false;
    finalizeRound('Crash', 0);
    drawChart();
  }, 1500);
}

function tickFrame(timestamp) {
  if (!state.running) return;
  if (!state.startTime) state.startTime = timestamp;
  const elapsedSeconds = (timestamp - state.startTime) / 1000;
  state.elapsed = elapsedSeconds;
  const growth = 1 + elapsedSeconds * 0.7 + Math.pow(elapsedSeconds, 1.3) * 0.22;
  state.multiplier = Math.min(state.config.maxMultiplier, growth);
  state.path.push({ t: elapsedSeconds, mult: state.multiplier });
  updateMultiplierDisplay();
  drawChart();

  if (state.multiplier >= state.crashPoint) { crashRound(); return; }
  if (state.config.autoCashout && state.multiplier >= state.config.autoCashout) { handleCashout(); return; }
  state.animationFrame = requestAnimationFrame(tickFrame);
}

// ─── API helper ──────────────────────────────────────────────────────
async function callCrashApi(body) {
  if (!state.initDataRaw) throw new Error('Нет авторизации');
  const res = await fetch('/api/mini-app/games/crash', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-init-data': state.initDataRaw
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Ошибка сервера');
  // Сразу обновляем баланс из ответа сервера
  if (data.balance && typeof data.balance.available === 'number') {
    state.balance = Math.max(0, Math.round(data.balance.available));
    state.serverSynced = true;
    updateBalanceDisplay();
  }
  return data;
}

function handleStart() {
  if (state.running || state.awaitingStart) { showToast('Раунд уже готовится'); return; }
  if (state.apiPending) { showToast('Подождите…'); return; }
  if (state.bet <= 0 || state.bet > state.balance) { showToast('Недостаточно звёзд для ставки'); return; }

  state.apiPending = true;
  setControlsEnabled(false);
  setStatus('Подготовка…', 'waiting');
  state.awaitingStart = true;
  state.crashed = false;
  showToast('Готовим запуск 🚀');

  callCrashApi({ action: 'start', bet: state.bet })
    .then(data => {
      state.sessionId = data.sessionId || null;
      state.apiPending = false;
      // Запускаем раунд после задержки
      setTimeout(() => {
        state.awaitingStart = false;
        state.running = true;
        state.multiplier = 1;
        state.crashPoint = generateCrashPoint(state.config.maxMultiplier);
        state.path = [];
        state.startTime = 0;
        setStatus('🚀 Полёт', 'running');
        state.animationFrame = requestAnimationFrame(tickFrame);
      }, Math.max(1, state.config.roundDelay) * 1000);
    })
    .catch(err => {
      state.apiPending = false;
      state.awaitingStart = false;
      setControlsEnabled(true);
      setStatus('Ожидание', 'idle');
      showToast(err.message || 'Ошибка старта');
    });
}

function handleCashout() {
  if (!state.running) { showToast('Раунд ещё не запущен'); return; }
  if (state.apiPending) return;
  state.apiPending = true;
  stopAnimation();
  const multiplierAtCashout = state.multiplier;
  const payout = Math.max(0, Math.round(state.bet * multiplierAtCashout));
  showToast(`Вы забрали ${payout} ★ 🎉`);
  finalizeRound('Cashout', payout);
  updateMultiplierDisplay();
  drawChart();

  callCrashApi({ action: 'cashout', sessionId: state.sessionId, multiplier: multiplierAtCashout, bet: state.bet })
    .then(() => { state.sessionId = null; state.apiPending = false; })
    .catch(err => { state.apiPending = false; showToast(err.message || 'Ошибка кешаута'); fetchBalance(); });
}

function setBet(value) {
  state.bet = Math.max(1, Math.round(value));
  updateBetDisplay();
}

function applyConfig(nextConfig) {
  state.config = { ...state.config, ...nextConfig };
  if (state.config.baseBet) setBet(state.config.baseBet);
  updateMultiplierDisplay();
}

function fetchBalance() {
  if (!state.initDataRaw) return;
  fetch('/api/mini-app/balance', { headers: { 'x-telegram-init-data': state.initDataRaw } })
    .then(r => r.json())
    .then(data => {
      const bal = data.balance?.available ?? data.available;
      if (typeof bal === 'number') { state.balance = Math.max(0, Math.round(bal)); state.serverSynced = true; updateBalanceDisplay(); }
    }).catch(() => {});
}

function startBalancePolling() {
  if (state.balancePollId) clearInterval(state.balancePollId);
  state.balancePollId = setInterval(fetchBalance, 15000);
}

// ─── Event listeners ─────────────────────────────────────────────────
buttons.start.addEventListener('click', handleStart);
buttons.cashout.addEventListener('click', handleCashout);
buttons.clearHistory.addEventListener('click', () => { state.history = []; updateHistory(); });
elements.betInput.addEventListener('change', e => {
  const v = parseInt(e.target.value, 10);
  if (Number.isFinite(v)) setBet(v);
});
buttons.chips.forEach(b => b.addEventListener('click', () => {
  const v = parseInt(b.dataset.bet || '0', 10);
  if (v) setBet(v);
}));

window.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'STAR_CRASH_CONFIG' && data.payload) applyConfig(data.payload);
  if (data.type === 'STAR_CRASH_BALANCE' && typeof data.payload?.available === 'number') {
    state.balance = Math.max(0, Math.round(data.payload.available));
    state.serverSynced = true; updateBalanceDisplay();
  }
  if (data.type === 'STAR_CRASH_AUTH' && data.payload?.initDataRaw) {
    state.initDataRaw = data.payload.initDataRaw;
    fetchBalance(); startBalancePolling();
  }
});

window.addEventListener('resize', () => { resizeCanvas(); drawChart(); });

// ─── Init ─────────────────────────────────────────────────────────────
resizeCanvas();
updateBalanceDisplay();
updateBetDisplay();
updateMultiplierDisplay();
updateHistory();
setStatus('Ожидание', 'idle');
