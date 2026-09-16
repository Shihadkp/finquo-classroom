// Pinpoint (LinkedIn). Five words share a hidden category. The client reveals them one
// at a time; the player guesses the category. A guess is accepted if, after normalising,
// it equals the category or any accepted alternative, or contains the category.
import { rng, pick } from "./rng";
import type { GameModule, Level, Puzzle } from "./types";

export type Entry = { category: string; accept: string[]; words: string[]; difficulty: 1 | 2 | 3 };
export type PinpointPublic = { words: string[] };
export type PinpointSolution = { category: string; accept: string[] };
export type PinpointAnswer = { guess: string };
export type PinpointHint = { letter: string; letters: number };

const E = (difficulty: 1 | 2 | 3, category: string, words: string, ...accept: string[]): Entry => ({
  category,
  accept,
  words: words.split(" "),
  difficulty,
});

export const ENTRIES: Entry[] = [
  // --- difficulty 1
  E(1, "Fruits", "apple banana cherry mango grape", "fruit"),
  E(1, "Colours", "red blue green yellow purple", "colors", "colour", "color"),
  E(1, "Planets", "mars venus jupiter saturn mercury", "planet"),
  E(1, "Days of the week", "monday tuesday thursday friday sunday", "days", "weekdays", "day"),
  E(1, "Farm animals", "cow pig sheep goat chicken", "livestock", "farm animal", "animals"),
  E(1, "Joints", "elbow knee ankle wrist shoulder", "joint", "body parts", "body joints"),
  E(1, "Vegetables", "carrot broccoli spinach onion potato", "vegetable", "veg", "veggies"),
  E(1, "Musical instruments", "guitar piano violin drums flute", "instruments", "instrument"),
  E(1, "Sea creatures", "shark whale dolphin octopus jellyfish", "sea animals", "marine animals", "ocean animals", "sea life"),
  E(1, "Sports", "soccer tennis golf hockey rugby", "sport"),
  E(1, "Shapes", "circle square triangle hexagon oval", "shape"),
  E(1, "Months", "january march june october december", "months of the year", "month"),
  E(1, "Insects", "ant bee beetle moth wasp", "bugs", "insect", "bug"),
  E(1, "Weather", "rain snow hail fog sleet", "types of weather", "precipitation", "weather types"),
  // --- difficulty 2
  E(2, "Things with keys", "piano keyboard map lock computer", "have keys", "things that have keys", "keys"),
  E(2, "Card games", "poker bridge rummy solitaire blackjack", "card game", "games with cards"),
  E(2, "Pasta shapes", "penne fusilli linguine farfalle rigatoni", "pasta", "types of pasta", "pastas"),
  E(2, "Dog breeds", "beagle poodle boxer husky dalmatian", "dogs", "breeds of dog", "dog"),
  E(2, "Greek letters", "alpha beta gamma delta omega", "greek alphabet", "greek letter"),
  E(2, "Chess pieces", "king queen rook bishop knight", "chess", "chess piece"),
  E(2, "Currencies", "dollar euro yen pound rupee", "money", "currency"),
  E(2, "Gemstones", "ruby emerald sapphire diamond opal", "gems", "precious stones", "jewels", "gem"),
  E(2, "Things that fly", "kite plane bird bat drone", "fly", "can fly", "things that can fly", "flying things"),
  E(2, "Trees", "oak maple birch willow cedar", "tree", "types of tree"),
  E(2, "Breads", "baguette sourdough ciabatta pita brioche", "bread", "types of bread"),
  E(2, "Coffee drinks", "latte espresso mocha cappuccino americano", "coffee", "coffees", "types of coffee"),
  E(2, "Birds of prey", "eagle hawk falcon owl vulture", "raptors", "birds", "raptor"),
  E(2, "Rooms in a house", "kitchen bathroom attic cellar lounge", "rooms", "parts of a house", "room"),
  // --- difficulty 3
  E(3, "Words before board", "key skate chalk dash snow", "board", "___board", "precede board", "followed by board", "can come before board"),
  E(3, "Words hiding a number", "tone often weight phone attention", "hidden numbers", "contain numbers", "numbers hidden inside", "number inside", "hidden number"),
  E(3, "Anagrams of listen", "listen silent enlist tinsel inlets", "anagrams", "anagram", "same letters"),
  E(3, "Palindromes", "level radar kayak civic rotor", "palindrome", "read the same backwards", "same backwards"),
  E(3, "Homophones of letters", "sea bee tea eye you", "sound like letters", "letters", "letter homophones", "sounds like a letter", "sound like a letter"),
  E(3, "Capital cities", "lima oslo cairo quito hanoi", "capitals", "capital", "capital city"),
  E(3, "Words before fall", "water night rain pit down", "fall", "___fall", "precede fall", "followed by fall", "can come before fall"),
  E(3, "Shakespeare plays", "hamlet macbeth othello tempest coriolanus", "shakespeare", "plays by shakespeare", "shakespeare play"),
  E(3, "Cloud types", "cirrus cumulus stratus nimbus altostratus", "clouds", "cloud", "types of cloud"),
  E(3, "Noble gases", "neon argon xenon radon krypton", "noble gas", "gases", "elements", "inert gases"),
  E(3, "Bones", "femur tibia fibula ulna radius", "bone", "human bones", "bones of the body"),
  E(3, "Programming languages", "python rust ruby swift java", "coding languages", "languages", "programming language", "coding language"),
  E(3, "Poker hands", "flush straight pair trips quads", "poker", "poker hand", "hands in poker"),
  E(3, "Words starting with silent K", "knife knee knight knot knack", "silent k", "kn words", "start with kn", "silent letter"),
  E(3, "Rivers", "nile amazon danube thames ganges", "river"),
  E(3, "Greek gods", "zeus hera apollo athena hermes", "gods", "greek mythology", "olympians", "greek god"),
];

export function normalise(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|an|a) /, "");
}

export function difficultyForLevel(level: Level): 1 | 2 | 3 {
  return level <= 3 ? 1 : level <= 7 ? 2 : 3;
}

export function generate(seed: string, level: Level): Puzzle<PinpointPublic, PinpointSolution> {
  const r = rng(`${seed}:pinpoint:${level}`);
  const e = pick(r, ENTRIES.filter((x) => x.difficulty === difficultyForLevel(level)));
  return { public: { words: e.words.slice() }, solution: { category: e.category, accept: e.accept.slice() } };
}

export function verify(puzzle: Puzzle<PinpointPublic, PinpointSolution>, answer: PinpointAnswer): boolean {
  const guess = normalise(answer?.guess);
  if (!guess) return false;
  const cat = normalise(puzzle.solution.category);
  return guess === cat || guess.includes(cat) || puzzle.solution.accept.some((a) => normalise(a) === guess);
}

/** Progressive: each hint reveals one more letter of the category (answer.letters = letters already shown). */
export function hint(puzzle: Puzzle<PinpointPublic, PinpointSolution>, answer: PinpointAnswer & { letters?: number }): PinpointHint | null {
  if (verify(puzzle, answer)) return null;
  const cat = puzzle.solution.category;
  const n = Math.min(cat.length, (answer?.letters ?? 0) + 1);
  return { letter: cat.slice(0, n), letters: n };
}

export const pinpoint: GameModule<PinpointPublic, PinpointSolution, PinpointAnswer, PinpointHint> = {
  id: "pinpoint",
  generate,
  verify,
  hint,
};
