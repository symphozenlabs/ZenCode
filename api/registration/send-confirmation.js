import { handleSendConfirmationApi } from '../../src/lib/server/apiHandler.js';

export default function handler(req, res) {
  return handleSendConfirmationApi(req, res);
}
