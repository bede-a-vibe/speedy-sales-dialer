-- Add two new appointment outcomes
ALTER TYPE appointment_outcome ADD VALUE IF NOT EXISTS 'second_meeting_booked';
ALTER TYPE appointment_outcome ADD VALUE IF NOT EXISTS 'no_close_follow_up';