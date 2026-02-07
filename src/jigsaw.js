// ========================================
// 愛知県ジグソーパズルゲーム
// ========================================

// ========================================
// Union-Find（グループ管理）
// ========================================
class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  // ピースを追加
  add(id) {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
      this.rank.set(id, 0);
    }
  }

  // ルート要素を取得
  find(id) {
    if (!this.parent.has(id)) {
      this.add(id);
    }
    if (this.parent.get(id) !== id) {
      this.parent.set(id, this.find(this.parent.get(id)));
    }
    return this.parent.get(id);
  }

  // 2つのグループを結合
  union(id1, id2) {
    const root1 = this.find(id1);
    const root2 = this.find(id2);

    if (root1 === root2) return false;

    const rank1 = this.rank.get(root1);
    const rank2 = this.rank.get(root2);

    if (rank1 < rank2) {
      this.parent.set(root1, root2);
    } else if (rank1 > rank2) {
      this.parent.set(root2, root1);
    } else {
      this.parent.set(root2, root1);
      this.rank.set(root1, rank1 + 1);
    }
    return true;
  }

  // 同じグループに属するか
  connected(id1, id2) {
    return this.find(id1) === this.find(id2);
  }

  // グループのメンバーを取得
  getGroup(id) {
    const root = this.find(id);
    const members = [];
    for (const [memberId, _] of this.parent) {
      if (this.find(memberId) === root) {
        members.push(memberId);
      }
    }
    return members;
  }

  // リセット
  clear() {
    this.parent.clear();
    this.rank.clear();
  }
}

// レベル設定
const LEVELS = {
  1: {
    name: 'カラー',
    backgroundImage: 'img/愛知県全図color.png',
    piecesDir: 'color_cities/'
  },
  2: {
    name: 'グレー',
    backgroundImage: 'img/愛知県全図.png',
    piecesDir: 'color_cities/' // ピースは同じ
  },
  3: {
    name: 'ハード',
    backgroundImage: 'img/hard.png',
    piecesDir: 'color_cities/' // ピースは同じ
  },
  4: {
    name: 'エクストラ',
    backgroundImage: 'img/Ex.png',
    piecesDir: 'color_cities/' // ピースは同じ
  }
};

// ゲーム状態
const gameState = {
  pieces: [],
  lockedPieces: new Set(),
  currentScale: 0.3, // 初期ズーム30% (ユーザー要望)
  startTime: null,
  timerInterval: null,
  isDragging: false,
  coordinates: null,
  snapDistance: 20,
  autoLock: true,
  currentLevel: 1,
  unionFind: new UnionFind(),
  adjacencyMap: new Map(), // 隣接関係マップ
  isPanning: false, // パン中かどうか
  isAdmin: false,
  coordinates: null,
  cityData: {}, // 市町村情報 (id -> {name, description})
  adminMode: new URLSearchParams(window.location.search).has('admin') // 管理者モード
};

// ドラッグ状態
let activePiece = null;
let activeGroup = [];
let offsetX = 0;
let offsetY = 0;
let groupOffsets = new Map(); // グループ内各ピースの相対オフセット

// パン状態
let isSpacePressed = false;
let isRightMousePressed = false;
let panStartX = 0;
let panStartY = 0;
let panScrollStartX = 0;
let panScrollStartY = 0;

// DOM要素
const workspace = document.getElementById('workspace');
const piecesContainer = document.getElementById('pieces-container');
const backgroundImg = document.getElementById('background-img');
const completionOverlay = document.getElementById('completion-overlay');
const tutorialModal = document.getElementById('tutorial-modal');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');

// 統計表示要素
const completionRateEl = document.getElementById('completion-rate');
const placedPiecesEl = document.getElementById('placed-pieces');
const elapsedTimeEl = document.getElementById('elapsed-time');
const progressCircleEl = document.getElementById('progress-circle');
const zoomFillEl = document.getElementById('zoom-fill');
const finalTimeEl = document.getElementById('final-time');
const infoPanel = document.getElementById('info-panel');
const infoName = document.getElementById('info-name');
const infoDescription = document.getElementById('info-description');

// ========================================
// ヘルパー: フォールバック付きフェッチ
// ========================================

async function smartFetch(url) {
  // そのまま試行
  let response = await fetch(url);
  if (response.ok) return response;

  // 404の場合、public/ プレフィックスを付けて再試行 (Live Server等への対応)
  if (response.status === 404 && !url.startsWith('public/')) {
    const fallbackUrl = 'public/' + url;
    console.log(`⚠️ 404: 別のパスを試行中... -> ${fallbackUrl}`);
    response = await fetch(fallbackUrl);
    if (response.ok) return response;
  }

  throw new Error(`Failed to fetch ${url} (Status: ${response.status})`);
}

/**
 * 市町村情報を読み込む
 */
