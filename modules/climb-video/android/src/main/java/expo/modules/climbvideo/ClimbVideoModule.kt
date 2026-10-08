package expo.modules.climbvideo

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.UUID
import kotlin.math.max

class ClimbVideoModule : Module() {
  private var pendingPick: Promise? = null
  private val pickRequest = 4211
  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ClimbVideo")

    AsyncFunction("trim") Coroutine { uri: String, start: Double, end: Double ->
      val output = File(context.cacheDir, "climbdex-${UUID.randomUUID()}.mp4")
      withContext(Dispatchers.IO) {
        Exporter.run(context, Uri.parse(uri), start, end, output, emptyList())
      }
      Uri.fromFile(output).toString()
    }

    AsyncFunction("thumbnails") Coroutine { uri: String, times: List<Double>, width: Double ->
      withContext(Dispatchers.IO) {
        val source = Uri.parse(uri)
        val info = videoInfo(context, source)
        val scale = width / max(info.displayWidth, info.displayHeight).toDouble()
        val dstW = max(1, (info.displayWidth * scale).toInt())
        val dstH = max(1, (info.displayHeight * scale).toInt())
        val dir = File(context.cacheDir, "thumbs").apply { mkdirs() }
        val name = source.lastPathSegment?.substringBeforeLast('.') ?: "video"
        val retriever = MediaMetadataRetriever()
        try {
          retriever.setDataSource(context, source)
          times.map { t ->
            val file = File(dir, "$name-${(t * 1000).toInt()}-${width.toInt()}.jpg")
            if (!file.exists()) {
              val bitmap = retriever.getScaledFrameAtTime((t * 1_000_000).toLong(), MediaMetadataRetriever.OPTION_CLOSEST_SYNC, dstW, dstH)
              if (bitmap != null) {
                FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 70, it) }
              }
            }
            Uri.fromFile(file).toString()
          }
        } finally {
          retriever.release()
        }
      }
    }

    AsyncFunction("pickVideos") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("NoActivity", "화면을 찾지 못했어요", null)
        return@AsyncFunction
      }
      pendingPick?.resolve(emptyList<Any>())
      pendingPick = promise
      val intent = if (Build.VERSION.SDK_INT >= 33) {
        Intent(MediaStore.ACTION_PICK_IMAGES).apply {
          type = "video/*"
          putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, MediaStore.getPickImagesMaxLimit())
        }
      } else {
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "video/*"
          putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
      }
      activity.startActivityForResult(intent, pickRequest)
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != pickRequest) return@OnActivityResult
      val promise = pendingPick ?: return@OnActivityResult
      pendingPick = null
      val data = payload.data
      if (payload.resultCode != Activity.RESULT_OK || data == null) {
        promise.resolve(emptyList<Any>())
        return@OnActivityResult
      }
      val uris = mutableListOf<Uri>()
      data.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri) }
      if (uris.isEmpty()) data.data?.let { uris.add(it) }
      val resolver = context.contentResolver
      val items = uris.mapNotNull { uri ->
        try {
          try {
            resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
          } catch (_: Exception) {
          }
          val info = videoInfo(context, uri)
          var name: String? = null
          var takenMs: Long? = null
          resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) name = c.getString(0)
          }
          try {
            resolver.query(uri, arrayOf(MediaStore.MediaColumns.DATE_TAKEN), null, null, null)?.use { c ->
              if (c.moveToFirst() && !c.isNull(0)) takenMs = c.getLong(0).takeIf { it > 0 }
            }
          } catch (_: Exception) {
          }
          if (takenMs == null) takenMs = videoDateMs(context, uri)
          mapOf(
            "uri" to uri.toString(),
            "assetId" to uri.toString(),
            "duration" to info.durationSec,
            "width" to info.displayWidth,
            "height" to info.displayHeight,
            "fileName" to name,
            "createdAt" to takenMs,
          )
        } catch (_: Exception) {
          null
        }
      }
      promise.resolve(items)
    }

    AsyncFunction("resolveUri") { uri: String -> uri }

    AsyncFunction("assetLocation") { assetId: String ->
      val decoded = Uri.decode(assetId)
      val id = Regex("(\\d+)$").find(decoded)?.groupValues?.get(1)?.toLongOrNull() ?: return@AsyncFunction null
      var uri = android.content.ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
      if (android.os.Build.VERSION.SDK_INT >= 29) uri = MediaStore.setRequireOriginal(uri)
      val iso = quickTimeLocation(context, uri) ?: retrieverLocation(context, uri)
      val pathColumn = if (android.os.Build.VERSION.SDK_INT >= 29) MediaStore.MediaColumns.RELATIVE_PATH else MediaStore.MediaColumns.DATA
      val base = android.content.ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
      val path = context.contentResolver.query(base, arrayOf(pathColumn), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: ""
      android.util.Log.i("ClimbVideo", "assetLocation id=$id iso=$iso path=$path")
      val out = mutableMapOf<String, Any>("camera" to path.contains("DCIM/"))
      iso?.let { Regex("([+-][0-9.]+)([+-][0-9.]+)").find(it) }?.let { m ->
        out["lat"] = m.groupValues[1].toDouble()
        out["lng"] = m.groupValues[2].toDouble()
      }
      out
    }

    Function("cancelDetect") { uri: String ->
      DetectCancels.add(uri)
      checkpointFile(uri).delete()
    }

    Function("startBackgroundRun") { title: String, subtitle: String, totalSeconds: Double ->
      BackgroundRun.start(context, title, subtitle, totalSeconds)
    }

    Function("updateBackgroundRun") { completedSeconds: Double, subtitle: String ->
      BackgroundRun.setBase(completedSeconds, subtitle)
    }

    Function("finishBackgroundRun") { _: Boolean ->
      BackgroundRun.finish()
    }

    Function("backgroundRunActive") {
      BackgroundRun.active
    }

    AsyncFunction("detect") Coroutine { uri: String ->
      withContext(Dispatchers.IO) {
        val sampler = PoseSampler(context)
        val params = Params()
        try {
          DetectCancels.clear(uri)
          var people = sampler.sample(Uri.parse(uri), 5.0, checkpoint = checkpointFile(uri), onProgress = { BackgroundRun.report(it) }, cancelKey = uri)
          if (sampler.framesSeen == 0 && videoInfo(context, Uri.parse(uri)).durationSec > 0.5) {
            android.util.Log.w("ClimbVideo", "no frames decoded, retrying: " + sampler.sourceStats)
            people = sampler.sample(Uri.parse(uri), 5.0, checkpoint = checkpointFile(uri), onProgress = { BackgroundRun.report(it) }, cancelKey = uri)
            if (sampler.framesSeen == 0) throw NoFramesException(sampler.sourceStats)
          }
          val all = people.withIndex()
            .filter { it.value.size >= (params.minDuration * 5).toInt() }
            .flatMap { (n, samples) -> segments(samples, params, people.filterIndexed { k, _ -> k != n }.flatten()).map { Pair(it, n) } }
          val (confident, low) = resolveClips(people, mergeOverlappingP(all, people))
          android.util.Log.i("ClimbVideo", "timing " + Timing.summary() + " gpu=" + sampler.gpu)
          mapOf(
            "handheld" to false,
            "segments" to confident.map { mapOf("start" to it.start, "end" to it.end) },
            "candidates" to low.map { mapOf("start" to it.start, "end" to it.end) },
            "tracks" to people.map { track -> track.map { listOf(r3(it.t), r3(it.x), r3(it.y), r3(it.torso), r3(it.ankleY)) } },
          )
        } finally {
          sampler.close()
        }
      }
    }

    AsyncFunction("followPath") Coroutine { uri: String, start: Double, end: Double, tracks: List<List<List<Double>>>? ->
      val source = Uri.parse(uri)
      withContext(Dispatchers.IO) {
        val person = personFrom(tracks, start, end) ?: run {
          val sampler = PoseSampler(context)
          try {
            sampler.sample(source, 5.0, start, end).maxByOrNull { it.size }
          } finally {
            sampler.close()
          }
        }
        if (person == null || person.size < 3) throw NoPersonException()
        val info = videoInfo(context, source)
        val frameW = info.displayWidth.toDouble()
        val frameH = info.displayHeight.toDouble()
        val path = FollowPath(person, 0.75)
        val crop = followCropSize(frameW, frameH, median(person.map { it.torso }))
        mapOf(
          "frame" to mapOf("width" to frameW, "height" to frameH),
          "crop" to mapOf("width" to crop.width, "height" to crop.height),
          "points" to person.map { s ->
            val rect = followRect(frameW, frameH, crop, path.position(s.t))
            mapOf("t" to s.t, "x" to rect.x, "y" to rect.y)
          },
        )
      }
    }

    AsyncFunction("cropPlan") Coroutine { uri: String ->
      val source = Uri.parse(uri)
      withContext(Dispatchers.IO) {
        val info = videoInfo(context, source)
        val frameW = info.displayWidth.toDouble()
        val frameH = info.displayHeight.toDouble()
        val crop = followCropSize(frameW, frameH, 1.0)
        val rect = followRect(frameW, frameH, crop, Pair(0.5, 0.5))
        mapOf(
          "frame" to mapOf("width" to frameW, "height" to frameH),
          "crop" to mapOf("width" to crop.width, "height" to crop.height),
          "points" to listOf(mapOf("t" to 0.0, "x" to rect.x, "y" to rect.y)),
        )
      }
    }

    AsyncFunction("exportCrop") Coroutine { uri: String, start: Double, end: Double ->
      val source = Uri.parse(uri)
      val output = File(context.cacheDir, "climbdex-crop-${UUID.randomUUID()}.mp4")
      withContext(Dispatchers.IO) {
        val info = videoInfo(context, source)
        val path = FollowPath(listOf(Sample(0.0, 0.0, 1.0, 0.5, 0.5)), 0.75)
        Exporter.run(context, source, start, end, output, Exporter.followEffects(info, path, 1.0, start))
      }
      Uri.fromFile(output).toString()
    }

    AsyncFunction("exportFollow") Coroutine { uri: String, start: Double, end: Double, tracks: List<List<List<Double>>>? ->
      val source = Uri.parse(uri)
      val output = File(context.cacheDir, "climbdex-follow-${UUID.randomUUID()}.mp4")
      withContext(Dispatchers.IO) {
        val person = personFrom(tracks, start, end) ?: run {
          val sampler = PoseSampler(context)
          try {
            sampler.sample(source, 5.0, start, end).maxByOrNull { it.size }
          } finally {
            sampler.close()
          }
        }
        if (person == null || person.size < 3) throw NoPersonException()
        val info = videoInfo(context, source)
        val path = FollowPath(person, 0.75)
        val torso = median(person.map { it.torso })
        Exporter.run(context, source, start, end, output, Exporter.followEffects(info, path, torso, start))
      }
      Uri.fromFile(output).toString()
    }
  }
}

