/**
 * Generic measurement field definitions.
 * Works for any AI-detected area — not tied to a specific room type.
 */

export const MEASUREMENT_UNITS = {
  in: { label: 'inches', symbol: '"' },
  cm: { label: 'centimeters', symbol: 'cm' },
};

export const MEASUREMENT_FIELDS = [
  {
    key: 'width',
    label: 'Width',
    instruction: 'Measure from the left inside edge to the right inside edge.',
    placeholder: 'e.g. 28',
  },
  {
    key: 'depth',
    label: 'Depth',
    instruction: 'Measure from the front edge to the back wall (inside the space).',
    placeholder: 'e.g. 14',
  },
  {
    key: 'height',
    label: 'Height (usable clearance)',
    instruction: 'Measure the open space between this shelf and the one above it.',
    placeholder: 'e.g. 12',
  },
];

export const getMeasureIntro = (areaName) =>
  `Let's measure your ${areaName.toLowerCase()} so we can recommend organizing solutions that fit perfectly.`;

export const getShelfCountPrompt = (areaName) =>
  `How many shelves in your ${areaName.toLowerCase()} are this size?`;
