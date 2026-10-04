package expo.modules.climbvideo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.media.MediaMetadataRetriever
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.Pose
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseLandmark
import com.google.mlkit.vision.pose.accurate.AccuratePoseDetectorOptions
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

data class Candidate(val ankleY: Double, val torso: Double, val x: Double, val y: Double, val confidence: Double)

class Track(c: Candidate, t: Double) {
  var x = c.x
  var y = c.y
  var torso = c.torso
  var lastT = t
  val samples = mutableListOf<Sample>()

  fun toJson(): JSONObject {
    val list = JSONArray()
    for (s in samples) list.put(JSONArray(listOf(s.t, s.ankleY, s.torso, s.x, s.y, s.confidence)))
    return JSONObject().put("x", x).put("y", y).put("torso", torso).put("lastT", lastT).put("samples", list)
  }

  companion object {
    fun fromJson(o: JSONObject): Track {
      val tr = Track(Candidate(0.0, o.getDouble("torso"), o.getDouble("x"), o.getDouble("y"), 0.0), o.getDouble("lastT"))
      val list = o.getJSONArray("samples")
      for (i in 0 until list.length()) {
        val a = list.getJSONArray(i)
        tr.samples.add(Sample(a.getDouble(0), a.getDouble(1), a.getDouble(2), a.getDouble(3), a.getDouble(4), a.getDouble(5)))
      }
      return tr
    }
  }
}

const val CHECKPOINT_VERSION = 1

private fun loadCheckpoint(file: File?): Pair<Double, MutableList<Track>>? {
  if (file == null || !file.exists()) return null
  return try {
    val o = JSONObject(file.readText())
    if (o.getInt("version") != CHECKPOINT_VERSION) return null
    val arr = o.getJSONArray("tracks")
    Pair(o.getDouble("nextT"), MutableList(arr.length()) { Track.fromJson(arr.getJSONObject(it)) })
  } catch (e: Exception) {
    null
  }
}

private fun saveCheckpoint(file: File?, nextT: Double, tracks: List<Track>) {
  if (file == null) return
  try {
    val arr = JSONArray()
    for (tr in tracks) arr.put(tr.toJson())
    val tmp = File(file.parentFile, file.name + ".tmp")
    tmp.writeText(JSONObject().put("version", CHECKPOINT_VERSION).put("nextT", nextT).put("tracks", arr).toString())
    tmp.renameTo(file)
  } catch (_: Exception) {
  }
}

data class VideoInfo(val width: Int, val height: Int, val durationSec: Double, val rotation: Int) {
  val displayWidth get() = if (rotation == 90 || rotation == 270) height else width
  val displayHeight get() = if (rotation == 90 || rotation == 270) width else height
}

fun videoInfo(context: Context, uri: Uri): VideoInfo {
  val retriever = MediaMetadataRetriever()
  try {
    retriever.setDataSource(context, uri)
    val w = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toInt() ?: 0
    val h = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toInt() ?: 0
    val ms = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLong() ?: 0L
    val rot = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toInt() ?: 0
    return VideoInfo(w, h, ms / 1000.0, rot)
  } finally {
    retriever.release()
  }
}

class PoseSampler(private val context: Context) {
  private val detector = PoseDetection.getClient(
    AccuratePoseDetectorOptions.Builder().setDetectorMode(AccuratePoseDetectorOptions.SINGLE_IMAGE_MODE).build()
  )
  private val tiles = listOf(
    doubleArrayOf(0.0, 0.0, 0.6, 0.6), doubleArrayOf(0.4, 0.0, 0.6, 0.6),
    doubleArrayOf(0.0, 0.4, 0.6, 0.6), doubleArrayOf(0.4, 0.4, 0.6, 0.6),
  )
  private val minConfidence = 0.3f
  private val frameLongSide = 960

