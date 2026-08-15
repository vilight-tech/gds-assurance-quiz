/* 순복음대구교회 GDS실 - 5가지 확신 암송 퀴즈 */

/* ---------------- 상태 ---------------- */
const state = {
  index: 0,          // 현재 문제 (0~4)
  phase: 'ref',      // 'ref' | 'refResult' | 'text' | 'textResult'
  results: [],       // { id, refOk, textScore }
  hintUsed: false
};

const $ = (sel) => document.querySelector(sel);

/* ---------------- 문자열 유틸 ---------------- */

// 비교용 정규화: 공백/문장부호 제거
function normalize(s) {
  return (s || '')
    .replace(/[.,!?"'`~·:;()\[\]{}<>«»“”‘’\-–—]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// 어절 토큰화
function tokenize(s) {
  return (s || '').trim().split(/\s+/).filter(Boolean);
}

// 토큰 하나를 비교용으로 정규화
function normToken(t) {
  return normalize(t);
}

/* ---------------- 구절(장절) 파싱 ---------------- */

// 모든 별칭을 [별칭, 정식명] 형태로 펼치고 긴 순서로 정렬
const ALIAS_LIST = Object.entries(BOOK_ALIASES)
  .flatMap(([book, aliases]) => aliases.map((a) => [a, book]))
  .sort((a, b) => b[0].length - a[0].length);

function parseReference(input) {
  if (!input) return null;
  let s = input.replace(/\s+/g, '');

  // 책 이름 찾기
  let book = null;
  for (const [alias, full] of ALIAS_LIST) {
    if (s.startsWith(alias)) {
      book = full;
      s = s.slice(alias.length);
      break;
    }
  }
  if (!book) return null;

  // 장/절 기호를 구분자로 치환
  s = s
    .replace(/장/g, ':')
    .replace(/절/g, '')
    .replace(/[~–—]/g, '-')
    .replace(/[.,]/g, ':');

  const m = s.match(/^:?(\d+):+(\d+)(?:-+(\d+))?$/);
  if (!m) return null;

  const chapter = parseInt(m[1], 10);
  const verseStart = parseInt(m[2], 10);
  const verseEnd = m[3] ? parseInt(m[3], 10) : verseStart;
  return { book, chapter, verseStart, verseEnd };
}

function refMatches(parsed, q) {
  if (!parsed) return false;
  return (
    parsed.book === q.book &&
    parsed.chapter === q.chapter &&
    parsed.verseStart === q.verseStart &&
    parsed.verseEnd === q.verseEnd
  );
}

/* ---------------- 본문 채점 (LCS 기반 diff) ---------------- */

function diffTokens(userTokens, ansTokens) {
  const a = userTokens.map(normToken);
  const b = ansTokens.map(normToken);
  const n = a.length, m = b.length;

  // LCS 길이 테이블
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const userMarks = new Array(n); // 'ok' | 'sp' | 'bad'
  const ansMarks = new Array(m);  // 'ok' | 'sp' | 'miss'

  // 매칭되지 않은 구간(블록)을 모아 두었다가 따로 처리
  let blockU = [], blockA = [];
  const flush = () => {
    resolveBlock(a, b, blockU, blockA, userMarks, ansMarks);
    blockU = []; blockA = [];
  };

  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flush();
      userMarks[i] = 'ok'; ansMarks[j] = 'ok'; i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      blockU.push(i); i++;
    } else {
      blockA.push(j); j++;
    }
  }
  while (i < n) { blockU.push(i); i++; }
  while (j < m) { blockA.push(j); j++; }
  flush();

  const okCount = ansMarks.filter((x) => x === 'ok').length;
  const spacing = ansMarks.filter((x) => x === 'sp').length;
  const matched = okCount + spacing;
  const score = m === 0 ? 0 : Math.round((matched / m) * 100);
  return { userMarks, ansMarks, matched, spacing, total: m, score };
}

// 불일치 블록 안에서 "띄어쓰기만 다른" 경우(붙여 쓰거나 나눠 쓴 경우)를 찾아낸다.
function resolveBlock(a, b, blockU, blockA, userMarks, ansMarks) {
  let p = 0, q = 0;
  while (p < blockU.length && q < blockA.length) {
    let up = 1, aq = 1;
    let su = a[blockU[p]];
    let sa = b[blockA[q]];
    let matchedRun = false;

    // 양쪽을 조금씩 이어 붙여 같아지는 지점을 찾는다 (최대 4어절)
    while (up <= 4 && aq <= 4) {
      if (su === sa) { matchedRun = true; break; }
      if (su.length < sa.length) {
        if (p + up >= blockU.length) break;
        su += a[blockU[p + up]]; up++;
      } else {
        if (q + aq >= blockA.length) break;
        sa += b[blockA[q + aq]]; aq++;
      }
    }

    if (matchedRun && (up > 1 || aq > 1)) {
      for (let k = 0; k < up; k++) userMarks[blockU[p + k]] = 'sp';
      for (let k = 0; k < aq; k++) ansMarks[blockA[q + k]] = 'sp';
      p += up; q += aq;
    } else {
      userMarks[blockU[p]] = 'bad';
      ansMarks[blockA[q]] = 'miss';
      p++; q++;
    }
  }
  while (p < blockU.length) { userMarks[blockU[p]] = 'bad'; p++; }
  while (q < blockA.length) { ansMarks[blockA[q]] = 'miss'; q++; }
}

/* ---------------- 렌더링 ---------------- */

function answerText(q) {
  return q.verses.map((v) => v.text).join(' ');
}

function hintText(q) {
  return tokenize(answerText(q))
    .map((t) => t[0] + '○'.repeat(Math.max(0, t.length - 1)))
    .join(' ');
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function render() {
  const q = QUIZ_DATA[state.index];
  const total = QUIZ_DATA.length;

  $('#progressBar').style.width = `${(state.index / total) * 100}%`;
  $('#progressText').textContent = `${state.index + 1} / ${total}`;
  $('#quizTitle').textContent = q.title;

  const stage = $('#stage');
  if (state.phase === 'ref') {
    stage.innerHTML = `
      <p class="step-label">1단계 · 성경 구절</p>
      <p class="prompt">「${esc(q.title)}」의 <strong>성경 구절</strong>을 입력하세요.</p>
      <input id="refInput" class="text-input" type="text" autocomplete="off"
             placeholder="예) 요한복음 3장 16절  또는  요 3:16" />
      <p class="help">책 이름 + 장 + 절 (약어·콜론 표기 모두 가능)</p>
      <div class="btn-row">
        <button id="submitBtn" class="btn primary">확인</button>
      </div>`;
    $('#refInput').focus();
    $('#refInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitRef();
    });
    $('#submitBtn').addEventListener('click', submitRef);
  }

  if (state.phase === 'refResult') {
    const r = state.results[state.index];
    stage.innerHTML = `
      <p class="step-label">1단계 · 성경 구절</p>
      <div class="verdict ${r.refOk ? 'good' : 'bad'}">
        ${r.refOk ? '정답입니다' : '틀렸습니다'}
      </div>
      <div class="compare">
        <div class="row"><span class="tag">입력</span><span class="val ${r.refOk ? '' : 'wrong'}">${esc(r.refInput || '(입력 없음)')}</span></div>
        <div class="row"><span class="tag">정답</span><span class="val correct">${esc(q.refDisplay)}</span></div>
      </div>
      <div class="btn-row">
        <button id="nextBtn" class="btn primary">본문 입력하기</button>
      </div>`;
    $('#nextBtn').addEventListener('click', () => {
      state.phase = 'text';
      state.hintUsed = false;
      render();
    });
  }

  if (state.phase === 'text') {
    stage.innerHTML = `
      <p class="step-label">2단계 · 말씀 본문</p>
      <p class="prompt"><strong>${esc(q.refDisplay)}</strong> 본문을 입력하세요.</p>
      <textarea id="textInput" class="text-area" rows="6"
                placeholder="개역개정 본문을 그대로 입력하세요"></textarea>
      <div id="hintBox" class="hint-box" hidden></div>
      <div class="btn-row">
        <button id="hintBtn" class="btn ghost">힌트</button>
        <button id="submitBtn" class="btn primary">채점하기</button>
      </div>
      <p class="help">Ctrl + Enter 로도 채점됩니다.</p>`;
    $('#textInput').focus();
    $('#textInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitText();
    });
    $('#submitBtn').addEventListener('click', submitText);
    $('#hintBtn').addEventListener('click', () => {
      state.hintUsed = true;
      const box = $('#hintBox');
      box.textContent = hintText(q);
      box.hidden = false;
      $('#textInput').focus();
    });
  }

  if (state.phase === 'textResult') {
    const r = state.results[state.index];
    const d = r.diff;
    const userHtml = r.userTokens.length
      ? r.userTokens.map((t, i) => `<span class="tk ${d.userMarks[i]}">${esc(t)}</span>`).join(' ')
      : '<span class="tk bad">(입력 없음)</span>';
    const ansHtml = r.ansTokens
      .map((t, i) => `<span class="tk ${d.ansMarks[i] || 'ok'}">${esc(t)}</span>`)
      .join(' ');

    const grade = d.score === 100 ? 'perfect' : d.score >= 80 ? 'good' : 'bad';
    const label = d.score === 100 ? '완벽합니다' : d.score >= 80 ? '거의 맞았습니다' : '다시 외워봅시다';
    const spNote = d.spacing ? ` · 띄어쓰기 다름 ${d.spacing}곳` : '';

    stage.innerHTML = `
      <p class="step-label">2단계 · 채점 결과</p>
      <div class="score-box ${grade}">
        <div class="score-num">${d.score}<span>점</span></div>
        <div class="score-label">${label} · ${d.matched}/${d.total} 어절 일치${spNote}${r.hintUsed ? ' · 힌트 사용' : ''}</div>
      </div>
      <div class="diff-block">
        <p class="diff-title">내가 쓴 답 <span class="legend bad-legend">틀린 단어</span><span class="legend sp-legend">띄어쓰기</span></p>
        <p class="diff-body">${userHtml}</p>
      </div>
      <div class="diff-block">
        <p class="diff-title">정답 <span class="legend miss-legend">빠뜨린 단어</span></p>
        <p class="diff-body">${ansHtml}</p>
      </div>
      <div class="verse-ref">${esc(q.refDisplay)} (개역개정)</div>
      <div class="btn-row">
        <button id="retryBtn" class="btn ghost">이 문제 다시</button>
        <button id="nextBtn" class="btn primary">${state.index === QUIZ_DATA.length - 1 ? '결과 보기' : '다음 확신'}</button>
      </div>`;
    $('#retryBtn').addEventListener('click', () => {
      state.phase = 'text';
      state.hintUsed = false;
      render();
    });
    $('#nextBtn').addEventListener('click', () => {
      if (state.index === QUIZ_DATA.length - 1) {
        showResult();
      } else {
        state.index++;
        state.phase = 'ref';
        render();
      }
    });
  }
}

