package com.clq.yhqgl.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.clq.yhqgl.data.cloud.CloudAuth
import com.clq.yhqgl.data.cloud.CloudSession
import com.clq.yhqgl.data.cloud.OtpChallenge
import com.clq.yhqgl.data.sync.MigrationMode
import com.clq.yhqgl.di.ServiceLocator
import com.clq.yhqgl.ui.theme.Brand
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** 登录页当前停在哪一屏 */
private sealed interface AuthScreen {
    /** 验证码登录：输邮箱 */
    data object CodeEmail : AuthScreen

    /** 验证码登录：输六位码 */
    data object CodeInput : AuthScreen

    /** 账号密码登录 */
    data object Password : AuthScreen

    /** 注册：邮箱 + 密码 + 确认密码 */
    data object RegisterForm : AuthScreen

    /** 注册：邮箱验证码（上游要求先验码才能建号） */
    data object RegisterCode : AuthScreen

    /** 首次登录迁移三选 */
    data object Migration : AuthScreen
}

/** 顶部两个页签，只影响「验证码 / 密码」这两条主链的入口 */
private enum class AuthTab { CODE, PASSWORD }

/**
 * 登录 + 注册 + 首次迁移。
 *
 * 三条并存的路，最终都落到同一个云账号（同一个 `sub`，也就是 RLS 的 `auth.uid()`）：
 *
 * 1. **验证码登录**：邮箱 → 六位码 → 登录（老账号）或自动注册（新账号，初始密码 123456）。
 * 2. **账号密码登录**：邮箱 + 密码 → `/v1/signin`。
 * 3. **账号密码注册**：邮箱 + 密码 → 发码 → 验码 → `/v1/signup`（上游拒绝无验证码的注册）。
 *
 * 登录成功后的数据归属判定（认领 / 清残留 / 三选）完全复用原有逻辑，
 * 三条路走同一个 [finishLogin]。
 */
