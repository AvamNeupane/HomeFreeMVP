/**
 * Measurement units. Field definitions (what to measure) are no longer
 * fixed here — MeasureSpaceScreen asks the backend which dimensions are
 * relevant per object (/area/measurement-fields) and parses the user's
 * free-text description of them (/area/parse-measurement), rather than a
 * hardcoded keyword-matched field table. Vocabulary is length/width/height
 * (+ inner_length/inner_width/inner_height) — never "depth".
 */

export const MEASUREMENT_UNITS = {
  in: { label: 'inches', symbol: '"' },
  cm: { label: 'centimeters', symbol: 'cm' },
};