async function loadCityData() {
  try {
    const response = await smartFetch('data/cities.csv');
    const text = await response.text();
    const lines = text.split('\n');

    // ヘッダーを飛ばして各行を処理
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // CSVのパース (簡易版: カンマで分割。ダブルクォートなどは考慮しない)
      const parts = line.split(',');
      if (parts.length >= 2) {
        const id = parts[0].trim();
        const name = parts[1].trim();
        const description = parts.slice(2).join(',').trim(); // 残りは全て説明

        gameState.cityData[id] = { name, description };
      }
    }
    console.log(`✓ ${Object.keys(gameState.cityData).length}件の市町村情報を読み込みました`);
  } catch (error) {
    console.error('市町村情報の読み込みに失敗:', error);
  }
}

// ========================================
// 初期化
// ========================================

async function init() {
  console.log('🎮 ゲームを初期化中...');

  // 座標データを読み込む
  try {
    const response = await smartFetch('data/coordinates.json');
    gameState.coordinates = await response.json();
    console.log(`✓ ${Object.keys(gameState.coordinates).length}個のピース座標を読み込みました`);

    // 市町村情報を読み込む
    await loadCityData();
  } catch (error) {
    console.error('❌ データの読み込みに失敗:', error);
    alert(`データの読み込みに失敗しました。\n環境設定を確認してください。\nError: ${error.message}`);
    return;
  }

  // 背景画像のロードを待つ
  await new Promise((resolve) => {
    if (backgroundImg.complete) {
      resolve();
    } else {
      backgroundImg.onload = resolve;
    }
  });

  console.log(`✓ 背景画像サイズ: ${backgroundImg.naturalWidth}x${backgroundImg.naturalHeight}`);

  // ワークスペースのサイズを設定
  workspace.style.width = backgroundImg.naturalWidth + 2000 + 'px';
  workspace.style.height = backgroundImg.naturalHeight + 2000 + 'px';

  // 初期ズームを適用
  applyZoom(gameState.currentScale);

  // 隣接関係を計算
  buildAdjacencyMap();

  // ピースを作成
  createPieces();

  // イベントリスナーを設定
  setupEventListeners();

  // ピースをシャッフル
  shufflePieces();

  console.log('✅ 初期化完了！');
}

// ========================================
// 隣接関係の計算
// ========================================

function buildAdjacencyMap() {
  gameState.adjacencyMap.clear();

  const pieces = Object.entries(gameState.coordinates)
    .filter(([_, data]) => !data.error)
    .map(([id, data]) => ({
      id,
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height
    }));

  // 各ピースについて隣接するピースを検出
  for (let i = 0; i < pieces.length; i++) {
    const piece1 = pieces[i];
    const neighbors = [];

    for (let j = 0; j < pieces.length; j++) {
      if (i === j) continue;

      const piece2 = pieces[j];

      // 矩形の重なりや隣接をチェック
      if (isAdjacent(piece1, piece2)) {
        neighbors.push(piece2.id);
      }
    }

    gameState.adjacencyMap.set(piece1.id, neighbors);
  }

  console.log(`✓ 隣接関係を計算しました (${gameState.adjacencyMap.size}ピース)`);
}

function isAdjacent(piece1, piece2) {
  const threshold = 5; // 隣接判定の閾値（ピクセル）

  // 矩形の定義
  const r1 = {
    left: piece1.x,
    right: piece1.x + piece1.width,
    top: piece1.y,
    bottom: piece1.y + piece1.height
  };

  const r2 = {
    left: piece2.x,
    right: piece2.x + piece2.width,
    top: piece2.y,
    bottom: piece2.y + piece2.height
  };

  // 縦方向の重なりチェック
  const verticalOverlap = !(r1.bottom < r2.top || r1.top > r2.bottom);

  // 横方向の重なりチェック
  const horizontalOverlap = !(r1.right < r2.left || r1.left > r2.right);

  // 隣接判定
  // 左右に隣接
  const adjacentHorizontal = verticalOverlap &&
    (Math.abs(r1.right - r2.left) <= threshold || Math.abs(r1.left - r2.right) <= threshold);

  // 上下に隣接
  const adjacentVertical = horizontalOverlap &&
    (Math.abs(r1.bottom - r2.top) <= threshold || Math.abs(r1.top - r2.bottom) <= threshold);

  return adjacentHorizontal || adjacentVertical;
}

// ========================================
// ピース作成
// ========================================

