// connect4.js
(() => {
  // --- Config / Colors mirror CSS ---
  const ROWS = 6, COLS = 7;
  const AI_DELAY_MS = 350;

  // --- DOM refs ---
  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const modeSel = document.getElementById('mode');
  const p1TypeSel = document.getElementById('p1-type');
  const p1LevelSel = document.getElementById('p1-level');
  const p2LevelSel = document.getElementById('p2-level');
  const startBtn = document.getElementById('start-btn');
  const resetBtn = document.getElementById('reset-btn');
  const previewEl = document.getElementById('preview');
  const victoryPopup = document.getElementById('victory-popup');
  const victoryTitle = document.getElementById('victory-title');
  const playAgainBtn = document.getElementById('play-again-btn');
  const confettiContainer = document.getElementById('confetti-container');
  const hintBtn = document.getElementById('hint-btn');
  const hintMessage = document.getElementById('hint-message');
  const moveList = document.getElementById('move-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const gameStats = document.getElementById('game-stats');
  const totalMovesEl = document.getElementById('total-moves');
  const gameDurationEl = document.getElementById('game-duration');

  // --- Game State ---
  let board, currentPlayer, running, lastMove, winline;
  let mode = 'pvai';            // 'pvai' | 'aivai'
  let p1Type = 'human';         // 'human' | 'ai'
  let p1Level = 'medium';       // 'easy' | 'medium' | 'hard'
  let p2Level = 'medium';       // 'easy' | 'medium' | 'hard'
  let aiTimerId = null;         // timeout handle
  let aiPending = false;
  let moveHistory = [];         // Array of {player, column, moveNumber, quality, score}
  let gameStartTime = null;     // Game timer
  let timerInterval = null;

  // --- Utilities ---
  function idx(r, c) { return r * COLS + c; }
  function makeBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill(0)); }
  function copyBoard(b) { return b.map(row => row.slice()); }

  function validMoves(b) {
    const res = [];
    for (let c = 0; c < COLS; c++) if (b[0][c] === 0) res.push(c);
    return res;
  }
  function getNextRow(b, col) {
    for (let r = ROWS - 1; r >= 0; r--) if (b[r][col] === 0) return r;
    return null;
  }
  function drop(b, col, player) {
    const r = getNextRow(b, col);
    if (r == null) return null;
    b[r][col] = player;
    return [r, col];
  }

  function winningCells(b, player) {
    // Horizontal
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 3; c++) {
        if (b[r][c] === player && b[r][c+1] === player && b[r][c+2] === player && b[r][c+3] === player)
          return [[r,c],[r,c+1],[r,c+2],[r,c+3]];
      }
    }
    // Vertical
    for (let r = 0; r < ROWS - 3; r++) {
      for (let c = 0; c < COLS; c++) {
        if (b[r][c] === player && b[r+1][c] === player && b[r+2][c] === player && b[r+3][c] === player)
          return [[r,c],[r+1,c],[r+2,c],[r+3,c]];
      }
    }
    // Positive diagonal
    for (let r = 0; r < ROWS - 3; r++) {
      for (let c = 0; c < COLS - 3; c++) {
        if (b[r][c] === player && b[r+1][c+1] === player && b[r+2][c+2] === player && b[r+3][c+3] === player)
          return [[r,c],[r+1,c+1],[r+2,c+2],[r+3,c+3]];
      }
    }
    // Negative diagonal
    for (let r = 3; r < ROWS; r++) {
      for (let c = 0; c < COLS - 3; c++) {
        if (b[r][c] === player && b[r-1][c+1] === player && b[r-2][c+2] === player && b[r-3][c+3] === player)
          return [[r,c],[r-1,c+1],[r-2,c+2],[r-3,c+3]];
      }
    }
    return null;
  }
  function isTerminal(b) {
    return winningCells(b, 1) || winningCells(b, 2) || validMoves(b).length === 0;
  }

  // --- Heuristic eval (mirror Python) ---
  function centerScore(b, player) {
    let count = 0;
    for (let r = 0; r < ROWS; r++) if (b[r][Math.floor(COLS/2)] === player) count++;
    return count * 3;
  }
  function windowScore(arr, player) {
    const opp = player === 1 ? 2 : 1;
    const p = arr.filter(v => v === player).length;
    const e = arr.filter(v => v === 0).length;
    const o = arr.filter(v => v === opp).length;
    let score = 0;
    if (p === 4) score += 10000;
    else if (p === 3 && e === 1) score += 100;
    else if (p === 2 && e === 2) score += 10;
    if (o === 3 && e === 1) score -= 120; // block threats
    if (o === 2 && e === 2) score -= 8;
    return score;
  }
  function evaluate(b, player) {
    let score = 0;
    score += centerScore(b, player);
    // Horizontal
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 3; c++) {
        score += windowScore([b[r][c], b[r][c+1], b[r][c+2], b[r][c+3]], player);
      }
    }
    // Vertical
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS - 3; r++) {
        score += windowScore([b[r][c], b[r+1][c], b[r+2][c], b[r+3][c]], player);
      }
    }
    // Positive diagonal
    for (let r = 0; r < ROWS - 3; r++) {
      for (let c = 0; c < COLS - 3; c++) {
        score += windowScore([b[r][c], b[r+1][c+1], b[r+2][c+2], b[r+3][c+3]], player);
      }
    }
    // Negative diagonal
    for (let r = 3; r < ROWS; r++) {
      for (let c = 0; c < COLS - 3; c++) {
        score += windowScore([b[r][c], b[r-1][c+1], b[r-2][c+2], b[r-3][c+3]], player);
      }
    }
    return score;
  }

  // --- Minimax with alpha-beta ---
  function minimax(b, depth, alpha, beta, maximizing, player) {
    const term = isTerminal(b);
    if (term) {
      if (winningCells(b, 1)) return [null, player === 1 ? 1_000_000 + depth : -1_000_000 - depth];
      if (winningCells(b, 2)) return [null, player === 2 ? 1_000_000 + depth : -1_000_000 - depth];
      return [null, 0]; // draw
    }
    if (depth === 0) return [null, evaluate(b, player)];

    const moves = validMoves(b).sort((a, bcol) => Math.abs(a - Math.floor(COLS/2)) - Math.abs(bcol - Math.floor(COLS/2)));
    if (maximizing) {
      let value = -Infinity, bestCol = moves[0] ?? null;
      for (const col of moves) {
        const r = getNextRow(b, col);
        if (r == null) continue;
        const b2 = copyBoard(b);
        b2[r][col] = player;
        const [, score] = minimax(b2, depth - 1, alpha, beta, false, player);
        if (score > value) { value = score; bestCol = col; }
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      return [bestCol, value];
    } else {
      let value = Infinity, bestCol = moves[0] ?? null;
      const opp = player === 1 ? 2 : 1;
      for (const col of moves) {
        const r = getNextRow(b, col);
        if (r == null) continue;
        const b2 = copyBoard(b);
        b2[r][col] = opp;
        const [, score] = minimax(b2, depth - 1, alpha, beta, true, player);
        if (score < value) { value = score; bestCol = col; }
        beta = Math.min(beta, value);
        if (alpha >= beta) break;
      }
      return [bestCol, value];
    }
  }

  // --- AI levels ---
  function aiEasy(b, aiPlayer) {
    const vm = validMoves(b);
    return vm.length ? vm[Math.floor(Math.random() * vm.length)] : null;
  }
  function findWinningMove(b, player) {
    for (const c of validMoves(b)) {
      const b2 = copyBoard(b);
      const r = getNextRow(b2, c);
      b2[r][c] = player;
      if (winningCells(b2, player)) return c;
    }
    return null;
  }
  function aiMedium(b, aiPlayer) {
    const win = findWinningMove(b, aiPlayer);
    if (win != null) return win;
    const block = findWinningMove(b, aiPlayer === 1 ? 2 : 1);
    if (block != null) return block;
    const moves = validMoves(b).sort((a, bcol) => Math.abs(a - Math.floor(COLS/2)) - Math.abs(bcol - Math.floor(COLS/2)));
    let best = moves[0] ?? null, bestScore = -Infinity;
    for (const c of moves) {
      const b2 = copyBoard(b);
      const r = getNextRow(b2, c);
      b2[r][c] = aiPlayer;
      const s = evaluate(b2, aiPlayer);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    return best;
  }
  function aiHard(b, aiPlayer, depth = 4) {
    const win = findWinningMove(b, aiPlayer);
    if (win != null) return win;
    const opp = aiPlayer === 1 ? 2 : 1;
    const block = findWinningMove(b, opp);
    if (block != null) return block;
    const [col] = minimax(b, depth, -Infinity, Infinity, true, aiPlayer);
    if (col == null) {
      const vm = validMoves(b);
      return vm.length ? vm[Math.floor(Math.random() * vm.length)] : null;
    }
    return col;
  }

  // --- Rendering ---
  function renderBoard() {
    // Ensure 42 cells exist; if HTML omitted them, generate:
    if (boardEl.children.length !== ROWS * COLS) {
      boardEl.innerHTML = '';
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.dataset.r = String(r);
          cell.dataset.c = String(c);
          boardEl.appendChild(cell);
        }
      }
    }
    const cells = boardEl.children;
    // Clear classes
    for (let i = 0; i < cells.length; i++) cells[i].className = 'cell';
    // Paint pieces
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = board[r][c];
        if (v !== 0) cells[idx(r,c)].classList.add(v === 1 ? 'p1' : 'p2');
      }
    }
    // Last move
    if (lastMove) {
      const [r, c] = lastMove;
      cells[idx(r,c)].classList.add('last');
    }
    // Winning line
    if (winline) {
      for (const [r, c] of winline) cells[idx(r,c)].classList.add('win');
    }
    // Status
    updateStatusText();
    // Preview visibility/position is handled on mousemove
  }

  function updateStatusText() {
    if (winline) {
      const who = currentPlayer === 1 ? 'Player 1' : 'Player 2';
      statusEl.textContent = `${who} wins!`;
    } else if (validMoves(board).length === 0 && running) {
      statusEl.textContent = `It's a Draw!`;
    } else if (!running) {
      statusEl.textContent = `Ready`;
    } else {
      const who = currentPlayer === 1 ? 'Player 1' : 'Player 2';
      const aiTurn = isAiTurn();
      statusEl.textContent = aiTurn ? `${who}'s turn (AI)` : `${who}'s turn`;
    }
  }

  // --- Turns / Flow ---
  function isAiTurn() {
    if (!running) return false;
    if (mode === 'aivai') return true;
    if (mode === 'pvai') {
      if (currentPlayer === 1) return p1Type === 'ai';
      return true; // player 2 is AI
    }
    return false;
  }

  function playCol(col) {
    if (!running || winline) return;
    const vm = validMoves(board);
    if (!vm.includes(col)) return;
    const pos = drop(board, col, currentPlayer);
    if (!pos) return;
    lastMove = pos;
    
    // Record move in history
    recordMove(currentPlayer, col);
    
    // Win / Draw / Switch
    const win = winningCells(board, currentPlayer);
    if (win) {
      winline = win;
      running = false;
      stopTimer();
      // Show victory popup after a short delay
      setTimeout(() => showVictoryPopup(currentPlayer), 800);
    } else if (validMoves(board).length === 0) {
      running = false; // draw
      stopTimer();
    } else {
      currentPlayer = currentPlayer === 1 ? 2 : 1;
    }
    // UI + AI scheduling
    renderBoard();
    updateHintButton();
    scheduleAiIfNeeded();
  }

  function scheduleAiIfNeeded() {
    // Clear prior timer
    if (aiTimerId) { clearTimeout(aiTimerId); aiTimerId = null; }
    aiPending = false;
    if (!isAiTurn()) return;
    aiPending = true;
    aiTimerId = setTimeout(() => {
      aiTimerId = null;
      aiPending = false;
      if (!running) return;
      const move = computeAiMove(currentPlayer);
      if (move != null) playCol(move);
    }, AI_DELAY_MS);
  }

  function computeAiMove(player) {
    const level = player === 1 ? p1Level : p2Level;
    if (level === 'easy') return aiEasy(board, player);
    if (level === 'medium') return aiMedium(board, player);
    // Depth schedule: deeper early (<= 8 filled), else 3
    let filled = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board[r][c] !== 0) filled++;
    const depth = filled <= 8 ? 4 : 3;
    return aiHard(board, player, depth);
  }

  // --- Victory Popup ---
  function showVictoryPopup(winner) {
    const playerName = winner === 1 ? 'Player 1' : 'Player 2';
    victoryTitle.textContent = `${playerName} Wins!`;
    victoryPopup.classList.remove('hidden');
    createConfetti();
  }

  function hideVictoryPopup() {
    victoryPopup.classList.add('hidden');
    confettiContainer.innerHTML = '';
  }

  function createConfetti() {
    const colors = ['#ff6b6b', '#ffd93d', '#4ecdc4', '#6bcf7f', '#667eea', '#f093fb'];
    const confettiCount = 50;
    
    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = Math.random() * 100 + '%';
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.animationDelay = Math.random() * 3 + 's';
      confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
      confettiContainer.appendChild(confetti);
    }
  }

  // --- Hint System ---
  function getHint() {
    if (!running || winline || currentPlayer !== 1 || p1Type !== 'human') return;
    
    // Use AI to calculate best move
    const hintCol = computeAiMove(currentPlayer);
    if (hintCol === null) {
      showHint('No valid moves available!');
      return;
    }
    
    // Check if it's a winning move
    const testBoard = copyBoard(board);
    const r = getNextRow(testBoard, hintCol);
    testBoard[r][hintCol] = currentPlayer;
    const isWinning = winningCells(testBoard, currentPlayer);
    
    // Check if it blocks opponent's win
    const opp = currentPlayer === 1 ? 2 : 1;
    const oppWin = findWinningMove(board, opp);
    const isBlocking = oppWin === hintCol;
    
    let message = `Try column ${hintCol + 1}`;
    if (isWinning) {
      message += ' - Winning move!';
    } else if (isBlocking) {
      message += ' - Blocks opponent!';
    } else {
      message += ' - Strategic position';
    }
    
    showHint(message);
    
    // Highlight the suggested column briefly
    highlightColumn(hintCol);
  }

  function showHint(message) {
    hintMessage.textContent = message;
    hintMessage.classList.remove('hidden');
    setTimeout(() => hideHint(), 5000); // Hide after 5 seconds
  }

  function hideHint() {
    hintMessage.classList.add('hidden');
  }

  function highlightColumn(col) {
    const cells = boardEl.children;
    for (let r = 0; r < ROWS; r++) {
      const cell = cells[idx(r, col)];
      cell.style.background = 'rgba(255, 217, 61, 0.2)';
      setTimeout(() => {
        cell.style.background = '';
      }, 2000);
    }
  }

  function updateHintButton() {
    const canUseHint = running && !winline && currentPlayer === 1 && p1Type === 'human' && mode === 'pvai';
    hintBtn.disabled = !canUseHint;
  }

  // --- Move History ---
  function recordMove(player, column) {
    // Evaluate move quality
    const quality = evaluateMoveQuality(board, player, column);
    
    moveHistory.push({
      player: player,
      column: column,
      moveNumber: moveHistory.length + 1,
      quality: quality.rating,
      score: quality.score
    });
    updateMoveHistory();
  }

  function evaluateMoveQuality(boardState, player, column) {
    // Get all valid moves and their scores
    const validCols = validMoves(boardState);
    if (validCols.length === 0) return { rating: 'neutral', score: 0 };
    
    // Calculate score for each possible move
    const moveScores = validCols.map(col => {
      const testBoard = copyBoard(boardState);
      const r = getNextRow(testBoard, col);
      if (r === null) return { col, score: -Infinity };
      testBoard[r][col] = player;
      
      // Check if it's a winning move
      if (winningCells(testBoard, player)) {
        return { col, score: 1000000 };
      }
      
      // Check if it blocks opponent's win
      const opp = player === 1 ? 2 : 1;
      const oppWinMove = findWinningMove(boardState, opp);
      if (col === oppWinMove) {
        return { col, score: 500000 };
      }
      
      // Use evaluation function
      const score = evaluate(testBoard, player);
      return { col, score };
    });
    
    // Find best move score
    const bestMove = moveScores.reduce((best, current) => 
      current.score > best.score ? current : best
    );
    
    // Find the score of the played move
    const playedMove = moveScores.find(m => m.col === column);
    if (!playedMove) return { rating: 'neutral', score: 0 };
    
    const scoreDiff = bestMove.score - playedMove.score;
    
    // Categorize move quality
    let rating;
    if (playedMove.score >= 1000000) {
      rating = 'excellent'; // Winning move
    } else if (playedMove.score >= 500000) {
      rating = 'excellent'; // Blocks opponent win
    } else if (scoreDiff <= 10) {
      rating = 'excellent'; // Very close to best
    } else if (scoreDiff <= 50) {
      rating = 'good'; // Decent move
    } else if (scoreDiff <= 150) {
      rating = 'okay'; // Acceptable
    } else {
      rating = 'poor'; // Suboptimal
    }
    
    return { rating, score: playedMove.score };
  }

  function updateMoveHistory() {
    if (moveHistory.length === 0) {
      moveList.innerHTML = '<p class="empty-history">No moves yet. Start playing!</p>';
      gameStats.classList.add('hidden');
      return;
    }
    
    // Render move list
    moveList.innerHTML = '';
    moveHistory.forEach(move => {
      const moveItem = document.createElement('div');
      moveItem.className = 'move-item';
      
      // Get quality indicator
      const qualityInfo = getMoveQualityDisplay(move.quality);
      
      moveItem.innerHTML = `
        <span class="move-number">#${move.moveNumber}</span>
        <div class="move-player ${move.player === 1 ? 'p1' : 'p2'}"></div>
        <span class="move-column">Col ${move.column + 1}</span>
        <span class="move-quality ${move.quality}" title="${qualityInfo.tooltip}">${qualityInfo.icon}</span>
      `;
      moveList.appendChild(moveItem);
    });
    
    // Scroll to bottom
    moveList.scrollTop = moveList.scrollHeight;
    
    // Update stats
    totalMovesEl.textContent = moveHistory.length;
    gameStats.classList.remove('hidden');
  }

  function getMoveQualityDisplay(quality) {
    const displays = {
      'excellent': { icon: '', tooltip: 'Excellent move!' },
      'good': { icon: '', tooltip: 'Good move' },
      'okay': { icon: '~', tooltip: 'Okay move' },
      'poor': { icon: '', tooltip: 'Poor move' },
      'neutral': { icon: '', tooltip: 'Neutral' }
    };
    return displays[quality] || displays['neutral'];
  }

  function clearMoveHistory() {
    moveHistory = [];
    updateMoveHistory();
  }

  // --- Game Timer ---
  function startTimer() {
    gameStartTime = Date.now();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimer() {
    if (!gameStartTime) return;
    const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    gameDurationEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // --- Controls / Events ---
  function startGame() {
    board = makeBoard();
    currentPlayer = 1;
    lastMove = null;
    winline = null;
    running = true;
    moveHistory = [];
    startTimer();
    renderBoard();
    updateHintButton();
    updateMoveHistory();
    scheduleAiIfNeeded();
  }
  function resetGame() {
    board = makeBoard();
    currentPlayer = 1;
    lastMove = null;
    winline = null;
    running = false;
    moveHistory = [];
    stopTimer();
    if (aiTimerId) { clearTimeout(aiTimerId); aiTimerId = null; aiPending = false; }
    hideVictoryPopup();
    hideHint();
    renderBoard();
    updateHintButton();
    updateMoveHistory();
  }

  // Board click -> only when Player 1 human, pvai, running
  boardEl.addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    if (!running || mode !== 'pvai' || currentPlayer !== 1 || p1Type !== 'human') return;
    const col = Number(cell.dataset.c);
    playCol(col);
  });

  // Preview disc (top row)
  boardEl.addEventListener('mousemove', e => {
    if (!(running && mode === 'pvai' && p1Type === 'human' && currentPlayer === 1)) {
      previewEl.classList.add('hidden');
      return;
    }
    const rect = boardEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const col = Math.max(0, Math.min(COLS - 1, Math.floor((x / rect.width) * COLS)));
    const colWidth = rect.width / COLS;
    const cx = rect.left + colWidth * col + colWidth / 2;
    previewEl.style.left = `${(col + 0.5) * 100}px`; // aligns with 100px cell size in CSS
    previewEl.classList.remove('hidden');
  });
  boardEl.addEventListener('mouseleave', () => previewEl.classList.add('hidden'));

  // Mode changes
  modeSel.addEventListener('change', () => {
    mode = modeSel.value; // 'pvai' | 'aivai'
    if (mode === 'aivai') {
      p1Type = 'ai';
      p1TypeSel.value = 'ai';
      p1LevelSel.disabled = false;
    } else {
      p1Type = 'human';
      p1TypeSel.value = 'human';
      p1LevelSel.disabled = false;
    }
    renderBoard();
    scheduleAiIfNeeded();
  });

  p1TypeSel.addEventListener('change', () => {
    p1Type = p1TypeSel.value;
    renderBoard();
    scheduleAiIfNeeded();
  });

  p1LevelSel.addEventListener('change', () => {
    p1Level = p1LevelSel.value;
    scheduleAiIfNeeded();
  });

  p2LevelSel.addEventListener('change', () => {
    p2Level = p2LevelSel.value;
    scheduleAiIfNeeded();
  });

  startBtn.addEventListener('click', startGame);
  resetBtn.addEventListener('click', resetGame);
  playAgainBtn.addEventListener('click', () => {
    hideVictoryPopup();
    startGame();
  });
  hintBtn.addEventListener('click', getHint);
  clearHistoryBtn.addEventListener('click', clearMoveHistory);

  // Close popup on background click
  victoryPopup.addEventListener('click', (e) => {
    if (e.target === victoryPopup) {
      hideVictoryPopup();
    }
  });

  // --- Init ---
  resetGame(); // start in Ready state
})();