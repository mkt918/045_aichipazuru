import './style.css';

const app = document.querySelector('#app');

// --- Configuration & State ---
let boardSize = 3; // Default 3x3
let tiles = []; // Current tile positions
let emptyPos = { r: 2, c: 2 };
let moveCount = 0;
let startTime = null;
let timerInterval = null;
let isGameActive = false;

// Updated to provided image
const imageUrl = '/img/愛知県全図.png';

// --- UI Shell ---
app.innerHTML = `
  <div class="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-900 to-aichi-blue">
    <header class="text-center mb-10 animate-fade-in">
      <h1 class="text-5xl font-extrabold text-white mb-2 tracking-tight">
        <span class="text-aichi-gold">愛知</span>パズル
      </h1>
      <p class="text-slate-300 text-lg uppercase tracking-widest">Aichi Sliding Puzzle</p>
    </header>

    <main class="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <!-- Puzzle Board Section -->
      <section class="lg:col-span-7 flex flex-col items-center">
        <div class="relative bg-white/10 backdrop-blur-md p-4 rounded-3xl shadow-2xl border border-white/20 aspect-square w-full max-w-[500px] overflow-hidden">
          <div id="puzzle-board" class="grid gap-1 w-full h-full bg-slate-800 rounded-xl overflow-hidden shadow-inner">
            <!-- Tiles will be injected here -->
          </div>
          
          <!-- Win Overlay -->
          <div id="win-overlay" class="hidden absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center text-white z-10 transition-all duration-500">
            <h2 class="text-4xl font-bold text-aichi-gold mb-4">CLEAR!</h2>
            <p class="text-xl mb-6">愛知県を完成させました！</p>
            <button id="clear-shuffle-btn" class="px-8 py-3 bg-aichi-gold text-slate-900 font-bold rounded-full hover:scale-105 transition shadow-lg">もう一度挑戦</button>
          </div>
        </div>
        
        <div class="mt-8 flex gap-4 w-full max-w-[500px]">
          <button id="shuffle-btn" class="flex-1 px-8 py-4 bg-aichi-gold hover:bg-yellow-600 text-slate-900 font-bold rounded-2xl transition-all transform hover:scale-105 shadow-lg active:scale-95 text-lg">
            シャッフル
          </button>
          <button id="reset-btn" class="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl transition-all border border-white/20 shadow-lg active:scale-95">
            リセット
          </button>
        </div>
      </section>

      <!-- Controls & Info Section -->
      <section class="lg:col-span-5 space-y-6 w-full">
        <div class="bg-white/5 backdrop-blur-sm p-8 rounded-3xl border border-white/10 text-slate-200 shadow-xl">
          <h2 class="text-2xl font-bold mb-6 text-white border-b border-aichi-gold/30 pb-3 flex items-center">
            <span class="w-2 h-8 bg-aichi-gold mr-3 rounded-full"></span>
            ゲーム設定
          </h2>
          
          <div class="space-y-8">
            <div>
              <label class="block text-sm font-medium mb-4 text-slate-400 uppercase tracking-widest">パズルの分割数</label>
              <div class="flex gap-3">
                <button class="difficulty-btn px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/20 transition-all font-bold flex-1" data-size="3">3x3</button>
                <button class="difficulty-btn px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/20 transition-all font-bold flex-1" data-size="4">4x4</button>
                <button class="difficulty-btn px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/20 transition-all font-bold flex-1" data-size="5">5x5</button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-6">
              <div class="bg-black/40 p-5 rounded-2xl text-center border border-white/5">
                <span class="block text-xs uppercase tracking-widest text-slate-500 mb-2">SCORE / MOVES</span>
                <span id="move-count" class="text-4xl font-mono font-bold text-white">0</span>
              </div>
              <div class="bg-black/40 p-5 rounded-2xl text-center border border-white/5">
                <span class="block text-xs uppercase tracking-widest text-slate-500 mb-2">ELAPSED TIME</span>
                <span id="timer" class="text-4xl font-mono font-bold text-white">00:00</span>
              </div>
            </div>

            <div class="p-5 rounded-2xl bg-gradient-to-r from-aichi-gold/20 to-transparent border-l-4 border-aichi-gold">
              <p class="text-sm leading-relaxed text-slate-300">
                <strong class="text-aichi-gold">遊び方:</strong> 空白に隣接するタイルをクリックして移動させます。愛知県を象徴する画像を正しく並び替えてください。
              </p>
            </div>
          </div>
        </div>

        <!-- Preview Image -->
        <div class="bg-white/5 backdrop-blur-sm p-6 rounded-3xl border border-white/10">
          <p class="text-xs uppercase tracking-widest text-slate-500 mb-3">完成見本</p>
          <div class="aspect-square w-full rounded-xl overflow-hidden grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition duration-500 border border-white/10">
            <img src="${imageUrl}" alt="Preview" class="w-full h-full object-cover">
          </div>
        </div>
      </section>
    </main>

    <footer class="mt-12 text-slate-600 text-sm font-medium tracking-tight">
      &copy; 2026 AIchipazuru - Crafted with <span class="text-pink-500">♥</span> by mkt918
    </footer>
  </div>
`;

