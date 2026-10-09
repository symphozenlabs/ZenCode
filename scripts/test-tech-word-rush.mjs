// Tech Word Rush rule tests — run with `npm run test:games`.
// Uses Node's built-in test runner; the engine is plain TypeScript with no imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	MAX_GUESSES,
	applyGuess,
	applyHint,
	applySkip,
	freshQuestion,
	hintBlock,
	maskWord,
	rankPlayers,
	settle
} from '../src/lib/games/tech-word-rush/engine.ts';
import { DEFAULT_QUESTIONS, pickQuestions, CATEGORIES } from '../src/lib/games/tech-word-rush/questions.ts';

const WORD = 'PYTHON';
const hint = (q, xp, rnd = () => 0) => applyHint(WORD, q, xp, true, q.hintsUsed, rnd);
const guess = (q, text, xp = 0) => applyGuess(q, xp, true, text, q.guesses.length);
/** Guess the right word, reveal, and return the new total. */
const correct = (q, xp) => {
	const g = guess(q, 'python', xp);
	assert.ok(g.ok);
	const done = settle(WORD, g.q);
	return { q: done, totalXp: g.totalXp + done.earned };
};

/** Apply n successful hints, returning the final question state and total. */
function hints(n, xp, q = freshQuestion(0)) {
	for (let i = 0; i < n; i++) {
		const out = hint(q, xp);
		assert.ok(out.ok, `hint ${i + 1} should be allowed`);
		q = out.q;
		xp = out.totalXp;
	}
	return { q, xp };
}

// ── XP ───────────────────────────────────────────────────────────────────
test('1. no hints → correct = +100', () => {
	const out = correct(freshQuestion(0), 300);
	assert.equal(out.totalXp, 400);
	assert.equal(out.q.earned, 100);
});

test('2. one hint → correct = +50', () => {
	const { q, xp } = hints(1, 300);
	assert.equal(correct(q, xp).totalXp, 350);
});

test('3. two hints → correct = +0', () => {
	const { q, xp } = hints(2, 300);
	assert.equal(correct(q, xp).totalXp, 300);
});

test('4. first two hints do not reduce accumulated XP', () => {
	assert.equal(hints(1, 300).xp, 300);
	assert.equal(hints(2, 300).xp, 300);
});

test('5. third hint costs 50 XP; spec example 300 → 200 after four hints', () => {
	assert.equal(hints(3, 300).xp, 250);
	const { q, xp } = hints(4, 300);
	assert.equal(xp, 200);
	assert.equal(q.reward, 0);
	assert.equal(correct(q, xp).totalXp, 200);
});

test('6–10. paid hints never take XP below zero (0, 49, 50 edge cases)', () => {
	const two = hints(2, 0).q;
	assert.equal(hintBlock(WORD, two, 0, true), 'insufficient-xp');
	assert.equal(hint(two, 0).ok, false);
	assert.equal(hint(two, 49).ok, false);
	const paid = hint(two, 50);
	assert.ok(paid.ok);
	assert.equal(paid.totalXp, 0);
	const again = hint(paid.q, paid.totalXp);
	assert.deepEqual(again, { ok: false, reason: 'insufficient-xp' });
});

// ── Letters ──────────────────────────────────────────────────────────────
test('11–12. first and last visible, middle hidden', () => {
	assert.deepEqual(maskWord(WORD, []), ['P', null, null, null, null, 'N']);
});

test('13–15. each hint reveals exactly one new middle letter and keeps earlier ones', () => {
	let q = freshQuestion(0);
	const seen = new Set();
	for (let i = 0; i < 4; i++) {
		const out = applyHint(WORD, q, 1000, true, q.hintsUsed, Math.random);
		assert.ok(out.ok);
		assert.equal(out.q.revealed.length, i + 1);
		assert.ok(out.position > 0 && out.position < WORD.length - 1);
		assert.ok(!seen.has(out.position), 'position revealed twice');
		seen.add(out.position);
		for (const p of q.revealed) assert.ok(out.q.revealed.includes(p));
		q = out.q;
	}
	assert.deepEqual(maskWord(WORD, q.revealed), [...WORD]);
});

test('16–17. no hidden letters → hint blocked and state unchanged', () => {
	const { q, xp } = hints(4, 1000);
	assert.equal(hintBlock(WORD, q, xp, true), 'no-letters');
	const out = hint(q, xp);
	assert.deepEqual(out, { ok: false, reason: 'no-letters' });
});

test('duplicate hint request (same expected count) is ignored', () => {
	const q0 = freshQuestion(0);
	const first = applyHint(WORD, q0, 300, true, 0);
	assert.ok(first.ok);
	const dup = applyHint(WORD, first.q, first.totalXp, true, 0);
	assert.deepEqual(dup, { ok: false, reason: 'stale' });
});

test('hint blocked once the question ended or all guesses are used', () => {
	assert.equal(applyHint(WORD, freshQuestion(0), 300, false, 0).reason, 'not-active');
	let q = freshQuestion(0);
	for (const w of ['java', 'ruby', 'rust']) q = guess(q, w).q;
	assert.equal(hint(q, 300).reason, 'done');
});

// ── Guesses (judged only on reveal) ──────────────────────────────────────
test('18–20. guesses are trimmed and case-insensitive', () => {
	for (const a of ['python', 'Python', 'PYTHON', '  Python', 'Python  ']) {
		assert.equal(settle(WORD, guess(freshQuestion(0), a).q).status, 'correct', a);
	}
});

