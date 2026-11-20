// Current coaching locations and programme facts, not a list of citywide branches.
// Society addresses describe the communities; session entrance/access is confirmed
// with the coach. They are not LetsAimIt business-address or walk-in claims.
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
    title: 'Football & Basketball Coaching for Kids in Bengaluru',
    description: 'Find LetsAimIt football and basketball coaching for ages 5–14 at Nambiar Bellezea and Ellegenza, Bengaluru. Choose your community and request a free trial.',
    heading: 'Football and basketball, close to home in Bengaluru.',
    eyebrow: 'Our Bengaluru communities',
    intro: 'LetsAimIt offers football, basketball and fitness activities for children aged 5–14 at Nambiar Bellezea and Nambiar Ellegenza. Choose the community that works for your family, share your child’s age and experience, and request a first session. The coach confirms the group, timing and meeting point before you visit.',
    image: {
      file: 'image3.jpeg',
      alt: 'Coach and children practising on the covered football court at Nambiar Ellegenza, Bengaluru',
      caption: 'Coaching at Nambiar Ellegenza, Bengaluru.',
    },
    facts: sessionFacts,
    sections: [
      {
        id: 'choose-your-community',
        heading: 'Start with your community',
        paragraphs: [
          'Our current Bengaluru programme runs at two residential communities. Nambiar Bellezea is in Narayanaghatta, on Chandapura–Dommasandra Road near Muthanallur Circle. Nambiar Ellegenza is in the Muthanallur and Gopasandra area, off Sarjapur Road. The community pages below explain the location and what to confirm for a coaching visit.',
          'A society address helps you find the neighbourhood. Ask the coach for your session’s exact meeting point and entry arrangements, especially if you are visiting from another community. Wait for confirmation before travelling.',
        ],
        bullets: ['Nambiar Bellezea: football and basketball.', 'Nambiar Ellegenza: football and basketball.'],
      },
      {
        id: 'choose-a-sport',
        heading: 'Choose a sport your child wants to try',
        paragraphs: [
          'Football and basketball are available at both communities, with fitness activities included in sessions. A beginner can start with a trial. Tell us whether your child has played before and what they would like to try; the coach can discuss a suitable group.',
          'Use the football page for the first-session kit checklist and parent guide. The basketball page explains the questions to settle before joining that group. If you are deciding between the two, discuss your child’s interest and the available group with the coach.',
        ],
      },
      {
        id: 'meet-the-coach',
        heading: 'Meet the person behind the programme',
        paragraphs: [
          'Dhiraj Mishra founded LetsAimIt after coaching youth football at Frisco Soccer Association in Texas. His coach page shows his story, U.S. Soccer football credentials and Safe Soccer certificate. You can read those details before asking about a trial.',
          'The programme runs twice each week, with 45–60 minute sessions. Days and times depend on the community and age group. Ask about the current batch, fee and any access questions when your session is being confirmed.',
        ],
      },
    ],
    faq: [
      { question: 'Where in Bengaluru does LetsAimIt currently coach?', answer: 'Football and basketball coaching currently run at Nambiar Bellezea and Nambiar Ellegenza. Choose one of these communities and confirm your child’s group, session timing and meeting point with the coach.' },
      { question: 'Can my child try a session before joining?', answer: 'Yes. The first session is free. Request a trial with your sport and community, then wait for session confirmation before arriving.' },
      { question: 'Can another society enquire about coaching?', answer: 'Yes. Society committees can use the society enquiry to share their location, suitable space and interest. LetsAimIt discusses the space and timing before a programme is agreed.' },
    ],
    links: [
      { path: '/blogs/choosing-football-coaching-bengaluru/', label: 'How to choose football coaching' },
      { path: '/blogs/choosing-basketball-coaching-bengaluru/', label: 'How to compare basketball coaching' },
      { path: '/blogs/football-or-basketball-for-beginners/', label: 'Football or basketball for a beginner?' },
      { path: paths.bellezea, label: 'Coaching at Nambiar Bellezea' },
      { path: paths.ellegenza, label: 'Coaching at Nambiar Ellegenza' },
      { path: paths.football, label: 'Football coaching in Bengaluru' },
      { path: paths.basketball, label: 'Basketball coaching in Bengaluru' },
      { path: '/coach/', label: 'Meet Coach Dhiraj' },
      { path: '/societies/', label: 'Enquire for another society' },
    ],
  },
  {
    id: 'football',
    page: 'local-football',
    path: paths.football,
    sport: 'Football',
    title: 'Kids’ Football Coaching in Bengaluru',
    description: 'Explore football coaching for children aged 5–14 at Nambiar Bellezea and Ellegenza in Bengaluru. Meet Coach Dhiraj, check the kit and request a free trial.',
    heading: 'Football coaching for children in Bengaluru.',
    eyebrow: 'Football · Ages 5–14',
    intro: 'Try football with LetsAimIt at Nambiar Bellezea or Nambiar Ellegenza. Children join a programme built around warming up, learning a skill and playing together, with two 45–60 minute sessions each week. Start by sharing your child’s age, experience and chosen community so the coach can discuss a suitable group.',
    image: {
      file: 'ellegenza-match-action.jpg',
      alt: 'Children playing football at Ellegenza Match Day in Bengaluru',
      caption: 'Community football at Ellegenza Match Day, Bengaluru.',
    },
    facts: sessionFacts,
    sections: [
      {
        id: 'a-first-football-session',
        heading: 'What a first football session looks like',
        paragraphs: [
          'The LetsAimIt session has three parts: warm up, learn a skill and play together. A first visit gives your child a chance to meet the coach and understand how the group works. Share any previous experience, including if your child has never played football.',
          'Before arriving, confirm the community, batch timing, meeting point and how your child should join the group. Our first-session guide helps you prepare for those small practical details and gives you ideas for talking with a nervous beginner.',
        ],
        bullets: ['Comfortable sports clothes, trainers and water.', 'Shin guards and football footwear suited to the playing surface.', 'Your confirmed session details and the coach’s contact for the accompanying adult.'],
      },
      {
        id: 'choose-a-football-location',
        heading: 'Find the right community for your family',
        paragraphs: [
          'Football is available at both Nambiar Bellezea and Nambiar Ellegenza. Choose the relevant community when requesting a trial. The location pages give the society’s area and a map search, while the coach confirms the actual session meeting point and entry arrangements.',
          'Days and times vary by community and age group. Ask about the current batch and fee rather than relying on another family’s arrangements. Your first session is free once it has been confirmed.',
        ],
      },
      {
        id: 'choosing-football-coaching',
        heading: 'What to compare when choosing football coaching',
        paragraphs: [
          'Begin with the group your child would actually join. Check the coach’s football background, how beginners are introduced and whether the age and experience mix feels suitable. Dhiraj’s coaching credentials are available on his profile so you can read them before a trial.',
          'Compare the practical arrangements too: confirmed session times, the playing surface, community entry and the agreed fee. Ask your child about the trial afterwards. Their experience of the group gives you useful information alongside the programme details.',
        ],
      },
      {
        id: 'coach-and-next-steps',
        heading: 'Read about the coach and the next session',
        paragraphs: [
          'Coach Dhiraj’s background includes youth football at Frisco Soccer Association, Texas. His coach page displays U.S. Soccer Grassroots 4v4, 9v9 and 11v11 credentials, alongside his Safe Soccer certificate. Read the details and ask how your child’s experience fits the current group.',
          'After a trial, ask your child what they enjoyed or found unclear. A practical follow-up question for the coach can be about group fit or what to expect next time. The programme page explains enrolment and the regular session format.',
        ],
      },
    ],
    faq: [
      { question: 'Is LetsAimIt football suitable for a beginner?', answer: 'A beginner can start with a free trial. Share your child’s age and experience so the coach can discuss a suitable group before confirming the session.' },
      { question: 'Where are the Bengaluru football sessions?', answer: 'Football coaching is available at Nambiar Bellezea and Nambiar Ellegenza. Confirm the batch timing, exact meeting point and entry arrangements before visiting.' },
      { question: 'What should my child bring for football?', answer: 'Bring comfortable sports clothes, trainers and water. For football, bring shin guards and footwear suited to the playing surface. Ask the coach if you are unsure about the surface or kit.' },
    ],
    links: [
      { path: '/blogs/choosing-football-coaching-bengaluru/', label: 'Coaching, academies and trial questions: the parent checklist' },
      { path: '/blogs/beginner-football-rules-and-skills/', label: 'A beginner’s guide to football rules and learning' },
      { path: paths.bellezea, label: 'Football at Nambiar Bellezea' },
      { path: paths.ellegenza, label: 'Football at Nambiar Ellegenza' },
      { path: '/blogs/first-football-session/', label: 'A parent’s guide to the first football session' },
      { path: '/blogs/first-community-match/', label: 'Getting ready for a first community match' },
      { path: paths.basketball, label: 'Explore basketball coaching' },
      { path: paths.city, label: 'All Bengaluru coaching locations' },
    ],
  },
  {
    id: 'basketball',
    page: 'local-basketball',
    path: paths.basketball,
    sport: 'Basketball',
    title: 'Kids’ Basketball Coaching in Bengaluru',
    description: 'Find basketball coaching for ages 5–14 at Nambiar Bellezea and Ellegenza, Bengaluru. Check group fit, session arrangements and the free first-session process.',
    heading: 'Basketball coaching for children in Bengaluru.',
    eyebrow: 'Basketball · Ages 5–14',
    intro: 'LetsAimIt offers basketball at Nambiar Bellezea and Nambiar Ellegenza, alongside fitness activities during sessions. The programme is for children aged 5–14, with two sessions a week lasting 45–60 minutes. Tell us your child’s age and previous experience when asking about a first visit.',
    image: null,
    facts: sessionFacts,
    sections: [
      {
        id: 'finding-a-basketball-group',
        heading: 'Find a group before planning your visit',
        paragraphs: [
          'A child who is trying basketball for the first time may have different questions from someone who already plays. Share that experience with the coach and ask which group would be suitable. Confirm the chosen community and the current batch timing before travelling.',
          'If your child is choosing between football and basketball, ask what they would enjoy trying. Discuss the available group and session arrangements with the coach. A confirmed trial gives your family a chance to see how the session feels before deciding about enrolment.',
        ],
      },
      {
        id: 'before-the-first-visit',
        heading: 'Settle the practical questions first',
        paragraphs: [
          'Bring comfortable sports clothes, trainers and water. Before buying equipment, ask what the coach would like your child to bring to the basketball session. Confirm the playing space, meeting point and where the accompanying adult should wait.',
          'The programme follows a warm-up, skill-learning and play-together format. Ask the coach to explain the basketball activities planned for your child’s group and how a new player can ask for help with an instruction.',
        ],
        bullets: ['Which group is suitable for my child’s age and experience?', 'What are the confirmed days, time and meeting point?', 'Should my child bring any equipment beyond clothes, trainers and water?', 'How do arrival, collection and community entry work for this session?'],
      },
      {
        id: 'choosing-basketball-coaching',
        heading: 'Questions that help you compare basketball coaching',
        paragraphs: [
          'Ask who leads the basketball group, about their basketball coaching experience and how a new player joins the activities. Find out how instructions are demonstrated and what a child should do when they need help. These questions help you understand the session your child will attend.',
          'Confirm the age group, venue access, timetable and fee before deciding. A trial lets your child experience the group and gives you a chance to ask any remaining questions. Keep their interest in the sport part of that decision.',
        ],
      },
      {
        id: 'supporting-a-new-player',
        heading: 'Leave room for your child’s experience',
        paragraphs: [
          'Introduce your child to the coach and let the coach explain the activity. After the session, ask which part your child would like to tell you about. Listen to what felt interesting or unclear before deciding on the next step.',
          'Our parent guides offer practical questions about preparation and encouragement without pressure. You can also read the programme details and discuss the agreed coaching fee and batch with the team before paid enrolment.',
        ],
      },
    ],
    faq: [
      { question: 'Where does LetsAimIt offer basketball in Bengaluru?', answer: 'Basketball is available at Nambiar Bellezea and Nambiar Ellegenza. Use your chosen community when requesting a session and confirm the meeting point and entry arrangements with the coach.' },
      { question: 'Can a child who has never played basketball try a session?', answer: 'Request a free first session and share your child’s age and experience. The coach discusses a suitable group and confirms the session before you arrive.' },
      { question: 'What is the basketball coaching schedule?', answer: 'The programme runs twice each week, with 45–60 minute sessions for ages 5–14. Days and times vary by community and age group; your batch timing is confirmed before you join.' },
    ],
    links: [
      { path: '/blogs/choosing-basketball-coaching-bengaluru/', label: 'Choosing basketball coaching: what to compare' },
      { path: '/blogs/first-basketball-session/', label: 'Before and after a first basketball session' },
      { path: '/blogs/beginner-basketball-skills/', label: 'Dribbling, passing, footwork and shooting explained' },
      { path: paths.bellezea, label: 'Basketball at Nambiar Bellezea' },
      { path: paths.ellegenza, label: 'Basketball at Nambiar Ellegenza' },
      { path: '/blogs/questions-about-training-preparation/', label: 'Questions to ask before a child’s sports session' },
      { path: '/blogs/encouragement-without-pressure/', label: 'Encouragement without extra pressure' },
      { path: paths.football, label: 'Explore football coaching' },
      { path: paths.city, label: 'All Bengaluru coaching locations' },
    ],
  },
  {
    id: 'bellezea',
    page: 'local-bellezea',
    path: paths.bellezea,
    society: 'Nambiar Bellezea',
    title: 'Football & Basketball at Nambiar Bellezea, Bengaluru',
    description: 'Explore LetsAimIt football and basketball at Nambiar Bellezea, Narayanaghatta, Bengaluru. Coaching for ages 5–14; confirm the group and request a free trial.',
    heading: 'Coaching at Nambiar Bellezea.',
    eyebrow: 'Narayanaghatta · Bengaluru',
    intro: 'Football and basketball are available through LetsAimIt at Nambiar Bellezea. Our programme is for children aged 5–14, with fitness activities included in sessions. Tell us the sport your child wants to try, their age and their experience so the coach can discuss the group and confirm your visit.',
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
      { question: 'Which sports does LetsAimIt offer at Nambiar Bellezea?', answer: 'Football and basketball are available at Nambiar Bellezea, with fitness activities in sessions. The programme is for ages 5–14.' },
      { question: 'Where is Nambiar Bellezea?', answer: 'Nambiar Builders lists Bellezea at Narayanaghatta Village, Chandapura–Dommasandra Road, near Muthanallur Circle, Bengaluru 560099. Confirm the coaching meeting point and entry arrangements with the coach before visiting.' },
      { question: 'Are the Bellezea batch timings published?', answer: 'Days and times vary by age group. Ask about the current Bellezea batch when requesting a trial; the coach confirms your session before you arrive.' },
    ],
    links: [
      { path: '/blogs/choosing-football-coaching-bengaluru/#compare-your-society-options', label: 'What to check before joining society football' },
      { path: '/blogs/choosing-basketball-coaching-bengaluru/', label: 'Questions to ask about basketball coaching' },
      { path: '/blogs/society-sports-coaching-checklist/', label: 'Venue and parent-information checklist' },
      { path: paths.football, label: 'Football coaching and the kit checklist' },
      { path: paths.basketball, label: 'Basketball coaching and first-visit questions' },
      { path: '/coach/', label: 'Meet Coach Dhiraj' },
      { path: '/programme/', label: 'Programme and enrolment details' },
      { path: paths.ellegenza, label: 'Coaching at Nambiar Ellegenza' },
      { path: paths.city, label: 'All Bengaluru coaching locations' },
    ],
  },
  {
    id: 'ellegenza',
    page: 'local-ellegenza',
    path: paths.ellegenza,
    society: 'Nambiar Ellegenza',
    title: 'Football & Basketball at Nambiar Ellegenza, Bengaluru',
    description: 'Find LetsAimIt football and basketball at Nambiar Ellegenza near Muthanallur, Bengaluru. Coaching for ages 5–14; confirm access, the group and a free trial.',
    heading: 'Coaching at Nambiar Ellegenza.',
    eyebrow: 'Muthanallur · Bengaluru',
    intro: 'LetsAimIt offers football and basketball for children aged 5–14 at Nambiar Ellegenza. Sessions include fitness activities, skill learning and playing together. Choose Ellegenza when requesting a trial and share your child’s age and experience so the coach can discuss the current group.',
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
      { question: 'Is football and basketball coaching available at Nambiar Ellegenza?', answer: 'Yes. LetsAimIt offers both sports at Nambiar Ellegenza for children aged 5–14, with fitness activities included during sessions.' },
      { question: 'Can I arrive at Ellegenza for an unconfirmed trial?', answer: 'Request your trial first and wait for confirmation. Check the group, timing, meeting point and community entry arrangements with the coach before visiting.' },
      { question: 'Where can I see Ellegenza Match Day photographs?', answer: 'The LetsAimIt Events page includes Ellegenza Match Day photographs. Check future event details with the organiser before making plans to attend.' },
    ],
    links: [
      { path: '/blogs/choosing-football-coaching-bengaluru/#compare-your-society-options', label: 'What to check before joining society football' },
      { path: '/blogs/choosing-basketball-coaching-bengaluru/', label: 'Questions to ask about basketball coaching' },
      { path: '/blogs/society-sports-coaching-checklist/', label: 'Venue and parent-information checklist' },
      { path: paths.football, label: 'Football coaching and first-session preparation' },
      { path: paths.basketball, label: 'Basketball coaching and first-visit questions' },
      { path: '/events/', label: 'Ellegenza Match Day photographs' },
      { path: '/blogs/first-community-match/', label: 'A parent’s guide to the first community match' },
      { path: paths.bellezea, label: 'Coaching at Nambiar Bellezea' },
      { path: paths.city, label: 'All Bengaluru coaching locations' },
    ],
  },
];
