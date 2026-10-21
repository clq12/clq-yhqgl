/**
 * 把用户选的图片压成可以直接丢给多模态模型的 data URL。
 *
 * 为什么必须压缩：手机截图动辄 3-5 MB，base64 后还要再涨 33%，
 * 很多接口对请求体有 4-10 MB 上限，直接原图上传大概率 413。
 * 长边限到 1280、JPEG 0.82 之后通常 150-400 KB，文字仍然清晰够识别。
 */
export async function fileToDataUrl(file: File, maxSize = 1280, quality = 0.82): Promise<string> {
  const original = await readAsDataUrl(file);

  // 非图片（理论上不会走到）或浏览器不支持 canvas 时，原样返回
  if (!file.type.startsWith('image/') || typeof document === 'undefined') return original;

  try {
    const img = await loadImage(original);
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    // 白底：透明 PNG 直接转 JPEG 会变黑底，截图里的白字会糊掉
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const compressed = canvas.toDataURL('image/jpeg', quality);
    // 压完反而更大就用原图（小图常见）
    return compressed.length < original.length ? compressed : original;
  } catch {
    return original;
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = src;
  });
}
