// Current coaching locations and programme facts, not a list of citywide branches.
// Society addresses describe the communities; session entrance/access is confirmed
// with the coach. They are not LetsAimIt business-address or walk-in claims.
import { BANGALORE_FOOTBALL_SHORT } from '../../data/youtubeShort.js';

const paths = {
  city: '/bengaluru/',
  football: '/bengaluru/football-coaching/',
  basketball: '/bengaluru/basketball-coaching/',
  bellezea: '/bengaluru/nambiar-bellezea/',
  ellegenza: '/bengaluru/nambiar-ellegenza/',
};

const sessionFacts = [
  { label: 'Ages', value: '5–14 years' },
  { label: 'Each week', value: '2 sessions' },
  { label: 'Each session', value: '45–60 minutes' },
  { label: 'First session', value: 'Free, with confirmation' },
];

export const localPages = [
  {
    id: 'bengaluru',
    page: 'local-bengaluru',
    path: paths.city,
    title: 'Football & Basketball Coaching for Kids in Bangalore',
    description: 'LetsAimIt runs kids’ football and basketball coaching in Bangalore (Bengaluru) for ages 5–14 at Nambiar Bellezea and Ellegenza. Request a free first session.',
    heading: 'Football and basketball coaching for kids in Bengaluru (Bangalore).',
    eyebrow: 'Bengaluru (Bangalore) · Ages 5–14',
    intro: 'LetsAimIt is a children’s football, basketball and fitness coaching programme in Bengaluru (Bangalore) for ages 5–14, active at Nambiar Bellezea and Nambiar Ellegenza. Founded by youth football coach Dhiraj Mishra, LetsAimIt runs two 45–60 minute sessions each week with a confirmed free first session.',
    image: {
      file: 'image3.jpeg',
      alt: 'Coach and children practising on the covered football court at Nambiar Ellegenza, Bengaluru',
      caption: 'Coaching at Nambiar Ellegenza, Bengaluru.',
    },
    facts: sessionFacts,
    table: {
      heading: 'Where does LetsAimIt coach in Bengaluru (Bangalore)?',
      caption: 'Active LetsAimIt community coaching locations in Bengaluru (Bangalore)',
      headers: ['Community', 'Locality', 'Sports offered', 'Ages & format'],
      rows: [
        ['Nambiar Bellezea', 'Narayanaghatta, Chandapura–Dommasandra Road, near Muthanallur Circle, Bengaluru 560099', 'Football, basketball & fitness', 'Ages 5–14 · 2×/week (45–60 min) · Free confirmed trial'],
        ['Nambiar Ellegenza', 'Muthanallur Road, Gopasandra, off Sarjapur Road, Bengaluru', 'Football, basketball & fitness', 'Ages 5–14 · 2×/week (45–60 min) · Free confirmed trial'],
      ],
    },
    sections: [
      {
        id: 'choose-your-community',
        heading: 'Which Bengaluru residential communities have LetsAimIt coaching?',
        paragraphs: [
          'LetsAimIt currently runs children’s coaching at two residential communities in South-East Bengaluru (Bangalore): Nambiar Bellezea in Narayanaghatta (Chandapura–Dommasandra Road, near Muthanallur Circle) and Nambiar Ellegenza in the Muthanallur and Gopasandra area (off Sarjapur Road). Each dedicated community page explains the locality and what to confirm before visiting.',
          'A society address helps you find the neighbourhood. Ask the coach for your session’s exact meeting point and community entry arrangements—especially if you are visiting from outside the society—and wait for confirmation before travelling.',
        ],
        bullets: ['Nambiar Bellezea: kids’ football, basketball and fitness coaching.', 'Nambiar Ellegenza: kids’ football, basketball and fitness coaching.'],
      },
      {
        id: 'choose-a-sport',
        heading: 'How can your child choose between football and basketball?',
        paragraphs: [
          'Football and basketball are available at both Nambiar Bellezea and Nambiar Ellegenza, with age-appropriate fitness activities built into sessions. Complete beginners can start with a confirmed free trial. Tell the team your child’s age, experience and preferred sport so the coach can match a suitable group.',
          'Read our Bangalore football coaching page for the kit checklist, coach credentials and academy-comparison guide, or open the basketball page to review first-visit questions.',
        ],
      },
      {
        id: 'meet-the-coach',
        heading: 'Who leads LetsAimIt coaching in Bangalore?',
        paragraphs: [
          'Dhiraj Mishra founded LetsAimIt after serving as Head Coach at Frisco Soccer Association in Texas. His public coach profile displays his U.S. Soccer Grassroots 4v4, 9v9 and 11v11 licences and Safe Soccer Cleared certificate so parents can inspect real credentials before booking a trial.',
          'Regular sessions run twice a week for 45–60 minutes. Batch days, times, monthly fee quote and venue entry rules depend on the community and age group and are confirmed directly before enrolment.',
        ],
      },
    ],
    faq: [
      { question: 'Where in Bengaluru (Bangalore) does LetsAimIt currently coach?', answer: 'LetsAimIt currently runs kids’ football and basketball coaching at Nambiar Bellezea (Narayanaghatta) and Nambiar Ellegenza (Muthanallur / Gopasandra, off Sarjapur Road). Confirm your child’s group, session timing and meeting point with the coach before arriving.' },
      { question: 'Is LetsAimIt a football academy or a community coaching programme?', answer: 'LetsAimIt is a community sports coaching programme for children aged 5–14 at residential societies in Bengaluru (Bangalore), focused on structured twice-weekly skill learning, fitness and team play close to home rather than a multi-branch competitive league academy.' },
      { question: 'Can my child try a session before joining?', answer: 'Yes. The first session is free. Request a trial with your sport and community, then wait for session confirmation before arriving.' },
      { question: 'Can another society enquire about coaching?', answer: 'Yes. Society committees can use the society enquiry to share their location, suitable space and interest. LetsAimIt discusses the space and timing before a programme is agreed.' },
    ],
    links: [
      { path: '/blogs/choosing-football-coaching-bengaluru/', label: 'Choosing a football academy or coaching in Bangalore' },
      { path: '/blogs/football-coaching-sarjapur-road-chandapura-bangalore/', label: 'Football coaching near Sarjapur Road & Chandapura' },
      { path: '/blogs/football-coaching-by-age-5-to-14-bangalore/', label: 'Football classes for 5-year-olds & ages 7–12' },
      { path: '/blogs/girls-football-coaching-bangalore/', label: 'Girls’ football coaching in Bangalore' },
      { path: '/blogs/kids-fitness-programmes-bangalore/', label: 'Kids’ fitness & physical fitness programs' },
      { path: '/blogs/choosing-basketball-coaching-bengaluru/', label: 'Choosing a basketball academy or coaching in Bangalore' },
      { path: '/blogs/football-or-basketball-for-beginners/', label: 'Football or basketball for a beginner?' },
      { path: '/blogs/letsaimit-parent-reviews-and-feedback/', label: 'LetsAimIt reviews & parent feedback' },
      { path: paths.bellezea, label: 'Coaching at Nambiar Bellezea (near Chandapura)' },
      { path: paths.ellegenza, label: 'Coaching at Nambiar Ellegenza (off Sarjapur Road)' },
      { path: paths.football, label: 'Kids’ football coaching in Bangalore' },
      { path: paths.basketball, label: 'Kids’ basketball coaching in Bangalore' },
      { path: '/coach/', label: 'Meet Coach Dhiraj' },
      { path: '/societies/', label: 'Football coaching for gated communities' },
    ],
  },
  {
    id: 'football',
    page: 'local-football',
    path: paths.football,
    sport: 'Football',
    title: 'Football Coaching for Kids in Bangalore (Bengaluru)',
    description: 'LetsAimIt offers kids’ football coaching in Bangalore (Bengaluru) for ages 5–14 at Nambiar Bellezea and Ellegenza. Meet Coach Dhiraj and book a free trial.',
    heading: 'Kids’ football coaching in Bengaluru (Bangalore).',
    eyebrow: 'Football · Bengaluru (Bangalore) · Ages 5–14',
    intro: 'LetsAimIt is a community football coaching programme for children aged 5–14 in Bengaluru (Bangalore), active at Nambiar Bellezea and Nambiar Ellegenza. Led by founder and former Frisco Soccer Association head coach Dhiraj Mishra, sessions run twice a week for 45–60 minutes—combining warm-up, skill learning, fitness and team play—with a confirmed free first session.',
    image: {
      file: 'ellegenza-match-action.jpg',
      alt: 'Children playing football at Ellegenza Match Day in Bengaluru',
      caption: 'Community football at Ellegenza Match Day, Bengaluru.',
    },
    video: BANGALORE_FOOTBALL_SHORT,
    facts: sessionFacts,
    table: {
      heading: 'LetsAimIt kids’ football coaching in Bangalore at a glance',
      caption: 'Key facts for parents comparing kids’ football coaching and football academies in Bangalore (Bengaluru)',
      headers: ['Programme detail', 'Verified LetsAimIt information'],
      rows: [
        ['Age range', 'Children aged 5–14 years (beginners and returning players matched by age and experience)'],
        ['Active locations', 'Nambiar Bellezea (Narayanaghatta, 560099) and Nambiar Ellegenza (Muthanallur / Gopasandra, off Sarjapur Road), Bengaluru'],
        ['Session schedule', 'Twice a week, 45–60 minutes per session (exact batch days and times confirmed with the coach)'],
        ['Session structure', 'Three parts: warm-up, skill learning and playing together, with fitness activities included'],
        ['Lead founder & credentials', 'Dhiraj Mishra — former Head Coach, Frisco Soccer Association (Texas); U.S. Soccer Grassroots 4v4, 9v9, 11v11 & Safe Soccer Cleared'],
        ['First session & fees', 'First session is free after confirmation; monthly coaching fee is confirmed before paid enrolment'],
      ],
    },
    sections: [
      {
        id: 'a-first-football-session',
        heading: 'What happens in a kids’ football session at LetsAimIt?',
        paragraphs: [
          'Every LetsAimIt football session in Bengaluru follows three clear stages: warming up, learning a football skill and playing together as a team. A confirmed free first visit lets your child meet Coach Dhiraj, experience the group pace and enjoy time on the ball—whether they are kicking a football for the first time or already play at school.',
          'Before arriving, confirm the community, batch timing, meeting point and community entry arrangements with the coach. Our first-session parent guide covers kit preparation and practical ways to help a nervous beginner settle in.',
        ],
        bullets: ['Comfortable sports clothes, trainers and water.', 'Shin guards and football footwear suited to the playing surface.', 'Your confirmed session details and the coach’s contact for the accompanying adult.'],
      },
      {
        id: 'choose-a-football-location',
        heading: 'Where does LetsAimIt run football classes in Bangalore?',
        paragraphs: [
          'LetsAimIt football coaching runs inside two Bengaluru residential communities: Nambiar Bellezea (Narayanaghatta, Chandapura–Dommasandra Road) and Nambiar Ellegenza (Muthanallur / Gopasandra, off Sarjapur Road). Select your preferred community when requesting a trial so the coach can confirm the exact court meeting point and society access.',
          'Batch days and start times vary by community and age group. Ask about the current batch and agreed monthly coaching fee when confirming your child’s free trial session.',
        ],
      },
      {
        id: 'choosing-football-coaching',
        heading: 'How does LetsAimIt compare with a football academy in Bangalore?',
        paragraphs: [
          'Parents searching for the best football academy in Bangalore often compare large multi-branch competitive academies against local community coaching. LetsAimIt is a community football coaching programme built around consistent twice-weekly play close to home, visible U.S. Soccer–trained football leadership, and a parent tracker for attendance, practice progress and weekly feedback.',
          'When comparing any football academy or coaching group in Bengaluru, verify who leads your child’s actual batch, check real qualifications, inspect the playing surface and confirm travel, entry and fee terms. Read our full parent checklist for comparing football academies and community coaching in Bangalore before deciding.',
        ],
      },
      {
        id: 'coach-and-next-steps',
        heading: 'Who coaches football at LetsAimIt?',
        paragraphs: [
          'Founder Dhiraj Mishra previously coached youth football as Head Coach at Frisco Soccer Association in Texas. His public coach page displays his U.S. Soccer Grassroots 4v4, 9v9 and 11v11 licences alongside his Safe Soccer Cleared certificate so families can verify credentials directly.',
          'After a free trial, ask your child what they enjoyed or found unclear, then follow up with the coach about group fit and next steps. The programme page explains regular enrolment, policies and parent tracking.',
        ],
      },
    ],
    faq: [
      { question: 'Is LetsAimIt a football academy or community coaching in Bangalore?', answer: 'LetsAimIt is a community football coaching programme for children aged 5–14 in Bengaluru (Bangalore) at Nambiar Bellezea and Nambiar Ellegenza. Rather than operating as a multi-branch competitive league academy, LetsAimIt focuses on structured twice-weekly training, fitness and teamwork close to home.' },
      { question: 'Are girls and 5-year-old beginners welcome in LetsAimIt football classes?', answer: 'Yes. LetsAimIt welcomes girls and boys aged 5–14 in inclusive mixed community batches, including complete beginners from age 5 and children aged 7–12. Share your child’s age and experience in the free trial request so Coach Dhiraj can match a suitable group.' },
      { question: 'Where are the Bangalore football coaching sessions held—are they near Sarjapur Road or Chandapura?', answer: 'Football coaching runs at Nambiar Ellegenza (Muthanallur Road, Gopasandra, off Sarjapur Road) and Nambiar Bellezea (Narayanaghatta, Chandapura–Dommasandra Road, near Muthanallur Circle, Bengaluru 560099). Always confirm the batch timing, exact meeting point and community entry with the coach before visiting.' },
      { question: 'What should my child bring for kids’ football coaching?', answer: 'Bring comfortable sports clothes, trainers and a water bottle, plus shin guards and football footwear suited to the playing surface. Ask the coach about the surface before buying new boots.' },
    ],
    links: [
      { path: '/blogs/choosing-football-coaching-bengaluru/', label: 'Choosing a football academy or coaching in Bangalore: parent guide' },
      { path: '/blogs/football-coaching-by-age-5-to-14-bangalore/', label: 'Football classes for 5-year-olds & ages 7–12' },
      { path: '/blogs/girls-football-coaching-bangalore/', label: 'Girls’ football coaching in Bangalore' },
      { path: '/blogs/football-coaching-sarjapur-road-chandapura-bangalore/', label: 'Football coaching near Sarjapur Road & Chandapura' },
      { path: '/blogs/football-dribbling-drills-for-kids/', label: 'Football dribbling drills & beginner training for kids' },
      { path: '/blogs/kids-fitness-programmes-bangalore/', label: 'Kids’ fitness & physical fitness programs' },
      { path: '/blogs/letsaimit-parent-reviews-and-feedback/', label: 'LetsAimIt reviews & parent feedback' },
      { path: '/blogs/beginner-football-rules-and-skills/', label: 'A beginner’s guide to football rules and learning' },
      { path: paths.bellezea, label: 'Football near Chandapura · Nambiar Bellezea' },
      { path: paths.ellegenza, label: 'Football near Sarjapur Road · Nambiar Ellegenza' },
      { path: '/blogs/first-football-session/', label: 'A parent’s guide to the first football session' },
      { path: '/blogs/first-community-match/', label: 'Getting ready for a first community match' },
      { path: paths.basketball, label: 'Explore basketball coaching in Bangalore' },
      { path: paths.city, label: 'All Bengaluru coaching locations' },
    ],
  },
  {
    id: 'basketball',
    page: 'local-basketball',
    path: paths.basketball,
    sport: 'Basketball',
    title: 'Basketball Coaching for Kids in Bangalore (Bengaluru)',
    description: 'LetsAimIt offers kids’ basketball coaching in Bangalore (Bengaluru) for ages 5–14 at Nambiar Bellezea and Ellegenza. Check groups and book a free trial.',
    heading: 'Kids’ basketball coaching in Bengaluru (Bangalore).',
    eyebrow: 'Basketball · Bengaluru (Bangalore) · Ages 5–14',
    intro: 'LetsAimIt offers community basketball coaching and fitness activities for children aged 5–14 in Bengaluru (Bangalore) at Nambiar Bellezea and Nambiar Ellegenza. Sessions run twice a week for 45–60 minutes—combining warm-up, skill practice and group play—with a confirmed free first session.',
    image: null,
    facts: sessionFacts,
    table: {
      heading: 'LetsAimIt kids’ basketball coaching in Bangalore at a glance',
      caption: 'Key facts for parents comparing kids’ basketball coaching and basketball academies in Bangalore (Bengaluru)',
      headers: ['Programme detail', 'Verified LetsAimIt information'],
      rows: [
        ['Age range', 'Children aged 5–14 years (beginners and returning players grouped by age and experience)'],
        ['Active locations', 'Nambiar Bellezea (Narayanaghatta, 560099) and Nambiar Ellegenza (Muthanallur / Gopasandra, off Sarjapur Road), Bengaluru'],
        ['Session schedule', 'Twice a week, 45–60 minutes per session (days and times confirmed by community and age group)'],
        ['Session structure', 'Warm-up, basketball skill practice (dribbling, passing, footwork, shooting) and group play with fitness'],
        ['First session & fees', 'First session is free after confirmation; monthly fee is confirmed before paid enrolment'],
      ],
    },
    sections: [
      {
        id: 'finding-a-basketball-group',
        heading: 'How are beginners matched to a basketball group in Bangalore?',
        paragraphs: [
          'A child trying basketball for the first time has different needs from someone who already plays at school. Share your child’s age and experience with LetsAimIt when requesting a trial, and confirm the chosen Bengaluru community and current batch timing before travelling.',
          'If your child is deciding between football and basketball, ask which sport they feel curious to try first. A confirmed free trial lets your family see how the session runs before making any enrolment decision.',
        ],
      },
      {
        id: 'before-the-first-visit',
        heading: 'What should parents confirm before a first basketball session?',
        paragraphs: [
          'Bring comfortable sports clothes, trainers and water. Before buying a basketball or extra gear, ask what equipment is provided at the court and what your child should bring. Confirm the playing court, meeting point and parent waiting area.',
          'Sessions follow the LetsAimIt warm-up, skill-learning and play-together format. Ask the coach to outline the activities planned for your child’s group and how new players ask for help during drills.',
        ],
        bullets: ['Which group is suitable for my child’s age and experience?', 'What are the confirmed days, time and meeting point?', 'Should my child bring any equipment beyond clothes, trainers and water?', 'How do arrival, collection and community entry work for this session?'],
      },
      {
        id: 'choosing-basketball-coaching',
        heading: 'How can you compare basketball academies and coaching in Bangalore?',
        paragraphs: [
          'When comparing a basketball academy or community coaching programme in Bangalore, ask who directly leads the basketball batch, their experience teaching children, and how beginners are supported during drills. Note that Coach Dhiraj Mishra’s displayed U.S. Soccer licences cover football coaching specifically—ask directly about your basketball batch instructor.',
          'Verify the age mix, community entry, timetable and fee terms before enrolling. Our basketball selection guide gives parents a side-by-side checklist for comparing basketball academies and local groups.',
        ],
      },
      {
        id: 'supporting-a-new-player',
        heading: 'How can parents support a new young basketball player?',
        paragraphs: [
          'Introduce your child to the coach and let the coach explain each drill. Afterwards, ask your child what they enjoyed or want to practise next rather than grading a single session.',
          'Explore our parent guides on beginner basketball skills, preparation questions and encouragement without pressure, and confirm the agreed monthly fee and batch details before paid enrolment.',
        ],
      },
    ],
    faq: [
      { question: 'Where does LetsAimIt offer kids’ basketball coaching in Bangalore (Bengaluru)?', answer: 'Basketball coaching runs at Nambiar Bellezea (Narayanaghatta) and Nambiar Ellegenza (Muthanallur / Gopasandra, off Sarjapur Road) in Bengaluru. Choose your community when requesting a session and confirm the meeting point and entry rules before visiting.' },
      { question: 'Can a child who has never played basketball join a free trial?', answer: 'Yes. Request a free first session and share your child’s age and experience. The team discusses a suitable beginner group and confirms the session before you arrive.' },
      { question: 'What is the kids’ basketball coaching schedule?', answer: 'The programme runs twice each week, with 45–60 minute sessions for ages 5–14. Exact batch days and times vary by community and age group and are confirmed before you join.' },
    ],
    links: [
      { path: '/blogs/choosing-basketball-coaching-bengaluru/', label: 'Choosing a basketball academy or coaching in Bangalore' },
      { path: '/blogs/first-basketball-session/', label: 'Before and after a first basketball session' },
      { path: '/blogs/beginner-basketball-skills/', label: 'Dribbling, passing, footwork and shooting explained' },
      { path: paths.bellezea, label: 'Basketball at Nambiar Bellezea' },
      { path: paths.ellegenza, label: 'Basketball at Nambiar Ellegenza' },
      { path: '/blogs/questions-about-training-preparation/', label: 'Questions to ask before a child’s sports session' },
      { path: '/blogs/encouragement-without-pressure/', label: 'Encouragement without extra pressure' },
      { path: paths.football, label: 'Explore football coaching in Bangalore' },
      { path: paths.city, label: 'All Bengaluru coaching locations' },
    ],
  },
  {
    id: 'bellezea',
    page: 'local-bellezea',
    path: paths.bellezea,
    society: 'Nambiar Bellezea',
    title: 'Football Coaching near Chandapura · Nambiar Bellezea',
    description: 'LetsAimIt runs kids’ football, basketball and fitness coaching near Chandapura at Nambiar Bellezea, Narayanaghatta, Bangalore 560099 (ages 5–14).',
    heading: 'Kids’ football & basketball near Chandapura at Nambiar Bellezea.',
    eyebrow: 'Narayanaghatta · Chandapura–Dommasandra Road · Bengaluru 560099',
    intro: 'LetsAimIt provides community football, basketball and fitness coaching for girls and boys aged 5–14 at Nambiar Bellezea in Narayanaghatta, on Chandapura–Dommasandra Road near Muthanallur Circle, Bengaluru 560099. Sessions run twice a week for 45–60 minutes with a confirmed free first session.',
    image: null,
    facts: sessionFacts,
    location: {
      locality: 'Narayanaghatta',
      address: 'Narayanaghatta Village, Chandapura–Dommasandra Road, near Muthanallur Circle, Bengaluru 560099',
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=Nambiar%20Bellezea%2C%20Narayanaghatta%2C%20Bengaluru',
      sourceUrl: 'https://nambiarbuilders.com/faq/',
      sourceLabel: 'Nambiar Builders: Bellezea location',
    },
    sections: [
      {
        id: 'plan-a-bellezea-visit',
        heading: 'Plan your coaching visit to Bellezea',
        paragraphs: [
          'Nambiar Builders places Bellezea in Narayanaghatta Village, on Chandapura–Dommasandra Road near Muthanallur Circle. The society map helps you identify the community; your coaching confirmation gives you the session’s meeting point.',
          'Before travelling, ask the coach about community entry, where your child should meet the group and the arrangements for arrival and collection. If you are visiting from another community, mention that when requesting your trial.',
        ],
      },
      {
        id: 'sport-and-group-at-bellezea',
        heading: 'Choose your sport and confirm the group',
        paragraphs: [
          'Both football and basketball are offered at Bellezea. Choose the sport your child is interested in and share whether they are a beginner or have played before. The coach can discuss a suitable group for their age and experience.',
          'Sessions run twice each week and last 45–60 minutes. The actual days and times depend on the group. Ask for the current Bellezea batch details and fee when discussing enrolment, and wait for confirmation before attending.',
        ],
      },
      {
        id: 'first-session-at-bellezea',
        heading: 'Prepare for the first session',
        paragraphs: [
          'Your first session is free once confirmed. Pack comfortable sports clothes, trainers and water. Football players should bring shin guards and footwear suited to the playing surface. For basketball, ask whether any equipment is needed for your child’s session.',
          'The programme combines warm-up, skill learning and playing together. You can read the sport pages below for preparation questions, or meet Coach Dhiraj through his background and credentials page before getting in touch.',
        ],
      },
    ],
    faq: [
      { question: 'Which sports does LetsAimIt offer near Chandapura at Nambiar Bellezea?', answer: 'Football and basketball are available at Nambiar Bellezea, with physical fitness activities built into sessions. The programme welcomes girls and boys aged 5–14.' },
      { question: 'Where is Nambiar Bellezea?', answer: 'Nambiar Builders lists Bellezea at Narayanaghatta Village, Chandapura–Dommasandra Road, near Muthanallur Circle, Bengaluru 560099. Confirm the coaching meeting point and entry arrangements with the coach before visiting.' },
      { question: 'Are the Bellezea batch timings published?', answer: 'Days and times vary by age group. Ask about the current Bellezea batch when requesting a trial; the coach confirms your session before you arrive.' },
    ],
    links: [
      { path: '/blogs/football-coaching-sarjapur-road-chandapura-bangalore/', label: 'Kids’ football coaching near Chandapura & Sarjapur Road' },
      { path: '/blogs/choosing-football-coaching-bengaluru/#compare-your-society-options', label: 'What to check before joining society football' },
      { path: '/blogs/choosing-basketball-coaching-bengaluru/', label: 'Questions to ask about basketball coaching' },
      { path: '/blogs/society-sports-coaching-checklist/', label: 'Gated community coaching checklist' },
      { path: paths.football, label: 'Football coaching and the kit checklist' },
      { path: paths.basketball, label: 'Basketball coaching and first-visit questions' },
      { path: '/coach/', label: 'Meet Coach Dhiraj' },
      { path: '/programme/', label: 'Programme and enrolment details' },
      { path: paths.ellegenza, label: 'Coaching near Sarjapur Road · Nambiar Ellegenza' },
      { path: paths.city, label: 'All Bengaluru coaching locations' },
    ],
  },
  {
    id: 'ellegenza',
    page: 'local-ellegenza',
    path: paths.ellegenza,
    society: 'Nambiar Ellegenza',
    title: 'Football Coaching near Sarjapur Road · Nambiar Ellegenza',
    description: 'LetsAimIt runs kids’ football, basketball and fitness coaching near Sarjapur Road at Nambiar Ellegenza, Muthanallur, Bangalore (ages 5–14). Free trial.',
    heading: 'Kids’ football & basketball near Sarjapur Road at Nambiar Ellegenza.',
    eyebrow: 'Muthanallur · Gopasandra · Off Sarjapur Road · Bengaluru',
    intro: 'LetsAimIt provides community football, basketball and fitness coaching for girls and boys aged 5–14 at Nambiar Ellegenza on Muthanallur Road, Gopasandra, off Sarjapur Road in Bengaluru (Bangalore). Sessions run twice a week for 45–60 minutes with a confirmed free first session.',
    image: {
      file: 'image2.jpeg',
      alt: 'Children practising on the covered football court at Nambiar Ellegenza in Bengaluru',
      caption: 'The community football court at Nambiar Ellegenza, Bengaluru.',
    },
    facts: sessionFacts,
    location: {
      locality: 'Muthanallur, Gopasandra',
      address: 'Muthanallur Road, Gopasandra, off Sarjapur Road, Bengaluru',
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=Nambiar%20Ellegenza%2C%20Muthanallur%2C%20Bengaluru',
      sourceUrl: 'https://ellegenza.nambiarbuilders.com/',
      sourceLabel: 'Nambiar Builders: Ellegenza location',
    },
    sections: [
      {
        id: 'find-ellegenza',
        heading: 'Find the community and confirm your meeting point',
        paragraphs: [
          'Nambiar describes Ellegenza as off Sarjapur Road in the Muthanallur area, with its site address on Muthanallur Road, Gopasandra. The community map helps you find the society; ask the coach for the exact place to meet for your confirmed session.',
          'Check the entry, arrival and collection arrangements before visiting. If you are coming from outside Ellegenza, tell the coach when requesting your trial so you can settle the access questions in advance.',
        ],
      },
      {
        id: 'weekly-coaching-at-ellegenza',
        heading: 'Weekly coaching, with a group that fits',
        paragraphs: [
          'Football and basketball are available at Ellegenza. The programme is for ages 5–14, with two 45–60 minute sessions each week. Tell us which sport your child would like to try and whether they have played before.',
          'Days and times depend on the age group. Ask the coach about the current Ellegenza batch, the agreed fee and what to bring. Your first session is free once the session has been confirmed.',
        ],
      },
      {
        id: 'community-football-at-ellegenza',
        heading: 'See a little of community football here',
        paragraphs: [
          'The photographs on this page show the real Ellegenza community football setting. Our Events page also includes Ellegenza Match Day photographs: children playing, meeting their team and gathering with the coach.',
          'For future events, check the event information and confirm the relevant age group, place and timing separately. A regular coaching session and a match day can have different arrangements. The parent guide to a first community match offers questions to ask before the day.',
        ],
      },
    ],
    faq: [
      { question: 'Is kids’ football coaching near Sarjapur Road available at Nambiar Ellegenza?', answer: 'Yes. LetsAimIt offers football and basketball coaching at Nambiar Ellegenza (Muthanallur Road, Gopasandra, off Sarjapur Road, Bengaluru) for girls and boys aged 5–14, with physical fitness activities included during sessions.' },
      { question: 'Can I arrive at Ellegenza for an unconfirmed trial?', answer: 'Request your trial first and wait for confirmation. Check the group, timing, meeting point and community entry arrangements with the coach before visiting.' },
      { question: 'Where can I see Ellegenza Match Day photographs?', answer: 'The LetsAimIt Events page includes Ellegenza Match Day photographs. Check future event details with the organiser before making plans to attend.' },
    ],
    links: [
      { path: '/blogs/football-coaching-sarjapur-road-chandapura-bangalore/', label: 'Kids’ football coaching near Sarjapur Road & Chandapura' },
      { path: '/blogs/choosing-football-coaching-bengaluru/#compare-your-society-options', label: 'What to check before joining society football' },
      { path: '/blogs/choosing-basketball-coaching-bengaluru/', label: 'Questions to ask about basketball coaching' },
      { path: '/blogs/society-sports-coaching-checklist/', label: 'Gated community coaching checklist' },
      { path: paths.football, label: 'Football coaching and first-session preparation' },
      { path: paths.basketball, label: 'Basketball coaching and first-visit questions' },
      { path: '/events/', label: 'Ellegenza Match Day photographs' },
      { path: '/blogs/first-community-match/', label: 'A parent’s guide to the first community match' },
      { path: paths.bellezea, label: 'Coaching near Chandapura · Nambiar Bellezea' },
      { path: paths.city, label: 'All Bengaluru coaching locations' },
    ],
  },
];
