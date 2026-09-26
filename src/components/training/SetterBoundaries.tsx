import { ClipboardCheck, HandCoins, ShieldAlert, Target } from "lucide-react";
import { PanelSection } from "@/components/training/PanelSection";

/**
 * What a setter does and does not do. The failure mode for a new setter is not
 * being too timid — it is answering a question they were not equipped to answer
 * and burning the meeting before it happens.
 */

const HAND_TO_CLOSER: { question: string; whyNotYou: string }[] = [
  {
    question: '"How much does it cost?"',
    whyNotYou:
      "Price depends on the service, the spend and what we find in their account. A number quoted on a cold call becomes the number they hold us to, and it is almost always the wrong one.",
  },
  {
    question: '"How much do I need to spend on ads?"',
    whyNotYou: "Depends entirely on their market, job value and capacity. Guessing here sets a budget expectation nobody can meet.",
  },
  {
    question: '"Am I locked into a contract?"',
    whyNotYou:
      "The honest answer is no, month to month. You can say that much because it is true and it is the single most reliable thing we say. Anything past that — notice, terms, what happens to the assets — goes to Bede.",
  },
  {
    question: '"Can you guarantee me X leads?"',
    whyNotYou: "No, and the guarantee we do offer has structure to it. Promising a lead count is the fastest way to lose a client at the contract stage.",
  },
  {
    question: '"How does the tracking actually work?"',
    whyNotYou: "It is genuinely the strongest part of the pitch and it deserves a screen share, not thirty seconds on a mobile while they are on a roof.",
  },
  {
    question: '"What results have you got for someone like me?"',
    whyNotYou:
      "You may say we work with a lot of trade businesses and that Bede will walk them through real dashboards. Do not quote a number. If you cannot picture the screenshot it came from, it does not leave your mouth.",
  },
  {
    question: '"What exactly do you do — SEO, Google, Meta?"',
    whyNotYou:
      "A one-sentence answer is fine, and the Services tab has it. A full explanation is not your job and it invites four more questions you cannot win.",
  },
];

const HARD_RULES: { rule: string; detail: string }[] = [
  {
    rule: "If they ask to be removed, remove them",
    detail:
      "Mark Do Not Call immediately, no second attempt, no persuading, no \"just one quick thing\". This is a legal obligation under the Do Not Call Register Act, not a judgement call and not a negotiation. It is the one thing on this page that can land the business in trouble rather than just cost you a call.",
  },
];

const CAPTURE: { field: string; why: string }[] = [
  { field: "Who you actually spoke to, and their role", why: "Bede needs to know if he is walking into a call with the decision maker or a foreman." },
  { field: "The trade and the work they want more of", why: "Switchboards, hot water, emergency, commercial. This is what the whole conversation hangs off." },
  { field: "Whether anyone is already doing their marketing, and who", why: "The strongest buying signal we have. Capture the agency name and anything they said about how it is going." },
  { field: "What they complained about, in their words", why: "Not your summary. Their phrasing. It is what Bede opens with." },
  { field: "Team size and whether the owner is on the tools", why: "Determines which of the four segments they are and therefore what actually sells them." },
  { field: "Anything time-bound they mentioned", why: "A quiet season, a van arriving, a tradie leaving. These are the reasons a meeting gets kept." },
];

export function SetterBoundaries() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">Your job is the meeting, not the sale</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          You are booking a qualified conversation into Bede's calendar. That is the whole job. The most common way a
          new setter loses a good lead is not nerves — it is answering a question they were not equipped to answer, and
          giving the prospect a number or a promise to argue with before the real conversation has started.
        </p>
      </div>

      <PanelSection
        icon={HandCoins}
        title="Questions that are Bede's, not yours"
        description="Hand these over without apology. Handing them over is the professional answer, not a dodge."
      >
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-primary">The handoff line</p>
          <p className="mt-0.5 text-sm font-medium">
            "Honestly, that's exactly what Bede will go through with you — he'll have your account open on the screen.
            I'd give you the wrong answer. Are you better Tuesday morning or Thursday?"
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            It defers, gives a reason the deferral is in their interest, and closes for the time in one breath.
          </p>
        </div>
        <div className="space-y-2">
          {HAND_TO_CLOSER.map((q) => (
            <div key={q.question} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-sm font-medium">{q.question}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{q.whyNotYou}</p>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={ShieldAlert}
        title="The one hard rule"
        description="Everything else on this page is guidance you can use your judgement on. This one is not."
      >
        <div className="space-y-2">
          {HARD_RULES.map((r) => (
            <div key={r.rule} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-sm font-medium text-destructive">{r.rule}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{r.detail}</p>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={ClipboardCheck}
        title="What to capture before you hang up"
        description="A booked meeting with no notes is half a booked meeting."
      >
        <div className="space-y-1.5">
          {CAPTURE.map((c) => (
            <div key={c.field} className="flex flex-wrap items-baseline gap-x-2 border-b border-border/50 py-1.5">
              <span className="text-sm font-medium">{c.field}</span>
              <span className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1">{c.why}</span>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={Target}
        title="What a good booking looks like"
        description="Volume is not the measure. A meeting Bede can walk into prepared is."
      >
        <div className="space-y-1.5 text-sm">
          <p>
            <span className="font-medium">The right person agreed to a specific time.</span>{" "}
            <span className="text-muted-foreground">Not "sometime next week", and not the office manager agreeing on the owner's behalf.</span>
          </p>
          <p>
            <span className="font-medium">They know what the meeting is for.</span>{" "}
            <span className="text-muted-foreground">A prospect who is surprised to be on the call is a no-show waiting to happen.</span>
          </p>
          <p>
            <span className="font-medium">There is a reason in their own words.</span>{" "}
            <span className="text-muted-foreground">Something they said they wanted or were sick of. That sentence is what makes them keep the appointment.</span>
          </p>
          <p>
            <span className="font-medium">Nothing was promised that Bede has to walk back.</span>{" "}
            <span className="text-muted-foreground">No price, no lead count, no timeline.</span>
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