function createPieces() {
  const pieceFiles = Object.keys(gameState.coordinates).sort();
  const currentLevelConfig = LEVELS[gameState.currentLevel];

  pieceFiles.forEach((filename, index) => {
    const data = gameState.coordinates[filename];

    // エラーのあるピースはスキップ
    if (data.error) {
      console.warn(`⚠ ${filename} はエラーがあるためスキップします`);
      return;
    }

    const img = document.createElement('img');
    const pieceUrl = currentLevelConfig.piecesDir + filename;

    // ピース画像のURLも環境に合わせて調整（Live Server対応）
    // imgタグのsrcによる非同期ロードへの対応として、まず存在を確認
    smartFetch(pieceUrl).then(resp => {
      img.src = resp.url; // 解決されたURL（フォールバック済みかもしれない）を使用
    }).catch(() => {
      img.src = pieceUrl; // 失敗しても元のパスを設定（ブラウザのデフォルト挙動に任せる）
    });

    img.className = 'puzzle-piece';
    img.dataset.id = filename;
    img.dataset.correctX = data.x;
    img.dataset.correctY = data.y;
    img.draggable = false;

    // 面積が小さいほど z-index を高く設定する (ユーザー要望: 掴む優先度)
    // 65ピースあるので、一旦大きな範囲で設定
    const area = data.width * data.height;
    // 基準となる面積（例: 50x50=2500）よりどのくらい小さいか
    // 最大面積を10000程度と想定し、z-indexを10〜100の間で振る
    const sizeZIndex = Math.max(10, Math.min(100, Math.floor(100000 / area)));
    img.style.zIndex = sizeZIndex;
    img.dataset.baseZIndex = sizeZIndex;

    // 初期位置（後でシャッフルで変更）
    img.style.left = data.x + 'px';
    img.style.top = data.y + 'px';

    piecesContainer.appendChild(img);
    gameState.pieces.push(img);

    // Union-Findに追加
    gameState.unionFind.add(filename);

    // ドラッグイベント
    img.addEventListener('mousedown', startDrag);
    img.addEventListener('touchstart', handleTouchStart, { passive: false });
  });

  console.log(`✓ ${gameState.pieces.length}個のピースを作成しました (Level ${gameState.currentLevel})`);
  updateStats();
}

// ========================================
// ドラッグ&ドロップ
// ========================================

function startDrag(e) {
  e.preventDefault();

  // パン中はピースドラッグを無効化
  if (gameState.isPanning || isSpacePressed) {
    return;
  }

  activePiece = e.target;

  // 市町村情報を表示
  const filename = activePiece.dataset.id;
  if (filename) {
    const cityIdMatch = filename.match(/(\d+)/);
    if (cityIdMatch) {
      const cityId = cityIdMatch[0];
      const data = gameState.cityData[cityId];
      if (data) {
        infoName.textContent = data.name;
        infoDescription.textContent = data.description;
        // サイドバー統合版では常に表示されているため、hidden制御は不要か、
        // 視覚的なフィードバック（ハイライトなど）を追加する
        infoPanel.classList.add('ring-2', 'ring-aichi-gold');
        setTimeout(() => {
          infoPanel.classList.remove('ring-2', 'ring-aichi-gold');
        }, 500);
      }
    }
  }

  // ゲーム開始
  if (!gameState.startTime) {
    startTimer();
  }

  // グループを取得（ロック済みピースを含む）
  const pieceId = activePiece.dataset.id;
  const groupIds = gameState.unionFind.getGroup(pieceId);

  // グループ内の全ピースを取得
  activeGroup = gameState.pieces.filter(p => groupIds.includes(p.dataset.id));

  // グループ全体を最前面に移動
  activeGroup.forEach(piece => {
    piece.style.zIndex = '1000';
  });

  const rect = activePiece.getBoundingClientRect();

  offsetX = (e.clientX - rect.left) / gameState.currentScale;
  offsetY = (e.clientY - rect.top) / gameState.currentScale;

  // グループ内の各ピースの相対位置を記録
  groupOffsets.clear();
  const baseX = parseFloat(activePiece.style.left);
  const baseY = parseFloat(activePiece.style.top);

  activeGroup.forEach(piece => {
    const pieceX = parseFloat(piece.style.left);
    const pieceY = parseFloat(piece.style.top);
    groupOffsets.set(piece.dataset.id, {
      dx: pieceX - baseX,
      dy: pieceY - baseY
    });
  });

  gameState.isDragging = true;

  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', endDrag);
}

function drag(e) {
  if (!activePiece || !gameState.isDragging) return;
  e.preventDefault();

  const canvasRect = document.getElementById('puzzle-canvas').getBoundingClientRect();

  // ワークスペース座標系での位置を計算
  const scrollX = document.getElementById('puzzle-canvas').scrollLeft;
  const scrollY = document.getElementById('puzzle-canvas').scrollTop;

  // ワークスペースのオフセットを取得（top: 50px, left: 50px）
  const workspaceOffsetX = workspace.offsetLeft;
  const workspaceOffsetY = workspace.offsetTop;

  // 正しい座標変換：
  // 1. マウス位置をキャンバス内の表示位置に変換
  // 2. スケールで割ってワークスペース座標系に変換
  // 3. スクロール量を加算（すでにワークスペース座標系）
  // 4. ワークスペースのオフセットを引く
  const baseX = (e.clientX - canvasRect.left) / gameState.currentScale + scrollX - workspaceOffsetX - offsetX;
  const baseY = (e.clientY - canvasRect.top) / gameState.currentScale + scrollY - workspaceOffsetY - offsetY;

  // グループ内の全ピースを移動
  activeGroup.forEach(piece => {
    const offset = groupOffsets.get(piece.dataset.id);
    piece.style.left = (baseX + offset.dx) + 'px';
    piece.style.top = (baseY + offset.dy) + 'px';
  });
}