  private fun candidates(bitmap: Bitmap, tile: DoubleArray?, aspect: Double): List<Candidate> {
    val region = if (tile == null) bitmap else {
      val left = (tile[0] * bitmap.width).toInt()
      val top = ((1 - tile[1] - tile[3]) * bitmap.height).toInt()
      val w = (tile[2] * bitmap.width).toInt()
      val h = (tile[3] * bitmap.height).toInt()
      Bitmap.createBitmap(bitmap, left, top, w, h)
    }
    val pose: Pose = Tasks.await(detector.process(InputImage.fromBitmap(region, 0)))
    val out = mutableListOf<Candidate>()
    fun point(type: Int): PoseLandmark? = pose.getPoseLandmark(type)?.takeIf { it.inFrameLikelihood >= minConfidence }
    val ankles = listOfNotNull(point(PoseLandmark.LEFT_ANKLE), point(PoseLandmark.RIGHT_ANKLE))
    val hips = listOfNotNull(point(PoseLandmark.LEFT_HIP), point(PoseLandmark.RIGHT_HIP))
    val shoulders = listOfNotNull(point(PoseLandmark.LEFT_SHOULDER), point(PoseLandmark.RIGHT_SHOULDER))
    if (ankles.isEmpty() || hips.isEmpty() || shoulders.isEmpty()) return out
    val rw = region.width.toDouble()
    val rh = region.height.toDouble()
    val ankleY = ankles.minOf { 1 - it.position.y / rh }
    val rootX = hips.map { it.position.x / rw }.average()
    val rootY = hips.map { 1 - it.position.y / rh }.average()
    val neckX = shoulders.map { it.position.x / rw }.average()
    val neckY = shoulders.map { 1 - it.position.y / rh }.average()
    val boxX = tile?.get(0) ?: 0.0
    val boxY = tile?.get(1) ?: 0.0
    val boxW = tile?.get(2) ?: 1.0
    val boxH = tile?.get(3) ?: 1.0
    val dx = (neckX - rootX) * boxW * aspect
    val dy = (neckY - rootY) * boxH
    val torso = sqrt(dx * dx + dy * dy)
    val leg = (rootY - ankleY) * boxH
    if (neckY <= rootY || leg < 0.6 * torso || leg > 3.5 * torso) return out
    val confidence = (ankles + hips + shoulders).map { it.inFrameLikelihood.toDouble() }.average()
    out.add(Candidate(boxY + ankleY * boxH, torso, boxX + rootX * boxW, boxY + rootY * boxH, confidence))
    return out
  }

  fun sample(uri: Uri, fps: Double, from: Double? = null, to: Double? = null, checkpoint: File? = null, onProgress: ((Double) -> Unit)? = null): List<List<Sample>> {
    val info = videoInfo(context, uri)
    val aspect = info.displayWidth.toDouble() / info.displayHeight.toDouble()
    val followRadius = 0.25
    val torsoBand = 0.5..2.0
    val trackTimeout = 6.0
    val resumed = if (from == null) loadCheckpoint(checkpoint) else null
    val tracks = resumed?.second ?: mutableListOf()
    val startAt = resumed?.first ?: from ?: 0.0
    var savedAt = startAt
    val source = FrameSource(context, uri)
    try {
      val end = min(info.durationSec, to ?: info.durationSec)
      source.frames(startAt, end, fps, frameLongSide) { t, bitmap ->
        run {
          var found = candidates(bitmap, null, aspect)
          if (found.isEmpty()) {
            found = tiles.flatMap { candidates(bitmap, it, aspect) }
          }
          val unique = mutableListOf<Candidate>()
          for (c in found.sortedByDescending { it.confidence }) {
            if (unique.none { sqrt((c.x - it.x) * (c.x - it.x) + (c.y - it.y) * (c.y - it.y)) < 0.1 }) unique.add(c)
          }
          val taken = mutableSetOf<Int>()
          for (c in unique) {
            var best: Int? = null
            var bestScore = Double.MAX_VALUE
            tracks.forEachIndexed { n, tr ->
              if (n in taken || t - tr.lastT > trackTimeout || c.torso / tr.torso !in torsoBand) return@forEachIndexed
              val dist = sqrt((c.x - tr.x) * (c.x - tr.x) + (c.y - tr.y) * (c.y - tr.y))
              val radius = min(0.4, followRadius + 0.1 * (t - tr.lastT))
              if (dist <= radius && dist / radius < bestScore) { best = n; bestScore = dist / radius }
            }
            val tr = if (best != null) tracks[best!!].also { taken.add(best!!) } else Track(c, t).also { tracks.add(it); taken.add(tracks.size - 1) }
            tr.x = c.x; tr.y = c.y; tr.torso = c.torso; tr.lastT = t
            tr.samples.add(Sample(t, c.ankleY, c.torso, c.x, c.y, c.confidence))
          }
        }
        onProgress?.invoke(t)
        if (checkpoint != null && t - savedAt >= 30) {
          saveCheckpoint(checkpoint, t + 1.0 / fps, tracks)
          savedAt = t
        }
      }
    } finally {
      source.release()
    }
    checkpoint?.delete()
    return tracks.map { dropStatic(it.samples) }.filter { !isStatic(it) }
  }

  private fun isStatic(samples: List<Sample>): Boolean {
    if (samples.size < 2 || samples.last().t - samples.first().t < 8.0) return false
    fun spread(values: List<Double>) = (values.maxOrNull() ?: 0.0) - (values.minOrNull() ?: 0.0)
    return spread(samples.map { it.ankleY }) < 0.06 && spread(samples.map { it.x }) < 0.05 && spread(samples.map { it.y }) < 0.05
  }

  fun close() = detector.close()
}
