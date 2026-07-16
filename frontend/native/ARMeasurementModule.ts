/**
 * ARMeasurementModule.ts — React Native wrapper around the native
 * `ARMeasurementBridge` (iOS only, see ios/ARMeasurement/).
 *
 * Usage (see screens/MeasureSpaceScreen.js):
 *
 *   import ARMeasurementModule, { isARMeasurementAvailable } from '../native/ARMeasurementModule';
 *
 *   if (isARMeasurementAvailable()) {
 *     try {
 *       const meters = await ARMeasurementModule.launchARScanner(['width', 'depth', 'height']);
 *       // meters = { width: 1.12, depth: 0.61, height: 0.40 }
 *     } catch (err) {
 *       if (err.code === 'MANUAL_ENTRY_REQUESTED') {
 *         // user tapped "Manual Entry" inside the AR screen — fall back
 *         // to the existing text-input flow, don't show this as an error.
 *       } else if (err.code === 'USER_CANCELLED') {
 *         // user backed out of the AR screen entirely
 *       } else {
 *         // camera permission denied, ARKit unsupported, etc.
 *       }
 *     }
 *   }
 *
 * All distances returned are in METERS — unit conversion to inches/cm for
 * display is handled on the JS side (see MeasureSpaceScreen.js), matching
 * how the rest of the app already converts units in products.py / the
 * measurement config.
 */

import { NativeModules, Platform } from 'react-native';

export type RequiredDimension = 'width' | 'depth' | 'height';

export type ARMeasurementResult = Partial<Record<RequiredDimension, number>>;

export interface ARMeasurementError extends Error {
  code: 'USER_CANCELLED' | 'MANUAL_ENTRY_REQUESTED' | 'AR_UNAVAILABLE' | 'PERMISSION_DENIED' | string;
}

interface ARMeasurementBridgeNative {
  launchARScanner(requiredDimensions: RequiredDimension[]): Promise<ARMeasurementResult>;
}

const { ARMeasurementBridge } = NativeModules as {
  ARMeasurementBridge?: ARMeasurementBridgeNative;
};

/**
 * True only on iOS, on a physical device, with the native module linked.
 * (ARKit does not run in the simulator or on Android — always check this
 * before showing an "AR Scan" button, and fall back to manual entry
 * otherwise.)
 */
export function isARMeasurementAvailable(): boolean {
  return Platform.OS === 'ios' && ARMeasurementBridge != null;
}

/**
 * Launch the full-screen native ARKit measuring flow.
 *
 * @param requiredDimensions - which dimensions to walk the user through,
 *        in order (e.g. ['width', 'depth', 'height']).
 * @returns a promise resolving to a dictionary of dimension -> meters.
 *          Rejects with an ARMeasurementError if the module isn't
 *          available, the user cancels, or they tap "Manual Entry".
 */
async function launchARScanner(
  requiredDimensions: RequiredDimension[]
): Promise<ARMeasurementResult> {
  if (!isARMeasurementAvailable()) {
    const error = new Error(
      'AR measuring is only available on iOS devices with the native module linked.'
    ) as ARMeasurementError;
    error.code = 'AR_UNAVAILABLE';
    throw error;
  }

  return ARMeasurementBridge!.launchARScanner(requiredDimensions);
}

export default { launchARScanner, isARMeasurementAvailable };
