package com.clq.yhqgl

import android.app.Application
import com.clq.yhqgl.di.ServiceLocator
import com.clq.yhqgl.worker.ReminderWorker
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class YhqApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // 依赖容器要先初始化：它会读取上次的登录态，界面第一次组合时就要用
        ServiceLocator.init(this)
        ReminderWorker.schedule(this)
    }
}