test('a guess gives no feedback: XP and status unchanged until reveal', () => {
	const g = guess(freshQuestion(0), 'python', 300);
	assert.equal(g.totalXp, 300);
	assert.equal(g.q.status, 'playing');
	assert.deepEqual(g.q.guesses, [{ text: 'PYTHON', reward: 100 }]);
});

test('21. empty guess rejected without using a guess', () => {
	assert.deepEqual(guess(freshQuestion(0), '   '), { ok: false, reason: 'empty' });
});

test(`up to ${MAX_GUESSES} guesses, then blocked`, () => {
	let q = freshQuestion(0);
	for (const w of ['java', 'ruby', 'rust']) {
		const g = guess(q, w);
		assert.ok(g.ok, w);
		q = g.q;
	}
	assert.equal(q.guesses.length, 3);
	assert.equal(guess(q, 'python').reason, 'no-guesses');
});

test('repeating the same guess is rejected and costs nothing', () => {
	const q = guess(freshQuestion(0), 'java').q;
	assert.equal(guess(q, ' Java ').reason, 'duplicate');
});

test('reveal: a correct guess pays the reward it locked in when sent', () => {
	let q = guess(freshQuestion(0), 'java').q; // locked at 100
	q = hint(q, 300).q; // reward drops to 50
	q = guess(q, 'python').q; // locked at 50
	const done = settle(WORD, q);
	assert.equal(done.status, 'correct');
	assert.equal(done.earned, 50);
});

test('reveal: right guess sent before hints keeps the full reward', () => {
	let q = guess(freshQuestion(0), 'python').q;
	q = hint(q, 300).q;
	assert.equal(settle(WORD, q).earned, 100);
});

test('reveal: all wrong = failed, 0 XP; no guesses = missed', () => {
	let q = freshQuestion(0);
	for (const w of ['java', 'ruby']) q = guess(q, w).q;
	assert.deepEqual([settle(WORD, q).status, settle(WORD, q).earned], ['failed', 0]);
	assert.equal(settle(WORD, freshQuestion(0)).status, 'missed');
});

test('24. settling twice never pays twice', () => {
	const once = settle(WORD, guess(freshQuestion(0), 'python').q);
	assert.equal(settle(WORD, once), once);
});

test('duplicate submit (same expected count) is not counted twice', () => {
	const first = applyGuess(freshQuestion(0), 0, true, 'java', 0);
	assert.equal(applyGuess(first.q, 0, true, 'ruby', 0).reason, 'stale');
});

test('25. guess after the question ends is rejected', () => {
	assert.equal(applyGuess(freshQuestion(0), 0, false, 'python', 0).reason, 'not-active');
});

test('skip gives 0 XP, keeps spent XP spent, and blocks further actions', () => {
	const { q, xp } = hints(3, 300);
	const out = applySkip(q, xp, true);
	assert.equal(out.totalXp, 250);
	assert.equal(out.q.status, 'skipped');
	assert.equal(hint(out.q, out.totalXp).reason, 'done');
	assert.equal(guess(out.q, 'python').reason, 'done');
	assert.equal(settle(WORD, out.q).status, 'skipped');
});

test('skip is not allowed after guessing', () => {
	assert.equal(applySkip(guess(freshQuestion(0), 'java').q, 0, true).reason, 'has-guesses');
});

// ── Ranking + question bank ──────────────────────────────────────────────
test('ranking: XP desc, ties share a rank, prevRank tracks movement', () => {
	const prev = rankPlayers([
		{ id: 'a', name: 'A', xp: 100, correct: 1, joinedAt: 1 },
		{ id: 'b', name: 'B', xp: 50, correct: 1, joinedAt: 2 },
		{ id: 'c', name: 'C', xp: 0, correct: 0, joinedAt: 3 }
	]);
	const next = rankPlayers(
		[
			{ id: 'a', name: 'A', xp: 100, correct: 1, joinedAt: 1 },
			{ id: 'b', name: 'B', xp: 150, correct: 2, joinedAt: 2 },
			{ id: 'c', name: 'C', xp: 100, correct: 1, joinedAt: 3 }
		],
		prev
	);
	assert.deepEqual(
		next.map((e) => [e.id, e.rank, e.prevRank]),
		[
			['b', 1, 2],
			['a', 2, 1],
			['c', 2, 3]
		]
	);
});

test('question bank: ≥30 valid, unique, clue never contains the answer', () => {
	assert.ok(DEFAULT_QUESTIONS.length >= 30);
	const words = new Set();
	for (const q of DEFAULT_QUESTIONS) {
		assert.match(q.word, /^[A-Z]{3,20}$/, q.id);
		assert.ok(!q.description.toUpperCase().includes(q.word), `${q.word} appears in its clue`);
		assert.ok(CATEGORIES.includes(q.category), q.id);
		assert.ok(!words.has(q.word), `duplicate ${q.word}`);
		words.add(q.word);
	}
	for (const c of CATEGORIES) assert.ok(DEFAULT_QUESTIONS.some((q) => q.category === c), `no ${c} words`);
});

test('pickQuestions: 10 unique words, preferred first, ordered easy → hard', () => {
	const preferred = DEFAULT_QUESTIONS.slice(0, 4);
	const picked = pickQuestions(preferred, DEFAULT_QUESTIONS);
	assert.equal(picked.length, 10);
	assert.equal(new Set(picked.map((q) => q.word)).size, 10);
	for (const p of preferred) assert.ok(picked.some((q) => q.word === p.word));
	const order = { easy: 0, medium: 1, hard: 2 };
	for (let i = 1; i < picked.length; i++) assert.ok(order[picked[i - 1].difficulty] <= order[picked[i].difficulty]);
});
