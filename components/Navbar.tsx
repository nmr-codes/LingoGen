"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { destroySocket } from "../lib/websocket";

export default function Navbar() {
  const { profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = () => {
    destroySocket();
    signOut();
    router.push("/");
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="navbar-brand">
          <svg viewBox="0 0 100 100" style={{ width: 28, height: 28 }} className="brand-icon">
            <defs>
              <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
            <path d="M25,50 C25,35 35,25 50,25 C65,25 75,35 75,50 C75,65 65,75 50,75 C42,75 35,72 30,67 L20,70 L23,60 C24.2,57 25,53.5 25,50 Z" fill="url(#logo-grad)" opacity="0.3" />
            <circle cx="50" cy="50" r="18" fill="none" stroke="url(#logo-grad)" strokeWidth="6" />
            <path d="M50,15 C69.3,15 85,30.7 85,50 C85,69.3 69.3,85 50,85" fill="none" stroke="url(#logo-grad)" strokeWidth="8" strokeLinecap="round" />
            <path d="M15,50 C15,30.7 30.7,15 50,15" fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
          </svg>
          <span className="brand-name">LingoGen</span>
        </Link>

        <div className="navbar-actions">
          {!loading && (
            <>
              {profile ? (
                <div className="nav-user">
                  <Link href="/chat" className="btn btn-primary btn-sm" id="nav-find-btn">
                    🔍 Find Partner
                  </Link>
                  <div className="avatar-menu">
                    <button
                      className="avatar-btn"
                      onClick={() => setMenuOpen(!menuOpen)}
                      id="nav-avatar-btn"
                    >
                      {profile.photo_url ? (
                        <img src={profile.photo_url} alt="Avatar" className="avatar-img" />
                      ) : (
                        <div className="avatar-placeholder">
                          {profile.display_name?.[0] || "?"}
                        </div>
                      )}
                    </button>
                    {menuOpen && (
                      <div className="dropdown-menu">
                        <Link
                          href="/profile"
                          className="dropdown-item"
                          onClick={() => setMenuOpen(false)}
                        >
                          👤 Profile
                        </Link>
                        <button className="dropdown-item danger" onClick={handleSignOut}>
                          🚪 Sign Out
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <Link href="/auth" className="btn btn-primary btn-sm" id="nav-signin-btn">
                  Sign In
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
