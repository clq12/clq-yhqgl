package com.clq.yhqgl.ui

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.clq.yhqgl.data.settings.SettingsStore
import com.clq.yhqgl.data.sync.WebDAVClient
import com.clq.yhqgl.model.AISettings
import com.clq.yhqgl.model.WebDAVSettings
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val store = remember { SettingsStore(context) }
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
    var saving by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("设置", style = MaterialTheme.typography.headlineMedium)

        Card(modifier = Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(2.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("WebDAV 同步", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("WebDAV 地址") },
                    placeholder = { Text("https://dav.jianguoyun.com/dav/") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
                )
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text("用户名") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("密码") },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = rootPath,
                    onValueChange = { rootPath = it },
                    label = { Text("根目录") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            scope.launch {
                                testing = true
                                val ok = try {
                                    val client = WebDAVClient(url, username, password)
                                    client.mkcol(rootPath.trim('/')) && client.exists("")
                                } catch (e: Exception) {
                                    false
                                }
                                testing = false
                                Toast.makeText(context, if (ok) "连接成功" else "连接失败", Toast.LENGTH_SHORT).show()
                            }
                        },
                        enabled = !testing && url.isNotBlank() && username.isNotBlank() && password.isNotBlank()
                    ) {
                        if (testing) CircularProgressIndicator(modifier = Modifier.height(16.dp)) else Text("测试连接")
                    }
                    Button(
                        onClick = {
                            saving = true
                            store.webdav = WebDAVSettings(
                                url = url.trim(),
                                username = username.trim(),
                                password = password,
                                rootPath = rootPath.trim()
                            )
                            saving = false
                            Toast.makeText(context, "已保存", Toast.LENGTH_SHORT).show()
                        },
                        enabled = url.isNotBlank() && username.isNotBlank() && password.isNotBlank()
                    ) {
                        Text("保存 WebDAV")
                    }
                }
            }
        }

        Card(modifier = Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(2.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("AI 设置", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = aiProvider,
                    onValueChange = { aiProvider = it },
                    label = { Text("Provider") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = aiKey,
                    onValueChange = { aiKey = it },
                    label = { Text("API Key") },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = aiBaseUrl,
                    onValueChange = { aiBaseUrl = it },
                    label = { Text("Base URL（可选）") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = aiModel,
                    onValueChange = { aiModel = it },
                    label = { Text("模型（可选）") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
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
                    }
                ) {
                    Text("保存 AI 设置")
                }
            }
        }

        Card(modifier = Modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(2.dp)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("同步与提醒", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("自动同步")
                    Switch(checked = autoSync, onCheckedChange = {
                        autoSync = it
                        store.settings = store.settings.copy(sync = store.settings.sync.copy(autoSync = it))
                    })
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("到期提醒")
                    Switch(checked = reminderEnabled, onCheckedChange = {
                        reminderEnabled = it
                        store.settings = store.settings.copy(reminder = store.settings.reminder.copy(enabled = it))
                    })
                }
            }
        }

        Spacer(Modifier.height(32.dp))
    }
}
