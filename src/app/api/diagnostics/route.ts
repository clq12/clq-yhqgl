import { NextRequest, NextResponse } from "next/server"

/**
 * 诊断API - 检查coze-coding-dev-sdk和图片识别配置
 */
export async function GET(request: NextRequest) {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    envVars: {
      GLM_API_KEY: process.env.GLM_API_KEY ? '已配置' : '未配置',
      PGDATABASE_URL: process.env.PGDATABASE_URL ? '已配置' : '未配置',
      NODE_ENV: process.env.NODE_ENV,
    },
    sdkTest: {
      status: 'unknown',
      error: null,
    }
  }

  // 测试coze-coding-dev-sdk
  try {
    const { LLMClient, Config } = await import('coze-coding-dev-sdk')
    const config = new Config()
    diagnostics.sdkTest.status = 'SDK导入成功'

    // 尝试创建客户端
    const client = new LLMClient(config)
    diagnostics.sdkTest.status = 'SDK客户端创建成功'
    diagnostics.sdkTest.clientCreated = true
    diagnostics.sdkTest.error = null

  } catch (error) {
    diagnostics.sdkTest.status = 'SDK测试失败'
    diagnostics.sdkTest.error = error instanceof Error ? error.message : String(error)
    diagnostics.sdkTest.clientCreated = false
  }

  return NextResponse.json(diagnostics)
}

/**
 * 测试图片上传（不实际识别）
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('image') as File

    if (!file) {
      return NextResponse.json({
        success: false,
        error: '请上传图片'
      }, { status: 400 })
    }

    const diagnostics = {
      timestamp: new Date().toISOString(),
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
        sizeInMB: (file.size / 1024 / 1024).toFixed(2),
      },
      uploadTest: {
        status: 'success',
        message: '图片上传成功'
      }
    }

    return NextResponse.json(diagnostics)
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
