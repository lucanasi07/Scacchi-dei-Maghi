// ============================================================
//  SCACCHI DEI MAGHI — Wizard Chess
//  Full chess engine + Italian wizard flavour
// ============================================================

'use strict';

// ── Constants ────────────────────────────────────────────────

const SYM = {
    white: { K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙' },
    black: { K:'♚', Q:'♛', R:'♜', B:'♝', N:'♞', P:'♟' }
};

const NAMES = {
    K:'Re', Q:'Regina', R:'Torre', B:'Alfiere', N:'Cavaliere', P:'Pedone'
};

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

const BATTLE_LINES = [
    'attacca con furia magica e abbatte',
    'lancia un incantesimo contro',
    'scaglia una maledizione su',
    'distrugge con un fulmine magico',
    'elimina con una mossa letale',
    'manda in frantumi con potere oscuro',
    'colpisce con la bacchetta e abbatte',
];

// ── Game State ───────────────────────────────────────────────

let board;            // 8×8 array of {type,color} | null
let turn;             // 'white' | 'black'
let selected;         // {row,col} | null
let legalMoves;       // array of move objects
let epTarget;         // en-passant landing square {row,col} | null
let castleRights;     // {white:{k,q}, black:{k,q}}
let captured;         // {white:[], black:[]} — pieces taken BY each side
let history;          // stack of snapshots for undo
let over;             // bool
let lastMove;         // {fr,fc,tr,tc} for highlighting

// ── Bootstrap ────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    spawnStars();
    newGame();
});

function newGame() {
    board         = startingBoard();
    turn          = 'white';
    selected      = null;
    legalMoves    = [];
    epTarget      = null;
    castleRights  = { white:{k:true,q:true}, black:{k:true,q:true} };
    captured      = { white:[], black:[] };
    history       = [];
    over          = false;
    lastMove      = null;

    hideModal('gameover-modal');
    hideModal('promotion-modal');
    document.getElementById('battle-log').innerHTML   = '';
    document.getElementById('move-history').innerHTML = '';

    paint();
    refreshUI();
    addLog('⚔️ La grande battaglia magica ha inizio!', 'log-info');
}

// ── Board initialisation ─────────────────────────────────────

function startingBoard() {
    const b    = emptyBoard();
    const back = ['R','N','B','Q','K','B','N','R'];
    for (let c = 0; c < 8; c++) {
        b[0][c] = { type: back[c], color: 'black' };
        b[1][c] = { type: 'P',     color: 'black' };
        b[6][c] = { type: 'P',     color: 'white' };
        b[7][c] = { type: back[c], color: 'white' };
    }
    return b;
}

function emptyBoard() {
    return Array.from({length:8}, () => Array(8).fill(null));
}

function copyBoard(b) {
    return b.map(row => row.map(cell => cell ? {...cell} : null));
}

// ── Rendering ────────────────────────────────────────────────

function paint() {
    const el = document.getElementById('board');
    el.innerHTML = '';

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const sq = document.createElement('div');
            sq.className = 'sq ' + ((row+col)%2===0 ? 'light' : 'dark');
            sq.dataset.row = row;
            sq.dataset.col = col;

            // Coordinate labels
            if (col === 0) {
                const rl = document.createElement('span');
                rl.className = 'rank-label';
                rl.textContent = RANKS[row];
                sq.appendChild(rl);
            }
            if (row === 7) {
                const fl = document.createElement('span');
                fl.className = 'file-label';
                fl.textContent = FILES[col];
                sq.appendChild(fl);
            }

            // Last-move tint
            if (lastMove &&
                ((row===lastMove.fr && col===lastMove.fc) ||
                 (row===lastMove.tr && col===lastMove.tc))) {
                sq.classList.add('last-move');
            }

            // Selection highlight
            if (selected && selected.row===row && selected.col===col) {
                sq.classList.add('selected');
            }

            // Legal move indicators
            const mv = legalMoves.find(m => m.tr===row && m.tc===col);
            if (mv) {
                const piece = board[row][col];
                if (piece && piece.color !== turn) {
                    sq.classList.add('capture-target');
                } else if (mv.special === 'ep') {
                    sq.classList.add('capture-target');
                } else {
                    sq.classList.add('move-target');
                }
            }

            // King-in-check flash
            const piece = board[row][col];
            if (piece && piece.type==='K' && piece.color===turn && kingInCheck(board, turn)) {
                sq.classList.add('in-check');
            }

            // Piece glyph
            if (piece) {
                const p = document.createElement('span');
                p.className = `piece ${piece.color}`;
                p.textContent = SYM[piece.color][piece.type];
                sq.appendChild(p);
            }

            sq.addEventListener('click', () => onSquareClick(row, col));
            el.appendChild(sq);
        }
    }
}

