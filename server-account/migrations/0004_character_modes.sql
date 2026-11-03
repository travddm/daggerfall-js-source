-- Character modes (docs/systems/character-modes.md): the mode a realm character was created in, one of
-- src/net/modeLaw.js MODES. A character of a build from before the modes reads as 'classic'.
ALTER TABLE realm_characters ADD COLUMN mode TEXT NOT NULL DEFAULT 'classic'
  CHECK (mode IN ('classic', 'hardcore', 'legacy', 'ironman', 'hardcore_ironman'));
