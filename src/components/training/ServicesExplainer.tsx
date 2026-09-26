import { Globe, LineChart, MapPin, Megaphone, Repeat, Search, Users, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * What Odin sells, written for a setter — grounded in how prospects actually
 * describe the problem (Services section of the Tradie Voice of Customer Bank,
 * 72 calls Mar-Sep 2026). Tradies almost never name a channel, they name a
 * result, so the translation layer matters more than the definitions.
 */

const TRANSLATION: { said: string; service: string }[] = [
  { said: "\"Just get the phone ringing\"", service: "Google Ads — the single most common phrasing in the whole corpus" },
  { said: "\"I just need more leads / more jobs\"", service: "Google Ads first, SEO layered later" },
  { said: "\"Keep me busy\" · \"bank in some work\"", service: "Google Ads + a landing page" },
  { said: "\"I need consistency\" · \"put another guy on\"", service: "Google Ads as demand on tap — the trigger is the hire" },
  { said: "\"Top of Google\" · \"number one\" · \"the maps\"", service: "SEO and Google Business Profile" },
  { said: "\"Get my name out there\"", service: "Meta ads / awareness" },
  { said: "\"A website that actually does something\"", service: "Website or landing page — but only as a lead machine" },
  { said: "\"Track where my money goes\"", service: "Tracking and reporting (Odin Analytics, CallRail)" },
  { said: "\"A tap I can turn on and off\"", service: "Managed Google Ads, pausable, no lock-in" },
  { said: "\"I need employees\"", service: "Recruitment ads — NOT lead gen. Don't sell them work." },
  { said: "\"Show up in AI\"", service: "AI-search visibility / SEO. New ask, appearing from mid-2026." },
];

interface Service {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  plain: string;
  solves: string;
  pickWhen: string;
  careful: string;
  speed: string;
}

const SERVICES: Service[] = [
  {
    name: "Google Ads",
    icon: Megaphone,
    plain: "We pay to put them at the top when someone searches \"emergency plumber near me\" right now. They only show to people already looking.",
    solves: "The phone isn't ringing, or it rings in bursts. Someone with a burst pipe searches and calls whoever is at the top.",
    pickWhen: "They describe feast-famine, need work this month, or are about to hire. This is the default for nearly every cold tradie.",
    careful: "It's rented demand — it stops the day you stop paying. Say that out loud; they've been burned by people who didn't.",
    speed: "Days",
  },
  {
    name: "SEO",
    icon: Search,
    plain: "Earning the top spots without paying per click, by making Google trust their site for the jobs they want.",
    solves: "Ads work but cost per job keeps climbing, or they want something that keeps paying after the tap is off.",
    pickWhen: "They're already established, have some cash flow, and can wait. Pairs with ads rather than replacing them.",
    careful: "Months, not weeks. Never sell SEO to someone who needs work this month — that's how you create a refund.",
    speed: "3-6 months",
  },
  {
    name: "Google Business Profile / Maps",
    icon: MapPin,
    plain: "The map listing with the stars. For local trades this is often where more calls come from than the website.",
    solves: "\"I want to be in the top three in the maps within 7km of where I live\" — a real quote, and a common ask.",
    pickWhen: "They have reviews but poor map visibility, or their listing is half-finished.",
    careful: "Nobody asks for \"GBP\" — one prospect literally asked \"what's the GBP?\". Say \"your Google listing\" or \"the maps\".",
    speed: "Weeks",
  },
  {
    name: "Meta Ads (Facebook / Instagram)",
    icon: Users,
    plain: "Ads to people in their area who aren't searching yet — building the name so they're the one called later.",
    solves: "\"Getting my name out there.\" Also good for bigger-ticket considered work like solar or full rewires.",
    pickWhen: "Awareness plays, promotions, and higher-value services people mull over.",
    careful: "Not a substitute for search intent. A blocked drain at 10pm doesn't get solved on Instagram.",
    speed: "Weeks",
  },
  {
    name: "Website / landing page",
    icon: Globe,
    plain: "Where the ad click lands. Its only job is to turn a visitor into a phone call.",
    solves: "10 of 13 plumbers in the research had a bad site. Most built one \"just so I could say yes\" when asked.",
    pickWhen: "Always check it before the appointment — a broken site wastes every dollar of ad spend behind it.",
    careful: "Everybody wants one and nobody pays for it — every deal in the research gave it away. Never lead with it as a paid line item.",
    speed: "Weeks",
  },
  {
    name: "Tracking & reporting",
    icon: LineChart,
    plain: "Connecting their job software and call tracking so we can show actual jobs won per dollar, not clicks.",
    solves: "The burned buyer's real objection: \"they tell you how many clicks, but it doesn't lead to money in the bank, does it?\"",
    pickWhen: "Anyone who has used an agency before. This is the most consistent turning point in the corpus.",
    careful: "This is our strongest asset — proof on a screen engaged every segment. Get them to the demo.",
    speed: "Immediate",
  },
  {
    name: "Retargeting",
    icon: Repeat,
    plain: "Following up people who already visited, so they see us again while deciding.",
    solves: "Quotes that go quiet. Most people don't book the first time they look.",
    pickWhen: "They have traffic but quotes die. Usually an add-on, rarely the reason for the meeting.",
    careful: "They may call it \"the Metapixel retargeting\" or \"reverse targeting\". Just agree and use their words.",
    speed: "Weeks",
  },
  {
    name: "Recruitment ads",
    icon: Wrench,
    plain: "Ads to find tradies, not customers.",
    solves: "\"I need employees.\" For a crew, hiring — not leads — is very often the real bottleneck.",
    pickWhen: "They name people as the thing that breaks if work doubles. Selling them more work here actively hurts.",
    careful: "Listen for this. Pitching lead gen to someone who can't staff the work is the fastest way to lose a crew business.",
    speed: "Weeks",
  },
];

export function ServicesExplainer() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">What we sell, and which problem each thing fixes</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          You are not selling a service on the phone — you're booking a conversation. But you must know enough to
          recognise which problem you're hearing, and to sound like you've done this before. Assume zero knowledge on
          their side: real quotes from our calls include <span className="italic">"so how does the ads work… I have
          absolutely no idea"</span> and <span className="italic">"I don't actually know what you do, to be honest"</span>.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">They name a result, never a channel</CardTitle>
          <CardDescription>Your translation layer. Learn the left column — it's what actually comes out of their mouths.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {TRANSLATION.map((t) => (
              <div key={t.said} className="flex flex-wrap items-baseline gap-x-2 border-b border-border/50 py-1.5 text-sm">
                <span className="font-medium">{t.said}</span>
                <span className="text-muted-foreground">→ {t.service}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {SERVICES.map((s) => {
        const Icon = s.icon;
        return (
          <Card key={s.name}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Icon className="h-4 w-4 text-primary" /> {s.name}
                <Badge variant="outline" className="ml-auto border-border text-[10px]">Results in {s.speed}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p><span className="font-medium">In plain English:</span> <span className="text-muted-foreground">{s.plain}</span></p>
              <p><span className="font-medium">The problem it fixes:</span> <span className="text-muted-foreground">{s.solves}</span></p>
              <p><span className="font-medium">Reach for it when:</span> <span className="text-muted-foreground">{s.pickWhen}</span></p>
              <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs">
                <span className="font-medium">Careful:</span> {s.careful}
              </p>
            </CardContent>
          </Card>
        );
      })}

      <Card className="border-primary/25">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">The one rule for a setter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <p>
            Your job is to find which problem is real and book the session — not to prescribe the fix. Naming a service
            too early turns a conversation into a price comparison, and you'll lose to whoever is cheaper.
          </p>
          <p>
            If they ask what we'd do, it's fair to say: <span className="italic text-foreground">"Honestly, that depends
            on what's actually broken — that's what the 20 minutes is for. It might be ads, it might be that your
            Google listing is doing nothing, it might be that you're getting the calls and they're not being
            answered."</span> That last one is worth remembering: 7 of 13 plumbers raised missed calls and who answers
            the phone, the highest unprompted count of anything measured.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
