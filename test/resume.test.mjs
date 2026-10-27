// 이어 풀기(풀던 중 저장) 동작 확인: node --test test/resume.test.mjs
// 브라우저 대신 아주 작은 가짜 DOM에서 data.js + app.js를 그대로 실행합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const DATA = readFileSync(new URL('data.js', root), 'utf8');
const APP = readFileSync(new URL('app.js', root), 'utf8');
const PKEY = 'jams-crossword-progress-v1';

function makeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    map: m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); }
  };
}

function makeEl(id) {
  const listeners = {};
  const classes = new Set();
  return {
    id, innerHTML: '', textContent: '', value: '', placeholder: '', className: '', dataset: {}, listeners,
    style: { setProperty() {} }, offsetWidth: 0, clientWidth: 600, onclick: null,
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle: (c, on) => ((on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c)) },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    fire(type, ev = {}) { for (const fn of listeners[type] || []) fn({ preventDefault() {}, target: { closest: () => null }, ...ev }); },
    after() {}, appendChild() {}, focus() {}, scrollIntoView() {}, querySelectorAll() { return []; }
  };
}

// storage를 공유하는 새 "브라우저 탭"을 엽니다.
function openPage(storage, hash = '') {
  const els = new Map();
  const el = sel => { if (!els.has(sel)) els.set(sel, makeEl(sel)); return els.get(sel); };
  const dynamic = new Set(['#resumeSec']); // app.js가 직접 만드는 요소는 넣기 전까지 없음
  const winListeners = {};
  const document = {
    querySelector: s => (dynamic.has(s) && !els.has(s) ? null : el(s)),
    createElement: () => makeEl(''),
    head: makeEl('head'), body: makeEl('body'),
    documentElement: { style: { setProperty() {} } },
    visibilityState: 'visible',
    addEventListener() {}
  };
  el('#home .hero').after = n => { if (n && n.id) els.set('#' + n.id, n); };
  const location = { hash, href: 'https://example.test/' + hash };
  const window = {
    document, location, localStorage: storage, innerWidth: 1200,
    matchMedia: () => ({ matches: false }), scrollTo() {}, print() {},
    addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: {}, prompt() {}, alert() {}
  };
  window.window = window;
  const ctx = vm.createContext(window);
  vm.runInContext(DATA, ctx);
  vm.runInContext(APP, ctx);
  const api = window.JAMS_CROSSWORD;
  return {
    api, el, window,
    current: () => api.current(),
    word: i => api.getSet(api.current().L, api.current().topic).list[api.current().stage].words[i],
    answer(val) { el('#ansInput').value = val; el('#ansForm').fire('submit'); },
    item(id) { el('#items').fire('click', { target: { closest: () => ({ dataset: { item: id } }) } }); },
    go(h) { location.hash = h; (winListeners.hashchange || []).forEach(fn => fn()); },
    hide() { (winListeners.pagehide || []).forEach(fn => fn()); }
  };
}

const saved = storage => JSON.parse(storage.getItem(PKEY) || '{"items":{}}').items;

test('답·오답·찬스를 저장하고 다시 열면 같은 판을 이어서 풀어요', () => {
  const storage = makeStorage();
  const a = openPage(storage, '#play/intro/all/1');
  const first = a.current().sel;
  a.answer(a.word(first).a);              // 정답
  const sel = a.current().sel;
  a.answer('가'.repeat(a.word(sel).len)); // 오답 1번(대부분 오답)
  a.item('cho');                          // 초성 힌트
  a.el('#ansInput').value = '초안';
  a.el('#ansInput').fire('input');
  const before = a.current();
  assert.ok(before.solved.includes(first));
  assert.equal(before.used.cho, 1);
  const entry = saved(storage)['intro|all|0'];
  assert.ok(entry, '진행 상황이 저장되어야 해요');
  assert.equal(entry.draft, '초안');

  const b = openPage(storage, '#play/intro/all/1');
  const after = b.current();
  assert.deepEqual([...after.solved].sort(), [...before.solved].sort());
  assert.equal(after.misses, before.misses);
  assert.equal(after.used.cho, 1);
  assert.equal(after.items.cho, before.items.cho);
  assert.equal(after.penalty, before.penalty);
  assert.equal(after.sel, before.sel);
  assert.equal(b.el('#ansInput').value, '초안');
});

