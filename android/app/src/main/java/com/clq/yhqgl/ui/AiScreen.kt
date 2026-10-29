package com.clq.yhqgl.ui

import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.clq.yhqgl.data.ai.AIContext
import com.clq.yhqgl.data.ai.AgnesProvider
import com.clq.yhqgl.data.ai.AiAssistants
import com.clq.yhqgl.data.ai.AiIntent
import com.clq.yhqgl.data.ai.AiPlan
import com.clq.yhqgl.data.ai.AiPlanner
import com.clq.yhqgl.data.ai.AiQueryEngine
import com.clq.yhqgl.data.ai.AiQueryResult
import com.clq.yhqgl.data.ai.readImageAsDataUrl
import com.clq.yhqgl.di.ServiceLocator
import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.rules.CouponRules
import com.clq.yhqgl.ui.theme.Brand
import com.clq.yhqgl.ui.theme.Danger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

/** 一条对话气泡 */
private data class ChatItem(
    val id: String = UUID.randomUUID().toString(),
    val fromUser: Boolean,
    val text: String = "",
    val imageUri: Uri? = null,
    val answer: Answer? = null
)

/** AI 气泡里的内容形态 */
private sealed interface Answer {
    /** 查询结果：结构化列表，不是模型编的话 */
    data class Results(val result: AiQueryResult) : Answer

    /** 待确认的写操作 */
    data class Draft(val plan: AiPlan) : Answer

    /** 纯文本（含错误） */
    data class Note(
        val body: String,
        val isError: Boolean = false,
        val showListLink: Boolean = false
    ) : Answer
}

private val QUICK_PROMPTS = listOf(
    "这周有哪些券快到期？",
    "还有多少张没用过的券？",
    "帮我加一张星巴克 5 折券，10 月 31 日到期"
)

/**
 * 「AI」页（底部导航第四栏）。
 *
 * 三种用法共用一条对话流：
 * 1. **查**：自然语言 → 模型只负责翻译成筛选条件 → [AiQueryEngine] 在本地按
 *    [CouponRules] 算，答案里的日期和数量都来自真实数据，不由模型编；
 * 2. **增**：模型给结构化 `changes` → [AiPlanner] 生成草稿 → 用户点「确认执行」才落库
 *    （走 `CouponRepository.save`，会打 dirty 标记并顺带同步云端）；
 * 3. **识图**：拍照或选图 → 压成 data URL → 多模态模型抽成同一套 `AiIntent` → 同样走草稿确认。
 *
 * 为什么不直接在页面里写 Room：所有写操作必须经仓库，否则不打 dirty，云端永远收不到。
 */
