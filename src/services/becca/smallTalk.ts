// Small talk: whole messages that are conversation, not a request.
//
// Checked by the engine before intent matching. Every pattern is anchored to
// the WHOLE message, which is what keeps this from swallowing real asks:
// "hi, can you find nails?" and "how are my reviews?" match nothing here and
// carry on to the capability matcher. No data is read and no app action is
// implied, so none of this belongs in the capability registry.
//
// Answers stay true to the app. "Can I change your name?" gets a plain no,
// because no setting for it exists; "are you a real person?" always says
// she isn't.

import type { BeccaHat } from "./types";

export interface SmallTalkReply {
  content: string;
  /**
   * Which chips go with it: `starters` for an opener (nothing has happened
   * yet), `followUps` once a conversation is under way.
   */
  chips: "starters" | "followUps";
}

type Kind =
  | "rename"
  | "name"
  | "real"
  | "maker"
  | "howAreYou"
  | "moodLow"
  | "moodGood"
  | "compliment"
  | "frustration"
  | "present"
  | "thanks"
  | "bye"
  | "greeting";

const GREETING = "(?:hi|hey|hello|hiya|heya|yo|howdy|hi there|hey there|hello there|morning|good morning|afternoon|good afternoon|evening|good evening)";

// A bare "well" isn't an answer to anything, so it needs "I'm" in front.
const GOOD_MOOD = "(?:good|great|fine|very well|really well|ok|okay|alright|not bad|not too bad|really good|pretty good|very good|all good|grand|lovely|amazing|brilliant|fab|fantastic|wonderful)";

