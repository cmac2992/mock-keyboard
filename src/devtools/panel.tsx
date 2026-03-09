import { createRoot } from 'react-dom/client';
import { PanelApp } from './PanelApp';

const rootElement = document.getElementById('app');
if (!rootElement) {
  throw new Error('Missing #app root for the panel.');
}

createRoot(rootElement).render(<PanelApp />);