function refreshUI() {
    const turnName = turn === 'white'
        ? '⬜ Forze della Luce'
        : '⬛ Forze Oscure';
    document.getElementById('turn-display').textContent = `⚔️ Turno — ${turnName}`;

    // Active player highlight
    document.getElementById('white-card').classList.toggle('active', turn==='white');
    document.getElementById('black-card').classList.toggle('active', turn==='black');

    // Check indicator
    const checkEl = document.getElementById('check-display');
    if (!over && kingInCheck(board, turn)) {
        checkEl.textContent = '⚠️ SCACCO! Il Re è in pericolo!';
    } else {
        checkEl.textContent = '';
    }

    // Captured pieces
    document.getElementById('white-captured').textContent =
        captured.white.map(p => SYM[p.color][p.type]).join(' ');
    document.getElementById('black-captured').textContent =
        captured.black.map(p => SYM[p.color][p.type]).join(' ');
}

function updateMoveHistory() {
    const el = document.getElementById('move-history');
    el.innerHTML = '';
    for (let i = 0; i < history.length; i += 2) {
        const wNotation = history[i]?.notation || '';
        const bNotation = history[i+1]?.notation || '';
        const row = document.createElement('div');
        row.className = 'move-row';
        row.innerHTML = `<span class="move-num">${Math.floor(i/2)+1}.</span>`
                      + `<span>${wNotation}</span>`
                      + `<span>${bNotation}</span>`;
        el.appendChild(row);
    }
    el.scrollTop = el.scrollHeight;
}

// ── Input handling ───────────────────────────────────────────

function onSquareClick(row, col) {
    if (over) return;

    const piece = board[row][col];

    // If a legal destination was clicked → execute move
    if (selected) {
        const mv = legalMoves.find(m => m.tr===row && m.tc===col);
        if (mv) {
            doMove(mv);
            return;
        }
    }

    // Select own piece
    if (piece && piece.color === turn) {
        selected  = { row, col };
        legalMoves = computeLegalMoves(board, row, col, turn, epTarget, castleRights);
        paint();
        return;
    }

    // Deselect
    selected  = null;
    legalMoves = [];
    paint();
}

// ── Move execution ───────────────────────────────────────────

