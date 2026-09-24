import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { Icon, Spinner } from './ui.jsx';

/**
 * A download button that reports its own progress.
 *
 * `run` receives an onProgress callback to hand to the API client. While it is
 * running the button is disabled, so a second click cannot start a second
 * download, and it shows a spinner with the percentage — or the spinner alone
 * when the server sent no length to measure against.
 */
export default function DownloadButton({
  run,
  label,
  className = 'btn btn-quiet btn-sm',
  disabled,
  title,
}) {
  const { t, fmt } = useI18n();
  // null = idle, -1 = running with no measurable progress, 0-100 = percent
  const [progress, setProgress] = useState(null);
  const alive = useRef(true);

  useEffect(() => () => {
    alive.current = false;
  }, []);

  const busy = progress !== null;

  const start = async () => {
    if (busy) return;
    setProgress(-1); // spinner from the first moment, before any bytes arrive
    try {
      await run((value) => {
        if (alive.current) setProgress(value === null ? -1 : value);
      });
    } finally {
      if (alive.current) setProgress(null);
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={start}
      disabled={disabled || busy}
      aria-busy={busy}
      aria-live="polite"
      title={busy ? t('common.actions.downloading') : title}
    >
      {busy ? (
        <>
          <Spinner />
          {progress >= 0 && <span className="mono">{fmt.percent(progress)}</span>}
          <span className="sr-only">{t('common.actions.downloading')}</span>
        </>
      ) : (
        <>
          <Icon name="download" size={15} />
          {label ? <span>{label}</span> : <span className="sr-only">{t('common.actions.download')}</span>}
        </>
      )}
    </button>
  );
}
