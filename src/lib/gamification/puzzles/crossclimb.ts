// Crossclimb (LinkedIn). Five four-letter words form a ladder: consecutive words differ
// by exactly one letter. The player gets the five clues in shuffled order, must answer
// each and then arrange the answers into a valid ladder (either direction accepted).
import { rng, shuffle, pick } from "./rng";
import type { GameModule, Level, Puzzle } from "./types";

export type Ladder = { words: string[]; clues: string[]; difficulty: 1 | 2 | 3 };
export type CrossclimbPublic = { clues: string[] };
/** words in ladder order; order[i] = index into public.clues for rung i. */
export type CrossclimbSolution = { words: string[]; order: number[] };
export type CrossclimbAnswer = { words: string[] };
export type CrossclimbHint = { clueIndex: number; word: string };

const L = (difficulty: 1 | 2 | 3, words: string, ...clues: string[]): Ladder => ({
  words: words.split(" "),
  clues,
  difficulty,
});

export const LADDERS: Ladder[] = [
  // --- difficulty 1: short common words
  L(1, "cold cord card care core", "Low temperature", "Thick string", "Playing ___", "Look after", "Apple's centre"),
  L(1, "warm ward word wore more", "Not cold", "Hospital unit", "Unit of language", "Past tense of wear", "Additional amount"),
  L(1, "fish dish dash cash cast", "Swims with fins", "Plate for food", "Sprint; a punctuation mark", "Paper money", "Actors in a play"),
  L(1, "ball bell belt bolt boot", "Round object you throw", "It rings", "Worn around the waist", "Lightning ___", "Footwear for rain"),
  L(1, "hand band bend bent best", "It has five fingers", "Musical group", "Curve or flex", "Not straight", "Top quality"),
  L(1, "play clay clap flap flat", "Have fun with toys", "Potter's material", "Applaud", "Move like a wing", "Apartment; not bumpy"),
  L(1, "game gate late lane line", "Sport or match", "Garden entrance", "Not on time", "Narrow road", "Straight mark"),
  L(1, "milk mile mine mint mist", "White drink from cows", "5,280 feet", "Belongs to me", "Fresh-breath herb", "Fine fog"),
  L(1, "book look lock rock rack", "Pages bound together", "Glance at", "Secure with a key", "Hard stone", "Shelf for storage"),
  L(1, "rain raid said sand band", "Wet weather", "Sudden attack", "Spoke", "Beach grains", "Rubber ___"),
  // --- difficulty 2
  L(2, "sing sink silk sulk bulk", "Perform a song", "Kitchen basin", "Smooth fabric", "Be moody", "Large mass or amount"),
  L(2, "wave wade wide ride rode", "Ocean swell", "Walk through water", "Broad", "Travel on horseback", "Travelled on horseback"),
  L(2, "dark dart part pare pure", "Without light", "Pub throwing game item", "Portion", "Trim the peel", "Unmixed; clean"),
  L(2, "moon moan loan lean bean", "Night sky orb", "Groan of pain", "Borrowed money", "Thin; tilt", "Coffee or baked ___"),
  L(2, "tree free flee flea plea", "Oak or pine", "Costing nothing", "Run away", "Tiny jumping pest", "Earnest request"),
  L(2, "wind wild mild mile mole", "Moving air", "Untamed", "Gentle; not spicy", "Long distance unit", "Burrowing animal; a spy"),
  L(2, "star scar scan span spin", "Twinkling light", "Mark from a wound", "Look over quickly", "A bridge's stretch", "Rotate quickly"),
  L(2, "coat cost cast last lost", "Winter outerwear", "Price", "Throw; actors", "Final", "Misplaced"),
  L(2, "lamp limp lime time tile", "Desk light", "Walk unevenly", "Green citrus", "What a clock measures", "Bathroom floor square"),
  L(2, "ship shop chop chip whip", "Large boat", "Store", "Cut with an axe", "Potato snack", "Lash; beat cream"),
  // --- difficulty 3: rarer words
  L(3, "moth math bath bash base", "Nocturnal winged insect", "Numbers subject", "Tub soak", "Strike hard; a party", "Foundation"),
  L(3, "gilt gift sift soft loft", "Covered in gold leaf", "Present", "Separate through a sieve", "Not hard", "Converted attic space"),
  L(3, "dusk dust rust ruse rose", "Twilight", "Fine dry particles", "Iron oxide", "Cunning trick", "Thorny flower"),
  L(3, "veil vein vain rain ruin", "Bride's face covering", "Blood vessel", "Conceited", "Precipitation", "Wreck; destroy"),
  L(3, "wisp wasp gasp gash gosh", "Thin strand of smoke", "Stinging insect", "Sharp intake of breath", "Deep cut", "Mild exclamation of surprise"),
  L(3, "quip quit suit slit slot", "Witty remark", "Resign", "Formal outfit", "Narrow cut", "Coin opening"),
  L(3, "knit knot know snow slow", "Make a sweater with needles", "Tied loop in rope", "Be aware of", "Winter precipitation", "Not fast"),
  L(3, "omen open oven even ever", "Sign of things to come", "Not closed", "Baking appliance", "Level; divisible by two", "At any time"),
  L(3, "tarn tart cart curt hurt", "Small mountain lake", "Sour; a small pie", "Shopping trolley", "Rudely brief", "Injure"),
  L(3, "yarn yard hard herd here", "Knitting thread; a tall tale", "Three feet", "Difficult", "Group of cattle", "This place"),
];

export function differsByOne(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return diff === 1;
}

export function difficultyForLevel(level: Level): 1 | 2 | 3 {
  return level <= 3 ? 1 : level <= 7 ? 2 : 3;
}

export function generate(seed: string, level: Level): Puzzle<CrossclimbPublic, CrossclimbSolution> {
  const r = rng(`${seed}:crossclimb:${level}`);
  const d = difficultyForLevel(level);
  const ladder = pick(r, LADDERS.filter((l) => l.difficulty === d));
  // perm[k] = rung shown at clue position k; order[rung] = clue position of that rung.
  const perm = shuffle(r, [0, 1, 2, 3, 4]);
  const order = Array<number>(5);
  perm.forEach((rung, k) => (order[rung] = k));
  return {
    public: { clues: perm.map((rung) => ladder.clues[rung]) },
    solution: { words: ladder.words.slice(), order },
  };
}

const norm = (w: unknown) => String(w ?? "").trim().toLowerCase();

export function verify(puzzle: Puzzle<CrossclimbPublic, CrossclimbSolution>, answer: CrossclimbAnswer): boolean {
  const words = (answer?.words ?? []).map(norm);
  const sol = puzzle.solution.words;
  if (words.length !== sol.length) return false;
  if (new Set(words).size !== sol.length || !sol.every((w) => words.includes(w))) return false;
  return words.every((w, i) => i === 0 || differsByOne(words[i - 1], w));
}

export function hint(puzzle: Puzzle<CrossclimbPublic, CrossclimbSolution>, answer: CrossclimbAnswer): CrossclimbHint | null {
  const have = new Set((answer?.words ?? []).map(norm));
  const { words, order } = puzzle.solution;
  for (let clueIndex = 0; clueIndex < order.length; clueIndex++) {
    const word = words[order.indexOf(clueIndex)];
    if (!have.has(word)) return { clueIndex, word };
  }
  return null;
}

export const crossclimb: GameModule<CrossclimbPublic, CrossclimbSolution, CrossclimbAnswer, CrossclimbHint> = {
  id: "crossclimb",
  generate,
  verify,
  hint,
};
