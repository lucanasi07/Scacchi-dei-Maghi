'use strict';
// ============================================================
//  SCACCHI DEI MAGHI — Full Chess Engine + Wizard flavour
// ============================================================

const SYM = {
    white:{K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'},
    black:{K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'}
};
const NAMES = {K:'Re',Q:'Regina',R:'Torre',B:'Alfiere',N:'Cavaliere',P:'Pedone'};
const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];
const LINES = [
    'attacca con furia magica e abbatte',
    'lancia un incantesimo contro',
    'scaglia una maledizione su',
    'distrugge con un fulmine magico',
    'elimina con una mossa letale',
    'manda in frantumi con potere oscuro',
    'colpisce con la bacchetta e abbatte',
];

let board, turn, sel, legal, epTgt, cr, caps, hist, over, lastMv;

// ── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => { spawnStars(); newGame(); });

function newGame() {
    board = initBoard(); turn='white'; sel=null; legal=[];
    epTgt=null; cr={white:{k:true,q:true},black:{k:true,q:true}};
    caps={white:[],black:[]}; hist=[]; over=false; lastMv=null;
    hide('prmodal'); hide('gomodal');
    document.getElementById('blog').innerHTML='';
    document.getElementById('mhist').innerHTML='';
    paint(); ui(); log('⚔️ La grande battaglia magica ha inizio!','li');
}

function initBoard() {
    const b = Array.from({length:8},()=>Array(8).fill(null));
    const bk = ['R','N','B','Q','K','B','N','R'];
    for(let c=0;c<8;c++){
        b[0][c]={type:bk[c],color:'black'};
        b[1][c]={type:'P',color:'black'};
        b[6][c]={type:'P',color:'white'};
        b[7][c]={type:bk[c],color:'white'};
    }
    return b;
}

function cpB(b){ return b.map(r=>r.map(c=>c?{...c}:null)); }
function dc(o){ return JSON.parse(JSON.stringify(o)); }
function opp(c){ return c==='white'?'black':'white'; }
function ib(r,c){ return r>=0&&r<8&&c>=0&&c<8; }

// ── Rendering ─────────────────────────────────────────────────
function paint() {
    const el=document.getElementById('board'); el.innerHTML='';
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
        const sq=document.createElement('div');
        sq.className='sq '+((r+c)%2===0?'lt':'dk');
        if(c===0){ const s=document.createElement('span'); s.className='rl'; s.textContent=RANKS[r]; sq.appendChild(s); }
        if(r===7){ const s=document.createElement('span'); s.className='fl'; s.textContent=FILES[c]; sq.appendChild(s); }
        if(lastMv&&((r===lastMv.fr&&c===lastMv.fc)||(r===lastMv.tr&&c===lastMv.tc))) sq.classList.add('last');
        if(sel&&sel.r===r&&sel.c===c) sq.classList.add('sel');
        const mv=legal.find(m=>m.tr===r&&m.tc===c);
        if(mv){ const p=board[r][c]; if((p&&p.color!==turn)||mv.sp==='ep') sq.classList.add('cap'); else sq.classList.add('dot'); }
        const pc=board[r][c];
        if(pc&&pc.type==='K'&&pc.color===turn&&inCheck(board,turn)) sq.classList.add('chk');
        if(pc){ const p=document.createElement('span'); p.className='pc '+pc.color; p.textContent=SYM[pc.color][pc.type]; sq.appendChild(p); }
        sq.addEventListener('click',()=>click(r,c)); el.appendChild(sq);
    }
}

function ui() {
    const n=turn==='white'?'⬜ Forze della Luce':'⬛ Forze Oscure';
    document.getElementById('turndsp').textContent='⚔️ Turno — '+n;
    document.getElementById('wcard').classList.toggle('active',turn==='white');
    document.getElementById('bcard').classList.toggle('active',turn==='black');
    const ch=document.getElementById('chkdsp');
    ch.textContent=(!over&&inCheck(board,turn))?'⚠️ SCACCO! Il Re è in pericolo!':'';
    document.getElementById('wcaps').textContent=caps.white.map(p=>SYM[p.color][p.type]).join(' ');
    document.getElementById('bcaps').textContent=caps.black.map(p=>SYM[p.color][p.type]).join(' ');
}

