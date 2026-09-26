import { BadgeCheck, CircleHelp, FlaskConical, Phone, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";

/**
 * The first fifteen seconds of a cold call, measured against Odin's OWN
 * cold-dial recordings — not the 72 booked sales calls, which are a different
 * kind of conversation.
 *
 * Corpus: 436 Dialpad cold calls with a real two-way conversation (>=15s talk
 * time, prospect audible), of which 29 booked. Baseline book rate 6.7%.
 *
 * Bede's own lines below are reconstructed from transcripts that the speech
 * engine mangled ("it's pai from ode" = "it's Bede from Odin"). Prospect lines
 * are quoted as captured, which is where the engine is most reliable.
 */

/** Signals measured in the FIRST 900 characters of each transcript, so a long
 *  call cannot inflate a match. */
const OPENING_SIGNALS: { signal: string; booked: string; notInterested: string; verdict: string; noise: boolean }[] = [
  {
    signal: '"Sorry, who?" / "From where?"',
    booked: "31%",
    notInterested: "30%",
    verdict: "Noise. Identical on calls that booked and calls that died. Not rejection — they genuinely did not catch it.",
    noise: true,
  },
  {
    signal: '"I don\'t remember you" / "Not really"',
    booked: "28%",
    notInterested: "26%",
    verdict: "Noise. Happens on more than a quarter of calls that went on to book. It is a neutral state, not an objection.",
    noise: true,
  },
  {
    signal: 'Company name landed intact: "Odin Digital"',
    booked: "83%",
    notInterested: "0%",
    verdict: "The only opening variable that separates outcomes. 24 calls in the entire corpus have it; all 24 booked.",
    noise: false,
  },
];

const THE_OPENER: { beat: string; say: string; note: string }[] = [
  {
    beat: "1. Name and company, fully",
    say: '"Hey [first name], it\'s Ben from Odin Digital. How you been?"',
    note: "Three tokens, unhurried: Ben / from / Odin Digital. Do not shorten it to \"Ben from Odin\" and do not run it into the next sentence. This is the one thing in the data that tracks with booking.",
  },
  {
    beat: "2. Expect to say it twice",
    say: '"It\'s Ben, from Odin Digital."',
    note: "Roughly a third of prospects ask again regardless of how clearly you say it. Repeat it flat and unbothered. Do not apologise, do not speed up, do not treat it as a bad sign.",
  },
  {
    beat: "3. Reason for the call",
    say: '"I gave you a call back in [month] now, just around doing a bit of advertising for the business. Do you remember speaking with me?"',
    note: "Say it like a fact you are recalling, not a question you are hoping lands. Rushing it or going up at the end is what makes people suspicious, not the content. Expect a no — a no here is normal and the next beat handles it.",
  },
  {
    beat: "4. Absorb the no in half a sentence",
    say: '"Fair enough mate, I hardly remember what I had for breakfast, let alone a phone call."',
    note: "Never re-explain who you are. Never defend the call. Self-deprecation is the move that appears in the booked calls.",
  },
  {
    beat: "5. The pivot, then stop talking",
    say: '"Anyway, I just had it in my calendar to reach back out and see how things have been going with the business."',
    note: "In 28% of booked openings versus 4% of the calls that ended in a do-not-call. Then SHUT UP. The prospect filling that silence is the whole point — one answered it with \"we just lost a tradie today\" and that became the meeting.",
  },
];

export function ColdCallOpener() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">The first fifteen seconds</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Measured against 436 of our own recorded cold dials, 29 of which booked. This is not the booked-sales-call
          research — that is a different conversation with a warmer person. Everything here is what happens when you
          ring someone who was not expecting you.
        </p>
      </div>

      <PanelSection
        icon={CircleHelp}
        title="Two things that feel like failure and are not"
        description="Measured in the first 900 characters of each transcript, so a long call cannot inflate a match."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <th className="py-1.5 pr-3">Signal in the opening</th>
                <th className="py-1.5 pr-3">Booked</th>
                <th className="py-1.5 pr-3">Died</th>
                <th className="py-1.5">Read</th>
              </tr>
            </thead>
            <tbody>
              {OPENING_SIGNALS.map((s) => (
                <tr key={s.signal} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-3 font-medium">{s.signal}</td>
                  <td className="py-2 pr-3 font-mono text-emerald-700 dark:text-emerald-300">{s.booked}</td>
                  <td className="py-2 pr-3 font-mono text-muted-foreground">{s.notInterested}</td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {s.noise && <Badge variant="outline" className="mr-1.5 border-border font-mono text-[9px] uppercase">noise</Badge>}
                    {s.verdict}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          New setters hear "sorry, who?" and read it as the call going badly, then start talking faster to recover.
          It is not going badly. Nearly a third of the calls that ended in a booked meeting contain exactly that
          question. Slow down and say the name again.
        </p>
      </PanelSection>

      <PanelSection
        icon={BadgeCheck}
        title="Say the full company name"
        description="The single cleanest separator in the data, and the cheapest thing on this page to act on."
      >
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-sm">
            Across every cold call we have recorded, the opening contains the words{" "}
            <span className="font-semibold">"Odin Digital"</span> exactly 24 times.{" "}
            <span className="font-semibold">All 24 booked.</span> In the other 412 calls the recording caught a
            fragment — "Bede from ode", "from audem", "from mo" — and none of those booked.
          </p>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Honest caveat:</span> this is correlation on a small
          success sample, and part of what the recording captures is audio clarity rather than word choice. It is
          entirely possible that clear audio and a call that goes well share a common cause. But the effect is the
          cleanest in the dataset, saying your company name properly costs nothing, and the alternative — a prospect
          who never learns who is calling — has no upside.
        </p>
      </PanelSection>

      <PanelSection
        icon={Timer}
        title="The opener, beat by beat"
        description="Five beats. The whole thing should take under fifteen seconds before the prospect is doing the talking."
      >
        <div className="space-y-2">
          {THE_OPENER.map((b) => (
            <div key={b.beat} className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-primary">{b.beat}</p>
              <p className="mt-1 text-sm font-medium">{b.say}</p>
              <p className="mt-1 text-xs text-muted-foreground">{b.note}</p>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection
        icon={FlaskConical}
        title="The opener is a re-dial opener. Know what that means."
        description="It shapes which leads you should be working, and it tells you exactly what pushback to expect."
      >
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p>
            Of 436 recorded cold calls, <span className="font-semibold">330 open with the re-dial line</span>. Only{" "}
            <span className="font-semibold">3</span> opened as a stated first contact, and none of those booked. Every
            one of our 24 booked cold calls used the re-dial opener.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            So the script is proven, and it is proven in this exact form. What we have no data on is how it performs on
            a lead nobody has ever rung — almost our entire corpus was genuine callbacks. You will be the first real
            read on that, which is another reason the stage ticks matter.
          </p>
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          <p className="font-medium">Work the re-dial pool first</p>
          <p className="text-muted-foreground">
            Just under 4,000 leads have 1 to 9 previous attempts and are sitting under-worked. Those are the calls this
            opener was built on and where it is most likely to land. There are also 27,879 never-called leads — get to
            them, but start where the evidence is.
          </p>
        </div>

        <div className="mt-3 rounded-md border border-primary/25 bg-primary/5 p-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-primary">If they push back hard</p>
          <p className="mt-1 text-sm">
            Occasionally you will get a proper challenge:{" "}
            <span className="italic">"I don't know you, you're calling me like I know you."</span> The mistake is
            arguing the point — on the one recording where that happened, the rep defended it and lost the call.
          </p>
          <p className="mt-1.5 text-sm font-medium">
            "Might've been one of the boys, mate — we've got a few here. Either way, I just had it in the calendar to
            see how things have been going. How's business?"
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Concede the ground, do not defend it, and get straight back to the pivot. The call is about their business,
            not about who rang who in December.
          </p>
        </div>
      </PanelSection>

      <PanelSection
        icon={Phone}
        title="Why the numbers on this page are small"
        description="So you can weigh them yourself."
      >
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>436 cold calls with a real two-way conversation. 29 booked, a 6.7% baseline.</p>
          <p>
            Anything below roughly 20 calls is a hint, not a finding, and is labelled with its sample size where it
            appears. Percentages are computed on the first 900 characters of each transcript so that a twelve-minute
            call cannot out-match a forty-second one.
          </p>
          <p>
            Bede's lines are reconstructed from mangled speech-to-text. Prospect lines are quoted as captured.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
