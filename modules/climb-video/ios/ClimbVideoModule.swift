import ExpoModulesCore
import AVFoundation
import Vision
import CoreImage
import UIKit
import CryptoKit
import BackgroundTasks
import Photos
import PhotosUI

private let detectQueue = DispatchQueue(label: "climbdex.detect", qos: .userInitiated)
private let mediaQueue = DispatchQueue(label: "climbdex.media", qos: .userInitiated, attributes: .concurrent)

public class ClimbVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ClimbVideo")

    OnCreate {
      DispatchQueue.main.async { AppActivity.shared.start() }
    }

    AsyncFunction("trim") { (uri: String, start: Double, end: Double) async throws -> String in
      let url = try resolveURL(uri)
      let asset = AVURLAsset(url: url)
      guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
        throw Exception(name: "ExportSessionUnavailable", description: uri)
      }
      let output = FileManager.default.temporaryDirectory
        .appendingPathComponent("climbdex-\(UUID().uuidString).mov")
      session.outputURL = output
      session.outputFileType = .mov
      session.timeRange = CMTimeRange(
        start: CMTime(seconds: start, preferredTimescale: 600),
        end: CMTime(seconds: end, preferredTimescale: 600)
      )
      await session.export()
      if let error = session.error {
        throw Exception(name: "ExportFailed", description: error.localizedDescription)
      }
      return output.absoluteString
    }

    AsyncFunction("saveClip") { (uri: String) async throws -> String in
      let url = try resolveURL(uri)
      var created: String?
      try await PHPhotoLibrary.shared().performChanges {
        let request = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
        request?.creationDate = Date()
        created = request?.placeholderForCreatedAsset?.localIdentifier
      }
      return created ?? ""
    }

    AsyncFunction("thumbnails") { (uri: String, times: [Double], width: Double) throws -> [String] in
      let thumbStart = Date()
      defer { NativeLog.shared.add("thumbnails \(shortId(uri)) x\(times.count) \(ms(since: thumbStart))") }
      let url = try resolveURL(uri)
      let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
      generator.appliesPreferredTrackTransform = true
      generator.maximumSize = CGSize(width: width, height: width)
      generator.requestedTimeToleranceBefore = CMTime(seconds: 0.3, preferredTimescale: 600)
      generator.requestedTimeToleranceAfter = CMTime(seconds: 0.3, preferredTimescale: 600)
      let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("thumbs", isDirectory: true)
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let name = url.deletingPathExtension().lastPathComponent
      var out: [String] = []
      for t in times {
        let file = dir.appendingPathComponent("\(name)-\(Int(t * 1000))-\(Int(width)).jpg")
        if !FileManager.default.fileExists(atPath: file.path) {
          let image = try generator.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil)
          guard let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.7) else { continue }
          try data.write(to: file)
        }
        out.append(file.absoluteString)
      }
      return out
    }.runOnQueue(mediaQueue)

    AsyncFunction("followPath") { (uri: String, start: Double, end: Double, tracks: [[[Double]]]?) throws -> [String: Any] in
      let url = try resolveURL(uri)
      let plan = try planFollow(url: url, start: start, end: end, minConfidence: 0.3, tracks: tracks)
      return [
        "frame": ["width": plan.frame.width, "height": plan.frame.height],
        "crop": ["width": plan.crop.width, "height": plan.crop.height],
        "points": plan.keyframes.map { ["t": $0.t, "x": $0.rect.minX, "y": $0.rect.minY] },
      ]
    }.runOnQueue(mediaQueue)

    AsyncFunction("exportFollow") { (uri: String, start: Double, end: Double, tracks: [[[Double]]]?) throws -> String in
      let url = try resolveURL(uri)
      let output = FileManager.default.temporaryDirectory
        .appendingPathComponent("climbdex-follow-\(UUID().uuidString).mov")
      try exportFollow(url: url, start: start, end: end, output: output, minConfidence: 0.3, tracks: tracks)
      return output.absoluteString
    }.runOnQueue(mediaQueue)

    AsyncFunction("exportCrop") { (uri: String, start: Double, end: Double) throws -> String in
      let url = try resolveURL(uri)
      let output = FileManager.default.temporaryDirectory
        .appendingPathComponent("climbdex-crop-\(UUID().uuidString).mov")
      try exportFollow(url: url, start: start, end: end, output: output, minConfidence: 0.3, fixed: true)
      return output.absoluteString
    }.runOnQueue(mediaQueue)

    AsyncFunction("cropPlan") { (uri: String) throws -> [String: Any] in
      let url = try resolveURL(uri)
      let plan = try planFixed(url: url)
      return [
        "frame": ["width": plan.frame.width, "height": plan.frame.height],
        "crop": ["width": plan.crop.width, "height": plan.crop.height],
        "points": plan.keyframes.map { ["t": $0.t, "x": $0.rect.minX, "y": $0.rect.minY] },
      ]
    }.runOnQueue(mediaQueue)

    AsyncFunction("pickVideos") { (promise: Promise) in
      var config = PHPickerConfiguration(photoLibrary: .shared())
      config.filter = .videos
      config.selectionLimit = 0
      config.preferredAssetRepresentationMode = .current
      let picker = PHPickerViewController(configuration: config)
      let delegate = VideoPickerDelegate(promise: promise)
      VideoPickerDelegate.active = delegate
      picker.delegate = delegate
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject(Exception(name: "NoViewController", description: "화면을 찾지 못했어요"))
        return
      }
      presenter.present(picker, animated: true)
    }.runOnQueue(.main)

    AsyncFunction("resolveUri") { (uri: String) throws -> String in
      let start = Date()
      let value = try resolveURL(uri).absoluteString
      NativeLog.shared.add("resolveUri \(shortId(uri)) \(ms(since: start))")
      return value
    }.runOnQueue(mediaQueue)

    Function("drainLogs") { () -> [String] in
      NativeLog.shared.drain()
    }

    Function("releaseVideo") { (uri: String) in
      try? FileManager.default.removeItem(at: originalCopyURL(for: uri))
      try? FileManager.default.removeItem(at: checkpointURL(for: uri))
    }

    Function("cleanupOriginals") { (keep: [String]) in
      let names = Set(keep.map { originalCopyURL(for: $0).lastPathComponent })
      let files = (try? FileManager.default.contentsOfDirectory(at: originalsDir, includingPropertiesForKeys: nil)) ?? []
      for file in files where !names.contains(file.lastPathComponent) { try? FileManager.default.removeItem(at: file) }
    }

    Function("cancelDetect") { (uri: String) in
      DetectCancels.shared.add(uri)
      try? FileManager.default.removeItem(at: checkpointURL(for: uri))
    }

    Function("startBackgroundRun") { (title: String, subtitle: String, totalSeconds: Double) -> Bool in
      BackgroundRun.shared.start(title: title, subtitle: subtitle, totalSeconds: totalSeconds)
    }

    Function("updateBackgroundRun") { (completedSeconds: Double, subtitle: String) in
      BackgroundRun.shared.setBase(completedSeconds: completedSeconds, subtitle: subtitle)
    }

    Function("finishBackgroundRun") { (success: Bool) in
      BackgroundRun.shared.finish(success: success)
    }

    Function("backgroundRunActive") { () -> Bool in
      BackgroundRun.shared.isActive
    }

    AsyncFunction("detect") { (uri: String) throws -> [String: Any] in
      let url = try resolveURL(uri)
      let params = Params()
      DetectCancels.shared.clear(uri)
      let (rawPeople, _, shift) = try sample(url: url, fps: 5, minConfidence: 0.3, checkpoint: checkpointURL(for: uri), cancelKey: uri)
      let people = rawPeople.map { dropStatic($0) }
      let handheld = shift > params.handheldShift
      var all: [(Segment, Int)] = []
      for (n, samples) in people.enumerated() where samples.count >= Int(params.minDuration * 5) {
        for seg in handheld ? presenceSegments(samples, params) : segments(samples, params, others: people.enumerated().filter { $0.offset != n }.flatMap { $0.element }) { all.append((seg, n)) }
      }
      all.sort { $0.0.start < $1.0.start }
      var merged: [(Segment, Int)] = []
      for item in all {
        if let last = merged.last,
       (item.0.start <= last.0.end && (item.1 == last.1 || sameSpot(people[item.1], people[last.1], from: item.0.start, to: min(item.0.end, last.0.end))))
       || (item.0.start > last.0.end && item.0.start - last.0.end < params.handoffGap && handoff(people[last.1], people[item.1], aEnd: last.0.end, bStart: item.0.start)) {
          merged[merged.count - 1] = (Segment(start: last.0.start, end: max(last.0.end, item.0.end)), last.1)
        } else {
          merged.append(item)
        }
      }
      let resolved = resolveClips(people, merged)
      return [
        "handheld": handheld,
        "segments": resolved.confident.map { ["start": $0.start, "end": $0.end] },
        "candidates": resolved.low.map { ["start": $0.start, "end": $0.end] },
        "tracks": tracksPayload(people),
      ]
    }.runOnQueue(detectQueue)
  }
}