private fun ClimbVideoModule.checkpointFile(uri: String): File {
  val digest = MessageDigest.getInstance("SHA-256").digest(uri.toByteArray()).joinToString("") { "%02x".format(it) }
  val dir = File(appContext.reactContext!!.cacheDir, "detect-checkpoints").apply { mkdirs() }
  return File(dir, digest.take(32) + ".json")
}

private fun r3(v: Double) = Math.round(v * 1000) / 1000.0

private fun personFrom(tracks: List<List<List<Double>>>?, start: Double, end: Double): List<Sample>? {
  if (tracks == null) return null
  val people = tracks.map { track ->
    track.filter { it.size >= 5 && it[0] >= start && it[0] <= end }.map { Sample(it[0], it[4], it[3], it[1], it[2]) }
  }
  return people.maxByOrNull { it.size }?.takeIf { it.size >= 3 }
}

class NoPersonException : expo.modules.kotlin.exception.CodedException("구간 안에서 사람을 못 찾았어요")
class NoFramesException(stats: String) : expo.modules.kotlin.exception.CodedException("영상에서 프레임을 못 읽었어요 ($stats)")

private fun videoDateMs(context: android.content.Context, uri: Uri): Long? {
  val retriever = android.media.MediaMetadataRetriever()
  return try {
    retriever.setDataSource(context, uri)
    val raw = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DATE) ?: return null
    val format = java.text.SimpleDateFormat("yyyyMMdd'T'HHmmss", java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
    format.parse(raw.take(15))?.time
  } catch (_: Exception) {
    null
  } finally {
    retriever.release()
  }
}