function doMove(mv, promoPiece = null) {
    const { fr, fc, tr, tc, special } = mv;
    const movingPiece = board[fr][fc];

    // Snapshot for undo (before any board mutation)
    const snap = {
        board:        copyBoard(board),
        turn,
        epTarget:     epTarget  ? {...epTarget}  : null,
        castleRights: deepCopy(castleRights),
        captured:     { white:[...captured.white], black:[...captured.black] },
        lastMove:     lastMove ? {...lastMove} : null,
    };

    let takenPiece = board[tr][tc];   // may be null

    // En-passant capture
    if (special === 'ep') {
        takenPiece = board[fr][tc];
        board[fr][tc] = null;
    }

    // Castling — rook hop
    if (special === 'castle-k') {
        board[tr][5] = board[tr][7];
        board[tr][7] = null;
    }
    if (special === 'castle-q') {
        board[tr][3] = board[tr][0];
        board[tr][0] = null;
    }

    // Move piece
    board[tr][tc] = movingPiece;
    board[fr][fc] = null;

    // Pawn promotion — show dialog first time, then re-enter with choice
    if (movingPiece.type === 'P' && (tr === 0 || tr === 7)) {
        if (!promoPiece) {
            // Restore board and show modal; real move happens on selection
            board = snap.board.map(r => r.map(c => c ? {...c} : null));
            openPromotionModal(mv, snap);
            return;
        }
        board[tr][tc] = { type: promoPiece, color: movingPiece.color };
    }

    // Update captured pieces list
    if (takenPiece) {
        captured[turn].push(takenPiece);
    }
    // If a rook was captured on its starting square, revoke castling
    if (takenPiece?.type === 'R') {
        const base = takenPiece.color === 'white' ? 7 : 0;
        if (tr === base && tc === 0) castleRights[takenPiece.color].q = false;
        if (tr === base && tc === 7) castleRights[takenPiece.color].k = false;
    }

    // Update castling rights for moving piece
    if (movingPiece.type === 'K') {
        castleRights[movingPiece.color].k = false;
        castleRights[movingPiece.color].q = false;
    }
    if (movingPiece.type === 'R') {
        const base = movingPiece.color === 'white' ? 7 : 0;
        if (fr === base && fc === 0) castleRights[movingPiece.color].q = false;
        if (fr === base && fc === 7) castleRights[movingPiece.color].k = false;
    }

    // Update en-passant target
    epTarget = (movingPiece.type === 'P' && Math.abs(tr-fr) === 2)
        ? { row: (fr+tr)/2, col: fc }
        : null;

    // Battle log
    if (takenPiece) {
        const phrase = BATTLE_LINES[Math.floor(Math.random() * BATTLE_LINES.length)];
        const attacker = turn === 'white' ? 'Bianco' : 'Nero';
        const defender = turn === 'white' ? 'Nero'   : 'Bianco';
        addLog(
            `⚔️ Il ${NAMES[movingPiece.type]} ${attacker} ${phrase} il ${NAMES[takenPiece.type]} ${defender}!`,
            'log-capture'
        );
    }
    if (special === 'castle-k') addLog('🏰 Arrocco corto!',  'log-castle');
    if (special === 'castle-q') addLog('🏰 Arrocco lungo!', 'log-castle');

    // Build algebraic notation and save snapshot
    const notation = buildNotation(movingPiece, fr, fc, tr, tc, takenPiece, special);
    snap.notation  = notation;
    history.push(snap);

    // Advance turn
    lastMove = { fr, fc, tr, tc };
    turn     = turn === 'white' ? 'black' : 'white';
    selected  = null;
    legalMoves = [];

    // Detect check / checkmate / stalemate
    const inCheck    = kingInCheck(board, turn);
    const hasAnyMove = playerHasLegalMoves(board, turn, epTarget, castleRights);

    if (inCheck && !hasAnyMove) {
        const winner = turn === 'white' ? 'Oscuro' : 'della Luce';
        addLog(`👑 SCACCO MATTO! Il Giocatore ${winner} vince!`, 'log-gameover');
        over = true;
        setTimeout(() => showGameOver('checkmate', turn==='white' ? 'black' : 'white'), 800);
    } else if (!inCheck && !hasAnyMove) {
        addLog('🤝 Stallo! La partita è patta!', 'log-gameover');
        over = true;
        setTimeout(() => showGameOver('stalemate', null), 800);
    } else if (inCheck) {
        addLog('⚡ SCACCO! Il Re è in pericolo!', 'log-check');
    }

    paint();
    refreshUI();
    updateMoveHistory();
}

// ── Undo ─────────────────────────────────────────────────────

