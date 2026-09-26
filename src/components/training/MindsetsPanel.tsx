import { Brain, Flame, HardHat, Ban, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";

/**
 * Mindset before archetype.
 *
 * A mindset is what they believe about growth right now. It is the single
 * biggest determinant of whether a call goes anywhere, and it is knowable in
 * the first thirty seconds. Archetype (who they are) is secondary and mostly
 * tells you which words to use.
 */

interface Mindset {
  n: number;
  name: string;
  who: string;
  tells: string[];
  believes: string;
  approach: string;
  opens: string;
  kills: string;
  worth: "high" | "medium" | "low";
}

const MINDSETS: Mindset[] = [
  {
    n: 1,
    name: "Wants to grow",
    who: "Often newer to running their own show. Has not been burnt much yet, sometimes not at all.",
    tells: [
      "Talks about putting a van on, or another bloke",
      "Answers questions openly instead of guarding",
      "Has not got much running, or has just started dabbling",
      "Asks you questions back",
    ],
    believes: "More work is good. Marketing probably works, they just have not got to it.",
    approach:
      "The easiest of the three and the one you will convert most. Do not oversell it. They are not sceptical, so you do not need to overcome anything — just be specific about what the meeting is and lock the time.",
    opens: '"In an ideal world, would you be on the tools or off the tools?" — they will tell you the whole plan.',
    kills:
      "Pitching too hard. They were already open, and a heavy pitch makes them wonder what the catch is. Also promising a result: they have no scar tissue, so they will believe you, and then you own it.",
    worth: "high",
  },
  {
    n: 2,
    name: "Tried, and got burnt",
    who: "A few years in. Has paid for marketing before and got nothing. Either still pushing or quietly winding down.",
    tells: [
      "Brings up the last mob unprompted, usually within thirty seconds",
      "Names amounts — \"eight grand\", \"seventeen grand down the drain\"",
      "Flat, tired delivery rather than hostile",
      "\"I've heard it all before\" / \"you blokes all say the same thing\"",
    ],
    believes: "Marketing works for someone, but not for them, and probably nobody can be trusted with it.",
    approach:
      "The biggest group and the one with the most upside, because they have already proven they will spend money on growth. Do not defend the industry and never bag the last mob. Agree it happens constantly, then get curious about what they were actually promised versus what showed up.",
    opens: '"Have you had anyone run ads or SEO for you before, and how did that go?" — then say nothing.',
    kills:
      "Sympathy on its own. \"I can imagine\" softens a burn but has never cleared one in our recordings. What clears it is something structural they can check — no lock-in, they own the accounts, they see the numbers. Also: arguing that we are different. Everyone says that.",
    worth: "high",
  },
  {
    n: 3,
    name: "Happy where they are",
    who: "Often heavily commercial, or a deliberate one-man operation. Frequently a genuine no.",
    tells: [
      "\"Chipping away\" / \"ticking over\" / \"happy to cruise\"",
      "Most or all work from one or two builders, or a contract",
      "\"I don't want the empire\" / \"I've got enough on\"",
      "No interest in another bloke, ever",
    ],
    believes: "Growth is somebody else's goal. More work would be a problem, not a win.",
    approach:
      "Two of these are real and one is not. A deliberate lifestyle operator is a genuine no — mark it and move on, you are burning dials. But a commercial operator with everything riding on one or two builders is not happy, he is exposed, and he often has not framed it that way. That is the only version worth a second question.",
    opens: '"Is most of the work coming through the one builder, or have you got a few on the go?"',
    kills:
      "Pitching growth. To a lifestyle operator it reads as not listening, and to a commercial operator it misses the actual problem, which is concentration risk and cash flow, not volume.",
    worth: "low",
  },
];

const WORTH_STYLES: Record<Mindset["worth"], { label: string; cls: string }> = {
  high: { label: "work it", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  medium: { label: "worth a go", cls: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  low: { label: "usually a no", cls: "border-border bg-muted/50 text-muted-foreground" },
};

interface Archetype {
  name: string;
  profile: string;
  usualMindset: string;
  language: string;
  watch: string;
}

const ARCHETYPES: Archetype[] = [
  {
    name: "The young hustler",
    profile:
      "Started recently, often in their twenties. Working long hours, chasing everything, probably undercharging. Might have an ABN and a ute and not much else.",
    usualMindset: "Almost always mindset 1 — wants to grow, not burnt yet.",
    language:
      "Talk about getting the phone ringing and putting on their first bloke. Do not talk about systems, funnels or scale. Money is tight, so the meeting has to sound free and useful on its own.",
    watch:
      "Easy to book and easy to lose. They will say yes to the meeting because they say yes to everything. Lock the commitment properly or they will not turn up.",
  },
  {
    name: "The few-years-in operator",
    profile:
      "Three to ten years in, a couple of blokes on. Has a website, probably has someone doing SEO or the Google profile, and cannot tell you whether any of it works. Has been burnt at least once.",
    usualMindset: "Usually mindset 2 — tried, got burnt, still wants it to work.",
    language:
      "Say Google profile, not GBP or GMB. Say the map listing if they look blank. Spell out any acronym — every shortened term got garbled back at us in the recordings.",
    watch:
      "This is the biggest and most valuable group on the phones. They have money, they have proven they will spend it, and they have a specific grievance you can get them talking about.",
  },
];

const GMB_EXPLAINER: { q: string; a: string }[] = [
  {
    q: "What is a Google Business Profile?",
    a: "The free listing that shows up on Google Maps and in the box on the right when someone searches a business name. It carries the phone number, hours, service area, photos and reviews. Used to be called Google My Business, which is why half of them still say GMB.",
  },
  {
    q: "Why a tradie cares",
    a: "For emergency and near-me searches it is often the first thing a customer taps, ahead of any website. The calls come straight off it. A tradie with no profile, or one with three reviews and no photos, is invisible for exactly the jobs that pay best.",
  },
  {
    q: "What 'someone is doing my Google' usually means",
    a: "Someone is posting updates to the profile and maybe chasing reviews. It is real work and it does help, but it is not ads and it is not a website. Plenty of them think they are advertising when they are not.",
  },
  {
    q: "How to use it on a call",
    a: "\"Is the Google profile something you set up yourself, or has someone been looking after it?\" It is factual, easy to answer, and it tells you immediately whether anyone is actually running anything.",
  },
];

export function MindsetsPanel() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">Three mindsets, and you can pick them inside thirty seconds</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Mindset is what they believe about growth right now, and it decides whether the call goes anywhere. It is not
          the same as who they are — a twenty-five-year-old and a fifty-year-old can hold the same mindset and need the
          same call. Read the mindset first, then adjust the words for the archetype.
        </p>
      </div>

      <PanelSection
        icon={Brain}
        title="The three mindsets"
        description="Listen for the tells before you decide which conversation you are in."
      >
        <div className="space-y-2.5">
          {MINDSETS.map((m) => {
            const w = WORTH_STYLES[m.worth];
            return (
              <div key={m.n} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-border font-mono text-[9px]">{m.n}</Badge>
                  <span className="text-sm font-semibold">{m.name}</span>
                  <Badge variant="outline" className={`font-mono text-[9px] uppercase ${w.cls}`}>{w.label}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{m.who}</p>

                <div className="mt-2 flex flex-wrap gap-1">
                  {m.tells.map((t) => (
                    <Badge key={t} variant="outline" className="border-border bg-muted/40 font-normal text-[11px]">{t}</Badge>
                  ))}
                </div>

                <p className="mt-2 text-xs">
                  <span className="font-medium text-foreground">What they believe: </span>
                  <span className="text-muted-foreground">{m.believes}</span>
                </p>
                <p className="mt-1 text-sm">{m.approach}</p>
                <p className="mt-1.5 border-l-2 border-primary/50 pl-2 text-sm font-medium">{m.opens}</p>
                <p className="mt-1.5 text-xs">
                  <span className="font-medium text-destructive">What kills it: </span>
                  <span className="text-muted-foreground">{m.kills}</span>
                </p>
              </div>
            );
          })}
        </div>
      </PanelSection>

      <PanelSection
        icon={Ban}
        title="Telling a real no from a lazy no"
        description="Mindset 3 is where you will waste the most time if you cannot split it."
      >
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-sm font-medium text-destructive">Real no — mark it and move</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Deliberate one-man operation, says plainly they do not want more, no interest in hiring ever. They are not
              being difficult, they have made a choice. Grinding these costs you the dials that pay.
            </p>
          </div>
          <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2">
            <p className="text-sm font-medium text-sky-700 dark:text-sky-300">Worth one more question</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Commercial operator whose work all comes from one or two builders. He sounds settled but he is exposed,
              and he usually has not put it in those words. Ask how much of the work is the one builder.
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Also worth remembering: "I'm all good at the moment" books at exactly the baseline rate. It is a reflex, not a
          mindset. Do not file someone into mindset 3 on the strength of the first thing they say.
        </p>
      </PanelSection>

      <PanelSection
        icon={HardHat}
        title="Archetypes"
        description="Who they are. Changes the words, not the strategy — the mindset already set the strategy."
      >
        <div className="space-y-2">
          {ARCHETYPES.map((a) => (
            <div key={a.name} className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-semibold">{a.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{a.profile}</p>
              <p className="mt-1.5 text-xs">
                <span className="font-medium text-foreground">Usually: </span>
                <span className="text-muted-foreground">{a.usualMindset}</span>
              </p>
              <p className="mt-1 text-xs">
                <span className="font-medium text-foreground">How to talk to them: </span>
                <span className="text-muted-foreground">{a.language}</span>
              </p>
              <p className="mt-1 text-xs">
                <span className="font-medium text-primary">Watch for: </span>
                <span className="text-muted-foreground">{a.watch}</span>
              </p>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={Search}
        title="Google Business Profile, explained"
        description="The few-years-in operator will mention this constantly. You need to know what it actually is."
      >
        <div className="space-y-2">
          {GMB_EXPLAINER.map((g) => (
            <div key={g.q} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-sm font-medium">{g.q}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{g.a}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
          <Flame className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-muted-foreground">
            Say "Google profile" out loud, not GMB or GBP. Every acronym in the recordings got mangled back at us —
            "MetaRads", "ChatGVT". If you shorten it, you lose them, and they will not ask you to explain.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
