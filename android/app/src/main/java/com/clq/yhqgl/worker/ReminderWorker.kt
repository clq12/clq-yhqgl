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
import com.clq.yhqgl.data.local.toDomain
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
        val settings = SettingsStore(applicationContext)
        if (!settings.settings.autoSync) return Result.success()

        val remindDays = listOf(7, 3, 1) // 后续从 settings 读取
        val db = AppDatabase.getInstance(applicationContext)
        val coupons = db.couponDao().getAll().map { it.toDomain() }

        val reminders = coupons
            .filter { !it.isUsed }
            .mapNotNull { coupon ->
                val days = CouponRules.currentRemindDays(coupon, remindDays)
                if (days > 0) coupon to days else null
            }

        if (reminders.isNotEmpty()) {
            showNotification(reminders.size, reminders.first().first.id)
        }
        return Result.success()
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
