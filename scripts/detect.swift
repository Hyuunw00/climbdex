import AVFoundation
import Vision

struct Sample {
  let t: Double
  let ankleY: Double
  let torso: Double?
}

struct Segment { let start: Double; let end: Double }

func orientation(for t: CGAffineTransform) -> CGImagePropertyOrientation {
  if t.a == 0 && t.b == 1 && t.c == -1 && t.d == 0 { return .right }
  if t.a == 0 && t.b == -1 && t.c == 1 && t.d == 0 { return .left }
  if t.a == -1 && t.b == 0 && t.c == 0 && t.d == -1 { return .down }
  return .up
}

func sample(url: URL, fps: Double, minConfidence: Float) throws -> ([Sample], Double) {
  let asset = AVURLAsset(url: url)
  guard let track = asset.tracks(withMediaType: .video).first else { throw NSError(domain: "detect", code: 1) }
  let reader = try AVAssetReader(asset: asset)
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  ])
  output.alwaysCopiesSampleData = false
  reader.add(output)
  reader.startReading()

  let orient = orientation(for: track.preferredTransform)
  let size = track.naturalSize.applying(track.preferredTransform)
  let aspect = abs(size.width / size.height)
  var nextT = 0.0
  var samples: [Sample] = []
  var last = 0.0
  while let buffer = output.copyNextSampleBuffer() {
    let t = CMSampleBufferGetPresentationTimeStamp(buffer).seconds
    last = t
    if t + 1e-6 < nextT { continue }
    nextT += 1.0 / fps
    guard let pixel = CMSampleBufferGetImageBuffer(buffer) else { continue }
    let request = VNDetectHumanBodyPoseRequest()
    try VNImageRequestHandler(cvPixelBuffer: pixel, orientation: orient, options: [:]).perform([request])
    guard let person = (request.results ?? []).max(by: { $0.confidence < $1.confidence }) else { continue }
    let pts = try person.recognizedPoints(.all)
    let ankles = [pts[.leftAnkle], pts[.rightAnkle]].compactMap { $0 }.filter { $0.confidence > minConfidence }
    guard let ankleY = ankles.map({ Double($0.y) }).min() else { continue }
    var torso: Double? = nil
    if let neck = pts[.neck], let root = pts[.root], neck.confidence > minConfidence, root.confidence > minConfidence {
      let dx = Double(neck.x - root.x) * aspect
      let dy = Double(neck.y - root.y)
      torso = (dx * dx + dy * dy).squareRoot()
    }
    samples.append(Sample(t: t, ankleY: ankleY, torso: torso))
  }
  return (samples, last)
}

func median(_ xs: [Double]) -> Double {
  let s = xs.sorted()
  return s.isEmpty ? 0 : s[s.count / 2]
}

struct Params {
  var enter = 0.08
  var exit = 0.02
  var minRise = 0.12
  var minDuration = 3.0
  var maxGap = 10.0
  var baselineWindow = 4.0
  var torsoBand = 0.5...2.0
}

func segments(_ d: [Sample], _ p: Params) -> [Segment] {
  func sameDistance(_ torso: Double?, _ ref: Double) -> Bool {
    guard let torso = torso, ref > 0 else { return true }
    return p.torsoBand.contains(torso / ref)
  }
  var result: [Segment] = []
  var i = 0
  while i < d.count {
    let window = d[..<i].filter { $0.t > d[i].t - p.baselineWindow && sameDistance($0.torso, d[i].torso ?? 0) }
    guard window.count >= 3 else { i += 1; continue }
    let base = median(window.map { $0.ankleY })
    guard d[i].ankleY > base + p.enter else { i += 1; continue }

    var j = i
    while j + 1 < d.count, d[j + 1].ankleY > base + p.exit, d[j + 1].t - d[j].t <= p.maxGap { j += 1 }
    var peak = i
    for k in i...j where d[k].ankleY > d[peak].ankleY { peak = k }
    let refTorso = median(d[i...j].compactMap { $0.torso })

    let ys = d.filter { sameDistance($0.torso, refTorso) }.map { $0.ankleY }.sorted()
    let ground = median(Array(ys.prefix(max(4, ys.count / 4))))

    var startIdx = peak
    while startIdx > 0, d[startIdx].ankleY > ground + p.exit, d[startIdx].t - d[startIdx - 1].t <= p.maxGap { startIdx -= 1 }
    var endIdx = peak
    while endIdx + 1 < d.count, d[endIdx].ankleY > ground + p.exit, d[endIdx + 1].t - d[endIdx].t <= p.maxGap { endIdx += 1 }

    let start = d[startIdx].t, end = d[endIdx].t
    if d[peak].ankleY - ground >= p.minRise, end - start >= p.minDuration {
      result.append(Segment(start: start, end: end))
    }
    i = max(endIdx, j) + 1
  }
  return result
}

let args = CommandLine.arguments
guard args.count >= 2 else {
  print("usage: detect <video> [csv-out]")
  exit(1)
}
let (samples, duration) = try sample(url: URL(fileURLWithPath: args[1]), fps: 5, minConfidence: 0.3)
if args.count >= 3 {
  var csv = "t,ankleY,torso\n"
  for s in samples {
    csv += "\(String(format: "%.2f", s.t)),\(String(format: "%.4f", s.ankleY)),\(s.torso.map { String(format: "%.4f", $0) } ?? "")\n"
  }
  try csv.write(toFile: args[2], atomically: true, encoding: .utf8)
}
print("detected \(samples.count), duration \(String(format: "%.1f", duration))s")
for s in segments(samples, Params()) {
  print("segment \(String(format: "%.1f", s.start))s - \(String(format: "%.1f", s.end))s")
}
