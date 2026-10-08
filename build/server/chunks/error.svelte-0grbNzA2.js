import { e as escape_html } from './index.js-fmqScc5X.js';
import { p as page } from './index2-CqD-R3qc.js';
import './state.svelte-D_1B4cRP.js';

function Error($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    $$renderer2.push(`<h1>${escape_html(page.status)}</h1> <p>${escape_html(page.error?.message)}</p>`);
  });
}

export { Error as default };
//# sourceMappingURL=error.svelte-0grbNzA2.js.map
