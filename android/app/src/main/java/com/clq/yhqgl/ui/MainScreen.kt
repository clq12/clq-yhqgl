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
import com.clq.yhqgl.di.ServiceLocator

/**
 * 主页面（底部导航）。
 *
 * 登录不是必须的：未登录就是「游客本地模式」，功能照常，只是不上云。
 * 登录入口在设置页，登录流程以全屏方式覆盖上来。
 */
@Composable
fun MainScreen(initialCouponId: String? = null) {
    var selectedIndex by rememberSaveable { mutableIntStateOf(0) }
    var showLogin by remember { mutableStateOf(false) }
    var accountRefresh by remember { mutableIntStateOf(0) }
    val session by ServiceLocator.session.collectAsState()

    val items = listOf(
        Triple("列表", Icons.Default.Home, 0),
        Triple("统计", Icons.Default.Star, 1),
        Triple("设置", Icons.Default.Settings, 2)
    )

    // 冷启动时如果已登录，先把本地待上传的和云端的对齐一次
    LaunchedEffect(Unit) {
        if (ServiceLocator.isSignedIn) {
            runCatching { ServiceLocator.repository.sync() }
        }
    }

    if (showLogin) {
        androidx.compose.material3.Surface(modifier = Modifier.fillMaxSize()) {
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
                items.forEach { (label, icon, index) ->
                    NavigationBarItem(
                        selected = selectedIndex == index,
                        onClick = { selectedIndex = index },
                        icon = { Icon(icon, contentDescription = label) },
                        label = { Text(label) }
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
            1 -> StatScreen(modifier = Modifier.padding(padding))
            2 -> SettingsScreen(
                modifier = Modifier.padding(padding),
                accountVersion = accountRefresh,
                onRequestLogin = { showLogin = true },
                onSignedOut = { accountRefresh += 1 }
            )
        }
    }
}
