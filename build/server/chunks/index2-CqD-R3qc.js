import './state.svelte-D_1B4cRP.js';
import { k as getContext } from './index.js-fmqScc5X.js';

function context() {
  return getContext("__request__");
}
const page$1 = {
  get error() {
    return context().page.error;
  },
  get status() {
    return context().page.status;
  },
  get url() {
    return context().page.url;
  }
};
const page = page$1;

export { page as p };
//# sourceMappingURL=index2-CqD-R3qc.js.map