// Order matters only where two could both match the same whole message;
// anchoring keeps that rare. Each pattern runs against apostrophe-free,
// punctuation-free, lower-case text (see `plain`).
const PATTERNS: [Kind, RegExp][] = [
  ["rename", new RegExp(
    "^(?:(?:can|could|may|do) i (?:change|rename|edit|pick|choose|set|give you) (?:your name|you a (?:new |different )?name)" +
    "|(?:can|could|may) i (?:rename|name) you(?: \\w+)?" +
    "|(?:can|could|may) i call you (?:something|anything|someone) else" +
    "|(?:can|could|may) i call you (?!back\\b|later\\b|tomorrow\\b|now\\b)\\w+(?: \\w+)?" +
    "|(?:can|could) (?:you|your name) be (?:renamed|changed|called something else)" +
    "|(?:can|could|will) you change your name" +
    "|how (?:do|can) i (?:change|rename) (?:your name|you)" +
    "|is (?:it possible|there a way) to (?:change|rename) (?:your name|you)" +
    "|i (?:want|would like|wanna) to (?:change|rename) (?:your name|you)" +
    "|change your name|rename you|new name for you)$",
  )],
  ["name", /^(?:whats your name(?: again)?|what is your name(?: again)?|what are you called|what do (?:i|people) call you|what should i call you|tell me your name|your name|who are you|what are you|who is this|who am i (?:talking|speaking) to|are you becca|is your name becca|is it becca|do you have a name)$/],
  ["real", /^(?:are you (?:a )?(?:real|real person|human|person|bot|robot|chatbot|machine|computer|ai|an ai|chatgpt|an assistant|a real human|a human being)|are you real|is this (?:a )?(?:real person|human|bot|robot|ai)|am i (?:talking|speaking|chatting) (?:to|with) (?:a )?(?:real person|human|person|bot|robot|ai|an ai|a machine))$/],
  ["maker", /^(?:who (?:made|built|created|designed|programmed|owns) you|who do you work for|where do you come from)$/],
  ["howAreYou", /^(?:how are you(?: doing| keeping| getting on| feeling)?(?: today| this morning| this afternoon| this evening| tonight)?|how are things|how is it going|hows it going|hows things|hows (?:your|you) day(?: going)?|how is your day(?: going)?|how have you been|how you doing|how do you do|you (?:ok|okay|alright|good|well)|are you (?:ok|okay|alright|good|well|doing ok)|whats up|what is up|sup|wassup|wbu|hru)$/],
  ["moodLow", /^(?:(?:im|i am|im feeling|i am feeling|feeling|honestly|been) )?(?:not (?:great|good|so good|too good|so great|too great|well|ok|okay|amazing)|tired|so tired|exhausted|knackered|stressed|so stressed|sad|down|rubbish|awful|bad|terrible|unwell|poorly|meh|having a (?:bad|rough|long|hard|tough) day|(?:a )?(?:bad|rough|long|hard|tough) day|could be better)(?: thanks| thank you| tbh| honestly)?(?:(?: and| how about| what about)? you| and yourself)?$/],
  ["moodGood", new RegExp(
    "^(?:(?:im|i am|im doing|i am doing|im feeling|i am feeling|doing|feeling|all) (?:well|" + GOOD_MOOD + ")|" + GOOD_MOOD + ")" +
    "(?: thanks| thank you| thx| ty| cheers)?(?:(?: and| how about| what about)? you| and yourself)?$",
  )],
  ["compliment", /^(?:(?:youre|you are) (?:great|amazing|brilliant|the best|so helpful|really helpful|very helpful|helpful|lovely|awesome|fab|fabulous|a star|a legend|so good|so clever|clever|smart|cute|sweet)|good (?:job|bot)|well done|nice one|love you|i love you|love this|i love this|love that|love it|i love it)$/],
  ["frustration", /^(?:(?:youre|you are) (?:useless|stupid|rubbish|dumb|annoying|not helpful|unhelpful|wrong|no help|not listening)|(?:thats|that is) (?:wrong|not right|not it|incorrect|not what i (?:asked|meant|wanted|said))|not what i (?:asked|meant|wanted|said)|you (?:dont|do not|didnt|did not) (?:understand|get it|get me|listen)|(?:this|you) (?:is|are) (?:useless|rubbish)|wrong|no thats wrong|thats not right)$/],
  ["present", /^(?:are you there|you there|anyone there|is anyone there|are you still there|still there|are you awake)$/],
  ["thanks", /^(?:thanks|thank you|thank you so much|thanks so much|thanks a lot|thanks a million|many thanks|cheers|ta|thx|ty|perfect|perfect thanks|lovely thanks|ok thanks|okay thanks|appreciate it|i appreciate it|appreciate that|much appreciated|thats great|thats perfect|thats helpful|thats lovely|thats brilliant|helpful thanks)$/],
  ["bye", /^(?:bye|bye bye|byee|goodbye|good bye|see you|see you later|see you soon|speak soon|talk soon|catch you later|goodnight|good night|night|night night|thats all|thats all thanks|thats it|thats it thanks|im done|im done thanks|all done|ttyl)$/],
  ["greeting", new RegExp(`^${GREETING}$`)],
];

/**
 * The message as the patterns read it: lower case, no apostrophes ("what's"
 * and "whats" are the same ask), punctuation to spaces, text-speak expanded.
 */
