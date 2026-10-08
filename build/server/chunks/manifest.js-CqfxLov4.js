const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.svg"]),
	mimeTypes: {".svg":"image/svg+xml"},
	_: {
		client: {start:"_app/immutable/entry/start.Lj-KLwIN.js",app:"_app/immutable/entry/app.D5zY_vzn.js",imports:["_app/immutable/entry/start.Lj-KLwIN.js","_app/immutable/chunks/l7SPSVmw.js","_app/immutable/chunks/Cb3aJbPW.js","_app/immutable/chunks/C01FcyRK.js","_app/immutable/chunks/B3OgFEQt.js","_app/immutable/entry/app.D5zY_vzn.js","_app/immutable/chunks/Cb3aJbPW.js","_app/immutable/chunks/CNS_VA-3.js","_app/immutable/chunks/Cp_YvU0p.js","_app/immutable/chunks/B3OgFEQt.js","_app/immutable/chunks/CgBLT_Za.js","_app/immutable/chunks/CJTWub_f.js","_app/immutable/chunks/C5rsKlTS.js","_app/immutable/chunks/Bl3ob37w.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:true},
		nodes: [
			__memo(() => import('./0-C1up7X8m.js')),
			__memo(() => import('./1-CZuLCLNS.js')),
			__memo(() => import('./2-DPM7npkQ.js')),
			__memo(() => import('./3-BG-j4_r5.js')),
			__memo(() => import('./4-BqgPuG7o.js')),
			__memo(() => import('./5-IIM5qOx6.js')),
			__memo(() => import('./6-TJ9i2pwA.js')),
			__memo(() => import('./7-BM9gMOqS.js')),
			__memo(() => import('./8-BgvuhccD.js')),
			__memo(() => import('./9-DrBblPhf.js')),
			__memo(() => import('./10-DOkzPQFu.js')),
			__memo(() => import('./11-CPa-Utlm.js')),
			__memo(() => import('./12-DPmJTGBU.js')),
			__memo(() => import('./13-DK2WsSAO.js')),
			__memo(() => import('./14-CL0zNCsf.js')),
			__memo(() => import('./15-D_lb2rjB.js')),
			__memo(() => import('./16-BQdHJSuN.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/(site)",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/admin",
				pattern: /^\/admin\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 10 },
				endpoint: null
			},
			{
				id: "/admin/hackathon",
				pattern: /^\/admin\/hackathon\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 11 },
				endpoint: null
			},
			{
				id: "/admin/login",
				pattern: /^\/admin\/login\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 12 },
				endpoint: null
			},
			{
				id: "/admin/participants",
				pattern: /^\/admin\/participants\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 13 },
				endpoint: null
			},
			{
				id: "/admin/pitch-fest",
				pattern: /^\/admin\/pitch-fest\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 14 },
				endpoint: null
			},
			{
				id: "/admin/registrations",
				pattern: /^\/admin\/registrations\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 15 },
				endpoint: null
			},
			{
				id: "/admin/settings",
				pattern: /^\/admin\/settings\/?$/,
				params: [],
				page: { layouts: [0,3,], errors: [1,,], leaf: 16 },
				endpoint: null
			},
			{
				id: "/api/register",
				pattern: /^\/api\/register\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./_server.ts-DPtthLKl.js'))
			},
			{
				id: "/(site)/hackathon",
				pattern: /^\/hackathon\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/(site)/pitch-fest",
				pattern: /^\/pitch-fest\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 6 },
				endpoint: null
			},
			{
				id: "/(site)/register",
				pattern: /^\/register\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 7 },
				endpoint: null
			},
			{
				id: "/(site)/rules",
				pattern: /^\/rules\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 8 },
				endpoint: null
			},
			{
				id: "/(site)/schedule",
				pattern: /^\/schedule\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,,], leaf: 9 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();

export { manifest as m };
//# sourceMappingURL=manifest.js-CqfxLov4.js.map
