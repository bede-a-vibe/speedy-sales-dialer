import { BarChart3, ExternalLink, Globe, LineChart, MapPin, Megaphone, MessageCircleQuestion, Phone, Repeat, Search, Split, Users, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PanelSection } from "@/components/training/PanelSection";

/**
 * What Odin sells, written for someone on their first day who has never worked
 * in marketing.
 *
 * Assume zero knowledge. Real quotes from our own recorded calls include "so
 * how does the ads work… I have absolutely no idea" and "I don't actually know
 * what you do, to be honest" — and those are the PROSPECTS. A new setter is
 * often no further ahead, and pretending otherwise is how you end up with
 * someone bluffing to a tradie who has already been burnt once and is
 * listening for exactly that.
 */

/* ---------- 1. The whole thing in one idea ---------- */

const BUCKETS: { n: number; name: string; plain: string; services: string; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    n: 1,
    name: "Catch the people already looking",
    plain:
      "Someone's hot water has just died. They pick up their phone and search. Whoever is at the top gets the call. This is where most of a tradie's good work comes from, and it is where nearly everything we do sits.",
    services: "Google Ads · SEO · Google profile",
    icon: Search,
  },
  {
    n: 2,
    name: "Get in front of people who aren't looking yet",
    plain:
      "Nobody wakes up wanting a new switchboard. But if they have seen the name around, they think of it when the time comes. Slower, softer, and useless for emergencies.",
    services: "Meta ads (Facebook and Instagram)",
    icon: Users,
  },
  {
    n: 3,
    name: "Stop the ones you already get from leaking",
    plain:
      "The cheapest work is the work they were always going to get and lost anyway. A dead website, a missed call, a quote nobody chased. Fixing this costs nothing extra in ads.",
    services: "Website · tracking · retargeting · answering the phone",
    icon: Repeat,
  },
];

/* ---------- 2. Each service at ground level ---------- */

interface Service {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  bucket: number;
  oneLine: string;
  analogy: string;
  solves: string;
  pickWhen: string;
  careful: string;
  speed: string;
  ask?: string;
}

