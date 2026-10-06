package expo.modules.climbvideo

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

data class Sample(val t: Double, val ankleY: Double, val torso: Double, val x: Double, val y: Double, val confidence: Double = 0.0)

data class Segment(val start: Double, val end: Double)

data class Params(
  val low: Double = 0.02,
  val minRise: Double = 0.12,
  val minDuration: Double = 3.0,
  val maxGap: Double = 10.0,
  val mergeGap: Double = 5.0,
  val bin: Double = 0.02,
  val groundTime: Double = 1.0,
  val torsoBand: ClosedFloatingPointRange<Double> = 0.5..2.0,
  val groundReach: Double = 15.0,
  val startGround: Double = 4.0,
  val handoffGap: Double = 1.0,
)

fun median(xs: List<Double>): Double {
  if (xs.isEmpty()) return 0.0
  val s = xs.sorted()
  return s[s.size / 2]
}

fun groundLevel(ys: List<Double>, p: Params): Double {
  val sorted = ys.sorted()
  if (sorted.isEmpty()) return 0.0
  val need = max(5, sorted.size / 20)
  var lo = sorted.first()
  while (lo <= sorted.last()) {
    if (sorted.count { it >= lo && it < lo + 2 * p.bin } >= need) break
    lo += p.bin
  }
  return median(sorted.filter { it >= lo && it < lo + 2 * p.bin })
}

fun presenceSegments(d: List<Sample>, p: Params): List<Segment> {
  val result = mutableListOf<Segment>()
  var i = 0
  while (i < d.size) {
    var j = i
    while (j + 1 < d.size && d[j + 1].t - d[j].t <= p.maxGap) j++
    if (d[j].t - d[i].t >= p.minDuration) result.add(Segment(d[i].t, d[j].t))
    i = j + 1
  }
  return result
}

fun segments(d: List<Sample>, p: Params, others: List<Sample> = emptyList()): List<Segment> {
  fun sameDistance(torso: Double, ref: Double): Boolean {
    if (ref <= 0 || torso <= 0) return true
    return torso / ref in p.torsoBand
  }
  val globalGround = groundLevel(d.map { it.ankleY }, p)
  val result = mutableListOf<Segment>()
  var i = 0
  while (i < d.size) {
    if (d[i].ankleY - globalGround <= p.minRise) { i++; continue }
    var h = i
    while (h + 1 < d.size && d[h + 1].ankleY - globalGround > p.minRise && d[h + 1].t - d[h].t <= p.maxGap) h++
    val refTorso = median(d.subList(i, h + 1).map { it.torso })
    val near = d.filter { it.t >= d[i].t - p.groundReach && it.t <= d[h].t + p.groundReach && sameDistance(it.torso, refTorso) }
    val ground = groundLevel(near.map { it.ankleY }, p)
    val rise = d.map { it.ankleY - ground }
    val before = d.filter { it.t < d[i].t }.map { it.ankleY }
    val after = d.filter { it.t > d[h].t }.map { it.ankleY }
    val similar = others.filter { sameDistance(it.torso, refTorso) }.map { it.ankleY }
    val source = when {
      before.size >= 5 -> before
      after.size >= 5 -> after
      similar.size >= 5 -> similar
      else -> emptyList()
    }
    val startGround = if (source.isEmpty()) ground else min(ground, groundLevel(source, p))
    val riseStart = d.map { it.ankleY - startGround }

    var k = i
    var b = i
    var groundFrom: Double? = null
    while (b > 0 && d[b].t - d[b - 1].t <= p.maxGap) {
      b--
      if (riseStart[b] > p.low) {
        k = b
        groundFrom = null
      } else if (groundFrom != null) {
        if (groundFrom - d[b].t >= p.startGround) break
      } else {
        groundFrom = d[b].t
        if (p.startGround <= 0) break
      }
    }
    val startIdx = if (k > 0 && d[k].t - d[k - 1].t <= p.maxGap) k - 1 else k

    var j = h
    var groundSince: Double? = null
    var e = h
    while (e + 1 < d.size && d[e + 1].t - d[e].t <= p.maxGap) {
      e++
      if (rise[e] > p.low) {
        j = e
        groundSince = null
      } else if (groundSince != null) {
        if (d[e].t - groundSince >= p.groundTime) break
      } else {
        groundSince = d[e].t
      }
    }
    val endIdx = if (j + 1 < d.size && d[j + 1].t - d[j].t <= p.maxGap) j + 1 else j

    val start = d[startIdx].t
    val end = d[endIdx].t
    val last = result.lastOrNull()
    if (last != null && start - last.end < p.mergeGap) {
      result[result.size - 1] = Segment(last.start, end)
    } else if (end - start >= p.minDuration) {
      result.add(Segment(start, end))
    }
    i = j + 1
  }
  return result
}