test('홈 화면에 이어서 풀기 항목이 보이고 저장 지우기가 동작해요', () => {
  const storage = makeStorage();
  const a = openPage(storage, '#play/basic/goryeo/3');
  a.answer(a.word(a.current().sel).a);
  a.go('');
  const html = a.el('#resumeSec').innerHTML;
  assert.match(html, /이어서 풀기/);
  assert.match(html, /#play\/basic\/goryeo\/3/);
  assert.match(html, /로그인하면 학생 계정에도 저장돼요/);
  a.el('#resumeSec').fire('click', { target: { closest: s => (s === '[data-forget]' ? { dataset: { forget: 'basic|goryeo|2' } } : null) } });
  assert.equal(saved(storage)['basic|goryeo|2'], undefined);
});

test('다시 풀기는 저장된 풀이를 지우고 처음부터 시작해요', () => {
  const storage = makeStorage();
  const a = openPage(storage, '#play/intro/all/2');
  a.answer(a.word(a.current().sel).a);
  assert.ok(saved(storage)['intro|all|1']);
  a.el('#restartBtn').fire('click');
  a.el('#doRestart').onclick();
  assert.equal(a.current().solved.length, 0);
  assert.equal(saved(storage)['intro|all|1'], undefined);
  const b = openPage(storage, '#play/intro/all/2');
  assert.equal(b.current().solved.length, 0);
});

test('모두 풀면 완료 기록만 남고 진행 저장은 지워져요', () => {
  const storage = makeStorage();
  const a = openPage(storage, '#play/intro/all/4');
  for (let guard = 0; guard < 100 && !a.current().done; guard++) a.answer(a.word(a.current().sel).a);
  assert.equal(a.current().done, true);
  assert.equal(saved(storage)['intro|all|3'], undefined);
  const rec = JSON.parse(storage.getItem('jams-crossword-v1')).rec['intro|all|3'];
  assert.equal(rec.stars, 3);
});

test('깨진 저장값·다른 판 저장값·조작된 값은 버리고 새로 시작해요', () => {
  const corrupt = makeStorage({ [PKEY]: '{not json' });
  const a = openPage(corrupt, '#play/intro/all/1');
  assert.equal(a.current().solved.length, 0);

  const storage = makeStorage();
  const b = openPage(storage, '#play/intro/all/1');
  b.answer(b.word(b.current().sel).a);
  const all = JSON.parse(storage.getItem(PKEY));
  const good = all.items['intro|all|0'];

  for (const bad of [
    { ...good, sig: 'other' },                       // 낱말 데이터가 바뀐 판
    { ...good, solved: [999] },                      // 범위 밖 낱말
    { ...good, used: { ...good.used, reveal: 99 } }, // 쓸 수 있는 개수보다 많음
    { ...good, given: ['999,999'] },                 // 판 밖 칸
    { ...good, sec: -5 }
  ]) {
    storage.setItem(PKEY, JSON.stringify({ v: 1, items: { 'intro|all|0': bad } }));
    const c = openPage(storage, '#play/intro/all/1');
    assert.equal(c.current().solved.length, 0);
    assert.equal(saved(storage)['intro|all|0'], undefined, '맞지 않는 저장값은 지워져야 해요');
  }
});

test('저장소를 쓸 수 없어도 게임은 동작해요', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const a = openPage(broken, '#play/intro/all/1');
  a.answer(a.word(a.current().sel).a);
  assert.equal(a.current().solved.length >= 1, true);
});

test('같은 판은 항상 같은 모양으로 만들어져요(지문 고정)', () => {
  const a = openPage(makeStorage());
  const b = openPage(makeStorage());
  const sa = a.api.getSet(2, 'joseon').list.map(a.api.puzzleSig);
  const sb = b.api.getSet(2, 'joseon').list.map(b.api.puzzleSig);
  assert.deepEqual([...sa], [...sb]);
});
