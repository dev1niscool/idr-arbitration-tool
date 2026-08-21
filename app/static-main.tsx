import React from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import IdrConsole from './idr-console';

const root = document.getElementById('root');

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <IdrConsole />
    </React.StrictMode>,
  );
}
