/**********************
 * 設定
 **********************/
const STORAGE_KEY = 'bowlliard_history_v2';

// ★あなたのGAS /exec URLに変更してください
const GAS_URL = "https://script.google.com/macros/s/AKfycbyfCTtZRbDI-n5AZSA-wpB6jowbMf_vpNjij-VopnFYryDkBz-kV5dCYzeeseeNoVcY/exec";

// トークン保護をGAS側で有効にした場合のみ使う
const REQUIRE_TOKEN = false;
const API_TOKEN = "";

/**********************
 * 状態
 **********************/
let rolls = [];
let currentFrame = 1;
let isGameFinished = false;

let currentRankType = 'today'; // 初期：本日
window.currentRankType = currentRankType; // index側の更新ボタン用

const views = {
  game: document.getElementById('view-game'),
  calendar: document.getElementById('view-calendar'),
  stats: document.getElementById('view-stats'),
  ranking: document.getElementById('view-ranking')
};
const tabs = document.querySelectorAll('.tab-btn');

const scoreboardEl = document.getElementById('scoreboard');
const totalScoreEl = document.getElementById('total-score');
const buttons = document.querySelectorAll('#keypad button');

const currentGameRateEl = document.getElementById('current-game-rate');
const historyListEl = document.getElementById('history-list');

const modalEl = document.getElementById('game-detail-modal');
const modalScoreboardEl = document.getElementById('modal-scoreboard');

const dayModalEl = document.getElementById('day-list-modal');
const dayModalListEl = document.getElementById('day-modal-list');

let myChart = null;
let currentCalDate = new Date();

/**********************
 * 初期化
 **********************/
function init() {
  renderScoreboard();
  updateButtonState();
  updateStats();
  renderCalendar(new Date());
  renderHistoryList();
  updateCurrentGameStats();
}
window.addEventListener('DOMContentLoaded', init);

/**********************
 * タブ切替
 **********************/
