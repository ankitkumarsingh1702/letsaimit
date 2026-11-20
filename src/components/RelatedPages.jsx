import { ArrowLink } from './ui.jsx';
import { articles } from '../features/blog/articles.js';
import './related-pages.css';

export const relatedPages = {
  home: [['/programme/', 'Our programme'], ['/coach/', 'Meet Coach Dhiraj'], ['/schools/', 'For schools']],
  programme: [['/coach/', 'Meet your coach'], ['/events/', 'Football events'], ['/blogs/', 'From the coach']],
  coach: [['/programme/', 'Explore the programme'], ['/blogs/', 'Dhiraj’s writing'], ['/societies/', 'Coaching in your society']],
  societies: [['/programme/', 'What children learn'], ['/events/', 'Football events'], ['/schools/', 'For schools']],
  schools: [['/societies/', 'Community coaching'], ['/coach/', 'Meet Coach Dhiraj'], ['/programme/', 'Our coaching approach']],
  events: [['/programme/', 'Weekly coaching'], ['/societies/', 'Our communities'], ['/blogs/', 'From the coach']],
  blogs: [['/coach/', 'About Dhiraj'], ['/programme/', 'Our programme'], ['/events/', 'Football events']],
  privacy: [['/terms/', 'Terms of service'], ['/refunds/', 'Cancellations and refunds']],
  terms: [['/privacy/', 'Privacy policy'], ['/refunds/', 'Cancellations and refunds'], ['/programme/', 'Our programme']],
  refunds: [['/terms/', 'Terms of service'], ['/privacy/', 'Privacy policy'], ['/programme/', 'Our programme']],
  ...Object.fromEntries(articles.map(article => [article.page, [
    ['/blogs/', 'All coaching guides'], ['/programme/', 'Our programme'], ['/coach/', 'Meet Coach Dhiraj'],
  ]])),
};

export function RelatedPages({ page }) {
  const links = relatedPages[page];
  if (!links) return null;
  return <nav className="related-pages wrap" aria-label="Related pages" data-discovery-exclude="true">
    <p>Keep exploring</p>
    <ul>{links.map(([href, label]) => <li key={href}><ArrowLink href={href}>{label}</ArrowLink></li>)}</ul>
  </nav>;
}