struct Sample: Codable {
  let t: Double
  let ankleY: Double
  let torso: Double?
  var x: Double = 0
  var y: Double = 0
}

struct Segment { let start: Double; let end: Double }

func orientation(for t: CGAffineTransform) -> CGImagePropertyOrientation {
  if t.a == 0 && t.b == 1 && t.c == -1 && t.d == 0 { return .right }
  if t.a == 0 && t.b == -1 && t.c == 1 && t.d == 0 { return .left }
  if t.a == -1 && t.b == 0 && t.c == 0 && t.d == -1 { return .down }
  return .up
}

struct Candidate {
  let ankleY: Double
  let torso: Double
  let x: Double
  let y: Double
  let confidence: Double
}

let tiles: [CGRect] = [
  CGRect(x: 0, y: 0, width: 0.6, height: 0.6), CGRect(x: 0.4, y: 0, width: 0.6, height: 0.6),
  CGRect(x: 0, y: 0.4, width: 0.6, height: 0.6), CGRect(x: 0.4, y: 0.4, width: 0.6, height: 0.6),
]

func candidates(_ pixel: CVPixelBuffer, _ orient: CGImagePropertyOrientation, _ roi: CGRect?, aspect: Double, minConfidence: Float) throws -> [Candidate] {
  let request = VNDetectHumanBodyPoseRequest()
  if let roi = roi { request.regionOfInterest = roi }
  try VNImageRequestHandler(cvPixelBuffer: pixel, orientation: orient, options: [:]).perform([request])
  let box = roi ?? CGRect(x: 0, y: 0, width: 1, height: 1)
  var out: [Candidate] = []
  for person in request.results ?? [] {
    let pts = try person.recognizedPoints(.all)
    let ankles = [pts[.leftAnkle], pts[.rightAnkle]].compactMap { $0 }.filter { $0.confidence > minConfidence }
    guard let ankle = ankles.map({ Double($0.y) }).min(),
          let root = pts[.root], root.confidence > minConfidence,
          let neck = pts[.neck], neck.confidence > minConfidence else { continue }
    let dx = Double(neck.x - root.x) * Double(box.width) * aspect
    let dy = Double(neck.y - root.y) * Double(box.height)
    let torso = (dx * dx + dy * dy).squareRoot()
    out.append(Candidate(
      ankleY: Double(box.minY) + ankle * Double(box.height),
      torso: torso,
      x: Double(box.minX) + Double(root.x) * Double(box.width),
      y: Double(box.minY) + Double(root.y) * Double(box.height),
      confidence: Double(person.confidence)))
  }
  return out
}

final class Track {
  var x: Double
  var y: Double
  var torso: Double
  var torsos: [Double]
  var lastT: Double
  var samples: [Sample] = []
  init(_ c: Candidate, t: Double) { x = c.x; y = c.y; torso = c.torso; torsos = [c.torso]; lastT = t }
  init(_ s: TrackState) { x = s.x; y = s.y; torso = s.torso; torsos = [s.torso]; lastT = s.lastT; samples = s.samples }
  var state: TrackState { TrackState(x: x, y: y, torso: torso, lastT: lastT, samples: samples) }
  var torsoMedian: Double { median(torsos) }
  func update(_ c: Candidate, t: Double) {
    x = c.x; y = c.y; torso = c.torso; lastT = t
    torsos.append(c.torso)
    if torsos.count > 5 { torsos.removeFirst() }
  }
}

struct TrackState: Codable {
  let x: Double
  let y: Double
  let torso: Double
  let lastT: Double
  let samples: [Sample]
}

