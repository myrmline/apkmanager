import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { ThemeProvider, bootTheme } from './lib/theme.jsx';
import { I18nProvider, bootLocale } from './lib/i18n.jsx';
import { ToastProvider } from './components/ui.jsx';
import './styles.css';

// Before the first paint: no flash of the wrong theme, and no Arabic session
// starting left to right.
bootTheme();
bootLocale();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
