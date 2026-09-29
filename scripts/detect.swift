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
  var lastT: Double
  var samples: [Sample] = []
  init(_ c: Candidate, t: Double) { x = c.x; y = c.y; torso = c.torso; lastT = t }
}

func sample(url: URL, fps: Double, minConfidence: Float) throws -> ([[Sample]], Double, Double) {
  let asset = AVURLAsset(url: url)
  guard let track = asset.tracks(withMediaType: .video).first else { throw NSError(domain: "detect", code: 1) }
  let reader = try AVAssetReader(asset: asset)
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
  let torsoBand = 0.6...1.7
  let trackTimeout = 10.0

  var nextT = 0.0
  var nextMotionT = 0.0
  var last = 0.0
  var previous: CVPixelBuffer? = nil
  var shifts: [Double] = []
  var tracks: [Track] = []
  var batch: [(t: Double, pixel: CVPixelBuffer)] = []

  func flush() throws {
    guard !batch.isEmpty else { return }
    var found = [[Candidate]](repeating: [], count: batch.count)
    let lock = NSLock()
    DispatchQueue.concurrentPerform(iterations: batch.count) { i in
      var list = (try? candidates(batch[i].pixel, orient, nil, aspect: aspect, minConfidence: minConfidence)) ?? []
      if list.isEmpty {
        list = tiles.flatMap { (try? candidates(batch[i].pixel, orient, $0, aspect: aspect, minConfidence: minConfidence)) ?? [] }
      }
      lock.lock(); found[i] = list; lock.unlock()
    }
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
        for (n, tr) in tracks.enumerated() where !taken.contains(n) && t - tr.lastT <= trackTimeout && torsoBand.contains(c.torso / tr.torso) {
          let dist = ((c.x - tr.x) * (c.x - tr.x) + (c.y - tr.y) * (c.y - tr.y)).squareRoot()
          let radius = followRadius + 0.1 * (t - tr.lastT)
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
        tr.x = c.x; tr.y = c.y; tr.torso = c.torso; tr.lastT = t
        tr.samples.append(Sample(t: t, ankleY: c.ankleY, torso: c.torso))
      }
    }
    batch.removeAll()
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
  try flush()
  return (tracks.map { $0.samples }, last, median(shifts))
}

func median(_ xs: [Double]) -> Double {
  let s = xs.sorted()
  return s.isEmpty ? 0 : s[s.count / 2]
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

func segments(_ d: [Sample], _ p: Params) -> [Segment] {
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

    var k = i
    while k > 0, d[k].t - d[k - 1].t <= p.maxGap, rise[k - 1] > p.low { k -= 1 }
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

let args = CommandLine.arguments
guard args.count >= 2 else {
  print("usage: detect <video> [csv-out]")
  exit(1)
}
let (people, duration, shift) = try sample(url: URL(fileURLWithPath: args[1]), fps: 5, minConfidence: 0.3)
let params = Params()
let handheld = shift > params.handheldShift
var all: [(Segment, Int)] = []
for (n, samples) in people.enumerated() where samples.count >= Int(params.minDuration * 5) {
  for seg in handheld ? presenceSegments(samples, params) : segments(samples, params) { all.append((seg, n)) }
}
all.sort { $0.0.start < $1.0.start }
var merged: [(Segment, Int)] = []
for item in all {
  if let lastItem = merged.last, item.0.start <= lastItem.0.end {
    merged[merged.count - 1] = (Segment(start: lastItem.0.start, end: max(lastItem.0.end, item.0.end)), lastItem.1)
  } else {
    merged.append(item)
  }
}
all = merged
if args.count >= 3 {
  var csv = "person,t,ankleY,torso\n"
  for (n, samples) in people.enumerated() {
    for s in samples { csv += "\(n),\(String(format: "%.2f", s.t)),\(String(format: "%.4f", s.ankleY)),\(String(format: "%.4f", s.torso ?? 0))\n" }
  }
  try csv.write(toFile: args[2], atomically: true, encoding: .utf8)
}
print("people \(people.count) (\(people.map { $0.count }.filter { $0 >= 15 }.count) with 3s+), duration \(String(format: "%.1f", duration))s, camera shift \(String(format: "%.4f", shift)) → \(handheld ? "handheld: presence span" : "fixed: ankle rise")")
for (seg, n) in all {
  print("segment \(String(format: "%.1f", seg.start))s - \(String(format: "%.1f", seg.end))s  person \(n)")
}