const SERVICES: Service[] = [
  {
    name: "Google Ads",
    icon: Megaphone,
    bucket: 1,
    oneLine:
      "We pay Google to put them at the top of the results when someone searches for their trade. It only shows to people already looking, and we only pay when someone clicks.",
    analogy: "Being the first truck at the crash. The customer already has the problem — you are just the one who is there.",
    solves: "The phone isn't ringing, or it rings in bursts. Someone with a burst pipe searches and calls whoever is at the top.",
    pickWhen: "They describe feast and famine, need work this month, or are about to put another bloke on. The default for nearly every tradie you ring.",
    careful: "It is rented, not owned — it stops the day they stop paying. Say that out loud, because they have been burnt by people who did not.",
    speed: "Days",
    ask: '"Have you ever had Google Ads running, or is it mainly word of mouth?"',
  },
  {
    name: "SEO",
    icon: Search,
    bucket: 1,
    oneLine: "Getting them to the top of Google without paying for each click, by making Google trust their website for the jobs they want.",
    analogy: "Buying the shop instead of renting it. Costs more up front and takes months, then you stop paying rent per customer.",
    solves: "Ads work but the cost per job keeps climbing, or they want something that keeps paying after the tap is turned off.",
    pickWhen: "Established, has some cash flow, and can wait. Sits alongside ads rather than replacing them.",
    careful: "Months, not weeks. Never sell SEO to someone who needs work this month — that is how you create a refund.",
    speed: "3–6 months",
    ask: '"Has anyone been doing SEO for you, or working on the website?"',
  },
  {
    name: "Google Business Profile",
    icon: MapPin,
    bucket: 1,
    oneLine:
      "The free listing on Google Maps and in the box beside the search results — phone number, hours, area, photos, reviews. Used to be called Google My Business, which is why half of them still say GMB.",
    analogy: "Their shopfront on the map. Free to have, and most tradies have left it half-built.",
    solves:
      "For emergency and near-me searches it is often the first thing a customer taps, ahead of any website. Three reviews and no photos means invisible for exactly the jobs that pay best.",
    pickWhen: "They have reviews but poor map visibility, or the listing is half-finished.",
    careful:
      "Nobody asks for \"GBP\" — one prospect literally asked \"what's the GBP?\". Say \"your Google listing\" or \"the maps\". And when they say someone is \"doing my Google\", that usually means posting updates and chasing reviews. Real work, but it is neither ads nor a website, and plenty of them think they are advertising when they are not.",
    speed: "Weeks",
    ask: '"Is the Google profile something you set up yourself, or has someone been looking after it?"',
  },
  {
    name: "Meta ads (Facebook / Instagram)",
    icon: Users,
    bucket: 2,
    oneLine:
      "Ads shown to people in their area who are scrolling, not searching. They are not after a plumber right now — we are putting the name in front of them for later.",
    analogy: "A billboard on the highway. Nobody drove out to see it, but they remember the name when they need it.",
    solves: "\"Getting my name out there.\" Also works for bigger jobs people think about for a while, like solar or a full rewire.",
    pickWhen: "Awareness, promotions, and higher-value work people mull over.",
    careful: "Not a substitute for search. A blocked drain at 10pm does not get solved on Instagram, and tradies widely report Meta leads as lower quality — for emergency work they are usually right.",
    speed: "Weeks",
  },
  {
    name: "Website / landing page",
    icon: Globe,
    bucket: 3,
    oneLine: "The page an ad click lands on. Its only job is to turn a visitor into a phone call — it is not a brochure and nobody reads it for fun.",
    analogy: "The front counter. You can spend a fortune getting people through the door and lose them all at a bad counter.",
    solves: "10 of 13 plumbers in the research had a bad site. Most had built one \"just so I could say yes\" when asked whether they had one.",
    pickWhen: "Always check it before the appointment. A broken site wastes every dollar of ad spend behind it.",
    careful: "Everybody wants one and nobody pays for it — every deal in the research gave it away. Never lead with it as a paid line item.",
    speed: "Weeks",
  },
  {
    name: "Tracking & reporting",
    icon: LineChart,
    bucket: 3,
    oneLine: "Connecting their job software and their phone numbers so we can show actual jobs won per dollar spent, instead of clicks.",
    analogy: "The receipt. Without it they are taking someone's word for it, which is exactly what went wrong last time.",
    solves: "The burnt buyer's real objection: \"they tell you how many clicks, but it doesn't lead to money in the bank, does it?\"",
    pickWhen: "Anyone who has used an agency before. The most consistent turning point in the whole corpus.",
    careful: "This runs on our own software, Odin Analytics — there is a full section on it below. Learn that one properly.",
    speed: "Immediate",
    ask: '"Do you know roughly where your jobs are actually coming from at the moment?"',
  },
  {
    name: "Retargeting",
    icon: Repeat,
    bucket: 3,
    oneLine: "Showing ads again to people who already visited their site and did not call.",
    analogy: "Following up a quote. Most people do not book the first time they look.",
    solves: "Enquiries and quotes that go quiet.",
    pickWhen: "They have traffic but enquiries die. Usually an add-on, rarely the reason for the meeting.",
    careful: "They may call it \"the Metapixel retargeting\" or \"reverse targeting\". Do not correct them, just use their words.",
    speed: "Weeks",
  },
  {
    name: "Recruitment ads",
    icon: Wrench,
    bucket: 3,
    oneLine: "Ads to find tradies instead of customers.",
    analogy: "Same machine, pointed at a different person.",
    solves: "\"I need employees.\" For a crew, hiring rather than leads is very often the real bottleneck.",
    pickWhen: "They name people as the thing that breaks if work doubled. Selling more work to this person actively hurts them.",
    careful: "Listen for this. Pitching lead generation to someone who cannot staff the work is the fastest way to lose a crew business.",
    speed: "Weeks",
  },
];

/* ---------- 3. Questions you will get asked ---------- */

const EXPLAIN_IT: { q: string; a: string }[] = [
  {
    q: "What's the difference between SEO and Google Ads?",
    a: "The one you will get asked most. \"Ads are the paid spots right at the top — you pay each time someone clicks, and it can be running today. SEO is the free listings underneath — nothing per click, but it takes months to get there. Most blokes run ads for now and build SEO for later.\"",
  },
  { q: "What is SEO, in one sentence?", a: "\"Getting you showing up on Google without paying for every click.\"" },
  { q: "What's a landing page?", a: "\"It's the page your ad sends people to. One page, one job — get them to ring you.\"" },
  {
    q: "What's retargeting?",
    a: "\"When someone looks at your site and doesn't call, we show them your ad again. That's why ads seem to follow you around after you've looked at something.\"",
  },
  { q: "What's a lead?", a: "Do not use the word with them — say work or jobs. If they use it: \"someone who's got in touch, before you've won the job.\"" },
  { q: "What does it cost?", a: "You do not have a number and you must not invent one. Use the price reframe in the Reframes module, then hand it to Bede." },
  {
    q: "How long until I see something?",
    a: "\"Ads can be live within a week. SEO's a few months. That's the honest split, and Bede will tell you which one actually suits you.\"",
  },
  {
    q: "Do I have to do anything?",
    a: "\"Not much beyond answering the phone — and that's actually the bit worth talking about, because that's where most of the work leaks out.\"",
  },
];

