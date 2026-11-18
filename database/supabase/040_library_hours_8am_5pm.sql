-- Library hours: Ethan confirmed 2026-11-18 that the library opens 08:00 and closes 17:00.
-- Replaces the 19:00 closing set by 022. Open days stay as they are; closed days keep NULL times.
-- Affects attendance entry and automatic checkout, the dashboard schedule and due-date fine hours.
UPDATE library_operating_schedule
   SET opens_at = TIME '08:00:00', closes_at = TIME '17:00:00', updated_at = NOW()
 WHERE is_open = 1;
