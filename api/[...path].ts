import { createConfiguredApp } from '../backend/src/config.ts';

// Let Express read the image bytes and JSON itself.
export const config = { api: { bodyParser: false } };
export default createConfiguredApp();
