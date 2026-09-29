package expo.modules.climbvideo

import kotlin.math.max

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

fun segments(d: List<Sample>, p: Params): List<Segment> {
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

    var k = i
    while (k > 0 && d[k].t - d[k - 1].t <= p.maxGap && rise[k - 1] > p.low) k--
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

fun mergeOverlapping(all: List<Segment>): List<Segment> {
  val merged = mutableListOf<Segment>()
  for (seg in all.sortedBy { it.start }) {
    val last = merged.lastOrNull()
    if (last != null && seg.start <= last.end) {
      merged[merged.size - 1] = Segment(last.start, max(last.end, seg.end))
    } else {
      merged.add(seg)
    }
  }
  return merged
}
