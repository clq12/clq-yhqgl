package com.clq.yhqgl.worker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.clq.yhqgl.MainActivity
import com.clq.yhqgl.data.local.AppDatabase
import com.clq.yhqgl.data.settings.SettingsStore
import com.clq.yhqgl.rules.CouponRules
import java.util.concurrent.TimeUnit

/**
 * 每小时检查一次到期优惠券并发送状态栏通知
 */
 class ReminderWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val settings = SettingsStore(applicationContext).settings
        if (!settings.reminder.enabled) return Result.success()

        // 静默时段：到点也不弹，而且**不标记已提醒** —— 标记了就等于把这张券彻底吞掉，
        // 静默结束后再也不会提醒。跳过这一轮，等静默结束后的下一次巡检再补。
        if (inQuietHours(settings.reminder.quietStart, settings.reminder.quietEnd)) return Result.success()

        val remindDays = settings.reminder.remindDays
        val dao = AppDatabase.getInstance(applicationContext).couponDao()
        val coupons = dao.getAllActive().map { it.toDomain() }

        val reminders = coupons
            .filter { !it.isUsed }
            .mapNotNull { coupon ->
                val days = CouponRules.currentRemindDays(coupon, remindDays)
                if (days > 0) coupon to days else null
            }

        if (reminders.isEmpty()) return Result.success()

        // 提醒状态只写本地，不标 dirty、不上云 ——
        // 提醒是按设备各自计算的，同步过去会让另一台设备以为自己已经提醒过。
        for ((coupon, days) in reminders) {
            val entity = dao.getById(coupon.id) ?: continue
            val marked = (coupon.remindedDays + days).distinct().sorted()
            dao.insert(
                entity.copy(
                    isReminded = true,
                    remindedDaysJson = marked.joinToString(prefix = "[", postfix = "]", separator = ",")
                )
            )
        }

        showNotification(reminders.size, reminders.first().first.id)
        return Result.success()
    }

    /**
     * 是否处在静默时段。支持跨零点（22:00-08:00）。
     * 格式不合法或起止相同一律当作「没配静默时段」，不要因为脏数据把提醒停掉。
     */
    private fun inQuietHours(start: String?, end: String?): Boolean {
        val s = toMinutes(start) ?: return false
        val e = toMinutes(end) ?: return false
        if (s == e) return false
        val now = CouponRules.beijingNow()
        val cur = now.hour * 60 + now.minute
        return if (s < e) cur in s until e else cur >= s || cur < e
    }

    /** "HH:mm" → 当天第几分钟；解析不了返回 null */
    private fun toMinutes(value: String?): Int? {
        val raw = value?.trim().orEmpty()
        if (raw.isEmpty()) return null
        val parts = raw.split(":")
        if (parts.size != 2) return null
        val hour = parts[0].toIntOrNull() ?: return null
        val minute = parts[1].toIntOrNull() ?: return null
        if (hour !in 0..23 || minute !in 0..59) return null
        return hour * 60 + minute
    }

    private fun showNotification(count: Int, firstId: String) {
        val context = applicationContext
        val channelId = "coupon_expiry"
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "优惠券到期提醒",
                NotificationManager.IMPORTANCE_HIGH
            )
            manager.createNotificationChannel(channel)
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("couponId", firstId)
        }
        val pending = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("优惠券即将到期")
            .setContentText("有 $count 张优惠券即将到期，点击查看")
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()

        manager.notify(System.currentTimeMillis().toInt(), notification)
    }

    companion object {
        private const val WORK_NAME = "reminder_worker"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<ReminderWorker>(1, TimeUnit.HOURS)
                .setInitialDelay(15, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
        }
    }
}