private fun retrieverLocation(context: android.content.Context, uri: Uri): String? {
  val retriever = android.media.MediaMetadataRetriever()
  return try {
    retriever.setDataSource(context, uri)
    retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_LOCATION)
  } catch (_: Exception) {
    null
  } finally {
    retriever.release()
  }
}

private fun quickTimeLocation(context: android.content.Context, uri: Uri): String? {
  return try {
    context.contentResolver.openFileDescriptor(uri, "r")?.use { pfd ->
      java.io.FileInputStream(pfd.fileDescriptor).channel.use { channel ->
        val reader = BoxReader(channel)
        val moov = reader.children(0, channel.size()).firstOrNull { it.type == "moov" } ?: return null
        val meta = reader.children(moov.start + moov.header, moov.end).firstOrNull { it.type == "meta" } ?: return null
        var inner = meta.start + meta.header
        if (reader.int(inner) == 0) inner += 4
        val parts = reader.children(inner, meta.end)
        val keysBox = parts.firstOrNull { it.type == "keys" } ?: return null
        val ilst = parts.firstOrNull { it.type == "ilst" } ?: return null
        val keys = mutableListOf<String>()
        var pos = keysBox.start + keysBox.header + 4
        val count = reader.int(pos); pos += 4
        repeat(count) {
          val size = reader.int(pos)
          keys.add(reader.string(pos + 8, size - 8))
          pos += size
        }
        val index = keys.indexOf("com.apple.quicktime.location.ISO6709") + 1
        if (index == 0) return null
        for (item in reader.children(ilst.start + ilst.header, ilst.end)) {
          if (reader.int(item.start + 4) != index) continue
          val data = reader.children(item.start + item.header, item.end).firstOrNull { it.type == "data" } ?: continue
          return reader.string(data.start + data.header + 8, (data.end - data.start - data.header - 8).toInt())
        }
        null
      }
    }
  } catch (_: Exception) {
    null
  }
}

