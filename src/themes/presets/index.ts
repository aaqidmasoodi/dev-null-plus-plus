import type { ThemeDefinition } from '../schema';
import { encyclopedia } from './encyclopedia';
import { neoTokyo } from './neo-tokyo';
import { retroOs } from './retro-os';
import { sugarCloud } from './sugar-cloud';
import { terminalModern } from './terminal-modern';

/** The themes that ship, in the order the picker shows them. */
export const PRESETS = [terminalModern, neoTokyo, encyclopedia, sugarCloud, retroOs] as const;

export type PresetId = (typeof PRESETS)[number]['id'];

export const DEFAULT_PRESET: PresetId = 'terminal-modern';

export function isPresetId(value: unknown): value is PresetId {
  return PRESETS.some((preset) => preset.id === value);
}

export function presetById(id: PresetId): ThemeDefinition<PresetId> {
  const preset = PRESETS.find((candidate) => candidate.id === id);

  if (preset === undefined) {
    throw new Error(`Unknown theme: ${id}`);
  }

  return preset;
}
