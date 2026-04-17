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
        className={`bg-purple-900/40 border border-purple-800 hover:bg-purple-800/50 text-purple-300 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
          size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
        }`}
        title="Generovat texty pomocí AI"
      >
        <svg className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
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