struct Checkpoint: Codable {
  static let version = 1
  let version: Int
  let nextT: Double
  let nextMotionT: Double
  let last: Double
  let shifts: [Double]
  let tracks: [TrackState]
}

final class AppActivity {
  static let shared = AppActivity()
  private let lock = NSLock()
  private var background = false
  private var observers: [NSObjectProtocol] = []

  func start() {
    guard observers.isEmpty else { return }
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil) { [weak self] _ in self?.set(true) })
    observers.append(center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: nil) { [weak self] _ in self?.set(false) })
  }

  private func set(_ value: Bool) {
    lock.lock(); background = value; lock.unlock()
  }

  var isBackground: Bool {
    lock.lock(); defer { lock.unlock() }
    return background
  }
}

final class DetectCancels {
  static let shared = DetectCancels()
  private let lock = NSLock()
  private var keys = Set<String>()
  func add(_ key: String) { lock.lock(); keys.insert(key); lock.unlock() }
  func clear(_ key: String) { lock.lock(); keys.remove(key); lock.unlock() }
  func has(_ key: String) -> Bool { lock.lock(); defer { lock.unlock() }; return keys.contains(key) }
}

final class ResolvedURLs {
  static let shared = ResolvedURLs()
  private let lock = NSLock()
  private var cache: [String: URL] = [:]
  private var gates: [String: NSLock] = [:]
  func gate(_ key: String) -> NSLock { lock.lock(); defer { lock.unlock() }; if let g = gates[key] { return g }; let g = NSLock(); gates[key] = g; return g }
  func get(_ key: String) -> URL? { lock.lock(); defer { lock.unlock() }; return cache[key] }
  func set(_ key: String, _ url: URL) { lock.lock(); cache[key] = url; lock.unlock() }
}

func peopleFrom(_ tracks: [[[Double]]]?, start: Double, end: Double) -> [[Sample]]? {
  guard let tracks = tracks else { return nil }
  let people = tracks.map { track in
    track.compactMap { v -> Sample? in
      guard v.count >= 5, v[0] >= start, v[0] <= end else { return nil }
      return Sample(t: v[0], ankleY: v[4], torso: v[3] > 0 ? v[3] : nil, x: v[1], y: v[2])
    }
  }
  guard let best = people.max(by: { $0.count < $1.count }), best.count >= 3 else { return nil }
  return people
}

func tracksPayload(_ people: [[Sample]]) -> [[[Double]]] {
  func r(_ v: Double) -> Double { (v * 1000).rounded() / 1000 }
  return people.map { $0.map { [r($0.t), r($0.x), r($0.y), r($0.torso ?? 0), r($0.ankleY)] } }
}

let originalsDir: URL = {
  let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("icloud-originals", isDirectory: true)
  try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  return dir
}()

func originalCopyURL(for uri: String) -> URL {
  let hash = SHA256.hash(data: Data(uri.utf8)).map { String(format: "%02x", $0) }.joined()
  return originalsDir.appendingPathComponent("\(hash.prefix(32)).mov")
}

final class NativeLog {
  static let shared = NativeLog()
  private let lock = NSLock()
  private var lines: [String] = []
  func add(_ line: String) { lock.lock(); lines.append(line); if lines.count > 200 { lines.removeFirst(lines.count - 200) }; lock.unlock() }
  func drain() -> [String] { lock.lock(); defer { lines.removeAll(); lock.unlock() }; return lines }
}

func ms(since start: Date) -> String { String(format: "%.0fms", Date().timeIntervalSince(start) * 1000) }

func shortId(_ uri: String) -> String { String(uri.suffix(14)) }

func resolveURL(_ uri: String) throws -> URL {
  guard uri.hasPrefix("ph://") else {
    guard let url = URL(string: uri) else { throw Exception(name: "InvalidUri", description: uri) }
    return url
  }
  let gate = ResolvedURLs.shared.gate(uri)
  gate.lock()
  defer { gate.unlock() }
  let began = Date()
  if let cached = ResolvedURLs.shared.get(uri) {
    if FileManager.default.isReadableFile(atPath: cached.path) { return cached }
    NativeLog.shared.add("resolve \(shortId(uri)) memory cache unreadable: \(cached.lastPathComponent)")
  }
  let kept = originalCopyURL(for: uri)
  if FileManager.default.isReadableFile(atPath: kept.path) {
    ResolvedURLs.shared.set(uri, kept)
    NativeLog.shared.add("resolve \(shortId(uri)) kept copy \(ms(since: began))")
    return kept
  }
  let id = String(uri.dropFirst(5))
  guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
    throw Exception(name: "AssetMissing", description: "사진 앱에서 영상을 찾을 수 없어요")
  }
  func request(_ version: PHVideoRequestOptionsVersion, network: Bool) -> (URL?, Error?) {
    let options = PHVideoRequestOptions()
    options.isNetworkAccessAllowed = network
    options.deliveryMode = .highQualityFormat
    options.version = version
    let done = DispatchSemaphore(value: 0)
    var found: URL? = nil
    var failure: Error? = nil
    PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { avAsset, _, info in
      found = (avAsset as? AVURLAsset)?.url
      failure = info?[PHImageErrorKey] as? Error
      done.signal()
    }
    done.wait()
    return (found, failure)
  }
  var (url, error) = request(.current, network: false)
  if url == nil { (url, _) = request(.original, network: false) }
  if let local = url {
    ResolvedURLs.shared.set(uri, local)
    NativeLog.shared.add("resolve \(shortId(uri)) on device \(ms(since: began))")
    return local
  }
  NativeLog.shared.add("resolve \(shortId(uri)) not on device, downloading")
  (url, error) = request(.current, network: true)
  if url == nil, error == nil { (url, error) = request(.original, network: true) }
  guard let downloaded = url else {
    NativeLog.shared.add("resolve \(shortId(uri)) download failed \(ms(since: began)): \(error?.localizedDescription ?? "no url")")
    throw Exception(name: "DownloadFailed", description: "영상을 받지 못했어요\(error.map { ": \($0.localizedDescription)" } ?? "")")
  }
  NativeLog.shared.add("resolve \(shortId(uri)) downloaded \(ms(since: began)) at \(downloaded.path)")
  let copyStart = Date()
  do {
    try? FileManager.default.removeItem(at: kept)
    try FileManager.default.copyItem(at: downloaded, to: kept)
    ResolvedURLs.shared.set(uri, kept)
    NativeLog.shared.add("resolve \(shortId(uri)) kept copy saved \(ms(since: copyStart))")
    return kept
  } catch {
    NativeLog.shared.add("resolve \(shortId(uri)) keep copy failed: \(error.localizedDescription)")
    ResolvedURLs.shared.set(uri, downloaded)
    return downloaded
  }
}

