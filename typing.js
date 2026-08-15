/* 순복음대구교회 GDS실 - 말씀 타자 연습 */

const $ = (sel) => document.querySelector(sel);

/* ---------------- 공통 유틸 ---------------- */

// 한글 한 글자를 두벌식 기준 타수(자판 누름 수)로 환산한다.
const DOUBLE_JUNG = 'ㅘㅙㅚㅝㅞㅟㅢ';
const DOUBLE_JONG = 'ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ';
const JUNG_LIST = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG_LIST = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

function strokesOfChar(ch) {
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const idx = code - 0xac00;
    const jung = JUNG_LIST[Math.floor((idx % 588) / 28)];
    const jong = JONG_LIST[idx % 28];
    let n = 1; // 초성
    n += DOUBLE_JUNG.includes(jung) ? 2 : 1;
    if (jong !== ' ') n += DOUBLE_JONG.includes(jong) ? 2 : 1;
    return n;
  }
  if (ch === ' ') return 1;
  return 1;
}

function strokes(s) {
  let n = 0;
  for (const ch of s) n += strokesOfChar(ch);
  return n;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripPunct(s) {
  return s.replace(/[.,!?"'`~·:;()\[\]{}<>«»“”‘’\-–—]/g, '');
}

function showScreen(id) {
  ['tHome', 'tFollow', 'tRain', 'tResult'].forEach((s) => {
    $(`#${s}`).hidden = s !== id;
  });
}

/* ---------------- 선택 상태 ---------------- */

let selected = null; // null 이면 전체(1~5번 순서대로)

function chosenQuestions() {
  return selected === null ? QUIZ_DATA : [QUIZ_DATA[selected]];
}

/* ---------------- 따라 치기 ---------------- */

const follow = {
  items: [],   // { ref, text }
  i: 0,
  target: '',
  startedAt: 0,
  strokesDone: 0,   // 이전 절까지 누적 타수
  typos: 0,
  typedChars: 0,
  prevLen: 0,
  timer: null
};

function startFollow() {
  follow.items = [];
  chosenQuestions().forEach((q) => {
    q.verses.forEach((v) => follow.items.push({ ref: `${q.title} · ${q.refDisplay}`, text: v.text }));
  });
  follow.i = 0;
  follow.startedAt = 0;
  follow.strokesDone = 0;
  follow.typos = 0;
  follow.typedChars = 0;

  showScreen('tFollow');
  loadFollowVerse();

  clearInterval(follow.timer);
  follow.timer = setInterval(updateFollowHud, 300);
}

function loadFollowVerse() {
  const item = follow.items[follow.i];
  follow.target = item.text;
  follow.prevLen = 0;
  $('#fRef').textContent = item.ref;
  $('#fInput').value = '';
  $('#fProg').textContent = `${follow.i + 1}/${follow.items.length}`;
  renderFollowTarget('');
  $('#fInput').focus();
}

function renderFollowTarget(typed) {
  const t = follow.target;
  let html = '';
  for (let i = 0; i < t.length; i++) {
    // 공백도 일반 공백 그대로 둔다 (CSS white-space: pre-wrap 이 보존하고, 여기서 줄이 바뀐다)
    const ch = esc(t[i]);
    let cls = 'ch';
    if (i < typed.length) cls += typed[i] === t[i] ? ' ok' : ' wrong';
    else if (i === typed.length) cls += ' cur';
    html += `<span class="${cls}">${ch}</span>`;
  }
  $('#fTarget').innerHTML = html;
}

function onFollowInput(e) {
  const typed = $('#fInput').value;
  if (!follow.startedAt && typed.length) follow.startedAt = Date.now();

  // 조합 중인 마지막 글자는 오타로 세지 않는다
  const composing = e && e.isComposing;
  const checkLen = composing ? Math.max(0, typed.length - 1) : typed.length;

  if (typed.length > follow.prevLen) {
    const added = typed.length - follow.prevLen;
    follow.typedChars += added;
    for (let i = follow.prevLen; i < checkLen; i++) {
      if (typed[i] !== follow.target[i]) follow.typos++;
    }
  }
  follow.prevLen = typed.length;

  renderFollowTarget(typed);
  updateFollowHud();

  if (typed === follow.target) nextFollowVerse();
}

function nextFollowVerse() {
  follow.strokesDone += strokes(follow.target);
  follow.i++;
  if (follow.i >= follow.items.length) {
    finishFollow();
  } else {
    loadFollowVerse();
  }
}

function currentFollowStrokes() {
  const typed = $('#fInput') ? $('#fInput').value : '';
  let ok = 0;
  for (let i = 0; i < typed.length && i < follow.target.length; i++) {
    if (typed[i] === follow.target[i]) ok += strokesOfChar(follow.target[i]);
    else break;
  }
  return follow.strokesDone + ok;
}

function followSpeed() {
  if (!follow.startedAt) return 0;
  const min = (Date.now() - follow.startedAt) / 60000;
  if (min <= 0) return 0;
  return Math.round(currentFollowStrokes() / min);
}

function followAccuracy() {
  if (!follow.typedChars) return 100;
  const acc = ((follow.typedChars - follow.typos) / follow.typedChars) * 100;
  return Math.max(0, Math.round(acc));
}

function updateFollowHud() {
  $('#fSpeed').textContent = followSpeed();
  $('#fAcc').textContent = `${followAccuracy()}%`;
}

function finishFollow() {
  clearInterval(follow.timer);
  const speed = followSpeed();
  const acc = followAccuracy();
  saveBest('follow', speed);

  $('#resTitle').textContent = '따라 치기 완료';
  $('#resBody').innerHTML = `
    <div class="sum-item"><span>평균 타수</span><strong>${speed}</strong></div>
    <div class="sum-item"><span>정확도</span><strong>${acc}%</strong></div>
    <div class="sum-item"><span>친 절</span><strong>${follow.items.length}</strong></div>`;
  $('#resNote').textContent = acc >= 98
    ? '오타 없이 깔끔합니다. 이 정도면 이미 절반은 외운 셈입니다.'
    : '천천히 정확하게 치는 편이 결국 더 빠릅니다.';
  $('#resAgain').dataset.mode = 'follow';
  showScreen('tResult');
}

/* ---------------- 낱말 비 ---------------- */

const rain = {
  words: [],       // 남은 낱말 공급 목록
  supplyIdx: 0,
  active: [],      // { el, text, norm, born, dur, x }
  score: 0,
  combo: 0,
  bestCombo: 0,
  cleared: 0,
  level: 1,
  lives: 3,
  raf: 0,
  spawnTimer: 0,
  lastSpawn: 0,
  running: false,
  pausedAt: 0
};

function startRain() {
  const qs = chosenQuestions();
  rain.words = [];
  qs.forEach((q) => {
    q.verses.forEach((v) => {
      v.text.split(/\s+/).forEach((w) => rain.words.push({ w, ref: `${q.title} · ${q.refDisplay}` }));
    });
  });
  rain.supplyIdx = 0;
  rain.active.forEach((a) => a.el.remove());
  rain.active = [];
  rain.score = 0; rain.combo = 0; rain.bestCombo = 0; rain.cleared = 0;
  rain.level = 1; rain.bestLevel = 1; rain.lives = 3;
  rain.running = true;
  rain.lastSpawn = 0;

  $('#rArea').innerHTML = '';
  $('#rInput').value = '';
  updateRainHud();
  showScreen('tRain');
  $('#rInput').focus();

  rain.startTime = performance.now();
  cancelAnimationFrame(rain.raf);
  rain.raf = requestAnimationFrame(rainLoop);
}

// 단계가 오를수록 어려워지되, 후반에 폭주하지 않도록 바닥값에 수렴시킨다.
// 초반 곡선은 그대로 두고 중반 이후 기울기만 완만하게 눕혔다.
function spawnInterval() {
  return Math.round(800 + 1050 * Math.pow(0.89, rain.level - 1));
}

function fallDuration() {
  return Math.round(3500 + 4300 * Math.pow(0.91, rain.level - 1));
}

// 동시 생성은 6단계부터 가끔 두 개, 12단계부터 아주 가끔 세 개까지만
function spawnCount() {
  if (rain.level >= 12 && Math.random() < 0.15) return 3;
  if (rain.level >= 6 && Math.random() < Math.min(0.5, 0.15 + (rain.level - 6) * 0.05)) return 2;
  return 1;
}

// 화면에 동시에 떠 있을 수 있는 낱말 수 상한 (이게 폭주를 막는다)
function maxOnScreen() {
  return Math.min(7, 4 + Math.floor((rain.level - 1) / 4));
}

const LEVEL_UP_EVERY = 7;

function spawnWord(now) {
  const item = rain.words[rain.supplyIdx % rain.words.length];
  rain.supplyIdx++;
  $('#rRef').textContent = item.ref;

  const el = document.createElement('span');
  el.className = 'falling-word';
  el.textContent = item.w;
  el.style.left = `${5 + Math.random() * 70}%`;
  $('#rArea').appendChild(el);

  rain.active.push({
    el,
    text: item.w,
    norm: stripPunct(item.w),
    born: now,
    dur: fallDuration()
  });
}

function rainLoop(now) {
  if (!rain.running) return;

  if (now - rain.lastSpawn > spawnInterval()) {
    const room = maxOnScreen() - rain.active.length;
    if (room > 0) {
      const n = Math.min(spawnCount(), room);
      for (let k = 0; k < n; k++) spawnWord(now + k * 90);
      rain.lastSpawn = now;
    } else {
      // 화면이 꽉 찼으면 조금 뒤에 다시 시도한다
      rain.lastSpawn = now - spawnInterval() + 250;
    }
  }

  const areaH = $('#rArea').clientHeight;
  for (let i = rain.active.length - 1; i >= 0; i--) {
    const a = rain.active[i];
    const p = (now - a.born) / a.dur;
    a.el.style.transform = `translateY(${Math.min(p, 1) * (areaH - 34)}px)`;
    if (p >= 1) {
      a.el.remove();
      rain.active.splice(i, 1);
      rain.lives--;
      rain.combo = 0;
      flashArea();
      updateRainHud();
      if (rain.lives <= 0) { endRain(); return; }
    }
  }

  rain.raf = requestAnimationFrame(rainLoop);
}

function flashArea() {
  const area = $('#rArea');
  area.classList.add('hit');
  setTimeout(() => area.classList.remove('hit'), 220);
}

function submitRainWord() {
  const raw = $('#rInput').value.trim();
  if (!raw) return;
  $('#rInput').value = '';
  const norm = stripPunct(raw);

  // 가장 아래에 있는(먼저 태어난) 것부터 맞춘다
  let hit = -1, oldest = Infinity;
  rain.active.forEach((a, i) => {
    if (a.norm === norm && a.born < oldest) { oldest = a.born; hit = i; }
  });

  if (hit >= 0) {
    const a = rain.active[hit];
    a.el.classList.add('cleared');
    const el = a.el;
    setTimeout(() => el.remove(), 180);
    rain.active.splice(hit, 1);
    rain.combo++;
    rain.bestCombo = Math.max(rain.bestCombo, rain.combo);
    rain.cleared++;
    rain.score += (10 + strokes(a.text) + Math.min(rain.combo, 15) * 3) * rain.level;
    if (rain.cleared % LEVEL_UP_EVERY === 0) {
      rain.level++;
      rain.bestLevel = rain.level;
    }
  } else {
    rain.combo = 0;
  }
  updateRainHud();
}

function updateRainHud() {
  $('#rScore').textContent = rain.score;
  $('#rCombo').textContent = rain.combo;
  $('#rLevel').textContent = rain.level;
  $('#rLives').textContent = '♥'.repeat(Math.max(0, rain.lives)) || '—';
}

function endRain() {
  rain.running = false;
  cancelAnimationFrame(rain.raf);
  rain.active.forEach((a) => a.el.remove());
  rain.active = [];

  const best = saveBest('rain', rain.score);
  $('#resTitle').textContent = '게임 끝';
  $('#resBody').innerHTML = `
    <div class="sum-item"><span>점수</span><strong>${rain.score}</strong></div>
    <div class="sum-item"><span>도달 단계</span><strong>${rain.bestLevel}</strong></div>
    <div class="sum-item"><span>최고 콤보</span><strong>${rain.bestCombo}</strong></div>
    <div class="sum-item"><span>친 낱말</span><strong>${rain.cleared}</strong></div>`;
  $('#resNote').textContent = rain.score >= best
    ? '최고 기록입니다.'
    : `최고 기록은 ${best}점입니다.`;
  $('#resAgain').dataset.mode = 'rain';
  showScreen('tResult');
}

// 탭이 가려지면 낙하가 밀리지 않도록 잠시 멈춘다
document.addEventListener('visibilitychange', () => {
  if (!rain.running) return;
  if (document.hidden) {
    rain.pausedAt = performance.now();
    cancelAnimationFrame(rain.raf);
  } else {
    const gap = performance.now() - rain.pausedAt;
    rain.active.forEach((a) => { a.born += gap; });
    rain.lastSpawn += gap;
    rain.raf = requestAnimationFrame(rainLoop);
  }
});

/* ---------------- 기록 ---------------- */

const BEST_KEY = 'gds-typing-best';

function readBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); }
  catch (e) { return {}; }
}

