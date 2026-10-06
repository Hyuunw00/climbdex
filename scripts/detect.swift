import AVFoundation
import Vision
import CoreImage

struct Sample {
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
  var torsoMedian: Double { median(torsos) }
  func update(_ c: Candidate, t: Double) {
    x = c.x; y = c.y; torso = c.torso; lastT = t
    torsos.append(c.torso)
    if torsos.count > 5 { torsos.removeFirst() }
  }
}

var shiftLog: [(Double, Double)] = []

func sample(url: URL, fps: Double, minConfidence: Float, from: Double? = nil, to: Double? = nil) throws -> ([[Sample]], Double, Double) {
  let asset = AVURLAsset(url: url)
  guard let track = asset.tracks(withMediaType: .video).first else { throw NSError(domain: "detect", code: 1) }
  let reader = try AVAssetReader(asset: asset)
  if let from = from, let to = to {
    reader.timeRange = CMTimeRange(start: CMTime(seconds: from, preferredTimescale: 600), end: CMTime(seconds: to, preferredTimescale: 600))
  }
  let natural = track.naturalSize
  let decodeMax = Double(ProcessInfo.processInfo.environment["DECODE_MAX"] ?? "") ?? 0
  let scale = decodeMax > 0 ? min(1.0, decodeMax / Double(max(natural.width, natural.height))) : 1.0
  let decodeWidth = Int((Double(natural.width) * scale / 2).rounded()) * 2
  let decodeHeight = Int((Double(natural.height) * scale / 2).rounded()) * 2
  let bgra = ProcessInfo.processInfo.environment["PIXEL_FORMAT"] != "420"
  let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: bgra ? kCVPixelFormatType_32BGRA : kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    kCVPixelBufferWidthKey as String: decodeWidth,
    kCVPixelBufferHeightKey as String: decodeHeight,
  ])
  output.alwaysCopiesSampleData = true
  reader.add(output)
  reader.startReading()

  let orient = orientation(for: track.preferredTransform)
  let size = natural.applying(track.preferredTransform)
  let aspect = abs(size.width / size.height)
  let width = Double(decodeWidth)
  let tileThrottle = ProcessInfo.processInfo.environment["TILE_THROTTLE"] == "1"
  var emptyStreak = 0
  let batchSize = 8
  let followRadius = 0.25
  let maxRadius = 0.4
  let radiusK = Double(ProcessInfo.processInfo.environment["RADIUS_K"] ?? "") ?? 3
  let torsoBand = 0.6...1.7
  let trackTimeout = 10.0

  var nextT = from ?? 0.0
  var nextMotionT = from ?? 0.0
  var last = 0.0
  var previous: CVPixelBuffer? = nil
  var shifts: [Double] = []
  var tracks: [Track] = []
  var batch: [(t: Double, pixel: CVPixelBuffer)] = []

  func flush() throws {
    guard !batch.isEmpty else { return }
    var found = [[Candidate]](repeating: [], count: batch.count)
    let throttled = tileThrottle && emptyStreak >= 10
    let lock = NSLock()
    DispatchQueue.concurrentPerform(iterations: batch.count) { i in
      var list = (try? candidates(batch[i].pixel, orient, nil, aspect: aspect, minConfidence: minConfidence)) ?? []
      if list.isEmpty, !throttled || i == 0 {
        list = tiles.flatMap { (try? candidates(batch[i].pixel, orient, $0, aspect: aspect, minConfidence: minConfidence)) ?? [] }
      }
      lock.lock(); found[i] = list; lock.unlock()
    }
    emptyStreak = found.contains { !$0.isEmpty } ? 0 : emptyStreak + batch.count
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
          let base = radiusK > 0 ? min(followRadius, max(0.08, radiusK * tr.torso)) : followRadius
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
          shiftLog.append((t, shifts.last!))
        } else {
          shiftLog.append((t, -1))
        }
      }
      previous = pixel
    }
    batch.append((t, pixel))
    if batch.count >= batchSize { try flush() }
  }
  try flush()
  if reader.status == .failed { throw reader.error ?? NSError(domain: "detect", code: 2, userInfo: [NSLocalizedDescriptionKey: "reader failed"]) }
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

