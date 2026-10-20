package com.clq.yhqgl.ui

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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

/**
 * 主页面（底部导航）
 */
@Composable
fun MainScreen(initialCouponId: String? = null) {
    var selectedIndex by rememberSaveable { mutableIntStateOf(0) }
    val items = listOf("列表" to Icons.Default.Home, "统计" to Icons.Default.Star, "设置" to Icons.Default.Settings)

    Scaffold(
        bottomBar = {
            NavigationBar {
                items.forEachIndexed { index, (label, icon) ->
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
            2 -> SettingsScreen(modifier = Modifier.padding(padding))
        }
    }
}
