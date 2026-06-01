import React, { useState, useEffect, useRef } from 'react';
import { Book, X } from 'react-feather';
import styles from './FloatingMagazineList.module.css';

interface DisplayedMagazine {
  name: string;
  displayName: string;
}

interface FloatingMagazineListProps {
  magazines: DisplayedMagazine[];
  onSelectMagazine: (name: string) => void;
  currentMagazineName?: string;
}

const FloatingMagazineList: React.FC<FloatingMagazineListProps> = ({ magazines, onSelectMagazine, currentMagazineName }) => {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded]);

  const handleSelect = (name: string) => {
    setExpanded(false);
    onSelectMagazine(name);
  };

  return (
    <div className={styles.wrapper} ref={panelRef}>
      <button
        className={`${styles.toggleBtn} ${expanded ? styles.active : ''}`}
        onClick={() => setExpanded(!expanded)}
        title="Quick magazine switch"
      >
        {expanded ? <X size={20} /> : <Book size={20} />}
      </button>

      {expanded && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            Magazines
            <span>{magazines.length} available</span>
          </div>
          {magazines.length === 0 ? (
            <div className={styles.empty}>No magazines displayed</div>
          ) : (
            magazines.map(m => (
              <div
                key={m.name}
                className={`${styles.item} ${m.name === currentMagazineName ? styles.current : ''}`}
                onClick={() => handleSelect(m.name)}
                title={m.name}
              >
                {m.name === currentMagazineName && <span className={styles.checkmark}>✓</span>}
                {m.displayName}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default FloatingMagazineList;