window.switchTab = function (tabName) {
  Object.values(views).forEach(el => el.classList.remove('active'));
  views[tabName].classList.add('active');

  tabs.forEach((btn, idx) => {
    const names = ['game', 'calendar', 'ranking', 'stats'];
    if (names[idx] === tabName) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  if (tabName === 'stats') updateStats();
  if (tabName === 'calendar') renderCalendar(new Date());
  if (tabName === 'ranking') fetchRanking(currentRankType);
};

/**********************
 * Local History
 **********************/
function getHistory() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function saveHistory(score) {
  const history = getHistory();
  const now = new Date();
  const gameData = { score: score, rolls: [...rolls], timestamp: now.getTime() };
  history.unshift(gameData);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  updateStats();
  renderHistoryList();
}

window.clearHistory = function () {
  if (confirm('全データを削除しますか？')) {
    localStorage.removeItem(STORAGE_KEY);
    updateStats();
    renderCalendar(new Date());
    renderHistoryList();
  }
};

function renderHistoryList() {
  const history = getHistory();
  historyListEl.innerHTML = '';
  if (history.length === 0) return;

  const recent5 = history.slice(0, 5);
  recent5.forEach(h => {
    const d = new Date(h.timestamp);
    const dateStr = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const li = document.createElement('li');
    li.className = 'history-item';
    li.onclick = function () { openGameDetail(h); };
    li.innerHTML = `<span class="h-date">${dateStr}</span><span class="h-score">${h.score}</span>`;
    historyListEl.appendChild(li);
  });
}

/**********************
 * 日付整形
 **********************/
function formatDateString(val) {
  if (val === null || val === undefined || val === '') return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

function formatDateTimeString(val) {
  if (val === null || val === undefined || val === '') return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatTimeString(val) {
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/**********************
 * モーダル（ゲーム詳細）
 **********************/
window.openGameDetail = function (gameData, playerName = null) {
  if (!gameData || !gameData.rolls) {
    alert("詳細データがありません。");
    return;
  }

  const titleEl = document.getElementById('modal-title-text');
  titleEl.textContent = playerName ? playerName : "Game Details";

  document.getElementById('modal-date').textContent = formatDateTimeString(gameData.timestamp);

  document.getElementById('modal-score').textContent = gameData.score;
  document.getElementById('modal-rate').textContent = calculateShootRate(gameData.rolls) + "%";

  renderScoreboardToTarget(gameData.rolls, modalScoreboardEl);

  // ★修正: Day Records が開いたままでも、詳細を確実に見せるため閉じる（保険）
  dayModalEl.classList.remove('show');

  modalEl.classList.add('show');

  if (playerName) {
    fetchPlayerStats(playerName);
  } else {
    hidePlayerStats();
  }
};

window.closeModal = function () { modalEl.classList.remove('show'); };
modalEl.onclick = function (e) { if (e.target === modalEl) window.closeModal(); };

/**********************
 * モーダル（カレンダー：その日の全記録）
 **********************/
function openDayModal(year, monthIndex, day, games) {
  const dateLabel = `${year}/${monthIndex + 1}/${day}`;
  document.getElementById('day-modal-date').textContent = dateLabel;
  document.getElementById('day-modal-title').textContent = `Day Records`;
  document.getElementById('day-modal-summary').textContent = `${games.length}件（新しい順）`;

  dayModalListEl.innerHTML = '';

  const sorted = [...games].sort((a, b) => b.timestamp - a.timestamp);
  sorted.forEach(g => {
    const li = document.createElement('li');
    li.className = 'history-item';
    const t = formatTimeString(g.timestamp);
    const rate = (g.rolls && g.rolls.length) ? `${calculateShootRate(g.rolls)}%` : '---%';
    li.innerHTML = `<span class="h-date">${t} / ${rate}</span><span class="h-score">${g.score}</span>`;

    // ★修正: Day Records を閉じてから詳細を開く（本命）
    li.onclick = () => {
      window.closeDayModal();
      requestAnimationFrame(() => window.openGameDetail(g));
    };

    dayModalListEl.appendChild(li);
  });

  dayModalEl.classList.add('show');
}

window.closeDayModal = function () { dayModalEl.classList.remove('show'); };
dayModalEl.onclick = function (e) { if (e.target === dayModalEl) window.closeDayModal(); };

/**********************
 * プレイヤー能力（GAS：直近20 / 選択タブ期間内）
 **********************/
function hidePlayerStats() {
  const box = document.getElementById('player-stats-box');
  if (box) box.style.display = 'none';
}

function setPlayerStatsLoading(playerName) {
  const box = document.getElementById('player-stats-box');
  if (!box) return;
  box.style.display = 'block';
  document.getElementById('player-stats-title').textContent = `${playerName}：直近20ゲーム（集計中...）`;
  document.getElementById('ps-potting').textContent = '---';
  document.getElementById('ps-bpm').textContent = '---';
  document.getElementById('ps-x').textContent = '---';
  document.getElementById('ps-spare').textContent = '---';
  document.getElementById('ps-open').textContent = '---';
  document.getElementById('ps-score').textContent = '---';
}

function renderPlayerStats(playerName, s) {
  const box = document.getElementById('player-stats-box');
  if (!box) return;

  if (!s || s.ok !== true || !s.games) {
    box.style.display = 'block';
    document.getElementById('player-stats-title').textContent = `${playerName}：直近20ゲーム（データ不足）`;
    return;
  }

  box.style.display = 'block';

  const from = new Date(s.fromTs);
  const to = new Date(s.toTs);
  const range = `${from.getFullYear()}/${from.getMonth()+1}/${from.getDate()}〜${to.getFullYear()}/${to.getMonth()+1}/${to.getDate()}`;

  document.getElementById('player-stats-title').textContent =
    `${playerName}：直近${s.games}${s.games < s.recent ? `/${s.recent}` : ''}ゲーム（${range}）`;

  // ※ここに入ってくる strike/spare/open は GAS側も全体比に揃える前提
  document.getElementById('ps-potting').textContent = `${s.pottingPct}%`;
  document.getElementById('ps-bpm').textContent = (s.avgPins == null) ? '---' : `${s.avgPins}`;
  document.getElementById('ps-x').textContent = `${s.strikePct}%`;
  document.getElementById('ps-spare').textContent = `${s.sparePct}%`;
  document.getElementById('ps-open').textContent = `${s.openPct}%`;
  document.getElementById('ps-score').textContent = `${s.avgScore} / ${s.highScore ?? '---'}`;
}

function getRankBasis(type) {
  if (type === 'month' || type === 'year') return 'calendar';
  return 'rolling';
}

function fetchPlayerStats(playerName) {
  setPlayerStatsLoading(playerName);

  const type = currentRankType;
  const basis = getRankBasis(type);

  const params = new URLSearchParams();
  params.set('player', playerName);
  params.set('recent', '20');
  params.set('type', type);
  params.set('basis', basis);
  params.set('_', String(Date.now()));
  if (REQUIRE_TOKEN) params.set('token', API_TOKEN);

  const url = `${GAS_URL}?${params.toString()}`;

  fetch(url, { cache: "no-store" })
    .then(r => r.json())
    .then(data => renderPlayerStats(playerName, data))
    .catch(() => renderPlayerStats(playerName, { ok:false }));
}

/**********************
 * GASへ登録（POST）
 **********************/
window.sendToRanking = function (btnElement) {
  const history = getHistory();
  if (history.length === 0) { alert("送信するデータがありません。"); return; }

  const lastGame = history[0];
  const rate = calculateShootRate(lastGame.rolls);
  const currentAvg = document.getElementById('stat-avg').textContent;

  const playerName = prompt("ランキングに登録する名前を入力してください:", localStorage.getItem('last_player_name') || "");
  if (!playerName) return;

  localStorage.setItem('last_player_name', playerName);

  if (!confirm(`${playerName} さん\nスコア: ${lastGame.score}\nシュート率: ${rate}%\nAvg: ${currentAvg}\n\nこのスコアをRankingsに登録しますか？`)) return;

  const originalText = btnElement.innerText;
  btnElement.innerText = "送信中...";
  btnElement.disabled = true;

  const payload = {
    name: playerName,
    score: lastGame.score,
    rate: rate,
    avg: currentAvg,
    rolls: lastGame.rolls
  };

  fetch(GAS_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(() => {
    alert("登録完了！Rankingsタブで確認できます。");
    btnElement.innerText = originalText;
    btnElement.disabled = false;
  }).catch(err => {
    alert("送信エラー: " + err);
    btnElement.innerText = originalText;
    btnElement.disabled = false;
  });
};

/**********************
 * Ranking（一覧：ベスト＋能力(直近20)表示）
 **********************/
window.switchRankType = function (type, btn) {
  currentRankType = type;
  window.currentRankType = currentRankType;
  document.querySelectorAll('.rank-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  fetchRanking(type);
};

window.fetchRanking = function (type = 'today') {
  const loadingEl = document.getElementById('ranking-loading');
  const listEl = document.getElementById('ranking-list');
  const errorEl = document.getElementById('ranking-error');

  listEl.innerHTML = '';
  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';

  const basis = getRankBasis(type);

  const params = new URLSearchParams();
  params.set('type', type);
  params.set('basis', basis);
  params.set('recent', '20');
  params.set('limit', '50');
  params.set('_', String(Date.now()));
  if (REQUIRE_TOKEN) params.set('token', API_TOKEN);

  const fetchUrl = `${GAS_URL}?${params.toString()}`;

  fetch(fetchUrl, { cache: "no-store" })
    .then(res => res.json())
    .then(data => {
      loadingEl.style.display = 'none';

      if (!data || data.length === 0) {
        listEl.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#888;">データがありません</td></tr>';
        return;
      }

      data.forEach((row) => {
        // GAS返却（ランキング）:
        // [0]rank [1]bestTs [2]name [3]bestScore [4]potting [5]avgPins [6]strike [7]spare [8]open [9]avgScore [10]highScore [11]games [12]bestRollsJson
        const rank = row[0];
        const bestTs = row[1];
        const name = row[2];
        const bestScore = row[3];

        const potting = row[4];
        const avgPins = row[5];
        const xPct = row[6];
        const sparePct = row[7];
        const openPct = row[8];
        const avgScore = row[9];
        const highScore = row[10];
        const gamesCount = row[11];
        const rollsJson = row[12];

        const dateStr = formatDateString(bestTs);

        let rankClass = 'rank-other';
        if (rank === 1) rankClass = 'rank-1';
        else if (rank === 2) rankClass = 'rank-2';
        else if (rank === 3) rankClass = 'rank-3';

        const avgPinsText = (avgPins === null || avgPins === undefined) ? '---' : avgPins;

        const tr = document.createElement('tr');
        tr.className = rankClass;

        tr.innerHTML = `
          <td style="text-align:center;">
            <div class="rank-badge">${rank}</div>
          </td>
          <td class="rank-player-cell">
            <span class="rank-name">${name}</span>
            <span class="rank-date">Best: ${dateStr} / 直近${gamesCount}G</span>
          </td>
          <td class="rank-stats-cell">
            <div class="rank-score">${bestScore}</div>
            <span class="rank-sub-stats">
              シュート率: ${potting}% | 平均入れ球: ${avgPinsText} | ストライク率: ${xPct}% | スペア率: ${sparePct}% | オープン率: ${openPct}%<br>
              Avg: ${avgScore} | High(20): ${highScore ?? '---'}
            </span>
          </td>
        `;

        tr.onclick = function () {
          if (rollsJson) {
            try {
              const r = JSON.parse(rollsJson);
              openGameDetail({ score: bestScore, rolls: r, timestamp: bestTs }, name);
            } catch (e) {
              alert("詳細データ形式エラー");
            }
          } else {
            alert("詳細データがありません（過去ログが旧形式の可能性）");
          }
        };

        listEl.appendChild(tr);
      });
    })
    .catch(err => {
      loadingEl.style.display = 'none';
      errorEl.style.display = 'block';
      errorEl.textContent = '取得失敗: ' + err;
    });
};

/**********************
 * スコアボード描画（共通）
 **********************/
function renderScoreboardToTarget(targetRolls, targetEl) {
  targetEl.innerHTML = '';
  let rollIndex = 0;
  let cumulativeScore = 0;

  for (let f = 1; f <= 10; f++) {
    const frameDiv = document.createElement('div');
    frameDiv.className = 'frame';
    if (f === currentFrame && !isGameFinished && targetEl === scoreboardEl) frameDiv.classList.add('active');

    const header = document.createElement('div');
    header.className = 'frame-header';
    header.textContent = f;
    frameDiv.appendChild(header);

    const rollsDiv = document.createElement('div');
    rollsDiv.className = 'rolls';

    let frameScore = calcFrameScoreWithRolls(f, rollIndex, targetRolls);

    let r1 = targetRolls[rollIndex], r2 = targetRolls[rollIndex + 1];

    if (f < 10) {
      const box1 = document.createElement('div');
      box1.className = 'roll-box';
      if (r1 !== undefined) box1.textContent = (r1 === 10 ? 'X' : (r1 === 0 ? '-' : r1));
      rollsDiv.appendChild(box1);

      const box2 = document.createElement('div');
      box2.className = 'roll-box';

      if (r1 === 10) {
        rollIndex++;
        const empty = document.createElement('div');
        empty.className = 'roll-box';
        rollsDiv.appendChild(empty);
      } else {
        if (r1 !== undefined) {
          if (r2 !== undefined) {
            box2.textContent = (r1 + r2 === 10) ? '/' : (r2 === 0 ? '-' : r2);
            rollIndex += 2;
          } else {
            rollIndex = 9999;
          }
          rollsDiv.appendChild(box2);
        } else {
          rollIndex = 9999;
        }
      }
    } else {
      let localIdx = rollIndex;
      let f10_r1 = targetRolls[localIdx];
      let f10_r2 = targetRolls[localIdx + 1];
      let f10_r3 = targetRolls[localIdx + 2];

      const b1 = document.createElement('div');
      b1.className = 'roll-box';
      if (f10_r1 !== undefined) b1.textContent = (f10_r1 === 10 ? 'X' : (f10_r1 === 0 ? '-' : f10_r1));
      rollsDiv.appendChild(b1);

      const b2 = document.createElement('div');
      b2.className = 'roll-box';
      if (f10_r2 !== undefined) {
        if (f10_r1 === 10) b2.textContent = (f10_r2 === 10 ? 'X' : (f10_r2 === 0 ? '-' : f10_r2));
        else b2.textContent = (f10_r1 + f10_r2 === 10 ? '/' : (f10_r2 === 0 ? '-' : f10_r2));
      }
      rollsDiv.appendChild(b2);

      const b3 = document.createElement('div');
      b3.className = 'roll-box';
      if (f10_r3 !== undefined) {
        if (f10_r3 === 10) b3.textContent = 'X';
        else if (f10_r1 === 10 && f10_r2 !== 10 && f10_r2 + f10_r3 === 10) b3.textContent = '/';
        else b3.textContent = (f10_r3 === 0 ? '-' : f10_r3);
      }
      rollsDiv.appendChild(b3);

      if (f10_r1 !== undefined) {
        if (f10_r1 === 10 || f10_r1 + (f10_r2 || 0) === 10) {
          if (f10_r3 !== undefined) rollIndex += 3;
          else rollIndex = 9999;
        } else {
          if (f10_r2 !== undefined) rollIndex += 2;
          else rollIndex = 9999;
        }
      } else {
        rollIndex = 9999;
      }
    }

    frameDiv.appendChild(rollsDiv);

    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'frame-score';
    if (frameScore !== null) {
      cumulativeScore += frameScore;
      scoreDiv.textContent = cumulativeScore;
    }
    frameDiv.appendChild(scoreDiv);

    targetEl.appendChild(frameDiv);
  }
}

function calcFrameScoreWithRolls(frame, startIndex, targetRolls) {
  if (startIndex >= targetRolls.length) return null;

  const rollsData = targetRolls;

  if (frame === 10) {
    let r1 = rollsData[startIndex];
    let r2 = rollsData[startIndex + 1];
    let r3 = rollsData[startIndex + 2];
    if (r1 === undefined) return null;

    if (r1 === 10 || (r2 !== undefined && r1 + r2 === 10)) {
      if (r3 !== undefined) return r1 + r2 + r3;
      return null;
    } else {
      if (r2 !== undefined) return r1 + r2;
      return null;
    }
  }

  let r1 = rollsData[startIndex];
  let r2 = rollsData[startIndex + 1];
  let r3 = rollsData[startIndex + 2];

  if (r1 === 10) {
    if (r2 !== undefined && r3 !== undefined) return 10 + r2 + r3;
    return null;
  }
  if (r2 !== undefined) {
    if (r1 + r2 === 10) {
      if (r3 !== undefined) return 10 + r3;
      return null;
    }
    return r1 + r2;
  }
  return null;
}

/**********************
 * シュート率（成功球 / (成功球+ミス)）
 **********************/
function calcMissesFromRolls(rollsData) {
  let misses = 0;
  let idx = 0;

  for (let f = 1; f <= 9; f++) {
    const r1 = rollsData[idx];
    if (r1 === undefined) return misses;

    if (r1 === 10) { idx += 1; continue; }

    misses += 1;
    const r2 = rollsData[idx + 1];
    if (r2 === undefined) return misses;

    if (r1 + r2 < 10) misses += 1;
    idx += 2;
  }

  const r1 = rollsData[idx];
  if (r1 === undefined) return misses;

  if (r1 === 10) {
    const r2 = rollsData[idx + 1];
    if (r2 === undefined) return misses;

    if (r2 === 10) {
      const r3 = rollsData[idx + 2];
      if (r3 === undefined) return misses;
      if (r3 < 10) misses += 1;
      return misses;
    } else {
      misses += 1;
      const r3 = rollsData[idx + 2];
      if (r3 === undefined) return misses;
      if (r2 + r3 < 10) misses += 1;
      return misses;
    }
  } else {
    misses += 1;
    const r2 = rollsData[idx + 1];
    if (r2 === undefined) return misses;

    if (r1 + r2 === 10) {
      const r3 = rollsData[idx + 2];
      if (r3 === undefined) return misses;
      if (r3 < 10) misses += 1;
      return misses;
    } else {
      misses += 1;
      return misses;
    }
  }
}

function calculateShootRate(rollsData) {
  let potted = 0;
  for (const v of rollsData) potted += Number(v || 0);
  const misses = calcMissesFromRolls(rollsData);
  const attempts = potted + misses;
  return attempts ? ((potted / attempts) * 100).toFixed(1) : 0;
}

function calcFrameOutcomes(rollsData) {
  let idx = 0;
  let strike = 0, spare = 0, open = 0, spareOpp = 0;

  for (let f = 1; f <= 9; f++) {
    const r1 = rollsData[idx];
    if (r1 === undefined) break;

    if (r1 === 10) {
      strike += 1;
      idx += 1;
    } else {
      const r2 = rollsData[idx + 1];
      if (r2 === undefined) break;

      spareOpp += 1;
      if (r1 + r2 === 10) spare += 1;
      else open += 1;

      idx += 2;
    }
  }

  const r1 = rollsData[idx];
  if (r1 === undefined) return { strike, spare, open, spareOpp };

  if (r1 === 10) {
    strike += 1;
  } else {
    const r2 = rollsData[idx + 1];
    if (r2 !== undefined) {
      spareOpp += 1;
      if (r1 + r2 === 10) spare += 1;
      else open += 1;
    }
  }
  return { strike, spare, open, spareOpp };
}

function updateCurrentGameStats() {
  if (rolls.length === 0) currentGameRateEl.textContent = "---%";
  else currentGameRateEl.textContent = calculateShootRate(rolls) + "%";
}

/**********************
 * Stats（直近20）
 * 表記：シュート率 / ストライク率 / スペア率 / オープン率 / 平均入れ球（1投あたり）
 **********************/
function updateStats() {
  const history = getHistory();

  const elPotting = document.getElementById('stat-potting');
  const elStrike = document.getElementById('stat-strike');
  const elSpare  = document.getElementById('stat-spare');
  const elOpen   = document.getElementById('stat-open');
  const elBalls  = document.getElementById('stat-balls');
  const elAvg    = document.getElementById('stat-avg');
  const elHigh   = document.getElementById('stat-high');

  if (history.length === 0) {
    elPotting.textContent = "---%";
    elStrike.textContent = "---%";
    elSpare.textContent = "---%";
    elOpen.textContent = "---%";
    elBalls.textContent = "---";
    elAvg.textContent = "---";
    elHigh.textContent = "---";
    if (myChart) myChart.destroy();
    return;
  }

  const allTimeHigh = Math.max(...history.map(g => g.score));
  const recent20 = history.slice(0, 20);

  const totalScore = recent20.reduce((a, b) => a + b.score, 0);
  const avg20 = (totalScore / recent20.length).toFixed(0);

  let totalPotted = 0;
  let totalMisses = 0;
  let totalRollsCount = 0;

  let strikeFrames = 0;
  let spareFrames = 0;
  let openFrames = 0;

  let validGames = 0;

  recent20.forEach(g => {
    if (!g.rolls || g.rolls.length === 0) return;
    validGames += 1;

    let potted = 0;
    for (const v of g.rolls) potted += Number(v || 0);

    totalPotted += potted;
    totalRollsCount += g.rolls.length;

    const misses = calcMissesFromRolls(g.rolls);
    totalMisses += misses;

    const out = calcFrameOutcomes(g.rolls);
    strikeFrames += out.strike;
    spareFrames  += out.spare;
    openFrames   += out.open;
  });

  const attempts = totalPotted + totalMisses;
  const shootPct = attempts ? (totalPotted / attempts) * 100 : 0;

  // ★ここが修正点：スペア/オープンも「全体比（分母＝総フレーム）」に統一
  const framesTotal = validGames ? (validGames * 10) : 0;
  const strikePct = framesTotal ? (strikeFrames / framesTotal) * 100 : 0;
  const sparePct  = framesTotal ? (spareFrames  / framesTotal) * 100 : 0;
  const openPct   = framesTotal ? (openFrames   / framesTotal) * 100 : 0;

  // ★平均入れ球（1投あたり平均ピン）
  const avgPins = totalRollsCount ? (totalPotted / totalRollsCount) : 0;

  elPotting.textContent = shootPct.toFixed(1) + "%";
  elStrike.textContent = strikePct.toFixed(1) + "%";
  elSpare.textContent  = sparePct.toFixed(1) + "%";
  elOpen.textContent   = openPct.toFixed(1) + "%";
  elBalls.textContent  = avgPins.toFixed(2);

  elAvg.textContent = avg20;
  elHigh.textContent = allTimeHigh;

  renderChart(recent20);
}

function renderChart(data) {
  const ctx = document.getElementById('scoreChart').getContext('2d');
  const chartData = [...data].reverse();
  const labels = chartData.map((d, i) => i + 1);
  const scores = chartData.map(d => d.score);

  if (myChart) myChart.destroy();

  myChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Score',
        data: scores,
        borderColor: '#00e676',
        backgroundColor: 'rgba(0, 230, 118, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#fff',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, max: 300, grid: { color: '#333' }, ticks: { color: '#888' } },
        x: { display: false }
      }
    }
  });
}

/**********************
 * Calendar（その日の全記録）
 **********************/
window.changeMonth = function (diff) {
  currentCalDate.setMonth(currentCalDate.getMonth() + diff);
  renderCalendar(currentCalDate);
};

function renderCalendar(date) {
  const year = date.getFullYear();
  const month = date.getMonth();

  document.getElementById('cal-month-label').textContent = `${year} / ${month + 1}`;

  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const calBody = document.getElementById('calendar-body');
  calBody.innerHTML = '';

  const history = getHistory();

  const dailyGames = {};
  history.forEach(h => {
    const d = new Date(h.timestamp);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const dayKey = d.getDate();
      if (!dailyGames[dayKey]) dailyGames[dayKey] = [];
      dailyGames[dayKey].push(h);
    }
  });

  for (let i = 0; i < firstDay; i++) calBody.appendChild(document.createElement('div'));

  const today = new Date();
  for (let d = 1; d <= lastDate; d++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'day';

    const dayNum = document.createElement('div');
    dayNum.textContent = d;
    dayCell.appendChild(dayNum);

    if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) {
      dayCell.classList.add('today');
    }

    if (dailyGames[d] && dailyGames[d].length > 0) {
      dayCell.classList.add('has-game');

      const best = dailyGames[d].reduce((a, b) => (b.score > a.score ? b : a), dailyGames[d][0]);

      const scoreSpan = document.createElement('div');
      scoreSpan.className = 'day-score';
      scoreSpan.textContent = best.score;
      dayCell.appendChild(scoreSpan);

      const countSpan = document.createElement('div');
      countSpan.className = 'day-count';
      countSpan.textContent = `${dailyGames[d].length}件`;
      dayCell.appendChild(countSpan);

      dayCell.onclick = function () {
        openDayModal(year, month, d, dailyGames[d]);
      };
    }

    calBody.appendChild(dayCell);
  }
}

