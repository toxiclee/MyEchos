export type MemoryId =
  | "bed"
  | "desk"
  | "openCloset"
  | "wallMemory1"
  | "wallMemory2"
  | "wallMemory3"
  | "window"
  | "cableNest"
  | "monitor"
  | "keyboard"
  | "guitar"
  | "hoodie"
  | "photoFrame"
  | "deskLamp"
  | "mirror"
  | "legoSouvenirs"
  | "shidizai"
  | "wardrobe"
  | "stickyWall"
  | "sofa"
  | "chair";

export type MemoryEcho = {
  id: MemoryId;
  title: string;
  note: string;
  /** Short scrap (1–2 lines max) for the tiny paper + typewriter. */
  echo: string;
};

export const MEMORIES: MemoryEcho[] = [
  {
    id: "bed",
    title: "The narrow bed you actually slept in",
    note: "Soft enough to make the world feel quieter.",
    echo: "Soft enough to make the world feel quieter.",
  },
  {
    id: "desk",
    title: "The L-desk where everything piled up",
    note: "That night, we sat here together and rewatched Titanic.",
    echo: "That night, we sat here together and rewatched Titanic.",
  },
  {
    id: "openCloset",
    title: "The closet you left half-open",
    note:
      "Shirts breathing on the rod, a sweater sliding off its hanger — " +
      "proof you were in a hurry and still came back soft.",
    echo: "Hangers askew —\nI was soft, in a hurry.",
  },
  {
    id: "wallMemory1",
    title: "A frame on the long wall",
    note: "Light caught the edge; you meant to straighten it and never did.",
    echo: "Crooked on purpose —\nmy own horizon.",
  },
  {
    id: "wallMemory2",
    title: "Another still you kept in view",
    note: "Not for visitors — for mornings when you forgot who you were.",
    echo: "Morning glue —\none honest rectangle.",
  },
  {
    id: "wallMemory3",
    title: "The smallest print, loudest pull",
    note: "A thumbnail of a whole season, pinned where only you looked.",
    echo: "Season in a square —\nI looked every day.",
  },
  {
    id: "window",
    title: "The first line of morning",
    note: "The first line of morning sunlight always reached here first.",
    echo: "The first line of morning sunlight always reached here first.",
  },
  {
    id: "cableNest",
    title: "The knot under the desk",
    note: "Chargers, adapters, good intentions — democracy of copper and plastic.",
    echo: "Copper democracy —\nwe charged anyway.",
  },
  {
    id: "monitor",
    title: "The glow you stared into too long",
    note:
      "Essays, FaceTimes, midnight edits. The screen held versions of you " +
      "that never quite matched the quiet of the room.",
    echo: "The glow knew me —\nthe room stayed quiet.",
  },
  {
    id: "keyboard",
    title: "The keys you tapped when words wouldn’t come",
    note:
      "Plastic hush, a little shine worn off the home row. Each letter was a small promise " +
      "to future-you who might read it and feel less alone.",
    echo: "Home row worn smooth —\nletters to future-me.",
  },
  {
    id: "guitar",
    title: "The guitar that learned your moods",
    note:
      "Out of tune on purpose sometimes. You played softly so the hall " +
      "wouldn't know how loud your heart was.",
    echo: "Played soft —\nso the hall wouldn't hear.",
  },
  {
    id: "photoFrame",
    title: "The still you taped to the wall of your mind",
    note:
      "Not the whole story — a doorway back. Whoever you let in might notice it first.",
    echo: "Not the whole story —\njust a door ajar.",
  },
  {
    id: "deskLamp",
    title: "A smaller sun for late ideas",
    note:
      "When the quad went dark, this circle stayed kind. Tea cooling, cursor blinking — " +
      "you weren’t alone, exactly.",
    echo: "3:14 AM —\nkept the light; the room was too quiet.",
  },
  {
    id: "mirror",
    title: "Silver honest in the morning",
    note:
      "You learned your face in this light: softer, stranger, still yours. " +
      "A quiet rehearsal before stepping out.",
    echo: "This light —\nsofter, stranger, still mine.",
  },
  {
    id: "legoSouvenirs",
    title: "Tiny colors from bigger places",
    note:
      "Bricks, shells, a ticket stub — proof you belonged to more than one geography. " +
      "They huddled together like a secret vocabulary.",
    echo: "Bricks & stubs —\na secret map of places.",
  },
  {
    id: "shidizai",
    title: "The little one who stayed when the room emptied",
    note:
      "Not loud enough to claim a shelf — just present, a quiet witness to drafts and half-slept nights. " +
      "You set them down like a promise to remember who you were between versions.",
    echo: "Still here —\nmy quiet witness.",
  },
  {
    id: "wardrobe",
    title: "The tall door you opened slowly",
    note:
      "Coats, formal things, a dress you almost wore. The wood smelled like varnish " +
      "and decisions postponed until Friday.",
    echo: "Varnish & hems —\nFriday could wait.",
  },
  {
    id: "stickyWall",
    title: "Paper constellations",
    note:
      "Reminders, jokes, a phone number in soft pencil. The wall became a gentle map " +
      "of who you were trying to become.",
    echo: "Soft pencil, half jokes —\nwho I was becoming.",
  },
  {
    id: "chair",
    title: "The chair that caught you",
    note:
      "Plastic squeak, sweater bunched on the back. You spun once when no one was looking, " +
      "grinning at your own reflection in the dark screen.",
    echo: "Spun once, alone —\ngrinning at a dark screen.",
  },
  {
    id: "sofa",
    title: "The sofa where evenings softened",
    note: "A place to sink into after long days, where conversation felt lighter and time moved slower.",
    echo: "Evening sank in —\nso did I.",
  },
];

export const MEMORY_BY_ID = Object.fromEntries(MEMORIES.map((m) => [m.id, m])) as Record<
  MemoryId,
  MemoryEcho
>;

/** Stable iteration order for scene layout / visibility. */
export const ALL_MEMORY_IDS: MemoryId[] = MEMORIES.map((m) => m.id);
