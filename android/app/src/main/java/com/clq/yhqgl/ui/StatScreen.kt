package com.clq.yhqgl.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.clq.yhqgl.data.local.AppDatabase
import com.clq.yhqgl.data.local.toDomain
import com.clq.yhqgl.data.settings.SettingsStore
import com.clq.yhqgl.rules.CouponRules

@Composable
fun StatScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val db = remember { AppDatabase.getInstance(context) }
    val coupons by db.couponDao().observeAll().collectAsState(initial = emptyList())
    val domainCoupons = coupons.map { it.toDomain() }

    val totalSavings = domainCoupons.sumOf { it.discountAmount ?: 0.0 }
    val usedSavings = domainCoupons.filter { it.isUsed }.sumOf { it.discountAmount ?: 0.0 }
    val unusedSavings = totalSavings - usedSavings

    val now = CouponRules.beijingNow()
    val usedCount = domainCoupons.count { it.isUsed }
    val unusedCount = domainCoupons.count { !it.isUsed && !CouponRules.isExpired(it) }
    val expiredCount = domainCoupons.count { !it.isUsed && CouponRules.isExpired(it) }

    val storeStats = CouponRules.groupByStore(domainCoupons).take(10)

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("统计分析", style = MaterialTheme.typography.headlineMedium)

        Card(modifier = Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(2.dp)) {
            Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                StatColumn("总计", "¥${totalSavings.toInt()}")
                StatColumn("已使用", "¥${usedSavings.toInt()}")
                StatColumn("待使用", "¥${unusedSavings.toInt()}")
            }
        }

        Card(modifier = Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(2.dp)) {
            Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                StatColumn("已使用", usedCount.toString())
                StatColumn("未使用", unusedCount.toString())
                StatColumn("已过期", expiredCount.toString())
            }
        }

        Card(modifier = Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(2.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("店铺排行榜", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                if (storeStats.isEmpty()) {
                    Text("暂无数据", color = MaterialTheme.colorScheme.outline)
                } else {
                    storeStats.forEachIndexed { index, stat ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("${index + 1}. ${stat.name} (${stat.count}张)")
                            Text("¥${stat.amount.toInt()}", color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatColumn(label: String, value: String) {
    Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
    }
}
