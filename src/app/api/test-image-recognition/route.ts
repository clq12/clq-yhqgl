import { NextRequest, NextResponse } from "next/server"

/**
 * 详细测试API - 测试豆包AI图片识别的每个步骤
 */
export async function POST(request: NextRequest) {
  const testLog: any[] = []

  const log = (step: string, data?: any) => {
    testLog.push({
      timestamp: new Date().toISOString(),
      step,
      data
    })
    console.log(`[${new Date().toISOString()}] ${step}`, data || '')
  }

  try {
    log('开始测试', { method: 'POST', path: '/api/test-image-recognition' })

    // 步骤1：解析表单数据
    const formData = await request.formData()
    log('步骤1：解析表单数据成功')

    // 步骤2：获取图片文件
    const file = formData.get('image') as File
    const aiModel = (formData.get('aiModel') as string) || 'doubao'

    if (!file) {
      log('步骤2：错误 - 未提供图片')
      return NextResponse.json({
        success: false,
        error: '请上传图片',
        log: testLog
      }, { status: 400 })
    }

    log('步骤2：获取图片文件成功', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      fileSizeMB: (file.size / 1024 / 1024).toFixed(2),
      aiModel
    })

    // 步骤3：验证文件类型
    if (!file.type.startsWith('image/')) {
      log('步骤3：错误 - 文件类型无效', { fileType: file.type })
      return NextResponse.json({
        success: false,
        error: '请上传图片文件',
        log: testLog
      }, { status: 400 })
    }
    log('步骤3：验证文件类型通过')

    // 步骤4：转换为base64
    const bytes = await file.arrayBuffer()
    log('步骤4：读取文件字节数据成功', { bytesLength: bytes.byteLength })

    const buffer = Buffer.from(bytes)
    const base64Image = buffer.toString('base64')
    log('步骤4：转换为base64成功', { base64Length: base64Image.length })

    const mimeType = file.type
    const dataUrl = `data:${mimeType};base64,${base64Image}`
    log('步骤4：创建data URL成功', { dataUrlPrefix: dataUrl.substring(0, 50) + '...' })

    // 步骤5：导入SDK
    log('步骤5：开始导入coze-coding-dev-sdk')
    const { LLMClient, Config } = await import('coze-coding-dev-sdk')
    log('步骤5：导入SDK成功')

    // 步骤6：创建配置和客户端
    log('步骤6：开始创建Config和LLMClient')
    const config = new Config()
    const client = new LLMClient(config)
    log('步骤6：创建Config和LLMClient成功')

    // 步骤7：准备消息
    const prompt = `你是一个专业的优惠券页面结构化提取助手。

当前图片"优惠券/订单列表"截图，
提取图片中所有可见优惠券或订单信息。

必须提取字段：
1. 商家名称
2. 优惠名称
3. 优惠条件
4. 到期时间（统一转为：YYYY年M月D日 或 YYYY年M月D日 HH:MM）

输出规则：
- 每行一条
- 不加编号
- 不加解释
- 不输出多余文字

标准输出格式：
商家 优惠名称 优惠条件 到期时间

开始处理图片。`

    const messages = [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image_url' as const,
            image_url: {
              url: dataUrl
            }
          },
          {
            type: 'text' as const,
            text: prompt
          }
        ]
      }
    ]

    log('步骤7：准备消息成功', {
      messageCount: messages.length,
      contentTypes: messages[0].content.map((c: any) => c.type)
    })

    // 步骤8：调用LLM
    log('步骤8：开始调用LLM', {
      model: 'doubao-seed-1-8-251228',
      temperature: 0.3
    })

    const startTime = Date.now()
    const response = await client.invoke(messages, {
      model: 'doubao-seed-1-8-251228',
      temperature: 0.3,
    })
    const endTime = Date.now()
    const duration = endTime - startTime

    log('步骤8：调用LLM成功', {
      duration: `${duration}ms`,
      responseContentLength: response.content?.length || 0,
      responseContentPrefix: response.content?.substring(0, 100) || ''
    })

    // 步骤9：解析结果
    log('步骤9：开始解析结果')
    const extractedText = response.content.trim()
    const lines = extractedText.split('\n').filter(line => line.trim())

    log('步骤9：解析结果成功', {
      linesCount: lines.length,
      extractedText: extractedText
    })

    return NextResponse.json({
      success: true,
      data: {
        rawText: extractedText,
        linesCount: lines.length,
        duration: `${duration}ms`
      },
      log: testLog
    })

  } catch (error) {
    log('错误', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      log: testLog
    }, { status: 500 })
  }
}
