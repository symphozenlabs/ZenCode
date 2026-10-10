import { describe, expect, it } from 'vitest';
import { hasProfanity, maskProfanity } from './profanity';

describe('hasProfanity', () => {
	it('catches plain, cased and character-swapped words', () => {
		for (const t of ['shit', 'SHIT happens', 'sh1t', 'f u c k', 'fuuuuck', 'b!tch', 'bigfuckguy']) {
			expect(hasProfanity(t), t).toBe(true);
		}
	});

	it('leaves ordinary names and words alone', () => {
		for (const t of ['Scunthorpe', 'Cassandra', 'Dickens', 'assessment', 'Classic', 'Mohit', 'Kshitij', 'grape']) {
			expect(hasProfanity(t), t).toBe(false);
		}
	});
});

it('maskProfanity hides only the offending words', () => {
	expect(maskProfanity('this is shit really')).toBe('this is •••• really');
});
