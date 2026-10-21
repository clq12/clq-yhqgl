package com.clq.yhqgl.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import com.clq.yhqgl.di.ServiceLocator
import com.clq.yhqgl.rules.CouponRules
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
    var tags by remember { mutableStateOf(CouponRules.normalizeTags(coupon?.tags ?: emptyList())) }
    var tagDraft by remember { mutableStateOf("") }
    // 历史券只为统计"用过哪些标签"，进页面读一次
    var allCoupons by remember { mutableStateOf<List<Coupon>>(emptyList()) }
    // 设置页里维护的标签库，历史标签不够时用它补位
    var tagLibrary by remember {
        mutableStateOf(CouponRules.tagLibraryOf(ServiceLocator.settingsStore.settings.tagLibrary))
    }

    LaunchedEffect(Unit) {
        allCoupons = runCatching { ServiceLocator.repository.localCoupons() }.getOrDefault(emptyList())
        tagLibrary = CouponRules.tagLibraryOf(ServiceLocator.settingsStore.settings.tagLibrary)
    }

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

                    TagEditor(
                        tags = tags,
                        draft = tagDraft,
                        onDraftChange = { tagDraft = it },
                        onAdd = { raw ->
                            val tag = CouponRules.normalizeTag(raw)
                            if (tag != null && !tags.contains(tag)) tags = tags + tag
                            tagDraft = ""
                        },
                        onRemove = { tag -> tags = tags - tag },
                        suggestions = CouponRules.suggestTags(allCoupons, tags, 8, tagLibrary),
                        detected = CouponRules.detectTags(title).filter { !tags.contains(it) }
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
                                    notes = notes.trim().ifEmpty { null },
                                    tags = CouponRules.normalizeTags(tags)
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

/**
 * 标签编辑器。
 *
 * 复用逻辑三层：历史高频（suggestions）→ 常用标签补位 → 标题里认出来的（detected，只给建议不自动加）。
 * 自动加标签看起来聪明，实际会在用户没注意时污染数据，所以这里一律要用户点一下。
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagEditor(
    tags: List<String>,
    draft: String,
    onDraftChange: (String) -> Unit,
    onAdd: (String) -> Unit,
    onRemove: (String) -> Unit,
    suggestions: List<String>,
    detected: List<String>
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("标签", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(
                "用于按平台筛选",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        if (tags.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                tags.forEach { tag ->
                    Surface(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .clickable { onRemove(tag) }
                                .padding(start = 10.dp, end = 6.dp, top = 5.dp, bottom = 5.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                tag,
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                            Spacer(Modifier.width(4.dp))
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "移除 $tag",
                                modifier = Modifier.size(12.dp),
                                tint = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = onDraftChange,
                label = { Text("加标签") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            Button(onClick = { onAdd(draft) }, enabled = draft.isNotBlank()) {
                Text("添加")
            }
        }

        if (detected.isNotEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("标题里有：", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                detected.forEach { tag ->
                    Text(
                        " $tag ",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .clickable { onAdd(tag) }
                            .padding(horizontal = 2.dp)
                    )
                }
            }
        }

        if (suggestions.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                suggestions.forEach { tag ->
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            tag,
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .clickable { onAdd(tag) }
                                .padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }
    }
}
