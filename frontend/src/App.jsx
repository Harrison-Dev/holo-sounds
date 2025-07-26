import { useState } from 'react';
import './App.css';
import WaveformEditor from './components/WaveformEditor';
import { downloadAudio, getTaskStatus, processAudio, getAudioUrl } from './api';

function App() {
  const [url, setUrl] = useState('');
  const [taskId, setTaskId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [audioUrl, setAudioUrl] = useState(null);
  const [region, setRegion] = useState({ start: 0, end: 0 });
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [denoise, setDenoise] = useState(false);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDownload = async () => {
    if (!url) return;

    setStatus('downloading');
    setError(null);

    try {
      // Start download
      const { task_id } = await downloadAudio(url);
      setTaskId(task_id);

      // Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const status = await getTaskStatus(task_id);
          
          if (status.state === 'ready') {
            clearInterval(pollInterval);
            setStatus('ready');
            setAudioUrl(getAudioUrl(task_id));
          } else if (status.state === 'error') {
            clearInterval(pollInterval);
            setStatus('error');
            setError(status.error_message || 'Download failed');
          }
        } catch (err) {
          clearInterval(pollInterval);
          setStatus('error');
          setError('Failed to check status');
        }
      }, 2000);

    } catch (err) {
      setStatus('error');
      setError(err.response?.data?.detail || 'Failed to start download');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleDownload();
    }
  };

  const handleProcess = async () => {
    if (!taskId || !region) return;

    setIsProcessing(true);
    setError(null);

    try {
      const blob = await processAudio({
        task_id: taskId,
        start: region.start,
        end: region.end,
        fade_in: fadeIn,
        fade_out: fadeOut,
        denoise: denoise,
      });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `clip_${Date.now()}.ogg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to process audio');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>YouTube Audio Editor</h1>
      </header>

      <main className="app-main">
        <section className="download-section">
          <div className="input-group">
            <input
              type="url"
              placeholder="Enter YouTube URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              className="url-input"
              disabled={status === 'downloading'}
            />
            <button 
              onClick={handleDownload}
              disabled={!url || status === 'downloading'}
              className="download-button"
            >
              {status === 'downloading' ? 'Downloading...' : 'Download'}
            </button>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </section>

        {audioUrl && (
          <>
            <section className="editor-section">
              <h2>Edit Audio</h2>
              <WaveformEditor
                audioUrl={audioUrl}
                onRegionUpdate={setRegion}
              />
            </section>

            <section className="controls-section">
              <h3>Export Settings</h3>
              <div className="export-controls">
                <div className="fade-controls">
                  <div className="control-group-inline">
                    <label>Fade In:</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={fadeIn}
                      onChange={(e) => setFadeIn(parseFloat(e.target.value) || 0)}
                    />
                    <span className="unit">sec</span>
                  </div>

                  <div className="control-group-inline">
                    <label>Fade Out:</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={fadeOut}
                      onChange={(e) => setFadeOut(parseFloat(e.target.value) || 0)}
                    />
                    <span className="unit">sec</span>
                  </div>
                </div>

                <div className="options-controls">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={denoise}
                      onChange={(e) => setDenoise(e.target.checked)}
                    />
                    Apply Noise Reduction
                  </label>
                </div>
              </div>

              <button
                onClick={handleProcess}
                disabled={isProcessing || !region}
                className="process-button"
              >
                {isProcessing ? 'Processing...' : 'Export as OGG'}
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App
