package com.clq.yhqgl.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.clq.yhqgl.di.ServiceLocator
import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.rules.CouponRules
import com.clq.yhqgl.ui.theme.Danger
import com.clq.yhqgl.ui.theme.Success
import com.clq.yhqgl.ui.theme.Warning
import kotlinx.coroutines.launch

private enum class FilterKey(val label: String) {
    ACTIVE("待使用"),
    ALL("全部"),
    USED("已使用"),
    EXPIRED("已过期")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CouponListScreen(modifier: Modifier = Modifier, initialCouponId: String? = null) {
    val repo = ServiceLocator.repository
    val scope = rememberCoroutineScope()
    val coupons by repo.observeAll().collectAsState(initial = emptyList())
    val conflicts by repo.observeConflicts().collectAsState(initial = emptyList())
    val session by ServiceLocator.session.collectAsState()
    val syncing by ServiceLocator.syncing.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    var showForm by remember { mutableStateOf(false) }
    var showConflicts by remember { mutableStateOf(false) }
    var editingCoupon by remember { mutableStateOf<Coupon?>(null) }
    var deletingCoupon by remember { mutableStateOf<Coupon?>(null) }
    var showAI by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    var filterIndex by remember { mutableIntStateOf(0) }

    LaunchedEffect(initialCouponId) {
        initialCouponId?.let { id ->
            editingCoupon = repo.getById(id)
            showForm = editingCoupon != null
        }
    }

    fun runSync() {
        scope.launch {
            ServiceLocator.setSyncing(true)
            val result = repo.sync()
            ServiceLocator.setSyncing(false)
            val report = result.getOrNull()
            val message = when {
                result.isFailure -> result.exceptionOrNull()?.message ?: "同步失败"
                report == null -> "同步完成"
                report.conflicts > 0 -> "已同步，${report.conflicts} 张券需要手动处理"
                else -> "已同步：上传 ${report.pushed} / 下载 ${report.pulled}"
            }
            snackbar.showSnackbar(message)
        }
    }

    val filter = FilterKey.entries[filterIndex]
    val counts = remember(coupons) {
        mapOf(
            FilterKey.ALL to coupons.size,
            FilterKey.ACTIVE to coupons.count { CouponRules.isActive(it) },
            FilterKey.USED to coupons.count { it.isUsed },
            FilterKey.EXPIRED to coupons.count { !it.isUsed && CouponRules.isExpired(it) }
        )
    }
    val visible = remember(coupons, search, filter) {
        val keyword = search.trim()
        coupons.filter { c ->
            val matchFilter = when (filter) {
                FilterKey.ALL -> true
                FilterKey.ACTIVE -> CouponRules.isActive(c)
                FilterKey.USED -> c.isUsed
                FilterKey.EXPIRED -> !c.isUsed && CouponRules.isExpired(c)
            }
            val matchKeyword = keyword.isEmpty() ||
                c.title.contains(keyword, ignoreCase = true) ||
                (c.description?.contains(keyword, ignoreCase = true) == true)
            matchFilter && matchKeyword
        }
    }

    // 有待解决冲突时整屏切到处理页：冲突没处理完，列表里的数据就不完全可信
    if (showConflicts) {
        Surface(modifier = Modifier.fillMaxSize()) {
            ConflictScreen(onClose = { showConflicts = false })
        }
        return
    }

    Scaffold(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                ),
                title = {
                    Column {
                        Text("优惠券", fontWeight = FontWeight.Bold)
                        Text(
                            if (session != null) session?.email ?: "已登录" else "游客模式 · 数据只在本机",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { showAI = true }) {
                        Icon(Icons.Default.Email, contentDescription = "AI 识别", modifier = Modifier.size(20.dp))
                    }
                    IconButton(onClick = { runSync() }, enabled = !syncing) {
                        if (syncing) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.Refresh, contentDescription = "同步")
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    editingCoupon = null
                    showForm = true
                },
                containerColor = MaterialTheme.colorScheme.primary
            ) {
                Icon(Icons.Default.Add, contentDescription = "添加", tint = MaterialTheme.colorScheme.onPrimary)
            }
        },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                placeholder = { Text("搜索标题或备注") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp)) },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 4.dp)
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterKey.entries.forEachIndexed { index, key ->
                    FilterChip(
                        selected = filterIndex == index,
                        onClick = { filterIndex = index },
                        label = {
                            Text(
                                "${key.label} ${counts[key] ?: 0}",
                                fontSize = 12.sp
                            )
                        }
                    )
                }
            }

            if (conflicts.isNotEmpty()) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 4.dp)
                        .clickable { showConflicts = true },
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Warning.copy(alpha = 0.12f)),
                    border = BorderStroke(1.dp, Warning.copy(alpha = 0.35f)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "${conflicts.size} 张券两边都改过",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium,
                                color = Warning
                            )
                            Text(
                                "同步没替你选，点这里处理",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text("去处理", fontSize = 12.sp, color = Warning, fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            if (visible.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("暂无优惠券", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "点右下角 + 添加一张",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        start = 14.dp, end = 14.dp, top = 4.dp, bottom = 88.dp
                    ),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(visible, key = { it.id }) { coupon ->
                        CouponCard(
                            coupon = coupon,
                            onClick = {
                                editingCoupon = coupon
                                showForm = true
                            },
                            onToggleUsed = {
                                scope.launch { repo.markUsed(coupon, !coupon.isUsed) }
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
            onDelete = { deletingCoupon = editingCoupon }
        )
    }

    deletingCoupon?.let { coupon ->
        AlertDialog(
            onDismissRequest = { deletingCoupon = null },
            title = { Text("删除优惠券") },
            text = {
                Text("确定删除「${coupon.title}」？删除会同步到云端，其他设备上也会消失。")
            },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        repo.delete(coupon)
                        deletingCoupon = null
                        showForm = false
                    }
                }) { Text("删除", color = Danger) }
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
    val label = CouponRules.discountLabel(coupon)
    val status = CouponRules.statusLabel(coupon)
    val statusColor = when (status.tone) {
        "danger" -> Danger
        "warning" -> Warning
        "success" -> Success
        else -> MaterialTheme.colorScheme.outline
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(checked = coupon.isUsed, onCheckedChange = { onToggleUsed() })

            // 折扣徽标：与网页端同一种强调方式
            Box(
                modifier = Modifier
                    .background(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        shape = RoundedCornerShape(10.dp)
                    )
                    .padding(horizontal = 8.dp, vertical = 6.dp)
                    .width(64.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    label,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }

            Spacer(Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    coupon.title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    "到期 ${coupon.endDate} " +
                        String.format("%02d:%02d", coupon.endHour ?: 23, coupon.endMinute ?: 59),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                Surface(
                    color = statusColor.copy(alpha = 0.12f),
                    shape = CircleShape
                ) {
                    Text(
                        status.text,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        fontSize = 10.sp,
                        color = statusColor
                    )
                }
                Row {
                    IconButton(onClick = onClick, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Edit, contentDescription = "编辑", modifier = Modifier.size(16.dp))
                    }
                    IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Delete, contentDescription = "删除", modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}
