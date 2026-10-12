/**
 * Synthesised sound effects (no files to load). The AudioContext can only
 * start from a user gesture, so the game calls `unlockAudio` on the first tap.
 */

export type Sound = 'flap' | 'score' | 'milestone' | 'hit' | 'fall';

const MUTE_KEY = 'zencode:flappy:muted';
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let master: GainNode | null = null;
let muted = loadMuted();
/** Recorded clips (e.g. the Singam tone), decoded once the context exists. */
const samples = new Map<string, AudioBuffer>();
const wanted = new Set<string>();

function loadMuted() {
	try {
		return localStorage.getItem(MUTE_KEY) === '1';
	} catch {
		return false;
	}
}

export const isMuted = () => muted;

export function setMuted(value: boolean) {
	muted = value;
	try {
		localStorage.setItem(MUTE_KEY, value ? '1' : '0');
	} catch {
		/* preference only lasts this visit */
	}
}

export function unlockAudio() {
	try {
		if (!ctx) {
			const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			if (!AC) return;
			ctx = new AC();
			master = ctx.createGain();
			master.gain.value = 0.55;
			master.connect(ctx.destination);
			noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
			const data = noise.getChannelData(0);
			for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		}
		if (ctx.state === 'suspended') void ctx.resume();
		for (const url of wanted) void loadSample(url);
	} catch {
		ctx = null;
	}
}

async function loadSample(url: string) {
	if (!ctx || samples.has(url)) return;
	try {
		const res = await fetch(url);
		samples.set(url, await ctx.decodeAudioData(await res.arrayBuffer()));
	} catch {
		/* the synthesised sounds still play */
	}
}

/** Ask for a clip to be ready; it loads on the first tap (audio needs a gesture). */
export function preloadSample(url: string) {
	wanted.add(url);
	if (ctx) void loadSample(url);
}

/** Plays a preloaded clip. Returns false if it isn't ready, so a fallback can play. */
export function playSample(url: string, gain = 1): boolean {
	if (muted) return true;
	const buf = samples.get(url);
	if (!ctx || ctx.state !== 'running' || !buf) return false;
	const src = ctx.createBufferSource();
	src.buffer = buf;
	const g = ctx.createGain();
	g.gain.value = gain;
	src.connect(g).connect(ctx.destination);
	src.start();
	return true;
}

function tone(type: OscillatorType, from: number, to: number, at: number, dur: number, gain: number) {
	const c = ctx!;
	const o = c.createOscillator();
	const g = c.createGain();
	o.type = type;
	o.frequency.setValueAtTime(from, at);
	o.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
	g.gain.setValueAtTime(0.0001, at);
	g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
	g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
	o.connect(g).connect(master!);
	o.start(at);
	o.stop(at + dur + 0.02);
}

function hiss(at: number, dur: number, freq: number, gain: number, q = 1) {
	const c = ctx!;
	const src = c.createBufferSource();
	src.buffer = noise;
	const f = c.createBiquadFilter();
	f.type = 'bandpass';
	f.frequency.value = freq;
	f.Q.value = q;
	const g = c.createGain();
	g.gain.setValueAtTime(gain, at);
	g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
	src.connect(f).connect(g).connect(master!);
	src.start(at);
	src.stop(at + dur + 0.02);
}

export function play(sound: Sound) {
	if (muted || !ctx || ctx.state !== 'running') return;
	const t = ctx.currentTime;
	switch (sound) {
		case 'flap':
			hiss(t, 0.09, 1500, 0.22, 0.8);
			tone('triangle', 540, 300, t, 0.08, 0.08);
			break;
		case 'score':
			tone('sine', 988, 988, t, 0.09, 0.16);
			tone('sine', 1319, 1319, t + 0.07, 0.18, 0.16);
			break;
		case 'milestone':
			[784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, f, t + i * 0.065, 0.22, 0.12));
			break;
		case 'hit':
			hiss(t, 0.16, 700, 0.5, 0.6);
			tone('sine', 160, 55, t, 0.28, 0.5);
			break;
		case 'fall':
			tone('sine', 620, 140, t, 0.5, 0.07);
			break;
	}
}