function saveBest(mode, value) {
  const b = readBest();
  const prev = b[mode] || 0;
  if (value > prev) {
    b[mode] = value;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { /* 무시 */ }
  }
  return Math.max(prev, value);
}

function renderBest() {
  const b = readBest();
  if (!b.follow && !b.rain) { $('#tBest').innerHTML = ''; return; }
  const rows = [];
  if (b.follow) rows.push(`<li><span>따라 치기</span><span>최고 ${b.follow} 타</span></li>`);
  if (b.rain) rows.push(`<li><span>낱말 비 피하기</span><span>최고 ${b.rain} 점</span></li>`);
  $('#tBest').innerHTML = `<p class="hist-title">내 최고 기록</p><ul>${rows.join('')}</ul>`;
}

/* ---------------- 홈 ---------------- */

function renderVerseChoices() {
  const items = QUIZ_DATA.map(
    (q, i) => `<li><button class="verse-item" data-idx="${i}">
        <span class="num">${i + 1}</span>
        <span class="name">${esc(q.title)}</span>
        <span class="go">${esc(q.refDisplay)}</span>
      </button></li>`
  ).join('');
  $('#tVerseList').innerHTML =
    `<li><button class="verse-item" data-idx="all">
        <span class="num">★</span><span class="name">전체 (1~5번)</span><span class="go">기본</span>
      </button></li>` + items;

  $('#tVerseList').querySelectorAll('.verse-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      selected = btn.dataset.idx === 'all' ? null : Number(btn.dataset.idx);
      $('#tVerseList').querySelectorAll('.verse-item').forEach((b) => b.classList.remove('picked'));
      btn.classList.add('picked');
    });
  });
  $('#tVerseList').querySelector('.verse-item').classList.add('picked');
}

function startMode(mode) {
  if (mode === 'follow') startFollow();
  else startRain();
}

/* ---------------- 초기화 ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  renderVerseChoices();
  renderBest();

  document.querySelectorAll('.mode-card').forEach((c) => {
    c.addEventListener('click', () => startMode(c.dataset.mode));
  });

  $('#fInput').addEventListener('input', onFollowInput);
  $('#fInput').addEventListener('compositionend', () => onFollowInput(null));
  $('#fSkip').addEventListener('click', nextFollowVerse);
  $('#fQuit').addEventListener('click', () => {
    clearInterval(follow.timer);
    showScreen('tHome');
    renderBest();
  });

  $('#rInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitRainWord(); }
  });
  $('#rQuit').addEventListener('click', () => {
    rain.running = false;
    cancelAnimationFrame(rain.raf);
    rain.active.forEach((a) => a.el.remove());
    rain.active = [];
    showScreen('tHome');
    renderBest();
  });

  $('#resHome').addEventListener('click', () => { renderBest(); showScreen('tHome'); });
  $('#resAgain').addEventListener('click', (e) => startMode(e.target.dataset.mode || 'follow'));
});