@Composable
fun AiScreen(
    modifier: Modifier = Modifier,
    onOpenList: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = ServiceLocator.repository
    val listState = rememberLazyListState()

    val chat = remember { mutableStateListOf<ChatItem>() }
    var input by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var busyHint by remember { mutableStateOf("思考中…") }
    var showImageSheet by remember { mutableStateOf(false) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }

    LaunchedEffect(chat.size) {
        if (chat.isNotEmpty()) listState.animateScrollToItem(chat.lastIndex)
    }

    fun ai(answer: Answer, text: String = "") {
        chat.add(ChatItem(fromUser = false, text = text, answer = answer))
    }

    /** 把意图落到对话流：查询就地算，写操作给草稿 */
    fun applyIntent(intent: AiIntent, coupons: List<Coupon>) {
        when (intent.intent) {
            "query" -> {
                val result = AiQueryEngine.run(AiQueryEngine.fromFilters(intent.filters), coupons)
                ai(Answer.Results(result), intent.reasoning.ifBlank { "帮你查了一下" })
            }

            "create", "update", "delete" -> {
                val plan = AiPlanner.build(intent, coupons)
                ai(Answer.Draft(plan), intent.reasoning.ifBlank { "我理解成这样，确认后再执行" })
            }

            else -> ai(
                Answer.Note(intent.reasoning.ifBlank { "这句我当闲聊了。可以问我「这周有哪些券到期」，或让我记一张新券。" })
            )
        }
    }

    fun submitText() {
        val text = input.trim()
        if (text.isEmpty() || busy) return
        input = ""
        chat.add(ChatItem(fromUser = true, text = text))
        busy = true
        busyHint = "思考中…"
        scope.launch {
            try {
                val settings = ServiceLocator.settingsStore.settings
                val assistant = AiAssistants.active(settings)
                val key = assistant?.apiKey
                if (assistant == null || key.isNullOrBlank()) {
                    ai(
                        Answer.Note(
                            "还没有可用的 AI 助手。请到「设置 → AI 助手」里添加一个并填 API Key。",
                            isError = true
                        )
                    )
                    return@launch
                }
                val coupons = repo.localCoupons()
                val provider = AgnesProvider(
                    apiKey = key,
                    baseUrl = assistant.baseUrl ?: "https://api.agnes.ai/v1",
                    model = assistant.model ?: "agnes-chat"
                )
                val ctx = AIContext(
                    coupons = coupons,
                    defaultProvider = assistant.provider,
                    apiKey = key,
                    baseUrl = assistant.baseUrl
                )
                val intent = provider.parseIntent(text, ctx).getOrThrow()
                applyIntent(intent, coupons)
            } catch (e: Exception) {
                ai(Answer.Note(e.message ?: "AI 调用失败，请检查网络或 API Key", isError = true))
            } finally {
                busy = false
            }
        }
    }

    fun submitImage(uri: Uri) {
        if (busy) return
        chat.add(ChatItem(fromUser = true, text = "识别这张图", imageUri = uri))
        busy = true
        busyHint = "正在识图…"
        scope.launch {
            try {
                val settings = ServiceLocator.settingsStore.settings
                val candidates = AiAssistants.vision(settings)
                if (candidates.isEmpty()) {
                    ai(
                        Answer.Note(
                            "还没有勾选「支持图片」的助手。请到「设置 → AI 助手」里给助手勾上识图，并选多模态模型。",
                            isError = true
                        )
                    )
                    return@launch
                }
                val assistant = candidates.firstOrNull { it.id == AiAssistants.active(settings)?.id }
                    ?: candidates.first()
                val key = assistant.apiKey
                if (key.isNullOrBlank()) {
                    ai(Answer.Note("该助手还没有 API Key，请先去设置里填写", isError = true))
                    return@launch
                }

                val dataUrl = withContext(Dispatchers.IO) { readImageAsDataUrl(context, uri) }
                if (dataUrl == null) {
                    ai(Answer.Note("读不到这张图片，换一张试试", isError = true))
                    return@launch
                }

                val coupons = repo.localCoupons()
                val provider = AgnesProvider(
                    apiKey = key,
                    baseUrl = assistant.baseUrl ?: "https://api.agnes.ai/v1",
                    model = assistant.model ?: "agnes-chat"
                )
                val intent = provider.recognizeImage(dataUrl).getOrThrow()
                applyIntent(intent, coupons)
            } catch (e: Exception) {
                ai(Answer.Note(e.message ?: "识图失败，换一张更清晰的截图试试", isError = true))
            } finally {
                busy = false
            }
        }
    }

    /** 草稿确认：一律走 repository（打 dirty + 自动同步），不直接写 Room */
    fun execute(item: ChatItem, plan: AiPlan) {
        scope.launch {
            val result: Result<Unit> = when (plan) {
                is AiPlan.Create -> repo.save(plan.coupon).map { }
                is AiPlan.Update -> repo.save(plan.after).map { }
                is AiPlan.Delete -> repo.delete(plan.target)
                is AiPlan.Unsupported -> Result.failure(IllegalStateException(plan.reason))
            }
            val note = if (result.isSuccess) {
                when (plan) {
                    is AiPlan.Create -> "已创建「${plan.coupon.title}」，${plan.coupon.endDate} 到期。"
                    is AiPlan.Update -> "已更新「${plan.after.title}」。"
                    is AiPlan.Delete -> "已删除「${plan.target.title}」。"
                    is AiPlan.Unsupported -> plan.reason
                }
            } else {
                "执行失败：${result.exceptionOrNull()?.message ?: "未知错误"}"
            }
            val index = chat.indexOfFirst { it.id == item.id }
            if (index >= 0) {
                chat[index] = chat[index].copy(
                    answer = Answer.Note(
                        body = note,
                        isError = result.isFailure,
                        showListLink = result.isSuccess && plan !is AiPlan.Unsupported
                    )
                )
            }
        }
    }

    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) submitImage(uri)
    }
    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = cameraUri
        if (ok && uri != null) submitImage(uri)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .imePadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text("AI 助手", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    "问到期情况、让它记新券，或拍张截图让它认",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                start = 16.dp, end = 16.dp, bottom = 8.dp
            ),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (chat.isEmpty()) {
                item { WelcomeCard(onPick = { input = it }) }
            }
            items(chat, key = { it.id }) { item ->
                ChatBubble(
                    item = item,
                    onExecute = { plan -> execute(item, plan) },
                    onOpenList = onOpenList
                )
            }
            if (busy) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text(busyHint, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 2.dp) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                IconButton(
                    onClick = { showImageSheet = true },
                    enabled = !busy,
                    modifier = Modifier
                        .size(44.dp)
                        .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape)
                ) {
                    Icon(Icons.Default.Add, contentDescription = "上传或拍摄图片")
                }
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    placeholder = { Text("问点什么，或让它记一张券…", fontSize = 13.sp) },
                    modifier = Modifier.weight(1f),
                    maxLines = 4,
                    shape = RoundedCornerShape(22.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send)
                )
                IconButton(
                    onClick = { submitText() },
                    enabled = !busy && input.isNotBlank(),
                    modifier = Modifier
                        .size(44.dp)
                        .background(
                            if (!busy && input.isNotBlank()) Brand else MaterialTheme.colorScheme.surfaceVariant,
                            CircleShape
                        )
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.Send,
                        contentDescription = "发送",
                        tint = if (!busy && input.isNotBlank()) {
                            MaterialTheme.colorScheme.onPrimary
                        } else {
                            MaterialTheme.colorScheme.outline
                        }
                    )
                }
            }
        }
    }

    if (showImageSheet) {
        AlertDialog(
            onDismissRequest = { showImageSheet = false },
            title = { Text("识图添加") },
            text = {
                Column {
                    Text(
                        "拍一张券的截图，或从相册选一张。识别结果会先给你看，确认后才写入。",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(14.dp))
                    ImageSourceRow("拍照") {
                        showImageSheet = false
                        val uri = runCatching { createCameraUri(context) }.getOrNull()
                        if (uri == null) {
                            ai(Answer.Note("无法创建拍照临时文件，请检查存储空间", isError = true))
                        } else {
                            cameraUri = uri
                            takePicture.launch(uri)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    ImageSourceRow("从相册选择") {
                        showImageSheet = false
                        pickImage.launch("image/*")
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showImageSheet = false }) { Text("取消") }
            }
        )
    }
}

@Composable
private fun ImageSourceRow(label: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = Brand
        )
    }
}

