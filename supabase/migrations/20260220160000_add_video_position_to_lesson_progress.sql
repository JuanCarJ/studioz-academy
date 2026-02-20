-- Add video_position to lesson_progress for persisting playback position (CA-024.9)
-- video_position: position in seconds. 0 = beginning.
ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS video_position INTEGER DEFAULT 0;
