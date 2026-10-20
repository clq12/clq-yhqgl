package com.clq.yhqgl

import android.app.Application
import com.clq.yhqgl.worker.ReminderWorker
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class YhqApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ReminderWorker.schedule(this)
    }
}
