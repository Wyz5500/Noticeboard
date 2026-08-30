/** Wires browser boundaries to the API-driven application controller. */
import { ApiClient } from './core/api-client.js';
import { AppController } from './core/app-controller.js';

const application = new AppController(
  window,
  document,
  window.localStorage,
  new ApiClient(),
);
void application.start();
