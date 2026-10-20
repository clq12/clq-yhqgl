import { useState } from 'react';
import { cloud } from '../cloud';
import { Mail, Loader2, AlertCircle } from 'lucide-react';

interface LoginScreenProps {
  onLoggedIn?: () => void;
}

export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const startCountdown = (seconds = 60) => {
    setCountdown(seconds);
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    if (!email.includes('@')) {
      setError('请输入有效的邮箱地址');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const sent = await cloud.auth.sendOtp({ email });
      if (sent.error) {
        setError(sent.error.message || '发送验证码失败');
        return;
      }
      setVerificationId(sent.data.verificationId);
      setIsExistingUser(sent.data.isExistingUser);
      setStep('code');
      startCountdown();
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送验证码失败');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!verificationId || code.length < 4) {
      setError('请输入验证码');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const completed = await cloud.auth.verifyOtp({
        email,
        verificationId,
        isExistingUser,
        token: code,
      });
      if (completed.error) {
        setError(completed.error.message || '验证码错误或已过期');
        return;
      }
      onLoggedIn?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-8">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-rose-100 text-rose-600 mx-auto mb-4">
          <Mail className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-center text-gray-900 mb-2">登录优惠券管理</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          登录后数据将同步到云端，换设备也能访问。
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {step === 'email' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <button
              onClick={sendCode}
              disabled={loading}
              className="w-full py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              发送验证码
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                验证码已发送至 {email}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="请输入 6 位验证码"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <button
              onClick={verify}
              disabled={loading}
              className="w-full py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              登录 / 注册
            </button>
            <div className="flex items-center justify-between text-sm">
              <button
                onClick={() => setStep('email')}
                className="text-gray-500 hover:text-gray-700"
              >
                更换邮箱
              </button>
              <button
                onClick={sendCode}
                disabled={countdown > 0 || loading}
                className="text-rose-600 hover:text-rose-700 disabled:text-gray-400"
              >
                {countdown > 0 ? `${countdown}s 后重发` : '重新发送'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
