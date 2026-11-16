// A curated set of conversation starters shown on Home. They are written by the UNSAID team,
// never pretend to be from a person, and rotate so people don't keep seeing the same one.
export const PROMPTS = [
  'What’s something you’ve always wanted to say but never had the courage to?',
  'What’s one thing people misunderstand about you?',
  'If you could ask everyone one question, what would it be?',
  'What’s something you wish people talked about more?',
  'What’s one opinion you have that most people might disagree with?',
  'What’s a small thing that made your week better recently?',
  'What’s something you pretend to understand but don’t?',
  'What would you tell your younger self if nobody could judge you for it?',
  'What’s a fear you’ve never admitted out loud?',
  'What’s a habit you’re secretly proud of?',
  'Who do you wish you could apologise to?',
  'What’s something you’re still learning to forgive yourself for?',
  'What do you pretend not to care about, but actually do?',
  'What’s the kindest thing a stranger has ever done for you?',
  'What’s a dream you gave up on, and do you miss it?',
  'What’s something you’d change about how we talk to each other?',
  'What’s the best advice you ignored?',
  'What’s a truth you’ve only recently accepted?',
  'What’s something everyone around you seems to enjoy that you just don’t get?',
  'What do you need to hear today?',
  'What’s a memory you replay more than you’d like?',
  'What’s one thing you’d do differently if no one was watching?',
  'What makes you feel most like yourself?',
  'What’s something you’re grateful for that you rarely mention?',
  'What’s a rule you were taught that you now question?',
  'What’s a compliment you’ve never forgotten?',
  'What are you pretending is fine right now?',
  'What’s something you’d love to be asked about, but never are?',
  'What’s a place that feels like home, and why?',
  'What’s the hardest thing about being the person everyone expects you to be?',
  'What’s a question you’re afraid of the answer to?',
  'What’s something you changed your mind about this year?',
  'If you could be fully understood by one person, who would it be?',
  'What’s a small act of courage you’re proud of?',
  'What do you wish you could talk to your family about?',
  'What’s something you’re looking forward to, even if it’s tiny?',
];

const KEY = 'unsaid.prompt.seen';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a.slice(-(PROMPTS.length - 1)))); } catch { /* storage unavailable */ } };

// Next prompt: random, never one of the ones recently shown on this device.
export function nextPrompt() {
  const seen = read();
  let pool = PROMPTS.map((_, i) => i).filter((i) => !seen.includes(i));
  if (!pool.length) pool = PROMPTS.map((_, i) => i).filter((i) => i !== seen[seen.length - 1]);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  write([...seen, pick]);
  return PROMPTS[pick];
}
