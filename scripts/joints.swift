import AVFoundation
import Vision

func orientation(for t: CGAffineTransform) -> CGImagePropertyOrientation {
  if t.a == 0 && t.b == 1 && t.c == -1 && t.d == 0 { return .right }
  if t.a == 0 && t.b == -1 && t.c == 1 && t.d == 0 { return .left }
  if t.a == -1 && t.b == 0 && t.c == 0 && t.d == -1 { return .down }
  return .up
}

let joints: [(String, VNHumanBodyPoseObservation.JointName)] = [
  ("nose", .nose), ("neck", .neck), ("root", .root),
  ("lShoulder", .leftShoulder), ("rShoulder", .rightShoulder),
  ("lElbow", .leftElbow), ("rElbow", .rightElbow),
  ("lWrist", .leftWrist), ("rWrist", .rightWrist),
  ("lHip", .leftHip), ("rHip", .rightHip),
  ("lKnee", .leftKnee), ("rKnee", .rightKnee),
  ("lAnkle", .leftAnkle), ("rAnkle", .rightAnkle),
]

let tiles: [CGRect] = [
  CGRect(x: 0, y: 0, width: 0.6, height: 0.6), CGRect(x: 0.4, y: 0, width: 0.6, height: 0.6),
  CGRect(x: 0, y: 0.4, width: 0.6, height: 0.6), CGRect(x: 0.4, y: 0.4, width: 0.6, height: 0.6),
]

struct Person {
  let root: CGPoint
  let confidence: Double
  let points: [VNHumanBodyPoseObservation.JointName: VNRecognizedPoint]
  let box: CGRect
}

func detect(_ pixel: CVPixelBuffer, _ orient: CGImagePropertyOrientation, _ roi: CGRect?) throws -> [Person] {
  let request = VNDetectHumanBodyPoseRequest()
  if let roi = roi { request.regionOfInterest = roi }
  try VNImageRequestHandler(cvPixelBuffer: pixel, orientation: orient, options: [:]).perform([request])
  let box = roi ?? CGRect(x: 0, y: 0, width: 1, height: 1)
  return (request.results ?? []).compactMap { person in
    guard let pts = try? person.recognizedPoints(.all), let root = pts[.root], root.confidence > 0.3 else { return nil }
    let rx = box.minX + CGFloat(root.x) * box.width
    let ry = box.minY + CGFloat(root.y) * box.height
    return Person(root: CGPoint(x: rx, y: ry), confidence: Double(person.confidence), points: pts, box: box)
  }
}

let args = CommandLine.arguments
guard args.count >= 3 else {
  print("usage: joints <video> <out.csv> [start] [end] [fps]")
  exit(1)
}
let url = URL(fileURLWithPath: args[1])
let outPath = args[2]
let from = args.count > 3 ? Double(args[3]) : nil
let to = args.count > 4 ? Double(args[4]) : nil
let fps = args.count > 5 ? Double(args[5]) ?? 10 : 10

let asset = AVURLAsset(url: url)
guard let track = asset.tracks(withMediaType: .video).first else { print("no video track"); exit(1) }
let reader = try AVAssetReader(asset: asset)
if let from = from, let to = to {
  reader.timeRange = CMTimeRange(start: CMTime(seconds: from, preferredTimescale: 600), end: CMTime(seconds: to, preferredTimescale: 600))
}
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
output.alwaysCopiesSampleData = true
reader.add(output)
reader.startReading()
let orient = orientation(for: track.preferredTransform)
let size = track.naturalSize.applying(track.preferredTransform)
let aspect = abs(size.width / size.height)

var csv = "t,conf," + joints.map { "\($0.0)_x,\($0.0)_y,\($0.0)_c" }.joined(separator: ",") + "\n"
var nextT = from ?? 0
var lastRoot: CGPoint? = nil
var frames = 0
var hits = 0
let started = Date()

while let buffer = output.copyNextSampleBuffer() {
  let t = CMSampleBufferGetPresentationTimeStamp(buffer).seconds
  guard t >= nextT else { continue }
  nextT += 1 / fps
  guard let pixel = CMSampleBufferGetImageBuffer(buffer) else { continue }
  frames += 1
  var people = try detect(pixel, orient, nil)
  if people.isEmpty { people = try tiles.flatMap { try detect(pixel, orient, $0) } }
  guard !people.isEmpty else { continue }
  let chosen: Person
  if let last = lastRoot {
    chosen = people.min { hypot($0.root.x - last.x, $0.root.y - last.y) < hypot($1.root.x - last.x, $1.root.y - last.y) }!
  } else {
    chosen = people.max { $0.confidence < $1.confidence }!
  }
  lastRoot = chosen.root
  hits += 1
  var row = [String(format: "%.2f", t), String(format: "%.2f", chosen.confidence)]
  for (_, name) in joints {
    if let p = chosen.points[name] {
      let x = chosen.box.minX + CGFloat(p.x) * chosen.box.width
      let y = chosen.box.minY + CGFloat(p.y) * chosen.box.height
      row += [String(format: "%.4f", x), String(format: "%.4f", y), String(format: "%.2f", p.confidence)]
    } else {
      row += ["", "", "0"]
    }
  }
  csv += row.joined(separator: ",") + "\n"
}
try csv.write(toFile: outPath, atomically: true, encoding: .utf8)
print("frames \(frames) detected \(hits) aspect \(String(format: "%.3f", aspect)) took \(Int(Date().timeIntervalSince(started)))s -> \(outPath)")
