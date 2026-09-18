//
//  ARMeasurementBridge.m
//  Objective-C export shim so the RN JS bridge can see the Swift
//  ARMeasurementBridge class and its `launchARScanner` method.
//
//  RCT_EXTERN_MODULE / RCT_EXTERN_METHOD only declare the *signature* that
//  will be called across the bridge — the actual implementation lives in
//  ARMeasurementBridge.swift. Argument order here must match the Swift
//  @objc method signature exactly.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ARMeasurementBridge, NSObject)

RCT_EXTERN_METHOD(
  launchARScanner:(NSArray *)requiredDimensions
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

@end
