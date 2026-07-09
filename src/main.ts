import './styles/global.css';
import './app-shell.ts';
import './pages/dashboard-page.ts';
import './pages/library-page.ts';
import './pages/document-detail.ts';
import './pages/settings-page.ts';
import './pages/share-page.ts';
import './components/document-card.ts';
import './components/action-item-list.ts';
import './components/search-bar.ts';
import './components/document-viewer.ts';
import './components/confirm-dialog.ts';
import './components/toast-notification.ts';
import './components/document-chat.ts';
import './components/icon-svg.ts';
import { decodeShareConfig } from './utils/share-config.ts';
import { saveSettings, getSettings } from './db/config-store.ts';

async function handleSharedConfig() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('config');
  if (!encoded) return;

  const config = decodeShareConfig(encoded);
  if (!config) return;

  const settings = await getSettings();
  settings.aiProvider = {
    type: config.aiType as any,
    baseUrl: config.aiBaseUrl,
    apiKey: config.aiApiKey,
    model: config.aiModel,
  };
  settings.tursoUrl = config.tursoUrl;
  settings.tursoToken = config.tursoToken;

  await saveSettings(settings);

  // clean URL
  const url = new URL(window.location.href);
  url.searchParams.delete('config');
  window.history.replaceState({}, '', url.toString());
}

handleSharedConfig();

const redirect = sessionStorage.getItem('redirect');
if (redirect) {
  sessionStorage.removeItem('redirect');
  const url = new URL(redirect);
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  // notify router
  window.dispatchEvent(new PopStateEvent('popstate'));
}
