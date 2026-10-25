/**
 * Word Heist dictionary: SCOWL word lists (via the wordlist-english package),
 * sizes 10–60 of the dialect-neutral, American and British lists — SCOWL's
 * recommended size for spell checking (~79k words). Only plain a–z words are
 * kept (no accents, abbreviations or proper nouns).
 *
 * SCOWL is Copyright 2000-2016 Kevin Atkinson and contributors, used under its
 * permissive licence — see node_modules/wordlist-english/Copyright.
 */
import e10 from 'wordlist-english/english-words-10.json';
import e20 from 'wordlist-english/english-words-20.json';
import e35 from 'wordlist-english/english-words-35.json';
import e40 from 'wordlist-english/english-words-40.json';
import e50 from 'wordlist-english/english-words-50.json';
import e55 from 'wordlist-english/english-words-55.json';
import e60 from 'wordlist-english/english-words-60.json';
import a10 from 'wordlist-english/american-words-10.json';
import a20 from 'wordlist-english/american-words-20.json';
import a35 from 'wordlist-english/american-words-35.json';
import a40 from 'wordlist-english/american-words-40.json';
import a50 from 'wordlist-english/american-words-50.json';
import a55 from 'wordlist-english/american-words-55.json';
import a60 from 'wordlist-english/american-words-60.json';
import b10 from 'wordlist-english/british-words-10.json';
import b20 from 'wordlist-english/british-words-20.json';
import b35 from 'wordlist-english/british-words-35.json';
import b40 from 'wordlist-english/british-words-40.json';
import b50 from 'wordlist-english/british-words-50.json';
import b55 from 'wordlist-english/british-words-55.json';
import b60 from 'wordlist-english/british-words-60.json';

const ALPHA = /^[a-z]+$/;

const toUpper = (lists: string[][]) => {
	const out = new Set<string>();
	for (const list of lists) for (const w of list) if (ALPHA.test(w)) out.add(w.toUpperCase());
	return out;
};

let words: Set<string> | null = null;

function dictionary() {
	words ??= toUpper([e10, e20, e35, e40, e50, e55, e60, a10, a20, a35, a40, a50, a55, a60, b10, b20, b35, b40, b50, b55, b60]);
	return words;
}

/** Is this (upper-case A–Z) word in the dictionary? */
export const isWord = (w: string) => dictionary().has(w);

export const dictionarySize = () => dictionary().size;
