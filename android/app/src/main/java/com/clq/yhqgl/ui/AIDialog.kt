package com.clq.yhqgl.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.clq.yhqgl.data.ai.AIContext
import com.clq.yhqgl.data.ai.AgnesProvider
import com.clq.yhqgl.data.ai.AiAssistants
import com.clq.yhqgl.data.ai.AiIntent
import com.clq.yhqgl.data.ai.AiPlan
import com.clq.yhqgl.data.ai.AiPlanner
import com.clq.yhqgl.data.ai.readImageAsDataUrl
import com.clq.yhqgl.di.ServiceLocator
import com.clq.yhqgl.rules.CouponRules
import com.clq.yhqgl.ui.theme.Danger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * AI 助手（列表页的弹窗形态）：把一句自然语言变成一条待执行的操作，
 * **先给用户看清要改什么**，确认后才落库。
 *
 * 两个原则：
 * 1. 所有写操作都走 [com.clq.yhqgl.data.repository.CouponRepository]，
 *    不能直接写 Room —— 直接 insert 不打 dirty 标记，云端永远收不到这条数据。
 * 2. delete / update 必须先在本地找到目标券并把它的标题摆到界面上，
 *    否则用户是在「确认删除一个自己没看见的东西」。
 *
 * 解析规则本身在 [AiPlanner] 里，与底部导航的「AI」页共用同一份实现。
 */
