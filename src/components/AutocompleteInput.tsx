'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/apiFetch';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  field: 'placement' | 'storage' | 'location';
  placeholder?: string;
  className?: string;
}

export default function AutocompleteInput({
  value, onChange, onBlur, field, placeholder, className,
}: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load suggestions on first focus
  const loadSuggestions = async () => {
    if (loaded) return;
    try {
      const res = await apiFetch(`/api/suggest?field=${field}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
        setLoaded(true);
      }
    } catch {}
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = suggestions.filter(s =>
    s.toLowerCase().includes(value.toLowerCase()) && s !== value
  );

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => {
          loadSuggestions();
          setShowDropdown(true);
        }}
        onBlur={() => {
          // Delay to allow click on suggestion
          setTimeout(() => {
            setShowDropdown(false);
            onBlur?.();
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setShowDropdown(false);
            onBlur?.();
          }
        }}
        placeholder={placeholder}
        className={className}
      />

      {showDropdown && (filtered.length > 0 || (suggestions.length > 0 && !value)) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg-card border border-border-color rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {(value ? filtered : suggestions).slice(0, 10).map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-bg-card-hover hover:text-text-primary transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setShowDropdown(false);
                onBlur?.();
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
