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
          resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) name = c.getString(0)
          }
          mapOf(
            "uri" to uri.toString(),
            "assetId" to uri.toString(),
            "duration" to info.durationSec,
            "width" to info.displayWidth,
            "height" to info.displayHeight,
            "fileName" to name,
          )
        } catch (_: Exception) {
          null
        }
      }
      promise.resolve(items)
    }

    AsyncFunction("resolveUri") { uri: String -> uri }

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
          val people = sampler.sample(Uri.parse(uri), 5.0, checkpoint = checkpointFile(uri), onProgress = { BackgroundRun.report(it) }, cancelKey = uri)
          val all = people.withIndex()
            .filter { it.value.size >= (params.minDuration * 5).toInt() }
            .flatMap { (n, samples) -> segments(samples, params, people.filterIndexed { k, _ -> k != n }.flatten()).map { Pair(it, n) } }
          val (confident, low) = resolveClips(people, mergeOverlappingP(all, people))
          mapOf(
            "handheld" to false,
            "segments" to confident.map { mapOf("start" to it.start, "end" to it.end) },
            "candidates" to low.map { mapOf("start" to it.start, "end" to it.end) },
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

private fun ClimbVideoModule.checkpointFile(uri: String): File {
  val digest = MessageDigest.getInstance("SHA-256").digest(uri.toByteArray()).joinToString("") { "%02x".format(it) }
  val dir = File(appContext.reactContext!!.cacheDir, "detect-checkpoints").apply { mkdirs() }
  return File(dir, digest.take(32) + ".json")
}

class NoPersonException : expo.modules.kotlin.exception.CodedException("구간 안에서 사람을 못 찾았어요")
