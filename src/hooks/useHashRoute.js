import { useEffect, useState } from 'react';
import { pageFromHash } from '../lib/routes.js';

export default function useHashRoute() {
  const [page, setPage] = useState(() => pageFromHash(window.location.hash));

  useEffect(() => {
    const updatePage = () => setPage(pageFromHash(window.location.hash));
    window.addEventListener('hashchange', updatePage);
    return () => window.removeEventListener('hashchange', updatePage);
  }, []);

  return page;
}
