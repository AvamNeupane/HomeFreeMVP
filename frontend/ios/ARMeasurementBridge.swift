//
//  ARMeasurementBridge.swift
//  Native entry point invoked from RN via ARMeasurementBridge.m.
//
//  Responsible for:
//    - Parsing the `requiredDimensions` array coming from JS.
//    - Presenting ARMeasurementViewController full-screen on top of the
//      current root view controller (always on the main thread — UIKit
//      presentation is not thread-safe).
//    - Turning the view controller's completion callback into a resolved
//      or rejected RN promise.
//

import Foundation
import UIKit

@objc(ARMeasurementBridge)
class ARMeasurementBridge: NSObject {

  /// RN promises must settle on *some* thread, but bridge modules are
  /// otherwise safe to call resolve/reject from a background queue. We
  /// still hop back to main first because we need to present UIKit.
  @objc(launchARScanner:resolver:rejecter:)
  func launchARScanner(
    requiredDimensions: NSArray,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    // Convert the loosely-typed NSArray<Any> coming across the bridge into
    // a strongly-typed Swift array, dropping anything that isn't a known
    // dimension key rather than crashing on unexpected input.
    let dimensions: [MeasurementDimension] = requiredDimensions
      .compactMap { $0 as? String }
      .compactMap { MeasurementDimension(rawValue: $0) }

    guard !dimensions.isEmpty else {
      reject(
        "INVALID_DIMENSIONS",
        "requiredDimensions must be a non-empty array of 'width' | 'depth' | 'height'.",
        nil
      )
      return
    }

    DispatchQueue.main.async {
      guard ARMeasurementViewController.isSupported else {
        reject(
          "AR_UNAVAILABLE",
          "This device does not support the ARKit world-tracking configuration required for measuring.",
          nil
        )
        return
      }

      guard let presenter = ARMeasurementBridge.topMostViewController() else {
        reject("NO_ROOT_VIEW_CONTROLLER", "Could not find a view controller to present AR scanner from.", nil)
        return
      }

      let arViewController = ARMeasurementViewController(requiredDimensions: dimensions) { result in
        // The view controller always dismisses itself before calling back;
        // we just need to translate its result into resolve/reject.
        switch result {
        case .success(let measurements):
          var payload: [String: Double] = [:]
          for (dimension, meters) in measurements {
            payload[dimension.rawValue] = meters
          }
          resolve(payload)

        case .cancelled:
          reject("USER_CANCELLED", "User dismissed the AR measuring screen.", nil)

        case .manualEntryRequested:
          reject("MANUAL_ENTRY_REQUESTED", "User asked to fall back to manual entry.", nil)

        case .failure(let message):
          reject("AR_SESSION_ERROR", message, nil)
        }
      }

      arViewController.modalPresentationStyle = .fullScreen
      presenter.present(arViewController, animated: true)
    }
  }

  /// Required by RN for modules that only expose promise-based methods
  /// without any events — keeps this module usable on the main queue by
  /// default (UIKit presentation), which is what we want here.
  @objc static func requiresMainQueueSetup() -> Bool {
    return true
  }

  /// Walks the key window's root view controller hierarchy to find the
  /// top-most presented view controller, so `launchARScanner` works no
  /// matter what's currently on screen (modals, nav stacks, tab bars).
  private static func topMostViewController() -> UIViewController? {
    let keyWindow = UIApplication.shared.connectedScenes
      .compactMap { ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow }) }
      .first

    var top = keyWindow?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}
