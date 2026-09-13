/**
 * The shapes, as pixel grids.
 *
 * Twelve by twelve, which is the smallest grid a courgette and a cucumber can differ on and still
 * be drawn as themselves. Every row is exactly twelve characters and every form exactly twelve
 * rows: `crop-sprite.test.ts` holds both, because a miscounted row is invisible in a diff and
 * obvious on screen.
 *
 * The characters are palette SLOTS and not colours, which is the whole reason there are twenty
 * forms and not a hundred and eighty-two drawings:
 *
 * - `.` nothing
 * - `a` the body of the thing
 * - `b` its shaded side, which is what stops a flat blob reading as a sticker
 * - `c` its lit side
 * - `g` leaf and stem, which is the same green on almost everything and so is given a default
 *
 * A form plus a palette is a crop. `carrot` and `parsnip` are the same taproot in different
 * colours; `tomato` and `apple` are the same round fruit, and nobody looking at a 20px list is
 * being asked to tell those two apart by shape
 */
export type SpriteForm = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
]

export const SPRITE_FORMS = {
  /** tomato, apple, melon: the round one, with a stem and a leaf */
  'round-fruit': [
    '............',
    '.....g.g....',
    '....ggg.....',
    '...ccaab....',
    '..caaaabb...',
    '.caaaaaabb..',
    '.caaaaaaab..',
    '.caaaaaaab..',
    '..aaaaaab...',
    '...bbbbb....',
    '............',
    '............',
  ],
  /** cucumber, courgette, okra: long, lying on the diagonal the way it lies in a bed */
  'long-fruit': [
    '..........g.',
    '.........gg.',
    '........ab..',
    '.......aab..',
    '......caab..',
    '.....caab...',
    '....caab....',
    '...caab.....',
    '..caab......',
    '..cab.......',
    '..bb........',
    '............',
  ],
  /** pepper, aubergine, fig, pawpaw: wide at the shoulders, drawn in at the base */
  'teardrop-fruit': [
    '.....g......',
    '.....g......',
    '...ggggg....',
    '..caaaabb...',
    '.caaaaaabb..',
    '.caaaaaaab..',
    '.caaaaaab...',
    '..caaaaab...',
    '..caaaab....',
    '...caab.....',
    '....bb......',
    '............',
  ],
  /** lettuce, spinach, chard: a loose bunch of leaves, which is what is picked */
  'leafy-bunch': [
    '............',
    '...a...a....',
    '..aab.aab...',
    '.caaabaaab..',
    '.caaaaaaab..',
    'caaaaaaaaab.',
    'caaaaaaaaab.',
    '.caaaaaaab..',
    '..caaaaab...',
    '...gggg.....',
    '....gg......',
    '............',
  ],
  /** cabbage, napa: one head, with the folds of its leaves running top to bottom */
  head: [
    '............',
    '....ggg.....',
    '...caaab....',
    '..caabaab...',
    '.caaabaaab..',
    '.caaabaaab..',
    '.caaabaaab..',
    '.caaabaaab..',
    '..caabaab...',
    '...cbbbb....',
    '............',
    '............',
  ],
  /** broccoli, cauliflower, romanesco: a bumpy curd on a stalk */
  floret: [
    '............',
    '..aa..aa....',
    '.caaabaaab..',
    'caaaaaaaaab.',
    'caaaaaaaaab.',
    '.caaaaaaab..',
    '..cbaaabb...',
    '....ggg.....',
    '....ggg.....',
    '...gggg.....',
    '............',
    '............',
  ],
  /** carrot, parsnip: the shape a child draws, tops and all */
  taproot: [
    '..g......g..',
    '..gg....gg..',
    '...gg.ggg...',
    '....gggg....',
    '..caaaaab...',
    '..caaaaab...',
    '...caaab....',
    '...caaab....',
    '....cab.....',
    '....cab.....',
    '.....b......',
    '............',
  ],
  /** beet, turnip, radish, celeriac: round below, leaves above */
  'round-root': [
    '..g.g..g.g..',
    '..gg.gg.gg..',
    '...ggggg....',
    '....ggg.....',
    '..caaaab....',
    '.caaaaaab...',
    '.caaaaaab...',
    '..caaaab....',
    '...caab.....',
    '....bb......',
    '.....b......',
    '............',
  ],
  /** potato, sweet potato, sunchoke: a lump out of the ground, with its eyes */
  tuber: [
    '............',
    '............',
    '...ccaab....',
    '..caaaaab...',
    '.caabaaaab..',
    '.caaaaabab..',
    '.caabaaaab..',
    '..caaaaab...',
    '...cbbbb....',
    '............',
    '............',
    '............',
  ],
  /** onion, garlic, shallot: round at the base, drawn in at the neck, shoots on top */
  bulb: [
    '.....g......',
    '..g..g..g...',
    '...g.g.g....',
    '....ggg.....',
    '...caaab....',
    '..caaaaab...',
    '.caaaaaaab..',
    '.caaaaaaab..',
    '..caaaaab...',
    '...cbbbb....',
    '............',
    '............',
  ],
  /** leek, celery, asparagus, rhubarb: what is eaten is the stalk, so the stalk is the drawing */
  stalks: [
    '...g.g.g....',
    '..gg.g.gg...',
    '..ag.g.ga...',
    '..agagaga...',
    '..aaaaaaa...',
    '..caabaac...',
    '..caabaac...',
    '..caabaac...',
    '..caabaac...',
    '..cbbbbbc...',
    '............',
    '............',
  ],
  /** beans and peas: a pod with the seeds showing through it */
  pod: [
    '............',
    '.........gg.',
    '........gg..',
    '.......ab...',
    '......cab...',
    '.....caab...',
    '....caab....',
    '...caab.....',
    '..caab......',
    '..cab.......',
    '..bb........',
    '............',
  ],
  /** currants, raspberry, grape, elderberry: several small fruits, and the gaps say so */
  'berry-cluster': [
    '.....g......',
    '....gg.g....',
    '...g.ggg....',
    '..caab.aab..',
    '..caab.caab.',
    '...bb...bb..',
    '....caab....',
    '....caab....',
    '.....bb.....',
    '............',
    '............',
    '............',
  ],
  /** the one crop with a class to itself: wide at the shoulders, pointed at the tip */
  'berry-heart': [
    '............',
    '...g.g.g....',
    '..gggggg....',
    '.caacaaab...',
    'caaaaaaaab..',
    'caacaaacab..',
    '.caaaaaab...',
    '.caacaaab...',
    '..caaaab....',
    '...caab.....',
    '....b.......',
    '............',
  ],
  /** wheat, oats, quinoa, sorghum: a stalk carrying its grain in pairs */
  ear: [
    '.....a......',
    '....aba.....',
    '...aabaa....',
    '...aabaa....',
    '...aabaa....',
    '....aba.....',
    '....aba.....',
    '.....b......',
    '....gb.g....',
    '.....b......',
    '.....b......',
    '.....b......',
  ],
  /** sweet corn: a cob in its husk, kernels showing */
  cob: [
    '.......g....',
    '...g...g....',
    '...gcaab....',
    '...gcaab....',
    '..ggcabab...',
    '..ggcaaab...',
    '...gcabab...',
    '...gcaaab...',
    '....cabab...',
    '....cbbb....',
    '............',
    '............',
  ],
  /** ryegrass, napier, chives: a tuft, because a sward is not a plant */
  grass: [
    '............',
    '.g........g.',
    '.g...g...g..',
    '..g..g..gg..',
    '..g..g..g...',
    '..gg.g.gg...',
    '...g.g.g....',
    '...g.g.g....',
    '....ggg.....',
    '....ggg.....',
    '.....g......',
    '............',
  ],
  /** basil, mint, sage: a sprig, which is how a herb is picked and how it is drawn */
  'herb-sprig': [
    '............',
    '.....g......',
    '...aaba.....',
    '..aaabaa....',
    '...aabaa....',
    '.....b......',
    '..aaabaaa...',
    '.aaaabaaaa..',
    '..aaabaaa...',
    '.....b......',
    '.....b......',
    '.....b......',
  ],
  /** marigold, calendula, borage, clover: the flower is the point of these */
  flower: [
    '............',
    '....aaa.....',
    '...aaaaa....',
    '..aacbcaa...',
    '..aacccaa...',
    '..aacbcaa...',
    '...aaaaa....',
    '.....g......',
    '.....g......',
    '....gg......',
    '.....g......',
    '............',
  ],
  /** hazelnut, peanut: a shell, drawn as the thing you crack */
  nut: [
    '............',
    '.....gg.....',
    '....gg.g....',
    '...caaab....',
    '..caaaaab...',
    '..caabaab...',
    '..caabaab...',
    '..caaaaab...',
    '...cbbbb....',
    '............',
    '............',
    '............',
  ],
} as const satisfies Record<string, readonly string[]>

export type FormKey = keyof typeof SPRITE_FORMS