/* ---------------- 제출 처리 ---------------- */

function submitRef() {
  const q = QUIZ_DATA[state.index];
  const raw = $('#refInput').value;
  const parsed = parseReference(raw);
  const ok = refMatches(parsed, q);

  state.results[state.index] = {
    id: q.id,
    title: q.title,
    refInput: raw.trim(),
    refOk: ok
  };
  state.phase = 'refResult';
  render();
}

function submitText() {
  const q = QUIZ_DATA[state.index];
  const raw = $('#textInput').value;
  const userTokens = tokenize(raw);
  const ansTokens = tokenize(answerText(q));
  const diff = diffTokens(userTokens, ansTokens);

  const r = state.results[state.index] || { id: q.id, title: q.title, refOk: false, refInput: '' };
  r.userTokens = userTokens;
  r.ansTokens = ansTokens;
  r.diff = diff;
  r.textScore = diff.score;
  r.hintUsed = state.hintUsed;
  state.results[state.index] = r;

  state.phase = 'textResult';
  render();
}

/* ---------------- 화면 전환 ---------------- */

function showScreen(id) {
  ['home', 'quiz', 'result'].forEach((s) => {
    $(`#${s}Screen`).hidden = s !== id;
  });
}

function startQuiz(startIndex = 0) {
  state.index = startIndex;
  state.phase = 'ref';
  state.results = [];
  state.hintUsed = false;
  showScreen('quiz');
  render();
}