/**********************
 * Game input
 **********************/
function renderScoreboard() {
  renderScoreboardToTarget(rolls, scoreboardEl);

  let rollIndex = 0;
  let cumulativeScore = 0;
  for (let f = 1; f <= 10; f++) {
    let fs = calcFrameScoreWithRolls(f, rollIndex, rolls);
    if (fs !== null) cumulativeScore += fs;

    if (f < 10) {
      if (rolls[rollIndex] === 10) rollIndex++;
      else rollIndex += 2;
    }
  }

  totalScoreEl.textContent = cumulativeScore;
  return cumulativeScore;
}

window.addScore = function (pins) {
  if (isGameFinished) {
    rolls = [];
    currentFrame = 1;
    isGameFinished = false;
    renderScoreboard();
    updateButtonState();
    updateCurrentGameStats();
  }

  rolls.push(pins);
  updateGameStatus();
  const currentScore = renderScoreboard();

  updateButtonState();
  updateCurrentGameStats();

  if (currentFrame > 10) {
    isGameFinished = true;
    saveHistory(currentScore);
    renderScoreboard();
    updateButtonState();
    setTimeout(() => alert(`ゲーム終了！スコア: ${currentScore}`), 100);
  }
};

function updateGameStatus() {
  let f = 1;
  let idx = 0;

  while (f <= 10 && idx < rolls.length) {
    let r1 = rolls[idx];

    if (f < 10) {
      if (r1 === 10) { idx++; f++; }
      else {
        if (rolls[idx + 1] !== undefined) { idx += 2; f++; }
        else break;
      }
    } else {
      let r2 = rolls[idx + 1];
      let r3 = rolls[idx + 2];
      if (r2 === undefined) break;

      if (r1 === 10 || r1 + r2 === 10) {
        if (r3 !== undefined) { f++; idx += 3; }
        else break;
      } else {
        f++; idx += 2;
      }
    }
  }
  currentFrame = f;
}

