package com.clq.yhqgl.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.clq.yhqgl.data.cloud.CloudAuth
import com.clq.yhqgl.di.ServiceLocator
import com.clq.yhqgl.ui.theme.Danger
import kotlinx.coroutines.launch

/** 改密的两条路：知道旧密码 / 不知道旧密码（用邮箱验证码） */
private enum class PwdMode { WITH_OLD, BY_CODE }

/**
 * 修改密码。
 *
 * 为什么要有两条路：
 *
 * - **知道旧密码**：走 `sudo` + `PATCH /v1/user/password`，一步到位。
 *   验证码注册的账号如果没改过密码，旧密码就是初始默认密码 `123456`。
 * - **不知道旧密码**：早期版本用验证码注册时，本地存的是一个随机密码（用户根本不知道），
 *   老账号只能用一次邮箱验证码把密码重置掉。这条链等价于 SDK 的 `resetPasswordForEmail`。
 *
 * 改完密码不需要重新登录：上游会顺手回一个新会话，这里只负责告诉用户结果。
 */
@Composable
fun ChangePasswordDialog(
    email: String?,
    onDismiss: () -> Unit,
    onSuccess: (String) -> Unit
) {
    val scope = rememberCoroutineScope()
    val repo = ServiceLocator.repository

    var mode by remember { mutableStateOf(PwdMode.WITH_OLD) }
    var oldPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var verificationId by remember { mutableStateOf<String?>(null) }
    var showPassword by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun localCheck(): String? = when {
        newPassword.length < CloudAuth.MIN_PASSWORD_LENGTH ->
            "新密码至少 ${CloudAuth.MIN_PASSWORD_LENGTH} 位"
        newPassword != confirmPassword -> "两次输入的新密码不一致"
        mode == PwdMode.WITH_OLD && oldPassword.isBlank() -> "请填写旧密码"
        else -> null
    }

    fun changeWithOld() {
        localCheck()?.let { error = it; return }
        scope.launch {
            busy = true
            error = null
            val result = repo.changePassword(oldPassword, newPassword)
            busy = false
            result
                .onSuccess { onSuccess("密码已更新，以后可以用新密码登录") }
                .onFailure { error = it.message ?: "修改失败" }
        }
    }

    fun sendResetCode() {
        localCheck()?.let { error = it; return }
        val target = email?.trim().orEmpty()
        if (target.isBlank()) {
            error = "当前会话没有邮箱，请退出后重新登录再试"
            return
        }
        scope.launch {
            busy = true
            error = null
            val result = repo.sendPasswordResetCode(target)
            busy = false
            result
                .onSuccess {
                    verificationId = it
                    code = ""
                }
                .onFailure { error = it.message ?: "验证码发送失败" }
        }
    }

    fun resetByCode() {
        val id = verificationId ?: return
        if (code.trim().length < 4) {
            error = "请填写验证码"
            return
        }
        localCheck()?.let { error = it; return }
        val target = email?.trim().orEmpty()
        scope.launch {
            busy = true
            error = null
            val result = repo.resetPassword(target, id, code.trim(), newPassword)
            busy = false
            result
                .onSuccess { onSuccess("密码已重置，已用新密码登录") }
                .onFailure { error = it.message ?: "重置失败" }
        }
    }

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text("修改密码") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    email ?: "已登录",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                if (mode == PwdMode.WITH_OLD) {
                    OutlinedTextField(
                        value = oldPassword,
                        onValueChange = { oldPassword = it; error = null },
                        label = { Text("旧密码") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        visualTransformation = if (showPassword) {
                            VisualTransformation.None
                        } else {
                            PasswordVisualTransformation()
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Next
                        )
                    )
                    Text(
                        "用验证码注册且没改过密码的账号，旧密码是初始密码 ${CloudAuth.DEFAULT_PASSWORD}",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Text(
                        if (verificationId == null) {
                            "会给 $email 发一封验证码，验证后即可设置新密码（不需要旧密码）。"
                        } else {
                            "验证码已发送，请查收邮箱。"
                        },
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it; error = null },
                    label = { Text("新密码（至少 ${CloudAuth.MIN_PASSWORD_LENGTH} 位）") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    visualTransformation = if (showPassword) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Next
                    )
                )
                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it; error = null },
                    label = { Text("确认新密码") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    visualTransformation = if (showPassword) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = if (mode == PwdMode.BY_CODE && verificationId != null) {
                            ImeAction.Done
                        } else {
                            ImeAction.Next
                        }
                    )
                )

                if (mode == PwdMode.BY_CODE && verificationId != null) {
                    OutlinedTextField(
                        value = code,
                        onValueChange = { code = it.filter(Char::isDigit).take(6); error = null },
                        label = { Text("六位验证码") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.NumberPassword,
                            imeAction = ImeAction.Done
                        )
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(onClick = { showPassword = !showPassword }) {
                        Text(if (showPassword) "隐藏密码" else "显示密码", fontSize = 12.sp)
                    }
                    TextButton(
                        onClick = {
                            mode = if (mode == PwdMode.WITH_OLD) PwdMode.BY_CODE else PwdMode.WITH_OLD
                            verificationId = null
                            code = ""
                            error = null
                        }
                    ) {
                        Text(
                            if (mode == PwdMode.WITH_OLD) "不记得旧密码" else "我知道旧密码",
                            fontSize = 12.sp
                        )
                    }
                }

                error?.let {
                    Text(it, color = Danger, fontSize = 12.sp)
                }
                if (busy) {
                    CircularProgressIndicator(modifier = Modifier.height(18.dp), strokeWidth = 2.dp)
                }
            }
        },
        confirmButton = {
            if (mode == PwdMode.WITH_OLD) {
                TextButton(onClick = { changeWithOld() }, enabled = !busy) { Text("保存") }
            } else if (verificationId == null) {
                TextButton(onClick = { sendResetCode() }, enabled = !busy) { Text("发送验证码") }
            } else {
                TextButton(onClick = { resetByCode() }, enabled = !busy) { Text("重置密码") }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) { Text("取消") }
        }
    )
}
