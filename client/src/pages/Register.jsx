import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '../services/api/auth.api';
import { getApiError } from '../services/api/client';
import { Alert } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';

// ─── Validation schema — unchanged ────────────────────────────────────────────
const registerSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, 'At least 2 characters')
    .max(100, 'At most 100 characters'),
  mobileNumber: z
    .string({ required_error: 'Mobile number is required' })
    .trim()
    .min(1, 'Mobile number is required')
    .regex(
      /^\+[1-9]\d{7,14}$/,
      'Include country code, e.g. +919876543210',
    ),
});

// ─── Inline SVG icons — zero new dependencies ─────────────────────────────────

// Briefcase — represents a business/workspace
function IconBriefcase() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="5.5" width="13" height="9" rx="1.5"
        stroke="currentColor" strokeWidth="1.35"/>
      <path d="M5 5.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5"
        stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/>
      <path d="M1.5 9.5h13"
        stroke="currentColor" strokeWidth="1.35"/>
    </svg>
  );
}

// Phone — represents mobile number
function IconPhone() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4" y="1" width="8" height="14" rx="2"
        stroke="currentColor" strokeWidth="1.35"/>
      <circle cx="8" cy="12.5" r="0.75" fill="currentColor"/>
    </svg>
  );
}

// ─── Brand mark — identical pixel-for-pixel to Login (inlined: Login is frozen) ─
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

// ─── Success check icon — replaces the previous text-4xl emoji ───────────────
function IconCheckCircle() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
      <circle cx="26" cy="26" r="24" stroke="#22c55e" strokeWidth="2"/>
      <path
        d="M15 26l8 8 14-14"
        stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Field class helper — identical to Login.jsx ──────────────────────────────
function fieldCls(hasError) {
  const base = 'block w-full rounded-lg border pl-9 pr-3 py-2.5 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2';
  return hasError
    ? `${base} border-red-400 focus:ring-red-400 bg-red-50`
    : `${base} border-gray-300 focus:ring-brand-500 bg-white`;
}

