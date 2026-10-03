package expo.modules.climbvideo

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max

class ClimbVideoModule : Module() {
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

    AsyncFunction("detect") Coroutine { uri: String ->
      withContext(Dispatchers.IO) {
        val sampler = PoseSampler(context)
        val params = Params()
        try {
          val people = sampler.sample(Uri.parse(uri), 5.0)
          val all = people.withIndex()
            .filter { it.value.size >= (params.minDuration * 5).toInt() }
            .flatMap { (n, samples) -> segments(samples, params).map { Pair(it, n) } }
          val merged = mergeOverlapping(all, people)
          mapOf(
            "handheld" to false,
            "segments" to merged.map { mapOf("start" to it.start, "end" to it.end) },
            "candidates" to candidateSpans(people, merged).map { mapOf("start" to it.start, "end" to it.end) },
          )
        } finally {
          sampler.close()
        }
      }
    }

    AsyncFunction("followPath") Coroutine { uri: String, start: Double, end: Double ->
      val source = Uri.parse(uri)
      withContext(Dispatchers.IO) {
        val sampler = PoseSampler(context)
        val person = try {
          sampler.sample(source, 5.0, start, end).maxByOrNull { it.size }
        } finally {
          sampler.close()
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

    AsyncFunction("exportFollow") Coroutine { uri: String, start: Double, end: Double ->
      val source = Uri.parse(uri)
      val output = File(context.cacheDir, "climbdex-follow-${UUID.randomUUID()}.mp4")
      withContext(Dispatchers.IO) {
        val sampler = PoseSampler(context)
        val person = try {
          sampler.sample(source, 5.0, start, end).maxByOrNull { it.size }
        } finally {
          sampler.close()
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

class NoPersonException : expo.modules.kotlin.exception.CodedException("구간 안에서 사람을 못 찾았어요")
