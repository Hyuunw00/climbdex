package expo.modules.climbvideo

import android.content.Context
import android.graphics.Matrix
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Crop
import androidx.media3.effect.MatrixTransformation
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import kotlinx.coroutines.CompletableDeferred
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class FollowPath(samples: List<Sample>, window: Double) {
  private val points: List<Triple<Double, Double, Double>> = samples.map { s ->
    val near = samples.filter { abs(it.t - s.t) <= window }
    Triple(s.t, near.map { it.x }.average(), near.map { it.y }.average())
  }

  fun position(t: Double): Pair<Double, Double> {
    val first = points.firstOrNull() ?: return 0.5 to 0.5
    val last = points.last()
    if (t <= first.first) return first.second to first.third
    if (t >= last.first) return last.second to last.third
    var i = 0
    while (i + 1 < points.size && points[i + 1].first < t) i++
    val a = points[i]
    val b = points[i + 1]
    val f = (t - a.first) / max(1e-6, b.first - a.first)
    return (a.second + (b.second - a.second) * f) to (a.third + (b.third - a.third) * f)
  }
}

data class CropSize(val width: Double, val height: Double)

fun followCropSize(frameW: Double, frameH: Double, torso: Double): CropSize {
  val fraction = min(1.0, max(0.45, torso * 5.5 / 0.55))
  var h = frameH * fraction
  var w = h * 9 / 16
  if (w > frameW) {
    w = frameW
    h = w * 16 / 9
    if (h > frameH) {
      h = frameH
      w = h * 9 / 16
    }
  }
  return CropSize(w, h)
}

data class CropRect(val x: Double, val y: Double, val width: Double, val height: Double)

fun followRect(frameW: Double, frameH: Double, crop: CropSize, center: Pair<Double, Double>): CropRect {
  val cx = center.first * frameW
  val cy = (1 - center.second) * frameH
  var x = cx - crop.width / 2
  var y = cy - crop.height * 0.55
  x = min(max(0.0, x), frameW - crop.width)
  y = min(max(0.0, y), frameH - crop.height)
  return CropRect(x, y, crop.width, crop.height)
}

@OptIn(UnstableApi::class)
object Exporter {
  suspend fun run(context: Context, uri: Uri, startSec: Double, endSec: Double, output: File, effects: List<Effect>) {
    val deferred = CompletableDeferred<Unit>()
    Handler(Looper.getMainLooper()).post {
      try {
        val mediaItem = MediaItem.Builder()
          .setUri(uri)
          .setClippingConfiguration(
            MediaItem.ClippingConfiguration.Builder()
              .setStartPositionMs((startSec * 1000).toLong())
              .setEndPositionMs((endSec * 1000).toLong())
              .build()
          )
          .build()
        val edited = EditedMediaItem.Builder(mediaItem).setEffects(Effects(emptyList(), effects)).build()
        val transformer = Transformer.Builder(context)
          .addListener(object : Transformer.Listener {
            override fun onCompleted(composition: Composition, exportResult: ExportResult) {
              deferred.complete(Unit)
            }

            override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
              deferred.completeExceptionally(exportException)
            }
          })
          .build()
        transformer.start(edited, output.absolutePath)
      } catch (e: Exception) {
        deferred.completeExceptionally(e)
      }
    }
    deferred.await()
  }

  fun followEffects(info: VideoInfo, path: FollowPath, torso: Double, clipStart: Double): List<Effect> {
    val frameW = info.displayWidth.toDouble()
    val frameH = info.displayHeight.toDouble()
    val crop = followCropSize(frameW, frameH, torso)
    val matrix = MatrixTransformation { presentationTimeUs ->
      val rect = followRect(frameW, frameH, crop, path.position(clipStart + presentationTimeUs / 1_000_000.0))
      val cx = ((rect.x + rect.width / 2) / frameW) * 2 - 1
      val cy = 1 - ((rect.y + rect.height / 2) / frameH) * 2
      val scale = (frameH / rect.height).toFloat()
      Matrix().apply {
        postTranslate(-cx.toFloat(), -cy.toFloat())
        postScale(scale, scale)
      }
    }
    val halfWidth = ((crop.width * (frameH / crop.height)) / frameW).toFloat()
    return listOf(
      matrix,
      Crop(-halfWidth, halfWidth, -1f, 1f),
      Presentation.createForWidthAndHeight(1080, 1920, Presentation.LAYOUT_SCALE_TO_FIT),
    )
  }
}