func candidateSpansP(_ people: [[Sample]], confident: [Segment], minSpan: Double = 8.0, maxGap: Double = 3.0) -> [(Segment, Int)] {
  var reference: [Double] = []
  for samples in people {
    for s in samples where confident.contains(where: { s.t >= $0.start && s.t <= $0.end }) {
      if let torso = s.torso { reference.append(torso) }
    }
  }
  let ref = median(reference)
  var result: [(Segment, Int)] = []
  for (n, samples) in people.enumerated() {
    var i = 0
    while i < samples.count {
      var j = i
      while j + 1 < samples.count, samples[j + 1].t - samples[j].t <= maxGap { j += 1 }
      let start = samples[i].t, end = samples[j].t
      if end - start >= minSpan {
        let covered = confident.reduce(0.0) { $0 + max(0, min(end, $1.end) - max(start, $1.start)) }
        let torsos = samples[i...j].compactMap { $0.torso }
        let sizeOk = ref <= 0 || torsos.isEmpty || (0.6...1.7).contains(median(torsos) / ref)
        if covered < 0.5 * (end - start), sizeOk { result.append((Segment(start: start, end: end), n)) }
      }
      i = j + 1
    }
  }
  return result.sorted { $0.0.start < $1.0.start }
}

func finalClips(_ people: [[Sample]], _ merged: [(Segment, Int)], a: Bool, b: Bool, lowGap: Double = 3.0) -> [(Segment, Bool)] {
  var low: [(seg: Segment, first: Int, last: Int, ids: Set<Int>)] = candidateSpansP(people, confident: merged.map { $0.0 }).map { ($0.0, $0.1, $0.1, [$0.1]) }
  if b {
    var out: [(seg: Segment, first: Int, last: Int, ids: Set<Int>)] = []
    for item in low {
      if var prev = out.last, item.seg.start - prev.seg.end <= lowGap,
         item.first == prev.last || handoff(people[prev.last], people[item.first], aEnd: prev.seg.end, bStart: item.seg.start) {
        prev.seg = Segment(start: prev.seg.start, end: max(prev.seg.end, item.seg.end))
        prev.last = item.last
        prev.ids.formUnion(item.ids)
        out[out.count - 1] = prev
      } else {
        out.append(item)
      }
    }
    low = out
  }
  var confident = merged
  if a {
    var keep: [(seg: Segment, first: Int, last: Int, ids: Set<Int>)] = []
    for item in low {
      if let k = confident.firstIndex(where: { (item.ids.contains($0.1) || (item.seg.start >= $0.0.start && item.seg.start - $0.0.end <= 1.0 && handoff(people[$0.1], people[item.first], aEnd: $0.0.end, bStart: item.seg.start))) && (min(item.seg.end, $0.0.end) > max(item.seg.start, $0.0.start) || item.seg.start >= $0.0.end) }) {
        let c = confident[k].0
        confident[k].0 = Segment(start: min(c.start, item.seg.start), end: max(c.end, item.seg.end))
      } else {
        keep.append(item)
      }
    }
    low = keep
  }
  return (confident.map { ($0.0, false) } + low.map { ($0.seg, true) }).sorted { $0.0.start < $1.0.start }
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
  var startGround = Double(ProcessInfo.processInfo.environment["START_GROUND"] ?? "") ?? 4
  var handoffGap = Double(ProcessInfo.processInfo.environment["HANDOFF_GAP"] ?? "") ?? 1
  var presenceGap = Double(ProcessInfo.processInfo.environment["PRESENCE_GAP"] ?? "") ?? 0
  var groundCap = Double(ProcessInfo.processInfo.environment["GROUND_CAP"] ?? "") ?? 0
  var standingGround = ProcessInfo.processInfo.environment["STANDING_GROUND"] != "0"
  var startGuard = ProcessInfo.processInfo.environment["START_GUARD"] == "1"
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
    var ground = groundLevel(near.map { $0.ankleY }, p)
    if p.groundCap > 0, ground - globalGround > p.groundCap { ground = globalGround }
    let rise = d.map { $0.ankleY - ground }
    var startGround = ground
    if p.standingGround {
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
    let floorT = p.startGuard ? (result.last.map { $0.end + p.mergeGap + 0.5 } ?? -Double.infinity) : -Double.infinity
    while b > 0, d[b].t - d[b - 1].t <= p.maxGap, d[b - 1].t >= floorT {
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
    func presentBetween(_ a: Double, _ b: Double) -> Bool {
      let inside = d.filter { $0.t >= a && $0.t <= b }.map { $0.t }
      guard inside.count >= 2 else { return false }
      var prev = a
      for t in inside + [b] {
        if t - prev > 3.0 { return false }
        prev = t
      }
      return true
    }
    if let last = result.last, start - last.end < p.mergeGap || (p.presenceGap > 0 && start - last.end < p.presenceGap && presentBetween(last.end, start)) {
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

func planFollow(url: URL, start: Double, end: Double, minConfidence: Float) throws -> FollowPlan {
  let (people, _, _) = try sample(url: url, fps: 5, minConfidence: minConfidence, from: start, to: end)
  guard let person = people.max(by: { $0.count < $1.count }), person.count >= 3 else {
    throw NSError(domain: "detect", code: 2, userInfo: [NSLocalizedDescriptionKey: "no person"])
  }
  let path = FollowPath(person, window: 0.75)
  let torso = median(person.compactMap { $0.torso })
  let asset = AVURLAsset(url: url)
  guard let videoTrack = asset.tracks(withMediaType: .video).first else { throw NSError(domain: "detect", code: 1) }
  let oriented = videoTrack.naturalSize.applying(videoTrack.preferredTransform)
  let frame = CGSize(width: abs(oriented.width), height: abs(oriented.height))
  let crop = followCropSize(frame: frame, torso: torso)
  let keyframes = path.points.map { ($0.t, followRect(frame: frame, crop: crop, center: ($0.x, $0.y))) }
  return FollowPlan(frame: frame, crop: crop, path: path, keyframes: keyframes)
}

func exportFollow(url: URL, start: Double, end: Double, output: URL, minConfidence: Float) throws {
  let (people, _, _) = try sample(url: url, fps: 5, minConfidence: minConfidence, from: start, to: end)
  guard let person = people.max(by: { $0.count < $1.count }), person.count >= 3 else {
    throw NSError(domain: "detect", code: 2, userInfo: [NSLocalizedDescriptionKey: "no person"])
  }
  let path = FollowPath(person, window: 0.75)
  let torso = median(person.compactMap { $0.torso })

  let asset = AVURLAsset(url: url)
  guard let videoTrack = asset.tracks(withMediaType: .video).first else { throw NSError(domain: "detect", code: 1) }
  let orient = orientation(for: videoTrack.preferredTransform)
  let oriented = videoTrack.naturalSize.applying(videoTrack.preferredTransform)
  let frame = CGSize(width: abs(oriented.width), height: abs(oriented.height))
  let crop = followCropSize(frame: frame, torso: torso)
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
    throw writer.error ?? reader.error ?? NSError(domain: "detect", code: 3)
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

let args = CommandLine.arguments
guard args.count >= 2 else {
  print("usage: detect <video> [csv-out] | detect export <video> <start> <end> <out.mov>")
  exit(1)
}
if args[1] == "replay" {
  var grouped: [Int: [Sample]] = [:]
  for line in try String(contentsOfFile: args[2], encoding: .utf8).split(separator: "\n").dropFirst() {
    let f = line.split(separator: ",").map { Double($0) ?? 0 }
    guard f.count >= 6 else { continue }
    grouped[Int(f[0]), default: []].append(Sample(t: f[1], ankleY: f[2], torso: f[3] > 0 ? f[3] : nil, x: f[4], y: f[5]))
  }
  let people = grouped.keys.sorted().map { dropStatic(grouped[$0]!) }
  var params = Params()
  if args.count > 3, let v = Double(args[3]) { params.minRise = v }
  var all: [(Segment, Int)] = []
  for (n, samples) in people.enumerated() where samples.count >= Int(params.minDuration * 5) {
    for seg in segments(samples, params, others: people.enumerated().filter { $0.offset != n }.flatMap { $0.element }) { all.append((seg, n)) }
  }
  if ProcessInfo.processInfo.environment["SHOW_RAW"] != nil { for (seg, n) in all.sorted(by: { $0.0.start < $1.0.start }) { print(String(format: "raw %.1f-%.1f p%d", seg.start, seg.end, n)) } }
  all.sort { $0.0.start < $1.0.start }
  var merged: [(Segment, Int)] = []
  for item in all {
    if let lastItem = merged.last,
       (item.0.start <= lastItem.0.end && (item.1 == lastItem.1 || sameSpot(people[item.1], people[lastItem.1], from: item.0.start, to: min(item.0.end, lastItem.0.end))))
       || (item.0.start > lastItem.0.end && item.0.start - lastItem.0.end < params.handoffGap && handoff(people[lastItem.1], people[item.1], aEnd: lastItem.0.end, bStart: item.0.start)) {
      merged[merged.count - 1] = (Segment(start: lastItem.0.start, end: max(lastItem.0.end, item.0.end)), lastItem.1)
    } else {
      merged.append(item)
    }
  }
  print(merged.map { String(format: "%.1f-%.1f", $0.0.start, $0.0.end) }.joined(separator: " | "))
  print("candidates: " + candidateSpans(people, confident: merged.map { $0.0 }).map { String(format: "%.1f-%.1f", $0.start, $0.end) }.joined(separator: " | "))
  let env = ProcessInfo.processInfo.environment
  let clips = finalClips(people, merged, a: env["CLIP_A"] != "0", b: env["CLIP_B"] != "0")
  print("clips: " + clips.map { String(format: "%.1f-%.1f%@", $0.0.start, $0.0.end, $0.1 ? "*" : "") }.joined(separator: " | "))
  exit(0)
}
if args[1] == "export" {
  let started = Date()
  try exportFollow(url: URL(fileURLWithPath: args[2]), start: Double(args[3])!, end: Double(args[4])!, output: URL(fileURLWithPath: args[5]), minConfidence: 0.3)
  print("exported \(args[5]) in \(String(format: "%.1f", Date().timeIntervalSince(started)))s")
  exit(0)
}
let fps = Double(ProcessInfo.processInfo.environment["FPS"] ?? "") ?? 5
let (rawPeople, duration, shift) = try sample(url: URL(fileURLWithPath: args[1]), fps: fps, minConfidence: 0.3)
let people = rawPeople.map { dropStatic($0) }
let params = Params()
let handheld = shift > params.handheldShift
var all: [(Segment, Int)] = []
for (n, samples) in people.enumerated() where samples.count >= Int(params.minDuration * fps) {
  for seg in handheld ? presenceSegments(samples, params) : segments(samples, params, others: people.enumerated().filter { $0.offset != n }.flatMap { $0.element }) { all.append((seg, n)) }
}
all.sort { $0.0.start < $1.0.start }
for (seg, n) in all { print("raw \(String(format: "%.1f", seg.start))s - \(String(format: "%.1f", seg.end))s  person \(n) (\(people[n].count) samples)") }
var merged: [(Segment, Int)] = []
for item in all {
  if let lastItem = merged.last,
       (item.0.start <= lastItem.0.end && (item.1 == lastItem.1 || sameSpot(people[item.1], people[lastItem.1], from: item.0.start, to: min(item.0.end, lastItem.0.end))))
       || (item.0.start > lastItem.0.end && item.0.start - lastItem.0.end < params.handoffGap && handoff(people[lastItem.1], people[item.1], aEnd: lastItem.0.end, bStart: item.0.start)) {
    merged[merged.count - 1] = (Segment(start: lastItem.0.start, end: max(lastItem.0.end, item.0.end)), lastItem.1)
  } else {
    merged.append(item)
  }
}
all = merged
if args.count >= 3 {
  var csv = "person,t,ankleY,torso,x,y\n"
  for (n, samples) in people.enumerated() {
    for s in samples { csv += "\(n),\(String(format: "%.2f", s.t)),\(String(format: "%.4f", s.ankleY)),\(String(format: "%.4f", s.torso ?? 0)),\(String(format: "%.3f", s.x)),\(String(format: "%.3f", s.y))\n" }
  }
  try csv.write(toFile: args[2], atomically: true, encoding: .utf8)
}
if ProcessInfo.processInfo.environment["SHIFTS"] != nil {
  for (t, v) in shiftLog where v < 0 || v > 0.01 { print("shift t=\(String(format: "%.0f", t)) v=\(String(format: "%.3f", v))") }
}
print("people \(people.count) (\(people.map { $0.count }.filter { $0 >= 15 }.count) with 3s+), duration \(String(format: "%.1f", duration))s, camera shift \(String(format: "%.4f", shift)) → \(handheld ? "handheld: presence span" : "fixed: ankle rise")")
for (seg, n) in all {
  print("segment \(String(format: "%.1f", seg.start))s - \(String(format: "%.1f", seg.end))s  person \(n)")
}
for seg in candidateSpans(people, confident: all.map { $0.0 }) {
  print("candidate \(String(format: "%.1f", seg.start))s - \(String(format: "%.1f", seg.end))s")
}
