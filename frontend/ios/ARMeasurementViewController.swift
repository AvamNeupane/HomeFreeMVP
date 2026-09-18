//
//  ARMeasurementViewController.swift
//  Minimalist ARKit tape-measure: raycast off plane detection, tap twice
//  per dimension to drop points, read off the 3D distance, advance to the
//  next required dimension automatically.
//
//  No CoreML / object detection — this only needs raw distances, so plane
//  raycasting keeps the AR session light and battery-friendly.
//

import UIKit
import ARKit
import SceneKit

/// The set of dimensions this screen knows how to measure. Kept in sync
/// with the JS-side `RequiredDimension` union in ARMeasurementModule.ts.
enum MeasurementDimension: String, CaseIterable {
  case width
  case depth
  case height

  var instructionVerb: String {
    switch self {
    case .width: return "Measure Width"
    case .depth: return "Measure Depth"
    case .height: return "Measure Height"
    }
  }
}

/// Outcome handed back to ARMeasurementBridge.swift, which translates it
/// into a resolved/rejected RN promise.
enum ARMeasurementOutcome {
  case success([MeasurementDimension: Double])
  case cancelled
  case manualEntryRequested
  case failure(String)
}

final class ARMeasurementViewController: UIViewController {

  // MARK: - Public

  /// Whether this device supports the world-tracking configuration we need.
  /// ARKit world tracking (and therefore this whole screen) is unavailable
  /// on the Simulator and on older devices without an A9+ chip.
  static var isSupported: Bool {
    ARWorldTrackingConfiguration.isSupported
  }

  // MARK: - Init

  private let requiredDimensions: [MeasurementDimension]
  private let completion: (ARMeasurementOutcome) -> Void

  init(requiredDimensions: [MeasurementDimension], completion: @escaping (ARMeasurementOutcome) -> Void) {
    self.requiredDimensions = requiredDimensions
    self.completion = completion
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  // MARK: - AR / Scene state

  private let sceneView = ARSCNView()
  private var currentIndex = 0
  private var pointA: SCNVector3?
  private var pointANode: SCNNode?
  private var liveLineNode: SCNNode?
  private var liveLabelNode: SCNNode?
  private var completedResults: [MeasurementDimension: Double] = [:]
  private var didFinish = false

  // MARK: - UI

  private let instructionBanner = UILabel()
  private let liveDistanceLabel = UILabel()
  private let crosshair = UIView()
  private let resetButton = UIButton(type: .system)
  private let manualEntryButton = UIButton(type: .system)
  private let closeButton = UIButton(type: .system)

  // MARK: - Lifecycle

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black

    setUpSceneView()
    setUpOverlayUI()
    updateInstructionBanner()

    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
    sceneView.addGestureRecognizer(tap)
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)

    guard ARMeasurementViewController.isSupported else {
      finish(with: .failure("ARWorldTrackingConfiguration is not supported on this device."))
      return
    }