function plain(message: string): string {
  return message
    .toLowerCase()
    .replace(/[’‘`']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => TEXT_SPEAK[word] ?? word)
    .join(" ");
}

const TEXT_SPEAK: Record<string, string> = {
  u: "you",
  ya: "you",
  r: "are",
  ur: "your",
  yr: "your",
  iam: "i am",
  // "what is ur nsme" — near-misses of the one word these patterns key on.
  nsme: "name",
  nmae: "name",
  naem: "name",
  anme: "name",
  thnx: "thanks",
  thanx: "thanks",
  tnx: "thanks",
};

/**
 * The ways the same message can be read: as typed, without a leading "hi" (so
 * "hi, how are you?" is the question, not the greeting), and without Becca's
 * own name at either end ("what's your name, Becca?").
 */
function readings(text: string): string[] {
  const out = new Set<string>([text]);
  const withoutGreeting = text.replace(new RegExp(`^${GREETING}(?: becca)?\\s+(?=\\S)`), "");
  for (const t of [text, withoutGreeting]) {
    out.add(t);
    const withoutName = t.replace(/^becca\s+|\s+becca$/g, "").trim();
    if (withoutName) out.add(withoutName);
  }
  // A message that is ONLY her name ("Becca?") is someone getting her attention.
  if (text === "becca") out.add("hi");
  return [...out];
}

function classify(message: string): Kind | null {
  const forms = readings(plain(message));
  for (const [kind, pattern] of PATTERNS) {
    if (forms.some((form) => pattern.test(form))) return kind;
  }
  return null;
}

/** Whether the message ends by asking after her ("…and you?"), as opposed to "…thank you". */
function asksBack(message: string): boolean {
  const text = plain(message).replace(/\s+becca$/, "");
  return !/\bthank you$/.test(text) && /\b(?:you|yourself)$/.test(text);
}

/** Becca's reply to a small-talk message, or null when the message is a real request. */
export function smallTalkReply(message: string, hat: BeccaHat): SmallTalkReply | null {
  const kind = classify(message);
  if (!kind) return null;
  const provider = hat === "provider";

  switch (kind) {
    case "greeting":
      return {
        content: provider
          ? "Hi — I’m here to help you stay on top of your business. What would you like to check?"
          : "Hi — what would you like help with today?",
        chips: "starters",
      };
    case "howAreYou":
      return {
        content: provider
          ? "I’m doing well, thanks for asking! How are you? Whenever you’re ready, I can check your diary, your clients or anything else for the business."
          : "I’m doing well, thanks for asking! How are you? Whenever you’re ready, tell me what you’re looking for and I’ll find it.",
        chips: "starters",
      };
    case "name":
      return {
        content: provider
          ? "I’m Becca, CERVICED’s business assistant. I can help with your diary, clients and business setup."
          : "I’m Becca, CERVICED’s beauty and booking assistant. I can help you find providers and stay on top of your bookings.",
        chips: "starters",
      };
    case "rename":
      return {
        content:
          "There isn’t a way to change my name, I’m afraid — I’ll always be Becca. You don’t need to call me anything, though: just tell me what you need.",
        chips: "starters",
      };
    case "real":
      return {
        content: provider
          ? "I’m not a person — I’m Becca, the assistant built into CERVICED. I answer from what’s in the app, like your diary, clients and business settings."
          : "I’m not a person — I’m Becca, the assistant built into CERVICED. I answer from what’s in the app, like your bookings and providers’ details.",
        chips: "starters",
      };
    case "maker":
      return {
        content: "I was made by the CERVICED team, as part of the app.",
        chips: "starters",
      };
    case "moodGood":
      return {
        content: asksBack(message)
          ? "I’m good too, thanks! What can I help you with?"
          : "Glad to hear it! What can I help you with?",
        chips: "starters",
      };
    case "moodLow":
      return {
        content: "Sorry to hear that — I hope the rest of your day is kinder to you. If there’s anything I can sort out for you, just say.",
        chips: "starters",
      };
    case "compliment":
      return {
        content: "Thank you, that’s kind of you! What else can I help with?",
        chips: "followUps",
      };
    case "frustration":
      return {
        content: provider
          ? "Sorry — I didn’t get that right. Could you ask me again in a few words? For example, “what’s on today?” or “who’s on my waitlist?”"
          : "Sorry — I didn’t get that right. Could you tell me again in a few words? For example, the service you want and the day.",
        chips: "starters",
      };
    case "present":
      return {
        content: "I’m here! What can I help you with?",
        chips: "starters",
      };
    case "thanks":
      return {
        content: provider
          ? "You’re welcome. I’m here whenever you need a hand with the business."
          : "You’re welcome. I’m here whenever you need a hand.",
        chips: "followUps",
      };
    case "bye":
      return {
        content: "Speak soon — I’ll be right here when you need me.",
        chips: "starters",
      };
  }
}
