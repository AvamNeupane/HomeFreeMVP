/**
 * App Font Families
 *
 * FIX: this file used to be a byte-for-byte copy of Colors.js (a stray
 * duplicate, not real font config) — every screen references
 * Fonts.headingBold / Fonts.bodyRegular / Fonts.bodySemiBold, none of
 * which existed here, so the custom fonts loaded via useFonts() in App.js
 * were never actually applied anywhere; React Native just silently fell
 * back to the system font. Mapped to the exact font keys loaded in App.js.
 */

export default {
  headingBold: 'LibreBaskerville_700Bold',
  headingRegular: 'LibreBaskerville_400Regular',
  bodyRegular: 'Montserrat_400Regular',
  bodySemiBold: 'Montserrat_600SemiBold',
  bodyBold: 'Montserrat_700Bold',
};
