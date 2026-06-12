'use client';

import { useState } from 'react';
import AiGenerateModal from './AiGenerateModal';

interface AiButtonProps {
  itemId: number;
  catalogNumber: string;
  size?: 'sm' | 'md';
}

export default function AiButton({ itemId, catalogNumber, size = 'md' }: AiButtonProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowModal(true); }}
        style={{ color: 'var(--violet)', borderColor: 'color-mix(in srgb, var(--violet) 30%, transparent)' }}
        className={`bg-transparent border hover:bg-[color-mix(in_srgb,var(--violet)_10%,transparent)] rounded-md font-mono uppercase tracking-wider transition-colors inline-flex items-center gap-1 ${
          size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[10px]'
        }`}
        title="Generovat texty pomocí AI"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        AI
      </button>

      {showModal && (
        <AiGenerateModal
          itemId={itemId}
          catalogNumber={catalogNumber}
          onClose={() => setShowModal(false)}
          onApplied={() => { setShowModal(false); window.location.reload(); }}
        />
      )}
    </>
  );
}
