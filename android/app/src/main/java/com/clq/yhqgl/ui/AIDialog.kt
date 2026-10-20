package com.clq.yhqgl.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.clq.yhqgl.data.ai.AIContext
import com.clq.yhqgl.data.ai.AiIntent
import com.clq.yhqgl.data.ai.AgnesProvider
import com.clq.yhqgl.data.local.AppDatabase
import com.clq.yhqgl.data.local.toDomain
import com.clq.yhqgl.data.local.toEntity
import com.clq.yhqgl.data.model.Coupon
import com.clq.yhqgl.data.settings.SettingsStore
import com.clq.yhqgl.model.DiscountType
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.UUID

@Composable
fun AIDialog(
    onDismiss: () -> Unit,
    onCreated: (String) -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val db = remember { AppDatabase.getInstance(context) }
    val store = remember { SettingsStore(context) }

    var input by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var intent by remember { mutableStateOf<AiIntent?>(null) }
    var preview by remember { mutableStateOf<Coupon?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("AI 助手") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    label = { Text("输入自然语言命令") },
                    placeholder = { Text("例如：帮我添加一张瑞幸 5 折券，10 月 30 日到期") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2
                )
                Button(
                    onClick = {
                        scope.launch {
                            loading = true
                            error = null
                            intent = null
                            preview = null
                            try {
                                val settings = store.settings
                                val key = settings.ai.apiKey
                                if (key.isNullOrBlank()) {
                                    error = "请先配置 AI API Key"
                                    loading = false
                                    return@launch
                                }
                                val coupons = db.couponDao().getAll().map { it.toDomain() }
                                val ctx = AIContext(
                                    coupons = coupons,
                                    defaultProvider = settings.ai.provider,
                                    apiKey = key,
                                    baseUrl = settings.ai.baseUrl
                                )
                                val provider = AgnesProvider(key, ctx.baseUrl ?: "https://api.agnes.ai/v1", settings.ai.model ?: "agnes-chat")
                                val result = provider.parseIntent(input, ctx)
                                intent = result
                                preview = buildPreview(result)
                            } catch (e: Exception) {
                                error = e.message ?: "解析失败"
                            } finally {
                                loading = false
                            }
                        }
                    },
                    enabled = !loading && input.isNotBlank(),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (loading) CircularProgressIndicator(modifier = Modifier.height(18.dp))
                    else Text("解析")
                }

                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }

                intent?.let { i ->
                    Card(modifier = Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(2.dp)) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text("AI 理解", style = MaterialTheme.typography.titleSmall)
                            Text(i.reasoning, style = MaterialTheme.typography.bodySmall)
                            Spacer(Modifier.height(8.dp))
                            if (preview != null) {
                                Text("拟创建：${preview?.title}", style = MaterialTheme.typography.bodyMedium)
                                Text("到期：${preview?.endDate}", style = MaterialTheme.typography.bodySmall)
                            } else if (i.intent == "delete") {
                                Text("拟删除 ID：${i.targetId}", style = MaterialTheme.typography.bodyMedium)
                            } else {
                                Text("该命令暂不支持的执行类型", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    scope.launch {
                        preview?.let { coupon ->
                            val withId = coupon.copy(
                                id = if (coupon.id.isBlank()) UUID.randomUUID().toString() else coupon.id,
                                createdAt = Coupon.nowIso()
                            )
                            db.couponDao().insert(withId.toEntity())
                            onCreated(withId.id)
                        }
                        onDismiss()
                    }
                },
                enabled = preview != null
            ) {
                Text("确认执行")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        }
    )
}

private fun buildPreview(intent: AiIntent): Coupon? {
    if (intent.intent != "create") return null
    val changes = intent.changes
    return Coupon(
        id = "",
        title = changes["title"] ?: "未命名",
        description = changes["description"],
        discountType = changes["discountType"]?.let { DiscountType.valueOf(it.uppercase()) },
        discountAmount = changes["discountAmount"]?.toDoubleOrNull(),
        fullAmount = changes["fullAmount"]?.toDoubleOrNull(),
        startDate = changes["startDate"] ?: LocalDate.now().toString(),
        endDate = changes["endDate"] ?: LocalDate.now().plusDays(30).toString(),
        endHour = changes["endHour"]?.toIntOrNull() ?: 23,
        endMinute = changes["endMinute"]?.toIntOrNull() ?: 59,
        notes = changes["notes"],
        createdAt = Coupon.nowIso()
    )
}
