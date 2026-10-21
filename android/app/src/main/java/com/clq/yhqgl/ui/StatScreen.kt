package com.clq.yhqgl.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.clq.yhqgl.data.local.AppDatabase
import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.rules.CouponRules
import com.clq.yhqgl.ui.theme.Brand
import com.clq.yhqgl.ui.theme.Danger
import com.clq.yhqgl.ui.theme.Success
import com.clq.yhqgl.ui.theme.Warning

/**
 * 统计页。
 *
 * 手机端的定位是「一眼看清还剩多少钱没花、哪几家快过期」，
 * 不做网页端那种多维分析 —— 深挖交给电脑。
 */
@Composable
fun StatScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val db = remember { AppDatabase.getInstance(context) }
    val coupons by db.couponDao().observeAll().collectAsState(initial = emptyList())
    val list = coupons.map { it.toDomain() }

    val totalAmount = list.sumOf { it.discountAmount ?: 0.0 }
    val usedAmount = list.filter { it.isUsed }.sumOf { it.discountAmount ?: 0.0 }
    val pendingAmount = list.filter { !it.isUsed && !CouponRules.isExpired(it) }
        .sumOf { it.discountAmount ?: 0.0 }

    val activeCount = list.count { CouponRules.isActive(it) }
    val usedCount = list.count { it.isUsed }
    val expiredCount = list.count { !it.isUsed && CouponRules.isExpired(it) }

    val soon = list
        .filter { CouponRules.isActive(it) }
        .sortedBy { CouponRules.deadlineTimestamp(it) }
        .take(5)

    val storeStats = CouponRules.groupByStore(list).take(8)
    val maxStoreAmount = storeStats.maxOfOrNull { it.amount } ?: 1.0

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("统计", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)

        // 主 KPI：还没花掉的优惠
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Brand),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
        ) {
            Column(Modifier.padding(18.dp)) {
                Text(
                    "待使用优惠合计",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f)
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    "¥${CouponRules.formatAmount(pendingAmount)}",
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimary
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "$activeCount 张可用券 · 已用掉 ¥${CouponRules.formatAmount(usedAmount)}",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f)
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MiniStat("待使用", "$activeCount", Success, Modifier.weight(1f))
            MiniStat("已使用", "$usedCount", MaterialTheme.colorScheme.secondary, Modifier.weight(1f))
            MiniStat("已过期", "$expiredCount", Danger, Modifier.weight(1f))
        }

        SectionCard("即将到期") {
            if (soon.isEmpty()) {
                EmptyHint("没有快过期的券")
            } else {
                soon.forEach { coupon ->
                    SoonRow(coupon)
                }
            }
        }

        SectionCard("店铺排行") {
            if (storeStats.isEmpty()) {
                EmptyHint("暂无数据")
            } else {
                storeStats.forEachIndexed { index, stat ->
                    Column(Modifier.padding(vertical = 5.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                "${index + 1}. ${stat.name}",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium
                            )
                            Text(
                                "¥${CouponRules.formatAmount(stat.amount)} · ${stat.count} 张",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Spacer(Modifier.height(4.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp)
                                .background(
                                    MaterialTheme.colorScheme.surfaceVariant,
                                    RoundedCornerShape(3.dp)
                                )
                        ) {
                            val ratio = (stat.amount / maxStoreAmount).toFloat().coerceIn(0f, 1f)
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(ratio)
                                    .height(6.dp)
                                    .background(Brand, RoundedCornerShape(3.dp))
                            )
                        }
                    }
                }
            }
        }

        SectionCard("累计") {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("历史优惠总额", fontSize = 13.sp)
                Text(
                    "¥${CouponRules.formatAmount(totalAmount)}",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand
                )
            }
        }

        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun MiniStat(label: String, value: String, tint: androidx.compose.ui.graphics.Color, modifier: Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(
            modifier = Modifier.padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(value, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = tint)
            Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun SoonRow(coupon: Coupon) {
    val days = CouponRules.remainingDays(coupon)
    val tint = when {
        days <= 1 -> Danger
        days <= 3 -> Warning
        else -> Success
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            coupon.title,
            modifier = Modifier.weight(1f),
            fontSize = 13.sp,
            maxLines = 1
        )
        Text(
            if (days <= 0) "今天" else "$days 天",
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = tint
        )
    }
}

@Composable
private fun EmptyHint(text: String) {
    Text(text, fontSize = 12.sp, color = MaterialTheme.colorScheme.outline)
}
