"use client";

import React, { useRef } from "react";

interface CodeInputProps {
  digits: string[];
  onChange: (digits: string[]) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
}

export default function CodeInput({
  digits,
  onChange,
  onComplete,
  disabled = false,
}: CodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleInput = (index: number, value: string) => {
    // Allow only digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    onChange(newDigits);

    // Auto-focus next input
    if (digit && index < 5) {
      refs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (newDigits.every((d) => d !== "") && newDigits.join("").length === 6) {
      onComplete(newDigits.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) return;

    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || "";
    }
    onChange(newDigits);

    // Focus the next empty input, or the last one if full
    const nextEmpty = newDigits.findIndex((d) => d === "");
    const focusIndex = nextEmpty >= 0 ? nextEmpty : 5;
    refs.current[focusIndex]?.focus();

    if (newDigits.every((d) => d !== "") && newDigits.join("").length === 6) {
      onComplete(newDigits.join(""));
    }
  };

  return (
    <div className="code-input-group">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}