function endDrag(e) {
  if (!activePiece) return;

  document.removeEventListener('mousemove', drag);
  document.removeEventListener('mouseup', endDrag);

  // グループ全体のスナップ判定
  checkGroupSnap();

  // グループ全体のzIndexを戻す
  activeGroup.forEach(piece => {
    piece.style.zIndex = piece.dataset.baseZIndex || '10';
  });

  activePiece = null;
  activeGroup = [];
  groupOffsets.clear();
  gameState.isDragging = false;
}

// タッチ対応
function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousedown', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  e.target.dispatchEvent(mouseEvent);
}

document.addEventListener('touchmove', (e) => {
  if (!gameState.isDragging) return;
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousemove', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  document.dispatchEvent(mouseEvent);
}, { passive: false });

document.addEventListener('touchend', (e) => {
  if (!gameState.isDragging) return;
  const mouseEvent = new MouseEvent('mouseup', {});
  document.dispatchEvent(mouseEvent);
});

// ========================================
// スナップ判定
// ========================================

function checkGroupSnap() {
  // 管理者モードではスナップしない
  if (gameState.adminMode) return;

  // グループ内のいずれかのピースが正しい位置にスナップできるかチェック
  let anySnapped = false;

  // スケールに応じてスナップ距離を調整（画面上で一定の距離を維持）
  const effectiveSnapDistance = gameState.snapDistance / gameState.currentScale;

  for (const piece of activeGroup) {
    const currentX = parseFloat(piece.style.left);
    const currentY = parseFloat(piece.style.top);
    const correctX = parseFloat(piece.dataset.correctX);
    const correctY = parseFloat(piece.dataset.correctY);

    const distance = Math.sqrt(
      Math.pow(currentX - correctX, 2) +
      Math.pow(currentY - correctY, 2)
    );

    // スナップ距離内なら正しい位置に配置
    if (distance < effectiveSnapDistance) {
      anySnapped = true;
      break;
    }
  }

  if (anySnapped) {
    // グループ全体を正しい位置にスナップ
    const deltaX = parseFloat(activeGroup[0].dataset.correctX) - parseFloat(activeGroup[0].style.left);
    const deltaY = parseFloat(activeGroup[0].dataset.correctY) - parseFloat(activeGroup[0].style.top);

    // 基準ピース（activeGroup[0]）を正しい位置に配置
    const baseCorrectX = parseFloat(activeGroup[0].dataset.correctX);
    const baseCorrectY = parseFloat(activeGroup[0].dataset.correctY);
    const baseCurrentX = parseFloat(activeGroup[0].style.left);
    const baseCurrentY = parseFloat(activeGroup[0].style.top);

    activeGroup.forEach(piece => {
      const offset = groupOffsets.get(piece.dataset.id);
      piece.style.left = (baseCorrectX + offset.dx) + 'px';
      piece.style.top = (baseCorrectY + offset.dy) + 'px';
      piece.classList.add('snapping');

      setTimeout(() => {
        piece.classList.remove('snapping');
      }, 300);

      // 自動ロック
      if (gameState.autoLock) {
        lockPiece(piece);
      }
    });

    // グループ内の各ピースについて、隣接する既にロック済みのピースとグループ化
    activeGroup.forEach(piece => {
      mergeWithAdjacentPieces(piece);
    });

    updateStats();
    checkCompletion();
  }
}

function checkSnap(piece) {
  // 管理者モードではスナップしない
  if (gameState.adminMode) return;

  const currentX = parseFloat(piece.style.left);
  const currentY = parseFloat(piece.style.top);
  const correctX = parseFloat(piece.dataset.correctX);
  const correctY = parseFloat(piece.dataset.correctY);

  const distance = Math.sqrt(
    Math.pow(currentX - correctX, 2) +
    Math.pow(currentY - correctY, 2)
  );

  // スケールに応じてスナップ距離を調整（画面上で一定の距離を維持）
  const effectiveSnapDistance = gameState.snapDistance / gameState.currentScale;

  // スナップ距離内なら正しい位置に配置
  if (distance < effectiveSnapDistance) {
    piece.style.left = correctX + 'px';
    piece.style.top = correctY + 'px';
    piece.classList.add('snapping');

    setTimeout(() => {
      piece.classList.remove('snapping');
    }, 300);

    // 自動ロック
    if (gameState.autoLock) {
      lockPiece(piece);
    }

    updateStats();
    checkCompletion();
  }
}

function lockPiece(piece) {
  gameState.lockedPieces.add(piece.dataset.id);
  piece.classList.add('locked');
  piece.style.cursor = 'default';
}