final class VideoPickerDelegate: NSObject, PHPickerViewControllerDelegate {
  static var active: VideoPickerDelegate? = nil
  let promise: Promise
  init(promise: Promise) { self.promise = promise }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    let ids = results.compactMap { $0.assetIdentifier }
    let fetched = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
    var byId: [String: PHAsset] = [:]
    fetched.enumerateObjects { asset, _, _ in byId[asset.localIdentifier] = asset }
    let items: [[String: Any]] = ids.compactMap { id in
      guard let asset = byId[id] else { return nil }
      let name = PHAssetResource.assetResources(for: asset).first?.originalFilename
      var item: [String: Any] = [
        "uri": "ph://\(id)",
        "assetId": id,
        "duration": asset.duration,
        "width": asset.pixelWidth,
        "height": asset.pixelHeight,
      ]
      if let name = name { item["fileName"] = name }
      if let created = asset.creationDate { item["createdAt"] = created.timeIntervalSince1970 * 1000 }
      return item
    }
    promise.resolve(items)
    VideoPickerDelegate.active = nil
  }
}

final class BackgroundRun {
  static let shared = BackgroundRun()
  static let prefix = "com.climbdex.app.detect"
  private let lock = NSLock()
  private var task: AnyObject? = nil
  private var pendingId: String? = nil
  private var expired = false
  private var baseUnits: Int64 = 0
  private var totalUnits: Int64 = 1
  private var wildcardRegistered = false

  var isActive: Bool {
    lock.lock(); defer { lock.unlock() }
    return (task != nil || pendingId != nil) && !expired
  }

  func start(title: String, subtitle: String, totalSeconds: Double) -> Bool {
    guard #available(iOS 26.0, *) else { return false }
    lock.lock()
    if task != nil || pendingId != nil { lock.unlock(); return !expired }
    expired = false
    baseUnits = 0
    totalUnits = max(1, Int64(totalSeconds * 10))
    let id = "\(BackgroundRun.prefix).\(UUID().uuidString.prefix(8))"
    pendingId = id
    lock.unlock()

    let handler: (BGTask) -> Void = { [weak self] bgTask in
      guard let self = self, let continued = bgTask as? BGContinuedProcessingTask else {
        bgTask.setTaskCompleted(success: false)
        return
      }
      self.lock.lock()
      self.task = continued
      self.pendingId = nil
      continued.progress.totalUnitCount = self.totalUnits
      continued.progress.completedUnitCount = self.baseUnits
      self.lock.unlock()
      continued.expirationHandler = { [weak self] in
        guard let self = self else { return }
        self.lock.lock(); self.expired = true; self.task = nil; self.lock.unlock()
        continued.setTaskCompleted(success: false)
      }
    }
    var registered = BGTaskScheduler.shared.register(forTaskWithIdentifier: id, using: nil, launchHandler: handler)
    if !registered {
      lock.lock()
      let need = !wildcardRegistered
      wildcardRegistered = true
      lock.unlock()
      registered = need ? BGTaskScheduler.shared.register(forTaskWithIdentifier: "\(BackgroundRun.prefix).*", using: nil, launchHandler: handler) : true
    }
    let request = BGContinuedProcessingTaskRequest(identifier: id, title: title, subtitle: subtitle)
    request.strategy = .queue
    do {
      try BGTaskScheduler.shared.submit(request)
      return true
    } catch {
      lock.lock(); pendingId = nil; lock.unlock()
      return false
    }
  }

  func setBase(completedSeconds: Double, subtitle: String?) {
    lock.lock()
    baseUnits = Int64(completedSeconds * 10)
    let current = task
    let total = totalUnits
    lock.unlock()
    guard #available(iOS 26.0, *), let continued = current as? BGContinuedProcessingTask else { return }
    continued.progress.totalUnitCount = total
    continued.progress.completedUnitCount = min(total, baseUnits)
    if let subtitle = subtitle { continued.updateTitle(continued.title, subtitle: subtitle) }
  }

  func report(videoSeconds: Double) {
    lock.lock()
    let current = task
    let units = min(totalUnits, baseUnits + Int64(videoSeconds * 10))
    lock.unlock()
    guard #available(iOS 26.0, *), let continued = current as? BGContinuedProcessingTask else { return }
    if units > continued.progress.completedUnitCount { continued.progress.completedUnitCount = units }
  }

  func finish(success: Bool) {
    lock.lock()
    let current = task
    task = nil
    pendingId = nil
    expired = false
    lock.unlock()
    guard #available(iOS 26.0, *), let continued = current as? BGContinuedProcessingTask else { return }
    continued.progress.completedUnitCount = continued.progress.totalUnitCount
    continued.setTaskCompleted(success: success)
  }
}

func checkpointURL(for uri: String) -> URL {
  let hash = SHA256.hash(data: Data(uri.utf8)).map { String(format: "%02x", $0) }.joined()
  let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("detect-checkpoints", isDirectory: true)
  try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  return dir.appendingPathComponent("\(hash.prefix(32)).json")
}

func interrupted() -> Exception {
  Exception(name: "Interrupted", description: "앱이 백그라운드로 가서 멈췄어요. 돌아오면 이어서 해요")
}

