package com.clq.yhqgl.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import com.clq.yhqgl.R
import com.clq.yhqgl.di.ServiceLocator

/** 底部导航的一栏。图标用 composable 传，才能混用系统图标和自绘的 AI 图标 */
private data class NavEntry(
    val label: String,
    val index: Int,
    val icon: @Composable () -> Unit
)

/**
 * 主页面（底部导航）。
 *
 * 登录不是必须的：未登录就是「游客本地模式」，功能照常，只是不上云。
 * 登录入口在设置页，登录流程以全屏方式覆盖上来。
 *
 * 四栏：列表 / AI / 统计 / 设置。
 * AI 放在第二栏而不是塞进列表页的按钮里，是因为它现在是一条**对话流**：
 * 查到期、记新券、识图都在这条流里连续发生，弹窗撑不住（弹窗只适合一次性改一张）。
 */
@Composable
fun MainScreen(initialCouponId: String? = null) {
    var selectedIndex by rememberSaveable { mutableIntStateOf(0) }
    var showLogin by remember { mutableStateOf(false) }
    var accountRefresh by remember { mutableIntStateOf(0) }
    val session by ServiceLocator.session.collectAsState()

    val entries = listOf(
        NavEntry("列表", 0) { Icon(Icons.Default.Home, contentDescription = "列表") },
        NavEntry("AI", 1) { Icon(painterResource(R.drawable.ic_ai), contentDescription = "AI") },
        NavEntry("统计", 2) { Icon(Icons.Default.Star, contentDescription = "统计") },
        NavEntry("设置", 3) { Icon(Icons.Default.Settings, contentDescription = "设置") }
    )

    // 冷启动时如果已登录，先把本地待上传的和云端的对齐一次
    LaunchedEffect(Unit) {
        if (ServiceLocator.isSignedIn) {
            runCatching { ServiceLocator.repository.sync() }
        }
    }

    if (showLogin) {
        Surface(modifier = Modifier.fillMaxSize()) {
            LoginScreen(
                onLoggedIn = {
                    showLogin = false
                    accountRefresh += 1
                },
                onSkip = { showLogin = false }
            )
        }
        return
    }

    Scaffold(
        bottomBar = {
            NavigationBar {
                entries.forEach { entry ->
                    NavigationBarItem(
                        selected = selectedIndex == entry.index,
                        onClick = { selectedIndex = entry.index },
                        icon = entry.icon,
                        label = { Text(entry.label) }
                    )
                }
            }
        }
    ) { padding ->
        when (selectedIndex) {
            0 -> CouponListScreen(
                modifier = Modifier.padding(padding),
                initialCouponId = initialCouponId
            )
            1 -> AiScreen(
                modifier = Modifier.padding(padding),
                onOpenList = { selectedIndex = 0 }
            )
            2 -> StatScreen(modifier = Modifier.padding(padding))
            else -> SettingsScreen(
                modifier = Modifier.padding(padding),
                accountVersion = accountRefresh,
                onRequestLogin = { showLogin = true },
                onSignedOut = { accountRefresh += 1 }
            )
        }
    }
}
