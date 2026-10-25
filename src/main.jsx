import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/styles.css';
import './styles/programme.css';
import './styles/coach.css';
import './styles/societies.css';
import './styles/forms.css';
import './styles/gallery.css';
import './styles/home-coach.css';
import './styles/football-footer.css';
import './styles/typography.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
