/**
 * Node globals, but modules are transformed for the client: Svelte compiles
 * .svelte.ts files in browser mode, so $effect actually runs in tests.
 */
export default {
	name: 'node-client',
	viteEnvironment: 'client',
	setup() {
		return { teardown() {} };
	}
};