function undoMove() {
    if (history.length === 0) return;
    const snap = history.pop();
    board        = snap.board.map(r => r.map(c => c ? {...c} : null));
    turn         = snap.turn;
    epTarget     = snap.epTarget  ? {...snap.epTarget}  : null;
    castleRights = deepCopy(snap.castleRights);
    captured     = { white:[...snap.captured.white], black:[...snap.captured.black] };
    lastMove     = snap.lastMove  ? {...snap.lastMove}  : null;
    selected     = null;
    legalMoves   = [];
    over         = false;
    hideModal('gameover-modal');
    paint();
    refreshUI();
    updateMoveHistory();
    addLog('↩️ Mossa annullata con magia!', 'log-info');
}

// ── Promotion dialog ─────────────────────────────────────────

function openPromotionModal(mv, snap) {
    const color   = board[mv.fr][mv.fc]?.color ?? turn;
    const choices = document.getElementById('promotion-choices');
    choices.innerHTML = '';

    ['Q','R','B','N'].forEach(type => {
        const btn = document.createElement('button');
        btn.className = 'promo-btn';
        btn.textContent = SYM[color][type];
        btn.title = NAMES[type];
        btn.addEventListener('click', () => {
            hideModal('promotion-modal');
            // Restore pre-move state; snap.board is already the pre-move board
            board        = snap.board.map(r => r.map(c => c ? {...c} : null));
            turn         = snap.turn;
            epTarget     = snap.epTarget     ? {...snap.epTarget}     : null;
            castleRights = deepCopy(snap.castleRights);
            captured     = { white:[...snap.captured.white], black:[...snap.captured.black] };
            lastMove     = snap.lastMove ? {...snap.lastMove} : null;
            doMove(mv, type);
        });
        choices.appendChild(btn);
    });

    showModal('promotion-modal');
}

// ── Game-over modal ──────────────────────────────────────────

function showGameOver(type, winner) {
    const titleEl = document.getElementById('gameover-title');
    const msgEl   = document.getElementById('gameover-msg');
    if (type === 'checkmate') {
        const name = winner === 'white' ? 'Forze della Luce' : 'Forze Oscure';
        titleEl.textContent = '👑 Scacco Matto!';
        msgEl.textContent   = `Le ${name} hanno vinto la grande battaglia magica!`;
    } else {
        titleEl.textContent = '🤝 Stallo!';
        msgEl.textContent   = 'Nessun mago prevale. La battaglia si conclude in parità.';
    }
    showModal('gameover-modal');
}

// ── Log ──────────────────────────────────────────────────────

