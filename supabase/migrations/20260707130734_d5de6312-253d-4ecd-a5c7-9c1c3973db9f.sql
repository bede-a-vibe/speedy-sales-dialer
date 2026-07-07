
CREATE TABLE public.objection_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objection_text text NOT NULL,
  normalized_text text GENERATED ALWAYS AS (lower(btrim(objection_text))) STORED,
  category text NOT NULL CHECK (category IN ('logistical','fear','smokescreen','price','timing','authority','competitor','other')),
  example_responses jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'call' CHECK (source IN ('framework','call')),
  contact_id uuid NULL REFERENCES public.contacts(id) ON DELETE SET NULL,
  call_log_id uuid NULL REFERENCES public.call_logs(id) ON DELETE SET NULL,
  led_to_booking boolean NULL,
  times_seen int NOT NULL DEFAULT 1,
  booked_count int NOT NULL DEFAULT 0,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX objection_bank_framework_unique
  ON public.objection_bank (normalized_text)
  WHERE source = 'framework';

CREATE INDEX objection_bank_category_idx ON public.objection_bank (category);
CREATE INDEX objection_bank_normalized_idx ON public.objection_bank (normalized_text);

GRANT SELECT ON public.objection_bank TO authenticated;
GRANT ALL ON public.objection_bank TO service_role;

ALTER TABLE public.objection_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read objection bank"
  ON public.objection_bank FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_objection_bank_updated_at
  BEFORE UPDATE ON public.objection_bank
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed framework objections
INSERT INTO public.objection_bank (objection_text, category, source, example_responses) VALUES
('We already have an agency / we get enough work from referrals', 'competitor', 'framework', '[
  {"response":"Totally fair — and I''m not here to replace anyone. Out of curiosity, if referrals slowed down tomorrow, how prepared would you be?","source":"framework"},
  {"response":"Makes sense. Can I ask what made you pick them, and is there anything you wish they were doing differently?","source":"framework"},
  {"response":"Got it. Most of the guys we work with had an agency too — usually it wasn''t the agency, it was the type of leads. Mind if I ask what''s working and what isn''t?","source":"framework"}
]'::jsonb),
('No budget / we can''t afford it right now', 'price', 'framework', '[
  {"response":"Appreciate you saying that. Just so I understand — is it the investment itself, or not being sure it''ll pay for itself?","source":"framework"},
  {"response":"Fair. If money wasn''t the issue, is this something you''d actually want to fix?","source":"framework"},
  {"response":"Understood. Can I ask — what''s it costing you right now to not have this handled?","source":"framework"}
]'::jsonb),
('Just send me an email', 'smokescreen', 'framework', '[
  {"response":"Happy to — what specifically would you want me to send so it''s actually useful and not just another email you delete?","source":"framework"},
  {"response":"For sure. Just so I don''t waste your time — is there any part of what we do you''d actually want to explore, or is email a polite way of saying not now?","source":"framework"},
  {"response":"Totally. Before I do, mind if I ask one question so I send the right thing?","source":"framework"}
]'::jsonb),
('Not interested', 'smokescreen', 'framework', '[
  {"response":"Totally fair — most people say that before they know what it is. Can I ask what you''re assuming this is about?","source":"framework"},
  {"response":"No worries. Out of curiosity, is it not the right time, or just not something you''d ever look at?","source":"framework"},
  {"response":"Understood. Quick one before I go — if we could actually help with X, would that be worth a 10-minute conversation, or genuinely a no?","source":"framework"}
]'::jsonb),
('I need to think about it', 'fear', 'framework', '[
  {"response":"Of course — what specifically is there to think about? I''d rather help you make a decision now than leave you unsure.","source":"framework"},
  {"response":"Fair enough. Is it the fit, the timing, or something about how we''d work together?","source":"framework"},
  {"response":"Sure. If you were to think about it and land on a no, what would the reason most likely be?","source":"framework"}
]'::jsonb),
('Too busy / bad time right now', 'timing', 'framework', '[
  {"response":"Totally get it — quick question and I''ll let you go: is being that busy a good problem or is it actually costing you?","source":"framework"},
  {"response":"No worries. When would be a genuinely better moment — later today or tomorrow morning?","source":"framework"},
  {"response":"Fair. Would 90 seconds now be easier than trying to line up another call?","source":"framework"}
]'::jsonb),
('How did you get my number', 'logistical', 'framework', '[
  {"response":"Fair question — your business came up when we were looking at [industry/area]. I''m not selling anything shady, promise. Mind if I take 30 seconds to say why I called?","source":"framework"},
  {"response":"Completely fair. It''s public listing information. The real question is whether what I called about is actually relevant to you — can I ask two quick things?","source":"framework"}
]'::jsonb),
('We tried marketing before and it didn''t work', 'fear', 'framework', '[
  {"response":"That''s actually really common — do you mind if I ask what you tried and what specifically didn''t work?","source":"framework"},
  {"response":"Makes sense. If it had worked, what would have been different for the business?","source":"framework"},
  {"response":"Fair. Would you say it was the wrong channel, the wrong offer, or the wrong people running it?","source":"framework"}
]'::jsonb),
('I''ll need to talk to my business partner', 'authority', 'framework', '[
  {"response":"Totally — before you do, what would you personally lean toward if it was just your call?","source":"framework"},
  {"response":"Makes sense. What do you think they''ll say, and what would they need to see to be comfortable?","source":"framework"},
  {"response":"Sure. Would it help if the three of us jumped on a quick call so they can ask directly?","source":"framework"}
]'::jsonb),
('We''re doing fine as we are', 'fear', 'framework', '[
  {"response":"Love that — genuinely. Can I ask, when you say fine, is that fine as in growing, or fine as in nothing''s broken?","source":"framework"},
  {"response":"Great. If something did break — leads dried up, a competitor moved in — how quickly could you respond?","source":"framework"},
  {"response":"Fair. What would need to change for you to actually want to look at this?","source":"framework"}
]'::jsonb),
('What''s this about / who are you', 'logistical', 'framework', '[
  {"response":"Fair question. My name''s [X] from [company]. I called because [one-sentence reason]. Bad time or can I take 30 seconds?","source":"framework"},
  {"response":"Totally get it. Short version: I help [type of business] with [outcome]. Whether that''s relevant is what I''m trying to figure out — can I ask two quick questions?","source":"framework"}
]'::jsonb),
('Call me back later', 'timing', 'framework', '[
  {"response":"Happy to — just so I don''t chase you: is later a real later, or a polite no?","source":"framework"},
  {"response":"Sure — what''s a time you''ll actually be free? I''ll put it in the calendar now so we don''t play phone tag.","source":"framework"},
  {"response":"No problem. Before I go — is there anything I can answer in 30 seconds now that would save the callback?","source":"framework"}
]'::jsonb);
