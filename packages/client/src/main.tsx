import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppProviders } from './app/providers';
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './index.css';
import './styles/redesign.css';
const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <AppProviders><App /></AppProviders>
  </StrictMode>,
);
