import { ArrowLink } from './ui.jsx';
import { articles } from '../features/blog/articles.js';
import { localPages } from '../features/locations/local-pages.js';
import './related-pages.css';

export const relatedPages = {
  home: [
    ['/bengaluru/football-coaching/', 'Kids’ football in Bangalore'],
    ['/bengaluru/basketball-coaching/', 'Kids’ basketball in Bangalore'],
    ['/blogs/choosing-football-coaching-bengaluru/', 'Football academy vs. coaching guide'],
    ['/blogs/football-coaching-sarjapur-road-chandapura-bangalore/', 'Coaching near Sarjapur Road & Chandapura'],
    ['/blogs/football-coaching-by-age-5-to-14-bangalore/', 'Football classes by age (5–14)'],
    ['/blogs/girls-football-coaching-bangalore/', 'Girls’ football in Bangalore'],
    ['/blogs/kids-fitness-programmes-bangalore/', 'Kids’ fitness programs'],
    ['/blogs/letsaimit-parent-reviews-and-feedback/', 'LetsAimIt reviews & parent feedback'],
    ['/programme/', 'Our programme'],
    ['/coach/', 'Meet Coach Dhiraj'],
    ['/schools/', 'For schools'],
    ['/bengaluru/', 'Bengaluru communities'],
  ],
  programme: [
    ['/bengaluru/football-coaching/', 'Football coaching in Bangalore'],
    ['/bengaluru/basketball-coaching/', 'Basketball coaching in Bangalore'],
    ['/blogs/football-coaching-by-age-5-to-14-bangalore/', 'Ages 5–6 & 7–12 football guide'],
    ['/blogs/kids-fitness-programmes-bangalore/', 'Kids’ physical fitness'],
    ['/blogs/girls-football-coaching-bangalore/', 'Girls’ football coaching'],
    ['/blogs/choosing-football-coaching-bengaluru/', 'Comparing football academies'],
    ['/coach/', 'Meet your coach'],
    ['/events/', 'Football events'],
    ['/blogs/', 'Coaching guides'],
    ['/bengaluru/', 'Find your community'],
  ],
  coach: [
    ['/bengaluru/football-coaching/', 'Football coaching in Bangalore'],
    ['/blogs/letsaimit-parent-reviews-and-feedback/', 'Parent stories & feedback'],
    ['/blogs/choosing-football-coaching-bengaluru/', 'Choosing football coaching'],
    ['/blogs/football-dribbling-drills-for-kids/', 'Beginner football dribbling drills'],
    ['/programme/', 'Explore the programme'],
    ['/blogs/', 'Dhiraj’s writing'],
    ['/societies/', 'Coaching in your society'],
  ],
  societies: [
    ['/blogs/society-sports-coaching-checklist/', 'Gated community checklist'],
    ['/blogs/football-coaching-sarjapur-road-chandapura-bangalore/', 'Sarjapur Road & Chandapura'],
    ['/programme/', 'What children learn'],
    ['/events/', 'Football events'],
    ['/schools/', 'For schools'],
    ['/bengaluru/', 'Current coaching locations'],
  ],
  schools: [
    ['/blogs/balancing-sport-and-school/', 'After-school sports & routines'],
    ['/blogs/kids-fitness-programmes-bangalore/', 'Kids’ fitness programs'],
    ['/societies/', 'Community coaching'],
    ['/coach/', 'Meet Coach Dhiraj'],
    ['/programme/', 'Our coaching approach'],
  ],
  events: [['/programme/', 'Weekly coaching'], ['/societies/', 'Our communities'], ['/blogs/', 'From the coach']],
  blogs: [
    ['/bengaluru/football-coaching/', 'Kids’ football in Bangalore'],
    ['/bengaluru/basketball-coaching/', 'Kids’ basketball in Bangalore'],
    ['/coach/', 'About Dhiraj'],
    ['/programme/', 'Our programme'],
    ['/events/', 'Football events'],
  ],
  privacy: [['/terms/', 'Terms of service'], ['/refunds/', 'Cancellations and refunds']],
  terms: [['/privacy/', 'Privacy policy'], ['/refunds/', 'Cancellations and refunds'], ['/programme/', 'Our programme']],
  refunds: [['/terms/', 'Terms of service'], ['/privacy/', 'Privacy policy'], ['/programme/', 'Our programme']],
  ...Object.fromEntries(articles.map(article => [article.page, [
    ['/blogs/', 'All coaching guides'], ['/programme/', 'Our programme'], ['/coach/', 'Meet Coach Dhiraj'],
  ]])),
  ...Object.fromEntries(localPages.map(content => [content.page, [
    ['/programme/', 'Programme details'], ['/coach/', 'Meet Coach Dhiraj'], ['/societies/', 'For society committees'],
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
