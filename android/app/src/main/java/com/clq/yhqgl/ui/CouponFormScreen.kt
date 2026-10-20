package com.clq.yhqgl.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.clq.yhqgl.model.Coupon
import com.clq.yhqgl.model.DiscountType
import java.time.LocalDate
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CouponFormScreen(
    coupon: Coupon?,
    onDismiss: () -> Unit,
    onSave: (Coupon) -> Unit,
    onDelete: () -> Unit = {}
) {
    val isEdit = coupon != null
    var title by remember { mutableStateOf(coupon?.title ?: "") }
    var description by remember { mutableStateOf(coupon?.description ?: "") }
    var discountType by remember { mutableStateOf(coupon?.discountType) }
    var discountAmount by remember { mutableStateOf(coupon?.discountAmount?.toString() ?: "") }
    var fullAmount by remember { mutableStateOf(coupon?.fullAmount?.toString() ?: "") }
    var startDate by remember { mutableStateOf(coupon?.startDate ?: LocalDate.now().toString()) }
    var endDate by remember { mutableStateOf(coupon?.endDate ?: LocalDate.now().plusDays(30).toString()) }
    var endHour by remember { mutableStateOf(coupon?.endHour ?: 23) }
    var endMinute by remember { mutableStateOf(coupon?.endMinute ?: 59) }
    var notes by remember { mutableStateOf(coupon?.notes ?: "") }

    var typeExpanded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val typeOptions = listOf(
        null to "不设置折扣",
        DiscountType.AMOUNT to "减免金额",
        DiscountType.PERCENTAGE to "折扣比例",
        DiscountType.FULL to "满减优惠",
        DiscountType.GROUP to "团购券"
    )

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.extraLarge) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                elevation = CardDefaults.cardElevation(4.dp)
            ) {
                Column(
                    modifier = Modifier
                        .verticalScroll(rememberScrollState())
                        .padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(if (isEdit) "编辑优惠券" else "添加优惠券", style = MaterialTheme.typography.headlineSmall)
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, contentDescription = "关闭")
                        }
                    }

                    OutlinedTextField(
                        value = title,
                        onValueChange = { title = it },
                        label = { Text("标题 *") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = description,
                        onValueChange = { description = it },
                        label = { Text("描述") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2
                    )

                    var typeMenuExpanded by remember { mutableStateOf(false) }
                    Column {
                        OutlinedTextField(
                            value = typeOptions.find { it.first == discountType }?.second ?: "",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("折扣类型") },
                            modifier = Modifier.fillMaxWidth(),
                            trailingIcon = {
                                TextButton(onClick = { typeMenuExpanded = true }) {
                                    Text("选择")
                                }
                            }
                        )
                        DropdownMenu(
                            expanded = typeMenuExpanded,
                            onDismissRequest = { typeMenuExpanded = false }
                        ) {
                            typeOptions.forEach { (type, label) ->
                                DropdownMenuItem(
                                    text = { Text(label) },
                                    onClick = {
                                        discountType = type
                                        typeMenuExpanded = false
                                    }
                                )
                            }
                        }
                    }

                    if (discountType == DiscountType.FULL) {
                        OutlinedTextField(
                            value = fullAmount,
                            onValueChange = { fullAmount = it },
                            label = { Text("满金额") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    if (discountType != null && discountType != DiscountType.GROUP) {
                        OutlinedTextField(
                            value = discountAmount,
                            onValueChange = { discountAmount = it },
                            label = {
                                Text(
                                    when (discountType) {
                                        DiscountType.PERCENTAGE -> "折扣比例"
                                        DiscountType.FULL -> "减免金额"
                                        else -> "减免金额"
                                    }
                                )
                            },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    OutlinedTextField(
                        value = startDate,
                        onValueChange = { startDate = it },
                        label = { Text("开始日期 (YYYY-MM-DD)") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = endDate,
                        onValueChange = { endDate = it },
                        label = { Text("截止日期 (YYYY-MM-DD)") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = endHour.toString(),
                            onValueChange = { endHour = it.toIntOrNull()?.coerceIn(0, 23) ?: 23 },
                            label = { Text("时") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = endMinute.toString(),
                            onValueChange = { endMinute = it.toIntOrNull()?.coerceIn(0, 59) ?: 59 },
                            label = { Text("分") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f)
                        )
                    }

                    OutlinedTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = { Text("备注") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2
                    )

                    error?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }

                    Spacer(Modifier.height(8.dp))

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (isEdit) {
                            TextButton(onClick = onDelete, modifier = Modifier.weight(1f)) {
                                Text("删除", color = MaterialTheme.colorScheme.error)
                            }
                        }
                        TextButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                            Text("取消")
                        }
                        Button(
                            onClick = {
                                val parsedDiscount = discountAmount.toDoubleOrNull()
                                val parsedFull = fullAmount.toDoubleOrNull()
                                val candidate = (coupon ?: Coupon(
                                    id = UUID.randomUUID().toString(),
                                    title = "",
                                    startDate = startDate,
                                    endDate = endDate,
                                    createdAt = LocalDate.now().toString()
                                )).copy(
                                    title = title.trim(),
                                    description = description.trim().ifEmpty { null },
                                    discountType = discountType,
                                    discountAmount = if (discountType == DiscountType.GROUP) null else parsedDiscount,
                                    fullAmount = if (discountType == DiscountType.FULL) parsedFull else null,
                                    startDate = startDate,
                                    endDate = endDate,
                                    endHour = endHour,
                                    endMinute = endMinute,
                                    notes = notes.trim().ifEmpty { null }
                                )
                                // 简单校验
                                if (candidate.title.isBlank()) {
                                    error = "标题不能为空"
                                    return@Button
                                }
                                if (candidate.endDate < candidate.startDate) {
                                    error = "截止日期不能早于开始日期"
                                    return@Button
                                }
                                onSave(candidate)
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("保存")
                        }
                    }
                }
            }
        }
    }
}
