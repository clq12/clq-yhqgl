package com.clq.yhqgl.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.clq.yhqgl.data.local.AppDatabase
import com.clq.yhqgl.data.model.Coupon
import com.clq.yhqgl.data.repository.CouponRepository
import com.clq.yhqgl.data.settings.SettingsStore
import com.clq.yhqgl.rules.CouponRules
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CouponListScreen(modifier: Modifier = Modifier, initialCouponId: String? = null) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val db = remember { AppDatabase.getInstance(context) }
    val store = remember { SettingsStore(context) }
    val repo = remember { CouponRepository(context, db.couponDao(), store) }
    val coupons by repo.observeAll().collectAsState(initial = emptyList())
    val snackbar = remember { SnackbarHostState() }

    var showForm by remember { mutableStateOf(false) }
    var editingCoupon by remember { mutableStateOf<Coupon?>(null) }
    var deletingCoupon by remember { mutableStateOf<Coupon?>(null) }
    var syncing by remember { mutableStateOf(false) }
    var showAI by remember { mutableStateOf(false) }

    LaunchedEffect(initialCouponId) {
        initialCouponId?.let { id ->
            editingCoupon = repo.getById(id)
            showForm = editingCoupon != null
        }
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("优惠券") },
                actions = {
                    IconButton(onClick = { showAI = true }) {
                        Icon(Icons.Default.SmartToy, contentDescription = "AI")
                    }
                    IconButton(onClick = {
                        scope.launch {
                            syncing = true
                            val result = repo.sync()
                            syncing = false
                            snackbar.showSnackbar(if (result.isSuccess) "同步成功" else "同步失败")
                        }
                    }) {
                        if (syncing) CircularProgressIndicator(modifier = Modifier.height(20.dp))
                        else Icon(Icons.Default.Notifications, contentDescription = "同步")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = {
                editingCoupon = null
                showForm = true
            }) {
                Icon(Icons.Default.Add, contentDescription = "添加")
            }
        },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (coupons.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("暂无优惠券，点击右下角添加", color = MaterialTheme.colorScheme.outline)
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 8.dp)) {
                    items(coupons, key = { it.id }) { coupon ->
                        CouponCard(
                            coupon = coupon,
                            onClick = {
                                editingCoupon = coupon
                                showForm = true
                            },
                            onToggleUsed = {
                                scope.launch {
                                    repo.markUsed(coupon, !coupon.isUsed)
                                }
                            },
                            onDelete = { deletingCoupon = coupon }
                        )
                    }
                }
            }
        }
    }

    if (showForm) {
        CouponFormScreen(
            coupon = editingCoupon,
            onDismiss = { showForm = false },
            onSave = { coupon ->
                scope.launch {
                    val result = repo.save(coupon)
                    if (result.isSuccess) {
                        showForm = false
                    } else {
                        snackbar.showSnackbar(result.exceptionOrNull()?.message ?: "保存失败")
                    }
                }
            },
            onDelete = {
                deletingCoupon = editingCoupon
            }
        )
    }

    deletingCoupon?.let { coupon ->
        AlertDialog(
            onDismissRequest = { deletingCoupon = null },
            title = { Text("删除优惠券") },
            text = { Text("确定删除「${coupon.title}」？") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        repo.delete(coupon)
                        deletingCoupon = null
                        showForm = false
                    }
                }) { Text("删除") }
            },
            dismissButton = {
                TextButton(onClick = { deletingCoupon = null }) { Text("取消") }
            }
        )
    }

    if (showAI) {
        AIDialog(
            onDismiss = { showAI = false },
            onCreated = { id ->
                scope.launch {
                    repo.sync()
                    editingCoupon = repo.getById(id)
                    showForm = editingCoupon != null
                }
            }
        )
    }
}

@Composable
private fun CouponCard(
    coupon: Coupon,
    onClick: () -> Unit,
    onToggleUsed: () -> Unit,
    onDelete: () -> Unit
) {
    val remaining = CouponRules.remainingDays(coupon)
    val expired = CouponRules.isExpired(coupon)
    val statusColor = when {
        coupon.isUsed -> MaterialTheme.colorScheme.outline
        expired -> MaterialTheme.colorScheme.error
        remaining <= 3 -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.primary
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(checked = coupon.isUsed, onCheckedChange = { onToggleUsed() })
            Column(modifier = Modifier.weight(1f).padding(start = 8.dp)) {
                Text(coupon.title, style = MaterialTheme.typography.titleMedium)
                Text(
                    "到期：${coupon.endDate} ${String.format("%02d:%02d", coupon.endHour ?: 23, coupon.endMinute ?: 59)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = statusColor
                )
                if (!coupon.isUsed && !expired) {
                    Text(
                        if (remaining <= 0) "今天到期" else "剩余 ${remaining} 天",
                        style = MaterialTheme.typography.bodySmall,
                        color = statusColor
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                IconButton(onClick = onClick) {
                    Icon(Icons.Default.Edit, contentDescription = "编辑")
                }
                IconButton(onClick = onDelete) {
                    Icon(Icons.Default.Delete, contentDescription = "删除")
                }
            }
        }
    }
}
