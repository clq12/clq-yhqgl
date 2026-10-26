import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';
import type { Database } from './database.types';

// publicConfig 由 workbuddy_cloud_service activate 返回，安全可嵌入前端
const publicConfig = {
  resourceId: 'wbcs_W2MCyUnU6ewExz4g7Xbhxf',
  endpoint: 'https://clq-yhqgl-web.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_4KwD8V477FzbwZVOPdaE9O_zZKtcJbzML1sHHCmVmChuWXYdyOTrZCH',
};

export const cloud = createWorkBuddyCloud<Database>({
  endpoint: publicConfig.endpoint,
  oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
  publishableKey: publicConfig.publishableKey,
});

