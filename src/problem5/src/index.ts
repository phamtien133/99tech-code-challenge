import { createApp } from './app';
import { config } from './config/env';

const app = createApp();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console -- startup line; structured logging is out of scope
  console.log(`problem5 listening on port ${config.port} (${config.nodeEnv})`);
});