function updateButtonState() {
  if (isGameFinished) {
    for (let i = 0; i <= 10; i++) buttons[i].disabled = false;
    document.getElementById('game-ranking-area').style.display = 'block';
    return;
  } else {
    document.getElementById('game-ranking-area').style.display = 'none';
  }

  let idx = 0;
  for (let f = 1; f < currentFrame; f++) {
    if (rolls[idx] === 10) idx++;
    else idx += 2;
  }

  let frameRolls = [];
  for (let i = idx; i < rolls.length; i++) frameRolls.push(rolls[i]);

  let maxPins = 10;

  if (currentFrame < 10) {
    if (frameRolls.length === 1) maxPins = 10 - frameRolls[0];
  } else {
    if (frameRolls.length === 1) {
      if (frameRolls[0] < 10) maxPins = 10 - frameRolls[0];
    } else if (frameRolls.length === 2) {
      if (frameRolls[0] === 10 && frameRolls[1] < 10) maxPins = 10 - frameRolls[1];
      else if (frameRolls[0] + frameRolls[1] === 10 || (frameRolls[0] === 10 && frameRolls[1] === 10)) maxPins = 10;
    }
  }

  for (let score = 0; score <= 10; score++) {
    const btn = buttons[score];
    btn.disabled = (score > maxPins);
  }
}

window.undo = function () {
  if (isGameFinished) isGameFinished = false;
  if (rolls.length > 0) {
    rolls.pop();
    updateGameStatus();
    renderScoreboard();
    updateButtonState();
    updateCurrentGameStats();
  }
};

window.resetGame = function () {
  if (confirm('現在のゲームをリセットしますか？')) {
    rolls = [];
    currentFrame = 1;
    isGameFinished = false;
    renderScoreboard();
    updateButtonState();
    updateCurrentGameStats();
  }
};
