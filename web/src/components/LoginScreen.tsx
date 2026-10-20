import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Cloud, Loader2, Mail, ShieldCheck, Ticket } from 'lucide-react';
import { cloud } from '../cloud';
import { useAuth } from '../context/AuthContext';
import { Button, Input } from './ui';

export function LoginScreen() {
  const { refreshSession } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = window.setInterval(() => {
      setCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [countdown]);

  const sendCode = async () => {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const sent = await cloud.auth.sendOtp({ email: trimmed });
      if (sent.error) {
        setError(sent.error.message || '验证码发送失败，请稍后重试');
        return;
      }
      setVerificationId(sent.data.verificationId);
      setIsExistingUser(sent.data.isExistingUser);
      setStep('code');
      setCode('');
      setCountdown(60);
      window.setTimeout(() => codeInputRef.current?.focus(), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证码发送失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!verificationId || code.trim().length < 4) {
      setError('请输入收到的验证码');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const completed = await cloud.auth.verifyOtp({
        email: email.trim(),
        verificationId,
        isExistingUser,
        token: code.trim(),
      });
      if (completed.error) {
        setError(completed.error.message || '验证码错误或已过期，请重新获取');
        return;
      }
      // 立刻刷新会话并触发账号数据同步，不依赖事件回调是否触发
      await refreshSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh bg-white">
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-gradient-to-br from-rose-600 via-rose-500 to-orange-400 p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Ticket className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">优惠券管理</p>
            <p className="text-xs text-white/70">Coupon Manager</p>
          </div>
        </div>

        <div className="max-w-sm space-y-5">
          <h2 className="text-3xl font-semibold leading-snug">把散落各处的优惠券，收进一个地方</h2>
          <ul className="space-y-3 text-sm text-white/85">
            <li className="flex items-start gap-2.5">
              <Cloud className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              登录后数据自动保存在云端，换电脑、换浏览器都能接着用
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              每个账号的数据相互隔离，只有你自己能看到
            </li>
            <li className="flex items-start gap-2.5">
              <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              使用邮箱验证码登录，不需要记额外密码
            </li>
          </ul>
        </div>

        <p className="text-xs text-white/60">数据存储于你选择的云端，随时可导出与迁移</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white">
              <Ticket className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">优惠券管理</p>
              <p className="text-xs text-slate-400">Coupon Manager</p>
            </div>
          </div>

          <h1 className="text-xl font-semibold text-slate-900">
            {step === 'email' ? '登录或创建账号' : '输入验证码'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {step === 'email'
              ? '使用邮箱接收一次性验证码，登录后会自动同步你的优惠券数据。'
              : `验证码已发送至 ${email}，10 分钟内有效。`}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (step === 'email') void sendCode();
              else void verify();
            }}
          >
            {step === 'email' ? (
              <>
                <Input
                  label="邮箱地址"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="you@example.com"
                  autoFocus
                />
                <Button type="submit" className="w-full" loading={loading} size="lg">
                  发送验证码
                </Button>
              </>
            ) : (
              <>
                <Input
                  inputRef={codeInputRef}
                  label="验证码"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\s/g, ''));
                    if (error) setError(null);
                  }}
                  placeholder="请输入 6 位验证码"
                  maxLength={8}
                />
                <Button type="submit" className="w-full" loading={loading} size="lg">
                  登录 / 注册
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setError(null);
                      setCode('');
                    }}
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                    更换邮箱
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendCode()}
                    disabled={countdown > 0 || loading}
                    className="text-rose-600 hover:text-rose-700 disabled:text-slate-400"
                  >
                    {countdown > 0 ? `${countdown}s 后可重发` : '重新发送'}
                  </button>
                </div>
              </>
            )}
          </form>

          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            {loading && step === 'code' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                正在登录并同步数据…
              </>
            ) : (
              '登录即表示同意将数据保存在云端，仅用于本应用'
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
