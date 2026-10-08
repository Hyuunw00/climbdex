package expo.modules.climbvideo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.Build
import android.os.PerformanceHintManager
import android.os.Process
import java.io.ByteArrayOutputStream
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.roundToInt

class FrameSource(private val context: Context, private val uri: Uri) {
  private val extractor = MediaExtractor()
  private lateinit var codec: MediaCodec
  private val info = MediaCodec.BufferInfo()
  private var rotation = 0
  private var inputDone = false
  private var outputDone = false
  var outputs = 0
  var nullImages = 0
  var zeroSize = 0
  var delivered = 0

  init {
    extractor.setDataSource(context, uri, null)
    var trackIndex = -1
    var format: MediaFormat? = null
    for (i in 0 until extractor.trackCount) {
      val f = extractor.getTrackFormat(i)
      if (f.getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true) {
        trackIndex = i
        format = f
        break
      }
    }
    val videoFormat = format ?: throw IllegalStateException("no video track")
    extractor.selectTrack(trackIndex)
    if (videoFormat.containsKey(MediaFormat.KEY_ROTATION)) rotation = videoFormat.getInteger(MediaFormat.KEY_ROTATION)
    videoFormat.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
    codec = MediaCodec.createDecoderByType(videoFormat.getString(MediaFormat.KEY_MIME)!!)
    codec.configure(videoFormat, null, null, 0)
    codec.start()
  }

  fun seek(seconds: Double) {
    extractor.seekTo((seconds * 1_000_000).toLong(), MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
    codec.flush()
    inputDone = false
    outputDone = false
  }

  fun frames(fromSec: Double, toSec: Double, fps: Double, longSide: Int, cancelled: () -> Boolean = { false }, block: (Double, Bitmap) -> Unit) {
    val queue = ArrayBlockingQueue<Any>(3)
    val stop = AtomicBoolean(false)
    val done = Any()
    var failure: Throwable? = null
    fun offer(item: Any) {
      while (!stop.get() && !queue.offer(item, 100, TimeUnit.MILLISECONDS)) {}
    }
    val consumerTid = Process.myTid()
    var producerTid = 0
    val ready = java.util.concurrent.CountDownLatch(1)
    val producer = Thread {
      try {
        producerTid = Process.myTid()
        Process.setThreadPriority(Process.THREAD_PRIORITY_DISPLAY)
        ready.countDown()
        decode(fromSec, toSec, fps, longSide, stop, cancelled) { t, bitmap -> offer(Pair(t, bitmap)) }
      } catch (e: Throwable) {
        failure = e
      } finally {
        offer(done)
      }
    }
    producer.start()
    ready.await()
    val previousPriority = Process.getThreadPriority(consumerTid)
    Process.setThreadPriority(Process.THREAD_PRIORITY_DISPLAY)
    val targetNs = (1_000_000_000L / fps / 3).toLong()
    val hint = if (Build.VERSION.SDK_INT >= 31) {
      try {
        context.getSystemService(PerformanceHintManager::class.java)?.createHintSession(intArrayOf(consumerTid, producerTid), targetNs)
      } catch (_: Exception) { null }
    } else null
    var lastFrame = System.nanoTime()
    try {
      while (true) {
        val item = queue.take()
        if (item === done) break
        @Suppress("UNCHECKED_CAST")
        val pair = item as Pair<Double, Bitmap>
        block(pair.first, pair.second)
        val now = System.nanoTime()
        if (Build.VERSION.SDK_INT >= 31) hint?.reportActualWorkDuration(now - lastFrame)
        lastFrame = now
      }
      failure?.let { throw it }
    } finally {
      stop.set(true)
      queue.clear()
      producer.join()
      if (Build.VERSION.SDK_INT >= 31) hint?.close()
      Process.setThreadPriority(previousPriority)
    }
  }

  private fun decode(fromSec: Double, toSec: Double, fps: Double, longSide: Int, stop: AtomicBoolean, cancelled: () -> Boolean, emit: (Double, Bitmap) -> Unit) {
    seek(fromSec)
    var nextT = fromSec
    val step = 1.0 / fps
    while (!outputDone && !stop.get() && !cancelled()) {
      if (!inputDone) {
        val inIndex = codec.dequeueInputBuffer(10_000)
        if (inIndex >= 0) {
          val buffer = codec.getInputBuffer(inIndex)!!
          val size = extractor.readSampleData(buffer, 0)
          if (size < 0) {
            codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            inputDone = true
          } else {
            codec.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
            extractor.advance()
          }
        }
      }
      val outIndex = codec.dequeueOutputBuffer(info, 10_000)
      if (outIndex >= 0) {
        val t = info.presentationTimeUs / 1_000_000.0
        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
        if (t > toSec) {
          codec.releaseOutputBuffer(outIndex, false)
          break
        }
        outputs++
        if (info.size == 0) zeroSize++
        if (t + 1e-3 >= nextT && info.size > 0) {
          nextT += step
          val image = codec.getOutputImage(outIndex)
          if (image != null) {
            val bitmap = toBitmap(image, longSide)
            image.close()
            delivered++
            emit(t, bitmap)
          } else {
            nullImages++
          }
        }
        codec.releaseOutputBuffer(outIndex, false)
      }
    }
  }

  private fun toBitmap(image: Image, longSide: Int): Bitmap {
    val nv21 = yuv420ToNv21(image)
    val yuv = YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
    val scale = max(1, (max(image.width, image.height).toDouble() / longSide).roundToInt())
    val out = ByteArrayOutputStream()
    yuv.compressToJpeg(Rect(0, 0, image.width, image.height), 85, out)
    val bytes = out.toByteArray()
    val options = BitmapFactory.Options().apply { inSampleSize = scale }
    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    if (rotation == 0) return decoded
    val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
    return Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
  }

  private fun yuv420ToNv21(image: Image): ByteArray {
    val width = image.width
    val height = image.height
    val ySize = width * height
    val out = ByteArray(ySize + ySize / 2)
    val yPlane = image.planes[0]
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]
    val yBuffer = yPlane.buffer
    val yRowStride = yPlane.rowStride
    var pos = 0
    if (yRowStride == width) {
      yBuffer.get(out, 0, ySize)
      pos = ySize
    } else {
      for (row in 0 until height) {
        yBuffer.position(row * yRowStride)
        yBuffer.get(out, pos, width)
        pos += width
      }
    }
    val uBuffer = uPlane.buffer
    val vBuffer = vPlane.buffer
    val chromaRowStride = uPlane.rowStride
    val chromaPixelStride = uPlane.pixelStride
    val chromaHeight = height / 2
    val chromaWidth = width / 2
    for (row in 0 until chromaHeight) {
      for (col in 0 until chromaWidth) {
        val index = row * chromaRowStride + col * chromaPixelStride
        out[pos++] = vBuffer.get(index)
        out[pos++] = uBuffer.get(index)
      }
    }
    return out
  }

  fun stats() = "outputs=$outputs delivered=$delivered nullImages=$nullImages zeroSize=$zeroSize"

  fun release() {
    try { codec.stop() } catch (_: Exception) {}
    codec.release()
    extractor.release()
  }
}
