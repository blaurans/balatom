(() => {
  'use strict';

  // --- Config ---
  const ANTE_TARGETS = [
    [300, 450, 600],      // 1
    [800, 1200, 1600],    // 2
    [2000, 3000, 4500],   // 3
    [6000, 9000, 12000],  // 4
    [15000, 22000, 30000],// 5
    [40000, 60000, 80000],// 6
    [100000, 150000, 200000], // 7
    [250000, 350000, 500000], // 8
  ];
  const BLIND_NAMES = ['Petite', 'Grosse', 'Boss'];
  const BASE_HANDS = 6;
  const WIN_ANTE = 8;
  const MAX_JOKERS = 5;

  const JOKER_POOL = [
    { id: 'dico', name: 'Dictionnaire', desc: '+30 Jetons par essai.', cost: 5, apply: (ctx) => { ctx.chips += 30; } },
    { id: 'rougeoyant', name: 'Rougeoyant', desc: '+4 Mult par lettre rouge.', cost: 6, apply: (ctx) => { ctx.mult += 4 * ctx.reds; } },
    { id: 'jaunisse', name: 'Jaunisse', desc: '+2 Mult par lettre jaune.', cost: 5, apply: (ctx) => { ctx.mult += 2 * ctx.yellows; } },
    { id: 'alphabet', name: 'Alphabet', desc: '+8 Jetons par lettre jaune ou rouge.', cost: 6, apply: (ctx) => { ctx.chips += 8 * (ctx.reds + ctx.yellows); } },
    { id: 'premiere', name: 'Première vue', desc: '+80 Jetons si trouvé du premier coup.', cost: 7, apply: (ctx) => { if (ctx.found && ctx.attemptNum === 1) ctx.chips += 80; } },
    { id: 'perseverant', name: 'Persévérant', desc: '+1 Mult par essai déjà utilisé.', cost: 5, apply: (ctx) => { ctx.mult += ctx.attemptNum - 1; } },
    { id: 'mot_trouve', name: 'Eurêka', desc: 'x2 Mult quand le mot est trouvé.', cost: 8, apply: (ctx) => { if (ctx.found) ctx.xmult *= 2; } },
    { id: 'long_mot', name: 'Mot long', desc: '+6 Jetons par lettre du mot.', cost: 6, apply: (ctx) => { ctx.chips += 6 * ctx.wordLen; } },
    { id: 'bleu_marine', name: 'Bleu marine', desc: '+15 Jetons par lettre bleue (absente).', cost: 4, apply: (ctx) => { ctx.chips += 15 * ctx.blues; } },
    { id: 'banquier', name: 'Banquier', desc: '+1$ à chaque blind remporté.', cost: 6, economy: { winMoney: 1 } },
    { id: 'interet', name: 'Intérêt', desc: '+2 Mult de base.', cost: 5, apply: (ctx) => { ctx.mult += 2; } },
    { id: 'coup_de_maitre', name: 'Coup de maître', desc: 'x1.5 Mult si trouvé en ≤3 essais.', cost: 7, apply: (ctx) => { if (ctx.found && ctx.attemptNum <= 3) ctx.xmult *= 1.5; } },
  ];

  const BOSS_MODS = [
    { id: 'court', name: 'Le Mur court', desc: 'Seulement 4 essais pour ce blind.', hands: 4 },
    { id: 'longmot', name: 'Le Marathon', desc: 'Mot de 8 lettres si possible.', preferLen: 8 },
    { id: 'cible_haute', name: 'Le Colosse', desc: 'Score cible x1.5.', targetMult: 1.5 },
    { id: 'sans_jaune', name: 'Brouillard', desc: 'Les lettres jaunes ne donnent pas de jetons bonus.', noYellowChips: true },
  ];

  // --- State ---
  let WORDS = [];
  let G = null;

  function freshGame() {
    return {
      ante: 1, blindIdx: 0, money: 4, jokers: [],
      roundScore: 0, target: 0, handsMax: BASE_HANDS, handsUsed: 0,
      secret: '', guesses: [], keyState: {}, over: false, wonRun: false,
      boss: null, noYellowChips: false, shop: null,
    };
  }

  // --- Utils ---
  const $ = (id) => document.getElementById(id);
  const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[^A-Z]/g, '');
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function shuffle(arr) { const a = arr.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

  function feedback(guess, target) {
    const res = Array(target.length).fill('absent');
    const rem = {};
    for (let i=0;i<target.length;i++) {
      if (guess[i] === target[i]) res[i] = 'correct';
      else rem[target[i]] = (rem[target[i]] || 0) + 1;
    }
    for (let i=0;i<target.length;i++) {
      if (res[i] === 'correct') continue;
      if (rem[guess[i]] > 0) { res[i] = 'present'; rem[guess[i]]--; }
    }
    return res;
  }

  function targetFor(ante, blindIdx, boss) {
    let t = ANTE_TARGETS[Math.min(ante, WIN_ANTE) - 1][blindIdx];
    if (boss && boss.targetMult) t = Math.floor(t * boss.targetMult);
    return t;
  }

  function chooseSecret(boss) {
    let pool = WORDS.filter(w => w.length >= 5 && w.length <= 8);
    if (boss && boss.preferLen) {
      const p = pool.filter(w => w.length === boss.preferLen);
      if (p.length) pool = p;
    }
    return pick(pool.length ? pool : WORDS);
  }

  // --- Round / flow ---
  function startBlind() {
    G.roundScore = 0;
    G.handsUsed = 0;
    G.guesses = [];
    G.keyState = {};
    G.boss = null;
    G.noYellowChips = false;
    let hands = BASE_HANDS;
    if (G.blindIdx === 2) {
      G.boss = pick(BOSS_MODS);
      if (G.boss.hands) hands = G.boss.hands;
      if (G.boss.noYellowChips) G.noYellowChips = true;
    }
    G.handsMax = hands;
    G.secret = chooseSecret(G.boss);
    G.target = targetFor(G.ante, G.blindIdx, G.boss);
    renderAll();
    setMessage(`Mot de ${G.secret.length} lettres. Première lettre : ${G.secret[0]}`);
    $('guess-input').disabled = false;
    $('guess-btn').disabled = false;
    $('guess-input').value = G.secret[0];
    $('guess-input').focus();
  }

  function scoreGuess(guess, fb) {
    const reds = fb.filter(x => x === 'correct').length;
    const yellows = fb.filter(x => x === 'present').length;
    const blues = fb.filter(x => x === 'absent').length;
    const found = guess === G.secret;
    let ctx = {
      chips: 10 + reds * 10 + (G.noYellowChips ? 0 : yellows * 4),
      mult: 1,
      xmult: 1,
      reds, yellows, blues, found,
      attemptNum: G.handsUsed,
      wordLen: G.secret.length,
    };
    for (const j of G.jokers) {
      if (j.apply) j.apply(ctx);
    }
    const total = Math.floor(ctx.chips * ctx.mult * ctx.xmult);
    let bonusText = `${Math.floor(ctx.chips)} × ${+(ctx.mult*ctx.xmult).toFixed(2)} = ${total}`;
    if (found) {
      const remainBonus = (G.handsMax - G.handsUsed) * 25;
      ctx.chips += remainBonus;
      const total2 = Math.floor(ctx.chips * ctx.mult * ctx.xmult);
      return { total: total2, detail: `Trouvé ! ${Math.floor(ctx.chips)} × ${+(ctx.mult*ctx.xmult).toFixed(2)} = ${total2}` };
    }
    return { total, detail: bonusText };
  }

  function submitGuess() {
    if (G.over || G.wonRun || G.shop) return;
    if (G.handsUsed >= G.handsMax) return;
    let raw = norm($('guess-input').value);
    if (raw.length !== G.secret.length) { setMessage(`Le mot doit faire ${G.secret.length} lettres.`); return; }
    if (raw[0] !== G.secret[0]) { setMessage(`La première lettre doit être ${G.secret[0]}.`); return; }
    // accept any A-Z word of correct length/first letter (relaxed dictionary for MVP)
    G.handsUsed++;
    const fb = feedback(raw, G.secret);
    for (let i=0;i<raw.length;i++) {
      const k = raw[i]; const s = fb[i];
      const rank = { correct:3, present:2, absent:1 };
      if (!G.keyState[k] || rank[s] > rank[G.keyState[k]]) G.keyState[k] = s;
    }
    const sc = scoreGuess(raw, fb);
    G.roundScore += sc.total;
    G.guesses.push({ word: raw, fb, score: sc.total, detail: sc.detail });
    renderAll();
    setMessage(sc.detail);

    const found = raw === G.secret;
    if (G.roundScore >= G.target) {
      endBlind(true, found);
    } else if (found) {
      // found but not enough score - rare, treat as fail blind attempt? keep playing if hands left
      if (G.handsUsed >= G.handsMax) endBlind(false, true);
      else { $('guess-input').value = G.secret[0]; $('guess-input').focus(); }
    } else if (G.handsUsed >= G.handsMax) {
      endBlind(false, false);
    } else {
      $('guess-input').value = G.secret[0];
      $('guess-input').focus();
    }
  }

  function endBlind(win, found) {
    $('guess-input').disabled = true;
    $('guess-btn').disabled = true;
    if (win) {
      const baseReward = [3,4,5][G.blindIdx];
      const handBonus = G.handsMax - G.handsUsed;
      let reward = baseReward + handBonus;
      for (const j of G.jokers) if (j.economy && j.economy.winMoney) reward += j.economy.winMoney;
      G.money += reward;
      const wasBoss = G.blindIdx === 2;
      const clearedAnte = wasBoss ? G.ante : null;
      if (wasBoss && G.ante >= WIN_ANTE) {
        G.wonRun = true;
        renderHUD();
        showOverlayWin(reward, found);
        return;
      }
      if (wasBoss) { G.ante++; G.blindIdx = 0; } else { G.blindIdx++; }
      renderHUD();
      openShop(reward, found, clearedAnte);
    } else {
      G.over = true;
      renderHUD();
      showOverlayLose(found);
    }
  }

  // --- Shop ---
  function openShop(reward, found, clearedAnte) {
    const offers = shuffle(JOKER_POOL).slice(0, 3).map(j => ({ ...j, uid: Math.random().toString(36).slice(2) }));
    G.shop = { offers, reward, found, clearedAnte };
    renderShop();
  }

  function renderShop() {
    const s = G.shop; if (!s) return;
    $('overlay-title').textContent = s.clearedAnte ? `Ante ${s.clearedAnte} terminée !` : 'Blind remporté !';
    let html = `<p class="score-pop">Mot : <b>${G.secret}</b> ${s.found ? '✓ trouvé' : ''}</p>`;
    html += `<p class="score-pop">Récompense : <b>+$${s.reward}</b> · Argent : <b>$${G.money}</b></p>`;
    html += `<p class="stats">Score ${G.roundScore} / ${G.target}. Choisissez un joker (slots ${G.jokers.length}/${MAX_JOKERS}) :</p>`;
    html += `<div class="shop-items">`;
    for (const o of s.offers) {
      const owned = G.jokers.length >= MAX_JOKERS;
      const canBuy = G.money >= o.cost && !owned;
      html += `<div class="shop-item">
        <div class="jname">${o.name}</div>
        <div class="jdesc">${o.desc}</div>
        <div class="price">$${o.cost}</div>
        <button ${canBuy ? '' : 'disabled'} data-buy="${o.uid}">${owned ? 'Slots pleins' : (G.money < o.cost ? 'Trop cher' : 'Acheter')}</button>
      </div>`;
    }
    html += `</div>`;
    $('overlay-body').innerHTML = html;
    $('overlay-actions').innerHTML = `<button id="next-blind" class="gold">Blind suivant</button>`;
    $('overlay').classList.remove('hidden');

    $('overlay-body').querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-buy');
        const idx = s.offers.findIndex(o => o.uid === uid);
        if (idx < 0) return;
        const o = s.offers[idx];
        if (G.money < o.cost || G.jokers.length >= MAX_JOKERS) return;
        G.money -= o.cost;
        G.jokers.push({ id:o.id, name:o.name, desc:o.desc, cost:o.cost, apply:o.apply, economy:o.economy });
        s.offers.splice(idx,1);
        renderHUD(); renderJokers(); renderShop();
      });
    });
    $('next-blind').addEventListener('click', () => {
      G.shop = null;
      $('overlay').classList.add('hidden');
      startBlind();
    });
  }

  function showOverlayLose(found) {
    $('overlay-title').textContent = 'Défaite';
    $('overlay-body').innerHTML = `<p class="score-pop">Le mot était : <b>${G.secret}</b></p>
      <p class="stats">Score atteint : ${G.roundScore} / ${G.target}<br>Ante ${G.ante} — Blind ${BLIND_NAMES[G.blindIdx]}</p>`;
    $('overlay-actions').innerHTML = `<button id="retry" class="gold">Nouvelle partie</button>`;
    $('overlay').classList.remove('hidden');
    $('retry').addEventListener('click', () => { $('overlay').classList.add('hidden'); newGame(); });
  }

  function showOverlayWin(reward, found) {
    $('overlay-title').textContent = 'Victoire !';
    $('overlay-body').innerHTML = `<p class="score-pop">Vous avez remporté l'Ante 8 !</p>
      <p class="stats">Mot final : <b>${G.secret}</b><br>Récompense : +$${reward} · Argent final : $${G.money}</p>`;
    $('overlay-actions').innerHTML = `<button id="retry" class="gold">Rejouer</button>`;
    $('overlay').classList.remove('hidden');
    $('retry').addEventListener('click', () => { $('overlay').classList.add('hidden'); newGame(); });
  }

  // --- Render ---
  function setMessage(msg) { $('message').textContent = msg || ''; }

  function renderHUD() {
    $('hud-ante').textContent = `${G.ante} / ${WIN_ANTE}`;
    $('hud-blind').textContent = BLIND_NAMES[G.blindIdx];
    $('hud-score').textContent = `${G.roundScore} / ${G.target}`;
    $('hud-hands').textContent = `${G.handsUsed} / ${G.handsMax}`;
    $('hud-money').textContent = G.money;
    const bd = $('boss-desc');
    if (G.boss) { bd.textContent = `Boss — ${G.boss.name} : ${G.boss.desc}`; bd.classList.remove('hidden'); }
    else bd.classList.add('hidden');
  }

  function renderJokers() {
    $('joker-count').textContent = `(${G.jokers.length}/${MAX_JOKERS})`;
    const list = $('jokers-list');
    list.innerHTML = '';
    G.jokers.forEach((j, i) => {
      const d = document.createElement('div');
      d.className = 'joker';
      const sell = Math.max(1, Math.floor((j.cost || 4) / 2));
      d.innerHTML = `<span class="jname">${j.name}</span><span class="jdesc">${j.desc}</span><span class="jsell" data-sell="${i}">Vendre (+$${sell})</span>`;
      list.appendChild(d);
    });
    list.querySelectorAll('[data-sell]').forEach(el => {
      el.addEventListener('click', () => {
        const i = Number(el.getAttribute('data-sell'));
        const j = G.jokers[i]; if (!j) return;
        G.money += Math.max(1, Math.floor((j.cost || 4) / 2));
        G.jokers.splice(i,1);
        renderHUD(); renderJokers();
      });
    });
  }

  function renderBoard() {
    const board = $('board');
    board.innerHTML = '';
    const len = G.secret ? G.secret.length : 6;
    const rowsToShow = Math.max(G.guesses.length + (G.handsUsed < G.handsMax && !G.over && !G.wonRun ? 1 : 0), 1);
    for (let r=0; r<rowsToShow; r++) {
      const row = document.createElement('div'); row.className = 'row';
      const g = G.guesses[r];
      for (let c=0; c<len; c++) {
        const t = document.createElement('div'); t.className = 'tile';
        if (g) {
          t.textContent = g.word[c];
          t.classList.add(g.fb[c]);
        } else if (r === G.guesses.length) {
          // active row hint: show first letter
          if (c === 0) { t.textContent = G.secret[0]; t.classList.add('correct'); }
        }
        row.appendChild(t);
      }
      board.appendChild(row);
    }
  }

  function renderKeyboard() {
    const rows = ['AZERTYUIOP','QSDFGHJKLM','WXCVBN'];
    const kb = $('keyboard'); kb.innerHTML = '';
    for (const r of rows) {
      const rd = document.createElement('div'); rd.className = 'krow';
      for (const ch of r) {
        const b = document.createElement('button'); b.className = 'key'; b.textContent = ch;
        if (G.keyState[ch]) b.classList.add(G.keyState[ch]);
        b.addEventListener('click', () => onKey(ch));
        rd.appendChild(b);
      }
      kb.appendChild(rd);
    }
    const rd = document.createElement('div'); rd.className = 'krow';
    const back = document.createElement('button'); back.className = 'key'; back.textContent = '⌫';
    back.addEventListener('click', () => onKey('BACK'));
    const enter = document.createElement('button'); enter.className = 'key'; enter.textContent = '↵';
    enter.addEventListener('click', () => submitGuess());
    rd.appendChild(back); rd.appendChild(enter); kb.appendChild(rd);
  }

  function renderAll() { renderHUD(); renderJokers(); renderBoard(); renderKeyboard(); }

  // --- Input ---
  function onKey(k) {
    if (G.over || G.wonRun || G.shop) return;
    const inp = $('guess-input');
    if (k === 'BACK') {
      let v = norm(inp.value);
      if (v.length > 1) inp.value = v.slice(0,-1);
      else inp.value = G.secret[0] || '';
      return;
    }
    if (k === 'ENTER') { submitGuess(); return; }
    let v = norm(inp.value);
    if (v.length < G.secret.length) {
      if (v.length === 0) v = G.secret[0];
      inp.value = (v + k).slice(0, G.secret.length);
    }
  }

  function bindInput() {
    const inp = $('guess-input');
    inp.addEventListener('input', () => {
      let v = norm(inp.value);
      if (!v.startsWith(G.secret[0])) v = G.secret[0] + v.replace(new RegExp('^'+G.secret[0]), '');
      if (v.length > G.secret.length) v = v.slice(0, G.secret.length);
      if (v.length === 0) v = G.secret[0];
      inp.value = v;
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitGuess(); }
      if (e.key === 'Backspace' && norm(inp.value).length <= 1) {
        e.preventDefault(); inp.value = G.secret[0];
      }
    });
    $('guess-btn').addEventListener('click', submitGuess);
  }

  // --- Init ---
  function newGame() {
    G = freshGame();
    startBlind();
  }

  async function init() {
    try {
      const r = await fetch('words.json');
      WORDS = await r.json();
    } catch (e) {
      WORDS = ['BALATON','AROMATE','MUSIQUE','CHOSE','PIANO','MAISON','ORANGE','SOURIS','PLAFOND','LUMIERE'];
    }
    WORDS = WORDS.map(norm).filter(w => w.length >= 5 && w.length <= 8);
    bindInput();
    const hotspot = $('secret-hotspot');
    if (hotspot) {
      hotspot.addEventListener('click', () => {
        if (G && G.secret) {
          setMessage(`Mot : ${G.secret}`);
        }
      });
    }
    // welcome overlay
    $('overlay-title').textContent = 'Balatom';
    $('overlay-body').innerHTML = `<p class="stats">Un mélange de <b>Sutom</b> et <b>Balatro</b>.</p>
      <ul class="stats">
        <li>Devinez le mot secret façon Sutom : la première lettre est donnée, <span style="color:#e74c3c">rouge</span> = bien placé, <span style="color:#f1c40f">jaune</span> = présent, bleu = absent.</li>
        <li>Chaque essai marque des points : <b>Jetons × Multiplicateur</b>. Atteignez le score cible du blind avant d'épuiser vos essais.</li>
        <li>Trouvez le mot pour un bonus ! Entre les blinds, achetez des <b>jokers</b> qui modifient le scoring.</li>
        <li>Gagnez l'Ante 8 pour remporter la partie.</li>
      </ul>`;
    $('overlay-actions').innerHTML = `<button id="start" class="gold">Jouer</button>`;
    $('overlay').classList.remove('hidden');
    $('start').addEventListener('click', () => { $('overlay').classList.add('hidden'); newGame(); });
  }

  init();
})();