fun sameSpot(a: List<Sample>, b: List<Sample>, from: Double, to: Double): Boolean {
  var j = 0
  val dists = mutableListOf<Double>()
  for (s in a) {
    if (s.t < from || s.t > to) continue
    while (j < b.size && b[j].t < s.t - 0.15) j++
    if (j < b.size && abs(b[j].t - s.t) <= 0.15) dists.add(hypot(s.x - b[j].x, s.y - b[j].y))
  }
  if (dists.size < 5) return false
  return dists.sorted()[dists.size / 2] < 0.15
}

fun handoff(a: List<Sample>, b: List<Sample>, aEnd: Double, bStart: Double): Boolean {
  val pa = a.lastOrNull { it.t <= aEnd + 0.01 } ?: return false
  val pb = b.firstOrNull { it.t >= bStart - 0.01 } ?: return false
  val gap = max(0.0, pb.t - pa.t)
  return hypot(pa.x - pb.x, pa.y - pb.y) <= min(0.4, 0.25 + 0.1 * gap)
}

fun mergeOverlapping(all: List<Pair<Segment, Int>>, people: List<List<Sample>>, handoffGap: Double = Params().handoffGap): List<Segment> =
  mergeOverlappingP(all, people, handoffGap).map { it.first }

fun mergeOverlappingP(all: List<Pair<Segment, Int>>, people: List<List<Sample>>, handoffGap: Double = Params().handoffGap): List<Pair<Segment, Int>> {
  val merged = mutableListOf<Pair<Segment, Int>>()
  for (item in all.sortedBy { it.first.start }) {
    val last = merged.lastOrNull()
    val overlaps = last != null && item.first.start <= last.first.end
    val samePerson = last != null && (item.second == last.second ||
      sameSpot(people[item.second], people[last.second], item.first.start, min(item.first.end, last.first.end)))
    val handedOff = last != null && !overlaps && item.first.start - last.first.end < handoffGap &&
      handoff(people[last.second], people[item.second], last.first.end, item.first.start)
    if (last != null && ((overlaps && samePerson) || handedOff)) {
      merged[merged.size - 1] = Pair(Segment(last.first.start, max(last.first.end, item.first.end)), last.second)
    } else {
      merged.add(item)
    }
  }
  return merged
}

private fun medianOf(xs: List<Double>): Double = if (xs.isEmpty()) 0.0 else xs.sorted()[xs.size / 2]

fun candidateSpans(people: List<List<Sample>>, confident: List<Segment>, minSpan: Double = 8.0, maxGap: Double = 3.0): List<Segment> {
  val reference = people.flatten()
    .filter { s -> s.torso > 0 && confident.any { s.t >= it.start && s.t <= it.end } }
    .map { it.torso }
  val ref = medianOf(reference)
  val result = mutableListOf<Segment>()
  for (samples in people) {
    var i = 0
    while (i < samples.size) {
      var j = i
      while (j + 1 < samples.size && samples[j + 1].t - samples[j].t <= maxGap) j++
      val start = samples[i].t
      val end = samples[j].t
      if (end - start >= minSpan) {
        val covered = confident.sumOf { max(0.0, min(end, it.end) - max(start, it.start)) }
        val torsos = samples.subList(i, j + 1).filter { it.torso > 0 }.map { it.torso }
        val sizeOk = ref <= 0 || torsos.isEmpty() || (medianOf(torsos) / ref) in 0.6..1.7
        if (covered < 0.5 * (end - start) && sizeOk) result.add(Segment(start, end))
      }
      i = j + 1
    }
  }
  return result.sortedBy { it.start }
}