// ─── Copy-to-clipboard field — logic unchanged, Tailwind ordering tidied ──────
function CopyableField({ label, value, copiedField, onCopy, fieldKey }) {
  const isCopied = copiedField === fieldKey;
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="mb-1 text-xs text-gray-500">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="break-all font-mono text-sm font-semibold text-gray-900">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onCopy(value, fieldKey)}
          className="min-h-0 min-w-0 shrink-0 rounded bg-brand-50 px-2 py-1
                     text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100"
        >
          {isCopied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Register() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const [credentials, setCredentials] = useState(null); // { accountCode, username, temporaryPassword, businessName }
  const [copiedField,  setCopiedField]  = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(registerSchema) });

  // ── Submit — improved error classification (approved) ─────────────────────
  // Payload is unchanged: { businessName, mobileNumber }.
  // Error branches:
  //   no response → network/offline (must not read as a validation error)
  //   5xx         → server unavailable
  //   4xx (incl. 409 DUPLICATE_MOBILE_NUMBER) → API-provided user-readable message
  async function onSubmit(data) {
    setServerError('');
    try {
      const res = await authApi.register({
        businessName: data.businessName,
        mobileNumber: data.mobileNumber,
      });
      setCredentials(res.data.data);
    } catch (err) {
      const httpStatus = err?.response?.status;
      if (!err?.response) {
        setServerError('No internet connection. Please check your network and try again.');
      } else if (httpStatus >= 500) {
        setServerError('Server temporarily unavailable. Please try again in a moment.');
      } else {
        // HTTP 4xx: surfaces the server's own message (e.g. duplicate mobile,
        // validation failure). Falls back to a generic message if none present.
        setServerError(getApiError(err) || 'Account creation failed. Please try again.');
      }
    }
  }

  // ── Clipboard helpers — logic unchanged ───────────────────────────────────
  async function copyToClipboard(text, field) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard API unavailable — silent fail (user can manually copy)
    }
  }

  async function copyAll() {
    if (!credentials) return;
    const text = [
      `Account Code:       ${credentials.accountCode}`,
      `Username:           ${credentials.username}`,
      `Temporary Password: ${credentials.temporaryPassword}`,
    ].join('\n');
    await copyToClipboard(text, 'all');
  }

  // ── Success / Credentials view ─────────────────────────────────────────────
  if (credentials) {
    return (
      // overflow-y-auto: same keyboard-safe layout as Login and the form view
      <div className="min-h-screen flex flex-col justify-center px-4 py-8 bg-gray-50 overflow-y-auto">
        <div className="w-full max-w-sm mx-auto">

          {/* Brand header */}
          <div className="flex flex-col items-center mb-8">
            <BrandMark />
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-brand-700">
              SwipeLedger
            </h1>
          </div>

          {/* Success indicator — SVG replaces the previous text-4xl emoji */}
          <div className="flex flex-col items-center mb-6">
            <IconCheckCircle />
            <h2 className="mt-3 text-xl font-bold text-gray-900">Account Created</h2>
            <p className="mt-1 text-sm text-gray-500">{credentials.businessName}</p>
          </div>

          {/* Warning — logic and message unchanged */}
          <Alert
            type="warning"
            message="Save these credentials securely — your password will not be shown again."
            className="mb-4"
          />

          {/* Credentials card — accent stripe added, padding normalised to p-6 */}
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm mb-5">
            <div className="h-1 bg-brand-600" aria-hidden="true" />
            <div className="p-6 space-y-3">
              <CopyableField
                label="Account Code"
                value={credentials.accountCode}
                fieldKey="accountCode"
                copiedField={copiedField}
                onCopy={copyToClipboard}
              />
              <CopyableField
                label="Username"
                value={credentials.username}
                fieldKey="username"
                copiedField={copiedField}
                onCopy={copyToClipboard}
              />
              <CopyableField
                label="Temporary Password"
                value={credentials.temporaryPassword}
                fieldKey="password"
                copiedField={copiedField}
                onCopy={copyToClipboard}
              />
              <button
                type="button"
                onClick={copyAll}
                className="w-full py-1 text-sm text-gray-500 hover:text-gray-700 min-h-0 min-w-0"
              >
                {copiedField === 'all' ? '✓ All copied' : 'Copy all'}
              </button>
            </div>
          </div>

          {/* Navigate to login — logic unchanged */}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => navigate('/login')}
          >
            Continue to Sign In
          </Button>

        </div>
      </div>
    );
  }

  // ── Registration form view ─────────────────────────────────────────────────
  return (
    // overflow-y-auto: prevents keyboard clipping on Android (same fix as Login)
    <div className="min-h-screen flex flex-col justify-center px-4 py-8 bg-gray-50 overflow-y-auto">
      <div className="w-full max-w-sm mx-auto">

        {/* ── Brand header — identical structure to Login ────────────────── */}
        <div className="flex flex-col items-center mb-8">
          <BrandMark />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-brand-700">
            SwipeLedger
          </h1>
          <p className="mt-1 text-sm text-gray-500">Create your workspace</p>
        </div>

        {/* ── Form card — accent stripe + consistent padding ─────────────── */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="h-1 bg-brand-600" aria-hidden="true" />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-6" noValidate>

            {/* Business / Shop Name */}
            <div className="space-y-1">
              <label htmlFor="businessName" className="block text-sm font-medium text-gray-700">
                Business / Shop Name
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <IconBriefcase />
                </span>
                <input
                  id="businessName"
                  placeholder="e.g. Kumar Electronics"
                  autoComplete="organization"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  className={fieldCls(!!errors.businessName)}
                  {...register('businessName')}
                />
              </div>
              {errors.businessName && (
                <p className="text-xs text-red-600">{errors.businessName.message}</p>
              )}
            </div>

            {/* Mobile Number */}
            <div className="space-y-1">
              <label htmlFor="mobileNumber" className="block text-sm font-medium text-gray-700">
                Mobile Number
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <IconPhone />
                </span>
                <input
                  id="mobileNumber"
                  placeholder="+919876543210"
                  autoComplete="tel"
                  inputMode="tel"
                  enterKeyHint="done"
                  className={fieldCls(!!errors.mobileNumber)}
                  {...register('mobileNumber')}
                />
              </div>
              {/* Hint shown when valid; replaced by error message when invalid.
                  The zod error already restates the format, so showing both is redundant. */}
              {errors.mobileNumber
                ? <p className="text-xs text-red-600">{errors.mobileNumber.message}</p>
                : <p className="text-xs text-gray-400">Include country code · e.g. +91 for India</p>
              }
            </div>

            {/* Server / network error — inside card, above submit (matches Login) */}
            {serverError && <Alert type="error" message={serverError} />}

            {/* Submit */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? 'Creating account…' : 'Create Account'}
            </Button>

          </form>
        </div>

        {/* ── Sign In footer — consistent with Login's Create Account footer ─ */}
        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  );
}