function updHist() {
    const el=document.getElementById('mhist'); el.innerHTML='';
    for(let i=0;i<hist.length;i+=2){
        const d=document.createElement('div'); d.className='mrow';
        d.innerHTML=`<span class="mnum">${Math.floor(i/2)+1}.</span><span>${hist[i]?.not||''}</span><span>${hist[i+1]?.not||''}</span>`;
        el.appendChild(d);
    }
    el.scrollTop=el.scrollHeight;
}

// ── Input ──────────────────────────────────────────────────────
function click(r,c) {
    if(over) return;
    if(sel){
        const mv=legal.find(m=>m.tr===r&&m.tc===c);
        if(mv){ exec(mv); return; }
    }
    const pc=board[r][c];
    if(pc&&pc.color===turn){ sel={r,c}; legal=getLegal(board,r,c,turn,epTgt,cr); paint(); return; }
    sel=null; legal=[]; paint();
}

// ── Move execution ─────────────────────────────────────────────
function exec(mv,promo=null){
    const {fr,fc,tr,tc,sp}=mv;
    const mp=board[fr][fc];
    const snap={board:cpB(board),turn,epTgt:epTgt?{...epTgt}:null,cr:dc(cr),caps:{white:[...caps.white],black:[...caps.black]},lastMv:lastMv?{...lastMv}:null};
    let taken=board[tr][tc];

    if(sp==='ep'){   taken=board[fr][tc]; board[fr][tc]=null; }
    if(sp==='ck'){   board[tr][5]=board[tr][7]; board[tr][7]=null; }
    if(sp==='cq'){   board[tr][3]=board[tr][0]; board[tr][0]=null; }

    board[tr][tc]=mp; board[fr][fc]=null;

    // Promotion
    if(mp.type==='P'&&(tr===0||tr===7)){
        if(!promo){
            board=snap.board.map(r=>r.map(c=>c?{...c}:null));
            openPromo(mv,snap); return;
        }
        board[tr][tc]={type:promo,color:mp.color};
    }

    if(taken){ caps[turn].push(taken); }
    if(taken?.type==='R'){
        const b=taken.color==='white'?7:0;
        if(tr===b&&tc===0) cr[taken.color].q=false;
        if(tr===b&&tc===7) cr[taken.color].k=false;
    }
    if(mp.type==='K'){ cr[mp.color].k=false; cr[mp.color].q=false; }
    if(mp.type==='R'){
        const b=mp.color==='white'?7:0;
        if(fr===b&&fc===0) cr[mp.color].q=false;
        if(fr===b&&fc===7) cr[mp.color].k=false;
    }
    epTgt=(mp.type==='P'&&Math.abs(tr-fr)===2)?{row:(fr+tr)/2,col:fc}:null;

    if(taken){ const ph=LINES[Math.floor(Math.random()*LINES.length)]; const a=turn==='white'?'Bianco':'Nero'; const d=turn==='white'?'Nero':'Bianco'; log(`⚔️ Il ${NAMES[mp.type]} ${a} ${ph} il ${NAMES[taken.type]} ${d}!`,'lc'); }
    if(sp==='ck') log('🏰 Arrocco corto!','ll');
    if(sp==='cq') log('🏰 Arrocco lungo!','ll');

    snap.not=buildNot(mp,fr,fc,tr,tc,taken,sp);
    hist.push(snap);
    lastMv={fr,fc,tr,tc}; turn=opp(turn); sel=null; legal=[];

    const chk=inCheck(board,turn);
    const any=hasLegal(board,turn,epTgt,cr);
    if(chk&&!any){
        const w=turn==='white'?'Oscuro':'della Luce';
        log(`👑 SCACCO MATTO! Il Giocatore ${w} vince!`,'lg');
        over=true; setTimeout(()=>gameOver('cm',opp(turn)),800);
    } else if(!chk&&!any){
        log('🤝 Stallo! La partita è patta!','lg');
        over=true; setTimeout(()=>gameOver('st',null),800);
    } else if(chk){
        log('⚡ SCACCO! Il Re è in pericolo!','lk');
    }
    paint(); ui(); updHist();
}

// ── Undo ───────────────────────────────────────────────────────
function undoMove(){
    if(!hist.length) return;
    const s=hist.pop();
    board=s.board.map(r=>r.map(c=>c?{...c}:null));
    turn=s.turn; epTgt=s.epTgt?{...s.epTgt}:null; cr=dc(s.cr);
    caps={white:[...s.caps.white],black:[...s.caps.black]};
    lastMv=s.lastMv?{...s.lastMv}:null;
    sel=null; legal=[]; over=false; hide('gomodal');
    paint(); ui(); updHist(); log('↩️ Mossa annullata con magia!','li');
}