    let configuration = ARWorldTrackingConfiguration()
    configuration.planeDetection = [.horizontal, .vertical]
    sceneView.session.run(configuration)
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sceneView.session.pause()
  }

  // MARK: - Setup

  private func setUpSceneView() {
    sceneView.frame = view.bounds
    sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    sceneView.delegate = self
    sceneView.session.delegate = self
    sceneView.automaticallyUpdatesLighting = true
    view.addSubview(sceneView)
  }

  private func setUpOverlayUI() {
    // Instruction banner — top of screen.
    instructionBanner.textColor = .white
    instructionBanner.font = .systemFont(ofSize: 17, weight: .semibold)
    instructionBanner.textAlignment = .center
    instructionBanner.numberOfLines = 2
    instructionBanner.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    instructionBanner.layer.cornerRadius = 12
    instructionBanner.layer.masksToBounds = true
    instructionBanner.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(instructionBanner)

    // Crosshair — dead center, solid when a raycast hit is found, dashed
    // (translucent) while still searching for a surface.
    crosshair.translatesAutoresizingMaskIntoConstraints = false
    crosshair.layer.borderWidth = 2
    crosshair.layer.cornerRadius = 10
    crosshair.backgroundColor = .clear
    setCrosshairSearching()
    view.addSubview(crosshair)

    // Live distance readout, just above the crosshair.
    liveDistanceLabel.textColor = .white
    liveDistanceLabel.font = .monospacedDigitSystemFont(ofSize: 15, weight: .medium)
    liveDistanceLabel.textAlignment = .center
    liveDistanceLabel.translatesAutoresizingMaskIntoConstraints = false
    liveDistanceLabel.text = nil
    view.addSubview(liveDistanceLabel)

    // Reset — clears the current dimension's first tap if mis-placed.
    resetButton.setTitle("Reset", for: .normal)
    resetButton.setTitleColor(.white, for: .normal)
    resetButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
    resetButton.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    resetButton.layer.cornerRadius = 10
    resetButton.translatesAutoresizingMaskIntoConstraints = false
    resetButton.addTarget(self, action: #selector(handleReset), for: .touchUpInside)
    view.addSubview(resetButton)

    // Manual entry — immediately dismisses and tells RN to fall back to
    // the text-input flow.
    manualEntryButton.setTitle("Manual Entry", for: .normal)
    manualEntryButton.setTitleColor(.white, for: .normal)
    manualEntryButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
    manualEntryButton.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    manualEntryButton.layer.cornerRadius = 10
    manualEntryButton.translatesAutoresizingMaskIntoConstraints = false
    manualEntryButton.addTarget(self, action: #selector(handleManualEntry), for: .touchUpInside)
    view.addSubview(manualEntryButton)

    // Close — cancels the whole flow without a manual-entry flag.
    closeButton.setTitle("✕", for: .normal)
    closeButton.setTitleColor(.white, for: .normal)
    closeButton.titleLabel?.font = .systemFont(ofSize: 20, weight: .bold)
    closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    closeButton.layer.cornerRadius = 18
    closeButton.translatesAutoresizingMaskIntoConstraints = false
    closeButton.addTarget(self, action: #selector(handleClose), for: .touchUpInside)
    view.addSubview(closeButton)

    NSLayoutConstraint.activate([
      instructionBanner.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
      instructionBanner.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      instructionBanner.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
      instructionBanner.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),

      closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
      closeButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      closeButton.widthAnchor.constraint(equalToConstant: 36),
      closeButton.heightAnchor.constraint(equalToConstant: 36),

      crosshair.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      crosshair.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      crosshair.widthAnchor.constraint(equalToConstant: 20),
      crosshair.heightAnchor.constraint(equalToConstant: 20),

      liveDistanceLabel.bottomAnchor.constraint(equalTo: crosshair.topAnchor, constant: -12),
      liveDistanceLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

      resetButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
      resetButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      resetButton.widthAnchor.constraint(equalToConstant: 100),
      resetButton.heightAnchor.constraint(equalToConstant: 44),

      manualEntryButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
      manualEntryButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
      manualEntryButton.widthAnchor.constraint(equalToConstant: 140),
      manualEntryButton.heightAnchor.constraint(equalToConstant: 44),
    ])
  }

  private func setCrosshairSearching() {
    crosshair.layer.borderColor = UIColor.white.withAlphaComponent(0.4).cgColor
  }

  private func setCrosshairAligned() {
    crosshair.layer.borderColor = UIColor.systemGreen.cgColor
  }

  private func updateInstructionBanner() {
    guard currentIndex < requiredDimensions.count else { return }
    let dimension = requiredDimensions[currentIndex]
    let step = pointA == nil ? "Tap to place start point" : "Tap to place end point"
    instructionBanner.text = "\(dimension.instructionVerb): \(step)"
  }

  // MARK: - Raycasting

  /// Casts a ray from the exact center of the viewport against detected
  /// planes (falling back to ARKit's estimated planes if nothing has been
  /// detected yet), and returns the resulting world-space position.
  private func currentRaycastPosition() -> SCNVector3? {
    let center = CGPoint(x: sceneView.bounds.midX, y: sceneView.bounds.midY)
    guard let query = sceneView.raycastQuery(
      from: center,
      allowing: .estimatedPlane,
      alignment: .any
    ) else {
      return nil
    }

    guard let result = sceneView.session.raycast(query).first else {
      return nil
    }

    let t = result.worldTransform
    return SCNVector3(t.columns.3.x, t.columns.3.y, t.columns.3.z)
  }

  // MARK: - Tap handling

  @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
    guard let position = currentRaycastPosition() else {
      // No valid surface under the crosshair yet — ignore the tap rather
      // than recording garbage data.
      return
    }

    if pointA == nil {
      placePointA(at: position)
    } else {
      placePointB(at: position)
    }
  }

  private func placePointA(at position: SCNVector3) {
    pointA = position
    pointANode = addSphere(at: position, color: .systemGreen)
    updateInstructionBanner()
  }

  private func placePointB(at position: SCNVector3) {
    guard let start = pointA else { return }

    // Euclidean distance in 3D: sqrt((x2-x1)^2 + (y2-y1)^2 + (z2-z1)^2).
    // ARKit's world units are meters, so this distance is already in
    // meters — RN receives raw meters and handles unit conversion (see
    // ARMeasurementModule.ts).
    let dx = position.x - start.x
    let dy = position.y - start.y
    let dz = position.z - start.z
    let distanceMeters = Double(sqrt(dx * dx + dy * dy + dz * dz))

    let dimension = requiredDimensions[currentIndex]
    completedResults[dimension] = distanceMeters

    clearLiveLine()
    pointANode?.removeFromParentNode()
    pointANode = nil
    pointA = nil

    currentIndex += 1
    if currentIndex >= requiredDimensions.count {
      finish(with: .success(completedResults))
    } else {
      updateInstructionBanner()
    }
  }

  // MARK: - Live line while aiming for point B

  private func updateLiveLine(to endPosition: SCNVector3) {
    guard let start = pointA else { return }

    clearLiveLine()

    let lineGeometry = lineNode(from: start, to: endPosition)
    sceneView.scene.rootNode.addChildNode(lineGeometry)
    liveLineNode = lineGeometry

    let dx = endPosition.x - start.x
    let dy = endPosition.y - start.y
    let dz = endPosition.z - start.z
    let distanceMeters = sqrt(dx * dx + dy * dy + dz * dz)
    liveDistanceLabel.text = String(format: "%.2f m", distanceMeters)
  }

  private func clearLiveLine() {
    liveLineNode?.removeFromParentNode()
    liveLineNode = nil
    if pointA == nil {
      liveDistanceLabel.text = nil
    }
  }

  // MARK: - Scene helpers

  private func addSphere(at position: SCNVector3, color: UIColor) -> SCNNode {
    let sphere = SCNSphere(radius: 0.006)
    sphere.firstMaterial?.diffuse.contents = color
    sphere.firstMaterial?.lightingModel = .constant
    let node = SCNNode(geometry: sphere)
    node.position = position
    sceneView.scene.rootNode.addChildNode(node)
    return node
  }

  /// A thin cylinder stretched and rotated to connect two points — the
  /// standard SceneKit trick for drawing a "line" since SCNGeometry has no
  /// native line primitive that respects width in world space.
  private func lineNode(from start: SCNVector3, to end: SCNVector3) -> SCNNode {
    let vector = SCNVector3(end.x - start.x, end.y - start.y, end.z - start.z)
    let distance = sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z)
    let midPosition = SCNVector3(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      (start.z + end.z) / 2
    )

    let cylinder = SCNCylinder(radius: 0.0025, height: CGFloat(distance))
    cylinder.firstMaterial?.diffuse.contents = UIColor.systemGreen
    cylinder.firstMaterial?.lightingModel = .constant

    let node = SCNNode(geometry: cylinder)
    node.position = midPosition
    // SCNCylinder's height runs along its local Y axis by default, so we
    // rotate the node to point from `start` to `end`.
    node.look(at: end, up: sceneView.scene.rootNode.worldUp, localFront: node.worldUp)
    return node
  }

  // MARK: - Actions

  @objc private func handleReset() {
    clearLiveLine()
    pointANode?.removeFromParentNode()
    pointANode = nil
    pointA = nil
    updateInstructionBanner()
  }

  @objc private func handleManualEntry() {
    finish(with: .manualEntryRequested)
  }

  @objc private func handleClose() {
    finish(with: .cancelled)
  }

  // MARK: - Finishing

  private func finish(with outcome: ARMeasurementOutcome) {
    guard !didFinish else { return }
    didFinish = true

    let complete: () -> Void = { [weak self] in
      self?.completion(outcome)
    }

    if presentingViewController != nil {
      dismiss(animated: true, completion: complete)
    } else {
      complete()
    }
  }
}

// MARK: - ARSCNViewDelegate

extension ARMeasurementViewController: ARSCNViewDelegate {
  func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
    // Called ~60x/second; keep this cheap. Raycasting every frame is fine
    // since we're only intersecting against already-tracked plane anchors.
    DispatchQueue.main.async { [weak self] in
      guard let self = self, !self.didFinish else { return }

      guard let position = self.currentRaycastPosition() else {
        self.setCrosshairSearching()
        self.clearLiveLine()
        return
      }

      self.setCrosshairAligned()

      if self.pointA != nil {
        self.updateLiveLine(to: position)
      }
    }
  }
}

// MARK: - ARSessionDelegate

extension ARMeasurementViewController: ARSessionDelegate {
  func session(_ session: ARSession, didFailWithError error: Error) {
    finish(with: .failure(error.localizedDescription))
  }

  func sessionWasInterrupted(_ session: ARSession) {
    instructionBanner.text = "AR session interrupted — hold steady..."
  }

  func sessionInterruptionEnded(_ session: ARSession) {
    updateInstructionBanner()
  }
}