@Composable
fun AIDialog(
    onDismiss: () -> Unit,
    onCreated: (String) -> Unit = {}
) {
    val scope = rememberCoroutineScope()
    val repo = ServiceLocator.repository

    var input by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var intent by remember { mutableStateOf<AiIntent?>(null) }
    var plan by remember { mutableStateOf<AiPlan?>(null) }
    var done by remember { mutableStateOf(false) }
    var visionLoading by remember { mutableStateOf(false) }

    fun reset() {
        intent = null
        plan = null
        error = null
        done = false
    }

    fun execute() {
        val current = plan ?: return
        scope.launch {
            loading = true
            // 目标券的解析与操作都在这里做，避免在 UI 层拼字符串判断
            val result: Result<Unit> = when (current) {
                is AiPlan.Create -> repo.save(current.coupon).map { }
                is AiPlan.Update -> repo.save(current.after).map { }
                is AiPlan.Delete -> repo.delete(current.target)
                // 进来之前按钮就禁用了，这里只是让 when 穷尽
                is AiPlan.Unsupported -> Result.failure(IllegalStateException(current.reason))
            }
            loading = false
            if (result.isSuccess) {
                (current as? AiPlan.Create)?.let { onCreated(it.coupon.id) }
                done = true
            } else {
                error = result.exceptionOrNull()?.message ?: "执行失败"
            }
        }
    }

    val context = androidx.compose.ui.platform.LocalContext.current
    val imagePicker = androidx.activity.compose.rememberLauncherForActivityResult(
        contract = androidx.activity.result.contract.ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            visionLoading = true
            reset()
            try {
                val settings = ServiceLocator.settingsStore.settings
                val candidates = AiAssistants.vision(settings)
                if (candidates.isEmpty()) {
                    error = "还没有勾选「支持图片」的助手。请到「设置 → AI 助手」里勾上识图，并选多模态模型。"
                    return@launch
                }
                val assistant = candidates.firstOrNull { it.id == AiAssistants.active(settings)?.id }
                    ?: candidates.first()
                val key = assistant.apiKey
                if (key.isNullOrBlank()) {
                    error = "该助手还没有 API Key，请先去设置里填写"
                    return@launch
                }

                val dataUrl = withContext(Dispatchers.IO) { readImageAsDataUrl(context, uri) }
                    ?: run {
                        error = "读不到这张图片，换一张试试"
                        return@launch
                    }

                val coupons = ServiceLocator.database.couponDao().getAllActive().map { it.toDomain() }
                val provider = AgnesProvider(
                    key,
                    assistant.baseUrl ?: "https://api.agnes.ai/v1",
                    assistant.model ?: "agnes-chat"
                )
                val parsed = provider.recognizeImage(dataUrl).getOrThrow()
                intent = parsed
                plan = AiPlanner.build(parsed, coupons)
            } catch (e: Exception) {
                error = e.message ?: "识图失败，换一张更清晰的截图试试"
            } finally {
                visionLoading = false
            }
        }
    }

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
                    placeholder = { Text("例如：把瑞幸那张券改到 10 月 30 日到期") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2
                )
                Button(
                    onClick = {
                        scope.launch {
                            loading = true
                            reset()
                            try {
                                val settings = ServiceLocator.settingsStore.settings
                                val assistant = AiAssistants.active(settings)
                                val key = assistant?.apiKey
                                if (assistant == null || key.isNullOrBlank()) {
                                    error = "请先在「设置 → AI 助手」里添加助手并填写 API Key"
                                    return@launch
                                }
                                val coupons = ServiceLocator.database.couponDao()
                                    .getAllActive()
                                    .map { it.toDomain() }
                                val ctx = AIContext(
                                    coupons = coupons,
                                    defaultProvider = assistant.provider,
                                    apiKey = key,
                                    baseUrl = assistant.baseUrl
                                )
                                val provider = AgnesProvider(
                                    key,
                                    assistant.baseUrl ?: "https://api.agnes.ai/v1",
                                    assistant.model ?: "agnes-chat"
                                )
                                val parsed = provider.parseIntent(input, ctx).getOrThrow()
                                intent = parsed
                                plan = AiPlanner.build(parsed, coupons)
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

                Button(
                    onClick = { imagePicker.launch("image/*") },
                    enabled = !loading && !visionLoading,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (visionLoading) {
                        CircularProgressIndicator(modifier = Modifier.height(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("识别中…")
                    } else {
                        Text("识图添加（选一张截图）")
                    }
                }

                error?.let {
                    Text(it, color = Danger, style = MaterialTheme.typography.bodySmall)
                }

                intent?.let { i ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        elevation = CardDefaults.cardElevation(0.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    ) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                "AI 理解：${AiPlanner.intentLabel(i.intent)}",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(i.reasoning, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(2.dp))
                            PlanPreview(plan, i)
                        }
                    }
                }

                if (done) {
                    Text("已执行，列表已刷新", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { execute() },
                enabled = plan?.valid == true && !loading && !done
            ) {
                Text(if (done) "已完成" else "确认执行")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("关闭") }
        }
    )
}

@Composable
private fun PlanPreview(plan: AiPlan?, intent: AiIntent) {
    when (plan) {
        is AiPlan.Create -> {
            val c = plan.coupon
            Text("拟新建：${c.title}", fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(
                "折扣 ${CouponRules.discountLabel(c)} · 到期 ${c.endDate} " +
                    String.format("%02d:%02d", c.endHour ?: 23, c.endMinute ?: 59),
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        is AiPlan.Update -> {
            Text("拟修改：${plan.before.title}", fontSize = 13.sp, fontWeight = FontWeight.Medium)
            val diffs = AiPlanner.diffRows(plan.before, plan.after)
            if (diffs.isEmpty()) {
                Text("AI 没给出实际改动", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                diffs.forEach { (label, from, to) ->
                    Row {
                        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.outline,
                            modifier = Modifier.width(48.dp))
                        Text("$from → $to", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }

        is AiPlan.Delete -> {
            Text("拟删除：${plan.target.title}", fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(
                "到期 ${plan.target.endDate} ${String.format("%02d:%02d", plan.target.endHour ?: 23, plan.target.endMinute ?: 59)}",
                fontSize = 12.sp,
                color = Danger
            )
            Text("删除会同步到云端，其他设备上也会消失", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        is AiPlan.Unsupported -> {
            Text(plan.reason, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        null -> {
            Text(
                if (intent.intent == "query" || intent.intent == "chat") "这条只是问答，不需要执行操作" else "看不出要做什么",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