// ── Promotion ──────────────────────────────────────────────────
function openPromo(mv,snap){
    const color=snap.board[mv.fr][mv.fc]?.color??turn;
    const el=document.getElementById('prchoices'); el.innerHTML='';
    ['Q','R','B','N'].forEach(t=>{
        const b=document.createElement('button'); b.className='prb';
        b.textContent=SYM[color][t]; b.title=NAMES[t];
        b.addEventListener('click',()=>{
            hide('prmodal');
            board=snap.board.map(r=>r.map(c=>c?{...c}:null));
            turn=snap.turn; epTgt=snap.epTgt?{...snap.epTgt}:null; cr=dc(snap.cr);
            caps={white:[...snap.caps.white],black:[...snap.caps.black]};
            lastMv=snap.lastMv?{...snap.lastMv}:null;
            exec(mv,t);
        }); el.appendChild(b);
    }); show('prmodal');
}

// ── Game Over ──────────────────────────────────────────────────
function gameOver(type,winner){
    if(type==='cm'){
        const n=winner==='white'?'Forze della Luce':'Forze Oscure';
        document.getElementById('gotitle').textContent='👑 Scacco Matto!';
        document.getElementById('gomsg').textContent=`Le ${n} hanno vinto la grande battaglia!`;
    } else {
        document.getElementById('gotitle').textContent='🤝 Stallo!';
        document.getElementById('gomsg').textContent='Nessun mago prevale. La battaglia è patta.';
    }
    show('gomodal');
}

// ── Log ────────────────────────────────────────────────────────
function log(msg,cls='li'){ const el=document.getElementById('blog'); const d=document.createElement('div'); d.className=cls; d.textContent=msg; el.appendChild(d); el.scrollTop=el.scrollHeight; }
function show(id){ document.getElementById(id).classList.remove('hidden'); }
function hide(id){ document.getElementById(id).classList.add('hidden'); }

// ── Stars ──────────────────────────────────────────────────────
function spawnStars(){
    const c=document.getElementById('stars');
    for(let i=0;i<120;i++){
        const s=document.createElement('div'); s.className='star';
        const sz=Math.random()*2.5+0.5;
        s.style.cssText=`left:${Math.random()*100}%;top:${Math.random()*100}%;width:${sz}px;height:${sz}px;--dur:${(Math.random()*3+1.5).toFixed(1)}s;--del:${(Math.random()*5).toFixed(1)}s;opacity:${(Math.random()*.5+.2).toFixed(2)};`;
        c.appendChild(s);
    }
}

// ============================================================
//  CHESS ENGINE
// ============================================================

function getLegal(b,r,c,color,ep,cr2){
    const pc=b[r][c]; if(!pc||pc.color!==color) return [];
    return pseudo(b,r,c,ep,cr2).filter(mv=>{ const tb=cpB(b); apply(tb,mv); return !inCheck(tb,color); });
}

function pseudo(b,r,c,ep,cr2){
    const {type,color}=b[r][c]; const mvs=[];
    switch(type){
        case 'P': pawn(b,r,c,color,ep,mvs); break;
        case 'N': knight(b,r,c,color,mvs); break;
        case 'B': slide(b,r,c,color,[[-1,-1],[-1,1],[1,-1],[1,1]],mvs); break;
        case 'R': slide(b,r,c,color,[[-1,0],[1,0],[0,-1],[0,1]],mvs); break;
        case 'Q': slide(b,r,c,color,[[-1,-1],[-1,1],[1,-1],[1,1]],mvs); slide(b,r,c,color,[[-1,0],[1,0],[0,-1],[0,1]],mvs); break;
        case 'K': king(b,r,c,color,cr2,mvs); break;
    }
    return mvs;
}

function pawn(b,r,c,color,ep,mvs){
    const d=color==='white'?-1:1, st=color==='white'?6:1, o=opp(color);
    const push=(tr,tc,sp)=>mvs.push({fr:r,fc:c,tr,tc,sp:sp||null});
    if(ib(r+d,c)&&!b[r+d][c]){ push(r+d,c); if(r===st&&!b[r+2*d][c]) push(r+2*d,c); }
    for(const dc2 of[-1,1]){ const nr=r+d,nc=c+dc2; if(!ib(nr,nc)) continue; if(b[nr][nc]&&b[nr][nc].color===o) push(nr,nc); if(ep&&nr===ep.row&&nc===ep.col) push(nr,nc,'ep'); }
}

