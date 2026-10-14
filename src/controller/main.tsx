/** Controller entry point: install the platform, start the runtime, render. */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from '@tauri-apps/api/core';
import './styles/app.css';
import { App } from './App';
import { boot, install } from './boot';
import { createTauriPlatform } from './platform/tauri';
import { setState } from './state/store';
import { storedTheme } from './actions/ui';
import { applyTheme } from './components/picta/provider';
import { installInertGuard } from './lib/focus';
import { notify } from './actions/notify';

async function start(): Promise<void> {
  const native = isTauri();
  const platform = native
    ? createTauriPlatform()
    : (await import('./platform/demo')).createDemoPlatform();
  install(platform);
  setState({ theme: storedTheme() });
  applyTheme(storedTheme());

  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root');
  installInertGuard(root);
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  try {
    const dispose = await boot();
    import.meta.hot?.dispose(dispose);
  } catch (error) {
    notify.error('Picta could not finish starting', String(error));
  }
}

void start();
