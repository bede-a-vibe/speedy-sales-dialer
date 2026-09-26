import { Anchor, Ear, HeartCrack, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";

/**
 * Pain language bank, from 72 recorded discovery and closing calls
 * (3 Mar - 12 Sep 2026). Cluster counts are distinct calls contributing.
 *
 * Filtered for a COLD CALLER. The full bank includes pain a stranger will
 * never admit to in sixty seconds — cash flow, the personal toll, marriage
 * strain. Those are real and they close deals, but they are Bede's on the
 * booked call. Chasing them cold reads as intrusive and ends the call.
 */

type Coldness = "open" | "careful" | "closer";

interface Cluster {
  rank: number;
  name: string;
  calls: number;
  coldness: Coldness;
  hook: string;
  why: string;
  quotes: { text: string; who: string }[];
}

const CLUSTERS: Cluster[] = [
  {
    rank: 1,
    name: "Burned by the last agency",
    calls: 28,
    coldness: "open",
    hook: '"Have you had anyone run ads or SEO for you before, and how did that go?"',
    why:
      "The biggest pain in the corpus and the easiest to open cold. They want to tell you. You are not asking them to admit a weakness, you are inviting them to complain about someone else.",
    quotes: [
      { text: "we've wasted a freaking year. I paid him three different sites, grand and a half each, it's generated not one lead. Hey man, I'm so over it", who: "Empire Electrical, 1 Apr" },
      { text: "it was 10 months down the drain, about 17 grand, and not much in work out of it, very little", who: "Patrick Paglia Electrical, 27 Jul" },
      { text: "they were gatekeeping a lot of information. You ask them a question and then they'd laugh and they'd say, we can't tell you all the secrets", who: "SMA Plumbing, 17 Jul" },
    ],
  },
  {
    rank: 2,
    name: "Feast and famine",
    calls: 19,
    coldness: "open",
    hook: '"Is the work pretty steady, or is it more up and down month to month?"',
    why:
      "Safe to ask a stranger because it is not a failure, it is weather. Almost everyone says up and down, and the moment they do you have a problem to book a meeting about.",
    quotes: [
      { text: "I'm lucky to do one every couple of weeks, or I might do three in one week, or none for three weeks", who: "DK Plumbing, 8 Jul" },
      { text: "when I'm busy, I'm not worried. It's when it gets quiet, you start looking at the numbers", who: "Shaun Electrical, 13 Jul" },
      { text: "this week I'm booked out till Thursday. Next week, I've got nothing scheduled in. It's sort of week to week for me at the moment", who: "Coslec Electrical, 6 Jul" },
    ],
  },
  {
    rank: 3,
    name: "Hipages, Airtasker and tyre kickers",
    calls: 17,
    coldness: "open",
    hook: '"Are you on any of the lead sites — hipages, Airtasker, that sort of thing?"',
    why:
      "The fastest common ground on this page. Almost nobody defends these platforms. Mentioning hipages by name signals you have spoken to people in their trade, which is exactly the credibility a cold caller lacks.",
    quotes: [
      { text: "you're getting 60 credits per job, you'll probably accept 10 of them. You probably won't get one", who: "Shalvin Nadan, 11 Sep" },
      { text: "there's not a lot of room left in it if they're throwing it up for unblock a drain for 60 bucks. Hard to send a bloke out there for 60 bucks. Impossible", who: "William Morrell, 13 Jul" },
      { text: "someone could charge $5 less than you after you spent three phone calls with them, guiding them through options, and they'll just cut you off", who: "Patrick Paglia Electrical, 27 Jul" },
    ],
  },
  {
    rank: 4,
    name: "Owner stuck on the tools",
    calls: 16,
    coldness: "open",
    hook: '"Are you on the tools yourself, or are you running it from the office these days?"',
    why:
      "Factual, easy, and it tells you which of the four segments they are before you ask anything else. Follow with: \"in an ideal world, on the tools or off?\"",
    quotes: [
      { text: "I'm on my phone half the time taking calls. I'm slower than what my apprentice would be on the tools", who: "Shaun Electrical, 13 Jul" },
      { text: "It's in the pipeline, and now I'm on the tools again. It's hard. It's really hard", who: "Revolution Plumbing, 12 Mar" },
      { text: "that's a business owner wearing too many hats", who: "Polarised Electrical, 20 Jul" },
    ],
  },
  {
    rank: 5,
    name: "No idea what's working",
    calls: 14,
    coldness: "careful",
    hook: '"Do you know roughly where your jobs are actually coming from at the moment?"',
    why:
      "Ask it lightly. Asked wrong it sounds like a test they are failing, and a tradie who feels caught out gets defensive. Asked casually it is the most consistent turning point we have.",
    quotes: [
      { text: "I just wouldn't even know if it is on or if it isn't on. It's very difficult for me to find out", who: "Attwood Electrical, on his own ads, 1 Apr" },
      { text: "you should ask me, Joel, how profitable were you last month, and I should be able to go, yep, bank, number. Where I don't. I honestly don't", who: "Hobsons Bay Plumbing, 20 Aug" },
      { text: "So the books in the back end, I got no idea", who: "Atek Electrics, 11 Mar" },
    ],
  },
  {
    rank: 6,
    name: "Doesn't own their own website or accounts",
    calls: 10,
    coldness: "open",
    hook: '"Out of interest, is the website and the Google account in your name, or does the agency hold it?"',
    why:
      "Under-used and very effective. Most do not know the answer, and finding out they might not own their own site is a problem they will want to talk about. It is also factual, so it does not feel like selling.",
    quotes: [
      { text: "It's all set up in your name with your details. So you own it", who: "Bede's answer, which cleared it on the spot" },
      { text: "he might not even be in business anymore. He hasn't even responded", who: "Clayton Bryan, 3 Jun" },
    ],
  },
  {
    rank: 7,
    name: "What if it works and I can't keep up",
    calls: 12,
    coldness: "careful",
    hook: '"If the phone did ring more tomorrow, have you got the capacity to take it on?"',
    why:
      "Sounds like an objection and is actually a buying signal — they are already picturing it working. Do not reassure them. Ask what would have to happen for them to be ready.",
    quotes: [
      { text: "I've had guys sitting around for four weeks", who: "Rapid Plumbing Group, 24 Jul" },
      { text: "if I'm stuck in the office quoting, then obviously they're still capable to do the work", who: "MLW Electrical Solutions, 23 Jun" },
    ],
  },
  {
    rank: 8,
    name: "Locked into a contract",
    calls: 12,
    coldness: "open",
    hook: '"Are you tied into anything at the moment, or is it month to month?"',
    why:
      "Safe, factual, and it sets up the one thing we say that has never been argued with in 20 recorded calls: no lock-in. Do not go further into our terms — that is Bede's.",
    quotes: [
      { text: "they lock you into a contract and you can't cancel it", who: "Shalvin Nadan, 11 Sep" },
      { text: "It's pretty sad with the hipages because I signed up and I'm stuck to them", who: "Shalvin Nadan, 11 Sep" },
      { text: "they wanted you to pay more tiers and higher tiers just to get their SEO. And it was a nightmare", who: "Living Electrical, 10 Jun" },
    ],
  },
  {
    rank: 9,
    name: "Cash flow and getting paid",
    calls: 16,
    coldness: "closer",
    hook: "Do not open this cold.",
    why:
      "Frequent and powerful, but it is money shame. A stranger asking about your bank balance ends the call. If they raise it themselves, acknowledge it and move to the meeting — do not dig, and never discuss our price against it.",
    quotes: [
      { text: "my business bank account teeters between six to three grand", who: "Clayton Bryan, 3 Jun" },
      { text: "two grand a month would sink me", who: "Coslec Electrical, 6 Jul" },
    ],
  },
  {
    rank: 10,
    name: "The personal toll",
    calls: 10,
    coldness: "closer",
    hook: "Never open this cold.",
    why:
      "Weight loss, marriages, working every weekend. This is the deepest pain in the corpus and it is the reason people buy, but it only comes out once trust exists. Cold, it is intrusive and you will lose the call.",
    quotes: [
      { text: "I used to be big, and now I'm just small, so just working too much", who: "Atek Electrics, lost 20kg, 11 Mar" },
      { text: "I need more work or I need a night job. And that's crazy, getting a second job in your own business", who: "Clayton Bryan, 3 Jun" },
    ],
  },
];

const COLDNESS_STYLES: Record<Coldness, { label: string; cls: string }> = {
  open: { label: "safe cold", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  careful: { label: "ask lightly", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  closer: { label: "Bede's, not yours", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
};

export function PainHooks() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">What's actually hurting, and which of it you can ask about</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          From 72 recorded discovery and closing calls, March to September 2026. The counts are how many separate
          businesses raised it. Your job is not to solve any of this on the phone — it is to find one of them, get them
          talking about it in their own words, and book the meeting.
        </p>
      </div>

      <PanelSection
        icon={Ear}
        title="Ten pains, ranked, with the question that opens each"
        description="Judge the badge before the question. Three of these will end a cold call if you reach for them."
      >
        <div className="space-y-2.5">
          {CLUSTERS.map((c) => {
            const s = COLDNESS_STYLES[c.coldness];
            return (
              <div key={c.name} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{c.rank}</span>
                  <span className="text-sm font-semibold">{c.name}</span>
                  <Badge variant="outline" className={`font-mono text-[9px] uppercase ${s.cls}`}>{s.label}</Badge>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">{c.calls} of 72 calls</span>
                </div>
                <p className={`mt-1.5 border-l-2 pl-2 text-sm font-medium ${c.coldness === "closer" ? "border-destructive/50 text-destructive" : "border-primary/50"}`}>
                  {c.hook}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{c.why}</p>
                <div className="mt-2 space-y-1">
                  {c.quotes.map((q) => (
                    <p key={q.text} className="text-xs italic text-muted-foreground">
                      "{q.text}" <span className="not-italic opacity-70">— {q.who}</span>
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </PanelSection>

      <PanelSection
        icon={Anchor}
        title="How to use a hook without interrogating"
        description="One question, then listen. The corpus is full of calls lost by asking a second question too fast."
      >
        <div className="space-y-1.5 text-sm">
          <p>
            <span className="font-medium">One hook per call, not ten.</span>{" "}
            <span className="text-muted-foreground">
              Pick the one that fits what they have already said. Running the list is an interrogation and they will
              feel it.
            </span>
          </p>
          <p>
            <span className="font-medium">Ask, then wait.</span>{" "}
            <span className="text-muted-foreground">
              The single most common coaching note in the call reviews is filling the silence with a story instead of
              waiting. One rep asked the right question, then answered it himself, and the prospect never did.
            </span>
          </p>
          <p>
            <span className="font-medium">Use their words back, not yours.</span>{" "}
            <span className="text-muted-foreground">
              If they say "up and down", the meeting is about it being up and down. Do not translate it into
              "inconsistent lead flow" — that is agency language and it breaks the spell.
            </span>
          </p>
          <p>
            <span className="font-medium">Write down the sentence.</span>{" "}
            <span className="text-muted-foreground">
              Their exact phrasing goes in the notes. It is what Bede opens the meeting with, and it is why they turn up.
            </span>
          </p>
        </div>
      </PanelSection>

      <PanelSection
        icon={Lock}
        title="Two pains you will be tempted by"
        description="Both are near the top of the list by frequency. Both will cost you the call."
      >
        <div className="space-y-2">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-sm font-medium text-destructive">Money and cash flow (16 of 72 calls)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              It is money shame. A stranger asking after their bank balance ends the conversation. If they volunteer it,
              acknowledge and move to the meeting. Never weigh our price against it — you do not have a price to give.
            </p>
          </div>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-sm font-medium text-destructive">The personal toll (10 of 72 calls)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Health, marriages, weekends gone. This is why people actually buy, and it only surfaces once trust exists.
              Reaching for it on a first call is intrusive, and it reads as a technique.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <HeartCrack className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            The rule: cold, you are allowed to ask about their <span className="font-medium text-foreground">business</span>.
            You have not earned the right to ask about their <span className="font-medium text-foreground">life</span>.
            Bede earns that on the booked call.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