function mergeWithAdjacentPieces(piece) {
  const pieceId = piece.dataset.id;

  // 正しい位置にあるかチェック
  const currentX = parseFloat(piece.style.left);
  const currentY = parseFloat(piece.style.top);
  const correctX = parseFloat(piece.dataset.correctX);
  const correctY = parseFloat(piece.dataset.correctY);

  const distance = Math.sqrt(
    Math.pow(currentX - correctX, 2) +
    Math.pow(currentY - correctY, 2)
  );

  if (distance > 5) return; // 正しい位置にない場合は何もしない

  // 隣接するピースを取得
  const neighbors = gameState.adjacencyMap.get(pieceId) || [];

  // 隣接するピースのうち、既にロック済みで正しい位置にあるものとグループ化
  neighbors.forEach(neighborId => {
    if (gameState.lockedPieces.has(neighborId)) {
      const neighborPiece = gameState.pieces.find(p => p.dataset.id === neighborId);
      if (neighborPiece) {
        const nX = parseFloat(neighborPiece.style.left);
        const nY = parseFloat(neighborPiece.style.top);
        const nCorrectX = parseFloat(neighborPiece.dataset.correctX);
        const nCorrectY = parseFloat(neighborPiece.dataset.correctY);

        const nDist = Math.sqrt(
          Math.pow(nX - nCorrectX, 2) +
          Math.pow(nY - nCorrectY, 2)
        );

        // 隣接ピースも正しい位置にある場合のみグループ化
        if (nDist <= 5) {
          gameState.unionFind.union(pieceId, neighborId);
          console.log(`🔗 ${pieceId} と ${neighborId} をグループ化しました`);
        }
      }
    }
  });
}

// ========================================
// 統計更新
// ========================================

function updateStats() {
  const total = gameState.pieces.length;
  const placed = gameState.lockedPieces.size;
  const percentage = Math.round((placed / total) * 100);

  completionRateEl.textContent = percentage + '%';
  placedPiecesEl.textContent = `${placed}/${total}`;

  // 円形プログレスバー更新（stroke-dashoffset）
  const circumference = 264; // stroke-dasharray の値
  const offset = circumference - (circumference * percentage / 100);
  if (progressCircleEl) {
    progressCircleEl.style.strokeDashoffset = offset;
  }
}

// ========================================
// タイマー
// ========================================

function startTimer() {
  gameState.startTime = Date.now();
  gameState.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    elapsedTimeEl.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(gameState.timerInterval);
}

// ========================================
// 完成チェック
// ========================================

function checkCompletion() {
  if (gameState.lockedPieces.size === gameState.pieces.length) {
    stopTimer();
    const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
    const finalTime = elapsedTimeEl.textContent;

    // ランク計算
    const rank = calculateRank(elapsed, gameState.currentLevel);

    // 表示更新
    document.getElementById('final-time').textContent = finalTime;
    document.getElementById('final-level').textContent = `Level ${gameState.currentLevel}`;

    const rankBadge = document.querySelector('.rank-badge');
    const rankLabel = document.querySelector('.rank-label');

    rankBadge.textContent = rank.grade;
    rankBadge.className = `rank-badge rank-${rank.grade.toLowerCase()}`;
    rankLabel.textContent = rank.message;

    setTimeout(() => {
      completionOverlay.classList.add('show');
    }, 500);
  }
}

// ランク計算関数
function calculateRank(seconds, level) {
  // 難易度別の基準時間（秒）
  const timeThresholds = {
    1: { S: 120, A: 180, B: 300, C: 600 },      // Level 1: 2分/3分/5分/10分
    2: { S: 180, A: 300, B: 480, C: 720 },      // Level 2: 3分/5分/8分/12分
    3: { S: 240, A: 360, B: 600, C: 900 },      // Level 3: 4分/6分/10分/15分
    4: { S: 300, A: 480, B: 720, C: 1080 }      // Level 4: 5分/8分/12分/18分
  };

  const thresholds = timeThresholds[level] || timeThresholds[1];

  const ranks = {
    S: { grade: 'S', message: '神業！驚異的な速さです！' },
    A: { grade: 'A', message: '素晴らしい！とても速いです！' },
    B: { grade: 'B', message: 'お見事！良いペースです！' },
    C: { grade: 'C', message: '完成おめでとう！' },
    D: { grade: 'D', message: 'よく頑張りました！' }
  };

  if (seconds <= thresholds.S) return ranks.S;
  if (seconds <= thresholds.A) return ranks.A;
  if (seconds <= thresholds.B) return ranks.B;
  if (seconds <= thresholds.C) return ranks.C;
  return ranks.D;
}

// ========================================
// レベル切り替え
// ========================================

function changeLevel(level) {
  if (gameState.currentLevel === level) return;

  // 確認ダイアログ
  if (gameState.lockedPieces.size > 0) {
    if (!confirm('レベルを変更すると進行状況がリセットされます。よろしいですか？')) {
      return;
    }
  }

  gameState.currentLevel = level;

  // 背景画像を変更
  backgroundImg.src = LEVELS[level].backgroundImage;

  // ピースをリセット
  resetGame();

  // UIを更新
  updateLevelButtons();
}