/* ---------- 4. Their words → what they mean ---------- */

const TRANSLATION: { said: string; service: string }[] = [
  { said: "\"Just get the phone ringing\"", service: "Google Ads — the single most common phrasing in the whole corpus" },
  { said: "\"I just need more leads / more jobs\"", service: "Google Ads first, SEO layered later" },
  { said: "\"Keep me busy\" · \"bank in some work\"", service: "Google Ads + a landing page" },
  { said: "\"I need consistency\" · \"put another guy on\"", service: "Google Ads as demand on tap — the trigger is the hire" },
  { said: "\"Top of Google\" · \"number one\" · \"the maps\"", service: "SEO and Google profile" },
  { said: "\"Get my name out there\"", service: "Meta ads / awareness" },
  { said: "\"A website that actually does something\"", service: "Website or landing page — but only as a lead machine" },
  { said: "\"Track where my money goes\"", service: "Odin Analytics — see the section below" },
  { said: "\"I don't know what's working\"", service: "Odin Analytics. This is the one that books meetings." },
  { said: "\"A tap I can turn on and off\"", service: "Managed Google Ads, pausable, no lock-in" },
  { said: "\"I need employees\"", service: "Recruitment ads — NOT lead gen. Do not sell them work." },
  { said: "\"Show up in AI\"", service: "AI-search visibility / SEO. New ask, appearing from mid-2026." },
];

