"use client";

import { useState, useEffect } from "react";

interface Props {
  queueCount: number;
  onCancel: () => void;
}

export default function MatchmakingSpinner({ queueCount, onCancel }: Props) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="matchmaking-container">
      <div className="matchmaking-card">
        <div className="spinner-rings">
          <div className="ring ring-1"></div>
          <div className="ring ring-2"></div>
          <div className="ring ring-3"></div>
          <div className="ring-center">🔍</div>
        </div>
        <h2 className="matchmaking-title">Finding your match...</h2>
        <div style={{ color: "var(--primary)", fontSize: "18px", fontWeight: "bold", marginBottom: "12px" }}>
          {seconds}s
        </div>
        <p className="matchmaking-sub">
          Looking for someone with similar interests
        </p>
        <div className="queue-badge">
          <span className="pulse-dot"></span>
          {queueCount} {queueCount === 1 ? "person" : "people"} searching
        </div>
        <button
          className="btn btn-ghost mt-4"
          onClick={onCancel}
          id="cancel-matchmaking-btn"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