function showResult() {
  $('#progressBar').style.width = '100%';
  const rows = state.results
    .map((r, i) => {
      const q = QUIZ_DATA[i];
      return `<tr>
        <td class="n">${i + 1}</td>
        <td class="t">${esc(q.title)}<span class="sub">${esc(q.refDisplay)}</span></td>
        <td class="c">${r.refOk ? '<span class="ok-mark">O</span>' : '<span class="x-mark">X</span>'}</td>
        <td class="c"><strong>${r.textScore ?? 0}</strong></td>
      </tr>`;
    })
    .join('');

  const refCount = state.results.filter((r) => r.refOk).length;
  const avg = Math.round(state.results.reduce((s, r) => s + (r.textScore || 0), 0) / QUIZ_DATA.length);

  $('#resultSummary').innerHTML = `
    <div class="sum-item"><span>구절</span><strong>${refCount} / ${QUIZ_DATA.length}</strong></div>
    <div class="sum-item"><span>본문 평균</span><strong>${avg}점</strong></div>`;
  $('#resultTable').innerHTML = `
    <table>
      <thead><tr><th>#</th><th>확신</th><th>구절</th><th>본문</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  saveRecord(refCount, avg);
  renderHistory();
  showScreen('result');
}

/* ---------------- 기록 (localStorage) ---------------- */

const STORE_KEY = 'gds-assurance-quiz-history';

function saveRecord(refCount, avg) {
  try {
    const hist = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    hist.unshift({ date: new Date().toISOString(), refCount, avg });
    localStorage.setItem(STORE_KEY, JSON.stringify(hist.slice(0, 20)));
  } catch (e) { /* 저장 실패는 무시 */ }
}

function renderHistory() {
  let hist = [];
  try {
    hist = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  } catch (e) { hist = []; }
  if (!hist.length) { $('#history').innerHTML = ''; return; }
  const items = hist
    .slice(0, 5)
    .map((h) => {
      const d = new Date(h.date);
      const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return `<li><span>${when}</span><span>구절 ${h.refCount}/5 · 본문 ${h.avg}점</span></li>`;
    })
    .join('');
  $('#history').innerHTML = `<p class="hist-title">최근 기록</p><ul>${items}</ul>`;
}

/* ---------------- 홈 화면 ---------------- */

function renderHome() {
  $('#verseList').innerHTML = QUIZ_DATA.map(
    (q, i) => `<li><button class="verse-item" data-idx="${i}">
        <span class="num">${i + 1}</span>
        <span class="name">${esc(q.title)}</span>
        <span class="go">시작</span>
      </button></li>`
  ).join('');
  $('#verseList').querySelectorAll('.verse-item').forEach((btn) => {
    btn.addEventListener('click', () => startQuiz(Number(btn.dataset.idx)));
  });
}

/* ---------------- 초기화 ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  renderHome();
  renderHistory();
  $('#startAllBtn').addEventListener('click', () => startQuiz(0));
  $('#homeBtn').addEventListener('click', () => showScreen('home'));
  $('#againBtn').addEventListener('click', () => startQuiz(0));
  $('#resultHomeBtn').addEventListener('click', () => { renderHistory(); showScreen('home'); });
});
