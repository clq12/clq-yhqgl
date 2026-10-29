import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { cloud } from '../cloud';
import { Button, Input, useToast } from './ui';

const MIN_PASSWORD = 6;
/** 验证码注册的账号初始密码，与安卓端 CloudAuth.DEFAULT_PASSWORD 一致 */
const DEFAULT_PASSWORD = '123456';

type ResetChallenge = NonNullable<
  Awaited<ReturnType<typeof cloud.auth.resetPasswordForEmail>>['data']
>;

/**
 * 修改密码（网页端）。
 *
 * 两条链，和安卓端设置页一一对应：
 * 1. **知道旧密码** → `resetPasswordForOld`（内部是 sudo + PATCH user/password）；
 * 2. **不知道旧密码** → 发一封重置验证码（`usage: PASSWORD_RESET`），验码后改密并自动登录。
 *
 * 验证码注册的老账号在上游有一条「用户不知道」的密码，
 * 所以第 2 条是必须的逃生口，不能只做第 1 条。
 */
export function PasswordSettings({ email }: { email: string }) {
  const { showToast } = useToast();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 验证码重置链
  const [byCode, setByCode] = useState(false);
  const [challenge, setChallenge] = useState<ResetChallenge | null>(null);
  const [code, setCode] = useState('');

  const reset = () => {
    setNewPassword('');
    setConfirm('');
    setCode('');
    setError(null);
  };

  const validate = (): string | null => {
    if (newPassword.length < MIN_PASSWORD) return `新密码至少 ${MIN_PASSWORD} 位`;
    if (newPassword !== confirm) return '两次输入的新密码不一致';
    if (!byCode && !oldPassword) return '请填写旧密码';
    return null;
  };

  const changeWithOld = async () => {
    const failure = validate();
    if (failure) {
      setError(failure);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await cloud.auth.resetPasswordForOld({
        oldPassword,
        newPassword,
      });
      if (err) {
        setError(
          err.status === 400 || err.status === 401 || err.status === 403
            ? '旧密码不正确'
            : err.message || '修改失败',
        );
        return;
      }
      reset();
      setOldPassword('');
      showToast('密码已更新，下次可用新密码登录', 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : '修改失败');
    } finally {
      setBusy(false);
    }
  };

  const sendResetCode = async () => {
    const failure = validate();
    if (failure) {
      setError(failure);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await cloud.auth.resetPasswordForEmail(email);
      if (err || !data) {
        setError(err?.message || '验证码发送失败');
        return;
      }
      setChallenge(data);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证码发送失败');
    } finally {
      setBusy(false);
    }
  };

  const applyReset = async () => {
    const failure = validate();
    if (failure) {
      setError(failure);
      return;
    }
    if (!challenge) return;
    if (code.trim().length < 4) {
      setError('请填写验证码');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await challenge.updateUser({ nonce: code.trim(), password: newPassword });
      if (err) {
        setError(err.message || '重置失败');
        return;
      }
      reset();
      setChallenge(null);
      setByCode(false);
      showToast('密码已重置，已用新密码登录', 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : '重置失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-slate-400" aria-hidden />
          <div>
            <p className="text-sm font-medium text-slate-800">修改密码</p>
            <p className="text-[11px] text-slate-500">
              验证码注册的账号初始密码是 {DEFAULT_PASSWORD}；改完手机端也能用新密码登录
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setByCode((v) => !v);
            setChallenge(null);
            setError(null);
          }}
          className="shrink-0 text-xs text-rose-600 hover:text-rose-700"
        >
          {byCode ? '我知道旧密码' : '不记得旧密码'}
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {!byCode && (
          <Input
            label="旧密码"
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => {
              setOldPassword(e.target.value);
              if (error) setError(null);
            }}
            placeholder={DEFAULT_PASSWORD}
          />
        )}
        <Input
          label={`新密码（至少 ${MIN_PASSWORD} 位）`}
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            if (error) setError(null);
          }}
        />
        <Input
          label="确认新密码"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (error) setError(null);
          }}
        />
        {byCode && challenge && (
          <Input
            label="邮箱验证码"
            inputMode="numeric"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\s/g, ''));
              if (error) setError(null);
            }}
            placeholder="查收邮箱里的验证码"
          />
        )}
      </div>

      {byCode && !challenge && (
        <p className="mt-2 text-[11px] text-slate-500">
          会给 {email} 发一封重置验证码，验证后即可设置新密码（不需要旧密码）。
        </p>
      )}

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      <div className="mt-3">
        {byCode ? (
          challenge ? (
            <Button size="sm" onClick={applyReset} loading={busy}>
              重置密码
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={sendResetCode} loading={busy}>
              发送重置验证码
            </Button>
          )
        ) : (
          <Button size="sm" onClick={changeWithOld} loading={busy}>
            保存新密码
          </Button>
        )}
      </div>
    </div>
  );
}
