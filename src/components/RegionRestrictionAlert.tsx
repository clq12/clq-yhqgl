import { AlertCircle, ExternalLink } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

interface RegionRestrictionAlertProps {
  error?: string
  onRetry?: () => void
}

export function RegionRestrictionAlert({ error, onRetry }: RegionRestrictionAlertProps) {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>地区限制错误</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          豆包AI不支持当前地区访问（Vercel香港服务器受限）。
        </p>
        <div className="bg-destructive/10 p-3 rounded-md space-y-2">
          <p className="font-semibold">解决方案：</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>访问 <a href="https://open.bigmodel.cn/" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-400 inline-flex items-center gap-1">
              智谱AI开放平台 <ExternalLink className="h-3 w-3" />
            </a></li>
            <li>注册账号并创建API Key</li>
            <li>在Vercel项目设置中添加环境变量：<code className="bg-black/20 px-1 rounded">GLM_API_KEY</code></li>
            <li>重新部署应用</li>
          </ol>
        </div>
        {onRetry && (
          <Button onClick={onRetry} variant="outline" size="sm" className="mt-2">
            使用GLM-4重试
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