func sample(url: URL, fps: Double, minConfidence: Float, from: Double? = nil, to: Double? = nil, checkpoint: URL? = nil, cancelKey: String? = nil) throws -> ([[Sample]], Double, Double) {
  var resumed: Checkpoint? = nil
  if let checkpoint = checkpoint, let data = try? Data(contentsOf: checkpoint),
     let saved = try? JSONDecoder().decode(Checkpoint.self, from: data), saved.version == Checkpoint.version {
    resumed = saved
  }
  let asset = AVURLAsset(url: url)
  guard let track = asset.tracks(withMediaType: .video).first else { throw Exception(name: "NoVideoTrack", description: url.absoluteString) }
  let reader = try AVAssetReader(asset: asset)
  if let from = from, let to = to {
    reader.timeRange = CMTimeRange(start: CMTime(seconds: from, preferredTimescale: 600), end: CMTime(seconds: to, preferredTimescale: 600))
  } else if let resumed = resumed {
    reader.timeRange = CMTimeRange(start: CMTime(seconds: max(0, resumed.nextT - 0.05), preferredTimescale: 600), end: asset.duration)
  }
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  ])
  output.alwaysCopiesSampleData = true
  reader.add(output)
  reader.startReading()

  let orient = orientation(for: track.preferredTransform)
  let size = track.naturalSize.applying(track.preferredTransform)
  let aspect = abs(size.width / size.height)
  let width = Double(track.naturalSize.width)
  let batchSize = 8
  let followRadius = 0.25
  let maxRadius = 0.4
  let torsoBand = 0.6...1.7
  let trackTimeout = 10.0

  var nextT = resumed?.nextT ?? from ?? 0.0
  var nextMotionT = resumed?.nextMotionT ?? from ?? 0.0
  var last = resumed?.last ?? 0.0
  var previous: CVPixelBuffer? = nil
  var shifts: [Double] = resumed?.shifts ?? []
  var tracks: [Track] = resumed?.tracks.map { Track($0) } ?? []
  var batch: [(t: Double, pixel: CVPixelBuffer)] = []
  var savedAt = nextT

  func save(resumeAt: Double) {
    guard let checkpoint = checkpoint else { return }
    let state = Checkpoint(version: Checkpoint.version, nextT: resumeAt, nextMotionT: nextMotionT, last: last, shifts: shifts, tracks: tracks.map { $0.state })
    if let data = try? JSONEncoder().encode(state) { try? data.write(to: checkpoint, options: .atomic) }
  }

  func stop() -> Exception {
    save(resumeAt: batch.first?.t ?? nextT)
    return interrupted()
  }

  func flush() throws {
    guard !batch.isEmpty else { return }
    if let key = cancelKey, DetectCancels.shared.has(key) {
      if let checkpoint = checkpoint { try? FileManager.default.removeItem(at: checkpoint) }
      DetectCancels.shared.clear(key)
      throw Exception(name: "Cancelled", description: "삭제된 영상이라 멈췄어요")
    }
    if checkpoint != nil, AppActivity.shared.isBackground, !BackgroundRun.shared.isActive { throw stop() }
    var found = [[Candidate]](repeating: [], count: batch.count)
    var visionFailed = false
    let lock = NSLock()
    DispatchQueue.concurrentPerform(iterations: batch.count) { i in
      do {
        var list = try candidates(batch[i].pixel, orient, nil, aspect: aspect, minConfidence: minConfidence)
        if list.isEmpty {
          list = try tiles.flatMap { try candidates(batch[i].pixel, orient, $0, aspect: aspect, minConfidence: minConfidence) }
        }
        lock.lock(); found[i] = list; lock.unlock()
      } catch {
        lock.lock(); visionFailed = true; lock.unlock()
      }
    }
    if visionFailed, checkpoint != nil { throw stop() }
    for i in batch.indices {
      let t = batch[i].t
      var taken = Set<Int>()
      var unique: [Candidate] = []
      for c in found[i].sorted(by: { $0.confidence > $1.confidence }) {
        let duplicate = unique.contains { ((c.x - $0.x) * (c.x - $0.x) + (c.y - $0.y) * (c.y - $0.y)).squareRoot() < 0.1 }
        if !duplicate { unique.append(c) }
      }
      for c in unique {
        var best: Int? = nil
        var bestScore = Double.infinity
        for (n, tr) in tracks.enumerated() where !taken.contains(n) && t - tr.lastT <= trackTimeout && (torsoBand.contains(c.torso / tr.torso) || torsoBand.contains(c.torso / tr.torsoMedian)) {
          let dist = ((c.x - tr.x) * (c.x - tr.x) + (c.y - tr.y) * (c.y - tr.y)).squareRoot()
          let base = min(followRadius, max(0.08, 3.0 * tr.torso))
          let radius = min(maxRadius, base + 0.1 * (t - tr.lastT))
          if dist <= radius, dist / radius < bestScore { best = n; bestScore = dist / radius }
        }
        let tr: Track
        if let n = best {
          tr = tracks[n]
          taken.insert(n)
        } else {
          tr = Track(c, t: t)
          tracks.append(tr)
          taken.insert(tracks.count - 1)
        }
        tr.update(c, t: t)
        tr.samples.append(Sample(t: t, ankleY: c.ankleY, torso: c.torso, x: c.x, y: c.y))
      }
    }
    batch.removeAll()
    if checkpoint != nil { BackgroundRun.shared.report(videoSeconds: nextT) }
    if checkpoint != nil, nextT - savedAt >= 30 {
      save(resumeAt: nextT)
      savedAt = nextT
    }
  }

  while let buffer = output.copyNextSampleBuffer() {
    let t = CMSampleBufferGetPresentationTimeStamp(buffer).seconds
    last = t
    if t + 1e-6 < nextT { continue }
    nextT += 1.0 / fps
    guard let pixel = CMSampleBufferGetImageBuffer(buffer) else { continue }
    if t + 1e-6 >= nextMotionT {
      nextMotionT += 1.0
      if let previous = previous {
        let registration = VNTranslationalImageRegistrationRequest(targetedCVPixelBuffer: pixel, options: [:])
        try? VNImageRequestHandler(cvPixelBuffer: previous, options: [:]).perform([registration])
        if let move = registration.results?.first?.alignmentTransform {
          shifts.append(Double(move.tx * move.tx + move.ty * move.ty).squareRoot() / width)
        }
      }
      previous = pixel
    }
    batch.append((t, pixel))
    if batch.count >= batchSize { try flush() }
  }
  if reader.status == .failed {
    if checkpoint != nil { throw stop() }
    throw reader.error ?? NSError(domain: "detect", code: 2, userInfo: [NSLocalizedDescriptionKey: "reader failed"])
  }
  try flush()
  if let checkpoint = checkpoint { try? FileManager.default.removeItem(at: checkpoint) }
  return (tracks.map { $0.samples }, last, median(shifts))
}

