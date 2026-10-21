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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import com.clq.yhqgl.di.ServiceLocator
import com.clq.yhqgl.model.AISettings
import com.clq.yhqgl.model.WebDAVSettings
import com.clq.yhqgl.ui.theme.Danger
import kotlinx.coroutines.launch

/**
 * 设置页。
 *
 * 分四块：账号与云同步 → 备份（WebDAV）→ AI → 提醒。
 *
 * 顺序是有意的：账号在最上面，因为「数据存在哪」是用户最先要确认的事；
 * 备份紧跟其后，因为它的语义依赖账号（备份的是云端那份数据）。
 */
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
    var reminderEnabled by remember { mutableStateOf(settings.reminder.enabled) }

    var testing by remember { mutableStateOf(false) }
    var backingUp by remember { mutableStateOf(false) }
    var restoring by remember { mutableStateOf(false) }
    var confirmRestore by remember { mutableStateOf(false) }
    var pendingCount by remember { mutableIntStateOf(0) }
    var localCount by remember { mutableIntStateOf(0) }

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
                Text(
                    "退出后数据仍留在本机，可当成本地 App 继续用；再次登录同一账号会自动合并。",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
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
        SettingsCard("AI 识别") {
            OutlinedTextField(
                value = aiProvider,
                onValueChange = { aiProvider = it },
                label = { Text("Provider") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = aiKey,
                onValueChange = { aiKey = it },
                label = { Text("API Key（只存本机加密存储）") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = aiBaseUrl,
                onValueChange = { aiBaseUrl = it },
                label = { Text("Base URL（可选）") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = aiModel,
                onValueChange = { aiModel = it },
                label = { Text("模型（可选）") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = {
                    store.updateAI(
                        AISettings(
                            provider = aiProvider.trim().ifBlank { "agnes" },
                            apiKey = aiKey.trim().ifBlank { null },
                            baseUrl = aiBaseUrl.trim().ifBlank { null },
                            model = aiModel.trim().ifBlank { null }
                        )
                    )
                    Toast.makeText(context, "AI 设置已保存", Toast.LENGTH_SHORT).show()
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text("保存 AI 设置") }
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