@Composable
private fun WelcomeCard(onPick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            elevation = CardDefaults.cardElevation(0.dp)
        ) {
            Column(Modifier.padding(14.dp)) {
                Text("可以这样用", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                Spacer(Modifier.height(6.dp))
                Text(
                    "· 「这周有哪些券快到期」 —— 直接从你的数据里算，不会编\n" +
                        "· 「帮我加一张瑞幸 5 折券，10 月 31 日到期」 —— 先给草稿，确认才写入\n" +
                        "· 拍/选一张券的截图 —— 识别成一张新券",
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        Text(
            "试试这些：",
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.outline
        )
        QUICK_PROMPTS.forEach { prompt ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onPick(prompt) },
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                ),
                elevation = CardDefaults.cardElevation(0.dp)
            ) {
                Text(
                    prompt,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                    fontSize = 12.sp
                )
            }
        }
    }
}

@Composable
private fun ChatBubble(
    item: ChatItem,
    onExecute: (AiPlan) -> Unit,
    onOpenList: () -> Unit
) {
    val isUser = item.fromUser
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(if (isUser) 0.85f else 0.96f),
            shape = RoundedCornerShape(
                topStart = 14.dp,
                topEnd = 14.dp,
                bottomStart = if (isUser) 14.dp else 4.dp,
                bottomEnd = if (isUser) 4.dp else 14.dp
            ),
            color = if (isUser) Brand else MaterialTheme.colorScheme.surface,
            border = if (isUser) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            tonalElevation = 0.dp
        ) {
            Column(Modifier.padding(12.dp)) {
                item.imageUri?.let { uri ->
                    LocalThumb(uri)
                    Spacer(Modifier.height(6.dp))
                }
                if (item.text.isNotBlank()) {
                    Text(
                        item.text,
                        fontSize = 13.sp,
                        color = if (isUser) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                    )
                }
                if (item.answer != null) {
                    if (item.text.isNotBlank()) Spacer(Modifier.height(8.dp))
                    AnswerBody(item.answer, onExecute, onOpenList)
                }
            }
        }
    }
}