func median(_ xs: [Double]) -> Double {
  let s = xs.sorted()
  return s.isEmpty ? 0 : s[s.count / 2]
}

func dropStatic(_ samples: [Sample], minSpan: Double = 8.0, tolerance: Double = 0.005) -> [Sample] {
  var keep: [Sample] = []
  var i = 0
  while i < samples.count {
    var j = i
    while j + 1 < samples.count, abs(samples[j + 1].x - samples[i].x) <= tolerance, abs(samples[j + 1].y - samples[i].y) <= tolerance { j += 1 }
    if samples[j].t - samples[i].t < minSpan { keep += samples[i...j] }
    i = j + 1
  }
  return keep
}

func resolveClips(_ people: [[Sample]], _ merged: [(Segment, Int)], lowGap: Double = 3.0) -> (confident: [Segment], low: [Segment]) {
  var spans: [(seg: Segment, n: Int)] = []
  do {
    var reference: [Double] = []
    for samples in people {
      for s in samples where merged.contains(where: { s.t >= $0.0.start && s.t <= $0.0.end }) {
        if let torso = s.torso { reference.append(torso) }
      }
    }
    let ref = median(reference)
    for (n, samples) in people.enumerated() {
      var i = 0
      while i < samples.count {
        var j = i
        while j + 1 < samples.count, samples[j + 1].t - samples[j].t <= 3.0 { j += 1 }
        let start = samples[i].t, end = samples[j].t
        if end - start >= 8.0 {
          let covered = merged.reduce(0.0) { $0 + max(0, min(end, $1.0.end) - max(start, $1.0.start)) }
          let torsos = samples[i...j].compactMap { $0.torso }
          let sizeOk = ref <= 0 || torsos.isEmpty || (0.6...1.7).contains(median(torsos) / ref)
          if covered < 0.5 * (end - start), sizeOk { spans.append((Segment(start: start, end: end), n)) }
        }
        i = j + 1
      }
    }
  }
  spans.sort { $0.seg.start < $1.seg.start }
  var low: [(seg: Segment, first: Int, last: Int, ids: Set<Int>)] = []
  for item in spans {
    if var prev = low.last, item.seg.start - prev.seg.end <= lowGap,
       item.n == prev.last || handoff(people[prev.last], people[item.n], aEnd: prev.seg.end, bStart: item.seg.start) {
      prev.seg = Segment(start: prev.seg.start, end: max(prev.seg.end, item.seg.end))
      prev.last = item.n
      prev.ids.insert(item.n)
      low[low.count - 1] = prev
    } else {
      low.append((item.seg, item.n, item.n, [item.n]))
    }
  }
  var confident = merged
  var remaining: [Segment] = []
  for item in low {
    if let k = confident.firstIndex(where: { (item.ids.contains($0.1) || (item.seg.start >= $0.0.start && item.seg.start - $0.0.end <= 1.0 && handoff(people[$0.1], people[item.first], aEnd: $0.0.end, bStart: item.seg.start))) && (min(item.seg.end, $0.0.end) > max(item.seg.start, $0.0.start) || item.seg.start >= $0.0.end) }) {
      let c = confident[k].0
      confident[k].0 = Segment(start: min(c.start, item.seg.start), end: max(c.end, item.seg.end))
    } else {
      remaining.append(item.seg)
    }
  }
  return (confident.map { $0.0 }, remaining)
}

func candidateSpans(_ people: [[Sample]], confident: [Segment], minSpan: Double = 8.0, maxGap: Double = 3.0) -> [Segment] {
  var reference: [Double] = []
  for samples in people {
    for s in samples where confident.contains(where: { s.t >= $0.start && s.t <= $0.end }) {
      if let torso = s.torso { reference.append(torso) }
    }
  }
  let ref = median(reference)
  var result: [Segment] = []
  for samples in people {
    var i = 0
    while i < samples.count {
      var j = i
      while j + 1 < samples.count, samples[j + 1].t - samples[j].t <= maxGap { j += 1 }
      let start = samples[i].t, end = samples[j].t
      if end - start >= minSpan {
        let covered = confident.reduce(0.0) { $0 + max(0, min(end, $1.end) - max(start, $1.start)) }
        let torsos = samples[i...j].compactMap { $0.torso }
        let sizeOk = ref <= 0 || torsos.isEmpty || (0.6...1.7).contains(median(torsos) / ref)
        if covered < 0.5 * (end - start), sizeOk { result.append(Segment(start: start, end: end)) }
      }
      i = j + 1
    }
  }
  return result.sorted { $0.start < $1.start }
}

func handoff(_ a: [Sample], _ b: [Sample], aEnd: Double, bStart: Double) -> Bool {
  guard let pa = a.last(where: { $0.t <= aEnd + 0.01 }), let pb = b.first(where: { $0.t >= bStart - 0.01 }) else { return false }
  let gap = max(0, pb.t - pa.t)
  let dist = ((pa.x - pb.x) * (pa.x - pb.x) + (pa.y - pb.y) * (pa.y - pb.y)).squareRoot()
  return dist <= min(0.4, 0.25 + 0.1 * gap)
}

func sameSpot(_ a: [Sample], _ b: [Sample], from: Double, to: Double) -> Bool {
  var j = 0
  var dists: [Double] = []
  for s in a where s.t >= from && s.t <= to {
    while j < b.count, b[j].t < s.t - 0.15 { j += 1 }
    if j < b.count, abs(b[j].t - s.t) <= 0.15 {
      dists.append(((s.x - b[j].x) * (s.x - b[j].x) + (s.y - b[j].y) * (s.y - b[j].y)).squareRoot())
    }
  }
  return dists.count >= 5 && median(dists) < 0.15
}

struct Params {
  var low = 0.02
  var minRise = 0.12
  var minDuration = 3.0
  var maxGap = 10.0
  var mergeGap = 5.0
  var bin = 0.02
  var groundTime = 1.0
  var torsoBand = 0.5...2.0
  var groundReach = 15.0
  var handheldShift = 0.05
  var startGround = 4.0
  var handoffGap = 1.0
}

func presenceSegments(_ d: [Sample], _ p: Params) -> [Segment] {
  var result: [Segment] = []
  var i = 0
  while i < d.count {
    var j = i
    while j + 1 < d.count, d[j + 1].t - d[j].t <= p.maxGap { j += 1 }
    if d[j].t - d[i].t >= p.minDuration { result.append(Segment(start: d[i].t, end: d[j].t)) }
    i = j + 1
  }
  return result
}