function updateLevelButtons() {
  document.querySelectorAll('.level-tab').forEach(btn => {
    const level = parseInt(btn.dataset.level);
    if (level === gameState.currentLevel) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function resetGame() {
  // ピースを削除
  gameState.pieces.forEach(piece => piece.remove());
  gameState.pieces = [];
  gameState.lockedPieces.clear();

  // Union-Findをリセット
  gameState.unionFind.clear();

  // タイマーリセット
  stopTimer();
  gameState.startTime = null;
  elapsedTimeEl.textContent = '00:00';

  // 完成オーバーレイを非表示
  completionOverlay.classList.remove('show');

  // ピースを再作成
  createPieces();

  // シャッフル
  shufflePieces();
}

// ========================================
// カウントダウンとアニメーション
// ========================================

async function startGameWithCountdown() {
  // カウントダウンオーバーレイを表示
  countdownOverlay.classList.add('show');

  // 3, 2, 1のカウントダウン
  for (let i = 3; i >= 1; i--) {
    countdownNumber.textContent = i;
    countdownNumber.style.animation = 'none';
    // アニメーションをリセットするため少し待つ
    await new Promise(resolve => setTimeout(resolve, 10));
    countdownNumber.style.animation = 'countdownPulse 1s ease-out';
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // カウントダウン終了
  countdownOverlay.classList.remove('show');

  // ピースをアニメーションでバラバラに
  await animateScatterPieces();

  // ゲーム開始（タイマーは最初のピースをドラッグした時に開始）
}

async function animateScatterPieces() {
  const bgWidth = backgroundImg.naturalWidth;
  const bgHeight = backgroundImg.naturalHeight;

  // 各ピースのシャッフル位置を計算
  const targetPositions = gameState.pieces.map(() => ({
    x: bgWidth + 200 + Math.random() * 1500,
    y: 100 + Math.random() * (bgHeight - 200)
  }));

  // トランジションを有効化
  gameState.pieces.forEach((piece, index) => {
    piece.style.transition = 'all 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
    piece.style.left = targetPositions[index].x + 'px';
    piece.style.top = targetPositions[index].y + 'px';
  });

  // アニメーション完了を待つ
  await new Promise(resolve => setTimeout(resolve, 1500));

  // トランジションを解除
  gameState.pieces.forEach(piece => {
    piece.style.transition = '';
  });
}

// ========================================
// シャッフル
// ========================================

// ========================================
// 未配置ピースを整理
// ========================================

function gatherUnplacedPieces() {
  const bgWidth = backgroundImg.naturalWidth;
  const bgHeight = backgroundImg.naturalHeight;

  // 未配置のピース（ロックされていないピース）を取得
  const unplacedPieces = gameState.pieces.filter(
    piece => !gameState.lockedPieces.has(piece.dataset.id)
  );

  if (unplacedPieces.length === 0) {
    console.log('すべてのピースが配置済みです');
    return;
  }

  console.log(`📦 ${unplacedPieces.length}個の未配置ピースを整理します`);

  // 整理エリアの設定（背景の右側）
  const startX = bgWidth + 100;
  const startY = 50;
  const columnWidth = 120; // 列の幅
  const rowHeight = 100;   // 行の高さ
  const maxColumns = 8;    // 最大列数

  // ピースをグリッド状に配置
  unplacedPieces.forEach((piece, index) => {
    const col = index % maxColumns;
    const row = Math.floor(index / maxColumns);

    const targetX = startX + col * columnWidth;
    const targetY = startY + row * rowHeight;

    // アニメーション付きで移動
    piece.style.transition = 'all 0.5s ease-out';
    piece.style.left = targetX + 'px';
    piece.style.top = targetY + 'px';

    // アニメーション終了後にトランジションを解除
    setTimeout(() => {
      piece.style.transition = '';
    }, 500);
  });
}

function shufflePieces() {
  const bgWidth = backgroundImg.naturalWidth;
  const bgHeight = backgroundImg.naturalHeight;

  // ロック解除とUnion-Findリセット（ループの外で一度だけ実行）
  gameState.lockedPieces.clear();
  gameState.unionFind.clear();

  gameState.pieces.forEach(p => {
    gameState.unionFind.add(p.dataset.id);
  });

  gameState.pieces.forEach((piece, index) => {
    // ロック解除
    piece.classList.remove('locked');

    // 管理者モードでは正しい位置に配置（背景画像上）
    if (gameState.adminMode) {
      const correctX = parseFloat(piece.dataset.correctX);
      const correctY = parseFloat(piece.dataset.correctY);
      piece.style.left = correctX + 'px';
      piece.style.top = correctY + 'px';
    } else {
      // 通常モード: ランダム配置（背景の右側エリア）
      const randomX = bgWidth + 200 + Math.random() * 1500;
      const randomY = 100 + Math.random() * (bgHeight - 200);

      piece.style.left = randomX + 'px';
      piece.style.top = randomY + 'px';
    }
    piece.style.zIndex = '10';
  });

  // タイマーリセット
  stopTimer();
  gameState.startTime = null;
  elapsedTimeEl.textContent = '00:00';

  updateStats();
  completionOverlay.classList.remove('show');
}

// ========================================
// ズームコントロール
// ========================================

function applyZoom(scale) {
  gameState.currentScale = Math.max(0.1, Math.min(1, scale));
  workspace.style.transform = `scale(${gameState.currentScale})`;
  const percentage = Math.round(gameState.currentScale * 100);
  document.getElementById('zoom-display').textContent = percentage + '%';
  if (zoomFillEl) {
    zoomFillEl.style.width = percentage + '%';
  }
}

// ========================================
// イベントリスナー
// ========================================

function setupEventListeners() {
  // レベル選択ボタン
  document.querySelectorAll('.level-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const level = parseInt(btn.dataset.level);
      changeLevel(level);
    });
  });

  // シャッフルボタン
  document.getElementById('shuffle-btn').addEventListener('click', shufflePieces);

  // リセットボタン
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('進行状況がリセットされます。よろしいですか？')) {
      shufflePieces();
    }
  });

  // 整理ボタン
  document.getElementById('gather-btn').addEventListener('click', gatherUnplacedPieces);

  // ヒントボタン - 押している間カラー版を表示
  const hintBtn = document.getElementById('hint-btn');
  let originalBackgroundSrc = '';

  hintBtn.addEventListener('mousedown', () => {
    originalBackgroundSrc = backgroundImg.src;
    backgroundImg.src = '/img/愛知県全図color.png';
  });

  hintBtn.addEventListener('mouseup', () => {
    backgroundImg.src = originalBackgroundSrc;
  });

  hintBtn.addEventListener('mouseleave', () => {
    if (originalBackgroundSrc) {
      backgroundImg.src = originalBackgroundSrc;
    }
  });

  // もう一度遊ぶ
  document.getElementById('play-again-btn').addEventListener('click', () => {
    completionOverlay.classList.remove('show');
    shufflePieces();
  });

  // ズームコントロール（サイドバー）
  document.getElementById('zoom-in-sidebar').addEventListener('click', () => {
    applyZoom(gameState.currentScale + 0.1);
  });

  document.getElementById('zoom-out-sidebar').addEventListener('click', () => {
    applyZoom(gameState.currentScale - 0.1);
  });

  // 設定
  document.getElementById('auto-lock').addEventListener('change', (e) => {
    gameState.autoLock = e.target.checked;
  });

  // マウスホイールでズーム（Ctrl+ホイール、または右クリック+ホイール）
  document.getElementById('puzzle-canvas').addEventListener('wheel', (e) => {
    if (e.ctrlKey || isRightMousePressed) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      applyZoom(gameState.currentScale + delta);
    }
  }, { passive: false });

  // パン機能 - スペースキー検出
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !gameState.isDragging) {
      isSpacePressed = true;
      document.getElementById('puzzle-canvas').style.cursor = 'grab';
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      isSpacePressed = false;
      if (!gameState.isPanning) {
        document.getElementById('puzzle-canvas').style.cursor = 'auto';
      }
    }
  });

  // パン機能 - マウス操作
  const puzzleCanvas = document.getElementById('puzzle-canvas');

  puzzleCanvas.addEventListener('mousedown', (e) => {
    // 右クリックの状態を記録
    if (e.button === 2) {
      isRightMousePressed = true;
    }

    // 左クリック（空白部分）、スペース+左クリック、中ボタン、右クリックでパン開始
    const isEmptyArea = e.target === puzzleCanvas || e.target === workspace;
    if ((e.button === 0 && (isSpacePressed || isEmptyArea)) || e.button === 1 || e.button === 2) {
      e.preventDefault();
      gameState.isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panScrollStartX = puzzleCanvas.scrollLeft;
      panScrollStartY = puzzleCanvas.scrollTop;
      puzzleCanvas.style.cursor = 'grabbing';
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (gameState.isPanning) {
      e.preventDefault();
      const deltaX = e.clientX - panStartX;
      const deltaY = e.clientY - panStartY;
      puzzleCanvas.scrollLeft = panScrollStartX - deltaX;
      puzzleCanvas.scrollTop = panScrollStartY - deltaY;
    }
  });

  document.addEventListener('mouseup', (e) => {
    // 右クリックの状態をリセット
    if (e.button === 2) {
      isRightMousePressed = false;
    }

    if (gameState.isPanning) {
      gameState.isPanning = false;
      puzzleCanvas.style.cursor = isSpacePressed ? 'grab' : 'auto';
    }
  });

  // 中ボタンと右クリックのデフォルト動作を無効化
  puzzleCanvas.addEventListener('auxclick', (e) => {
    if (e.button === 1) {
      e.preventDefault();
    }
  });

  puzzleCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // 右クリックメニューを無効化
  });

  // チュートリアルモーダル - レベルカードのクリック
  document.querySelectorAll('.level-card[data-tutorial-level]').forEach(card => {
    card.addEventListener('click', async () => {
      const level = parseInt(card.dataset.tutorialLevel);

      // モーダルを閉じる
      tutorialModal.classList.add('hidden');

      // レベルを設定
      gameState.currentLevel = level;
      backgroundImg.src = LEVELS[level].backgroundImage;
      updateLevelButtons();

      // ピースを正しい位置に配置（ロックなし）
      gameState.pieces.forEach(piece => {
        const correctX = parseFloat(piece.dataset.correctX);
        const correctY = parseFloat(piece.dataset.correctY);
        piece.style.left = correctX + 'px';
        piece.style.top = correctY + 'px';
        piece.classList.remove('locked');
      });

      gameState.lockedPieces.clear();
      gameState.unionFind.clear();
      gameState.pieces.forEach(p => gameState.unionFind.add(p.dataset.id));

      // カウントダウンとアニメーション開始
      await startGameWithCountdown();

      updateStats();
    });
  });
}

