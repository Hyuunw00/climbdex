package expo.modules.climbvideo

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

object BackgroundRun {
  private const val CHANNEL = "climbdex-detect"
  const val NOTIFICATION_ID = 4107
  private val lock = Any()
  @Volatile var active = false
    private set
  private var title = ""
  private var subtitle = ""
  private var baseSeconds = 0.0
  private var totalSeconds = 1.0
  private var currentSeconds = 0.0
  private var lastNotifyAt = 0L
  private var appContext: Context? = null

  fun start(context: Context, title: String, subtitle: String, totalSeconds: Double): Boolean {
    synchronized(lock) {
      if (active) return true
      this.title = title
      this.subtitle = subtitle
      this.totalSeconds = maxOf(1.0, totalSeconds)
      baseSeconds = 0.0
      currentSeconds = 0.0
      appContext = context.applicationContext
    }
    return try {
      val intent = Intent(context, DetectService::class.java)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      active = true
      true
    } catch (e: Exception) {
      active = false
      false
    }
  }

  fun setBase(completedSeconds: Double, subtitle: String) {
    synchronized(lock) {
      baseSeconds = completedSeconds
      currentSeconds = 0.0
      this.subtitle = subtitle
    }
    notifyNow(force = true)
  }

  fun report(videoSeconds: Double) {
    synchronized(lock) { currentSeconds = videoSeconds }
    notifyNow(force = false)
  }

  fun finish() {
    val context = synchronized(lock) { appContext }
    active = false
    context?.stopService(Intent(context, DetectService::class.java))
  }

  private fun notifyNow(force: Boolean) {
    if (!active) return
    val now = System.currentTimeMillis()
    val context = synchronized(lock) {
      if (!force && now - lastNotifyAt < 1000) return
      lastNotifyAt = now
      appContext
    } ?: return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, build(context))
  }

  fun build(context: Context): Notification {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(CHANNEL) == null) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "시도 구간 찾기", NotificationManager.IMPORTANCE_LOW))
    }
    val (t, s, done, total) = synchronized(lock) {
      listOf(title, subtitle, (baseSeconds + currentSeconds).toString(), totalSeconds.toString())
    }
    val max = 1000
    val progress = ((done.toDouble() / total.toDouble()) * max).toInt().coerceIn(0, max)
    @Suppress("DEPRECATION")
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL) else Notification.Builder(context)
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val pending = launch?.let {
      android.app.PendingIntent.getActivity(context, 0, it, android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT)
    }
    return builder
      .setContentTitle(t)
      .setContentText(s)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setProgress(max, progress, false)
      .apply { if (pending != null) setContentIntent(pending) }
      .build()
  }
}

class DetectService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = BackgroundRun.build(this)
    when {
      Build.VERSION.SDK_INT >= 35 -> startForeground(BackgroundRun.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING)
      Build.VERSION.SDK_INT >= 29 -> startForeground(BackgroundRun.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      else -> startForeground(BackgroundRun.NOTIFICATION_ID, notification)
    }
    return START_NOT_STICKY
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    BackgroundRun.finish()
    stopSelf()
  }
}