func groundLevel(_ ys: [Double], _ p: Params) -> Double {
  let sorted = ys.sorted()
  let need = max(5, sorted.count / 20)
  var lo = sorted.first ?? 0
  while lo <= (sorted.last ?? 0) {
    if sorted.filter({ $0 >= lo && $0 < lo + 2 * p.bin }).count >= need { break }
    lo += p.bin
  }
  return median(sorted.filter { $0 >= lo && $0 < lo + 2 * p.bin })
}

func segments(_ d: [Sample], _ p: Params, others: [Sample] = []) -> [Segment] {
  func sameDistance(_ torso: Double?, _ ref: Double) -> Bool {
    guard let torso = torso, ref > 0 else { return true }
    return p.torsoBand.contains(torso / ref)
  }
  let globalGround = groundLevel(d.map { $0.ankleY }, p)
  var result: [Segment] = []
  var i = 0
  while i < d.count {
    guard d[i].ankleY - globalGround > p.minRise else { i += 1; continue }
    var h = i
    while h + 1 < d.count, d[h + 1].ankleY - globalGround > p.minRise, d[h + 1].t - d[h].t <= p.maxGap { h += 1 }
    let refTorso = median(d[i...h].compactMap { $0.torso })
    let near = d.filter { $0.t >= d[i].t - p.groundReach && $0.t <= d[h].t + p.groundReach && sameDistance($0.torso, refTorso) }
    let ground = groundLevel(near.map { $0.ankleY }, p)
    let rise = d.map { $0.ankleY - ground }
    var startGround = ground
    do {
      let before = d.filter { $0.t < d[i].t }.map { $0.ankleY }
      let after = d.filter { $0.t > d[h].t }.map { $0.ankleY }
      let similar = others.filter { sameDistance($0.torso, refTorso) }.map { $0.ankleY }
      let source = before.count >= 5 ? before : after.count >= 5 ? after : similar.count >= 5 ? similar : []
      if !source.isEmpty { startGround = min(ground, groundLevel(source, p)) }
    }
    let riseStart = d.map { $0.ankleY - startGround }

    var k = i
    var b = i
    var groundFrom: Double? = nil
    while b > 0, d[b].t - d[b - 1].t <= p.maxGap {
      b -= 1
      if riseStart[b] > p.low {
        k = b
        groundFrom = nil
      } else if let from = groundFrom {
        if from - d[b].t >= p.startGround { break }
      } else {
        groundFrom = d[b].t
        if p.startGround <= 0 { break }
      }
    }
    let startIdx = k > 0 && d[k].t - d[k - 1].t <= p.maxGap ? k - 1 : k

    var j = h
    var groundSince: Double? = nil
    var e = h
    while e + 1 < d.count, d[e + 1].t - d[e].t <= p.maxGap {
      e += 1
      if rise[e] > p.low {
        j = e
        groundSince = nil
      } else if let since = groundSince {
        if d[e].t - since >= p.groundTime { break }
      } else {
        groundSince = d[e].t
      }
    }
    let endIdx = j + 1 < d.count && d[j + 1].t - d[j].t <= p.maxGap ? j + 1 : j

    let start = d[startIdx].t, end = d[endIdx].t
    if let last = result.last, start - last.end < p.mergeGap {
      result[result.count - 1] = Segment(start: last.start, end: end)
    } else if end - start >= p.minDuration {
      result.append(Segment(start: start, end: end))
    }
    i = j + 1
  }
  return result
}


struct FollowPath {
  let points: [(t: Double, x: Double, y: Double)]

  init(_ samples: [Sample], window: Double) {
    points = samples.map { s in
      let near = samples.filter { abs($0.t - s.t) <= window }
      return (s.t, near.map { $0.x }.reduce(0, +) / Double(near.count), near.map { $0.y }.reduce(0, +) / Double(near.count))
    }
  }

  func position(at t: Double) -> (x: Double, y: Double) {
    guard let first = points.first, let last = points.last else { return (0.5, 0.5) }
    if t <= first.t { return (first.x, first.y) }
    if t >= last.t { return (last.x, last.y) }
    var i = 0
    while i + 1 < points.count, points[i + 1].t < t { i += 1 }
    let a = points[i], b = points[i + 1]
    let f = (t - a.t) / max(1e-6, b.t - a.t)
    return (a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f)
  }
}

func followCropSize(frame: CGSize, torso: Double) -> CGSize {
  let fraction = min(1.0, max(0.45, torso * 5.5 / 0.55))
  var h = frame.height * fraction
  var w = h * 9 / 16
  if w > frame.width {
    w = frame.width
    h = w * 16 / 9
    if h > frame.height {
      h = frame.height
      w = h * 9 / 16
    }
  }
  return CGSize(width: w, height: h)
}

func followRect(frame: CGSize, crop: CGSize, center: (x: Double, y: Double)) -> CGRect {
  let cx = center.x * frame.width
  let cy = (1 - center.y) * frame.height
  var x = cx - crop.width / 2
  var y = cy - crop.height * 0.55
  x = min(max(0, x), frame.width - crop.width)
  y = min(max(0, y), frame.height - crop.height)
  return CGRect(x: x, y: y, width: crop.width, height: crop.height)
}

struct FollowPlan {
  let frame: CGSize
  let crop: CGSize
  let path: FollowPath
  let keyframes: [(t: Double, rect: CGRect)]
}

func planFollow(url: URL, start: Double, end: Double, minConfidence: Float, tracks: [[[Double]]]? = nil) throws -> FollowPlan {
  let people = try peopleFrom(tracks, start: start, end: end) ?? sample(url: url, fps: 5, minConfidence: minConfidence, from: start, to: end).0
  guard let person = people.max(by: { $0.count < $1.count }), person.count >= 3 else {
    throw Exception(name: "NoPerson", description: "구간 안에서 사람을 못 찾았어요")
  }
  let path = FollowPath(person, window: 0.75)
  let torso = median(person.compactMap { $0.torso })
  let asset = AVURLAsset(url: url)
  guard let videoTrack = asset.tracks(withMediaType: .video).first else { throw Exception(name: "NoVideoTrack", description: url.absoluteString) }
  let frame = orientedFrame(videoTrack)
  let crop = followCropSize(frame: frame, torso: torso)
  let keyframes = path.points.map { ($0.t, followRect(frame: frame, crop: crop, center: ($0.x, $0.y))) }
  return FollowPlan(frame: frame, crop: crop, path: path, keyframes: keyframes)
}

