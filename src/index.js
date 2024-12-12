import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import log from 'electron-log';

if (window.electron) {
  log.transports.file.level = 'debug';
  log.transports.console.level = 'debug';
  Object.assign(console, log.functions);
} else {
  // Fallback for browser environment
  console.log('Running in browser mode - electron-log disabled');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
