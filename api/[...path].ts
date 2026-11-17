import { createApiApp } from '../server/app';

const app = createApiApp({
  supportsWebSocket: false,
});

export default app;