fun dropStatic(samples: List<Sample>, minSpan: Double = 8.0, tolerance: Double = 0.005): List<Sample> {
  val keep = mutableListOf<Sample>()
  var i = 0
  while (i < samples.size) {
    var j = i
    while (j + 1 < samples.size && abs(samples[j + 1].x - samples[i].x) <= tolerance && abs(samples[j + 1].y - samples[i].y) <= tolerance) j++
    if (samples[j].t - samples[i].t < minSpan) keep.addAll(samples.subList(i, j + 1))
    i = j + 1
  }
  return keep
}

private data class LowSpan(var seg: Segment, val first: Int, var last: Int, val ids: MutableSet<Int>)

fun resolveClips(people: List<List<Sample>>, merged: List<Pair<Segment, Int>>, lowGap: Double = 3.0): Pair<List<Segment>, List<Segment>> {
  val confidentSegs = merged.map { it.first }
  val reference = people.flatten()
    .filter { s -> s.torso > 0 && confidentSegs.any { s.t >= it.start && s.t <= it.end } }
    .map { it.torso }
  val ref = medianOf(reference)
  val spans = mutableListOf<Pair<Segment, Int>>()
  people.forEachIndexed { n, samples ->
    var i = 0
    while (i < samples.size) {
      var j = i
      while (j + 1 < samples.size && samples[j + 1].t - samples[j].t <= 3.0) j++
      val start = samples[i].t
      val end = samples[j].t
      if (end - start >= 8.0) {
        val covered = confidentSegs.sumOf { max(0.0, min(end, it.end) - max(start, it.start)) }
        val torsos = samples.subList(i, j + 1).filter { it.torso > 0 }.map { it.torso }
        val sizeOk = ref <= 0 || torsos.isEmpty() || (medianOf(torsos) / ref) in 0.6..1.7
        if (covered < 0.5 * (end - start) && sizeOk) spans.add(Pair(Segment(start, end), n))
      }
      i = j + 1
    }
  }
  val low = mutableListOf<LowSpan>()
  for ((seg, n) in spans.sortedBy { it.first.start }) {
    val prev = low.lastOrNull()
    if (prev != null && seg.start - prev.seg.end <= lowGap &&
      (n == prev.last || handoff(people[prev.last], people[n], prev.seg.end, seg.start))) {
      prev.seg = Segment(prev.seg.start, max(prev.seg.end, seg.end))
      prev.last = n
      prev.ids.add(n)
    } else {
      low.add(LowSpan(seg, n, n, mutableSetOf(n)))
    }
  }
  val confident = merged.toMutableList()
  val remaining = mutableListOf<Segment>()
  for (item in low) {
    val k = confident.indexOfFirst {
      (item.ids.contains(it.second) || (item.seg.start >= it.first.start && item.seg.start - it.first.end <= 1.0 && handoff(people[it.second], people[item.first], it.first.end, item.seg.start))) &&
        (min(item.seg.end, it.first.end) > max(item.seg.start, it.first.start) || item.seg.start >= it.first.end)
    }
    if (k >= 0) {
      val c = confident[k].first
      confident[k] = Pair(Segment(min(c.start, item.seg.start), max(c.end, item.seg.end)), confident[k].second)
    } else {
      remaining.add(item.seg)
    }
  }
  return Pair(confident.map { it.first }, remaining)
}
