/* 잼스 역사 낱말풀이 — 학생 계정·서버 이어 풀기 */
// 잼스 역사 탐험과 같은 학생 계정(/api/auth/*, HttpOnly 쿠키)을 쓴다. 비밀번호는 로그인 요청에만 보내고 어디에도 저장하지 않는다.
// 저장 흐름: 판 변경 → 이 계정 칸(localStorage, player.ref 별)에 먼저 저장 → 모아서(debounce) 서버에 한 번에 보냄.
// 보낼 내용은 requestId 와 함께 먼저 보관하고, 응답을 잃으면 같은 번호·같은 내용으로만 다시 보낸다.
'use strict';
(function () {
  const CANON = 'https://xn--9t4b56g.com/crossword/index.html';
  const BASE = { rec: 'jams-crossword-v1', progress: 'jams-crossword-progress-v1' };
  const META = 'jams-crossword-sync-v1';
  const PMAX = 12, TMAX = 240, RMAX = 1200;
  const DEBOUNCE = 2500, MIN_GAP = 8000, KEEPALIVE_MAX = 60000, BODY_MAX = 131072;
  const KEY = /^(intro|basic|mid|adv|high|master)\|(all|gu|sin|cheong|gojo|samguk|goryeo|joseon|ilje|modern)\|(\d|1\d)$/;
  const REF = /^[0-9a-f]{12}$/;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  // 브라우저 저장소를 막았거나 용량이 찼어도 최신 풀이를 메모리에 함께 둔다.
  // 엔진과 동기화 모듈이 같은 저장소를 읽어 오래된 디스크 값을 서버에 보내지 않는다.
  const disk = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const memory = new Map();
  let memoryOnly = !disk;
  const LS = {
    getItem(k) {
      if (memory.has(k)) return memory.get(k);
      try { return disk ? disk.getItem(k) : null; } catch (e) { memoryOnly = true; return null; }
    },
    setItem(k, value) {
      const v = String(value); memory.set(k, v);
      try { if (!disk) throw new Error('storage unavailable'); disk.setItem(k, v); }
      catch (e) { memoryOnly = true; }
    },
    removeItem(k) {
      memory.set(k, null);
      try { if (disk) disk.removeItem(k); } catch (e) { memoryOnly = true; }
    },
    keys() {
      const keys = new Set(memory.keys());
      try { if (disk) for (let i = 0; i < disk.length; i++) keys.add(disk.key(i)); } catch (e) { memoryOnly = true; }
      return [...keys].filter(k => k && this.getItem(k) !== null);
    },
    key(i) { return this.keys()[i] || null; },
    get length() { return this.keys().length; }
  };
  const read = k => { try { return JSON.parse(LS.getItem(k)); } catch (e) { return null; } };
  const write = (k, v) => { try { LS.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const scoped = (base, ref) => `${base}:u:${ref}`;
  const byteLen = s => (typeof TextEncoder === 'function' ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length);

  // ---------- 상태 ----------
  // mode: checking | unavailable(계정 API 없는 복사본) | offline(계정 확인 실패) | guest | reset | account
  const S = { mode: 'checking', ref: null, username: '', meta: null, sync: 'idle', note: '', inflight: null,
    timer: null, retryT: null, backoff: 0, lastSent: 0, blocked: null, loginLost: false, confirmLogout: false, app: null, booted: false, profile: null };
  // 내 기록(순위·레벨·누적 경험치)은 서버가 확인한 응답의 profile 만 쓴다. 이 기기에만 있는 기록으로 새 순위를 만들지 않는다.
  const setProfile = p => { if (plain(p) && plain(p.scopes) && plain(p.scopes.combined)) S.profile = p; };

  const newMeta = () => ({ v: 1, rev: 0, baseAt: {}, tomb: {}, dirty: false, pending: null, conflicts: {}, importDone: false, savedAt: 0 });
  function loadMeta(ref) {
    const m = read(scoped(META, ref)), d = newMeta();
    if (!plain(m) || m.v !== 1) return d;
    if (int(m.rev, 0, 1e9)) d.rev = m.rev;
    if (plain(m.baseAt)) for (const k of Object.keys(m.baseAt)) if (KEY.test(k) && int(m.baseAt[k], 0, 9e15)) d.baseAt[k] = m.baseAt[k];
    if (plain(m.tomb)) for (const k of Object.keys(m.tomb)) if (KEY.test(k) && int(m.tomb[k], 0, 9e15)) d.tomb[k] = m.tomb[k];
    if (plain(m.conflicts)) for (const k of Object.keys(m.conflicts)) if (KEY.test(k) && plain(m.conflicts[k])) d.conflicts[k] = m.conflicts[k];
    d.dirty = m.dirty === true;
    if (plain(m.pending) && typeof m.pending.requestId === 'string' && typeof m.pending.body === 'string' && plain(m.pending.baseAt)) d.pending = m.pending;
    d.importDone = m.importDone === true;
    d.savedAt = int(m.savedAt, 0, 9e15) ? m.savedAt : 0;
    return d;
  }
  const saveMeta = (ref, meta) => write(scoped(META, ref), meta);

  // 이 계정 칸의 기록·풀던 판(app.js 와 같은 모양)
  const recDoc = ref => { const d = read(ref ? scoped(BASE.rec, ref) : BASE.rec); return plain(d) ? d : {}; };
  const progItems = ref => { const o = read(ref ? scoped(BASE.progress, ref) : BASE.progress); return o && o.v === 1 && plain(o.items) ? o.items : {}; };
  const writeRec = (ref, rec) => { const d = recDoc(ref); d.rec = rec; return write(scoped(BASE.rec, ref), d); };
  const writeProg = (ref, items) => write(scoped(BASE.progress, ref), { v: 1, items });

  // ---------- 합치기(순수 함수) ----------
  const goodRec = r => plain(r) && int(r.stars, 1, 3) && Number.isFinite(r.score) && r.score >= 0 ? r : null;
  const better = (a, b) => !!a && (!b || a.stars > b.stars || (a.stars === b.stars && a.score > b.score));
  const slotAt = p => (plain(p) && int(p.at, 0, 9e15) ? p.at : 0);
  const atsOf = prog => Object.fromEntries(Object.keys(prog).map(k => [k, slotAt(prog[k])]));
  const ownKeys = o => (plain(o) ? Object.keys(o).filter(k => KEY.test(k)) : []);
  function pruneTomb(t) {
    return Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, TMAX));
  }
  // local: { rec, progress, tomb, baseAt, dirty } · server: { rec, progress, tombstones }
  // - 완성 기록: 별 → 점수 순으로 더 좋은 기록
  // - 지운 판(tombstone): 지운 시각보다 오래된 판은 되살리지 않음
  // - 풀던 판: 이 기기에 보낼 변경이 없으면 서버 판을 따름. 두 쪽이 모두 바뀌었고 내용이 다르면 학생에게 고르게 함(conflicts)
  function mergeDocs(given, server) {
    const obj = v => (plain(v) ? v : {});
    const local = { rec: obj(given.rec), progress: obj(given.progress), tomb: obj(given.tomb), baseAt: obj(given.baseAt), dirty: !!given.dirty };
    const sv = plain(server) ? server : {}, srec = plain(sv.rec) ? sv.rec : {}, sprog = plain(sv.progress) ? sv.progress : {};
    const rec = {}, tomb = {}, progress = {}, conflicts = {};
    for (const k of new Set(ownKeys(local.rec).concat(ownKeys(srec)))) {
      const a = goodRec(local.rec[k]), b = goodRec(srec[k]);
      const w = better(a, b) ? a : b || a;
      if (w) rec[k] = w;
    }
    for (const src of [local.tomb, sv.tombstones]) for (const k of ownKeys(src)) if (int(src[k], 0, 9e15)) tomb[k] = Math.max(tomb[k] || 0, src[k]);
    for (const k of new Set(ownKeys(local.progress).concat(ownKeys(sprog)))) {
      const L = plain(local.progress[k]) ? local.progress[k] : null, R = plain(sprog[k]) ? sprog[k] : null;
      let pick;
      if (!local.dirty) pick = R;
      else {
        const base = local.baseAt[k] || 0, localChanged = slotAt(L) !== base, serverChanged = slotAt(R) !== base;
        if (!serverChanged) pick = L;
        else if (!localChanged) pick = R;
        else if (L && R) {
          pick = L;
          if (JSON.stringify(L) !== JSON.stringify(R)) conflicts[k] = R;
        } else pick = L || R; // 한쪽은 지우고 한쪽은 바꿈 → 아래 지운 시각과 비교
      }
      if (pick && (tomb[k] || 0) >= slotAt(pick)) { pick = null; delete conflicts[k]; }
      if (pick) progress[k] = pick;
    }
    // 판은 최근 12개까지. 밀려난 판은 그 시각으로 지운 판 표시를 남겨 다른 기기에서 되살아나지 않게 함
    Object.keys(progress).sort((a, b) => slotAt(progress[b]) - slotAt(progress[a])).slice(PMAX).forEach(k => {
      tomb[k] = Math.max(tomb[k] || 0, slotAt(progress[k])); delete progress[k]; delete conflicts[k];
    });
    return { rec, progress, tomb: pruneTomb(tomb), conflicts };
  }

  // 서버에 보낼 내용: 서버 검사를 통과할 모양만 골라 담음(이 기기 저장은 그대로 둠)
  const SLOT_KEYS = ['v', 'sig', 'total', 'solved', 'given', 'used', 'usedOn', 'misses', 'sec', 'sel', 'draft', 'at'];
  function payloadOf(ref, meta) {
    const rec = {}, progress = {}, src = recDoc(ref).rec, items = progItems(ref);
    for (const k of ownKeys(src).slice(0, RMAX)) {
      const r = goodRec(src[k]);
      if (r && int(r.score, 0, 100000) && int(r.at, 0, 9e15)) rec[k] = { stars: r.stars, score: r.score, time: Math.min(int(r.time, 0, 9e15) ? r.time : 0, 3600000), at: r.at };
    }
    for (const k of ownKeys(items)) {
      const p = items[k];
      if (plain(p) && p.v === 1 && SLOT_KEYS.every(f => f in p)) progress[k] = Object.fromEntries(SLOT_KEYS.map(f => [f, f === 'sel' && p.sel === undefined ? null : p[f]]));
    }
    return { rec, progress, tombstones: pruneTomb(meta.tomb) };
  }

  // ---------- 서버 요청 ----------
  async function req(method, path, body, keepalive) {
    const ctl = typeof AbortController === 'function' && !keepalive ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 15000) : null;
    try {
      const r = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', keepalive: !!keepalive,
        headers: body ? { 'Content-Type': 'application/json' } : {}, body: body || undefined, signal: ctl ? ctl.signal : undefined });
      const type = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
      if (!/json/i.test(type)) return { status: r.status, json: null, notJson: true };
      try { return { status: r.status, json: await r.json() }; } catch (e) { return { status: r.status, json: null, notJson: true }; }
    } finally { if (t) clearTimeout(t); }
  }
  function rid() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }

  // ---------- 서버 저장(한 번에 하나씩) ----------
  function schedule(delay) {
    clearTimeout(S.timer);
    if (S.mode !== 'account') return;
    const wait = delay != null ? delay : Math.max(DEBOUNCE, MIN_GAP - (Date.now() - S.lastSent));
    S.timer = setTimeout(() => { S.timer = null; flush(); }, wait);
  }
  function retryLater(fn) {
    clearTimeout(S.retryT);
    const wait = Math.min(60000, 2000 * Math.pow(2, S.backoff++));
    S.retryT = setTimeout(() => { S.retryT = null; (fn || flush)(); }, wait);
  }

  async function flush(opts) {
    opts = opts || {};
    if (S.mode !== 'account' || !S.meta || S.inflight || S.loginLost) return;
    if (S.blocked === 'forbidden' && !opts.manual) return;
    const ref = S.ref, meta = S.meta;
    if (Object.keys(meta.conflicts).length) { setSync('conflict'); return; }
    if (!meta.pending) {
      if (!meta.dirty || S.blocked) return;
      const data = payloadOf(ref, meta), requestId = rid();
      meta.pending = { requestId, baseRevision: meta.rev, baseAt: atsOf(data.progress), body: JSON.stringify({ requestId, ref, baseRevision: meta.rev, data }) };
      meta.dirty = false;
      // 보낼 내용을 먼저 보관한 뒤 보낸다(보관 실패면 보내지 않고 이 기기 저장만 둠)
      if (!saveMeta(ref, meta)) { meta.pending = null; meta.dirty = true; setSync('error', '이 기기 저장 공간이 부족해 서버 저장을 준비하지 못했어요.'); return; }
    }
    const p = meta.pending, size = byteLen(p.body);
    if (size > BODY_MAX) { meta.pending = null; meta.dirty = true; saveMeta(ref, meta); S.blocked = 'too_large'; setSync('too_large'); return; }
    // 창을 닫을 때(keepalive)는 작은 요청만. 큰 요청은 보관했다가 다음에(다시 로그인할 때 등) 보냄
    if (opts.keepalive && size > KEEPALIVE_MAX) return;
    setSync('saving');
    S.lastSent = Date.now();
    const run = (async () => {
      let r = null;
      try { r = await req('POST', '/api/crossword', p.body, !!opts.keepalive); } catch (e) { r = null; }
      await handlePost(ref, meta, p, r);
    })();
    S.inflight = run;
    try { await run; } finally { if (S.inflight === run) S.inflight = null; }
    if (S.ref === ref && S.mode === 'account' && meta.dirty && !meta.pending && !S.blocked && !Object.keys(meta.conflicts).length && !S.retryT) schedule();
  }

  async function handlePost(ref, meta, p, r) {
    const here = S.ref === ref; // 응답 전에 다른 학생으로 바뀌었으면 앞 학생 칸만 고치고 화면은 건드리지 않음
    const status = r && r.status, j = (r && r.json) || {};
    if (!r || r.notJson || status >= 500 || status === 429 || (status === 409 && !j.error)) {
      if (here) { setSync('offline'); retryLater(); }
      return; // 보관한 요청은 그대로(같은 번호로 다시 보냄)
    }
    if (status === 200 && j.ok && j.ref === ref) {
      meta.pending = null; meta.rev = j.revision; meta.baseAt = p.baseAt; meta.savedAt = Date.now();
      if (here) { S.backoff = 0; setProfile(j.profile); }
      if (j.data) { // 서버가 합친 더 좋은 완성 기록을 이 기기에도 반영
        const merged = mergeDocs({ rec: recDoc(ref).rec, progress: {}, tomb: {}, baseAt: {}, dirty: true }, { rec: j.data.rec }).rec;
        writeRec(ref, merged);
      }
      saveMeta(ref, meta);
      if (!here) return;
      setSync(meta.dirty ? 'pending' : 'saved');
      if (S.app) S.app.refresh({});
      if (j.replayed && j.latestRevision > j.revision) await pull();
      return;
    }
    if (status === 401) { if (here) { S.loginLost = true; setSync('login'); render(); } return; }
    if (status === 403) { // 비밀번호 변경 필요·권한 없음: 되풀이하지 않고 보관 요청은 이 계정 칸에 둠
      if (!here) return;
      if (j.error === 'password_change_required') { S.mode = 'reset'; render(); if (S.app && S.booted) { S.app.hold(); S.app.switched(); } }
      else { S.blocked = 'forbidden'; setSync('error', j.message); }
      return;
    }
    if (status === 409 && j.error === 'account_changed') { if (here) identify(); return; }
    // 이 요청은 다시 보내도 되지 않음 → 보관 요청을 풀고 이 기기 내용으로 새로 만듦
    meta.pending = null; meta.dirty = true;
    if (status === 409 && j.error === 'revision_conflict' && plain(j.current)) {
      absorb(ref, meta, j.current);
      saveMeta(ref, meta);
      if (here) { if (S.app) S.app.refresh({ keys: Object.keys(meta.conflicts) }); render(); }
      return;
    }
    saveMeta(ref, meta);
    if (!here) return;
    if (status === 413) { S.blocked = 'too_large'; setSync('too_large', j.message); return; }
    if (status === 409 && j.error === 'request_reused') return; // flush() 가 새 번호로 다시 보냄
    S.blocked = 'invalid'; setSync('error', j.message || '서버가 저장을 받지 않았어요.');
  }

  // 서버 저장(revision·data)을 이 계정 칸과 합쳐 쓴다.
  function absorb(ref, meta, server) {
    const data = plain(server.data) ? server.data : {};
    const items = progItems(ref);
    const res = mergeDocs({ rec: recDoc(ref).rec || {}, progress: items, tomb: meta.tomb, baseAt: meta.baseAt, dirty: meta.dirty || !!meta.pending }, data);
    writeRec(ref, res.rec);
    writeProg(ref, res.progress);
    meta.tomb = res.tomb;
    meta.rev = int(server.revision, 0, 1e9) ? server.revision : meta.rev;
    meta.baseAt = atsOf(plain(data.progress) ? data.progress : {});
    for (const k of Object.keys(res.conflicts)) meta.conflicts[k] = res.conflicts[k];
    // 서버보다 이 기기가 앞선 내용(더 좋은 기록·새 판·지운 표시)이 있으면 다시 보냄
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const srec = plain(data.rec) ? data.rec : {}, sprog = plain(data.progress) ? data.progress : {}, stomb = plain(data.tombstones) ? data.tombstones : {};
    meta.dirty = Object.keys(res.rec).some(k => !same(res.rec[k], srec[k])) ||
      Object.keys(res.progress).some(k => !same(res.progress[k], sprog[k])) || Object.keys(sprog).some(k => !(k in res.progress)) ||
      Object.keys(res.tomb).some(k => res.tomb[k] !== stomb[k]);
  }

  async function pull() {
    const ref = S.ref, meta = S.meta;
    let r = null;
    try { r = await req('GET', '/api/crossword'); } catch (e) { r = null; }
    if (S.ref !== ref) return;
    if (!r || r.notJson || r.status >= 500) { setSync(meta.pending || meta.dirty ? 'offline' : 'stale'); retryLater(() => (S.ref === ref ? pull() : null)); return; }
    if (r.status === 401) { S.loginLost = true; setSync('login'); return; }
    if (r.status === 403) { S.mode = 'reset'; S.note = r.json && r.json.message || ''; return; }
    if (r.status !== 200 || !r.json || r.json.ref !== ref) { setSync('error', '서버 저장을 확인하지 못했어요.'); return; }
    absorb(ref, meta, r.json);
    setProfile(r.json.profile);
    saveMeta(ref, meta);
    if (S.app) S.app.refresh({ keys: Object.keys(meta.conflicts) });
    if (Object.keys(meta.conflicts).length) setSync('conflict');
    else if (meta.dirty) { setSync('pending'); schedule(0); }
    else setSync(meta.savedAt ? 'saved' : 'idle');
  }

  // ---------- 계정 확인·전환 ----------
  let identifying = null;
  function identify() { return identifying || (identifying = doIdentify().finally(() => { identifying = null; })); }
  async function doIdentify() {
    if (S.app && S.booted) S.app.hold(); // 앞 학생 화면을 먼저 비움(이 기기 저장만, 서버 저장 아님)
    leave();
    S.mode = 'checking'; render();
    const host = (location.hostname || '').toLowerCase();
    if (/github\.io$/.test(host) || location.protocol === 'file:') { S.mode = 'unavailable'; return done(); }
    let r = null;
    try { r = await req('GET', '/api/state'); } catch (e) { r = null; }
    if (!r) S.mode = 'offline';
    else if (r.notJson || r.status === 404) S.mode = 'unavailable';
    else if (r.status === 401) S.mode = 'guest';
    else if (r.status === 200 && r.json && plain(r.json.account)) {
      const ref = r.json.player && r.json.player.ref;
      if (r.json.account.resetRequired) { S.mode = 'reset'; S.username = String(r.json.account.username || ''); }
      else if (typeof ref === 'string' && REF.test(ref)) await enter(ref, String(r.json.account.username || ''), r.json.profile);
      else S.mode = 'offline';
    } else S.mode = 'offline';
    return done();
  }
  function done() {
    render();
    if (S.app && S.booted) S.app.switched();
    return { scope: S.mode === 'account' ? S.ref : null };
  }
  async function enter(ref, username, profile) {
    S.ref = ref; S.username = username; S.meta = loadMeta(ref); S.mode = 'account'; S.loginLost = false; S.blocked = null; S.backoff = 0;
    S.profile = null; setProfile(profile);
    setSync(S.meta.pending || S.meta.dirty ? 'pending' : 'idle');
    // ① 응답을 잃었을 수 있는 보관 요청을 같은 번호로 먼저 다시 보냄 ② 서버 저장을 받아 이 계정의 남은 변경과 합침
    if (S.meta.pending) await flush();
    if (S.ref === ref && S.mode === 'account' && !S.loginLost) await pull();
  }
  function leave() {
    clearTimeout(S.timer); clearTimeout(S.retryT); S.timer = S.retryT = null;
    S.ref = null; S.meta = null; S.username = ''; S.profile = null; S.sync = 'idle'; S.note = ''; S.blocked = null; S.loginLost = false; S.confirmLogout = false;
  }

  async function login(kind, username, password) {
    const path = kind === 'register' ? '/api/auth/register' : '/api/auth/login';
    let r = null;
    try { r = await req('POST', path, JSON.stringify({ username, password })); } catch (e) { r = null; }
    if (!r || r.notJson) return { ok: false, message: '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.' };
    if (r.status !== 200 && r.status !== 201) return { ok: false, message: (r.json && r.json.message) || '로그인하지 못했어요.' };
    await identify();
    return { ok: true };
  }

  async function logout(force) {
    if (S.app && S.booted) S.app.flushLocal(); // 화면의 풀던 판은 이 계정 칸(이 기기)에만 저장
    clearTimeout(S.timer); S.timer = null;     // 로그아웃은 서버 저장을 일으키지 않음
    const unsynced = S.meta && (S.meta.pending || S.meta.dirty || Object.keys(S.meta.conflicts).length);
    if (unsynced && !force) { S.confirmLogout = true; render(); return { ok: false, unsynced: true }; }
    let result = null;
    try { result = await req('POST', '/api/logout', '{}'); } catch (e) { /* 서버 확인 없이는 계정 전환을 완료하지 않음 */ }
    if (!result || result.status !== 200 || !result.json || result.json.ok !== true) {
      S.confirmLogout = false;
      S.note = '로그아웃을 확인하지 못했어요. 연결을 확인한 뒤 다시 눌러 주세요.';
      render();
      if (S.meta && (S.meta.pending || S.meta.dirty)) retryLater();
      return { ok: false };
    }
    if (S.app && S.booted) S.app.hold();
    leave();
    S.mode = 'guest';
    return done();
  }

  // ---------- 손님 기록 가져오기(학생이 직접 고를 때만) ----------
  function guestData() {
    const rec = recDoc(null).rec, items = progItems(null);
    return { rec: plain(rec) ? rec : {}, items };
  }
  const hasGuest = () => { const g = guestData(); return ownKeys(g.rec).length > 0 || ownKeys(g.items).length > 0; };
  function importGuest() {
    if (S.mode !== 'account') return false;
    if (S.app && S.booted) S.app.flushLocal();
    const ref = S.ref, meta = S.meta, g = guestData();
    const res = mergeDocs({ rec: recDoc(ref).rec || {}, progress: progItems(ref), tomb: meta.tomb, baseAt: {}, dirty: true },
      { rec: g.rec, progress: g.items, tombstones: {} });
    // 같은 판이 양쪽에 있으면 더 최근에 푼 쪽
    for (const k of Object.keys(res.conflicts)) if (slotAt(g.items[k]) > slotAt(res.progress[k])) res.progress[k] = g.items[k];
    if (!writeRec(ref, res.rec) || !writeProg(ref, res.progress)) { setSync('error', '이 기기 저장 공간이 부족해 가져오지 못했어요.'); return false; }
    // 옮긴 손님 기록은 지워 다른 학생 계정으로 또 들어가지 않게 함
    const gdoc = recDoc(null); gdoc.rec = {}; write(BASE.rec, gdoc);
    try { LS.removeItem(BASE.progress); } catch (e) { /* 저장 불가 환경 */ }
    meta.tomb = res.tomb; meta.importDone = true; meta.dirty = true; S.blocked = null;
    saveMeta(ref, meta);
    if (S.app) S.app.refresh({ all: true });
    setSync('pending'); schedule(0);
    return true;
  }
  function dismissImport() { if (S.meta) { S.meta.importDone = true; saveMeta(S.ref, S.meta); render(); } }

  // ---------- 다른 기기와 다른 풀던 판 고르기 ----------
  function resolve(key, choice) {
    const meta = S.meta;
    if (!meta || !meta.conflicts[key]) return;
    const server = meta.conflicts[key];
    if (choice === 'server') { const items = progItems(S.ref); items[key] = server; writeProg(S.ref, items); }
    meta.baseAt[key] = slotAt(server); // 고른 뒤에는 이 기기 내용이 기준이 됨
    delete meta.conflicts[key];
    meta.dirty = true;
    saveMeta(S.ref, meta);
    if (S.app) S.app.refresh({ keys: [key], reload: choice === 'server' });
    if (!Object.keys(meta.conflicts).length) { setSync('pending'); schedule(0); } else render();
  }

  // ---------- app.js 와 연결 ----------
  function changed(kind, key, at) {
    if (S.mode !== 'account' || !S.meta) return;
    if (kind === 'drop' && KEY.test(key)) S.meta.tomb[key] = Math.max(S.meta.tomb[key] || 0, int(at, 0, 9e15) ? at : Date.now());
    S.meta.dirty = true;
    if (S.blocked !== 'forbidden') S.blocked = null; // 기록이 바뀌면 용량·형식 문제는 다시 시도
    saveMeta(S.ref, S.meta);
    if (S.sync !== 'saving' && S.sync !== 'conflict' && !S.loginLost) setSync('pending');
    if (!S.loginLost) schedule();
  }
  function keys() {
    return S.mode === 'account' && S.ref ? { rec: scoped(BASE.rec, S.ref), progress: scoped(BASE.progress, S.ref) } : null;
  }

  // ---------- 화면 ----------
  const SYNC_TEXT = {
    idle: '서버 저장과 같아요', saved: '서버에 저장됐어요', saving: '서버에 저장하는 중…', pending: '이 기기에 먼저 저장했어요 · 곧 서버에 저장해요',
    offline: '연결이 끊겨 이 기기에 보관 중이에요 · 연결되면 다시 저장해요', stale: '서버에 연결하지 못해 이 기기 기록을 보여 줘요',
    login: '로그인이 끊겼어요 · 저장 못 한 풀이는 이 기기에 보관 중이에요', reset: '비밀번호를 바꾼 뒤 저장할 수 있어요',
    too_large: '기록이 너무 많아 서버에 저장하지 못했어요 · 이 기기에는 남아 있어요', error: '서버에 저장하지 못했어요 · 이 기기에는 남아 있어요',
    conflict: '다른 기기의 풀이와 달라요 · 아래에서 골라 주세요'
  };
  function setSync(s, note) { S.sync = s; S.note = note || ''; render(); }
  const hhmm = t => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function otherPending() {
    if (!LS) return false;
    try {
      for (let i = 0; i < LS.length; i++) {
        const k = LS.key(i);
        if (k && k.startsWith(META + ':u:') && k !== (S.ref && scoped(META, S.ref))) { const m = read(k); if (m && (m.pending || m.dirty)) return true; }
      }
    } catch (e) { /* 저장 불가 환경 */ }
    return false;
  }
  const loginForm = lead => `<p class="cw-lead">${lead}</p>
    <form class="cw-form" id="cwLoginForm" autocomplete="on">
      <label>아이디<input name="username" autocomplete="username" required minlength="3" maxlength="16" lang="ko"></label>
      <label>비밀번호<input name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="64"></label>
      <button class="btn" type="submit" data-act="login">로그인</button>
      <button class="btn ghost" type="submit" data-act="register">처음이면 아이디 만들기</button>
    </form>
    <p class="cw-small">잼스 <b>역사 탐험</b>과 같은 학생 계정이에요. 탐험에서 쓰던 아이디가 있으면 그대로 로그인하세요. 실명·연락처는 아이디에 넣지 마세요.</p>
    <p class="cw-msg" id="cwFormMsg" role="alert"></p>`;

  function render() {
    const box = $('#cwAccount');
    if (!box) return;
    let h = '';
    if (S.mode === 'checking' || (S.mode === 'account' && !S.meta)) h ='<p class="cw-lead">학생 계정을 확인하고 있어요…</p>';
    else if (S.mode === 'unavailable') h = `<p class="cw-lead"><b>이 화면은 학생 계정 저장을 쓸 수 없는 복사본이에요.</b> 지금 풀이는 이 기기의 브라우저에만 저장돼요.</p>
      <p class="cw-small">로그인해서 다른 기기에서도 이어 풀려면 잼스.com 낱말풀이에서 열어 주세요: <a href="${CANON}">${CANON}</a></p>`;
    else if (S.mode === 'offline') h = `<p class="cw-lead">인터넷 연결이 없어 학생 계정을 확인하지 못했어요. 지금 풀이는 이 기기(손님 기록)에만 저장돼요.</p>
      <div class="cw-row"><button class="btn" data-act="recheck">다시 확인</button></div>`;
    else if (S.mode === 'reset') h = `<p class="cw-lead"><b>${esc(S.username)}</b> 학생, 선생님이 비밀번호를 초기화했어요. 먼저 새 비밀번호로 바꿔야 낱말풀이를 저장할 수 있어요.</p>
      <div class="cw-row"><a class="btn" href="/play.html">비밀번호 바꾸러 가기</a><button class="btn ghost" data-act="recheck">바꿨어요 · 다시 확인</button><button class="btn ghost" data-act="logout">로그아웃</button></div>`;
    else if (S.mode === 'guest') h = loginForm('로그인하면 완성 기록과 풀던 낱말풀이가 내 계정에 저장돼, 창을 닫거나 다른 기기에서도 이어 풀 수 있어요. 로그인하지 않으면 이 기기에만 저장돼요.') +
      (otherPending() ? '<p class="cw-small">이 기기에 아직 서버에 저장하지 못한 학생 풀이가 보관돼 있어요. 그 학생이 다시 로그인하면 저장돼요.</p>' : '');
    else if (S.mode === 'account') {
      const m = S.meta, text = SYNC_TEXT[S.sync] || '';
      h = `<div class="cw-who"><span class="cw-badge">학생</span><b>${esc(S.username)}</b><span class="cw-sync cw-${S.sync}" role="status">${esc(text)}${S.sync === 'saved' && m.savedAt ? ` (${hhmm(m.savedAt)})` : ''}</span></div>`;
      h += profileHtml(S.profile);
      if (S.note) h += `<p class="cw-small">${esc(S.note)}</p>`;
      if (S.loginLost) h += loginForm(`같은 아이디(<b>${esc(S.username)}</b>)로 다시 로그인하면 보관한 풀이를 저장해요.`);
      else if (S.sync === 'reset') h += '<div class="cw-row"><a class="btn" href="/play.html">비밀번호 바꾸러 가기</a></div>';
      const cks = Object.keys(m.conflicts);
      if (cks.length) {
        const items = progItems(S.ref), sum = p => plain(p) && Array.isArray(p.solved) ? `맞힌 낱말 ${p.solved.length}/${p.total} · ${Math.floor((p.sec || 0) / 60)}분` : '없음';
        h += `<div class="cw-conflict"><b>다른 기기에서도 같은 판을 풀었어요. 어느 풀이로 이어 갈까요?</b>${cks.map(k => `<div class="cw-row">
          <span>${esc(label(k))}</span>
          <button class="btn" data-act="keep-local" data-key="${esc(k)}">이 기기 풀이 (${esc(sum(items[k]))})</button>
          <button class="btn ghost" data-act="keep-server" data-key="${esc(k)}">다른 기기 풀이 (${esc(sum(m.conflicts[k]))})</button></div>`).join('')}</div>`;
      }
      if (!m.importDone && hasGuest()) h += `<div class="cw-import"><p class="cw-small">이 기기에 로그인하지 않고 푼 기록이 있어요. 내 기록이 맞을 때만 가져오세요. 가져온 기록은 이 계정으로 옮겨져요.</p>
        <div class="cw-row"><button class="btn gold" data-act="import">이 기기의 이전 풀이 가져오기</button><button class="btn ghost" data-act="no-import">가져오지 않기</button></div></div>`;
      if (S.confirmLogout) h += `<div class="cw-warn" role="alert"><p>아직 서버에 저장하지 못한 풀이가 있어요. 로그아웃해도 이 기기의 <b>${esc(S.username)}</b> 칸에 보관했다가, 같은 학생이 다시 로그인하면 저장해요. 다른 학생에게는 보이지 않아요.</p>
        <div class="cw-row"><button class="btn" data-act="save-now">지금 저장하기</button><button class="btn ghost" data-act="logout-force">그래도 로그아웃</button><button class="btn ghost" data-act="logout-cancel">취소</button></div></div>`;
      else h += `<div class="cw-row"><button class="btn ghost" data-act="save-now">지금 저장</button><button class="btn ghost" data-act="logout">로그아웃 (다른 학생으로 로그인)</button></div>`;
    }
    if (memoryOnly) h += '<p class="cw-warn" role="alert">이 브라우저에서 기기 저장을 사용할 수 없어요. 서버에 저장됐다는 표시를 확인하기 전에는 창을 닫지 마세요. 연결이 끊기면 현재 창에만 임시 보관돼요.</p>';
    if (S.mode !== 'account' && S.note) h += `<p class="cw-small" role="alert">${esc(S.note)}</p>`;
    box.innerHTML = h;
  }
  // 서버가 확인한 마지막 내 기록(통합). 저장 중·실패 때는 앞서 확인한 값을 그대로 둔다.
  function profileHtml(p) {
    const n = v => (Number.isSafeInteger(v) && v >= 0 ? v : null);
    const c = p && p.scopes && p.scopes.combined;
    if (!c || n(c.xp) === null || n(c.level) === null) return '<p class="cw-profile cw-small">내 기록(순위·레벨)을 아직 불러오지 못했어요.</p>';
    const rank = p.ranked && n(c.rank) !== null && n(c.participants) !== null ? `내 순위 ${n(c.rank)}위 / ${n(c.participants)}명` : '체험 · 순위 제외';
    const e = n(p.scopes.exploration && p.scopes.exploration.xp), w = n(p.scopes.crossword && p.scopes.crossword.xp);
    return `<div class="cw-profile" role="group" aria-label="내 기록 통합"><span class="cw-profile-title">통합 기록</span>
      <b class="cw-profile-main">${esc(rank)} · Lv.${n(c.level)} · 총 경험치 ${n(c.xp)} XP</b>
      ${e !== null && w !== null ? `<span class="cw-profile-parts">탐험 ${e} XP + 낱말풀이 ${w} XP</span>` : ''}
      ${n(c.remainingXp) !== null ? `<span class="cw-profile-next">다음 레벨까지 ${n(c.remainingXp)} XP</span>` : ''}</div>`;
  }
  function label(k) {
    const LV = { intro: '입문', basic: '초급', mid: '중급', adv: '상급', high: '고급', master: '마스터' };
    const TP = { all: '전체 시대', gu: '구석기', sin: '신석기', cheong: '청동기', gojo: '고조선', samguk: '삼국 시대', goryeo: '고려', joseon: '조선', ilje: '일제 강점기', modern: '근현대' };
    const m = k.split('|');
    return `${LV[m[0]]} · ${TP[m[1]]} · ${+m[2] + 1}번`;
  }

  function wire() {
    const box = $('#cwAccount');
    if (!box) return;
    let lastAct = 'login';
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'login' || act === 'register') { lastAct = act; return; } // 제출은 submit 에서
      if (act === 'recheck') identify();
      if (act === 'logout') logout(false);
      if (act === 'logout-force') logout(true);
      if (act === 'logout-cancel') { S.confirmLogout = false; render(); }
      if (act === 'save-now') { S.blocked = null; S.backoff = 0; clearTimeout(S.retryT); S.retryT = null; flush({ manual: true }).then(() => { if (S.meta && !S.meta.pending && !S.meta.dirty) { S.confirmLogout = false; render(); } }); }
      if (act === 'import') importGuest();
      if (act === 'no-import') dismissImport();
      if (act === 'keep-local' || act === 'keep-server') resolve(b.dataset.key, act === 'keep-server' ? 'server' : 'local');
    });
    box.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, kind = (e.submitter && e.submitter.dataset.act) || lastAct;
      const username = f.elements.username.value.trim(), password = f.elements.password.value;
      f.elements.password.value = ''; // 비밀번호는 화면·저장소에 남기지 않음
      const msg = $('#cwFormMsg');
      if (msg) msg.textContent = kind === 'register' ? '아이디를 만드는 중…' : '로그인하는 중…';
      const res = await login(kind, username, password);
      if (!res.ok && $('#cwFormMsg')) $('#cwFormMsg').textContent = res.message;
    });
  }

  // 연결이 돌아오거나 화면으로 돌아오면 보관한 저장을 보냄. 창을 숨길 때는 작은 요청만 keepalive 로.
  window.addEventListener('online', () => { S.backoff = 0; clearTimeout(S.retryT); S.retryT = null; flush(); });
  window.addEventListener('focus', () => flush());
  function leaving() {
    if (S.app && S.booted) S.app.flushLocal(); // app.js 의 저장보다 먼저 불리므로 풀던 판을 먼저 이 기기에 저장
    clearTimeout(S.timer); S.timer = null;
    flush({ keepalive: true });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leaving(); });
  window.addEventListener('pagehide', leaving);

  const api = {
    CANONICAL_URL: CANON,
    storage: LS,
    ready: null,
    attach(app) { S.app = app; },
    booted() { S.booted = true; },
    keys, changed, flush, login, logout, identify, importGuest, dismissImport, resolve,
    label: () => (S.mode === 'account' ? S.username : null),
    state: () => ({ mode: S.mode, ref: S.ref, username: S.username, sync: S.sync, loginLost: S.loginLost, memoryOnly,
      meta: S.meta && JSON.parse(JSON.stringify(S.meta)) }),
    _merge: mergeDocs
  };
  window.CrosswordAccount = api;
  wire();
  // 처음 화면은 계정 확인이 끝난 뒤에 그린다(앞 학생 기록이 잠깐이라도 보이지 않게). 실패해도 거부하지 않고 손님으로 시작.
  api.ready = identify().catch(() => { S.mode = 'offline'; render(); return { scope: null }; });
})();