function addLog(msg, cls = 'log-info') {
    const log  = document.getElementById('battle-log');
    const line = document.createElement('div');
    line.className = cls;
    line.textContent = msg;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function clearLog() {
    document.getElementById('battle-log').innerHTML = '';
}

// ── Modal helpers ─────────────────────────────────────────────

function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

// ── Stars ────────────────────────────────────────────────────

function spawnStars() {
    const container = document.getElementById('stars');
    for (let i = 0; i < 120; i++) {
        const s = document.createElement('div');
        s.className = 'star';
        const size = Math.random() * 2.5 + 0.5;
        s.style.cssText = [
            `left:${Math.random()*100}%`,
            `top:${Math.random()*100}%`,
            `width:${size}px`,
            `height:${size}px`,
            `--dur:${(Math.random()*3+1.5).toFixed(1)}s`,
            `opacity:${(Math.random()*0.5+0.2).toFixed(2)}`,
            `animation-delay:${(Math.random()*4).toFixed(1)}s`,
        ].join(';');
        container.appendChild(s);
    }
}

// ── Helpers ───────────────────────────────────────────────────

function deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function opponent(color) { return color === 'white' ? 'black' : 'white'; }

// ============================================================
//  CHESS ENGINE
// ============================================================

// ── Legal moves for a single square ──────────────────────────

function computeLegalMoves(b, row, col, color, ep, cr) {
    const piece = b[row][col];
    if (!piece || piece.color !== color) return [];

    return pseudoMoves(b, row, col, ep, cr).filter(mv => {
        const tb = copyBoard(b);
        applyMove(tb, mv);
        return !kingInCheck(tb, color);
    });
}

// ── Pseudo-legal move generation ─────────────────────────────

function pseudoMoves(b, row, col, ep, cr) {
    const { type, color } = b[row][col];
    const moves = [];

    switch (type) {
        case 'P': pawnMoves(b, row, col, color, ep, moves); break;
        case 'N': knightMoves(b, row, col, color, moves);   break;
        case 'B': slidingMoves(b, row, col, color, [[-1,-1],[-1,1],[1,-1],[1,1]], moves); break;
        case 'R': slidingMoves(b, row, col, color, [[-1,0],[1,0],[0,-1],[0,1]], moves); break;
        case 'Q':
            slidingMoves(b, row, col, color, [[-1,-1],[-1,1],[1,-1],[1,1]], moves);
            slidingMoves(b, row, col, color, [[-1,0],[1,0],[0,-1],[0,1]],   moves);
            break;
        case 'K': kingMoves(b, row, col, color, cr, moves); break;
    }
    return moves;
}

function pawnMoves(b, row, col, color, ep, moves) {
    const dir   = color === 'white' ? -1 : 1;
    const start = color === 'white' ?  6 :  1;
    const opp   = opponent(color);

    const push = (tr, tc, sp) => moves.push({ fr:row, fc:col, tr, tc, special: sp||null });

    // Forward
    if (inBounds(row+dir, col) && !b[row+dir][col]) {
        push(row+dir, col);
        if (row === start && !b[row+2*dir][col]) push(row+2*dir, col);
    }

    // Captures
    for (const dc of [-1, 1]) {
        const nr = row + dir, nc = col + dc;
        if (!inBounds(nr, nc)) continue;
        if (b[nr][nc] && b[nr][nc].color === opp) push(nr, nc);
        if (ep && nr === ep.row && nc === ep.col)  push(nr, nc, 'ep');
    }
}

function knightMoves(b, row, col, color, moves) {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = row+dr, nc = col+dc;
        if (inBounds(nr, nc) && b[nr][nc]?.color !== color)
            moves.push({ fr:row, fc:col, tr:nr, tc:nc, special:null });
    }
}

function slidingMoves(b, row, col, color, dirs, moves) {
    for (const [dr, dc] of dirs) {
        let nr = row+dr, nc = col+dc;
        while (inBounds(nr, nc)) {
            if (b[nr][nc]) {
                if (b[nr][nc].color !== color)
                    moves.push({ fr:row, fc:col, tr:nr, tc:nc, special:null });
                break;
            }
            moves.push({ fr:row, fc:col, tr:nr, tc:nc, special:null });
            nr += dr; nc += dc;
        }
    }
}

function kingMoves(b, row, col, color, cr, moves) {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const nr = row+dr, nc = col+dc;
        if (inBounds(nr, nc) && b[nr][nc]?.color !== color)
            moves.push({ fr:row, fc:col, tr:nr, tc:nc, special:null });
    }

    // Castling
    const kRow = color === 'white' ? 7 : 0;
    if (row !== kRow || col !== 4) return;
    if (kingInCheck(b, color)) return;

    const rights = cr[color];

    // King-side
    if (rights.k
            && !b[kRow][5] && !b[kRow][6]
            && b[kRow][7]?.type === 'R'
            && !isAttacked(b, kRow, 5, color)
            && !isAttacked(b, kRow, 6, color)) {
        moves.push({ fr:row, fc:col, tr:kRow, tc:6, special:'castle-k' });
    }

    // Queen-side
    if (rights.q
            && !b[kRow][3] && !b[kRow][2] && !b[kRow][1]
            && b[kRow][0]?.type === 'R'
            && !isAttacked(b, kRow, 3, color)
            && !isAttacked(b, kRow, 2, color)) {
        moves.push({ fr:row, fc:col, tr:kRow, tc:2, special:'castle-q' });
    }
}

