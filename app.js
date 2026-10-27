/* 잼스 역사 낱말풀이 — 게임 엔진 */
'use strict';
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  // ---------- 설정 ----------
  const STAGES = 20;
  const ERAS = [
    { id: 'gu', name: '구석기', sub: '약 70만 년 전~' },
    { id: 'sin', name: '신석기', sub: '약 1만 년 전~' },
    { id: 'cheong', name: '청동기', sub: '기원전 2000년경~' },
    { id: 'gojo', name: '고조선', sub: '고조선·여러 나라' },
    { id: 'samguk', name: '삼국 시대', sub: '삼국·가야·남북국' },
    { id: 'goryeo', name: '고려', sub: '918~1392' },
    { id: 'joseon', name: '조선', sub: '1392~1863' },
    { id: 'ilje', name: '일제 강점기', sub: '1910~1945' },
    { id: 'modern', name: '근현대', sub: '개항~오늘날' }
  ];
  const ERA_NAME = Object.fromEntries(ERAS.map(e => [e.id, e.name]));

  // items: 초성 / 글자 열기 / 보기 / 검색 / 정답 공개
  const LEVELS = [
    { id: 'intro', name: '입문', en: 'INTRO', tiers: [1], fb: [2], target: 10, size: 9,
      desc: '역사 낱말과 처음 만나요. 초등 5학년 기초 낱말로 가볍게 시작!', grade: '초등 5학년 기초',
      band: '#efe3c6', btn: '#805a2b', items: { cho: 5, letter: 5, choice: 3, search: 3, reveal: 2 } },
    { id: 'basic', name: '초급', en: 'BASIC', tiers: [1, 2], fb: [], target: 10, size: 10,
      desc: '기초 낱말에 교과서 낱말을 더했어요. 열쇠를 꼼꼼히 읽어요.', grade: '초등 5학년 기초~교과서',
      band: '#dfe9e1', btn: '#224f42', items: { cho: 4, letter: 4, choice: 3, search: 3, reveal: 2 } },
    { id: 'mid', name: '중급', en: 'MIDDLE', tiers: [2], fb: [1], target: 15, size: 12,
      desc: '5학년 사회 교과서 수준. 인물·사건·문화유산을 넓게 다뤄요.', grade: '초등 5학년 사회 교과서',
      band: '#dde4ea', btn: '#37596a', items: { cho: 3, letter: 3, choice: 2, search: 3, reveal: 1 } },
    { id: 'adv', name: '상급', en: 'ADVANCED', tiers: [3], fb: [2], target: 16, size: 12,
      desc: '한국사능력검정시험 기본 단계 수준의 제도와 사건 낱말이에요.', grade: '한능검 기본 수준',
      band: '#e9e4ef', btn: '#5d4f7a', items: { cho: 3, letter: 3, choice: 2, search: 2, reveal: 1 } },
    { id: 'high', name: '고급', en: 'HIGH', tiers: [4], fb: [3], target: 20, size: 14,
      desc: '한능검 심화(고급) 수준. 기구·사료·인물을 정확히 알아야 해요.', grade: '한능검 심화 수준',
      band: '#f5e4d9', btn: '#9a5b3c', items: { cho: 2, letter: 3, choice: 1, search: 2, reveal: 1 } },
    { id: 'master', name: '마스터', en: 'MASTER', tiers: [4, 3], fb: [], target: 23, size: 15,
      desc: '심화 낱말 20개가 넘는 큰 판. 아이템은 가장 적어요. 진짜 역사 박사 도전!', grade: '한능검 심화 + 큰 판',
      band: '#e8dcc0', btn: '#183d35', items: { cho: 2, letter: 2, choice: 1, search: 2, reveal: 0 } }
  ];
  const ITEMS = [
    { id: 'cho', name: '초성 힌트', ic: 'ㄱ', cost: 20, desc: '고른 낱말의 첫소리를 보여 줘요. (예: ㄱㅈㅅ)' },
    { id: 'letter', name: '글자 열기', ic: '가', cost: 30, desc: '고른 낱말의 빈칸 한 글자를 열어 줘요.' },
    { id: 'choice', name: '보기 찬스', ic: '④', cost: 40, desc: '정답이 숨은 보기 4개 중에서 고를 수 있어요.' },
    { id: 'search', name: '검색 찬스', ic: '⌕', cost: 30, desc: '열쇠 문장으로 인터넷 검색을 해 볼 수 있어요.' },
    { id: 'reveal', name: '정답 공개', ic: '✦', cost: 100, desc: '고른 낱말의 정답을 모두 보여 줘요. (그 낱말 점수 0)' }
  ];
  const MISS_COST = 10;

  // ---------- 낱말 데이터 ----------
  const WORDS = [];
  ERAS.forEach(e => {
    (window.JAMS_WORDS[e.id] || '').split('\n').forEach(line => {
      line = line.trim();
      if (!line) return;
      const [a, t, ...rest] = line.split('|');
      const ans = a.trim();
      WORDS.push({ a: ans, t: +t, c: rest.join('|').trim(), e: e.id, s: Array.from(ans) });
    });
  });

  // ---------- 저장 ----------
  // 학생 계정(account.js)이 있으면 로그인한 학생(player.ref)별 칸에, 없으면 예전처럼 이 기기 공용 칸에 저장해요.
  const ACC = window.CrosswordAccount || null;
  const local = ACC ? ACC.storage : (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const SKEY_BASE = 'jams-crossword-v1';
  let SKEY = SKEY_BASE;
  const store = {
    load() { try { return JSON.parse(local.getItem(SKEY)) || {}; } catch (e) { return {}; } },
    save(o) { try { local.setItem(SKEY, JSON.stringify(o)); } catch (e) { /* 저장 불가 환경 */ } }
  };
  let DB = { rec: {} };
  const recKey = (L, topic, s) => `${LEVELS[L].id}|${topic}|${s}`;
  // 이 기기에 저장한 뒤 계정 저장(서버)에 알림. 서버 저장은 account.js 가 모아서 보내요.
  const notify = (kind, key, at) => { if (ACC) ACC.changed(kind, key, at); };

  // ---------- 이어 풀기(풀던 중 저장) ----------
  // 먼저 이 기기의 브라우저(localStorage)에 저장해요. 로그인한 학생이면 account.js 가 계정에도 저장해요.
  // 판 모양(sig)이 달라지면(낱말 데이터 변경 등) 저장한 풀이를 버리고 새로 시작해요.
  const PKEY_BASE = 'jams-crossword-progress-v1';
  let PKEY = PKEY_BASE;
  const PVER = 1;
  const PMAX = 12;
  function applyScope() {
    const k = ACC && ACC.keys();
    SKEY = k ? k.rec : SKEY_BASE;
    PKEY = k ? k.progress : PKEY_BASE;
  }
  const progress = {
    all() {
      try {
        const o = JSON.parse(local.getItem(PKEY));
        return o && o.v === PVER && o.items && typeof o.items === 'object' && !Array.isArray(o.items) ? o.items : {};
      } catch (e) { return {}; }
    },
    write(items) { try { local.setItem(PKEY, JSON.stringify({ v: PVER, items })); } catch (e) { /* 저장 불가 환경 */ } },
    get(key) { const v = this.all()[key]; return v && typeof v === 'object' && !Array.isArray(v) ? v : null; },
    put(key, val) {
      const items = this.all();
      items[key] = val;
      const at = k => (items[k] && +items[k].at) || 0;
      const out = Object.keys(items).sort((a, b) => at(b) - at(a)).slice(PMAX).map(k => [k, at(k)]);
      out.forEach(([k]) => delete items[k]);
      this.write(items);
      out.forEach(([k, t]) => notify('drop', k, t));
      notify('put', key);
    },
    drop(key) { const items = this.all(); if (key in items) { delete items[key]; this.write(items); notify('drop', key); } }
  };

  // ---------- 난수 ----------
  function seedOf(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function rngFor(str) {
    let a = seedOf(str);
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const shuffle = (arr, rng) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  // ---------- 낱말 모음(풀) ----------
  // 판을 다 채우지 못하면 차례로 넓힘:
  // ① 옆 난이도 → ② (한 시대만 고른 경우) 같은 시대의 한 단계 위·아래 낱말 → ③ 가까운 시대부터
  function getPools(L, topic) {
    const lv = LEVELS[L];
    const base = lv.tiers.concat(lv.fb);
    const fits = w => w.s.length <= lv.size;
    const steps = [];
    const add = (pool, eraOrder) => steps.push({ pool, rank: new Map(eraOrder.map((e, i) => [e, i])) });
    if (topic === 'all') {
      const all = ERAS.map(e => e.id);
      add(WORDS.filter(w => fits(w) && lv.tiers.includes(w.t)), all);
      if (lv.fb.length) add(WORDS.filter(w => fits(w) && base.includes(w.t)), all);
    } else {
      const ext = [1, 2, 3, 4].filter(t => !base.includes(t) && base.some(b => Math.abs(b - t) === 1));
      const ownTiers = base.concat(ext);
      const own = WORDS.filter(w => fits(w) && w.e === topic);
      add(own.filter(w => lv.tiers.includes(w.t)), [topic]);
      if (lv.fb.length) add(own.filter(w => base.includes(w.t)), [topic]);
      if (ext.length) add(own.filter(w => ownTiers.includes(w.t)), [topic]);
      const i = ERAS.findIndex(e => e.id === topic);
      const near = ERAS.map((e, j) => ({ id: e.id, d: Math.abs(j - i) + (j < i ? 0.5 : 0) }))
        .filter(o => o.id !== topic).sort((x, y) => x.d - y.d).map(o => o.id);
      for (let k = 1; k <= near.length; k++) {
        const order = [topic].concat(near.slice(0, k));
        add(own.filter(w => ownTiers.includes(w.t))
          .concat(WORDS.filter(w => fits(w) && order.includes(w.e) && w.e !== topic && base.includes(w.t))), order);
      }
    }
    steps.forEach(s => { s.conn = connectivity(s.pool); });
    return steps;
  }

  // 같은 글자를 가진 다른 낱말 수 (서로 엇갈리기 쉬운 정도)
  function connectivity(pool) {
    const by = new Map();
    pool.forEach(w => new Set(w.s).forEach(ch => { if (!by.has(ch)) by.set(ch, new Set()); by.get(ch).add(w.a); }));
    const conn = new Map();
    pool.forEach(w => {
      const o = new Set();
      new Set(w.s).forEach(ch => by.get(ch).forEach(a => { if (a !== w.a) o.add(a); }));
      conn.set(w.a, o.size);
    });
    return conn;
  }

  // ---------- 낱말풀이 만들기 ----------
  function tryBuild(first, order, target, size, rng) {
    const cells = new Map();
    const byChar = new Map();
    const placed = [];
    let minR = 0, maxR = 0, minC = 0, maxC = 0, crossings = 0;
    const K = (r, c) => r * 4096 + c;
    const get = (r, c) => cells.get(K(r, c));

    function place(w, r0, c0, dir) {
      const idx = placed.length;
      const [dr, dc] = dir === 'h' ? [0, 1] : [1, 0];
      for (let k = 0; k < w.s.length; k++) {
        const r = r0 + dr * k, c = c0 + dc * k;
        let cell = get(r, c);
        if (!cell) {
          cell = { ch: w.s[k], h: -1, v: -1, r, c };
          cells.set(K(r, c), cell);
          if (!byChar.has(cell.ch)) byChar.set(cell.ch, []);
          byChar.get(cell.ch).push(cell);
        } else crossings++;
        cell[dir] = idx;
        minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
      placed.push({ w, r: r0, c: c0, dir });
    }

    function check(w, r0, c0, dir) {
      const n = w.s.length;
      const [dr, dc] = dir === 'h' ? [0, 1] : [1, 0];
      const r1 = r0 + dr * (n - 1), c1 = c0 + dc * (n - 1);
      if (Math.max(maxR, r1) - Math.min(minR, r0) + 1 > size) return -1;
      if (Math.max(maxC, c1) - Math.min(minC, c0) + 1 > size) return -1;
      if (get(r0 - dr, c0 - dc) || get(r1 + dr, c1 + dc)) return -1;
      let cross = 0;
      for (let k = 0; k < n; k++) {
        const r = r0 + dr * k, c = c0 + dc * k;
        const cell = get(r, c);
        if (cell) {
          if (cell.ch !== w.s[k] || cell[dir] !== -1) return -1;
          cross++;
        } else if (dir === 'h' ? (get(r - 1, c) || get(r + 1, c)) : (get(r, c - 1) || get(r, c + 1))) return -1;
      }
      if (cross === 0 || cross === n) return -1;
      return cross;
    }

    place(first, 0, 0, rng() < 0.5 ? 'h' : 'v');
    const used = new Set([first.a]);

    let progress = true;
    while (placed.length < target && progress) {
      progress = false;
      for (const w of order) {
        if (placed.length >= target) break;
        if (used.has(w.a)) continue;
        let best = null, bestScore = -1e9;
        const seen = new Set();
        for (let i = 0; i < w.s.length; i++) {
          const list = byChar.get(w.s[i]);
          if (!list) continue;
          for (const cell of list) {
            for (const dir of ['h', 'v']) {
              if (cell[dir] !== -1) continue;
              const r0 = dir === 'h' ? cell.r : cell.r - i;
              const c0 = dir === 'h' ? cell.c - i : cell.c;
              const key = `${r0},${c0},${dir}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const cr = check(w, r0, c0, dir);
              if (cr < 0) continue;
              // 겹침이 많고, 판이 덜 넓어지는 자리를 고름
              const r1 = dir === 'h' ? r0 : r0 + w.s.length - 1;
              const c1 = dir === 'h' ? c0 + w.s.length - 1 : c0;
              const grow = (Math.max(maxR, r1) - Math.min(minR, r0)) + (Math.max(maxC, c1) - Math.min(minC, c0));
              const sc = cr * 6 - grow * 0.6 + rng() * 2;
              if (sc > bestScore) { bestScore = sc; best = [r0, c0, dir]; }
            }
          }
        }
        // 하나를 놓을 때마다 앞(우선순위 높은 낱말)부터 다시 살핌
        if (best) { place(w, best[0], best[1], best[2]); used.add(w.a); progress = true; break; }
      }
    }
    return { placed, minR, maxR, minC, maxC, crossings };
  }

  function finalize(res) {
    const rows = res.maxR - res.minR + 1, cols = res.maxC - res.minC + 1;
    const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
    const words = res.placed.map(p => ({ a: p.w.a, c: p.w.c, e: p.w.e, t: p.w.t, s: p.w.s, len: p.w.s.length,
      r: p.r - res.minR, col: p.c - res.minC, dir: p.dir }));
    words.forEach((w, i) => {
      w.cells = [];
      for (let k = 0; k < w.len; k++) {
        const r = w.r + (w.dir === 'v' ? k : 0), c = w.col + (w.dir === 'h' ? k : 0);
        if (!grid[r][c]) grid[r][c] = { ch: w.s[k], h: -1, v: -1, num: 0 };
        grid[r][c][w.dir] = i;
        w.cells.push([r, c]);
      }
    });
    let n = 0;
    const starts = words.map((w, i) => ({ i, r: w.r, c: w.col })).sort((x, y) => x.r - y.r || x.c - y.c);
    const numAt = {};
    starts.forEach(s => {
      const key = s.r + ',' + s.c;
      if (!numAt[key]) numAt[key] = ++n;
      words[s.i].num = numAt[key];
      grid[s.r][s.c].num = numAt[key];
    });
    return { rows, cols, grid, words };
  }

  function generate(step, lv, rng, usage, attempts, topic) {
    const primary = new Set(lv.tiers);
    const base = new Set(lv.tiers.concat(lv.fb));
    const { pool, conn, rank } = step;
    // 고른 시대 낱말을 먼저, 다른 시대 낱말은 빈자리를 채울 때만
    const own = w => topic === 'all' || w.e === topic;
    let starters = pool.filter(w => w.s.length >= 3 && w.s.length <= Math.min(6, lv.size) && conn.get(w.a) > 0);
    if (starters.some(own)) starters = starters.filter(own);
    starters.sort((x, y) => conn.get(y.a) - conn.get(x.a));
    let best = null, bestScore = -1;
    for (let att = 0; att < attempts; att++) {
      const order = pool
        .map(w => ({ w, k: (usage.get(w.a) || 0) * 1.6 - Math.min(conn.get(w.a), 12) * 0.12
          + (primary.has(w.t) ? 0 : base.has(w.t) ? 1.6 : 4) + (topic === 'all' ? 0 : rank.get(w.e) * 9)
          + (w.s.length > 6 ? 1 : 0) + rng() * 3 }))
        .sort((x, y) => x.k - y.k).map(x => x.w);
      const top = starters.slice(0, 24).sort((x, y) => (usage.get(x.a) || 0) - (usage.get(y.a) || 0) + rng() * 2 - 1);
      const first = top[Math.floor(rng() * Math.min(8, top.length))] || order[0];
      const res = tryBuild(first, order, lv.target, lv.size, rng);
      const area = (res.maxR - res.minR + 1) * (res.maxC - res.minC + 1);
      const ownN = res.placed.filter(p => own(p.w)).length;
      const sc = Math.min(res.placed.length, lv.target) * 1000 + ownN * 60 + res.crossings * 12 - area * 0.5;
      if (sc > bestScore) { bestScore = sc; best = res; }
      if (best.placed.length >= lv.target && att >= 12) break;
    }
    return best;
  }

  const cache = {};
  function getSet(L, topic) {
    const key = L + '|' + topic;
    if (cache[key]) return cache[key];
    const lv = LEVELS[L];
    const steps = getPools(L, topic);
    const usage = new Map();
    const list = [];
    const usedEras = new Set();
    for (let s = 0; s < STAGES; s++) {
      const rng = rngFor(`jams|${lv.id}|${topic}|${s}`);
      let res = null;
      // 가장 좁은 낱말 모음부터 시도하고, 판을 못 채우면 넓힘
      for (const step of steps) {
        if (step.pool.length < lv.target) continue;
        const r = generate(step, lv, rng, usage, 60, topic);
        if (!res || r.placed.length > res.placed.length) res = r;
        if (res.placed.length >= lv.target) break;
      }
      const pz = finalize(res);
      pz.words.forEach(w => { usage.set(w.a, (usage.get(w.a) || 0) + 1); usedEras.add(w.e); });
      list.push(pz);
    }
    const eras = ERAS.map(e => e.id).filter(id => usedEras.has(id));
    return (cache[key] = { eras, list });
  }

  // 판의 낱말·위치가 같은지 확인하는 지문
  const puzzleSig = pz => seedOf(`${pz.rows}x${pz.cols}|` +
    pz.words.map(w => `${w.a}@${w.r},${w.col}${w.dir}`).join(';')).toString(36);

  // 저장한 풀이를 검사해 되살릴 수 있는 값만 돌려줌. 맞지 않으면 null.
  function restoreState(saved, pz, lv) {
    if (!saved || saved.v !== PVER || saved.sig !== puzzleSig(pz)) return null;
    const n = pz.words.length;
    const idx = a => Array.isArray(a) && a.every(i => Number.isInteger(i) && i >= 0 && i < n) ? new Set(a) : null;
    const solved = idx(saved.solved);
    if (!solved || solved.size >= n) return null;
    if (!Array.isArray(saved.given)) return null;
    const given = new Set();
    for (const k of saved.given) {
      const m = typeof k === 'string' && k.match(/^(\d+),(\d+)$/);
      if (!m || !pz.grid[+m[1]] || !pz.grid[+m[1]][+m[2]]) return null;
      given.add(k);
    }
    const used = {}, items = {};
    let penalty = 0;
    for (const it of ITEMS) {
      const u = saved.used && saved.used[it.id];
      if (!Number.isInteger(u) || u < 0 || u > lv.items[it.id]) return null;
      used[it.id] = u; items[it.id] = lv.items[it.id] - u; penalty += u * it.cost;
    }
    const usedOn = {};
    for (const id of ['cho', 'choice', 'search']) {
      const s = idx(saved.usedOn && saved.usedOn[id]);
      if (!s || s.size > used[id]) return null;
      usedOn[id] = s;
    }
    const misses = saved.misses, sec = saved.sec;
    if (!Number.isInteger(misses) || misses < 0 || misses > 100000) return null;
    if (!Number.isInteger(sec) || sec < 0 || sec > 360000) return null;
    penalty += misses * MISS_COST;
    const sel = Number.isInteger(saved.sel) && saved.sel >= 0 && saved.sel < n ? saved.sel : null;
    const draft = typeof saved.draft === 'string' ? saved.draft.slice(0, 40) : '';
    return { solved, given, used, items, usedOn, misses, sec, penalty, sel, draft };
  }

  // ---------- 화면 공통 ----------
  let toastT;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1600);
  }
  function openModal(html) { $('#mbox').innerHTML = html; $('#modal').classList.add('show'); }
  function closeModal() { $('#modal').classList.remove('show'); }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
  const fmtTime = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);

  $('#copyLink').addEventListener('click', () => {
    const url = location.href;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
      .then(() => toast('주소를 복사했어요. 친구에게 보내 보세요!'))
      .catch(() => prompt('이 주소를 복사하세요', url));
  });
  $('#howBtn').addEventListener('click', showHowTo);
  function showHowTo() {
    openModal(`<h2>낱말풀이 하는 법</h2>
      <p>① 판의 칸이나 오른쪽 열쇠 목록을 눌러 낱말을 골라요. 같은 칸을 한 번 더 누르면 가로↔세로가 바뀌어요.</p>
      <p>② 열쇠를 읽고 정답을 입력 칸에 써서 <b>Enter</b>(확인)를 눌러요. 띄어쓰기는 하지 않아요.</p>
      <p>③ 맞히면 칸이 초록색으로 채워지고, 겹치는 글자는 다른 낱말의 힌트가 돼요.</p>
      <p>④ 막히면 찬스 아이템을 써요. 아이템과 오답만큼 점수가 줄어요. 점수에 따라 별을 최대 3개 받아요.</p>
      <div class="mbtns"><button class="btn" data-close>알겠어요!</button></div>`);
  }

  // ---------- 홈 ----------
  const UI = { topic: 'all', L: 0 }; // boot() 에서 지금 학생 칸의 값으로 채움

  function levelStars(L, topic) {
    let s = 0;
    for (let i = 0; i < STAGES; i++) { const r = DB.rec[recKey(L, topic, i)]; if (r) s += r.stars; }
    return s;
  }

  function renderHome() {
    const tp = [{ id: 'all', name: '전체 시대', sub: '구석기~근현대' }].concat(ERAS);
    $('#topics').innerHTML = tp.map(t =>
      `<button class="chip ${t.id === UI.topic ? 'on' : ''}" data-topic="${t.id}">${esc(t.name)}<small>${esc(t.sub)}</small></button>`).join('');

    $('#levels').innerHTML = LEVELS.map((lv, i) => {
      const st = levelStars(i, UI.topic);
      return `<button class="lv ${i === UI.L ? 'on' : ''}" data-level="${i}">
        <div class="band" style="background:${lv.band}"><span class="tag">${String(i + 1).padStart(2, '0')} · ${lv.en}</span><span class="stars">★ ${st}/${STAGES * 3}</span></div>
        <div class="lv-body"><h3>${lv.name}</h3><p>${lv.desc}</p>
          <div class="lv-meta"><b>낱말 ${lv.target}${lv.id === 'master' ? '개 이상' : '개'} · ${lv.grade}</b>판 크기 최대 ${lv.size}×${lv.size} · 낱말풀이 ${STAGES}개<br>찬스: ${ITEMS.filter(it => lv.items[it.id]).map(it => `${it.name} ${lv.items[it.id]}`).join(' · ')}</div>
          <div class="bar"><i style="width:${Math.round(st / (STAGES * 3) * 100)}%"></i></div>
          <span class="lv-btn" style="background:${lv.btn}">${lv.name} 낱말풀이 고르기 <span>↘</span></span>
        </div></button>`;
    }).join('');

    const lv = LEVELS[UI.L];
    const set = getSet(UI.L, UI.topic);
    const topicName = UI.topic === 'all' ? '전체 시대' : ERA_NAME[UI.topic];
    $('#stageTitle').textContent = `3. ${lv.name} · ${topicName} 낱말풀이 고르기`;
    $('#stageSub').textContent = `낱말 ${lv.target}${lv.id === 'master' ? '개 이상' : '개'}씩 · 모두 ${STAGES}개`;
    const note = $('#poolNote');
    const others = set.eras.filter(e => e !== UI.topic);
    if (UI.topic !== 'all' && others.length) {
      note.textContent = `‘${topicName}’ ${lv.name} 낱말만으로는 판을 다 채우기 어려워서, 일부 판에는 ${others.map(e => ERA_NAME[e]).join('·')} 낱말도 함께 나와요.`;
      note.classList.add('show');
    } else note.classList.remove('show');

    let html = '';
    const saved = progress.all();
    for (let s = 0; s < STAGES; s++) {
      const key = recKey(UI.L, UI.topic, s);
      const r = DB.rec[key], p = saved[key];
      html += `<button class="stg ${r ? 'done' : ''} ${p ? 'prog' : ''}" data-stage="${s}"${p ? ' title="풀던 판 · 이어서 풀기"' : ''}><b>${s + 1}</b><small>${r ? starStr(r.stars) : ''}</small>${p ? '<em>이어서</em>' : ''}</button>`;
    }
    $('#stages').innerHTML = html;
    renderResume(saved);

    $('#howItems').innerHTML = ITEMS.map(it =>
      `<div><span class="ic">${it.ic}</span><h4>${it.name} <small style="color:var(--muted);font-weight:400">−${it.cost}점</small></h4><p>${it.desc}</p></div>`).join('');
  }

  // 풀던 판 목록(최근 3개). 판을 다시 만들지 않고 저장한 요약만 보여 줌.
  function resumeList(saved) {
    return Object.keys(saved).map(key => {
      const p = saved[key], m = key.split('|');
      const L = LEVELS.findIndex(l => l.id === m[0]), stage = +m[2];
      if (m.length !== 3 || L < 0 || !(m[1] === 'all' || ERA_NAME[m[1]]) || !Number.isInteger(stage) || stage < 0 || stage >= STAGES) return null;
      if (!p || !Array.isArray(p.solved) || !Number.isInteger(p.total) || !Number.isInteger(p.sec)) return null;
      return { key, L, topic: m[1], stage, solved: p.solved.length, total: p.total, sec: p.sec, at: +p.at || 0 };
    }).filter(Boolean).sort((a, b) => b.at - a.at).slice(0, 3);
  }

  function renderResume(saved) {
    let sec = $('#resumeSec');
    if (!sec) {
      const st = document.createElement('style');
      st.textContent = '#resumeSec .rs-list{display:grid;gap:8px}#resumeSec .rs{display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:var(--card);border:2px solid #dfcda5;border-radius:14px;padding:12px 14px}#resumeSec .rs div{flex:1;min-width:180px}#resumeSec .rs small{display:block;color:var(--muted);font-size:12px}#resumeSec .rs-del{background:transparent;border:0;color:var(--muted);font-size:12px;text-decoration:underline}.stg.prog{border:2px solid #c9a352}.stg em{display:block;font-style:normal;font-size:11px;font-weight:800;color:#805a2b}';
      document.head.appendChild(st);
      sec = document.createElement('section');
      sec.className = 'sec';
      sec.id = 'resumeSec';
      $('#home .hero').after(sec);
      sec.addEventListener('click', e => {
        const go = e.target.closest('[data-resume]');
        if (go) { location.hash = go.dataset.resume; return; }
        const del = e.target.closest('[data-forget]');
        if (del) { progress.drop(del.dataset.forget); renderHome(); }
      });
    }
    const list = resumeList(saved);
    const who = ACC && ACC.label();
    sec.style.display = list.length ? '' : 'none';
    sec.innerHTML = list.length ? `<div class="sec-h"><h2>▶ ${who ? `${esc(who)} 학생의 ` : ''}이어서 풀기</h2><p>${who
      ? `풀던 낱말풀이가 ‘${esc(who)}’ 계정에 저장돼요. 다른 기기에서 로그인해도 이어 풀 수 있어요.`
      : '풀던 낱말풀이가 이 기기의 브라우저에 저장돼 있어요. (로그인하면 학생 계정에도 저장돼요)'}</p></div>
      <div class="rs-list">${list.map(x => `<div class="rs"><div><b>${esc(LEVELS[x.L].name)} · ${esc(x.topic === 'all' ? '전체 시대' : ERA_NAME[x.topic])} · ${x.stage + 1}번</b>
        <small>맞힌 낱말 ${Math.min(x.solved, x.total)}/${x.total} · ${fmtTime(x.sec)} 동안 풀었어요</small></div>
        <button class="btn" data-resume="#play/${LEVELS[x.L].id}/${x.topic}/${x.stage + 1}">이어서 풀기 →</button>
        <button class="rs-del" data-forget="${esc(x.key)}">저장 지우기</button></div>`).join('')}</div>` : '';
  }

  function saveUI() { DB.topic = UI.topic; DB.L = UI.L; store.save(DB); }

  $('#topics').addEventListener('click', e => {
    const b = e.target.closest('[data-topic]'); if (!b) return;
    UI.topic = b.dataset.topic; saveUI(); renderHome();
  });
  $('#levels').addEventListener('click', e => {
    const b = e.target.closest('[data-level]'); if (!b) return;
    UI.L = +b.dataset.level; saveUI(); renderHome();
    $('#stageSec').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#stages').addEventListener('click', e => {
    const b = e.target.closest('[data-stage]'); if (!b) return;
    location.hash = `#play/${LEVELS[UI.L].id}/${UI.topic}/${+b.dataset.stage + 1}`;
  });
  $('#heroStart').addEventListener('click', () => $('#topics').scrollIntoView({ behavior: 'smooth', block: 'center' }));

  // ---------- 게임 ----------
  let G = null;
  let timer = null;

  // fresh: 저장한 풀이를 버리고 처음부터(다시 풀기)
  function startGame(L, topic, stage, fresh) {
    const set = getSet(L, topic);
    const pz = set.list[stage];
    const lv = LEVELS[L];
    const key = recKey(L, topic, stage);
    closeModal();
    G = {
      L, topic, stage, pz, lv,
      solved: new Set(), given: new Set(),
      items: Object.assign({}, lv.items),
      usedOn: { cho: new Set(), choice: new Set(), search: new Set() },
      used: { cho: 0, letter: 0, choice: 0, search: 0, reveal: 0 },
      penalty: 0, misses: 0, start: Date.now(), sec: 0, done: false,
      sel: 0, choiceOpts: {}
    };
    // 첫 낱말: 1번 가로(없으면 첫 낱말)
    G.sel = orderedIdx()[0];
    let resumed = null, discarded = false;
    if (fresh) progress.drop(key);
    else {
      const saved = progress.get(key);
      resumed = saved && restoreState(saved, pz, lv);
      if (saved && !resumed) { progress.drop(key); discarded = true; }
    }
    if (resumed) {
      Object.assign(G, { solved: resumed.solved, given: resumed.given, items: resumed.items, used: resumed.used,
        usedOn: resumed.usedOn, misses: resumed.misses, penalty: resumed.penalty, sec: resumed.sec,
        start: Date.now() - resumed.sec * 1000 });
      // 보기 찬스는 같은 낱말·판 번호로 항상 같은 보기를 만들므로 다시 계산
      G.usedOn.choice.forEach(i => { G.choiceOpts[i] = makeChoices(pz.words[i]); });
      if (resumed.sel !== null && !G.solved.has(resumed.sel)) G.sel = resumed.sel;
      else if (G.solved.has(G.sel)) { const nx = nextUnsolved(); if (nx >= 0) G.sel = nx; }
    }
    const topicName = topic === 'all' ? '전체 시대' : ERA_NAME[topic];
    $('#pSub').textContent = `${String(L + 1).padStart(2, '0')} · ${lv.en} · ${topicName}`;
    $('#pTitle').textContent = `${lv.name} 낱말풀이 ${stage + 1}번`;
    document.body.classList.add('playing');
    window.scrollTo(0, 0);
    renderItems();
    renderAll();
    $('#ansInput').value = resumed ? resumed.draft : '';
    clearInterval(timer);
    let tick = 0;
    timer = setInterval(() => {
      if (!G || G.done) return;
      G.sec = Math.floor((Date.now() - G.start) / 1000);
      $('#stTime').textContent = fmtTime(G.sec);
      if (++tick % 15 === 0) saveProgress();
    }, 1000);
    $('#stTime').textContent = fmtTime(G.sec);
    if (resumed) msg('저장된 풀이를 이어서 풀어요. 처음부터 하려면 ‘다시 풀기’를 누르세요.', 'ok');
    else if (discarded) msg('낱말풀이가 바뀌어 저장된 풀이를 이어 갈 수 없어요. 처음부터 시작해요.', 'warn');
    focusInput();
  }

  // 풀던 상태를 이 기기에 저장(답 입력·확인·찬스·낱말 고르기마다)
  function saveProgress() {
    if (!G || G.done) return;
    const key = recKey(G.L, G.topic, G.stage);
    const draft = $('#ansInput').value.slice(0, 40);
    const used = Object.values(G.used).some(n => n > 0);
    if (!G.solved.size && !G.given.size && !G.misses && !used && !draft && !progress.get(key)) return;
    G.sec = Math.floor((Date.now() - G.start) / 1000);
    progress.put(key, {
      v: PVER, sig: puzzleSig(G.pz), total: G.pz.words.length,
      solved: [...G.solved], given: [...G.given], used: Object.assign({}, G.used),
      usedOn: { cho: [...G.usedOn.cho], choice: [...G.usedOn.choice], search: [...G.usedOn.search] },
      misses: G.misses, sec: G.sec, sel: G.sel, draft, at: Date.now()
    });
  }

  const isKnown = (r, c) => {
    const cell = G.pz.grid[r][c];
    return G.given.has(r + ',' + c) || (cell.h >= 0 && G.solved.has(cell.h)) || (cell.v >= 0 && G.solved.has(cell.v));
  };
  const curWord = () => G.pz.words[G.sel];
  function orderedIdx() {
    const ws = G.pz.words.map((w, i) => ({ w, i }));
    const h = ws.filter(x => x.w.dir === 'h').sort((a, b) => a.w.num - b.w.num);
    const v = ws.filter(x => x.w.dir === 'v').sort((a, b) => a.w.num - b.w.num);
    return h.concat(v).map(x => x.i);
  }
  function score() { return Math.max(0, G.solved.size * 100 - G.penalty); }

  function fitCells() {
    const box = $('#boardbox');
    const pad = window.innerWidth <= 640 ? 20 : 32;
    const avail = box.clientWidth - pad;
    const cols = G.pz.cols;
    const gap = cols > 11 && avail < 420 ? 2 : 3;
    const size = Math.max(18, Math.min(46, Math.floor((avail - (cols - 1) * gap) / cols)));
    document.documentElement.style.setProperty('--cell', size + 'px');
    document.documentElement.style.setProperty('--gap', gap + 'px');
  }

  function renderBoard(pop) {
    const { grid, rows, cols, words } = G.pz;
    const w = curWord();
    const inSel = new Set(w.cells.map(([r, c]) => r + ',' + c));
    const active = w.cells.find(([r, c]) => !isKnown(r, c)) || w.cells[0];
    const board = $('#board');
    board.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
    let html = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (!cell) { html += '<div class="v"></div>'; continue; }
      const key = r + ',' + c;
      const known = isKnown(r, c);
      const solvedCell = (cell.h >= 0 && G.solved.has(cell.h)) || (cell.v >= 0 && G.solved.has(cell.v));
      const cls = ['c'];
      if (inSel.has(key)) cls.push('w');
      if (active[0] === r && active[1] === c && !G.solved.has(G.sel)) cls.push('s');
      if (solvedCell) cls.push('ok');
      else if (known) cls.push('gv');
      if (pop && pop.has(key)) cls.push('pop');
      html += `<button class="${cls.join(' ')}" data-r="${r}" data-c="${c}" aria-label="${r + 1}행 ${c + 1}열">${cell.num ? `<span class="n">${cell.num}</span>` : ''}${known ? esc(cell.ch) : ''}</button>`;
    }
    board.innerHTML = html;
    void words;
  }

  function renderCurrent() {
    const w = curWord();
    $('#curDir').textContent = `${w.dir === 'h' ? '가로' : '세로'} ${w.num}`;
    $('#curEra').textContent = ERA_NAME[w.e];
    $('#curLen').textContent = `${w.len}글자`;
    $('#curClue').textContent = w.c;
    $('#curPattern').innerHTML = w.cells.map(([r, c]) => isKnown(r, c) ? `<i class="k">${esc(G.pz.grid[r][c].ch)}</i>` : '<i></i>').join('');
    const hint = $('#curHint');
    if (G.usedOn.cho.has(G.sel)) { hint.innerHTML = `초성 힌트: <b>${chosung(w.a)}</b>`; hint.classList.add('show'); }
    else hint.classList.remove('show');
    const solved = G.solved.has(G.sel);
    $('#ansForm').style.display = solved ? 'none' : 'flex';
    $('#solvedLine').classList.toggle('show', solved);
    const ch = $('#choices');
    if (!solved && G.choiceOpts[G.sel]) {
      ch.innerHTML = G.choiceOpts[G.sel].map(o => `<button type="button" data-pick="${esc(o)}">${esc(o)}</button>`).join('');
      ch.classList.add('show');
    } else { ch.classList.remove('show'); ch.innerHTML = ''; }
    $('#ansInput').placeholder = `${w.len}글자로 쓰고 Enter`;
  }

  function renderLists() {
    const mk = dir => orderedIdx().filter(i => G.pz.words[i].dir === dir).map(i => {
      const w = G.pz.words[i];
      return `<li data-w="${i}" class="${i === G.sel ? 'on' : ''} ${G.solved.has(i) ? 'ok' : ''}"><b>${w.num}</b>${esc(w.c)}</li>`;
    }).join('');
    $('#listH').innerHTML = mk('h');
    $('#listV').innerHTML = mk('v');
  }

  function renderStats() {
    $('#stSolved').textContent = `${G.solved.size}/${G.pz.words.length}`;
    $('#stScore').textContent = score();
  }

  function renderItems() {
    $('#items').innerHTML = ITEMS.map(it => {
      const n = G.items[it.id];
      return `<button class="item" data-item="${it.id}" title="${esc(it.desc)} (−${it.cost}점)" ${n <= 0 ? 'disabled' : ''}>
        <span class="cnt">${n}</span><span class="ic">${it.ic}</span>${it.name}</button>`;
    }).join('');
  }

  function renderAll(pop) {
    fitCells();
    renderBoard(pop);
    renderCurrent();
    renderLists();
    renderStats();
  }

  function msg(t, kind) {
    const m = $('#msg'); m.textContent = t; m.className = 'msg ' + (kind || '');
  }

  function select(i, keepMsg) {
    G.sel = i;
    if (!keepMsg) msg('');
    $('#ansInput').value = '';
    renderAll();
    saveProgress();
    const li = document.querySelector(`[data-w="${i}"]`);
    if (li && window.innerWidth > 960) li.scrollIntoView({ block: 'nearest' });
  }

  function focusInput() {
    if (window.matchMedia('(pointer:fine)').matches) setTimeout(() => $('#ansInput').focus(), 30);
  }

  function nextUnsolved() {
    const ord = orderedIdx();
    const start = ord.indexOf(G.sel);
    for (let k = 1; k <= ord.length; k++) {
      const i = ord[(start + k) % ord.length];
      if (!G.solved.has(i)) return i;
    }
    return -1;
  }

  function solveWord(i) {
    G.solved.add(i);
    return new Set(G.pz.words[i].cells.map(([r, c]) => r + ',' + c));
  }

  // 모든 글자가 드러난 낱말은 자동으로 완성
  function autoSolve(pop) {
    let changed = true;
    while (changed) {
      changed = false;
      G.pz.words.forEach((w, i) => {
        if (!G.solved.has(i) && w.cells.every(([r, c]) => isKnown(r, c))) {
          solveWord(i).forEach(k => pop.add(k)); changed = true;
        }
      });
    }
  }

  function afterSolve(pop, text) {
    autoSolve(pop);
    if (G.solved.size === G.pz.words.length) {
      renderAll(pop);
      finish();
      return;
    }
    const nx = G.solved.has(G.sel) ? nextUnsolved() : G.sel;
    if (nx >= 0) G.sel = nx;
    $('#ansInput').value = '';
    renderAll(pop);
    msg(text, 'ok');
    focusInput();
  }

  function submit(val) {
    if (!G || G.done) return;
    const w = curWord();
    if (G.solved.has(G.sel)) return;
    val = (val || '').replace(/\s+/g, '');
    if (!val) { msg('정답을 써 주세요.', 'warn'); return; }
    if (Array.from(val).length !== w.len) { msg(`${w.len}글자로 써 주세요. (지금 ${Array.from(val).length}글자)`, 'warn'); return; }
    if (val === w.a) {
      const pop = solveWord(G.sel);
      toast('정답! +100');
      afterSolve(pop, `정답이에요! ‘${w.a}’`);
      saveProgress();
    } else {
      G.misses++; G.penalty += MISS_COST;
      renderStats();
      saveProgress();
      msg(`아쉬워요! 다시 생각해 볼까요? (−${MISS_COST}점)`, 'bad');
      const p = $('#curPanel'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
    }
  }

  // 초성
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function chosung(s) {
    return Array.from(s).map(ch => {
      const code = ch.charCodeAt(0) - 0xAC00;
      return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : ch;
    }).join('');
  }

  function useItem(id) {
    if (!G || G.done) return;
    const w = curWord();
    const it = ITEMS.find(x => x.id === id);
    if (G.solved.has(G.sel)) { msg('이미 맞힌 낱말이에요. 다른 열쇠를 골라 주세요.', 'warn'); return; }
    // 같은 낱말에 이미 쓴 찬스는 다시 써도 차감하지 않음
    if (G.usedOn[id] && G.usedOn[id].has(G.sel)) {
      if (id === 'search') openSearch(w);
      else msg('이 낱말에는 이미 쓴 찬스예요.', 'warn');
      return;
    }
    if (G.items[id] <= 0) { msg(`${it.name}를 모두 썼어요.`, 'warn'); return; }

    if (id === 'letter') {
      const target = w.cells.find(([r, c]) => !isKnown(r, c));
      if (!target) return;
      G.given.add(target[0] + ',' + target[1]);
      spend(id);
      const pop = new Set([target[0] + ',' + target[1]]);
      afterSolve(pop, '글자 하나를 열었어요.');
      if (!G.done && !G.solved.has(G.sel)) msg('글자 하나를 열었어요.', 'ok');
      saveProgress();
      return;
    }
    if (id === 'reveal') {
      openModal(`<h2>정답 공개</h2><p>‘${esc(w.dir === 'h' ? '가로' : '세로')} ${w.num}’ 낱말의 정답을 보여 줄까요? 이 낱말은 점수를 받지 못해요.</p>
        <div class="mbtns"><button class="btn gold" id="doReveal">네, 보여 주세요</button><button class="btn ghost" data-close>조금 더 생각할래요</button></div>`);
      $('#doReveal').onclick = () => {
        closeModal();
        spend(id);
        const pop = solveWord(G.sel);
        afterSolve(pop, `정답은 ‘${w.a}’였어요.`);
        saveProgress();
      };
      return;
    }
    G.usedOn[id].add(G.sel);
    spend(id);
    if (id === 'cho') { renderCurrent(); msg('초성 힌트를 열었어요.', 'ok'); }
    if (id === 'choice') { G.choiceOpts[G.sel] = makeChoices(w); renderCurrent(); msg('보기에서 정답을 골라 보세요.', 'ok'); }
    if (id === 'search') openSearch(w);
    saveProgress();
  }

  function spend(id) {
    const it = ITEMS.find(x => x.id === id);
    G.items[id]--; G.used[id]++; G.penalty += it.cost;
    renderItems(); renderStats();
  }

  function makeChoices(w) {
    const rng = rngFor(`choice|${w.a}|${G.stage}`);
    const same = WORDS.filter(x => x.a !== w.a && x.s.length === w.len);
    let pool = shuffle(same.filter(x => x.e === w.e), rng).concat(shuffle(same.filter(x => x.e !== w.e), rng));
    const opts = [w.a];
    for (const x of pool) { if (opts.length >= 4) break; if (!opts.includes(x.a)) opts.push(x.a); }
    return shuffle(opts, rng);
  }

  function openSearch(w) {
    const q = encodeURIComponent(w.c.replace(/[()'‘’]/g, ' '));
    openModal(`<h2>검색 찬스</h2><p>열쇠 문장으로 검색해 보세요. 찾은 뒤 이 창으로 돌아와 정답을 써요.</p>
      <p style="background:#f3ecdb;border-radius:10px;padding:10px 12px;font-weight:600">${esc(w.c)}</p>
      <div class="mbtns">
        <a class="btn" target="_blank" rel="noopener" href="https://search.naver.com/search.naver?query=${q}">네이버에서 찾기 ↗</a>
        <a class="btn gold" target="_blank" rel="noopener" href="https://search.daum.net/search?q=${q}">다음에서 찾기 ↗</a>
        <a class="btn ghost" target="_blank" rel="noopener" href="https://www.google.com/search?q=${q}">구글 ↗</a>
      </div>
      <div class="mbtns"><button class="btn ghost" data-close>닫기</button></div>`);
  }

  function finish() {
    G.done = true;
    progress.drop(recKey(G.L, G.topic, G.stage));
    clearInterval(timer);
    G.sec = Math.floor((Date.now() - G.start) / 1000);
    $('#stTime').textContent = fmtTime(G.sec);
    const max = G.pz.words.length * 100;
    const sc = score();
    const ratio = sc / max;
    const stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : 1;
    const key = recKey(G.L, G.topic, G.stage);
    const prev = DB.rec[key];
    if (!prev || stars > prev.stars || (stars === prev.stars && sc > prev.score)) {
      DB.rec[key] = { stars, score: sc, time: G.sec, at: Date.now() };
      store.save(DB);
      notify('rec', key);
    }
    const usedItems = Object.values(G.used).reduce((a, b) => a + b, 0);
    const words = orderedIdx().map(i => G.pz.words[i]);
    const hasNext = G.stage < STAGES - 1;
    const praise = stars === 3 ? '완벽해요! 역사 박사가 다 됐어요.' : stars === 2 ? '아주 잘했어요! 조금만 더 하면 별 3개!' : '끝까지 풀어 냈어요! 다시 풀면 별이 늘어요.';
    const cele = celebration(stars, !prev || stars > prev.stars || (stars === prev.stars && sc > prev.score));
    openModal(`${cele.html}<h2 id="mTitle">낱말풀이 완성!</h2>
      <div class="big-stars">${'★'.repeat(stars)}<span class="off">${'★'.repeat(3 - stars)}</span></div>
      <p style="text-align:center">${praise}</p>
      <div class="rgrid"><div><b>${sc}</b>점수 / ${max}</div><div><b>${fmtTime(G.sec)}</b>걸린 시간</div><div><b>${G.misses}</b>틀린 횟수</div><div><b>${usedItems}</b>쓴 아이템</div></div>
      <div class="review"><b style="font-size:13px">오늘 익힌 낱말</b>${words.map(w => `<div><b>${esc(w.a)}</b> — ${esc(w.c)}</div>`).join('')}</div>
      <div class="mbtns">
        ${hasNext ? '<button class="btn" id="goNext">다음 낱말풀이 →</button>' : ''}
        <button class="btn gold" id="goAgain">다시 풀기</button>
        <button class="btn ghost" id="goHome">단계 고르기</button>
      </div>`);
    if (hasNext) $('#goNext').onclick = () => { closeModal(); location.hash = `#play/${G.lv.id}/${G.topic}/${G.stage + 2}`; };
    $('#goAgain').onclick = () => { closeModal(); startGame(G.L, G.topic, G.stage, true); };
    $('#goHome').onclick = () => { closeModal(); location.hash = ''; };
    cele.wire();
  }

  // ---------- 판 완성 축하 ----------
  // 판마다 다른 배지·문구, 별 수에 따른 배지 빛깔. 색종이는 끌 수 있고, 소리는 학생이 켰을 때만(처음엔 꺼짐).
  // 움직임 줄이기 설정이면 움직임 없이 조용한 문구만. 다음 판·다음 단계로 저절로 넘어가지 않아요.
  const FX_KEY = 'jams-crossword-fx-v1';
  const fxPrefs = {
    load() { try { const o = JSON.parse(local.getItem(FX_KEY)) || {}; return { confetti: o.confetti !== false, sound: o.sound === true }; } catch (e) { return { confetti: true, sound: false }; } },
    save(o) { try { local.setItem(FX_KEY, JSON.stringify(o)); } catch (e) { /* 저장 불가 환경 */ } }
  };
  const STAGE_BADGE = [
    ['🪨', '주먹도끼'], ['🏺', '빗살무늬 토기'], ['🔔', '청동 방울'], ['🗿', '고인돌'], ['🏹', '명궁'],
    ['👑', '금관'], ['🏯', '산성 지킴이'], ['📜', '두루마리'], ['🪷', '연꽃 무늬'], ['🛕', '석탑'],
    ['🖌️', '명필'], ['📖', '직지'], ['🧭', '길잡이'], ['⛵', '바닷길'], ['🐢', '거북선'],
    ['☔', '측우기'], ['🗺️', '대동여지도'], ['🕊️', '만세 운동'], ['🏛️', '독립문'], ['🏆', '역사 박사']
  ];
  const TIER = { 3: '금빛', 2: '은빛', 1: '구릿빛' };
  const CONFETTI = ['#ddb66c', '#f2d48c', '#2f7a55', '#224f42', '#9cc9ad', '#c9a352'];
  let lastCelebration = null, audioCtx = null;
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function chime() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      audioCtx = audioCtx || new AC();
      const t = audioCtx.currentTime;
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = f; o.type = 'triangle';
        g.gain.setValueAtTime(0.0001, t + i * 0.12); g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.35);
        o.connect(g); g.connect(audioCtx.destination); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.4);
      });
      return true;
    } catch (e) { return false; }
  }

  function celebration(stars, improved) {
    const prefs = fxPrefs.load(), quiet = reducedMotion();
    const [ic, name] = STAGE_BADGE[G.stage] || STAGE_BADGE[0];
    const topicName = G.topic === 'all' ? '전체 시대' : ERA_NAME[G.topic];
    const nextLv = LEVELS[G.L + 1] || null;
    const levelEnd = G.stage === STAGES - 1;
    let doneN = 0;
    for (let i = 0; i < STAGES; i++) if (DB.rec[recKey(G.L, G.topic, i)]) doneN++;
    const pieces = !quiet && prefs.confetti ? 24 : 0;
    const confetti = pieces ? `<div class="cw-confetti" aria-hidden="true">${Array.from({ length: pieces }, (_, i) =>
      `<i style="left:${(i * 37) % 100}%;background:${CONFETTI[(i + G.stage) % CONFETTI.length]};animation-delay:${(i % 8) * 0.07}s"></i>`).join('')}</div>` : '';
    const level = levelEnd ? `<div class="cw-level">
        <b>${esc(G.lv.name)} 단계 20번째 낱말풀이까지 마쳤어요!</b>
        <p>${esc(topicName)}에서 완성한 낱말풀이 ${doneN}/${STAGES}개 · 별 ${levelStars(G.L, G.topic)}/${STAGES * 3}${doneN === STAGES ? ' · 모두 완성!' : ''}</p>
        ${nextLv ? `<button class="btn gold" id="goNextLevel">다음 단계 ‘${esc(nextLv.name)}’ 1번 풀기 →</button>` : '<p>마지막 단계 마스터까지 왔어요. 진짜 역사 박사!</p>'}
      </div>` : '';
    const html = `<div class="cw-cele ${quiet ? 'cw-quiet' : ''} cw-tier${stars}" style="--cw-hue:${(G.stage * 18) % 360}" role="status">
        ${confetti}
        <span class="cw-emblem" aria-hidden="true">${ic}</span>
        <div><small>${esc(G.lv.name)} · ${esc(topicName)} · ${G.stage + 1}번 완성</small>
          <b>${TIER[stars]} ‘${esc(name)}’ 배지${improved ? '' : ' (이전 기록 유지)'}</b>
          <span class="cw-stars" aria-label="별 ${stars}개">${starStr(stars)}</span></div>
      </div>${level}
      <div class="cw-fx"><label><input type="checkbox" data-fx="confetti" ${prefs.confetti ? 'checked' : ''}> 축하 색종이</label>
        <label><input type="checkbox" data-fx="sound" ${prefs.sound ? 'checked' : ''}> 축하 소리</label></div>`;
    const sound = prefs.sound ? chime() : false; // 확인·찬스 버튼을 누른 직후에만 불리므로 자동 재생이 아님
    lastCelebration = { L: G.L, topic: G.topic, stage: G.stage, stars, badge: name, quiet, confetti: pieces, sound,
      levelEnd, nextLevel: levelEnd && nextLv ? nextLv.id : null };
    const topic = G.topic;
    return {
      html,
      wire() {
        const nl = $('#goNextLevel');
        if (nl) nl.onclick = () => { closeModal(); location.hash = `#play/${nextLv.id}/${topic}/1`; };
        $('#mbox').querySelectorAll('[data-fx]').forEach(el => el.addEventListener('change', () => {
          const p = fxPrefs.load(); p[el.dataset.fx] = el.checked; fxPrefs.save(p);
          if (el.dataset.fx === 'sound' && el.checked) chime();
        }));
        const first = $('#goNext') || nl || $('#goAgain');
        if (first) first.focus();
      }
    };
  }

  // 판 클릭
  $('#board').addEventListener('click', e => {
    const b = e.target.closest('.c'); if (!b || !G) return;
    const r = +b.dataset.r, c = +b.dataset.c;
    const cell = G.pz.grid[r][c];
    const cur = curWord();
    const inCur = cur.cells.some(([rr, cc]) => rr === r && cc === c);
    let i;
    if (inCur && cell.h >= 0 && cell.v >= 0) i = cur.dir === 'h' ? cell.v : cell.h;
    else if (inCur) i = G.sel;
    else {
      const pref = cur.dir === 'h' ? [cell.h, cell.v] : [cell.v, cell.h];
      const cand = pref.filter(x => x >= 0);
      i = cand.find(x => !G.solved.has(x));
      if (i == null) i = cand[0];
    }
    select(i);
    if (window.innerWidth <= 960) $('#curPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    focusInput();
  });
  $('#listH').addEventListener('click', listClick);
  $('#listV').addEventListener('click', listClick);
  function listClick(e) {
    const li = e.target.closest('[data-w]'); if (!li) return;
    select(+li.dataset.w);
    if (window.innerWidth <= 960) $('#curPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusInput();
  }
  $('#ansForm').addEventListener('submit', e => { e.preventDefault(); submit($('#ansInput').value); });
  $('#choices').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) submit(b.dataset.pick); });
  $('#items').addEventListener('click', e => { const b = e.target.closest('[data-item]'); if (b) useItem(b.dataset.item); });
  $('#backBtn').addEventListener('click', () => { location.hash = ''; });
  $('#restartBtn').addEventListener('click', () => {
    openModal(`<h2>처음부터 다시 풀까요?</h2><p>지금까지 푼 내용과 쓴 아이템이 처음으로 돌아가요.</p>
      <div class="mbtns"><button class="btn" id="doRestart">다시 풀기</button><button class="btn ghost" data-close>취소</button></div>`);
    $('#doRestart').onclick = () => { closeModal(); startGame(G.L, G.topic, G.stage, true); };
  });
  $('#ansInput').addEventListener('input', () => saveProgress());
  window.addEventListener('pagehide', () => saveProgress());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveProgress(); });
  window.addEventListener('resize', () => { if (G && document.body.classList.contains('playing')) { fitCells(); } });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (!G || !document.body.classList.contains('playing') || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { const ord = orderedIdx(); select(ord[(ord.indexOf(G.sel) + 1) % ord.length]); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { const ord = orderedIdx(); select(ord[(ord.indexOf(G.sel) - 1 + ord.length) % ord.length]); }
  });

  // ---------- 인쇄 ----------
  function printSheet(withAns) {
    if (!G) return;
    const { grid, rows, cols } = G.pz;
    let cells = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      cells += cell ? `<div>${cell.num ? `<sup>${cell.num}</sup>` : ''}${withAns ? esc(cell.ch) : ''}</div>` : '<div class="v"></div>';
    }
    const list = dir => orderedIdx().filter(i => G.pz.words[i].dir === dir)
      .map(i => { const w = G.pz.words[i]; return `<p><b>${w.num}.</b> ${esc(w.c)} (${w.len}글자)${withAns ? ` → <b>${esc(w.a)}</b>` : ''}</p>`; }).join('');
    const topicName = G.topic === 'all' ? '전체 시대' : ERA_NAME[G.topic];
    $('#print').innerHTML = `<h1>잼스 역사 낱말풀이 · ${G.lv.name} ${G.stage + 1}번 ${withAns ? '(정답지)' : ''}</h1>
      <div class="meta">${topicName} · 낱말 ${G.pz.words.length}개 · 이름: ______________ · 잼스.com</div>
      <div class="pb" style="grid-template-columns:repeat(${cols},30pt)">${cells}</div>
      <div class="pl"><h3>가로 열쇠</h3>${list('h')}<h3>세로 열쇠</h3>${list('v')}</div>`;
    window.print();
  }
  $('#printBlank').addEventListener('click', () => printSheet(false));
  $('#printKey').addEventListener('click', () => printSheet(true));

  // ---------- 주소(해시)로 화면 전환 ----------
  let booted = false;
  function route() {
    if (!booted) return; // 학생 계정 확인 전에는 판을 그리지 않음
    saveProgress(); // 다른 판·홈으로 가기 전 풀던 판 저장
    const m =location.hash.match(/^#play\/(\w+)\/(\w+)\/(\d+)$/);
    if (m) {
      const L = LEVELS.findIndex(l => l.id === m[1]);
      const topic = m[2] === 'all' || ERA_NAME[m[2]] ? m[2] : null;
      const stage = +m[3] - 1;
      if (L >= 0 && topic && stage >= 0 && stage < STAGES) {
        UI.L = L; UI.topic = topic; saveUI();
        $('#board').innerHTML = '';
        startGame(L, topic, stage);
        return;
      }
    }
    G = null;
    clearInterval(timer);
    closeModal();
    document.body.classList.remove('playing');
    renderHome();
  }
  window.addEventListener('hashchange', route);

  // 지금 학생 칸(없으면 이 기기 공용 칸)의 기록을 읽고 첫 화면을 그림
  function boot() {
    applyScope();
    DB = store.load();
    DB.rec = DB.rec || {};
    UI.topic = DB.topic || 'all';
    UI.L = DB.L != null ? DB.L : 0;
    if (UI.topic !== 'all' && !ERA_NAME[UI.topic]) UI.topic = 'all';
    if (!LEVELS[UI.L]) UI.L = 0;
    booted = true;
    document.body.classList.remove('cw-wait');
    route();
  }
  // account.js 가 부르는 연결 고리. 로그인 실패·연결 오류가 판 풀이 흐름을 멈추지 않게, 계정 쪽은 저장 칸만 알려 줘요.
  const host = {
    // 풀던 판을 지금 칸(이 기기)에 저장 — 서버 저장은 하지 않음
    flushLocal() { if (booted) saveProgress(); },
    // 학생을 바꾸기 전: 저장 후 화면을 비워 앞 학생 기록이 남지 않게
    hold() {
      if (!booted) return;
      saveProgress();
      clearInterval(timer);
      G = null;
      closeModal();
      document.body.classList.remove('playing');
      document.body.classList.add('cw-wait');
      booted = false;
      if (/^#play\//.test(location.hash)) location.hash = ''; // 새 학생은 단계 고르기 화면에서 시작
    },
    switched() { boot(); },
    // 서버와 합친 기록을 다시 읽음. 고른 판이 지금 푸는 판이면 그 풀이로 다시 엶
    refresh(info) {
      if (!booted) return;
      DB.rec = store.load().rec || {};
      const cur = G && !G.done ? recKey(G.L, G.topic, G.stage) : null;
      if (cur && info && info.reload && (info.keys || []).includes(cur)) { startGame(G.L, G.topic, G.stage); return; }
      if (!document.body.classList.contains('playing')) renderHome();
    }
  };
  if (ACC && ACC.ready && typeof ACC.ready.then === 'function') {
    ACC.attach(host);
    const go = () => { boot(); ACC.booted(); };
    ACC.ready.then(go, go);
  } else boot();

  // 테스트·확인용
  window.JAMS_CROSSWORD = { WORDS, LEVELS, ERAS, getSet, getPools, puzzleSig, restoreState,
    get PROGRESS_KEY() { return PKEY; }, get RECORD_KEY() { return SKEY; },
    celebration: () => lastCelebration && Object.assign({}, lastCelebration),
    current: () => G && { L: G.L, topic: G.topic, stage: G.stage, sel: G.sel, solved: [...G.solved], given: [...G.given],
      used: Object.assign({}, G.used), items: Object.assign({}, G.items), misses: G.misses, penalty: G.penalty, sec: G.sec, done: G.done } };
})();
