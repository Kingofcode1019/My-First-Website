import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  {error: Error | null}
> {
  state: {error: Error | null} = {error: null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Business Manager failed to render:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{fontFamily: 'system-ui, sans-serif', margin: '10vh auto', maxWidth: 720, padding: 24}}>
          <h1>Business Manager could not load</h1>
          <p>The app encountered an error while starting. Check the browser console for details.</p>
          <pre style={{whiteSpace: 'pre-wrap'}}>{this.state.error.message}</pre>
        </main>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('The application root element is missing.');

createRoot(rootElement).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
