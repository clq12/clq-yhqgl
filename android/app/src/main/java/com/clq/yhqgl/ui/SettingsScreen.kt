package com.clq.yhqgl.ui

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.clq.yhqgl.data.sync.WebDAVClient
import com.clq.yhqgl.data.cloud.CloudAuth
import com.clq.yhqgl.data.cloud.SecurePrefs
import com.clq.yhqgl.di.ServiceLocator
import com.clq.yhqgl.data.ai.AiAssistants
import com.clq.yhqgl.model.AISettings
import com.clq.yhqgl.model.AiAssistant
import com.clq.yhqgl.model.WebDAVSettings
import com.clq.yhqgl.rules.CouponRules
import com.clq.yhqgl.ui.theme.Danger
import kotlinx.coroutines.launch

/** 提醒档位预设：够用的一组，不让人填奇怪数字 */
private val REMIND_DAY_PRESETS = listOf(1, 3, 5, 7, 14, 30)

/**
 * 设置页。
 *
 * 分四块：账号与云同步 → 备份（WebDAV）→ AI → 提醒。
 *
 * 顺序是有意的：账号在最上面，因为「数据存在哪」是用户最先要确认的事；
 * 备份紧跟其后，因为它的语义依赖账号（备份的是云端那份数据）。
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    modifier: Modifier = Modifier,
    accountVersion: Int = 0,
    onRequestLogin: () -> Unit = {},
    onSignedOut: () -> Unit = {}
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val store = ServiceLocator.settingsStore
    val repo = ServiceLocator.repository
    val auth = ServiceLocator.cloudAuth
    val session by ServiceLocator.session.collectAsState()
    val settings = remember { store.settings }

    var url by remember { mutableStateOf(settings.webdav?.url ?: "") }
    var username by remember { mutableStateOf(settings.webdav?.username ?: "") }
    var password by remember { mutableStateOf(settings.webdav?.password ?: "") }
    var rootPath by remember { mutableStateOf(settings.webdav?.rootPath ?: "/yhqgl/v2") }

    var aiProvider by remember { mutableStateOf(settings.ai.provider) }
    var aiKey by remember { mutableStateOf(settings.ai.apiKey ?: "") }
    var aiBaseUrl by remember { mutableStateOf(settings.ai.baseUrl ?: "") }
    var aiModel by remember { mutableStateOf(settings.ai.model ?: "") }

    var autoSync by remember { mutableStateOf(settings.sync.autoSync) }
    // 多 AI 助手
    var assistants by remember { mutableStateOf(AiAssistants.effective(settings)) }
    var activeAssistantId by remember { mutableStateOf(AiAssistants.active(settings)?.id) }
    var assistantDraft by remember { mutableStateOf<AiAssistant?>(null) }
    var assistantIsNew by remember { mutableStateOf(false) }

    var reminderEnabled by remember { mutableStateOf(settings.reminder.enabled) }
    var remindDays by remember { mutableStateOf(settings.reminder.remindDays) }

    // 标签库：空配置时展示默认名单（tagLibraryOf 负责兜底）
    var tagLibrary by remember { mutableStateOf(CouponRules.tagLibraryOf(settings.tagLibrary)) }
    var tagDraft by remember { mutableStateOf("") }
    var renamingTag by remember { mutableStateOf<String?>(null) }
    var renameDraft by remember { mutableStateOf("") }
    var removingTag by remember { mutableStateOf<String?>(null) }
    var removingUsage by remember { mutableStateOf<Int?>(null) }

    var testing by remember { mutableStateOf(false) }
    var backingUp by remember { mutableStateOf(false) }
    var restoring by remember { mutableStateOf(false) }
    var confirmRestore by remember { mutableStateOf(false) }
    var pendingCount by remember { mutableIntStateOf(0) }
    var localCount by remember { mutableIntStateOf(0) }
    var showChangePassword by remember { mutableStateOf(false) }

    // 账号切换后重新读一次本地统计
    androidx.compose.runtime.LaunchedEffect(accountVersion, session) {
        pendingCount = repo.pendingCount()
        localCount = repo.localCount()
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("设置", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)

        // ------------------------------------------------------------ 账号
        SettingsCard("账号与云同步") {
            if (session == null) {
                Text(
                    "当前是游客模式：数据只存在这台手机上，换手机就看不到。登录后自动云端同步。",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(10.dp))
                Button(onClick = onRequestLogin, modifier = Modifier.fillMaxWidth()) {
                    Text("登录云账号")
                }
            } else {
                Text(
                    session?.email ?: session?.name ?: "已登录",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "本机 $localCount 张券 · ${if (pendingCount > 0) "$pendingCount 张待上传" else "已全部同步"}",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                // 验证码注册的账号默认密码是 123456，一直不改等于没有密码
                if (auth.usesDefaultPassword) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "当前仍在使用初始密码 ${CloudAuth.DEFAULT_PASSWORD}，建议马上改掉",
                        fontSize = 11.sp,
                        color = Danger
                    )
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                ServiceLocator.setSyncing(true)
                                val result = repo.sync()
                                ServiceLocator.setSyncing(false)
                                pendingCount = repo.pendingCount()
                                val msg = if (result.isSuccess) {
                                    val r = result.getOrNull()
                                    "已同步：上传 ${r?.pushed ?: 0} / 下载 ${r?.pulled ?: 0}" +
                                        if ((r?.conflicts ?: 0) > 0) "，${r?.conflicts} 张待处理" else ""
                                } else {
                                    result.exceptionOrNull()?.message ?: "同步失败"
                                }
                                Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                            }
                        },
                        modifier = Modifier.weight(1f)
                    ) { Text("立即同步") }
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                repo.logout()
                                ServiceLocator.updateSession(null)
                                pendingCount = repo.pendingCount()
                                onSignedOut()
                                Toast.makeText(
                                    context,
                                    "已退出，转入游客模式；本机数据保留",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        },
                        modifier = Modifier.weight(1f)
                    ) { Text("退出登录", color = Danger) }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { showChangePassword = true },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("修改密码") }
                Spacer(Modifier.height(8.dp))
                Text(
                    "退出后数据仍留在本机，可当成本地 App 继续用；再次登录同一账号会自动合并。",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // 加密存储不可用时如实告诉用户，别让他以为「登录态莫名其妙丢了」
            if (SecurePrefs.degraded) {
                Spacer(Modifier.height(10.dp))
                Text(
                    "提示：本机加密存储不可用（常见于换机/恢复备份后），登录态已改用普通存储保存，功能不受影响。",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.outline
                )
            }
        }

        // ------------------------------------------------------------ 备份
        SettingsCard("备份（WebDAV）") {
            Text(
                "云数据库才是主数据。WebDAV 只是手动备份通道，不会自动同步，也不会和云端合并。",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text("WebDAV 地址") },
                placeholder = { Text("https://dav.jianguoyun.com/dav/") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = username,
                onValueChange = { username = it },
                label = { Text("用户名") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("密码") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = rootPath,
                onValueChange = { rootPath = it },
                label = { Text("根目录") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done)
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = {
                        scope.launch {
                            testing = true
                            val ok = try {
                                val client = WebDAVClient(url.trim(), username.trim(), password)
                                client.mkcol(rootPath.trim('/')) && client.exists("")
                            } catch (e: Exception) {
                                false
                            }
                            testing = false
                            Toast.makeText(
                                context,
                                if (ok) "连接成功" else "连接失败，检查地址与账号",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    },
                    enabled = !testing && url.isNotBlank() && username.isNotBlank(),
                    modifier = Modifier.weight(1f)
                ) {
                    if (testing) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    else Text("测试连接")
                }
                Button(
                    onClick = {
                        store.webdav = WebDAVSettings(
                            url = url.trim(),
                            username = username.trim(),
                            password = password,
                            rootPath = rootPath.trim()
                        )
                        Toast.makeText(context, "已保存", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier.weight(1f)
                ) { Text("配置已填好先保存") }
            }

            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        scope.launch {
                            backingUp = true
                            // 用界面上的值，避免用户忘了点保存
                            store.webdav = WebDAVSettings(
                                url = url.trim(), username = username.trim(),
                                password = password, rootPath = rootPath.trim()
                            )
                            val report = repo.backup()
                            backingUp = false
                            Toast.makeText(
                                context,
                                if (report.ok) "已备份 ${report.count} 张券" else (report.error ?: "备份失败"),
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    },
                    enabled = !backingUp && !restoring && url.isNotBlank(),
                    modifier = Modifier.weight(1f)
                ) {
                    if (backingUp) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    else Text("备份到 WebDAV")
                }
                OutlinedButton(
                    onClick = { confirmRestore = true },
                    enabled = !backingUp && !restoring && url.isNotBlank(),
                    modifier = Modifier.weight(1f)
                ) {
                    if (restoring) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    else Text("从备份恢复")
                }
            }
        }

        // ------------------------------------------------------------ AI
        SettingsCard("AI 助手") {
            Text(
                "可配置多个助手。识图添加只会用勾了「支持图片」的助手，纯文本用便宜的小模型更划算。",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))

            if (assistants.isEmpty()) {
                Text(
                    "还没有助手，先添加一个",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.outline
                )
            }

            assistants.forEach { assistant ->
                val isActive = assistant.id == activeAssistantId
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(assistant.name, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            if (isActive) {
                                Spacer(Modifier.width(6.dp))
                                Text("默认", fontSize = 10.sp, color = MaterialTheme.colorScheme.primary)
                            }
                            if (assistant.vision) {
                                Spacer(Modifier.width(6.dp))
                                Text("识图", fontSize = 10.sp, color = MaterialTheme.colorScheme.tertiary)
                            }
                        }
                        Text(
                            listOfNotNull(
                                assistant.provider,
                                assistant.model,
                                if (assistant.apiKey.isNullOrBlank()) "未填 Key" else null
                            ).joinToString(" · "),
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Row {
                        if (!isActive) {
                            TextButton(onClick = {
                                activeAssistantId = assistant.id
                                store.updateAssistants(assistants, assistant.id)
                            }) { Text("设为默认", fontSize = 12.sp) }
                        }
                        TextButton(onClick = {
                            assistantDraft = assistant
                            assistantIsNew = false
                        }) { Text("编辑", fontSize = 12.sp) }
                        TextButton(onClick = {
                            val next = assistants.filter { it.id != assistant.id }
                            val nextActive = if (isActive) next.firstOrNull()?.id else activeAssistantId
                            assistants = next
                            activeAssistantId = nextActive
                            store.updateAssistants(next, nextActive)
                        }) { Text("删除", fontSize = 12.sp, color = Danger) }
                    }
                }
            }

            Spacer(Modifier.height(6.dp))
            Button(
                onClick = {
                    assistantDraft = AiAssistant(
                        id = "ai-" + java.util.UUID.randomUUID().toString().take(8),
                        name = "",
                        provider = "agnes",
                        model = null,
                        apiKey = null,
                        baseUrl = null,
                        vision = false
                    )
                    assistantIsNew = true
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text("添加助手") }
        }


        // ------------------------------------------------------------ 标签
        SettingsCard("标签") {
            Text(
                "录入优惠券时「常用」里出现的就是这些标签。改名或删除会同步更新已打过该标签的券。",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))

            tagLibrary.forEach { tag ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(tag, fontSize = 13.sp)
                    Row {
                        TextButton(
                            onClick = {
                                renamingTag = tag
                                renameDraft = tag
                            }
                        ) {
                            Icon(Icons.Default.Edit, contentDescription = "改名", modifier = Modifier.size(15.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("改名", fontSize = 12.sp)
                        }
                        TextButton(
                            onClick = {
                                removingTag = tag
                                removingUsage = null
                                scope.launch {
                                    removingUsage = runCatching { repo.countTagUsage(tag) }.getOrDefault(0)
                                }
                            }
                        ) {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = "删除",
                                modifier = Modifier.size(15.dp),
                                tint = Danger
                            )
                            Spacer(Modifier.width(4.dp))
                            Text("删除", fontSize = 12.sp, color = Danger)
                        }
                    }
                }
            }

            Spacer(Modifier.height(6.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = tagDraft,
                    onValueChange = { tagDraft = it },
                    label = { Text("新增标签") },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                Button(
                    onClick = {
                        val tag = CouponRules.normalizeTag(tagDraft)
                        when {
                            tag == null -> Unit
                            tagLibrary.contains(tag) -> {
                                Toast.makeText(context, "「$tag」已经在列表里了", Toast.LENGTH_SHORT).show()
                            }
                            else -> {
                                val next = tagLibrary + tag
                                tagLibrary = next
                                store.updateTagLibrary(next)
                                tagDraft = ""
                            }
                        }
                    },
                    enabled = tagDraft.isNotBlank()
                ) { Text("添加") }
            }

            Spacer(Modifier.height(4.dp))
            TextButton(
                onClick = {
                    val next = CouponRules.defaultTags
                    tagLibrary = next
                    store.updateTagLibrary(next)
                }
            ) { Text("恢复默认标签", fontSize = 12.sp) }

            Spacer(Modifier.height(2.dp))
            Text(
                "标签只影响录入时的推荐，不影响已有数据；改名/删除才会动券。",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.outline
            )
        }

        // ------------------------------------------------------------ 提醒
        SettingsCard("同步与提醒") {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("自动同步")
                    Text(
                        "每次改动后立刻推云端",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Switch(checked = autoSync, onCheckedChange = {
                    autoSync = it
                    store.settings = store.settings.copy(sync = store.settings.sync.copy(autoSync = it))
                })
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("到期提醒")
                    Text(
                        "提醒按设备各自计算，不会因为你电脑上提醒过就不再提醒手机",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Switch(checked = reminderEnabled, onCheckedChange = {
                    reminderEnabled = it
                    store.settings = store.settings.copy(reminder = store.settings.reminder.copy(enabled = it))
                })
            }

            Spacer(Modifier.height(10.dp))
            Text("提前几天提醒", fontSize = 13.sp)
            Spacer(Modifier.height(6.dp))
            androidx.compose.foundation.layout.FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                REMIND_DAY_PRESETS.forEach { day ->
                    val on = remindDays.contains(day)
                    FilterChip(
                        selected = on,
                        onClick = {
                            val next = if (on) remindDays - day else (remindDays + day).sortedDescending()
                            remindDays = next
                            store.settings = store.settings.copy(
                                reminder = store.settings.reminder.copy(remindDays = next)
                            )
                        },
                        label = { Text("$day 天", fontSize = 12.sp) }
                    )
                }
            }
            Text(
                "到点按最接近的一档提醒一次，提醒过的不重复；已使用和已过期的券不提醒。",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.outline
            )
        }

        Spacer(Modifier.height(32.dp))
    }

    if (confirmRestore) {
        AlertDialog(
            onDismissRequest = { confirmRestore = false },
            title = { Text("从备份恢复？") },
            text = {
                Text(
                    "会用 WebDAV 上的 data.json 覆盖云端和本机：\n" +
                        "· 备份里有的券 → 覆盖为备份里的内容\n" +
                        "· 云端有、备份里没有的券 → 被删除\n\n" +
                        "这一步不可撤销，建议先点一次「备份到 WebDAV」。"
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmRestore = false
                    scope.launch {
                        restoring = true
                        val report = repo.restore()
                        restoring = false
                        pendingCount = repo.pendingCount()
                        localCount = repo.localCount()
                        Toast.makeText(
                            context,
                            if (report.ok) "已恢复 ${report.count} 张券" else (report.error ?: "恢复失败"),
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }) { Text("确认覆盖", color = Danger) }
            },
            dismissButton = {
                TextButton(onClick = { confirmRestore = false }) { Text("取消") }
            }
        )
    }

    // ------------------------------------------------------------ AI 助手：编辑
    assistantDraft?.let { draft ->
        AlertDialog(
            onDismissRequest = { assistantDraft = null },
            title = { Text(if (assistantIsNew) "添加 AI 助手" else "编辑 AI 助手") },
            text = {
                Column {
                    OutlinedTextField(
                        value = draft.name,
                        onValueChange = { assistantDraft = draft.copy(name = it) },
                        label = { Text("名称") },
                        placeholder = { Text("例如：文本助手 / 识图助手") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = draft.provider,
                        onValueChange = { assistantDraft = draft.copy(provider = it) },
                        label = { Text("Provider") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = draft.model ?: "",
                        onValueChange = { assistantDraft = draft.copy(model = it.ifBlank { null }) },
                        label = { Text("模型") },
                        placeholder = { Text("agnes-chat / gpt-4o-mini") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = draft.apiKey ?: "",
                        onValueChange = { assistantDraft = draft.copy(apiKey = it.ifBlank { null }) },
                        label = { Text("API Key") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = draft.baseUrl ?: "",
                        onValueChange = { assistantDraft = draft.copy(baseUrl = it.ifBlank { null }) },
                        label = { Text("Base URL（可选）") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("支持图片（识图）", fontSize = 13.sp)
                            Text(
                                "要用多模态模型，否则接口会报错",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = draft.vision,
                            onCheckedChange = { assistantDraft = draft.copy(vision = it) }
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val current = assistantDraft ?: return@TextButton
                    val saved = current.copy(
                        name = current.name.trim().ifBlank {
                            current.provider.trim().ifBlank { "AI 助手" }
                        },
                        provider = current.provider.trim().ifBlank { "agnes" }
                    )
                    val list = if (assistantIsNew) {
                        assistants + saved
                    } else {
                        assistants.map { if (it.id == saved.id) saved else it }
                    }
                    val nextActive = activeAssistantId ?: saved.id
                    assistants = list
                    activeAssistantId = nextActive
                    store.updateAssistants(list, nextActive)
                    assistantDraft = null
                    Toast.makeText(context, "已保存助手", Toast.LENGTH_SHORT).show()
                }) { Text("保存") }
            },
            dismissButton = {
                TextButton(onClick = { assistantDraft = null }) { Text("取消") }
            }
        )
    }

    // ------------------------------------------------------------ 标签：改名 / 删除
    renamingTag?.let { from ->
        AlertDialog(
            onDismissRequest = { renamingTag = null },
            title = { Text("标签改名") },
            text = {
                Column {
                    OutlinedTextField(
                        value = renameDraft,
                        onValueChange = { renameDraft = it },
                        label = { Text("新名字") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "改名会把所有券上的「$from」一起换掉。",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val next = CouponRules.normalizeTag(renameDraft)
                    when {
                        next == null -> Toast.makeText(context, "标签不能为空", Toast.LENGTH_SHORT).show()
                        next == from -> renamingTag = null
                        tagLibrary.contains(next) ->
                            Toast.makeText(context, "「$next」已经在列表里了", Toast.LENGTH_SHORT).show()
                        else -> {
                            val updated = tagLibrary.map { if (it == from) next else it }
                            tagLibrary = updated
                            store.updateTagLibrary(updated)
                            renamingTag = null
                            scope.launch {
                                val changed = runCatching { repo.renameTag(from, next) }.getOrDefault(0)
                                Toast.makeText(
                                    context,
                                    if (changed > 0) "已改名，更新 $changed 张券" else "已改名",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        }
                    }
                }) { Text("确定") }
            },
            dismissButton = {
                TextButton(onClick = { renamingTag = null }) { Text("取消") }
            }
        )
    }

    removingTag?.let { tag ->
        AlertDialog(
            onDismissRequest = { removingTag = null },
            title = { Text("删除标签") },
            text = {
                Text(
                    when (val usage = removingUsage) {
                        null -> "正在统计有多少张券在用「$tag」…"
                        0 -> "没有券在用「$tag」，可以直接删除。"
                        else -> "已有 $usage 张券打了「$tag」，删除后会一并从这些券上移除。"
                    }
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val updated = tagLibrary.filter { it != tag }
                    tagLibrary = updated
                    store.updateTagLibrary(updated)
                    removingTag = null
                    scope.launch {
                        val changed = runCatching { repo.deleteTag(tag) }.getOrDefault(0)
                        Toast.makeText(
                            context,
                            if (changed > 0) "已删除，从 $changed 张券上移除" else "已删除",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }) { Text("删除", color = Danger) }
            },
            dismissButton = {
                TextButton(onClick = { removingTag = null }) { Text("取消") }
            }
        )
    }

    // ------------------------------------------------------------ 账号：修改密码
    if (showChangePassword) {
        ChangePasswordDialog(
            email = session?.email,
            onDismiss = { showChangePassword = false },
            onSuccess = { message ->
                showChangePassword = false
                Toast.makeText(context, message, Toast.LENGTH_LONG).show()
            }
        )
    }
}

@Composable
private fun SettingsCard(title: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(10.dp))
            content()
        }
    }
}
