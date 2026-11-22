/// <reference types="vite/client" />

import type { SplidAPI } from '../../preload/index.d';

declare global {
  interface Window {
    splidAPI?: SplidAPI;
  }
}
