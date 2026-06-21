"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import { loginWithGoogle, loginWithEmail, registerWithEmail, checkEmailRegistered } from "../../lib/api";

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
  
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const authModeRef = useRef<"login" | "signup">("login");
  const [errorMsg, setErrorMsg] = useState("");
  
  // Email/Password state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const changeMode = (mode: "login" | "signup") => {
    setAuthMode(mode);
    authModeRef.current = mode;
    setErrorMsg("");
  };

  useEffect(() => {
    if (!loading && profile && !profile.is_guest) {
      router.replace("/chat");
    }
  }, [profile, loading, router]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (document.getElementById("gsi-script")) {
      if (window.google) {
        initGoogle();
      } else {
        // Poll briefly if it's still downloading
        interval = setInterval(() => {
          if (window.google) {
            initGoogle();
            clearInterval(interval);
          }
        }, 100);
      }
      return () => clearInterval(interval);
    }
    const script = document.createElement("script");
    script.id = "gsi-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => initGoogle();
    document.head.appendChild(script);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!loading && window.google) {
      initGoogle();
    }
  }, [loading, authMode]);

  const initGoogle = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google) return;

    if (!(window as any).__gsiInitialized) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: false,
      });
      (window as any).__gsiInitialized = true;
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
      router.replace("/chat");
    } catch (err: any) {
      setErrorMsg(err.message || "Google authentication failed. Please try again.");
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }
    if (authMode === "signup" && password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    setErrorMsg("");
    setIsSubmitting(true);
    try {
      if (authMode === "signup") {
        // Pre-check if email is registered
        const check = await checkEmailRegistered(email);
        if (check.registered) {
          setShowLoginPrompt(true);
          setIsSubmitting(false);
          return;
        }
      }

      let data;
      if (authMode === "login") {
        data = await loginWithEmail(email, password);
      } else {
        data = await registerWithEmail(email, password);
      }
      setAuth(data.user, data.access_token);
      router.replace("/chat");
    } catch (err: any) {
      setErrorMsg(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromptYes = async () => {
    setShowLoginPrompt(false);
    setAuthMode("login");
    authModeRef.current = "login";
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const data = await loginWithEmail(email, password);
      setAuth(data.user, data.access_token);
      router.replace("/chat");
    } catch (err: any) {
      setErrorMsg("Incorrect password. Please enter the correct password to sign in.");
      setPassword(""); // Reset password field
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromptNo = () => {
    setShowLoginPrompt(false);
  };

  if (loading) return null;

  return (
    <div className="auth-page">
      <div className="auth-card animate-slide-up" style={{ background: "rgba(11, 19, 41, 0.75)" }}>
        <h1 className="auth-title" style={{ background: "var(--gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          LingoGen
        </h1>
        <p className="auth-sub">
          Interactive language exchange tailored to your interests.
        </p>

        {/* Tab Selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 32, background: "var(--bg-card-2)", padding: 4, borderRadius: "var(--radius-md)" }}>
          <button 
            className={`btn ${authMode === "login" ? "btn-primary" : "btn-ghost"}`} 
            style={{ flex: 1, padding: "8px 0", borderRadius: "var(--radius-sm)" }}
            onClick={() => changeMode("login")}
            type="button"
          >
            Sign In
          </button>
          <button 
            className={`btn ${authMode === "signup" ? "btn-primary" : "btn-ghost"}`} 
            style={{ flex: 1, padding: "8px 0", borderRadius: "var(--radius-sm)" }}
            onClick={() => changeMode("signup")}
            type="button"
          >
            Sign Up
          </button>
        </div>

        {errorMsg && (
          <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 16, padding: "10px", background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleEmailAuth} style={{ marginBottom: 24, textAlign: "left" }}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Email</label>
            <input 
              type="email" 
              className="form-input" 
              placeholder="you@example.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 24 }}>
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {authMode === "signup" && (
            <div className="form-group" style={{ marginBottom: 24 }}>
              <label className="form-label">Confirm Password</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="••••••••" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}
          <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: "16px" }} disabled={isSubmitting}>
            {isSubmitting ? "Please wait..." : (authMode === "login" ? "Sign In" : "Create Account")}
          </button>
        </form>

        <div className="auth-divider">
          <span>OR</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            {authMode === "login" 
              ? "Continue with Google to sign in." 
              : "Continue with Google to create an account."}
          </p>
          <div
            id="google-signin-container"
            ref={btnRef}
            style={{ display: "flex", justifyContent: "center" }}
          />
        </div>

        <p className="auth-terms">
          By continuing, you agree to LingoGen's Terms of Service and Privacy Policy.<br/>
          Your identity is never shared with language partners.
        </p>
      </div>

      {/* Account Conflict Conflict Modal Prompt */}
      {showLoginPrompt && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(3, 7, 18, 0.85)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20
        }}>
          <div className="card animate-slide-up" style={{
            width: "100%", maxWidth: 420, background: "var(--bg-card)", border: "1px solid var(--border)",
            padding: "40px 32px", textAlign: "center", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-glow)"
          }}>
            <span style={{ fontSize: 44, marginBottom: 16, display: "block" }}>🌍</span>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Account Already Exists</h3>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
              You already have a LingoGen account with the email <strong>{email}</strong>. Do you want to sign in instead?
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ flex: 1, padding: "12px 0", background: "var(--gradient)", border: "none" }}
                onClick={handlePromptYes}
              >
                Yes, Sign In
              </button>
              <button 
                type="button" 
                className="btn btn-ghost" 
                style={{ flex: 1, padding: "12px 0", border: "1px solid var(--border)" }}
                onClick={handlePromptNo}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
