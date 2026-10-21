package com.clq.yhqgl.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.clq.yhqgl.data.cloud.OtpChallenge
import com.clq.yhqgl.data.sync.MigrationMode
import com.clq.yhqgl.di.ServiceLocator
import com.clq.yhqgl.ui.theme.Brand
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private enum class Step { EMAIL, CODE, MIGRATION }

/**
 * 登录 + 首次迁移。
 *
 * 三步：输邮箱 → 收六位码 → （本地有数据且不是同一账号时）选迁移方式。
 * 验证码链路与网页端完全相同，账号是同一个。
 */
@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    onSkip: () -> Unit
) {
    val repo = ServiceLocator.repository
    val auth = ServiceLocator.cloudAuth
    val scope = rememberCoroutineScope()

    var step by remember { mutableStateOf(Step.EMAIL) }
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var challenge by remember { mutableStateOf<OtpChallenge?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var countdown by remember { mutableIntStateOf(0) }

    var localCount by remember { mutableIntStateOf(0) }
    var switchedAccount by remember { mutableStateOf(false) }

    // 登录前先记下"上次是谁"，登录后 lastOwnerId 会被覆盖，就比不出来了
    val previousOwner = remember { auth.lastOwnerId }

    fun sendCode() {
        val target = email.trim()
        if (target.isBlank() || !target.contains('@')) {
            error = "请填写正确的邮箱"
            return
        }
        scope.launch {
            busy = true
            error = null
            val result = repo.sendCode(target)
            busy = false
            result
                .onSuccess {
                    challenge = it
                    step = Step.CODE
                    countdown = 60
                }
                .onFailure { error = it.message ?: "验证码发送失败" }
        }
    }

    fun verify() {
        val c = challenge ?: return
        if (code.trim().length < 4) {
            error = "请填写验证码"
            return
        }
        scope.launch {
            busy = true
            error = null
            val result = repo.verifyCode(email.trim(), c, code.trim())
            if (result.isFailure) {
                busy = false
                error = result.exceptionOrNull()?.message ?: "登录失败"
                return@launch
            }
            ServiceLocator.updateSession(result.getOrNull())
            val state = repo.prepareAfterLogin(previousOwner)
            localCount = state.localCount
            switchedAccount = state.switchedAccount
            if (state.needsChoice) {
                busy = false
                step = Step.MIGRATION
            } else {
                repo.finishLoginMigration(MigrationMode.UPLOAD)
                busy = false
                onLoggedIn()
            }
        }
    }

    if (countdown > 0) {
        androidx.compose.runtime.LaunchedEffect(countdown) {
            delay(1000)
            countdown -= 1
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("优惠券管理", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(
            "登录后云端同步，手机和电脑看到的是同一份数据",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(28.dp))

        when (step) {
            Step.EMAIL -> {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("邮箱") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Done
                    )
                )
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = { sendCode() },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    if (busy) CircularProgressIndicator(
                        modifier = Modifier.height(18.dp),
                        color = MaterialTheme.colorScheme.onPrimary
                    ) else Text("发送验证码")
                }
            }

            Step.CODE -> {
                Text(
                    "验证码已发到 $email",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.take(6) },
                    label = { Text("六位验证码") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.NumberPassword,
                        imeAction = ImeAction.Done
                    )
                )
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = { verify() },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    if (busy) CircularProgressIndicator(
                        modifier = Modifier.height(18.dp),
                        color = MaterialTheme.colorScheme.onPrimary
                    ) else Text("登录")
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(
                        onClick = { sendCode() },
                        enabled = countdown == 0 && !busy
                    ) {
                        Text(if (countdown > 0) "${countdown}s 后可重发" else "重新发送")
                    }
                    TextButton(onClick = { step = Step.EMAIL; error = null }) { Text("换个邮箱") }
                }
            }

            Step.MIGRATION -> {
                MigrationChoice(
                    localCount = localCount,
                    switchedAccount = switchedAccount,
                    onChoose = { mode ->
                        scope.launch {
                            busy = true
                            repo.finishLoginMigration(mode)
                            busy = false
                            onLoggedIn()
                        }
                    }
                )
            }
        }

        error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }

        Spacer(Modifier.height(24.dp))
        TextButton(onClick = onSkip, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
            Text("暂不登录，先用本机数据")
        }
    }
}

@Composable
private fun MigrationChoice(
    localCount: Int,
    switchedAccount: Boolean,
    onChoose: (MigrationMode) -> Unit
) {
    Text("本机有 $localCount 张优惠券", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    Spacer(Modifier.height(6.dp))
    Text(
        if (switchedAccount) {
            "这台设备上次登录的是另一个账号，本机残留已清掉。现在选择如何处理这台设备上的数据："
        } else {
            "这些是登录前保存在本机的数据，选择怎么处理："
        },
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    Spacer(Modifier.height(16.dp))

    MigrationOption(
        title = "上传到我的账号",
        desc = "把本机这 $localCount 张券传到云端，与云端已有的一起保留",
        onClick = { onChoose(MigrationMode.UPLOAD) }
    )
    Spacer(Modifier.height(10.dp))
    MigrationOption(
        title = "只拉云端",
        desc = "放弃本机这些数据，只显示云端已有的",
        onClick = { onChoose(MigrationMode.PULL_ONLY) }
    )
    Spacer(Modifier.height(10.dp))
    MigrationOption(
        title = "先清空再拉",
        desc = "彻底清掉本机数据后重新从云端同步一遍",
        onClick = { onChoose(MigrationMode.CLEAR_THEN_PULL) }
    )
}

@Composable
private fun MigrationOption(title: String, desc: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, color = Brand)
            }
            Spacer(Modifier.height(4.dp))
            Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
