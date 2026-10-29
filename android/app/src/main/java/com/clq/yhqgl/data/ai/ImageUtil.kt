package com.clq.yhqgl.data.ai

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream

/**
 * 把用户选的图片压成 data URL（base64 JPEG）。
 *
 * 手机截图动辄三五 MB，base64 还要再涨三分之一，很多接口对请求体有上限。
 * 这里按 1280 长边、JPEG 80 压一遍，通常 150-400 KB，文字仍然清楚。
 *
 * 抽成公共函数是因为「列表页弹窗识图」和「底部 AI 页识图」都要用它，
 * 各写一份迟早会在压缩参数上漂。
 *
 * @return null 表示这张图读不出来（损坏 / 权限被拒）
 */
fun readImageAsDataUrl(
    context: Context,
    uri: Uri,
    maxSize: Int = 1280
): String? = runCatching {
    val resolver = context.contentResolver

    // 先只读尺寸，算好采样率再真正解码，避免大图直接 OOM
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use {
        BitmapFactory.decodeStream(it, null, bounds)
    }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    var sample = 1
    while (bounds.outWidth / (sample * 2) >= maxSize || bounds.outHeight / (sample * 2) >= maxSize) {
        sample *= 2
    }

    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    val bitmap = resolver.openInputStream(uri)?.use {
        BitmapFactory.decodeStream(it, null, opts)
    } ?: return null

    val scale = minOf(1f, maxSize.toFloat() / maxOf(bitmap.width, bitmap.height))
    val scaled = if (scale < 1f) {
        Bitmap.createScaledBitmap(
            bitmap,
            (bitmap.width * scale).toInt().coerceAtLeast(1),
            (bitmap.height * scale).toInt().coerceAtLeast(1),
            true
        )
    } else {
        bitmap
    }

    val out = ByteArrayOutputStream()
    scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
    val base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    "data:image/jpeg;base64,$base64"
}.getOrNull()