extension FollowPath {
  init(center x: Double, _ y: Double) { points = [(0, x, y)] }
}

func fixedCropSize(frame: CGSize) -> CGSize {
  var h = frame.height
  var w = h * 9 / 16
  if w > frame.width {
    w = frame.width
    h = w * 16 / 9
  }
  return CGSize(width: w, height: h)
}

func orientedFrame(_ track: AVAssetTrack) -> CGSize {
  let oriented = track.naturalSize.applying(track.preferredTransform)
  return CGSize(width: abs(oriented.width), height: abs(oriented.height))
}

func planFixed(url: URL) throws -> FollowPlan {
  let asset = AVURLAsset(url: url)
  guard let videoTrack = asset.tracks(withMediaType: .video).first else { throw Exception(name: "NoVideoTrack", description: url.absoluteString) }
  let frame = orientedFrame(videoTrack)
  let crop = fixedCropSize(frame: frame)
  return FollowPlan(frame: frame, crop: crop, path: FollowPath(center: 0.5, 0.5), keyframes: [(0, followRect(frame: frame, crop: crop, center: (0.5, 0.5)))])
}

func exportFollow(url: URL, start: Double, end: Double, output: URL, minConfidence: Float, fixed: Bool = false, tracks: [[[Double]]]? = nil) throws {
  let asset = AVURLAsset(url: url)
  guard let videoTrack = asset.tracks(withMediaType: .video).first else { throw Exception(name: "NoVideoTrack", description: url.absoluteString) }
  let orient = orientation(for: videoTrack.preferredTransform)
  let frame = orientedFrame(videoTrack)
  let path: FollowPath
  let crop: CGSize
  if fixed {
    path = FollowPath(center: 0.5, 0.5)
    crop = fixedCropSize(frame: frame)
  } else {
    let people = try peopleFrom(tracks, start: start, end: end) ?? sample(url: url, fps: 5, minConfidence: minConfidence, from: start, to: end).0
    guard let person = people.max(by: { $0.count < $1.count }), person.count >= 3 else {
      throw Exception(name: "NoPerson", description: "구간 안에서 사람을 못 찾았어요")
    }
    path = FollowPath(person, window: 0.75)
    crop = followCropSize(frame: frame, torso: median(person.compactMap { $0.torso }))
  }
  let outSize = CGSize(width: 1080, height: 1920)
  let range = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), end: CMTime(seconds: end, preferredTimescale: 600))

  let reader = try AVAssetReader(asset: asset)
  reader.timeRange = range
  let videoOutput = AVAssetReaderTrackOutput(track: videoTrack, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  videoOutput.alwaysCopiesSampleData = false
  reader.add(videoOutput)
  let audioTrack = asset.tracks(withMediaType: .audio).first
  var audioOutput: AVAssetReaderTrackOutput? = nil
  if let audioTrack = audioTrack {
    let out = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM])
    reader.add(out)
    audioOutput = out
  }

  try? FileManager.default.removeItem(at: output)
  let writer = try AVAssetWriter(outputURL: output, fileType: .mov)
  let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: Int(outSize.width),
    AVVideoHeightKey: Int(outSize.height),
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12_000_000],
  ])
  videoInput.expectsMediaDataInRealTime = false
  let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: Int(outSize.width),
    kCVPixelBufferHeightKey as String: Int(outSize.height),
  ])
  writer.add(videoInput)
  var audioInput: AVAssetWriterInput? = nil
  if audioOutput != nil {
    let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 44100,
      AVNumberOfChannelsKey: 2,
      AVEncoderBitRateKey: 128_000,
    ])
    input.expectsMediaDataInRealTime = false
    writer.add(input)
    audioInput = input
  }

  guard reader.startReading(), writer.startWriting() else {
    throw Exception(name: "ExportFailed", description: (writer.error ?? reader.error)?.localizedDescription ?? "")
  }
  writer.startSession(atSourceTime: range.start)

  let context = CIContext(options: [.cacheIntermediates: false])
  let group = DispatchGroup()
  let videoQueue = DispatchQueue(label: "climbdex.follow.video")
  group.enter()
  videoInput.requestMediaDataWhenReady(on: videoQueue) {
    while videoInput.isReadyForMoreMediaData {
      guard let buffer = videoOutput.copyNextSampleBuffer(), let pixel = CMSampleBufferGetImageBuffer(buffer) else {
        videoInput.markAsFinished()
        group.leave()
        return
      }
      let time = CMSampleBufferGetPresentationTimeStamp(buffer)
      let rect = followRect(frame: frame, crop: crop, center: path.position(at: time.seconds))
      let ciRect = CGRect(x: rect.minX, y: frame.height - rect.maxY, width: rect.width, height: rect.height)
      let image = CIImage(cvPixelBuffer: pixel).oriented(orient)
        .cropped(to: ciRect)
        .transformed(by: CGAffineTransform(translationX: -ciRect.minX, y: -ciRect.minY))
        .transformed(by: CGAffineTransform(scaleX: outSize.width / rect.width, y: outSize.height / rect.height))
      guard let pool = adaptor.pixelBufferPool else { continue }
      var target: CVPixelBuffer? = nil
      CVPixelBufferPoolCreatePixelBuffer(nil, pool, &target)
      guard let target = target else { continue }
      context.render(image, to: target)
      adaptor.append(target, withPresentationTime: time)
    }
  }
  if let audioInput = audioInput, let audioOutput = audioOutput {
    let audioQueue = DispatchQueue(label: "climbdex.follow.audio")
    group.enter()
    audioInput.requestMediaDataWhenReady(on: audioQueue) {
      while audioInput.isReadyForMoreMediaData {
        guard let buffer = audioOutput.copyNextSampleBuffer() else {
          audioInput.markAsFinished()
          group.leave()
          return
        }
        audioInput.append(buffer)
      }
    }
  }
  group.wait()
  let done = DispatchSemaphore(value: 0)
  writer.finishWriting { done.signal() }
  done.wait()
  if let error = writer.error { throw error }
}