@Composable
private fun AnswerBody(answer: Answer, onExecute: (AiPlan) -> Unit, onOpenList: () -> Unit) {
    when (answer) {
        is Answer.Note -> {
            Text(
                answer.body,
                fontSize = 13.sp,
                color = if (answer.isError) Danger else MaterialTheme.colorScheme.onSurface
            )
            if (answer.showListLink) {
                TextButton(onClick = onOpenList, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                    Text("去列表看看", fontSize = 12.sp)
                }
            }
        }

        is Answer.Results -> {
            Text(answer.result.headline, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            if (answer.result.coupons.isEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    answer.result.emptyHint,
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                Spacer(Modifier.height(6.dp))
                answer.result.coupons.take(6).forEach { coupon ->
                    ResultRow(coupon)
                }
                if (answer.result.coupons.size > 6) {
                    Text(
                        "还有 ${answer.result.coupons.size - 6} 张，去「列表」页看全部",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
        }

        is Answer.Draft -> {
            val plan = answer.plan
            val accent = when (plan) {
                is AiPlan.Delete -> Danger
                is AiPlan.Unsupported -> MaterialTheme.colorScheme.onSurfaceVariant
                else -> Brand
            }
            Text(
                AiPlanner.summary(plan),
                fontSize = 13.sp,
                color = accent,
                fontWeight = FontWeight.Medium
            )
            if (plan is AiPlan.Update) {
                val diffs = AiPlanner.diffRows(plan.before, plan.after)
                if (diffs.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    diffs.forEach { (label, from, to) ->
                        Text("$label：$from → $to", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (plan is AiPlan.Delete) {
                Text(
                    "删除会同步到云端，其他设备上也会消失",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (plan.valid) {
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { onExecute(plan) }) {
                        Text(if (plan is AiPlan.Delete) "确认删除" else "确认执行", fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun ResultRow(coupon: Coupon) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                coupon.title,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1
            )
            Text(
                listOfNotNull(
                    AiQueryEngine.describe(coupon),
                    CouponRules.discountLabel(coupon).takeIf { it.isNotBlank() }
                ).joinToString(" · "),
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
            )
        }
        if (coupon.isUsed) {
            Text("已用", fontSize = 10.sp, color = MaterialTheme.colorScheme.outline)
        }
    }
}

/** 本地缩略图：项目里没有图片加载库，直接按 1/4 采样解码，够看就行 */
@Composable
private fun LocalThumb(uri: Uri, side: Dp = 120.dp) {
    val context = LocalContext.current
    var bitmap by remember(uri) { mutableStateOf<android.graphics.Bitmap?>(null) }

    LaunchedEffect(uri) {
        bitmap = withContext(Dispatchers.IO) {
            runCatching {
                val opts = BitmapFactory.Options().apply { inSampleSize = 4 }
                context.contentResolver.openInputStream(uri)?.use {
                    BitmapFactory.decodeStream(it, null, opts)
                }
            }.getOrNull()
        }
    }

    val current = bitmap
    if (current != null) {
        Image(
            bitmap = current.asImageBitmap(),
            contentDescription = "待识别的图片",
            modifier = Modifier
                .size(side)
                .clip(RoundedCornerShape(8.dp)),
            contentScale = ContentScale.Crop
        )
    } else {
        Text("图片加载中…", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/**
 * 拍照落盘的临时文件。
 *
 * 不申请 CAMERA 权限：`ACTION_IMAGE_CAPTURE` 是让系统相机 App 去拍，
 * 调用方只需要一个可写的 Uri。真去申 CAMERA 反而会多一道运行时授权，
 * 用户拒了就只能干瞪眼。
 */
private fun createCameraUri(context: android.content.Context): Uri {
    val dir = File(context.cacheDir, "ai_shots").apply { mkdirs() }
    val file = File(dir, "shot_${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}
