import React, { useState, useEffect, useCallback } from 'react';

interface SplitterProps {
  onResize: (browserHeight: number) => void;
  browserHeight: number;
  minBrowserHeight?: number;
  minPanelHeight?: number;
}

export const Splitter: React.FC<SplitterProps> = ({
  onResize,
  browserHeight,
  minBrowserHeight = 150,
  minPanelHeight = 150
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    // Y position relative to top nav + tab bar (approx 76px)
    const newHeight = e.clientY - 76;
    const maxHeight = window.innerHeight - 76 - minPanelHeight;
    if (newHeight >= minBrowserHeight && newHeight <= maxHeight) {
      onResize(newHeight);
    }
  }, [isDragging, minBrowserHeight, minPanelHeight, onResize]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`h-1.5 w-full resizer-h ${isDragging ? 'resizing' : ''} flex items-center justify-center select-none z-20`}
    >
      <div className="w-8 h-0.5 bg-[#424759] rounded-full" />
    </div>
  );
};
