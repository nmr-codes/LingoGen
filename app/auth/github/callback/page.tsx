"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../../components/AuthProvider";
import { loginWithGitHub } from "../../../../lib/api";

function GitHubCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuth();

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      router.replace("/auth?error=GitHub+login+failed");
      return;
    }

    if (!code) {
      router.replace("/auth");
      return;
    }

    (async () => {
      try {
        const data = await loginWithGitHub(code);
        setAuth(data.user, data.access_token);
        router.replace(data.user.onboarded ? "/chat" : "/setup");
      } catch (err) {
        console.error("GitHub auth callback failed", err);
        router.replace("/auth?error=GitHub+login+failed");
      }
    })();
  }, [router, searchParams, setAuth]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      color: "var(--text-primary)",
      background: "var(--bg-primary)",
      textAlign: "center",
      padding: 24,
    }}>
      <div>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🐙</div>
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>Signing in with GitHub…</h2>
        <p style={{ color: "var(--text-muted)" }}>You’ll be redirected back to LingoGen shortly.</p>
      </div>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        color: "var(--text-primary)",
        background: "var(--bg-primary)",
        textAlign: "center",
        padding: 24,
      }}>
        <div>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🐙</div>
          <h2 style={{ fontSize: 28, marginBottom: 8 }}>Loading…</h2>
        </div>
      </div>
    }>
      <GitHubCallbackContent />
    </Suspense>
  );
}
