'use client';

import { useState } from 'react';
import AiGenerateModal from './AiGenerateModal';

interface Item {
  id: number;
  evidNumber: string;
}

interface AiBulkButtonProps {
  boxCode: string;
  items: Item[];
}

export default function AiBulkButton({ boxCode, items }: AiBulkButtonProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [, setRunning] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [completed, setCompleted] = useState(0);

  const currentItem = items[currentIndex];
  const catalogNumber = `${boxCode}-${currentItem?.evidNumber || ''}`;

  const handleStart = () => {
    setCurrentIndex(0);
    setCompleted(0);
    setRunning(true);
    setShowModal(true);
  };

  const handleApplied = () => {
    const next = currentIndex + 1;
    setCompleted(prev => prev + 1);
    if (next < items.length) {
      setCurrentIndex(next);
      // Modal stays open, moves to next item
    } else {
      setShowModal(false);
      setRunning(false);
      window.location.reload();
    }
  };

  const handleClose = () => {
    setShowModal(false);
    setRunning(false);
    if (completed > 0) window.location.reload();
  };

  return (
    <>
      <button
        onClick={handleStart}
        className="bg-purple-900/40 border border-purple-800 hover:bg-purple-800/50 text-purple-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        AI Gemini ({items.length} kamenů)
      </button>

      {showModal && currentItem && (
        <div>
          {/* Progress bar */}
          <div className="fixed top-0 left-0 right-0 z-[60] bg-bg-secondary border-b border-purple-800 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-purple-300 font-medium">
                AI Generování: {completed + 1} / {items.length}
              </span>
              <div className="w-48 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${((completed) / items.length) * 100}%` }}
                />
              </div>
            </div>
            <button onClick={handleClose} className="text-xs text-text-muted hover:text-text-primary">
              {completed > 0 ? `Ukončit (${completed} hotovo)` : 'Zrušit'}
            </button>
          </div>

          <AiGenerateModal
            itemId={currentItem.id}
            catalogNumber={catalogNumber}
            onClose={handleClose}
            onApplied={handleApplied}
          />
        </div>
      )}
    </>
  );
}
