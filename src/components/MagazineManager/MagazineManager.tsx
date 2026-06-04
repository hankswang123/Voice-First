import React, { useState, useEffect } from 'react';
import { X } from 'react-feather';
import styles from './MagazineManager.module.css';

interface MagazineInfo {
  name: string;
  uploadTime: string;
  hasAudio: boolean;
  hasScripts: boolean;
  hasFlashcards: boolean;
  hasInfographic: boolean;
  displayed: boolean;
}

interface MagazineManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onDisplayChanged: () => void;
}

const MagazineManager: React.FC<MagazineManagerProps> = ({ isOpen, onClose, onDisplayChanged }) => {
  const [magazines, setMagazines] = useState<MagazineInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch('/api/magazines/enriched')
      .then(r => r.json())
      .then(data => {
        setMagazines(data.magazines || []);
        setLoading(false);
      })
      .catch(() => {
        setMagazines([]);
        setLoading(false);
      });
  }, [isOpen]);

  const toggleDisplay = async (name: string, displayed: boolean) => {
    try {
      await fetch(`/api/magazines/${encodeURIComponent(name)}/display`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayed })
      });
      setMagazines(prev =>
        prev.map(m => m.name === name ? { ...m, displayed } : m)
      );
      onDisplayChanged();
    } catch (e) {
      console.error('Failed to update display status:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.container} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Manage Magazines</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.loading}>Loading magazines...</div>
          ) : magazines.length === 0 ? (
            <div className={styles.empty}>No magazines found</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Magazine Name</th>
                  <th>Upload Time</th>
                  <th>Audio</th>
                  <th>Scripts</th>
                  <th>Flash Cards</th>
                  <th>Infographic</th>
                  <th>Displayed</th>
                </tr>
              </thead>
              <tbody>
                {magazines.map(m => (
                  <tr key={m.name}>
                    <td className={styles.magazineName} title={m.name}>
                      {m.name.replace(/[_-]/g, ' ')}
                    </td>
                    <td className={styles.uploadTime}>
                      {new Date(m.uploadTime).toLocaleDateString()} {new Date(m.uploadTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <span className={m.hasAudio ? styles.checkIcon : styles.crossIcon}>
                        {m.hasAudio ? '✓' : '✗'}
                      </span>
                    </td>
                    <td>
                      <span className={m.hasScripts ? styles.checkIcon : styles.crossIcon}>
                        {m.hasScripts ? '✓' : '✗'}
                      </span>
                    </td>
                    <td>
                      <span className={m.hasFlashcards ? styles.checkIcon : styles.crossIcon}>
                        {m.hasFlashcards ? '✓' : '✗'}
                      </span>
                    </td>
                    <td>
                      <span className={m.hasInfographic ? styles.checkIcon : styles.crossIcon}>
                        {m.hasInfographic ? '✓' : '✗'}
                      </span>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={m.displayed}
                        onChange={(e) => toggleDisplay(m.name, e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default MagazineManager;