@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    onSkip: () -> Unit
) {
    val repo = ServiceLocator.repository
    val auth = ServiceLocator.cloudAuth
    val scope = rememberCoroutineScope()

    var screen by remember { mutableStateOf<AuthScreen>(AuthScreen.CodeEmail) }
    var tab by remember { mutableStateOf(AuthTab.CODE) }

    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var password2 by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }

    var challenge by remember { mutableStateOf<OtpChallenge?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var countdown by remember { mutableIntStateOf(0) }

    var localCount by remember { mutableIntStateOf(0) }
    var switchedAccount by remember { mutableStateOf(false) }

    // 登录前先记下"上次是谁"，登录后 lastOwnerId 会被覆盖，就比不出来了
    val previousOwner = remember { auth.lastOwnerId }

    if (countdown > 0) {
        LaunchedEffect(countdown) {
            delay(1000)
            countdown -= 1
        }
    }

    fun validateEmail(): String? {
        val target = email.trim()
        return when {
            target.isBlank() -> "请填写邮箱"
            !target.contains('@') || !target.contains('.') -> "邮箱格式看起来不对"
            else -> null
        }
    }

    /** 三条登录链共用的收尾：判断数据归属 → 需要就弹迁移 → 进主界面 */
    suspend fun finishLogin(session: CloudSession?) {
        ServiceLocator.updateSession(session)
        val state = repo.prepareAfterLogin(previousOwner)
        localCount = state.localCount
        switchedAccount = state.switchedAccount
        if (state.needsChoice) {
            screen = AuthScreen.Migration
        } else {
            repo.finishLoginMigration(MigrationMode.UPLOAD)
            onLoggedIn()
        }
    }

    fun sendCode(forRegister: Boolean) {
        validateEmail()?.let { error = it; return }
        scope.launch {
            busy = true
            error = null
            notice = null
            val result = repo.sendCode(email.trim())
            busy = false
            result
                .onSuccess { fresh ->
                    // 上游明确说这个邮箱已存在时，别让用户以为自己在注册新号
                    if (forRegister && fresh.isUser) {
                        error = "这个邮箱已经注册过了，直接登录即可"
                        return@onSuccess
                    }
                    challenge = fresh
                    code = ""
                    screen = if (forRegister) AuthScreen.RegisterCode else AuthScreen.CodeInput
                    countdown = 60
                }
                .onFailure { error = it.message ?: "验证码发送失败" }
        }
    }

    fun verifyCode(forRegister: Boolean) {
        val c = challenge ?: return
        if (code.trim().length < 4) {
            error = "请填写验证码"
            return
        }
        scope.launch {
            busy = true
            error = null
            val result = repo.verifyCode(
                email = email.trim(),
                challenge = c,
                code = code.trim(),
                password = if (forRegister) password else null
            )
            if (result.isFailure) {
                busy = false
                error = result.exceptionOrNull()?.message ?: "登录失败"
                return@launch
            }
            finishLogin(result.getOrNull())
            busy = false
        }
    }

    fun passwordLogin() {
        validateEmail()?.let { error = it; return }
        if (password.isBlank()) {
            error = "请填写密码"
            return
        }
        scope.launch {
            busy = true
            error = null
            val result = repo.signInWithPassword(email.trim(), password)
            if (result.isFailure) {
                busy = false
                error = result.exceptionOrNull()?.message ?: "登录失败"
                return@launch
            }
            finishLogin(result.getOrNull())
            busy = false
        }
    }

    fun startRegister() {
        validateEmail()?.let { error = it; return }
        when {
            password.length < CloudAuth.MIN_PASSWORD_LENGTH ->
                error = "密码至少 ${CloudAuth.MIN_PASSWORD_LENGTH} 位"
            password != password2 -> error = "两次输入的密码不一致"
            else -> sendCode(forRegister = true)
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
        Spacer(Modifier.height(22.dp))

        when (screen) {
            AuthScreen.CodeEmail, AuthScreen.Password -> {
                AuthTabs(
                    tab = tab,
                    onChange = {
                        tab = it
                        error = null
                        notice = null
                        password = ""
                        screen = if (it == AuthTab.CODE) AuthScreen.CodeEmail else AuthScreen.Password
                    }
                )
                Spacer(Modifier.height(18.dp))
            }

            else -> Unit
        }

        when (screen) {
            AuthScreen.CodeEmail -> {
                EmailField(email) { email = it; error = null }
                Spacer(Modifier.height(16.dp))
                PrimaryButton(text = "发送验证码", busy = busy, onClick = { sendCode(false) })
                Spacer(Modifier.height(10.dp))
                Text(
                    "没注册过也能用：验证码通过后会自动创建账号，初始密码 ${CloudAuth.DEFAULT_PASSWORD}。",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            AuthScreen.CodeInput -> {
                Text(
                    "验证码已发到 ${email.trim()}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.filter(Char::isDigit).take(6) },
                    label = { Text("六位验证码") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.NumberPassword,
                        imeAction = ImeAction.Done
                    )
                )
                Spacer(Modifier.height(16.dp))
                PrimaryButton(text = "登录", busy = busy, onClick = { verifyCode(false) })
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(
                        onClick = { sendCode(false) },
                        enabled = countdown == 0 && !busy
                    ) { Text(if (countdown > 0) "${countdown}s 后可重发" else "重新发送") }
                    TextButton(onClick = { screen = AuthScreen.CodeEmail; error = null }) { Text("换个邮箱") }
                }
            }

            AuthScreen.Password -> {
                EmailField(email) { email = it; error = null }
                Spacer(Modifier.height(10.dp))
                PasswordField(
                    value = password,
                    label = "密码",
                    visible = showPassword,
                    onToggleVisible = { showPassword = !showPassword },
                    imeAction = ImeAction.Done
                ) { password = it; error = null }
                Spacer(Modifier.height(16.dp))
                PrimaryButton(text = "登录", busy = busy, onClick = { passwordLogin() })
                Spacer(Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    TextButton(
                        onClick = {
                            tab = AuthTab.CODE
                            error = null
                            notice = "忘记密码：用验证码登录后，到「设置 → 账号」里改密码即可。"
                            screen = AuthScreen.CodeEmail
                        }
                    ) { Text("忘记密码？", fontSize = 13.sp) }
                    TextButton(
                        onClick = {
                            error = null
                            notice = null
                            password = ""
                            password2 = ""
                            screen = AuthScreen.RegisterForm
                        }
                    ) { Text("注册新账号", fontSize = 13.sp, color = Brand) }
                }
            }

            AuthScreen.RegisterForm -> {
                Text("注册新账号", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                Text(
                    "注册前需要验证一次邮箱（服务端要求）。",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(12.dp))
                EmailField(email) { email = it; error = null }
                Spacer(Modifier.height(10.dp))
                PasswordField(
                    value = password,
                    label = "设置密码（至少 ${CloudAuth.MIN_PASSWORD_LENGTH} 位）",
                    visible = showPassword,
                    onToggleVisible = { showPassword = !showPassword },
                    imeAction = ImeAction.Next
                ) { password = it; error = null }
                Spacer(Modifier.height(10.dp))
                PasswordField(
                    value = password2,
                    label = "确认密码",
                    visible = showPassword,
                    onToggleVisible = { showPassword = !showPassword },
                    imeAction = ImeAction.Done
                ) { password2 = it; error = null }
                Spacer(Modifier.height(16.dp))
                PrimaryButton(text = "发送验证码并继续", busy = busy, onClick = { startRegister() })
                Spacer(Modifier.height(6.dp))
                TextButton(onClick = { screen = AuthScreen.Password; error = null }) {
                    Text("已有账号，去登录", fontSize = 13.sp)
                }
            }

            AuthScreen.RegisterCode -> {
                Text(
                    "验证码已发到 ${email.trim()}，填完就建号",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.filter(Char::isDigit).take(6) },
                    label = { Text("六位验证码") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.NumberPassword,
                        imeAction = ImeAction.Done
                    )
                )
                Spacer(Modifier.height(16.dp))
                PrimaryButton(text = "完成注册并登录", busy = busy, onClick = { verifyCode(true) })
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { sendCode(true) }, enabled = countdown == 0 && !busy) {
                        Text(if (countdown > 0) "${countdown}s 后可重发" else "重新发送")
                    }
                    TextButton(onClick = { screen = AuthScreen.RegisterForm; error = null }) {
                        Text("改邮箱或密码")
                    }
                }
            }

            AuthScreen.Migration -> {
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
        notice?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
        }

        if (screen != AuthScreen.Migration) {
            Spacer(Modifier.height(24.dp))
            TextButton(onClick = onSkip, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                Text("暂不登录，先用本机数据")
            }
        }
    }
}

@Composable
private fun AuthTabs(tab: AuthTab, onChange: (AuthTab) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(10.dp))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        TabCell("验证码登录", tab == AuthTab.CODE, Modifier.weight(1f)) { onChange(AuthTab.CODE) }
        TabCell("账号密码登录", tab == AuthTab.PASSWORD, Modifier.weight(1f)) { onChange(AuthTab.PASSWORD) }
    }
}

