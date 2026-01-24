import type { Metadata, Viewport } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '优惠券管理',
    template: '%s | 优惠券管理',
  },
  description: '轻松记录和管理您的优惠信息，设置截止日期提醒，不错过任何优惠',
  keywords: [
    '优惠券',
    '优惠管理',
    '优惠提醒',
    '折扣记录',
  ],
  authors: [{ name: 'Coupon Manager' }],
  generator: 'Coze Code',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '优惠券管理',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