private class Box(val start: Long, val end: Long, val type: String, val header: Int)

private class BoxReader(private val channel: java.nio.channels.FileChannel) {
  private fun read(pos: Long, len: Int): java.nio.ByteBuffer {
    val buf = java.nio.ByteBuffer.allocate(len)
    var offset = pos
    while (buf.hasRemaining()) {
      val n = channel.read(buf, offset)
      if (n <= 0) break
      offset += n
    }
    buf.flip()
    return buf
  }
  fun int(pos: Long): Int = read(pos, 4).int
  fun string(pos: Long, len: Int): String = String(read(pos, len).let { b -> ByteArray(b.remaining()).also { b.get(it) } }, Charsets.UTF_8)
  fun children(from: Long, to: Long): List<Box> {
    val out = mutableListOf<Box>()
    var pos = from
    while (pos + 8 <= to) {
      val head = read(pos, 16)
      if (head.remaining() < 8) break
      var size = (head.int.toLong() and 0xffffffffL)
      val typeBytes = ByteArray(4).also { head.get(it) }
      var header = 8
      if (size == 1L) { size = head.long; header = 16 } else if (size == 0L) size = to - pos
      if (size < header) break
      out.add(Box(pos, minOf(pos + size, to), String(typeBytes, Charsets.ISO_8859_1), header))
      pos += size
    }
    return out
  }
}
