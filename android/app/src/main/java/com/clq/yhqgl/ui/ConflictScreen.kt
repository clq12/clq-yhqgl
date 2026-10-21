package com.clq.yhqgl.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.clq.yhqgl.di.ServiceLocator
import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.rules.CouponRules
import com.clq.yhqgl.ui.theme.Danger
import com.clq.yhqgl.ui.theme.Warning
import kotlinx.coroutines.launch

/**
 * 「待解决」页。
 *
 * 什么时候会出现这里的记录：这台设备改了一张券（离线写入），另一台设备/网页也改了同一张，
 * 同步时按乐观锁规则跳过了本机的写入。数据不会丢，但必须由人来选保留哪一边——
 * 自动挑一个"更新的"在"我改了备注、你改了有效期"这种场景下会悄悄吃掉一半改动。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConflictScreen(onClose: () -> Unit) {
    val repo = ServiceLocator.repository
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val conflicts by repo.observeConflicts().collectAsState(initial = emptyList())

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                ),
                title = {
                    Column {
                        Text("待解决", fontWeight = FontWeight.Bold)
                        Text(
                            "${conflicts.size} 张券两边都改过",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onClose) {
                        Icon(Icons.Default.Close, contentDescription = "关闭", modifier = Modifier.size(20.dp))
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        if (conflicts.isEmpty()) {
            Box(
                modifier = Modifier.padding(padding).fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("没有待解决的冲突", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "同步被拦下的记录会出现在这里",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 8.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Text(
                    "这张券在本机和云端都被改过，同步时没有替你选。看完两边再决定保留哪一版。",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 2.dp)
                )
            }
            items(conflicts, key = { it.id }) { coupon ->
                ConflictCard(
                    coupon = coupon,
                    onKeepLocal = {
                        scope.launch {
                            val r = repo.resolveKeepLocal(coupon)
                            snackbar.showSnackbar(
                                if (r.isSuccess) "已用本机版本覆盖云端" else (r.exceptionOrNull()?.message ?: "处理失败")
                            )
                        }
                    },
                    onKeepRemote = {
                        scope.launch {
                            val r = repo.resolveKeepRemote(coupon)
                            snackbar.showSnackbar(
                                if (r.isSuccess) "已采用云端版本" else (r.exceptionOrNull()?.message ?: "处理失败")
                            )
                        }
                    },
                    loadRemote = { repo.remoteVersionOf(coupon.id) }
                )
            }
        }
    }
}

@Composable
private fun ConflictCard(
    coupon: Coupon,
    onKeepLocal: () -> Unit,
    onKeepRemote: () -> Unit,
    loadRemote: suspend () -> Result<Coupon?>
) {
    var remote by remember(coupon.id) { mutableStateOf<Coupon?>(null) }
    var loading by remember(coupon.id) { mutableStateOf(true) }
    var loadError by remember(coupon.id) { mutableStateOf<String?>(null) }

    LaunchedEffect(coupon.id) {
        loading = true
        loadRemote()
            .onSuccess { remote = it; loadError = null }
            .onFailure { loadError = it.message ?: "读不到云端版本" }
        loading = false
    }

    val localRows = remember(coupon) { summaryRows(coupon) }
    val remoteRows = remember(remote) { remote?.let { summaryRows(it) } }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, Warning.copy(alpha = 0.4f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                coupon.title.ifBlank { "未命名优惠券" },
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.bodyLarge
            )
            Spacer(Modifier.height(2.dp))
            Text(
                "本机改动：${shortTime(coupon.modifiedAt)}" +
                    (remote?.modifiedAt?.let { " · 云端：${shortTime(it)}" } ?: ""),
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(10.dp))

            // 表头
            Row(modifier = Modifier.fillMaxWidth()) {
                Spacer(Modifier.width(52.dp))
                Text("本机", fontSize = 11.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("云端", fontSize = 11.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(4.dp))

            if (loading) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                    Text("正在读云端版本…", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else if (loadError != null) {
                Text(loadError!!, fontSize = 12.sp, color = Danger)
            } else if (remoteRows == null) {
                Text(
                    "云端已经没有这张券了（可能刚被别的设备删掉）",
                    fontSize = 12.sp,
                    color = Danger
                )
            } else {
                localRows.forEachIndexed { index, (label, localValue) ->
                    val remoteValue = remoteRows!![index].second
                    val differ = localValue != remoteValue
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                        Text(
                            label,
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.outline,
                            modifier = Modifier.width(52.dp)
                        )
                        Text(
                            localValue,
                            fontSize = 12.sp,
                            modifier = Modifier.weight(1f),
                            fontWeight = if (differ) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (differ) Warning else MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            remoteValue,
                            fontSize = 12.sp,
                            modifier = Modifier.weight(1f),
                            fontWeight = if (differ) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (differ) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }

            Spacer(Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                TextButton(onClick = onKeepRemote) {
                    Text("采用云端", fontSize = 13.sp, color = MaterialTheme.colorScheme.primary)
                }
                Spacer(Modifier.width(4.dp))
                OutlinedButton(
                    onClick = onKeepLocal,
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text("保留本机", fontSize = 13.sp)
                }
            }
        }
    }
}

/** 冲突对比只列有意义的字段，太长反而看不清 */
private fun summaryRows(c: Coupon): List<Pair<String, String>> = listOf(
    "折扣" to CouponRules.discountLabel(c),
    "到期" to buildString {
        append(c.endDate.ifBlank { "—" })
        append(" ")
        append(String.format("%02d:%02d", c.endHour ?: 23, c.endMinute ?: 59))
    },
    "已用" to if (c.isUsed) "是" else "否",
    "备注" to (c.notes?.takeIf { it.isNotBlank() } ?: "—"),
    "状态" to CouponRules.statusLabel(c).text
)

/** 2026-10-21T09:30:00+08:00 → 10-21 09:30 */
private fun shortTime(raw: String?): String {
    if (raw.isNullOrBlank()) return "—"
    val date = raw.substringBefore('T')
    val time = raw.substringAfter('T', "").take(5)
    return if (time.isBlank()) date else "${date.takeLast(5)} $time"
}
