import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Cloud,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import { cloud } from '../cloud';
import { useAuth } from '../context/AuthContext';
import { WEB_VERSION } from '../version';
import { Button, Input, Tabs } from './ui';

/** 登录页的三种入口：验证码登录 / 账号密码登录 / 注册新账号 */
type Mode = 'code' | 'password' | 'signup';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;
/** 验证码注册的账号初始密码，与安卓端 CloudAuth.DEFAULT_PASSWORD 保持一致 */
const DEFAULT_PASSWORD = '123456';

/**
 * 登录 / 注册。
 *
 * 三条路都落到同一个云账号：
 * - **验证码登录**：邮箱 → 六位码。新邮箱会自动注册，初始密码 123456。
 * - **账号密码登录**：`POST /v1/signin {username, password}`。
 * - **账号密码注册**：邮箱 + 密码 → 发码 → 验码 → `POST /v1/signup`
 *   （上游拒绝「只有用户名+密码」的注册，所以注册必须验一次邮箱）。
 */
export function LoginScreen() {
  const { refreshSession, loginWithPassword, registerWithPassword } = useAuth();

  const [mode, setMode] = useState<Mode>('code');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = window.setInterval(() => {
      setCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [countdown]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setCode('');
    setCodeSent(false);
    setVerificationId('');
    setPassword('');
    setConfirm('');
  };

  const sendCode = async (purpose: 'login' | 'signup') => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (purpose === 'signup') {
      if (password.length < MIN_PASSWORD) {
        setError(`密码至少 ${MIN_PASSWORD} 位`);
        return;
      }
      if (password !== confirm) {
        setError('两次输入的密码不一致');
        return;
      }
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const sent = await cloud.auth.sendOtp({ email: trimmed });
      if (sent.error) {
        setError(sent.error.message || '验证码发送失败，请稍后重试');
        return;
      }
      if (purpose === 'signup' && sent.data.isExistingUser) {
        setError('这个邮箱已经注册过了，直接登录即可');
        return;
      }
      setVerificationId(sent.data.verificationId);
      setIsExistingUser(sent.data.isExistingUser);
      setCodeSent(true);
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
      if (mode === 'signup') {
        const failure = await registerWithPassword(email, password, verificationId, code.trim());
        if (failure) setError(failure);
        return;
      }
      const completed = await cloud.auth.verifyOtp({
        email: email.trim(),
        verificationId,
        isExistingUser,
        token: code.trim(),
        // 新账号（走 signup）统一落一个初始密码，和安卓端保持一致；
        // 老用户这条参数会被上游忽略。
        password: isExistingUser ? undefined : DEFAULT_PASSWORD,
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

  const passwordLogin = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const failure = await loginWithPassword(email, password);
      if (failure) setError(failure);
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const heading = codeSent
    ? '输入邮箱验证码'
    : mode === 'password'
      ? '账号密码登录'
      : mode === 'signup'
        ? '注册新账号'
        : '登录或创建账号';

  const description = codeSent
    ? `验证码已发送至 ${email}，10 分钟内有效。`
    : mode === 'password'
      ? '用邮箱和密码登录；忘了密码可以先用验证码登录，再到「设置」里改。'
      : mode === 'signup'
        ? `设置邮箱和密码，注册前需要验证一次邮箱。账号初始可用密码 ${DEFAULT_PASSWORD}，登录后可自行修改。`
        : '使用邮箱接收一次性验证码，登录后会自动同步你的优惠券数据。';

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
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              验证码、密码两种登录方式都支持，手机和电脑是同一个账号
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

          {!codeSent && mode !== 'signup' && (
            <div className="mb-5">
              <Tabs
                items={[
                  { value: 'code' as Mode, label: '验证码登录' },
                  { value: 'password' as Mode, label: '账号密码登录' },
                ]}
                value={mode}
                onChange={switchMode}
                ariaLabel="登录方式"
              />
            </div>
          )}

          <h1 className="text-xl font-semibold text-slate-900">{heading}</h1>
          <p className="mt-1 text-sm text-slate-500">{description}</p>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          {notice && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {notice}
            </div>
          )}

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (codeSent) {
                void verify();
              } else if (mode === 'password') {
                void passwordLogin();
              } else {
                void sendCode(mode === 'signup' ? 'signup' : 'login');
              }
            }}
          >
            {codeSent ? (
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
                  {mode === 'signup' ? '完成注册并登录' : '登录 / 注册'}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setCodeSent(false);
                      setCode('');
                      setError(null);
                    }}
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                    返回
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendCode(mode === 'signup' ? 'signup' : 'login')}
                    disabled={countdown > 0 || loading}
                    className="text-rose-600 hover:text-rose-700 disabled:text-slate-400"
                  >
                    {countdown > 0 ? `${countdown}s 后可重发` : '重新发送'}
                  </button>
                </div>
              </>
            ) : (
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

                {mode !== 'code' && (
                  <Input
                    label={mode === 'signup' ? `设置密码（至少 ${MIN_PASSWORD} 位）` : '密码'}
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="请输入密码"
                  />
                )}

                {mode === 'signup' && (
                  <Input
                    label="确认密码"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="再输入一次"
                  />
                )}

                <Button type="submit" className="w-full" loading={loading} size="lg">
                  {mode === 'password' ? '登录' : mode === 'signup' ? '发送验证码并继续' : '发送验证码'}
                </Button>

                {mode === 'password' ? (
                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        switchMode('code');
                        setNotice('忘记密码：用验证码登录后，到「设置 → 账号」里改密码即可。');
                      }}
                      className="text-slate-500 hover:text-slate-800"
                    >
                      忘记密码？
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="font-medium text-rose-600 hover:text-rose-700"
                    >
                      注册新账号
                    </button>
                  </div>
                ) : mode === 'signup' ? (
                  <button
                    type="button"
                    onClick={() => switchMode('password')}
                    className="w-full text-sm text-slate-500 hover:text-slate-800"
                  >
                    已有账号，去登录
                  </button>
                ) : (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-xs text-slate-400">
                      新邮箱会自动注册，初始密码 {DEFAULT_PASSWORD}
                    </span>
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="font-medium text-rose-600 hover:text-rose-700"
                    >
                      注册
                    </button>
                  </div>
                )}
              </>
            )}
          </form>

          <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                正在处理…
              </>
            ) : (
              <>
                登录即表示同意将数据保存在云端，仅用于本应用
                <span className="text-slate-300">· v{WEB_VERSION}</span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
