"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import {
  GOOGLE_CLIENT_ID,
  loginWithGoogle,
  loginWithEmail,
  sendVerificationCode,
  verifyCode,
  registerWithVerifiedEmail,
  checkEmailRegistered,
} from "../../lib/api";
import CodeInput from "../../components/CodeInput";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          renderButton: (element: HTMLElement, config: object) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function AuthPage() {
  const { profile, loading, setAuth } = useAuth();
  const router = useRouter();
  const btnRef = useRef<HTMLDivElement>(null);
  const gsiInitializedRef = useRef(false);

  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const authModeRef = useRef<"login" | "signup">("login");
  const [signupStep, setSignupStep] = useState<1 | 2 | 3>(1);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [codeDigits, setCodeDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [verificationToken, setVerificationToken] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const changeMode = (mode: "login" | "signup") => {
    setAuthMode(mode);
    authModeRef.current = mode;
    setErrorMsg("");
    if (mode === "signup") {
      setSignupStep(1);
      setCodeDigits(["", "", "", "", "", ""]);
      setPassword("");
      setConfirmPassword("");
    }
  };

  useEffect(() => {
    if (!loading && profile && !profile.is_guest) {
      router.replace(profile.onboarded ? "/chat" : "/setup");
    }
  }, [profile, loading, router]);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (document.getElementById("gsi-script")) {
      if (window.google) {
        initGoogle();
      } else {
        interval = setInterval(() => {
          if (window.google) {
            initGoogle();
            clearInterval(interval!);
          }
        }, 100);
      }
      return () => clearInterval(interval!);
    }

    const script = document.createElement("script");
    script.id = "gsi-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => initGoogle();
    document.head.appendChild(script);
    return () => clearInterval(interval!);
  }, []);

  useEffect(() => {
    if (!loading && window.google) {
      initGoogle();
    }
  }, [loading, authMode, signupStep]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const initGoogle = () => {
    const clientId = GOOGLE_CLIENT_ID;
    if (!clientId || !window.google) return;

    if (!gsiInitializedRef.current) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: false,
      });
      gsiInitializedRef.current = true;
    }

    if (btnRef.current) {
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: "filled_black",
        size: "large",
        width: 360,
        text: "continue_with",
        shape: "pill",
      });
    }
  };

  const handleGoogleCredential = async (response: { credential: string }) => {
    setErrorMsg("");
    try {
      const data = await loginWithGoogle(response.credential, authModeRef.current);
      setAuth(data.user, data.access_token);
      router.replace(data.user.onboarded ? "/chat" : "/setup");
    } catch (err: any) {
      setErrorMsg(err.message || "Google authentication failed. Please try again.");
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg("Please enter your email.");
      return;
    }
    setErrorMsg("");
    setIsSubmitting(true);
    try {
      const check = await checkEmailRegistered(email);
      if (check.registered) {
        setShowLoginPrompt(true);
        setIsSubmitting(false);
        return;
      }

      await sendVerificationCode(email, "signup");
      setSignupStep(2);
      setResendCountdown(60);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to send verification code. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyVerificationCode = async (code: string) => {
    setErrorMsg("");
    setIsSubmitting(true);
    try {
      const data = await verifyCode(email, code, "signup");
      if (data.verified) {
        setVerificationToken(data.verification_token);
        setSignupStep(3);
      } else {
        setErrorMsg("Failed to verify code.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Invalid code. Please try again.");
      setCodeDigits(["", "", "", "", "", ""]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setErrorMsg("Please fill in both password fields.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    setErrorMsg("");
    setIsSubmitting(true);
    try {
      const data = await registerWithVerifiedEmail(email, password, verificationToken);
      setAuth(data.user, data.access_token);
      router.replace("/setup");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setErrorMsg("Please enter both email and password.");
      return;
    }
    setErrorMsg("");
    setIsSubmitting(true);
    try {
      const data = await loginWithEmail(loginEmail, loginPassword);
      setAuth(data.user, data.access_token);
      router.replace(data.user.onboarded ? "/chat" : "/setup");
    } catch (err: any) {
      setErrorMsg(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromptYes = () => {
    setShowLoginPrompt(false);
    setLoginEmail(email);
    setLoginPassword("");
    setAuthMode("login");
    authModeRef.current = "login";
    setErrorMsg("");
  };

  if (loading) return null;

  return (
    <main className="auth-shell">
      <div className="auth-visual-panel">
        <div className="brand-lockup">
          <span className="brand-mark">L</span>
          <span className="brand-word">LingoGen</span>
        </div>

        <div className="visual-copy">
          <span className="eyebrow">The language room</span>
          <h1>Find your voice in every language.</h1>
          <p>
            Real people. Real practice. Zero-pressure conversations designed to help you grow faster.
          </p>
        </div>

        <div className="stat-stack">
          <div className="mini-stat-card">
            <strong>30+</strong>
            <span>languages</span>
          </div>
          <div className="mini-stat-card">
            <strong>24/7</strong>
            <span>live support</span>
          </div>
        </div>
      </div>

      <section className="auth-card-panel">
        <div className="auth-card-header">
          <div className="mode-toggle">
            <button
              className={authMode === "login" ? "active" : ""}
              type="button"
              onClick={() => changeMode("login")}
            >
              Sign in
            </button>
            <button
              className={authMode === "signup" ? "active" : ""}
              type="button"
              onClick={() => changeMode("signup")}
            >
              Sign up
            </button>
          </div>
        </div>

        {errorMsg && <div className="error-box">{errorMsg}</div>}

        {authMode === "login" && (
          <form onSubmit={handleLoginSubmit} className="auth-form">
            <label className="field-group">
              <span>Email</span>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="field-group">
              <span>Password</span>
              <div className="password-wrap">
                <input
                  type={showLoginPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button type="button" className="ghost-button small" onClick={() => setShowLoginPassword((prev) => !prev)}>
                  {showLoginPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? "Please wait..." : "Continue"}
            </button>
          </form>
        )}

        {authMode === "signup" && signupStep === 1 && (
          <form onSubmit={handleSendCode} className="auth-form">
            <label className="field-group">
              <span>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>

            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? "Sending code..." : "Send verification code"}
            </button>
          </form>
        )}

        {authMode === "signup" && signupStep === 2 && (
          <div className="code-panel">
            <div className="code-banner">Code sent to {email}</div>
            <p>Enter the 6-digit code to verify your account.</p>

            <CodeInput
              digits={codeDigits}
              onChange={setCodeDigits}
              onComplete={handleVerifyVerificationCode}
              disabled={isSubmitting}
            />

            <div className="code-actions">
              {resendCountdown > 0 ? (
                <span>Resend in {resendCountdown}s</span>
              ) : (
                <button type="button" className="ghost-button" onClick={async () => {
                  setErrorMsg("");
                  setIsSubmitting(true);
                  try {
                    await sendVerificationCode(email, "signup");
                    setResendCountdown(60);
                    setCodeDigits(["", "", "", "", "", ""]);
                  } catch (err: any) {
                    setErrorMsg(err.message || "Failed to resend code.");
                  } finally {
                    setIsSubmitting(false);
                  }
                }}>
                  Resend code
                </button>
              )}

              <button type="button" className="ghost-button" onClick={() => setSignupStep(1)}>
                Change email
              </button>
            </div>
          </div>
        )}

        {authMode === "signup" && signupStep === 3 && (
          <form onSubmit={handleRegisterWithPassword} className="auth-form">
            <label className="field-group">
              <span>Create password</span>
              <div className="password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button type="button" className="ghost-button small" onClick={() => setShowPassword((prev) => !prev)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <label className="field-group">
              <span>Confirm password</span>
              <div className="password-wrap">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button type="button" className="ghost-button small" onClick={() => setShowConfirmPassword((prev) => !prev)}>
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? "Creating account..." : "Create account"}
            </button>
          </form>
        )}

        {(authMode === "login" || (authMode === "signup" && signupStep === 1)) && (
          <>
            <div className="divider"><span>or</span></div>
            <div className="google-block">
              <p>Continue with Google</p>
              <div id="google-signin-container" ref={btnRef} />
            </div>
          </>
        )}

        <p className="legal-copy">
          By continuing, you agree to LingoGen’s terms and privacy policy.
        </p>
      </section>

      {showLoginPrompt && (
        <div className="prompt-overlay">
          <div className="confirm-card">
            <span className="confirm-icon">✦</span>
            <h3>Account already exists</h3>
            <p>
              You already have a LingoGen account with <strong>{email}</strong>. Do you want to sign in instead?
            </p>
            <div className="confirm-actions">
              <button type="button" className="primary-button" onClick={handlePromptYes}>Yes, sign in</button>
              <button type="button" className="ghost-button" onClick={() => setShowLoginPrompt(false)}>No</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