// ── Apply move to a board copy (for check detection) ─────────

function applyMove(b, mv) {
    const { fr, fc, tr, tc, special } = mv;
    const piece = b[fr][fc];

    if (special === 'ep') { b[fr][tc] = null; }
    if (special === 'castle-k') { b[tr][5] = b[tr][7]; b[tr][7] = null; }
    if (special === 'castle-q') { b[tr][3] = b[tr][0]; b[tr][0] = null; }

    b[tr][tc] = piece;
    b[fr][fc] = null;
}

// ── Attack detection ──────────────────────────────────────────

function isAttacked(b, row, col, defenderColor) {
    // Use attack-pattern check from each piece type
    const atk = opponent(defenderColor);

    // Pawns
    const pDir = defenderColor === 'white' ? -1 : 1; // direction pawns of attacker come FROM
    for (const dc of [-1, 1]) {
        const r = row - pDir, c = col + dc;   // a pawn at (r,c) of atk color attacks (row,col)
        // For white defender, attacker is black; black pawns move downward (dir=+1), so they
        // attack from (row-1, col±1). For black defender, white pawns attack from (row+1, col±1).
        const attackRow = defenderColor === 'white' ? row+1 : row-1;
        if (inBounds(attackRow, c) && b[attackRow][c]?.type==='P' && b[attackRow][c]?.color===atk) return true;
    }

    // Knights
    for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const r=row+dr, c=col+dc;
        if (inBounds(r,c) && b[r][c]?.type==='N' && b[r][c]?.color===atk) return true;
    }

    // Sliders: bishops/queens on diagonals
    for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        let r=row+dr, c=col+dc;
        while (inBounds(r,c)) {
            if (b[r][c]) {
                if (b[r][c].color===atk && (b[r][c].type==='B'||b[r][c].type==='Q')) return true;
                break;
            }
            r+=dr; c+=dc;
        }
    }

    // Sliders: rooks/queens on lines
    for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let r=row+dr, c=col+dc;
        while (inBounds(r,c)) {
            if (b[r][c]) {
                if (b[r][c].color===atk && (b[r][c].type==='R'||b[r][c].type==='Q')) return true;
                break;
            }
            r+=dr; c+=dc;
        }
    }

    // King adjacency
    for (const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const r=row+dr, c=col+dc;
        if (inBounds(r,c) && b[r][c]?.type==='K' && b[r][c]?.color===atk) return true;
    }

    return false;
}

function kingInCheck(b, color) {
    for (let r=0; r<8; r++) {
        for (let c=0; c<8; c++) {
            if (b[r][c]?.type==='K' && b[r][c]?.color===color)
                return isAttacked(b, r, c, color);
        }
    }
    return false; // no king found (shouldn't happen)
}

function playerHasLegalMoves(b, color, ep, cr) {
    for (let r=0; r<8; r++) {
        for (let c=0; c<8; c++) {
            if (b[r][c]?.color === color) {
                if (computeLegalMoves(b, r, c, color, ep, cr).length > 0) return true;
            }
        }
    }
    return false;
}

// ── Algebraic notation ────────────────────────────────────────

function buildNotation(piece, fr, fc, tr, tc, taken, special) {
    if (special === 'castle-k') return 'O-O';
    if (special === 'castle-q') return 'O-O-O';

    const pChar   = piece.type === 'P' ? '' : piece.type;
    const capChar = (taken || special === 'ep') ? 'x' : '';
    const fromF   = (piece.type === 'P' && capChar) ? FILES[fc] : '';
    const dest    = FILES[tc] + RANKS[tr];
    return pChar + fromF + capChar + dest;
}
