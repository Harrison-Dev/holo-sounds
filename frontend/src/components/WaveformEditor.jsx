import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';

const WaveformEditor = ({ audioUrl, onRegionUpdate }) => {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);
  const regionsRef = useRef(null);
  const zoomLevelRef = useRef(1); // Use ref to avoid re-renders
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [region, setRegion] = useState(null);
  const [zoomDisplay, setZoomDisplay] = useState(100); // For display only
  const [totalDuration, setTotalDuration] = useState(0);
  const [isLooping, setIsLooping] = useState(true);

  useEffect(() => {
    if (!audioUrl || !containerRef.current) return;

    // Create WaveSurfer instance
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4F9CF9',
      progressColor: '#1E5BA8',
      cursorColor: '#1E5BA8',
      barWidth: 2,
      barRadius: 3,
      cursorWidth: 1,
      height: 200,
      barGap: 3,
      minPxPerSec: 50,
      normalize: true,
      splitChannels: false,
    });

    // Initialize regions plugin
    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    regionsRef.current = regions;

    // Load audio
    wavesurfer.load(audioUrl);

    // Event listeners
    wavesurfer.on('ready', () => {
      const duration = wavesurfer.getDuration();
      setDuration(duration);
      setTotalDuration(duration);
      zoomLevelRef.current = 1; // Reset zoom to 100%
      setZoomDisplay(100);
      
      // Create initial region covering the entire audio
      const region = regions.addRegion({
        start: 0,
        end: duration,
        color: 'rgba(79, 156, 249, 0.3)',
        drag: true,
        resize: true,
      });
      
      setRegion(region);
      
      // Notify parent of initial region
      if (onRegionUpdate) {
        onRegionUpdate({
          start: 0,
          end: duration,
        });
      }
    });

    wavesurfer.on('audioprocess', () => {
      const time = wavesurfer.getCurrentTime();
      setCurrentTime(time);
      
      // Loop within region if playing and looping is enabled
      if (isLooping && region && time >= region.end) {
        wavesurfer.setTime(region.start);
      }
    });

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));
    wavesurfer.on('finish', () => {
      if (isLooping && region) {
        wavesurfer.setTime(region.start);
        wavesurfer.play();
      }
    });

    // Region update listener
    regions.on('region-updated', (updatedRegion) => {
      setRegion(updatedRegion);
      if (onRegionUpdate) {
        onRegionUpdate({
          start: updatedRegion.start,
          end: updatedRegion.end,
        });
      }
    });

    // Handle mouse wheel zoom
    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Use multiplicative zoom for better feel
      const zoomFactor = e.deltaY > 0 ? 0.85 : 1.18; // Zoom out or zoom in
      const currentZoom = zoomLevelRef.current;
      const newZoomLevel = Math.min(Math.max(currentZoom * zoomFactor, 0.1), 10); // 10% to 1000%
      
      // Update refs and display
      zoomLevelRef.current = newZoomLevel;
      setZoomDisplay(Math.round(newZoomLevel * 100));
      
      // Apply zoom - higher zoom level means more pixels per second
      const basePixelsPerSec = 50;
      const pixelsPerSec = basePixelsPerSec * newZoomLevel;
      wavesurfer.zoom(pixelsPerSec);
      
      // Center on region if it exists
      if (region) {
        setTimeout(() => {
          const regionCenter = (region.start + region.end) / 2;
          const scrollPosition = (regionCenter / totalDuration) * wavesurfer.getWrapper().scrollWidth;
          const containerWidth = wavesurfer.getWrapper().clientWidth;
          wavesurfer.getWrapper().scrollLeft = scrollPosition - containerWidth / 2;
        }, 10);
      }
    };

    const waveformContainer = containerRef.current;
    waveformContainer.addEventListener('wheel', handleWheel, { passive: false });

    wavesurferRef.current = wavesurfer;

    return () => {
      waveformContainer?.removeEventListener('wheel', handleWheel);
      wavesurfer.destroy();
    };
  }, [audioUrl]);

  const handlePlayPause = () => {
    if (wavesurferRef.current && region) {
      if (isPlaying) {
        wavesurferRef.current.pause();
      } else {
        // Start playing from region start
        wavesurferRef.current.setTime(region.start);
        wavesurferRef.current.play();
      }
    }
  };

  const handleStop = () => {
    if (wavesurferRef.current && region) {
      wavesurferRef.current.pause();
      wavesurferRef.current.setTime(region.start);
    }
  };

  const handleZoomIn = () => {
    const currentZoom = zoomLevelRef.current;
    const newZoomLevel = Math.min(currentZoom * 1.5, 10);
    
    zoomLevelRef.current = newZoomLevel;
    setZoomDisplay(Math.round(newZoomLevel * 100));
    
    const basePixelsPerSec = 50;
    const pixelsPerSec = basePixelsPerSec * newZoomLevel;
    wavesurferRef.current?.zoom(pixelsPerSec);
    
    // Center on region if it exists
    if (region && wavesurferRef.current) {
      setTimeout(() => {
        const regionCenter = (region.start + region.end) / 2;
        const scrollPosition = (regionCenter / totalDuration) * wavesurferRef.current.getWrapper().scrollWidth;
        const containerWidth = wavesurferRef.current.getWrapper().clientWidth;
        wavesurferRef.current.getWrapper().scrollLeft = scrollPosition - containerWidth / 2;
      }, 10);
    }
  };

  const handleZoomOut = () => {
    const currentZoom = zoomLevelRef.current;
    const newZoomLevel = Math.max(currentZoom / 1.5, 0.1);
    
    zoomLevelRef.current = newZoomLevel;
    setZoomDisplay(Math.round(newZoomLevel * 100));
    
    const basePixelsPerSec = 50;
    const pixelsPerSec = basePixelsPerSec * newZoomLevel;
    wavesurferRef.current?.zoom(pixelsPerSec);
    
    // Center on region if it exists
    if (region && wavesurferRef.current) {
      setTimeout(() => {
        const regionCenter = (region.start + region.end) / 2;
        const scrollPosition = (regionCenter / totalDuration) * wavesurferRef.current.getWrapper().scrollWidth;
        const containerWidth = wavesurferRef.current.getWrapper().clientWidth;
        wavesurferRef.current.getWrapper().scrollLeft = scrollPosition - containerWidth / 2;
      }, 10);
    }
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="waveform-editor">
      <div ref={containerRef} className="waveform-container" />
      
      <div className="controls">
        <div className="playback-controls">
          <button onClick={handlePlayPause} className="control-button">
            {isPlaying ? '⏸' : '▶'} {isPlaying ? 'Pause' : 'Play Region'}
          </button>
          <button onClick={handleStop} className="control-button">
            ⏹ Stop
          </button>
          <label className="loop-checkbox">
            <input
              type="checkbox"
              checked={isLooping}
              onChange={(e) => setIsLooping(e.target.checked)}
            />
            Loop
          </label>
        </div>
        
        <div className="zoom-controls">
          <button onClick={handleZoomOut} className="zoom-button" title="Show more time (zoom out)">
            −
          </button>
          <span className="zoom-level">
            {zoomDisplay}%
          </span>
          <button onClick={handleZoomIn} className="zoom-button" title="Show less time (zoom in)">
            +
          </button>
        </div>
        
        <div className="time-display">
          <span>{formatTime(currentTime)}</span>
          <span> / </span>
          <span>{formatTime(duration)}</span>
          {region && (
            <span className="region-info">
              {' '}| Region: {formatTime(region.start)} - {formatTime(region.end)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default WaveformEditor;