// ========================================
// 管理者モード
// ========================================

function setupAdminMode() {
  if (!gameState.adminMode) return;

  console.log('🔧 管理者モードが有効です');

  // 背景画像を明るく表示
  if (backgroundImg) {
    backgroundImg.style.opacity = '0.8';
  }

  // スナップを無効化
  gameState.autoLock = false;

  // 管理者パネルを表示
  const adminPanel = document.createElement('div');
  adminPanel.id = 'admin-panel';
  adminPanel.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.9);
    color: #0f0;
    padding: 20px;
    border-radius: 8px;
    font-family: monospace;
    z-index: 10000;
    max-width: 400px;
  `;
  adminPanel.innerHTML = `
    <h3 style="margin: 0 0 15px 0; color: #0f0;">🔧 管理者モード</h3>
    <p style="margin: 5px 0; font-size: 12px;">ピースを正しい位置に配置してください</p>
    <div id="admin-stats" style="margin: 10px 0; font-size: 11px;"></div>
    <button id="export-coords" style="
      width: 100%;
      padding: 10px;
      margin-top: 10px;
      background: #0a0;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    ">座標データを出力 (Ctrl+S)</button>
    <button id="copy-coords" style="
      width: 100%;
      padding: 10px;
      margin-top: 5px;
      background: #00a;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    ">座標をクリップボードにコピー</button>
    <div id="admin-output" style="
      margin-top: 10px;
      padding: 10px;
      background: #111;
      border-radius: 4px;
      font-size: 10px;
      max-height: 200px;
      overflow-y: auto;
      display: none;
    "></div>
  `;
  document.body.appendChild(adminPanel);

  // 統計更新
  function updateAdminStats() {
    const statsEl = document.getElementById('admin-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div>配置済みピース: ${gameState.pieces.length}個</div>
        <div style="color: #ff0;">ヒント: Ctrl+S で座標出力</div>
      `;
    }
  }

  updateAdminStats();

  // 座標出力関数
  function exportCoordinates() {
    const coords = {};
    gameState.pieces.forEach(piece => {
      const filename = piece.dataset.id;
      coords[filename] = {
        x: Math.round(parseFloat(piece.style.left)),
        y: Math.round(parseFloat(piece.style.top)),
        width: piece.naturalWidth,
        height: piece.naturalHeight,
        matchScore: 100,
        error: false
      };
    });

    const json = JSON.stringify(coords, null, 2);
    console.log('📊 座標データ:');
    console.log(json);

    // 出力表示
    const outputEl = document.getElementById('admin-output');
    if (outputEl) {
      outputEl.style.display = 'block';
      outputEl.textContent = json;
    }

    // ダウンロード
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coordinates.json';
    a.click();
    URL.revokeObjectURL(url);

    alert('✅ 座標データをダウンロードしました！\nコンソールにも出力されています。');
  }

  // クリップボードにコピー
  function copyToClipboard() {
    const coords = {};
    gameState.pieces.forEach(piece => {
      const filename = piece.dataset.id;
      coords[filename] = {
        x: Math.round(parseFloat(piece.style.left)),
        y: Math.round(parseFloat(piece.style.top)),
        width: piece.naturalWidth,
        height: piece.naturalHeight,
        matchScore: 100,
        error: false
      };
    });

    const json = JSON.stringify(coords, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      alert('✅ 座標データをクリップボードにコピーしました！');
    });
  }

  // ボタンイベント
  document.getElementById('export-coords').addEventListener('click', exportCoordinates);
  document.getElementById('copy-coords').addEventListener('click', copyToClipboard);

  // キーボードショートカット (Ctrl+S)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      exportCoordinates();
    }
  });

  console.log('✅ 管理者モードの設定が完了しました');
  console.log('💡 使い方:');
  console.log('  1. ピースを背景画像の正しい位置にドラッグ');
  console.log('  2. すべて配置したら Ctrl+S で座標を出力');
  console.log('  3. ダウンロードされたファイルを public/data/coordinates.json に置き換え');
}

// ========================================
// ゲーム開始
// ========================================

init().then(() => {
  setupAdminMode();
});