// --- Logic Implementation ---

function initGame() {
  tiles = [];
  moveCount = 0;
  stopTimer();
  document.getElementById('move-count').textContent = '0';
  document.getElementById('timer').textContent = '00:00';
  document.getElementById('win-overlay').classList.add('hidden');

  const board = document.getElementById('puzzle-board');
  board.style.gridTemplateColumns = `repeat(${boardSize}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${boardSize}, 1fr)`;
  board.innerHTML = '';

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (r === boardSize - 1 && c === boardSize - 1) {
        emptyPos = { r, c };
        continue;
      }

      const tile = document.createElement('div');
      tile.className = 'puzzle-tile relative w-full h-full bg-cover shadow-lg rounded-sm';
      tile.style.backgroundImage = `url("${imageUrl}")`;

      // Calculate background position
      const x = (c / (boardSize - 1)) * 100;
      const y = (r / (boardSize - 1)) * 100;
      tile.style.backgroundPosition = `${x}% ${y}%`;
      tile.style.backgroundSize = `${boardSize * 100}%`;

      tile.dataset.r = r;
      tile.dataset.c = c;
      tile.dataset.correctR = r;
      tile.dataset.correctC = c;

      tile.addEventListener('click', () => handleTileClick(tile));

      board.appendChild(tile);
      tiles.push(tile);
    }
  }

  updateDifficultyButtons();
}

function handleTileClick(tile) {
  if (!isGameActive) startTimer();

  const r = parseInt(tile.dataset.r);
  const c = parseInt(tile.dataset.c);

  if (isAdjacent(r, c, emptyPos.r, emptyPos.c)) {
    // Swap tile and empty space
    const targetR = emptyPos.r;
    const targetC = emptyPos.c;

    emptyPos = { r, c };
    tile.dataset.r = targetR;
    tile.dataset.c = targetC;

    updateTilePosition(tile);
    moveCount++;
    document.getElementById('move-count').textContent = moveCount;

    checkWin();
  }
}

function isAdjacent(r1, c1, r2, c2) {
  return (Math.abs(r1 - r2) === 1 && c1 === c2) || (Math.abs(c1 - c2) === 1 && r1 === r2);
}

function updateTilePosition(tile) {
  const r = parseInt(tile.dataset.r);
  const c = parseInt(tile.dataset.c);
  // Using grid-area for simple positioning
  tile.style.gridRow = r + 1;
  tile.style.gridColumn = c + 1;
}

function shuffle() {
  isGameActive = false;
  moveCount = 0;
  document.getElementById('move-count').textContent = '0';
  stopTimer();
  document.getElementById('timer').textContent = '00:00';
  document.getElementById('win-overlay').classList.add('hidden');

  // To guarantee solvability, we simulate random moves from the solved state
  const iterations = boardSize * boardSize * 30;
  for (let i = 0; i < iterations; i++) {
    const adjacent = tiles.filter(t => isAdjacent(parseInt(t.dataset.r), parseInt(t.dataset.c), emptyPos.r, emptyPos.c));
    if (adjacent.length === 0) continue;
    const randomTile = adjacent[Math.floor(Math.random() * adjacent.length)];

    const r = parseInt(randomTile.dataset.r);
    const c = parseInt(randomTile.dataset.c);

    const targetR = emptyPos.r;
    const targetC = emptyPos.c;

    emptyPos = { r, c };
    randomTile.dataset.r = targetR;
    randomTile.dataset.c = targetC;
  }

  tiles.forEach(updateTilePosition);
}

function checkWin() {
  const isWin = tiles.every(tile => {
    return parseInt(tile.dataset.r) === parseInt(tile.dataset.correctR) &&
      parseInt(tile.dataset.c) === parseInt(tile.dataset.correctC);
  });

  if (isWin) {
    stopTimer();
    document.getElementById('win-overlay').classList.remove('hidden');
    isGameActive = false;
  }
}

function startTimer() {
  isGameActive = true;
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('timer').textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

function updateDifficultyButtons() {
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    if (parseInt(btn.dataset.size) === boardSize) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// --- Event Listeners ---
document.getElementById('shuffle-btn').addEventListener('click', shuffle);
document.getElementById('clear-shuffle-btn').addEventListener('click', shuffle);
document.getElementById('reset-btn').addEventListener('click', () => {
  initGame();
  tiles.forEach(updateTilePosition);
});

document.querySelectorAll('.difficulty-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    boardSize = parseInt(btn.dataset.size);
    initGame();
    tiles.forEach(updateTilePosition);
  });
});

// Initial boot
initGame();
tiles.forEach(updateTilePosition);