function knight(b,r,c,color,mvs){
    for(const [dr,dc2] of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){
        const nr=r+dr,nc=c+dc2; if(ib(nr,nc)&&b[nr][nc]?.color!==color) mvs.push({fr:r,fc:c,tr:nr,tc:nc,sp:null});
    }
}

function slide(b,r,c,color,dirs,mvs){
    for(const [dr,dc2] of dirs){
        let nr=r+dr,nc=c+dc2;
        while(ib(nr,nc)){ if(b[nr][nc]){ if(b[nr][nc].color!==color) mvs.push({fr:r,fc:c,tr:nr,tc:nc,sp:null}); break; } mvs.push({fr:r,fc:c,tr:nr,tc:nc,sp:null}); nr+=dr; nc+=dc2; }
    }
}

function king(b,r,c,color,cr2,mvs){
    for(const [dr,dc2] of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){
        const nr=r+dr,nc=c+dc2; if(ib(nr,nc)&&b[nr][nc]?.color!==color) mvs.push({fr:r,fc:c,tr:nr,tc:nc,sp:null});
    }
    const kR=color==='white'?7:0; if(r!==kR||c!==4||inCheck(b,color)) return;
    const rts=cr2[color];
    if(rts.k&&!b[kR][5]&&!b[kR][6]&&b[kR][7]?.type==='R'&&!atk(b,kR,5,color)&&!atk(b,kR,6,color)) mvs.push({fr:r,fc:c,tr:kR,tc:6,sp:'ck'});
    if(rts.q&&!b[kR][3]&&!b[kR][2]&&!b[kR][1]&&b[kR][0]?.type==='R'&&!atk(b,kR,3,color)&&!atk(b,kR,2,color)) mvs.push({fr:r,fc:c,tr:kR,tc:2,sp:'cq'});
}

function apply(b,mv){
    const {fr,fc,tr,tc,sp}=mv, pc=b[fr][fc];
    if(sp==='ep') b[fr][tc]=null;
    if(sp==='ck'){ b[tr][5]=b[tr][7]; b[tr][7]=null; }
    if(sp==='cq'){ b[tr][3]=b[tr][0]; b[tr][0]=null; }
    b[tr][tc]=pc; b[fr][fc]=null;
}

function atk(b,row,col,def){
    const a=opp(def);
    const aR=def==='white'?row+1:row-1;
    for(const dc2 of[-1,1]){ if(ib(aR,col+dc2)&&b[aR][col+dc2]?.type==='P'&&b[aR][col+dc2]?.color===a) return true; }
    for(const [dr,dc2] of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){ const r=row+dr,c=col+dc2; if(ib(r,c)&&b[r][c]?.type==='N'&&b[r][c]?.color===a) return true; }
    for(const [dr,dc2] of[[-1,-1],[-1,1],[1,-1],[1,1]]){ let r=row+dr,c=col+dc2; while(ib(r,c)){ if(b[r][c]){ if(b[r][c].color===a&&(b[r][c].type==='B'||b[r][c].type==='Q')) return true; break; } r+=dr; c+=dc2; } }
    for(const [dr,dc2] of[[-1,0],[1,0],[0,-1],[0,1]]){ let r=row+dr,c=col+dc2; while(ib(r,c)){ if(b[r][c]){ if(b[r][c].color===a&&(b[r][c].type==='R'||b[r][c].type==='Q')) return true; break; } r+=dr; c+=dc2; } }
    for(const [dr,dc2] of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){ const r=row+dr,c=col+dc2; if(ib(r,c)&&b[r][c]?.type==='K'&&b[r][c]?.color===a) return true; }
    return false;
}

function inCheck(b,color){
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(b[r][c]?.type==='K'&&b[r][c]?.color===color) return atk(b,r,c,color);
    return false;
}

function hasLegal(b,color,ep,cr2){
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(b[r][c]?.color===color&&getLegal(b,r,c,color,ep,cr2).length>0) return true;
    return false;
}

function buildNot(pc,fr,fc,tr,tc,taken,sp){
    if(sp==='ck') return 'O-O'; if(sp==='cq') return 'O-O-O';
    const p=pc.type==='P'?'':pc.type;
    const x=(taken||sp==='ep')?'x':'';
    const f=(pc.type==='P'&&x)?FILES[fc]:'';
    return p+f+x+FILES[tc]+RANKS[tr];
}
