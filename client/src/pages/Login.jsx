import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { getApiError, getApiErrorCode } from '../services/api/client';
import { Alert } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';

// ─── Validation schema — unchanged from original ──────────────────────────────
const loginSchema = z.object({
  accountCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Format: XXXX-XXXX-XXXX'),
  username: z.string().trim().min(4, 'At least 4 characters').max(30),
  password: z.string().min(8, 'At least 8 characters').max(128),
});

// ─── Account Code auto-formatter ─────────────────────────────────────────────
// Strips non-alphanumeric chars, uppercases, limits to 12 chars, inserts
// hyphens at positions 4 and 8.  The output (XXXX-XXXX-XXXX) matches both the
// client zod schema and the server-side ACCOUNT_CODE_REGEX — no backend change.
// RHF reads from _f.ref.value (the real DOM input) at submit time, so mutating
// e.target.value in the onChange handler is the correct integration point.
function formatAccountCode(raw) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (clean.length <= 4) return clean;
  if (clean.length <= 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8)}`;
}

// ─── Inline SVG icons — zero new dependencies ─────────────────────────────────

function IconHash() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 5.5h9M3.5 10.5h9M6 2.5l-1.5 11M11.5 2.5l-1.5 11"
        stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"
      />
    </svg>
  );
}

function IconUser() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.35"/>
      <path
        d="M2.5 13.5c0-3.038 2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5"
        stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"
      />
    </svg>
  );
}

function IconLock() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.75" y="7" width="10.5" height="7.25" rx="1.5"
        stroke="currentColor" strokeWidth="1.35"/>
      <path
        d="M5 7V5a3 3 0 0 1 6 0v2"
        stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"
      />
      <circle cx="8" cy="10.625" r="1" fill="currentColor"/>
    </svg>
  );
}

function IconEye() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 8C2.5 5 5 3 8 3s5.5 2 6.5 5c-1 3-3.5 5-6.5 5S2.5 11 1.5 8z"
        stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.35"/>
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 2l12 12"
        stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"
      />
      <path
        d="M6.34 6.43a2 2 0 002.22 2.22M4.24 4.34C2.92 5.25 2 6.52 1.5 8c1 3 3.5 5 6.5 5 1.27 0 2.45-.4 3.42-1.08M7.08 3.1C7.38 3.04 7.69 3 8 3c3 0 5.5 2 6.5 5a9.1 9.1 0 01-.93 2.28"
        stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Brand mark — indigo rounded square with ledger-line motif ────────────────

function BrandMark() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-label="SwipeLedger" role="img">
      <rect width="44" height="44" rx="11" fill="#4f46e5"/>
      {/* Book spine */}
      <rect x="11" y="10" width="3.5" height="24" rx="1.75" fill="white" fillOpacity="0.4"/>
      {/* Page area */}
      <rect x="16" y="10" width="18" height="24" rx="2" fill="white" fillOpacity="0.1"/>
      {/* Ledger entry lines */}
      <path
        d="M18 17h13M18 22h10M18 27h7"
        stroke="white" strokeWidth="1.8" strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Field class helper — shared by Account Code and Username ─────────────────
function fieldCls(hasError) {
  const base = 'block w-full rounded-lg border pl-9 pr-3 py-2.5 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2';
  return hasError
    ? `${base} border-red-400 focus:ring-red-400 bg-red-50`
    : `${base} border-gray-300 focus:ring-brand-500 bg-white`;
}

// ─── Recovery flows placeholder ───────────────────────────────────────────────
// TODO: replace each button with <Link to="/forgot-password">, <Link to="/forgot-username">,
// <Link to="/forgot-account-code"> once those routes exist. Do not add routes until Step 3.
const RECOVERY_ITEMS = [
  { key: 'password',    label: 'Forgot Password'     },
  { key: 'username',    label: 'Forgot Username'     },
  { key: 'accountCode', label: 'Forgot Account Code' },
];

// ─── Login page ───────────────────────────────────────────────────────────────

export default function Login() {
  const { login } = useAuth();

  // Error / flow states — same semantics as original
  const [serverError,     setServerError]     = useState('');
  const [rateLimitMsg,    setRateLimitMsg]    = useState('');
  const [deviceLimitData, setDeviceLimitData] = useState(null); // { limit, activeDevices }
  const [revoking,        setRevoking]        = useState(null);

  // New UI states
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryNote, setRecoveryNote] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm({ resolver: zodResolver(loginSchema) });

  // ── Submit — error classification unchanged from original ──────────────────
  async function onSubmit(data) {
    setServerError('');
    setRateLimitMsg('');
    setDeviceLimitData(null);
    try {
      await login(data);
    } catch (err) {
      const code       = getApiErrorCode(err);
      const httpStatus = err?.response?.status;

      if (code === 'RATE_LIMITED') {
        setRateLimitMsg(getApiError(err));
      } else if (code === 'DEVICE_LIMIT_REACHED') {
        setDeviceLimitData(err.response?.data?.data || { limit: 3, activeDevices: [] });
      } else if (!err?.response) {
        // No response — offline / airplane mode / DNS failure / timeout.
        // Must NOT be displayed as invalid credentials.
        setServerError('No internet connection. Please check your network and try again.');
      } else if (httpStatus >= 500) {
        setServerError('Server temporarily unavailable. Please try again in a moment.');
      } else {
        // HTTP 4xx — wrong credentials, validation error, etc.
        setServerError('Invalid credentials. Please check your account code, username, and password.');
      }
    }
  }

  // ── Device revoke — unchanged from original ────────────────────────────────
  async function handleRevoke(deviceId) {
    setRevoking(deviceId);
    setServerError('');
    // Re-submits credentials + revokeDeviceId in one call so the server can
    // verify ownership before revoking.  Avoids calling the authenticated
    // DELETE /devices/:id endpoint from a pre-login context.
    const { accountCode, username, password } = getValues();
    try {
      await login({ accountCode, username, password, revokeDeviceId: deviceId });
    } catch (err) {
      const code       = getApiErrorCode(err);
      const httpStatus = err?.response?.status;
      if (code === 'DEVICE_LIMIT_REACHED') {
        setDeviceLimitData(err.response?.data?.data || { limit: 3, activeDevices: [] });
      } else if (!err?.response) {
        setServerError('No internet connection. Please check your network and try again.');
      } else if (httpStatus >= 500) {
        setServerError('Server temporarily unavailable. Please try again in a moment.');
      } else {
        setServerError('Failed to revoke device. Please try again.');
      }
    } finally {
      setRevoking(null);
    }
  }

  // ── Account Code onChange — auto-format + cursor preservation ─────────────
  // RHF reads from _f.ref.value (the real DOM input) at submit/validation time,
  // so mutating e.target.value here is the correct and safe integration point.
  // Cursor recalculation compensates for hyphens inserted before the cursor.
  function handleAccountCodeChange(e) {
    const input     = e.target;
    const oldCursor = input.selectionStart;
    const oldValue  = input.value;
    const formatted = formatAccountCode(oldValue);
    input.value     = formatted;

    // Count alphanumeric characters strictly before old cursor position,
    // then offset for each hyphen that appears before the new cursor.
    const alphanumBefore = oldValue.slice(0, oldCursor).replace(/[^A-Z0-9]/gi, '').length;
    let newCursor = alphanumBefore;
    if (alphanumBefore > 4) newCursor += 1; // first hyphen inserted at index 4
    if (alphanumBefore > 8) newCursor += 1; // second hyphen inserted at index 9
    newCursor = Math.min(newCursor, formatted.length);
    requestAnimationFrame(() => input.setSelectionRange(newCursor, newCursor));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    // overflow-y-auto: lets the page scroll when the Android keyboard
    // reduces the viewport height, preventing form clipping.
    <div className="min-h-screen flex flex-col justify-center px-4 py-8 bg-gray-50 overflow-y-auto">
      <div className="w-full max-w-sm mx-auto">

        {/* ── Brand header ──────────────────────────────────────────────── */}
        <div className="flex flex-col items-center mb-8">
          <BrandMark />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-brand-700">
            SwipeLedger
          </h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your workspace</p>
        </div>

        {/* ── Device-limit panel — logic unchanged, minor layout polish ─── */}
        {deviceLimitData && (
          <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4">
            <h3 className="mb-1 text-sm font-semibold text-orange-800">
              Device limit reached ({deviceLimitData.limit} devices)
            </h3>
            <p className="mb-3 text-xs text-orange-700">
              Revoke an existing device to allow this one to connect.
            </p>
            <div className="space-y-2">
              {deviceLimitData.activeDevices.map((device) => (
                <div
                  key={device._id}
                  className="flex items-center justify-between rounded-lg bg-white p-2.5 text-xs"
                >
                  <div>
                    <span className="font-medium text-gray-800">{device.name}</span>
                    <span className="ml-1 text-gray-400">({device.platform})</span>
                    {device.lastActiveAt && (
                      <span className="mt-0.5 block text-gray-400">
                        Last active: {new Date(device.lastActiveAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRevoke(device._id)}
                    disabled={revoking === device._id}
                    className="min-h-0 min-w-0 px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {revoking === device._id ? 'Revoking…' : 'Revoke'}
                  </button>
                </div>
              ))}
            </div>
            {deviceLimitData.activeDevices.length === 0 && (
              <p className="mt-2 text-xs text-green-700">
                Device revoked. You can now sign in.
              </p>
            )}
          </div>
        )}

        {/* ── Rate-limit alert — logic unchanged ───────────────────────── */}
        {rateLimitMsg && (
          <Alert type="warning" message={rateLimitMsg} className="mb-4" />
        )}

        {/* ── Form card ─────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">

          {/* Brand accent stripe — the single intentional visual element */}
          <div className="h-1 bg-brand-600" aria-hidden="true" />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-6" noValidate>

            {/* Account Code */}
            <div className="space-y-1">
              <label htmlFor="accountCode" className="block text-sm font-medium text-gray-700">
                Account Code
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <IconHash />
                </span>
                <input
                  id="accountCode"
                  placeholder="XXXX-XXXX-XXXX"
                  autoComplete="off"
                  autoCapitalize="characters"
                  inputMode="text"
                  enterKeyHint="next"
                  className={`${fieldCls(!!errors.accountCode)} font-mono tracking-wider`}
                  {...register('accountCode', { onChange: handleAccountCodeChange })}
                />
              </div>
              {errors.accountCode && (
                <p className="text-xs text-red-600">{errors.accountCode.message}</p>
              )}
            </div>

            {/* Username */}
            <div className="space-y-1">
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <IconUser />
                </span>
                <input
                  id="username"
                  placeholder="your username"
                  autoComplete="username"
                  enterKeyHint="next"
                  className={fieldCls(!!errors.username)}
                  {...register('username')}
                />
              </div>
              {errors.username && (
                <p className="text-xs text-red-600">{errors.username.message}</p>
              )}
            </div>

            {/* Password — separate className because of pr-10 for the toggle button */}
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <IconLock />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  enterKeyHint="done"
                  className={[
                    'block w-full rounded-lg border pl-9 pr-10 py-2.5 text-sm shadow-sm',
                    'placeholder:text-gray-400 focus:outline-none focus:ring-2',
                    errors.password
                      ? 'border-red-400 focus:ring-red-400 bg-red-50'
                      : 'border-gray-300 focus:ring-brand-500 bg-white',
                  ].join(' ')}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 min-h-0 min-w-0"
                >
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            {/* ── Recovery placeholder ────────────────────────────────────
                TODO (Step 3): replace each <button> with:
                  <Link to="/forgot-password">Forgot Password</Link>
                  <Link to="/forgot-username">Forgot Username</Link>
                  <Link to="/forgot-account-code">Forgot Account Code</Link>
                Do not create those routes until recovery backend exists.     */}
            <div className="border-t border-gray-100 pt-3">
              <p className="mb-2 text-xs text-gray-400">Forgot your credentials?</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {RECOVERY_ITEMS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRecoveryNote(true)}
                    className="min-h-0 min-w-0 text-xs text-brand-600 underline underline-offset-2 hover:text-brand-700"
                  >
                    {label}
                  </button>
                ))}
              </div>
              {recoveryNote && (
                <p className="mt-2.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  Account recovery is coming soon. If you're locked out, please contact support.
                </p>
              )}
            </div>

            {/* Server / network error — inside card, above submit button */}
            {serverError && (
              <Alert type="error" message={serverError} />
            )}

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </Button>

          </form>
        </div>

        {/* ── Create Account footer ─────────────────────────────────────── */}
        <p className="mt-6 text-center text-sm text-gray-500">
          New to SwipeLedger?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            Create Account
          </Link>
        </p>

      </div>
    </div>
  );
}