export function ServicesExplainer() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">Start here if you have never worked in marketing</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          You are not selling any of this on the phone. You need exactly two things: enough to recognise which problem
          you are hearing, and enough to answer a direct question without bluffing. Nothing below assumes you know
          anything — and do not assume it of them either. Real quotes from our own calls include{" "}
          <span className="italic">"so how does the ads work… I have absolutely no idea"</span> and{" "}
          <span className="italic">"I don't actually know what you do, to be honest"</span>.
        </p>
      </div>

      <PanelSection
        icon={Split}
        title="The whole thing in one idea"
        description="Everything we sell does one of three jobs. Understand this and the rest is detail."
      >
        <div className="space-y-2">
          {BUCKETS.map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.n} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-primary font-mono text-[10px] text-primary-foreground">
                    {b.n}
                  </span>
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{b.name}</span>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{b.plain}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{b.services}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Almost every tradie you ring needs bucket 1. A few need bucket 2. Nearly all of them are quietly losing work
          in bucket 3 and have never thought about it, which is why the missed-calls question lands so hard.
        </p>
      </PanelSection>

      <PanelSection
        icon={Megaphone}
        title="The eight things we do"
        description="Each has a plain sentence and an analogy. Learn the sentence — it is what you say if they ask."
      >
        <div className="space-y-2.5">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.name} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm font-semibold">{s.name}</span>
                  <Badge variant="outline" className="border-border bg-muted/40 font-normal text-[10px]">bucket {s.bucket}</Badge>
                  <Badge variant="outline" className="ml-auto border-border font-mono text-[10px]">{s.speed}</Badge>
                </div>

                <p className="mt-1.5 text-sm">{s.oneLine}</p>
                <p className="mt-1.5 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-sm">
                  <span className="font-medium">Think of it as: </span>{s.analogy}
                </p>

                <div className="mt-1.5 space-y-1 text-xs">
                  <p><span className="font-medium text-foreground">Fixes: </span><span className="text-muted-foreground">{s.solves}</span></p>
                  <p><span className="font-medium text-foreground">Reach for it when: </span><span className="text-muted-foreground">{s.pickWhen}</span></p>
                </div>

                {s.ask && (
                  <p className="mt-1.5 border-l-2 border-primary/50 pl-2 text-sm">
                    <span className="font-medium">Ask on a call: </span>{s.ask}
                  </p>
                )}
                <p className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs">
                  <span className="font-medium">Careful: </span>{s.careful}
                </p>
              </div>
            );
          })}
        </div>
      </PanelSection>

      {/* ---------- Odin Analytics ---------- */}
      <PanelSection
        icon={BarChart3}
        title="Odin Analytics — the thing nobody else has"
        description="Our own software. It is the single biggest reason a burnt tradie says yes, and it is the one part of the offer you should be able to explain in your sleep."
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm">
              <span className="font-semibold">What it is, in one sentence: </span>
              our own software that plugs into their job system and their phone numbers, and shows which marketing
              produced which actual job and how much money it made.
            </p>
            <a
              href="https://odinanalytics.lovable.app"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-2"
            >
              odinanalytics.lovable.app <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              Go and click around it before your first shift. You will explain it better having seen it.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Why it is a genuine point of difference</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every agency reports clicks, impressions and "leads". None of those pay a wage. The loudest single
              grievance across all 72 recorded calls is some version of{" "}
              <span className="italic">"they tell you how many clicks, but it doesn't lead to money in the bank,
              does it?"</span> Odin Analytics is the direct answer to that sentence — it reports jobs won and dollars
              banked per channel, from their own job software, not from our ad account.
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              It also means they can check us. A tradie who has been ripped off does not want a promise, they want a
              way to catch us if we are lying. Handing them that is far more persuasive than any claim we could make.
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="text-sm font-medium">The proof it matters</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Joel at Hobsons Bay Plumbing nearly walked at about the four-month mark. What kept him was finally being
              able to see which jobs came from where. He is now our biggest plumbing result.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">How Bede uses it on the booked call</p>
            <ul className="mt-1 space-y-1">
              {[
                "Shares his screen and opens a real client account — not a slide, not a PDF, the actual dashboard.",
                "Walks through spend against jobs won and revenue, by channel, for a business in the same trade.",
                "Lets the prospect ask their own questions of the numbers instead of narrating at them.",
                "Then looks at what the prospect currently cannot see, which is usually everything.",
              ].map((x) => (
                <li key={x} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Proof on a screen was the only beat that engaged every segment in the research. Process walk-throughs
              drew filler; engagement started at the dashboard every single time.
            </p>
          </div>

          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              How you use it on a cold call
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You cannot show anything down a phone line, so do not try to describe the dashboard — you will lose them
              and it will sound like every other pitch. Your job is to open the gap and promise the screen.
            </p>
            <div className="mt-2 space-y-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">1. Open the gap</p>
                <p className="mt-0.5 text-sm font-medium">"Do you know roughly where your jobs are actually coming from at the moment?"</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Most cannot answer, and the pause while they try is the whole move. Ask it lightly — asked wrong it
                  sounds like a test they are failing.
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">2. Name what that costs</p>
                <p className="mt-0.5 text-sm font-medium">"That's the bit that catches most blokes out — you can't tell if you're getting ripped off if you can't see it."</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">3. Promise the screen, then book</p>
                <p className="mt-0.5 text-sm font-medium">"Bede will pull up a real account on the screen and show you exactly what that looks like for a business like yours. Tuesday morning or Thursday?"</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              It is also your best answer to "what makes you different from the last mob" — not a claim, a thing they
              can look at.
            </p>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <p className="text-sm font-medium">Careful</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Do not get drawn into how it connects, which systems it supports, or what it costs. If they ask, that is
              interest and it is Bede's: "That's exactly what he'll walk you through." Trying to demo software verbally
              is the fastest way to turn a warm call cold.
            </p>
          </div>
        </div>
      </PanelSection>

      <PanelSection
        icon={MessageCircleQuestion}
        title="If they ask you to explain it"
        description="Word for word. Say these and stop — do not keep going to prove you know more."
      >
        <div className="space-y-2">
          {EXPLAIN_IT.map((e) => (
            <div key={e.q} className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-sm font-medium">{e.q}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{e.a}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-sm font-medium">If you don't know, say you don't know</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            "Honestly, that's past where I'd be guessing — Bede will go through it properly" costs you nothing.
            Bluffing costs you the call, because a tradie who has been burnt is listening specifically for someone
            winging it.
          </p>
        </div>
      </PanelSection>

      <PanelSection
        icon={Search}
        title="They name a result, never a channel"
        description="Your translation layer. The left column is what actually comes out of their mouths."
      >
        <div className="space-y-1">
          {TRANSLATION.map((t) => (
            <div key={t.said} className="flex flex-wrap items-baseline gap-x-2 border-b border-border/50 py-1.5 text-sm">
              <span className="font-medium">{t.said}</span>
              <span className="text-muted-foreground">→ {t.service}</span>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection icon={Wrench} title="The one rule" description="Everything above exists so you can follow this.">
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p>
            Your job is to find which problem is real and book the session — not to prescribe the fix. Naming a service
            too early turns a conversation into a price comparison, and you lose to whoever is cheaper.
          </p>
          <p>
            If they ask what we would do:{" "}
            <span className="italic text-foreground">
              "Honestly, that depends on what's actually broken — that's what the fifteen minutes is for. It might be
              ads, it might be that your Google listing is doing nothing, it might be that you're getting the calls and
              they're not being answered."
            </span>
          </p>
          <p>
            That last one is worth remembering. 7 of 13 plumbers in the research raised missed calls and who answers
            the phone, unprompted — the highest count of anything measured.
          </p>
        </div>
      </PanelSection>
    </div>
  );
}