@Composable
private fun TabCell(
    label: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Column(
        modifier = modifier
            .background(
                if (selected) MaterialTheme.colorScheme.surface else androidx.compose.ui.graphics.Color.Transparent,
                RoundedCornerShape(8.dp)
            )
            .clickable(onClick = onClick)
            .padding(vertical = 9.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            label,
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (selected) {
                MaterialTheme.colorScheme.onSurface
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            }
        )
    }
}

@Composable
private fun EmailField(value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text("邮箱") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Email,
            imeAction = ImeAction.Next
        )
    )
}

@Composable
private fun PasswordField(
    value: String,
    label: String,
    visible: Boolean,
    onToggleVisible: () -> Unit,
    imeAction: ImeAction,
    onChange: (String) -> Unit
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Password,
            imeAction = imeAction
        ),
        trailingIcon = {
            TextButton(onClick = onToggleVisible) {
                Text(if (visible) "隐藏" else "显示", fontSize = 12.sp)
            }
        }
    )
}

@Composable
private fun PrimaryButton(text: String, busy: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = !busy,
        modifier = Modifier.fillMaxWidth().height(48.dp)
    ) {
        if (busy) {
            CircularProgressIndicator(
                modifier = Modifier.height(18.dp),
                color = MaterialTheme.colorScheme.onPrimary,
                strokeWidth = 2.dp
            )
        } else {
            Text(text)
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
